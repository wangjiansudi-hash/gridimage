// OAuth2 授权码 + PKCE 登录（smartbid.site 全家桶）——gridimage 接入。
// 拷贝自 auth-service/docs/assets/pkce-login.js v1.0（同步时带上版本号，勿就地魔改）。
// legacy（sso_token cookie / ?sso_token=）在共存期保留，见 APP_INTEGRATION_GUIDE.md §0/§1。
// 4A 只负责"这个人是谁"；配额等业务数据由本 app 自己的服务端维护。

const AUTH_BASE = import.meta.env.VITE_AUTH_BASE || 'https://auth.smartbid.site';
const CLIENT_ID = import.meta.env.VITE_OAUTH2_CLIENT_ID || 'grid';
const LOGOUT_URL = import.meta.env.VITE_LOGOUT_URL || 'https://auth.smartbid.site/logout';

const TOKEN_KEY = 'access_token';
const SSO_COOKIE = 'sso_token';
// 登出抑制标志：置位后本标签页不再从共享 cookie 静默恢复登录态（APP_LOGOUT_GUIDE.md §2）
const LOGOUT_FLAG_KEY = 'sso_logged_out';
const ATTEMPT_KEY = 'oauth2_attempt';
/** 授权码 TTL 120s；超过即视为陈旧尝试，静默丢弃（自愈防回弹） */
const ATTEMPT_MAX_AGE_MS = 60_000;

/** base64url（无填充）。不用 btoa 直接编码字符串：对 UTF-8 字节不安全。 */
function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(len: number): Uint8Array {
  const out = new Uint8Array(len);
  crypto.getRandomValues(out);
  return out;
}

