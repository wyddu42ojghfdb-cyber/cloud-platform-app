'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const MONGO_URI = process.env.MONGODB_URI;
const OFFICIAL_DEPOSIT_WALLET = process.env.OFFICIAL_DEPOSIT_WALLET || 'TA1vsgrJEFy3YM6rkQWBppnZemFE6c9pBN';
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://cloud-platform-app.onrender.com').replace(/\/+$/, '');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const telegramPendingUpdates = new Set();
const telegramProcessedUpdates = new Set();
const REFERRAL_REWARD = 10;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || ['/', '/panel', '/secure-admin-panel-2026', '/index.html', '/admin.html', '/manifest.json', '/sw.js'].includes(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname, {
  index: 'index.html',
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (/\.(?:html|json)$/.test(filePath) || filePath.endsWith(`${path.sep}sw.js`)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  }
}));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
  balance: { type: Number, default: 0, min: 0 },
  todayProfit: { type: Number, default: 0, min: 0 },
  bonus: { type: Number, default: 0, min: 0 },
  reservedCapital: { type: Number, default: 0, min: 0 },
  reservedProfit: { type: Number, default: 0, min: 0 },
  reservedBonus: { type: Number, default: 0, min: 0 },
  teamCount: { type: Number, default: 0, min: 0 },
  walletAddress: { type: String, default: '' },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const RequestSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, maxlength: 64 },
  amount: { type: Number, required: true, min: 0.01 },
  type: { type: String, required: true, enum: ['deposit', 'withdraw_daily', 'withdraw_capital', 'invite_bonus', 'referral_reward'] },
  walletAddress: { type: String, default: '', maxlength: 128 },
  referredUsername: { type: String, default: '', trim: true, maxlength: 64 },
  details: { type: String, default: '', maxlength: 300 },
  fundsReserved: { type: Boolean, default: false },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  createdAt: { type: Date, default: Date.now }
});
// A referred username can earn one referral reward only, even when requests race.
RequestSchema.index({ referredUsername: 1 }, { unique: true, partialFilterExpression: { type: 'referral_reward', referredUsername: { $type: 'string', $gt: '' } } });
const Request = mongoose.models.Request || mongoose.model('Request', RequestSchema);

const ProfitDistribution = mongoose.models.ProfitDistribution || mongoose.model('ProfitDistribution', new mongoose.Schema({
  operationId: { type: String, required: true, unique: true, maxlength: 100 },
  sourceKey: { type: String, required: true, unique: true, maxlength: 64 },
  fingerprint: { type: String, required: true, maxlength: 64 },
  netProfit: { type: Number, required: true, min: 0.01 },
  distributionPercent: { type: Number, min: 0, max: 100, default: null },
  totalCapital: { type: Number, required: true, min: 0.01 },
  eligibleUsers: { type: Number, required: true, min: 1 },
  period: { type: String, required: true, maxlength: 10 },
  sourceReference: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now }
}));
const ProfitAllocation = mongoose.models.ProfitAllocation || mongoose.model('ProfitAllocation', new mongoose.Schema({
  operationId: { type: String, required: true, maxlength: 100 },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  username: { type: String, required: true, maxlength: 64 },
  capital: { type: Number, required: true, min: 0.01 },
  sharePercent: { type: Number, required: true, min: 0 },
  distributionPercent: { type: Number, min: 0, max: 100, default: null },
  amount: { type: Number, required: true, min: 0 },
  period: { type: String, required: true, maxlength: 10 },
  sourceReference: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now }
}).index({ operationId: 1, userId: 1 }, { unique: true }));

