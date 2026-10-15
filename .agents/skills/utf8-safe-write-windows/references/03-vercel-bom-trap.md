# Vercel BOM 陷阱 + xHTML 內嵌字元

## 1. vercel env add 從 PowerShell pipeline 加 BOM

**症狀**：用以下任一方式 `vercel env add`：

```powershell
echo $value | npx vercel env add NAME production
Get-Content $file | npx vercel env add NAME production
cat $file | npx vercel env add NAME production
```

會把 **UTF-8 BOM (U+FEFF)** 加進 env value。

下游症狀：Vercel Function 拿 `process.env.DATABASE_URL` 開頭有 `\uFEFF`，下游 SDK 拒絕：「not a valid URL」。

**修法：用 `--value` flag 繞過 pipeline**

```powershell
npx vercel env add NAME production --value "<value>"
```

不要用 `echo` / `cat` / `Get-Content` 經 PowerShell pipeline。

## 2. xHTML 內嵌 `<script>` 字元陷阱

HTML / xHTML 內 `<script>...</script>` 區塊含 `&` / `<` / `>` 字元會被瀏覽器當 entity reference / tag 拒絕 parse：

```html
<script>
if (a < b && c > d) { ... }    <!-- ❌ < 跟 > 會被當 tag 開頭 -->
</script>
```

**症狀**：DevTools Console 報 `SyntaxError: Unexpected token '<'` 或 `<script>` 區塊整段被忽略。

**修法**：用 `String.fromCharCode(N)` 繞：

```html
<script>
if (a < b && c > d) { ... }  // 直接寫 < > 沒問題（HTML 內 script 是 CDATA-like）
</script>
```

實際上 HTML5 內 `<script>` 內容是 raw text，`&` / `<` / `>` 都不需要 escape。但 xHTML（XML-style）內就要 `&lt;` / `&gt;` / `&amp;`。

判斷方式：
- Astro 預設產 HTML5（`<!DOCTYPE html>` 開頭）→ 不需要 escape
- 副檔名 `.xhtml` / Content-Type `application/xhtml+xml` → 需要 escape
- 寫 Astro component 沒疑慮，但寫 raw HTML file 要注意

## 3. CSV Big5 → UTF-8 轉檔

台期所 daily market data 公開 CSV 是 Big5 (MS950)：

```
URL: https://www.taifex.com.tw/cht/3/dlFutDataDown?...
格式: Big5 CSV (charset=MS950), 沒 header BOM
```

**修法**：

```python
import urllib.request
# 抓 bytes
data = urllib.request.urlopen(url).read()
# decode Big5
text = data.decode("big5", errors="replace")
# 寫 UTF-8
open(r"D:\tmp\output.csv", "wb").write(text.encode("utf-8"))
```

不要 `Get-Content | Set-Content`（會壞）。

## 4. PowerShell console 顯示亂碼 ≠ 檔案壞

PowerShell 5.1 預設 codepage 1252 讀 UTF-8 bytes 顯示亂碼（`å°ç©é›»` 取代 `台積電`），但實際檔案內容是對的。

**驗證方法**：

```powershell
[System.IO.File]::ReadAllText("D:\project\file.txt", [System.Text.Encoding]::UTF8)
# 或
python -c "print(open(r'D:\project\file.txt','rb').read()[:50])"
```

**重要**：瀏覽器看到的是正確的 bytes，無需修檔案。

## 5. git 看到整檔被改的常見原因

| git diff 樣子 | 原因 |
|---|---|
| 整檔被改，行數 +/- 幾乎相等 | Python `open(p,'w',encoding='utf-8')` strip BOM |
| 檔案大小 -50% | PowerShell `Out-File` 寫壞 UTF-8 multibyte |
| 開頭幾行加 `?` 字元 | `Add-Content` 寫入，UTF-8 變 UTF-16LE |
| 整檔 line ending 變 LF | CRLF 換 LF（PowerShell `Set-Content` 預設） |

修法：用 Edit / Write tool 寫檔，或 Python binary mode。
