const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const AUTH_SECRET = String(process.env.AUTH_SECRET || 'please-change-this-secret-in-production');
const TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 7;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const EMPTY_DB = {
  employees: {},
  users: {},
  records: []
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

function toDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeEmployeeId(employeeId) {
  return String(employeeId || '').trim().toUpperCase();
}

function normalizeName(name) {
  return String(name || '').trim();
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortByTimestampAsc(records) {
  return records.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getLastEmployeeAction(records, employeeId) {
  const employeeRecords = sortByTimestampAsc(
    records.filter((record) => record.employeeId === employeeId)
  );

  return employeeRecords.length ? employeeRecords[employeeRecords.length - 1] : null;
}

function isSameLocalDay(isoTimestamp, dayKey) {
  return toDayKey(new Date(isoTimestamp)) === dayKey;
}

function summarizeToday(records, employees) {
  const todayKey = toDayKey(new Date());
  const grouped = new Map();

  for (const record of records) {
    if (!isSameLocalDay(record.timestamp, todayKey)) {
      continue;
    }

    if (!grouped.has(record.employeeId)) {
      grouped.set(record.employeeId, []);
    }

    grouped.get(record.employeeId).push(record);
  }

  const summary = [];

  for (const [employeeId, employeeRecords] of grouped.entries()) {
    const sorted = sortByTimestampAsc(employeeRecords);
    let totalMs = 0;
    let lastCheckIn = null;

    for (const item of sorted) {
      if (item.type === 'in') {
        lastCheckIn = item;
      }

      if (item.type === 'out' && lastCheckIn) {
        const inTime = new Date(lastCheckIn.timestamp).getTime();
        const outTime = new Date(item.timestamp).getTime();

        if (outTime > inTime) {
          totalMs += outTime - inTime;
        }

        lastCheckIn = null;
      }
    }

    const lastRecord = sorted[sorted.length - 1];

    summary.push({
      employeeId,
      employeeName: employees[employeeId]?.name || '',
      totalHoursToday: Number((totalMs / 1000 / 60 / 60).toFixed(2)),
      lastAction: lastRecord.type,
      lastActionAt: lastRecord.timestamp
    });
  }

  return summary.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
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
    employeeId: user.employeeId,
    role: user.role,
    createdAt: user.createdAt
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
    sub: user.username,
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

  if (!payload) {
    return null;
  }

  return db.users[payload.sub] || null;
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

  return {
    employees: parsed.employees && typeof parsed.employees === 'object' ? parsed.employees : {},
    users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
    records: Array.isArray(parsed.records) ? parsed.records : []
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
        reject(new Error('Request body qua lon.'));
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
        reject(new Error('Body JSON khong hop le.'));
      }
    });

    req.on('error', reject);
  });
}

