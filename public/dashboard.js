const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
let currentUser = null;
let currentMonthKey = getTodayDateKey().slice(0, 7);
let selectedDate = '';
let calendarDays = [];

const userLabelEl = document.getElementById('userLabel');
const monthLabelEl = document.getElementById('monthLabel');
const calendarGridEl = document.getElementById('calendarGrid');
const statusEl = document.getElementById('status');
const historyBodyEl = document.getElementById('historyBody');
const historyDateFilterEl = document.getElementById('historyDateFilter');
const markAttendanceBtnEl = document.getElementById('markAttendanceBtn');
const deleteAttendanceBtnEl = document.getElementById('deleteAttendanceBtn');

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#1d4ed8';
}

function setAuthToken(token) {
  authToken = token || '';

  if (authToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, authToken);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function formatMonthLabel(monthKey) {
  const [yearText, monthText] = monthKey.split('-');
  return `Tháng ${Number(monthText)} năm ${yearText}`;
}

function formatDateLabel(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('vi-VN', { hour12: false });
}

function getSelectedDayInfo() {
  return calendarDays.find((item) => item.date === selectedDate) || null;
}

function updateActionButtons() {
  const selected = getSelectedDayInfo();
  const hasSelection = Boolean(selected);
  const checked = Boolean(selected?.checked);

  markAttendanceBtnEl.disabled = !hasSelection || checked;
  deleteAttendanceBtnEl.disabled = !hasSelection || !checked;
}

function renderCalendar() {
  monthLabelEl.textContent = formatMonthLabel(currentMonthKey);

  if (!calendarDays.length) {
    calendarGridEl.innerHTML = '<p>Không có dữ liệu lịch.</p>';
    updateActionButtons();
    return;
  }

  calendarGridEl.innerHTML = calendarDays
    .map((day) => {
      const dayNum = Number(day.date.slice(-2));
      const isSelected = day.date === selectedDate;
      const className = [
        'calendar-day',
        isSelected ? 'selected' : '',
        day.checked ? 'checked' : ''
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <button class="${className}" data-date="${day.date}" type="button">
          <span class="day-number">${dayNum}</span>
          <span class="day-text">${day.checked ? 'Đã chấm' : 'Chưa chấm'}</span>
        </button>
      `;
    })
    .join('');

  Array.from(calendarGridEl.querySelectorAll('button[data-date]')).forEach((button) => {
    button.addEventListener('click', () => {
      selectedDate = button.dataset.date || '';
      renderCalendar();
      setStatus(`Đã chọn ${formatDateLabel(selectedDate)}.`);
    });
  });

  updateActionButtons();
}

function renderHistory(records) {
  if (!records.length) {
    historyBodyEl.innerHTML = '<tr><td colspan="6">Chưa có dữ liệu chấm công.</td></tr>';
    return;
  }

  historyBodyEl.innerHTML = records
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.date)}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${escapeHtml(item.username)}</td>
        <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
        <td>${escapeHtml(item.ip || '-')}</td>
        <td>
          <button class="btn danger mini" data-delete-id="${escapeHtml(item.id)}" type="button">Xoá</button>
        </td>
      </tr>`
    )
    .join('');

  Array.from(historyBodyEl.querySelectorAll('button[data-delete-id]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const recordId = button.dataset.deleteId;
      await deleteRecord(recordId);
    });
  });
}

async function loadCurrentUser() {
  const data = await httpJson('/api/auth/me');
  currentUser = data.user;
  userLabelEl.textContent = `Xin chào ${currentUser.fullName} (${currentUser.username}) - ${currentUser.role}`;
}

async function loadCalendar(monthKey = currentMonthKey) {
  const data = await httpJson(`/api/attendance/calendar?month=${encodeURIComponent(monthKey)}`);
  currentMonthKey = data.month;
  calendarDays = Array.isArray(data.days) ? data.days : [];

  if (!selectedDate || !calendarDays.some((item) => item.date === selectedDate)) {
    selectedDate = calendarDays.length ? calendarDays[0].date : '';
  }

  renderCalendar();
}

async function loadHistory() {
  const selectedFilterDate = historyDateFilterEl.value;
  const query = selectedFilterDate ? `?date=${encodeURIComponent(selectedFilterDate)}` : '';
  const data = await httpJson(`/api/attendance${query}`);
  renderHistory(data.records || []);
}

async function refreshAll() {
  await Promise.all([loadCalendar(currentMonthKey), loadHistory()]);
}

async function markAttendance() {
  if (!selectedDate) {
    setStatus('Vui lòng chọn một ngày trước khi chấm công.', true);
    return;
  }

  setStatus('Đang chấm công...');

  try {
    await httpJson('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate })
    });

    setStatus(`Chấm công thành công cho ngày ${formatDateLabel(selectedDate)}.`);
    await refreshAll();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteRecord(recordId) {
  if (!recordId) {
    return;
  }

  const confirmed = window.confirm('Bạn có chắc muốn xoá bản ghi chấm công này không?');

  if (!confirmed) {
    return;
  }

  setStatus('Đang xoá bản ghi...');

  try {
    await httpJson(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE'
    });

    setStatus('Đã xoá chấm công thành công.');
    await refreshAll();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteSelectedDateAttendance() {
  const selected = getSelectedDayInfo();

  if (!selected || !selected.recordId) {
    setStatus('Ngày đã chọn chưa có dữ liệu để xoá.', true);
    return;
  }

  await deleteRecord(selected.recordId);
}

async function handleLogout() {
  try {
    await httpJson('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout API errors.
  }

  setAuthToken('');
  window.location.href = '/';
}

function switchTab(name) {
  const tabCalendar = document.getElementById('tabCalendar');
  const tabHistory = document.getElementById('tabHistory');
  const panelCalendar = document.getElementById('calendarPanel');
  const panelHistory = document.getElementById('historyPanel');

  const isCalendar = name === 'calendar';

  tabCalendar.classList.toggle('active', isCalendar);
  tabHistory.classList.toggle('active', !isCalendar);
  panelCalendar.classList.toggle('active', isCalendar);
  panelHistory.classList.toggle('active', !isCalendar);
}

function shiftMonth(step) {
  const [yearText, monthText] = currentMonthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(year, month - 1 + step, 1);
  const newMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  currentMonthKey = newMonthKey;
  loadCalendar(newMonthKey).catch((error) => {
    setStatus(error.message, true);
  });
}

function setupEvents() {
  document.getElementById('tabCalendar').addEventListener('click', () => switchTab('calendar'));
  document.getElementById('tabHistory').addEventListener('click', () => switchTab('history'));

  document.getElementById('prevMonthBtn').addEventListener('click', () => shiftMonth(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => shiftMonth(1));

  markAttendanceBtnEl.addEventListener('click', markAttendance);
  deleteAttendanceBtnEl.addEventListener('click', deleteSelectedDateAttendance);

  document.getElementById('refreshBtn').addEventListener('click', () => {
    refreshAll().catch((error) => setStatus(error.message, true));
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  historyDateFilterEl.addEventListener('change', () => {
    loadHistory().catch((error) => setStatus(error.message, true));
  });
}

async function init() {
  if (!authToken) {
    window.location.href = '/';
    return;
  }

  setupEvents();

  try {
    await loadCurrentUser();
    historyDateFilterEl.value = getTodayDateKey();
    await refreshAll();
    setStatus('Sẵn sàng chấm công theo lịch.');
  } catch (error) {
    if (error.status === 401) {
      setAuthToken('');
      window.location.href = '/';
      return;
    }

    setStatus(error.message, true);
  }
}

init();
