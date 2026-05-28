const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
let currentUser = null;
let currentMonthKey = getTodayDateKey().slice(0, 7);
let selectedDate = '';
let calendarDays = [];
let selectedDayRecords = [];
let selectedDaySummary = null;
let selectedDayInputs = { SB: 0, SG: 0 };
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
const fixedMemberSelectEl = document.getElementById('fixedMemberSelect');
const deleteFixedMemberBtnEl = document.getElementById('deleteFixedMemberBtn');

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

function escapeCsvCell(value) {
  const cell = String(value ?? '');
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('vi-VN');
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
    setStatus('Sẵn sàng chấm công theo lịch.');
  } else if (isData) {
    setStatus('Sẵn sàng nhập dữ liệu ngày đã chọn.');
  } else if (isGame) {
    setStatus('Tab 3: Game cầu lông.');
  } else if (isFixedMembers) {
    setStatus('Tab 4: Danh sách thành viên cố định.');
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
  exportDateInputEl.value = selectedDate || '';
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
      fullName: 'Nam giao lưu',
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
      fullName: 'Nữ giao lưu',
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
    calendarGridEl.innerHTML = '<p>Không có dữ liệu lịch.</p>';
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
          <span class="day-text">${day.checked ? 'Bạn đã chấm' : 'Bạn chưa chấm'}</span>
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
      setStatus(`Đã chọn ${formatDateLabel(selectedDate)}.`);
    });
  });

  updateCalendarActionButtons();
}

