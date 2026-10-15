# PowerShell 寫 UTF-8 陷阱（細節）

## 1. Add-Content — 永遠不要用

**症狀**：UTF-8 編碼的純文字檔（中文 markdown / 含 `$var` 的 PowerShell script），被 `Add-Content` 寫入一次後：

1. 檔案編碼從 UTF-8 變成 UTF-16LE
2. 檔頭前幾個 byte 被改成 `EF BF BD`（U+FFFD replacement char）
3. 內容對 `READ` / `req` / `res` / `PowerShell` / `git push` 這些 ASCII 子串會局部插入 `ᨀ⨀` 之類的 garbage
4. 副檔名若 `.json`，`Get-Content` 會直接 throw「讀不到人」（corrupt header）

**歷史**：MEMORY.md 整檔就是這樣壞掉的，前一個 version (2026-10-01) 也是，導致 2026-10-05 整個 rebuild。

**修法**（強制）：
- 寫 UTF-8 文字檔 → Edit / Write tool / Python `open(p,'wb').write(s.encode('utf-8'))`
- **永遠不要** `Add-Content`、`Get-Content | Set-Content`、`Get-Content | Out-File`
- 已經壞掉的檔：先 `Move-Item` 備份到 `memory/archive/`，再 `Write` 重寫

## 2. PowerShell codepage 1252 mis-decode

PowerShell 預設 codepage 是 Windows-1252，讀取 UTF-8 bytes 會 mis-decode 成亂碼：

```
台積電 UTF-8 = E5 8F B0 E7 A9 8D E9 9B BB
顯示成      = å°ç©é›»
```

**驗證方法**：

```powershell
[System.IO.File]::ReadAllText("D:\project\file.txt", [System.Text.Encoding]::UTF8)
# 或
Get-Content -Path "D:\project\file.txt" -Encoding UTF8
```

**注意**：PowerShell 顯示亂碼 ≠ 檔案本身壞掉。瀏覽器看到的是正確的 bytes。**永遠在 browser 透過 Playwright 驗證**，不只信 PowerShell。

之前懷疑 watchlist.name 是 latin-1 mis-decoded Big5，實際驗證 DB 內部是正確的 UTF-8 (`台積電` hex = `e5 8f b0 e7 a9 8d e9 9b bb`)，只是 PowerShell console 顯示亂碼。

## 3. JS template literal 內 `$variable` 被 PowerShell 吃

JS template literal 跟 PowerShell `$var` expansion 撞：

```js
const url = `${ticker}=X`;   // 在 PowerShell 內被當 $ticker 展開
```

`$ticker` undefined → empty string → runtime fetch 錯誤的 ticker（`USD=X` 變 `=X`）。

**修法**：用 Edit 工具編 JS，不要 PowerShell pipe `Out-File`。改完 `node --check` 抓 syntax。

inline 中文字符也一樣會過 template literal，但若 PowerShell 處理過 `\` interpolation 會壞。

## 4. Get-Content | Out-File 會壞 UTF-8 multibyte

```powershell
$js = Get-Content "D:\project\app.js" -Raw
$js | Out-File "D:\tmp.js"   # ❌ 寫壞
node --check "D:\tmp.js"      # false positive
```

即使 `Get-Content` 讀對了，`Out-File` 寫時也會壞（PowerShell codepage 問題）。

## 5. PowerShell 5.1 `Set-Content -Encoding UTF8` 加 BOM

```powershell
Set-Content -Path "D:\project\file.md" -Value "中文" -Encoding UTF8
```

PowerShell 5.1 的 `Set-Content -Encoding UTF8` 會加 BOM（U+FEFF）。對純文字沒問題，對 `.json` 下游 SDK 可能拒絕。

**修法**：用 `Write tool` 或 Python。

## 6. 鏈式命令用 `;` / `if ($?)`，不要 `&&` / `&`

```powershell
# ❌ PowerShell 不支援 && 
Get-Content a | Set-Content b && Remove-Item a

# ✅ 用 ; 或 if ($?)
Get-Content a | Set-Content b; if ($?) { Remove-Item a }
```

## 7. 刪檔用 `mavis-trash`，不用 `rm -rf` / `Remove-Item -Recurse -Force`

PowerShell `Remove-Item -Recurse -Force` 是不可逆的。`mavis-trash` 走 recoverable deletion，刪錯可以從垃圾桶撈回來。

```powershell
# ❌ 不可逆
Remove-Item "D:\project\file.txt" -Recurse -Force

# ✅ recoverable
& "C:\Users\$env:USERNAME\.minimax\bin\mavis-trash.exe" -- "D:\project\file.txt"
```
