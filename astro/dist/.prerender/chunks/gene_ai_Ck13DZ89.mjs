import { c as createComponent } from './astro-component_DIKdwFAr.mjs';
import 'piccolore';
import { c as createRenderInstruction, r as renderComponent, a as renderTemplate, m as maybeRenderHead } from './prerender_OQTAnlvW.mjs';
import { $ as $$Base } from './Base_msUDbCzB.mjs';

async function renderScript(result, id) {
  const inlined = result.inlinedScripts.get(id);
  let content = "";
  if (inlined != null) {
    if (inlined) {
      content = `<script type="module">${inlined}</script>`;
    }
  } else {
    const resolved = await result.resolve(id);
    content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"></script>`;
  }
  return createRenderInstruction({ type: "script", id, content });
}

const $$GeneAi = createComponent(async ($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "基因資料平台 | 序列資料庫 × 知識庫 × RAG", "description": "基因資料平台——保留真實可用的 Sequence Vault、Knowledge Vault 與 RAG-ready documents，直接連接 FastAPI 與資料庫。", "bodyPage": "gene_ai", "pageStyles": ["/styles/gene_ai.css"], "pageScripts": ["/scripts/app-config.js", "/scripts/gene_ai.js"] }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div data-site-nav></div> <header class="hero"> <div class="hero-grid"> <div> <div class="eyebrow"><span class="live-dot"></span>Genome Data Platform · Live Sequence + Knowledge + RAG</div> <h1>把序列資料、知識檢索與 RAG 文件<br><span>收進同一個基因資料平台</span></h1> <p class="hero-sub">真接後端的基因資料平台：序列快取、知識庫與 RAG 文件，三層同步、全部可驗證。</p> <div class="hero-note">全 API-backed，無前端模擬介面。</div> <div class="hero-cta-row"> <a href="#product-overview" class="btn btn-primary">查看產品能力</a> <a href="#sequence-vault" class="btn btn-secondary">進入 Sequence Vault</a> <a href="#rag-layer" class="btn btn-secondary">查看 RAG 輸出</a> </div> <div class="hero-stats"> <div class="hero-stat"><div class="value">2 Live APIs</div><div class="label">序列 + 知識 · FastAPI 後端</div></div> <div class="hero-stat"><div class="value">DB-backed</div><div class="label">資料庫快取即時讀取</div></div> <div class="hero-stat"><div class="value">RAG-ready</div><div class="label">chunks + metadata 直接輸出</div></div> </div> </div> <div class="signal-card"> <div class="signal-top"> <div class="signal-title">Product Runtime Snapshot</div> <div class="status-pill">Live Data</div> </div> <div class="signal-matrix"> <div class="signal-block"><div class="k">Live Data Layer</div><div class="v">Sequence Cache · Knowledge Cache</div></div> <div class="signal-block"><div class="k">Knowledge Retrieval</div><div class="v">Evidence Search · Source Metadata</div></div> <div class="signal-block"><div class="k">RAG Output</div><div class="v">Chunk Preview · Retrieval-ready Docs</div></div> <div class="signal-block"><div class="k">Operations</div><div class="v">Sync · Search · Filter · Delete</div></div> </div> <div class="signal-list"> <div class="signal-item"><div class="left">Sequence sync</div><div class="right">UniProt / Ensembl → Render DB</div></div> <div class="signal-item"><div class="left">Knowledge sync</div><div class="right">UniProt / PubMed → RAG-ready docs</div></div> <div class="signal-item"><div class="left">RAG export</div><div class="right">Chunk + metadata preview from backend</div></div> </div> </div> </div> </header> <main class="container"> <section id="product-overview" class="section section-tight"></section> <section id="runtime-status" class="section"></section> <section id="sequence-vault" class="section"></section> <section id="sequencing-run-vault" class="section"></section> <section id="knowledge-vault" class="section"></section> <section id="rag-layer" class="section cta-band"></section> </main> <div data-site-footer></div> <button class="scroll-top" aria-label="返回頂部">↑</button> <button id="chatbot-toggle" aria-label="AI 助手">💬</button> <div id="chatbot-panel"> <div class="chatbot-header"> <h4>AI 助手</h4> <button class="chatbot-close" aria-label="關閉">✕</button> </div> <div id="chatbot-messages"> <div class="chat-msg chat-bot">你好！有什麼關於基因 AI 平台的問題嗎？</div> </div> <div class="chatbot-input-row"> <input id="chatbot-input" type="text" placeholder="輸入訊息..." autocomplete="off"> <button id="chatbot-send">送出</button> </div> </div> ${renderScript($$result2, "D:/project/astro/src/pages/gene_ai.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "D:/project/astro/src/pages/gene_ai.astro", void 0);

const $$file = "D:/project/astro/src/pages/gene_ai.astro";
const $$url = "/gene_ai.html";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$GeneAi,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