function sendDbUnavailable(res) {
  return res.status(503).json({ success: false, error: 'Database unavailable' });
}
function safeSecretMatch(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}
function telegramFaqReply(text) {
  const normalized = String(text || '').trim().toLowerCase();
  const arabic = /[\u0600-\u06ff]/.test(normalized);
  const link = PUBLIC_APP_URL;
  if (/^\/(start|help)(?:@\w+)?(?:\s|$)/i.test(normalized) || /^(مرحبا|مساعدة|help)$/.test(normalized)) {
    return arabic
      ? `مرحباً بك في دعم المنصة. رابط واجهة المستخدم: ${link}\nأستطيع شرح الإيداع والسحب والإحالات وتثبيت التطبيق. لا أستطيع عرض أرصدة الحسابات عبر Telegram.`
      : `Welcome to platform support. User interface: ${link}\nI can explain deposits, withdrawals, referrals, and app installation. I cannot access account balances through Telegram.`;
  }
  if (/balance|account|رصيد|حساب|ارصدة|أرصدة/.test(normalized)) {
    return arabic
      ? `لعرض الأرصدة، افتح حسابك من واجهة المنصة: ${link}. لا يستطيع البوت الوصول إلى بيانات الحساب أو تغييرها، ولا ترسل كلمات مرور أو مفاتيح محفظة عبر Telegram.`
      : `To view balances, open your account through the platform: ${link}. The bot cannot access or change account data. Never send passwords or wallet keys over Telegram.`;
  }
  if (/deposit|إيداع|شحن|wallet|محفظة|عنوان/.test(normalized)) {
    return arabic
      ? `لإرسال طلب إيداع، افتح ${link} وقدّم الطلب للمراجعة. عنوان الإيداع المعروض: ${OFFICIAL_DEPOSIT_WALLET}. تحقق من الشبكة والعنوان قبل أي تحويل؛ البوت لا ينفذ تحويلات.`
      : `To submit a deposit request, open ${link} and submit it for review. Displayed deposit address: ${OFFICIAL_DEPOSIT_WALLET}. Verify the network and address before any transfer; this bot does not transfer funds.`;
  }
  if (/withdraw|سحب|withdrawal/.test(normalized)) {
    return arabic
      ? `طلبات السحب تُقدّم من ${link} وتبقى للمراجعة الإدارية. موافقة التطبيق لا تعني أن تحويلاً على الشبكة قد تم؛ لا تشارك بيانات الدخول أو مفاتيح المحفظة هنا.`
      : `Submit withdrawal requests through ${link}; they remain subject to administrative review. App approval does not mean an on-chain transfer occurred. Do not share passwords or wallet keys here.`;
  }
  if (/referral|invite|دعوة|إحالة|الصديق|مكافأة/.test(normalized)) {
    return arabic
      ? `لطلب مكافأة الدعوة، افتح ${link} وأدخل اسم الصديق. يمكن إرسال الطلب قبل تسجيل الصديق، لكنه لا يُعتمد إلا بعد وجود حساب والتحقق من الأهلية.`
      : `To request a referral reward, open ${link} and enter the friend's username. You may submit before the friend registers; approval requires an account and eligibility review.`;
  }
  if (/install|تثبيت|الرابط|link|app|تطبيق|منصة/.test(normalized)) {
    return arabic
      ? `رابط واجهة المستخدم: ${link}\nللتثبيت على الهاتف، افتح الرابط في المتصفح واختر «إضافة إلى الشاشة الرئيسية» أو زر التثبيت داخل الصفحة.`
      : `User interface: ${link}\nTo install on a phone, open it in your browser and choose “Add to Home Screen” or use the in-page install button.`;
  }
  return arabic
    ? `أستطيع المساعدة في الإيداع والسحب والإحالات وتثبيت التطبيق. اكتب موضوع سؤالك أو تواصل مع الدعم: https://t.me/invest_support_bot. رابط المنصة: ${link}.`
    : `I can help with deposits, withdrawals, referrals, and app installation. Tell me which topic you need, or contact support at https://t.me/invest_support_bot. Platform: ${link}.`;
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
    reservedCapital: Number(user.reservedCapital || 0),
    reservedProfit: Number(user.reservedProfit || 0),
    reservedBonus: Number(user.reservedBonus || 0),
    reservedTotal: Number(user.reservedCapital || 0) + Number(user.reservedProfit || 0) + Number(user.reservedBonus || 0),
    teamCount: user.teamCount,
    walletAddress: user.walletAddress,
    history: user.history,
    createdAt: user.createdAt
  } : null;
}
function toPercentBasisPoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 100) return null;
  const basisPoints = Math.round(number * 100);
  return Number.isInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10000 ? basisPoints : null;
}
function buildPercentagePlan(users, percentageBps) {
  const eligible = users.map(user => {
    const cents = Math.round(Number(user.balance) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error('Capital amount is outside supported precision');
    return { user, capitalCents: BigInt(cents) };
  }).filter(entry => entry.capitalCents > 0n);
  const totalCapitalCents = eligible.reduce((sum, entry) => sum + entry.capitalCents, 0n);
  if (!eligible.length || totalCapitalCents <= 0n) return null;
  if (totalCapitalCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Aggregate capital is outside supported precision');
  const allocations = eligible.map(entry => ({
    userId: entry.user._id,
    username: entry.user.username,
    capitalCents: entry.capitalCents,
    amountCents: (entry.capitalCents * BigInt(percentageBps) + 5000n) / 10000n,
    sharePercent: Number((entry.capitalCents * 1_000_000n + totalCapitalCents / 2n) / totalCapitalCents) / 10_000,
    distributionPercent: percentageBps / 100
  }));
  const totalProfitCents = allocations.reduce((sum, row) => sum + row.amountCents, 0n);
  if (totalProfitCents <= 0n) return null;
  return {
    totalCapitalCents,
    totalProfitCents,
    percentageBps,
    allocations
  };
}
function profitFingerprint(plan, period, sourceReference) {
  const snapshot = plan.allocations.map(row => [String(row.userId), row.capitalCents.toString()]).sort((a, b) => a[0].localeCompare(b[0]));
  return crypto.createHash('sha256').update(JSON.stringify({ totalProfitCents: plan.totalProfitCents.toString(), percentageBps: plan.percentageBps, period, sourceReference, snapshot })).digest('hex');
}
function profitSourceKey(period, sourceReference) {
  return crypto.createHash('sha256').update(`${period}\n${sourceReference.trim().toLowerCase()}`).digest('hex');
}
function moneyFromCents(cents) { return Number(cents) / 100; }

app.get('/api/health', (_req, res) => res.json({
  success: true,
  database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}));
app.get('/api/public/config', (_req, res) => res.json({ success: true, depositWallet: OFFICIAL_DEPOSIT_WALLET }));
app.get('/panel', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/secure-admin-panel-2026', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Optional private-chat FAQ bot. No channel/group broadcasts are performed here.
app.post('/api/telegram/webhook', async (req, res) => {
  if (!TELEGRAM_BOT_TOKEN || !/^[A-Za-z0-9_-]{32,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
    return res.status(503).json({ success: false, error: 'Telegram bot is not configured' });
  }
  if (!safeSecretMatch(req.get('X-Telegram-Bot-Api-Secret-Token'), TELEGRAM_WEBHOOK_SECRET)) {
    return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
  }
  const update = req.body || {};
  const message = update.message;
  if (!Number.isSafeInteger(update.update_id) || !message || message.chat?.type !== 'private' || message.from?.is_bot || typeof message.text !== 'string') {
    return res.sendStatus(200);
  }
  const updateId = String(update.update_id);
  if (telegramProcessedUpdates.has(updateId) || telegramPendingUpdates.has(updateId)) return res.sendStatus(200);
  telegramPendingUpdates.add(updateId);
  try {
    const reply = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: message.chat.id, text: telegramFaqReply(message.text) })
    });
    const result = await reply.json().catch(() => ({}));
    if (!reply.ok || !result.ok) {
      telegramPendingUpdates.delete(updateId);
      console.error('Telegram reply failed; HTTP status:', reply.status);
      return res.status(502).json({ success: false, error: 'Telegram reply failed' });
    }
    telegramPendingUpdates.delete(updateId);
    telegramProcessedUpdates.add(updateId);
    if (telegramProcessedUpdates.size > 5000) telegramProcessedUpdates.delete(telegramProcessedUpdates.values().next().value);
    return res.sendStatus(200);
  } catch (_) {
    telegramPendingUpdates.delete(updateId);
    console.error('Telegram reply request failed');
    return res.status(502).json({ success: false, error: 'Telegram reply failed' });
  }
});

