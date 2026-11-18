"""
產線 2b：場景圖 → donttalk 網站 OG／分享卡
==========================================
把產線 1++ 產出來的 SDXL 場景圖（scene_1x1.png）接進donttalk 網站，
讓每一首歌的社群分享卡（OG image）從「純向量漸層」換成「自己的場景照 + 歌詞」。

產出（站上實際使用的路徑與檔名）：
    astro/public/music/cards/<slug>/
        square-1080.jpg      1080x1080   頁面左欄主視覺 + IG 方形
        story-1080x1920.jpg  1080x1920   IG 故事圖
        yt-1280x720.jpg      1280x720    YouTube 縮圖
        og-image.jpg         1200x630    OG meta（社交平台抓這張）
        share-card.jpg       1200x1200   方形分享卡

為什麼 slug 要自己算、不能用 common.safe_name：
    網站的 musicSongs.ts 用的是 slugify()：非「字母/數字/底線/減號」
    的字元一律換成 '-'。所以 03_不服輸(優化版) 在站上的目錄名是
    03_不服輸-優化版（括號被換掉），而 common.safe_name 會保留括號，
    兩邊對不起來 → 頁面永遠抓不到卡片。
    這裡的 site_slug() 必須跟音樂Songs.ts 的 slugify() 保持一致。

用法：
    python line2_scene_cards.py --list
    python line2_scene_cards.py --limit 1              # 先產一首試
    python line2_scene_cards.py                        # 全 19 首
    python line2_scene_cards.py --no-publish            # 只產不覆蓋站上
"""

import argparse
import json
import os
import re
import shutil
import sys

import cardkit
import common

SCENE_DIR = os.path.join(common.OUT_ROOT, "line1_scenes")
SITE_CARDS = r"D:\project\astro\public\music\cards"

# (模板, 輸出檔名, 匯出寬度, 說明)
TARGETS = [
    ("card_square_bg", "square-1080", 1080, "IG 方形 1080x1080"),
    ("card_story_bg", "story-1080x1920", 1080, "IG 故事 1080x1920"),
    ("card_yt_bg", "yt-1280x720", 1280, "YouTube 縮圖 1280x720"),
    ("og_image_bg", "og-image", 1200, "OG 分享圖 1200x630"),
    ("share_square_bg", "share-card", 1200, "方形分享卡 1200x1200"),
]

# GIMP 批次：一次把所有 PNG 轉成 JPG（真正的一趟批次，不逐檔呼叫）
GIMP_JOB = """
JOBS = %(jobs)s
LOG = r"%(log)s"
lines = []
for src, dst in JOBS:
    try:
        img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(src))
        Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(dst), None)
        lines.append("saved %%s -> %%s %%d bytes" %% (os.path.basename(src), os.path.basename(dst), os.path.getsize(dst)))
    except Exception as e:
        lines.append("ERR %%s %%s" %% (os.path.basename(src), str(e)[:130]))
with open(LOG, "w", encoding="utf-8") as f:
    f.write("\\n".join(lines))
"""


def site_slug(s):
    """與 astro/src/lib/musicSongs.ts 的 slugify() 一致。

    JS: id.replace(/[^\\p{L}\\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '')
    Python 的 \\w 在 str 模式下 = Unicode 字母 + 數字 + 底線，語意相同。
    """
    s = re.sub(r"[^\w-]+", "-", str(s or ""))
    return re.sub(r"^-+|-+$", "", s)


def scene_songs():
    """列出有場景圖的曲名（排除批次日誌與索引檔）。"""
    if not os.path.isdir(SCENE_DIR):
        return []
    names = []
    for n in sorted(os.listdir(SCENE_DIR)):
        d = os.path.join(SCENE_DIR, n)
        if not os.path.isdir(d):
            continue
        if n.startswith("_") or n == "index.json":
            continue
        if not os.path.exists(os.path.join(d, "scene_1x1.png")):
            continue
        names.append(n)
    return names


def song_index():
    """id → song 資料（標題 / hook / 配色）。"""
    songs = cardkit.load_manifest()
    return {s.get("id"): s for s in songs if s.get("id")}


