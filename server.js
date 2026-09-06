#!/usr/bin/env node
/**
 * grid.smartbid.site 配额与 4A 认证 API（零依赖，Node >= 18）
 *
 * 端点：
 *   GET  /api/quota         查询当前身份与今日剩余额度
 *   POST /api/quota/consume 消耗 1 次切割额度（超额返回 429）
 *   GET  /healthz           健康检查
 *
 * 身份：
 *   Authorization: Bearer <sso_token> → 转发 4A /api/auth/verify 验证（带缓存）
 *   认证用户：每用户每日 10 次（按 4A 数字 id）
 *   匿名用户：每独立 IP 每日 1 次（按 Cf-Connecting-Ip）
 *   每日按 Asia/Shanghai 零点重置
 *
 * 环境变量：
 *   PORT=3990  HOST=127.0.0.1
 *   QUOTA_DB=/var/lib/grid-quota/usage.json
 *   AUTH_VERIFY_URL=https://auth.smartbid.site/api/auth/verify
 *   ANON_DAILY_LIMIT=1  USER_DAILY_LIMIT=10
 *   VERIFY_TIMEOUT_MS=5000  VERIFY_CACHE_TTL_MS=600000  VERIFY_NEG_TTL_MS=60000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || '3990', 10);
const HOST = process.env.HOST || '127.0.0.1';
const QUOTA_DB = process.env.QUOTA_DB || path.join(__dirname, 'data', 'usage.json');
const AUTH_VERIFY_URL = process.env.AUTH_VERIFY_URL || 'https://auth.smartbid.site/api/auth/verify';
const AUTH_LOGOUT_URL = process.env.AUTH_LOGOUT_URL || 'https://auth.smartbid.site/api/auth/logout';
const ANON_DAILY_LIMIT = parseInt(process.env.ANON_DAILY_LIMIT || '1', 10);
const USER_DAILY_LIMIT = parseInt(process.env.USER_DAILY_LIMIT || '10', 10);
const VERIFY_TIMEOUT_MS = parseInt(process.env.VERIFY_TIMEOUT_MS || '5000', 10);
const VERIFY_CACHE_TTL_MS = parseInt(process.env.VERIFY_CACHE_TTL_MS || '600000', 10);
const VERIFY_NEG_TTL_MS = parseInt(process.env.VERIFY_NEG_TTL_MS || '60000', 10);
const DB_KEEP_DAYS = 7;

const TZ = 'Asia/Shanghai';
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

function log(msg) {
  console.log(`[grid-quota ${new Date().toISOString()}] ${msg}`);
}

function dayKey(date = new Date()) {
  return dayFmt.format(date);
}

function nextMidnightShanghaiISO() {
  const shifted = new Date(Date.now() + 8 * 3600e3);
  const next = Date.UTC(
    shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1
  ) - 8 * 3600e3;
  return new Date(next).toISOString();
}

function maskToken(token) {
  return token ? `${token.slice(0, 6)}…(${token.length})` : '(none)';
}

function maskPhone(phone) {
  if (typeof phone !== 'string' || phone.length < 7) return null;
  if (phone.length === 11) return `${phone.slice(0, 3)}****${phone.slice(7)}`;
  return `${phone.slice(0, 2)}****${phone.slice(-3)}`;
}

// ---------------------------------------------------------------- persistence

let db = { days: {} };

function pruneDays() {
  const keys = Object.keys(db.days).sort();
  const keep = new Set(keys.slice(-DB_KEEP_DAYS));
  for (const k of keys) {
    if (!keep.has(k)) delete db.days[k];
  }
}

function loadDb() {
  try {
    const raw = fs.readFileSync(QUOTA_DB, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.days) {
      db = parsed;
      pruneDays();
      log(`db loaded from ${QUOTA_DB} (days: ${Object.keys(db.days).join(', ') || 'none'})`);
      return;
    }
    log(`db file malformed, starting fresh: ${QUOTA_DB}`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log(`db load failed (${err.message}), starting fresh`);
    }
  }
  db = { days: {} };
}

let flushTimer = null;

function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    fs.mkdirSync(path.dirname(QUOTA_DB), { recursive: true });
    const tmp = `${QUOTA_DB}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, QUOTA_DB);
  } catch (err) {
    log(`db flush failed: ${err.message}`);
  }
}

function flushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushNow, 1500);
  if (flushTimer.unref) flushTimer.unref();
}

function ensureDay(day) {
  if (!db.days[day]) db.days[day] = { ips: {}, users: {} };
  const b = db.days[day];
  if (!b.ips) b.ips = {};
  if (!b.users) b.users = {};
  return b;
}

function usedCount(bucket, scope, key) {
  const store = scope === 'user' ? bucket.users : bucket.ips;
  return store[key] || 0;
}

function addCount(bucket, scope, key) {
  const store = scope === 'user' ? bucket.users : bucket.ips;
  store[key] = (store[key] || 0) + 1;
  return store[key];
}

// ------------------------------------------------------------------ 4A verify
// 缓存原则（见 APP_INTEGRATION_GUIDE §6）：
//   缓存有效 → 直接用；缓存过期 → 删掉重新 verify；
//   401 → 短负缓存；网络异常 → 降级匿名（fail open），不 500。

const verifyCache = new Map(); // token -> { user, expiresAt }
const negCache = new Map();    // token -> expiresAt（验证失败短缓存，防刷）

async function verifyToken(token) {
  const now = Date.now();
  const hit = verifyCache.get(token);
  if (hit) {
    if (hit.expiresAt > now) return { ok: true, user: hit.user };
    verifyCache.delete(token);
  }
  const neg = negCache.get(token);
  if (neg) {
    if (neg > now) return { ok: false, reason: 'token_invalid' };
    negCache.delete(token);
  }

  try {
    const resp = await fetch(AUTH_VERIFY_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (resp.ok) {
      const raw = await resp.json();
      if (!raw || typeof raw.id !== 'number') {
        log(`verify unexpected payload for token=${maskToken(token)}`);
        return { ok: false, reason: 'auth_unavailable' };
      }
      const user = { id: raw.id, username: raw.username || '', phone: raw.phone || '' };
      verifyCache.set(token, { user, expiresAt: now + VERIFY_CACHE_TTL_MS });
      if (verifyCache.size > 5000) {
        for (const [k, v] of verifyCache) {
          if (v.expiresAt <= now) verifyCache.delete(k);
        }
      }
      return { ok: true, user };
    }
    if (resp.status === 401) {
      negCache.set(token, now + VERIFY_NEG_TTL_MS);
      log(`verify 401 (token invalid) token=${maskToken(token)}`);
      return { ok: false, reason: 'token_invalid' };
    }
    log(`verify http ${resp.status} token=${maskToken(token)} → fail open as anonymous`);
    return { ok: false, reason: 'auth_unavailable' };
  } catch (err) {
    log(`verify network error token=${maskToken(token)}: ${err.message} → fail open as anonymous`);
    return { ok: false, reason: 'auth_unavailable' };
  }
}

async function resolveAuth(req) {
  const header = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const token = m ? m[1].trim() : null;
  if (!token) return { authenticated: false, reason: 'no_token' };
  const result = await verifyToken(token);
  if (result.ok) return { authenticated: true, user: result.user };
  return { authenticated: false, reason: result.reason };
}

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || 'unknown';
}

// -------------------------------------------------------------------- routing

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    phone_masked: maskPhone(user.phone),
  };
}

function buildPayload(auth, req) {
  const day = dayKey();
  const bucket = ensureDay(day);
  if (auth.authenticated) {
    const key = String(auth.user.id);
    const used = usedCount(bucket, 'user', key);
    return {
      authenticated: true,
      user: publicUser(auth.user),
      quota: {
        scope: 'user',
        used,
        limit: USER_DAILY_LIMIT,
        remaining: Math.max(0, USER_DAILY_LIMIT - used),
        reset_at: nextMidnightShanghaiISO(),
      },
      server_time: new Date().toISOString(),
      day,
    };
  }
  const ip = clientIp(req);
  const used = usedCount(bucket, 'ip', ip);
  return {
    authenticated: false,
    reason: auth.reason || 'no_token',
    user: null,
    quota: {
      scope: 'ip',
      used,
      limit: ANON_DAILY_LIMIT,
      remaining: Math.max(0, ANON_DAILY_LIMIT - used),
      reset_at: nextMidnightShanghaiISO(),
    },
    server_time: new Date().toISOString(),
    day,
  };
}

const server = http.createServer(async (req, res) => {
  req.resume();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = `${req.method} ${url.pathname}`;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (route === 'GET /healthz') {
      send(res, 200, { ok: true, uptime_s: Math.round(process.uptime()), day: dayKey() });
      return;
    }

    if (route === 'GET /api/quota' || route === 'POST /api/quota/consume') {
      const auth = await resolveAuth(req);
      const payload = buildPayload(auth, req);

      if (route === 'GET /api/quota') {
        send(res, 200, payload);
        return;
      }

      if (payload.quota.remaining <= 0) {
        log(`quota exceeded: ${payload.quota.scope} key=${payload.quota.scope === 'user' ? auth.user.id : clientIp(req)} used=${payload.quota.used}`);
        send(res, 429, { error: 'quota_exceeded', ...payload });
        return;
      }

      const bucket = ensureDay(payload.day);
      payload.quota.used = addCount(bucket, payload.quota.scope, payload.quota.scope === 'user' ? String(auth.user.id) : clientIp(req));
      payload.quota.remaining = Math.max(0, payload.quota.limit - payload.quota.used);
      payload.consumed = true;
      flushSoon();
      log(`consumed: ${payload.quota.scope} key=${payload.quota.scope === 'user' ? auth.user.id : clientIp(req)} used=${payload.quota.used}/${payload.quota.limit}`);
      send(res, 200, payload);
      return;
    }

    // 注销代理：浏览器直连 4A 会被 CORS preflight 拦截（请求根本发不出去），
    // 由本服务端转发才能真正让 4A 注销 token；顺带清掉本地 verify 缓存，
    // 避免已注销 token 在缓存 TTL 内仍被视为有效
    if (route === 'POST /api/auth/logout') {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers['authorization'] || '');
      const token = m ? m[1].trim() : null;
      if (!token) {
        send(res, 401, { error: 'no_token' });
        return;
      }
      let fourAStatus = 'unreachable';
      try {
        const resp = await fetch(AUTH_LOGOUT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });
        fourAStatus = resp.status;
        log(`4a logout forwarded: status=${resp.status} token=${maskToken(token)}`);
      } catch (err) {
        log(`4a logout forward failed: ${err.message} token=${maskToken(token)}`);
      }
      verifyCache.delete(token);
      negCache.delete(token);
      send(res, 200, { ok: true, four_a_status: fourAStatus });
      return;
    }

    send(res, 404, { error: 'not_found' });
  } catch (err) {
    log(`handler error ${route}: ${err.stack || err.message}`);
    send(res, 500, { error: 'internal_error' });
  }
});

process.on('SIGTERM', () => { flushNow(); process.exit(0); });
process.on('SIGINT', () => { flushNow(); process.exit(0); });
process.on('exit', () => { try { flushNow(); } catch { /* best effort */ } });

loadDb();
setInterval(() => {
  const day = dayKey();
  if (!db.days[day]) {
    pruneDays();
    log(`day rollover → ${day}`);
  }
}, 60e3);

server.listen(PORT, HOST, () => {
  log(`listening on ${HOST}:${PORT} (anon=${ANON_DAILY_LIMIT}/day per IP, user=${USER_DAILY_LIMIT}/day, db=${QUOTA_DB})`);
});
