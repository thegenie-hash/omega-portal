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

    if (!c || (!c.equity && !c.account_size)) {
      document.getElementById('dashNoClient').classList.remove('hidden');
      return;
    }

    document.getElementById('dashCards').classList.remove('hidden');
    document.getElementById('cardEquity').textContent = fmt(c.equity);
    document.getElementById('cardSize').textContent   = fmt(c.account_size);
    document.getElementById('cardFirm').textContent   = c.firm;

    const statusEl = document.getElementById('cardStatus');
    statusEl.textContent = c.status;
    statusEl.className   = 'dash-card-value sm status-pill status-' + c.status;

    if (c.notes && c.notes.trim()) {
      document.getElementById('dashNotes').classList.remove('hidden');
      document.getElementById('notesContent').textContent = c.notes;
    }
  } catch {
    document.getElementById('dashNoClient').classList.remove('hidden');
  }
}

document.getElementById('dashLogout').addEventListener('click', logout);

// ── ADMIN ────────────────────────────────────────
let clients = [];

async function loadAdminPanel() {
  try {
    const res = await fetch('/api/admin/clients', { credentials: 'include' });
    clients   = await res.json();
    renderClientTable();
  } catch {
    document.getElementById('clientTable').innerHTML = '<p class="loading-text">Failed to load clients.</p>';
  }
}

function renderClientTable() {
  const wrap = document.getElementById('clientTable');

  if (!clients.length) {
    wrap.innerHTML = '<p class="empty-table">No clients yet. Click "+ Add Client" to get started.</p>';
    return;
  }

  const rows = clients.map(c => `
    <tr>
      <td data-label="Client"><strong>${esc(c.name)}</strong><br><span style="color:var(--faint);font-size:0.75rem">${esc(c.email)}</span></td>
      <td data-label="Firm">${esc(c.firm || '—')}</td>
      <td data-label="Account Size">${c.account_size ? fmt(c.account_size) : '—'}</td>
      <td data-label="Equity">${c.equity != null ? fmt(c.equity) : '—'}</td>
      <td data-label="Status"><span class="status-pill status-${c.status || 'Pending'}">${esc(c.status || 'Pending')}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn-table" onclick="openEdit(${c.id})">Edit</button>
          <button class="btn-table danger" onclick="deleteClient(${c.id}, '${esc(c.name)}')">Remove</button>
        </div>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="client-table">
      <thead>
        <tr>
          <th>Client</th>
          <th>Firm</th>
          <th>Account Size</th>
          <th>Equity</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Add Client ───────────────────────────────────
document.getElementById('openAddClient').addEventListener('click', () => {
  document.getElementById('modalTitle').textContent = 'Add Client';
  document.getElementById('editUserId').value = '';
  document.getElementById('clientForm').reset();
  document.getElementById('pwLabel').textContent = '(required)';
  document.getElementById('cfPassword').required = true;
  document.getElementById('modalError').classList.add('hidden');
  document.getElementById('clientModal').classList.remove('hidden');
});

function openEdit(userId) {
  const c = clients.find(x => x.id === userId);
  if (!c) return;
  document.getElementById('modalTitle').textContent = 'Edit Client';
  document.getElementById('editUserId').value = userId;
  document.getElementById('cfName').value = c.name || '';
  document.getElementById('cfEmail').value = c.email || '';
  document.getElementById('cfPassword').value = '';
  document.getElementById('cfPassword').required = false;
  document.getElementById('pwLabel').textContent = '(leave blank to keep)';
  document.getElementById('cfFirm').value = c.firm || 'Tradeify';
  document.getElementById('cfAccountSize').value = c.account_size || '';
  document.getElementById('cfEquity').value = c.equity || '';
  document.getElementById('cfStatus').value = c.status || 'Active';
  document.getElementById('cfNotes').value = c.notes || '';
  document.getElementById('modalError').classList.add('hidden');
  document.getElementById('clientModal').classList.remove('hidden');
}
window.openEdit = openEdit;

['closeModal', 'cancelModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('clientModal').classList.add('hidden');
  });
});

document.getElementById('clientForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('saveClientBtn');
  const errEl = document.getElementById('modalError');
  const userId = document.getElementById('editUserId').value;
  const isEdit = !!userId;

  btn.textContent = 'Saving…'; btn.disabled = true;
  errEl.classList.add('hidden');

  const payload = {
    name:         document.getElementById('cfName').value,
    email:        document.getElementById('cfEmail').value,
    password:     document.getElementById('cfPassword').value,
    firm:         document.getElementById('cfFirm').value,
    account_size: parseFloat(document.getElementById('cfAccountSize').value) || 0,
    equity:       parseFloat(document.getElementById('cfEquity').value) || 0,
    status:       document.getElementById('cfStatus').value,
    notes:        document.getElementById('cfNotes').value,
  };

  try {
    let res;
    if (isEdit) {
      res = await fetch(`/api/admin/clients/${userId}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (payload.password) {
        await fetch(`/api/admin/clients/${userId}/reset-password`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: payload.password })
        });
      }
    } else {
      res = await fetch('/api/admin/clients', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Save failed'; errEl.classList.remove('hidden'); return; }

    document.getElementById('clientModal').classList.add('hidden');
    loadAdminPanel();
  } catch {
    errEl.textContent = 'Connection error.'; errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Save Client'; btn.disabled = false;
  }
});

async function deleteClient(userId, name) {
  if (!confirm(`Remove ${name}? This cannot be undone.`)) return;
  await fetch(`/api/admin/clients/${userId}`, { method: 'DELETE', credentials: 'include' });
  loadAdminPanel();
}
window.deleteClient = deleteClient;

// ── Logout ───────────────────────────────────────
async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  showPage('login');
}
document.getElementById('adminLogout').addEventListener('click', logout);

// ── Start ────────────────────────────────────────
init();