app.post('/api/user/login', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!validUsername(username)) return res.status(400).json({ success: false, error: 'Invalid username' });
  try {
    const user = await User.findOneAndUpdate({ username }, { $setOnInsert: { username } }, { new: true, upsert: true, runValidators: true });
    return res.json({ success: true, user: safeUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, error: 'Username already exists' });
    console.error('User login failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load user' });
  }
});

app.post('/api/user/request', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { username, type, walletAddress = '', details = '', referredUsername = '' } = req.body || {};
  if (!validUsername(username) || !['deposit', 'withdraw_daily', 'withdraw_capital', 'invite_bonus', 'referral_reward'].includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }
  const isReferral = type === 'referral_reward';
  const amount = isReferral ? REFERRAL_REWARD : Math.round(Number(req.body?.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) return res.status(400).json({ success: false, error: 'Invalid amount' });
  if (isReferral && (!validUsername(referredUsername) || referredUsername.trim().toLowerCase() === username.trim().toLowerCase())) {
    return res.status(400).json({ success: false, error: 'Invalid referred username' });
  }
  const normalizedReferredUsername = isReferral ? referredUsername.trim() : '';
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (isReferral) {
      const existing = await Request.exists({ type: 'referral_reward', referredUsername: normalizedReferredUsername });
      if (existing) return res.status(409).json({ success: false, error: 'This account already has a referral reward request' });
    }
  const withdrawalFields = {
      withdraw_capital: { balance: 'balance', reserve: 'reservedCapital' },
      withdraw_daily: { balance: 'todayProfit', reserve: 'reservedProfit' },
      invite_bonus: { balance: 'bonus', reserve: 'reservedBonus' }
    };
    const normalizedWallet = String(walletAddress || '').trim().slice(0, 128);
    if (withdrawalFields[type]) {
      if (!normalizedWallet) return res.status(400).json({ success: false, error: 'A withdrawal wallet address is required' });
      const session = await mongoose.startSession();
      try {
        let outcome;
        await session.withTransaction(async () => {
          const current = await User.findById(user._id).session(session);
          if (!current) { outcome = { error: 'User not found', status: 404 }; return; }
          const { balance: balanceField, reserve: reserveField } = withdrawalFields[type];
          const available = Math.round((Number(current[balanceField] || 0) - Number(current[reserveField] || 0)) * 100) / 100;
          if (amount > available) { outcome = { error: 'Insufficient available balance', status: 400 }; return; }
          current[reserveField] = Math.round((Number(current[reserveField] || 0) + amount) * 100) / 100;
          await current.save({ session });
          const [request] = await Request.create([{
            username: current.username,
            amount,
            type,
            walletAddress: normalizedWallet,
            details: String(details).trim().slice(0, 300),
            fundsReserved: true
          }], { session });
          outcome = { requestId: request._id };
        });
        if (outcome?.error) return res.status(outcome.status).json({ success: false, error: outcome.error });
        return res.status(201).json({ success: true, requestId: outcome.requestId, amount, reserved: true });
      } finally {
        await session.endSession();
      }
    }
    const request = await Request.create({
      username: user.username,
      amount,
      type,
      walletAddress: normalizedWallet,
      referredUsername: normalizedReferredUsername,
      details: String(details).trim().slice(0, 300)
    });
    return res.status(201).json({ success: true, requestId: request._id, amount });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, error: 'This account already has a referral reward request' });
    console.error('Request creation failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to create request' });
  }
});

