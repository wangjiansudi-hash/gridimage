# Cloudflare Workers/Pages 迁移可行性评估

> 评估日期:2026-09-21 · 评估对象:gridimage(grid.smartbid.site)
> 方法:逐文件 grep 核实 Node/浏览器 API 使用点,结论均附 `文件:行号` 证据。
> 范围:仅评估,未改动任何运行代码。

---

## 一、结论

**改造后可迁。总工作量约 2.5~3 人日。**

| 组成部分 | 迁移难度 | 说明 |
|---|---|---|
| 前端(React/Vite 纯静态) | ✅ 直接迁,零代码改动 | `dist/` 走 Workers Assets 免费不限量;图片处理全部在浏览器 `<canvas>`(`src/utils/imageProcessor.ts`),无任何服务端图像处理 |
| 配额/认证 API(`server.js`,549 行) | ⚠️ 改造后可迁 | 4 处硬阻塞(node:http 监听、node:fs 持久化、进程生命周期钩子、进程内缓存),但服务本身极小:无重 CPU、无长连接、上游仅 4A 的 3 个 fetch,端口成本约 1~1.5 人日 |
| CF Containers(真实 Node 容器) | 不推荐 | 能跑但纯属杀鸡用牛刀:一个 549 行零依赖单文件服务,容器方案引入镜像构建/计费/冷启动,收益为零 |

结论依据:本仓前端不含任何 Node 运行时依赖(全仓 grep `node:` 仅命中 `server.js:29-32` 与测试文件 `src/utils/pkce.test.ts:3`);服务端唯一状态是每日配额计数与 token 验证缓存,均可由 Durable Object/KV 承接。

---

## 二、阻塞点清单(附证据)

### A. 硬阻塞(必须改造)

| # | 位置 | 证据 | Workers 上的问题 | 改造方向 |
|---|---|---|---|---|
| A1 | `server.js:29`、`server.js:376`、`server.js:547` | `import http from 'node:http'` → `http.createServer(...)` → `server.listen(PORT, HOST)` | Workers 无常驻监听进程,`node:http` 的 server.listen 不可用(即使开 `nodejs_compat`) | 改写为 `export default { fetch() }` 入口,路由逻辑(`server.js:388-527`)基本平移 |
| A2 | `server.js:30`、`server.js:94` | `import fs from 'node:fs'` → `fs.readFileSync(QUOTA_DB, 'utf8')`(`loadDb`) | Workers 无文件系统;usage.json 读取不可行 | 改 KV / D1 / DO storage |
| A3 | `server.js:119-122` | `fs.mkdirSync` + `fs.writeFileSync(tmp)` + `fs.renameSync(tmp, QUOTA_DB)`(`flushNow` 原子落盘) | 同上,且 Workers 无 rename 语义 | DO SQLite storage(自带事务/原子性)或 KV put |
| A4 | `server.js:82`、`server.js:134-151` | `let db = { days: {} }` 进程内存态,`ensureDay/usedCount/addCount` 直接改内存 | 内存跨 isolate 不共享:`POST /api/quota/consume` 的读-改-写(`server.js:408-410`)在多 isolate 并发下会超发/丢计数 | **Durable Object**(单实例串行化,天然原子)——比现在单进程 Node 的"意外原子性"更正确 |
| A5 | `server.js:534-536` | `process.on('SIGTERM'/'SIGINT'/'exit', flushNow)` | Workers 无进程退出钩子,never fires | DO 每次请求同步写 storage(量小,无性能问题);`flushSoon` 的 1.5s 防抖(`server.js:128-132`)随之删除 |
| A6 | `server.js:539-545` | `setInterval(60s)` 日切看门狗(`pruneDays`) | 无常驻进程,setInterval 不能跨越请求生命周期 | 日切在请求路径惰性完成:`dayKey()`(`server.js:58-60`)已按请求日期取桶,过期桶在 DO 内读时顺手 prune(或用 DO alarm) |

### B. 软阻塞(功能不丢,需适配)

