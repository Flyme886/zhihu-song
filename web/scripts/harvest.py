#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
候选池采集：把搜索接口的结果整理成「待人工核验」的清单。

它不产出内容。它只产出「值得人去读的答案」的名单 —— 判定、引文、卡面文案
全部由人来做（PRD §12 那个 ★ 人工核验，和 §10.4 的 author_stated 档）。

用法：
    export ZHIHU_PROBE_SECRET_FILE=/tmp/zhihu-probe/.secret   # 默认就是这个
    python3 scripts/harvest.py scripts/harvest-topics/ai-learning.json
    python3 scripts/harvest.py <配置> --year 2016             # 只跑一年
    python3 scripts/harvest.py <配置> --dry-run               # 只打印要发的请求

写到 harvest/<topic_id>/ —— 那个目录在 .gitignore 里。
理由不是怕仓库大：那是按检索词整段抓下来的站内正文，
合规红线写着不做批量爬取与滥用站内数据，所以原始池子不入库。
最后进仓库的只有人工核验过的短引文 + 原帖链接（docs/design/mock-topic.json）。

── 配额 ──
每次开跑前先查 /api/v1/quota（免费），余量不够就直接退出，不去撞 429
（429 也计数）。一个议题 5 年 × 3 措辞 = 15 次，日限 5000，够用得很。
真正的瓶颈是人读答案的时间，不是配额。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

API = "https://developer.zhihu.com/api/v1"
CST = timezone(timedelta(hours=8))
# scripts/ 在 web/ 下面，但候选池跟 docs/ 一样属于仓库根 —— 往上两级。
REPO = Path(__file__).resolve().parent.parent.parent

# ── 答主自己划边界的说法（PRD §10.4）──
#
# 分强弱两档，因为混在一起数会得出一个虚高的数字。
# 实测：53 条候选里「命中任意标记」有 40 条，听着很够用；
# 但真正在给自己的建议划边界的只有 4 条。差十倍。
#
# 「如果」是罪魁 —— 它在中文里太常见，绝大多数命中是普通假设句：
#   「如果考研对你将来的工作有很大帮助」  ← 在说考研值不值，不是在给方法划前提
#   「如果你问我现在这个行情还要不要考研」← 设问
#   「如果题目问描绘了什么画面」          ← 举例
# 这些都不是「我这个方法只在某种情况下成立」。
#
# 所以强标记是那些**几乎只可能**用来划边界的说法，弱标记只当线索。
# 命中强标记也不等于合格 —— 那仍然要人读完原帖才能定。
STRONG_MARKERS = [
    "前提是", "只适合", "不适合", "我说的是", "仅限",
    "别照搬", "不一定适用", "就完全不一样", "利益相关",
]
WEAK_MARKERS = [
    "前提", "适合的是", "如果", "除非", "取决于", "因人而异", "另说",
]
MARKERS = STRONG_MARKERS + WEAK_MARKERS

# ContentText 大约 1050 字截断。低于这个数说明整篇都在手上，
# quote ∈ source_text 是拿全文在核；超过就只是拿「前半篇」在核 ——
# 答主可能在后半篇把话收回去（「不过我后来发现其实不用」），那种反转
# 在截断的文本里看不见。所以要标出来，让人去浏览器把整篇读完。
TRUNCATE_AT = 1040


def read_secret() -> str:
    path = os.environ.get("ZHIHU_PROBE_SECRET_FILE", "/tmp/zhihu-probe/.secret")
    try:
        s = Path(path).read_text(encoding="utf-8").strip()
    except OSError as e:
        sys.exit(f"读不到凭据 {path}：{e}\n（Access Secret 只存在 /tmp，不进仓库）")
    if not s:
        sys.exit(f"{path} 是空的")
    if s.startswith("app_"):  # app_id / app_key 不是 Access Secret，别放串了
        sys.exit("这个文件里像是 app_id/app_key，不是 Access Secret")
    return s


def call(path: str, params: list[tuple[str, str]], secret: str) -> dict:
    url = f"{API}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {secret}",
        "X-Request-Timestamp": str(int(time.time())),
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        # 不回显 secret：url 里没有它，它在 header 里
        sys.exit(f"HTTP {e.code} {path}\n{body}")
    except urllib.error.URLError as e:
        sys.exit(f"连不上 {path}：{e.reason}")


