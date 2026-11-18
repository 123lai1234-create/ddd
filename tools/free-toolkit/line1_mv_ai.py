# -*- coding: utf-8 -*-
"""
line1_mv_ai.py — 直式 Shorts 的 AI 動態畫面版產線
=================================================

產線 1+S 用的是 SDXL 產出的**靜態**場景圖 + zoompan 慢推；這條線換成
**真的 AI 動態影片**：MiniMax-Hailuo-2.3 首幀 image-to-video，每 10 秒一段，
上一段的**最後一幀**當下一段的**第一幀** → 整首歌是一鏡到底的連續鏡頭（FL2VA 式串接）。

    1. 場景圖（產線 1++）scene_9x16.png 當第 1 段的首幀
    2. 每段送 Hailuo-2.3（768P / 10 秒 / 靜音）→ 輪詢 → 下載
    3. 抽出該段最後一幀 → 上傳 → 當下一段首幀
    4. 全部段落 concat → 上采 1080x1920 → 漸層遮罩 → 進度條 → 直式字幕 → 原曲
    5. 產出 vertical_ai_1080x1920.mp4（跟 vertical_1080x1920.mp4 / vertical_scene_*.mp4 並存）

**每一段都是付費呼叫**（MiniMax-Hailuo-2.3 是最便宜的一檔，靜音我們只要畫面）。
先用 --song 試跑一首，確認畫質與成本再 --all。

**混合模式（--ai-segments N）**：只讓前 N 段用 AI，其餘時間用「AI 最後一段的末幀」
做慢速推近 + 橫向漂移鋪滿 → 接縫看不出來，但 credits 砍 4 倍（19 首 66,080 → 15,960）。
這是省錢的主槓桿，因為 Shorts 的黃金 3 秒在前段。

用法：
    python line1_mv_ai.py --list
    python line1_mv_ai.py --song 13_時光膖囊
    python line1_mv_ai.py --song-index 15      # 中文歌名在指令列會壞掉時用這個
    python line1_mv_ai.py --all --jobs 5 --budget 5000
    python line1_mv_ai.py --all --ai-segments 3

實測（2026-11-13，13_時光膖囊 66 秒）：
    7 段 × 10.125 秒 = 70.9 秒 → 裁到 66.0 秒
    每段實際約 2 分鐘（送出 + 輪詢 + 下載），整首約 15 分鐘
    成品 1080x1920 / H.264+AAC / 25fps / 17.9MB，字幕與橫式母片同軸

實測踩坑：
  - mcode-tools 是 .cmd 套件 → Python subprocess 必須 shell=True，否則 WinError 2。
  - **中文路徑不能直接餵給 mcode-tools / 素材上傳**：先複製到純 ASCII 的暫存目錄
    （out/_ai_stage/）再上傳，位元組完全不變。
  - ffmpeg 的 subtitles 濾鏡不能吃絕對路徑 → cwd 設成歌曲資料夾，用相對檔名。
  - 每段只送一次；送出回應沒有 task_id = ambiguous → 立刻停，絕不重送。
  - 段落串接會「逐段推近」，66 秒下來會推到極近特寫。場景本身適合近拍時效果最好
    （鐵盒/眼鏡/相機這種有質感的靜物），大場景反而會推得太近。
"""

from __future__ import print_function

import argparse
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common            # noqa: E402
import line1_mv_lyric as MV   # noqa: E402

MODEL = "MiniMax-Hailuo-2.3"
RESOLUTION = "768P"
SEG_SECONDS = 10
SEG_OVERHEAD = 0.125          # 實測每段實際長度 10.125 秒
OUT_NAME_BASE = "vertical_ai_1080x1920"
OUT_NAME = OUT_NAME_BASE + ".mp4"
SCENE_DIR = "line1_scenes"
STAGE = "_ai_stage"

# 每段 10 秒 / 768P 的實測單價（2026-11-17 從 402 訊息取得）
CREDITS_PER_SEGMENT = 280
# 片段長度與單價的關係是「每秒計費」（10 秒 = 280 credits → 約 28 credits/秒），
# 所以縮短片段省不了多少：6 秒片段要 1.67 倍數量才覆蓋同樣長度，成本幾乎一樣。
# 真正的成本槓桿是「做幾首」。
CREDITS_PER_SECOND = 28