function renderDayAttendance() {
  const guestRows = buildGuestRows(selectedDaySummary || {}, selectedDayInputs || {});
  const displayRows = [...selectedDayRecords, ...guestRows];

  if (!displayRows.length) {
    dayAttendanceBodyEl.innerHTML = '<tr><td colspan="6">Chưa có ai chấm công ngày này.</td></tr>';
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
        <td>${record.gender === 'female' ? 'Nữ' : 'Nam'}</td>
        <td>${timestampText}</td>
        <td>${formatCurrency(record.charge || 0)}</td>
        <td>
          ${
            canDelete
              ? `<button class="btn danger mini" data-delete-attendance="${escapeHtml(record.id)}" type="button">Xóa</button>`
              : '-'
          }
        </td>
      </tr>`;
    })
    .join('');

  Array.from(dayAttendanceBodyEl.querySelectorAll('button[data-delete-attendance]')).forEach((button) => {
    button.addEventListener('click', async () => {
      await deleteAttendanceById(button.dataset.deleteAttendance);
    });
  });
}

function renderDataSummary(summary) {
  sumMaleFixedEl.textContent = formatCurrency(summary.maleFixedAmount || 0);
  sumFemaleFixedEl.textContent = formatCurrency(summary.femaleFixedAmount || 0);
  sumMaleGuestEl.textContent = formatCurrency(summary.maleGuestAmount || 0);
  sumFemaleGuestEl.textContent = formatCurrency(summary.femaleGuestAmount || 0);
  sumTotalEl.textContent = formatCurrency(summary.totalRevenue || 0);
  dayTotalRevenueEl.textContent = `Tổng thu ngày: ${formatCurrency(summary.totalRevenue || 0)} VNĐ`;
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
  userLabelEl.textContent = `Xin chào ${currentUser.fullName} (${currentUser.username}) - ${
    currentUser.gender === 'female' ? 'Nữ' : 'Nam'
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
    selectedDateLabelEl.textContent = 'Chưa chọn ngày.';
    selectedDayRecords = [];
    selectedDaySummary = null;
    selectedDayInputs = { SB: 0, SG: 0 };
    renderDayAttendance();
    return;
  }

  const data = await httpJson(`/api/attendance/day?date=${encodeURIComponent(selectedDate)}`);
  selectedDayRecords = data.records || [];
  selectedDaySummary = data.summary || {};
  selectedDateLabelEl.textContent = `Ngày đã chọn: ${formatDateLabel(selectedDate)}`;

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
    ? 'Bạn có quyền nhập dữ liệu.'
    : 'Bạn không có quyền nhập dữ liệu. Chỉ Admin hoặc người được cấp quyền mới nhập được.';

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
    editorListBodyEl.innerHTML = '<tr><td colspan="4">Chưa có ai được cấp quyền nhập dữ liệu.</td></tr>';
    return;
  }

  editorListBodyEl.innerHTML = editors
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.username)}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${item.gender === 'female' ? 'Nữ' : 'Nam'}</td>
        <td>
          ${
            canManageEditors
              ? `<button class="btn danger mini" data-remove-editor="${escapeHtml(item.username)}" type="button">Xóa quyền</button>`
              : '-'
          }
        </td>
      </tr>`
    )
    .join('');

  Array.from(editorListBodyEl.querySelectorAll('button[data-remove-editor]')).forEach((button) => {
    button.addEventListener('click', async () => {
      await removeEditor(button.dataset.removeEditor);
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
  fixedMemberSummaryEl.textContent = `Tổng ${total} thành viên cố định (Nam: ${maleCount}, Nữ: ${femaleCount}).`;

  const deletableUsers = sortedUsers.filter((item) => item.username !== currentUser?.username);
  fixedMemberSelectEl.innerHTML = deletableUsers.length
    ? deletableUsers
        .map(
          (item) =>
            `<option value="${escapeHtml(item.username)}">${escapeHtml(item.fullName)} (${escapeHtml(
              item.username
            )})</option>`
        )
        .join('')
    : '<option value="">Không có thành viên để xoá</option>';

  fixedMemberSelectEl.disabled = !allowDelete || !deletableUsers.length;
  deleteFixedMemberBtnEl.disabled = !allowDelete || !deletableUsers.length;

  if (!sortedUsers.length) {
    fixedMemberBodyEl.innerHTML = '<tr><td colspan="5">Chưa có thành viên cố định nào.</td></tr>';
    return;
  }

  fixedMemberBodyEl.innerHTML = sortedUsers
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.fullName)}</td>
        <td>${escapeHtml(item.username)}</td>
        <td>${item.gender === 'female' ? 'Nữ' : 'Nam'}</td>
        <td>${item.role === 'admin' ? 'Admin' : 'Thành viên'}</td>
      </tr>`
    )
    .join('');
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
    setStatus('Vui lòng nhập username cần cấp quyền.', true);
    return;
  }

  try {
    await httpJson('/api/data-editors', {
      method: 'POST',
      body: JSON.stringify({ username })
    });

    editorUsernameInputEl.value = '';
    setStatus('Đã cấp quyền nhập dữ liệu.');
    await loadEditorData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removeEditor(username) {
  const confirmed = window.confirm(`Bạn có chắc muốn xóa quyền nhập dữ liệu của ${username}?`);
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/data-editors/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });

    setStatus('Đã xóa quyền nhập dữ liệu.');
    await loadEditorData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteFixedMember(username) {
  const targetUsername = username || fixedMemberSelectEl.value;
  if (!targetUsername) {
    setStatus('Vui lòng chọn thành viên cần xoá.', true);
    return;
  }

  const confirmed = window.confirm(`Bạn có chắc muốn xoá thành viên cố định ${targetUsername}?`);
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/fixed-members/${encodeURIComponent(targetUsername)}`, {
      method: 'DELETE'
    });

    setStatus(`Đã xoá thành viên cố định ${targetUsername}.`);
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
    setStatus('Vui lòng chọn ngày để chấm công.', true);
    return;
  }

  try {
    await httpJson('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate })
    });

    setStatus(`Đã chấm công ngày ${formatDateLabel(selectedDate)}.`);
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

  const confirmed = window.confirm('Bạn có chắc muốn xóa chấm công này không?');
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE'
    });

    setStatus('Đã xóa chấm công thành công.');
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteSelectedDateAttendance() {
  const selected = getSelectedDayInfo();
  if (!selected || !selected.recordId) {
    setStatus('Bạn chưa chấm công ngày này nên không thể xóa.', true);
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
    setStatus('Vui lòng chọn ngày trước khi tính.', true);
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

    setStatus('Đã tính và lưu dữ liệu ngày thành công.');
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function copyDayDataFromSource() {
  if (!dayDataPermission.hasInputPermission) {
    setStatus('Bạn không có quyền sao chép dữ liệu ngày.', true);
    return;
  }

  if (!selectedDate) {
    setStatus('Vui lòng chọn ngày đích trước khi sao chép.', true);
    return;
  }

  const sourceDate = normalizeDateKey(copySourceDateInputEl.value);
  if (!sourceDate) {
    setStatus('Vui lòng chọn ngày nguồn hợp lệ.', true);
    return;
  }

  try {
    const data = await httpJson(`/api/day-data?date=${encodeURIComponent(sourceDate)}`);
    applyInputsAndFormulasToForm(data.inputs || {}, data.formulas || {});
    setStatus(
      `Đã sao chép dữ liệu từ ${formatDateLabel(sourceDate)}. Bấm "Tính và lưu" để áp dụng cho ngày đang chọn.`
    );
  } catch (error) {
    setStatus(`Không thể sao chép dữ liệu: ${error.message}`, true);
  }
}

async function exportAttendanceExcel() {
  const date = normalizeDateKey(exportDateInputEl.value) || selectedDate;
  if (!date) {
    setStatus('Vui lòng chọn ngày để xuất Excel.', true);
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
    rows.push(['Ngày', date]);
    rows.push([]);
    rows.push(['STT', 'Họ tên', 'Username', 'Giới tính', 'Thời gian chấm', 'Phải trả (VNĐ)']);

    displayRows.forEach((record, index) => {
      rows.push([
        index + 1,
        record.fullName || '',
        record.username || '',
        record.gender === 'female' ? 'Nữ' : 'Nam',
        record.timestamp ? formatDateTime(record.timestamp) : '',
        Number(record.charge || 0)
      ]);
    });

    rows.push([]);
    rows.push(['Tổng thu ngày (VNĐ)', Number(summary.totalRevenue || 0)]);

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

    setStatus(`Đã xuất Excel cho ngày ${formatDateLabel(date)}.`);
  } catch (error) {
    setStatus(`Không thể xuất Excel: ${error.message}`, true);
  }
}

function toggleQr() {
  qrWrapEl.classList.toggle('hidden');
  toggleQrBtnEl.textContent = qrWrapEl.classList.contains('hidden') ? 'Hiện mã QR' : 'Ẩn mã QR';
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
  gameCtx.fillText(`Bỏ lỡ: ${gameState.misses}/3`, 20, 32);
}

function updateGame(dt) {
  const shuttle = gameState.shuttle;
  const paddleY = gameCanvas.height - 26;

  gameState.paddleX = Math.max(0, Math.min(gameCanvas.width - gameState.paddleWidth, gameState.paddleX));

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

  if (
    shuttle.vy > 0 &&
    shuttle.y + shuttle.radius >= paddleY &&
    shuttle.y - shuttle.radius <= paddleY + 12 &&
    withinPaddleX
  ) {
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

  gameInfoEl.textContent = `Kết thúc. Điểm của bạn: ${gameState.score}.`;
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
  gameInfoEl.textContent = 'Di chuyển chuột (PC) hoặc chạm/kéo trên game (điện thoại) để điều khiển vợt.';
  drawGame();
  updateGameMeta();

  gameState.rafId = requestAnimationFrame(gameLoop);
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard.length) {
    leaderboardBodyEl.innerHTML = '<tr><td colspan="4">Chưa có điểm nào.</td></tr>';
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
    setStatus(`Không tải được bảng xếp hạng: ${error.message}`, true);
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
  deleteFixedMemberBtnEl.addEventListener('click', () => deleteFixedMember());

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshAll();
    await loadLeaderboard();
    setStatus('Đã làm mới toàn bộ dữ liệu.');
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
    setStatus('Sẵn sàng.');
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
