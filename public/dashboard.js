const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
let currentUser = null;
let currentMonthKey = getTodayDateKey().slice(0, 7);
let selectedDate = '';
let calendarDays = [];
let selectedDayRecords = [];
let selectedDaySummary = null;
let selectedDayInputs = {
  SB: 0,
  SG: 0
};
let dayDataPermission = {
  hasInputPermission: false,
  canManageEditors: false
};
let fixedMembers = [];
let canDeleteFixedMembers = false;

const userLabelEl = document.getElementById('userLabel');
const monthLabelEl = document.getElementById('monthLabel');
const calendarGridEl = document.getElementById('calendarGrid');
const dayAttendanceBodyEl = document.getElementById('dayAttendanceBody');
const dayTotalRevenueEl = document.getElementById('dayTotalRevenue');
const statusEl = document.getElementById('status');
const selectedDateLabelEl = document.getElementById('selectedDateLabel');
const markAttendanceBtnEl = document.getElementById('markAttendanceBtn');
const deleteAttendanceBtnEl = document.getElementById('deleteAttendanceBtn');
const toggleQrBtnEl = document.getElementById('toggleQrBtn');
const qrWrapEl = document.getElementById('qrWrap');
const exportDateInputEl = document.getElementById('exportDateInput');
const exportExcelBtnEl = document.getElementById('exportExcelBtn');

const editorManageCardEl = document.getElementById('editorManageCard');
const dataPermissionLabelEl = document.getElementById('dataPermissionLabel');
const editorUsernameInputEl = document.getElementById('editorUsernameInput');
const editorListBodyEl = document.getElementById('editorListBody');
const addEditorBtnEl = document.getElementById('addEditorBtn');
const calculateDayBtnEl = document.getElementById('calculateDayBtn');
const copySourceDateInputEl = document.getElementById('copySourceDateInput');
const copyDayDataBtnEl = document.getElementById('copyDayDataBtn');

const inputFieldIds = ['SC', 'TC', 'SS', 'TS', 'SB', 'TB', 'SG', 'TG'];
const formulaFieldIds = ['MaleFixed', 'FemaleFixed', 'MaleGuest', 'FemaleGuest'];

const sumMaleFixedEl = document.getElementById('sumMaleFixed');
const sumFemaleFixedEl = document.getElementById('sumFemaleFixed');
const sumMaleGuestEl = document.getElementById('sumMaleGuest');
const sumFemaleGuestEl = document.getElementById('sumFemaleGuest');
const sumTotalEl = document.getElementById('sumTotal');
const countNCDEl = document.getElementById('countNCD');
const countNuCDEl = document.getElementById('countNuCD');

const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');
const startGameBtnEl = document.getElementById('startGameBtn');
const gameInfoEl = document.getElementById('gameInfo');
const gameScoreEl = document.getElementById('gameScore');
const gameTimeEl = document.getElementById('gameTime');
const gameLevelEl = document.getElementById('gameLevel');
const leaderboardBodyEl = document.getElementById('leaderboardBody');
const fixedMemberBodyEl = document.getElementById('fixedMemberBody');
const fixedMemberSummaryEl = document.getElementById('fixedMemberSummary');

const gameState = {
  running: false,
  rafId: 0,
  scoreSubmitted: false,
  lastTs: 0,
  elapsed: 0,
  score: 0,
  level: 1,
  misses: 0,
  paddleX: 260,
  paddleWidth: 120,
  paddleSpeed: 420,
  shuttle: {
    x: 320,
    y: 50,
    vx: 100,
    vy: 0,
    radius: 10
  }
};

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return '';
  }

  const [yearText, monthText, dayText] = text.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const check = new Date(year, month - 1, day);

  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return '';
  }

  return text;
}

function escapeCsvCell(value) {
  const cell = String(value ?? '');
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
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
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('vi-VN');
}

function formatMonthLabel(monthKey) {
  const [yearText, monthText] = monthKey.split('-');
  return `ThÃƒÂ¡ng ${Number(monthText)} nÃ„Æ’m ${yearText}`;
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
  return new Date(isoString).toLocaleString('vi-VN', {
    hour12: false
  });
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
    const error = new Error(payload.error || 'YÃƒÂªu cÃ¡ÂºÂ§u thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i.');
    error.status = response.status;
    throw error;
  }

  return payload;
}

function switchTab(name) {
  const isCalendar = name === 'calendar';
  const isData = name === 'data';
  const isGame = name === 'game';
  const isFixedMembers = name === 'fixedMembers';

  document.getElementById('tabCalendar').classList.toggle('active', isCalendar);
  document.getElementById('tabData').classList.toggle('active', isData);
  document.getElementById('tabGame').classList.toggle('active', isGame);
  document.getElementById('tabFixedMembers').classList.toggle('active', isFixedMembers);

  document.getElementById('calendarPanel').classList.toggle('active', isCalendar);
  document.getElementById('dataPanel').classList.toggle('active', isData);
  document.getElementById('gamePanel').classList.toggle('active', isGame);
  document.getElementById('fixedMembersPanel').classList.toggle('active', isFixedMembers);

  if (isCalendar) {
    setStatus('San sang cham cong theo lich.');
  } else if (isData) {
    setStatus('San sang nhap du lieu ngay da chon.');
  } else if (isGame) {
    setStatus('Tab 3: Game cau long.');
  } else if (isFixedMembers) {
    setStatus('Tab 4: Danh sach thanh vien co dinh.');
  }
}

