# -*- coding: utf-8 -*-
"""歌詞解析（產線 1 歌詞影片 / 產線 4 歌詞手冊 共用）

解析規則刻意與 astro/src/lib/musicSongs.ts 一致，
這樣工具鏈產出的成品跟網站頁面顯示的標題、分段、hook 才對得上。

歌詞檔格式（UTF-8）：

    ===== 歌名 =====
    【Verse 1】
    歌詞一行
    【Chorus】
    歌詞一行

注意：
  - 有些檔案用【 verse 1 】（小寫 + 內含空格），都要能解析。
  - 有些檔案是簡體中文（「下车」「紧握」），不要做任何轉換。
  - 標題列「===== xxx =====」不是歌詞，要跳過。
"""

from __future__ import print_function

import io
import os
import re

SECTION_RE = re.compile(r"^[【\[]\s*(.+?)\s*[】\]]$")
TITLE_RE = re.compile(r"=+\s*(.+?)\s*=+")

# 段落種類的關鍵字（依比對順序，先命中先算）
KIND_RULES = [
    ("prechorus", ("pre-chorus", "prechorus", "pre chorus", "副歌前", "導歌", "預副歌")),
    ("chorus", ("chorus", "副歌", "疊", "refrain")),
    ("bridge", ("bridge", "橋段", "副橋", "間奏")),
    ("intro", ("intro", "前奏", "導言")),
    ("outro", ("outro", "尾奏", "尾聲", "ending")),
    ("verse", ("verse", "主歌", "段落")),
]

KIND_LABEL = {
    "intro": "前奏",
    "verse": "主歌",
    "prechorus": "預副歌",
    "chorus": "副歌",
    "bridge": "橋段",
    "outro": "尾奏",
    "verse_tail": "尾段",
}


def classify(label):
    """把段落標籤分類：intro / verse / prechorus / chorus / bridge / outro。"""
    low = (label or "").lower()
    for kind, keys in KIND_RULES:
        for k in keys:
            if k in low:
                return kind
    return "verse"


def parse(raw, fallback_title=""):
    """回傳 {'title','hook','sections','lines'}。

    sections = [{'label': 原始標籤, 'kind': 分類, 'lines': [行, ...]}, ...]
    """
    title = ""
    m = TITLE_RE.search(raw)
    if m:
        title = m.group(1).strip()
    if not title:
        title = (fallback_title or "").strip()

    sections = []
    cur = None
    for raw_line in raw.split("\n"):
        line = raw_line.strip().lstrip("\ufeff").strip()
        if not line:
            continue
        if line.startswith("="):
            continue
        sm = SECTION_RE.match(line)
        if sm:
            label = sm.group(1).strip()
            cur = {"label": label, "kind": classify(label), "lines": []}
            sections.append(cur)
            continue
        if cur is None:
            cur = {"label": "", "kind": "verse", "lines": []}
            sections.append(cur)
        cur["lines"].append(line)

    lines = [ln for s in sections for ln in s["lines"]]

    hook = ""
    for s in sections:
        if s["kind"] == "chorus" and s["lines"]:
            hook = s["lines"][0]
            break
    if not hook and lines:
        hook = lines[0]

    return {"title": title, "hook": hook, "sections": sections, "lines": lines}


def parse_file(path, fallback_title=""):
    """讀檔解析；壞檔回空結果，不讓整批產線中斷。"""
    try:
        with io.open(path, encoding="utf-8") as f:
            raw = f.read()
    except (IOError, OSError, UnicodeDecodeError) as e:
        return {"title": fallback_title, "hook": "", "sections": [],
                "lines": [], "error": str(e)}
    res = parse(raw, fallback_title)
    if not res["title"]:
        base = os.path.splitext(os.path.basename(path))[0]
        res["title"] = re.sub(r"^\d+[-_]", "", base)
    return res
