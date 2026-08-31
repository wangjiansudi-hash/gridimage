#!/usr/bin/env bash
# grid-stats.sh — 聚合 Caddy 访问日志，输出访问统计日报。
#
# 日志源：/var/log/caddy/grid.log （Caddy 默认 JSON，每行一个对象）
# 关键：真实客户端 IP 在 request.headers["cf-connecting-ip"][0]，
#       国家在 request.headers["cf-ipcountry"][0]；
#       request.remote_ip 是 Cloudflare 边缘 IP，不可用于统计！
#
# 用法：
#   bash scripts/grid-stats.sh            # 默认统计今日
#   bash scripts/grid-stats.sh 7          # 统计近 7 天
#   bash scripts/grid-stats.sh 1 /var/log/caddy/grid.log.1   # 指定日志文件
#
# 依赖：jq（apt install jq）。无 jq 时脚本会提示安装。
#
# 隐私：不写 cookie、不持久化可识别信息；仅当日聚合输出，建议 cron 跑完追加到报告文件。

set -euo pipefail

LOG="${2:-/var/log/caddy/grid.log}"
DAYS="${1:-1}"
NOW="$(date '+%Y-%m-%d %H:%M:%S %Z')"

command -v jq >/dev/null 2>&1 || {
  echo "错误：需要 jq。请先安装：sudo apt-get install -y jq" >&2
  exit 1
}

if [[ ! -r "$LOG" ]]; then
  echo "错误：日志文件不可读：$LOG" >&2
  exit 1
fi

# 时间过滤：近 N 天的 Unix 时间戳下界（Caddy JSON ts 为 epoch 秒，浮点）
SINCE_TS="$(date -d "${DAYS} days ago" +%s)"

echo "================================================================"
echo "  grid.smartbid.site 访问统计报告"
echo "  生成时间: $NOW"
echo "  统计范围: 近 ${DAYS} 天   日志: $LOG"
echo "================================================================"

# 预处理：把每行 JSON 提取成 TSV，并按时间过滤。
# 字段：ts client_ip country method uri status size ua referer
# client_ip 取 cf-connecting-ip，缺失时回退 remote_ip（标注）。
read -r -d '' JQ_FILTER <<'JQ' || true
[.ts,
 ((.request.headers["cf-connecting-ip"] // .request.headers["Cf-Connecting-Ip"] // [])[0] // .request.remote_ip),
 ((.request.headers["cf-ipcountry"] // .request.headers["Cf-Ipcountry"] // [])[0] // "-"),
 .request.method,
 (.request.uri | split("?")[0]),
 .status,
 (.size // 0),
 ((.request.headers["user-agent"] // .request.headers["User-Agent"] // [])[0] // "-"),
 ((.request.headers.referer // [])[0] // "-")
] | @tsv
JQ

# 临时 TSV
TSV="$(mktemp)"
trap 'rm -f "$TSV"' EXIT

jq -r --argjson since "$SINCE_TS" \
  'select(.ts != null) | select((.ts|floor) >= $since) | '"$JQ_FILTER" \
  "$LOG" > "$TSV" 2>/dev/null || true

TOTAL=$(wc -l < "$TSV" | tr -d ' ')
if [[ "$TOTAL" -eq 0 ]]; then
  echo "（该范围内无日志记录，可能是日志已被轮转或确实无流量。）"
  echo "================================================================"
  exit 0
fi

# PV / UV
PV="$TOTAL"
UV=$(awk -F'\t' '{print $2}' "$TSV" | sort -u | grep -c . || true)

# 总流量（字节）与平均响应大小
TOTAL_BYTES=$(awk -F'\t' '{s+=$7} END{printf "%.0f", s}' "$TSV")
TOTAL_MB=$(awk -v b="$TOTAL_BYTES" 'BEGIN{printf "%.2f", b/1024/1024}')

# 状态码分布
STATUS_DIST=$(awk -F'\t' '{c[$6]++} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" \
  | sort -k2 -rn)

# Top 国家
TOP_COUNTRY=$(awk -F'\t' '$3!="-" && $3!="" {c[$3]++} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" \
  | sort -k2 -rn | head -10)

# Top URI（聚合带尾参数前的路径）
TOP_URI=$(awk -F'\t' '{c[$5]++} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" \
  | sort -k2 -rn | head -15)

# Top 真实 IP（UV 贡献者，注意隐私：仅聚合展示次数）
TOP_IP=$(awk -F'\t' '{c[$2]++} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" \
  | sort -k2 -rn | head -10)

# UA 分类：浏览器 / 爬虫 / 其他
UA_CLASSIFY=$(awk -F'\t' '{
  ua=tolower($8)
  if (ua ~ /googlebot|bingbot|baiduspider|bytespider|semrush|ahrefs|yandexbot|duckduckbot|facebookexternalhit|twitterbot|linkedinbot|applebot/) cat="爬虫/机器人"
  else if (ua ~ /micromessenger|wechat/) cat="微信内置浏览器"
  else if (ua ~ /chrome|edg|firefox|safari|opera|opr\//) cat="常规浏览器"
  else if (ua ~ /curl|python|go-http|java|okhttp|wget|node|axios/) cat="HTTP库/脚本"
  else if (ua == "-" || ua == "") cat="空UA"
  else cat="其他"
  c[cat]++
} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" | sort -k2 -rn)

# Top Referer
TOP_REF=$(awk -F'\t' '$9!="-" && $9!="" {c[$9]++} END{for(k in c) printf "%s\t%d\n", k, c[k]}' "$TSV" \
  | sort -k2 -rn | head -10)

print_block() {
  local title="$1" data="$2"
  echo
  echo "—— $title ——"
  if [[ -z "$data" ]]; then
    echo "  （无）"
  else
    echo "$data" | awk -F'\t' '{printf "  %-50s %8d\n", substr($1,1,50), $2}'
  fi
}

echo
echo "总览"
echo "  PV(请求总数): $PV"
echo "  UV(独立真实IP): $UV"
echo "  总流量: ${TOTAL_MB} MB ($TOTAL_BYTES 字节)"

print_block "状态码分布" "$STATUS_DIST"
print_block "Top 10 国家/地区" "$TOP_COUNTRY"
print_block "UA 分类" "$UA_CLASSIFY"
print_block "Top 15 URI" "$TOP_URI"
print_block "Top 10 真实 IP（按请求次数）" "$TOP_IP"
print_block "Top 10 Referer" "$TOP_REF"

echo
echo "—— 提示 ——"
echo "  · 真实 IP 取自 cf-connecting-ip，国家取自 cf-ipcountry（Cloudflare 注入）。"
echo "  · request.remote_ip 为 CF 边缘 IP，不可用作 UV。"
echo "  · 静态资源（js/css/png）请求会被计入 PV；如需纯页面 PV，可在 Top URI 中只看 / 行。"
echo "================================================================"
