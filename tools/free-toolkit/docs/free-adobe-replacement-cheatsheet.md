# 免費取代 Adobe + 剪映 — 工具對應表 & 速查手冊

> 更新：2026-11-04 ｜ 已在本機實際安裝並驗證
> 取代對象：Adobe Photoshop 2023 + 2026 / Illustrator 2023 / Premiere Pro 2026 / Acrobat DC / Creative Cloud
> 硬體：i7-12650H / 64GB RAM / RTX 4060 Laptop (4GB VRAM) / D 槽 1.5TB

---

## 一、對應表（← 已安裝 + 已驗證）

| 你原來用的 | 免費替代 | 版本 | 實際位置 | 授權 |
|---|---|---|---|---|
| **Photoshop** 修圖 | **GIMP** | 3.2.6 | `C:\Users\User\AppData\Local\Programs\GIMP 3\bin\gimp-3.2.exe` | GPLv3，可商用 |
| **Photoshop** 開 PSD | **Photopea**（瀏覽器，0 安裝） | — | https://www.photopea.com | 免費，可商用 |
| **Photoshop** 繪畫 | **Krita** | 5.3.4 | `C:\Program Files\Krita (x64)\bin\krita.exe` | GPLv3，可商用 |
| **Illustrator** | **Inkscape** | 1.4.4 | `C:\Program Files\Inkscape\bin\inkscape.exe` | GPLv3，可商用 |
| **Premiere Pro** | **Shotcut** | 26.9.27 | `C:\Program Files\Shotcut\Shotcut.exe` | GPLv3 |
| **Premiere Pro**（進階） | **kdenlive** | 26.08.2 | `D:\Tools\kdenlive\kdenlive-26.08.2_standalone\bin\kdenlive.exe` | GPLv3 |
| **剪映 / CapCut** | **kdenlive + Shotcut**（桌機）<br>**VN 剪輯**（手機，免費無浮水印） | — | 手機去官網 / App Store 裝 | 免費 |
| **Acrobat DC** | **Stirling-PDF** | 3.2.2 | `C:\Program Files\Stirling PDF\Stirling-PDF.exe`（桌面版）<br>`D:\Tools\stirling-pdf\Start-Stirling-PDF.cmd`（網頁版 :8080） | 開源 |
| **Acrobat DC**（合併/拆分） | **PDF Arranger** | 1.14.0 | `C:\Users\User\AppData\Local\Programs\PDF Arranger\pdfarranger.exe` | GPLv3 |
| **Acrobat DC**（編輯） | **LibreOffice Draw** | 已裝 | `C:\Program Files\LibreOffice\program\` | MPL |
| **Lightroom**（RAW） | **darktable** | 5.6.2 | `D:\darktable\bin\darktable.exe` | GPLv3 |
| **After Effects** / 3D | **Blender** | 5.2.3 | `D:\Tools\blender\blender-5.2.3-windows-x64\blender.exe` | GPL，可商用 |
| **Media Encoder** | **FFmpeg** | 9.0.2 | `C:\ProgramData\chocolatey\bin\ffmpeg.exe` | LGPL/GPL |
| **音訊** | **Audacity** | 4.0.2 | `D:\Tools\audacity\Audacity-4.0.2.263060742[7472497]-x86_64\bin\Audacity4.exe` | GPLv3 |
| （本來就有） | **OBS Studio** | 已裝 | `C:\Program Files\obs-studio\obs64.exe` | GPLv2 |

> **注意**：Audacity 4.x 的主程式改名成 `Audacity4.exe`（不是 `audacity.exe`）。

### 捷徑在哪
所有工具都已建立開始選單資料夾 **「Free-Adobe-Replacement」**，桌面也有一個捷徑可直接進去（共 12 個）。
kdenlive / Audacity / darktable / Blender 的 `bin` 目錄已加進**使用者 PATH**，命令列可直接呼叫。

### Stirling-PDF 兩種模式
| 模式 | 捷徑 | 說明 |
|---|---|---|
| 桌面版 | `Stirling-PDF (桌面版)` | Tauri 原生視窗，內附 JRE，開啟即用 |
| 網頁版 | `Stirling-PDF (網頁版 :8080)` | 啟動後端 + 自動開瀏覽器 → `http://127.0.0.1:8080/`。適合想把它當「線上 Acrobat」用 |

