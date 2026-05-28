const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const AUTH_SECRET = String(process.env.AUTH_SECRET || 'please-change-this-secret-in-production');
const RESET_PASSWORD_CODE = String(process.env.RESET_PASSWORD_CODE || 'doanketreal');
const TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 7;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const EMPTY_DB = {
  users: {},
  attendance: []
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function getTodayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function normalizeUsernameInput(username) {
  return String(username || '').trim();
}

function usernameKeyFromInput(username) {
  return normalizeUsernameInput(username).toLowerCase();
}

function normalizeName(name) {
  return String(name || '').trim();
}

function isValidUsername(username) {
  return /^(?=.{3,30}$)[A-Za-z0-9_.-]+$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function isValidFullName(fullName) {
  return typeof fullName === 'string' && fullName.trim().length >= 2 && fullName.trim().length <= 80;
}

function isValidDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const [yearText, monthText, dayText] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const check = new Date(year, month - 1, day);
  return (
    check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day
  );
}

function normalizeDateKey(value) {
  const normalized = String(value || '').trim();
  return isValidDateKey(normalized) ? normalized : '';
}

function normalizeMonthKey(value) {
  const normalized = String(value || '').trim();

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return '';
  }

  const [yearText, monthText] = normalized.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (year < 2000 || year > 3000 || month < 1 || month > 12) {
    return '';
  }

  return normalized;
}

function getDaysInMonth(monthKey) {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  return new Date(year, month, 0).getDate();
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt
  };
}

function sanitizeAttendanceRecord(record) {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    date: record.date,
    timestamp: record.timestamp,
    ip: record.ip
  };
}

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) {
    return false;
  }

  const computedHash = crypto.scryptSync(password, user.passwordSalt, 64).toString('hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(user.passwordHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}

function base64UrlEncode(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function base64UrlDecode(text) {
  return Buffer.from(text, 'base64url').toString('utf8');
}

function signTokenPart(headerEncoded, payloadEncoded) {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest('base64url');
}

function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.usernameKey,
    role: user.role,
    exp: now + TOKEN_EXPIRES_SECONDS
  };

  const headerEncoded = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPart(headerEncoded, payloadEncoded);

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [headerEncoded, payloadEncoded, signature] = parts;
  const expectedSignature = signTokenPart(headerEncoded, payloadEncoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded));

    if (!payload.sub || !payload.exp) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);

    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }

  return authHeader.slice(7).trim();
}

function getAuthenticatedUser(req, db) {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  const payload = verifyToken(token);

  if (!payload?.sub) {
    return null;
  }

  return db.users[payload.sub] || null;
}

function getUserRecordForDate(db, usernameKey, dateKey) {
  return db.attendance.find((record) => record.usernameKey === usernameKey && record.date === dateKey) || null;
}

function convertLegacyAttendanceIfNeeded(parsed) {
  if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
    return [];
  }

  const converted = [];
  const uniqueMap = new Set();

  for (const item of parsed.records) {
    const username = normalizeUsernameInput(item.username);
    const usernameKey = usernameKeyFromInput(username);

    if (!usernameKey || !item.timestamp) {
      continue;
    }

    const date = normalizeDateKey(String(item.timestamp).slice(0, 10));

    if (!date) {
      continue;
    }

    const mapKey = `${usernameKey}::${date}`;

    if (uniqueMap.has(mapKey)) {
      continue;
    }

    uniqueMap.add(mapKey);

    converted.push({
      id: generateId(),
      usernameKey,
      username,
      fullName: normalizeName(item.employeeName || item.fullName || ''),
      date,
      timestamp: item.timestamp,
      ip: item.ip || 'unknown'
    });
  }

  return converted;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const normalizedRaw = raw.replace(/^\uFEFF/, '');

  if (!normalizedRaw.trim()) {
    return { ...EMPTY_DB };
  }

  const parsed = JSON.parse(normalizedRaw);
  const usersRaw = parsed.users && typeof parsed.users === 'object' ? parsed.users : {};
  const users = {};

  for (const [mapKey, rawUser] of Object.entries(usersRaw)) {
    const inferredUsername = normalizeUsernameInput(rawUser?.username || mapKey);
    const normalizedKey = usernameKeyFromInput(rawUser?.usernameKey || inferredUsername);

    if (!normalizedKey) {
      continue;
    }

    users[normalizedKey] = {
      ...rawUser,
      username: inferredUsername,
      usernameKey: normalizedKey,
      fullName: normalizeName(rawUser?.fullName || rawUser?.employeeName || inferredUsername)
    };
  }

  const attendanceRaw = Array.isArray(parsed.attendance)
    ? parsed.attendance
    : convertLegacyAttendanceIfNeeded(parsed);
  const attendance = attendanceRaw
    .map((item) => {
      const username = normalizeUsernameInput(item?.username);
      const usernameKey = usernameKeyFromInput(item?.usernameKey || username);
      const date = normalizeDateKey(item?.date);

      if (!usernameKey || !date) {
        return null;
      }

      return {
        id: String(item.id || generateId()),
        usernameKey,
        username,
        fullName: normalizeName(item?.fullName || username),
        date,
        timestamp: item?.timestamp || new Date().toISOString(),
        ip: item?.ip || 'unknown'
      };
    })
    .filter(Boolean);

  return {
    users,
    attendance
  };
}

