# Ollama 4GB VRAM Model 選擇

## VRAM 預算

RTX 4060 Laptop 4GB VRAM + 65GB RAM。

- 純 GPU 跑：4GB VRAM cap
- 部分 layer offload RAM：能跑更大 model，但 5-8 tok/s（chatbot 慢）

## Model 比較

| Model | Size | VRAM | RAM offload | CJK | 速度 | 用途 |
|---|---|---|---|---|---|---|
| `qwen2.5:3b` | 2.16 GB | ✅ 純 GPU | — | ✅ 50% 精準 | ~30 tok/s | **對話首選** |
| `llama3.2:3b` | 2 GB | ✅ 純 GPU | — | ❌ 30% 精準 | ~35 tok/s | 英文輕量 |
| `qwen2.5-coder:7b` | 4.7 GB | ❌ 滿 | 部分 | ✅ | 5-8 tok/s | code（慢） |
| `mistral:7b` | 4.1 GB | ❌ 滿 | 部分 | ❌ | 8-12 tok/s | 一般 |
| `llama3.1:8b` | 4.7 GB | ❌ 滿 | 部分 | ❌ | 5-8 tok/s | 一般 |
| `gemma2:9b` | 5.4 GB | ❌ 滿 | 部分 | ❌ | 4-6 tok/s | 一般 |

## CJK 表現

`qwen2.5:3b` 對 CJK 50% 精準（不一定 hallucinate），`llama3.2:3b` 對 CJK 30% 精準（容易 hallucinate）。

測試 prompt：「用繁體中文解釋什麼是 RAG？」

- qwen2.5:3b：給出 200-300 字合理答案
- llama3.2:3b：給出 100-200 字，可能夾雜英文或 hallucinate

**中文 chatbot 場景永遠用 qwen2.5:3b**。

## 安裝

```powershell
ollama pull qwen2.5:3b
ollama pull nomic-embed-text  # 768-dim
ollama list  # 確認
```

第一次 pull 慢（看網速，1-2 GB 檔）。pull 完模型在 `%LOCALAPPDATA%\Ollama\models\`。

## 切換 model

```powershell
# env var
$env:OLLAMA_CHAT_MODEL = "qwen2.5:3b"

# 或在 code 內
process.env.OLLAMA_CHAT_MODEL = 'qwen2.5:3b';
```

## keep_alive 設定

```python
import requests
# keep model in VRAM for 30 min
requests.post("http://localhost:11434/api/generate", json={
  "model": "qwen2.5:3b",
  "prompt": "test",
  "keep_alive": "30m"  # 預設 5m
})
```

預設 keep_alive 5m → 每次 cold start 6+ 秒。設 30m 之後 0.5s 內回應。

對 chatbot 場景（不斷 refetch）很重要。

## 監控 VRAM

```powershell
# GPU usage
nvidia-smi  # 看 VRAM
# 或 ollama ps
& ollama ps
```

`ollama ps` 顯示已載入 model 跟 VRAM 使用量。

## Model 卸載

```powershell
# 卸載單一 model
ollama rm qwen2.5:3b

# 清空 cache
& ollama ps
# 或 API
curl -X POST http://localhost:11434/api/generate -d '{"model":"qwen2.5:3b","keep_alive":0}'
```

設 `keep_alive: 0` 立即卸載。

## 替代：CPU only

如果沒獨顯：

```powershell
# 純 CPU 跑（慢，5-15 tok/s）
$env:OLLAMA_NUM_GPU = "0"
ollama serve
```

model 全部 offload 到 RAM。65GB RAM 夠跑 13B model，但慢。

## 替代：雲端 GPU

| 服務 | 價 | 適合 |
|---|---|---|
| Modal | 免費 tier 有 | 短時 GPU |
| Replicate | pay-per-second | 偶爾用 |
| RunPod | $0.40/hr | 長期 |
| Vast.ai | $0.20-0.50/hr | 便宜 |

dev 用本機 GPU（Ollama 4GB 限制要選 model），production 想用 RAG 就要雲端。

## 效能調校

```powershell
# num_gpu 層數（看 VRAM）
$env:OLLAMA_NUM_GPU = "99"  # 自動
# num_ctx context window
$env:OLLAMA_NUM_CTX = "4096"  # 預設 2048，越大越慢

# num_parallel 並行 request
$env:OLLAMA_NUM_PARALLEL = "1"  # 預設 1
```

4GB VRAM + 3b model 設 `num_gpu 99` 全 GPU offload；7b model 設 `num_gpu 20` 部分 offload。
