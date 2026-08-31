# Cloudflare 边缘限流配置指南（针对 grid.smartbid.site）

> 站点 `grid.smartbid.site` 走 Cloudflare 橙云代理（DNS → CF 边缘 → Caddy 源站）。
> 源站 Caddy v2.11.4 **无内置 rate-limit 模块**，因此限流放在 CF 边缘最合适：
> 流量在到达 VPS 前就被拦截，真实客户端 IP 由 CF 自动识别（无需源站读 `Cf-Connecting-IP`），且不消耗 VPS 的 3.3G 内存。
>
> **账户 `smartbid.site` 当前为 Free 计划**（已通过 CF API 确认）。
> Free 计划限制：每域 **1 条 Rate Limiting Rule** + WAF Custom Rules（有配额）。
> **Account-level WAF 不可用**（需 Business $200/月/域起），本指南用按域名的免费能力即可。

## 0. 重要边界：本配置只对 grid 子域生效

`smartbid.site` zone 下有多个子域，**必须用 `http.host` 表达式把规则限定到 grid**，否则会误伤其它服务：

| 子域 | 源站 | 云 | WAF 是否生效 |
|---|---|---|---|
| **grid.smartbid.site** | 107.173.223.214 | 橙云 | ✅ 本配置目标 |
| joyread / sph.smartbid.site | 107.173.223.214 | 橙云 | ✅ 但**不应**被 grid 规则波及 |
| app / auth / tender.smartbid.site | 23.95.30.116 | 橙云 | ✅ 后端服务，怕质询误伤 |
| asr / zklx_hub.smartbid.site | CNAME→CF | 橙云 | ✅ CF 托管服务 |
| pay / www / smartbid.site(根) | 152.136.11.132 | **灰云** | ❌ DNS-only，不经 CF 代理，WAF 不生效 |

→ 所有规则表达式都带 `(http.host eq "grid.smartbid.site")` 前缀，确保只限 grid。

→ **Bot Fight Mode 是 zone 级开关，不能只对 grid 开**，会波及 app/auth/tender 等后端服务的脚本调用。**默认不开**（见第二节）。

## 1. Rate Limiting Rule（防洪水，只对 grid，免费配额内的 1 条）

**导航**：CF Dashboard 顶部选中 `smartbid.site` 域 → 左侧 **Security → WAF** → 顶部 **Rate limiting rules** → **Create rule**。

**字段**：

| 字段 | 值 |
|---|---|
| Rule name | `grid-block-flood` |
| If incoming requests match | 切到 **Edit expression**，填：`(http.host eq "grid.smartbid.site")` |
| Characteristics | 保持默认（按客户端真实 IP 计数，CF 自动识别，无需源站配合） |
| When rate exceeds | `50` |
| per period of | `10 seconds` |
| Then take action | **Managed Challenge**（推荐，先友好；跑几天无误伤可改 Block） |
| For duration | `10 seconds` |

点 **Deploy**。

> 阈值 50req/10s 对正常单页加载（含若干静态资源）远超上限，能挡住脚本洪水。
> **Managed Challenge** vs **Block**：前者给真实用户弹 CF 验证页（点一下过），脚本过不了；后者直接 403，误伤体验更差。先用 Managed Challenge。
>
> Free 计划每域**仅 1 条** Rate Limiting Rule——这一条就用在 grid 整体洪水防护上，不要浪费在单个大图上。

## 2. Bot Fight Mode —— 默认不开（zone 级，会误伤其它子域）

位置：**Security → Bots → Bot Fight Mode**。

它是 **整个 `smartbid.site` 域**级开关，无法只对 grid 子域开启。开启后会对所有橙云子域（含 app/auth/tender/asr 等后端服务）的自动化流量发起 JS 质询，可能误伤正常 API 调用。

**建议：保持关闭**。等确认其它子域没有怕质询的脚本调用后再考虑。grid 的爬虫防护用第 3 步的 Custom Rule 精确针对即可。

## 3.（可选）恶意扫描器 UA 屏蔽，只对 grid

**导航**：**Security → WAF → Custom rules → Create rule**。

| 字段 | 值 |
|---|---|
| Rule name | `grid-block-scanners` |
| Expression（Edit expression） | 见下 |
| Then take action | **Block** |

```
(http.host eq "grid.smartbid.site" and (lower(http.user_agent) contains "semrush" or lower(http.user_agent) contains "ahrefsbot" or lower(http.user_agent) contains "bytespider" or lower(http.user_agent) contains "yandexbot" or http.user_agent eq ""))
```

Deploy。Custom Rule 不占用 Rate Limiting Rule 的 1 条配额，Free 计划也有。

## 4. 验证

配置后用 `wrk` / `ab` 低并发短时间高频请求验证触发（**别长时间打，避免把自己 IP 封了**）：

```bash
# 1 秒内 200 请求，应触发 Managed Challenge / Block
wrk -t2 -c20 -d1s https://grid.smartbid.site/
```

预期：部分请求返回 CF 限流页（HTTP 429 / 403 或质询页），源站 `/var/log/caddy/grid.log` 无对应流量增长（说明在边缘就拦了）。

## 5. 注意事项

- CF 限流按**边缘计数**，跨多台 CF 边缘节点的请求可能不完全合并；对普通攻击足够。
- `Managed Challenge` 触发后真实用户点一下即放行；若发现正常用户被频繁质询，把阈值调高（如 100/10s）或改回更宽松。
- **不要**在源站 Caddy 同时配按 `remote_ip` 的限流——`remote_ip` 是 CF 边缘 IP，会全员误伤。
- 灰云子域（pay/www/根域）不经 CF，WAF 对它们无效，安全靠源站。
