"""
lyrics-burn.py — 把 LRClib 查到的歌詞燒進 MP3 的 USLT frame。

用法:
  python lyrics-burn.py <mp3_path>
  python lyrics-burn.py <mp3_path> --artist "正確的歌手名"   # 覆蓋 ID3 亂碼
  python lyrics-burn.py <mp3_path> --auto 0  # 跳過互動直接選第 0 個

互動流程:
  1. 解析 ID3 → 抽 title/artist
  2. 查 LRClib
  3. 列出 N 個候選，user 選
  4. fetch LRC (synced preferred)
  5. 燒 USLT frame 到新檔 <原檔名>-lyric.mp3
  6. print summary

依賴: 無（只用 Python 標準庫）
"""
import sys
import os
import struct
import json
import urllib.request
import urllib.parse
import argparse

# 強制 UTF-8 stdout（Windows cp950 預設會炸韓文 / 日文 / 特殊字元）
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

def read_id3v2(data):
    """解析 ID3v2 header + frames，回傳 (version, frames_dict)"""
    if data[:3] != b"ID3":
        return None, {}
    ver_major = data[3]
    ver_rev = data[4]
    flags = data[5]
    tag_size = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f)

    frames = {}
    pos = 10
    end = 10 + tag_size
    if pos + tag_size > len(data):
        return (ver_major, ver_rev, flags), {}

    # v2.3/v2.4 extended header 處理（簡化：跳過）
    if (flags & 0x40) and pos + 4 <= end:
        if ver_major >= 4:
            ext_size = ((data[pos] & 0x7f) << 21) | ((data[pos+1] & 0x7f) << 14) | ((data[pos+2] & 0x7f) << 7) | (data[pos+3] & 0x7f)
        else:
            ext_size = (data[pos] << 21) | (data[pos+1] << 14) | (data[pos+2] << 7) | data[pos+3]
        pos += 4 + ext_size

    while pos + 10 <= end:
        fid = data[pos:pos+4]
        if fid[0] == 0:
            break
        fsize = (data[pos+4] << 24) | (data[pos+5] << 16) | (data[pos+6] << 8) | data[pos+7]
        fflags = (data[pos+8] << 8) | data[pos+9]
        body = bytes(data[pos+10:pos+10+fsize])
        frames[fid.decode("ascii", errors="replace")] = (fsize, fflags, body)
        pos += 10 + fsize

    return (ver_major, ver_rev, flags), frames


def decode_text(body):
    """解 ID3 text frame body（帶 encoding byte）"""
    if not body:
        return ""
    enc = body[0]
    raw = body[1:]
    if enc == 3:
        return raw.decode("utf-8", errors="replace")
    elif enc in (1, 2):
        return raw.decode("utf-16", errors="replace")
    else:
        return raw.decode("iso-8859-1", errors="replace")


def get_text(frames, name):
    """從 frames dict 抽指定 frame 的文字"""
    if name not in frames:
        return None
    _, _, body = frames[name]
    return decode_text(body).rstrip("\x00").strip() or None


def search_lrclib(title, artist=None):
    """查 LRClib 回傳 list of hits"""
    params = {"track_name": title}
    if artist:
        params["artist_name"] = artist
    url = "https://lrclib.net/api/search?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "lyrics-burn/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"[warn] LRClib 查詢失敗: {e}")
        return []


def build_uslt_frame(lyrics_text, encoding=3):
    """建一個 USLT frame bytes（不含 frame header，只 body）"""
    if encoding == 3:
        text_bytes = lyrics_text.encode("utf-8")
        enc_byte = b"\x03"
    elif encoding in (1, 2):
        text_bytes = lyrics_text.encode("utf-16-be")
        enc_byte = b"\x02"
    else:
        text_bytes = lyrics_text.encode("iso-8859-1")
        enc_byte = b"\x00"
    lang = b"zho"  # Chinese (3 chars)
    descriptor = b"\x00"  # empty descriptor + null terminator
    return enc_byte + lang + descriptor + text_bytes


def build_frame(frame_id, body, version=4):
    """建一個完整 frame（含 10-byte header）"""
    size = len(body)
    # v2.4 frame size 仍是 big-endian (不是 syncsafe！這跟 v2.3 一樣)
    # 但有些實作 v2.4 也用 syncsafe，這裡用 big-endian 相容性最高
    size_bytes = struct.pack(">I", size)
    flags = b"\x00\x00"
    return frame_id.encode("ascii") + size_bytes + flags + body


def rebuild_id3v2_with_uslt(data, lyrics_text, version=4):
    """在原 ID3v2 tag 裡面加入（或替換）USLT frame，重新計算 size"""
    if data[:3] != b"ID3":
        return None
    ver_major, ver_rev, flags, frames = data[3], data[4], data[5], {}
    tag_size = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f)

    # 解析原 frames
    pos = 10
    end = 10 + tag_size
    if (flags & 0x40) and pos + 4 <= end:
        if ver_major >= 4:
            ext_size = ((data[pos] & 0x7f) << 21) | ((data[pos+1] & 0x7f) << 14) | ((data[pos+2] & 0x7f) << 7) | (data[pos+3] & 0x7f)
        else:
            ext_size = (data[pos] << 21) | (data[pos+1] << 14) | (data[pos+2] << 7) | data[pos+3]
        pos += 4 + ext_size

    while pos + 10 <= end:
        fid = data[pos:pos+4]
        if fid[0] == 0:
            break
        fsize = (data[pos+4] << 24) | (data[pos+5] << 16) | (data[pos+6] << 8) | data[pos+7]
        fflags = (data[pos+8] << 8) | data[pos+9]
        body = bytes(data[pos+10:pos+10+fsize])
        frames[fid.decode("ascii", errors="replace")] = body
        pos += 10 + fsize

    # 移除舊 USLT，插新 USLT
    if "USLT" in frames:
        del frames["USLT"]
    frames["USLT"] = build_uslt_frame(lyrics_text, encoding=3)

    # 重組 frames（按 frame ID 排序，ID3 spec 建議）
    sorted_frames = b"".join(
        build_frame(fid, body, version=ver_major)
        for fid, body in sorted(frames.items())
    )

    # 計算新 tag size
    new_tag_size = len(sorted_frames)
    syncsafe = bytes([
        (new_tag_size >> 21) & 0x7f,
        (new_tag_size >> 14) & 0x7f,
        (new_tag_size >> 7) & 0x7f,
        new_tag_size & 0x7f,
    ])

    new_id3 = b"ID3" + bytes([ver_major, ver_rev, flags]) + syncsafe + sorted_frames
    audio_after = data[10 + tag_size:]  # ID3 tag 後的音訊資料

    return new_id3 + audio_after