def lyric_from_site(sid):
    """songs.json 沒有時，從網站的歌詞 txt 抓第一行當 hook。"""
    p = os.path.join(r"D:\project\astro\public\music", sid + ".txt")
    if not os.path.exists(p):
        return ""
    with open(p, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("=") or s.startswith("【") or s.startswith("["):
                continue
            return s
    return ""


def jpg_size(path):
    """讀圖片尺寸（PNG / JPG 都可以）。回傳 (0,0) 代表讀不到。"""
    try:
        from PIL import Image
        with Image.open(path) as im:
            return im.size
    except Exception:
        return (0, 0)


def main():
    ap = argparse.ArgumentParser(description="場景圖 → OG／分享卡")
    ap.add_argument("--list", action="store_true", help="只列出清單")
    ap.add_argument("--limit", type=int, default=0, help="只處理前 N 首")
    ap.add_argument("--out", default=None, help="中間 PNG/JPG 產出目錄")
    ap.add_argument("--no-publish", action="store_true", help="只產不覆蓋網站素材")
    ap.add_argument("--song-index", type=int, default=-1, help="只做第 N 首（0 起算）")
    args = ap.parse_args()

    common.header("產線 2b：場景圖 → donttalk OG／分享卡")
    rep = common.Report("line2 scene cards")

    names = scene_songs()
    if args.song_index >= 0:
        names = [names[args.song_index]] if args.song_index < len(names) else []
    if args.limit:
        names = names[:args.limit]

    if args.list:
        for i, n in enumerate(names):
            print("  %2d  %-24s -> cards/%s/" % (i, n, site_slug(n)))
        return

    idx = song_index()
    site = cardkit.load_site()
    out_root = args.out or common.out_dir("line2_scene_cards")
    os.makedirs(out_root, exist_ok=True)
    print("  場景 %d 首  產出目錄：%s" % (len(names), out_root))

    jpg_jobs = []
    for n in names:
        slug = site_slug(n)
        d = os.path.join(out_root, slug)
        os.makedirs(d, exist_ok=True)
        bg = os.path.join(SCENE_DIR, n, "scene_1x1.png")

        song = dict(idx.get(n) or {})
        song.setdefault("id", n)
        song.setdefault("title", re.sub(r"^\d+[-_]", "", n))
        song.setdefault("artist", "不說")
        song.setdefault("subtitle", site.get("url", "donttalk.vercel.app"))
        if not song.get("lyric"):
            song["lyric"] = lyric_from_site(n)

        for tpl, fname, width, desc in TARGETS:
            vals = cardkit.build_values(song, tpl, site, bg_image=bg)
            png = os.path.join(d, fname + ".png")
            ok, det = cardkit.render(tpl, png, vals, width=width)
            rep.step("%s / %s" % (slug, desc), ok, det)
            if ok:
                jpg_jobs.append((png, os.path.join(d, fname + ".jpg")))

    # ---- GIMP 批次：PNG -> JPG ----
    if jpg_jobs:
        log = os.path.join(out_root, "_gimp_jpg.log")
        job = GIMP_JOB % {"jobs": repr(jpg_jobs), "log": log}
        try:
            r, glog = common.gimp_job(job, log, timeout=1200)
            made = [d for _, d in jpg_jobs if os.path.exists(d) and os.path.getsize(d) > 500]
            rep.step("GIMP 批次 PNG->JPG", len(made) == len(jpg_jobs),
                     "%d/%d 張  %s" % (len(made), len(jpg_jobs),
                                      (glog or "").strip().replace("\n", " | ")[-160:]))
        except Exception as e:
            rep.step("GIMP 批次 PNG->JPG", False, "%s: %s" % (type(e).__name__, str(e)[:150]))

    # ---- 尺寸 QA ----
    exp = {t[1]: (t[2], t[2]) for t in TARGETS}
    exp["story-1080x1920"] = (1080, 1920)
    exp["yt-1280x720"] = (1280, 720)
    exp["og-image"] = (1200, 630)
    bad = []
    for n in names:
        slug = site_slug(n)
        d = os.path.join(out_root, slug)
        for fname, (w, h) in exp.items():
            p = os.path.join(d, fname + ".jpg")
            if not os.path.exists(p):
                bad.append("%s %s 缺檔" % (slug, fname))
                continue
            pw, ph = jpg_size(p)
            if (pw, ph) != (w, h):
                bad.append("%s %s %dx%d != %dx%d" % (slug, fname, pw, ph, w, h))
    rep.step("所有產出存在且尺寸正確", not bad,
             "; ".join(bad[:3]) if bad else "%d 種尺寸 x %d 首" % (len(exp), len(names)))

    # ---- 發佈到網站 ----
    if not args.no_publish:
        published, skipped = 0, []
        for n in names:
            slug = site_slug(n)
            src_d = os.path.join(out_root, slug)
            dst_d = os.path.join(SITE_CARDS, slug)
            os.makedirs(dst_d, exist_ok=True)
            for fname in exp:
                s = os.path.join(src_d, fname + ".jpg")
                if os.path.exists(s):
                    shutil.copy2(s, os.path.join(dst_d, fname + ".jpg"))
                    published += 1
                else:
                    skipped.append("%s/%s" % (slug, fname))
        rep.step("發佈到 astro/public/music/cards", not skipped,
                 "%d 個檔案%s" % (published, ("  缺：" + ", ".join(skipped[:3])) if skipped else ""))

    print("")
    print("  產出目錄：%s" % out_root)
    if not args.no_publish:
        print("  網站素材：%s" % SITE_CARDS)
    ok = rep.finish()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
