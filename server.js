const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

let usersDB = {};
let pendingRequests = [];

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// دالة لتوليد تاريخ اليوم الفعلي بالكامل
function getFormattedDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const time = today.toLocaleTimeString('ar-EG');
    return `${yyyy}-${mm}-${dd} | الساعة: ${time}`;
}

app.get('/api/user-data', (req, res) => {
    const { username } = req.query;
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00", logs: [] };
    }
    res.json({ success: true, user: usersDB[username] });
});

app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet } = req.body;
    
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00", logs: [] };
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

// موافقة المشرف وتوليد رسالة النجاح بتاريخ اليوم تلقائياً
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    const target = pendingRequests.find(r => r.id === requestId);
    
    if (target && action === 'onayla') {
        const user = usersDB[target.username];
        if (user) {
            const numAmount = parseFloat(target.amount) || 0;
            const current = parseFloat(user.totalBalance) || 0;
            user.totalBalance = (current + numAmount).toFixed(2);
            
            // توليد رسالة النجاح حياً مع تاريخ اليوم الفعلي وتخزينها للمستخدم
            const dateStr = getFormattedDate();
            const logMessage = `✔️ تم الإيداع بنجاح بمبلغ ${numAmount} USDT بتاريخ: ${dateStr}`;
            user.logs.unshift(logMessage); // إضافة الإشعار في بداية السجل
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.json({ success: true });
});

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
