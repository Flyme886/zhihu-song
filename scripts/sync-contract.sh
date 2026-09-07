#!/usr/bin/env bash
# 数据契约同步：docs/design 是唯一事实来源，web/src 里的是副本。
#   check（默认）—— 副本与源不一致就退出 1，用于 build 前拦截漂移
#   pull        —— 从 docs/design 覆盖 web/src
#
# 为什么要复制而不是 import 出去：Next 的静态导出只打包 src 内的文件，
# 从 ../../docs 引会把文档目录拖进构建图，且 tsconfig 的 rootDir 会报错。
set -euo pipefail
cd "$(dirname "$0")/.."

PAIRS=(
  "docs/design/model.ts:web/src/lib/model.ts"
  "docs/design/mock-topic.json:web/src/data/mock-topic.json"
)

mode="${1:-check}"
fail=0

for pair in "${PAIRS[@]}"; do
  src="${pair%%:*}"
  dst="${pair##*:}"

  if [[ ! -f "$src" ]]; then
    echo "✗ 源文件不存在：$src"
    fail=1
    continue
  fi

  case "$mode" in
    pull)
      mkdir -p "$(dirname "$dst")"
      cp "$src" "$dst"
      echo "→ $src → $dst"
      ;;
    check)
      if [[ ! -f "$dst" ]]; then
        echo "✗ 副本缺失：$dst（跑 scripts/sync-contract.sh pull）"
        fail=1
      elif ! cmp -s "$src" "$dst"; then
        echo "✗ 副本与源不一致：$dst"
        echo "  跑 scripts/sync-contract.sh pull 覆盖，或把改动挪回 $src"
        fail=1
      else
        echo "✓ $dst"
      fi
      ;;
    *)
      echo "用法：$0 [check|pull]" >&2
      exit 2
      ;;
  esac
done

exit "$fail"
