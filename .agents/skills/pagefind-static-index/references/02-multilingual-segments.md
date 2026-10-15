# Pagefind 多語言 Segment

## 機制

Pagefind 1.x 對每個 `<html lang="...">` 開頭的 HTML 檔分到對應 segment：

```astro
<html lang="zh-Hant">  <!-- → pagefind.zh-hant_*.pf_meta -->
<html lang="zh-TW">    <!-- → pagefind.zh-tw_*.pf_meta -->
<html lang="en">       <!-- → pagefind.en_*.pf_meta -->
<html lang="ja">       <!-- → pagefind.ja_*.pf_meta -->
```

沒 `lang` 屬性 → 走 `unknown` segment 或不分（看 Pagefind 版本）。

## 對應規則

| `<html lang>` | Pagefind segment |
|---|---|
| `zh-Hant` / `zh-Hant-TW` | `zh-hant` |
| `zh-Hans` / `zh-CN` | `zh-hans` |
| `zh-TW` | `zh-tw` |
| `en` / `en-US` / `en-GB` | `en` |
| `ja` / `ja-JP` | `ja` |
| (空 / 沒宣告) | 通常併入最近的 lang 或 default |

## Astro i18n 整合

Astro 6.x 預設 i18n config：

```js
// astro.config.mjs
export default defineConfig({
  i18n: {
    defaultLocale: 'zh-Hant',
    locales: ['zh-Hant', 'en'],
    routing: { prefixDefaultLocale: false },
  },
});
```

對應每個 locale 自動有 `<html lang="zh-Hant">` / `<html lang="en">`。

## 跨 segment 搜尋

Pagefind 預設只搜尋「當前 segment」（由 `<html lang>` 決定）。

如果想做「全站搜尋」（不限語言）：

```js
// 載入全部 segment
const segments = ['zh-hant', 'zh-tw', 'en'];
const searches = await Promise.all(
  segments.map(s => import(`/pagefind/pagefind.${s}_${hash}.pf_meta`).then(/* ... */))
);
```

複雜度太高，**實際上不建議**。建議：

- 中文頁只搜中文 segment
- 英文頁只搜英文 segment
- 跨語言用「語言切換器」UI 引導

## 單語言 site 的 segment

如果站只有繁中（`<html lang="zh-Hant">` 全部頁），`npx pagefind` 只產 `pagefind.zh-hant_*.pf_meta`，沒有 `en`。

加英文內容後：

```powershell
npx pagefind --site dist --output-path dist/pagefind
# 新增 pagefind.en_*.pf_meta
```

舊的 zh-hant segment 也會 rebuild（如果 src 有改）。

## Segment 過期檢測

`astro/dist/pagefind/pagefind-entry.json` 內有 segment 列表：

```json
{
  "version": "1.3.0",
  "languages": {
    "zh-hant": { "hash": "86183d6ec3854a9", "page_count": 42 },
    "en": { "hash": "b1d1bb3c96", "page_count": 8 }
  }
}
```

如果 `hash` 跟實際 `.pf_meta` 檔名對不上 → index 過期。

檢測 script：

```python
import json
import re
from pathlib import Path

pf_dir = Path(r"D:\project\astro\dist\pagefind")
entry = json.load(open(pf_dir / "pagefind-entry.json"))
for lang, info in entry["languages"].items():
    expected_hash = info["hash"]
    actual = list(pf_dir.glob(f"pagefind.{lang}_*.pf_meta"))
    if not actual:
        print(f"❌ {lang}: 找不到 .pf_meta")
    elif expected_hash not in str(actual[0]):
        print(f"❌ {lang}: hash 不對 {expected_hash} vs {actual[0].name}")
    else:
        print(f"✅ {lang}: {actual[0].name} ({info['page_count']} 頁)")
```

## 多語言 + 排除組合

```powershell
# 只索引中文，排除英文頁面（罕見，但 debug 用）
npx pagefind --site dist --output-path dist/pagefind --exclude-selectors "[lang='en']"
```

或：

```powershell
# 排除所有 lang='en' 頁面
npx pagefind --site dist --output-path dist/pagefind --glob "**/zh-Hant/**"
```
