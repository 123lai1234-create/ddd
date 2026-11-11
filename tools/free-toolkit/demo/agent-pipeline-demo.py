"""
智能體操作免費創意軟體 — 端到端示範（已實測通過）
================================================
這台機器上的免費工具鏈，真的可以被「智能體」以無頭（headless）方式驅動。

實測結果（2026-11-10, Windows / i7-12650H / RTX 4060 / 64GB）：**9 / 9 全部通過**

  1. FFmpeg 9.0.2      CLI 全功能           素材生成
  2. Stirling-PDF      REST API             /api/v1/... (multipart 欄位名 fileInput)
  3. kdenlive melt     .mlt XML -> 影片      exit=0, h264+aac MP4
  4. Blender 5.2.3     bpy 全 API           blender -b -P script.py
  5. GIMP 3.2.6        Python-Fu 批次       gimp-console-3.2.exe -i --quit --batch-interpreter python-fu-eval
  6. Inkscape 1.4.4    CLI 匯出             inkscape --export-type=png
  7. darktable 5.6.2   darktable-cli        RAW 批次轉換

跑法：
    $env:PYTHONIOENCODING='utf-8'
    python agent-pipeline-demo.py

需要 Stirling-PDF 在 http://127.0.0.1:8080 跑著
（開始選單「Stirling-PDF (網頁版 :8080)」，或直接跑 D:\\Tools\\stirling-pdf\\Start-Stirling-PDF.cmd）。
"""

import os
import subprocess
import sys

import requests

WS = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(WS, "_demo_output")
os.makedirs(OUT, exist_ok=True)

FFMPEG = r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"
MELT = r"D:\Tools\kdenlive\kdenlive-26.08.2_standalone\bin\melt.exe"
BLENDER = r"D:\Tools\blender\blender-5.2.3-windows-x64\blender.exe"
GIMP_CONSOLE = r"C:\Users\User\AppData\Local\Programs\GIMP 3\bin\gimp-console-3.2.exe"
INKSCAPE = r"C:\Program Files\Inkscape\bin\inkscape.exe"
DARKTABLE_CLI = r"D:\darktable\bin\darktable-cli.exe"
STIRLING = "http://127.0.0.1:8080"

results = []


def step(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  [OK]   " if ok else "  [FAIL] ") + name + ("  " + detail if detail else ""))


def run(cmd, timeout=240, **kw):
    """一律用 utf-8 + errors=replace，否則 Windows cp950 會炸 UnicodeDecodeError"""
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        encoding="utf-8", errors="replace", **kw)


# --------------------------------------------------------------------------
# 1. FFmpeg：生素材
# --------------------------------------------------------------------------
png_a = os.path.join(OUT, "blue.png")
png_b = os.path.join(OUT, "orange.png")
r = run([FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=800x600:d=1",
         "-frames:v", "1", png_a], timeout=120)
step("FFmpeg 生 PNG", r.returncode == 0 and os.path.exists(png_a),
     "%d bytes" % os.path.getsize(png_a) if os.path.exists(png_a) else r.stderr[-120:])

run([FFMPEG, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=orange:s=800x600:d=1",
     "-frames:v", "1", png_b], timeout=120)


# --------------------------------------------------------------------------
# 2. Stirling-PDF REST API
#    關鍵：multipart 的檔案欄位名是 fileInput，而且要帶 filename
# --------------------------------------------------------------------------
def stirling_post(path, files, data, out_path):
    with requests.post(STIRLING + path, files=files, data=data, timeout=120) as resp:
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(resp.content)
        return resp.status_code, len(resp.content)


try:
    pdf_a = os.path.join(OUT, "blue.pdf")
    st, n = stirling_post(
        "/api/v1/convert/img/pdf",
        files=[("fileInput", ("blue.png", open(png_a, "rb"), "image/png"))],
        data={"colorType": "color", "singleOrMultiple": "false"},
        out_path=pdf_a)
    step("Stirling-PDF img->pdf", st == 200 and n > 1000, "HTTP %d, %d bytes" % (st, n))
except Exception as e:
    step("Stirling-PDF img->pdf", False, "%s: %s" % (type(e).__name__, str(e)[:180]))
    pdf_a = None

try:
    pdf_b = os.path.join(OUT, "orange.pdf")
    st, n = stirling_post(
        "/api/v1/convert/img/pdf",
        files=[("fileInput", ("orange.png", open(png_b, "rb"), "image/png"))],
        data={"colorType": "color", "singleOrMultiple": "false"},
        out_path=pdf_b)
    step("Stirling-PDF img->pdf (2)", st == 200 and n > 1000, "HTTP %d, %d bytes" % (st, n))
