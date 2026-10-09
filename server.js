const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

// إعداد حماية وسياسة الـ CORS لضمان استقبال طلبات الـ fetch بدون حظر
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(__dirname));

// الربط الديناميكي الآمن بقاعدة البيانات (يقرأ من Render أو يستخدم الرابط الافتراضي)
const MONGO_URI = "mongodb+srv://admin:9jA1uBMo53FPpm1Y@free-tier-demo.aogqf83.mongodb.net/cryptoDB?retryWrites=true&w=majority&appName=free-tier-demo";


mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Permanent MongoDB Connected Successfully"))
    .catch(err => console.error("⚠️ DB Connection Error:", err));

// 📊 تصميم جدول المستخدمين لحفظ الأرصدة والمكافآت بشكل مستدام
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0.00 },       // إجمالي رأس المال (Capital)
    todayProfit: { type: Number, default: 0.00 },   // الأرباح اليومية (Daily Profit)
    bonus: { type: Number, default: 0.00 },         // أرباح التذاكر ومكافآت الدعوة (Bonus)
    teamCount: { type: Number, default: 0 },        // أعضاء الفريق النشطين
    walletAddress: { type: String, default: "" },   // محفظة TRC-20 الخاصة بالعميل
    history: { type: Array, default: [] },          // سجل المعاملات والإشعارات
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// ⚠️ تصميم جدول الطلبات المالية (متوافق مع الأزرار الثلاثة الجديدة للسحب والإيداع)
const RequestSchema = new mongoose.Schema({
    username: { type: String, required: true },
    amount: { type: Number, default: 0 },
    type: { type: String, required: true },         // deposit, withdraw_daily, withdraw_capital, invite_bonus
    walletAddress: { type: String, default: "" },
    details: { type: String, default: "" },
    status: { type: String, default: 'pending' },   // pending, approved, rejected
    date: { type: String, default: () => new Date().toLocaleString('tr-TR') },
    createdAt: { type: Date, default: Date.now }
});
const Request = mongoose.model('Request', RequestSchema);

const ADMIN_PASSWORD = "ADMIN_SECRET_PASS_2026"; 

// 👤 مسارات المستخدم (User Endpoints)

// مسار تسجيل دخول وجلب بيانات العميل حياً
app.post('/api/user/login', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false });
    try {
        let user = await User.findOne({ username });
        if (!user) {
            user = new User({ username });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// مسار استقبال طلبات السحب والإيداع
app.post('/api/user/request', async (req, res) => {
    const { username, amount, type, walletAddress, details } = req.body;
    try {
        const newRequest = new Request({
            username,
            amount: parseFloat(amount || 0),
            type,
            walletAddress: walletAddress || "",
            details: details || "",
            status: 'pending'
        });
        await newRequest.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// مسار جلب سجل المعاملات المحدث للعميل
app.get('/api/user/history', async (req, res) => {
    const { username } = req.query;
    try {
        const user = await User.findOne({ username });
        res.json({ success: true, history: user ? user.history : [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 👑 مسارات المشرف (Admin Endpoints)

// مسار لوحة المشرف لجلب الطلبات المعلقة وبيانات الأعضاء حياً
app.post('/api/admin/requests', async (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    try {
        const requests = await Request.find({ status: 'pending' }).sort({ createdAt: -1 });
        const allUsers = await User.find({});
        const pendingUsers = allUsers.filter(u => u.balance === 0 && (!u.history || u.history.length === 0));
        
        res.json({ 
            success: true, 
            requests, 
            totalUsers: allUsers.length, 
            allUsers,
            pendingUsers
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// مسار اتخاذ الإجراء والموافقة على العمليات المالية وتحديث الحسابات
app.post('/api/admin/action-request', async (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    const { requestId, action } = req.body;
    
    try {
        const financialRequest = await Request.findById(requestId);
        if (!financialRequest) return res.status(404).json({ success: false, message: "Request not found" });
        
        financialRequest.status = action; // approved or rejected
        await financialRequest.save();
        
        if (action === 'approved') {
            const user = await User.findOne({ username: financialRequest.username });
            if (user) {
                if (financialRequest.type === 'deposit') {
                    user.balance += financialRequest.amount;
                } else if (financialRequest.type === 'withdraw_daily' || financialRequest.type === 'withdraw_capital') {
                    user.balance -= financialRequest.amount;
                } else if (financialRequest.type === 'invite_bonus') {
                    user.bonus += financialRequest.amount;
                }
                user.history.push({
                    type: financialRequest.type,
                    amount: financialRequest.amount,
                    date: new Date().toLocaleString('tr-TR'),
                    status: 'approved'
                });
                await user.save();
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// تشغيل السيرفر على المنفذ المحدد
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🟢 Server is running smoothly on port ${PORT}`);
});
