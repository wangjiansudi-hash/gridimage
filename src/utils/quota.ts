// 配额 API 客户端：/api/quota（查询）与 /api/quota/consume（消耗 1 次切割额度）。
// 认证用户的 token 放在 Authorization 头里，由服务端向 4A verify 验证；
// token 失效（reason === 'token_invalid'）时在客户端清掉本地 token。

import { clearToken, getToken } from './auth';

export interface QuotaInfo {
  scope: 'ip' | 'user';
  used: number;
  limit: number;
  remaining: number;
  reset_at: string;
}

export interface QuotaUser {
  id: number;
  username: string;
  phone_masked: string | null;
}

export interface QuotaSnapshot {
  authenticated: boolean;
  reason?: 'no_token' | 'token_invalid' | 'auth_unavailable';
  user: QuotaUser | null;
  quota: QuotaInfo;
  server_time?: string;
  day?: string;
}

export type ConsumeResult =
  | { ok: true; reason: 'ok'; snapshot: QuotaSnapshot }
  | { ok: false; reason: 'quota_exceeded'; snapshot: QuotaSnapshot }
  | { ok: false; reason: 'service_unavailable' };

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// token 已被服务端确认无效 → 清本地 token，界面回到匿名态
function handleTokenInvalid(snapshot: QuotaSnapshot): QuotaSnapshot {
  if (!snapshot.authenticated && snapshot.reason === 'token_invalid') {
    clearToken();
  }
  return snapshot;
}

export async function fetchQuotaSnapshot(signal?: AbortSignal): Promise<QuotaSnapshot | null> {
  try {
    const resp = await fetch('/api/quota', { headers: authHeaders(), signal });
    if (!resp.ok) return null;
    const data = (await resp.json()) as QuotaSnapshot;
    return handleTokenInvalid(data);
  } catch {
    return null;
  }
}

export async function consumeQuota(): Promise<ConsumeResult> {
  let resp: Response;
  try {
    resp = await fetch('/api/quota/consume', { method: 'POST', headers: authHeaders() });
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }

  const data = (await resp.json().catch(() => null)) as
    | (QuotaSnapshot & { consumed?: boolean; error?: string })
    | null;

  if (!data) return { ok: false, reason: 'service_unavailable' };

  if (resp.status === 429 && data.error === 'quota_exceeded') {
    return { ok: false, reason: 'quota_exceeded', snapshot: handleTokenInvalid(data) };
  }
  if (!resp.ok || !data.consumed) {
    return { ok: false, reason: 'service_unavailable' };
  }
  return { ok: true, reason: 'ok', snapshot: handleTokenInvalid(data) };
}

export function formatResetTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}