async function writeDb(db) {
  await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();

      if (body.length > 1_000_000) {
        reject(new Error('Request body quá lớn.'));
        req.socket.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Body JSON không hợp lệ.'));
      }
    });

    req.on('error', reject);
  });
}

function requireAuth(req, res, db) {
  const user = getAuthenticatedUser(req, db);

  if (!user) {
    sendJson(res, 401, { error: 'Bạn chưa đăng nhập hoặc token không hợp lệ.' });
    return null;
  }

  return user;
}

function buildCalendarDays(db, user, monthKey) {
  const daysInMonth = getDaysInMonth(monthKey);
  const result = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const existing = getUserRecordForDate(db, user.usernameKey, date);

    result.push({
      date,
      checked: Boolean(existing),
      recordId: existing?.id || null,
      checkedAt: existing?.timestamp || null
    });
  }

  return result;
}

async function handleApi(req, res, requestUrl) {
  const pathname = requestUrl.pathname;

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    return true;
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const usernameInput = normalizeUsernameInput(body.username);
      const usernameKey = usernameKeyFromInput(body.username);
      const fullName = normalizeName(body.fullName);
      const password = String(body.password || '');

      if (!isValidFullName(fullName)) {
        sendJson(res, 400, { error: 'Vui lòng nhập họ tên từ 2 đến 80 ký tự.' });
        return true;
      }

      if (!isValidUsername(usernameInput)) {
        sendJson(res, 400, {
          error: 'Username từ 3-30 ký tự, chỉ gồm chữ/số và . _ -'
        });
        return true;
      }

      if (!isValidPassword(password)) {
        sendJson(res, 400, { error: 'Mật khẩu tối thiểu 6 ký tự.' });
        return true;
      }

      const db = await readDb();

      if (db.users[usernameKey]) {
        sendJson(res, 409, { error: 'Username đã tồn tại.' });
        return true;
      }

      const { salt, hash } = hashPassword(password);
      const role = Object.keys(db.users).length === 0 ? 'admin' : 'member';
      const newUser = {
        id: generateId(),
        username: usernameInput,
        usernameKey,
        fullName,
        passwordSalt: salt,
        passwordHash: hash,
        role,
        createdAt: new Date().toISOString()
      };

      db.users[usernameKey] = newUser;
      await writeDb(db);

      const token = createToken(newUser);
      sendJson(res, 201, {
        message: 'Đăng ký thành công.',
        token,
        user: sanitizeUser(newUser)
      });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể đăng ký tài khoản.' });
      return true;
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const usernameKey = usernameKeyFromInput(body.username);
      const password = String(body.password || '');

      if (!usernameKey || !password) {
        sendJson(res, 400, { error: 'Vui lòng nhập username và mật khẩu.' });
        return true;
      }

      const db = await readDb();
      const user = db.users[usernameKey];

      if (!user || !verifyPassword(password, user)) {
        sendJson(res, 401, { error: 'Sai username hoặc mật khẩu.' });
        return true;
      }

      const token = createToken(user);
      sendJson(res, 200, {
        message: 'Đăng nhập thành công.',
        token,
        user: sanitizeUser(user)
      });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể đăng nhập.' });
      return true;
    }
  }

  if (pathname === '/api/auth/reset-password' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const usernameKey = usernameKeyFromInput(body.username);
      const resetCode = String(body.resetCode || '').trim();
      const newPassword = String(body.newPassword || '');

      if (!usernameKey) {
        sendJson(res, 400, { error: 'Vui lòng nhập username.' });
        return true;
      }

      if (!isValidPassword(newPassword)) {
        sendJson(res, 400, { error: 'Mật khẩu mới tối thiểu 6 ký tự.' });
        return true;
      }

      if (resetCode !== RESET_PASSWORD_CODE) {
        sendJson(res, 403, { error: 'Mã đặt lại mật khẩu không đúng.' });
        return true;
      }

      const db = await readDb();
      const user = db.users[usernameKey];

      if (!user) {
        sendJson(res, 404, { error: 'Không tìm thấy tài khoản.' });
        return true;
      }

      const { salt, hash } = hashPassword(newPassword);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.updatedAt = new Date().toISOString();

      db.users[usernameKey] = user;
      await writeDb(db);

      sendJson(res, 200, { message: 'Đổi mật khẩu thành công. Bạn có thể đăng nhập lại.' });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể đặt lại mật khẩu.' });
      return true;
    }
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      sendJson(res, 200, { user: sanitizeUser(user) });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải thông tin tài khoản.' });
      return true;
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    sendJson(res, 200, { message: 'Đăng xuất thành công.' });
    return true;
  }

  if (pathname === '/api/attendance/calendar' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const requestedMonth = normalizeMonthKey(requestUrl.searchParams.get('month'));
      const month = requestedMonth || getTodayDateKey().slice(0, 7);
      const days = buildCalendarDays(db, user, month);

      sendJson(res, 200, { month, days });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải lịch chấm công.' });
      return true;
    }
  }

  if (pathname === '/api/attendance' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const date = normalizeDateKey(requestUrl.searchParams.get('date'));

      let records = db.attendance.slice();

      if (user.role !== 'admin') {
        records = records.filter((record) => record.usernameKey === user.usernameKey);
      }

      if (date) {
        records = records.filter((record) => record.date === date);
      }

      records.sort((a, b) => {
        const timeDiff = new Date(b.timestamp) - new Date(a.timestamp);
        if (timeDiff !== 0) {
          return timeDiff;
        }

        return b.date.localeCompare(a.date);
      });

      sendJson(res, 200, { records: records.map(sanitizeAttendanceRecord) });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải danh sách chấm công.' });
      return true;
    }
  }

  if (pathname === '/api/attendance' && req.method === 'POST') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const body = await readRequestBody(req);
      const date = normalizeDateKey(body.date);

      if (!date) {
        sendJson(res, 400, { error: 'Ngày chấm công không hợp lệ (YYYY-MM-DD).' });
        return true;
      }

      const existing = getUserRecordForDate(db, user.usernameKey, date);

      if (existing) {
        sendJson(res, 409, { error: 'Ngày này đã được chấm công rồi.' });
        return true;
      }

      const record = {
        id: generateId(),
        usernameKey: user.usernameKey,
        username: user.username,
        fullName: user.fullName,
        date,
        timestamp: new Date().toISOString(),
        ip: getClientIp(req)
      };

      db.attendance.push(record);
      await writeDb(db);

      sendJson(res, 201, { message: 'Chấm công thành công.', record: sanitizeAttendanceRecord(record) });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể chấm công.' });
      return true;
    }
  }

  const deleteMatch = pathname.match(/^\/api\/attendance\/([^/]+)$/);

  if (deleteMatch && req.method === 'DELETE') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const recordId = decodeURIComponent(deleteMatch[1]);
      const index = db.attendance.findIndex((record) => record.id === recordId);

      if (index < 0) {
        sendJson(res, 404, { error: 'Không tìm thấy bản ghi chấm công.' });
        return true;
      }

      const target = db.attendance[index];

      if (user.role !== 'admin' && target.usernameKey !== user.usernameKey) {
        sendJson(res, 403, { error: 'Bạn không có quyền xoá bản ghi này.' });
        return true;
      }

      db.attendance.splice(index, 1);
      await writeDb(db);

      sendJson(res, 200, { message: 'Đã xoá chấm công.' });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể xoá chấm công.' });
      return true;
    }
  }

  return false;
}

async function serveStatic(res, pathname) {
  let safePath = pathname;

  if (safePath === '/') {
    safePath = '/index.html';
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(safePath)));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'Not Found' });
  }
}

async function startServer() {
  await ensureDataFile();

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      const handled = await handleApi(req, res, requestUrl);

      if (handled) {
        return;
      }

      await serveStatic(res, requestUrl.pathname);
    } catch {
      sendJson(res, 500, { error: 'Lỗi hệ thống.' });
    }
  });

  server.listen(PORT, () => {
    console.log(`Attendance app is running on http://localhost:${PORT}`);
  });
}

startServer();
