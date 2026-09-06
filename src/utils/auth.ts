// 4A 统一登录（smartbid.site 全家桶 SSO）接入逻辑。
// 参见 APP_INTEGRATION_GUIDE.md：查 cookie → 没有就跳登录页 → 回跳后落地 token。
// 4A 只负责"这个人是谁"；配额等业务数据由本 app 自己的服务端维护。

const TOKEN_KEY = 'access_token';
const LOGOUT_FLAG_KEY = 'sso_logged_out';
const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 'https://auth.smartbid.site/login';
const AUTH_BASE = new URL(LOGIN_URL).origin;

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// 删除 4A 写在共享父域上的 sso_token cookie（覆盖 host-only / 父域各种写法）；
// 不删的话 initSSO 的 cookie 兜底会把刚退出的登录态静默恢复回来
function deleteSsoCookie(): void {
  const host = window.location.hostname;
  const labels = host.split('.');
  const parentDomain = labels.length >= 2 ? labels.slice(-2).join('.') : null;
  const domains: (string | undefined)[] = [undefined, host];
  if (parentDomain) domains.push(parentDomain, `.${parentDomain}`);
  for (const domain of domains) {
    document.cookie = `sso_token=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
  }
}

// 页面加载时调用一次：尝试从 URL 或跨子域 cookie 恢复登录态
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

  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;

  // 用户在本站主动退出过：不再从共享 cookie 静默恢复登录态，
  // 直到重新登录（URL 带 sso_token）或新开标签页会话
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY)) return null;
  } catch {
    /* ignore */
  }

  // 跨子域 cookie 兜底：用户在别的 smartbid 系产品登录过，这里免登录识别
  const cookieToken = getCookie('sso_token');
  if (cookieToken) {
    localStorage.setItem(TOKEN_KEY, cookieToken);
    return cookieToken;
  }

  return null;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  const token = localStorage.getItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  deleteSsoCookie();
  try {
    sessionStorage.setItem(LOGOUT_FLAG_KEY, '1');
  } catch {
    /* ignore */
  }
  if (token) {
    // 尽力通知 4A 注销服务端 token（单实例登录互斥下使其彻底失效）；
    // 跨域或端点不可用时静默忽略，本地登出不受影响
    void fetch(`${AUTH_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }
}

// 需要身份时才调用：跳转到 4A 统一登录页，登录/注册完会自动带 sso_token 跳回当前页面
export function requireLogin(): void {
  const currentUrl = window.location.href;
  window.location.href = `${LOGIN_URL}?redirect=${encodeURIComponent(currentUrl)}`;
}
