const express = require('express');
const cors = require('cors');
const fs = require('fs'); // مكتبة النظام لقراءة وحفظ الملفات
const path = require('path');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// دالة برمجية لقراءة البيانات من ملف قاعدة البيانات
function readDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        // إذا كان الملف غير موجود، ننشئ قاعدة بيانات أولية
        const initialData = {
            users: [{ username: "Biz keskinleştiriyoruz", balance: 300.00, todayProfit: 0.00, bonus: 0.00, teamCount: 3, maxTeam: 40 }],
            pendingRequests: [],
            transactionHistory: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
        return initialData;
    }
    const fileContent = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(fileContent);
}

// دالة برمجية لحفظ التعديلات الجديدة داخل ملف قاعدة البيانات بشكل دائم
function writeDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// مسار رئيسي للتأكد من عمل السيرفر
app.get('/', (req, res) => {
    res.send('سيرفر تطبيق المنصة السحابية مع قاعدة البيانات الذكية يعمل بنجاح!');
});

// مسار جلب إحصائيات لوحة التحكم للمشرف
app.get('/api/admin/dashboard', (req, res) => {
    const db = readDatabase();
    const formattedUsers = db.users.map(u => ({
        ...u,
        teamCount: `${u.teamCount}/${u.maxTeam}`
    }));
    
    res.json({
        totalSubscribers: db.users.length,
        users: formattedUsers,
        pendingRequests: db.pendingRequests,
        history: db.transactionHistory
    });
});

// مسار مخصص لشاشة المستخدم لجلب إشعاراته الخاصة فقط
app.get('/api/user/history', (req, res) => {
    const { username } = req.query;
    const db = readDatabase();
    const userHistory = db.transactionHistory.filter(h => h.belongsTo === username);
    res.json({ history: userHistory });
});

// مسار تسجيل دخول أو حفظ اسم المستخدم الجديد في قاعدة البيانات
app.post('/api/user/login', (req, res) => {
    const { username } = req.body;
    const db = readDatabase();
    
    let user = db.users.find(u => u.username === username);
    if (!user) {
        user = { username, balance: 0.00, todayProfit: 0.00, bonus: 0.00, teamCount: 0, maxTeam: 40 };
        db.users.push(user);
        writeDatabase(db); // حفظ المشترك الجديد فوراً في الملف
    }
    res.json({ success: true, user: { ...user, teamCount: `${user.teamCount}/${user.maxTeam}` } });
});

// مسار إرسال طلبات من شاشة المستخدم
app.post('/api/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    const db = readDatabase();
    
    const newRequest = {
        id: Date.now(),
        invitee: username,
        type: type, 
        amount: parseFloat(amount || 0),
        wallet: walletAddress || 'N/A',
        status: "معلق"
    };
    db.pendingRequests.push(newRequest);
    writeDatabase(db); // حفظ الطلب معلقاً في ملف قاعدة البيانات
    
    res.json({ success: true, message: "تم إرسال طلبك بنجاح وهو قيد المراجعة من المشرف" });
});

// مسار اتخاذ إجراء من المشرف وتحديث قاعدة البيانات وتوليد التاريخ الحالي
app.post('/api/admin/action-request', (req, res) => {
    const { requestId, action } = req.body;
    const db = readDatabase();
    
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
                    message: `📥 Başarılı Yatırma: ${request.amount} USDT (شحن ناجح)`,
                    date: formattedDate
                });
            } else if (request.type === 'withdraw') {
                user.balance -= request.amount;
                db.transactionHistory.push({
                    belongsTo: user.username,
                    message: `📤 Başarılı Çekme: ${request.amount} USDT (سحب ناجح)`,
                    date: formattedDate
                });
            } else if (request.type === 'invite_bonus') {
                user.bonus += request.amount;
                user.balance += request.amount;
                user.teamCount += 1; 
                
                db.transactionHistory.push({
                    belongsTo: user.username,
                    message: `👥 Takım Ödülü Onaylandı (مكافأة فريق +1)`,
                    date: formattedDate
                });
            }
        }

        db.pendingRequests.splice(requestIndex, 1);
        writeDatabase(db); // حفظ جميع التحديثات المالية والأرصدة الجديدة بشكل دائم
        return res.json({ success: true, message: "تمت معالجة الطلب وتحديث قاعدة البيانات بأمان" });
    }
    res.status(404).json({ success: false, message: "الطلب غير موجود" });
});

// مسار تفعيل أرباح الـ 15% وحفظها في قاعدة البيانات
app.post('/api/admin/activate-profit', (req, res) => {
    const db = readDatabase();
    db.users = db.users.map(user => {
        if (user.balance > 0) {
            user.todayProfit = (user.balance * 0.15);
            user.balance += user.todayProfit;
        }
        return user;
    });
    writeDatabase(db); // حفظ الأرباح الجديدة لجميع المستخدمين في الملف
    res.json({ success: true, message: "تم تفعيل الأرباح اليومية بنسبة 15% وحفظها للمشتركين!" });
});

app.listen(PORT, () => {
    console.log(`السيرفر الآمن يعمل الآن ويحفظ البيانات تلقائياً على المنفذ: ${PORT}`);
});
