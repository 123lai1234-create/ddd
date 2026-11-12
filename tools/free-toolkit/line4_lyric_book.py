# -*- coding: utf-8 -*-
"""
line4_lyric_book.py — 真實歌詞手冊 PDF 產線
=============================================

把 125 首真實歌詞排成一本可發行的 PDF 手冊（取代 Acrobat / InDesign 的那條路）：

    1. 解析歌詞 txt → 分段
    2. 排版成 HTML（封面頁 + 目錄 + 每首一頁的版面）
    3. Chrome 無頭列印成 PDF（真的排版引擎，不是塞圖片）
    4. Stirling-PDF：合併 → 加頁碼 → 壓縮 → 最終成品

用法：
    python line4_lyric_book.py --limit 10       # 只做前 10 首（測試用）
    python line4_lyric_book.py                  # 全 125 首
    python line4_lyric_book.py --singles-only   # 只產單曲 PDF，不做手冊

實測踩坑：
  - Chrome headless 同一時間只能開一個實例（共用 profile 會報 profile in use）；
    平行跑一定要各自給 --user-data-dir。
  - --print-to-pdf 預設會加頁首頁尾（網址 + 日期），要 --no-pdf-header-footer。
  - 圖片用 file:// 絕對路徑載入會被擋，改成 base64 data URI 內嵌最穩。
  - 目錄頁碼要先知道每首歌幾頁：先逐首出 PDF 量頁數，再回頭組手冊。
"""

from __future__ import print_function

import argparse
import base64
import io
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common      # noqa: E402
import lyrics as LY  # noqa: E402
import line4_pdf_batch as L4   # noqa: E402  Stirling 操作

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]
OUT_NAME = "line4_lyric_book"
BRAND = "donttalk"
BRAND_CN = "不說"


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    raise RuntimeError("找不到 Chrome / Edge：" + " / ".join(CHROME_CANDIDATES))


def file_url(path):
    return "file:///" + urllib.parse.quote(path.replace("\\", "/").lstrip("/"))


# ------------------------------------------------------------------- 素材
def load_manifest():
    mpath = os.path.join(common.DATA_DIR, "songs.json")
    data = common.load_json(mpath, {"songs": []})
    rel = data.get("music_dir") or ""
    base = os.path.dirname(os.path.abspath(mpath))
    music_dir = os.path.normpath(os.path.join(base, rel.replace("/", os.sep)))
    return data.get("songs", []), music_dir


def banner_for(song, music_dir):
    """挑一張最能代表這首歌的圖：真實封面 > 橫式卡片 > 方形卡片。"""
    cands = []
    cover = song.get("cover")
    if cover:
        cands.append(os.path.join(music_dir, cover.replace("/", os.sep)))
    cards = os.path.join(common.OUT_ROOT, "line3_cards", song["id"])
    cands += [os.path.join(cards, n) for n in ("yt_1280x720.jpg", "square_1080.jpg")]
    slug = re.sub(r"[^\w-]+", "-", song["id"], flags=re.UNICODE).strip("-")
    cands += [os.path.join(music_dir, "cards", slug, n)
              for n in ("yt-1280x720.jpg", "share-card.jpg", "square-1080.jpg")]
    for p in cands:
        if p and os.path.exists(p) and os.path.getsize(p) > 0:
            return p
    return None


def data_uri(path):
    if not path:
        return ""
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime = "image/png" if ext == "png" else "image/jpeg"
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode("ascii"))


# ------------------------------------------------------------------- HTML
CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Microsoft JhengHei", "Microsoft JhengHei UI", "Microsoft YaHei", sans-serif;
  color: #1b1f27;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page { width: 210mm; min-height: 297mm; padding: 0 0 18mm 0; position: relative; }
