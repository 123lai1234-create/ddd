"""
產線 3：歌詞卡 / 封面圖批次
==========================
輸入一份歌曲清單（data/songs.json），每首歌自動產出：
  - Instagram 方形卡 1080x1080
  - Instagram 故事卡 1080x1920
  - YouTube 縮圖   1280x720
  - Spotify 封面   3000x3000（向量模板直接放大，不糊）
  - 上述每張的 JPG 版（用 GIMP 批次轉檔，不是假造檔案）

用法：
    python line3_lyric_cards.py
    python line3_lyric_cards.py --manifest data/songs.json --out out/line3_cards
"""

import argparse
import os
import sys

import cardkit
import common

# (模板, 檔名, 匯出寬度, 說明)
TARGETS = [
    ("card_square", "square_1080.png", 1080, "IG 方形 1080x1080"),
    ("card_story", "story_1080x1920.png", 1080, "IG 故事 1080x1920"),
    ("card_yt", "yt_1280x720.png", 1280, "YouTube 縮圖 1280x720"),
    ("card_square", "cover_3000x3000.png", 3000, "Spotify 封面 3000x3000"),
]

# GIMP 批次：一次把所有 PNG 轉成 JPG（真正的批次，不是逐檔呼叫）
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


def main():
    ap = argparse.ArgumentParser(description="歌詞卡 / 封面圖批次")
    ap.add_argument("--manifest", default=None, help="歌曲清單 JSON")
    ap.add_argument("--out", default=None, help="產出根目錄")
    ap.add_argument("--limit", type=int, default=0, help="只處理前 N 首（0 = 全部）")
    args = ap.parse_args()

    common.header("產線 3：歌詞卡 / 封面圖批次")
    rep = common.Report("line3 lyric cards")
    songs = cardkit.load_manifest(args.manifest)
    if args.limit:
        songs = songs[:args.limit]
    site = cardkit.load_site()
    out_root = args.out or common.out_dir("line3_cards")
    os.makedirs(out_root, exist_ok=True)
    print("  來源清單：%d 首" % len(songs))

    jpg_jobs = []
    for song in songs:
        sid = common.safe_name(song.get("id") or song.get("title"), "song")
        d = os.path.join(out_root, sid)
        os.makedirs(d, exist_ok=True)

        for tpl, fname, width, desc in TARGETS:
            vals = cardkit.build_values(song, tpl, site)
            png = os.path.join(d, fname)
            ok, det = cardkit.render(tpl, png, vals, width=width)
            rep.step("%s / %s" % (sid, desc), ok, det)
            if ok:
                jpg_jobs.append((png, os.path.splitext(png)[0] + ".jpg"))

        # 同時留一份 SVG，之後要改字直接改向量再重出，不用回頭重做圖
        vals = cardkit.build_values(song, "card_square", site)
        svg_src = os.path.join(d, "card_square.svg")
        with open(svg_src, "w", encoding="utf-8", newline="\n") as f:
            f.write(open(cardkit.template_path("card_square"), encoding="utf-8").read())

    # ---- GIMP 批次：PNG -> JPG ----
    if jpg_jobs:
        log = os.path.join(out_root, "_gimp_jpg.log")
        job = GIMP_JOB % {"jobs": repr(jpg_jobs), "log": log}
        try:
            r, glog = common.gimp_job(job, log, timeout=600)
            made = [d for _, d in jpg_jobs if os.path.exists(d) and os.path.getsize(d) > 500]
            ok = len(made) == len(jpg_jobs)
            rep.step("GIMP 批次 PNG->JPG", ok,
                     "%d/%d 張  %s" % (len(made), len(jpg_jobs),
                                      (glog or "").strip().replace("\n", " | ")[-160:]))
        except Exception as e:
            rep.step("GIMP 批次 PNG->JPG", False, "%s: %s" % (type(e).__name__, str(e)[:150]))

    # ---- 驗證尺寸 ----
    bad = []
    for song in songs:
        sid = common.safe_name(song.get("id") or song.get("title"), "song")
        d = os.path.join(out_root, sid)
        for tpl, fname, width, desc in TARGETS:
            p = os.path.join(d, fname)
            w, h = common.png_size(p)
            if w != width:
                bad.append("%s %s %dx%d != %d" % (sid, fname, w, h, width))
    rep.step("所有產出尺寸正確", not bad,
             "; ".join(bad[:3]) if bad else "4 種尺寸 x %d 首" % len(songs))

    print("")
    print("  產出目錄：%s" % out_root)
    ok = rep.finish()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