# 執行期設定（CLI 會覆寫）：段落長度 / 解析度 / 每首 AI 段數
OPT = {"seconds": SEG_SECONDS, "resolution": RESOLUTION, "ai_segments": 0}

# Hailuo 2.3 直式片段的實測尺寸（768P = 768x1344 / 24fps / 單段 10.125 秒）
CLIP_DIMS = {"768P": (768, 1344), "1080P": (1080, 1920)}
SEG_OVERHEAD_RATIO = 0.0125      # 實測 10 秒段 → 10.125 秒

CLI_CANDIDATES = [
    r"D:\.minimax\bin\mcode-tools.cmd",
    "mcode-tools.cmd",
    "mcode-tools",
]

TPL = (
    "I2VA:\n"
    "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n"
    "\n"
    "integrated_multimodal_description: [Shot 1] %s\n"
    "\n"
    "overall_soundscape: N/A\n"
    "\n"
    "non_diegetic_music: N/A\n"
)

# 運鏡：段落串接會逐段推近，66 秒下來會推到極近特寫。
# 靜物特寫適合推近；大外景推到底會糊掉 → 改成橫移 / 上搖。
CAMERA = {
    "push_in": ("performs a very slow, steady push in with a small, even amplitude, moving gradually "
                "closer to the subject until the shallow depth of field becomes noticeably shallower"),
    "drift": ("performs a very slow, steady truck to the right with a small, even amplitude, the "
              "foreground drifting past with gentle parallax while the subject stays framed; the "
              "framing shifts sideways and never tightens"),
    "tilt_up": ("performs a very slow, steady tilt up with a small, even amplitude, lifting from the "
                "lower part of the scene toward the sky; the framing shifts upward and never tightens"),
    "pull_out": ("performs a very slow, steady pull back with a small, even amplitude, gradually "
                 "revealing more of the surroundings around the subject; the framing opens wider "
                 "rather than tighter"),
}

BODY = (
    "The camera {camera}. The image is a photorealistic cinematic film still with shallow depth of field, "
    "fine film grain and warm atmospheric light; any printed markings on paper stay blurred and illegible "
    "and no readable text appears anywhere. Fine dust motes drift slowly through the light. Nothing in the "
    "scene is handled; the shot is a single continuous take in which the objects and the lighting never "
    "change, only the framing shifts gradually."
)

NOTE_FIRST = "The shot opens on the reference frame and begins one slow, continuous camera move."
NOTE_CONT = ("The shot continues seamlessly from the reference frame, which shows the same scene and "
             "the same lighting at the next point of one continuous camera move.")


def build_prompt(scene_desc, motion, seg):
    cam = CAMERA.get(motion or "push_in", CAMERA["push_in"])
    scene = (scene_desc or "the same still life shown in the reference frame").strip()
    scene = scene[0].upper() + scene[1:]
    lead = NOTE_FIRST if seg == 1 else NOTE_CONT
    return TPL % ("%s %s. %s" % (lead, scene, BODY.format(camera=cam)))


# ------------------------------------------------------------------ CLI
def find_cli():
    for c in CLI_CANDIDATES:
        if os.path.exists(c):
            return c
    found = shutil.which("mcode-tools") or shutil.which("mcode-tools.cmd")
    if found:
        return found
    raise RuntimeError("找不到 mcode-tools CLI")


CLI = find_cli()

# 每段 10 秒 / 768P 的實測單價（2026-11-17 從 402 訊息取得）
CREDITS_PER_SEGMENT = 280

# 額度用盡時（HTTP 402）要立刻全批中止，不能一首一首慢慢撞
class BillingStop(Exception):
    pass


BILLING = {"stopped": False, "reason": ""}
BUDGET = {"spent": 0, "max": 0}
BUDGET_LOCK = threading.Lock()


def budget_take():
    """回 True 代表還有額度可以花這一段。"""
    with BUDGET_LOCK:
        if BUDGET["max"] and BUDGET["spent"] + CREDITS_PER_SEGMENT > BUDGET["max"]:
            return False
        BUDGET["spent"] += CREDITS_PER_SEGMENT
        return True


