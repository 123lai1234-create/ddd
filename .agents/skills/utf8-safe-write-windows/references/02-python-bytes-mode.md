# Python 寫 UTF-8（細節）

## bytes mode vs text mode

| 模式 | 寫法 | 加 BOM？ | 會 strip BOM？ |
|---|---|---|---|
| bytes binary | `open(p, 'wb').write(b'...')` | 不加 | 不 strip（手動） |
| text UTF-8 | `open(p, 'w', encoding='utf-8')` | 不加 | **會 strip**（Python 內部） |
| text UTF-8 with BOM | `open(p, 'w', encoding='utf-8-sig')` | 加 | 不 strip |
| text UTF-16 | `open(p, 'w', encoding='utf-16')` | 加 | n/a |

## 場景 1 — 從 URL 抓 bytes 寫檔

```python
import urllib.request
content = urllib.request.urlopen(URL).read()  # bytes
open(r"D:\project\file.bin", "wb").write(content)
```

✅ 不會被 Python / PowerShell 改 encoding，因為全程是 bytes。

## 場景 2 — 寫 UTF-8 string

```python
text = "中文 $var 🎉"
open(r"D:\project\file.md", "wb").write(text.encode("utf-8"))  # ✅ 明確指定
# 或
open(r"D:\project\file.md", "w", encoding="utf-8").write(text)   # ✅ 也行
```

兩個都行，**但混用 mode 要小心**（見下）。

## 場景 3 — 不要 strip 原檔案的 BOM

**症狀**：`git diff --stat` 顯示 `10058 insertions(+), 10054 deletions(-)` 像是整個檔案被改。

**根因**：`open(path, 'w', encoding='utf-8')` 在 Windows 上不會寫 BOM，但 Python 內部讀取時**會把 BOM 當作 `\ufeff` 一個字元**，寫回時這個字元可能丟掉，導致 BOM 被 strip。

**修法**：

```python
# 寫 UTF-8 + BOM
with open(path, "r", encoding="utf-8-sig") as f:  # sig = strip BOM if exists
    data = f.read()
with open(path, "w", encoding="utf-8-sig") as f:
    f.write(data)  # re-add BOM
```

或用 binary mode 手動控制：

```python
with open(path, "rb") as f:
    data = f.read()
if not data.startswith(b"\xef\xbb\xbf"):
    data = b"\xef\xbb\xbf" + data
with open(path, "wb") as f:
    f.write(data)
```

## 場景 4 — 寫 PowerShell script（需 BOM 給 ISE）

```python
script = "# PowerShell script content with 中文"
bom = b"\xef\xbb\xbf"
with open(r"D:\project\script.ps1", "wb") as f:
    f.write(bom + script.encode("utf-8"))
```

PowerShell ISE / Windows PowerShell 5.1 對沒 BOM 的 .ps1 報 parse error，CLI 7+ 接受無 BOM。

## 場景 5 — 寫 Astro serverless function 入口

某些 Astro 入口（`astro/api/[...catchall].mjs`）原始碼是帶 BOM 的：

```python
# 保留原始 bytes
with open(r"D:\project\astro\api\[...catchall].mjs", "rb") as f:
    data = f.read()
# 修改
data = data.replace(b"old_string", b"new_string")
# 寫回（保留 BOM if exists）
with open(r"D:\project\astro\api\[...catchall].mjs", "wb") as f:
    f.write(data)
```

## 跨專案應用

任何 Windows PowerShell 跑的 Python script 都適用這些規則 — 跟 Astro / Vercel / PowerShell pipeline 介接的場景。
