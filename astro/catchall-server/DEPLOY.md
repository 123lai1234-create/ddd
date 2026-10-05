# Render catchall deploy — manual trigger

`astro/api/[...catchall].mjs` 改了之後，Render `donttalk-catchall` service 不會自動 deploy（autoDeploy webhook 沒 trigger），需要手動觸發。

## 方法 A：Dashboard（最簡）

1. 開 https://dashboard.render.com → 點 `donttalk-catchall`
3. 右上 "Manual Deploy" → "Deploy latest commit"
4. 看 build log 跑完（約 1-3 分鐘 free plan 可能排隊 5+ 分鐘）

## 方法 B：Script（已有 token）

```bash
# Render dashboard → Account Settings → API Keys → 拿新 token
export RENDER_TOKEN=rnd_xxxxxxxx
cd D:\project\astro\catchall-server
python deploy.py            # trigger deploy
python deploy.py --list     # 看最近 5 次 deploy 狀態
```

## 方法 C：Auto-deploy 修好

Settings → Build & Deploy → Auto-Deploy：
- "Auto-Deploy" 確認 Yes
- Branch 確認是 `123lai1234-create`（不是 `main`，因為 `[...catchall].mjs` 只在這 branch）

## 驗證

```bash
curl https://donttalk-catchall.onrender.com/healthz
# {"status":"ok","service":"donttalk-catchall","ts":...}

# 不應該再吐 Neon AbortError，且 response 應該 < 30s
curl -i 'https://donttalk-catchall.onrender.com/api/signal_filter?all=1' --max-time 15
# HTTP/1.1 200 OK
```

正常會看到：
```
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
```
然後 JSON 裡有 `"cached":true` 或 `"cached":false`，以及 `"items":[...]`。

如果還是 500 / 30 秒 timeout，stack trace 會指到 `runWithConcurrency` 或 `_candleCache`（不是 `Promise.all (index N)`）。如果還是看到 `Promise.all (index N)` → 還是舊 code，Render 沒 deploy。