function getSelectedDayInfo() {
  return calendarDays.find((item) => item.date === selectedDate) || null;
}

function updateCalendarActionButtons() {
  const selected = getSelectedDayInfo();
  const hasSelection = Boolean(selected);

  markAttendanceBtnEl.disabled = !hasSelection || selected.checked;
  deleteAttendanceBtnEl.disabled = !hasSelection || !selected.checked;
}

function syncDateInputsFromSelectedDate() {
  if (exportDateInputEl) {
    exportDateInputEl.value = selectedDate || '';
  }
}

function buildGuestRows(summary = {}, inputs = {}) {
  const maleGuestCount = Number(inputs.SB || 0);
  const femaleGuestCount = Number(inputs.SG || 0);
  const maleGuestAmount = Number(summary.maleGuestAmount || 0);
  const femaleGuestAmount = Number(summary.femaleGuestAmount || 0);

  const rows = [];

  if (maleGuestCount > 0 || maleGuestAmount > 0) {
    rows.push({
      id: `guest-male-${selectedDate || 'none'}`,
      fullName: 'Nam giao l\u01b0u',
      username: '-',
      gender: 'male',
      timestamp: '',
      charge: maleGuestAmount * Math.max(0, maleGuestCount),
      isGuest: true
    });
  }

  if (femaleGuestCount > 0 || femaleGuestAmount > 0) {
    rows.push({
      id: `guest-female-${selectedDate || 'none'}`,
      fullName: 'N\u1eef giao l\u01b0u',
      username: '-',
      gender: 'female',
      timestamp: '',
      charge: femaleGuestAmount * Math.max(0, femaleGuestCount),
      isGuest: true
    });
  }

  return rows;
}

function renderCalendar() {
  monthLabelEl.textContent = formatMonthLabel(currentMonthKey);

  if (!calendarDays.length) {
    calendarGridEl.innerHTML = '<p>KhÃƒÂ´ng cÃƒÂ³ dÃ¡Â»Â¯ liÃ¡Â»â€¡u lÃ¡Â»â€¹ch.</p>';
    updateCalendarActionButtons();
    return;
  }

  calendarGridEl.innerHTML = calendarDays
    .map((day) => {
      const dayNum = Number(day.date.slice(-2));
      const isSelected = day.date === selectedDate;
      const className = ['calendar-day', isSelected ? 'selected' : '', day.checked ? 'checked' : '']
        .filter(Boolean)
        .join(' ');

      return `
        <button class="${className}" data-date="${day.date}" type="button">
          <span class="day-number">${dayNum}</span>
          <span class="day-text">${day.checked ? 'BÃ¡ÂºÂ¡n Ã„â€˜ÃƒÂ£ chÃ¡ÂºÂ¥m' : 'BÃ¡ÂºÂ¡n chÃ†Â°a chÃ¡ÂºÂ¥m'}</span>
        </button>
      `;
    })
    .join('');

  Array.from(calendarGridEl.querySelectorAll('button[data-date]')).forEach((button) => {
    button.addEventListener('click', async () => {
      selectedDate = button.dataset.date || '';
      syncDateInputsFromSelectedDate();
      renderCalendar();
      await refreshSelectedDateData();
      setStatus(`Ã„ÂÃƒÂ£ chÃ¡Â»Ân ${formatDateLabel(selectedDate)}.`);
    });
  });

  updateCalendarActionButtons();
}

function renderDayAttendance() {
  const guestRows = buildGuestRows(selectedDaySummary || {}, selectedDayInputs || {});
  const displayRows = [...selectedDayRecords, ...guestRows];

  if (!displayRows.length) {
    dayAttendanceBodyEl.innerHTML = '<tr><td colspan="6">Ch\u01b0a c\u00f3 ai ch\u1ea5m c\u00f4ng ng\u00e0y n\u00e0y.</td></tr>';
    return;
  }

  dayAttendanceBodyEl.innerHTML = displayRows
    .map((record) => {
      const canDelete =
        !record.isGuest && (currentUser?.role === 'admin' || record.username === currentUser?.username);
      const timestampText = record.timestamp ? escapeHtml(formatDateTime(record.timestamp)) : '-';

      return `
      <tr>
        <td>${escapeHtml(record.fullName)}</td>
        <td>${escapeHtml(record.username)}</td>
        <td>${record.gender === 'female' ? 'N\u1eef' : 'Nam'}</td>
        <td>${timestampText}</td>
        <td>${formatCurrency(record.charge || 0)}</td>
        <td>
          ${
            canDelete
              ? `<button class="btn danger mini" data-delete-attendance="${escapeHtml(record.id)}" type="button">XoÃ¡</button>`
              : '-'
          }
        </td>
      </tr>`;
    })
    .join('');

  Array.from(dayAttendanceBodyEl.querySelectorAll('button[data-delete-attendance]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const recordId = button.dataset.deleteAttendance;
      await deleteAttendanceById(recordId);
    });
  });
}

