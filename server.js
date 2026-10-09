'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const MONGO_URI = process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname, { index: 'index.html', maxAge: '1h' }));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
  balance: { type: Number, default: 0, min: 0 },
  todayProfit: { type: Number, default: 0 },
  bonus: { type: Number, default: 0, min: 0 },
  teamCount: { type: Number, default: 0, min: 0 },
  walletAddress: { type: String, default: '' },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const Request = mongoose.models.Request || mongoose.model('Request', new mongoose.Schema({
  username: { type: String, required: true, trim: true, maxlength: 64 },
  amount: { type: Number, required: true, min: 0.01 },
  type: { type: String, required: true, enum: ['deposit', 'withdraw_daily', 'withdraw_capital', 'invite_bonus'] },
  walletAddress: { type: String, default: '', maxlength: 128 },
  details: { type: String, default: '', maxlength: 300 },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  createdAt: { type: Date, default: Date.now }
}));

function sendDbUnavailable(res) {
  return res.status(503).json({ success: false, error: 'Database unavailable' });
}
function validUsername(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64;
}
function safeUser(user) {
  return user ? {
    _id: user._id,
    username: user.username,
    balance: user.balance,
    todayProfit: user.todayProfit,
    bonus: user.bonus,
    teamCount: user.teamCount,
    walletAddress: user.walletAddress,
    history: user.history,
    createdAt: user.createdAt
  } : null;
}
function adminSession(req, res, next) {
  const token = req.cookies?.admin_session || parseCookies(req.headers.cookie).admin_session;
  const expiresAt = token && adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  next();
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function passwordMatches(candidate) {
  if (!ADMIN_PASSWORD || typeof candidate !== 'string') return false;
  const expected = Buffer.from(ADMIN_PASSWORD);
  const supplied = Buffer.from(candidate);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

app.get('/api/health', (_req, res) => res.json({
  success: true,
  database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));

app.get('/panel', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/secure-admin-panel-2026', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.post('/api/user/login', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!validUsername(username)) return res.status(400).json({ success: false, error: 'Invalid username' });
  try {
    const user = await User.findOneAndUpdate(
      { username },
      { $setOnInsert: { username } },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ success: true, user: safeUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, error: 'Username already exists' });
    console.error('User login failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load user' });
  }
});

app.post('/api/user/request', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { username, type, walletAddress = '', details = '' } = req.body || {};
  const amount = Number(req.body?.amount);
  if (!validUsername(username) || !['deposit', 'withdraw_daily', 'withdraw_capital', 'invite_bonus'].includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return res.status(400).json({ success: false, error: 'Invalid amount' });
  }
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const request = await Request.create({
      username: user.username,
      amount,
      type,
      walletAddress: String(walletAddress).trim().slice(0, 128),
      details: String(details).trim().slice(0, 300)
    });
    return res.status(201).json({ success: true, requestId: request._id });
  } catch (error) {
    console.error('Request creation failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to create request' });
  }
});

app.get('/api/user/history', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  if (!validUsername(username)) return res.status(400).json({ success: false, error: 'Invalid username' });
  try {
    const user = await User.findOne({ username }).select('history');
    return res.json({ success: true, history: user?.history || [] });
  } catch (error) {
    console.error('History lookup failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load history' });
  }
});

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ success: false, error: 'Admin access is not configured' });
  if (!passwordMatches(req.body?.password)) return res.status(401).json({ success: false, error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}${secure}`);
  return res.json({ success: true });
});

app.post('/api/admin/logout', adminSession, (req, res) => {
  const token = parseCookies(req.headers.cookie).admin_session;
  if (token) adminSessions.delete(token);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return res.json({ success: true });
});

app.get('/api/admin/requests', adminSession, async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  try {
    const [requests, allUsers] = await Promise.all([
      Request.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(500).lean(),
      User.find({}).sort({ createdAt: -1 }).limit(2000).lean()
    ]);
    const pendingUsers = allUsers.filter(user => user.balance === 0 && (!user.history || user.history.length === 0));
    return res.json({ success: true, requests, totalUsers: allUsers.length, allUsers, pendingUsers });
  } catch (error) {
    console.error('Admin data load failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load admin data' });
  }
});

app.post('/api/admin/action-request', adminSession, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { requestId, action } = req.body || {};
  if (!mongoose.isValidObjectId(requestId) || !['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, error: 'Invalid request action' });
  }
  try {
    const item = await Request.findOneAndUpdate(
      { _id: requestId, status: 'pending' },
      { $set: { status: action } },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, error: 'Pending request not found' });
    if (action === 'approved') {
      const user = await User.findOne({ username: item.username });
      if (!user) {
        await Request.updateOne({ _id: item._id }, { $set: { status: 'pending' } });
        return res.status(404).json({ success: false, error: 'User not found; request returned to pending' });
      }
      if (item.type === 'deposit') user.balance += item.amount;
      if (item.type === 'withdraw_capital') user.balance = Math.max(0, user.balance - item.amount);
      if (item.type === 'withdraw_daily') user.todayProfit = Math.max(0, user.todayProfit - item.amount);
      if (item.type === 'invite_bonus') user.bonus += item.amount;
      user.history.push({ type: item.type, amount: item.amount, status: action, date: new Date() });
      await user.save();
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin action failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to process request' });
  }
});

app.post('/api/admin/update-user', adminSession, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, error: 'Invalid user id' });
  const fields = {
    balance: Number(req.body.capital),
    todayProfit: Number(req.body.dailyProfit),
    bonus: Number(req.body.bonus),
    teamCount: Number(req.body.teamCount)
  };
  if (Object.values(fields).some(value => !Number.isFinite(value)) || fields.balance < 0 || fields.bonus < 0 || fields.teamCount < 0) {
    return res.status(400).json({ success: false, error: 'Invalid user values' });
  }
  try {
    const user = await User.findByIdAndUpdate(userId, { $set: fields }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, user: safeUser(user) });
  } catch (error) {
    console.error('User update failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to update user' });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }
  console.error('Unhandled server error:', error.message);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

if (MONGO_URI) {
  mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('MongoDB connected'))
    .catch(error => console.error('MongoDB connection failed:', error.message));
} else {
  console.error('MONGODB_URI is not configured; database API routes will return 503');
}

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));

function shutdown() {
  server.close(() => mongoose.disconnect().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