def main():
    ap = argparse.ArgumentParser(description="從 LRClib 抓歌詞燒進 MP3 的 USLT frame")
    ap.add_argument("mp3_path", help="MP3 檔路徑")
    ap.add_argument("--artist", help="覆蓋 ID3 內的 artist（用於 LRClib 查詢）")
    ap.add_argument("--auto", type=int, help="自動選第 N 個候選（0-indexed），跳過互動")
    args = ap.parse_args()

    src = args.mp3_path
    if not os.path.isfile(src):
        print(f"[err] 找不到檔案: {src}")
        return 1

    print(f"=== 讀取 {src} ===")
    with open(src, "rb") as f:
        data = bytearray(f.read())

    version, frames = read_id3v2(data)
    if not version:
        print("[err] 沒有 ID3v2 header")
        return 1
    print(f"ID3v2.{version[0]}.{version[1]}, flags=0x{version[2]:02x}")
    print(f"已存在 frames: {sorted(frames.keys())}")

    title = get_text(frames, "TIT2")
    artist = args.artist or get_text(frames, "TPE1")
    print(f"title:  {title!r}")
    print(f"artist: {artist!r}")

    if not title:
        print("[err] 沒 title，無法查 LRClib")
        return 1

    print()
    print(f"=== 查 LRClib: title={title!r} artist={artist!r} ===")
    results = search_lrclib(title, artist)
    print(f"找到 {len(results)} 個結果")
    for i, r in enumerate(results[:15]):
        synced = "[LRC]" if r.get("syncedLyrics") else "[TXT]"
        print(f"  [{i:2d}] {r.get('artistName', '?')[:30]:30s} - {r.get('trackName', '?')[:30]:30s}  ({r.get('albumName', '?')[:25]:25s}) {synced}")

    # 0 results 時 fallback：跳過 artist 只查 title
    if not results:
        print("\n[fallback] 用 artist 查不到，改用 title only 再試一次")
        results = search_lrclib(title, None)
        print(f"找到 {len(results)} 個結果")
        for i, r in enumerate(results[:15]):
            synced = "[LRC]" if r.get("syncedLyrics") else "[TXT]"
            print(f"  [{i:2d}] {r.get('artistName', '?')[:30]:30s} - {r.get('trackName', '?')[:30]:30s}  ({r.get('albumName', '?')[:25]:25s}) {synced}")

    if not results:
        print("[err] LRClib 找不到")
        return 1

    # 選項
    if args.auto is not None:
        if args.auto >= len(results):
            print(f"[err] --auto {args.auto} 超出範圍")
            return 1
        chosen = results[args.auto]
    else:
        try:
            choice = input(f"\n選第幾個？ (0-{len(results)-1}, Enter 跳過): ").strip()
        except EOFError:
            return 1
        if not choice:
            print("跳過")
            return 0
        idx = int(choice)
        if idx < 0 or idx >= len(results):
            print(f"[err] 範圍錯")
            return 1
        chosen = results[idx]

    lyrics = chosen.get("syncedLyrics") or chosen.get("plainLyrics")
    if not lyrics:
        print("[err] 選的這個沒歌詞")
        return 1

    print(f"\n選: {chosen['artistName']} - {chosen['trackName']}")
    print(f"歌詞長度: {len(lyrics)} chars")
    print(f"前 200 字: {lyrics[:200]!r}")

    # 寫 preview 檔方便 user 用 notepad 開
    preview_path = os.path.splitext(src)[0] + "-lyrics-preview.txt"
    try:
        with open(preview_path, "w", encoding="utf-8") as f:
            f.write(f"# {chosen['artistName']} - {chosen['trackName']}\n")
            f.write(f"# Source: LRClib (id={chosen.get('id')})\n")
            f.write(f"# Synced: {bool(chosen.get('syncedLyrics'))}\n")
            f.write(f"# Length: {len(lyrics)} chars\n\n")
            f.write(lyrics)
        print(f"歌詞 preview 寫入 {preview_path}")
    except Exception as e:
        print(f"[warn] preview 寫入失敗: {e}")

    # 燒進 MP3
    new_data = rebuild_id3v2_with_uslt(data, lyrics, version=version[0])
    if new_data is None:
        return 1

    # 輸出
    base, ext = os.path.splitext(src)
    dst = f"{base}-lyric{ext or '.mp3'}"
    with open(dst, "wb") as f:
        f.write(new_data)
    print(f"\n[ok] 寫入 {dst}")
    print(f"     原檔 {len(data):,} bytes → 新檔 {len(new_data):,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
