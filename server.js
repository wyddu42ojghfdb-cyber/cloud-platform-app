const express = require('express');
const path = require('path');
const cors = require('cors'); // تفعيل مشاركة البيانات لمنع حظر المتصفحات
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// قاعدة بيانات سحابية مؤقتة لحفظ المستخدمين والعمليات حياً
let users = {};
let pendingRequests = [];

// 1. مسار تسجيل الدخول وقفل الحساب
app.post('/backend/user/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ success: false, message: 'اسم المستخدم مطلوب' });
    
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

// 2. مسار استقبال وصَفْق الطلبات من شاشة المستخدم وتحويلها للمشرف
app.post('/backend/user/request', (req, res) => {
    const { username, amount, type, walletAddress } = req.body;
    if (!username || !amount || !type) {
        return res.status(400).json({ success: false, message: 'بيانات الطلب ناقصة' });
    }
    
    const newRequest = {
        id: Date.now(),
        username,
        amount: parseFloat(amount),
        type, // deposit أو withdraw أو invite_bonus
        walletAddress,
        status: 'pending',
        date: new Date().toLocaleString('tr-TR')
    };
    
    // صفق وتمرير الطلب إلى جدول المشرف فوراً
    pendingRequests.push(newRequest);
    res.json({ success: true, message: '⚡ تم إرسال طلبك بنجاح وهو قيد المراجعة الفورية من الإدارة!' });
});

// 3. مسار قراءة الإشعارات والعمليات الحية داخل لوحة المشرف
app.get('/backend/admin/requests', (req, res) => {
    res.json({ success: true, requests: pendingRequests });
});

// 4. مسار جلب سجل المعاملات التاريخية لشاشة المستخدم
app.get('/backend/user/history', (req, res) => {
    const { username } = req.query;
    if (users[username]) {
        res.json({ success: true, history: users[username].history });
    } else {
        res.json({ success: true, history: [] });
    }
});

// توجيه المسارات الرابطة للشاشات
app.get('/panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`السيرفر يعمل بنجاح على المنصة العالمية...`));
