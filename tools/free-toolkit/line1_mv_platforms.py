# -*- coding: utf-8 -*-
r"""
line1_mv_platforms.py — 音樂 MV 多平台版本產線
=============================================

一條可重複執行的產線：輸入一支母版影片，產出各平台版本 + 音軌 + 片頭 + 縮圖。

    python line1_mv_platforms.py                      # 沒給 --input 就自動生一支 10 秒測試母片
    python line1_mv_platforms.py --input D:\my\mv.mov # 用自己的母片
    python line1_mv_platforms.py --keep-temp          # 保留中間檔（_work/）

工具分工：
    FFmpeg  → 裁切 / 轉檔 / 抽音軌 / 抽幀
    melt    → 由 .mlt XML 無頭算繪片頭（證明 kdenlive 可被腳本驅動）
    GIMP 3.2 → 批次縮圖（縮放 + 存 JPG）
    Inkscape → 把片頭文字 SVG 轉 PNG，餵給 .mlt 的圖層

不修改 common.py；所有共通行為都靠 common 的既有 API。
"""

import argparse
import os
import shutil
import sys
import xml.sax.saxutils as saxutils

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402  (共用層，不修改)

FPS = 25
TITLE_SEC = 5          # 片頭長度（秒）
TITLE_FRAMES = FPS * TITLE_SEC