function requireAuth(req, res, db) {
  const user = getAuthenticatedUser(req, db);

  if (!user) {
    sendJson(res, 401, { error: 'Ban chua dang nhap hoac token khong hop le.' });
    return null;
  }

  return user;
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
      const username = normalizeUsername(body.username);
      const password = String(body.password || '');
      const fullName = normalizeName(body.fullName);
      const employeeId = normalizeEmployeeId(body.employeeId);

      if (!isValidUsername(username)) {
        sendJson(res, 400, {
          error: 'Username phai 3-30 ky tu, chi gom chu thuong, so, dau _.'
        });
        return true;
      }

      if (!isValidPassword(password)) {
        sendJson(res, 400, { error: 'Mat khau toi thieu 6 ky tu.' });
        return true;
      }

      if (!employeeId) {
        sendJson(res, 400, { error: 'Vui long nhap ma nhan vien.' });
        return true;
      }

      if (!fullName) {
        sendJson(res, 400, { error: 'Vui long nhap ho ten.' });
        return true;
      }

      const db = await readDb();

      if (db.users[username]) {
        sendJson(res, 409, { error: 'Username da ton tai.' });
        return true;
      }

      const duplicatedEmployee = Object.values(db.users).find(
        (item) => item.employeeId === employeeId
      );

      if (duplicatedEmployee) {
        sendJson(res, 409, { error: 'Ma nhan vien da duoc dang ky tai khoan khac.' });
        return true;
      }

      const { salt, hash } = hashPassword(password);
      const role = Object.keys(db.users).length === 0 ? 'admin' : 'member';
      const newUser = {
        id: generateId(),
        username,
        fullName,
        employeeId,
        passwordSalt: salt,
        passwordHash: hash,
        role,
        createdAt: new Date().toISOString()
      };

      db.users[username] = newUser;
      db.employees[employeeId] = { name: fullName };
      await writeDb(db);

      const token = createToken(newUser);

      sendJson(res, 201, {
        message: 'Dang ky thanh cong.',
        token,
        user: sanitizeUser(newUser)
      });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Khong the dang ky tai khoan.' });
      return true;
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const username = normalizeUsername(body.username);
      const password = String(body.password || '');

      if (!username || !password) {
        sendJson(res, 400, { error: 'Vui long nhap username va mat khau.' });
        return true;
      }

      const db = await readDb();
      const user = db.users[username];

      if (!user || !verifyPassword(password, user)) {
        sendJson(res, 401, { error: 'Sai username hoac mat khau.' });
        return true;
      }

      const token = createToken(user);

      sendJson(res, 200, {
        message: 'Dang nhap thanh cong.',
        token,
        user: sanitizeUser(user)
      });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Khong the dang nhap.' });
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
      sendJson(res, 500, { error: 'Khong the tai thong tin tai khoan.' });
      return true;
    }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    sendJson(res, 200, { message: 'Dang xuat thanh cong.' });
    return true;
  }

  if (pathname === '/api/records' && req.method === 'GET') {
    try {
      const db = await readDb();
      const authUser = requireAuth(req, res, db);

      if (!authUser) {
        return true;
      }

      const employeeId = normalizeEmployeeId(requestUrl.searchParams.get('employeeId'));
      const date = String(requestUrl.searchParams.get('date') || '').trim();

      let records = db.records.slice();

      if (authUser.role !== 'admin') {
        records = records.filter((record) => record.employeeId === authUser.employeeId);
      }

      if (employeeId) {
        records = records.filter((record) => record.employeeId === employeeId);
      }

      if (date) {
        records = records.filter((record) => isSameLocalDay(record.timestamp, date));
      }

      records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      sendJson(res, 200, { records });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Khong the tai du lieu cham cong.' });
      return true;
    }
  }

  if (pathname === '/api/summary/today' && req.method === 'GET') {
    try {
      const db = await readDb();
      const authUser = requireAuth(req, res, db);

      if (!authUser) {
        return true;
      }

      let records = db.records.slice();

      if (authUser.role !== 'admin') {
        records = records.filter((record) => record.employeeId === authUser.employeeId);
      }

      sendJson(res, 200, { summary: summarizeToday(records, db.employees) });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Khong the tai tong hop hom nay.' });
      return true;
    }
  }

  if (pathname === '/api/checkin' && req.method === 'POST') {
    try {
      const db = await readDb();
      const authUser = requireAuth(req, res, db);

      if (!authUser) {
        return true;
      }

      const employeeId = authUser.employeeId;
      const employeeName = authUser.fullName;
      const lastAction = getLastEmployeeAction(db.records, employeeId);

      if (lastAction && lastAction.type === 'in') {
        sendJson(res, 409, {
          error: 'Ban dang o trang thai da check-in, chua check-out.'
        });
        return true;
      }

      db.employees[employeeId] = { name: employeeName };

      const record = {
        id: generateId(),
        employeeId,
        employeeName,
        username: authUser.username,
        type: 'in',
        timestamp: new Date().toISOString(),
        ip: getClientIp(req)
      };

      db.records.push(record);
      await writeDb(db);

      sendJson(res, 201, { message: 'Check-in thanh cong.', record });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Khong the thuc hien check-in.' });
      return true;
    }
  }

  if (pathname === '/api/checkout' && req.method === 'POST') {
    try {
      const db = await readDb();
      const authUser = requireAuth(req, res, db);

      if (!authUser) {
        return true;
      }

      const employeeId = authUser.employeeId;
      const lastAction = getLastEmployeeAction(db.records, employeeId);

      if (!lastAction || lastAction.type !== 'in') {
        sendJson(res, 409, {
          error: 'Ban chua check-in hoac da check-out roi.'
        });
        return true;
      }

      const record = {
        id: generateId(),
        employeeId,
        employeeName: authUser.fullName,
        username: authUser.username,
        type: 'out',
        timestamp: new Date().toISOString(),
        ip: getClientIp(req)
      };

      db.records.push(record);
      await writeDb(db);

      sendJson(res, 201, { message: 'Check-out thanh cong.', record });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Khong the thuc hien check-out.' });
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
      sendJson(res, 500, { error: 'Loi he thong.' });
    }
  });

  server.listen(PORT, () => {
    console.log(`Attendance app is running on http://localhost:${PORT}`);
  });
}

startServer();
