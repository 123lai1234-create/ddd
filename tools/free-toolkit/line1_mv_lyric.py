# -*- coding: utf-8 -*-
"""
line1_mv_lyric.py — 真實歌曲歌詞影片產線
=========================================

把「音檔 + 歌詞 txt + 封面圖」變成一支真的 MV（取代 Premiere Pro 的那條路）：

    1. 解析歌詞 txt → 分段（Verse / Chorus / Bridge…）
    2. 依音檔長度把每一行配時，產生 ASS 字幕檔（副歌換樣式、加大、換色）
    3. FFmpeg：封面圖 → 模糊底 → 慢速推近 → libass 燒字幕 → 原音軌 → master.mp4
    4. 沿用 line1_mv_platforms 的多平台版本 / 音軌 / melt 片頭 / GIMP 縮圖

用法：
    python line1_mv_lyric.py                 # 跑 manifest 裡所有有音檔的歌
    python line1_mv_lyric.py --limit 3       # 只跑前 3 首
    python line1_mv_lyric.py --song 07_愛的模樣
    python line1_mv_lyric.py --list          # 只看會跑哪些

實測踩坑：
  - ffmpeg 的 subtitles 濾鏡在 Windows 上不能直接吃 C:\\ 路徑（冒號會被當成
    選項分隔符）。解法是把工作目錄設成歌曲資料夾，用相對檔名 lyrics.ass。
  - zoompan 逐幀做會很慢；先把背景圖模糊成一張 PNG，再對它做 zoompan，
    速度差一個數量級。
  - melt 的 .mlt 資源必須用相對路徑，否則清掉中間檔就不能重算。
  - Inkscape 預設字型沒有中文字；SVG 要自己指定 Microsoft JhengHei。
"""

from __future__ import print_function

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common          # noqa: E402
import line1_mv_platforms as L1   # noqa: E402  多平台版本 / 音軌 / 縮圖 / 片頭
import lyrics as LY    # noqa: E402

FPS = 25
FONT = "Microsoft JhengHei"
OUT_NAME = "line1_lyric_mv"


# ------------------------------------------------------------------ 路徑
def load_manifest():
    """回傳 (songs, music_dir)。music_dir 是 manifest 裡的相對路徑還原出來的。"""
    mpath = os.path.join(common.DATA_DIR, "songs.json")
    data = common.load_json(mpath, {"songs": []})
    songs = data.get("songs", [])
    rel = data.get("music_dir") or ""
    base = os.path.dirname(os.path.abspath(mpath))
    music_dir = os.path.normpath(os.path.join(base, rel.replace("/", os.sep)))
    return songs, music_dir


def card_assets(music_dir, song):
    """找出這首歌能用的圖：優先真實封面，其次產線 3 的社群素材。"""
    out = []
    cover = song.get("cover")
    if cover:
        p = os.path.join(music_dir, cover.replace("/", os.sep))
        if os.path.exists(p):
            out.append(p)

    cards_dir = os.path.join(common.OUT_ROOT, "line3_cards", song["id"])
    for name in ("yt_1280x720.jpg", "square_1080.jpg", "share_square.jpg"):
        p = os.path.join(cards_dir, name)
        if os.path.exists(p):
            out.append(p)

    # 網站上線用的那批卡片（slug 目錄）當後備
    slug = re.sub(r"[^\w-]+", "-", song["id"], flags=re.UNICODE).strip("-")
    for name in ("yt-1280x720.jpg", "share-card.jpg", "square-1080.jpg"):
        p = os.path.join(music_dir, "cards", slug, name)
        if os.path.exists(p):
            out.append(p)
    return out


# -------------------------------------------------------------------- ASS
def hex_to_ass(color, alpha="00"):
    """#RRGGBB → &HAABBGGRR（ASS 是 BGR）。"""
    c = (color or "#FFFFFF").lstrip("#")
    if len(c) != 6:
        c = "FFFFFF"
    r, g, b = c[0:2], c[2:4], c[4:6]
    return "&H%s%s%s%s" % (alpha, b, g, r)


def ass_time(sec):
    sec = max(0.0, float(sec))
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = sec % 60
    return "%d:%02d:%05.2f" % (h, m, s)


