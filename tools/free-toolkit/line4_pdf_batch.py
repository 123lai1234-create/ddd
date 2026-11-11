#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Line 4 — PDF 批次產線（Stirling-PDF 3.2.2 REST API）
===================================================

七個子命令，每個都能單獨跑、可重複執行（輸出覆寫、不報錯）：
    images     圖片批次轉 PDF（all_images.pdf + img_<name>.pdf）
    merge      樣本 PDF 合併成 merged_all.pdf
    split      拆成單頁 split_<name>_p01.pdf ...
    watermark  加文字浮水印
    compress   壓縮並回報前後位元組數與比率
    pages      加頁碼
    info       印出每個 PDF 的頁數 / 大小表格
    raster     PDF 轉 PNG（額外，用 /api/v1/convert/pdf/img）
    all        依序跑上面全部

素材來源：data/pdf_samples/（有就用，沒有就自己用 FFmpeg 生 PNG 再轉 PDF），
所以這支腳本永遠可獨立執行、可被驗收。

Stirling-PDF 3.2.2 實測踩坑（照抄錯的參數就 400/500）：
  1. multipart 欄位名固定是 fileInput，而且要帶 filename，否則 400。
  2. 合併多檔要用多個同名字段的 tuple：
     files=[("fileInput",(...)), ("fileInput",(...))]。
  3. 成功回應是二進位（PDF / ZIP），不是 JSON；失敗才回 JSON，看 resp.text。
  4. split-pages 的 pageNumbers 是「切割點」不是「抽哪幾頁」：
     "2" => (1-2, 3+)；N 頁要切單頁要傳 "1,2,...,N-1"。回應是 ZIP。
  5. add-watermark 少 alphabet 或 customColor 會 NPE 500；
     alphabet 必須用 roman（arabic 是 NotoSansArabic，沒有拉丁字母）。
  6. get-info-on-pdf 回 JSON，頁數在 BasicInfo["Number of pages"]。
  7. /api/v1/misc/ocr-pdf 在這版是 403 disabled（語言包未啟用）。