.cover {
  width: 210mm; height: 297mm;
  background: linear-gradient(150deg, #0d1224 0%, #16213c 55%, #101820 100%);
  color: #fff; padding: 34mm 22mm; display: flex; flex-direction: column; justify-content: space-between;
}
.cover .eyebrow { font-size: 11pt; letter-spacing: .35em; color: #7fd1ff; margin-bottom: 8mm; }
.cover h1 { font-size: 34pt; line-height: 1.25; margin: 0 0 6mm 0; font-weight: 700; }
.cover .sub { font-size: 13pt; color: #c6d2e0; line-height: 1.9; }
.cover .foot {
  font-size: 10pt; color: #8fa0b4; border-top: .3mm solid rgba(255,255,255,.25);
  padding-top: 6mm; display: flex; justify-content: space-between;
}
.toc { padding: 22mm 20mm 20mm 20mm; break-after: page; }
.toc-last { break-after: auto; }
.toc h2 { font-size: 16pt; margin: 0 0 8mm 0; letter-spacing: .1em; }
.toc ol { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 12mm; font-size: 9.5pt; }
.toc li { break-inside: avoid; margin: 0 0 2.2mm 0; padding-left: 7mm; text-indent: -7mm; line-height: 1.55; }
.toc .no { display: inline-block; width: 7mm; color: #8a97a8; }
.toc .pg { float: right; color: #8a97a8; }
.song { break-before: page; padding: 0 20mm 0 20mm; }
.hero {
  position: relative; width: 170mm; height: 56mm; margin: 0 0 9mm 0;
  border-radius: 2mm; overflow: hidden; background: #101820;
}
.hero-img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }
.hero-veil {
  position: absolute; left: 0; right: 0; top: 0; bottom: 0;
  background: linear-gradient(180deg, rgba(10,14,24,0) 45%, rgba(10,14,24,.55) 100%);
}
.head { margin: 0 0 0 0; border-bottom: .5mm solid #dfe3e9; padding-bottom: 5mm; }
.head .no { font-size: 9pt; color: #97a2b0; letter-spacing: .25em; }
.head h1 { font-size: 24pt; margin: 2mm 0 1.5mm 0; font-weight: 700; }
.head .artist { font-size: 10.5pt; color: #6d7889; }
.hook {
  margin: 6mm 0 0 0; padding: 4mm 5mm; border-left: 1.2mm solid var(--c1);
  background: #f5f7fa; font-size: 12pt; line-height: 1.7; color: #333b47;
}
.sect { margin-top: 7mm; }
.sect .label {
  display: inline-block; font-size: 8.5pt; letter-spacing: .22em; color: #fff;
  background: var(--c1); padding: 1.2mm 3mm; border-radius: 1mm; margin-bottom: 3mm;
}
.sect p { font-size: 11.5pt; line-height: 2.0; margin: 0 0 1.5mm 0; letter-spacing: .02em; }
.song .foot { margin-top: 10mm; padding-top: 3mm; font-size: 8.5pt; color: #a8b1bd;
        border-top: .3mm solid #e7eaee; }
"""


def song_html(song, parsed, banner, idx, page_no):
    c1 = song.get("color1") or "#E8A33D"
    c2 = song.get("color2") or "#101820"
    artist = song.get("artist") or BRAND_CN
    title = parsed.get("title") or song.get("title") or ""

    parts = []
    if banner:
        parts.append('<div class="hero"><img class="hero-img" src="%s">'
                     '<div class="hero-veil"></div></div>' % data_uri(banner))
    parts.append('<div class="head"><div class="no">%s</div><h1>%s</h1>'
                 '<div class="artist">%s · %s</div></div>'
                 % (idx, title, artist, BRAND))

    # hook 抽言：如果剛好等於第一句歌詞就不重複貼了
    lines = parsed.get("lines") or []
    hook = parsed.get("hook") or ""
    if hook and (not lines or hook != lines[0]):
        parts.append('<div class="hook">%s</div>' % hook)

    for sec in parsed["sections"]:
        if not sec["lines"]:
            continue
        label = sec["label"] or LY.KIND_LABEL.get(sec["kind"], "歌詞")
        body = "".join("<p>%s</p>" % ln for ln in sec["lines"])
        parts.append('<div class="sect"><span class="label">%s</span>%s</div>'
                     % (label, body))
    parts.append('<div class="foot">%s · %s · %s</div>' % (BRAND, BRAND_CN, idx))
    return ('<section class="song" style="--c1:%s;--c2:%s">%s</section>'
            % (c1, c2, "".join(parts)))


def cover_html(count, date_str):
    return """<div class="cover">
  <div>
    <div class="eyebrow">%s</div>
    <h1>歌詞手冊<br/>Lyrics Booklet</h1>
    <div class="sub">%d 首作品・完整歌詞<br/>%s</div>
  </div>
  <div class="foot"><span>%s</span><span>%s</span><span>%s</span></div>
</div>""" % (BRAND.upper(), count, date_str, BRAND, BRAND_CN, date_str)


def toc_html(items, per_page=63):
    """目錄分塊輸出：一頁一塊，讓瀏覽器在單頁內平衡欄位。

    整份目錄放一個 .toc 的話，Chrome 會把它當成跨頁的 multicolumn，
    欄位會一路填到頁底，蓋掉 Stirling 打的頁碼。切成每頁一塊就不會。
    """
    out = []
    total = len(items)
    chunks = [items[i:i + per_page] for i in range(0, total, per_page)] or [[]]
    for n, chunk in enumerate(chunks):
        lis = []
        for no, title, page in chunk:
            lis.append('<li><span class="no">%s</span>%s<span class="pg">%d</span></li>'
                       % (no, title, page))
        head = "目錄" if n == 0 else "目錄（續）"
        cls = "toc" if n < len(chunks) - 1 else "toc toc-last"
        out.append('<div class="%s"><h2>%s</h2><ol>%s</ol></div>'
                   % (cls, head, "".join(lis)))
    return "".join(out)


def wrap_html(body):
    return ("<!DOCTYPE html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\">"
            "<title>donttalk 歌詞手冊</title><style>%s</style></head>"
            "<body>%s</body></html>" % (CSS, body))


# ------------------------------------------------------------------ Chrome
def chrome_print(html_path, pdf_path, profile_dir, timeout=180):
    """Chrome 無頭列印成 PDF。"""
    cmd = [find_chrome(),
           "--headless=new", "--disable-gpu", "--no-sandbox",
           "--no-first-run", "--no-default-browser-check",
           "--disable-extensions", "--disable-sync",
           "--no-pdf-header-footer",
           "--virtual-time-budget=12000",
           "--user-data-dir=" + profile_dir,
           "--print-to-pdf=" + pdf_path,
           file_url(html_path)]
    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
        raise RuntimeError("Chrome 沒產出 PDF（exit=%d）：%s"
                           % (r.returncode, (r.stderr or "")[-300:]))
    return os.path.getsize(pdf_path)


# ----------------------------------------------------------------- 主流程
def main(argv=None):
    ap = argparse.ArgumentParser(description="真實歌詞手冊 PDF 產線")
    ap.add_argument("--limit", type=int, default=0, help="只做前 N 首（0 = 全部）")
    ap.add_argument("--out", default=None, help="產出根目錄（預設 out/line4_lyric_book）")
    ap.add_argument("--singles-only", action="store_true", help="只產單曲 PDF")
    ap.add_argument("--workers", type=int, default=4, help="Chrome 平行數")
    args = ap.parse_args(argv)

    common.header("Line 4+ — 真實歌詞手冊 PDF 產線")
    songs, music_dir = load_manifest()
    if args.limit:
        songs = songs[:args.limit]
    if not songs:
        print("[ERROR] manifest 沒有曲目")
        return 2
    if not os.path.isdir(music_dir):
        print("[ERROR] 音樂資料夾不存在：%s" % music_dir)
        return 2

    out_root = os.path.abspath(args.out) if args.out else common.out_dir(OUT_NAME)
    html_dir = os.path.join(out_root, "html")
    single_dir = os.path.join(out_root, "single")
    prof_dir = os.path.join(out_root, "_chrome")
    for d in (out_root, html_dir, single_dir, prof_dir):
        os.makedirs(d, exist_ok=True)

    date_str = time.strftime("%Y-%m-%d")
    chrome = find_chrome()
    print("Chrome：%s" % chrome)
    print("曲目：%d 首" % len(songs))

    L4.ensure_service()

    # ---- Pass 1：逐首出 PDF，量頁數
    from concurrent.futures import ThreadPoolExecutor

    parsed_list = []
    for i, s in enumerate(songs, 1):
        p = LY.parse_file(os.path.join(music_dir, s["id"] + ".txt"),
                          re.sub(r"^\d+[-_]", "", s["id"]))
        parsed_list.append((i, s, p))

    rep = common.Report("line4_lyric_book 產出驗證")
    singles = []

    def build_one(job):
        idx, s, parsed = job
        slug = re.sub(r"[^\w-]+", "-", s["id"], flags=re.UNICODE).strip("-")
        banner = banner_for(s, music_dir)
        html = wrap_html(song_html(s, parsed, banner, "%02d" % idx, ""))
        hp = os.path.join(html_dir, "%02d_%s.html" % (idx, slug))
        pp = os.path.join(single_dir, "%02d_%s.pdf" % (idx, slug))
        with io.open(hp, "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
        prof = os.path.join(prof_dir, "%02d" % idx)
        os.makedirs(prof, exist_ok=True)
        size = chrome_print(hp, pp, prof)
        pages = L4.pdf_pages(pp)[0]
        return {"idx": idx, "id": s["id"], "slug": slug, "song": s, "parsed": parsed,
                "html": hp, "pdf": pp, "pages": pages, "size": size}

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        for res in ex.map(build_one, parsed_list):
            singles.append(res)
            rep.step("%02d %s" % (res["idx"], res["id"]), True,
                     "%d 頁 / %.1f KB" % (res["pages"], res["size"] / 1024.0))
    print("\n單曲 PDF 完成：%d 首 / %.0f 秒" % (len(singles), time.time() - t0))

    index = [{"idx": r["idx"], "id": r["id"], "title": r["song"].get("title"),
              "pages": r["pages"], "pdf": os.path.basename(r["pdf"])} for r in singles]
    common.dump_json({"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "songs": index},
                      os.path.join(out_root, "singles-index.json"))

    if args.singles_only:
        return 0 if rep.finish() else 1

    # ---- Pass 2：組手冊（封面 + 目錄 + 全部曲目）
    total_song_pages = sum(r["pages"] for r in singles)
    toc_pages = 3
    book = None
    for attempt in range(4):
        items = []
        cursor = 1 + toc_pages  # 封面 1 頁 + 目錄 toc_pages 頁
        for r in singles:
            items.append(("%02d" % r["idx"], r["song"].get("title") or r["id"], cursor))
            cursor += r["pages"]
        body = cover_html(len(singles), date_str) + toc_html(items)
        for r in singles:
            body += song_html(r["song"], r["parsed"], banner_for(r["song"], music_dir),
                              "%02d" % r["idx"], "")
        hp = os.path.join(out_root, "lyric_book.html")
        pp = os.path.join(out_root, "lyric_book_all.pdf")
        with io.open(hp, "w", encoding="utf-8", newline="\n") as f:
            f.write(wrap_html(body))
        prof = os.path.join(prof_dir, "book")
        os.makedirs(prof, exist_ok=True)
        size = chrome_print(hp, pp, prof, timeout=600)
        actual = L4.pdf_pages(pp)[0]
        expect = 1 + toc_pages + total_song_pages
        print("  手冊組版第 %d 次：實際 %d 頁 / 預期 %d 頁" % (attempt + 1, actual, expect))
        if actual == expect:
            book = pp
            break
        toc_pages = max(1, actual - 1 - total_song_pages)
    if book is None:
        print("[WARN] 手冊頁數無法收斂，使用最後一次結果")
        book = os.path.join(out_root, "lyric_book_all.pdf")

    # ---- Stirling：加頁碼 → 壓縮（真正的成品）
    numbered = os.path.join(out_root, "lyric_book_numbered.pdf")
    final = os.path.join(out_root, "lyric_book.pdf")
    L4.add_page_numbers(book, numbered, position=8, start=1)
    before, after, ratio = L4.compress_pdf(numbered, final, level=5)
    print("")
    print("手冊：%s" % book)
    print("  原始 %d bytes / %d 頁" % (os.path.getsize(book), L4.pdf_pages(book)[0]))
    print("  加頁碼 %d bytes" % os.path.getsize(numbered))
    print("  壓縮後 %d bytes（%.1f%%，壓掉 %.1f%%）"
          % (after, ratio * 100, (1 - ratio) * 100))

    rep.step("lyric_book.pdf（最終成品）", os.path.exists(final),
             "%d bytes / %d 頁" % (os.path.getsize(final), L4.pdf_pages(final)[0]))

    shutil.rmtree(prof_dir, ignore_errors=True)
    return 0 if rep.finish() else 1


if __name__ == "__main__":
    sys.exit(main())
