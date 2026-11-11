"""
free-toolkit 共用層
==================
四條產線（音樂 MV 多平台 / 網站素材 / 歌詞卡 / PDF 批次）共用的一層：
工具路徑、執行封裝、產出驗證。

存在的理由：這台機器上「怎麼叫這些免費工具做事」的細節非常不直覺
（尤其 GIMP 3.2 的 Python-Fu API 跟 2.x 完全不一樣），
集中在這一處，改一次全部產線受益。
"""

import json
import os
import re
import subprocess
import sys
import time

# ----------------------------------------------------------------- 工具路徑
TOOLS = {
    "ffmpeg": r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
    "ffprobe": r"C:\ProgramData\chocolatey\bin\ffprobe.exe",
    "inkscape": r"C:\Program Files\Inkscape\bin\inkscape.exe",
    # 注意：必須用 console 版（gimp-console-3.2.exe），GUI 版在非互動殼裡沒 stdout
    "gimp": r"C:\Users\User\AppData\Local\Programs\GIMP 3\bin\gimp-console-3.2.exe",
    "melt": r"D:\Tools\kdenlive\kdenlive-26.08.2_standalone\bin\melt.exe",
    "blender": r"D:\Tools\blender\blender-5.2.3-windows-x64\blender.exe",
    "darktable_cli": r"D:\darktable\bin\darktable-cli.exe",
    "stirling": "http://127.0.0.1:8080",
}

# GIMP 3.2 批次工作的共用前導（每支 job 都要）
GIMP_PRELUDE = (
    "import gi\n"
    "gi.require_version('Gdk', '3.0')\n"
    "from gi.repository import Gimp, Gegl, Gio\n"
    "import os, traceback\n"
)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_ROOT = os.path.join(ROOT, "out")
TPL_DIR = os.path.join(ROOT, "templates")
DATA_DIR = os.path.join(ROOT, "data")


# ----------------------------------------------------------------- 執行封裝
def tool(name):
    """取得工具路徑並確認存在，否則丟出可讀的錯誤。"""
    path = TOOLS[name]
    if not os.path.exists(path):
        raise FileNotFoundError(
            "找不到工具 %s：%s（先跑 install-free-stack.ps1 或檢查安裝路徑）" % (name, path))
    return path


def run(cmd, timeout=300, cwd=None):
    """一律 utf-8 + errors=replace，否則 Windows cp950 會炸 UnicodeDecodeError。"""
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        encoding="utf-8", errors="replace", cwd=cwd)


def out_dir(name):
    """建立並回傳 out/<name>。"""
    p = os.path.join(OUT_ROOT, name)
    os.makedirs(p, exist_ok=True)
    return p


# ------------------------------------------------------------------- GIMP
def gimp_job(job_src, log_path, timeout=300, prelude=True):
    """跑一支 GIMP 3.2 無頭批次工作。

    三個關鍵點（少了任何一個就不會成功）：
      1. 必須加 --quit，否則批次跑完 GIMP 主行程不退出、留在背景空轉。
      2. -b 的內容必須回傳數值，所以用 (exec(...),0)[1] 這個無空格的寫法。
         （寫 "exec(...) or 0" 會被 GIMP 依空格切成三個批次指令而失敗。）
      3. --batch-interpreter 的名稱大小寫敏感：必須是 python-fu-eval。

    另外兩個實測踩到的坑：
      4. open() 一定要明確指定 encoding='utf-8'。GIMP 內嵌的 Python 預設用
         系統 locale（這台機器是 cp950），job 檔裡只要有中文路徑就會
         UnicodeDecodeError: 'cp950' codec can't decode byte 0xe9。
      5. job 檔裡不要呼叫 os._exit(0)。它會讓批次解譯器來不及回傳數值，
         GIMP 以 exit code 64（"python-fu-eval 未回傳任何數值"）結束。
         要結束就靠命令列的 --quit。

    回傳 (CompletedProcess, log_text)。job_src 應把結果寫進 log_path。
    """
    job_py = os.path.splitext(log_path)[0] + ".gimpjob.py"
    body = (GIMP_PRELUDE + job_src) if prelude else job_src
    with open(job_py, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)

    cmd = [tool("gimp"), "-i", "--quit",
           "--batch-interpreter", "python-fu-eval",
           "-b", "(exec(open(r'%s',encoding='utf-8').read()),0)[1]" % job_py]
    r = run(cmd, timeout=timeout)

    log = ""
    if os.path.exists(log_path):
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            log = f.read()
    return r, log


# --------------------------------------------------------------- 媒體驗證
def ffprobe(path):
    """回傳 {'width','height','duration','codec','audio'}；失敗回 {}。"""
    if not os.path.exists(path):
        return {}
    cmd = [tool("ffprobe"), "-v", "error", "-show_streams", "-show_format",
           "-of", "json", path]
    try:
        r = run(cmd, timeout=90)
        data = json.loads(r.stdout or "{}")
    except Exception:
        return {}
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    out = {
        "width": int(video.get("width", 0)) if video else 0,
        "height": int(video.get("height", 0)) if video else 0,
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
        "codec": video.get("codec_name", "") if video else "",
        "audio": audio.get("codec_name", "") if audio else "",
        "size": int(data.get("format", {}).get("size", 0) or 0),
    }
    return out


def png_size(path):
    """不啟動 ffprobe 直接讀 PNG 頭的寬高（快很多）。"""
    try:
        with open(path, "rb") as f:
            head = f.read(24)
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return (0, 0)
        w = int.from_bytes(head[16:20], "big")
        h = int.from_bytes(head[20:24], "big")
        return (w, h)
    except Exception:
        return (0, 0)


def svg_to_png(svg, png, width=None, height=None, timeout=180):
    """Inkscape CLI 匯出 SVG -> PNG。"""
    cmd = [tool("inkscape"), svg, "--export-type=png", "--export-filename=" + png]
    if width:
        cmd.append("--export-width=%d" % width)
    if height:
        cmd.append("--export-height=%d" % height)
    return run(cmd, timeout=timeout)


# ------------------------------------------------------------------- 工具
def safe_name(s, fallback="item"):
    """把標題等字串轉成安全的檔名（保留中文，去掉檔案系統非法字元）。"""
    s = (s or "").strip()
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', "-", s)
    s = re.sub(r"\s+", " ", s).strip(" .")
    return s or fallback


def load_json(path, default=None):
    if not os.path.exists(path):
        return default if default is not None else []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------ 報告
class Report(object):
    """收集每個步驟的結果，最後印一個表格並決定 exit code。"""

    def __init__(self, title):
        self.title = title
        self.rows = []

    def step(self, name, ok, detail=""):
        self.rows.append((name, bool(ok), detail))
        print(("  [OK]   " if ok else "  [FAIL] ") + name + ("  " + detail if detail else ""))
        return ok

    def finish(self):
        passed = sum(1 for _, ok, _ in self.rows if ok)
        total = len(self.rows)
        print("")
        print("=" * 62)
        for name, ok, detail in self.rows:
            print("  %s  %s%s" % ("PASS" if ok else "FAIL", name,
                                  ("  " + detail) if detail else ""))
        print("=" * 62)
        print("通過 %d / %d" % (passed, total))
        return passed == total


def header(title):
    print("")
    print("=" * 62)
    print(title)
    print("=" * 62)
