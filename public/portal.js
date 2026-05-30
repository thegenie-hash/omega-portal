// ── Routing ──────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + id).classList.remove('hidden');
}

function fmt(n) {
  return '$' + Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Init: check session ──────────────────────────
async function init() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) { showPage('login'); return; }
    const user = await res.json();
    if (user.role === 'admin') {
      showPage('admin');
      loadAdminPanel();
    } else {
      showPage('dashboard');
      loadDashboard(user);
    }
  } catch {
    showPage('login');
  }
}

// ── LOGIN ────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.textContent = 'Signing in…'; btn.disabled = true; err.textContent = '';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });
    const data = await res.json();
    if (!res.ok) { err.textContent = data.error || 'Login failed'; return; }
    if (data.role === 'admin') { showPage('admin'); loadAdminPanel(); }
    else { showPage('dashboard'); loadDashboard({ name: data.name }); }
  } catch {
    err.textContent = 'Connection error. Please try again.';
  } finally {
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
});

// ── DASHBOARD ────────────────────────────────────
async function loadDashboard(user) {
  document.getElementById('dashUserName').textContent = user.name;
  document.getElementById('dashGreetName').textContent = user.name.split(' ')[0];

  try {
    const res  = await fetch('/api/dashboard', { credentials: 'include' });
    const data = await res.json();
    const c    = data.client;

    if (!c) {
      document.getElementById('dashNoClient').classList.remove('hidden');
      return;
    }

    document.getElementById('dashCards').classList.remove('hidden');
    document.getElementById('cardEquity').textContent 
