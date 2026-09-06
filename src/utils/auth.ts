// 4A 统一登录（smartbid.site 全家桶 SSO）接入逻辑。
// 参见 APP_INTEGRATION_GUIDE.md：查 cookie → 没有就跳登录页 → 回跳后落地 token。
// 4A 只负责"这个人是谁"；配额等业务数据由本 app 自己的服务端维护。

const TOKEN_KEY = 'access_token';
const LOGIN_URL = import.meta.env.VITE_LOGIN_URL || 'https://auth.smartbid.site/login';

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// 页面加载时调用一次：尝试从 URL 或跨子域 cookie 恢复登录态
export function initSSO(): string | null {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('sso_token');

  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
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
  localStorage.removeItem(TOKEN_KEY);
}

// 需要身份时才调用：跳转到 4A 统一登录页，登录/注册完会自动带 sso_token 跳回当前页面
export function requireLogin(): void {
  const currentUrl = window.location.href;
  window.location.href = `${LOGIN_URL}?redirect=${encodeURIComponent(currentUrl)}`;
}
