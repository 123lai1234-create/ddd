# GLB Header 驗證 + 修法

## GLB 二進位格式

```
[12 bytes header]
  bytes 0-3   : magic = b'glTF'
  bytes 4-7   : version = uint32 = 2
  bytes 8-11  : total length = uint32 (檔案大小)

[JSON chunk]
  bytes 12-15 : chunk length = uint32
  bytes 16-19 : chunk type = b'JSON' (4 bytes)
  bytes 20+   : JSON content (padded to 4-byte boundary with spaces)

[OPTIONAL BIN chunk]
  ...
```

每個 chunk 之後要 pad 到 4-byte 對齊（用 `0x20` 空格對 JSON，用 `0x00` 對 BIN）。

## 驗證 script

```python
import struct
import os

def validate_glb(p):
    with open(p, 'rb') as f:
        h = f.read(20)
    magic = h[:4]
    version = struct.unpack('<I', h[4:8])[0]
    total = struct.unpack('<I', h[8:12])[0]
    chunk_len = struct.unpack('<I', h[12:16])[0]
    chunk_type = h[16:20]
    
    size = os.path.getsize(p)
    print(f"file:      {p}")
    print(f"size:      {size}")
    print(f"magic:     {magic}  {'✅' if magic == b'glTF' else '❌'}")
    print(f"version:   {version}  {'✅' if version == 2 else '❌'}")
    print(f"total:     {total}  {'✅' if total == size else '❌'}")
    print(f"chunk_len: {chunk_len}  {'✅' if chunk_len < size else '❌'}")
    print(f"chunk_t:   {chunk_type}  {'✅' if chunk_type == b'JSON' else '❌'}")

validate_glb(r"D:\tmp\model.glb")
```

## decrypt.mjs 寫 header 8-byte 錯誤

### 症狀

- `magic` ✅ `glTF`
- `version` ✅ 2
- `total` ❌ 異常大或異常小
- `chunk_len` ❌ 對不上 JSON 實際 size
- 渲染時 three.js 報 `Invalid magic` 或 `JSON parse error`

### 根因

`decrypt.mjs` 在 Node 端用 WASM 解密後寫 GLB，但：

- WASM 給的 `res.data.byteLength` 是 buffer 的 **total size**（包含 capacity）
- decrypt.mjs 寫 header 時用 `pack('<Q', ...)` 8-byte uint64（JS BigInt?）
- 但 GLB header length field 是 4-byte uint32

結果 header bytes 8-15 被寫成 8 個 byte 的 size，而原本 chunk_len 該在的 bytes 12-15 是這個 8-byte size 的 high 32 bits。

### 修法：手動 re-pack

```python
import struct
import os

def fix_glb_header(p):
    with open(p, 'rb') as f:
        data = bytearray(f.read())
    
    # bytes 8-12 = total file length (uint32)
    struct.pack_into('<I', data, 8, len(data))
    
    # bytes 12-16 = JSON chunk length
    # (從原本寫錯的 8-byte 算回對的 4-byte)
    # 簡化：跳過 4 bytes 寫 4-byte chunk length
    json_chunk_len = struct.unpack('<I', bytes(data[20:24]))[0]  # 假設 first chunk 從 20 開始
    
    # 完整修法：parse 原本 chunk_len 然後 + 4
    with open(p, 'rb') as f:
        raw = f.read()
    
    # 用原本對的 chunk_len（從 byte 16 起的 JSON content 算）:
    # 找下一個 4-byte 對齊 + b'BIN' 或 EOF
    json_start = 20
    json_padded_len = json_chunk_len
    # pad to 4-byte
    if json_padded_len % 4 != 0:
        json_padded_len += 4 - (json_padded_len % 4)
    
    # re-pack header
    fixed = bytearray(b'glTF')  # magic
    fixed += struct.pack('<I', 2)  # version
    fixed += struct.pack('<I', len(raw))  # total
    fixed += struct.pack('<I', json_chunk_len)  # chunk length
    fixed += b'JSON'  # chunk type
    fixed += raw[20:]  # rest of file
    
    with open(p, 'wb') as f:
        f.write(fixed)
    print(f"Fixed: {len(fixed)} bytes")
```

實務上更簡單的做法 — 用 Open3D 重新讀寫：

```python
import open3d as o3d
mesh = o3d.io.read_triangle_mesh("D:/tmp/model.glb")  # Open3D 容錯強，能 parse 壞 header
o3d.io.write_triangle_mesh("D:/tmp/model-fixed.glb", mesh)  # 寫出時 header 自動正確
```

Open3D 對 partial corrupt GLB 的容錯比 three.js 好太多 — 即使 JSON chunk 略壞也能讀，寫出時強制 valid header。

## 何時該重抓而非修

- 整個 JSON chunk 是 garbage → 重新跑 meshy-glb
- 只有 header 8-byte 錯 → Open3D 重讀寫
- BIN chunk 不見或壞 → 重新跑 meshy-glb（模型資料丟失）