def ass_text(line):
    """ASS 文字轉義：{ } 會被當成樣式碼。"""
    return (line or "").replace("{", "(").replace("}", ")")


ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Verse,{font},{fs_verse},{c_verse},&H000000FF,&H00101018,&H78000000,0,0,0,0,100,100,0.6,0,1,3,2,2,140,140,170,1
Style: Chorus,{font},{fs_chorus},{c_chorus},&H000000FF,&H00101018,&H78000000,-1,0,0,0,100,100,1.2,0,1,3.5,2,2,140,140,170,1
Style: Prechorus,{font},{fs_verse},{c_pre},&H000000FF,&H00101018,&H78000000,0,0,0,0,100,100,0.6,0,1,3,2,2,140,140,170,1
Style: Bridge,{font},{fs_verse},{c_bridge},&H000000FF,&H00101018,&H78000000,0,0,0,0,100,100,0.6,0,1,3,2,2,140,140,170,1
Style: Meta,{font},{fs_meta},{c_meta},&H000000FF,&H00101018,&H78000000,0,0,0,0,100,100,0,0,1,2,1,7,64,64,54,1
Style: Kicker,{font},{fs_meta},{c_meta},&H000000FF,&H00101018,&H78000000,0,0,0,0,100,100,0,0,1,2,1,8,64,64,54,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

KIND_STYLE = {
    "verse": "Verse",
    "verse_tail": "Verse",
    "intro": "Verse",
    "outro": "Verse",
    "prechorus": "Prechorus",
    "chorus": "Chorus",
    "bridge": "Bridge",
}


def build_ass(song, parsed, duration, accent):
    """依音檔長度把每一行配時，產生 ASS 內容字串。"""
    lead = min(4.0, max(2.0, duration * 0.035))
    tail = min(3.0, max(1.5, duration * 0.025))
    sing = max(6.0, duration - lead - tail)

    entries = []          # (kind, text)
    for sec in parsed["sections"]:
        for ln in sec["lines"]:
            entries.append((sec["kind"], ln))
    if not entries:
        entries = [("verse", parsed.get("hook") or song.get("title", ""))]

    # 每行的權重＝字數（中文一字算一），加固定緩衝讓短句不會閃太短
    weights = [max(5.0, float(len(t))) + 2.0 for _, t in entries]
    total = sum(weights) or 1.0

    head = ASS_HEADER.format(
        w=1920, h=1080, font=FONT,
        fs_verse=58, fs_chorus=66, fs_meta=30,
        c_verse=hex_to_ass("#F2F2F2"),
        c_chorus=hex_to_ass(accent),
        c_pre=hex_to_ass("#FFE0B2"),
        c_bridge=hex_to_ass("#BFD9F2"),
        c_meta=hex_to_ass("#C8D2DE"),
    )

    events = []
    meta = "%s · %s" % (song.get("title", ""), song.get("artist", ""))
    events.append("Dialogue: 0,%s,%s,Meta,,0,0,0,,%s" % (
        ass_time(0), ass_time(min(lead + 1.5, duration)), ass_text(meta)))

    t = lead
    for (kind, text), w in zip(entries, weights):
        span = sing * w / total
        style = KIND_STYLE.get(kind, "Verse")
        events.append("Dialogue: 0,%s,%s,%s,,0,0,0,,%s" % (
            ass_time(t), ass_time(t + span), style, ass_text(text)))
        t += span

    return head + "\n".join(events) + "\n"


