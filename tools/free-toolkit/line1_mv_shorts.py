# -*- coding: utf-8 -*-
"""
line1_mv_shorts.py — 直式 Shorts 變體產線（原生 9:16 場景版）
=============================================================

為什麼要這條線
--------------
產線 1+ 目前的 `vertical_1080x1920.mp4` 是**從 1920x1080 母片中心裁切**來的。
16:9 裁成 9:16 等於切掉三分之二畫面 —— 實測「城市的夜」直式畫面糊成一片
無主體色塊，完全沒有構圖（評估報告 docs/AI動態畫面_取代評估.md 第五章）。

這條線改成：**用 SDXL 原生生成的 9:16 場景圖當背景**（line1_mv_frames.py 產出），
不是裁切、不是去背，畫面本來就是 9:16 構圖。

為什麼字幕要重燒
----------------
橫式母片的 ASS 是 PlayRes 1920x1080、字幕置中偏下；直接套到 1080x1920 會被
libass 等比縮小到 0.5625 倍，字變小而且落在畫面中央偏上。所以這條線另外產生
一份直式 ASS（PlayRes 1080x1920、字幕壓到下三分之一、標題移到上方置中），
但**配時邏輯完全沿用 line1_mv_lyric.build_ass**，同一首歌的字幕行數與時間軸一致。

不動既有產出
------------
既有 19 首的 `vertical_1080x1920.mp4` 一個字都不改，本線另外產出
`vertical_scene_1080x1920.mp4`，兩個版本並存、可以比較。

用法：
    python line1_mv_shorts.py --list        # 看哪些歌有 9:16 場景圖
    python line1_mv_shorts.py --song 04_老家的巷子
    python line1_mv_shorts.py --limit 3
    python line1_mv_shorts.py --force        # 已存在的也重算

實測踩坑：
  - ffmpeg 的 subtitles 濾鏡在 Windows 不能吃絕對路徑（C: 的冒號被當選項分隔符）
    → cwd 設成歌曲資料夾，用相對檔名 lyrics_vertical.ass。
  - zoompan 逐幀做很慢 → 這裡只有一張圖，直接 zoompan 即可，但仍先 scale 到輸出
    尺寸再 zoompan，否則畫面會被放大到糊。
  - overlay 的漸層遮罩必須是 RGBA，且要用 `-loop 1` 讓它跟影片一樣長。
"""

from __future__ import print_function

import argparse
import io
import os
import re
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common            # noqa: E402
import line1_mv_lyric as MV   # noqa: E402  build_ass / load_manifest
import lyrics as LY      # noqa: E402

FPS = 25
W, H = 1080, 1920

SCENE_DIR = "line1_scenes"      # line1_mv_frames.py 的產出
MV_DIR = "line1_lyric_mv"       # 產線 1+ 的產出（Shorts 放進各首歌資料夾）
SHORT_NAME = "vertical_scene_1080x1920.mp4"
CINEMA_NAME = "vertical_scene_cinema_1080x1920.mp4"
THUMB_NAME = "shorts_thumb_1080x1920.jpg"
ASS_NAME = "lyrics_vertical.ass"


# ------------------------------------------------------------------ 漸層遮罩
def make_gradient(path, w=W, h=H):
    """做一張 RGBA 漸層遮罩：上緣壓暗（放標題）、下緣壓暗（放字幕）。

    先做 1 像素寬的直線再 resize，比逐像素填快很多。
    """
    from PIL import Image

    top_end = int(h * 0.22)
    bot_start = int(h * 0.42)
    col = Image.new("RGBA", (1, h))
    for y in range(h):
        if y < top_end:
            a = int(130 * (1 - float(y) / top_end))
        elif y >= bot_start:
            t = (y - bot_start) / float(h - bot_start)
            a = int(170 * (t ** 1.35))
        else:
            a = 0
        col.putpixel((0, y), (0, 0, 0, a))
    col.resize((w, h)).save(path)
    return path


