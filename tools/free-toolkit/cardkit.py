"""
卡片排版引擎（Inkscape SVG 模板）
=================================
產線 2（網站素材）與產線 3（歌詞卡／封面圖）共用這一層。

設計思路：SVG 模板裡放 {{PLACEHOLDER}}，Python 負責填字、斷行、算版面，
最後交給 Inkscape CLI 匯出 PNG。同一份模板靠 --export-width 縮放到不同尺寸，
所以「排一次版，多尺寸重用」，不會每一種尺寸各寫一套。

為什麼不直接用 PIL 畫字：Inkscape 的文字排版（含 CJK 斷行、字重、對齊）
比 PIL 好控制，而且 Inkscape 是向量輸出，3000x3000 的封面圖放大不會糊。
"""

import os
import re

from common import TPL_DIR, DATA_DIR, run, svg_to_png, tool


# --------------------------------------------------------------- 工具函式
def esc(s):
    """XML 文字節點轉義。"""
    return (str(s or "")
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def wrap_cjk(text, max_chars=14, max_lines=4):
    """中英混排斷行。

    中文逐字斷；英文／數字盡量不拆開單詞，太長才硬斷。
    回傳 list[str]。
    """
    text = (text or "").strip()
    if not text:
        return []

    lines, cur, cur_w = [], "", 0
    tokens = re.findall(r"[A-Za-z0-9''\"\-.,!?%&]+|\s+|[^\sA-Za-z0-9]", text)
    for tk in tokens:
        if tk.isspace():
            if cur and cur_w < max_chars:
                cur += " "
                cur_w += 1
            continue
        if re.match(r"^[A-Za-z0-9]", tk):
            if cur_w + len(tk) > max_chars and cur:
                lines.append(cur.rstrip())
                cur, cur_w = "", 0
                if len(lines) >= max_lines:
                    break
            cur += tk
            cur_w += len(tk)
        else:
            if cur_w + 1 > max_chars and cur:
                lines.append(cur.rstrip())
                cur, cur_w = "", 0
                if len(lines) >= max_lines:
                    break
            cur += tk
            cur_w += 1
    if cur.strip() and len(lines) < max_lines:
        lines.append(cur.rstrip())
    return lines[:max_lines]


def tspans(lines, x, y, line_height, anchor="start", cls="lyric",
           font_size=46, fill="#F5F1E8", font_family=None, opacity=None,
           weight=None, letter_spacing=None):
    """把多行文字轉成 <tspan> 群組（樣式直接寫成 inline attribute，避免依賴 CSS）。"""
    if not lines:
        return ""
    attrs = ['x="%s"' % x, 'y="%s"' % y, 'class="%s"' % cls,
             'text-anchor="%s"' % anchor,
             'font-size="%s"' % font_size, 'fill="%s"' % fill]
    if font_family:
        attrs.append('font-family="%s"' % font_family)
    if opacity is not None:
        attrs.append('opacity="%s"' % opacity)
    if weight:
        attrs.append('font-weight="%s"' % weight)
    if letter_spacing is not None:
        attrs.append('letter-spacing="%s"' % letter_spacing)

    out = ["<text %s>" % " ".join(attrs)]
    for i, ln in enumerate(lines):
        dy = 0 if i == 0 else line_height
        out.append('<tspan x="%s" dy="%s">%s</tspan>' % (x, dy, esc(ln)))
    out.append("</text>")
    return "\n".join(out)


def motif(cx, cy, r=26, stroke=6, color="{{COLOR1}}", opacity=0.9):
    """兩個同心環的抽象標記（純幾何，不依賴字型，絕對畫得出來）。"""
    return (
        '<g opacity="%s" fill="none" stroke="%s" stroke-width="%s">'
        '<circle cx="%s" cy="%s" r="%s"/>'
        '<circle cx="%s" cy="%s" r="%s"/>'
        '</g>' % (opacity, color, stroke,
                  cx, cy, r, cx + r * 1.9, cy, r)
    )


def template_path(name):
    if not name.lower().endswith(".svg"):
        name += ".svg"
    p = os.path.join(TPL_DIR, name)
    if not os.path.exists(p):
        raise FileNotFoundError("找不到模板：%s" % p)
    return p


def render(template, out_png, values, width=None, height=None, timeout=240):
    """填模板 → Inkscape 匯出 PNG。回傳 (ok, detail)。"""
    src = template_path(template) if not os.path.isabs(template) else template
    with open(src, "r", encoding="utf-8") as f:
        svg = f.read()

    missing = []
    for k, v in values.items():
        token = "{{%s}}" % k
        if token not in svg:
            missing.append(k)
        svg = svg.replace(token, v if isinstance(v, str) else str(v))
    left = re.findall(r"\{\{([A-Z_]+)\}\}", svg)
    if left:
        return False, "模板仍有未填的 placeholder: %s" % sorted(set(left))

    svg_file = os.path.splitext(out_png)[0] + ".svg"
    with open(svg_file, "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)

    r = svg_to_png(svg_file, out_png, width=width, height=height, timeout=timeout)
    if not os.path.exists(out_png) or os.path.getsize(out_png) < 500:
        return False, "Inkscape 匯出失敗: %s" % ((r.stderr or r.stdout or "")[-220:]).replace("\n", " ")
    return True, "%d bytes" % os.path.getsize(out_png)


def hex_to_rgb(h):
    h = (h or "#000000").lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return (0, 0, 0)


def mix(c1, c2, t):
    """在兩個 hex 色之間插值，t=0 → c1，t=1 → c2。"""
    a = hex_to_rgb(c1)
    b = hex_to_rgb(c2)
    return "#%02X%02X%02X" % tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def luminance(h):
    r, g, b = hex_to_rgb(h)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def readable_on(bg, light="#FFFFFF", dark="#101820", threshold=0.55):
    """依背景亮度挑一個看得清楚的文字色。"""
    return light if luminance(bg) < threshold else dark


# ----------------------------------------------------------------- 版面配置
# 每個模板的歌詞區位置、字級、斷行規則。
# 改這個表就能一次調整所有模板的排版，不用動 SVG。
LAYOUTS = {
    "card_square":  {"lyric_x": 96,  "lyric_y": 336, "lh": 56, "size": 46, "chars": 14, "lines": 4},
    "card_story":   {"lyric_x": 110, "lyric_y": 548, "lh": 62, "size": 52, "chars": 13, "lines": 5},
    "card_yt":      {"lyric_x": 76,  "lyric_y": 232, "lh": 48, "size": 38, "chars": 17, "lines": 3},
    "og_image":     {"lyric_x": 80,  "lyric_y": 436, "lh": 50, "size": 36, "chars": 21, "lines": 3},
    "share_square": {"lyric_x": 110, "lyric_y": 356, "lh": 58, "size": 48, "chars": 13, "lines": 4},
}

FONT_CJK = "Microsoft JhengHei, Microsoft JhengHei UI, Noto Sans CJK TC, sans-serif"


def build_values(song, template_name, base=None):
    """把一筆歌曲資料 + 模板版面 → SVG placeholder 字典。"""
    lay = LAYOUTS[template_name]
    base = base or {}

    c1 = song.get("color1") or base.get("color1") or "#E8A33D"
    c2 = song.get("color2") or base.get("color2") or "#101820"
    c3 = song.get("color3") or base.get("color3") or mix(c2, "#000000", 0.35)

    lyric = song.get("lyric") or ""
    lines = wrap_cjk(lyric, lay["chars"], lay["lines"])

    vals = {
        "COLOR1": c1,
        "COLOR2": c2,
        "COLOR3": c3,
        "TEXTCOLOR": readable_on(c2),
        "TITLE": esc(song.get("title") or base.get("title") or ""),
        "ARTIST": esc(song.get("artist") or base.get("artist") or ""),
        "SUBTITLE": esc(song.get("subtitle") or base.get("url") or ""),
        "FONT": FONT_CJK,
        "LYRIC_LINES": tspans(
            lines, lay["lyric_x"], lay["lyric_y"], lay["lh"],
            font_size=lay["size"], fill=readable_on(c2), font_family=FONT_CJK,
            opacity=0.88),
    }
    return vals


# ----------------------------------------------------------------- manifest
def load_manifest(path=None):
    """讀歌曲清單。找不到就用內建的示範資料，確保腳本永遠跑得動。

    音檔 / 封面欄位支援三種寫法，都會被解析成絕對路徑：
      - 絕對路徑
      - 相對於 manifest 所在資料夾
      - 相對於 manifest 頂層的 music_dir（給 build_manifest.py 產生的那種）
    """
    path = path or os.path.join(DATA_DIR, "songs.json")
    if not os.path.exists(path):
        return sample_songs()
    import json
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    music_dir = ""
    if isinstance(data, dict):
        music_dir = data.get("music_dir", "")
        data = data.get("songs", [])
    base = os.path.dirname(os.path.abspath(path))

    for song in data:
        for key in ("audio", "cover"):
            v = song.get(key)
            if not v:
                continue
            if os.path.isabs(v):
                continue
            cands = [os.path.join(base, v)]
            if music_dir:
                cands.append(os.path.join(base, music_dir, v))
                cands.append(os.path.join(base, music_dir, os.path.basename(v)))
            for cand in cands:
                if cand and os.path.exists(cand):
                    song[key] = os.path.abspath(cand)
                    break
    return data


def load_site(path=None):
    """讀站點設定（logo / favicon / 預設配色）。"""
    path = path or os.path.join(DATA_DIR, "site.json")
    if not os.path.exists(path):
        return default_site()
    import json
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def default_site():
    return {
        "site": "donttalk",
        "title": "不說",
        "tagline": "免費聊聊",
        "url": "https://donttalk.vercel.app",
        "color1": "#E8A33D",
        "color2": "#101820",
        "color3": "#0A0E14",
        "initial": "不",
    }


def sample_songs():
    """示範用的三筆資料（沒有 manifest 時的後備）。"""
    return [
        {
            "id": "dont-talk",
            "title": "不說",
            "artist": "不說",
            "lyric": "有些話，說出口就輕了。\n你我都清楚，於是都留在心裡。",
            "subtitle": "donttalk.vercel.app",
            "color1": "#E8A33D",
            "color2": "#101820",
        },
        {
            "id": "late-night",
            "title": "深夜的試算題",
            "artist": "不說",
            "lyric": "凌晨三點的便利商店，\n熱咖啡與算不出的答案。",
            "subtitle": "donttalk.vercel.app",
            "color1": "#7FB3D5",
            "color2": "#0E1A24",
        },
        {
            "id": "slow-walk",
            "title": "慢慢走",
            "artist": "不說",
            "lyric": "不用趕路的日子，\n連影子都走得很輕。",
            "subtitle": "donttalk.vercel.app",
            "color1": "#9FD6A3",
            "color2": "#121A16",
        },
    ]
