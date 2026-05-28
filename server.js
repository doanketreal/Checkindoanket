const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const AUTH_SECRET = String(process.env.AUTH_SECRET || 'please-change-this-secret-in-production');
const RESET_PASSWORD_CODE = String(process.env.RESET_PASSWORD_CODE || 'doanketreal');
const TOKEN_EXPIRES_SECONDS = 60 * 60 * 24 * 30;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'attendance.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const DAY_INPUT_KEYS = ['SC', 'TC', 'SS', 'TS', 'SB', 'TB', 'SG', 'TG'];

const DEFAULT_DAY_INPUTS = {
  SC: 0,
  TC: 0,
  SS: 0,
  TS: 0,
  SB: 0,
  TB: 0,
  SG: 0,
  TG: 0
};

const DEFAULT_DAY_FORMULAS = {
  maleFixed: '0',
  femaleFixed: '0',
  maleGuest: '0',
  femaleGuest: '0'
};

const EMPTY_DB = {
  users: {},
  attendance: [],
  dayConfigs: {},
  dataEditors: [],
  gameScores: []
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

function normalizeGender(gender) {
  const value = String(gender || '').trim().toLowerCase();

  if (['male', 'nam', 'm'].includes(value)) {
    return 'male';
  }

  if (['female', 'nu', 'nữ', 'f'].includes(value)) {
    return 'female';
  }

  return '';
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

function roundMoney(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.ceil(value);
}

function safeNumber(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) {
    return 0;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return 0;
  }

  return num;
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

function hasDataInputPermission(user, db) {
  if (!user) {
    return false;
  }

  if (user.role === 'admin') {
    return true;
  }

  return db.dataEditors.includes(user.usernameKey);
}

function sanitizeUser(user, db) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    gender: user.gender,
    role: user.role,
    createdAt: user.createdAt,
    canInputData: hasDataInputPermission(user, db)
  };
}

function sanitizeAttendanceRecord(record) {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    gender: record.gender,
    date: record.date,
    timestamp: record.timestamp,
    ip: record.ip
  };
}

function sanitizeDayInputs(rawInputs) {
  const inputs = { ...DEFAULT_DAY_INPUTS };

  for (const key of DAY_INPUT_KEYS) {
    inputs[key] = safeNumber(rawInputs?.[key]);
  }

  return inputs;
}

function sanitizeDayFormulas(rawFormulas) {
  return {
    maleFixed: String(rawFormulas?.maleFixed || '').trim() || DEFAULT_DAY_FORMULAS.maleFixed,
    femaleFixed: String(rawFormulas?.femaleFixed || '').trim() || DEFAULT_DAY_FORMULAS.femaleFixed,
    maleGuest: String(rawFormulas?.maleGuest || '').trim() || DEFAULT_DAY_FORMULAS.maleGuest,
    femaleGuest: String(rawFormulas?.femaleGuest || '').trim() || DEFAULT_DAY_FORMULAS.femaleGuest
  };
}

function sanitizeDayConfig(rawConfig) {
  const inputs = sanitizeDayInputs(rawConfig?.inputs || {});
  const formulas = sanitizeDayFormulas(rawConfig?.formulas || {});
  const charges = {};

  if (rawConfig?.charges && typeof rawConfig.charges === 'object') {
    for (const [key, value] of Object.entries(rawConfig.charges)) {
      const usernameKey = usernameKeyFromInput(key);
      if (!usernameKey) {
        continue;
      }
      charges[usernameKey] = roundMoney(safeNumber(value));
    }
  }

  return {
    inputs,
    formulas,
    charges,
    summary: {
      NCD: Number(rawConfig?.summary?.NCD || 0),
      NuCD: Number(rawConfig?.summary?.NuCD || 0),
      maleFixedAmount: roundMoney(Number(rawConfig?.summary?.maleFixedAmount || 0)),
      femaleFixedAmount: roundMoney(Number(rawConfig?.summary?.femaleFixedAmount || 0)),
      maleGuestAmount: roundMoney(Number(rawConfig?.summary?.maleGuestAmount || 0)),
      femaleGuestAmount: roundMoney(Number(rawConfig?.summary?.femaleGuestAmount || 0)),
      totalRevenue: roundMoney(Number(rawConfig?.summary?.totalRevenue || 0))
    },
    updatedBy: normalizeUsernameInput(rawConfig?.updatedBy || ''),
    updatedAt: String(rawConfig?.updatedAt || '')
  };
}