"""

from __future__ import print_function

import argparse
import io
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common  # noqa: E402  共用層（只讀，不修改）

API = common.TOOLS["stirling"]
OUT_DIR = common.out_dir("line4_pdf")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff")
TIMEOUT = 180


# --------------------------------------------------------------- Stirling 連線
def ensure_service(wait=60):
    """確認 Stirling-PDF 在跑；不在就照預設路徑啟動，最多等 wait 秒。"""
    try:
        requests.get(API + "/", timeout=5)
        return "已在線"
    except Exception:
        pass

    java = r"C:\Program Files\Stirling PDF\runtime\jre\bin\java.exe"
    jar = r"C:\Program Files\Stirling PDF\libs\stirling-pdf-3.2.2.jar"
    work = r"D:\Tools\stirling-pdf\work"
    if not (os.path.exists(java) and os.path.exists(jar)):
        raise RuntimeError("Stirling-PDF 未回應 %s，且找不到 jar：%s" % (API, jar))

    # -WorkingDirectory 不能省，否則 configs/ logs/ pipeline/ 會灑在專案資料夾裡
    subprocess.Popen(
        [java, "-Xmx2g", "-DBROWSER_OPEN=false", "-Dserver.port=8080",
         "-Dsecurity.enableLogin=false", "-jar", jar],
        cwd=work,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))

    deadline = time.time() + wait
    while time.time() < deadline:
        try:
            requests.get(API + "/", timeout=5)
            return "已啟動"
        except Exception:
            time.sleep(2)
    raise RuntimeError("等 %d 秒後 Stirling-PDF 仍未回應：%s" % (wait, API))


def api(path, files=None, data=None, timeout=TIMEOUT):
    """POST 一個 multipart 請求；HTTP >= 400 直接拋出可讀錯誤。"""
    r = requests.post(API + path, files=files or [], data=data or {}, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError("%s -> HTTP %s：%s" % (
            path, r.status_code, r.text[:300].replace("\n", " ")))
    return r


def write_bytes(path, blob):
    with open(path, "wb") as f:
        f.write(blob)
    return os.path.getsize(path)


def pdf_pages(path):
    """用 get-info-on-pdf 讀真實頁數；壞檔會直接炸，不回傳假數字。"""
    with open(path, "rb") as f:
        r = api("/api/v1/security/get-info-on-pdf",
                files=[("fileInput", (os.path.basename(path), f, "application/pdf"))])
    info = json.loads(r.content.decode("utf-8"))
    return int(info["BasicInfo"]["Number of pages"]), info


def pdf_info_row(path):
    """回 (頁數, 位元組數) ；讀不到頁數就回 (None, size)。"""
    size = os.path.getsize(path)
    try:
        pages, _ = pdf_pages(path)
    except Exception as e:
        print("    ! 讀不到 %s 的頁數：%s" % (os.path.basename(path), e))
        pages = None
    return pages, size


# --------------------------------------------------------------- 樣本素材
def samples_dir(explicit=None):
    """素材目錄：--samples > data/pdf_samples（有的話）> out/line4_pdf/samples。"""
    if explicit:
        os.makedirs(explicit, exist_ok=True)
        return os.path.abspath(explicit)
    shared = os.path.join(common.DATA_DIR, "pdf_samples")
    if os.path.isdir(shared) and os.listdir(shared):
        return os.path.abspath(shared)
    own = os.path.join(OUT_DIR, "samples")
    os.makedirs(own, exist_ok=True)
    return os.path.abspath(own)


def list_files(d, exts):
    return sorted(os.path.join(d, n) for n in os.listdir(d)
                  if n.lower().endswith(exts) and
                  os.path.isfile(os.path.join(d, n)))


def make_sample_images(d):
    """沒有素材就用 FFmpeg 生三張測試圖（不同尺寸，方便驗證 fitOption）。"""
    ff = common.tool("ffmpeg")
    specs = [("sample_a", "testsrc2=size=640x480:rate=1"),
             ("sample_b", "color=c=0x0f766e:size=640x480"),
             ("sample_c", "color=c=0xb45309:size=400x800")]
    made = []
    for name, src in specs:
        out = os.path.join(d, name + ".png")
        if os.path.exists(out) and os.path.getsize(out) > 0:
            made.append(out)
            continue
        r = common.run([ff, "-y", "-f", "lavfi", "-i", src, "-frames:v", "1", out],
                       timeout=120)
        if r.returncode == 0 and os.path.exists(out):
            made.append(out)
        else:
            print("    ! FFmpeg 產生 %s 失敗：%s" % (name, (r.stderr or "")[-200:]))
    return made


def images_to_pdf(src_png, dst_pdf, color="color"):
    """單張圖轉 PDF（/api/v1/convert/img/pdf）。"""
    with open(src_png, "rb") as f:
        r = api("/api/v1/convert/img/pdf",
                files=[("fileInput", (os.path.basename(src_png), f, "image/png"))],
                data={"fitOption": "maintainAspectRatio", "colorType": color,
                      "autoRotate": "true"})
    return write_bytes(dst_pdf, r.content)


def ensure_samples(d, need_pdf=True):
    """確保素材目錄有圖（沒有就生成）與 PDF（沒有就用 Stirling 轉）。"""
    imgs = list_files(d, IMG_EXT)
    if not imgs:
        print("  · 素材目錄沒有圖，用 FFmpeg 產生測試圖")
        imgs = make_sample_images(d)
    pdfs = list_files(d, (".pdf",))
    if need_pdf and not pdfs:
        print("  · 素材目錄沒有 PDF，用 Stirling 把圖轉成 PDF")
        for im in imgs:
            dst = os.path.join(d, os.path.splitext(os.path.basename(im))[0] + ".pdf")
            images_to_pdf(im, dst)
            pdfs.append(dst)
    return imgs, pdfs


def default_input_pdf(args, d):
    """split / watermark / compress / pages 的預設輸入：有 merged_all 就用，否則即時合併。"""
    if getattr(args, "pdf", None):
        p = args.pdf
        if not os.path.isabs(p):
            for cand in (os.path.join(d, p), os.path.join(OUT_DIR, p),
                         os.path.join(os.getcwd(), p)):
                if os.path.isfile(cand):
                    return os.path.abspath(cand)
        if os.path.isfile(p):
            return os.path.abspath(p)
        raise RuntimeError("找不到輸入 PDF：%s" % args.pdf)

    merged = os.path.join(OUT_DIR, "merged_all.pdf")
    if os.path.isfile(merged):
        return merged
    _, pdfs = ensure_samples(d)
    if not pdfs:
        raise RuntimeError("沒有可用的 PDF 素材")
    return merge_pdfs(pdfs, merged)


# --------------------------------------------------------------- 核心操作
def merge_pdfs(pdf_paths, dst):
    """合併多個 PDF 成一個（多個同名字段 fileInput）。回傳輸出路徑。"""
    files = []
    for p in pdf_paths:
        files.append(("fileInput", (os.path.basename(p), open(p, "rb"), "application/pdf")))
    try:
        r = api("/api/v1/general/merge-pdfs", files=files,
                data={"sortType": "orderProvided", "removeCertSign": "false"})
    finally:
        for _, tup in files:
            try:
                tup[1].close()
            except Exception:
                pass
    write_bytes(dst, r.content)
    return dst


def split_pdf(src, dst_prefix):
    """拆成單頁；回傳 [(輸出路徑, 位元組數)]。split-points 語意見模組 docstring。"""
    pages, _ = pdf_pages(src)
    stem = os.path.splitext(os.path.basename(src))[0]
    outs = []
    if pages <= 1:
        dst = "%s_p01.pdf" % dst_prefix
        shutil.copyfile(src, dst)
        return [(dst, os.path.getsize(dst))]

    with open(src, "rb") as f:
        r = api("/api/v1/general/split-pages",
                files=[("fileInput", (os.path.basename(src), f, "application/pdf"))],
                data={"pageNumbers": ",".join(str(i) for i in range(1, pages))})
    blob = r.content
    if blob[:2] != b"PK":
        raise RuntimeError("split-pages 回的不是 ZIP：%r" % blob[:8])

    z = zipfile.ZipFile(io.BytesIO(blob))
    entries = sorted(z.namelist(), key=lambda n: _trailing_int(n))
    for i, name in enumerate(entries, 1):
        dst = "%s_p%02d.pdf" % (dst_prefix, i)
        outs.append((dst, write_bytes(dst, z.read(name))))
    return outs


def _trailing_int(name):
    digits = ""
    for ch in reversed(name):
        if ch.isdigit():
            digits = ch + digits
        else:
            break
    return int(digits) if digits else 0


def add_watermark(src, dst, text="DRAFT", color="#FF0000", size=48, rotation=45,
                  opacity=0.3):
    """加文字浮水印。alphabet 必須 roman（arabic 沒有拉丁字母字形）。"""
    with open(src, "rb") as f:
        r = api("/api/v1/security/add-watermark",
                files=[("fileInput", (os.path.basename(src), f, "application/pdf"))],
                data={"watermarkType": "text", "watermarkText": text,
                      "alphabet": "roman", "customColor": color,
                      "convertPDFToImage": "false", "fontSize": str(size),
                      "rotation": str(rotation), "opacity": str(opacity),
                      "widthSpacer": "50", "heightSpacer": "50"})
    return write_bytes(dst, r.content)


def compress_pdf(src, dst, level=5):
    """壓縮；回傳 (原大小, 新大小, 比率)。"""
    before = os.path.getsize(src)
    target = max(1, before // 2)
    expected = "%dKB" % max(1, target // 1024) if target < 1024 * 1024 \
        else "%.1fMB" % (target / (1024.0 * 1024.0))
    with open(src, "rb") as f:
        r = api("/api/v1/misc/compress-pdf",
                files=[("fileInput", (os.path.basename(src), f, "application/pdf"))],
                data={"optimizeLevel": str(level), "expectedOutputSize": expected,
                      "linearize": "false", "normalize": "false", "grayscale": "false"})
    after = write_bytes(dst, r.content)
    return before, after, (after / float(before) if before else 0.0)


def add_page_numbers(src, dst, position=8, start=1, size=12, custom_text=None):
    """加頁碼（position 1-9：1=左上 5=正中 9=右下）。"""
    data = {"pageNumbers": "all", "fontSize": str(size), "fontType": "helvetica",
            "position": str(position), "startingNumber": str(start),
            "fontColor": "#000000"}
    if custom_text:
        data["customText"] = custom_text
    with open(src, "rb") as f:
        r = api("/api/v1/misc/add-page-numbers",
                files=[("fileInput", (os.path.basename(src), f, "application/pdf"))],
                data=data)
    return write_bytes(dst, r.content)


def pdf_to_images(src, dst_prefix, dpi=72):
    """PDF 轉 PNG（回應是 ZIP）。回傳 [(路徑, 位元組數)]。"""
    with open(src, "rb") as f:
        r = api("/api/v1/convert/pdf/img",
                files=[("fileInput", (os.path.basename(src), f, "application/pdf"))],
                data={"pageNumbers": "all", "imageFormat": "png",
                      "singleOrMultiple": "multiple", "colorType": "color",
                      "dpi": str(dpi)})
    blob = r.content
    if blob[:2] != b"PK":
        raise RuntimeError("pdf/img 回的不是 ZIP：%r" % blob[:8])
    z = zipfile.ZipFile(io.BytesIO(blob))
    outs = []
    for i, name in enumerate(sorted(z.namelist(), key=_trailing_int), 1):
        dst = "%s_p%02d.png" % (dst_prefix, i)
        outs.append((dst, write_bytes(dst, z.read(name))))
    return outs


# --------------------------------------------------------------- 子命令
def cmd_images(args):
    d = samples_dir(args.samples)
    imgs, _ = ensure_samples(d, need_pdf=False)
    if not imgs:
        raise RuntimeError("沒有可轉換的圖片")
    rep = common.Report("images：圖片批次轉 PDF")
    made = []
    for im in imgs:
        stem = os.path.splitext(os.path.basename(im))[0]
        dst = os.path.join(OUT_DIR, "img_%s.pdf" % stem)
        try:
            n = images_to_pdf(im, dst)
            made.append(dst)
            rep.step("img_%s.pdf" % stem, True, "%d bytes / %d 頁" % (
                n, pdf_pages(dst)[0]))
        except Exception as e:
            rep.step("img_%s.pdf" % stem, False, str(e))
    if len(made) >= 2:
        dst = os.path.join(OUT_DIR, "all_images.pdf")
        try:
            merge_pdfs(made, dst)
            rep.step("all_images.pdf", True, "%d bytes / %d 頁" % (
                os.path.getsize(dst), pdf_pages(dst)[0]))
        except Exception as e:
            rep.step("all_images.pdf", False, str(e))
    elif made:
        shutil.copyfile(made[0], os.path.join(OUT_DIR, "all_images.pdf"))
        rep.step("all_images.pdf", True, "只有 1 張圖，直接複製")
    return rep.finish()


def cmd_merge(args):
    d = samples_dir(args.samples)
    _, pdfs = ensure_samples(d)
    if not pdfs:
        raise RuntimeError("沒有可合併的 PDF 素材")
    dst = os.path.join(OUT_DIR, "merged_all.pdf")
    merge_pdfs(pdfs, dst)
    rep = common.Report("merge：合併 %d 個 PDF" % len(pdfs))
    rep.step("merged_all.pdf", True, "%d bytes / %d 頁" % (
        os.path.getsize(dst), pdf_pages(dst)[0]))
    return rep.finish()


def cmd_split(args):
    d = samples_dir(args.samples)
    src = default_input_pdf(args, d)
    stem = os.path.splitext(os.path.basename(src))[0]
    prefix = os.path.join(OUT_DIR, "split_%s" % stem)
    outs = split_pdf(src, prefix)
    rep = common.Report("split：%s -> %d 個單頁 PDF" % (os.path.basename(src), len(outs)))
    for path, size in outs:
        rep.step(os.path.basename(path), True, "%d bytes / %d 頁" % (
            size, pdf_pages(path)[0]))
    return rep.finish()


def cmd_watermark(args):
    d = samples_dir(args.samples)
    src = default_input_pdf(args, d)
    stem = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(OUT_DIR, "watermarked_%s.pdf" % stem)
    text = getattr(args, "text", None) or "DRAFT"
    add_watermark(src, dst, text=text, color=getattr(args, "color", "#FF0000"))
    rep = common.Report("watermark：浮水印「%s」" % text)
    rep.step(os.path.basename(dst), True, "%d bytes / %d 頁" % (
        os.path.getsize(dst), pdf_pages(dst)[0]))
    return rep.finish()


def cmd_compress(args):
    d = samples_dir(args.samples)
    src = default_input_pdf(args, d)
    stem = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(OUT_DIR, "compressed_%s.pdf" % stem)
    before, after, ratio = compress_pdf(src, dst, level=getattr(args, "level", 5))
    rep = common.Report("compress：level=%d" % getattr(args, "level", 5))
    rep.step(os.path.basename(dst), True,
             "%d -> %d bytes（%.1f%%，壓縮掉 %.1f%%）" % (
                 before, after, ratio * 100, (1 - ratio) * 100))
    return rep.finish()


def cmd_pages(args):
    d = samples_dir(args.samples)
    src = default_input_pdf(args, d)
    stem = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(OUT_DIR, "numbered_%s.pdf" % stem)
    add_page_numbers(src, dst, position=getattr(args, "position", 8),
                     start=getattr(args, "start", 1))
    rep = common.Report("pages：加頁碼")
    rep.step(os.path.basename(dst), True, "%d bytes / %d 頁" % (
        os.path.getsize(dst), pdf_pages(dst)[0]))
    return rep.finish()


def cmd_info(args):
    pdfs = list_files(OUT_DIR, (".pdf",))
    if not pdfs:
        print("out/line4_pdf/ 還沒有 PDF，先跑 images / merge")
        return False
    rows = []
    for p in pdfs:
        pages, size = pdf_info_row(p)
        rows.append((os.path.basename(p), pages, size))
    w = max(len(r[0]) for r in rows)
    print("")
    print("=" * (w + 30))
    print("%-*s  %6s  %12s" % (w, "檔案", "頁數", "位元組數"))
    print("-" * (w + 30))
    for name, pages, size in rows:
        print("%-*s  %6s  %12d" % (w, name, pages if pages is not None else "?", size))
    print("=" * (w + 30))
    print("共 %d 個 PDF" % len(rows))
    return True


def cmd_raster(args):
    d = samples_dir(args.samples)
    src = default_input_pdf(args, d)
    stem = os.path.splitext(os.path.basename(src))[0]
    prefix = os.path.join(OUT_DIR, "raster_%s" % stem)
    outs = pdf_to_images(src, prefix, dpi=getattr(args, "dpi", 72))
    rep = common.Report("raster：PDF -> PNG")
    for path, size in outs:
        rep.step(os.path.basename(path), True, "%d bytes" % size)
    return rep.finish()


def cmd_all(args):
    ok = True
    for fn in (cmd_images, cmd_merge, cmd_split, cmd_watermark,
               cmd_compress, cmd_pages, cmd_raster):
        common.header(fn.__name__)
        ok = fn(args) and ok
    common.header("info")
    ok = cmd_info(args) and ok
    return ok


# --------------------------------------------------------------- CLI
def build_parser():
    p = argparse.ArgumentParser(
        prog="line4_pdf_batch.py",
        description="PDF 批次產線（Stirling-PDF REST API）")
    p.add_argument("--samples", default=None,
                   help="素材目錄（預設 data/pdf_samples，沒有則用 out/line4_pdf/samples）")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("images", help="圖片批次轉 PDF")
    sub.add_parser("merge", help="合併 PDF")
    sp = sub.add_parser("split", help="拆成單頁 PDF")
    sp.add_argument("--pdf", default=None, help="要拆的 PDF（預設 merged_all.pdf）")
    sw = sub.add_parser("watermark", help="加文字浮水印")
    sw.add_argument("--pdf", default=None, help="輸入 PDF（預設 merged_all.pdf）")
    sw.add_argument("--text", default=None, help="浮水印文字（預設 DRAFT）")
    sw.add_argument("--color", default="#FF0000", help="浮水印顏色（預設 #FF0000）")
    sc = sub.add_parser("compress", help="壓縮 PDF")
    sc.add_argument("--pdf", default=None, help="輸入 PDF（預設 merged_all.pdf）")
    sc.add_argument("--level", type=int, default=5, help="optimizeLevel 1-9（預設 5）")
    sn = sub.add_parser("pages", help="加頁碼")
    sn.add_argument("--pdf", default=None, help="輸入 PDF（預設 merged_all.pdf）")
    sn.add_argument("--position", type=int, default=8, help="位置 1-9（預設 8 右下）")
    sn.add_argument("--start", type=int, default=1, help="起始頁碼（預設 1）")
    sr = sub.add_parser("raster", help="PDF 轉 PNG")
    sr.add_argument("--pdf", default=None, help="輸入 PDF（預設 merged_all.pdf）")
    sr.add_argument("--dpi", type=int, default=72, help="DPI（預設 72）")
    sub.add_parser("info", help="印出 PDF 頁數/大小表格")
    sub.add_parser("all", help="依序跑所有子命令")

    for s in sub.choices.values():
        # SUPPRESS：沒帶 --samples 時不要覆蓋上層解析出來的值
        s.add_argument("--samples", default=argparse.SUPPRESS,
                       help="素材目錄（覆寫全域設定）")
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.cmd:
        parser.print_help()
        return 2

    handlers = {"images": cmd_images, "merge": cmd_merge, "split": cmd_split,
                "watermark": cmd_watermark, "compress": cmd_compress,
                "pages": cmd_pages, "info": cmd_info, "raster": cmd_raster,
                "all": cmd_all}
    try:
        common.header("Line 4 · PDF 批次產線 · %s" % args.cmd)
        print("  Stirling-PDF：%s（%s）" % (API, ensure_service()))
        ok = handlers[args.cmd](args)
        return 0 if ok else 1
    except Exception as e:
        print("  [FAIL] %s" % e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
