// 4A 统一登录（smartbid.site 全家桶 SSO）接入逻辑。
// 参见 APP_INTEGRATION_GUIDE.md：查 cookie → 没有就跳登录页 → 回跳后落地 token。
// 4A 只负责"这个人是谁"；配额等业务数据由本 app 自己的服务端维护。

const TOKEN_KEY = 'access_token';
const LOGOUT_FLAG_KEY = 'sso_logged_out';
const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 'https://auth.smartbid.site/login';
const LOGOUT_URL = import.meta.env.VITE_LOGOUT_URL || 'https://auth.smartbid.site/logout';

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
    document.cookie = `sso_token=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
  }
  // 指南 §3 自查：非 HttpOnly，JS 应能确认已删除
  if (getCookie('sso_token')) {
    console.warn('[auth] sso_token cookie 清理失败，请按 docs/APP_LOGOUT_GUIDE.md §3 自查属性匹配');
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
  // 审计/登出通知的 token 以 localStorage 为准，共享 cookie 兜底（登出指南 §2）
  const token = localStorage.getItem(TOKEN_KEY) || getCookie('sso_token');
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

// 需要身份时才调用：跳转到 4A 统一登录页，登录/注册完会自动带 sso_token 跳回当前页面
export function requireLogin(): void {
  // 4A 登录页的 Auto-SSO 块只认 sso_token cookie：cookie 在，就不展示表单、
  // 直接把 cookie 里的 token 弹回来（用户永远看不到登录页）。
  // 本标签页显式退出过的情况下，cookie 可能已被其他 smartbid 系页签重新下发，
  // 因此跳转前再删一次，保证用户能看到登录表单（docs/APP_LOGOUT_GUIDE.md §2/§3）。
  try {
    if (sessionStorage.getItem(LOGOUT_FLAG_KEY)) {
      deleteSsoCookie();
    }
  } catch {
    /* ignore */
  }
  const currentUrl = window.location.href;
  window.location.href = `${LOGIN_URL}?redirect=${encodeURIComponent(currentUrl)}`;
}

// 全家桶登出（4A R1 已上线）：跳转 4A 全局登出页——4A 清会话 cookie 并吊销
// 该用户全部 token（R2 token_version）后 302 回跳当前页。跳转会中断本地
// 审计 POST，无碍：4A 侧是真正的吊销。
export function logoutEverywhere(): void {
  clearToken();
  window.location.href = `${LOGOUT_URL}?redirect=${encodeURIComponent(window.location.href)}`;
}
