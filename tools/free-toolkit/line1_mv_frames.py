# -*- coding: utf-8 -*-
"""
line1_mv_frames.py — 場景圖產線（SDXL）
=====================================

給每首歌生成「無文字」的場景圖，補上產線 1+ 一直缺的那一層素材：

    1. 19 首有音檔的歌裡只有 6 首有真實封面 → 其餘只能拿產線 3 的
       1080x1080 卡片 fallback，而卡片上面有歌名字，既不能當影片首幀
       （AI 會把文字扭成亂碼），正方形裁成 16:9 / 9:16 也會壞構圖。
    2. 直式 Shorts 現在是從 1920x1080 中心裁切，16:9 裁成 9:16 等於切掉
       2/3 畫面，畫面糊成一片無主體色塊。

這條產線輸出三種比例，都是原生生成（不是裁切）：

    scene_16x9.png  1344x768   橫式 MV 背景，也是 H3 Pika Flex 1.0MP 的原生尺寸
    scene_9x16.png   768x1344  直式 Shorts 背景，同上
    scene_1x1.png   1024x1024  方形（封面 / 社群卡）

這批圖同時是之後接 AI 動態影片時的「第一幀」來源。

用法：
    python line1_mv_frames.py                 # 跑 manifest 裡所有有音檔的歌
    python line1_mv_frames.py --limit 3       # 只跑前 3 首
    python line1_mv_frames.py --song 07_愛的模樣
    python line1_mv_frames.py --list          # 只看會跑哪些
    python line1_mv_frames.py --sizes 16x9    # 只出某一種比例

實測踩坑：
  - 系統預設的 python 是 CPU 版 torch（2.14.1+cpu），SDXL 跑不動。
    這支腳本會自動改用有 CUDA 的直譯器（C:\\ComfyUI\\.venv\\Scripts\\python.exe，
    torch 2.10.0+cu130），用完再自己跳回來。
  - 8GB 顯存放不下 SDXL 全套 → 開 enable_model_cpu_offload() + vae tiling，
    1344x768 單張約 8-12 秒。
  - PIL 存 PNG 沒問題，中文路徑不會有問題（melt / GIMP 才會，見 README 坑 18）。
"""

from __future__ import print_function

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common          # noqa: E402

OUT_NAME = "line1_scenes"
REEXEC_FLAG = "MAVIS_FRAMES_REEXEC"

# 有 CUDA 的直譯器候選（依序試）
CUDA_PYTHONS = [
    r"C:\ComfyUI\.venv\Scripts\python.exe",
    r"D:\ComfyUI\.venv\Scripts\python.exe",
]

# 目標比例：(名稱, 寬, 高)  —— 寬高都對齊 SDXL 的原生 bucket
SIZES = {
    "16x9": (1344, 768),
    "9x16": (768, 1344),
    "1x1": (1024, 1024),
}

MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"


# ------------------------------------------------------------------ 直譯器
def need_cuda_python():
    """回傳要改用的 CUDA 直譯器；已經在 CUDA 環境就回 None。"""
    try:
        import torch
        if torch.cuda.is_available():
            return None
    except Exception:
        pass
    if os.environ.get(REEXEC_FLAG):
        return None
    for p in CUDA_PYTHONS:
        if os.path.exists(p) and os.path.normcase(p) != os.path.normcase(sys.executable):
            return p
    return None


def reexec_with_cuda():
    """換到有 CUDA 的直譯器重跑自己。

    Windows 上不要用 os.execve（會 ACCESS_VIOLATION 崩潰），
    用 subprocess 跑子行程再把 exit code 帶回來。
    """
    target = need_cuda_python()
    if not target:
        return False
    print("[INFO] 換用 CUDA 直譯器：%s" % target, flush=True)
    env = dict(os.environ)
    env[REEXEC_FLAG] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    cmd = [target, os.path.abspath(__file__)] + sys.argv[1:]
    try:
        proc = subprocess.run(cmd, env=env, cwd=os.getcwd())
    except Exception as e:                                   # pragma: no cover
        print("[ERROR] 換直譯器失敗：%s" % e, flush=True)
        return False
    sys.exit(proc.returncode)


