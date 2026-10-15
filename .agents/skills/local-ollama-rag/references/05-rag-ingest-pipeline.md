# RAG Ingest Pipeline

## 鏈接

```
Source docs (PDF / MD / TXT / HTML)
  ↓ chunker (Python script)
  ↓ embedder (Ollama nomic-embed)
  ↓ write index.json (or LanceDB)
  ↓ RAG search 隨時查
```

## Python 環境

```powershell
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install pypdf requests urllib3
```

不要用 `Add-Content` 安裝東西（會腐蝕 UTF-8），用 `pip install` 直接。

## PDF Chunker

```python
# scripts/rag-ingest.py
import json
import sys
from pathlib import Path
import requests
from pypdf import PdfReader

OLLAMA_URL = 'http://localhost:11434'
EMBED_MODEL = 'nomic-embed-text'
TARGET_CHARS = 600
OVERLAP = 100

def chunk_text(text, target=TARGET_CHARS, overlap=OVERLAP):
    """滑動 window 切 chunk，保留 overlap"""
    chunks = []
    start = 0
    while start < len(text):
        end = start + target
        if end < len(text):
            # 找最近的句號 / 換行
            for sep in ['。\n', '\n\n', '。', '\n', '. ', ' ']:
                idx = text.rfind(sep, start, end)
                if idx > start + target // 2:
                    end = idx + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end - overlap
    return chunks

def embed(text):
    r = requests.post(f'{OLLAMA_URL}/api/embeddings', json={
        'model': EMBED_MODEL,
        'prompt': text,
    }, timeout=30)
    r.raise_for_status()
    return r.json()['embedding']

def ingest_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    full_text = ''
    for i, page in enumerate(reader.pages):
        full_text += f'\n\n[page {i+1}]\n' + page.extract_text()
    return full_text

def main():
    source = Path(sys.argv[1] if len(sys.argv) > 1 else 'docs/')
    chunks = []
    for f in source.rglob('*'):
        if f.suffix.lower() == '.pdf':
            text = ingest_pdf(f)
        elif f.suffix.lower() in ('.md', '.txt'):
            text = f.read_text(encoding='utf-8')
        elif f.suffix.lower() in ('.html', '.htm'):
            text = f.read_text(encoding='utf-8')
            # strip tags
            import re
            text = re.sub(r'<[^>]+>', '', text)
        else:
            continue
        
        for chunk in chunk_text(text):
            emb = embed(chunk)
            chunks.append({
                'id': f'{f.name}#{len(chunks)}',
                'text': chunk,
                'vector': emb,
                'source': str(f.relative_to(source)),
                'path': str(f),
            })
            print(f'[{len(chunks)}] {f.name}: {chunk[:60]}...')
    
    out = Path('.rag/index.json')
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(chunks), encoding='utf-8')
    print(f'\n✅ {len(chunks)} chunks → {out}')

if __name__ == '__main__':
    main()
```

## 跑

```powershell
python scripts/rag-ingest.py docs/
# → 產 .rag/index.json
```

時間看 corpus 大小：100 頁 PDF → 5-10 分鐘（nomic-embed 1.7s/embed）。

## Chunker 參數選擇

| Target | Overlap | 結果 |
|---|---|---|
| 300 chars | 50 | 9 chunks/頁，細但多 |
| 600 chars | 100 | 6 chunks/頁，平衡（推薦） |
| 1200 chars | 200 | 3 chunks/頁，粗 |

**短段落**（技術 FAQ）→ 300。
**長文件**（論文）→ 600-1200。

## overlap 重要性

0 overlap → 跨段查詢會 miss。
50-200 overlap → 跨段查詢可命中。

但 overlap 太多會 duplicate corpus。

## Embed model 選擇

| Model | Dim | 速度 | CJK |
|---|---|---|---|
| `nomic-embed-text` | 768 | 1.7s/embed | ✅ |
| `bge-m3` | 1024 | 4s/embed | ✅ 更好 |
| `bge-large` | 1024 | 3s/embed | ✅ |
| `all-minilm` | 384 | 0.5s/embed | ❌ |

CJK 表現 `bge-m3` > `nomic-embed` > `all-minilm`，但 `bge-m3` 在 Ollama 0.40 沒官方 build。

建議用 `nomic-embed-text` 起步，corpus > 5000 chunks 再升 `bge-m3`（要自架 sentence-transformers）。

## LanceDB ingest（推薦 vs JSON）

```python
# scripts/rag-ingest-lancedb.py
import lancedb
import pyarrow as pa

db = lancedb.connect('.rag/lance')
tbl = db.create_table('chunks', chunks, mode='overwrite')
# 自動建 IVF_PQ index（>5000 rows）
tbl.create_index(num_partitions=64, num_sub_vectors=64)
```

JSON index（`.rag/index.json`）優點：簡單、可 git、純 JS 讀。
LanceDB 優點：快（500x），> 5000 chunks 必要。

## Neon HTTP SQL bulk insert（給 watchlist 等結構化資料）

```python
import urllib.request
import json

def bulk_insert(rows, table='market_price_bars'):
    """rows = [{symbol, trade_date, open, high, low, close, volume, ...}]"""
    cols = list(rows[0].keys())
    values = ',\n'.join([
        '(' + ', '.join(f"${i+1}" for i in range(len(cols))) + ')'
        for _ in rows
    ])
    params = [v for r in rows for v in r.values()]
    
    query = f"INSERT INTO {table} ({', '.join(cols)}) VALUES {values} ON CONFLICT DO NOTHING"
    
    req = urllib.request.Request(NEON_URL, data=json.dumps({
        'query': query,
        'params': params,
    }).encode(), method='POST', headers={
        'Authorization': f'Bearer {NEON_TOKEN}',
        'Content-Type': 'application/json',
    })
    return urllib.request.urlopen(req).read()
```

## 驗證

```python
# 隨便 query 看看
import json
chunks = json.load(open('.rag/index.json'))
print(f'Total: {len(chunks)}')
print(f'Sample: {chunks[0]["text"][:100]}')
print(f'Vector dim: {len(chunks[0]["vector"])}')  # 應為 768
```

## 重新 ingest 注意事項

- 改 chunker 參數 → 全部重新 embed（Ollama 不會 cache）
- 加新文件 → append（不要 overwrite 全部 chunk）
- 刪除文件 → 找對應 chunks 刪除

```python
# 增量 ingest
existing_ids = {c['id'] for c in existing_chunks}
new_chunks = [c for c in all_chunks if c['id'] not in existing_ids]
removed_chunks = [c for c in existing_chunks if c['id'] not in {c['id'] for c in all_chunks}]
```

## 部署到 LanceDB

dev 用 `.rag/index.json`（簡單）。corpus 長大後遷 LanceDB：

```python
# migration
import lancedb
import json

chunks = json.load(open('.rag/index.json'))
db = lancedb.connect('.rag/lance')
tbl = db.create_table('chunks', chunks, mode='overwrite')
print(f'Migrated {len(chunks)} chunks to LanceDB')
```

之後 RAG search 用 LanceDB（見 `02-lancedb-internals.md`）。