def check_billing(raw):
    flat = raw.replace(" ", "")
    if '"code":402' in flat or "insufficientallowance" in flat or "insufficientcredits" in flat:
        BILLING["stopped"] = True
        BILLING["reason"] = raw[:400]
        raise BillingStop("額度不足（HTTP 402）：%s" % raw[:300])


def run(cmd, timeout=600, cwd=None):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout, cwd=cwd)
    return r.returncode, r.stdout, r.stderr


def load_json_any(path):
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-16", "utf-16-le", "utf-8"):
        try:
            return json.loads(raw.decode(enc))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise RuntimeError("無法解析 %s" % path)


def cli_json(cmd, timeout=600):
    rc, out, err = run(cmd, timeout=timeout)
    if rc != 0:
        return None, (err or out)[:400]
    try:
        return json.loads(out[out.index("{"): out.rindex("}") + 1]), None
    except Exception as e:
        return None, "回應無法解析：%s" % str(e)[:200]


# -------------------------------------------------------------- 素材往返
def upload_image(path):
    data, err = cli_json('"%s" upload_temp_url "%s" --mime-type image/png' % (CLI, path))
    if err:
        return None, err
    return data.get("temp_url"), None


def submit(prompt, image_url, tag):
    args = {
        "model": MODEL,
        "prompt": prompt,
        "duration": OPT["seconds"],
        "resolution": OPT["resolution"],
        "reference_type": "first_frame",
        "input_image": {"url": image_url, "mime_type": "image/png"},
    }
    tmp = os.path.join(common.out_dir(STAGE), "_args_%s.json" % tag)
    if not budget_take():
        BILLING["stopped"] = True
        raise BillingStop("已達額度上限（%d credits，已用 %d）" % (BUDGET["max"], BUDGET["spent"]))
    with io.open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(args, ensure_ascii=False))
    body = json.dumps(args, ensure_ascii=False)
    if len(body.encode("utf-8")) > 64 * 1024 * 1024:
        return None, "request body 超過 64MB"
    if len(prompt) > 3000:
        return None, "prompt 超過 3000 code points"
    rc, out, err = run('"%s" connector call connector__matrix__submit_video_generation --args-file "%s"'
                       % (CLI, tmp))
    raw = (out or "") + (err or "")
    check_billing(raw)
    if rc != 0:
        return None, (err or out)[:400]
    try:
        data = json.loads(out[out.index("{"): out.rindex("}") + 1])
    except Exception as e:
        return None, "回應無法解析：%s" % str(e)[:200]
    if data.get("code") not in (0, None):
        return None, "送出被拒（code=%s）：%s" % (data.get("code"), data.get("message", "")[:250])
    task_id = data.get("task_id")
    if not task_id:
        return None, "送出回應沒有 task_id（ambiguous，不重送）：%s" % json.dumps(data, ensure_ascii=False)[:300]
    return task_id, None


def poll(task_id, max_seconds=2400):
    qargs = os.path.join(common.out_dir(STAGE), "_query_%s.json" % task_id)
    with io.open(qargs, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps({"task_id": task_id, "model": MODEL}, ensure_ascii=False))
    deadline = time.time() + max_seconds
    while True:
        data, err = cli_json('"%s" connector call connector__matrix__query_video_generation --args-file "%s"'
                             % (CLI, qargs))
        status = (data or {}).get("status")
        if status in ("succeeded", "failed", "cancelled"):
            return status, (data or {}).get("node_id"), json.dumps(data or {}, ensure_ascii=False)
        if time.time() > deadline:
            return "timed_out", None, ""
        time.sleep(30)


def download(node_id, out_path):
    data, err = cli_json('"%s" get_asset_url %s' % (CLI, node_id))
    if err:
        return err
    url = data.get("download_url")
    if not url:
        return "get_asset_url 沒有回 download_url"
    part = out_path + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=600) as resp, open(part, "wb") as f:
        f.write(resp.read())
    if os.path.getsize(part) <= 0:
        os.remove(part)
        return "下載內容是空的"
    os.replace(part, out_path)
    return None


