# Pagefind Search UI 整合（3 種選項）

## 選項 A — 預設 UI（最快，給一般使用）

完整 UI 開箱即用：搜尋框、結果列表、分頁、highlight。

```html
<!-- 放頁面 head -->
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script src="/pagefind/pagefind-ui.js"></script>

<!-- 放 body 任意位置 -->
<div id="search"></div>

<script>
  window.addEventListener('DOMContentLoaded', () => {
    new PagefindUI({
      element: '#search',
      showImages: false,
      showSubResults: true,        // 顯示 sub-section（h2 / h3 拆結果）
      resetStyles: false,          // 保留 host 站 CSS
      processResult: (result) => { /* custom hook */ },
      processTerm: (term) => term,
      debounceTimeMs: 200,
    });
  });
</script>
```

優點：5 分鐘整合。
缺點：外觀固定，要客製需用 CSS override。

### CSS Override

預設 UI 用 `[data-pagefind-ui-root]` 跟 sub-attributes 標記元素：

```css
/* 搜尋框 */
[data-search-input] {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.5rem;
  font-size: 1rem;
}

/* 結果列表 */
[data-result-list] { list-style: none; padding: 0; }
[data-result] { margin: 1rem 0; padding: 0.5rem; border-bottom: 1px solid #eee; }
[data-result-title] { font-size: 1.1rem; color: #0066cc; }

/* 高亮 */
[data-result-excerpt] mark { background: yellow; }
```

## 選項 B — 模組化 UI（中等自由）

```js
import { PagefindUI } from '/pagefind/pagefind-component-ui.js';
new PagefindUI({
  element: '#search',
  showImages: false,
  showSubResults: true,
});
```

跟預設 UI 類似，但用 component-based architecture 方便客製每個部分。

## 選項 C — 完全自寫（最高自由）

```js
// 動態 import pagefind module
const pagefindModule = await import('/pagefind/pagefind.js');
const pagefind = pagefindModule.search || pagefindModule.default?.search;
if (!pagefind) throw new Error('Pagefind search fn not found');

let timeoutId;
const searchInput = document.querySelector('#search-input');
const resultsEl = document.querySelector('#search-results');

searchInput.addEventListener('input', (e) => {
  clearTimeout(timeoutId);
  const q = e.target.value;
  if (!q) { resultsEl.innerHTML = ''; return; }
  timeoutId = setTimeout(async () => {
    const search = await pagefind(q);
    if (search.results.length === 0) { resultsEl.innerHTML = '<p>沒結果</p>'; return; }
    const results = await Promise.all(search.results.slice(0, 10).map(r => r.data()));
    resultsEl.innerHTML = results.map(r => `
      <article>
        <h2><a href="${r.url}">${r.title || r.url}</a></h2>
        <p>${r.excerpt}</p>
        ${r.meta?.date ? `<time>${r.meta.date}</time>` : ''}
        ${r.meta?.category ? `<span class="cat">${r.meta.category}</span>` : ''}
      </article>
    `).join('');
  }, 200);
});
```

優點：完全控制 render、filter、sort、UI。
缺點：要自己寫 ~30 行。

## Debounce + Cache

```js
let debounceId;
let lastQuery = null;
let lastResults = null;

searchInput.addEventListener('input', (e) => {
  clearTimeout(debounceId);
  const q = e.target.value.trim();
  if (!q) { resultsEl.innerHTML = ''; return; }
  if (q === lastQuery) { renderResults(lastResults); return; }  // cache
  debounceId = setTimeout(async () => {
    const search = await pagefind(q);
    lastQuery = q;
    lastResults = search.results;
    renderResults(search.results);
  }, 200);
});
```

debounce 200ms 足夠避免「每按一個鍵都查」。

## Filter / Sort 用 metadata

```js
// 搜尋 "GLB" + filter category = 3D
const search = await pagefind('GLB', {
  filters: { category: '3D' },
});
// 結果只有 category=3D 的頁
```

或後處理：

```js
const results = await Promise.all(search.results.map(r => r.data()));
const filtered = results.filter(r => r.meta?.category === '3D');
```

## Keyboard shortcut

```js
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.querySelector('#search-input')?.focus();
  }
  if (e.key === 'Escape') {
    document.querySelector('#search-input')?.blur();
  }
});
```

`/` 聚焦搜尋框（GitHub / Vercel 風格）。

## Mobile responsive

預設 UI 已經 responsive（CSS media query）。自寫 UI 需注意：

```css
@media (max-width: 640px) {
  [data-pagefind-ui-root] { padding: 0.5rem; }
  [data-result-title] { font-size: 1rem; }
}
```

## Astro 整合最佳實踐

`astro/src/components/Search.astro`：

```astro
---
// components/Search.astro
---
<div id="search" data-pagefind-ui-root></div>
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<script>
  import { PagefindUI } from '/pagefind/pagefind-ui.js';
  new PagefindUI({ element: '#search' });
</script>
```

但 `/pagefind/...` 是 build output，Astro dev server 不會自動 serve — 開發模式要自己處理：

```js
// dev 模式用 stub
if (import.meta.env.DEV) {
  // mock search results
}
```

或只 production build 啟用搜尋。
