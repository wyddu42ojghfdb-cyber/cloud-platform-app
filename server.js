const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// تفعيل فك حظر الأمان العالمي الشامل CORS لضمان استجابة الأزرار من أي هاتف
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(__dirname));

let users = {};
let pendingRequests = [];

// مسار قفل وتنشيط حساب المستخدم
app.post('/api/user/login', (req, res) => {
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

// مسار استقبال طلبات الإيداع والسحب والدعوات
app.post('/api/user/request', (req, res) => {
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
    res.json({ success: true, message: 'Talebiniz başarıyla gönderildi!' });
});

// مسار بث التحديثات لجدول شاشة المشرف
app.get('/api/admin/requests', (req, res) => {
    res.json({ 
        success: true, 
        requests: pendingRequests, 
        totalUsers: Object.keys(users).length, 
        allUsers: Object.values(users) 
    });
});

// معالجة قرار المشرف (موافقة أو رفض) لتحديث أرصدة وخانات المستخدمين فورا
app.post('/api/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve' && users[username]) {
        const amt = parseFloat(amount);
        if (type === 'deposit') {
            users[username].balance += amt;
            users[username].todayProfit += (amt * 0.15); 
            users[username].history.push({ message: `✅ Onaylanan Para Yatırma: +${amt} USDT` });
        } else if (type === 'withdraw_capital') {
            users[username].balance -= amt;
            users[username].history.push({ message: `💸 Onaylanan Para Çekme: -${amt} USDT` });
        } else if (type === 'invite_bonus') {
            users[username].bonus += amt;
            users[username].balance += amt; 
            users[username].teamCount += 1; 
            users[username].history.push({ message: `🍇 Onaylanan Davet Ödülü: +${amt} USDT` });
        }
    }
    
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

// توزيع الأرباح بنسبة 15% بلمسة واحدة من لوحة التحكم
app.post('/api/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let p = u.balance * 0.15;
            u.todayProfit += p;
            u.balance += p;
            u.history.push({ message: `📊 Günlük %15 kar dağıtımı: +${p.toFixed(2)} USDT` });
        }
    });
    res.json({ success: true });
});

// مسار سجل الإشعارات للمستخدم
app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sunucu aktif ve calisiyor...'));
