"""
產線 2：donttalk 網站素材批次
=============================
把「一首歌上架到網站需要的所有圖與音檔」一次產完：

  站點層
    - favicon 32 / 180（apple-touch-icon）/ 192 / 512
    - logo.png（1024 透明底不難看，先用 favicon 模板放大）
  歌曲層
    - og-image.png 1200x630（社群分享卡，OG meta 用這張）
    - share-card.png 1200x1200
    - 兩張的 JPG 版（GIMP 批次轉檔）
    - meta.json（直接貼進頁面的 og:/twitter: 標籤）
    - 若清單有指定音檔 → 轉 m4a / ogg / mp3 三種 web 格式

用法：
    python line2_site_assets.py
    python line2_site_assets.py --manifest data/songs.json --out out/line2_site
"""

import argparse
import json
import os
import shutil
import sys

import cardkit
import common

FAVICON_SIZES = [32, 180, 192, 512]

SONG_TARGETS = [
    ("og_image", "og-image.png", 1200, "OG 分享圖 1200x630"),
    ("share_square", "share-card.png", 1200, "分享卡 1200x1200"),
]

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


def favicon_values(site):
    return {
        "COLOR1": site.get("color1", "#E8A33D"),
        "COLOR2": site.get("color2", "#101820"),
        "COLOR3": site.get("color3", "#0A0E14"),
        "TEXTCOLOR": cardkit.readable_on(site.get("color2", "#101820")),
        "FONT": cardkit.FONT_CJK,
        "INITIAL": cardkit.esc(site.get("initial", "不")),
    }


def transcode_audio(src, out_dir, rep, tag):
    """同一支音檔轉成 web 三種格式。回傳 (ok, detail)。"""
    if not src or not os.path.exists(src):
        return False, "沒有音檔來源（清單的 audio 欄留空即可略過）"
    plans = [
        ("m4a", ["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]),
        ("ogg", ["-c:a", "libvorbis", "-q:a", "4"]),
        ("mp3", ["-c:a", "libmp3lame", "-q:a", "2"]),
    ]
    made, errs = [], []
    for ext, args in plans:
        dst = os.path.join(out_dir, "%s.%s" % (tag, ext))
        r = common.run([common.tool("ffmpeg"), "-y", "-v", "error", "-i", src] + args + [dst],
                        timeout=300)
        if r.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 1000:
            made.append("%s(%dKB)" % (ext, os.path.getsize(dst) // 1024))
        else:
            errs.append("%s: %s" % (ext, (r.stderr or "")[-110:].replace("\n", " ")))
    return bool(made), (", ".join(made) if made else "; ".join(errs))


def main():
    ap = argparse.ArgumentParser(description="網站素材批次")
    ap.add_argument("--manifest", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--limit", type=int, default=0, help="只處理前 N 首（0 = 全部）")
    args = ap.parse_args()

    common.header("產線 2：donttalk 網站素材批次")
    rep = common.Report("line2 site assets")
    site = cardkit.load_site()
    songs = cardkit.load_manifest(args.manifest)
    if args.limit:
        songs = songs[:args.limit]
    out_root = args.out or common.out_dir("line2_site")
    site_dir = os.path.join(out_root, "_site")
    os.makedirs(site_dir, exist_ok=True)
    print("  站點：%s  歌曲：%d 首" % (site.get("site"), len(songs)))

    # ---------------- 站點層：favicon ----------------
    fv = favicon_values(site)
    for size in FAVICON_SIZES:
        png = os.path.join(site_dir, "favicon-%d.png" % size)
        ok, det = cardkit.render("favicon.svg", png, fv, width=size)
        rep.step("favicon-%d.png" % size, ok, det)
    logo = os.path.join(site_dir, "logo-1024.png")
    ok, det = cardkit.render("favicon.svg", logo, fv, width=1024)
    rep.step("logo-1024.png", ok, det)

    # ---------------- 歌曲層 ----------------
    jpg_jobs = []
    metas = {}
    for song in songs:
        sid = common.safe_name(song.get("id") or song.get("title"), "song")
        d = os.path.join(out_root, sid)
        os.makedirs(d, exist_ok=True)

        for tpl, fname, width, desc in SONG_TARGETS:
            vals = cardkit.build_values(song, tpl, site)
            png = os.path.join(d, fname)
            ok, det = cardkit.render(tpl, png, vals, width=width)
            rep.step("%s / %s" % (sid, desc), ok, det)
            if ok:
                jpg_jobs.append((png, os.path.splitext(png)[0] + ".jpg"))

        url = "%s/%s/" % (site.get("url", "").rstrip("/"), sid)
        meta = {
            "id": sid,
            "title": song.get("title", ""),
            "artist": song.get("artist", ""),
            "og": {
                "og:title": song.get("title", ""),
                "og:description": song.get("lyric", "").split("\n")[0],
                "og:image": "%s/og-image.png" % url,
                "og:image:width": "1200",
                "og:image:height": "630",
                "og:type": "music.song",
                "og:url": url,
            },
            "twitter": {
                "twitter:card": "summary_large_image",
                "twitter:title": song.get("title", ""),
                "twitter:description": song.get("lyric", "").split("\n")[0],
                "twitter:image": "%s/og-image.png" % url,
            },
            "assets": {
                "og_image": "og-image.png",
                "share_card": "share-card.png",
            },
        }
        with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        metas[sid] = meta

        audio = song.get("audio")
        if audio:
            ok, det = transcode_audio(audio, d, rep, sid)
            rep.step("%s / 音檔轉碼" % sid, ok, det)

    # ---------------- GIMP 批次 PNG->JPG ----------------
    if jpg_jobs:
        log = os.path.join(out_root, "_gimp_jpg.log")
        job = GIMP_JOB % {"jobs": repr(jpg_jobs), "log": log}
        try:
            r, glog = common.gimp_job(job, log, timeout=600)
            made = [d for _, d in jpg_jobs if os.path.exists(d) and os.path.getsize(d) > 500]
            rep.step("GIMP 批次 PNG->JPG", len(made) == len(jpg_jobs),
                     "%d/%d 張  %s" % (len(made), len(jpg_jobs),
                                      (glog or "").strip().replace("\n", " | ")[-160:]))
        except Exception as e:
            rep.step("GIMP 批次 PNG->JPG", False, "%s: %s" % (type(e).__name__, str(e)[:150]))

    with open(os.path.join(out_root, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(metas, f, ensure_ascii=False, indent=2)

    print("")
    print("  產出目錄：%s" % out_root)
    ok = rep.finish()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