def extract_last(src, dst):
    rc, out, err = run('ffmpeg -y -hide_banner -loglevel error -sseof -0.25 -i "%s" -frames:v 1 "%s"' % (src, dst))
    return None if rc == 0 else (err or out)[:300]


def make_static_fill(src_frame, out_path, seconds, fps=24):
    """混合模式的靜態鋪底：拿 AI 最後一段的末幀，做「慢速推近 + 橫向漂移」鋪滿剩下的時間。

    來源就是 AI 的末幀 → 接縫看不見，鏡頭只是從「推近」變成「推近＋橫移」。
    比單純凍結一張圖好：觀眾看到的是持續運鏡，不是死掉的畫面。
    放大 1.25 倍再取景，才有推近與橫移的餘裕（zoom>1 需要輸入比輸出大）。
    """
    w, h = CLIP_DIMS.get(OPT["resolution"], (768, 1344))
    sw, sh = int(w * 1.25), int(h * 1.25)
    dur = max(0.5, float(seconds))
    frames = max(1, int(round(dur * fps)))
    zoom_end = 1.10
    # on = 輸出影格數；z 從 1.00 慢慢推到 1.10，x 同步往右漂
    vf = ("scale=%d:%d:flags=lanczos,"
          "zoompan=z='min(1+%.8f*on,%.2f)':x='(iw-iw/zoom)*on/%d':y='(ih-ih/zoom)/2':"
          "d=1:s=%dx%d:fps=%d,format=yuv420p"
          % (sw, sh, (zoom_end - 1.0) / frames, zoom_end, frames, w, h, fps))
    cmd = ('ffmpeg -y -hide_banner -loglevel error -loop 1 -framerate %d -i "%s" '
           '-vf "%s" -t %.3f -r %d -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p '
           '-profile:v high -an "%s"' % (fps, src_frame, vf, dur, fps, out_path))
    rc, out, err = run(cmd, timeout=3600)
    if rc != 0 or not os.path.exists(out_path):
        return (err or out)[-400:]
    return None


def make_gradient(path, w=1080, h=1920):
    from PIL import Image
    top_end, bot_start = int(h * 0.22), int(h * 0.42)
    col = Image.new("RGBA", (1, h))
    for y in range(h):
        if y < top_end:
            a = int(130 * (1 - float(y) / top_end))
        elif y >= bot_start:
            a = int(170 * (((y - bot_start) / float(h - bot_start)) ** 1.35))
        else:
            a = 0
        col.putpixel((0, y), (0, 0, 0, a))
    col.resize((w, h)).save(path)
    return path


# ------------------------------------------------------------- 合成影片
def assemble(clips, audio, ass_dir, out_path, duration, tag="x"):
    """clips: ASCII 路徑串列；ass_dir: 歌曲資料夾（字幕檔名用相對路徑）。"""
    stage = common.out_dir(STAGE)
    concat = os.path.join(stage, "_concat_%s.txt" % tag)   # 平行模式下不能共用同一個檔名
    with io.open(concat, "w", encoding="utf-8", newline="\n") as f:
        for c in clips:
            f.write("file '%s'\n" % c.replace("\\", "/"))

    grad = make_gradient(os.path.join(stage, "_grad_%s.png" % tag))
    vf = ("[0:v]scale=1080:1920:flags=lanczos,eq=brightness=-0.055:saturation=1.08,"
          "vignette=PI/4[bg];"
          "[2:v]format=rgba[gr];"
          "[bg][gr]overlay=0:0:format=auto,"
          "drawbox=x=0:y=ih-8:w='iw*t/%.3f':h=8:color=0x7fd1ff@0.7:t=fill,"
          "subtitles=lyrics_vertical.ass[v]" % duration)
    cmd = ('ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "%s" '
           '-i "%s" -loop 1 -framerate 25 -i "%s" '
           '-filter_complex "%s" -map "[v]" -map 1:a -t %.3f '
           '-c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p -profile:v high -level 4.0 -g 50 -r 25 '
           '-c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "%s"'
           % (concat, audio, grad, vf.replace('"', '\\"'), duration, out_path))
    rc, out, err = run(cmd, timeout=3600, cwd=ass_dir)
    if rc != 0 or not os.path.exists(out_path):
        return (err or out)[-600:]
    return None