# -------------------------------------------------------------------- 資料
def load_manifest():
    mpath = os.path.join(common.DATA_DIR, "songs.json")
    data = common.load_json(mpath, {"songs": []})
    songs = data.get("songs", [])
    rel = data.get("music_dir") or ""
    base = os.path.dirname(os.path.abspath(mpath))
    music_dir = os.path.normpath(os.path.join(base, rel.replace("/", os.sep)))
    return songs, music_dir


def load_scenes():
    path = os.path.join(common.DATA_DIR, "scenes.json")
    data = common.load_json(path, {"scenes": {}})
    return data.get("scenes", {}), data.get("_style", ""), data.get("_negative", "")


def song_seed(sid, tag):
    """每首歌每種比例固定 seed → 重跑結果一致。"""
    h = hashlib.md5(("%s|%s" % (sid, tag)).encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def check_token_length(scenes, style):
    """回報哪些提示詞超過 CLIP 的 77 token 上限。

    超過的部分會被**從尾端截掉** —— 場景主體在前面所以通常沒事，
    但共用風格後綴（cinematic film still...）會整段消失，風格就不統一了。
    """
    try:
        from transformers import CLIPTokenizer
        tok = CLIPTokenizer.from_pretrained(MODEL_ID, subfolder="tokenizer")
    except Exception as e:
        print("[WARN] 拿不到 CLIP tokenizer，跳過 token 長度檢查：%s" % str(e)[:120])
        return []

    over = []
    for sid, sc in scenes.items():
        if not isinstance(sc, dict):
            continue
        for key in ("scene", "cover"):
            p = sc.get(key)
            if not p:
                continue
            full = "%s, %s" % (p, style)
            n = len(tok(full)["input_ids"]) - 1
            if n > 77:
                over.append((sid, key, n))
    return over


# ------------------------------------------------------------------ 生成
def _enable(pipe, name, *args):
    """diffusers 各版本把這些開關搬家了（0.43 起移到 pipe.vae / 移除 slicing）。"""
    fn = getattr(pipe, name, None)
    if fn is None:
        return False
    try:
        fn(*args)
        return True
    except Exception as e:
        print("[WARN] %s() 失敗：%s" % (name, str(e)[:100]))
        return False


def build_pipelines():
    """載入 SDXL（fp16）。"""
    import torch
    from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler
    from huggingface_hub import snapshot_download

    dtype = torch.float16
    pipe = StableDiffusionXLPipeline.from_pretrained(
        MODEL_ID, variant="fp16", torch_dtype=dtype,
        use_safetensors=True, safety_checker=None, requires_safety_checker=False,
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config)
    pipe = pipe.to("cuda")
    _enable(pipe, "enable_model_cpu_offload")
    _enable(pipe, "enable_vae_tiling")
    _enable(pipe, "enable_attention_slicing")

    # fp16 修正版 VAE（SDXL 原生 fp16 VAE 容易出黑圖）
    try:
        vae_dir = snapshot_download(
            "madebyollin/sdxl-vae-fp16-fix",
            allow_patterns=["config.json", "diffusion_pytorch_model.safetensors"],
        )
        from diffusers import AutoencoderKL
        vae = AutoencoderKL.from_pretrained(vae_dir, torch_dtype=dtype)
        pipe.vae = vae.to("cuda")
        _enable(pipe, "enable_vae_tiling")
        _enable(pipe.vae, "enable_tiling")
    except Exception as e:
        print("[WARN] fp16 VAE 修正版沒裝上（會用原版）：%s" % str(e)[:120])
    return pipe


def render(pipe, prompt, negative, w, h, seed, steps, guidance):
    img = pipe(
        prompt=prompt,
        negative_prompt=negative,
        width=w,
        height=h,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=__import__("torch").Generator(device="cuda").manual_seed(seed),
    ).images[0]
    return img


def produce_song(pipe, song, scene, style, negative, out_root, sizes, steps, guidance,
                 force=False):
    sid = song["id"]
    out = os.path.join(out_root, sid)
    os.makedirs(out, exist_ok=True)

    base_prompt = scene.get("scene") or ""
    if not base_prompt:
        return False, "scenes.json 沒有這首歌的場景"
    prompt = "%s, %s" % (base_prompt, style)
    # 逐曲覆寫 negative（城市夜景這種招牌多的場景，光靠共用 negative 擋不住亂碼文字）
    neg = scene.get("negative") or negative

    notes = []
    for tag in sizes:
        w, h = SIZES[tag]
        dst = os.path.join(out, "scene_%s.png" % tag)

        # resume：已存在且非空就跳過（--force 才重畫）
        if not force and os.path.exists(dst) and os.path.getsize(dst) > 0:
            notes.append("%s 已存在" % tag)
            continue

        p = scene.get("cover") if tag == "1x1" else None
        if p:
            p = "%s, %s" % (p, style)
        else:
            p = prompt
        # seed 可在 scenes.json 用 seed_<比例> / seed 覆寫（換 prompt 後要能重現同一張圖）
        seed = scene.get("seed_%s" % tag) or scene.get("seed") or song_seed(sid, tag)
        t0 = time.time()
        img = render(pipe, p, neg, w, h, seed, steps, guidance)
        img.save(dst)
        if not os.path.exists(dst) or os.path.getsize(dst) == 0:
            return False, "scene_%s.png 沒產出" % tag
        notes.append("%s %dx%d (%.0fs)" % (tag, w, h, time.time() - t0))

    return True, " | ".join(notes)


# ----------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(description="場景圖產線（SDXL）")
    ap.add_argument("--limit", type=int, default=0, help="只跑前 N 首")
    ap.add_argument("--song", default=None, help="只跑指定曲目 id")
    ap.add_argument("--sizes", default="16x9,9x16,1x1", help="要出的比例，逗號分隔")
    ap.add_argument("--steps", type=int, default=28, help="採樣步數")
    ap.add_argument("--guidance", type=float, default=7.0, help="CFG")
    ap.add_argument("--out", default=None, help="產出根目錄（預設 out/line1_scenes）")
    ap.add_argument("--force", action="store_true", help="已存在的圖也重畫（預設跳過）")
    ap.add_argument("--list", action="store_true", help="只列出會跑的曲目")
    args = ap.parse_args(argv)

    sizes = [s.strip() for s in args.sizes.split(",") if s.strip() in SIZES]
    if not sizes:
        print("[ERROR] --sizes 沒指定有效比例：%s" % ", ".join(SIZES.keys()))
        return 2

    songs, music_dir = load_manifest()
    scenes, style, negative = load_scenes()

    todo = [s for s in songs if s.get("audio")]
    if args.song:
        todo = [s for s in todo if s["id"] == args.song]
    if args.limit:
        todo = todo[:args.limit]

    print("manifest %d 首，其中有音檔可跑 %d 首" % (len(songs), len(todo)))
    if args.list:
        for s in todo:
            mark = "OK " if s["id"] in scenes else "-- "
            print("  %s%-28s %s" % (mark, s["id"], s.get("title")))
        return 0
    if not todo:
        print("[ERROR] 沒有可跑的曲目")
        return 2

    missing = [s["id"] for s in todo if s["id"] not in scenes]
    if missing:
        print("[WARN] scenes.json 缺 %d 首：%s" % (len(missing), ", ".join(missing[:5])))

    out_root = os.path.abspath(args.out) if args.out else common.out_dir(OUT_NAME)
    os.makedirs(out_root, exist_ok=True)

    # 需要 CUDA 才往下走
    if need_cuda_python():
        if reexec_with_cuda():
            return 0
        print("[ERROR] 沒有可用的 CUDA 直譯器，SDXL 跑不動")
        return 2

    common.header("Line 1++ — 場景圖產線（SDXL）")
    try:
        pipe = build_pipelines()
    except Exception as e:
        print("[ERROR] 載入 SDXL 失敗：%s" % str(e)[:400])
        return 2
    print("SDXL 就緒：%s" % MODEL_ID)

    over = check_token_length(scenes, style)
    if over:
        print("[WARN] %d 個提示詞超過 CLIP 77 token，尾端會被截掉：" % len(over))
        for sid, key, n in over[:10]:
            print("       %s / %s = %d token" % (sid, key, n))
        print("       → 縮短 data/scenes.json 裡的場景描述或 _style")

    rep = common.Report("line1_mv_frames 產出驗證")
    index = []
    for i, s in enumerate(todo, 1):
        t0 = time.time()
        print("")
        print("  [%d/%d] %s" % (i, len(todo), s["id"]))
        try:
            ok, note = produce_song(pipe, s, scenes.get(s["id"], {}), style, negative,
                                    out_root, sizes, args.steps, args.guidance,
                                    force=args.force)
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
