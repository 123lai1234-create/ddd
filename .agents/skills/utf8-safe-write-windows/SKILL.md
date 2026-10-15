---
name: utf8-safe-write-windows
description: "Windows PowerShell 寫 UTF-8 文字檔的 meta-pattern。當用戶要寫 .md / .ts / .js / .json / .lrc / .vtt / 含 CJK / 含 `$var` / 含 emoji 的檔案時使用。涵蓋 Add-Content 永遠不要用、Get-Content | Set-Content / Out-File 會壞 UTF-8 bytes、Python bytes 模式寫法、Edit/Write tool 優先、BOM 處理、PowerShell codepage 1252 mis-decode、vercel env add BOM 陷阱、xHTML 內嵌 script 的 & < > 字元陷阱、Python file write 會 strip UTF-8 BOM。症狀：JS template literal `$var` 被 PowerShell 吃掉、檔案大小從 71430 變 35675 bytes、檔頭被改成 U+FFFD、git diff 顯示整個檔案被改。應用：所有 Windows 上 mavis / PowerShell / Python / node 混用的環境。"
license: MIT
metadata:
  author: donttalk-deploy
  version: "1.0.0"
  tags:
    - powershell
    - windows
    - utf-8
    - bom
    - cjk
    - file-write
    - meta-pattern
---

# UTF-8 Safe Write（Windows PowerShell）

> 強制 meta-pattern：寫 UTF-8 文字檔**永遠**用 Edit / Write tool / Python bytes 模式，**永遠不要**用 PowerShell `Add-Content` 或 `Get-Content | Out-File` pipeline。

## 核心規則（10 秒記住版）

| 動作 | 用什麼 | 為什麼 |
|---|---|---|
| 改已存在檔案 | **Edit tool** | 保留原 bytes，只改匹配段 |
| 寫新檔案 | **Write tool** | 編碼可控、不經 PowerShell pipeline |
| 從 stdin/script 寫檔 | `python -c "open(p,'wb').write(s.encode('utf-8'))"` | 跳過 PowerShell codepage |
| 從 URL 抓 bytes | `urllib.request.urlopen(URL).read()` + `open(p,'wb').write(...)` | 跳過 PowerShell pipe |
| ~~寫 UTF-8 文字檔~~ | ❌ **永遠不要** `Add-Content` | 會把檔案轉 UTF-16LE、檔頭加 U+FFFD |
| ~~讀寫 UTF-8 文字檔~~ | ❌ **永遠不要** `Get-Content \| Out-File` / `Get-Content \| Set-Content` | PowerShell codepage 1252 mis-decode CJK / `$var` |
| 驗證檔案 | Python `print(open(p,'rb').read()[:50])` | 看實際 bytes |
| 驗證 JS syntax | `node --check <file>` （不要用 PowerShell pipe） | PowerShell pipe 寫過的檔案已壞 |

## 症狀對照表（看到這個就中招了）

| 症狀 | 根因 |
|---|---|
| 檔案大小從 71430 → 35675 bytes | PowerShell `Out-File` 寫壞 UTF-8 multibyte |
| 檔頭前幾個 byte 變 `EF BF BD` (U+FFFD) | `Add-Content` 把 UTF-8 轉 UTF-16LE |
| `node --check` 報 `missing ) after argument list` at line 123 | PowerShell 寫壞 inline object literal |
| `git diff --stat` 顯示 10058 insertions(+), 10054 deletions(-) | Python `open(p,'w',encoding='utf-8')` strip BOM |
| PowerShell 顯示 `??extracted`（`?` 取代 CJK） | PowerShell codepage 1252 mis-decode |
| JS template literal `` `${ticker}=X` `` 在 PowerShell 跑變成 `=X` | PowerShell 把 `$ticker` 當變數展開 |
| Vercel Function `process.env.DATABASE_URL` 開頭有 `\uFEFF` | `echo $value \| npx vercel env add` BOM |
| xHTML 內 `<script>...</script>` 寫了 `&` `<` `>` | HTML entity 沒 escape，瀏覽器拒 parse |

