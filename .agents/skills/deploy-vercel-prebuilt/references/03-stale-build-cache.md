# Stale Build Cache（部署上去是舊檔）

## 症狀

- local `astro/dist/scripts/<file>.js` hash `9101fe84`（新）
- `.vercel/output/static/scripts/<file>.js` hash `5516c8ac`（舊）
- 部署出去仍 serve 舊檔，即使 `vercel deploy --prebuilt`
- Vercel dashboard 上 deployment 標 Ready 但實際內容跟 local 不符

## 根因

`vercel build` output 到 `.vercel/output/`。`@vercel/static-build` 把 `outputDirectory`（如 `astro/dist/`）copy 到 `.vercel/output/static/`，但**不是冪等** — 舊檔可能不被覆蓋。

## 修法

```powershell
mavis-trash .vercel/output astro/.vercel/output astro/node_modules/.vite
& "$env:APPDATA\npm\vercel.cmd" build --prod --yes
python -c "import hashlib; print(hashlib.sha256(open('.vercel/output/static/scripts/<file>.js','rb').read()).hexdigest()[:16])"
& "$env:APPDATA\npm\vercel.cmd" deploy --prebuilt --prod --yes --archive tgz
```

第一個 hash 對 local `astro/dist/`，第二個 hash 對 `.vercel/output/static/` — **必須相同**才代表 build pipeline 沒留舊檔。

`node_modules/.vite` 也可能 serve stale chunks，trash 三個保險。

## 預防

- 部署前一律 `mavis-trash .vercel/output astro/.vercel/output astro/node_modules/.vite`
- 不要相信 Vercel CLI 的 Ready — 一定要看 `.vercel/output/static/` 的實際檔案 hash

## Vite 快取導致的 stale chunks

有時改了 source code 但 Vite 用 stale chunk：

```powershell
mavis-trash astro/node_modules/.vite
cd astro && npm run build && cd ..
```

重 build 後若 hash 變了就是 Vite cache 問題。

## 部署後驗證 hash

```powershell
$local = (Get-FileHash "astro\dist\scripts\<file>.js" -Algorithm SHA256).Hash.Substring(0,16)
$remote = (Invoke-WebRequest -Uri "https://<project>.vercel.app/scripts/<file>.js" -Method Head).Headers["x-vercel-cache-state"]  # optional
# 或抓回遠端檔案比對
$remoteHash = (Invoke-WebRequest -Uri "https://<project>.vercel.app/scripts/<file>.js").Content | ConvertTo-SecureString -AsPlainText -Force  # 不便
# 改用：
$remote = (Invoke-WebRequest -Uri "https://<project>.vercel.app/scripts/<file>.js").Content
$remoteHash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($remote))).Replace("-","").Substring(0,16).ToLower()
if ($local -ne $remoteHash) { Write-Warning "Stale cache still" }
```
