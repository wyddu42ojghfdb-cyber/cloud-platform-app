const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

let users = [
    { username: "Biz keskinleştiriyoruz", balance: 300.00, todayProfit: 0.00, bonus: 0.00, teamCount: 3, maxTeam: 40 }
];
let pendingRequests = [];
let transactionHistory = []; // السجل العام للعمليات

// مسار رئيسي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.send('سيرفر تطبيق المنصة السحابية المطور يعمل بنجاح!');
});

// مسار جلب إحصائيات لوحة التحكم للمشرف
app.get('/api/admin/dashboard', (req, res) => {
    const formattedUsers = users.map(u => ({
        ...u,
        teamCount: `${u.teamCount}/${u.maxTeam}`
    }));
    
    res.json({
        totalSubscribers: users.length,
        users: formattedUsers,
        pendingRequests: pendingRequests,
        history: transactionHistory
    });
});

// مسار مخصص لشاشة المستخدم لجلب إشعاراته الخاصة فقط
app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    // تصفية التاريخ ليعرض فقط الإشعارات التابعة لهذا المستخدم
    const userHistory = transactionHistory.filter(h => h.belongsTo === username);
    res.json({ history: userHistory });
});

// مسار تسجيل دخول أو حفظ اسم المستخدم الجديد
app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    let user = users.find(u => u.username === username);
    if (!user) {
        user = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, maxTeam: 40 };
        users.push(user);
    }
    res.json({ success: true, user: { ...user, teamCount: `${user.teamCount}/${user.maxTeam}` } });
});

// مسار إرسال طلبات من شاشة المستخدم
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
    pendingRequests.push(newRequest);
    res.json({ success: true, message: "تم إرسال طلبك بنجاح وهو قيد المراجعة من المشرف" });
});

// مسار اتخاذ إجراء من المشرف (موافقة أو رفض) وتوليد إشعار للمستخدم بالتاريخ
app.post('/api/admin/action-request', (req, res) => {
    const { requestId, action } = req.body;
    const requestIndex = pendingRequests.findIndex(r => r.id === requestId);
    
    if (requestIndex !== -1) {
        const request = pendingRequests[requestIndex];
        let user = users.find(u => u.username === request.invitee);
        
        const today = new Date();
        const formattedDate = today.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        if (action === 'approve' && user) {
            if (request.type === 'deposit') {
                user.balance += request.amount;
                transactionHistory.push({
                    belongsTo: user.username,
                    message: `📥 Başarılı Yatırma: ${request.amount} USDT (شحن ناجح)`,
                    date: formattedDate
                });
            } else if (request.type === 'withdraw') {
                user.balance -= request.amount;
                transactionHistory.push({
                    belongsTo: user.username,
                    message: `📤 Başarılı Çekme: ${request.amount} USDT (سحب ناجح)`,
                    date: formattedDate
                });
            } else if (request.type === 'invite_bonus') {
                user.bonus += request.amount;
                user.balance += request.amount;
                user.teamCount += 1; 
                
                transactionHistory.push({
                    belongsTo: user.username,
                    message: `👥 Takım Ödülü Onaylandı (مكافأة فريق +1)`,
                    date: formattedDate
                });
            }
        }

        pendingRequests.splice(requestIndex, 1);
        return res.json({ success: true, message: "تمت معالجة الطلب وتحديث إشعارات المستخدم بنجاح" });
    }
    res.status(404).json({ success: false, message: "الطلب غير موجود" });
});

app.post('/api/admin/activate-profit', (req, res) => {
    users = users.map(user => {
        if (user.balance > 0) {
            user.todayProfit = (user.balance * 0.15);
            user.balance += user.todayProfit;
        }
        return user;
    });
    res.json({ success: true, message: "تم تفعيل الأرباح اليومية بنسبة 15% لجميع الحسابات بنجاح!" });
});

app.listen(PORT, () => {
    console.log(`السيرفر يعمل الآن على المنفذ: ${PORT}`);
});
