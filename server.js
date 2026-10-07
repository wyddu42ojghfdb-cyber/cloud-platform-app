const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

// 1. تفعيل فك حظر الأمان العالمي الشامل CORS لضمان استقبال وإلغاء الجلسات من أي هاتف
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(__dirname));

// ذاكرة السيرفر المؤقتة لحفظ البيانات
let users = {};
let pendingRequests = [];

// 🔒 كلمة المرور السرية لحماية لوحة التحكم (يمكنك تغييرها من هنا)
const ADMIN_PASSWORD = "ADMIN_SECRET_PASS_2026"; 

// ==================== مسارات واجهة المستخدم (User Endpoints) ====================

// مسار حفظ وقفل اسم المستخدم داخل قاعدة بيانات السيرفر
app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Kullanıcı adı gerekli' });
    
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

// مسار تسجيل الخروج - إلغاء ومسح العملية تماماً من السيرفر
app.post('/api/user/logout', (req, res) => {
    const { username } = req.body;
    if (username && users[username]) {
        delete users[username];
        pendingRequests = pendingRequests.filter(r => r.username !== username);
        return res.json({ success: true, message: '🟢 Kullanıcı sunucudan başarıyla silindi' });
    }
    res.json({ success: false, message: 'Kullanıcı bulunamadı' });
});

// نفق استقبال طلبات الإيداع والسحب وإرسالها حياً لشاشة المشرف
app.post('/api/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount || !type) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, 
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    pendingRequests.push(newRequest);
    res.json({ success: true, message: 'Talebiniz başarıyla gönderildi!' });
});

// جلب سجل المعاملات لشاشة المستخدم
app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});


// ==================== مسارات لوحة التحكم المحمية (Admin Endpoints) ====================

// برمجية وسيطة للتحقق من كلمة مرور المشرف قبل تنفيذ أي عملية حساسة
const verifyAdmin = (req, res, next) => {
    const password = req.headers['admin-password'] || req.body.adminPassword;
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'خطأ في صلاحيات المشرف! كلمة المرور غير صحيحة.' });
    }
};

// مسار بث التحديثات والمشتركين داخل جدول شاشة المشرف حياً (محمي)
app.post('/api/admin/requests', verifyAdmin, (req, res) => {
    res.json({ 
        success: true, 
        requests: pendingRequests, 
        totalUsers: Object.keys(users).length, 
        allUsers: Object.values(users) 
    });
});

// معالجة الموافقات وتحديث أرصدة وخانات المستخدمين (محمي)
app.post('/api/admin/action', verifyAdmin, (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve' && users[username]) {
        const amt = parseFloat(amount);
        if (type === 'deposit') {
            users[username].balance += amt;
            users[username].todayProfit += (amt * 0.15); 
            users[username].history.push({ message: `✅ Onaylanan Para Yatırma: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_capital') {
            users[username].balance -= amt;
            users[username].history.push({ message: `💸 Onaylanan Para Çekme (Sermaye): -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw_daily') {
            users[username].todayProfit -= amt;
            users[username].history.push({ message: `📊 Onaylanan Para Çekme (Kar): -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'invite_bonus') {
            users[username].bonus += amt;
            users[username].balance += amt; 
            users[username].teamCount += 1; 
            users[username].history.push({ message: `🍇 Onaylanan Davet Ödülü: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

// توزيع الأرباح الجماعي بنسبة 15% بلمسة واحدة (محمي)
app.post('/api/admin/distribute-profit', verifyAdmin, (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let p = u.balance * 0.15;
            u.todayProfit += p;
            u.balance += p;
            u.history.push({ message: `📊 Günlük %15 kar dağıtımı: +${p.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true });
});


// ==================== توجيه الصفحات وتشغيل السيرفر العالمي ====================

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// 🚀 تشغيل السيرفر والتوافق الديناميكي مع منفذ استضافة Render العالمية
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🟢 Cloud server is running successfully on port ${PORT}`);
});