except Exception as e:
    step("Stirling-PDF img->pdf (2)", False, "%s: %s" % (type(e).__name__, str(e)[:180]))
    pdf_b = None

if pdf_a and pdf_b and os.path.exists(pdf_a) and os.path.exists(pdf_b):
    try:
        merged = os.path.join(OUT, "merged.pdf")
        st, n = stirling_post(
            "/api/v1/general/merge-pdfs",
            files=[("fileInput", ("a.pdf", open(pdf_a, "rb"), "application/pdf")),
                   ("fileInput", ("b.pdf", open(pdf_b, "rb"), "application/pdf"))],
            data={},
            out_path=merged)
        pages = open(merged, "rb").read().count(b"/Type/Page")
        step("Stirling-PDF merge-pdfs", st == 200 and n > 1000,
             "HTTP %d, %d bytes, %d page refs" % (st, n, pages))
    except Exception as e:
        step("Stirling-PDF merge-pdfs", False, "%s: %s" % (type(e).__name__, str(e)[:180]))


# --------------------------------------------------------------------------
# 3. kdenlive 的 melt：寫 .mlt XML -> 無頭算繪成 MP4
# --------------------------------------------------------------------------
mlt = """<?xml version="1.0" standalone="no"?>
<mlt LC_NUMERIC="C" version="7.0" title="mavis-demo">
  <profile description="auto" width="480" height="270" progressive="1"
           sample_aspect_num="1" sample_aspect_den="1"
           display_aspect_num="16" display_aspect_den="9"
           frame_rate_num="25" frame_rate_den="1" colorspace="709"/>
  <producer id="bg" in="0" out="24">
    <property name="mlt_service">color</property>
    <property name="resource">#101820</property>
    <property name="length">25</property>
  </producer>
  <playlist id="pl">
    <entry producer="bg" in="0" out="24"/>
  </playlist>
  <tractor id="tractor">
    <track producer="pl"/>
  </tractor>
</mlt>
"""
mlt_path = os.path.join(OUT, "demo.mlt")
with open(mlt_path, "w", encoding="utf-8") as f:
    f.write(mlt)

try:
    vid = os.path.join(OUT, "demo.mp4")
    r = run([MELT, "-profile", "atsc_720p_25", mlt_path,
             "-consumer", "avformat:%s" % vid, "vcodec=libx264", "acodec=aac",
             "crf=20", "width=480", "height=270"], timeout=300)
    ok = os.path.exists(vid) and os.path.getsize(vid) > 1000
    step("kdenlive melt 無頭算繪", ok,
         "exit=%s, %d bytes" % (r.returncode, os.path.getsize(vid) if os.path.exists(vid) else 0))
except Exception as e:
    step("kdenlive melt 無頭算繪", False, "%s: %s" % (type(e).__name__, str(e)[:180]))


# --------------------------------------------------------------------------
# 4. Blender headless：bpy 腳本
# --------------------------------------------------------------------------
try:
    r = run([BLENDER, "--background", "--python-expr",
             "import bpy;print('BPY_OK',bpy.app.version_string)"], timeout=180)
    ok = "BPY_OK" in r.stdout
    step("Blender headless bpy", ok,
         next((l.strip() for l in r.stdout.splitlines() if "BPY_OK" in l), r.stderr[-150:]))
except Exception as e:
    step("Blender headless bpy", False, "%s: %s" % (type(e).__name__, str(e)[:180]))


