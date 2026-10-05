const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات سحابية مرنة داخل الذاكرة لحفظ الحسابات والطلبات حياً
let users = {};
let pendingRequests = [];

// 1. مسار حفظ وقفل الحساب لشاشة المستخدم الكبرى
app.post('/backend/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Kullanıcı adı gerekli' });
    
    // إذا كان المستخدم جديداً، يتم تصفير كافة الحقول لتطابق مظهر الشاشة النظيف
    if (!users[username]) {
        users[username] = {
            username: username,
            balance: 0.00,      // إجمالي رأس المال
            todayProfit: 0.00,  // الأرباح اليومية
            bonus: 0.00,        // أرباح التذاكر ومكافآت الدعوة
            teamCount: 0,       // عداد الفريق النشط
            history: []         // سجل المعاملات والإشعارات
        };
    }
    res.json({ success: true, user: users[username] });
});

// 2. مسار صَفْق واستقبال طلبات الإيداع، السحب الثلاثي، ومكافآت الدعوة
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, // deposit أو withdraw أو invite_bonus
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    // تمرير وبث الطلب إلى جدول المشرف فوراً
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ تم إرسال طلبك بنجاح وهو قيد المراجعة الفورية من الإدارة!' });
});

// 3. مسار بث وتحديث البيانات حياً داخل لوحة المشرف الموحدة
app.get('/backend/admin/requests', (req, res) => {
    res.json({ 
        success: true, 
        requests: pendingRequests, 
        totalUsers: Object.keys(users).length, 
        allUsers: Object.values(users) 
    });
});

// 4. مسار معالجة الموافقات والرفض من لوحة المشرف وتحديث الخانات بالملي
app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve' && users[username]) {
        if (type === 'deposit') {
            users[username].balance += parseFloat(amount);
            users[username].todayProfit += (parseFloat(amount) * 0.15); // تفعيل أرباح الـ 15% تلقائياً عند الشحن
            users[username].history.push({ message: `✅ إيداع معتمد ومؤكد: +${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'withdraw') {
            // سحب ذكي مخصوم من إجمالي رأس المال
            users[username].balance -= parseFloat(amount);
            users[username].history.push({ message: `💸 سحب معتمد ومؤكد: -${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        } else if (type === 'invite_bonus') {
            // إضافة مكافأة الدعوة البنفسجية وتحديث العداد
            users[username].bonus += parseFloat(amount);
            users[username].balance += parseFloat(amount);
            users[username].teamCount += 1;
            users[username].history.push({ message: `🍇 مكافأة دعوة صديق معتمدة: +${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    }
    
    // إزالة الطلب بعد صَفْقه ومعالجته بنجاح
    pendingRequests = pendingRequests.filter(r => r.id !== parseInt(id));
    res.json({ success: true });
});

// 5. مسار بث الأرباح الجماعي اليومي بنسبة 15% للمشتركين النشطين
app.post('/backend/admin/distribute-profit', (req, res) => {
    Object.keys(users).forEach(username => {
        let u = users[username];
        if (u.balance > 0) {
            let profitGenerated = u.balance * 0.15;
            u.todayProfit += profitGenerated;
            u.balance += profitGenerated;
            u.history.push({ message: `📊 تم بث عوائد التداول اليومية بنسبة 15%: +${profitGenerated.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true });
});

// 6. مسار جلب سجل المعاملات التاريخية لشاشة المستخدم الكبرى
app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

// مسارات ربط الواجهات البرمجية
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('محرّك السيرفر الموحد يعمل بأعلى كفاءة...'));