# ------------------------------------------------------------------- 算繪
def render_short(out, scene_png, gradient_png, audio, duration, cinema=False):
    """場景圖 → 慢推 → 漸層遮罩 → 進度條 → 直式字幕 → 原音。

    cinema=True：用「推近 + 橫向漂移」的連續運鏡（zoompan 1.00→1.16 同時緩緩右移），
    比原本置中純推近更像真的運鏡。這是 AI 額度用盡期間的免費替代品。
    """
    ffmpeg = common.tool("ffmpeg")
    dst = os.path.join(out, CINEMA_NAME if cinema else SHORT_NAME)

    if cinema:
        frames = max(1, int(round(duration * FPS)))
        zoom_end = 1.16
        # on = 輸出影格數；z 慢慢推近，同時 x 由置中往右漂（滿距離）
        cam = ("zoompan=z='min(1+%.8f*on,%.2f)':x='(iw-iw/zoom)*(0.5+0.5*on/%d)':"
               "y='(ih-ih/zoom)/2':d=1:s=%dx%d:fps=%d,"
               % ((zoom_end - 1.0) / frames, zoom_end, frames, W, H, FPS))
    else:
        cam = ("zoompan=z='min(1+0.00016*on,1.08)':"
               "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=%dx%d:fps=%d," % (W, H, FPS))

    vf = (
        # 1) 場景圖依原比例放大到 1080x1920（原生 9:16，不會裁掉東西）
        "[0:v]scale=%d:%d:force_original_aspect_ratio=increase,"
        "crop=%d:%d,%s"
        "eq=brightness=-0.055:saturation=1.08,vignette=PI/4[bg];" % (W, H, W, H, cam)
        # 2) 漸層遮罩疊上去（字幕/標題才有對比）
        + "[1:v]format=rgba[gr];"
        + "[bg][gr]overlay=0:0:format=auto,"
        # 3) 進度條 + 直式字幕
        + "drawbox=x=0:y=ih-8:w='iw*t/%.3f':h=8:color=0x7fd1ff@0.7:t=fill,"
          "subtitles=%s[v]" % (max(1.0, duration), ASS_NAME)
    )

    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
           "-loop", "1", "-framerate", str(FPS), "-i", scene_png,
           "-loop", "1", "-framerate", str(FPS), "-i", gradient_png,
           "-i", audio,
           "-filter_complex", vf,
           "-map", "[v]", "-map", "2:a",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0", "-g", "50",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
           "-movflags", "+faststart", "-shortest", dst]
    r = common.run(cmd, timeout=3600, cwd=out)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError("Shorts 算繪失敗：%s" % (r.stderr or "").strip()[-600:])

    p = common.ffprobe(dst)
    if (p.get("width"), p.get("height")) != (W, H):
        raise RuntimeError("尺寸錯誤，實際 %sx%s" % (p.get("width"), p.get("height")))
    return p


def build_thumb(short_mp4, out, name=None):
    """Shorts 封面：抽一幀存成 1080x1920 JPG（純 ffmpeg，不碰 GIMP）。"""
    ffmpeg = common.tool("ffmpeg")
    dst = os.path.join(out, name or THUMB_NAME)
    r = common.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                    "-ss", "3", "-i", short_mp4,
                    "-frames:v", "1", "-q:v", "3", dst], timeout=300)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError("縮圖失敗：%s" % (r.stderr or "").strip()[-300:])
    return dst