# ------------------------------------------------------------------ 單曲
def produce_song(song, music_dir, scene_root, out_root, scene_desc, motion="push_in",
                 force=False, abort=None, ai_segments=0, force_segments=False):
    sid = song["id"]
    stage_dir = os.path.join(common.out_dir(STAGE), sid)
    os.makedirs(stage_dir, exist_ok=True)

    src_scene = os.path.join(scene_root, sid, "scene_9x16.png")
    if not os.path.exists(src_scene):
        return False, "沒有 scene_9x16.png（先跑 line1_mv_frames.py --sizes 9x16）"

    out = os.path.join(out_root, sid)
    os.makedirs(out, exist_ok=True)

    seg_seconds = OPT["seconds"]
    seg_actual = seg_seconds * (1 + SEG_OVERHEAD_RATIO)

    audio_rel = song.get("audio")
    audio = os.path.join(music_dir, audio_rel.replace("/", os.sep)) if audio_rel else ""
    duration = 0.0
    if audio and os.path.exists(audio):
        duration = float(common.ffprobe(audio).get("duration") or 0)
    seg_count = int(math.ceil(duration / seg_seconds)) if duration > 1 else 0
    ai_count = seg_count if (ai_segments <= 0 or ai_segments >= seg_count) else int(ai_segments)
    partial = seg_count > 0 and ai_count < seg_count
    out_name = (OUT_NAME_BASE + ".partial%d.mp4" % ai_count) if partial else OUT_NAME

    dst = os.path.join(out, out_name)
    if os.path.exists(dst) and not force and os.path.getsize(dst) > 1024:
        p = common.ffprobe(dst)
        if (p.get("width"), p.get("height")) == (1080, 1920):
            return True, "%s 已存在（略過）" % out_name

    if not audio or not os.path.exists(audio):
        return False, "音檔不存在"
    if duration <= 1:
        return False, "音檔長度異常"

    # 中文路徑先搬到 ASCII 暫存區（位元組不變），上傳才不會失敗
    first_frame = os.path.join(stage_dir, "first_frame.png")
    shutil.copyfile(src_scene, first_frame)

    clips = []
    current = first_frame

    for i in range(1, ai_count + 1):
        if abort is not None and abort():
            return False, "已中止"
        clip = os.path.join(stage_dir, "seg_%02d.mp4" % i)
        next_frame = os.path.join(stage_dir, "frame_%02d.png" % (i + 1))

        # 段落層級續跑：已經產好的段落直接沿用，不重新花額度
        # （--force 只重算最後合成；要重做段落要用 --force-segments，那會重新燒額度）
        if not force_segments and os.path.exists(clip) and os.path.getsize(clip) > 1024:
            clips.append(clip)
            if i < ai_count:
                if not os.path.exists(next_frame):
                    err = extract_last(clip, next_frame)
                    if err:
                        return False, "第 %d 段抽末幀失敗：%s" % (i, err)
                current = next_frame
            print("  [%s seg %d/%d] 已存在（沿用）" % (sid, i, ai_count), flush=True)
            continue

        prompt = build_prompt(scene_desc or "the same still life shown in the reference frame",
                              motion, i)

        url, err = upload_image(current)
        if err:
            return False, "第 %d 段上傳失敗：%s" % (i, err)

        task_id, err = submit(prompt, url, "%s_%02d" % (sid, i))
        if err:
            return False, "第 %d 段送出失敗：%s" % (i, err)
        print("  [%s seg %d/%d] submitted %s" % (sid, i, ai_count, task_id), flush=True)

        status, node_id, detail = poll(task_id)
        print("  [%s seg %d/%d] status=%s" % (sid, i, ai_count, status), flush=True)
        if status != "succeeded":
            return False, "第 %d 段 %s：%s" % (i, status, detail[:250])

        err = download(node_id, clip)
        if err:
            return False, "第 %d 段下載失敗：%s" % (i, err)
        clips.append(clip)

        if i < ai_count:
            err = extract_last(clip, next_frame)
            if err:
                return False, "第 %d 段抽末幀失敗：%s" % (i, err)
            current = next_frame

    # ---- 混合模式：AI 段用完，剩下用末幀慢速橫移鋪滿（省 credits） ----
    if partial and clips:
        tail_src = os.path.join(stage_dir, "frame_tail.png")
        if not os.path.exists(tail_src):
            err = extract_last(clips[-1], tail_src)
            if err:
                return False, "抽尾幀失敗：%s" % err
        remaining = duration - ai_count * seg_actual
        if remaining > 0.5:
            tail = os.path.join(stage_dir, "tail_static.mp4")
            err = make_static_fill(tail_src, tail, remaining)
            if err:
                return False, "靜態鋪底失敗：%s" % err
            clips.append(tail)
            print("  [%s] 靜態鋪底 %.1fs（AI %d 段 + 漂移）" % (sid, remaining, ai_count), flush=True)

    ass_name = os.path.join(out, "lyrics_vertical.ass")
    if not os.path.exists(ass_name):
        return False, "沒有 lyrics_vertical.ass（先跑 line1_mv_shorts.py 產生直式字幕）"

    dst = os.path.join(out, out_name)
    err = assemble(clips, audio, out, dst, duration, tag=sid)
    if err:
        return False, "合成失敗：%s" % err
    p = common.ffprobe(dst)
    if (p.get("width"), p.get("height")) != (1080, 1920):
        return False, "尺寸錯誤 %sx%s" % (p.get("width"), p.get("height"))
    return True, "%s %dx%d %s+%s %.1fMB（AI %d 段%s）" % (
        out_name, p["width"], p["height"], p["codec"], p["audio"],
        os.path.getsize(dst) / 1048576.0, ai_count,
        " + 靜態鋪底" if partial else "")