app.get('/api/user/notifications', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  if (!validUsername(username)) return res.status(400).json({ success: false, error: 'Invalid username' });
  try {
    const requests = await Request.find({ username }).sort({ createdAt: -1 }).limit(20).select('type amount status referredUsername createdAt').lean();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, notifications: requests });
  } catch (error) {
    console.error('Notification load failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load notifications' });
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

// All /api/admin/* routes are intentionally unauthenticated per owner's explicit request.
// Anyone who discovers these routes can read and modify admin data.
app.get('/api/admin/requests', async (_req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  try {
    const [requests, allUsers, totalUsers, distributions] = await Promise.all([
      Request.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(500).lean(),
      User.find({}).sort({ createdAt: -1 }).limit(2000).lean(),
      User.countDocuments(),
      ProfitDistribution.find({}).sort({ createdAt: -1 }).limit(20).lean()
    ]);
    const pendingUsers = allUsers.filter(user => user.balance === 0 && (!user.history || user.history.length === 0));
    return res.json({ success: true, requests, totalUsers, allUsers, pendingUsers, distributions });
  } catch (error) {
    console.error('Admin data load failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load admin data' });
  }
});

app.post('/api/admin/profit-distribution/preview', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const percentageBps = toPercentBasisPoints(req.body?.percentage);
  const period = typeof req.body?.period === 'string' ? req.body.period.trim() : '';
  const sourceReference = `admin-percent-broadcast:${period}`;
  if (!percentageBps || !/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return res.status(400).json({ success: false, error: 'Enter a percentage from 0.01 to 100 and a valid period' });
  }
  try {
    const sourceKey = profitSourceKey(period, sourceReference);
    if (await ProfitDistribution.exists({ sourceKey })) return res.status(409).json({ success: false, error: 'A percentage distribution has already been published for this period' });
    const users = await User.find({ balance: { $gt: 0 } }).select('_id username balance').lean();
    const plan = buildPercentagePlan(users, percentageBps);
    if (!plan) return res.status(400).json({ success: false, error: 'No non-zero distribution remains after cent rounding; increase the percentage or balances' });
    return res.json({
      success: true,
      preview: {
        fingerprint: profitFingerprint(plan, period, sourceReference),
        percentage: percentageBps / 100,
        totalProfit: moneyFromCents(plan.totalProfitCents),
        totalCapital: moneyFromCents(plan.totalCapitalCents),
        eligibleUsers: plan.allocations.length,
        period,
        allocations: plan.allocations.map(row => ({
          username: row.username,
          capital: moneyFromCents(row.capitalCents),
          percentage: row.distributionPercent,
          amount: moneyFromCents(row.amountCents)
        }))
      }
    });
  } catch (error) {
    console.error('Profit distribution preview failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to prepare profit distribution preview' });
  }
});

