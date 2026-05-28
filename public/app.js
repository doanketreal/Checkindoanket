const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
let currentUser = null;

const authStatusEl = document.getElementById('authStatus');
const statusEl = document.getElementById('status');
const summaryBodyEl = document.getElementById('summaryBody');
const recordsBodyEl = document.getElementById('recordsBody');
const filterEmployeeIdEl = document.getElementById('filterEmployeeId');
const filterDateEl = document.getElementById('filterDate');
const currentUserLabelEl = document.getElementById('currentUserLabel');
const attendanceCardEl = document.getElementById('attendanceCard');
const summaryCardEl = document.getElementById('summaryCard');
const recordsCardEl = document.getElementById('recordsCard');
const recordFiltersEl = document.getElementById('recordFilters');
const logoutBtnEl = document.getElementById('logoutBtn');

function todayInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setAuthStatus(message, isError = false) {
  authStatusEl.textContent = message;
  authStatusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('vi-VN', {
    hour12: false
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAuthToken(token) {
  authToken = token || '';

  if (authToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function updateUiByAuth() {
  const isLoggedIn = Boolean(currentUser);

  attendanceCardEl.classList.toggle('hidden', !isLoggedIn);
  summaryCardEl.classList.toggle('hidden', !isLoggedIn);
  recordsCardEl.classList.toggle('hidden', !isLoggedIn);
  logoutBtnEl.classList.toggle('hidden', !isLoggedIn);

  if (!isLoggedIn) {
    currentUserLabelEl.textContent = '';
    return;
  }

  currentUserLabelEl.textContent = `Dang nhap: ${currentUser.fullName} (${currentUser.employeeId}) - ${currentUser.role}`;

  const isAdmin = currentUser.role === 'admin';
  filterEmployeeIdEl.disabled = !isAdmin;
  recordFiltersEl.classList.toggle('filters-locked', !isAdmin);

  if (!isAdmin) {
    filterEmployeeIdEl.value = currentUser.employeeId;
  }
}

async function httpJson(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || 'Yeu cau that bai.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function renderSummary(summary) {
  if (!summary.length) {
    summaryBodyEl.innerHTML = '<tr><td colspan="5">Chua co du lieu trong ngay.</td></tr>';
    return;
  }

  summaryBodyEl.innerHTML = summary
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.employeeId)}</td>
        <td>${escapeHtml(item.employeeName || '-')}</td>
        <td>${item.totalHoursToday}</td>
        <td>${item.lastAction === 'in' ? 'Check-in' : 'Check-out'}</td>
        <td>${formatDateTime(item.lastActionAt)}</td>
      </tr>`
    )
    .join('');
}

function renderRecords(records) {
  if (!records.length) {
    recordsBodyEl.innerHTML = '<tr><td colspan="6">Khong tim thay du lieu phu hop.</td></tr>';
    return;
  }

  recordsBodyEl.innerHTML = records
    .map(
      (item) => `
      <tr>
        <td>${formatDateTime(item.timestamp)}</td>
        <td>${escapeHtml(item.employeeId)}</td>
        <td>${escapeHtml(item.employeeName || '-')}</td>
        <td>${escapeHtml(item.username || '-')}</td>
        <td>
          <span class="tag ${item.type}">
            ${item.type === 'in' ? 'Check-in' : 'Check-out'}
          </span>
        </td>
        <td>${escapeHtml(item.ip || '-')}</td>
      </tr>`
    )
    .join('');
}

async function refreshSummary() {
  const data = await httpJson('/api/summary/today');
  renderSummary(data.summary || []);
}

async function refreshRecords() {
  const params = new URLSearchParams();
  const employeeId = filterEmployeeIdEl.value.trim();
  const date = filterDateEl.value;

  if (employeeId) {
    params.set('employeeId', employeeId);
  }

  if (date) {
    params.set('date', date);
  }

  const url = params.toString() ? `/api/records?${params.toString()}` : '/api/records';
  const data = await httpJson(url);
  renderRecords(data.records || []);
}

async function refreshAll() {
  await Promise.all([refreshSummary(), refreshRecords()]);
}

async function loadCurrentUser() {
  if (!authToken) {
    currentUser = null;
    updateUiByAuth();
    return;
  }

  try {
    const data = await httpJson('/api/auth/me');
    currentUser = data.user;
    updateUiByAuth();
    setAuthStatus(`Xin chao ${currentUser.fullName}.`);
  } catch {
    setAuthToken('');
    currentUser = null;
    updateUiByAuth();
    setAuthStatus('Phien dang nhap het han. Vui long dang nhap lai.', true);
  }
}

async function handleRegister() {
  const fullName = document.getElementById('registerFullName').value.trim();
  const employeeId = document.getElementById('registerEmployeeId').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;

  if (!fullName || !employeeId || !username || !password) {
    setAuthStatus('Vui long nhap day du thong tin dang ky.', true);
    return;
  }

  setAuthStatus('Dang tao tai khoan...');

  try {
    const data = await httpJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, employeeId, username, password })
    });

    setAuthToken(data.token);
    currentUser = data.user;
    updateUiByAuth();
    setAuthStatus('Dang ky thanh cong va da dang nhap.');
    setStatus('San sang cham cong.');
    await refreshAll();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    setAuthStatus('Vui long nhap username va mat khau.', true);
    return;
  }

  setAuthStatus('Dang dang nhap...');

  try {
    const data = await httpJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    setAuthToken(data.token);
    currentUser = data.user;
    updateUiByAuth();
    setAuthStatus('Dang nhap thanh cong.');
    setStatus('San sang cham cong.');
    await refreshAll();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function handleLogout() {
  try {
    if (authToken) {
      await httpJson('/api/auth/logout', { method: 'POST' });
    }
  } catch {
    // Ignore logout API errors and clear client state anyway.
  }

  setAuthToken('');
  currentUser = null;
  updateUiByAuth();
  setAuthStatus('Da dang xuat.');
  setStatus('Vui long dang nhap de cham cong.');
  summaryBodyEl.innerHTML = '';
  recordsBodyEl.innerHTML = '';
}

async function handleAction(type) {
  if (!currentUser) {
    setStatus('Ban phai dang nhap truoc.', true);
    return;
  }

  setStatus('Dang gui du lieu...');

  try {
    if (type === 'checkin') {
      await httpJson('/api/checkin', {
        method: 'POST',
        body: JSON.stringify({})
      });
      setStatus('Check-in thanh cong.');
    } else {
      await httpJson('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({})
      });
      setStatus('Check-out thanh cong.');
    }

    await refreshAll();
  } catch (error) {
    if (error.status === 401) {
      await handleLogout();
      return;
    }

    setStatus(error.message, true);
  }
}

function setupEvents() {
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  logoutBtnEl.addEventListener('click', handleLogout);

  document.getElementById('checkInBtn').addEventListener('click', () => handleAction('checkin'));
  document.getElementById('checkOutBtn').addEventListener('click', () => handleAction('checkout'));
  document.getElementById('refreshBtn').addEventListener('click', () => refreshAll());
  document.getElementById('filterBtn').addEventListener('click', () => refreshRecords());
}

async function init() {
  filterDateEl.value = todayInputValue();
  setupEvents();
  updateUiByAuth();
  await loadCurrentUser();

  if (!currentUser) {
    setStatus('Vui long dang nhap de cham cong.');
    return;
  }

  try {
    await refreshAll();
  } catch (error) {
    setStatus(`Khong the tai du lieu: ${error.message}`, true);
  }
}

init();