/** PKCE 对：verifier 随机原文；challenge = base64url(SHA-256(verifier)) */
async function pkcePair(): Promise<{ verifier: string; code_challenge: string }> {
  const verifier = b64url(randomBytes(48));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, code_challenge: b64url(new Uint8Array(digest)) };
}

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// 删除 4A 写在共享父域上的 sso_token cookie。
// 删除 = 写同名过期 cookie，浏览器按 name+domain+path 三者精确匹配覆盖，
// 属性必须逐项对齐下发时的 path=/; domain=.smartbid.site（见 docs/APP_LOGOUT_GUIDE.md §3）：
// 漏 domain 会造出 host-only 空 cookie、原 cookie 纹丝不动；写成本站 host 同样删不掉。
function deleteSsoCookie(): void {
  const host = window.location.hostname;
  const labels = host.split('.');
  const parentDomain = labels.length >= 2 ? labels.slice(-2).join('.') : null;
  const domains: (string | undefined)[] = parentDomain
    ? [parentDomain, `.${parentDomain}`]
    : [undefined];
  for (const domain of domains) {
    document.cookie = `${SSO_COOKIE}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
  }
  // 指南 §3 自查：非 HttpOnly，JS 应能确认已删除
  if (getCookie(SSO_COOKIE)) {
    console.warn('[auth] sso_token cookie 清理失败，请按 docs/APP_LOGOUT_GUIDE.md §3 自查属性匹配');
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 跳 4A 授权端点。60s 内已有未完成 attempt 则放弃跳转：
 * cookie 兜底有效 + 交换持续失败时 "requireLogin → 发码 → 交换失败" 会无限回弹，这道闸自愈。
 * 返回 true=已发起跳转。
 */
export async function initLogin(): Promise<boolean> {
  const prev = sessionStorage.getItem(ATTEMPT_KEY);
  if (prev) {
    try {
      if (Date.now() - (JSON.parse(prev) as { ts: number }).ts < ATTEMPT_MAX_AGE_MS) return false;
    } catch {
      /* 损坏即覆盖 */
    }
  }
  const { verifier, code_challenge } = await pkcePair();
  const state = b64url(randomBytes(16));
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ verifier, state, ts: Date.now() }));
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: location.origin + '/',
    code_challenge,
    code_challenge_method: 'S256',
    state,
  });
  location.href = `${AUTH_BASE}/oauth2/authorize?${q}`;
  return true;
}

export type CallbackResult = 'callback-ok' | 'callback-fail' | 'not-callback';

/**
 * 页面加载时最先调用（先于 initSSO）。
 * 'callback-ok' = token 已落地；'callback-fail' = 是回调但失败（有旧 token 可继续用，
 * 没有就接着 requireLogin()）；'not-callback' = 普通加载，继续 initSSO()。
 */
export async function handleCallback(exchange: (p: { code: string; code_verifier: string }) => Promise<{ access_token?: string }>): Promise<CallbackResult> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return 'not-callback';

  // state 必须在清 URL 之前取出
  const state = params.get('state');
  params.delete('code');
  params.delete('state');
  window.history.replaceState(
    {},
    '',
    window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash,
  );

  let attempt: { verifier: string; state: string; ts: number } | null = null;
  try {
    attempt = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || 'null');
  } catch {
    /* 视为缺失 */
  }
  const valid =
    attempt !== null && attempt.state === state && Date.now() - attempt.ts < ATTEMPT_MAX_AGE_MS;
  sessionStorage.removeItem(ATTEMPT_KEY);
  if (!valid) return 'callback-fail'; // CSRF/陈旧尝试：静默丢弃，不发起任何跳转

  try {
    const res = await exchange({ code, code_verifier: attempt.verifier });
    if (!res?.access_token) throw new Error('exchange 返回缺少 access_token');
    localStorage.setItem(TOKEN_KEY, res.access_token);
    try {
      sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    } catch {
      /* ignore */
    }
    return 'callback-ok';
  } catch (err) {
    console.warn('[auth] 授权码交换失败：', err);
    // 旧 token 还在就沿用（verify 侧会判死过期/被顶的 token），没有则交给调用方 requireLogin
    return 'callback-fail';
  }
}

// 页面加载时调用一次：legacy 兼容链（?sso_token= URL → localStorage → 跨子域 cookie）。
// 全部家族应用迁完后本函数整体删除。
export function initSSO(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('sso_token');

  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    // 显式登录返回，解除退出抑制
    try {
      sessionStorage.removeItem(LOGOUT_FLAG_KEY);
    } catch {
      /* ignore */
    }
    // 清理 URL，避免 token 留在地址栏/浏览记录里
    params.delete('sso_token');
    const newUrl =
      window.location.pathname +
      (params.toString() ? '?' + params.toString() : '') +
      window.location.hash;
    window.history.replaceState({}, '', newUrl);
    return urlToken;
  }

  const existing = getToken();
  if (existing) return existing;

  // 用户在本站主动退出过：不再从共享 cookie 静默恢复登录态，
  // 直到重新登录（URL 带 sso_token）或新开标签页会话
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY)) return null;
  } catch {
    /* ignore */
  }

  // 跨子域 cookie 兜底：用户在别的 smartbid 系产品登录过，这里免登录识别
  const cookieToken = getCookie(SSO_COOKIE);
  if (cookieToken) {
    localStorage.setItem(TOKEN_KEY, cookieToken);
    return cookieToken;
  }

  return null;
}

export function clearToken(): void {
  // 审计/登出通知的 token 以 localStorage 为准，共享 cookie 兜底（登出指南 §2）
  const token = getToken() || getCookie(SSO_COOKIE);
  localStorage.removeItem(TOKEN_KEY);
  deleteSsoCookie();
  try {
    sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
  if (token) {
    // 通知 4A 记审计日志（尽力而为）；4A 约定 401（token 已失效）同样视为成功。
    // 经本站服务端代理转发——浏览器直连 auth.smartbid.site 会被 CORS preflight 拦截
    void fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }
}

// 需要身份时才调用：跳 4A 授权端点（已登录用户由 4A 静默 302 带授权码回来，无感换发）
export async function requireLogin(): Promise<void> {
  // 4A 登录页的 Auto-SSO 块只认 sso_token cookie。本标签页显式退出过的情况下，
  // cookie 可能已被其他 smartbid 系页签重新下发，因此跳转前删一次
  //（OAuth2 下授权码落 ?code= 而非 token，但 cookie 仍参与 4A 侧登录态识别）。
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY)) {
      deleteSsoCookie();
    }
  } catch {
    /* ignore */
  }
  await initLogin();
}

// 全家桶登出（4A R1）：跳转 4A 全局登出页——4A 清会话 cookie 并吊销该用户
// 全部 token（R2 token_version）后 302 回跳当前页。跳转会中断本地审计 POST，无碍。
export function logoutEverywhere(): void {
  clearToken();
  window.location.href = `${LOGOUT_URL}?redirect=${encodeURIComponent(window.location.href)}`;
}
