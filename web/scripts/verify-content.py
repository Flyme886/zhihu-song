#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
内容闸门：人工核验完的 mock-topic.json 想上线，先过这里。

PRD 里「引文逐字校验，不过就丢弃」写着是一条规矩。规矩靠人记就会漏 ——
所以这里把它变成一个会失败的检查。它拦得住的：
  1. 引文不是原文（改过一个字、把两段用省略号拼起来、顺手润色了标点）
  2. 卡面条件不是 author_stated 档
  3. 占位内容混进了交付（【占位】、example.invalid、占位·人工签字）
  4. 全场禁用词进了任何一句给人看的文案
  5. 引文出自被截断的正文 —— 那种只核过前半篇，答主可能在后半篇把话收回去

用法：
    python3 scripts/verify-content.py                        # 只做不需要原文的检查
    python3 scripts/verify-content.py --against harvest/ai-learning/candidates-*.json

不带 --against 时跳过逐字校验并明说跳过了 —— 「没报错」不等于「核过了」。
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
TOPIC = REPO / "docs" / "design" / "mock-topic.json"

# 全场禁用词（BRIEF）。「失效」不在里面 —— 那是产品自己的词。
BANNED = ["打脸", "幻觉", "落后", "正确率", "成功", "失败"]
BANNED_46 = ["过时"]          # §4.6 另外禁的
PLACEHOLDER = ["占位", "example.invalid", "mock_", "PLACEHOLDER"]

fails: list[str] = []
warns: list[str] = []


def bad(msg: str) -> None:
    fails.append(msg)


def warn(msg: str) -> None:
    warns.append(msg)


def norm(s: str) -> str:
    """
    逐字比对前的归一化，只允许动这些：
      - <em> 标签（搜索结果给命中词加的）
      - 全角/半角、兼容字形（NFKC）
      - 空白折叠
    不动标点、不动错别字、不补省略号。
    「答主原话」的意思是原话，归一化再往前一步就是替他改文章了。
    """
    s = re.sub(r"</?em>", "", s or "")
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", s)


def match(quote: str, source: str) -> tuple[bool, bool]:
    """
    返回（逐字对得上吗，是不是从句子开头引的）。

    第二个值是因为逐字校验有个拦不住的漏洞：截一段话的中间，
    每个字都是原文的，意思可以正好反过来 ——
        原文：我不认为前提是自制力
        引文：前提是自制力          ← 逐字在原文里，意思反了
    子串匹配对这种情况无能为力。能机器查的只有一件事：
    引文前面那个字是不是句末标点。不是的话就是从句子中间起的，
    这种最容易出事，标出来让人回原帖看上下文。
    砍掉句首一个语气词（「当然前提是」→「前提是」）也会落到这一档 ——
    那种是正当的，所以只提醒，不拦。
    """
    q, s = norm(quote), norm(source)
    i = s.find(q)
    if i < 0:
        return False, False
    return True, i == 0 or s[i - 1] in "。！？…；"


def check_verbatim(topic: dict, pool: dict[str, dict]) -> None:
    """quote ∈ source_text。这是唯一一条不能商量的。"""
    n_ok = n_skip = 0
    for ev in topic.get("evidence", []):
        aid = str(ev.get("answer_id", ""))
        src = pool.get(aid)
        if src is None:
            warn(f"evidence {aid}：候选池里没有这条的原文，逐字校验跳过了")
            n_skip += 1
            continue
        hit, at_start = match(ev.get("quote", ""), src["source_text"])
        if not hit:
            bad(f"evidence {aid} 的 quote 在原文里找不到 → 按规矩这条要丢弃，"
                f"不是改一改就能留下\n      引文：{ev.get('quote','')[:60]}…")
            continue
        if not at_start:
            warn(f"evidence {aid} 的引文从句子中间起（前一个字不是句末标点）。"
                 f"逐字对得上，但意思可能被截反了 —— 回原帖看一眼上下文")
        if not src.get("text_complete", True):
            warn(f"evidence {aid}：引文核对的是被截断的正文（{src['text_len']} 字，"
                 f"接口只给前 ~1050）。答主可能在后半篇把话收回去 —— "
                 f"要在浏览器里读完整篇再签字")
        n_ok += 1

    for node in topic.get("nodes", []):
        for card in node.get("cards", []):
            c = card.get("condition") or {}
            aid = str(c.get("evidence_answer_id", ""))
            src = pool.get(aid)
            if src is None:
                warn(f"卡 {card.get('id')} 的条件引文：原文不在候选池里，跳过")
                n_skip += 1
                continue
            hit, at_start = match(c.get("quote", ""), src["source_text"])
            if not hit:
                bad(f"卡 {card.get('id')} 的 condition.quote 不在原文里 → 换答案，"
                    f"不要把 source_tier 降一级凑数")
                continue
            if not at_start:
                warn(f"卡 {card.get('id')} 的条件引文从句子中间起 —— "
                     f"这句要印在卡面上，回原帖确认答主的意思没被截反")
            n_ok += 1
    print(f"  逐字校验：{n_ok} 条对上，{n_skip} 条因为拿不到原文跳过")


