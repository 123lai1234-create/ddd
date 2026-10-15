# LanceDB 0.0.x 內部細節

## 套件選擇

| Package | 狀態 |
|---|---|
| `lancedb` (npm) | **deprecated** 0.0.1 |
| `@lancedb/lancedb` (npm) | 當前 namespace，0.0.x |

`npm install lancedb` 會 warning「Use @lancedb/lancedb instead」。正確做法：

```powershell
npm install --no-save @lancedb/lancedb@latest
```

## API 速查

```js
import { connect } from '@lancedb/lancedb';

// 連到 dir
const db = await connect(LANCE_DIR);

// 創 table（mode: 'overwrite' / 'create' / 'append'）
const tbl = await db.createTable('chunks', data, { mode: 'overwrite' });

// batch insert
await tbl.add(moreData);

// query
const rows = await tbl.search(queryVec)
  .limit(topK)
  .select(['id', 'text', 'vector', 'source', 'path'])
  .toArray();
```

## 預設 metric = L2 但 `_distance` 不 normalize

LanceDB 0.0.x 預設 metric 是 L2 distance。`_distance` 欄位回傳的是**原始 L2 距離**，不 normalize 也不 cosine。

對 768-dim vector 來說 L2 距離是 200-500 範圍（依向量大小）。要 cosine similarity：

```js
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

**不要用 `_distance` 算 cosine**：

```js
// ❌ 錯（會變負數）
const score = 1 - row._distance ** 2 / 2;
```

## `row.vector` 不是 plain array

是 LanceDB 自家的 `Vector` class (FloatVector<Float>)，有 `toArray()`、`get(i)`、`length` 等 method。

```js
const v = row.vector;          // Vector class
const arr = v.toArray();       // Float32Array
const v0 = v.get(0);           // single float
const len = v.length;          // 768
```

## 預設不 return `vector` column

LanceDB 預設不 return vector（太大）。要拿 vector 必須 `.select(...)` 顯式列：

```js
// ❌ 拿不到 vector
const rows = await tbl.search(queryVec).limit(10).toArray();
console.log(rows[0].vector);  // undefined

// ✅ 顯式 select
const rows = await tbl.search(queryVec)
  .limit(10)
  .select(['id', 'text', 'vector', 'source', 'path'])
  .toArray();
console.log(rows[0].vector);  // Vector class
```

## `toArray()` vs `execute()`

```js
.toArray()      // 回 Array，length 屬性可用
.execute()      // 回 AsyncIterator，沒 length，只能 for-await-of
```

`toArray()` 是常規用法。`execute()` 給 streaming 場景（但通常用不到）。

## 完整 query pattern

```js
async function ragSearch(query, topK = 5) {
  // 1. embed query
  const queryVec = await embed(query);  // Float32Array(768)
  
  // 2. LanceDB search
  const rows = await tbl.search(queryVec)
    .limit(topK * 2)  // 抓 2x 再 filter
    .select(['id', 'text', 'vector', 'source', 'path'])
    .toArray();
  
  // 3. 自己算 cosine（不信 _distance）
  const scored = rows.map(r => {
    const v = r.vector.toArray();
    return { ...r, score: cosine(queryVec, v) };
  });
  
  // 4. filter + sort
  return scored
    .filter(r => r.score > RAG_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

## 效能對比（1300 chunks, 768-dim, RTX 4060）

| 方案 | query 時間 | cold start |
|---|---|---|
| JS brute-force cosine | 5.4s | 0ms |
| LanceDB L2 + 自算 cosine | 5-10ms search + 1ms cosine | ~1.5s |

約 **500x 加速**，但 cold start 多了 1.5s（JS in-memory 沒 cold start）。

## LanceDB 對大 corpus 友善

- 10k chunks LanceDB 仍 5-10ms（用 IVF_PQ index 可再快 10x）
- JS in-memory 10k chunks → 40s+ 完全不可用

建議 corpus > 5000 chunks 一定要用 LanceDB。

## 替代方案

- **FAISS**：binary 對 Windows 不友善
- **Qdrant / Chroma**：要起 server，不適合本機 dev
- **Pinecone**：雲端，要錢

LanceDB 對單機 RAG 是最簡單選擇。