# ------------------------------------------------------------------- 影片
def render_master(out, bg, audio, duration, accent):
    """背景模糊 → 慢速推近 → 燒字幕 → 配原音，產出 1920x1080 master.mp4。"""
    ffmpeg = common.tool("ffmpeg")
    work = os.path.join(out, "_work")
    blur = os.path.join(work, "bg_blur.png")
    master = os.path.join(out, "master.mp4")

    # 1) 先把背景處理成一張模糊大圖（單幀，快）
    r = common.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                    "-i", bg,
                    "-vf", ("scale=2304:1296:force_original_aspect_ratio=increase,"
                            "crop=2304:1296,gblur=sigma=20,"
                            "eq=brightness=-0.085:saturation=1.15"),
                    "-frames:v", "1", blur], timeout=300)
    if r.returncode != 0 or not os.path.exists(blur):
        raise RuntimeError("背景處理失敗：%s" % (r.stderr or "").strip()[-400:])

    # 2) 主片：zoompan 慢推 + 進度條 + libass 字幕
    vf = ("[0:v]zoompan=z='min(1+0.00018*on,1.07)':"
          "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=%d,"
          "vignette=PI/5,"
          "drawbox=x=0:y=ih-8:w='iw*t/%.3f':h=8:color=0x7fd1ff@0.7:t=fill,"
          "subtitles=lyrics.ass[v]" % (FPS, max(1.0, duration)))
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
           "-loop", "1", "-framerate", str(FPS), "-i", blur,
           "-i", audio,
           "-filter_complex", vf,
           "-map", "[v]", "-map", "1:a",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-g", "50",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
           "-movflags", "+faststart", "-shortest", master]
    r = common.run(cmd, timeout=3600, cwd=out)
    if r.returncode != 0 or not os.path.exists(master):
        raise RuntimeError("主片算繪失敗：%s" % (r.stderr or "").strip()[-600:])
    p = common.ffprobe(master)
    if not p.get("width"):
        raise RuntimeError("master ffprobe 驗證失敗：%s" % p)
    return p


# ------------------------------------------------------------------ 暫存區
def stage_dir(out_root, sid):
    """純 ASCII 的暫存目錄。

    melt（libxml2）跟 GIMP 的批次工作碰到中文路徑會直接壞掉：
      - melt：Failed to load "…\\07_愛的模樣\\title_card.mlt"（out of memory）
      - GIMP：job 檔含非 ASCII 字元 → 直接拒跑
    所以把這些工作搬到 ASCII 路徑做，做完再把產物搬回來。
    """
    h = hashlib.md5(sid.encode("utf-8")).hexdigest()[:8]
    d = os.path.join(out_root, "_stage", h)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    return d