def check_quota(secret: str, need: int) -> None:
    """开跑前查余量。配额是运行时状态，任何数字都不要写死在代码里。"""
    # 返回是 {Code, Message, Data:[...]}，Data 直接是数组，
    # 每项 {APIID, APIName, TotalQuota, TotalUsed, RemainingQuota}
    for q in call("quota", [], secret).get("Data") or []:
        if q.get("APIID") == "global_search":
            left = q.get("RemainingQuota", 0)
            print(f"配额 global_search：已用 {q.get('TotalUsed')}/{q.get('TotalQuota')}，"
                  f"余 {left}，本次要 {need} 次")
            if left < need:
                sys.exit(f"余量不够（{left} < {need}）。按自然日重置，明天再来。")
            return
    print("⚠ 配额接口里没找到 global_search 这一项，跳过检查")


def year_window(year: int) -> str:
    """双闭区间。文档 §3.1：单边窗口会被相关性排序悄悄盖掉早年的结果。"""
    a = int(datetime(year, 1, 1, tzinfo=CST).timestamp())
    b = int(datetime(year, 12, 31, 23, 59, 59, tzinfo=CST).timestamp())
    return f"publish_time>={a} AND publish_time<={b}"


def strip_em(s: str) -> str:
    """搜索结果会把命中的词包在 <em> 里。逐字校验前必须先拆掉。"""
    return re.sub(r"</?em>", "", s or "")


def parse_id(url: str) -> tuple[str, str] | tuple[None, None]:
    """回答 ID 只在 URL 里。ContentID 是另一个东西（一个大负数）。"""
    m = re.search(r"zhihu\.com/question/(\d+)/answer/(\d+)", url)
    if m:
        return "answer", m.group(2)
    m = re.search(r"zhihu\.com/p/(\d+)", url)
    if m:
        return "article", m.group(1)
    return None, None


def clean_url(url: str) -> str:
    """去掉 utm_* 追踪参数，留干净的原帖链接 —— 卡面上要印它。"""
    p = urllib.parse.urlsplit(url)
    kept = [(k, v) for k, v in urllib.parse.parse_qsl(p.query)
            if not k.startswith("utm_")]
    return urllib.parse.urlunsplit(
        (p.scheme, p.netloc, p.path, urllib.parse.urlencode(kept), ""))


def shape(item: dict, year: int, query: str) -> dict | None:
    """把一条搜索结果整理成候选。丢掉的返回 None。"""
    url = item.get("Url") or ""
    kind, aid = parse_id(url)

    # 专栏文章丢掉：它没有「问题」，schema 的 question_title 无处可填，
    # 而这个产品的卡就是「某个问题下的某个回答」。实测占三成多，认了。
    if kind != "answer":
        return None

    author = (item.get("AuthorName") or "").strip()
    # 署名为空 → 丢。不是数据缺失，是这条不能用：
    # 「答主是知乎的核心资产，不是素材」，署不上名的话就不该拿来做卡。
    if not author:
        return None

    text = strip_em(item.get("ContentText") or "")
    hits = [m for m in MARKERS if m in text]
    strong = [m for m in STRONG_MARKERS if m in text]
    edit_ts = item.get("EditTime") or 0

    return {
        "answer_id": aid,
        "url": clean_url(url),
        "question_title": re.sub(r"\s*-\s*知乎$", "", strip_em(item.get("Title") or "")),
        "author_name": author,
        # AuthorBadgeText 实测 81 条里只有 19 条有值。缺就留空，
        # 不要拿别的字段凑一个「看着像认证」的东西出来。
        "author_credential": (item.get("AuthorBadgeText") or "").strip(),
        "upvote_count": item.get("VoteUpCount") or 0,
        "edit_time": edit_ts,
        "edit_date": datetime.fromtimestamp(edit_ts, CST).strftime("%Y-%m-%d") if edit_ts else "",
        "source_text": text,
        "text_len": len(text),
        "text_complete": len(text) < TRUNCATE_AT,
        "markers": hits,
        "strong_markers": strong,
        "found_by": {"year": year, "query": query},
    }


