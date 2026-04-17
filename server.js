/**
 * SDA Agent Portal Backend API
 * Uses only Node.js built-in modules — no npm required
 * 
 * Routes:
 *   POST   /api/admin/login
 *   POST   /api/agent/login
 *   GET    /api/agents
 *   POST   /api/agents
 *   PUT    /api/agents/:id
 *   DELETE /api/agents/:id
 *   GET    /api/agents/:id/transactions
 *   POST   /api/agents/:id/points
 *   GET    /api/referrals
 *   POST   /api/referrals
 *   GET    /api/withdrawals
 *   POST   /api/withdrawals
 *   PUT    /api/withdrawals/:id
 *   GET    /api/payouts
 *   POST   /api/payouts/:agentId/confirm
 *   POST   /api/payouts/:agentId/skip
 *   GET    /api/dashboard/stats
 *   GET    /api/agent/me          (agent-scoped)
 *   PUT    /api/agent/me/bank     (agent-scoped)
 *   GET    /api/agent/me/transactions
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 4000;

// ─── CORS helper ────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ─── Simple JWT-like tokens (HMAC SHA-256) ───────────────────────────────────
const SECRET = 'sda-secret-2025-change-in-prod';
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString());
  } catch { return null; }
}

// ─── In-memory DB ────────────────────────────────────────────────────────────
let DB = {
  agents: [
    { id: '1', name: 'Ebin Alex', email: 'ebin@shaheendigital.in', phone: '9876543210', password: 'agent123', code: 'SHAHEEN-EA47', totalEarned: 8000, available: 3000, refs: 8, status: 'active', joined: '01 Jan 2025', bank: { holder: 'Ebin Alex', acc: '1234567890', ifsc: 'HDFC0001234', bname: 'HDFC Bank', branch: 'MG Road' } },
    { id: '2', name: 'Priya Sharma', email: 'priya@shaheendigital.in', phone: '9876500001', password: 'agent123', code: 'SHAHEEN-PS22', totalEarned: 6000, available: 6000, refs: 6, status: 'active', joined: '15 Jan 2025', bank: { holder: 'Priya Sharma', acc: '9876543210', ifsc: 'ICIC0005678', bname: 'ICICI Bank', branch: 'Andheri' } },
    { id: '3', name: 'Mohammed Faiz', email: 'faiz@shaheendigital.in', phone: '9876500002', password: 'agent123', code: 'SHAHEEN-MF09', totalEarned: 4000, available: 4000, refs: 4, status: 'active', joined: '20 Jan 2025', bank: { holder: 'Mohammed Faiz', acc: '5555666677', ifsc: 'SBIN0001234', bname: 'State Bank', branch: 'Kozhikode' } },
    { id: '4', name: 'Kavya Reddy', email: 'kavya@shaheendigital.in', phone: '9876500003', password: 'agent123', code: 'SHAHEEN-KR31', totalEarned: 3000, available: 3000, refs: 3, status: 'active', joined: '05 Feb 2025', bank: { holder: 'Kavya Reddy', acc: '1122334455', ifsc: 'AXIS0003456', bname: 'Axis Bank', branch: 'Banjara Hills' } },
    { id: '5', name: 'Rajan Nair', email: 'rajan@shaheendigital.in', phone: '9876500004', password: 'agent123', code: 'SHAHEEN-RN14', totalEarned: 2000, available: 500, refs: 2, status: 'active', joined: '10 Feb 2025', bank: { holder: 'Rajan Nair', acc: '6677889900', ifsc: 'CNRB0002345', bname: 'Canara Bank', branch: 'Ernakulam' } },
    { id: '6', name: 'Amit Singh', email: 'amit@shaheendigital.in', phone: '9876500005', password: 'agent123', code: 'SHAHEEN-AS55', totalEarned: 1000, available: 1000, refs: 1, status: 'inactive', joined: '01 Mar 2025', bank: null },
    { id: '7', name: 'Sneha Krishnan', email: 'sneha@shaheendigital.in', phone: '9876500006', password: 'agent123', code: 'SHAHEEN-SK12', totalEarned: 0, available: 0, refs: 0, status: 'active', joined: '14 Apr 2025', bank: null },
  ],
  withdrawals: [
    { id: 'WR001', agentId: '1', agentName: 'Ebin Alex', agentCode: 'SHAHEEN-EA47', pts: 1000, amount: '₹1,000', date: '16 Apr 2025', status: 'pending', bank: { holder: 'Ebin Alex', acc: '1234567890', ifsc: 'HDFC0001234', bname: 'HDFC Bank' } },
    { id: 'WR002', agentId: '3', agentName: 'Mohammed Faiz', agentCode: 'SHAHEEN-MF09', pts: 2000, amount: '₹2,000', date: '16 Apr 2025', status: 'pending', bank: { holder: 'Mohammed Faiz', acc: '5555666677', ifsc: 'SBIN0001234', bname: 'State Bank' } },
    { id: 'WR003', agentId: '4', agentName: 'Kavya Reddy', agentCode: 'SHAHEEN-KR31', pts: 1500, amount: '₹1,500', date: '15 Apr 2025', status: 'pending', bank: { holder: 'Kavya Reddy', acc: '1122334455', ifsc: 'AXIS0003456', bname: 'Axis Bank' } },
    { id: 'WR004', agentId: '2', agentName: 'Priya Sharma', agentCode: 'SHAHEEN-PS22', pts: 2000, amount: '₹2,000', date: '10 Apr 2025', status: 'approved', bank: { holder: 'Priya Sharma', acc: '9876543210', ifsc: 'ICIC0005678', bname: 'ICICI Bank' }, resolvedDate: '11 Apr 2025' },
    { id: 'WR005', agentId: '4', agentName: 'Kavya Reddy', agentCode: 'SHAHEEN-KR31', pts: 1000, amount: '₹1,000', date: '05 Apr 2025', status: 'approved', bank: { holder: 'Kavya Reddy', acc: '1122334455', ifsc: 'AXIS0003456', bname: 'Axis Bank' }, resolvedDate: '06 Apr 2025' },
  ],
  referrals: [
    { id: 'REF001', agentId: '1', studentName: 'Arjun Mehta', studentEmail: 'arjun@email.com', date: '14 Apr 2025', plan: 'SDA Premium (NEET)', paid: '₹5,499', pts: 1000, status: 'paid' },
    { id: 'REF002', agentId: '2', studentName: 'Sneha Iyer', studentEmail: 'sneha@email.com', date: '12 Apr 2025', plan: 'SDA Elite (NEET)', paid: '₹11,499', pts: 1000, status: 'paid' },
    { id: 'REF003', agentId: '3', studentName: 'Rahul Das', studentEmail: 'rahul@email.com', date: '10 Apr 2025', plan: 'SDA Foundation Premium', paid: '₹3,499', pts: 1000, status: 'paid' },
  ],
  transactions: [
    { id: 'TXN001', agentId: '1', date: '14 Apr 2025', desc: 'Referral: Arjun Mehta', subdesc: 'SDA Premium (NEET) purchased', pts: '+1000', money: '+₹1000', status: 'credited' },
  ],
  payouts: [
    { id: 'PAY001', agentId: '5', agentName: 'Rajan Nair', amount: 2000, date: '15 Apr 2025', status: 'completed' },
  ],
  wrCounter: 6,
  txnCounter: 2,
  refCounter: 4,
  agentCounter: 8,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return crypto.randomBytes(4).toString('hex').toUpperCase(); }
function dateStr() { return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function authMiddleware(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  return verifyToken(token);
}
function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function router(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const parts = url.split('/').filter(Boolean); // ['api','agents','1','transactions']
  const method = req.method;

  // ── ADMIN LOGIN ──
  if (method === 'POST' && url === '/api/admin/login') {
    const body = await getBody(req);
    if (body.email === 'admin@shaheendigital.in' && body.password === 'admin2025') {
      return json(res, 200, { token: signToken({ role: 'admin', email: body.email }), role: 'admin' });
    }
    return json(res, 401, { error: 'Invalid credentials' });
  }

  // ── AGENT LOGIN ──
  if (method === 'POST' && url === '/api/agent/login') {
    const body = await getBody(req);
    const agent = DB.agents.find(a => a.email === body.email && a.password === body.password);
    if (!agent) return json(res, 401, { error: 'Invalid credentials' });
    if (agent.status === 'inactive') return json(res, 403, { error: 'Account deactivated. Contact SDA admin.' });
    const { password, ...safe } = agent;
    return json(res, 200, { token: signToken({ role: 'agent', agentId: agent.id }), agent: safe });
  }

  const user = authMiddleware(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  // ══════════════════════════════════════════════════
  // AGENT-SCOPED ROUTES (/api/agent/me/...)
  // ══════════════════════════════════════════════════
  if (parts[1] === 'agent' && parts[2] === 'me') {

    if (!user.agentId) return json(res, 403, { error: 'Agent access only' });
    const me = DB.agents.find(a => a.id === user.agentId);
    if (!me) return json(res, 404, { error: 'Agent not found' });
    const { password, ...safeMe } = me;

    // GET /api/agent/me
    if (method === 'GET' && parts.length === 3) return json(res, 200, { agent: safeMe });

    // PUT /api/agent/me/bank
    if (method === 'PUT' && parts[3] === 'bank') {
      const body = await getBody(req);
      me.bank = { holder: body.holder, acc: body.acc, ifsc: body.ifsc, bname: body.bname, branch: body.branch || '' };
      const { password: _, ...safe } = me;
      return json(res, 200, { agent: safe, message: 'Bank details saved' });
    }

    // GET /api/agent/me/transactions
    if (method === 'GET' && parts[3] === 'transactions') {
      const txns = DB.transactions.filter(t => t.agentId === user.agentId);
      return json(res, 200, { transactions: txns });
    }

    // GET /api/agent/me/referrals
    if (method === 'GET' && parts[3] === 'referrals') {
      const refs = DB.referrals.filter(r => r.agentId === user.agentId);
      return json(res, 200, { referrals: refs });
    }

    // GET /api/agent/me/withdrawals
    if (method === 'GET' && parts[3] === 'withdrawals') {
      const wrs = DB.withdrawals.filter(w => w.agentId === user.agentId);
      return json(res, 200, { withdrawals: wrs });
    }

    // POST /api/agent/me/withdrawals
    if (method === 'POST' && parts[3] === 'withdrawals') {
      const body = await getBody(req);
      const pts = parseInt(body.pts);
      if (!pts || pts < 500) return json(res, 400, { error: 'Minimum 500 points required' });
      if (pts > me.available) return json(res, 400, { error: 'Insufficient points' });
      if (!me.bank) return json(res, 400, { error: 'Bank details not saved' });

      const wr = {
        id: `WR${String(DB.wrCounter++).padStart(3, '0')}`,
        agentId: me.id, agentName: me.name, agentCode: me.code,
        pts, amount: `₹${pts.toLocaleString()}`, date: dateStr(),
        status: 'pending', bank: { ...me.bank }
      };
      DB.withdrawals.unshift(wr);

      const txn = {
        id: `TXN${String(DB.txnCounter++).padStart(3, '0')}`,
        agentId: me.id, date: dateStr(),
        desc: `Withdrawal Request: ${wr.id}`, subdesc: `Bank: ${me.bank.bname}`,
        pts: `-${pts}`, money: `-₹${pts.toLocaleString()}`, status: 'processing'
      };
      DB.transactions.unshift(txn);
      const { password: _, ...safe } = me;
      return json(res, 201, { withdrawal: wr, transaction: txn, agent: safe });
    }

    // POST /api/agent/me/simulate — demo referral
    if (method === 'POST' && parts[3] === 'simulate') {
      const body = await getBody(req);
      const names = ['Priya Nair', 'Rohan Das', 'Sneha Krishnan', 'Aditya Sharma', 'Kavya Reddy', 'Mohammed Faiz'];
      const emails = ['priya@email.com', 'rohan@email.com', 'sneha@email.com', 'aditya@email.com', 'kavya@email.com', 'faiz@email.com'];
      const plans = ['SDA Premium (NEET)', 'SDA Elite (NEET)', 'SDA Foundation Premium (VI-X)', 'SDA Foundation Elite (VI-X)'];
      const paidAmts = ['₹5,499', '₹11,499', '₹3,499', '₹6,499'];
      const idx = Math.floor(Math.random() * 4);
      const nameIdx = Math.floor(Math.random() * names.length);

      const ref = {
        id: `REF${String(DB.refCounter++).padStart(3, '0')}`,
        agentId: me.id, studentName: names[nameIdx], studentEmail: emails[nameIdx],
        date: dateStr(), plan: plans[idx], paid: paidAmts[idx], pts: 1000, status: 'paid'
      };
      DB.referrals.unshift(ref);
      me.available += 1000; me.totalEarned += 1000; me.refs += 1;

      const txn = {
        id: `TXN${String(DB.txnCounter++).padStart(3, '0')}`,
        agentId: me.id, date: dateStr(),
        desc: `Referral: ${names[nameIdx]}`, subdesc: `${plans[idx]} purchased`,
        pts: '+1000', money: '+₹1000', status: 'credited'
      };
      DB.transactions.unshift(txn);
      const { password: _, ...safe } = me;
      return json(res, 200, { referral: ref, transaction: txn, agent: safe });
    }

    return json(res, 404, { error: 'Not found' });
  }

  // ══════════════════════════════════════════════════
  // ADMIN ROUTES — all require admin role
  // ══════════════════════════════════════════════════
  if (user.role !== 'admin') return json(res, 403, { error: 'Admin access required' });

  // ── DASHBOARD STATS ──
  if (method === 'GET' && url === '/api/dashboard/stats') {
    const activeAgents = DB.agents.filter(a => a.status === 'active').length;
    const pendingWR = DB.withdrawals.filter(w => w.status === 'pending');
    const pendingWRTotal = pendingWR.reduce((s, w) => s + w.pts, 0);
    const eligiblePayout = DB.agents.filter(a => a.available >= 500 && a.status === 'active');
    const payoutTotal = eligiblePayout.reduce((s, a) => s + a.available, 0);
    const paidThisMonth = DB.payouts.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
    return json(res, 200, {
      activeAgents, totalAgents: DB.agents.length,
      pendingWithdrawals: pendingWR.length, pendingWithdrawalsTotal: pendingWRTotal,
      payoutDue: payoutTotal, eligibleAgents: eligiblePayout.length,
      paidThisMonth,
      totalReferrals: DB.referrals.length,
    });
  }

  // ── AGENTS LIST ──
  if (method === 'GET' && url === '/api/agents') {
    return json(res, 200, { agents: DB.agents.map(({ password, ...a }) => a) });
  }

  // ── CREATE AGENT ──
  if (method === 'POST' && url === '/api/agents') {
    const body = await getBody(req);
    if (!body.name || !body.email) return json(res, 400, { error: 'Name and email required' });
    if (DB.agents.find(a => a.email === body.email)) return json(res, 409, { error: 'Email already exists' });
    const agent = {
      id: String(DB.agentCounter++), name: body.name, email: body.email,
      phone: body.phone || '', password: body.password || 'agent123',
      code: body.code || `SHAHEEN-${uid().slice(0, 4)}`,
      totalEarned: 0, available: 0, refs: 0, status: 'active',
      joined: dateStr(), bank: null
    };
    DB.agents.push(agent);
    const { password, ...safe } = agent;
    return json(res, 201, { agent: safe });
  }

  // ── SINGLE AGENT ops ──
  if (parts[1] === 'agents' && parts[2]) {
    const agentId = parts[2];
    const agent = DB.agents.find(a => a.id === agentId);

    // GET /api/agents/:id/transactions
    if (method === 'GET' && parts[3] === 'transactions') {
      return json(res, 200, { transactions: DB.transactions.filter(t => t.agentId === agentId) });
    }

    // GET /api/agents/:id/referrals
    if (method === 'GET' && parts[3] === 'referrals') {
      return json(res, 200, { referrals: DB.referrals.filter(r => r.agentId === agentId) });
    }

    // POST /api/agents/:id/points — manual credit/debit
    if (method === 'POST' && parts[3] === 'points') {
      const body = await getBody(req);
      if (!agent) return json(res, 404, { error: 'Agent not found' });
      const pts = parseInt(body.pts);
      if (body.type === 'credit') { agent.available += pts; agent.totalEarned += pts; }
      else { agent.available = Math.max(0, agent.available - pts); }
      const txn = {
        id: `TXN${String(DB.txnCounter++).padStart(3, '0')}`,
        agentId, date: dateStr(),
        desc: `Manual ${body.type}: ${body.reason}`, subdesc: 'By admin',
        pts: body.type === 'credit' ? `+${pts}` : `-${pts}`,
        money: body.type === 'credit' ? `+₹${pts}` : `-₹${pts}`, status: 'credited'
      };
      DB.transactions.unshift(txn);
      const { password, ...safe } = agent;
      return json(res, 200, { agent: safe, transaction: txn });
    }

    if (!agent) return json(res, 404, { error: 'Agent not found' });

    // PUT /api/agents/:id — update
    if (method === 'PUT' && !parts[3]) {
      const body = await getBody(req);
      if (body.status) agent.status = body.status;
      if (body.name) agent.name = body.name;
      if (body.phone) agent.phone = body.phone;
      if (body.code) agent.code = body.code;
      const { password, ...safe } = agent;
      return json(res, 200, { agent: safe });
    }

    // DELETE /api/agents/:id
    if (method === 'DELETE' && !parts[3]) {
      DB.agents = DB.agents.filter(a => a.id !== agentId);
      return json(res, 200, { message: 'Agent deleted' });
    }
  }

  // ── WITHDRAWALS ──
  if (method === 'GET' && url === '/api/withdrawals') {
    return json(res, 200, { withdrawals: DB.withdrawals });
  }

  // PUT /api/withdrawals/:id — approve or reject
  if (method === 'PUT' && parts[1] === 'withdrawals' && parts[2]) {
    const body = await getBody(req);
    const wr = DB.withdrawals.find(w => w.id === parts[2]);
    if (!wr) return json(res, 404, { error: 'Not found' });

    if (body.action === 'approve') {
      wr.status = 'approved'; wr.resolvedDate = dateStr();
      const agent = DB.agents.find(a => a.id === wr.agentId);
      if (agent) agent.available = Math.max(0, agent.available - wr.pts);
      // Update the corresponding processing transaction to 'completed'
      const t = DB.transactions.find(tx => tx.agentId === wr.agentId && tx.desc.includes(wr.id));
      if (t) t.status = 'completed';
      DB.payouts.push({ id: `PAY${uid()}`, agentId: wr.agentId, agentName: wr.agentName, amount: wr.pts, date: dateStr(), status: 'completed', type: 'early' });
    } else if (body.action === 'reject') {
      wr.status = 'rejected'; wr.resolvedDate = dateStr(); wr.rejectReason = body.reason;
      // restore the transaction status
      const t = DB.transactions.find(tx => tx.agentId === wr.agentId && tx.desc.includes(wr.id));
      if (t) t.status = 'rejected';
    }
    return json(res, 200, { withdrawal: wr });
  }

  // ── PAYOUTS ──
  if (method === 'GET' && url === '/api/payouts') {
    return json(res, 200, { payouts: DB.payouts });
  }

  // POST /api/payouts/:agentId/confirm — month-end confirm
  if (method === 'POST' && parts[1] === 'payouts' && parts[3] === 'confirm') {
    const agent = DB.agents.find(a => a.id === parts[2]);
    if (!agent) return json(res, 404, { error: 'Agent not found' });
    if (!agent.bank) return json(res, 400, { error: 'No bank details' });
    const paid = agent.available;
    const payout = { id: `PAY${uid()}`, agentId: agent.id, agentName: agent.name, amount: paid, date: dateStr(), status: 'completed', type: 'month-end', bank: { ...agent.bank } };
    DB.payouts.push(payout);
    const txn = { id: `TXN${String(DB.txnCounter++).padStart(3, '0')}`, agentId: agent.id, date: dateStr(), desc: 'Month-End Payout', subdesc: `Bank: ${agent.bank.bname}`, pts: `-${paid}`, money: `-₹${paid.toLocaleString()}`, status: 'completed' };
    DB.transactions.unshift(txn);
    agent.available = 0;
    const { password, ...safe } = agent;
    return json(res, 200, { payout, agent: safe });
  }

  // POST /api/payouts/:agentId/skip
  if (method === 'POST' && parts[1] === 'payouts' && parts[3] === 'skip') {
    const body = await getBody(req);
    const agent = DB.agents.find(a => a.id === parts[2]);
    if (!agent) return json(res, 404, { error: 'Not found' });
    DB.payouts.push({ id: `PAY${uid()}`, agentId: agent.id, agentName: agent.name, amount: agent.available, date: dateStr(), status: 'skipped', reason: body.reason, type: 'month-end' });
    return json(res, 200, { message: 'Skipped', agentId: agent.id });
  }

  // POST /api/payouts/bulk — mark all with bank as paid
  if (method === 'POST' && url === '/api/payouts/bulk') {
    const eligible = DB.agents.filter(a => a.available >= 500 && a.status === 'active' && a.bank);
    const results = eligible.map(agent => {
      const paid = agent.available;
      const payout = { id: `PAY${uid()}`, agentId: agent.id, agentName: agent.name, amount: paid, date: dateStr(), status: 'completed', type: 'month-end-bulk', bank: { ...agent.bank } };
      DB.payouts.push(payout);
      agent.available = 0;
      return payout;
    });
    return json(res, 200, { payouts: results, count: results.length });
  }

  // ── REFERRALS (admin) ──
  if (method === 'GET' && url === '/api/referrals') {
    return json(res, 200, { referrals: DB.referrals });
  }

  // ── ACTIVITY FEED ──
  if (method === 'GET' && url === '/api/activity') {
    const feed = [];
    DB.transactions.slice(0, 20).forEach(t => {
      const agent = DB.agents.find(a => a.id === t.agentId);
      feed.push({ type: t.pts.startsWith('+') ? 'credit' : 'debit', agentName: agent?.name || 'Unknown', desc: t.desc, time: t.date, amount: t.money });
    });
    return json(res, 200, { feed });
  }

  return json(res, 404, { error: `Route not found: ${method} ${url}` });
}

// ─── Start server ─────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  try {
    // Serve static files (index.html, etc.)
    if (req.url === '/' || req.url === '') {
      const filePath = path.join(__dirname, 'index.html');
      const content = fs.readFileSync(filePath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    }
    if (req.url.endsWith('.html')) {
      const filePath = path.join(__dirname, req.url);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }
    }

    // Handle API routes
    if (req.url.startsWith('/api')) {
      await router(req, res);
      return;
    }

    // 404 for unknown routes
    cors(res);
    json(res, 404, { error: `Not found: ${req.url}` });
  }
  catch (e) { cors(res); json(res, 500, { error: e.message }); }
}).listen(PORT, () => {
  console.log(`✅ SDA API running at http://localhost:${PORT}`);
  console.log(`   Admin login: admin@shaheendigital.in / admin2025`);
  console.log(`   Agent login: ebin@shaheendigital.in / agent123`);
});