const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// تفعيل فك حظر الأمان الشامل لضمان استجابة زر القفل من أي هاتف في العالم
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let users = {};
let pendingRequests = [];

// مسار تسجيل الدخول وفك تجميد الأزرار عالمياً
app.post('/backend/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Kullanıcı adı gerekli' });
    
    if (!users[username]) {
        users[username] = {
            username: username,
            balance: 0.00,
            todayProfit: 0.00,
            bonus: 0.00,
            teamCount: 0,
            history: []
        };
    }
    res.json({ success: true, user: users[username] });
});

// مسار استقبال طلبات الإيداع والسحب والثلاثي
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount || !type) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, 
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ Talebiniz başarıyla gönderildi!' });
});

app.get('/backend/admin/requests', (req, res) => {
    res.json({ success: true, requests: pendingRequests, totalUsers: Object.keys(users).length, allUsers: Object.values(users) });
});

app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    if (action === 'approve' && users[username]) {
        const amt = parseFloat(amount);
        if (type === 'deposit') {
            users[username].balance += amt;
            users[username].todayProfit += (amt * 0.15);
            users[username].history.push({ message: `✅ Onaylanan Para Yatırma: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_capital') {
            users[username].balance -= amt;
            users[username].history.push({ message: `💸 Onaylanan Para Çekme: -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'invite_bonus') {
            users[username].bonus += amt;
            users[username].balance += amt;
            users[username].teamCount += 1;
            users[username].history.push({ message: `🍇 Onaylanan Davet Ödülü: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('سيرفر الربط العالمي يعمل...'));
