#!/usr/bin/env python3
"""把 tracks.json 裡有對應 .lrc 的 lyricsUrl 從 .txt 改成 .lrc"""
import json
import os
import re
import unicodedata

MUSIC_DIR = r"D:\project\astro\public\music"
TRACKS_JSON = os.path.join(MUSIC_DIR, "tracks.json")
GUIDE_FILES = {"LRC-GUIDE.txt", "README.txt", "UPLOAD-GUIDE.txt"}


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def main():
    with open(TRACKS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 索引 lrc files
    lrc_by_norm = {}
    for fn in os.listdir(MUSIC_DIR):
        if not fn.endswith(".lrc"):
            continue
        base = os.path.splitext(fn)[0]
        norm_base = strip_accents(base.lower())
        song_part = re.sub(r"^(?:track-)?\d{1,3}[-_]\s*", "", norm_base)
        song_part = re.sub(r"\s*[(（][^)）]+[)）]$", "", song_part)
        song_part = re.sub(r"\s+", "", song_part)
        lrc_by_norm[song_part] = fn

    changed = 0
    for track in data["tracks"]:
        title = track["title"]
        norm_title = strip_accents(title.lower())
        clean = re.sub(r"\s*[(（][^)）]+[)）]$", "", norm_title).strip()
        clean = re.sub(r"\s+", "", clean)
        lrc_fn = lrc_by_norm.get(clean)
        if lrc_fn:
            new_url = f"/music/{lrc_fn}"
            if track.get("lyricsUrl") != new_url:
                track["lyricsUrl"] = new_url
                changed += 1
    with open(TRACKS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Updated {changed} tracks to point to .lrc files")


if __name__ == "__main__":
    main()