HERE = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------- 小工具
def ff(args, timeout=900):
    """跑 ffmpeg，-loglevel error 讓錯誤訊息乾淨。"""
    cmd = [common.tool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y"] + list(args)
    return common.run(cmd, timeout=timeout)


def fsize(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def ascii_safe(text, fallback="MUSIC VIDEO"):
    """.mlt / GIMP job / SVG 都走 ASCII，避免編碼與字型問題。"""
    out = "".join(ch if 32 <= ord(ch) < 127 else " " for ch in (text or ""))
    out = " ".join(out.split())
    return out or fallback


def write_text(path, content):
    """固定 UTF-8 無 BOM + LF。"""
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)


# ------------------------------------------------------------------- 母片
def build_master(out, input_path):
    """回傳 (master 路徑, 說明文字)。沒有 --input 就用 FFmpeg 生測試母片。"""
    master = os.path.join(out, "master.mp4")
    norm = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2")

    if input_path:
        if not os.path.exists(input_path):
            raise FileNotFoundError("--input 指的檔案不存在：%s" % input_path)
        probe = common.ffprobe(input_path)
        args = ["-i", input_path]
        if not probe.get("audio"):
            args += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        args += [
            "-vf", norm, "-r", str(FPS),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
            "-shortest", master,
        ]
        r = ff(args)
        if r.returncode != 0:
            raise RuntimeError("母片正規化失敗：%s" % (r.stderr or "").strip()[-600:])
        return master, "來源 %s（已正規化 1920x1080 / %dfps / AAC）" % (
            os.path.basename(input_path), FPS)

    # 沒給輸入 → 自動生 10 秒 testsrc2 + sine 母片
    args = [
        "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=%d" % FPS,
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
        "-t", "10",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-shortest", master,
    ]
    r = ff(args)
    if r.returncode != 0:
        raise RuntimeError("測試母片生成失敗：%s" % (r.stderr or "").strip()[-600:])
    return master, "自動生成測試母片 testsrc2 + sine 440Hz / 10s / stereo"


# --------------------------------------------------------------- 平台影片
def build_video(src, dst, vf, extra_note=""):
    """單一平台影片：H.264 + AAC，yuv420p。"""
    args = [
        "-i", src, "-vf", vf, "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-movflags", "+faststart", dst,
    ]
    r = ff(args)
    if r.returncode != 0:
        raise RuntimeError("%s：%s" % (os.path.basename(dst),
                                       (r.stderr or "").strip()[-600:]))
    p = common.ffprobe(dst)
    if not p.get("width") or not p.get("audio"):
        raise RuntimeError("%s ffprobe 驗證失敗：%s" % (os.path.basename(dst), p))
    note = "%dx%d %s+%s" % (p["width"], p["height"], p["codec"], p["audio"])
    if extra_note:
        note += " " + extra_note
    return p, note


# ------------------------------------------------------------------- 音軌
def build_audio(src, dst, codec, extra):
    args = ["-i", src, "-vn", "-c:a", codec] + extra + [dst]
    r = ff(args)
    if r.returncode != 0:
        raise RuntimeError("%s：%s" % (os.path.basename(dst),
                                       (r.stderr or "").strip()[-600:]))
    p = common.ffprobe(dst)
    if not p.get("audio"):
        raise RuntimeError("%s ffprobe 驗證失敗：%s" % (os.path.basename(dst), p))
    return p, "%s %d bytes" % (p["audio"], fsize(dst))


# --------------------------------------------------------------- 片頭 (.mlt)
MLT_TEMPLATE = """<?xml version="1.0" standalone="no"?>
<mlt LC_NUMERIC="C" version="7.0.0" title="Line1 MV Title Card" producer="main_bin">
  <profile description="Line1 MV" width="1920" height="1080" progressive="1" \
sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="16" display_aspect_den="9" \
frame_rate_num="{fps}" frame_rate_den="1" colorspace="709"/>
  <producer id="producer_bg" in="0" out="{last}">
    <property name="length">{frames}</property>
    <property name="eof">pause</property>
    <property name="resource">#0d1224</property>
    <property name="aspect_ratio">1</property>
    <property name="mlt_service">color</property>
    <property name="mlt_image_format">rgba</property>
    <property name="set.test_audio">0</property>
  </producer>
  <playlist id="playlist_bg">
    <entry producer="producer_bg" in="0" out="{last}"/>
  </playlist>
  <producer id="producer_title" in="0" out="{last}">
    <property name="length">{frames}</property>
    <property name="eof">pause</property>
    <property name="resource">{png}</property>
    <property name="mlt_service">qimage</property>
    <property name="ttl">1</property>
    <property name="aspect_ratio">1</property>
    <property name="progressive">1</property>
  </producer>
  <playlist id="playlist_title">
    <entry producer="producer_title" in="0" out="{last}"/>
  </playlist>
  <producer id="producer_audio" in="0" out="{last}">
    <property name="length">{frames}</property>
    <property name="eof">pause</property>
    <property name="resource">{audio}</property>
    <property name="mlt_service">avformat-novalidate</property>
    <property name="audio_index">0</property>
    <property name="video_index">-1</property>
  </producer>
  <playlist id="playlist_audio">
    <entry producer="producer_audio" in="0" out="{last}"/>
  </playlist>
  <tractor id="tractor0" title="Line1 MV Title Card" in="0" out="{last}">
    <property name="shotcut">1</property>
    <property name="shotcut:projectAudioChannels">2</property>
    <track producer="playlist_bg"/>
    <track producer="playlist_title"/>
    <track producer="playlist_audio"/>
    <transition id="transition0">
      <property name="a_track">0</property>
      <property name="b_track">1</property>
      <property name="version">0.1</property>
      <property name="mlt_service">qtblend</property>
      <property name="threads">0</property>
      <property name="disable">1</property>
    </transition>
    <transition id="transition1">
      <property name="a_track">0</property>
      <property name="b_track">2</property>
      <property name="version">0.1</property>
      <property name="mlt_service">mix</property>
      <property name="start">-1</property>
      <property name="accepts_blanks">1</property>
    </transition>
  </tractor>
</mlt>
"""


def make_title_png(out, work, title, sub):
    """Inkscape 把片頭文字 SVG 轉成 PNG（餵給 .mlt 的圖層）。

    PNG 放在產出目錄（不是 _work），這樣 .mlt 用相對路徑引用後，
    就算清掉中間檔，title_card.mlt 仍然可以重新算繪。"""
    svg_path = os.path.join(work, "title.svg")
    png_path = os.path.join(out, "title_card.png")
    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b2a6b"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1920" height="1080" fill="url(#bg)"/>
  <text x="960" y="500" text-anchor="middle" fill="#ffffff" font-size="110"
        font-weight="bold" font-family="Segoe UI, DejaVu Sans, sans-serif">{title}</text>
  <text x="960" y="610" text-anchor="middle" fill="#7fd1ff" font-size="54"
        font-family="Segoe UI, DejaVu Sans, sans-serif">{sub}</text>
  <rect x="660" y="690" width="600" height="6" fill="#7fd1ff"/>
</svg>
""".format(title=saxutils.escape(title), sub=saxutils.escape(sub))
    write_text(svg_path, svg)
    r = common.svg_to_png(svg_path, png_path, width=1920, height=1080)
    if r.returncode != 0 or not os.path.exists(png_path):
        raise RuntimeError("Inkscape 轉 PNG 失敗：%s" % (r.stderr or "").strip()[-400:])
    return png_path


def build_title_card(out, work, master, title, sub):
    """寫 .mlt → 用 melt 無頭算繪 mp4。"""
    png_path = make_title_png(out, work, title, sub)
    mlt_path = os.path.join(out, "title_card.mlt")
    mp4_path = os.path.join(out, "title_card.mp4")
    # 資源用相對路徑（相對於 .mlt 所在目錄），整包產出可以搬走再算繪
    xml = MLT_TEMPLATE.format(
        fps=FPS, frames=TITLE_FRAMES, last=TITLE_FRAMES - 1,
        png="title_card.png",
        audio=os.path.basename(master),
    )
    write_text(mlt_path, xml)

    cmd = [common.tool("melt"), mlt_path,
           "-consumer", "avformat:%s" % mp4_path,
           "vcodec=libx264", "acodec=aac", "crf=20", "ab=192k",
           "real_time=-1"]
    # 注意：不要在 consumer 傳 width/height，MLT 會把 profile 再套一層等比留白，
    # 造成左右各 54px 黑邊；讓 melt 直接用 .mlt 內的 profile 尺寸即可。
    r = common.run(cmd, timeout=900, cwd=out)
    if r.returncode != 0:
        raise RuntimeError("melt exit=%d：%s" % (
            r.returncode, ((r.stderr or "") + (r.stdout or ""))[-800:]))
    if not os.path.exists(mp4_path) or fsize(mp4_path) == 0:
        raise RuntimeError("melt exit=0 但沒產出 mp4：%s" % (
            ((r.stderr or "") + (r.stdout or ""))[-800:]))
    p = common.ffprobe(mp4_path)
    if not p.get("width"):
        raise RuntimeError("title_card.mp4 ffprobe 驗證失敗：%s" % p)
    return p, "melt exit=0 %dx%d %s+%s" % (p["width"], p["height"], p["codec"], p["audio"])


# ------------------------------------------------------------------- 縮圖
GIMP_JOB = """
src_path = r"{src}"
out_path = r"{out}"
log_path = r"{log}"

img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(src_path))
if img is None:
    raise RuntimeError("file_load returned None: " + src_path)
