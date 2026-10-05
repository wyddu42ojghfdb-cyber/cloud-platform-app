const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات مؤقتة مرنة لحفظ العمليات الحسابية والطلبات حياً
let users = {};
let pendingRequests = [];

// 1. مسار تسجيل الدخول وقفل الحساب لشاشة المستخدم
app.post('/backend/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });
    
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

// 2. مسار استقبال طلبات الإيداع والسحب من شاشة المستخدم
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, // deposit veya withdraw
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ تم استلام طلبك بنجاح وجاري المراجعة الفورية من الإدارة!' });
});

// 3. مسار بث التحديثات داخل لوحة المشرف
app.get('/backend/admin/requests', (req, res) => {
    res.json({ 
        success: true, 
        requests: pendingRequests, 
        totalUsers: Object.keys(users).length, 
        allUsers: Object.values(users) 
    });
});

// 4. مسار معالجة الموافقات من لوحة المشرف
app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve' && users[username]) {
        if (type === 'deposit') {
            users[username].balance += parseFloat(amount);
            users[username].todayProfit += (parseFloat(amount) * 0.15);
            users[username].history.push({ message: `✅ إيداع معتمد ومؤكد: +${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw') {
            users[username].balance -= parseFloat(amount);
            users[username].history.push({ message: `💸 سحب معتمد ومؤكد: -${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

// 5. مسار بث الأرباح بنسبة 15% للمشتركين النشطين
app.post('/backend/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let profitGenerated = u.balance * 0.15;
            u.todayProfit += profitGenerated;
            u.balance += profitGenerated;
            u.history.push({ message: `📊 تم بث عوائد التداول اليومية بنسبة 15%: +${profitGenerated.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true });
});

// 6. مسار جلب سجل المعاملات لشاشة المستخدم
app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

// فتح شاشة المستخدم عبر مسار فرعي منظم ونظيف لمنع حظر الأمان
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// فتح شاشة المشرف عبر مسار سرّي مستقل
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`المنظومة متصلة حياً ومباشراً...`));
