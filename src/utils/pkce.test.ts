// pkce.ts 验收测试：纯函数 + 浏览器 API 桩。跑法：npm test（vitest run）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { handleCallback, initSSO, initLogin } from './pkce'

function b64urlOf(buf: Buffer): string {
  return buf.toString('base64url')
}

// ── 浏览器 API 桩 ──────────────────────────────────────────────
function makeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => void m.clear(),
  }
}

type LocationStub = { href: string; origin: string; search: string; pathname: string; hash: string }
let locationStub: LocationStub

beforeEach(() => {
  locationStub = { href: 'https://grid.smartbid.site/', origin: 'https://grid.smartbid.site', search: '', pathname: '/', hash: '' }
  const g = globalThis as Record<string, unknown>
  g.window = {
    location: locationStub,
    // 模拟浏览器行为：replaceState 真正改写 location（被测代码依赖这一点清 URL）
    history: {
      replaceState: vi.fn((_s: unknown, _t: unknown, url: string) => {
        const u = new URL(url, locationStub.origin)
        locationStub.search = u.search
        locationStub.pathname = u.pathname
        locationStub.hash = u.hash
        locationStub.href = u.href
      }),
    },
  }
  g.location = locationStub
  g.localStorage = makeStorage()
  g.sessionStorage = makeStorage()
  g.document = { cookie: '' }
})

afterEach(() => {
  vi.restoreAllMocks()
})

// 把 URL 查询串灌进桩 location（模块读的是 window.location.search）
function setQuery(q: string) {
  locationStub.search = q
  locationStub.href = locationStub.origin + locationStub.pathname + q
}

// 写一个已消费过的 attempt（可指定 ts 模拟陈旧）
async function seedAttempt(state = 'st-1', ageMs = 0) {
  const { verifier } = await (async () => {
    const bytes = new Uint8Array(48)
    crypto.getRandomValues(bytes)
    return { verifier: b64urlOf(Buffer.from(bytes)) }
  })()
  ;(globalThis.sessionStorage as Storage).setItem(
    'oauth2_attempt',
    JSON.stringify({ verifier, state, ts: Date.now() - ageMs }),
  )
  return { verifier, state }
}

describe('handleCallback', () => {
  it('无 ?code 时返回 not-callback，不做任何事', async () => {
    setQuery('')
    const exchange = vi.fn()
    expect(await handleCallback(exchange)).toBe('not-callback')
    expect(exchange).not.toHaveBeenCalled()
  })

  it('成功路径：state 匹配 → 交换 → token 落地 → 清抑制标志', async () => {
    setQuery('?code=abc&state=st-1')
    const { verifier } = await seedAttempt('st-1')
    ;(globalThis.sessionStorage as Storage).setItem('sso_logged_out', '1')
    const exchange = vi.fn().mockResolvedValue({ access_token: 'tok-1' })

    expect(await handleCallback(exchange)).toBe('callback-ok')
    expect(exchange).toHaveBeenCalledWith({ code: 'abc', code_verifier: verifier })
    expect((globalThis.localStorage as Storage).getItem('access_token')).toBe('tok-1')
    expect((globalThis.sessionStorage as Storage).getItem('sso_logged_out')).toBeNull()
    expect((globalThis.sessionStorage as Storage).getItem('oauth2_attempt')).toBeNull()
  })

  it('state 不匹配（CSRF）→ callback-fail，静默丢弃且不调交换', async () => {
    setQuery('?code=abc&state=evil')
    await seedAttempt('st-1')
    const exchange = vi.fn()
    expect(await handleCallback(exchange)).toBe('callback-fail')
    expect(exchange).not.toHaveBeenCalled()
  })

  it('陈旧 attempt（>60s）→ callback-fail', async () => {
    setQuery('?code=abc&state=st-1')
    await seedAttempt('st-1', 61_000)
    const exchange = vi.fn()
    expect(await handleCallback(exchange)).toBe('callback-fail')
    expect(exchange).not.toHaveBeenCalled()
  })

  it('交换失败：无旧 token → callback-fail；不写 token', async () => {
    setQuery('?code=abc&state=st-1')
    await seedAttempt('st-1')
    const exchange = vi.fn().mockRejectedValue(new Error('HTTP 400'))
    expect(await handleCallback(exchange)).toBe('callback-fail')
    expect((globalThis.localStorage as Storage).getItem('access_token')).toBeNull()
  })

  it('交换失败但有旧 token：旧 token 保留不被破坏', async () => {
    setQuery('?code=abc&state=st-1')
    await seedAttempt('st-1')
    ;(globalThis.localStorage as Storage).setItem('access_token', 'old-tok')
    const exchange = vi.fn().mockRejectedValue(new Error('HTTP 400'))
    expect(await handleCallback(exchange)).toBe('callback-fail')
    expect((globalThis.localStorage as Storage).getItem('access_token')).toBe('old-tok')
  })

  it('防回弹：交换失败后 attempt 保留，60s 内 initLogin 拒绝放行；成功后清除', async () => {
    setQuery('?code=abc&state=st-1')
    await seedAttempt('st-1')
    const exchange = vi.fn().mockRejectedValue(new Error('HTTP 400'))
    expect(await handleCallback(exchange)).toBe('callback-fail')
    // 失败路径 attempt 必须保留——清掉的话 requireLogin 会立刻重新放行形成重定向循环
    expect((globalThis.sessionStorage as Storage).getItem('oauth2_attempt')).not.toBeNull()
    expect(await initLogin()).toBe(false)
  })
})

