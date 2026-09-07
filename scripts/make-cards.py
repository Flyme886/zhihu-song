#!/usr/bin/env python3
"""把 global_search 返回的回答渲染成知乎风格卡片。

输入 picked.json（list of {author,badge,avatar,vote,url,question,text}），
输出单页 HTML。ContentText 是纯文本，按空行/换行切段。
"""
import html
import json
import re
import sys
from pathlib import Path


def paragraphs(text: str) -> list[str]:
    """纯文本切段。API 的 ContentText 用单换行分段，去掉高亮标记。"""
    text = re.sub(r"</?em>", "", text)
    parts = [p.strip() for p in re.split(r"\n+", text)]
    return [p for p in parts if p]


def card(a: dict) -> str:
    body = "\n".join(
        f'      <p>{html.escape(p)}</p>' for p in paragraphs(a["text"])
    )
    badge = (
        f'\n        <div class="badge">{html.escape(a["badge"])}</div>'
        if a.get("badge")
        else ""
    )
    return f"""  <article class="card">
    <header class="who">
      <img class="avatar" src="{html.escape(a['avatar'])}" alt="{html.escape(a['author'])}的头像">
      <div class="meta">
        <div class="name">{html.escape(a['author'])}</div>{badge}
      </div>
    </header>
    <div class="answer">
{body}
    </div>
    <div class="vote"><span class="thumb">&#128077;</span>赞同 {a['vote']}</div>
  </article>"""


CSS = """
:root {
  --ink: #1a1a1a;
  --ink-soft: #8590a6;
  --blue: #0084ff;
  --bg: #f6f7f9;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 24px 64px;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 720px;
  margin: 0 auto 24px;
  padding-left: 4px;
}
.brand .mark {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--blue);
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand .word {
  font-size: 34px;
  font-weight: 700;
  color: var(--blue);
  letter-spacing: 2px;
}
.card {
  max-width: 720px;
  margin: 0 auto 32px;
  background: #fff;
  border-radius: 16px;
  padding: 44px 48px 40px;
  box-shadow: 0 1px 3px rgba(18, 18, 18, .06),
    0 8px 24px rgba(18, 18, 18, .04);
}
.who {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-bottom: 40px;
}
.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  background: #eef0f2;
  flex: none;
}
.name { font-size: 30px; font-weight: 600; line-height: 1.3; }
.badge {
  margin-top: 8px;
  font-size: 19px;
  color: var(--ink-soft);
  line-height: 1.4;
}
.answer p {
  margin: 0 0 30px;
  font-size: 23px;
  line-height: 1.85;
  letter-spacing: .3px;
}
.answer p:last-child { margin-bottom: 0; }
.vote {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 38px;
  padding: 12px 22px;
  border-radius: 8px;
  background: #ebf5ff;
  color: var(--blue);
  font-size: 21px;
  font-weight: 500;
}
.vote .thumb { font-size: 20px; }
@media (max-width: 560px) {
  body { padding: 20px 12px 40px; }
  .card { padding: 28px 24px 26px; border-radius: 12px; }
  .avatar { width: 64px; height: 64px; }
  .name { font-size: 22px; }
  .badge { font-size: 15px; }
  .answer p { font-size: 17px; margin-bottom: 22px; }
  .vote { font-size: 16px; padding: 9px 16px; }
}
"""


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "picked.json")
    dst = Path(sys.argv[2] if len(sys.argv) > 2 else "cards.html")
    data = json.loads(src.read_text(encoding="utf-8"))
    cards = "\n".join(card(a) for a in data)
    dst.write_text(
        f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>知乎回答卡片</title>
<style>{CSS}</style>
</head>
<body>
  <div class="brand" role="img" aria-label="知乎">
    <div class="mark" aria-hidden="true">知</div>
    <div class="word" aria-hidden="true">知乎</div>
  </div>
{cards}
</body>
</html>
""",
        encoding="utf-8",
    )
    print(f"{dst} <- {len(data)} cards")


if __name__ == "__main__":
    main()