function tokenizeExpression(expression) {
  const tokens = [];
  let i = 0;

  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let start = i;
      let dotCount = 0;

      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        if (expression[i] === '.') {
          dotCount += 1;
        }
        i += 1;
      }

      if (dotCount > 1) {
        throw new Error('Công thức có số không hợp lệ.');
      }

      const text = expression.slice(start, i);
      if (text === '.') {
        throw new Error('Công thức có số không hợp lệ.');
      }

      tokens.push({ type: 'number', value: Number(text) });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let start = i;
      i += 1;

      while (i < expression.length && /[A-Za-z0-9_]/.test(expression[i])) {
        i += 1;
      }

      const identifier = expression.slice(start, i);
      tokens.push({ type: 'identifier', value: identifier });
      continue;
    }

    if ('+-*/()'.includes(ch)) {
      tokens.push({
        type: ch === '(' || ch === ')' ? 'paren' : 'operator',
        value: ch
      });
      i += 1;
      continue;
    }

    throw new Error('Công thức chứa ký tự không hợp lệ.');
  }

  return tokens;
}

function evaluateArithmeticExpression(expression, scope) {
  const normalized = String(expression || '').replace(/'([A-Za-z_][A-Za-z0-9_]*)'/g, '$1').trim();

  if (!normalized) {
    return 0;
  }

  const tokens = tokenizeExpression(normalized);

  if (!tokens.length) {
    return 0;
  }

  const precedence = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    'u+': 3,
    'u-': 3
  };

  const associativity = {
    '+': 'left',
    '-': 'left',
    '*': 'left',
    '/': 'left',
    'u+': 'right',
    'u-': 'right'
  };

  const output = [];
  const ops = [];
  let prevState = 'start';

  for (const token of tokens) {
    if (token.type === 'number' || token.type === 'identifier') {
      output.push(token);
      prevState = 'value';
      continue;
    }

    if (token.type === 'operator') {
      let op = token.value;

      if ((op === '+' || op === '-') && (prevState === 'start' || prevState === 'operator' || prevState === 'leftParen')) {
        op = op === '+' ? 'u+' : 'u-';
      }

      while (ops.length) {
        const top = ops[ops.length - 1];

        if (top.type !== 'operator') {
          break;
        }

        const sameOrHigher =
          associativity[op] === 'left'
            ? precedence[op] <= precedence[top.value]
            : precedence[op] < precedence[top.value];

        if (!sameOrHigher) {
          break;
        }

        output.push(ops.pop());
      }

      ops.push({ type: 'operator', value: op });
      prevState = 'operator';
      continue;
    }

    if (token.type === 'paren' && token.value === '(') {
      ops.push({ type: 'leftParen', value: '(' });
      prevState = 'leftParen';
      continue;
    }

    if (token.type === 'paren' && token.value === ')') {
      let foundLeftParen = false;

      while (ops.length) {
        const top = ops.pop();
        if (top.type === 'leftParen') {
          foundLeftParen = true;
          break;
        }

        output.push(top);
      }

      if (!foundLeftParen) {
        throw new Error('Công thức bị sai dấu ngoặc.');
      }

      prevState = 'value';
    }
  }

  if (prevState === 'operator') {
    throw new Error('Công thức kết thúc không hợp lệ.');
  }

  while (ops.length) {
    const op = ops.pop();

    if (op.type === 'leftParen') {
      throw new Error('Công thức bị sai dấu ngoặc.');
    }

    output.push(op);
  }

  const stack = [];

  for (const token of output) {
    if (token.type === 'number') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'identifier') {
      const direct = scope[token.value];
      const upper = scope[token.value.toUpperCase()];
      const lower = scope[token.value.toLowerCase()];
      const variableValue = direct ?? upper ?? lower;

      if (variableValue === undefined) {
        throw new Error(`Biến ${token.value} không tồn tại trong công thức.`);
      }

      stack.push(Number(variableValue));
      continue;
    }

    if (token.type === 'operator') {
      if (token.value === 'u+' || token.value === 'u-') {
        if (!stack.length) {
          throw new Error('Công thức thiếu toán hạng.');
        }

        const value = stack.pop();
        stack.push(token.value === 'u-' ? -value : value);
        continue;
      }

      if (stack.length < 2) {
        throw new Error('Công thức thiếu toán hạng.');
      }

      const b = stack.pop();
      const a = stack.pop();
      let result = 0;

      if (token.value === '+') {
        result = a + b;
      }

      if (token.value === '-') {
        result = a - b;
      }

      if (token.value === '*') {
        result = a * b;
      }

      if (token.value === '/') {
        if (b === 0) {
          throw new Error('Công thức chia cho 0.');
        }

        result = a / b;
      }

      if (!Number.isFinite(result)) {
        throw new Error('Công thức cho kết quả không hợp lệ.');
      }

      stack.push(result);
    }
  }

  if (stack.length !== 1) {
    throw new Error('Công thức không hợp lệ.');
  }

  return stack[0];
}