def check_condition_ids(topic: dict) -> None:
    """
    卡片的 requires/strains 只能用提问者身上那五个条件 ID。

    两种错都会静默通过类型检查：
      1. 拼错（metacognitive vs metacognition）→ 那张卡对谁都不生效，
         结算表看着正常，只是永远走不到那一格
      2. 填成轴上的条件（c_base / c_think_time）→ 这是**地图层**的词。
         地图层的 0.4/0.3 那种权重不许回到结算层，
         结算层只有「有」和「没有」。混进来就等于把概率塞进了确定判定里
    """
    valid = set()
    for a in topic.get("askers", []):
        valid |= set(a.get("has") or []) | set(a.get("lacks") or [])
    axis = set()
    for ax in ("axis_x", "axis_y"):
        axis |= set((topic.get(ax) or {}).get("conditions") or [])
    if not valid:
        warn("askers 里读不到条件 ID，跳过这项检查")
        return

    n = 0
    for node in topic.get("nodes", []):
        for card in node.get("cards", []):
            c = card.get("condition") or {}
            for field in ("requires", "strains"):
                for cid in c.get(field) or []:
                    n += 1
                    if cid in valid:
                        continue
                    if cid in axis:
                        bad(f"卡 {card.get('id')} 的 {field} 填了 {cid!r} —— "
                            f"那是地图层的条件，不能进结算层"
                            f"（结算层只有「有」和「没有」，没有权重）")
                    else:
                        bad(f"卡 {card.get('id')} 的 {field} 填了 {cid!r}，"
                            f"不在提问者的条件里。可用的只有："
                            f"{'、'.join(sorted(valid))}")
    print(f"  条件 ID：{n} 处引用检查完（可用 {len(valid)} 个）")


def check_tier(topic: dict) -> None:
    """卡面上的适用条件只收 author_stated（PRD §10.4）。"""
    n = 0
    for node in topic.get("nodes", []):
        for card in node.get("cards", []):
            c = card.get("condition") or {}
            if c.get("source_tier") != "author_stated":
                bad(f"卡 {card.get('id')} 的条件是 {c.get('source_tier')!r} 档，"
                    f"卡面只能印 author_stated")
            if not (c.get("quote") or "").strip():
                bad(f"卡 {card.get('id')} 没有引文 —— 条件必须有答主原话撑着")
            n += 1
    print(f"  档位：{n} 张卡的条件检查完")


