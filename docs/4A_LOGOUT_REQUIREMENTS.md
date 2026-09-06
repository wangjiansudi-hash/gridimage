# 4A 需求：真正的登出能力（会话清理 + Token 吊销）

> 提出方：grid.smartbid.site（视频号封面切割工具）
> 日期：2026-09-06
> 优先级建议：R1 = P0，R2/R3 = P1
>
> **✅ 状态更新（2026-09-06 晚实测）**：R1 与 R2 均已上线——
> - `GET /logout?redirect=<白名单地址>` 返回 302 正常回跳，无 redirect 返回 400；
> - `POST /api/auth/logout` 后同一 token `verify` 返回 401（吊销生效；对照当日早间实测为仍 200）；
> - `/login` 页 Auto-SSO 已自愈：弹回前先过 `/verify`，token 失效（过期/登出吊销/改密吊销）时
>   就地清共享 cookie 并正常展示表单。
> grid 侧已接入 `logoutEverywhere()`（与"应用内登出"并列为两个菜单项）。

## 一、背景与实测证据

grid 已按《APP 端改造手册》完整接入 4A 登录，并实现了应用内登出（清本地 token、删 `sso_token` 共享 cookie、服务端转发注销）。实测发现 4A 侧存在两个缺口，导致"退出登录"名存实亡：

**现象 1：`POST /api/auth/logout` 不吊销 token**

```
$ curl -X POST https://auth.smartbid.site/api/auth/logout -H "Authorization: Bearer <有效JWT>"
{"success":true,"message":"登出成功"}        # 200

$ curl https://auth.smartbid.site/api/auth/verify -H "Authorization: Bearer <同一JWT>"
HTTP 200                                      # 依然有效，重复注销两次均如此
```

且 verify 返回中 `last_login_at` / `updated_at` 被刷新成了 **logout 调用的时刻**——logout 似乎走到了登录记账逻辑。

**现象 2：4A 登录页自动回弹，子应用无法拦截**

子应用退出后引导用户重新登录（跳 `/login?redirect=...`），4A 登录页检测到自身会话（auth 域 HttpOnly cookie，子应用 JS 无法清除），不展示验证码表单，直接 302 回跳并再次下发**同一个 JWT**（`client_id` 甚至还是别的应用的，如实测中为 `sph`）。用户视角：点退出 → 点登录 → 秒进，无法切换账号，"退出"失去意义。

**结论**：JWT 无状态 + 无吊销机制 + 登出页缺失，三者叠加。grid 侧已穷尽客户端手段，需要 4A 侧补齐。

## 二、需求

### R1（P0）全局登出页 `GET /logout?redirect=`

新增 `GET https://auth.smartbid.site/logout?redirect=<urlencoded>`：

1. 校验 `redirect`：仅允许 `*.smartbid.site` 后缀（与登录页白名单同一套规则），非法则 400，防开放重定向
2. 清除 4A 自身的会话 cookie（Set-Cookie 置过期）
3. 吊销当前会话绑定的 token（依赖 R2；R2 未落地前可先只清会话）
4. 302 回跳 `redirect`
5. 幂等：无会话/未登录时也正常回跳，不报错

这是解决"退出后点登录秒弹回"的唯一手段——会话 cookie 在 auth 域且 HttpOnly，只有 4A 自己能清。

> **2026-09-06 补充核实**：已核查 `/login` 页源码——Auto-SSO 逻辑**仅读取 `sso_token` cookie**（无 localStorage、无额外会话接口），cookie 在即 302 弹回。因此 4A 侧不存在其他需要清理的会话态：R1 清掉 `sso_token` + R2 吊销 token 即可彻底闭环。另建议登录页支持 `force=1` 之类参数跳过 Auto-SSO，供子应用"切换账号"场景使用。

### R2（P1）Token 吊销机制

JWT 无状态导致"登出/改密/被封禁"都无法使已签发 token 失效。二选一：

- **方案 A（推荐）：token 版本号**。用户表加 `token_version`，签发时写入 JWT（如 `tv` claim）；`/verify` 校验 JWT 内版本与库内一致；登出、修改密码、管理员封禁时 `version += 1`，该用户所有旧 token 立即失效。实现简单，顺带修复"改密码后旧 token 仍有效"的安全问题。
- **方案 B：吊销黑名单**。维护 jti（或 token hash）黑名单，TTL = token 剩余有效期；logout 时写入。需要引入存储，且"改密码踢下线"还要额外做。

### R3（P1）`POST /api/auth/logout` 语义修正

R2 落地后，该端点应真正吊销 Bearer token 所指会话，并：

- 保持现有鉴权行为（实测：无 header → 403，伪造 token → 401，正常 token → 200）
- 幂等：重复调用返回 200
- **不得再刷新 `last_login_at`**（当前疑似误挂登录记账，顺手修正）

### R4（P2）文档补充

《APP 端改造手册》补充"登出"章节，明确两级登出的推荐做法：

- 应用内登出：清本地 token + 调 `POST /api/auth/logout`
- 全家桶登出：302 跳 `GET /logout?redirect=<回跳地址>`

## 三、兼容性

- `/verify` 对外行为不变（401 语义已有约定：子应用清 token 重新登录）
- 未主动登出的存量 token 不受影响
- sph、joyread 等已接入应用无需改代码即可受益

## 四、验收标准

| # | 用例 | 预期 |
|---|------|------|
| 1 | `POST /api/auth/logout` 后立即 `verify` 同一 token | 401（`reason: token_invalid`） |
| 2 | `GET /logout?redirect=https://grid.smartbid.site/` | auth 域会话 cookie 被清除；302 回 grid |
| 3 | 用例 2 之后再访问 `/login?redirect=...` | 不自动回跳，展示验证码登录表单 |
| 4 | `GET /logout?redirect=https://evil.com` | 400 拒绝 |
| 5 | 未登录状态 `GET /logout?redirect=<合法地址>` | 幂等回跳，无 5xx |
| 6 | 用户 A 登出后，A 在其他设备的旧 token 调 `verify` | 401（采用方案 A/B 后） |

## 五、对子应用的影响（grid 侧已就绪）

4A 落地后，grid 只需在"退出"交互上追加一次 302 跳转 `GET /logout?redirect=` 即可获得全家桶级登出，预计改动 < 10 行。
