const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// قاعدة بيانات محلية مؤقتة لحفظ أسماء المستخدمين وأرصدتهم الحقيقية المعتمدة
let usersDB = {};
let pendingRequests = [];

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// جلب بيانات رصيد المستخدم حياً لشاشته
app.get('/api/user-data', (req, res) => {
    const { username } = req.query;
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00" };
    }
    res.json({ success: true, user: usersDB[username] });
});

// استقبال طلبات الشحن من شاشة المستخدم
app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet } = req.body;
    
    // حفظ الاسم في الذاكرة تلقائياً عند تقديم الطلب إذا لم يكن موجوداً
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00" };
    }

    pendingRequests.push({
        id: Date.now(),
        username,
        type,
        amount,
        wallet
    });
    res.json({ success: true });
});

// جلب الطلبات وجدول الحسابات لشاشة المشرف
app.get('/api/admin/requests', (req, res) => res.json(pendingRequests));
app.get('/api/admin/users', (req, res) => {
    const list = Object.keys(usersDB).map(name => ({
        username: name,
        totalBalance: `USDT ${usersDB[name].totalBalance}`,
        dailyProfit: `USDT ${usersDB[name].dailyProfit}`,
        bonus: "USDT 0.00",
        activeTeam: "0"
    }));
    res.json(list);
});

// موافقة المشرف وتطبيق الرصيد المطلوب بالظبط على شاشة العضو
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    const target = pendingRequests.find(r => r.id === requestId);
    
    if (target && action === 'onayla') {
        const user = usersDB[target.username];
        if (user) {
            const numAmount = parseFloat(target.amount) || 0;
            // إضافة المبلغ الذي طلبه العضو ووافق عليه المشرف مباشرة
            const current = parseFloat(user.totalBalance) || 0;
            user.totalBalance = (current + numAmount).toFixed(2);
        }
    }
    // مسح الطلب من جدول الانتظار بعد معالجته
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.json({ success: true });
});

// زر توزيع أرباح 15% بناءً على الرصيد المشحون
app.post('/api/admin/distribute-profits', (req, res) => {
    Object.keys(usersDB).forEach(name => {
        const user = usersDB[name];
        const capital = parseFloat(user.totalBalance) || 0;
        if (capital > 0) {
            const currentProfit = parseFloat(user.dailyProfit) || 0;
            user.dailyProfit = (currentProfit + (capital * 0.15)).toFixed(2);
        }
    });
    res.json({ success: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`Server connected on port ${PORT}`));