def check_attribution(topic: dict) -> None:
    """每条依据都要能署名、能点回原帖。答主是知乎的核心资产，不是素材。"""
    ids = set()
    for ev in topic.get("evidence", []):
        aid = str(ev.get("answer_id", ""))
        ids.add(aid)
        if not (ev.get("author_name") or "").strip():
            bad(f"evidence {aid} 没有署名 → 丢弃")
        url = ev.get("url") or ""
        if not re.match(r"^https://(www\.)?zhihu\.com/", url):
            bad(f"evidence {aid} 的 url 不是知乎原帖：{url}")
        if "utm_" in url:
            warn(f"evidence {aid} 的 url 还带着 utm_ 追踪参数，入库前去掉")
        if not (ev.get("author_credential") or "").strip():
            # 接口只有约两成条目给了这个字段，缺很正常 —— 但别拿别的东西凑
            warn(f"evidence {aid} 没有认证文案（接口常缺）：界面上留空，不要编")
    # 卡和格子引用的 answer_id 必须真的存在
    for node in topic.get("nodes", []):
        for card in node.get("cards", []):
            for key in ("evidence_answer_id",):
                aid = str(card.get(key) or (card.get("condition") or {}).get(key) or "")
                if aid and aid not in ids:
                    bad(f"卡 {card.get('id')} 指向的依据 {aid} 在 evidence 里不存在")
    print(f"  署名与链接：{len(ids)} 条依据检查完")


def walk_strings(o, path="") -> list[tuple[str, str]]:
    if isinstance(o, str):
        return [(path, o)]
    if isinstance(o, dict):
        return [x for k, v in o.items() if not k.startswith("_")
                for x in walk_strings(v, f"{path}.{k}")]
    if isinstance(o, list):
        return [x for i, v in enumerate(o) for x in walk_strings(v, f"{path}[{i}]")]
    return []


def check_words(topic: dict) -> None:
    """禁用词与占位物。扫全文，不只扫我记得的那几个字段。"""
    strings = walk_strings(topic)
    n_ban = n_ph = 0
    for path, s in strings:
        for w in BANNED + BANNED_46:
            if w in s:
                bad(f"禁用词「{w}」出现在 {path}：{s[:44]}…")
                n_ban += 1
        for p in PLACEHOLDER:
            if p in s:
                n_ph += 1
                break
    if n_ph:
        bad(f"还有 {n_ph} 处占位内容（【占位】/ example.invalid / mock_ / 占位·人工签字）。"
            f"这些不能上线：把编的东西当成答主说的话，比空着更糟")
    print(f"  用词：扫了 {len(strings)} 条文案，禁用词 {n_ban} 处，占位 {n_ph} 处")


def check_signed(topic: dict) -> None:
    """12 格逐格签字（PRD §12 那个 ★）。没签的格子等于没核。"""
    total = unsigned = 0
    for node in topic.get("nodes", []):
        for cell in node.get("cells", []):
            total += 1
            v = (cell.get("verified_by") or "").strip()
            if not v or "占位" in v:
                unsigned += 1
    if unsigned:
        bad(f"{unsigned}/{total} 格没有人签字。结算表是这个产品的判断本身，"
            f"逐格签字是 PRD 里唯一带 ★ 的一步")
    print(f"  签字：{total - unsigned}/{total} 格已签")


def load_pool(patterns: list[str]) -> dict[str, dict]:
    pool: dict[str, dict] = {}
    for pat in patterns:
        for f in sorted(glob.glob(pat)):
            d = json.loads(Path(f).read_text(encoding="utf-8"))
            for rows in (d.get("by_year") or {}).values():
                for r in rows:
                    pool[str(r["answer_id"])] = r
    return pool


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--against", nargs="*", default=[],
                    help="候选池 json（含 source_text），逐字校验要用")
    ap.add_argument("--topic", default=str(TOPIC))
    a = ap.parse_args()

    topic = json.loads(Path(a.topic).read_text(encoding="utf-8"))
    print(f"检查 {Path(a.topic).name}　议题：{topic.get('title')}\n")

    pool = load_pool(a.against)
    if pool:
        check_verbatim(topic, pool)
    else:
        print("  逐字校验：跳过（没给 --against，手上没有原文）")
        warn("这一轮没有做逐字校验。「没报错」不等于「核过了」")
    check_tier(topic)
    check_condition_ids(topic)
    check_attribution(topic)
    check_words(topic)
    check_signed(topic)

    print()
    for w in warns:
        print(f"⚠ {w}")
    for f in fails:
        print(f"✗ {f}")
    if fails:
        print(f"\n不能上线：{len(fails)} 条硬性检查没过。")
        sys.exit(1)
    print(f"\n通过。{len(warns)} 条提醒不拦上线，但交付前该看一眼。")


if __name__ == "__main__":
    main()
