const express      = require('express');
const sqlite3      = require('sqlite3');
const { open }     = require('sqlite');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const path         = require('path');

const app        = express();
const JWT_SECRET = process.env.JWT_SECRET || 'oa-jwt-secret-omega-algo-2026';
const PORT       = process.env.PORT || 3000;

// ── DB init ──────────────────────────────────────
let db;
async function initDB() {
  db = await open({ filename: path.join(__dirname, 'data.db'), driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'client',
      created_at TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS clients (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER UNIQUE NOT NULL REFERENCES users(id),
      firm         TEXT    NOT NULL DEFAULT 'Tradeify',
      account_size INTEGER NOT NULL DEFAULT 25000,
      equity       REAL    NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'Active',
      notes        TEXT    DEFAULT '',
      updated_at   TEXT    DEFAULT (datetime('now'))
    );
  `);

  // Seed admin
  const admin = await db.get('SELECT id FROM users WHERE email = ?', 'kipsantiago22@gmail.com');
  if (!admin) {
    const hash = bcrypt.hashSync('OmegaAdmin2026!', 10);
    await db.run('INSERT INTO users (email, password, name, role) VALUES (?,?,?,?)',
      'kipsantiago22@gmail.com', hash, 'Kip Santiago', 'admin');
    console.log('Admin seeded');
  }
}

// ── Middleware ───────────────────────────────────
app.use(express.json());
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
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const user = await db.get('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase());
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

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// ── Dashboard ────────────────────────────────────
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const user = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'admin') return res.json({ role: 'admin' });
  const client = await db.get('SELECT * FROM clients WHERE user_id = ?', user.id);
  res.json({ role: 'client', name: user.name, email: user.email, client: client || null });
});

// ── Admin: list clients ──────────────────────────
app.get('/api/admin/clients', requireAdmin, async (req, res) => {
  const clients = await db.all(`
    SELECT u.id, u.email, u.name, u.created_at,
           c.firm, c.account_size, c.equity, c.status, c.notes, c.updated_at
    FROM users u LEFT JOIN clients c ON c.user_id = u.id
    WHERE u.role = 'client' ORDER BY u.created_at DESC
  `);
  res.json(clients);
});

// ── Admin: create client ─────────────────────────
app.post('/api/admin/clients', requireAdmin, async (req, res) => {
  const { email, name, password, firm, account_size, equity, status, notes } = req.body;
  if (!email || !name || !password) return res.status(400).json({ error: 'Email, name and password required' });
  const existing = await db.get('SELECT id FROM users WHERE email = ?', email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const r = await db.run('INSERT INTO users (email, password, name, role) VALUES (?,?,?,?)',
    email.trim().toLowerCase(), hash, name, 'client');
  await db.run('INSERT INTO clients (user_id, firm, account_size, equity, status, notes) VALUES (?,?,?,?,?,?)',
    r.lastID, firm || 'Tradeify', account_size || 25000, equity || 0, status || 'Active', notes || '');
  res.json({ ok: true, id: r.lastID });
});

// ── Admin: update client ─────────────────────────
app.put('/api/admin/clients/:id', requireAdmin, async (req, res) => {
  const { firm, account_size, equity, status, notes, name } = req.body;
  const uid = parseInt(req.params.id);
  await db.run('UPDATE users SET name = ? WHERE id = ?', name, uid);
  await db.run(`UPDATE clients SET firm=?, account_size=?, equity=?, status=?, notes=?, updated_at=datetime('now') WHERE user_id=?`,
    firm, account_size, equity, status, notes, uid);
  res.json({ ok: true });
});

// ── Admin: delete client ─────────────────────────
app.delete('/api/admin/clients/:id', requireAdmin, async (req, res) => {
  const uid = parseInt(req.params.id);
  await db.run('DELETE FROM clients WHERE user_id = ?', uid);
  await db.run("DELETE FROM users WHERE id = ? AND role = 'client'", uid);
  res.json({ ok: true });
});

// ── Admin: reset password ────────────────────────
app.post('/api/admin/clients/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });
  const hash = bcrypt.hashSync(password, 10);
  await db.run('UPDATE users SET password = ? WHERE id = ?', hash, parseInt(req.params.id));
  res.json({ ok: true });
});

// ── Catch-all ────────────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`Omega Portal running on port ${PORT}`));
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});
