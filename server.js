const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let users = {};
let pendingRequests = [];

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

app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
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

app.get('/backend/admin/requests', (req, res) => {
    res.json({ success: true, requests: pendingRequests, totalUsers: Object.keys(users).length, allUsers: Object.values(users) });
});

app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    if (action === 'approve' && users[username]) {
        if (type === 'deposit') {
            users[username].balance += parseFloat(amount);
            users[username].todayProfit += (parseFloat(amount) * 0.15);
            users[username].history.push({ message: `✅ Onaylanan Para Yatırma: +${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw') {
            users[username].balance -= parseFloat(amount);
            users[username].history.push({ message: `💸 Onaylanan Para Çekme: -${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

app.post('/backend/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let profitGenerated = u.balance * 0.15;
            u.todayProfit += profitGenerated;
            u.balance += profitGenerated;
            u.history.push({ message: `📊 Günlük %15 kar dağıtımı: +${profitGenerated.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true });
});

app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sunucu aktif...'));