function renderDataSummary(summary) {
  sumMaleFixedEl.textContent = formatCurrency(summary.maleFixedAmount || 0);
  sumFemaleFixedEl.textContent = formatCurrency(summary.femaleFixedAmount || 0);
  sumMaleGuestEl.textContent = formatCurrency(summary.maleGuestAmount || 0);
  sumFemaleGuestEl.textContent = formatCurrency(summary.femaleGuestAmount || 0);
  sumTotalEl.textContent = formatCurrency(summary.totalRevenue || 0);
  dayTotalRevenueEl.textContent = `TÃ¡Â»â€¢ng thu ngÃƒÂ y: ${formatCurrency(summary.totalRevenue || 0)} VNÃ„Â`;
}

function setDataFormDisabled(disabled) {
  for (const key of inputFieldIds) {
    document.getElementById(`input${key}`).disabled = disabled;
  }

  for (const key of formulaFieldIds) {
    document.getElementById(`formula${key}`).disabled = disabled;
  }

  calculateDayBtnEl.disabled = disabled;
  copySourceDateInputEl.disabled = disabled;
  copyDayDataBtnEl.disabled = disabled;
}

async function loadCurrentUser() {
  const data = await httpJson('/api/auth/me');
  currentUser = data.user;
  userLabelEl.textContent = `Xin chÃƒÂ o ${currentUser.fullName} (${currentUser.username}) - ${
    currentUser.gender === 'female' ? 'NÃ¡Â»Â¯' : 'Nam'
  } - ${currentUser.role}`;
}

async function loadCalendar(monthKey = currentMonthKey) {
  const data = await httpJson(`/api/attendance/calendar?month=${encodeURIComponent(monthKey)}`);
  currentMonthKey = data.month;
  calendarDays = Array.isArray(data.days) ? data.days : [];

  if (!selectedDate || !calendarDays.some((item) => item.date === selectedDate)) {
    const today = getTodayDateKey();
    selectedDate = calendarDays.some((item) => item.date === today)
      ? today
      : calendarDays[0]?.date || '';
  }
  syncDateInputsFromSelectedDate();
  renderCalendar();
}

async function loadDayAttendance() {
  if (!selectedDate) {
    selectedDateLabelEl.textContent = 'ChÃ†Â°a chÃ¡Â»Ân ngÃƒÂ y.';
    selectedDayRecords = [];
    selectedDaySummary = null;
    selectedDayInputs = { SB: 0, SG: 0 };
    renderDayAttendance();
    return;
  }

  const data = await httpJson(`/api/attendance/day?date=${encodeURIComponent(selectedDate)}`);
  selectedDayRecords = data.records || [];
  selectedDaySummary = data.summary || {};
  selectedDateLabelEl.textContent = `NgÃƒÂ y Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân: ${formatDateLabel(selectedDate)}`;

  renderDayAttendance();
  renderDataSummary(selectedDaySummary);
}

async function loadDayData() {
  if (!selectedDate) {
    return;
  }

  if (!copySourceDateInputEl.value) {
    copySourceDateInputEl.value = selectedDate;
  }

  const data = await httpJson(`/api/day-data?date=${encodeURIComponent(selectedDate)}`);

  dayDataPermission = {
    hasInputPermission: data.hasInputPermission,
    canManageEditors: data.canManageEditors
  };

  dataPermissionLabelEl.textContent = dayDataPermission.hasInputPermission
    ? 'BÃ¡ÂºÂ¡n cÃƒÂ³ quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u.'
    : 'BÃ¡ÂºÂ¡n khÃƒÂ´ng cÃƒÂ³ quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u. ChÃ¡Â»â€° Admin hoÃ¡ÂºÂ·c ngÃ†Â°Ã¡Â»Âi Ã„â€˜Ã†Â°Ã¡Â»Â£c Admin cÃ¡ÂºÂ¥p quyÃ¡Â»Ân mÃ¡Â»â€ºi nhÃ¡ÂºÂ­p Ã„â€˜Ã†Â°Ã¡Â»Â£c.';

  setDataFormDisabled(!dayDataPermission.hasInputPermission);
  applyInputsAndFormulasToForm(data.inputs || {}, data.formulas || {});
  selectedDayInputs = {
    SB: Number(data.inputs?.SB || 0),
    SG: Number(data.inputs?.SG || 0)
  };

  countNCDEl.value = data.summary.NCD ?? 0;
  countNuCDEl.value = data.summary.NuCD ?? 0;

  renderDataSummary(data.summary || {});
  renderDayAttendance();
}

