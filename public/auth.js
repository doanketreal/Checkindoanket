const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';

const authStatusEl = document.getElementById('authStatus');

function setAuthStatus(message, isError = false) {
  authStatusEl.textContent = message;
  authStatusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
}

function setAuthToken(token) {
  authToken = token || '';

  if (authToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
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
    const error = new Error(payload.error || 'Yêu cầu thất bại.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function openDashboardWindow() {
  const popup = window.open('/dashboard.html', '_blank');

  if (!popup) {
    setAuthStatus('Trình duyệt chặn cửa sổ mới. Hãy cho phép pop-up rồi đăng nhập lại.', true);
    return false;
  }

  return true;
}

async function handleRegister() {
  const fullName = document.getElementById('registerFullName').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const gender = document.getElementById('registerGender').value;
  const password = document.getElementById('registerPassword').value;

  if (!fullName || !username || !password || !gender) {
    setAuthStatus('Vui lòng nhập đầy đủ thông tin đăng ký.', true);
    return;
  }

  setAuthStatus('Đang tạo tài khoản...');

  try {
    const data = await httpJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName, username, gender, password })
    });

    setAuthToken(data.token);
    setAuthStatus('Đăng ký thành công. Đang mở cửa sổ chấm công...');
    openDashboardWindow();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    setAuthStatus('Vui lòng nhập username và mật khẩu.', true);
    return;
  }

  setAuthStatus('Đang đăng nhập...');

  try {
    const data = await httpJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    setAuthToken(data.token);
    setAuthStatus('Đăng nhập thành công. Đang mở cửa sổ chấm công...');
    openDashboardWindow();
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function handleResetPassword() {
  const username = document.getElementById('resetUsername').value.trim();
  const resetCode = document.getElementById('resetCode').value.trim();
  const newPassword = document.getElementById('resetNewPassword').value;

  if (!username || !resetCode || !newPassword) {
    setAuthStatus('Vui lòng nhập đủ thông tin đổi mật khẩu.', true);
    return;
  }

  setAuthStatus('Đang đổi mật khẩu...');

  try {
    const data = await httpJson('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, resetCode, newPassword })
    });

    setAuthStatus(data.message || 'Đổi mật khẩu thành công.');
  } catch (error) {
    setAuthStatus(error.message, true);
  }
}

async function checkExistingSession() {
  if (!authToken) {
    return;
  }

  try {
    await httpJson('/api/auth/me');
    window.location.href = '/dashboard.html';
  } catch {
    setAuthToken('');
  }
}

function setupEvents() {
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('resetPasswordBtn').addEventListener('click', handleResetPassword);
}

async function init() {
  setupEvents();
  await checkExistingSession();
}

init();
