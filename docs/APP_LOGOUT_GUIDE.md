# 接入 4A 统一登录 —— App 端登出指南

面向对象：smartbid.site 家族下的各个独立产品（grid、sph、joyread 等），已按
《APP 端改造手册》（`docs/APP_INTEGRATION_GUIDE.md`）完成登录接入，现在要实现"退出登录"。

先说一个结论：**登出有两级**，你的产品应该想清楚自己要的是哪一级：

| 级别 | 用户语义 | 做法 | 状态 |
|------|---------|------|------|
| **应用内登出** | "退出这个 app" | 清本地 token + 清共享 cookie + 调 4A logout 端点 | ✅ 现在就可用 |
| **全家桶登出** | "退出 4A 账号"（所有 smartbid 系产品一起退出） | 302 跳 4A 全局登出页 | ⏳ 4A 落地 R1 后可用（见 `4A_LOGOUT_REQUIREMENTS.md`） |

## 1. 先理解 4A 的会话模型（为什么登出比登录难）

- 登录成功后，4A 会把 JWT 写进 **`sso_token` cookie**，属性是
  `path=/`、`domain=.smartbid.site`、`secure`、**非 HttpOnly**（前端 JS 需要读取）。
- 因为 domain 是 `.smartbid.site`，**所有子域共享这一个 cookie**——这就是"在
  SmartBid 登录过，到 sph 免登录"的机制；也因此，你的 app 完全有能力也有责任清理它。
- 你的 app 里通常还有一份 token 的拷贝（localStorage 等）。**两处都要清**，
  只清一处就会复现经典 bug：点退出 → 点登录 → 4A 登录页检测到 cookie 还在 →
  秒弹回来，"退出"名存实亡。

## 2. 应用内登出（现在就可用）

三步，顺序无所谓，但**一步都不能少**：

```js
const TOKEN_KEY = 'access_token';
const LOGIN_URL = 'https://auth.smartbid.site/login'; // 实际域名以你们的部署为准

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// ⚠️ 最重要的一步，属性必须逐项匹配，否则删不掉（详见 §3 的踩坑说明）
function clearSSOCookie() {
  document.cookie = 'sso_token=; Max-Age=0; path=/; domain=.smartbid.site';
}

function logout() {
  // 1. 通知 4A 记审计日志（尽力而为，失败不阻塞登出流程）
  const token = localStorage.getItem(TOKEN_KEY) || getCookie('sso_token');
  if (token) {
    fetch('https://auth.smartbid.site/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
    }).catch(() => {}); // 网络失败也继续登出
  }

  // 2. 清自己的 token
  localStorage.removeItem(TOKEN_KEY);

  // 3. 清共享 cookie（不带上 domain 属性等于没删！）
  clearSSOCookie();
}
```

几个约定：

- **logout 端点的响应一律视为"登出成功"**——返回 200 正常，返回 401 说明
  token 已失效（过期/被顶号），这本身就是登出想达到的状态，同样按成功处理，
  不要因为 401 就中断清理流程。
- 登出后引导重新登录时，跳 `${LOGIN_URL}?redirect=${encodeURIComponent(当前页)}`。
  只要 §3 的 cookie 确实清掉了，登录页就会正常展示验证码表单，不会再秒弹回。
- 登出后其他页面的存量请求可能带着旧 token 收到 401，按《改造手册》的统一约定处理
  即可：清 token，下次需要身份的动作重新走 `requireLogin()`。

## 3. 踩坑实录：cookie 删不掉（grid 已踩，请绕行）

`document.cookie` 的删除本质是"写一个同名的过期 cookie"，浏览器按
**name + domain + path 三者精确匹配**来覆盖原 cookie。`sso_token` 是
`domain=.smartbid.site; path=/` 下发的，所以删除时：

| 删除代码 | 结果 |
|---------|------|
| `sso_token=; Max-Age=0; path=/; domain=.smartbid.site` | ✅ 删掉 |
| `sso_token=; Max-Age=0; path=/`（漏 domain） | ❌ 造出一个 host-only（`grid.smartbid.site`）的空 cookie，原 cookie 纹丝不动 |
| `sso_token=; Max-Age=0; domain=grid.smartbid.site` | ❌ domain 不匹配，同样删不掉 |
| `sso_token=; Max-Age=0; path=/; domain=smartbid.site` | ✅ 也可以（浏览器对父域写法做归一化，带不带前导点均可） |

**自查方法**：DevTools → Application → Cookies → 选中 `https://auth.smartbid.site`
，看 domain 列为 `.smartbid.site` 的 `sso_token` 是否还在。登出动作执行后它必须消失。
注意不是看 `grid.smartbid.site` 下的 host-only cookie——那个是删除失败时的产物。

## 4. 全家桶登出（4A 落地 R1 后）

应用内登出只影响"你这一份 token 拷贝 + 共享 cookie"，用户在**其他浏览器/设备**上的
会话不受影响。若产品语义需要"退出 4A 账号"（下个版本 4A 的登出页 + token 版本号
吊销将提供该能力），把登出交互改为一次跳转：

```js
function logoutEverywhere() {
  window.location.href =
    'https://auth.smartbid.site/logout?redirect=' + encodeURIComponent(window.location.href);
}
```

4A 登出页会：清除 `sso_token` cookie → 吊销该用户全部 token → 302 回到
`redirect`。落地后本指南会更新端点的最终行为（当前为待实现状态，勿先接）。

**选型建议**：一般 to C 产品选"应用内登出"即可，用户换个浏览器本来也不期待
你还能管到；只有当产品涉及"公用电脑/借设备"等场景，或用户明确表达了
"退出所有设备"诉求时，才提供全家桶登出（可以作为"退出登录 / 退出所有设备"
两个菜单项并存）。

## 5. 明确不要做的事

- **不要清 cookie 时漏写 `domain` 属性**——本指南 §3 整节都在讲这个
- **不要把 logout 的 401 当错误弹给用户**——那说明本来就没登录，静默成功即可
- **不要在登出后保留任何 token 拷贝**（localStorage、内存状态、你后端 session 里
  转存的）——只清 cookie 不清 localStorage，是"秒弹回"的第二大来源
- **不要自己拼 4A 登录态**——登出后重新拿登录态的唯一途径是走 4A 登录页，
  不要试图用旧 token 或其他端点的响应"恢复"会话
