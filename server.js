const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(__dirname));

const MONGO_URI = "mongodb+srv://admin:admin12345@free-tier-demo.aogqf83.mongodb.net/cryptoDB?retryWrites=true&w=majority&appName=free-tier-demo";

// نظام الاتصال المرن والديناميكي لمنع تعطل الواجهات
mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Permanent DB Connected"))
    .catch(err => console.log("⚠️ DB Bypass Mode Activated (Live Stream On)"));

// الذاكرة التلقائية السريعة لضمان تواصل الواجهات فوراً في حال حظر الشبكة
let users = {};
let pendingRequests = [];

const ADMIN_PASSWORD = "ADMIN_SECRET_PASS_2026"; 

app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false });
    if (!users[username]) {
        users[username] = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, history: [] };
    }
    res.json({ success: true, user: users[username] });
});

app.post('/api/user/logout', (req, res) => {
    const { username } = req.body;
    if (username && users[username]) {
        delete users[username];
        pendingRequests = pendingRequests.filter(r => r.username !== username);
    }
    res.json({ success: true });
});

app.post('/api/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    const newRequest = { id: Date.now(), username, amount: parseFloat(amount), type, walletAddress, status: 'pending', date: new Date().toLocaleString('tr-TR') };
    pendingRequests.push(newRequest);
    res.json({ success: true });
});

app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    res.json({ success: true, history: users[username] ? users[username].history : [] });
});

app.post('/api/admin/requests', (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    res.json({ success: true, requests: pendingRequests, totalUsers: Object.keys(users).length, allUsers: Object.values(users) });
});

app.post('/api/admin/action', (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    const { id, action, username, type, amount } = req.body;
    if (action === 'approve' && users[username]) {
        const amt = parseFloat(amount);
        if (type === 'deposit') { users[username].balance += amt; users[username].todayProfit += (amt * 0.15); users[username].history.push({ message: `✅ +${amt} USDT Yatırma`, date: new Date().toLocaleTimeString() }); }
        if (type === 'withdraw_capital') { users[username].balance -= amt; users[username].history.push({ message: `💸 -${amt} USDT Sermaye Çekme`, date: new Date().toLocaleTimeString() }); }
        if (type === 'withdraw_daily') { users[username].todayProfit -= amt; users[username].history.push({ message: `📊 -${amt} USDT Kar Çekme`, date: new Date().toLocaleTimeString() }); }
        if (type === 'invite_bonus') { users[username].bonus += 15.00; users[username].teamCount += 1; users[username].history.push({ message: `🍇 +15 USDT Davet Ödülü`, date: new Date().toLocaleTimeString() }); }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

app.post('/api/admin/distribute-profit', (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) { let p = u.balance * 0.15; u.todayProfit += p; u.balance += p; u.history.push({ message: `📊 +${p.toFixed(2)} USDT Günlük Kar`, date: new Date().toLocaleTimeString() }); }
    });
    res.json({ success: true });
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🟢 Live on port ${PORT}`));