img.scale({w}, {h})
Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(out_path), None)
with open(log_path, "w", encoding="utf-8") as fh:
    fh.write("OK " + str({w}) + "x" + str({h}) + " -> " + out_path + "\\n")
    fh.flush()
"""


def build_thumb(master, work, out, name, crop_filter, w, h):
    """FFmpeg 抽幀 → GIMP 3.2 批次縮放並存 JPG。"""
    frame = os.path.join(work, "frame_%s.png" % name)
    dst = os.path.join(out, name)
    log = os.path.join(work, "gimp_%s.log" % name)

    r = ff(["-ss", "1", "-i", master, "-vf", crop_filter, "-frames:v", "1", frame])
    if r.returncode != 0 or not os.path.exists(frame):
        raise RuntimeError("抽幀失敗：%s" % (r.stderr or "").strip()[-400:])

    job = GIMP_JOB.format(src=frame, out=dst, log=log, w=w, h=h)
    if not job.isascii():
        raise RuntimeError("GIMP job 含非 ASCII 字元")
    proc, log_text = common.gimp_job(job, log)
    if proc.returncode != 0:
        raise RuntimeError("GIMP exit=%d：%s" % (
            proc.returncode, ((proc.stderr or "") + log_text)[-600:]))
    if not os.path.exists(dst) or fsize(dst) == 0:
        raise RuntimeError("GIMP 沒產出 %s：%s" % (name, log_text.strip()[-300:]))
    p = common.ffprobe(dst)
    if (p.get("width"), p.get("height")) != (w, h):
        raise RuntimeError("%s 尺寸錯誤，實際 %sx%s" % (name, p.get("width"), p.get("height")))
    return p, "%dx%d %d bytes" % (p["width"], p["height"], fsize(dst))


# --------------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="音樂 MV 多平台版本產線（YouTube / 直式 / 方形 / 音軌 / 片頭 / 縮圖）")
    ap.add_argument("--input", default=None,
                    help="母版影片路徑；省略則自動生成 10 秒測試母片")
    ap.add_argument("--out", default=None,
                    help="產出目錄，預設 out/line1_mv")
    ap.add_argument("--keep-temp", action="store_true",
                    help="保留中間檔（_work/）")
    ap.add_argument("--title", default=None,
                    help="片頭標題文字（預設取母片檔名或 MUSIC VIDEO）")
    args = ap.parse_args(argv)

    common.header("Line 1 - 音樂 MV 多平台版本產線")
    out = os.path.abspath(args.out) if args.out else common.out_dir("line1_mv")
    os.makedirs(out, exist_ok=True)
    work = os.path.join(out, "_work")
    if os.path.isdir(work):
        shutil.rmtree(work)
    os.makedirs(work, exist_ok=True)

    rep = common.Report("line1_mv_platforms 產出驗證")

    # 1. 母片
    try:
        master, note = build_master(out, args.input)
        rep.step("母片 master.mp4", os.path.exists(master) and fsize(master) > 0,
                 "%d bytes | %s" % (fsize(master), note))
    except Exception as e:
        rep.step("母片 master.mp4", False, str(e)[:300])
        rep.finish()
        return 1

    # 2. YouTube 橫式
    try:
        p, note = build_video(
            master, os.path.join(out, "youtube_1080p.mp4"),
            "scale=1920:1080:force_original_aspect_ratio=decrease,"
            "pad=1920:1080:(ow-iw)/2:(oh-ih)/2")
        rep.step("youtube_1080p.mp4", True, "%s | %d bytes" % (note, fsize(os.path.join(out, "youtube_1080p.mp4"))))
    except Exception as e:
        rep.step("youtube_1080p.mp4", False, str(e)[:300])

    # 3. 直式
    try:
        p, note = build_video(
            master, os.path.join(out, "vertical_1080x1920.mp4"),
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920")
        rep.step("vertical_1080x1920.mp4", True, "%s | %d bytes" % (note, fsize(os.path.join(out, "vertical_1080x1920.mp4"))))
    except Exception as e:
        rep.step("vertical_1080x1920.mp4", False, str(e)[:300])

    # 4. 方形
    try:
        p, note = build_video(
            master, os.path.join(out, "square_1080x1080.mp4"),
            "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080")
        rep.step("square_1080x1080.mp4", True, "%s | %d bytes" % (note, fsize(os.path.join(out, "square_1080x1080.mp4"))))
    except Exception as e:
        rep.step("square_1080x1080.mp4", False, str(e)[:300])

    # 5. 音軌 m4a / mp3
    try:
        p, note = build_audio(master, os.path.join(out, "audio.m4a"), "aac", ["-b:a", "192k"])
        rep.step("audio.m4a", True, note)
    except Exception as e:
        rep.step("audio.m4a", False, str(e)[:300])
    try:
        p, note = build_audio(master, os.path.join(out, "audio.mp3"), "libmp3lame", ["-q:a", "2"])
        rep.step("audio.mp3", True, note)
    except Exception as e:
        rep.step("audio.mp3", False, str(e)[:300])

    # 6. 片頭（melt）
    title = ascii_safe(args.title or (os.path.splitext(os.path.basename(args.input))[0]
                                      if args.input else "MUSIC VIDEO"))
    try:
        p, note = build_title_card(out, work, master, title, "LINE 1 - MULTIPLATFORM MASTER")
        rep.step("title_card.mp4 (melt)", True, "%s | %d bytes | .mlt %d bytes" % (
            note, fsize(os.path.join(out, "title_card.mp4")),
            fsize(os.path.join(out, "title_card.mlt"))))
    except Exception as e:
        rep.step("title_card.mp4 (melt)", False, str(e)[:500])

    # 7. 縮圖（GIMP 批次）
    try:
        p, note = build_thumb(master, work, out, "thumb_yt_1280x720.jpg", "scale=1920:1080", 1280, 720)
        rep.step("thumb_yt_1280x720.jpg", True, note)
    except Exception as e:
        rep.step("thumb_yt_1280x720.jpg", False, str(e)[:300])
    try:
        p, note = build_thumb(
            master, work, out, "thumb_ig_1080x1080.jpg",
            "scale=1920:1920:force_original_aspect_ratio=increase,crop=1920:1920", 1080, 1080)
        rep.step("thumb_ig_1080x1080.jpg", True, note)
    except Exception as e:
        rep.step("thumb_ig_1080x1080.jpg", False, str(e)[:300])

    # 8. 產出清單
    print("")
    print("產出清單（%s）：" % out)
    for name in sorted(os.listdir(out)):
        fp = os.path.join(out, name)
        if os.path.isfile(fp):
            print("  %-28s %10d bytes" % (name, fsize(fp)))

    if not args.keep_temp:
        shutil.rmtree(work, ignore_errors=True)
    else:
        print("中間檔保留於 %s" % work)

    ok = rep.finish()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
