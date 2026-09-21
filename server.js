#!/usr/bin/env node
/**
 * grid.smartbid.site 配额与 4A 认证 API（零依赖，Node >= 18）
 *
 * 端点：
 *   GET  /                     入口页：带 Link: rel="ai-catalog" 头；Accept: text/markdown 时返回 markdown 站点简介
 *   GET  /api/quota            查询当前身份与今日剩余额度
 *   POST /api/quota/consume    消耗 1 次切割额度（超额返回 429）
 *   POST /api/auth/logout      注销代理（转发 4A /api/auth/logout）
 *   POST /api/auth/token       OAuth2 授权码交换代理（转发 4A /oauth2/token）
 *   GET  /.well-known/ai-catalog.json  Agent-Ready API 目录（与 /.well-known/api-catalog 同一份 JSON）
 *   GET  /.well-known/api-catalog
 *   GET  /healthz              健康检查
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
const AUTH_TOKEN_URL = process.env.AUTH_TOKEN_URL || 'https://auth.smartbid.site/oauth2/token';
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

function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve) => {
    let raw = '';
    let overflow = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) overflow = true;
    });
    req.on('end', () => {
      if (overflow) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
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

// --------------------------------------------------- agent-ready discovery
// isitagentready.com 整改：如实盘点本服务现有端点，不虚报（切图本身是纯前端能力，不在 API 内）。
const SITE_URL = 'https://grid.smartbid.site';

const API_CATALOG = {
  name: 'gridimage',
  url: SITE_URL,
  title: '视频号封面切图工具（grid.smartbid.site）',
  description:
    '把长封面图切成宫格子图供微信视频号按发布顺序上传。图片处理全部在浏览器 canvas 本地完成，不上传图片；' +
    '本服务仅提供 4A SSO 认证与每日切割配额（匿名 1 次/日按 IP，登录 10 次/日按 4A 用户，Asia/Shanghai 零点重置）。',
  endpoints: [
    {
      method: 'GET',
      path: '/api/quota',
      description:
        '查询当前身份与今日剩余切割额度。带 Authorization: Bearer <sso_token> 按登录用户计（10 次/日），否则按来源 IP 匿名计（1 次/日）。',
      auth: 'optional bearer',
    },
    {
      method: 'POST',
      path: '/api/quota/consume',
      description: '原子消耗 1 次切割额度（仅前端「开始切图」时调用）；额度耗尽返回 429 {error:"quota_exceeded"}。',
      auth: 'optional bearer',
    },
    {
      method: 'POST',
      path: '/api/auth/logout',
      description:
        '注销代理：转发 Bearer token 到 4A /api/auth/logout（浏览器直连会被 CORS 拦截），并清除本服务 verify 缓存。',
      auth: 'required bearer',
    },
    {
      method: 'POST',
      path: '/api/auth/token',
      description:
        'OAuth2 授权码交换代理：接收 {code, code_verifier, redirect_uri}，form 转发到 4A /oauth2/token，透传 4A 状态码；redirect_uri 仅允许 https://grid.smartbid.site/ 或 http://localhost:3000/。',
      auth: 'none',
    },
  ],
};

const SITE_MARKDOWN = `# grid.smartbid.site — 视频号封面切图工具

把一张长封面图切成 1×3 / 2×3 / 3×3 / 自定义宫格子图，按微信视频号的发布顺序命名，
配合手机框模拟预览发布后在主页拼回完整海报的效果。

## 工作方式

- 纯前端应用：图片切割、格式/质量导出、ZIP 打包全部在浏览器 \`<canvas>\` 本地完成，**不上传图片**。
- 服务端只有一个零依赖 Node 小服务，负责 4A SSO 认证与每日切割配额。
- 机器可读 API 目录：${SITE_URL}/.well-known/ai-catalog.json

## 配额规则（仅约束「开始切图」动作，浏览与上传不受限）

| 身份 | 额度 | 计量 |
|---|---|---|
| 匿名 | 1 次/日 | 按来源 IP（\`Cf-Connecting-Ip\`） |
| 4A 登录用户 | 10 次/日 | 按 4A 数字用户 id |

每日 Asia/Shanghai 零点重置。认证方式：\`Authorization: Bearer <sso_token>\`（4A OAuth2 授权码 + PKCE 签发）。

## API

- \`GET /api/quota\` — 查询当前身份与今日剩余额度
- \`POST /api/quota/consume\` — 消耗 1 次切割额度（超额返回 429 \`quota_exceeded\`）
- \`POST /api/auth/logout\` — 注销代理（转发 4A 并清本地验证缓存）
- \`POST /api/auth/token\` — OAuth2 授权码交换代理（转发 4A \`/oauth2/token\`）
`;

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

    // OAuth2 授权码交换代理：前端拿 ?code= 落地后把 {code, code_verifier, redirect_uri}
    // POST 过来，这里 form 转发 4A /oauth2/token。SPA 不直连 4A——不在其 CORS 白名单，
    // 且 code_verifier 不必离开本站。redirect_uri 由前端传（须与 authorize 一步精确一致，
    // dev 为 http://localhost:3000/、生产为 https://grid.smartbid.site/）。
    // 无状态转发：不缓存、不落库，透传 4A 的 200/4xx。
    if (route === 'POST /api/auth/token') {
      const body = await readJsonBody(req);
      if (
        !body ||
        typeof body.code !== 'string' ||
        typeof body.code_verifier !== 'string' ||
        typeof body.redirect_uri !== 'string' ||
        !/^https:\/\/grid\.smartbid\.site\/$|^http:\/\/localhost:3000\/$/.test(body.redirect_uri)
      ) {
        send(res, 400, { error: 'invalid_request', detail: '需要 { code, code_verifier, redirect_uri }' });
        return;
      }
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code: body.code,
        code_verifier: body.code_verifier,
        client_id: process.env.OAUTH2_CLIENT_ID || 'grid',
        redirect_uri: body.redirect_uri,
      });
      try {
        const resp = await fetch(AUTH_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        });
        const payload = await resp.json().catch(() => ({}));
        log(`4a token exchange: status=${resp.status}`);
        send(res, resp.status, payload);
      } catch (err) {
        log(`4a token exchange failed: ${err.message}`);
        send(res, 502, { error: 'auth_unavailable' });
      }
      return;
    }

    // Agent-Ready 入口：始终带 Link: rel="ai-catalog" 指向 API 目录；
    // Accept 含 text/markdown 时返回 markdown 站点简介，其余照常回静态入口页。
    // 注意：生产环境 GET / 由 Caddy 静态托管，本路由主要用于探测与直连本服务的场景。
    if (route === 'GET /') {
      const link = '</.well-known/ai-catalog.json>; rel="ai-catalog"';
      const accept = String(req.headers['accept'] || '');
      if (accept.includes('text/markdown')) {
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'no-store',
          Link: link,
        });
        res.end(SITE_MARKDOWN);
        return;
      }
      let html = null;
      try {
        html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      } catch {
        // 静态入口不在同目录时用占位页兜底
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        Link: link,
      });
      res.end(
        html ??
          `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>grid.smartbid.site</title></head>` +
          `<body><p>视频号封面切图工具。API 目录见 <a href="/.well-known/ai-catalog.json">/.well-known/ai-catalog.json</a>。</p></body></html>`,
      );
      return;
    }

    // 同一份 JSON 两个路径：ai-catalog.json 给 ARD 探测，api-catalog 给 API Catalog 探测
    if (route === 'GET /.well-known/ai-catalog.json' || route === 'GET /.well-known/api-catalog') {
      send(res, 200, API_CATALOG);
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