def harvest_year(year: int, queries: list[str], cfg: dict, secret: str,
                 dry: bool) -> list[dict]:
    pool: dict[str, dict] = {}
    # off_site 这一项是补上的：global_search 是**全网搜**，不是站内搜。
    # 实测一次 20 条里只有 6 条来自知乎，其余是搜狐、网易、界面这些站。
    # 早先这些条目在统计前就被 continue 跳过了，一个桶都没进 ——
    # 于是打出来的「抓到 60 → 留下 6，丢了 5」怎么加都不等于 60，
    # 而我拿那张表当过产出率的解释。分项必须加得起来，否则就是在骗自己。
    stats = {"raw": 0, "off_site": 0, "article": 0,
             "no_author": 0, "low_vote": 0, "dup": 0}
    for q in queries:
        params = [
            ("Query", q),
            ("Count", str(cfg.get("per_call", 20))),   # 上限 20，再大也只给 20
            ("Filter", year_window(year)),
            ("SearchDB", "all"),
        ]
        if dry:
            print(f"  [dry] {year} «{q}»  Filter={year_window(year)}")
            continue
        d = call("content/global_search", params, secret)
        items = (d.get("Data") or {}).get("Items") or []
        stats["raw"] += len(items)
        for it in items:
            if "zhihu.com" not in (it.get("Url") or ""):
                stats["off_site"] += 1
                continue
            row = shape(it, year, q)
            if row is None:
                kind, _ = parse_id(it.get("Url") or "")
                stats["article" if kind != "answer" else "no_author"] += 1
                continue
            if row["upvote_count"] < cfg.get("min_upvotes", 5):
                stats["low_vote"] += 1
                continue
            if row["url"] in pool:
                stats["dup"] += 1
                # 同一条被两种措辞找到 —— 记下来，说明这条比较扎实
                pool[row["url"]].setdefault("also_found_by", []).append(row["found_by"])
                continue
            pool[row["url"]] = row
        time.sleep(0.4)   # 不高频，别撞红线

    # 强标记优先排前面 —— 人的时间该花在最可能有边界的那几条上
    rows = sorted(pool.values(),
                  key=lambda r: (len(r["strong_markers"]), len(r["markers"]),
                                 r["upvote_count"]), reverse=True)
    if not dry:
        dropped = (stats["off_site"] + stats["article"] + stats["no_author"]
                   + stats["low_vote"] + stats["dup"])
        # 分项必须加得起来。加不起来就是统计有洞，宁可当场报错也别打一张糊的表
        assert dropped + len(rows) == stats["raw"], (
            f"统计对不上：{stats['raw']} 抓到，{dropped} 丢弃，{len(rows)} 留下")
        print(f"  {year}：抓到 {stats['raw']} → 留下 {len(rows)} 条"
              f"（丢：站外 {stats['off_site']}、专栏 {stats['article']}、"
              f"无署名 {stats['no_author']}、赞数不足 {stats['low_vote']}、"
              f"重复 {stats['dup']}）"
              f"　**强标记 {sum(1 for r in rows if r['strong_markers'])} 条**"
              f"（弱标记另有 {sum(1 for r in rows if r['markers'] and not r['strong_markers'])} 条，"
              f"多半是普通假设句），全文完整 {sum(1 for r in rows if r['text_complete'])} 条")
    return rows


def marker_sentences(row: dict, limit: int = 3) -> list[str]:
    """
    把命中的那几句挑出来，直接印在清单上。

    不是替人选引文 —— 是把「读整篇找那句话」变成「看这句是不是」。
    人还是得开原帖：这里的句子来自 ContentText，
    截断的条目看不到后半篇，而答主可能在后半篇把话收回去。
    """
    out = []
    for s in re.split(r"(?<=[。！？])", row["source_text"]):
        s = s.strip()
        if 6 < len(s) < 90 and any(m in s for m in row["markers"]):
            out.append(s)
        if len(out) >= limit:
            break
    return out