function getAttendanceForDate(db, date) {
  return db.attendance
    .filter((record) => record.date === date)
    .sort((a, b) => {
      const fullNameCompare = a.fullName.localeCompare(b.fullName, 'vi');
      if (fullNameCompare !== 0) {
        return fullNameCompare;
      }
      return a.username.localeCompare(b.username, 'vi');
    });
}

function getGenderCounts(records) {
  let NCD = 0;
  let NuCD = 0;

  for (const item of records) {
    if (item.gender === 'female') {
      NuCD += 1;
    } else {
      NCD += 1;
    }
  }

  return { NCD, NuCD };
}

function calculateDayFinancials(inputs, formulas, records) {
  const sanitizedInputs = sanitizeDayInputs(inputs);
  const sanitizedFormulas = sanitizeDayFormulas(formulas);
  const counts = getGenderCounts(records);

  const scope = {
    SC: sanitizedInputs.SC,
    TC: sanitizedInputs.TC,
    SS: sanitizedInputs.SS,
    TS: sanitizedInputs.TS,
    SB: sanitizedInputs.SB,
    TB: sanitizedInputs.TB,
    SG: sanitizedInputs.SG,
    TG: sanitizedInputs.TG,
    NCD: counts.NCD,
    NuCD: counts.NuCD
  };

  const maleFixedAmount = roundMoney(evaluateArithmeticExpression(sanitizedFormulas.maleFixed, scope));
  const femaleFixedAmount = roundMoney(evaluateArithmeticExpression(sanitizedFormulas.femaleFixed, scope));
  const maleGuestAmount = roundMoney(evaluateArithmeticExpression(sanitizedFormulas.maleGuest, scope));
  const femaleGuestAmount = roundMoney(evaluateArithmeticExpression(sanitizedFormulas.femaleGuest, scope));

  const charges = {};

  for (const attendee of records) {
    charges[attendee.usernameKey] = attendee.gender === 'female' ? femaleFixedAmount : maleFixedAmount;
  }

  const totalRevenue = roundMoney(
    maleFixedAmount * counts.NCD +
      femaleFixedAmount * counts.NuCD +
      maleGuestAmount * sanitizedInputs.SB +
      femaleGuestAmount * sanitizedInputs.SG
  );

  return {
    inputs: sanitizedInputs,
    formulas: sanitizedFormulas,
    charges,
    summary: {
      NCD: counts.NCD,
      NuCD: counts.NuCD,
      maleFixedAmount,
      femaleFixedAmount,
      maleGuestAmount,
      femaleGuestAmount,
      totalRevenue
    }
  };
}

