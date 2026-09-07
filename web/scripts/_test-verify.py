#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自检：证明逐字校验真的会失败。

一个永远通过的检查比没有检查更坏 —— 它让人以为核过了。
所以这里拿候选池里一条真实回答，先原样送进去（该过），
再动一个字、换个标点、用省略号拼两段（都该被拦下）。

    python3 scripts/_test-verify.py
"""
import glob
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def build_topic(quote: str, src: dict) -> dict:
    """最小可检的议题：一条依据、一张卡、一格，其它都填好，只留 quote 是变量。"""
    aid = src["answer_id"]
    return {
        "title": "自检用",
        "evidence": [{
            "answer_id": aid, "url": src["url"],
            "question_title": src["question_title"],
            "author_name": src["author_name"],
            "author_credential": src["author_credential"] or "无",
            "created_at": src["edit_date"], "upvote_count": src["upvote_count"],
            "quote": quote,
        }],
        "nodes": [{
            "year": 2016, "index": 0,
            "cards": [{
                "id": "t1", "node_year": 2016, "headline": "自检卡",
                "evidence_answer_id": aid, "dies_after_year": None,
                "condition": {
                    "id": "c1", "label": "自检条件", "quote": quote,
                    "requires": ["x"], "strains": [],
                    "evidence_answer_id": aid,
                    "evidence_paragraph": "自检", "source_tier": "author_stated",
                },
            }],
            "cells": [{
                "card_id": "t1", "asker_id": "a", "outcome": "effective",
                "narration": ["自检旁白。"], "because": "自检。",
                "verified_by": "自检脚本 2026-09-01",
            }],
        }],
    }


def run(topic: dict, pool_file: str) -> tuple[int, str]:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as f:
        json.dump(topic, f, ensure_ascii=False)
        path = f.name
    p = subprocess.run(
        [sys.executable, str(HERE / "verify-content.py"),
         "--topic", path, "--against", pool_file],
        capture_output=True, text=True)
    Path(path).unlink()
    return p.returncode, p.stdout + p.stderr


def main() -> None:
    files = sorted(glob.glob(str(REPO / "harvest" / "*" / "candidates.json")))
    if not files:
        sys.exit("候选池是空的，先跑 harvest.py")
    pool_file = files[-1]
    pool = json.loads(Path(pool_file).read_text(encoding="utf-8"))
    rows = [r for rs in pool["by_year"].values() for r in rs
            if r["markers"] and r["text_complete"]]

    # 挑一条真有「前提是」的
    src = quote = None
    for r in sorted(rows, key=lambda r: -r["upvote_count"]):
        for s in re.split(r"(?<=[。！？])", r["source_text"]):
            if "前提是" in s and 8 < len(s.strip()) < 60:
                src, quote = r, s.strip()
                break
        if src:
            break
    if not src:
        sys.exit("候选池里没找到合适的自检句子")

    print(f"拿来自检的真实回答：{src['author_name']}　赞 {src['upvote_count']}")
    print(f"原话：{quote}\n")

    cases = [
        ("原样引用", quote, True),
        ("改了一个字", quote.replace("前提是", "前题是"), False),
        ("句号换成感叹号", quote[:-1] + "！" if quote[-1] in "。！？" else quote + "！", False),
        ("省略号拼接不相邻的两段", quote[:6] + "……" + src["source_text"][-14:], False),
        ("<em> 标签不算改动", quote.replace("前提是", "<em>前提是</em>"), True),
        # 砍掉句首语气词（「当然前提是」→「前提是」）该过：
        # 它仍然是原文里一段连着的字，没改没拼。这是正当的摘引。
        # 但它从句子中间起，所以应该出一条提醒 —— 下面单独验。
        ("砍掉句首语气词", quote.lstrip("当然").lstrip(), True),
    ]

    bad = 0
    for name, q, want_pass in cases:
        if q == quote and not want_pass:
            print(f"  ?  {name}：这条造不出来（原句里没有要改的东西），跳过")
            continue
        code, out = run(build_topic(q, src), pool_file)
        passed = code == 0
        ok = passed == want_pass
        bad += not ok
        mark = "✓" if ok else "✗"
        expect = "该过" if want_pass else "该被拦"
        got = "过了" if passed else "被拦了"
        print(f"  {mark}  {name}：{expect}，{got}")
        if not ok:
            for line in out.splitlines():
                if line.startswith(("✗", "⚠")):
                    print(f"        {line}")

    # 逐字校验拦不住的那种：截一段话的中间，字字是原文，意思反过来。
    # 这里不能靠拦 —— 引文确实在原文里。只能要求它出提醒。
    print("\n  逐字校验拦不住的那一类（只能出提醒，靠人回原帖看）：")
    fake = dict(src)
    fake["source_text"] = "很多人说前提是你得有自制力。我不认为前提是自制力，真正卡住人的是没人给他反馈。"
    fake["text_complete"] = True
    inverted = "前提是自制力"
    pool_patch = {"topic_id": "t", "title": "t", "harvested_at": "t",
                  "by_year": {"2016": [fake]}}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                     encoding="utf-8") as f:
        json.dump(pool_patch, f, ensure_ascii=False)
        patch_file = f.name
    code, out = run(build_topic(inverted, fake), patch_file)
    Path(patch_file).unlink()
    got_warn = "从句子中间起" in out
    print(f"     原文「我不认为前提是自制力」，引文「{inverted}」")
    print(f"     {'✓' if got_warn else '✗'}  逐字对得上（拦不住），"
          f"{'出了' if got_warn else '没出'}「从句子中间起」的提醒")
    bad += not got_warn

    print()
    if bad:
        sys.exit(f"自检没过：{bad} 条行为不对。逐字校验拦不住的东西会直接上线。")
    print("自检通过：改动、拼接拦得住；正当摘引能过；"
          "截反意思拦不住但会出提醒（这条只能靠人）。")


if __name__ == "__main__":
    main()
