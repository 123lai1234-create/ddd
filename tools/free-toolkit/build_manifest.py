"""
從一個「音樂資料夾」自動產生 songs.json
=====================================
donttalk 的音樂素材放在 astro/public/music/（每首歌一個 .txt 歌詞檔，
旁邊可能有同名 .mp3，covers/ 裡有封面圖）。這個腳本把那個資料夾掃成
產線 2 / 產線 3 吃的 songs.json，不用手動維護 100+ 筆清單。

用法：
    python build_manifest.py --music-dir D:\\project\\astro\\public\\music \
                             --out data\\songs.json
    python build_manifest.py --music-dir ... --limit 5      # 只取前 5 首
    python build_manifest.py --music-dir ... --only-audio   # 只收有 mp3 的歌

歌詞檔格式（UTF-8）：
    ===== 歌名 =====
    【Verse 1】
    ...
    【Chorus】      ← 這段的第一行會被當成「hook line」放進卡片
    ...
"""

import argparse
import io
import json
import os
import re
import sys

import common

# 卡片配色循環（依序套用，讓一批卡片有節奏感又不亂）
PALETTE = [
    ("#E8A33D", "#101820"),
    ("#7FB3D5", "#0E1A24"),
    ("#9FD6A3", "#121A16"),
    ("#E39B9B", "#1A1012"),
    ("#B79BDB", "#14101C"),
    ("#E8C87B", "#1C1810"),
]

SKIP_FILES = {"lrc-guide.txt", "readme.txt", "readme.md"}


def is_doc(path):
    """判斷這個 .txt 是不是「說明文件」而不是歌詞。

    donttalk 的 astro/public/music/ 裡混了 UPLOAD-GUIDE.txt 這類 markdown 說明，
    內容以 '#' 開頭。若不排除，它會被當成第 126 首歌，連卡片都產出來。
    """
    try:
        with io.open(path, encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s:
                    continue
                return s.startswith("#")
    except (OSError, UnicodeDecodeError):
        return True
    return False


def parse_lyrics(path):
    """回傳 (title, hook)。hook 優先取 Chorus 段第一行，沒有就取第一句歌詞。"""
    with io.open(path, encoding="utf-8") as f:
        raw = f.read()

    title = ""
    m = re.search(r"=+\s*(.+?)\s*=+", raw)
    if m:
        title = m.group(1).strip()
    if not title:
        base = os.path.splitext(os.path.basename(path))[0]
        title = re.sub(r"^\d+[-_]", "", base)

    lines = [ln.strip() for ln in raw.splitlines()]
    section = ""
    chorus = []
    first = ""
    for ln in lines:
        sm = re.match(r"^[【\[]\s*(.+?)\s*[】\]]$", ln)
        if sm:
            section = sm.group(1).strip().lower()
            continue
        if not ln or ln.startswith("="):
            continue
        if not first:
            first = ln
        if "chorus" in section or "副歌" in section or "疊" in section:
            chorus.append(ln)

    hook = chorus[0] if chorus else first
    return title, hook


def find_audio(music_dir, stem):
    """找同名的音檔（副檔名大小寫不拘）。"""
    for ext in (".mp3", ".m4a", ".wav", ".flac", ".ogg"):
        p = os.path.join(music_dir, stem + ext)
        if os.path.exists(p):
            return p
    low = stem.lower()
    for fn in os.listdir(music_dir):
        full = os.path.join(music_dir, fn)
        if os.path.isfile(full) and os.path.splitext(fn)[0].lower() == low:
            if os.path.splitext(fn)[1].lower() in (".mp3", ".m4a", ".wav", ".flac", ".ogg"):
                return full
    return None


def find_cover(music_dir, stem):
    """找封面：先看 covers/ 子資料夾，再用檔名關鍵字比對。"""
    covers_dir = os.path.join(music_dir, "covers")
    key = re.sub(r"^\d+[-_]", "", stem)
    if os.path.isdir(covers_dir):
        for fn in os.listdir(covers_dir):
            if re.sub(r"^\d+[-_]", "", os.path.splitext(fn)[0]) == key:
                return os.path.join(covers_dir, fn)
    return None


def main():
    ap = argparse.ArgumentParser(description="從音樂資料夾產生 songs.json")
    ap.add_argument("--music-dir", required=True, help="音樂素材資料夾")
    ap.add_argument("--out", default=os.path.join(common.DATA_DIR, "songs.json"))
    ap.add_argument("--limit", type=int, default=0, help="只取前 N 首（0 = 全部）")
    ap.add_argument("--only-audio", action="store_true", help="只收有音檔的歌")
    args = ap.parse_args()

    md = os.path.abspath(args.music_dir)
    if not os.path.isdir(md):
        print("[ERROR] 音樂資料夾不存在：%s" % md)
        sys.exit(2)

    files = sorted(fn for fn in os.listdir(md)
                   if fn.lower().endswith(".txt") and fn.lower() not in SKIP_FILES)
    files = [fn for fn in files if not is_doc(os.path.join(md, fn))]
    songs = []
    for fn in files:
        stem = os.path.splitext(fn)[0]
        title, hook = parse_lyrics(os.path.join(md, fn))
        audio = find_audio(md, stem)
        cover = find_cover(md, stem)
        if args.only_audio and not audio:
            continue
        c1, c2 = PALETTE[len(songs) % len(PALETTE)]
        songs.append({
            "id": stem,
            "title": title,
            "artist": "不說",
            "lyric": hook,
            "subtitle": "donttalk.vercel.app",
            "color1": c1,
            "color2": c2,
            "audio": os.path.basename(audio) if audio else None,
            "cover": ("covers/" + os.path.basename(cover)) if cover else None,
        })
        if args.limit and len(songs) >= args.limit:
            break

    # music_dir 記成相對於 manifest 的路徑，換機器也不會壞
    rel = os.path.relpath(md, os.path.dirname(os.path.abspath(args.out)))
    data = {"music_dir": rel.replace("\\", "/"), "songs": songs}

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with io.open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    with_audio = sum(1 for s in songs if s.get("audio"))
    with_cover = sum(1 for s in songs if s.get("cover"))
    print("掃描 %s" % md)
    print("  歌詞檔 %d 份 → 產出 %d 筆" % (len(files), len(songs)))
    print("  其中有音檔 %d 筆、有封面 %d 筆" % (with_audio, with_cover))
    print("  manifest：%s" % args.out)
    for s in songs[:5]:
        print("   - %-28s | %s | audio=%s cover=%s"
              % (s["id"][:28], (s["lyric"] or "")[:18], bool(s["audio"]), bool(s["cover"])))


if __name__ == "__main__":
    main()
