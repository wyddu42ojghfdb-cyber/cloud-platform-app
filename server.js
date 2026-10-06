const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

let users = {}; 
let pendingRequests = []; 

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 1. تسجيل مستخدم جديد أو جلب بيانات أرصاده
app.post('/api/register-user', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "الاسم مطلوب" });
    if (!users[username]) {
        users[username] = {
            username: username,
            totalBalance: "USDT 0.00",
            dailyProfit: "USDT 0.00",
            bonus: "USDT 0.00",
            activeTeam: 0
        };
    }
    res.json({ success: true });
});

// 2. استقبال المعاملات من المستخدم
app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet } = req.body;
    const newRequest = {
        id: Date.now(),
        username: username || "مستخدم زائر",
        type: type,
        amount: amount || "0",
        wallet: wallet || "---"
    };
    pendingRequests.push(newRequest);
    res.json({ success: true });
});

// 3. جلب الطلبات للمشرف
app.get('/api/admin/requests', (req, res) => {
    res.json(pendingRequests);
});

// 4. جلب قائمة الحسابات للمشرف
app.get('/api/admin/users', (req, res) => {
    res.json(Object.values(users));
});

// 5. اتخاذ إجراء المشرف (تحديث الأرصدة الفعلي بعد الموافقة)
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    const targetRequest = pendingRequests.find(r => r.id === requestId);
    
    if (targetRequest && action === 'onayla') {
        const user = users[targetRequest.username];
        if (user) {
            const numAmount = parseFloat(targetRequest.amount) || 0;
            if (targetRequest.type.includes("شحن") || targetRequest.type.includes("رصيد")) {
                const currentCapital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
                user.totalBalance = `USDT ${(currentCapital + numAmount).toFixed(2)}`;
            } else if (targetRequest.type.includes("إحالة")) {
                user.bonus = `USDT 50.00`; 
                user.activeTeam = Math.min(user.activeTeam + 1, 40);
            }
        }
    }
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.json({ success: true });
});

// 6. توزيع أرباح 15% لجميع الحسابات المشتركة بلمسة واحدة
app.post('/api/admin/distribute-profits', (req, res) => {
    Object.keys(users).forEach(username => {
        const user = users[username];
        const capital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
        if (capital > 0) {
            const calculatedProfit = capital * 0.15;
            const currentDaily = parseFloat(user.dailyProfit.replace("USDT ", "")) || 0;
            user.dailyProfit = `USDT ${(currentDaily + calculatedProfit).toFixed(2)}`;
        }
    });
    res.json({ success: true });
});

// توجيه المسارات
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
