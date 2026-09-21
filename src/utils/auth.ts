// 4A 统一登录入口——实现已迁至 ./pkce（OAuth2 授权码 + PKCE，legacy 兼容链保留）。
// 保留本文件作为薄壳：App.tsx / Header.tsx / QuotaModal.tsx / quota.ts 的 import 不动。
export {
  getToken,
  initSSO,
  clearToken,
  requireLogin,
  logoutEverywhere,
  initLogin,
  handleCallback,
  type CallbackResult,
} from './pkce';