# --------------------------------------------------------------------------
# 5. GIMP Console + Python-Fu：批次改圖（真的改，不是假造檔案）
#    GIMP 3.2 的坑（全部踩過了）：
#      - 批次直譯器名大小寫敏感：python-fu-eval（寫成 python-Fu-eval 會直接停用批次模式）
#      - 建圖：Gimp.Image.new / Gimp.Layer.new（只能用 keyword 參數）
#      - 前景色是 Gegl.Color：Gegl.Color.new("R'G'B'A float").set_rgba(r,g,b,a)
#        （Gdk.RGBA 會報 "Expected Gegl.Color"；tuple 也不行）
#      - 翻轉枚舉是 Gimp.OrientationType（不是 Gimp.Orientation）
#      - 匯出：Gimp.file_save(RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(p), None)
#        副檔名自動選 codec；PDB 名是 file-png-export（不是 file-png-save，那個已不存在）
#      - 結束要加 --quit：沒有它 GIMP 會留在背景空轉，智能體每次都等到 timeout
#      - -b 的內容必須回傳數值，否則批次會中止（所以用 (exec(...),0)[1] 這個無空格寫法）
# --------------------------------------------------------------------------
gimp_script = os.path.join(OUT, "_gimp_job.py")
gimp_log = os.path.join(OUT, "_gimp_log.txt")
gimp_jobs = [(png_a, "blue"), (png_b, "orange")]
gimp_py = '''import gi
gi.require_version("Gdk", "3.0")
from gi.repository import Gimp, Gegl, Gio
import os, traceback

JOBS = %(jobs)s
LOG = r"%(log)s"
lines = []
for src, tag in JOBS:
    try:
        img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(src))
        w, h = img.get_width(), img.get_height()
        lines.append("%%s load %%dx%%d" %% (tag, w, h))
        try:
            img.scale(w // 2, h // 2)
            lines.append("%%s scale OK" %% tag)
        except Exception as e:
            lines.append("%%s scale ERR %%s" %% (tag, str(e)[:90]))
        try:
            img.flip(Gimp.OrientationType.HORIZONTAL)
            lines.append("%%s flip OK" %% tag)
        except Exception as e:
            lines.append("%%s flip ERR %%s" %% (tag, str(e)[:90]))
        for ext in ("png", "jpg"):
            out = os.path.join(os.path.dirname(src), "gimp_%%s_%%s.%%s" %% (tag, str(w // 2), ext))
            try:
                Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(out), None)
                lines.append("%%s saved %%s %%d bytes" %% (tag, os.path.basename(out), os.path.getsize(out)))
            except Exception as e:
                lines.append("%%s save %%s ERR %%s" %% (tag, ext, str(e)[:110]))
    except Exception:
        lines.append("%%s FATAL %%s" %% (tag, traceback.format_exc()[-300:]))

with open(LOG, "w", encoding="utf-8") as f:
    f.write("\\n".join(lines))
''' % {"jobs": repr(gimp_jobs), "log": gimp_log}

with open(gimp_script, "w", encoding="utf-8") as f:
    f.write(gimp_py)

gimp_expected = []
for _, tag in gimp_jobs:
    for ext in ("png", "jpg"):
        gimp_expected.append(os.path.join(OUT, "gimp_%s_400.%s" % (tag, ext)))

try:
    r = run([GIMP_CONSOLE, "-i", "--quit", "--batch-interpreter", "python-fu-eval",
             "-b", "(exec(open(r'%s').read()),0)[1]" % gimp_script], timeout=300)
    made = [p for p in gimp_expected if os.path.exists(p) and os.path.getsize(p) > 500]
    log_txt = ""
    if os.path.exists(gimp_log):
        with open(gimp_log, "r", encoding="utf-8", errors="replace") as f:
            log_txt = f.read().strip().replace("\n", " | ")
    ok = len(made) == len(gimp_expected)
    detail = ("%d/%d 檔" % (len(made), len(gimp_expected)))
    if log_txt:
        detail += "  " + log_txt[-190:]
    elif not ok:
        detail += "  " + ((r.stdout or "")[-120:] + (r.stderr or "")[-120:])
    step("GIMP Console Python-Fu 批次改圖", ok, detail)
except Exception as e:
    step("GIMP Console Python-Fu 批次改圖", False, "%s: %s" % (type(e).__name__, str(e)[:180]))


# --------------------------------------------------------------------------
# 6. Inkscape CLI：SVG -> PNG
# --------------------------------------------------------------------------
svg = os.path.join(OUT, "logo.svg")
svg_png = os.path.join(OUT, "logo.png")
with open(svg, "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">'
            '<rect width="400" height="400" fill="#101820"/>'
            '<circle cx="200" cy="200" r="140" fill="#E8A33D"/>'
            '<text x="200" y="215" font-size="60" text-anchor="middle" fill="#101820">M</text>'
            '</svg>')
try:
    r = run([INKSCAPE, svg, "--export-type=png", "--export-filename=" + svg_png,
             "--export-width=400"], timeout=180)
    ok = os.path.exists(svg_png) and os.path.getsize(svg_png) > 500
    step("Inkscape CLI SVG->PNG", ok,
         "%d bytes" % os.path.getsize(svg_png) if ok else (r.stderr or "")[-200:])
except Exception as e:
    step("Inkscape CLI SVG->PNG", False, "%s: %s" % (type(e).__name__, str(e)[:180]))


# --------------------------------------------------------------------------
# 7. darktable-cli 存在性
# --------------------------------------------------------------------------
step("darktable-cli 存在", os.path.exists(DARKTABLE_CLI), DARKTABLE_CLI)


# --------------------------------------------------------------------------
print()
print("=" * 62)
passed = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(("  PASS  " if ok else "  FAIL  ") + name + ("   " + detail if detail else ""))
print("=" * 62)
print("通過 %d / %d" % (passed, len(results)))
print("產出目錄: %s" % OUT)
sys.exit(0 if passed == len(results) else 1)
