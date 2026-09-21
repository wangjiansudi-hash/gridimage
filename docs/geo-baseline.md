# GEO 基线诊断 — grid.smartbid.site 首页 markdown 版

- 日期:2026-09-22
- 工具:HeiGe-GEO-SEO v1.11.3(`geo_cli.py report --market cn`)
- 诊断对象:`GET /`(携带 `Accept: text/markdown` 时 server.js 返回的 markdown 站点简介),
  包装为最小 HTML 后送评(镜像存档:`/tmp/grid-md-baseline.html`,7.7KB)

## 基线分数

| 指标 | 值 |
|---|---|
| 综合分 | **34 / 100(危急)** |
| GEO 分 | 38 |
| SEO 分 | 32 |
| 市场 | cn(国内) |

## 扣分明细(按 6 维评分卡)

### [C] 结构化数据 Schema — 6.0 / 16
- ❌ 无 FAQPage schema(0/6)—— 实测可带来 2.7× 引用率,首要缺口
- ❌ 无核心 schema 覆盖 WebSite/Organization(0/4)
- ✅ Schema 丰富度(3/3,现有 WebApplication 最大属性数 12)
- ✅ Schema 有效性(3/3)

### [D] 内容可抽取性 — 8.5 / 22
- ❌ 主张密度 1.3 条/100 词(要求 ≥4,0/6)
- ✅ 答案前置(5/5,首段 140 字符内有直接答案)
- 🟡 句长偏长:平均 37.2 词/句(目标 15~20)
- ❌ 篇幅过短,<500 词(0/4,最优区间 800~1500 词)
- 🟡 数字 12 个,但权威外链 0 个(2/4)

### [E] 内容结构与可解析性 — 8.5 / 16
- ✅ 标题层级规范(单一 H1 不跳级,4/4)
- ❌ 无列表/表格结构(0/3;markdown 版的表格在纯文本视角不可解析)
- ❌ 无定义块 / Q&A 标题(0/3)
- 🟡 语义三元组密度 17%(目标更高)
- ✅ 无薄内容/堆砌等反引用信号(3/3)

### [F] 信任、实体与权威 — 0.0 / 12(全部缺失)
- ❌ 作者署名 + Person schema
- ❌ 知识图谱外链(sameAs / Wikipedia / LinkedIn)
- ❌ 实体一致性(品牌名跨页一致)
- ❌ 内容新鲜度信号(dateModified / 近期年份)

## 另一项基线发现:markdown 端点在生产不可达

`curl -H 'Accept: text/markdown' https://grid.smartbid.site/` 实际返回
`text/html`(Caddy 静态托管的 `dist/index.html`,无 `Link: rel="ai-catalog"` 头)。
生产环境 `GET /` 由 Caddy 直接回静态文件,`server.js` 的 markdown 协商路由
仅在直连 `127.0.0.1:3990` 时生效。要让 markdown 协商公网可达,需在
Caddy `grid.smartbid.site` 块加 `Accept: text/markdown` 匹配器反代到 :3990
(见 docs/geo-deployment.md)。

## 已按建议落地的整改(本次提交)

1. **FAQPage + WebSite + Organization + SoftwareApplication JSON-LD**(C 维):
   生成后合并为单一 `@graph` 注入源 `index.html` head(替换原 WebApplication 块,
   其 featureList/offers 等属性并入 SoftwareApplication 节点)。
2. **markdown 版扩充**(D/E 维):答案前置、使用步骤(有序列表)、FAQ 段(Q&A 标题)、
   配额表格、隐私声明如实保留,补充内容新鲜度日期。
3. **llms.txt**(站点级):`gen_llms_txt.py` 生成,落在 `public/llms.txt`
   (构建后 `dist/llms.txt`,Caddy 静态可直达);`server.js` 另加 `/llms.txt` 路由兜底。
4. [F] 维的 Person/作者署名、知识图谱 sameAs 外链:本站为单页工具站,无真实
   作者实体与知识图谱条目,**如实不做**(不编造)。

## 复评方式

```bash
# 构建后对本站 HTML 复评
python3 /home/git/projects/HeiGe-GEO-SEO/scripts/geo_cli.py report \
  --input <(curl -s https://grid.smartbid.site/) --market cn
# markdown 版复评:curl -H 'Accept: text/markdown' https://grid.smartbid.site/ 后同样包装 HTML 送评
```

## 整改后复评(2026-09-22,同工具同口径)

markdown 版扩充(答案前置已有 → 步骤/FAQ/表格/新鲜度日期)后,包装 HTML 送评时
附带生产环境 index.html 现已内置的 FAQPage schema(与真实部署口径一致):

| 指标 | 基线 | 整改后 |
|---|---|---|
| 综合分 | 34(危急) | **43(待优化)** |
| GEO 分 | 38 | **63** |
| SEO 分 | 32 | 30* |

\* SEO 分针对 markdown 纯文本口径(无 title/meta/canonical 可评);HTML 入口页
`index.html` 本身 title/description/canonical/OG/Twitter meta 完整(任务 5 已核对),
SEO 分以 HTML 页为准。剩余主要缺口在 [F] 信任/实体维(Person schema、sameAs
知识图谱外链)——单页工具站无真实作者实体,**如实不补**,不为分数编造。