> 手動啟動後端（若捷徑沒反應）：
> ```powershell
> $env:TAURI_PARENT_PID = $PID
> Start-Process 'C:\Program Files\Stirling PDF\runtime\jre\bin\java.exe' -ArgumentList @(
>   '-Xmx2g','-DBROWSER_OPEN=false','-Dserver.port=8080',
>   '-Dsecurity.enableLogin=false','-jar','C:\Program Files\Stirling PDF\libs\stirling-pdf-3.2.2.jar')
> ```
> Log 在 `%APPDATA%\Stirling-PDF\logs\stirling-pdf.log`。

---

## 二、還沒裝但值得知道的

| 需求 | 建議 | 備註 |
|---|---|---|
| Premiere 級專業剪輯 + 調色 | **DaVinci Resolve 21 免費版** | 官網下載（Chocolatey 沒有這個包）。免費版輸出上限 **UHD 3840×2160 @60fps / 8-bit**，Fusion + Fairlight + HDR 調色全都有，**無浮水印、無時間限制**。要 10-bit 或 DCI 4K 才需要 Studio $295 |
| 手機直式短影音 | **VN 剪輯** | iOS / Android / Windows，永久免費、無浮水印，操作邏輯最接近剪映 |
| 網頁版 PDF 工具 | https://stirlingpdf.com | 線上版；本機版已裝 Stirling-PDF，檔案不出電腦 |

---

## 三、快捷鍵對照

### Photoshop → GIMP
| 功能 | Photoshop | GIMP | Photopea |
|---|---|---|---|
| 選取 / 移動 / 套索 | `V` / `V` / `L` | `V` / `M` / `L` | `V` / `M` / `L` |
| 魔術棒 / 裁切 | `W` / `C` | `U` / `C` | `W` / `C` |
| 畫筆 / 橡皮擦 | `B` / `E` | `B` / `E` | `B` / `E` |
| 漸層 / 油漆桶 | `G` / `G` | `G` / `N` | `G` / `G` |
| 文字 / 抓手 / 縮放 | `T` / `H` / `Z` | `T` / `H` / `Z` | `T` / `H` / `Z` |
| 複製貼上 / 另存新檔 | `Ctrl+C,V` / `Ctrl+Shift+S` | 同 | 同 |
| 合併可見圖層 | `Ctrl+E` | `Ctrl+E` | 同 |
| 快速遮色片 | `\` | `\` | `\` |

### Premiere → kdenlive / Shotcut
| 剪映 | kdenlive | Shotcut |
|---|---|---|
| 分割 | `S` | `S` |
| 刪除 | `Del` / `Shift+Del` | `Del` |
| 複製貼上 | `Ctrl+C/V` | 同 |
| 字幕 | 專案字幕工具（內建 Whisper 語音轉字幕） | 濾鏡 > 字幕 |
| 濾鏡 / 特效 | 效果 > 濾鏡 | 濾鏡面板 |
| 速度變化 | 速度 > 變速 | 屬性 > 速度 |
| 匯出 | 輸出 | 匯出 > 預設 |

---

## 四、色彩管理雷（PSD 換到 GIMP 必看）

1. **偏好設定 > 系統資源 > 色彩管理** → 「開啟檔案時：轉換為 sRGB」，否則 GIMP 預設不轉色彩 → 開別人的 PSD 會整個偏色。
2. 對方給的是 **CMYK PSD** → GIMP 色彩會偏。遇到這種直接用 **Photopea**，或回對方要 RGB。
3. **文字圖層**在 GIMP 是點陣化（不可改字）→ 要改字用 **Photopea**，或請對方把文字分層匯出。
4. **智慧物件**在 GIMP 對應「圖層 > 智慧物件」，不是所有 PSD 都能無損往返 → 交付前用 Photopea 再開一次檢查。

---

## 五、FFmpeg 常用指令（取代 Media Encoder）

```powershell
# H.264 MP4（最通用）
ffmpeg -i input.mov -c:v libx264 -preset slow -crf 20 -c:a aac -b:a 192k output.mp4

# 直式短影音 1080x1920（剪映最常見輸出）
ffmpeg -i input.mp4 -vf "scale=1080:-2,crop=1080:1920" -c:v libx264 -crf 20 -c:a aac out_vertical.mp4

# 只抽音軌轉 mp3
ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 output.mp3

# 批次：整資料夾轉 mp4
Get-ChildItem *.mov | ForEach-Object {
  ffmpeg -i $_.FullName -c:v libx264 -crf 20 -c:a aac "$($_.BaseName).mp4"
}

# 串接多段
ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" out.mp4

# 壓到 30MB 以內（LINE 傳檔限制）
ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -crf 28 -c:a aac -b:a 128k -fs 29M small.mp4

