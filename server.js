const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات داخلية مستقرة في الذاكرة لمنع أخطاء التوقف
let db = {
    users: [{ username: "Biz keskinleştiriyoruz", balance: 300.00, todayProfit: 0.00, bonus: 0.00, teamCount: 3, maxTeam: 40 }],
    pendingRequests: [],
    transactionHistory: []
};

// مسارات عرض الواجهات الرسومية والتصاميم
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/panel', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/admin', (req, res) => { res.sendFile(__dirname + '/admin.html'); });

// مسارات برمجية مستقلة (Backend API) لمعالجة الأرصدة والطلبات
app.get('/backend/admin/dashboard', (req, res) => {
    res.json({ totalSubscribers: db.users.length, users: db.users, pendingRequests: db.pendingRequests, history: db.transactionHistory });
});

app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    res.json({ history: db.transactionHistory.filter(h => h.belongsTo === username) });
});

app.post('/backend/user/login', (req, res) => {
    const { username } = req.body;
    let user = db.users.find(u => u.username === username);
    if (!user) {
        user = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, maxTeam: 40 };
        db.users.push(user);
    }
    res.json({ success: true, user });
});

app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    const newRequest = { id: Date.now(), invitee: username, type, amount: parseFloat(amount || 0), wallet: walletAddress || 'N/A', status: "معلق" };
    db.pendingRequests.push(newRequest);
    res.json({ success: true, message: "تم إرسال طلبك بنجاح وهو قيد المراجعة من المشرف" });
});

app.post('/backend/admin/action-request', (req, res) => {
    const { requestId, action } = req.body;
    const requestIndex = db.pendingRequests.findIndex(r => r.id === requestId);
    if (requestIndex !== -1) {
        const request = db.pendingRequests[requestIndex];
        let user = db.users.find(u => u.username === request.invitee);
        const today = new Date();
        const formattedDate = today.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (action === 'approve' && user) {
            if (request.type === 'deposit') user.balance += request.amount;
            else if (request.type === 'withdraw') user.balance -= request.amount;
            else if (request.type === 'invite_bonus') { user.bonus += request.amount; user.balance += request.amount; user.teamCount += 1; }
            db.transactionHistory.push({ belongsTo: user.username, message: `📋 معاملة معتمدة: ${request.amount} USDT`, date: formattedDate });
        }
        db.pendingRequests.splice(requestIndex, 1);
        return res.json({ success: true, message: "تمت المعالجة وتحديث الحساب المالي" });
    }
    res.status(404).json({ success: false, message: "الطلب غير موجود" });
});

app.post('/backend/admin/activate-profit', (req, res) => {
    db.users = db.users.map(u => { if (u.balance > 0) { u.todayProfit = (u.balance * 0.15); u.balance += u.todayProfit; } return u; });
    res.json({ success: true, message: "تم تفعيل الأرباح اليومية بنسبة 15%!" });
});

app.listen(PORT, () => { console.log(`السيرفر الموحد يعمل على منفذ: ${PORT}`); });
