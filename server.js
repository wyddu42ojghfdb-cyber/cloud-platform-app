const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// قاعدة البيانات المحلية المؤقتة لحفظ أسماء المشتركين وأرصدتهم والعمليات الحية طوال الوقت
let usersDB = {};
let pendingRequests = [];

// تفعيل حزم قراءة ومعالجة البيانات القادمة من الواجهات السحابية
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل وقراءة المجلد الرئيسي للمشروع لقراءة ملفات HTML
app.use(express.static(path.join(__dirname)));

// دالة ذكية لتوليد تاريخ اليوم الفعلي بالكامل بالصيغة العربية المعتمدة وتوقيت الساعة بدقة
function getFormattedDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const time = today.toLocaleTimeString('ar-EG');
    return `${yyyy}-${mm}-${dd} | الساعة: ${time}`;
}

// -------------------------------------------------------------
// 📡 نقاط استدعاء تبادل البيانات الحية (APIs)
// -------------------------------------------------------------

// 1. جلب بيانات رصيد المستخدم حياً ومباشرة لعكسها على شاشته الزرقاء الفاخرة
app.get('/api/user-data', (req, res) => {
    const { username } = req.query;
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00", bonus: "0.00", logs: [] };
    }
    res.json({ success: true, user: usersDB[username] });
});

// 2. استقبال كافة عمليات المعاملات من شاشة المستخدم (إيداع، سحب ثلاثي منفصل، مكافأة إحالة بنفسجية)
app.post('/api/submit-request', (req, res) => {
    const { username, type, amount, wallet } = req.body;
    
    // إنشاء الحساب تلقائياً في قاعدة البيانات إذا لم يكن مسجلاً مسبقاً لمنع التصفير وحفظ الاسم
    if (!usersDB[username]) {
        usersDB[username] = { totalBalance: "0.00", dailyProfit: "0.00", bonus: "0.00", logs: [] };
    }

    pendingRequests.push({
        id: Date.now(),
        username,
        type,
        amount: amount || "0",
        wallet: wallet || "---"
    });
    
    console.log(`📡 [بث حي للمشرف] طلب جديد: [${type}] من [${username}] بمبلغ ${amount}`);
    res.json({ success: true });
});

// 3. جلب قائمة طلبات السحب والشحن المعلقة لبثها حياً داخل جدول المشرف الأول
app.get('/api/admin/requests', (req, res) => {
    res.json(pendingRequests);
});

// 4. جلب قائمة الحسابات والأرصدة الثلاثة لبثها حياً داخل جدول المشرف الثاني لمراقبة حسابات الأعضاء
app.get('/api/admin/users', (req, res) => {
    const list = Object.keys(usersDB).map(name => ({
        username: name,
        totalBalance: `USDT ${usersDB[name].totalBalance}`,
        dailyProfit: `USDT ${usersDB[name].dailyProfit}`,
        bonus: `USDT ${usersDB[name].bonus}`,
        activeTeam: "0/40" // عداد الفريق المعتمد في الواجهة الكبرى
    }));
    res.json(list);
});

// 5. معالجة طلب المشرف عند ضغط موافقة أو رفض وعكس الأرصدة مع توليد تاريخ اليوم والوقت تلقائياً
app.post('/api/admin/action', (req, res) => {
    const { requestId, action } = req.body;
    const target = pendingRequests.find(r => r.id === requestId);
    
    if (target) {
        const user = usersDB[target.username];
        const dateStr = getFormattedDate();
        const numAmount = parseFloat(target.amount) || 0;

        if (action === 'onayla') {
            // معالجة طلب الشحن المالي الأخضر
            if (target.type.includes("شحن") || target.type.includes("إيداع")) {
                const current = parseFloat(user.totalBalance) || 0;
                user.totalBalance = (current + numAmount).toFixed(2);
                user.logs.unshift(`✔️ تم الإيداع بنجاح بمبلغ ${numAmount} USDT بتاريخ: ${dateStr}`);
            } 
            // معالجة بوابة السحب الفوري (الأزرار الحمراء الثلاثة المنفصلة)
            else if (target.type.includes("سحب")) {
                user.logs.unshift(`✔️ تم السحب بنجاح بمبلغ ${numAmount} USDT بتاريخ: ${dateStr}`);
            } 
            // معالجة طلب مكافأة الإحالة والدعوات البنفسجي
            else if (target.type.includes("إحالة")) {
                const currentBonus = parseFloat(user.bonus) || 0;
                user.bonus = (currentBonus + numAmount).toFixed(2);
                user.logs.unshift(`✔️ تم إضافة مكافأة الإحالة بنجاح بمبلغ ${numAmount} USDT بتاريخ: ${dateStr}`);
            }
        } else {
            // إشعار بالرفض في حال رفض المشرف للعملية
            user.logs.unshift(`❌ تم رفض عملية [${target.type}] بمبلغ ${numAmount} USDT من قبل المشرف.`);
        }
    }
    
    // مسح وتصفير الطلب من قائمة المعلقات بعد اتخاذ القرار لضمان انسيابية ونظافة شاشة التحكم
    pendingRequests = pendingRequests.filter(r => r.id !== requestId);
    res.json({ success: true });
});

// 6. زر الإجراءات الجماعية اليومية: توزيع الأرباح بنسبة 15% حياً بناءً على رصيد إجمالي رأس المال المعتمد
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

// -------------------------------------------------------------
// 📁 توجيه مسارات الصفحات (Routing) - تم الترتيب برمجياً لمنع الشلل والصفحات البيضاء
// -------------------------------------------------------------

// تفعيل اختصار فتح لوحة التحكم بكتابة /admin أو /admin-panel بأعلى ثبات
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// المسار الافتراضي لواجهة المستخدم (يجب أن يكون دائماً متواجداً في نهاية الملف)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل الخادم السحابي المستقر
app.listen(PORT, () => {
    console.log(`🚀 السيرفر السحابي يعمل بنجاح والربط متصل بالكامل وبأعلى ثبات عبر المنفذ: ${PORT}`);
});
