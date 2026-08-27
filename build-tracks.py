#!/usr/bin/env python3
"""Build tracks.json for the music player from actual files on disk."""
import os, json, re, urllib.parse, unicodedata

MUSIC_DIR = r"D:\project\astro\public\music"
LYRICS_DIR = MUSIC_DIR
COVERS_DIR = os.path.join(MUSIC_DIR, "covers")
GUIDE_FILES = {"LRC-GUIDE.txt", "README.txt", "UPLOAD-GUIDE.txt"}


def strip_accents(s):
    """Normalize for fuzzy matching (full-width → half-width, remove accents)."""
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def parse_filename(name):
    """Parse '02_兄弟本色.mp3' or 'track-01-内卷共和国---UUID.mp3' into (sort_key, title, version)."""
    base = os.path.splitext(name)[0]
    # strip trailing UUID (8-4-4-4-12)
    base = re.sub(r"---[0-9a-f-]{36}$", "", base, flags=re.IGNORECASE)
    # detect version suffix
    version = ""
    m = re.search(r"[(（]([^)）]+)[)）]$", base)
    if m:
        version = m.group(1)
        base = base[: m.start()].rstrip()
    # detect leading track number
    sort_key = 0
    m = re.match(r"^(?:track-)?(\d+)[-_]", base)
    if m:
        sort_key = int(m.group(1))
        title = re.sub(r"^(?:track-)?\d+[-_]\s*", "", base)
    else:
        title = base
    # also handle pure leading "0X_"
    if sort_key == 0:
        m = re.match(r"^(\d+)[-_]", base)
        if m:
            sort_key = int(m.group(1))
    if version:
        title = f"{title} ({version})"
    return sort_key, title


def main():
    # index lyrics and covers by normalized base name
    lyrics_by_norm = {}
    for fn in os.listdir(MUSIC_DIR):
        if not fn.endswith(".txt"):
            continue
        if fn in GUIDE_FILES:
            continue
        base = os.path.splitext(fn)[0]
        lyrics_by_norm[strip_accents(base.lower())] = fn

    covers_by_norm = {}
    if os.path.isdir(COVERS_DIR):
        for fn in os.listdir(COVERS_DIR):
            base, ext = os.path.splitext(fn)
            if ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            covers_by_norm[strip_accents(base.lower())] = fn

    # walk mp3 files
    rows = []
    for fn in sorted(os.listdir(MUSIC_DIR)):
        if not fn.lower().endswith(".mp3"):
            continue
        base = os.path.splitext(fn)[0]
        sort_key, title = parse_filename(fn)
        # estimate duration from file size (rough: 1MB ≈ 60s for 128kbps mp3)
        size_kb = os.path.getsize(os.path.join(MUSIC_DIR, fn)) / 1024
        # 128 kbps = 16 KB/s
        est_duration = int(size_kb / 16)
        # lyrics
        lyrics_url = None
        norm_base = strip_accents(base.lower())
        if norm_base in lyrics_by_norm:
            lyrics_url = f"/music/{lyrics_by_norm[norm_base]}"
        else:
            # try without version suffix
            base_no_ver = re.sub(r"[(（][^)）]+[)）]$", "", base).rstrip()
            norm_base_nv = strip_accents(base_no_ver.lower())
            for k, v in lyrics_by_norm.items():
                if k == norm_base_nv or k.startswith(norm_base_nv):
                    lyrics_url = f"/music/{v}"
                    break
        # cover
        cover_url = None
        if norm_base in covers_by_norm:
            cover_url = f"/music/covers/{covers_by_norm[norm_base]}"
        else:
            # try matching first part
            base_no_ver = re.sub(r"[(（][^)）]+[)）]$", "", base).rstrip()
            norm_base_nv = strip_accents(base_no_ver.lower())
            for k, v in covers_by_norm.items():
                if k == norm_base_nv or k.startswith(norm_base_nv):
                    cover_url = f"/music/covers/{v}"
                    break
        # detect album grouping
        is_track_album = fn.startswith("track-")
        album = "这个时代的艺术家 (AI 概念专辑)" if is_track_album else "Demo Tracks"
        artist = "AI Demo 樂團" if is_track_album else "未知藝術家"
        rows.append({
            "id": len(rows) + 1,
            "title": title,
            "artist": artist,
            "album": album,
            "duration": est_duration,
            "url": f"/music/{fn}",
            "cover": cover_url or "🎵",
            "lyricsUrl": lyrics_url,
            "favorite": False,
        })
    rows.sort(key=lambda r: (r.get("album", ""), r["id"]))
    # reassign id after sort
    for i, r in enumerate(rows, 1):
        r["id"] = i
    out = {
        "version": 1,
        "generatedAt": "2026-08-26",
        "count": len(rows),
        "tracks": rows,
    }
    out_path = os.path.join(MUSIC_DIR, "tracks.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"Wrote {out_path} with {len(rows)} tracks")
    # summary
    with_cover = sum(1 for r in rows if r["cover"] and r["cover"] != "🎵")
    with_lyrics = sum(1 for r in rows if r["lyricsUrl"])
    print(f"  covers: {with_cover}/{len(rows)}")
    print(f"  lyrics: {with_lyrics}/{len(rows)}")
    print("\nFirst 10 tracks:")
    for r in rows[:10]:
        cov = r["cover"] or ""
        lyr = r["lyricsUrl"] or ""
        print(f"  [{r['id']:2d}] {r['title']:25s} {r['artist']:12s} cover={cov:40s} lyrics={lyr}")


if __name__ == "__main__":
    main()
