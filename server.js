const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose'); // مكتبة الاتصال المؤمن بقاعدة البيانات
const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(__dirname));

// 🔒 الرابط السحابي الموثق بالمستخدم وكلمة المرور الجديدة التي قمنا بإنشائها
const MONGO_URI = "mongodb+srv://trader:pass12345@free-tier-demo.aogqf83.mongodb.net/cryptoPlatformDB?retryWrites=true&w=majority&appName=free-tier-demo";

mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Connected securely to MongoDB permanent Database"))
    .catch(err => console.error("❌ Database connection error:", err));

// تعريف هيكل قاعدة البيانات لحفظ المستخدمين والأرصدة للأبد
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    balance: { type: Number, default: 0.00 },
    todayProfit: { type: Number, default: 0.00 },
    bonus: { type: Number, default: 0.00 },
    teamCount: { type: Number, default: 0 },
    history: { type: Array, default: [] }
});
const User = mongoose.model('User', userSchema);

// تعريف هيكل قاعدة البيانات لحفظ طلبات السحب والإيداع الحية
const requestSchema = new mongoose.Schema({
    id: Number,
    username: String,
    amount: Number,
    type: String,
    walletAddress: String,
    status: { type: String, default: 'pending' },
    date: String
});
const FinancialRequest = mongoose.model('FinancialRequest', requestSchema);

const ADMIN_PASSWORD = "ADMIN_SECRET_PASS_2026"; 

// ==================== مسارات واجهة المستخدم (User Endpoints) ====================

app.post('/api/user/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'Kullanıcı adı gerekli' });
    
    try {
        let user = await User.findOne({ username });
        if (!user) {
            user = new User({ username });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/user/logout', async (req, res) => {
    const { username } = req.body;
    try {
        if (username) {
            await User.deleteOne({ username });
            await FinancialRequest.deleteMany({ username });
            return res.json({ success: true, message: '🟢 Kullanıcı sunucudan başarıyla silindi' });
        }
        res.json({ success: false, message: 'Kullanıcı bulunamadı' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/user/request', async (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount || !type) return res.status(400).json({ success: false, message: 'Eksik bilgi' });
    
    try {
        const newRequest = new FinancialRequest({
            id: Date.now(),
            username,
            amount: parseFloat(amount),
            type, 
            walletAddress,
            date: new Date().toLocaleString('tr-TR')
        });
        await newRequest.save();
        res.json({ success: true, message: 'Talebiniz başarıyla gönderildi!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/user/history', async (req, res) => {
    const { username } = req.query;
    try {
        const user = await User.findOne({ username });
        if (user) {
            res.json({ success: true, history: user.history });
        } else {
            res.json({ success: true, history: [] });
        }
    } catch (err) {
        res.status(500).json({ success: true, history: [] });
    }
});

// ==================== مسارات لوحة التحكم (Admin Endpoints) ====================

const verifyAdmin = (req, res, next) => {
    const password = req.body.adminPassword;
    if (password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'خطأ في صلاحيات المشرف!' });
    }
};

app.post('/api/admin/requests', verifyAdmin, async (req, res) => {
    try {
        const requests = await FinancialRequest.find({ status: 'pending' });
        const allUsers = await User.find({});
        res.json({ 
            success: true, 
            requests, 
            totalUsers: allUsers.length, 
            allUsers 
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/action', verifyAdmin, async (req, res) => {
    const { id, action, username, type, amount } = req.body;
    
    try {
        const user = await User.findOne({ username });
        if (action === 'approve' && user) {
            const amt = parseFloat(amount);
            if (type === 'deposit') {
                user.balance += amt;
                user.todayProfit += (amt * 0.15); 
                user.history.push({ message: `✅ Onaylanan Para Yatırma: +${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
            } else if (type === 'withdraw_capital') {
                user.balance -= amt;
                user.history.push({ message: `💸 Onaylanan Para Çekme (Sermaye): -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
            } else if (type === 'withdraw_daily') {
                user.todayProfit -= amt;
                user.history.push({ message: `📊 Onaylanan Para Çekme (Kar): -${amt} USDT`, date: new Date().toLocaleString('tr-TR') });
            } else if (type === 'invite_bonus') {
                user.bonus += 15.00; 
                user.teamCount += 1; 
                user.history.push({ message: `🍇 Onaylanan Davet Ödülü: +15 USDT (Takım +1)`, date: new Date().toLocaleString('tr-TR') });
            }
            user.markModified('history');
            await user.save();
        }
        
        await FinancialRequest.deleteOne({ id: parseInt(id) });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/distribute-profit', verifyAdmin, async (req, res) => {
    try {
        const allUsers = await User.find({});
        for (let user of allUsers) {
            if (user.balance > 0) {
                let p = user.balance * 0.15;
                user.todayProfit += p;
                user.balance += p;
                user.history.push({ message: `📊 Günlük %15 kar dağıtımı: +${p.toFixed(2)} USDT`, date: new Date().toLocaleString('tr-TR') });
                user.markModified('history');
                await user.save();
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/panel', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🟢 Cloud server is running successfully on port ${PORT}`);
});
