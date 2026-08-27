#!/usr/bin/env python3
"""把 music/.txt 歌詞轉成 .lrc（時間平均分配，基於 tracks.json 的 duration）。"""
import json
import os
import re
import unicodedata

MUSIC_DIR = r"D:\project\astro\public\music"
TRACKS_JSON = os.path.join(MUSIC_DIR, "tracks.json")
GUIDE_FILES = {"LRC-GUIDE.txt", "README.txt", "UPLOAD-GUIDE.txt"}
SECTION_RE = re.compile(r"^\s*[【\[][^】\]]+[】\]]\s*$")
# 不算歌詞的行：空行、section header、其他元資料


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def to_lrc_time(seconds):
    """秒 → [mm:ss.xx]"""
    m, s = divmod(max(0, seconds), 60)
    return f"[{int(m):02d}:{s:05.2f}]"


def parse_lyrics_txt(text):
    """解析 .txt 歌詞：跳過 section marker，回傳純歌詞行。"""
    out = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if SECTION_RE.match(line):
            continue
        out.append(line)
    return out


def main():
    with open(TRACKS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 索引 lyrics txt by normalized base
    lyrics_by_norm = {}
    for fn in os.listdir(MUSIC_DIR):
        if not fn.endswith(".txt") or fn in GUIDE_FILES:
            continue
        base = os.path.splitext(fn)[0]
        norm_base = strip_accents(base.lower())
        # 去前綴編號 (例如 03_xxx / 03-xxx / track-10-xxx)
        song_part = re.sub(r"^(?:track-)?\d{1,3}[-_]\s*", "", norm_base)
        # 去 (優化版) 之類
        song_part = re.sub(r"\s*[(（][^)）]+[)）]$", "", song_part)
        song_part = re.sub(r"\s+", "", song_part)
        lyrics_by_norm[song_part] = fn

    written = 0
    skipped = 0
    for track in data["tracks"]:
        title = track["title"]
        # 找對應的 txt
        norm_title = strip_accents(title.lower())
        # 去 (優化版) 之類（含前面空格）
        clean_title = re.sub(r"\s*[(（][^)）]+[)）]$", "", norm_title).strip()
        clean_title = re.sub(r"\s+", "", clean_title)
        txt_fn = lyrics_by_norm.get(clean_title)
        if not txt_fn:
            # 嘗試前綴/包含匹配
            for k, v in lyrics_by_norm.items():
                if k == clean_title or k.startswith(clean_title) or clean_title.startswith(k):
                    txt_fn = v
                    break
        if not txt_fn:
            skipped += 1
            continue
        # 讀 lyrics
        with open(os.path.join(MUSIC_DIR, txt_fn), "r", encoding="utf-8") as f:
            text = f.read()
        lines = parse_lyrics_txt(text)
        if not lines:
            skipped += 1
            continue
        duration = int(track.get("duration", 0))
        if duration <= 0:
            skipped += 1
            continue
        # 為每行分配時間（平均，加一點重疊讓銜接感更順）
        n = len(lines)
        step = duration / n
        # LRC header
        lrc = []
        lrc.append(f"[ti:{title}]")
        lrc.append(f"[ar:{track.get('artist', '')}]")
        lrc.append(f"[al:{track.get('album', '')}]")
        lrc.append(f"[length:{to_lrc_time(duration).strip('[]')}]")
        for i, line in enumerate(lines):
            t = i * step
            lrc.append(f"{to_lrc_time(t)}{line}")
        # 寫入 .lrc
        lrc_path = os.path.join(MUSIC_DIR, txt_fn.replace(".txt", ".lrc"))
        with open(lrc_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lrc) + "\n")
        written += 1

    print(f"Wrote {written} LRC files, skipped {skipped} (no matching txt or no duration)")


if __name__ == "__main__":
    main()