describe('PKCE 几何', () => {
  it('challenge = base64url(SHA-256(verifier))，且 attempt 存的 verifier 与之一致', async () => {
    const ok = await initLogin()
    expect(ok).toBe(true)
    const raw = (globalThis.sessionStorage as Storage).getItem('oauth2_attempt')!
    const { verifier } = JSON.parse(raw)
    const expected = b64urlOf(createHash('sha256').update(verifier).digest())
    // 从刚发起的跳转 URL 里取 challenge 比对
    const challengeInUrl = new URLSearchParams(new URL(locationStub.href).search).get('code_challenge')
    expect(challengeInUrl).toBe(expected)
    expect(challengeInUrl).not.toContain('=')
    void verifier
  })

  it('60s 内重复 initLogin 放弃跳转（防回弹）', async () => {
    const firstHref = 'https://grid.smartbid.site/'
    locationStub.href = firstHref
    expect(await initLogin()).toBe(true)
    const redirected = locationStub.href
    expect(await initLogin()).toBe(false)
    expect(locationStub.href).toBe(redirected)
  })
})

describe('initSSO legacy 兼容链', () => {
  it('?sso_token= 落地 localStorage 并清 URL，解除登出抑制', () => {
    ;(globalThis.sessionStorage as Storage).setItem('sso_logged_out', '1')
    setQuery('?sso_token=t-url&x=1')
    expect(initSSO()).toBe('t-url')
    expect((globalThis.localStorage as Storage).getItem('access_token')).toBe('t-url')
    expect(locationStub.search).toBe('?x=1')
    expect((globalThis.sessionStorage as Storage).getItem('sso_logged_out')).toBeNull()
  })

  it('登出抑制标志置位时：localStorage 没有 → cookie 兜底被跳过，返回 null', () => {
    ;(globalThis.sessionStorage as Storage).setItem('sso_logged_out', '1')
    ;(globalThis.document as { cookie: string }).cookie = 'sso_token=t-cookie'
    expect(initSSO()).toBeNull()
  })

  it('无抑制标志时 cookie 兜底生效', () => {
    ;(globalThis.document as { cookie: string }).cookie = 'sso_token=t-cookie'
    expect(initSSO()).toBe('t-cookie')
    expect((globalThis.localStorage as Storage).getItem('access_token')).toBe('t-cookie')
  })
})
