const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let users = {};
let pendingRequests = [];

// 1. مسار تسجيل الدخول للحساب وتحديث الخانات الثلاثية للشاشة الكبرى
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

// 2. مسار استقبال وصَفْق طلبات الإيداع والسحب الثلاثي ومكافآت الإحالة
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount || !type) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, // deposit أو withdraw_capital أو withdraw_daily أو withdraw_bonus أو invite_bonus
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ تم استلام طلبك بنجاح وهو قيد المراجعة الفورية من الإدارة!' });
});

// 3. مسار جلب كافة العمليات والحسابات الحية لتظهر في جداول المشرف المحدثة
app.get('/backend/admin/requests', (req, res) => {
    res.json({ 
        success: true, 
        requests: pendingRequests, 
        totalUsers: Object.keys(users).length, 
        allUsers: Object.values(users) 
    });
});

// 4. مسار معالجة الموافقات والرفض من لوحة المشرف وتحديث الأرصدة الثلاثية المنفصلة
app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve' && users[username]) {
        const amt = parseFloat(amount);
        if (type === 'deposit') {
            users[username].balance += amt;
            users[username].todayProfit += (amt * 0.15); // إضافة ربحية الـ 15% مباشرة عند موافقة الشحن
            users[username].history.push({ message: `✅ شحن رصيد معتمد ومؤكد: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_capital') {
            users[username].balance -= amt;
            users[username].history.push({ message: `💸 سحب رأس مال معتمد ومؤكد: -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_daily') {
            users[username].todayProfit -= amt;
            users[username].history.push({ message: `📊 سحب أرباح يومية معتمد ومؤكد: -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_bonus') {
            users[username].bonus -= amt;
            users[username].history.push({ message: `💸 سحب مكافآت معتمد ومؤكد: -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'invite_bonus') {
            users[username].bonus += amt;
            users[username].balance += amt; // إضافة المكافأة البنفسجية للرصيد
            users[username].teamCount += 1; // زيادة عداد الفريق 0/40 تلقائياً
            users[username].history.push({ message: `🍇 مكافأة دعوة صديق معتمدة: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

// 5. مسار بث الأرباح الجماعي بنسبة 15% للمشتركين النشطين عبر زر المدير
app.post('/backend/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let profitGenerated = u.balance * 0.15;
            u.todayProfit += profitGenerated;
            u.balance += profitGenerated;
            u.history.push({ message: `📊 تم بث عوائد تداول يومية بنسبة 15%: +${profitGenerated.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true });
});

// 6. مسار قراءة سجل الإشعارات الحية لشاشة المستخدم الكبرى
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
app.listen(PORT, () => console.log('محرّك السيرفر المحدث متصل حياً...'));