## 寫法速查

### Python — 最通用

```python
# 寫 bytes
open(r"D:\project\file.txt", "wb").write(b"raw bytes")
# 寫 UTF-8 string
open(r"D:\project\file.md", "wb").write("中文 $var 🎉".encode("utf-8"))
# 寫 UTF-8 string + BOM（特定場景）
data = "...".encode("utf-8")
open(r"D:\project\file.ts", "wb").write(b"\xef\xbb\xbf" + data)
# 或用 encoding="utf-8-sig" 自動加 BOM
open(r"D:\project\file.ts", "w", encoding="utf-8-sig").write("...")
```

### PowerShell — 限制場景

```powershell
# 寫 PowerShell script（需 BOM 給 ISE）
$content = "# script content"
[System.IO.File]::WriteAllText("D:\project\script.ps1", $content, [System.Text.UTF8Encoding]::new($true))
# 讀 UTF-8 檔案
$text = [System.IO.File]::ReadAllText("D:\project\file.txt", [System.Text.Encoding]::UTF8)
```

### Node.js — 限小檔

```js
import { writeFileSync } from 'node:fs';
writeFileSync('D:/project/file.json', JSON.stringify(obj, null, 2), 'utf-8');
// ❌ 沒 flag 預設 UTF-8，但 Windows CRLF 預設開；可加 { encoding: 'utf-8', flag: 'w' } 強制
```

## 各檔案類型編碼規則

| 類型 | 編碼 |
|---|---|
| `memory/*.md` | UTF-8 no BOM |
| `.ts` / `.js` / `.json` | UTF-8 no BOM |
| `.lrc` / `.vtt` / `.srt` | UTF-8 no BOM |
| PowerShell `.ps1` | UTF-8 **with BOM**（PowerShell ISE 需要）/ 腳本讀檔用 `-Encoding UTF8` |
| Astro serverless function 入口 | 看 source — `astro/api/[...catchall].mjs` 是有 BOM 的 |
| CSV (TWSE / Taifex 下載) | Big5 / MS950，讀後轉 UTF-8 |

## 不要這樣做

❌ 寫 UTF-8 文字檔：
```powershell
Add-Content -Path "D:\project\file.md" -Value "中文"
"中文" | Out-File "D:\project\file.md"
Get-Content "D:\project\file.md" | Set-Content "D:\project\file2.md"
```

❌ PowerShell pipe 寫 JS：
```powershell
$js = Get-Content "D:\project\app.js" -Raw
$js | Out-File "D:\tmp.js"
node --check "D:\tmp.js"  # false positive
```

❌ `vercel env add` 從 PowerShell pipeline：
```powershell
echo $value | npx vercel env add NAME production  # 加 BOM
cat $file | npx vercel env add NAME production    # 加 BOM
Get-Content $file | npx vercel env add NAME production  # 加 BOM
```

## 正確做法對照

✅ 寫 UTF-8 文字檔：
- 用 **Edit tool** 改已存在檔案
- 用 **Write tool** 寫新檔案
- 用 Python `open(p,'wb').write(...)` 從 script 寫

✅ `vercel env add`：
```powershell
npx vercel env add NAME production --value "<value>"
```

✅ PowerShell 驗證檔案 bytes：
```powershell
# 讀 raw bytes
$bytes = [System.IO.File]::ReadAllBytes("D:\project\file.md")
# 或 Python
python -c "print(open(r'D:\project\file.md','rb').read()[:50])"
```

## References

- [`01-powershell-pitfalls.md`](references/01-powershell-pitfalls.md) — PowerShell codepage 1252、Add-Content 腐蝕細節、JS template literal 陷阱
- [`02-python-bytes-mode.md`](references/02-python-bytes-mode.md) — Python `open(p,'wb')` vs `open(p,'w',encoding='utf-8')`、BOM strip 修法、`encoding='utf-8-sig'`
- [`03-vercel-bom-trap.md`](references/03-vercel-bom-trap.md) — `vercel env add` BOM 陷阱、`--value` 修法、xHTML `<script>` 字元 escape
