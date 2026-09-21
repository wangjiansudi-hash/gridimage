# GEO 落地部署说明 — grid.smartbid.site

对应整改内容见 [geo-baseline.md](geo-baseline.md)。日期:2026-09-22。

## 部署方式(GitHub CI 自动)

push 到 `main` → [.github/workflows/deploy.yml](../.github/workflows/deploy.yml):
`npm ci` → `tsc --noEmit` → `vite build` → rsync `dist/`(含 `llms.txt`)与 `server.js`
到 VPS `rn2:/var/www/grid/` → 重启 `grid-quota.service` → 健康检查
`/robots.txt` 与 `/api/quota`。无需人工干预;勿手动删除 `/var/lib/grid-quota/usage.json`。

## 各产物上线后在哪生效

| 产物 | 生效位置 | 是否需要额外配置 |
|---|---|---|
| index.html 的 JSON-LD `@graph`(WebSite/Organization/SoftwareApplication/FAQPage) | Caddy 静态托管 `dist/index.html` | 无,rsync 即生效 |
| `llms.txt` | Caddy 静态托管 `dist/llms.txt` → `https://grid.smartbid.site/llms.txt` | 无 |
| server.js 扩充版 markdown 端点(`Accept: text/markdown`) | **仅直连 `127.0.0.1:3990` 可达** | **需要下面一步 Caddy 配置** |
| server.js `/llms.txt` 兜底路由 | 直连 :3990 时生效 | 同上(静态已覆盖公网) |

## 需要人工做的一次性 Caddy 配置(让 markdown 端点公网可达)

生产 `GET /` 目前由 Caddy `file_server` 直接回静态文件,`server.js` 的内容协商
路由到不了。在 VPS `/etc/caddy/Caddyfile` 的 `grid.smartbid.site` 块内、
`file_server` 之前(`reverse_proxy` 默认顺序在 `file_server` 之前,直接追加即可)加:

```caddyfile
	# Accept: text/markdown 请求转发给 quota 服务做内容协商
	@ai_markdown {
		path /
		header Accept *text/markdown*
	}
	reverse_proxy @ai_markdown 127.0.0.1:3990
```

然后 `sudo systemctl reload caddy`。

> 若暂不做此配置:公网 `GET /` 仍回 HTML(内含完整 JSON-LD 与 meta),`llms.txt`
> 静态可达,只有 markdown 协商保持"直连 3990 才可用"的现状,不影响其余整改生效。

## 部署后验证

```bash
# 1. llms.txt(Caddy 静态,无需 Caddy 改动)
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://grid.smartbid.site/llms.txt

# 2. JSON-LD(应输出 WebSite/Organization/SoftwareApplication/FAQPage)
curl -s https://grid.smartbid.site/ | grep -o '"@type":"[^"]*"' | sort -u

# 3. markdown 协商(改完 Caddy 后应为 text/markdown;未改则 text/html)
curl -s -D - -H 'Accept: text/markdown' https://grid.smartbid.site/ -o /tmp/md.txt | grep -i content-type

# 4. 配额服务不受影响
curl -s https://grid.smartbid.site/api/quota | head -c 120

# 5. schema 校验(可选):https://validator.schema.org 或 Google Rich Results Test
```

## 回滚

revert 对应提交并 push 即可;CI 会 rsync `--delete` 覆盖 `dist/`,`llms.txt`
与 JSON-LD 随构建产物一并移除。quota 状态文件在 `/var/lib/grid-quota/`,不在回滚范围。