| # | 位置 | 证据 | 问题 | 改造方向 |
|---|---|---|---|---|
| B1 | `server.js:158-159` | `verifyCache`/`negCache` 两个进程内 `Map`(10min 正缓存/60s 负缓存) | 跨 isolate 失效 → 缓存命中率下降,但**正确性不受影响**(miss 只是多一次 4A verify,fail-open 语义不变) | 放进同一个 DO(推荐,与配额同处串行化);或 Cache API/KV。单 DO 最省事 |
| B2 | `server.js:225` | `req.socket.remoteAddress`(Cf-Connecting-Ip 与 XFF 都缺失时的兜底) | Workers 无 socket;但本站本就在 CF 橙云后(docs/cloudflare-rate-limit.md 开篇),`Cf-Connecting-Ip` 恒存在 | 直接删兜底,取不到即 `'unknown'`(现状已如此) |
| B3 | `server.js:389` | `process.uptime()`(/healthz) | Workers 无进程 uptime | 返回 0 或删除字段;健康检查语义不变 |
| B4 | `server.js:36-46` | `process.env.PORT/HOST/QUOTA_DB/...` | 语法可用(`nodejs_compat` 下 `process.env` 即绑定的 vars/secrets),但 `PORT/HOST/QUOTA_DB` 失去意义 | 保留 `AUTH_VERIFY_URL/AUTH_TOKEN_URL/AUTH_LOGOUT_URL/OAUTH2_CLIENT_ID` 及两个 LIMIT、TTL 配置为 wrangler vars/secrets |
| B5 | `server.js:504` | `fs.readFileSync(path.join(__dirname,'index.html'))`(GET / 兜底) | 无 fs,且 `__dirname` 无意义 | 静态入口交给 Workers Assets:wrangler 配 `run_worker_first: ["/", "/api/*", "/.well-known/*"]`,Worker 内 `Accept: text/markdown` 分支(`server.js:490-519`)自行处理,其余 `env.ASSETS.fetch()` 回退 |
| B6 | `server.js:490-519`、`server.js:522-525` | GET / 的 `Link: rel="ai-catalog"` 头 + markdown 协商;`/.well-known/ai-catalog.json`、`/.well-known/api-catalog` | Assets 默认优先命中同名静态文件,Worker 不执行;这两个路径不在 `dist/` 中 | 见 B5:必须 `run_worker_first` 显式让 Worker 先跑这些路由 |

### C. 已核实无阻塞的部分(证据)

| 项 | 证据 | 结论 |
|---|---|---|
| 前端零 Node 依赖 | 全仓 grep `node:`/`child_process`/`cluster`/`fs.`:运行时代码仅 `server.js` 命中;`src/` 下唯一 `node:` 在测试文件 `src/utils/pkce.test.ts:3` | 前端产物可直接上 Assets |
| PKCE 用 Web Crypto | `src/utils/pkce.ts:27`(`crypto.getRandomValues`)、`src/utils/pkce.ts:34`(`crypto.subtle.digest`) | 标准 Web API,任何环境可用 |
| 上游调用全为 fetch | `server.js:175`(verify)、`server.js:430`(logout)、`server.js:471`(token 交换) | Workers 原生支持,含 `AbortSignal.timeout`(`server.js:177/433/475`) |
| 时区日切 | `server.js:50-52` `Intl.DateTimeFormat` + `timeZone: 'Asia/Shanghai'`;`server.js:62-68` 纯 UTC 算术 | Workers 完整支持 Intl 时区 |
| CPU 时间 | handler 全部工作 = 1 次上游 fetch + JSON 序列化(请求体上限 16KB,`server.js:239`) | 远低于 Workers 限额(fetch 等待不计 CPU);无阻塞点 |
| 图片处理不经过服务器 | `src/utils/imageProcessor.ts` 全部 `<canvas>` + `toBlob`;上传只发生在浏览器内存 | 静态托管即可,无带宽/计算成本 |
| `import.meta.env.DEV` fail-open 逻辑 | `src/App.tsx:219` | Vite 构建期常量替换,与托管平台无关 |

### D. 需要同步调整的仓外/周边项