# 擷取 30 秒片段（-ss 放 -i 前 = 快速 seek）
ffmpeg -ss 00:01:30 -i input.mp4 -t 30 -c copy clip.mp4
```

---

## 六、注意事項

1. **先別刪 Adobe**。用免費工具跑完一個完整專案、確認品質能接受，再退訂 CC。退訂後 CC 桌面版會無法啟動（需重裝 perpetual 版）。
2. **本機 RAM 64GB / GPU 只有 4GB VRAM**（RTX 4060 Laptop）。剪 4K 會吃力 → **開 Proxy + 1080p 匯出**；kdenlive 用「專案 > 建立 Proxy」。
3. **字型授權**：Inkscape、Blender 內建字型別直接拿來商用。
4. **剪映草稿是私有格式**，搬不出來。改用 kdenlive 的 `.kdenlive` 專案檔（XML，可版控）才留得住。
5. **中文斷行**：kdenlive 用「字幕 > 檢查拼寫 / 套用樣式」，或匯出 SRT 用文字編輯器改完再匯入。
6. **Blender 5.2.3** 的 zip 解壓後要執行 `blender.exe`，路徑在 `D:\Tools\blender\blender-5.2.3-windows-x64\`。

---

## 七、上線前驗收清單

- [ ] Photopea 開一個舊 PSD，圖層 / 智慧物件 / 調整圖層是否完整？
- [ ] GIMP 匯出 PNG 是否與 PS 一致（色彩管理設定對了沒）？
- [ ] Inkscape 開舊 .ai / .svg，填色路徑是否正確？
- [ ] kdenlive 匯出 1080×1920 直式 + 3840×2160@60，幀率 / 畫素比是否正常？
- [ ] FFmpeg 壓檔後在手機上播得動嗎？
- [ ] Stirling-PDF 合併/拆分/OCR 是否正常？PDF Arranger 是否能拖曳排序？
- [ ] 自由商用條款確認（GIMP / Krita / Inkscape / Blender / kdenlive / darktable / Audacity 皆 GPL，可商用）

---

## 八、附錄二：這台機器的 Docker 埠轉發是壞的（要你自己決定要不要修）

**症狀**：`docker ps` 顯示 `0.0.0.0:8080->8080/tcp`、容器 `Up (healthy)`，
但主機 `http://127.0.0.1:8080` / `localhost:8080` / 容器 IP `172.19.0.2:8080` **全部連不上（000）**，
`Get-NetTCPConnection -LocalPort 8080` 也查不到任何 listener。用 `nginx:alpine -p 9999:80` 測試一樣 → 與容器無關。

**根因**：`C:\Users\User\.wslconfig` 裡是
```ini
[wsl2]
networkingMode=mirrored
```
WSL2 的 mirrored 模式和 Docker 的 WSL2 後端互斥 → host→container 的 NAT 埠轉發整個失效。
（Docker 容器**內部**一切正常，`curl localhost:8080` 回 200。）

**修法**（會影響你整機 WSL 的網路行為，所以沒有自動幫你改）：
```powershell
# 1. 改掉 .wslconfig 的 networkingMode（mirrored -> nat）
notepad $env:USERPROFILE\.wslconfig
# 2. 重啟 WSL 與 Docker
wsl --shutdown
docker desktop stop
docker desktop start
```
> 這台機器上還有 `playwright-allure`、`hermes-webui` 等容器專案，
> 它們的 published port 應該**同樣連不到** —— 一併修了會一起好。
>
> 本次的 Stirling-PDF 已改用**原生 Windows 版**繞過，不需要 Docker。

---

## 九、附錄三：本次實測的版本清單

| 軟體 | 版本 | 執行檔 |
|---|---|---|
| GIMP | 3.2.6 | `C:\Users\User\AppData\Local\Programs\GIMP 3\bin\gimp-3.2.exe` |
| Inkscape | 1.4.4 | `C:\Program Files\Inkscape\bin\inkscape.exe` |
| Krita | 5.3.4.1 | `C:\Program Files\Krita (x64)\bin\krita.exe` |
| Shotcut | 26.9.27 | `C:\Program Files\Shotcut\Shotcut.exe` |
| kdenlive | 26.08.2 | `D:\Tools\kdenlive\kdenlive-26.08.2_standalone\bin\kdenlive.exe` |
| Audacity | 4.0.2 | `D:\Tools\audacity\Audacity-4.0.2.263060742[7472497]-x86_64\bin\Audacity4.exe` |
| darktable | 5.6.2 | `D:\darktable\bin\darktable.exe` |
| Blender | 5.2.3 LTS | `D:\Tools\blender\blender-5.2.3-windows-x64\blender.exe` |
| PDF Arranger | 1.14.0 | `C:\Users\User\AppData\Local\Programs\PDF Arranger\pdfarranger.exe` |
| FFmpeg | 9.0.2 | `C:\ProgramData\chocolatey\bin\ffmpeg.exe` |

