const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

let users = {};
let pendingRequests = [];

app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false });
    if (!users[username]) {
        users[username] = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, history: [] };
    }
    res.json({ success: true, user: users[username] });
});

app.post('/api/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    const newRequest = { id: Date.now(), username, amount: parseFloat(amount), type, walletAddress, status: 'pending' };
    pendingRequests.push(newRequest);
    res.json({ success: true });
});

app.get('/api/admin/requests', (req, res) => {
    res.json({ success: true, requests: pendingRequests, totalUsers: Object.keys(users).length, allUsers: Object.values(users) });
});

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
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

app.post('/api/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let p = u.balance * 0.15;
            u.todayProfit += p; u.balance += p;
            u.history.push({ message: `📊 Günlük %15 kar dağıtımı: +${p.toFixed(2)} USDT` });
        }
    });
    res.json({ success: true });
});

app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    res.json({ success: true, history: users[username] ? users[username].history : [] });
});

module.exports = app;