function renderEditorList(editors, canManageEditors) {
  if (!editors.length) {
    editorListBodyEl.innerHTML = '<tr><td colspan="4">ChÃ†Â°a cÃƒÂ³ ai Ã„â€˜Ã†Â°Ã¡Â»Â£c cÃ¡ÂºÂ¥p quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u.</td></tr>';
    return;
  }

  editorListBodyEl.innerHTML = editors
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.username)}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${item.gender === 'female' ? 'NÃ¡Â»Â¯' : 'Nam'}</td>
        <td>
          ${
            canManageEditors
              ? `<button class="btn danger mini" data-remove-editor="${escapeHtml(item.username)}" type="button">XoÃƒÂ¡ quyÃ¡Â»Ân</button>`
              : '-'
          }
        </td>
      </tr>`
    )
    .join('');

  Array.from(editorListBodyEl.querySelectorAll('button[data-remove-editor]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const username = button.dataset.removeEditor;
      await removeEditor(username);
    });
  });
}

function renderFixedMembers(users, allowDelete) {
  const sortedUsers = [...users].sort((a, b) =>
    String(a.fullName || '').localeCompare(String(b.fullName || ''), 'vi', { sensitivity: 'base' })
  );

  const total = sortedUsers.length;
  const femaleCount = sortedUsers.filter((item) => item.gender === 'female').length;
  const maleCount = total - femaleCount;
  fixedMemberSummaryEl.textContent = `T\u1ed5ng ${total} th\u00e0nh vi\u00ean c\u1ed1 \u0111\u1ecbnh (Nam: ${maleCount}, N\u1eef: ${femaleCount}).`;

  if (!sortedUsers.length) {
    fixedMemberBodyEl.innerHTML = '<tr><td colspan="6">Ch\u01b0a c\u00f3 th\u00e0nh vi\u00ean c\u1ed1 \u0111\u1ecbnh n\u00e0o.</td></tr>';
    return;
  }

  fixedMemberBodyEl.innerHTML = sortedUsers
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${escapeHtml(item.username)}</td>
        <td>${item.gender === 'female' ? 'N\u1eef' : 'Nam'}</td>
        <td>${item.role === 'admin' ? 'Admin' : 'Th\u00e0nh vi\u00ean'}</td>
        <td>
          ${
            allowDelete && item.username !== currentUser?.username
              ? `<button class="btn danger mini" data-delete-member="${escapeHtml(item.username)}" type="button">X\u00f3a</button>`
              : '-'
          }
        </td>
      </tr>`
    )
    .join('');

  if (!allowDelete) {
    return;
  }

  Array.from(fixedMemberBodyEl.querySelectorAll('button[data-delete-member]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const username = button.dataset.deleteMember;
      await deleteFixedMember(username);
    });
  });
}

async function loadEditorData() {
  const data = await httpJson('/api/data-editors');
  editorManageCardEl.classList.toggle('hidden', !data.canManageEditors);
  renderEditorList(data.editors || [], data.canManageEditors);
  fixedMembers = Array.isArray(data.users) ? data.users : [];
  canDeleteFixedMembers = Boolean(data.canDeleteMembers);
  renderFixedMembers(fixedMembers, canDeleteFixedMembers);
}

