const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات سحابية مؤقتة داخل الذاكرة لحفظ البيانات حياً
let users = {};
let pendingRequests = [];

// 1. مسار حفظ وقفل الحساب وقراءة الأرصدة
app.post('/backend/user/login', (req, res) => {
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

// 2. مسار صَفْق واستقبال الطلبات من شاشة المستخدم وتحويلها للمشرف فوراً
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, // deposit veya withdraw
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ Talebiniz başarıyla yöneticiye gönderildi!' });
});

// 3. مسار بث وتحديث البيانات حياً داخل لوحة المشرف
app.get('/backend/admin/requests', (req, res) => {
    res.json({ success: true, requests: pendingRequests, totalUsers: Object.keys(users).length, allUsers: Object.values(users) });
});

// 4. مسار معالجة الموافقات وبث الأرباح بنسبة 15% من لوحة المشرف
app.post('/backend/admin/action', (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    if (action === 'approve') {
        if (users[username]) {
            if (type === 'deposit') {
                users[username].balance += parseFloat(amount);
                users[username].todayProfit += (parseFloat(amount) * 0.15);
                users[username].history.push({ message: `✅ Onaylanan Para Yatırma: +${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
            } else if (type === 'withdraw') {
                users[username].balance -= parseFloat(amount);
                users[username].history.push({ message: `💸 Onaylanan Para Çekme: -${amount} USDT`, date: new Date().toLocaleString('tr-TR') });
            }
        }
    }
    
    // إزالة الطلب المعالج من القائمة بعد صَفْقه بنجاح
    pendingRequests = pendingRequests.filter(r => r.id !== id);
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
            u.history.push({ message: `📊 Günlük %15 kar dağıtımı eklendi: +${profitGenerated.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
        }
    });
    res.json({ success: true, message: 'Kar dağıtımı tamamlandı!' });
});

// 6. مسار جلب سجل المعاملات التاريخية لشاشة المستخدم
app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

// توجيه المسارات الرابطة لعرض الواجهات
app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('سيرفر الربط الحي يعمل بأعلى كفاءة...'));