app.post('/api/admin/profit-distribution/publish', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const percentageBps = toPercentBasisPoints(req.body?.percentage);
  const period = typeof req.body?.period === 'string' ? req.body.period.trim() : '';
  const sourceReference = `admin-percent-broadcast:${period}`;
  const operationId = typeof req.body?.operationId === 'string' ? req.body.operationId.trim() : '';
  const fingerprint = typeof req.body?.fingerprint === 'string' ? req.body.fingerprint.trim() : '';
  if (!percentageBps || !/^\d{4}-\d{2}-\d{2}$/.test(period) || !/^[a-zA-Z0-9-]{16,100}$/.test(operationId) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    return res.status(400).json({ success: false, error: 'Invalid distribution data; prepare a new preview' });
  }
  const session = await mongoose.startSession();
  const sourceKey = profitSourceKey(period, sourceReference);
  try {
    let result;
    await session.withTransaction(async () => {
      const prior = await ProfitDistribution.findOne({ operationId }).session(session).lean();
      if (prior) {
        if (prior.fingerprint !== fingerprint) {
          result = { error: 'This operation ID was already used for a different distribution', status: 409 };
          return;
        }
        result = { success: true, duplicate: true, distribution: prior };
        return;
      }
      const priorSource = await ProfitDistribution.findOne({ sourceKey }).session(session).lean();
      if (priorSource) {
        if (priorSource.fingerprint === fingerprint) result = { success: true, duplicate: true, distribution: priorSource };
        else result = { error: 'A percentage distribution already exists for this period', status: 409 };
        return;
      }
      const users = await User.find({ balance: { $gt: 0 } }).select('_id username balance').session(session).lean();
      const plan = buildPercentagePlan(users, percentageBps);
      if (!plan) {
        result = { error: 'No non-zero distribution remains after cent rounding; increase the percentage or balances', status: 400 };
        return;
      }
      if (profitFingerprint(plan, period, sourceReference) !== fingerprint) {
        result = { error: 'Capital changed since preview; prepare a fresh preview before publishing', status: 409 };
        return;
      }
      const createdAt = new Date();
      const allocations = plan.allocations.map(row => ({
        operationId,
        userId: row.userId,
        username: row.username,
        capital: moneyFromCents(row.capitalCents),
        sharePercent: row.sharePercent,
        distributionPercent: row.distributionPercent,
        amount: moneyFromCents(row.amountCents),
        period,
        sourceReference,
        createdAt
      }));
      const updates = plan.allocations.map(row => ({
        updateOne: {
          filter: { _id: row.userId },
          update: {
            $inc: { todayProfit: moneyFromCents(row.amountCents) },
            $push: { history: { type: 'profit_distribution', amount: moneyFromCents(row.amountCents), distributionPercent: row.distributionPercent, period, sourceReference, operationId, date: createdAt } }
          }
        }
      }));
      await User.bulkWrite(updates, { session, ordered: true });
      await ProfitAllocation.insertMany(allocations, { session, ordered: true });
      const [distribution] = await ProfitDistribution.create([{
        operationId,
        sourceKey,
        fingerprint,
        netProfit: moneyFromCents(plan.totalProfitCents),
        distributionPercent: percentageBps / 100,
        totalCapital: moneyFromCents(plan.totalCapitalCents),
        eligibleUsers: plan.allocations.length,
        period,
        sourceReference,
        createdAt
      }], { session });
      result = { success: true, duplicate: false, distribution };
    });
    if (result?.error) return res.status(result.status).json({ success: false, error: result.error });
    return res.json(result || { success: false, error: 'Distribution produced no result' });
  } catch (error) {
    console.error('Profit distribution publish failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to publish profit distribution' });
  } finally {
    await session.endSession();
  }
});

