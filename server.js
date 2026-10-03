const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// تشغيل السيرفر لقراءة ملفات الواجهات الرسومية والتصاميم تلقائياً
app.use(express.static(__dirname));

// قاعدة بيانات داخلية مؤقتة ومستقرة في الذاكرة لتجنب أخطاء الملفات
let db = {
    users: [{ username: "Biz keskinleştiriyoruz", balance: 300.00, todayProfit: 0.00, bonus: 0.00, teamCount: 3, maxTeam: 40 }],
    pendingRequests: [],
    transactionHistory: []
};

// توجيه المسارات لعرض واجهاتك الرسومية
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/panel', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

// مسار جلب إحصائيات لوحة التحكم للمشرف
app.get('/api/admin/dashboard', (req, res) => {
    res.json({
        totalSubscribers: db.users.length,
        users: db.users,
        pendingRequests: db.pendingRequests,
        history: db.transactionHistory
    });
});

// مسار مخصص لشاشة المستخدم لجلب إشعاراته
app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    const userHistory = db.transactionHistory.filter(h => h.belongsTo === username);
    res.json({ history: userHistory });
});

// مسار تسجيل دخول أو حفظ اسم المستخدم الجديد في قاعدة البيانات
app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    
    let user = db.users.find(u => u.username === username);
    if (!user) {
        user = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, maxTeam: 40 };
        db.users.push(user);
    }
    res.json({ success: true, user });
});

// مسار إرسال طلبات من شاشة المستخدم وظهورها حياً عند المشرف
app.post('/api/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    
    const newRequest = {
        id: Date.now(),
        invitee: username,
        type: type, 
        amount: parseFloat(amount || 0),
        wallet: walletAddress || 'N/A',
        status: "معلق"
    };
    db.pendingRequests.push(newRequest);
    
    res.json({ success: true, message: "تم إرسال طلبك بنجاح وهو قيد المراجعة من المشرف" });
});

// مسار اتخاذ إجراء من المشرف وتحديث قاعدة البيانات وتوليد التاريخ الحالي
app.post('/api/admin/action-request', (req, res) => {
    const { requestId, action } = req.body;
    
    const requestIndex = db.pendingRequests.findIndex(r => r.id === requestId);
    
    if (requestIndex !== -1) {
        const request = db.pendingRequests[requestIndex];
        let user = db.users.find(u => u.username === request.invitee);
        
        const today = new Date();
        const formattedDate = today.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (action === 'approve' && user) {
            if (request.type === 'deposit') {
                user.balance += request.amount;
                db.transactionHistory.push({
                    belongsTo: user.username,
                    message: `📥 شحن ناجح: ${request.amount} USDT`,
                    date: formattedDate
                });
            } else if (request.type === 'withdraw') {
                user.balance -= request.amount;
                db.transactionHistory.push({
                    belongsTo: user.username,
                    message: `📤 سحب ناجح: ${request.amount} USDT`,
                    date: formattedDate
                });
            } else if (request.type === 'invite_bonus') {
                user.bonus += request.amount;
                user.balance += request.amount;
                user.teamCount += 1; 
                
                db.transactionHistory.push({
                    belongsTo: user.username,
                    message: `👥 تم اعتماد مكافأة إحالة صديق`,
                    date: formattedDate
                });
            }
        }

        db.pendingRequests.splice(requestIndex, 1);
        return res.json({ success: true, message: "تمت معالجة الطلب وتحديث قاعدة البيانات بأمان" });
    }
    res.status(404).json({ success: false, message: "الطلب غير موجود" });
});

// مسار تفعيل أرباح الـ 15% وحفظها في قاعدة البيانات
app.post('/api/admin/activate-profit', (req, res) => {
    db.users = db.users.map(user => {
        if (user.balance > 0) {
            user.todayProfit = (user.balance * 0.15);
            user.balance += user.todayProfit;
        }
        return user;
    });
    res.json({ success: true, message: "تم تفعيل الأرباح اليومية بنسبة 15% وحفظها للمشتركين!" });
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل بنجاح على المنفذ: ${PORT}`);
});