# ------------------------------------------------------------------ 單曲
def produce_song(song, music_dir, scene_root, out_root, force=False, cinema=False):
    sid = song["id"]
    scene_png = os.path.join(scene_root, sid, "scene_9x16.png")
    if not os.path.exists(scene_png):
        return False, "沒有 9:16 場景圖（先跑 line1_mv_frames.py --sizes 9x16）"

    out = os.path.join(out_root, sid)
    os.makedirs(out, exist_ok=True)
    short_name = CINEMA_NAME if cinema else SHORT_NAME
    dst = os.path.join(out, short_name)
    if os.path.exists(dst) and not force:
        return True, "%s 已存在（略過）" % short_name

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

    # 直式 ASS（配時沿用橫式那套）
    accent = song.get("color1") or "#E8A33D"
    ass_path = os.path.join(out, ASS_NAME)
    with io.open(ass_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(MV.build_ass(song, parsed, duration, accent, vertical=True))

    grad = make_gradient(os.path.join(out, "_work_grad.png"))
    try:
        p = render_short(out, scene_png, grad, audio, duration, cinema=cinema)
    finally:
        if os.path.exists(grad):
            os.remove(grad)

    notes = ["%s %dx%d %s+%s" % (short_name, p["width"], p["height"], p["codec"], p["audio"])]
    thumb_name = THUMB_NAME if not cinema else "shorts_thumb_cinema_1080x1920.jpg"
    try:
        build_thumb(dst, out, thumb_name)
        notes.append(thumb_name)
    except Exception as e:
        notes.append("%s 失敗(%s)" % (thumb_name, str(e)[:80]))
    return True, " | ".join(notes)


# ----------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(description="直式 Shorts 變體產線（原生 9:16 場景版）")
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 首")
    ap.add_argument("--song", default=None, help="只跑指定曲目 id")
    ap.add_argument("--out", default=None, help="產出根目錄（預設 out/line1_lyric_mv）")
    ap.add_argument("--scenes", default=None, help="場景圖根目錄（預設 out/line1_scenes）")
    ap.add_argument("--force", action="store_true", help="已存在的也重算")
    ap.add_argument("--cinema", action="store_true",
                    help="改用「推近 + 橫向漂移」的連續運鏡，輸出另存 "
                         "vertical_scene_cinema_1080x1920.mp4（不動既有版本）")
    ap.add_argument("--list", action="store_true", help="只列出會跑的曲目")
    args = ap.parse_args(argv)

    common.header("Line 1+ S — 直式 Shorts（原生 9:16 場景版）")
    songs, music_dir = MV.load_manifest()
    if not songs:
        print("[ERROR] manifest 是空的")
        return 2

    scene_root = os.path.abspath(args.scenes) if args.scenes else common.out_dir(SCENE_DIR)
    out_root = os.path.abspath(args.out) if args.out else common.out_dir(MV_DIR)
    if not os.path.isdir(scene_root):
        print("[ERROR] 場景圖資料夾不存在：%s" % scene_root)
        print("       先跑：python line1_mv_frames.py --sizes 9x16")
        return 2

    todo = [s for s in songs if s.get("audio")]
    if args.song:
        todo = [s for s in todo if s["id"] == args.song]
    if args.limit:
        todo = todo[:args.limit]

    ready = [s for s in todo
             if os.path.exists(os.path.join(scene_root, s["id"], "scene_9x16.png"))]
    print("manifest %d 首，其中有音檔 %d 首，有 9:16 場景圖 %d 首"
          % (len(songs), len(todo), len(ready)))
    if args.list:
        for s in todo:
            ok = s in ready
            print("  %s%-28s %s" % ("OK " if ok else "-- ", s["id"], s.get("title")))
        return 0
    if not ready:
        print("[ERROR] 沒有任何歌有 9:16 場景圖")
        return 2

    os.makedirs(out_root, exist_ok=True)
    rep = common.Report("line1_mv_shorts 產出驗證")
    index = []
    for i, s in enumerate(ready, 1):
        t0 = time.time()
        print("")
        print("  [%d/%d] %s" % (i, len(ready), s["id"]))
        try:
            ok, note = produce_song(s, music_dir, scene_root, out_root,
                                    force=args.force, cinema=args.cinema)
        except Exception as e:
            ok, note = False, "%s: %s" % (type(e).__name__, str(e)[:200])
        rep.step(s["id"], ok, "%s（%.0fs）" % (note, time.time() - t0))
        index.append({"id": s["id"], "title": s.get("title"), "ok": ok, "note": note})

    # index 合併寫入：單曲重跑不該把整份索引清掉
    index_path = os.path.join(out_root, "index_shorts.json")
    old_index = {}
    try:
        prev = common.load_json(index_path, {"songs": []})
        for row in prev.get("songs", []):
            if row.get("id"):
                old_index[row["id"]] = row
    except Exception:
        pass

    for row in index:
        old_index[row["id"]] = row
    rows = [old_index[k] for k in sorted(old_index)]

    common.dump_json({"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "songs": rows},
                      index_path)
    ok = rep.finish()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
