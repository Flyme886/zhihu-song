#!/usr/bin/env bash
# 知乎 API 探测器。凭证只从 /tmp/zhihu-probe/.secret 读，不落盘到仓库、不进日志。
# 用法： bash scripts/probe.sh get  <编号> <端点路径> [curl 的 --data-urlencode 参数...]
#        bash scripts/probe.sh post <编号> <端点路径> <json-body-file>
set -uo pipefail

SECRET_FILE=/tmp/zhihu-probe/.secret
BASE=https://developer.zhihu.com
OUT=docs/probe-raw
mkdir -p "$OUT"

[ -r "$SECRET_FILE" ] || { echo "缺少凭证文件 $SECRET_FILE" >&2; exit 1; }
SECRET=$(cat "$SECRET_FILE")

# 记账：每次调用追加一行到台账
ledger() { printf '%s\t%s\t%s\t%s\t%s\n' "$(date +%FT%T%z)" "$1" "$2" "$3" "$4" >> "$OUT/_ledger.tsv"; }

get() {
  local id=$1 path=$2; shift 2
  local args=() a
  for a in "$@"; do args+=(--data-urlencode "$a"); done
  local body_file="$OUT/${id}.json" meta_file="$OUT/${id}.req.txt"
  local t0 t1 code
  t0=$(python3 -c 'import time;print(time.time())')
  code=$(curl -sS -G "$BASE$path" ${args[@]+"${args[@]}"} \
    -H "Authorization: Bearer $SECRET" \
    -H "X-Request-Timestamp: $(date +%s)" \
    -H 'Content-Type: application/json' \
    -o "$body_file" -w '%{http_code}')
  t1=$(python3 -c 'import time;print(time.time())')
  local secs; secs=$(python3 -c "print(f'{$t1-$t0:.2f}')")
  { echo "GET $BASE$path"; for a in "$@"; do echo "  --data-urlencode '$a'"; done
    echo "  -H 'Authorization: Bearer <REDACTED>'"
    echo "  -H 'X-Request-Timestamp: <unix秒>'"
    echo "HTTP $code, 耗时 ${secs}s, $(date +%FT%T%z)"; } > "$meta_file"
  ledger "$id" "$path" "$code" "${secs}s"
  echo "[$id] HTTP $code ${secs}s -> $body_file"
}

post() {
  local id=$1 path=$2 bodyfile=$3
  local body_file="$OUT/${id}.json" meta_file="$OUT/${id}.req.txt"
  local t0 t1 code secs
  t0=$(python3 -c 'import time;print(time.time())')
  code=$(curl -sS -X POST "$BASE$path" \
    -H "Authorization: Bearer $SECRET" \
    -H "X-Request-Timestamp: $(date +%s)" \
    -H 'Content-Type: application/json' \
    --data-binary @"$bodyfile" \
    -o "$body_file" -w '%{http_code}')
  t1=$(python3 -c 'import time;print(time.time())')
  secs=$(python3 -c "print(f'{$t1-$t0:.2f}')")
  { echo "POST $BASE$path"; echo "--- body ---"; cat "$bodyfile"
    echo "--- headers ---"; echo "  Authorization: Bearer <REDACTED>"
    echo "HTTP $code, 耗时 ${secs}s, $(date +%FT%T%z)"; } > "$meta_file"
  ledger "$id" "$path" "$code" "${secs}s"
  echo "[$id] HTTP $code ${secs}s -> $body_file"
}

"$@"
