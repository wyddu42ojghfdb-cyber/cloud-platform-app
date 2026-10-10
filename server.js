'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const MONGO_URI = process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const OFFICIAL_DEPOSIT_WALLET = process.env.OFFICIAL_DEPOSIT_WALLET || 'TA1vsgrJEFy3YM6rkQWBppnZemFE6c9pBN';
const REFERRAL_REWARD = 10;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();

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
  amount: { type: Number, required: true, min: 0 },
  period: { type: String, required: true, maxlength: 10 },
  sourceReference: { type: String, required: true, maxlength: 200 },
  createdAt: { type: Date, default: Date.now }
}).index({ operationId: 1, userId: 1 }, { unique: true }));

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
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function adminSession(req, res, next) {
  const token = parseCookies(req.headers.cookie).admin_session;
  const expiresAt = token && adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  next();
}
function passwordMatches(candidate) {
  if (!ADMIN_PASSWORD || typeof candidate !== 'string') return false;
  const expected = Buffer.from(ADMIN_PASSWORD);
  const supplied = Buffer.from(candidate);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}
function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000_000) return null;
  const cents = Math.round(number * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? BigInt(cents) : null;
}
function buildProfitPlan(users, netProfitCents) {
  const eligible = users.map(user => {
    const cents = Math.round(Number(user.balance) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error('Capital amount is outside supported precision');
    return { user, capitalCents: BigInt(cents) };
  }).filter(entry => entry.capitalCents > 0n);
  const totalCapitalCents = eligible.reduce((sum, entry) => sum + entry.capitalCents, 0n);
  if (!eligible.length || totalCapitalCents <= 0n) return null;
  if (totalCapitalCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Aggregate capital is outside supported precision');
  const rows = eligible.map(entry => {
    const product = netProfitCents * entry.capitalCents;
    return { ...entry, amountCents: product / totalCapitalCents, remainder: product % totalCapitalCents };
  });
  const assigned = rows.reduce((sum, row) => sum + row.amountCents, 0n);
  const centsLeft = Number(netProfitCents - assigned);
  const ranked = [...rows].sort((a, b) => a.remainder === b.remainder ? String(a.user._id).localeCompare(String(b.user._id)) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; i < centsLeft; i++) ranked[i].amountCents += 1n;
  return {
    totalCapitalCents,
    netProfitCents,
    allocations: rows.map(row => ({
      userId: row.user._id,
      username: row.user.username,
      capitalCents: row.capitalCents,
      amountCents: row.amountCents,
      sharePercent: Number((row.capitalCents * 1_000_000n + totalCapitalCents / 2n) / totalCapitalCents) / 10_000
    }))
  };
}
function profitFingerprint(plan, period, sourceReference) {
  const snapshot = plan.allocations.map(row => [String(row.userId), row.capitalCents.toString()]).sort((a, b) => a[0].localeCompare(b[0]));
  return crypto.createHash('sha256').update(JSON.stringify({ netProfitCents: plan.netProfitCents.toString(), period, sourceReference, snapshot })).digest('hex');
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
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (isReferral) {
      const invited = await User.findOne({ username: referredUsername.trim() }).select('_id username');
      if (!invited) return res.status(400).json({ success: false, error: 'Referred account must already exist' });
      const existing = await Request.exists({ type: 'referral_reward', referredUsername: invited.username });
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
      referredUsername: isReferral ? referredUsername.trim() : '',
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

app.post('/api/admin/profit-distribution/preview', adminSession, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const netProfitCents = toCents(req.body?.realizedProfit);
  const period = typeof req.body?.period === 'string' ? req.body.period.trim() : '';
  const sourceReference = typeof req.body?.sourceReference === 'string' ? req.body.sourceReference.trim() : '';
  if (!netProfitCents || !/^\d{4}-\d{2}-\d{2}$/.test(period) || sourceReference.length < 4 || sourceReference.length > 200) {
    return res.status(400).json({ success: false, error: 'Enter a valid realized net profit, period, and source report reference' });
  }
  try {
    const sourceKey = profitSourceKey(period, sourceReference);
    if (await ProfitDistribution.exists({ sourceKey })) return res.status(409).json({ success: false, error: 'This report reference has already been distributed for that period' });
    const users = await User.find({ balance: { $gt: 0 } }).select('_id username balance').lean();
    const plan = buildProfitPlan(users, netProfitCents);
    if (!plan) return res.status(400).json({ success: false, error: 'No users with positive capital are eligible for distribution' });
    return res.json({
      success: true,
      preview: {
        fingerprint: profitFingerprint(plan, period, sourceReference),
        realizedProfit: moneyFromCents(plan.netProfitCents),
        totalCapital: moneyFromCents(plan.totalCapitalCents),
        eligibleUsers: plan.allocations.length,
        period,
        sourceReference,
        allocations: plan.allocations.map(row => ({
          username: row.username,
          capital: moneyFromCents(row.capitalCents),
          sharePercent: row.sharePercent,
          amount: moneyFromCents(row.amountCents)
        }))
      }
    });
  } catch (error) {
    console.error('Profit distribution preview failed:', error.message);
    return res.status(500).json({ success: false, error: 'Unable to prepare profit distribution preview' });
  }
});

app.post('/api/admin/profit-distribution/publish', adminSession, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return sendDbUnavailable(res);
  const netProfitCents = toCents(req.body?.realizedProfit);
  const period = typeof req.body?.period === 'string' ? req.body.period.trim() : '';
  const sourceReference = typeof req.body?.sourceReference === 'string' ? req.body.sourceReference.trim() : '';
  const operationId = typeof req.body?.operationId === 'string' ? req.body.operationId.trim() : '';
  const fingerprint = typeof req.body?.fingerprint === 'string' ? req.body.fingerprint.trim() : '';
  if (!netProfitCents || !/^\d{4}-\d{2}-\d{2}$/.test(period) || sourceReference.length < 4 || sourceReference.length > 200 || !/^[a-zA-Z0-9-]{16,100}$/.test(operationId) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
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
        else result = { error: 'This report reference was already used for a different distribution', status: 409 };
        return;
      }
      const users = await User.find({ balance: { $gt: 0 } }).select('_id username balance').session(session).lean();
      const plan = buildProfitPlan(users, netProfitCents);
      if (!plan) {
        result = { error: 'No users with positive capital are eligible for distribution', status: 400 };
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
            $push: { history: { type: 'profit_distribution', amount: moneyFromCents(row.amountCents), sharePercent: row.sharePercent, period, sourceReference, operationId, date: createdAt } }
          }
        }
      }));
      await User.bulkWrite(updates, { session, ordered: true });
      await ProfitAllocation.insertMany(allocations, { session, ordered: true });
      const [distribution] = await ProfitDistribution.create([{
        operationId,
        sourceKey,
        fingerprint,
        netProfit: moneyFromCents(plan.netProfitCents),
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

app.post('/api/admin/action-request', adminSession, async (req, res) => {
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

app.post('/api/admin/update-user', adminSession, async (req, res) => {
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
