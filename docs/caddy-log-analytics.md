# Caddy 日志访问统计

> VPS 资源紧张（3.3G 内存 / 13G 磁盘空闲），不部署 Umami/Plausible/Matomo 等常驻服务。
> 改用**日志聚合**：Caddy 已在写 `/var/log/caddy/grid.log`（JSON 格式，字段齐全），用 `jq` 离线聚合即可得到 PV/UV/国家/UA/URI 等访问统计。
> 零新增常驻进程、零 cookie、零隐私合规负担。

## 一、日志现状

- 路径：`/var/log/caddy/grid.log`
- 格式：Caddy 默认 JSON，每行一个对象
- Caddyfile 配置（当前）：
  ```caddy
  grid.smartbid.site {
    ...
    log {
      output file /var/log/caddy/grid.log
    }
  }
  ```
- 已确认包含字段（每条请求）：
  - `ts`（Unix epoch 秒，浮点）
  - `request.method` / `request.uri` / `request.host`
  - `request.headers.cf-connecting-ip[0]` —— **真实客户端 IP**（关键）
  - `request.headers.cf-ipcountry[0]` —— 客户端国家代码（如 `US`、`CN`）
  - `request.headers.user-agent[0]` / `referer[0]`
  - `status` / `size` / `duration`
  - `request.remote_ip` —— ⚠️ 这是 **Cloudflare 边缘 IP**，不是访客 IP，**不能用于 UV/限流**

> 站点走 Cloudflare 橙云代理，Caddy 看到的 `remote_ip` 永远是 CF 边缘。真实 IP 只在 `cf-connecting-ip` 头里。

## 二、统计脚本

见 [scripts/grid-stats.sh](../scripts/grid-stats.sh)。

### 依赖
```bash
sudo apt-get install -y jq
```

### 用法
```bash
# 统计今日
bash scripts/grid-stats.sh

# 统计近 7 天
bash scripts/grid-stats.sh 7

# 指定日志文件（例如轮转后的旧日志）
bash scripts/grid-stats.sh 1 /var/log/caddy/grid.log.1
```

### 输出内容
- 总览：PV（请求总数）、UV（独立真实 IP）、总流量
- 状态码分布
- Top 10 国家/地区（基于 cf-ipcountry）
- UA 分类（爬虫 / 微信内置浏览器 / 常规浏览器 / HTTP库脚本 / 其他）
- Top 15 URI
- Top 10 真实 IP（按请求次数）
- Top 10 Referer

### 部署到 VPS
```bash
# 拷贝脚本到 VPS
scp scripts/grid-stats.sh capcut@107.173.223.214:/usr/local/bin/grid-stats.sh
ssh capcut@107.173.223.214 'sudo chmod +x /usr/local/bin/grid-stats.sh'
```

## 三、定时日报（cron）

每天 23:55 生成近 1 天报告并追加到 `/var/log/grid-stats/report.txt`：

```bash
sudo mkdir -p /var/log/grid-stats
sudo tee /etc/cron.d/grid-stats >/dev/null <<'EOF'
# grid.smartbid.site 访问统计日报，每天 23:55
55 23 * * * capcut /usr/local/bin/grid-stats.sh 1 >> /var/log/grid-stats/report.txt 2>&1
EOF
sudo chown -R capcut:capcut /var/log/grid-stats
```

> cron 时间用 23:55 而非 0:00，避开整点高峰、减少与其它定时任务撞车。

## 四、日志轮转（重要，防磁盘爆满）

当前 `grid.log` **无轮转**，VPS 磁盘仅 13G 空闲，长期写日志有风险。推荐用 **Caddy 内置 roll**（改 Caddyfile）：

编辑 `/etc/caddy/Caddyfile` 的 grid 块：
```caddy
grid.smartbid.site {
  ...
  log {
    output file /var/log/caddy/grid.log {
      roll_size 50mb
      roll_keep 5
      roll_keep_for 720h    # 30 天
    }
  }
}
```

重载：
```bash
sudo systemctl reload caddy
```

效果：单文件达 50MB 即轮转，保留最近 5 个（~250MB 上限），30 天后清理。轮转后的文件为 `grid.log.1`、`grid.log.2` …，仍可被 `grid-stats.sh` 指定第二个参数解析。

> 备选：用系统 `logrotate`，但 Caddy 内置 roll 更简单且与 Caddy 进程协同更好。

## 五、隐私说明

- 本方案**不写 cookie**、不在前端埋 JS、不向第三方上报。
- 日志含 IP/UA，属于服务器访问记录的正常范畴。
- 建议保留不超过 30 天（`roll_keep_for 720h`），定期清理 `/var/log/grid-stats/report.txt`。
- 如需对外公开统计，仅公开聚合数字（PV/UV/国家分布），不公开单个 IP。

## 六、若日后想要"实时仪表盘"

日志方案是"离线日报"。若后续想要实时看板且资源允许，可选：
1. 把 `grid.log` 喂给 `goaccess`（`goaccess --log-format=JSON`），有实时终端/CRT 面板，内存占用极低。
2. 跑一个轻量 Prometheus 抓 Caddy admin `:2019/metrics`（仅进程级指标，非业务访问）。
3. 资源实在充裕时再上 Umami（需 ~400MB 常驻）。
