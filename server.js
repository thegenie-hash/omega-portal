const express      = require('express');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');

const app        = express();
const JWT_SECRET = process.env.JWT_SECRET || 'oa-jwt-secret-omega-algo-2026';
const PORT       = process.env.PORT || 3000;
const DB_FILE    = path.join(__dirname, 'db.json');

// ── JSON "database" ──────────────────────────────
function readDB() {
  if (!fs.existsSync(DB_FILE)) return { users: [], clients: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

// Seed admin on startup
(function seedAdmin() {
  const db = readDB();
  const exists = db.users.find(u => u.email === 'kipsantiago22@gmail.com');
  if (!exists) {
    db.users.push({
      id: nextId(db.users),
      email: 'kipsantiago22@gmail.com',
      password: bcrypt.hashSync('OmegaAdmin2026!', 10),
      name: 'Kip Santiago',
      role: 'admin',
      created_at: new Date().toISOString()
    });
    writeDB(db);
    console.log('Admin seeded');
  }
})();

// ── Middleware ───────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth helpers ─────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies.oa_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// ── Auth routes ──────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db   = readDB();
  const user = db.users.find(u => u.email === email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('oa_token', token, { httpOnly: true, maxAge: 7*24*60*60*1000, sameSite: 'lax' });
  res.json({ ok: true, role: user.role, name: user.name });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('oa_token');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const db   = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

// ── Dashboard ────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req, res) => {
  const db     = readDB();
  const user   = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'admin') return res.json({ role: 'admin' });
  const client = db.clients.find(c => c.user_id === user.id) || null;
  res.json({ role: 'client', name: user.name, email: user.email, client,
    agreement_signed: client ? (client.agreement_signed || false) : false,
    signed_at: client ? (client.signed_at || null) : null });
});

// ── Admin: list clients ──────────────────────────
app.get('/api/admin/clients', requireAdmin, (req, res) => {
  const db = readDB();
  const clients = db.users
    .filter(u => u.role === 'client')
    .map(u => {
      const c = db.clients.find(c => c.user_id === u.id) || {};
      return { id: u.id, email: u.email, name: u.name, created_at: u.created_at,
               firm: c.firm, account_size: c.account_size, equity: c.equity,
               status: c.status, notes: c.notes, updated_at: c.updated_at,
               agreement_signed: c.agreement_signed || false, signed_at: c.signed_at || null, signed_name: c.signed_name || '' };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(clients);
});

// ── Admin: create client ─────────────────────────
app.post('/api/admin/clients', requireAdmin, (req, res) => {
  const { email, name, password, firm, account_size, equity, status, notes } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password required' });
  const db = readDB();
  if (db.users.find(u => u.email === email.trim().toLowerCase()))
    return res.status(409).json({ error: 'Email already exists' });
  const userId = nextId(db.users);
  db.users.push({ id: userId, email: email.trim().toLowerCase(),
    password: bcrypt.hashSync(password, 10), name, role: 'client',
    created_at: new Date().toISOString() });
  db.clients.push({ id: nextId(db.clients), user_id: userId,
    firm: firm || 'Tradeify', account_size: account_size || 25000,
    equity: equity || 0, status: status || 'Active', notes: notes || '',
    updated_at: new Date().toISOString() });
  writeDB(db);
  res.json({ ok: true, id: userId });
});

// ── Admin: update client ─────────────────────────
app.put('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { firm, account_size, equity, status, notes, name } = req.body;
  const uid = parseInt(req.params.id);
  const db  = readDB();
  const user = db.users.find(u => u.id === uid);
  if (user) user.name = name;
  const client = db.clients.find(c => c.user_id === uid);
  if (client) Object.assign(client, { firm, account_size, equity, status, notes, updated_at: new Date().toISOString() });
  writeDB(db);
  res.json({ ok: true });
});

// ── Admin: delete client ─────────────────────────
app.delete('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const uid = parseInt(req.params.id);
  const db  = readDB();
  db.clients = db.clients.filter(c => c.user_id !== uid);
  db.users   = db.users.filter(u => !(u.id === uid && u.role === 'client'));
  writeDB(db);
  res.json({ ok: true });
});

// ── Sign Agreement ──────────────────────────────
app.post('/api/sign-agreement', requireAuth, (req, res) => {
  const { full_name, prop_account, signature_data } = req.body;
  if (!full_name || !signature_data) return res.status(400).json({ error: 'Name and signature required' });
  const db   = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });

  let client = db.clients.find(c => c.user_id === user.id);
  if (!client) {
    client = { id: nextId(db.clients), user_id: user.id, firm: 'Tradeify',
      account_size: 0, equity: 0, status: 'Pending', notes: '', updated_at: new Date().toISOString() };
    db.clients.push(client);
  }

  client.agreement_signed    = true;
  client.signed_at           = new Date().toISOString();
  client.signed_name         = full_name;
  client.signed_prop_account = prop_account || '';
  client.signature_data      = signature_data;
  client.updated_at          = new Date().toISOString();

  writeDB(db);
  res.json({ ok: true, signed_at: client.signed_at });
});

// ── Get signed agreement snapshot ────────────────
app.get('/api/agreement-snapshot', requireAuth, (req, res) => {
  const db     = readDB();
  const user   = db.users.find(u => u.id === req.user.id);
  const client = db.clients.find(c => c.user_id === req.user.id);
  if (!client || !client.agreement_signed) return res.status(404).json({ error: 'No signed agreement found' });
  res.json({
    full_name:      client.signed_name,
    email:          user.email,
    prop_account:   client.signed_prop_account,
    signed_at:      client.signed_at,
    signature_data: client.signature_data
  });
});

// ── Admin: reset password ────────────────────────
app.post('/api/admin/clients/:id/reset-password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const db   = readDB();
  const user = db.users.find(u => u.id === parseInt(req.params.id));
  if (user) user.password = bcrypt.hashSync(password, 10);
  writeDB(db);
  res.json({ ok: true });
});

// ── Reseed route (emergency admin restore) ─────
app.get('/api/reseed-omega-2026', (req, res) => {
  const db = readDB();
  const exists = db.users.find(u => u.email === 'kipsantiago22@gmail.com');
  if (exists) {
    exists.password = bcrypt.hashSync('OmegaAdmin2026!', 10);
    exists.role = 'admin';
    writeDB(db);
    return res.json({ ok: true, message: 'Admin password reset.' });
  }
  db.users.push({
    id: nextId(db.users),
    email: 'kipsantiago22@gmail.com',
    password: bcrypt.hashSync('OmegaAdmin2026!', 10),
    name: 'Kip Santiago',
    role: 'admin',
    created_at: new Date().toISOString()
  });
  writeDB(db);
  res.json({ ok: true, message: 'Admin created.' });
});

// ── Catch-all ────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────
app.listen(PORT, () => console.log(`Omega Portal running on port ${PORT}`));
