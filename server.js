const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const app = express();

app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static(__dirname));

const MONGO_URI = "mongodb+srv://admin:admin12345@free-tier-demo.aogqf83.mongodb.net/cryptoDB?retryWrites=true&w=majority&appName=free-tier-demo";

mongoose.connect(MONGO_URI)
    .then(() => console.log("🟢 Permanent MongoDB Connected Successfully"))
    .catch(err => console.error("⚠️ DB Connection Error:", err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0.00 },
    todayProfit: { type: Number, default: 0.00 },
    bonus: { type: Number, default: 0.00 },
    teamCount: { type: Number, default: 0 },
    walletAddress: { type: String, default: "" },
    history: { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const RequestSchema = new mongoose.Schema({
    username: { type: String, required: true },
    amount: { type: Number, default: 0 },
    type: { type: String, required: true }, 
    walletAddress: { type: String, default: "" },
    details: { type: String, default: "" },
    status: { type: String, default: 'pending' }, 
    date: { type: String, default: () => new Date().toLocaleString('tr-TR') },
    createdAt: { type: Date, default: Date.now }
});
const Request = mongoose.model('Request', RequestSchema);

const ADMIN_PASSWORD = "ADMIN_SECRET_PASS_2026"; 

// مسار دخول وتنشيط المستخدم
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

// مسار استقبال الطلبات من المستخدم (إيداع / سحب / دعوات)
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

app.get('/api/user/history', async (req, res) => {
    const { username } = req.query;
    try {
        const user = await User.findOne({ username });
        res.json({ success: true, history: user ? user.history : [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// مسار جلب البيانات للوحة المشرف (مطابق تماماً الآن)
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

// مسار اتخاذ الإجراء من المشرف (مطابق تماماً الآن)
app.post('/api/admin/action-request', async (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    const { requestId, action } = req.body;
    try {
        const request = await Request.findById(requestId);
        if (!request) return res.status(404).json({ success: false });

        if (action === 'approve') {
            request.status = 'approved';
            const user = await User.findOne({ username: request.username });
            if (user) {
                const amt = request.amount;
                if (request.type === 'deposit') {
                    user.balance += amt;
                    user.todayProfit += (amt * 0.15);
                    user.history.push({ message: `✅ +${amt} USDT Yatırma`, date: new Date().toLocaleTimeString() });
                } else if (request.type === 'withdraw_capital') {
                    user.balance -= amt;
                    user.history.push({ message: `💸 -${amt} USDT Sermaye Çekme`, date: new Date().toLocaleTimeString() });
                } else if (request.type === 'withdraw_daily') {
                    user.todayProfit -= amt;
                    user.history.push({ message: `📊 -${amt} USDT Kar Çekme`, date: new Date().toLocaleTimeString() });
                } else if (request.type === 'invite_bonus') {
                    user.bonus += 15.00;
                    user.teamCount += 1;
                    user.history.push({ message: `🍇 +15 USDT Davet Ödülü`, date: new Date().toLocaleTimeString() });
                }
                await user.save();
            }
        } else {
            request.status = 'rejected';
        }
        await request.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/update-user', async (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    const { userId, capital, dailyProfit, bonus, teamCount } = req.body;
    try {
        await User.findByIdAndUpdate(userId, {
            balance: parseFloat(capital || 0),
            todayProfit: parseFloat(dailyProfit || 0),
            bonus: parseFloat(bonus || 0),
            teamCount: parseInt(teamCount || 0)
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/admin/distribute-profit', async (req, res) => {
    if (req.body.adminPassword !== ADMIN_PASSWORD) return res.status(401).json({ success: false });
    try {
        const allUsers = await User.find({});
        const activeUsers = allUsers.filter(u => u.balance > 0);
        for (let user of activeUsers) {
            let profit = user.balance * 0.15;
            user.todayProfit += profit;
            user.balance += profit;
            user.history.push({ message: `📊 +${profit.toFixed(2)} USDT Günlük Kar`, date: new Date().toLocaleTimeString() });
            await user.save();
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
app.listen(PORT, '0.0.0.0', () => console.log(`🟢 Running on port ${PORT}`));
