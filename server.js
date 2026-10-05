const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

let pendingRequests = [];

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// مسارات صفحة المشرف
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin-panel', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// استقبال طلبات واجهة المستخدم
app.post('/api/submit-request', (req, res) => {
    pendingRequests.push(req.body);
    res.json({ success: true });
});

// جلب الطلبات للمشرف
app.get('/api/admin/requests', (req, res) => {
    res.json(pendingRequests);
});

// المسار الافتراضي لواجهة المستخدم (دائماً في نهاية الملف)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