app.post('/api/admin/action-request', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { requestId, action } = req.body || {};
  if (!mongoose.isValidObjectId(requestId) || !['approved', 'rejected'].includes(action)) return res.status(400).json({ success: false, error: 'Invalid request action' });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const item = await Request.findOne({ _id: requestId, status: 'pending' }).session(session);
      if (!item) {
        result = { error: 'Pending request not found', status: 404 };
        return;
      }
      if (action === 'rejected') {
        const reserveField = { withdraw_capital: 'reservedCapital', withdraw_daily: 'reservedProfit', invite_bonus: 'reservedBonus' }[item.type];
        if (reserveField && item.fundsReserved) {
          const user = await User.findOne({ username: item.username }).session(session);
          if (user) {
            user[reserveField] = Math.max(0, Math.round((Number(user[reserveField] || 0) - item.amount) * 100) / 100);
            await user.save({ session });
          }
        }
        await Request.updateOne({ _id: item._id, status: 'pending' }, { $set: { status: 'rejected' } }, { session });
        result = { success: true };
        return;
      }
      const user = await User.findOne({ username: item.username }).session(session);
      if (!user) {
        result = { error: 'User not found', status: 404 };
        return;
      }
      if (item.type === 'referral_reward') {
        const invited = await User.findOne({ username: item.referredUsername }).session(session);
        if (!invited || invited.username.toLowerCase() === user.username.toLowerCase()) {
          result = { error: 'Referred account is missing or invalid', status: 400 };
          return;
        }
        const priorApproved = await Request.exists({ type: 'referral_reward', referredUsername: invited.username, status: 'approved' }).session(session);
        if (priorApproved) {
          result = { error: 'This referred account has already received a reward', status: 409 };
          return;
        }
        user.bonus += REFERRAL_REWARD;
        user.teamCount += 1;
        user.history.push({ type: 'referral_reward', amount: REFERRAL_REWARD, referredUsername: invited.username, status: 'approved', date: new Date() });
      } else if (item.type === 'deposit') {
        user.balance += item.amount;
        user.history.push({ type: item.type, amount: item.amount, status: 'approved', date: new Date() });
      } else if (item.type === 'withdraw_capital') {
        if (user.balance < item.amount) { result = { error: 'Insufficient capital balance', status: 400 }; return; }
        user.balance -= item.amount;
        if (item.fundsReserved) user.reservedCapital = Math.max(0, Math.round((Number(user.reservedCapital || 0) - item.amount) * 100) / 100);
        user.history.push({ type: item.type, amount: item.amount, status: 'approved', date: new Date() });
      } else if (item.type === 'withdraw_daily') {
        if (user.todayProfit < item.amount) { result = { error: 'Insufficient daily profit balance', status: 400 }; return; }
        user.todayProfit -= item.amount;
        if (item.fundsReserved) user.reservedProfit = Math.max(0, Math.round((Number(user.reservedProfit || 0) - item.amount) * 100) / 100);
        user.history.push({ type: item.type, amount: item.amount, status: 'approved', date: new Date() });
      } else if (item.type === 'invite_bonus') {
        if (user.bonus < item.amount) { result = { error: 'Insufficient referral bonus balance', status: 400 }; return; }
        user.bonus -= item.amount;
        if (item.fundsReserved) user.reservedBonus = Math.max(0, Math.round((Number(user.reservedBonus || 0) - item.amount) * 100) / 100);
        user.history.push({ type: item.type, amount: item.amount, status: 'approved', date: new Date() });
      }
      await user.save({ session });
      const updated = await Request.updateOne({ _id: item._id, status: 'pending' }, { $set: { status: 'approved' } }, { session });
      if (updated.modifiedCount !== 1) throw new Error('Request status changed concurrently');
      result = { success: true, referralReward: item.type === 'referral_reward' ? REFERRAL_REWARD : undefined };
    });
    if (result?.error) return res.status(result.status).json({ success: false, error: result.error });
    return res.json(result || { success: true });
  } catch (error) {
    console.error('Admin action failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to process request' });
  } finally {
    await session.endSession();
  }
});