def valid_condition_ids() -> list[str]:
    """提问者身上那几个条件 ID —— 从议题文件读，不在这儿写死。"""
    try:
        d = json.loads((REPO / "docs" / "design" / "mock-topic.json")
                       .read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    ids: set[str] = set()
    for a in d.get("askers", []):
        ids |= set(a.get("has") or []) | set(a.get("lacks") or [])
    return sorted(ids)


def write_review_sheet(out: Path, topic: str, by_year: dict[str, list[dict]]) -> None:
    """人工核验用的清单。一年一段，每条留出要填的空。"""
    L = [f"# 候选池：{topic}", "",
         "机器只做了「找出值得读的答案」这一步。下面每一条都要人去读原帖再决定。",
         "",
         "填之前先读 PRD §10.4：卡面上的适用条件只收 `author_stated` 档 ——",
         "答主自己写的那句话，逐字引出来，不改写、不用省略号拼接不相邻的片段。",
         "读不出这种句子，就换一条答案，不要把档位降一级凑数。", ""]
    cids = valid_condition_ids()
    if cids:
        L += ["**requires / strains 只能填这几个**（写别的、或者写成 `c_base`",
              "那种地图层的词，`verify-content.py` 会拦下来）：", ""]
        L += [f"- `{c}`" for c in cids]
        L += [""]
    for year, rows in by_year.items():
        ns = sum(1 for r in rows if r["strong_markers"])
        L += [f"## {year}　共 {len(rows)} 条，**强标记 {ns} 条**"
              f"（下面按强标记排序，前面的最值得先读）", ""]
        for i, r in enumerate(rows, 1):
            flag = "" if r["text_complete"] else \
                "　⚠ 正文被截断，接口只给到前 ~1050 字，**必须在浏览器里读完整篇**"
            L += [
                f"### {year}-{i}　{r['author_name']}　赞 {r['upvote_count']}　{r['edit_date']}",
                f"- 原帖：{r['url']}",
                f"- 问题：{r['question_title']}",
                f"- 认证：{r['author_credential'] or '（接口没给，留空）'}",
                f"- 命中的说法："
                + (f"**强：{'、'.join(r['strong_markers'])}**　" if r["strong_markers"] else "")
                + (f"弱：{'、'.join(m for m in r['markers'] if m not in r['strong_markers'])}"
                   if any(m not in r["strong_markers"] for m in r["markers"]) else "")
                + (flag if flag else ""),
            ]
            hits = marker_sentences(r)
            if hits:
                L.append("- 机器挑出来的句子（**不是引文**，只是省你翻找。"
                         "定不定用、上下文对不对，开原帖看）：")
                L += [f"    > {s}" for s in hits]
            L += [
                "- [ ] 答主原话（逐字，含标点）：",
                "- [ ] 这句话划出的边界是什么（一句白话）：",
                "- [ ] requires / strains 落在哪两个条件上：",
                "- [ ] 卡面标题（概括做法，不是概括结论）：",
                "- [ ] 签字人 / 日期：",
                "",
            ]
    out.write_text("\n".join(L), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("config")
    ap.add_argument("--year", type=int, help="只跑这一年")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
    years = {k: v for k, v in cfg["years"].items()
             if not a.year or int(k) == a.year}
    if not years:
        sys.exit(f"配置里没有 {a.year} 年")

    need = sum(len(v) for v in years.values())
    secret = "" if a.dry_run else read_secret()
    if not a.dry_run:
        check_quota(secret, need)

    by_year = {}
    for y, qs in sorted(years.items()):
        by_year[y] = harvest_year(int(y), qs, cfg, secret, a.dry_run)
    if a.dry_run:
        print(f"\n共 {need} 次 global_search 调用，没有真的发出去。")
        return

    out = REPO / "harvest" / cfg["topic_id"]
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(CST).strftime("%Y%m%d-%H%M")

    # 只跑一年时，别把别的年份冲掉 —— 跟已有的池子合并。
    # 固定文件名而不是带时间戳：人要读的清单只能有一份，
    # 三个时间戳文件摊在目录里，核验的人不知道该开哪个。
    # 时间戳那份留作历史，谁都不用去读。
    merged, added, refreshed = by_year, 0, 0
    cur = out / "candidates.json"
    if cur.exists():
        old = json.loads(cur.read_text(encoding="utf-8")).get("by_year") or {}
        merged = dict(old)
        for y, rows in by_year.items():
            seen = {r["url"]: r for r in merged.get(y, [])}
            for r in rows:
                # 赞数会变，重跑就以新的为准；其它字段一起刷新
                refreshed += r["url"] in seen
                added += r["url"] not in seen
                seen[r["url"]] = r
            merged[y] = sorted(seen.values(),
                               key=lambda r: (len(r.get("strong_markers") or []),
                                              len(r["markers"]), r["upvote_count"]),
                               reverse=True)
        merged = {k: merged[k] for k in sorted(merged)}

    payload = json.dumps({"topic_id": cfg["topic_id"], "title": cfg["title"],
                          "harvested_at": stamp, "by_year": merged},
                         ensure_ascii=False, indent=2)
    cur.write_text(payload, encoding="utf-8")
    (out / f"_history-{stamp}.json").write_text(payload, encoding="utf-8")
    write_review_sheet(out / "review.md", cfg["title"], merged)

    total = sum(len(v) for v in merged.values())
    strong = sum(1 for v in merged.values() for r in v if r.get("strong_markers"))
    print(f"\n池子里现在 {total} 条，**强标记 {strong} 条**"
          f"（本次新增 {added}、刷新 {refreshed}）→ harvest/{cfg['topic_id']}/")
    print("  candidates.json　给 verify-content.py 逐字核用")
    print("  review.md　　　　人工核验清单，就读这一份")
    for y in sorted(merged):
        n = sum(1 for r in merged[y] if r.get("strong_markers"))
        gap = "" if n >= 4 else "　← 强标记不够 4 张卡，加措辞重跑"
        print(f"    {y}：{len(merged[y])} 条，强标记 {n}{gap}")
    print("\n接下来是人的活：按清单读原帖、抄原话、签字。机器到这儿就停了。")


if __name__ == "__main__":
    main()
