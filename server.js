const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// مخازن البيانات المؤقتة لربط واجهة المستخدم بلوحة المشرف
let users = {}; // لتخزين أرصدة وبيانات المستخدمين
let pendingRequests = []; // لتخزين طلبات السحب والشحن المعلقة

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// 1. استقبال تسجيل اسم المستخدم وإنشائه في لوحة التحكم
app.post('/api/register-user', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "الاسم مطلوب" });

    // إذا لم يكن المستخدم موجوداً، نقوم بإنشائه بأرصدة مصفرة كما في الصورة
    if (!users[username]) {
        users[username] = {
            username: username,
            totalBalance: "USDT 0.00",
            dailyProfit: "USDT 0.00",
            bonus: "USDT 0.00",
            activeTeam: 0
        };
    }
    res.status(200).json({ success: true, user: users[username] });
});

// 2. استقبال عمليات السحب، الشحن، والإحالات من واجهة المستخدم
app.post('/api/submit-request', (req, res) => {
    const { username, type, details, amount, wallet } = req.body;
    
    const newRequest = {
        id: Date.now(),
        username: username || "مستخدم غير مسجل",
        type: type, // 'سحب رأس المال'، 'شحن رصيد'، إلخ
        amount: amount || "0",
        details: details || "",
        wallet: wallet || "---",
        status: "Bekliyor" // معلق بالتركية كما في لوحتك
    };

    pendingRequests.unshift(newRequest);
    console.log(`📡 طلب جديد قادم للمشرف: [${type}] من [${username}]`);
    res.status(200).json({ success: true });
});

// 3. API جلب الطلبات المعلقة إلى لوحة التحكم التركية
app.get('/api/admin/requests', (req, res) => {
    res.status(200).json(pendingRequests);
});

// 4. API جلب قائمة الأعضاء لمراقبة الأرصدة حياً في لوحة التحكم
app.get('/api/admin/users', (req, res) => {
    res.status(200).json(Object.values(users));
});

// 5. إجراء المشرف (قبول أو رفض الطلب)
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body; // action: 'onayla' أو 'reddet'
    pendingRequests = pendingRequests.filter(req => req.id !== requestId);
    res.status(200).json({ success: true });
});

// توجيه لوحة التحكم الافتراضية والواجهة
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 المنظومة متصلة بالكامل وتعمل على المنفذ: ${PORT}`);
});