function buildCalendarDays(db, user, monthKey) {
  const daysInMonth = getDaysInMonth(monthKey);
  const result = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const checkedRecord = db.attendance.find(
      (record) => record.date === date && record.usernameKey === user.usernameKey
    );

    result.push({
      date,
      checked: Boolean(checkedRecord),
      recordId: checkedRecord?.id || null,
      checkedAt: checkedRecord?.timestamp || null
    });
  }

  return result;
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
      gender: normalizeGender(item.gender) || 'male',
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

    const normalizedGender = normalizeGender(rawUser?.gender) || 'male';

    users[normalizedKey] = {
      ...rawUser,
      username: inferredUsername,
      usernameKey: normalizedKey,
      fullName: normalizeName(rawUser?.fullName || rawUser?.employeeName || inferredUsername),
      gender: normalizedGender,
      role: rawUser?.role === 'admin' ? 'admin' : 'member'
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

      const gender = normalizeGender(item?.gender || users[usernameKey]?.gender) || 'male';

      return {
        id: String(item.id || generateId()),
        usernameKey,
        username: username || users[usernameKey]?.username || usernameKey,
        fullName: normalizeName(item?.fullName || users[usernameKey]?.fullName || username),
        gender,
        date,
        timestamp: item?.timestamp || new Date().toISOString(),
        ip: item?.ip || 'unknown'
      };
    })
    .filter(Boolean);

  const dayConfigsRaw = parsed.dayConfigs && typeof parsed.dayConfigs === 'object' ? parsed.dayConfigs : {};
  const dayConfigs = {};

  for (const [dateKey, rawConfig] of Object.entries(dayConfigsRaw)) {
    const normalizedDate = normalizeDateKey(dateKey);
    if (!normalizedDate) {
      continue;
    }

    dayConfigs[normalizedDate] = sanitizeDayConfig(rawConfig);
  }

  const dataEditorsRaw = Array.isArray(parsed.dataEditors) ? parsed.dataEditors : [];
  const dataEditors = Array.from(
    new Set(
      dataEditorsRaw
        .map((item) => usernameKeyFromInput(item))
        .filter((item) => item && users[item] && users[item].role !== 'admin')
    )
  );

  const gameScoresRaw = Array.isArray(parsed.gameScores) ? parsed.gameScores : [];
  const gameScores = gameScoresRaw
    .map((item) => {
      const usernameKey = usernameKeyFromInput(item?.usernameKey || item?.username);
      if (!usernameKey) {
        return null;
      }

      const scoreValue = Number(item?.score);
      if (!Number.isFinite(scoreValue) || scoreValue < 0) {
        return null;
      }

      return {
        id: String(item.id || generateId()),
        usernameKey,
        username: normalizeUsernameInput(item?.username || users[usernameKey]?.username || usernameKey),
        fullName: normalizeName(item?.fullName || users[usernameKey]?.fullName || usernameKey),
        score: Math.floor(scoreValue),
        createdAt: item?.createdAt || new Date().toISOString()
      };
    })
    .filter(Boolean);

  return {
    users,
    attendance,
    dayConfigs,
    dataEditors,
    gameScores
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

function requireAdmin(user, res) {
  if (user?.role === 'admin') {
    return true;
  }

  sendJson(res, 403, { error: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' });
  return false;
}

function removeUserFromAllData(db, usernameKey) {
  delete db.users[usernameKey];
  db.dataEditors = db.dataEditors.filter((item) => item !== usernameKey);
  db.attendance = db.attendance.filter((record) => record.usernameKey !== usernameKey);
  db.gameScores = db.gameScores.filter((record) => record.usernameKey !== usernameKey);

  for (const [dateKey, config] of Object.entries(db.dayConfigs)) {
    if (!config || typeof config !== 'object') {
      continue;
    }

    const sanitized = sanitizeDayConfig(config);
    const records = getAttendanceForDate(db, dateKey);
    try {
      const computed = calculateDayFinancials(sanitized.inputs, sanitized.formulas, records);

      config.inputs = computed.inputs;
      config.formulas = computed.formulas;
      config.charges = computed.charges;
      config.summary = computed.summary;
    } catch {
      const counts = getGenderCounts(records);
      config.inputs = sanitized.inputs;
      config.formulas = sanitized.formulas;
      config.charges = {};
      config.summary = {
        NCD: counts.NCD,
        NuCD: counts.NuCD,
        maleFixedAmount: 0,
        femaleFixedAmount: 0,
        maleGuestAmount: 0,
        femaleGuestAmount: 0,
        totalRevenue: 0
      };
    }
  }
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
      const gender = normalizeGender(body.gender);

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

      if (!gender) {
        sendJson(res, 400, { error: 'Vui lòng chọn giới tính Nam hoặc Nữ.' });
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
        gender,
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
        user: sanitizeUser(newUser, db)
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
        user: sanitizeUser(user, db)
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

      sendJson(res, 200, { user: sanitizeUser(user, db) });
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

  if (pathname === '/api/attendance/day' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const date = normalizeDateKey(requestUrl.searchParams.get('date'));

      if (!date) {
        sendJson(res, 400, { error: 'Ngày không hợp lệ (YYYY-MM-DD).' });
        return true;
      }

      const records = getAttendanceForDate(db, date);
      const dayConfig = sanitizeDayConfig(db.dayConfigs[date] || {});

      const withCharges = records.map((record) => ({
        ...sanitizeAttendanceRecord(record),
        charge: roundMoney(Number(dayConfig.charges[record.usernameKey] || 0))
      }));

      sendJson(res, 200, {
        date,
        records: withCharges,
        summary: dayConfig.summary
      });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải danh sách chấm công theo ngày.' });
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

      const exists = db.attendance.find(
        (record) => record.usernameKey === user.usernameKey && record.date === date
      );

      if (exists) {
        sendJson(res, 409, { error: 'Bạn đã chấm công cho ngày này rồi.' });
        return true;
      }

      const record = {
        id: generateId(),
        usernameKey: user.usernameKey,
        username: user.username,
        fullName: user.fullName,
        gender: user.gender,
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

  const deleteAttendanceMatch = pathname.match(/^\/api\/attendance\/([^/]+)$/);
  if (deleteAttendanceMatch && req.method === 'DELETE') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const recordId = decodeURIComponent(deleteAttendanceMatch[1]);
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

  if (pathname === '/api/day-data' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);
      if (!user) {
        return true;
      }

      const date = normalizeDateKey(requestUrl.searchParams.get('date'));
      if (!date) {
        sendJson(res, 400, { error: 'Ngày không hợp lệ (YYYY-MM-DD).' });
        return true;
      }

      const records = getAttendanceForDate(db, date);
      const counts = getGenderCounts(records);
      const config = sanitizeDayConfig(db.dayConfigs[date] || {});

      sendJson(res, 200, {
        date,
        hasInputPermission: hasDataInputPermission(user, db),
        canManageEditors: user.role === 'admin',
        inputs: config.inputs,
        formulas: config.formulas,
        summary: {
          ...config.summary,
          NCD: counts.NCD,
          NuCD: counts.NuCD
        }
      });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải dữ liệu nhập cho ngày này.' });
      return true;
    }
  }

  if (pathname === '/api/day-data/calculate' && req.method === 'POST') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      if (!hasDataInputPermission(user, db)) {
        sendJson(res, 403, { error: 'Bạn không có quyền nhập dữ liệu tính tiền.' });
        return true;
      }

      const body = await readRequestBody(req);
      const date = normalizeDateKey(body.date);

      if (!date) {
        sendJson(res, 400, { error: 'Ngày không hợp lệ (YYYY-MM-DD).' });
        return true;
      }

      const inputs = sanitizeDayInputs(body.inputs || {});
      const formulas = sanitizeDayFormulas(body.formulas || {});
      const records = getAttendanceForDate(db, date);

      const computed = calculateDayFinancials(inputs, formulas, records);
      const config = {
        inputs: computed.inputs,
        formulas: computed.formulas,
        charges: computed.charges,
        summary: computed.summary,
        updatedBy: user.username,
        updatedAt: new Date().toISOString()
      };

      db.dayConfigs[date] = config;
      await writeDb(db);

      sendJson(res, 200, {
        message: 'Đã tính và lưu dữ liệu thành công.',
        date,
        config
      });
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message || 'Không thể tính dữ liệu.' });
      return true;
    }
  }

  if (pathname === '/api/data-editors' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);
      if (!user) {
        return true;
      }

      const editors = db.dataEditors
        .map((key) => db.users[key])
        .filter(Boolean)
        .map((item) => ({
          username: item.username,
          fullName: item.fullName,
          gender: item.gender
        }));

      const users = Object.values(db.users).map((item) => ({
        username: item.username,
        fullName: item.fullName,
        gender: item.gender,
        role: item.role
      }));

      sendJson(res, 200, {
        canManageEditors: user.role === 'admin',
        hasInputPermission: hasDataInputPermission(user, db),
        canDeleteMembers: hasDataInputPermission(user, db),
        editors,
        users
      });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải danh sách quyền nhập dữ liệu.' });
      return true;
    }
  }

  if (pathname === '/api/data-editors' && req.method === 'POST') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      if (!requireAdmin(user, res)) {
        return true;
      }

      const body = await readRequestBody(req);
      const editorKey = usernameKeyFromInput(body.username);

      if (!editorKey) {
        sendJson(res, 400, { error: 'Vui lòng nhập username hợp lệ.' });
        return true;
      }

      const targetUser = db.users[editorKey];

      if (!targetUser) {
        sendJson(res, 404, { error: 'Không tìm thấy tài khoản để cấp quyền.' });
        return true;
      }

      if (targetUser.role === 'admin') {
        sendJson(res, 409, { error: 'Tài khoản admin đã có quyền nhập sẵn.' });
        return true;
      }

      if (!db.dataEditors.includes(editorKey)) {
        db.dataEditors.push(editorKey);
      }

      await writeDb(db);

      sendJson(res, 200, { message: `Đã cấp quyền nhập dữ liệu cho ${targetUser.username}.` });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể cấp quyền.' });
      return true;
    }
  }

  const deleteEditorMatch = pathname.match(/^\/api\/data-editors\/([^/]+)$/);
  if (deleteEditorMatch && req.method === 'DELETE') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);
      if (!user) {
        return true;
      }

      if (!requireAdmin(user, res)) {
        return true;
      }

      const editorKey = usernameKeyFromInput(decodeURIComponent(deleteEditorMatch[1]));
      const before = db.dataEditors.length;
      db.dataEditors = db.dataEditors.filter((item) => item !== editorKey);

      if (db.dataEditors.length === before) {
        sendJson(res, 404, { error: 'Không tìm thấy người được cấp quyền này.' });
        return true;
      }

      await writeDb(db);
      sendJson(res, 200, { message: 'Đã xoá quyền nhập dữ liệu.' });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể xoá quyền.' });
      return true;
    }
  }

  const deleteFixedMemberMatch = pathname.match(/^\/api\/fixed-members\/([^/]+)$/);
  if (deleteFixedMemberMatch && req.method === 'DELETE') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);
      if (!user) {
        return true;
      }

      if (!hasDataInputPermission(user, db)) {
        sendJson(res, 403, { error: 'Báº¡n khÃ´ng cÃ³ quyá»n xoÃ¡ thÃ nh viÃªn cá»‘ Ä‘á»‹nh.' });
        return true;
      }

      const targetKey = usernameKeyFromInput(decodeURIComponent(deleteFixedMemberMatch[1]));
      if (!targetKey) {
        sendJson(res, 400, { error: 'Username khÃ´ng há»£p lá»‡.' });
        return true;
      }

      const targetUser = db.users[targetKey];
      if (!targetUser) {
        sendJson(res, 404, { error: 'KhÃ´ng tÃ¬m tháº¥y thÃ nh viÃªn cá»‘ Ä‘á»‹nh nÃ y.' });
        return true;
      }

      if (targetKey === user.usernameKey) {
        sendJson(res, 409, { error: 'KhÃ´ng thá»ƒ tá»± xoÃ¡ chÃ­nh tÃ i khoáº£n Ä‘ang Ä‘Äƒng nháº­p.' });
        return true;
      }

      if (targetUser.role === 'admin' && user.role !== 'admin') {
        sendJson(res, 403, { error: 'Chá»‰ admin má»›i Ä‘Æ°á»£c xoÃ¡ tÃ i khoáº£n admin.' });
        return true;
      }

      removeUserFromAllData(db, targetKey);
      await writeDb(db);

      sendJson(res, 200, { message: `ÄÃ£ xoÃ¡ thÃ nh viÃªn cá»‘ Ä‘á»‹nh ${targetUser.username}.` });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'KhÃ´ng thá»ƒ xoÃ¡ thÃ nh viÃªn cá»‘ Ä‘á»‹nh.' });
      return true;
    }
  }

  if (pathname === '/api/game/leaderboard' && req.method === 'GET') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const bestByUser = new Map();

      for (const score of db.gameScores) {
        const current = bestByUser.get(score.usernameKey);

        if (!current || score.score > current.score) {
          bestByUser.set(score.usernameKey, score);
        }
      }

      const leaderboard = Array.from(bestByUser.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((item) => ({
          username: item.username,
          fullName: item.fullName,
          score: item.score,
          createdAt: item.createdAt
        }));

      sendJson(res, 200, { leaderboard });
      return true;
    } catch {
      sendJson(res, 500, { error: 'Không thể tải bảng xếp hạng.' });
      return true;
    }
  }

  if (pathname === '/api/game/score' && req.method === 'POST') {
    try {
      const db = await readDb();
      const user = requireAuth(req, res, db);

      if (!user) {
        return true;
      }

      const body = await readRequestBody(req);
      const score = Math.floor(Number(body.score));

      if (!Number.isFinite(score) || score < 0 || score > 1000000) {
        sendJson(res, 400, { error: 'Điểm số không hợp lệ.' });
        return true;
      }

      const entry = {
        id: generateId(),
        usernameKey: user.usernameKey,
        username: user.username,
        fullName: user.fullName,
        score,
        createdAt: new Date().toISOString()
      };

      db.gameScores.push(entry);
      await writeDb(db);

      sendJson(res, 201, { message: 'Đã lưu điểm thành công.' });
      return true;
    } catch (error) {
      sendJson(res, 500, { error: error.message || 'Không thể lưu điểm.' });
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