app.post('/api/admin/update-user', async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, error: 'Invalid user id' });
  const fields = { balance: Math.round(Number(req.body.capital) * 100) / 100, todayProfit: Math.round(Number(req.body.dailyProfit) * 100) / 100, bonus: Math.round(Number(req.body.bonus) * 100) / 100, teamCount: Number(req.body.teamCount) };
  if (Object.values(fields).some(value => !Number.isFinite(value)) || fields.balance < 0 || fields.todayProfit < 0 || fields.bonus < 0 || !Number.isInteger(fields.teamCount) || fields.teamCount < 0) return res.status(400).json({ success: false, error: 'Invalid user values' });
  try {
    const user = await User.findByIdAndUpdate(userId, { $set: fields, $push: { history: { type: 'admin_manual_adjustment', ...fields, date: new Date() } } }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, user: safeUser(user) });
  } catch (error) {
    console.error('User update failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to update user' });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) return res.status(400).json({ success: false, error: 'Invalid JSON' });
  console.error('Unhandled server error:', error.message);
  return res.status(500).json({ success: false, error: 'Internal server error' });
});

if (MONGO_URI) {
  mongoose.connect(MONGO_URI, { dbName: 'cryptoDB', serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('MongoDB connected'))
    .catch(error => console.error('MongoDB connection failed:', error.message));
} else {
  console.error('MONGODB_URI is not configured; database API routes will return 503');
}
const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
function shutdown() { server.close(() => mongoose.disconnect().finally(() => process.exit(0))); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
