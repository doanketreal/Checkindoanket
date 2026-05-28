const TOKEN_STORAGE_KEY = 'attendance_auth_token';

let authToken = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
let currentUser = null;
let currentMonthKey = getTodayDateKey().slice(0, 7);
let selectedDate = '';
let calendarDays = [];
let selectedDayRecords = [];
let selectedDaySummary = null;
let dayDataPermission = {
  hasInputPermission: false,
  canManageEditors: false
};

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

const editorManageCardEl = document.getElementById('editorManageCard');
const dataPermissionLabelEl = document.getElementById('dataPermissionLabel');
const editorUsernameInputEl = document.getElementById('editorUsernameInput');
const editorListBodyEl = document.getElementById('editorListBody');
const addEditorBtnEl = document.getElementById('addEditorBtn');
const calculateDayBtnEl = document.getElementById('calculateDayBtn');

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

const keyState = {
  left: false,
  right: false
};

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
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('vi-VN');
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

  document.getElementById('tabCalendar').classList.toggle('active', isCalendar);
  document.getElementById('tabData').classList.toggle('active', isData);
  document.getElementById('tabGame').classList.toggle('active', isGame);

  document.getElementById('calendarPanel').classList.toggle('active', isCalendar);
  document.getElementById('dataPanel').classList.toggle('active', isData);
  document.getElementById('gamePanel').classList.toggle('active', isGame);
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
      renderCalendar();
      await refreshSelectedDateData();
      setStatus(`Đã chọn ${formatDateLabel(selectedDate)}.`);
    });
  });

  updateCalendarActionButtons();
}

function renderDayAttendance() {
  if (!selectedDayRecords.length) {
    dayAttendanceBodyEl.innerHTML = '<tr><td colspan="6">Chưa có ai chấm công ngày này.</td></tr>';
    return;
  }

  dayAttendanceBodyEl.innerHTML = selectedDayRecords
    .map((record) => {
      const canDelete = currentUser?.role === 'admin' || record.username === currentUser?.username;

      return `
      <tr>
        <td>${escapeHtml(record.fullName)}</td>
        <td>${escapeHtml(record.username)}</td>
        <td>${record.gender === 'female' ? 'Nữ' : 'Nam'}</td>
        <td>${escapeHtml(formatDateTime(record.timestamp))}</td>
        <td>${formatCurrency(record.charge || 0)}</td>
        <td>
          ${
            canDelete
              ? `<button class="btn danger mini" data-delete-attendance="${escapeHtml(record.id)}" type="button">Xoá</button>`
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

  renderCalendar();
}

async function loadDayAttendance() {
  if (!selectedDate) {
    selectedDateLabelEl.textContent = 'Chưa chọn ngày.';
    selectedDayRecords = [];
    selectedDaySummary = null;
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

  const data = await httpJson(`/api/day-data?date=${encodeURIComponent(selectedDate)}`);

  dayDataPermission = {
    hasInputPermission: data.hasInputPermission,
    canManageEditors: data.canManageEditors
  };

  dataPermissionLabelEl.textContent = dayDataPermission.hasInputPermission
    ? 'Bạn có quyền nhập dữ liệu.'
    : 'Bạn không có quyền nhập dữ liệu. Chỉ Admin hoặc người được Admin cấp quyền mới nhập được.';

  setDataFormDisabled(!dayDataPermission.hasInputPermission);

  document.getElementById('inputSC').value = data.inputs.SC ?? 0;
  document.getElementById('inputTC').value = data.inputs.TC ?? 0;
  document.getElementById('inputSS').value = data.inputs.SS ?? 0;
  document.getElementById('inputTS').value = data.inputs.TS ?? 0;
  document.getElementById('inputSB').value = data.inputs.SB ?? 0;
  document.getElementById('inputTB').value = data.inputs.TB ?? 0;
  document.getElementById('inputSG').value = data.inputs.SG ?? 0;
  document.getElementById('inputTG').value = data.inputs.TG ?? 0;

  document.getElementById('formulaMaleFixed').value = data.formulas.maleFixed ?? '0';
  document.getElementById('formulaFemaleFixed').value = data.formulas.femaleFixed ?? '0';
  document.getElementById('formulaMaleGuest').value = data.formulas.maleGuest ?? '0';
  document.getElementById('formulaFemaleGuest').value = data.formulas.femaleGuest ?? '0';

  countNCDEl.value = data.summary.NCD ?? 0;
  countNuCDEl.value = data.summary.NuCD ?? 0;

  renderDataSummary(data.summary || {});
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
              ? `<button class="btn danger mini" data-remove-editor="${escapeHtml(item.username)}" type="button">Xoá quyền</button>`
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

async function loadEditorData() {
  const data = await httpJson('/api/data-editors');
  editorManageCardEl.classList.toggle('hidden', !data.canManageEditors);
  renderEditorList(data.editors || [], data.canManageEditors);
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
  const confirmed = window.confirm(`Bạn có chắc muốn xoá quyền nhập dữ liệu của ${username}?`);
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/data-editors/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });

    setStatus('Đã xoá quyền nhập dữ liệu.');
    await loadEditorData();
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

  const confirmed = window.confirm('Bạn có chắc muốn xoá chấm công này không?');
  if (!confirmed) {
    return;
  }

  try {
    await httpJson(`/api/attendance/${encodeURIComponent(recordId)}`, {
      method: 'DELETE'
    });

    setStatus('Đã xoá chấm công thành công.');
    await loadCalendar(currentMonthKey);
    await refreshSelectedDateData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteSelectedDateAttendance() {
  const selected = getSelectedDayInfo();

  if (!selected || !selected.recordId) {
    setStatus('Bạn chưa chấm công ngày này nên không thể xoá.', true);
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

  if (keyState.left) {
    gameState.paddleX -= gameState.paddleSpeed * dt;
  }

  if (keyState.right) {
    gameState.paddleX += gameState.paddleSpeed * dt;
  }

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
    shuttle.vy = -Math.abs(170 + gameState.level * 25);
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
  gameInfoEl.textContent = 'Dùng phím ← → để di chuyển vợt và hứng cầu.';
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

function setupKeyboardForGame() {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      keyState.left = true;
    }

    if (event.key === 'ArrowRight') {
      keyState.right = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft') {
      keyState.left = false;
    }

    if (event.key === 'ArrowRight') {
      keyState.right = false;
    }
  });
}

function setupEvents() {
  document.getElementById('tabCalendar').addEventListener('click', () => switchTab('calendar'));
  document.getElementById('tabData').addEventListener('click', () => switchTab('data'));
  document.getElementById('tabGame').addEventListener('click', () => switchTab('game'));

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

  calculateDayBtnEl.addEventListener('click', calculateDayData);
  addEditorBtnEl.addEventListener('click', addEditor);

  document.getElementById('refreshBtn').addEventListener('click', async () => {
    await refreshAll();
    await loadLeaderboard();
    setStatus('Đã làm mới toàn bộ dữ liệu.');
  });

  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  startGameBtnEl.addEventListener('click', startGame);

  setupKeyboardForGame();
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