# ------------------------------------------------------------------- 片頭
TITLE_SVG = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1920" height="1080" fill="url(#bg)"/>
  <rect x="0" y="0" width="1920" height="1080" fill="#0a0e18" opacity="0.55"/>
  <text x="960" y="470" text-anchor="middle" fill="#ffffff" font-size="104"
        font-weight="bold" font-family="{font}, Noto Sans CJK TC, sans-serif">{title}</text>
  <text x="960" y="570" text-anchor="middle" fill="{c1}" font-size="48"
        font-family="{font}, Noto Sans CJK TC, sans-serif">{sub}</text>
  <rect x="700" y="640" width="520" height="4" fill="{c1}"/>
</svg>
"""


def build_title_card_cjk(out, stage, master, title, sub, c1, c2):
    """中文字幕片頭：Inkscape 出 PNG → melt 無頭算繪 mp4（沿用 line1 的 .mlt）。"""
    svg_path = os.path.join(stage, "title.svg")
    png_path = os.path.join(stage, "title_card.png")
    svg = TITLE_SVG.format(title=title, sub=sub, c1=c1, c2=c2, font=FONT)
    with io.open(svg_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(svg)
    r = common.svg_to_png(svg_path, png_path, width=1920, height=1080)
    if r.returncode != 0 or not os.path.exists(png_path):
        raise RuntimeError("Inkscape 轉 PNG 失敗：%s" % (r.stderr or "").strip()[-400:])

    # .mlt 資源用相對路徑：stage 裡放一份 master.mp4，melt 就能算；
    # 產出的 .mlt 搬回歌曲資料夾後，資源名稱仍然對得上那邊的 master.mp4。
    stage_master = os.path.join(stage, "master.mp4")
    shutil.copyfile(master, stage_master)
    mlt_path = os.path.join(stage, "title_card.mlt")
    mp4_path = os.path.join(stage, "title_card.mp4")
    xml = L1.MLT_TEMPLATE.format(
        fps=FPS, frames=L1.TITLE_FRAMES, last=L1.TITLE_FRAMES - 1,
        png="title_card.png", audio="master.mp4")
    with io.open(mlt_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)

    cmd = [common.tool("melt"), "title_card.mlt", "-consumer", "avformat:%s" % mp4_path,
           "vcodec=libx264", "acodec=aac", "crf=20", "ab=192k", "real_time=-1"]
    r = common.run(cmd, timeout=900, cwd=stage)
    if r.returncode != 0 or not os.path.exists(mp4_path):
        raise RuntimeError("melt exit=%d：%s" % (
            r.returncode, ((r.stderr or "") + (r.stdout or ""))[-600:]))

    for name in ("title_card.mp4", "title_card.png", "title_card.mlt"):
        shutil.copyfile(os.path.join(stage, name), os.path.join(out, name))
    return common.ffprobe(os.path.join(out, "title_card.mp4"))


# ------------------------------------------------------------------ 縮圖
def build_thumb_cjk(master, stage, out, name, crop_filter, w, h):
    """FFmpeg 抽幀 → GIMP 3.2 批次縮放並存 JPG（全程在 ASCII 暫存區做）。"""
    frame = os.path.join(stage, "frame_%s.png" % name)
    dst = os.path.join(stage, name)
    log = os.path.join(stage, "gimp_%s.log" % name)

    r = L1.ff(["-ss", "1", "-i", master, "-vf", crop_filter, "-frames:v", "1", frame])
    if r.returncode != 0 or not os.path.exists(frame):
        raise RuntimeError("抽幀失敗：%s" % (r.stderr or "").strip()[-400:])

    job = L1.GIMP_JOB.format(src=frame, out=dst, log=log, w=w, h=h)
    if not job.isascii():
        raise RuntimeError("GIMP job 含非 ASCII 字元")
    proc, log_text = common.gimp_job(job, log)
    if proc.returncode != 0:
        raise RuntimeError("GIMP exit=%d：%s" % (
            proc.returncode, ((proc.stderr or "") + log_text)[-600:]))
    if not os.path.exists(dst) or os.path.getsize(dst) == 0:
        raise RuntimeError("GIMP 沒產出 %s：%s" % (name, log_text.strip()[-300:]))

    shutil.copyfile(dst, os.path.join(out, name))
    p = common.ffprobe(os.path.join(out, name))
    if (p.get("width"), p.get("height")) != (w, h):
        raise RuntimeError("%s 尺寸錯誤，實際 %sx%s" % (name, p.get("width"), p.get("height")))
    return p, "%dx%d %d bytes" % (p["width"], p["height"], os.path.getsize(dst))


# ------------------------------------------------------------------ 單曲
def produce_song(song, music_dir, out_root, keep_temp=False):
    """跑完一首歌，回傳 (ok, 說明)。"""
    sid = song["id"]
    out = os.path.join(out_root, sid)
    if os.path.isdir(out):
        shutil.rmtree(out)
    work = os.path.join(out, "_work")
    os.makedirs(work, exist_ok=True)
    stage = stage_dir(out_root, sid)

    title = song.get("title") or sid
    accent = song.get("color1") or "#E8A33D"
    c2 = song.get("color2") or "#101820"

    # 歌詞
    lyric_path = os.path.join(music_dir, sid + ".txt")
    parsed = LY.parse_file(lyric_path, re.sub(r"^\d+[-_]", "", sid))
    if parsed.get("error"):
        return False, "歌詞讀不到：%s" % parsed["error"]

    # 音檔
    audio_rel = song.get("audio")
    if not audio_rel:
        return False, "沒有音檔"
    audio = os.path.join(music_dir, audio_rel.replace("/", os.sep))
    if not os.path.exists(audio):
        return False, "音檔不存在：%s" % audio_rel

    probe = common.ffprobe(audio)
    duration = float(probe.get("duration") or 0)
    if duration <= 1:
        return False, "音檔長度異常"

    # 背景圖
    assets = card_assets(music_dir, song)
    if not assets:
        return False, "找不到可用的背景圖"
    bg = assets[0]

    # ASS
    ass_path = os.path.join(out, "lyrics.ass")
    with io.open(ass_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(build_ass(song, parsed, duration, accent))

    # 主片
    p = render_master(out, bg, audio, duration, accent)
    master = os.path.join(out, "master.mp4")
    notes = ["master %dx%d %s+%s" % (p["width"], p["height"], p["codec"], p["audio"])]

    # YouTube 版本 = master 本身（已是 1920x1080 / H.264 / AAC / faststart）
    yt = os.path.join(out, "youtube_1080p.mp4")
    shutil.copyfile(master, yt)

    # 直式 / 方形（由母片中心裁切，字幕已燒進去）
    for name, vfilter in (
        ("vertical_1080x1920.mp4", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"),
        ("square_1080x1080.mp4", "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080"),
    ):
        try:
            L1.build_video(master, os.path.join(out, name), vfilter, preset="veryfast")
            notes.append(name)
        except Exception as e:
            notes.append("%s 失敗(%s)" % (name, str(e)[:80]))

    # 音軌
    for name, codec, extra in (("audio.m4a", "aac", ["-b:a", "192k"]),
                               ("audio.mp3", "libmp3lame", ["-q:a", "2"])):
        try:
            L1.build_audio(master, os.path.join(out, name), codec, extra)
            notes.append(name)
        except Exception as e:
            notes.append("%s 失敗(%s)" % (name, str(e)[:80]))

    # 片頭（melt）
    try:
        tp = build_title_card_cjk(out, stage, master, title, "%s · 歌詞影片" % song.get("artist", ""), accent, c2)
        notes.append("title_card %dx%d" % (tp.get("width", 0), tp.get("height", 0)))
    except Exception as e:
        notes.append("title_card 失敗(%s)" % str(e)[:120])

    # 縮圖（GIMP）
    for name, filt, w, h in (
        ("thumb_yt_1280x720.jpg", "scale=1920:1080", 1280, 720),
        ("thumb_ig_1080x1080.jpg", "scale=1920:1920:force_original_aspect_ratio=increase,crop=1920:1920", 1080, 1080),
    ):
        try:
            build_thumb_cjk(master, stage, out, name, filt, w, h)
            notes.append(name)
        except Exception as e:
            notes.append("%s 失敗(%s)" % (name, str(e)[:80]))

    shutil.rmtree(stage, ignore_errors=True)
    if not keep_temp:
        shutil.rmtree(work, ignore_errors=True)

    return True, " | ".join(notes)


# ----------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(description="真實歌曲歌詞影片產線")
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 首（0 = 全部）")
    ap.add_argument("--song", default=None, help="只跑指定曲目 id")
    ap.add_argument("--out", default=None, help="產出根目錄（預設 out/line1_lyric_mv）")
    ap.add_argument("--keep-temp", action="store_true")
    ap.add_argument("--list", action="store_true", help="只列出會跑的曲目")
    args = ap.parse_args(argv)

    common.header("Line 1+ — 真實歌曲歌詞影片產線")
    songs, music_dir = load_manifest()
    if not songs:
        print("[ERROR] manifest 是空的：%s" % os.path.join(common.DATA_DIR, "songs.json"))
        return 2
    if not os.path.isdir(music_dir):
        print("[ERROR] 音樂資料夾不存在：%s" % music_dir)
        return 2

    todo = [s for s in songs if s.get("audio")]
    if args.song:
        todo = [s for s in todo if s["id"] == args.song]
    if args.limit:
        todo = todo[:args.limit]

    print("manifest %d 首，其中有音檔可跑 %d 首" % (len(songs), len(todo)))
    if args.list:
        for s in todo:
            print("  - %-28s %s" % (s["id"], s.get("title")))
        return 0
    if not todo:
        print("[ERROR] 沒有可跑的曲目")
        return 2

    out_root = os.path.abspath(args.out) if args.out else common.out_dir(OUT_NAME)
    os.makedirs(out_root, exist_ok=True)

    rep = common.Report("line1_mv_lyric 產出驗證")
    index = []
    for i, s in enumerate(todo, 1):
        t0 = time.time()
        print("")
        print("  [%d/%d] %s" % (i, len(todo), s["id"]))
        try:
            ok, note = produce_song(s, music_dir, out_root, keep_temp=args.keep_temp)
        except Exception as e:
            ok, note = False, "%s: %s" % (type(e).__name__, str(e)[:200])
        rep.step(s["id"], ok, "%s（%.0fs）" % (note, time.time() - t0))
        index.append({"id": s["id"], "title": s.get("title"), "ok": ok, "note": note})

    common.dump_json({"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "songs": index},
                      os.path.join(out_root, "index.json"))

    ok = rep.finish()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
