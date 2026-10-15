# Framework 與 Rewrites 設定

## 背景

Vercel project 有兩個 framework 相關設定：
- **project-level**：`framework` 欄位（透過 Vercel dashboard 或 API 設定）
- **build-time**：vercel.json 裡的 `framework` / `buildCommand` / `outputDirectory`

Hobby plan 上兩者不一致時行為不可預期。

## 症狀：framework=null 吞 rewrites

`/api/*` 全 404，但 lambda function 還在 build output 裡。

### 驗證

```powershell
npx vercel inspect <deployment-id> --json
```

看 `builds[0].config.vercelConfig`：
- ✅ `{name, version:2, outputDirectory, rewrites}` — 正常
- ❌ `{name, version:2}` — rewrites 被吞

### 修法：PATCH project API

```powershell
$token = (Get-Content "$env:APPDATA\com.vercel.cli\Data\auth.json" -Raw | ConvertFrom-Json).token
$projectId = "prj_xxxxxxxxxxxx"  # 從 `npx vercel ls` 拿
$body = '{"framework":"astro"}'

Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" `
  -Method Patch `
  -Body $body `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer $token"}
```

## 合法 framework 值

```
astro, nextjs, nuxtjs, gatsby, remix, svelte, sveltekit, vite,
vue, angular, react, create-react-app, hugo, jekyll, eleventy,
middleman, preact, ember, solid, flutter, lit, dojo, polymer,
rax, elm
```

錯誤值會回 `400 invalid_framework`。
注意：`astrojs` 不是合法值，要用 `astro`。

## rootDirectory 設定

### 錯誤：`rootDirectory: "astro"`

會讓 `vercel deploy --prebuilt` 想上傳整個 `astro/` 子目錄 → 超過 15000 file 上限。

### 正確：`rootDirectory: null`

CLI 只上傳 `.vercel/output/` (~465 files)，配合 `--archive tgz` 雙保險。

### PATCH

```powershell
$body = '{"rootDirectory":null,"outputDirectory":"astro/dist","buildCommand":null,"installCommand":null}'
Invoke-RestMethod -Uri "https://api.vercel.com/v9/projects/$projectId" `
  -Method Patch `
  -Body $body `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer $token"}
```

## vercel.json 範本

```json
{
  "framework": null,
  "outputDirectory": "astro/dist",
  "buildCommand": null,
  "installCommand": null,
  "trailingSlash": true,
  "functions": {
    "api/line/webhook.js":     { "maxDuration": 26 },
    "api/line/health.js":      { "maxDuration": 10 },
    "api/line/push.js":        { "maxDuration": 26 },
    "api/line/subscribers.js": { "maxDuration": 26 },
    "api/index.mjs":           { "maxDuration": 26 }
  }
}
```

注意：
- `framework: null` 在 vercel.json 是 OK 的（CLI 端），但要避免 project-level 衝突
- `trailingSlash: true` 比 `cleanUrls: true` + 手寫 routes 規則穩定
- 不要再加 `rootDirectory` 在 vercel.json — project-level 設定會讓 schema validation 失敗