> 全部都用 `--version` 實際跑過確認可執行。

---

## 十、附錄四：這次安裝踩到的坑（留給未來的我）

1. **Chocolatey 需要管理員權限**，非管理員殼會拿不到 `C:\ProgramData\chocolatey\lib` 的 lock → 失敗。
   提升權限用 `Start-Process powershell -Verb RunAs -ArgumentList "-File <script>" -Wait`（會跳 UAC）。
2. **提升權限的子行程裡 `$PSScriptRoot` 是空的** → `Join-Path $PSScriptRoot` 失敗 → 日誌路徑變 null → 腳本靜默什麼都沒做。
   → **提升權限的腳本一律寫死絕對路徑。**
3. **`choco` 回報「has been installed」不等於真的裝好**。GIMP 實際裝成每使用者模式在 `AppData\Local\Programs\GIMP 3`，不在 `C:\Program Files`。
   → 一律用登錄檔 + 實際找 exe 雙重驗證。
4. **Chocolatey 依賴 `community.chocolatey.org` 的 DNS**。DNS 短暫失敗會讓整批在 10 秒內各敗一次，
   錯誤訊息是誤導的「The package was not found with the source(s) listed」。
5. **部分廠商下載站在這台機器連不上**：`downloads.audacityteam.org`、`downloads.darktable.org` → TCP 不通。
   `github.com` / `download.kde.org` / `download.blender.org` → 正常。→ **portable 版優先找 GitHub Releases 資產。**
6. **7-Zip 抽 NSIS 安裝檔不是萬靈**：darktable 的 `win64.exe` 7-Zip 完全讀不開（Errors: 1），
   但直接跑 `darktable-5.6.2-win64.exe /S /D=D:\Tools\darktable` 會成功（它會忽略 `/D=` 改裝到 `D:\darktable`）。
7. **並行下載會全部卡死**：同時開 4 個 curl，連線建立但 0 bytes 流入，`--connect-timeout` 抓不到這種情況。
   → **改成逐檔順序下載 + `-C -` 續傳 + `--speed-limit 15000 --speed-time 40` 看門狗**（低速就重連）。
8. **GitHub 大檔下載會被截斷**：PDF Arranger MSI 抓成 45,498,216 / 63,311,360 bytes → `msiexec` 回 1620「安裝包無法開啟」。
   → 下載後**務必比對 content-length**；MSI 壞掉時用 `msiexec /i ... /qn` 的 `/l*v` 日誌看真正原因。
9. **`.wslconfig` 設了 `networkingMode=mirrored`** → **Docker Desktop 的埠轉發在這台機器失效**
   （容器內 curl localhost:8080 回 200，主機連 127.0.0.1:8080 與容器 IP 都是 000，`nginx` 測試也一樣 → 與容器無關）。
   解決法：把 `networkingMode` 改成 `nat` 後 `wsl --shutdown` + 重啟 Docker Desktop。
   → 本次改用 **Stirling-PDF 原生 Windows MSI** 繞過 Docker。
10. **PowerShell 5.1 讀沒有 BOM 的 .ps1 會當 ANSI**，中文被誤解碼 → 語法錯誤「字串遺漏結尾字元」。
    → 寫含中文的 .ps1 一定要存成 **UTF-8 with BOM**。
11. **GIMP 3.2 的批次直譯器名大小寫敏感**：`--batch-interpreter python-fu-eval` 才行，
    寫成 `python-Fu-eval` 會直接回「處理程序不是有效的批次直譯器」並停用批次模式。
12. **GIMP 3.2 沒加 `--quit` 就會留在背景空轉**：批次跑完後 GIMP 行程不退出，
    智能體每次都得等到 timeout 才繼續（第一次就是這樣浪費了 300 秒）。
13. **`-b` 的內容必須回傳數值**，否則 GIMP 報「python-fu-eval 未回傳任何數值」並中止後續批次指令。
    → 用無空格的 `(exec(open(r'<job.py>').read()),0)[1]`，回傳 0 讓批次正常收尾。
14. **`Gimp.quit()` 與 `os._exit(0)` 都不能拿來結束 GIMP**：
    `Gimp.quit()` 在 3.2 已棄用（DeprecationWarning）且是 no-op；
    `os._exit(0)` 只結束內嵌 Python 解譯器，GIMP 主行程照活（還會噴「外掛插件終止時可能擾亂 GIMP 的內部狀態」）。
    → 唯一正解是命令列加 `--quit`。