- `.github/workflows/deploy.yml:43-50`:rsync 到 VPS + `systemctl restart grid-quota` → 改为 `cloudflare/wrangler-action`(或 `npx wrangler deploy`),健康检查 `deploy.yml:52-63` 保留(curl 目标不变,URL 相同)。
- VPS 侧:`grid-quota.service` systemd 单元与 Caddy `grid.smartbid.site` 块下线;`/var/lib/grid-quota/usage.json` 如需保留历史,一次性导入 DO storage(仅 7 天数据,`server.js:47`,不导也可接受)。
- DNS:grid 子域从橙云→源站 VPS,改为橙云→ Workers 路由(wrangler 自动建)。

---

## 三、推荐目标架构

```
                    Cloudflare(免费计划即可起步)
  浏览器 ──▶ grid.smartbid.site ──▶ 单个 Worker(Wrangler)
                                      │
                                      ├─ run_worker_first: ["/", "/api/*", "/.well-known/*"]
                                      │    • /api/quota、/api/quota/consume
                                      │    • /api/auth/logout、/api/auth/token(无状态转发 4A)
                                      │    • GET / markdown 协商 + Link 头、/.well-known/* 目录
                                      │    • 其余 → env.ASSETS.fetch()(dist/ 静态资源,免费不限量)
                                      │
                                      └─ Durable Object「QuotaStore」(单实例,SQLite storage)
                                           • 每日配额桶(days/{day}/ips|users/{key}),原子 consume
                                           • verifyCache/negCache(替代进程内 Map)
                                           • 读路径顺手 prune 7 天前旧桶(替代 setInterval 看门狗)
```

选型理由:

- **Durable Object(而非 KV)承载配额计数**:consume 是读-改-写原子操作(`server.js:402-414`),KV 最终一致(约 60s 传播)且无原子自增,会导致超发;DO 单实例串行化天然解决,且免费层(10 万请求/日)对当前量级绰绰有余。
- **D1 可作备选**(SQL 事务 + `UPDATE ... WHERE used < limit` 条件更新),但对 4 个端点的服务而言 DO + KV 风格 storage 代码更少;若未来多个服务共享配额基础设施,再考虑 D1 集中化。
- **无状态路由(/api/auth/token、/api/auth/logout)直译即可**:`server.js:451-485` 明确注释"无状态转发:不缓存、不落库",除了 form 编码写法(Node `URLSearchParams` → Workers 同 API)几乎零改动。
- **CF Containers 不采用**:为 549 行零依赖脚本引入容器运行时(镜像、计费、冷启动、健康探针)不成比例。

wrangler.jsonc 骨架(示意,非本次产出):

```jsonc
{
  "name": "grid",
  "main": "worker.js",           // 由 server.js 移植,约 300 行
  "compatibility_date": "2026-08-04",
  "assets": { "directory": "dist", "run_worker_first": ["/", "/api/*", "/.well-known/*"] },
  "durable_objects": { "bindings": [{ "name": "QUOTA", "class_name": "QuotaStore" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["QuotaStore"] }],
  "vars": { "ANON_DAILY_LIMIT": "1", "USER_DAILY_LIMIT": "10", /* VERIFY_*, AUTH_*_URL */ },
  // secrets: OAUTH2_CLIENT_SECRET(如有)
}
```

`compatibility_date` 设为 2026-08-04 之后,`node:crypto/buffer/stream/http` 等 polyfill 原生可用,但本服务移植后实际只依赖 Web 标准 API(fetch/URL/Intl/crypto.subtle 均原生),对该日期无强依赖。

---

## 四、分阶段迁移路径