async function addEditor() {
  const username = editorUsernameInputEl.value.trim();

  if (!username) {
    setStatus('Vui lÃƒÂ²ng nhÃ¡ÂºÂ­p username cÃ¡ÂºÂ§n cÃ¡ÂºÂ¥p quyÃ¡Â»Ân.', true);
    return;
  }

  try {
    await httpJson('/api/data-editors', {
      method: 'POST',
      body: JSON.stringify({ username })
    });

    editorUsernameInputEl.value = '';
    setStatus('Ã„ÂÃƒÂ£ cÃ¡ÂºÂ¥p quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
    await loadEditorData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removeEditor(username) {
  const confirmed = window.confirm(`BÃ¡ÂºÂ¡n cÃƒÂ³ chÃ¡ÂºÂ¯c muÃ¡Â»â€˜n xoÃƒÂ¡ quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u cÃ¡Â»Â§a ${username}?`);
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/data-editors/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });

    setStatus('Ã„ÂÃƒÂ£ xoÃƒÂ¡ quyÃ¡Â»Ân nhÃ¡ÂºÂ­p dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
    await loadEditorData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteFixedMember(username) {
  if (!username) {
    return;
  }

  const confirmed = window.confirm(
    `B\u1ea1n c\u00f3 ch\u1eafc mu\u1ed1n x\u00f3a th\u00e0nh vi\u00ean c\u1ed1 \u0111\u1ecbnh ${username}?`
  );
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/fixed-members/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });

    setStatus(`\u0110\u00e3 x\u00f3a th\u00e0nh vi\u00ean c\u1ed1 \u0111\u1ecbnh ${username}.`);
    await refreshAll();
    await loadLeaderboard();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function refreshSelectedDateData() {
  await Promise.all([loadDayAttendance(), loadDayData()]);
}

async function refreshAll() {
  await Promise.all([loadCalendar(currentMonthKey), loadEditorData()]);
  await refreshSelectedDateData();
}

function shiftMonth(step) {
  const [yearText, monthText] = currentMonthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(year, month - 1 + step, 1);
  currentMonthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function markAttendance() {
  if (!selectedDate) {
    setStatus('Vui lÃƒÂ²ng chÃ¡Â»Ân ngÃƒÂ y Ã„â€˜Ã¡Â»Æ’ chÃ¡ÂºÂ¥m cÃƒÂ´ng.', true);
    return;
  }

  try {
    await httpJson('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate })
    });

    setStatus(`Ã„ÂÃƒÂ£ chÃ¡ÂºÂ¥m cÃƒÂ´ng ngÃƒÂ y ${formatDateLabel(selectedDate)}.`);
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteAttendanceById(recordId) {
  if (!recordId) {
    return;
  }

  const confirmed = window.confirm('BÃ¡ÂºÂ¡n cÃƒÂ³ chÃ¡ÂºÂ¯c muÃ¡Â»â€˜n xoÃƒÂ¡ chÃ¡ÂºÂ¥m cÃƒÂ´ng nÃƒÂ y khÃƒÂ´ng?');
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE'
    });

    setStatus('Ã„ÂÃƒÂ£ xoÃƒÂ¡ chÃ¡ÂºÂ¥m cÃƒÂ´ng thÃƒÂ nh cÃƒÂ´ng.');
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteSelectedDateAttendance() {
  const selected = getSelectedDayInfo();

  if (!selected || !selected.recordId) {
    setStatus('BÃ¡ÂºÂ¡n chÃ†Â°a chÃ¡ÂºÂ¥m cÃƒÂ´ng ngÃƒÂ y nÃƒÂ y nÃƒÂªn khÃƒÂ´ng thÃ¡Â»Æ’ xoÃƒÂ¡.', true);
    return;
  }

  await deleteAttendanceById(selected.recordId);
}

function getDayInputsFromForm() {
  return {
    SC: Number(document.getElementById('inputSC').value || 0),
    TC: Number(document.getElementById('inputTC').value || 0),
    SS: Number(document.getElementById('inputSS').value || 0),
    TS: Number(document.getElementById('inputTS').value || 0),
    SB: Number(document.getElementById('inputSB').value || 0),
    TB: Number(document.getElementById('inputTB').value || 0),
    SG: Number(document.getElementById('inputSG').value || 0),
    TG: Number(document.getElementById('inputTG').value || 0)
  };
}

function getDayFormulasFromForm() {
  return {
    maleFixed: document.getElementById('formulaMaleFixed').value.trim() || '0',
    femaleFixed: document.getElementById('formulaFemaleFixed').value.trim() || '0',
    maleGuest: document.getElementById('formulaMaleGuest').value.trim() || '0',
    femaleGuest: document.getElementById('formulaFemaleGuest').value.trim() || '0'
  };
}

function applyInputsAndFormulasToForm(inputs, formulas) {
  document.getElementById('inputSC').value = inputs.SC ?? 0;
  document.getElementById('inputTC').value = inputs.TC ?? 0;
  document.getElementById('inputSS').value = inputs.SS ?? 0;
  document.getElementById('inputTS').value = inputs.TS ?? 0;
  document.getElementById('inputSB').value = inputs.SB ?? 0;
  document.getElementById('inputTB').value = inputs.TB ?? 0;
  document.getElementById('inputSG').value = inputs.SG ?? 0;
  document.getElementById('inputTG').value = inputs.TG ?? 0;

  document.getElementById('formulaMaleFixed').value = formulas.maleFixed ?? '0';
  document.getElementById('formulaFemaleFixed').value = formulas.femaleFixed ?? '0';
  document.getElementById('formulaMaleGuest').value = formulas.maleGuest ?? '0';
  document.getElementById('formulaFemaleGuest').value = formulas.femaleGuest ?? '0';
}

async function calculateDayData() {
  if (!selectedDate) {
    setStatus('Vui lÃƒÂ²ng chÃ¡Â»Ân ngÃƒÂ y trÃ†Â°Ã¡Â»â€ºc khi tÃƒÂ­nh.', true);
    return;
  }

  try {
    await httpJson('/api/day-data/calculate', {
      method: 'POST',
      body: JSON.stringify({
        date: selectedDate,
        inputs: getDayInputsFromForm(),
        formulas: getDayFormulasFromForm()
      })
    });

    setStatus('Ã„ÂÃƒÂ£ tÃƒÂ­nh vÃƒÂ  lÃ†Â°u dÃ¡Â»Â¯ liÃ¡Â»â€¡u ngÃƒÂ y thÃƒÂ nh cÃƒÂ´ng.');
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function copyDayDataFromSource() {
  if (!dayDataPermission.hasInputPermission) {
    setStatus('BÃ¡ÂºÂ¡n khÃƒÂ´ng cÃƒÂ³ quyÃ¡Â»Ân sao chÃƒÂ©p dÃ¡Â»Â¯ liÃ¡Â»â€¡u ngÃƒÂ y.', true);
    return;
  }

  if (!selectedDate) {
    setStatus('Vui lÃƒÂ²ng chÃ¡Â»Ân ngÃƒÂ y Ã„â€˜ÃƒÂ­ch trÃ†Â°Ã¡Â»â€ºc khi sao chÃƒÂ©p.', true);
    return;
  }

  const sourceDate = normalizeDateKey(copySourceDateInputEl.value);

  if (!sourceDate) {
    setStatus('Vui lÃƒÂ²ng chÃ¡Â»Ân ngÃƒÂ y nguÃ¡Â»â€œn hÃ¡Â»Â£p lÃ¡Â»â€¡.', true);
    return;
  }

  try {
    const data = await httpJson(`/api/day-data?date=${encodeURIComponent(sourceDate)}`);
    applyInputsAndFormulasToForm(data.inputs || {}, data.formulas || {});
    setStatus(
      `Ã„ÂÃƒÂ£ sao chÃƒÂ©p dÃ¡Â»Â¯ liÃ¡Â»â€¡u tÃ¡Â»Â« ${formatDateLabel(sourceDate)}. BÃ¡ÂºÂ¥m "TÃƒÂ­nh vÃƒÂ  lÃ†Â°u" Ã„â€˜Ã¡Â»Æ’ ÃƒÂ¡p dÃ¡Â»Â¥ng cho ngÃƒÂ y Ã„â€˜ang chÃ¡Â»Ân.`
    );
  } catch (error) {
    setStatus(`KhÃƒÂ´ng thÃ¡Â»Æ’ sao chÃƒÂ©p dÃ¡Â»Â¯ liÃ¡Â»â€¡u: ${error.message}`, true);
  }
}

async function exportAttendanceExcel() {
  const date = normalizeDateKey(exportDateInputEl.value) || selectedDate;

  if (!date) {
    setStatus('Vui l\u00f2ng ch\u1ecdn ng\u00e0y \u0111\u1ec3 xu\u1ea5t Excel.', true);
    return;
  }

  try {
    const [attendanceData, dayData] = await Promise.all([
      httpJson(`/api/attendance/day?date=${encodeURIComponent(date)}`),
      httpJson(`/api/day-data?date=${encodeURIComponent(date)}`)
    ]);

    const records = Array.isArray(attendanceData.records) ? attendanceData.records : [];
    const summary = attendanceData.summary || {};
    const guestRows = buildGuestRows(summary, dayData.inputs || {});
    const displayRows = [...records, ...guestRows];

    const rows = [];
    rows.push(['Ng\u00e0y', date]);
    rows.push([]);
    rows.push(['STT', 'H\u1ecd t\u00ean', 'Username', 'Gi\u1edbi t\u00ednh', 'Th\u1eddi gian ch\u1ea5m', 'Ph\u1ea3i tr\u1ea3 (VN\u0110)']);

    displayRows.forEach((record, index) => {
      rows.push([
        index + 1,
        record.fullName || '',
        record.username || '',
        record.gender === 'female' ? 'N\u1eef' : 'Nam',
        record.timestamp ? formatDateTime(record.timestamp) : '',
        Number(record.charge || 0)
      ]);
    });

    rows.push([]);
    rows.push(['T\u1ed5ng thu ng\u00e0y (VN\u0110)', Number(summary.totalRevenue || 0)]);

    const csv = `\ufeff${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cham-cong-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    setStatus(`\u0110\u00e3 xu\u1ea5t Excel cho ng\u00e0y ${formatDateLabel(date)}.`);
  } catch (error) {
    setStatus(`Kh\u00f4ng th\u1ec3 xu\u1ea5t Excel: ${error.message}`, true);
  }
}

function toggleQr() {
  qrWrapEl.classList.toggle('hidden');
  toggleQrBtnEl.textContent = qrWrapEl.classList.contains('hidden')
    ? 'Hi\u1ec7n m\u00e3 QR'
    : '\u1ea8n m\u00e3 QR';
}

async function handleLogout() {
  try {
    await httpJson('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore logout errors.
  }

  setAuthToken('');
  window.location.href = '/';
}

function resetShuttle() {
  const angle = (Math.random() * 1.2 - 0.6) * Math.PI;
  const speed = 170 + Math.random() * 40;
  gameState.shuttle.x = 80 + Math.random() * (gameCanvas.width - 160);
  gameState.shuttle.y = 40;
  gameState.shuttle.vx = Math.cos(angle) * speed;
  gameState.shuttle.vy = 80;
}

function drawGame() {
  const { width, height } = gameCanvas;

  gameCtx.clearRect(0, 0, width, height);
  gameCtx.fillStyle = '#f3fbff';
  gameCtx.fillRect(0, 0, width, height);

  gameCtx.strokeStyle = '#a8c4de';
  gameCtx.lineWidth = 2;
  gameCtx.strokeRect(10, 10, width - 20, height - 20);
  gameCtx.beginPath();
  gameCtx.moveTo(width / 2, 10);
  gameCtx.lineTo(width / 2, height - 10);
  gameCtx.stroke();

  const paddleY = height - 26;
  gameCtx.fillStyle = '#1d4ed8';
  gameCtx.fillRect(gameState.paddleX, paddleY, gameState.paddleWidth, 12);
  gameCtx.fillStyle = '#0f172a';
  gameCtx.fillRect(gameState.paddleX + gameState.paddleWidth / 2 - 6, paddleY + 12, 12, 18);

  const shuttle = gameState.shuttle;
  gameCtx.fillStyle = '#f59e0b';
  gameCtx.beginPath();
  gameCtx.arc(shuttle.x, shuttle.y, shuttle.radius, 0, Math.PI * 2);
  gameCtx.fill();

  gameCtx.strokeStyle = '#334155';
  gameCtx.lineWidth = 2;
  for (let i = -2; i <= 2; i += 1) {
    gameCtx.beginPath();
    gameCtx.moveTo(shuttle.x, shuttle.y - shuttle.radius + 1);
    gameCtx.lineTo(shuttle.x + i * 6, shuttle.y - shuttle.radius - 18);
    gameCtx.stroke();
  }

  gameCtx.fillStyle = '#0f172a';
  gameCtx.font = '14px Segoe UI';
  gameCtx.fillText(`BÃ¡Â»Â lÃ¡Â»Â¡: ${gameState.misses}/3`, 20, 32);
}

function updateGame(dt) {
  const shuttle = gameState.shuttle;
  const paddleY = gameCanvas.height - 26;


  gameState.paddleX = Math.max(
    0,
    Math.min(gameCanvas.width - gameState.paddleWidth, gameState.paddleX)
  );

  const difficultyMultiplier = 1 + (gameState.level - 1) * 0.25;
  shuttle.vy += 220 * dt * difficultyMultiplier;
  shuttle.x += shuttle.vx * dt * difficultyMultiplier;
  shuttle.y += shuttle.vy * dt * difficultyMultiplier;

  if (shuttle.x - shuttle.radius < 0 || shuttle.x + shuttle.radius > gameCanvas.width) {
    shuttle.vx *= -1;
  }

  const withinPaddleX =
    shuttle.x >= gameState.paddleX - shuttle.radius &&
    shuttle.x <= gameState.paddleX + gameState.paddleWidth + shuttle.radius;

  if (shuttle.vy > 0 && shuttle.y + shuttle.radius >= paddleY && shuttle.y - shuttle.radius <= paddleY + 12 && withinPaddleX) {
    shuttle.y = paddleY - shuttle.radius - 1;
    shuttle.vy = -Math.abs((170 + gameState.level * 25) * 2);
    shuttle.vx += (Math.random() - 0.5) * 120;
    gameState.score += 1;
  }

  if (shuttle.y - shuttle.radius > gameCanvas.height + 12) {
    gameState.misses += 1;

    if (gameState.misses >= 3) {
      endGame();
      return;
    }

    resetShuttle();
  }
}

function updateGameMeta() {
  gameScoreEl.textContent = String(gameState.score);
  gameTimeEl.textContent = String(Math.floor(gameState.elapsed));
  gameLevelEl.textContent = String(gameState.level);
}

async function submitGameScoreOnce() {
  if (gameState.scoreSubmitted || !currentUser) {
    return;
  }

  gameState.scoreSubmitted = true;

  try {
    await httpJson('/api/game/score', {
      method: 'POST',
      body: JSON.stringify({ score: gameState.score })
    });
  } catch {
    // Ignore score submit failures.
  }

  await loadLeaderboard();
}

function endGame() {
  gameState.running = false;
  if (gameState.rafId) {
    cancelAnimationFrame(gameState.rafId);
    gameState.rafId = 0;
  }
  gameInfoEl.textContent = `KÃ¡ÂºÂ¿t thÃƒÂºc. Ã„ÂiÃ¡Â»Æ’m cÃ¡Â»Â§a bÃ¡ÂºÂ¡n: ${gameState.score}.`;
  submitGameScoreOnce().catch(() => {});
}

function gameLoop(timestamp) {
  if (!gameState.running) {
    return;
  }

  if (!gameState.lastTs) {
    gameState.lastTs = timestamp;
  }

  let dt = (timestamp - gameState.lastTs) / 1000;
  if (dt > 0.05) {
    dt = 0.05;
  }
  gameState.lastTs = timestamp;
  gameState.elapsed += dt;
  gameState.level = Math.floor(gameState.elapsed / 35) + 1;

  updateGame(dt);
  drawGame();
  updateGameMeta();

  if (!gameState.running) {
    return;
  }

  gameState.rafId = requestAnimationFrame(gameLoop);
}

function startGame() {
  if (gameState.rafId) {
    cancelAnimationFrame(gameState.rafId);
  }

  gameState.running = true;
  gameState.scoreSubmitted = false;
  gameState.lastTs = 0;
  gameState.elapsed = 0;
  gameState.score = 0;
  gameState.level = 1;
  gameState.misses = 0;
  gameState.paddleX = (gameCanvas.width - gameState.paddleWidth) / 2;
  resetShuttle();
  gameInfoEl.textContent =
    'Di chuy\u1ec3n chu\u1ed9t (PC) ho\u1eb7c ch\u1ea1m/k\u00e9o tr\u00ean game (di\u1ec7n tho\u1ea1i) \u0111\u1ec3 \u0111i\u1ec1u khi\u1ec3n v\u1ee3t.';
  drawGame();
  updateGameMeta();
  gameState.rafId = requestAnimationFrame(gameLoop);
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard.length) {
    leaderboardBodyEl.innerHTML = '<tr><td colspan="4">ChÃ†Â°a cÃƒÂ³ Ã„â€˜iÃ¡Â»Æ’m nÃƒÂ o.</td></tr>';
    return;
  }

  leaderboardBodyEl.innerHTML = leaderboard
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${escapeHtml(item.username)}</td>
        <td>${item.score}</td>
      </tr>`
    )
    .join('');
}

async function loadLeaderboard() {
  try {
    const data = await httpJson('/api/game/leaderboard');
    renderLeaderboard(data.leaderboard || []);
  } catch (error) {
    setStatus(`KhÃƒÂ´ng tÃ¡ÂºÂ£i Ã„â€˜Ã†Â°Ã¡Â»Â£c bÃ¡ÂºÂ£ng xÃ¡ÂºÂ¿p hÃ¡ÂºÂ¡ng: ${error.message}`, true);
  }
}

function setPaddleByClientX(clientX) {
  const rect = gameCanvas.getBoundingClientRect();
  const ratioX = gameCanvas.width / rect.width;
  const x = (clientX - rect.left) * ratioX;
  gameState.paddleX = x - gameState.paddleWidth / 2;
  gameState.paddleX = Math.max(0, Math.min(gameCanvas.width - gameState.paddleWidth, gameState.paddleX));
}

function setupPointerControlsForGame() {
  gameCanvas.addEventListener('pointermove', (event) => {
    setPaddleByClientX(event.clientX);
  });

  gameCanvas.addEventListener('pointerdown', (event) => {
    if (typeof gameCanvas.setPointerCapture === 'function') {
      gameCanvas.setPointerCapture(event.pointerId);
    }
    setPaddleByClientX(event.clientX);
  });

  gameCanvas.addEventListener('pointerenter', (event) => {
    setPaddleByClientX(event.clientX);
  });

  gameCanvas.addEventListener('pointerup', (event) => {
    if (typeof gameCanvas.releasePointerCapture === 'function') {
      try {
        gameCanvas.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore pointer-capture release errors.
      }
    }
  });
}
function setupEvents() {
  document.getElementById('tabCalendar').addEventListener('click', () => switchTab('calendar'));
  document.getElementById('tabData').addEventListener('click', () => switchTab('data'));
  document.getElementById('tabGame').addEventListener('click', () => switchTab('game'));
  document.getElementById('tabFixedMembers').addEventListener('click', () => switchTab('fixedMembers'));

  document.getElementById('prevMonthBtn').addEventListener('click', async () => {
    shiftMonth(-1);
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', async () => {
    shiftMonth(1);
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  });

  markAttendanceBtnEl.addEventListener('click', markAttendance);
  deleteAttendanceBtnEl.addEventListener('click', deleteSelectedDateAttendance);
  toggleQrBtnEl.addEventListener('click', toggleQr);
  exportExcelBtnEl.addEventListener('click', exportAttendanceExcel);

  calculateDayBtnEl.addEventListener('click', calculateDayData);
  copyDayDataBtnEl.addEventListener('click', copyDayDataFromSource);
  addEditorBtnEl.addEventListener('click', addEditor);

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshAll();
    await loadLeaderboard();
    setStatus('Ã„ÂÃƒÂ£ lÃƒÂ m mÃ¡Â»â€ºi toÃƒÂ n bÃ¡Â»â„¢ dÃ¡Â»Â¯ liÃ¡Â»â€¡u.');
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  startGameBtnEl.addEventListener('click', startGame);

  setupPointerControlsForGame();
}

async function init() {
  if (!authToken) {
    window.location.href = '/';
    return;
  }

  setupEvents();

  try {
    await loadCurrentUser();
    await refreshAll();
    await loadLeaderboard();
    setStatus('SÃ¡ÂºÂµn sÃƒÂ ng.');
    drawGame();
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