15. **`Start-Process` 啟動 Stirling-PDF 時 jar 路徑的空格會被切斷**：
    `Unable to access jarfile C:\Program` → `-ArgumentList` 傳陣列不會自動加引號，
    要自己寫成 `'"C:\Program Files\Stirling PDF\libs\stirling-pdf-3.2.2.jar"'`。
16. **Stirling-PDF 會在「行程的工作目錄」底下建 `configs/` `logs/` `pipeline/` `customFiles/`** →
    從專案資料夾啟動就會把這些執行期垃圾塞進你的專案裡。
    → 一律先 `cd /d D:\Tools\stirling-pdf\work` 或用 `Start-Process -WorkingDirectory` 指定。
    （`D:\Tools\stirling-pdf\Start-Stirling-PDF.cmd` 已改成在那裡啟動。）

---

## 十一、附錄五：GIMP 3.2 無頭批次完整範本（可直接複製）

GIMP 3.2 的 Python-Fu API 跟 2.x **完全不一樣**，網路上幾乎都是 2.x 教學，照抄會全錯。
以下是本機實測可用的版本（2026-11-10）。

### 啟動指令

```powershell
& 'C:\Users\User\AppData\Local\Programs\GIMP 3\bin\gimp-console-3.2.exe' `
  -i --quit --batch-interpreter python-fu-eval `
  -b "(exec(open(r'<job.py>').read()),0)[1]"
```

- `--quit`：**沒有它 GIMP 會留在背景空轉**（批次跑完不退出）。
- `-b` 的內容**必須回傳數值**，所以用 `(exec(...),0)[1]` 這個「無空格」的寫法。
- `job.py` 建議存成 UTF-8 無 BOM、純 ASCII。

### job.py 內容骨架

```python
import gi
gi.require_version("Gdk", "3.0")
from gi.repository import Gimp, Gegl, Gio
import os, traceback

# 開圖
img = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(r"<in.png>"))

# 改圖
img.scale(400, 300)                        # 縮放
img.flip(Gimp.OrientationType.HORIZONTAL)  # 水平翻轉

col = Gegl.Color.new("R'G'B'A float")       # 前景色必須是 Gegl.Color
col.set_rgba(0.8, 0.35, 0.15, 1.0)          # r,g,b,a 都是 0~1
Gimp.context_set_foreground(col)
img.get_layers()[0].fill(Gimp.FillType.FOREGROUND)

# 存檔（副檔名決定輸出格式，PNG/JPG 都能用同一支）
Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(r"<out.png>"), None)
```

### GIMP 2.x → 3.2 API 對照

| 用途 | GIMP 2.x（滿街舊教學） | GIMP 3.2（本機實測可用） |
|---|---|---|
| 開圖 | `pdb.gimp_file_load(...)` | `Gimp.file_load(RunMode.NONINTERACTIVE, Gio.File.new_for_path(p))` |
| 存檔 | `pdb.gimp_image_save(img, layer, path, path)` | `Gimp.file_save(RunMode.NONINTERACTIVE, img, Gio.File.new_for_path(p), None)` |
| PNG 的 PDB 名 | `file-png-save` | **`file-png-export`**（`file-png-save` 已不存在，`procedure_exists` 回 False） |
| 前景色 | `pdb.gimp_context_set_foreground((r,g,b))` | `Gegl.Color.new("R'G'B'A float")` + `.set_rgba(r,g,b,a)` |
| 建圖層 | `pdb.gimp_layer_new(img, w, h, type, name, op, mode)` | `Gimp.Layer.new(image=, width=, height=, type=, name=, opacity=, mode=)` |
| 翻轉枚舉 | `Gimp.Orientation.HORIZONTAL` | `Gimp.OrientationType.HORIZONTAL` |
| 結束程式 | `pdb.gimp_quit(1)` | 命令列加 `--quit`（`gimp-quit` 已棄用且無效） |
| 查 procedure | `pdb.query_procedures("png")` | `pdb.procedure_exists("file-png-export")`（`query_procedures` 簽名變了） |

### 想知道 PDB 裡到底有什麼 procedure？

比猜名字快一百倍——把整份 PDB dump 成純文字再搜：

```python
from gi.repository import Gio
Gimp.PDB().dump_to_file(Gio.File.new_for_path(r"<dump.txt>"))
```

dump 檔是文字格式，搜 `png` / `flip` / `quit` 就會看到完整簽名、參數型別、還有棄用說明。
（`dump_to_file` 要吃 `Gio.File`，塞 str 會直接跳「Expected Gio.File, but got str」。）