### Phase 0 — 静态前端先行(0.5 人日,可独立上线)
- 建 Worker + Assets 只托管 `dist/`(`run_worker_first` 暂不含任何路径,纯静态);**/api/* 经 Worker `fetch` 反代到现有 VPS 源站**(`env.API_ORIGIN.fetch(request)` 十几行)。
- 前端零改动(同源 `/api` 路径不变,`src/utils/quota.ts:50/62`、`src/App.tsx:68`、`src/utils/pkce.ts:208` 无感知)。
- 验证:robots.txt、/api/quota 健康检查、4A 登录回跳、PKCE token 交换。
- 此阶段即可享受静态请求免费不限量,VPS 只承担动态 API。

### Phase 1 — API 移植到 Worker(1~1.5 人日)
- `server.js` → `worker.js`:路由表平移(A1);`/api/auth/token`、`/api/auth/logout` 无状态直译;`/api/quota*` 接入 DO。
- 实现 `QuotaStore` DO:load-on-read(替代 `loadDb`)、同步写 storage(替代 `flushSoon`/SIGTERM 钩子)、请求路径惰性 prune(替代 setInterval);`usedCount/addCount`(`server.js:142-151`)逻辑原样搬进 DO。
- `/`、`/.well-known/*` 的 Link 头与 markdown 协商按 B5/B6 处理;API_CATALOG/SITE_MARKDOWN 常量(`server.js:310-374`)原样搬运。
- 一次性导入 `/var/lib/grid-quota/usage.json`(可选)。
- 本地用 `wrangler dev` 验证;重点回归:匿名 1 次/日按 `Cf-Connecting-Ip`、429 `quota_exceeded`、401 负缓存、fail-open 降级匿名。

### Phase 2 — 切流与下线 VPS(0.5 人日)
- `.github/workflows/deploy.yml`:rsync+systemd → wrangler deploy(build 产物不变);健康检查步骤保留。
- DNS/路由切到 Worker;观察数日后下线 `grid-quota.service`、Caddy 块与 VPS 上的 `/var/www/grid`。
- 回滚预案:Worker 部署不可变版本,可即时回退;极端情况 DNS 切回 VPS(保留至观察期结束)。

风险提示:
- **配额原子性**:Phase 1 必须把计数读-改-写整体放进 DO,不能在 Worker 侧读 KV→判断→写 KV(KV 非原子,会超发)。
- **PKCE redirect_uri 白名单**(`server.js:458` 的正则)与 4A 侧登记的 redirect 域名不变,无需 4A 配置改动;若 Phase 0 期间临时换了 API 域名才需要动 4A。
- 现有 CF 边缘限流规则(docs/cloudflare-rate-limit.md)按 `http.host eq "grid.smartbid.site"` 匹配,流量改走 Worker 后规则仍生效,无需变更。

---

## 五、成本要点

- **静态资源:免费、不限量、不计请求费**(Workers Assets 定价)。本仓 100% 页面流量是静态,迁移后大头成本归零。
- **动态请求**:Workers 免费层 10 万请求/日。本服务仅 4 个端点、每次切图触发 1 次 consume + 偶发 quota 查询,当前流量下免费层足够。
- **Durable Object**:免费层含 10 万请求/日;SQLite storage 计入少量读写行,量级可忽略。
- **出站流量**:CF 对 Workers/Assets 出站免费;当前 VPS 带宽占用(静态 + API)全部卸载,可释放 VPS 资源(该机 3.3G 内存,docs/cloudflare-rate-limit.md §0 提及内存紧张)。
- **付费触发点**:超出免费层需 Workers Standard $5/月起(含 1000 万请求/月);DO 超量约 $0.15/百万请求。以本服务量级,预计长期停留在免费层。
- **对照方案**:CF Containers 最低 $5/月级别且另计容器时长,对本负载毫无必要;保留 VPS(现行方案)则是持续固定的服务器成本——迁移的净效果是"删掉一台 VPS 上的一份职责"。

---

## 附:证据检索记录

- `grep -rn "node:|child_process|cluster|Buffer|fs\." src/` → 运行时无命中,仅 `src/utils/pkce.test.ts:3`(测试)与 `src/utils/pkce.ts:6` 注释引用。
- `server.js` 全文通读(549 行),Node 专有 API 清单:node:http/node:fs/node:url、process.env/uptime/on/exit、socket.remoteAddress、setTimeout/setInterval——均已在上文 A/B 列表逐条定位。
- 部署链:`.github/workflows/deploy.yml`(rsync + systemd + 健康检查);现行 CF 橙云 + Caddy 架构见 `docs/cloudflare-rate-limit.md`。