# ----------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(description="直式 Shorts 的 AI 動態畫面產線（Hailuo-2.3）")
    ap.add_argument("--song", default=None, help="只跑指定曲目 id")
    ap.add_argument("--song-index", type=int, default=0,
                    help="只跑第 N 首（1 起算）。中文歌名在指令列會編碼壞掉時用這個")
    ap.add_argument("--all", action="store_true", help="跑所有有場景圖的曲目（會產生費用）")
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 首")
    ap.add_argument("--out", default=None, help="產出根目錄（預設 out/line1_lyric_mv）")
    ap.add_argument("--jobs", type=int, default=1, help="同時跑幾首歌（各首歌的段是串行的，歌與歌之間可平行）")
    ap.add_argument("--budget", type=int, default=0,
                    help="額度上限（credits）；0 = 不限制。每段 10 秒 768P 實測 280 credits")
    ap.add_argument("--seconds", type=int, default=10, choices=(6, 10),
                    help="每段長度（6 或 10 秒）。Hailuo-2.3 只支援這兩個長度")
    ap.add_argument("--resolution", default="768P", choices=("768P", "1080P"),
                    help="解析度。1080P 只有 6 秒片段支援")
    ap.add_argument("--ai-segments", type=int, default=0,
                    help="混合模式：每首歌只做前 N 段 AI，剩下用末幀慢速漂移鋪滿（省 credits）；0 = 全段都做 AI")
    ap.add_argument("--segment-cost", type=int, default=280,
                    help="每段 credits 成本（Hailuo-2.3 768P/10s 實測 280）")
    ap.add_argument("--force", action="store_true", help="已存在的成品也重做（不重燒 AI 段落的額度）")
    ap.add_argument("--force-segments", action="store_true",
                    help="連 AI 段落也重做（會重新燒額度，慎用）")
    ap.add_argument("--list", action="store_true", help="只列出會跑的曲目與段數")
    args = ap.parse_args(argv)

    global CREDITS_PER_SEGMENT
    CREDITS_PER_SEGMENT = max(1, int(args.segment_cost))
    OPT["seconds"] = int(args.seconds)
    OPT["resolution"] = args.resolution
    OPT["ai_segments"] = max(0, int(args.ai_segments))

    common.header("Line 1+ AI — 直式 Shorts 動態畫面（%s / %s / %ds / jobs=%d%s）"
                  % (MODEL, OPT["resolution"], OPT["seconds"], max(1, args.jobs),
                     " / 混合模式 AI %d 段" % OPT["ai_segments"] if OPT["ai_segments"] else ""))
    songs, music_dir = MV.load_manifest()
    scene_root = common.out_dir(SCENE_DIR)
    out_root = os.path.abspath(args.out) if args.out else common.out_dir("line1_lyric_mv")

    scenes = common.load_json(os.path.join(common.DATA_DIR, "scenes.json"), {"scenes": {}})
    scene_map = scenes.get("scenes", {})

    todo = [s for s in songs if s.get("audio")
            and os.path.exists(os.path.join(scene_root, s["id"], "scene_9x16.png"))]
    if args.song:
        todo = [s for s in todo if s["id"] == args.song]
    if args.song_index:
        idx = args.song_index - 1
        todo = [todo[idx]] if 0 <= idx < len(todo) else []
    if args.limit:
        todo = todo[:args.limit]

    if args.list:
        total_seg = 0
        total_cr = 0
        for s in todo:
            audio = os.path.join(music_dir, s["audio"].replace("/", os.sep))
            d = float(common.ffprobe(audio).get("duration") or 0)
            sc = scene_map.get(s["id"]) or {}
            segs = int(math.ceil(d / OPT["seconds"])) if d > 1 else 0
            ai = segs if (OPT["ai_segments"] <= 0 or OPT["ai_segments"] >= segs) else OPT["ai_segments"]
            cr = ai * CREDITS_PER_SEGMENT
            total_seg += ai
            total_cr += cr
            print("  %-24s %5.1fs -> %2d 段 (AI %2d) %6d cr  運鏡=%s" % (
                s["id"], d, segs, ai, cr, sc.get("motion", "push_in")))
        print("  合計 AI %d 段 = %d credits（每段 %d）"
              % (total_seg, total_cr, CREDITS_PER_SEGMENT))
        return 0
    if not (args.all or args.song or args.song_index or args.limit):
        print("[ERROR] 沒有可跑的曲目（用 --song / --limit / --all 指定；--list 可看有哪些）")
        return 2
    if not todo:
        print("[ERROR] 沒有可跑的曲目")
        return 2

    # 平行跑：每首歌的段是串行的（末幀→下一段首幀），但歌與歌之間互不相干
    from concurrent.futures import ThreadPoolExecutor

    lock = threading.Lock()
    stop_event = threading.Event()
    results = []
    failures = [0]
    BUDGET["spent"] = 0
    BUDGET["max"] = max(0, args.budget)

    def run_one(s):
        sid = s["id"]
        if stop_event.is_set() or BILLING["stopped"]:
            return False, "已中止"
        t0 = time.time()
        sc = scene_map.get(sid) or {}
        try:
            ok, note = produce_song(s, music_dir, scene_root, out_root,
                                    sc.get("scene") or "", sc.get("motion") or "push_in",
                                    force=args.force, abort=stop_event.is_set,
                                    ai_segments=OPT["ai_segments"],
                                    force_segments=args.force_segments)
        except BillingStop as e:
            BILLING["stopped"] = True
            stop_event.set()
            ok, note = False, str(e)[:250]
        except Exception as e:
            ok, note = False, "%s: %s" % (type(e).__name__, str(e)[:250])
        with lock:
            results.append({"id": sid, "title": s.get("title"), "ok": ok, "note": note,
                            "seconds": round(time.time() - t0, 1)})
            if ok:
                failures[0] = 0
            else:
                failures[0] += 1
                if failures[0] >= 3:
                    stop_event.set()
                    print("  [ABORT] 連續 3 首失敗，整批中止（避免繼續燒額度）", flush=True)
        return ok

    if args.jobs > 1:
        with ThreadPoolExecutor(max_workers=args.jobs) as ex:
            list(ex.map(run_one, todo))
    else:
        for s in todo:
            run_one(s)

    order = {s["id"]: i for i, s in enumerate(todo)}
    results.sort(key=lambda r: order.get(r["id"], 0))

    rep = common.Report("line1_mv_ai 產出驗證")
    for r in results:
        rep.step(r["id"], r["ok"], "%s（%.0fs）" % (r["note"], r.get("seconds", 0)))

    common.dump_json({"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "songs": results},
                      os.path.join(out_root, "index_ai.json"))
    ok = rep.finish()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
