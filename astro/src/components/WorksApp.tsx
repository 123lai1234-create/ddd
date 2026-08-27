import React, { useState, useMemo } from 'react';

// Work cards data
const worksData = [
  {
    id: 1,
    categories: ['biomed', 'local'],
    kicker: 'Local · Protein AI',
    title: '蛋白質設計 AI 作品集',
    desc: '用 ESM-2、Bayesian Optimization、ProteinMPNN 與 RL 串起蛋白質設計流程，展示把研究模型轉成可操作作品集頁面的能力。',
    meta: [
      { k: '角色', v: '平台整合 / 技術敘事' },
      { k: '關鍵詞', v: 'Protein AI · RL · BO' },
      { k: '價值', v: '研究成果可展示化' },
    ],
    tags: ['ESM-2', 'Bayesian Optimization', 'ProteinMPNN', 'Interactive Portfolio'],
    links: [{ text: '開啟首頁', href: '/' }, { text: '查看報告', href: '/report' }],
    score: '本站主軸',
  },
  {
    id: 2,
    categories: ['local'],
    kicker: 'Local · 碩士論文',
    title: '遺傳演算法交易策略最佳化',
    desc: '以 PPTS 結合 GAPPTS，在元大台灣 50 的 48 檔股票上逐檔搜尋最佳參數。頁面可互動觀察族群演化、逐檔回測與方法比較。',
    meta: [
      { k: '角色', v: '演算法研究 / 量化策略' },
      { k: '關鍵詞', v: 'GAPPTS · ETF50 · 區間利潤' },
      { k: '價值', v: '論文成果互動化' },
    ],
    tags: ['遺傳演算法', 'PPTS', 'GAPPTS', 'ETF50', '交易回測'],
    links: [{ text: '開啟互動展示', href: '/thesis' }],
    score: '互動展示',
  },
  {
    id: 3,
    categories: ['local', 'biomed', 'platform'],
    kicker: 'Local · Genome AI',
    title: '基因資料平台',
    desc: '保留真實可用的 Sequence Vault、Knowledge Vault 與 RAG 文件輸出，讓公開資料同步、快取檢索與文件分塊能在同一頁直接驗證。',
    meta: [
      { k: '角色', v: '資料平台 / API-backed UI' },
      { k: '關鍵詞', v: 'Sequence Cache · Knowledge Cache · RAG' },
      { k: '價值', v: '把 research data layer 做成可操作產品面' },
    ],
    tags: ['FastAPI', 'Postgres Cache', 'UniProt / PubMed', 'RAG Documents'],
    links: [{ text: '開啟頁面', href: '/gene-ai' }],
    score: '互動工作台',
  },
  {
    id: 4,
    categories: ['biomed', 'interface'],
    kicker: 'Biomed · Sequencing',
    title: 'NGS 工作站 / 次世代定序主題',
    desc: '原始個人網站中已經有 NGS 相關介紹，現在又在本站延伸出完整的 NGS 實驗設計指南，形成研究與作品集的前後呼應。',
    meta: [
      { k: '角色', v: '生醫分析 / 教學化展示' },
      { k: '關鍵詞', v: 'NGS · QC · Variant' },
      { k: '價值', v: '研究內容系統化輸出' },
    ],
    tags: ['NGS', 'Bioinformatics', 'Clinical Context'],
    links: [{ text: '本站 NGS 頁', href: '/ngs' }],
    score: '與本站直接對接',
  },
  {
    id: 5,
    categories: ['platform', 'interface'],
    kicker: 'Automation · Interface',
    title: '自動化機器手臂操作介面',
    desc: '這個作品把硬體操作、流程控制與使用者介面接起來，展示不只會資料分析，也有實驗端操作情境的第一手理解。',
    meta: [
      { k: '角色', v: '實驗設備 UI / Workflow' },
      { k: '關鍵詞', v: 'Automation · Lab UI' },
      { k: '價值', v: '資料流與設備流整合' },
    ],
    tags: ['Automation', 'Lab Interface', 'Workflow'],
    links: [{ text: '影片展示', href: 'https://youtu.be/0dn6aEmVToY' }],
    score: 'Lab workflow UI',
  },
  {
    id: 6,
    categories: ['interface', 'platform'],
    kicker: 'Health · App',
    title: '簡易健康檢測 APP',
    desc: '面向健康量測與資料紀錄的應用設計，體現在醫療場景中設計可用產品與使用者體驗的能力。',
    meta: [
      { k: '角色', v: 'App 規劃 / 互動設計' },
      { k: '關鍵詞', v: 'Health App · Measurement' },
      { k: '價值', v: '醫療資料產品化' },
    ],
    tags: ['App', 'Health', 'UI'],
    links: [{ text: '作品影片', href: 'https://www.youtube.com/watch?v=0ycF7xh6WME' }],
    score: '醫療場景介面',
  },
  {
    id: 7,
    categories: ['platform'],
    kicker: 'System · Data',
    title: '資料管理系統',
    desc: '資料治理、查詢與管理能力，是研究平台能不能真正被持續使用的關鍵。這類作品補足本站 AI 頁面背後需要的系統思維。',
    meta: [
      { k: '角色', v: '系統設計 / 資料組織' },
      { k: '關鍵詞', v: 'Database · CRUD · Ops' },
      { k: '價值', v: 'AI 平台後台基礎' },
    ],
    tags: ['Database', 'Management', 'System'],
    links: [{ text: '原始文章', href: 'https://jtlai0921.wixsite.com/mysite/post/資料庫管理系統' }],
    score: '平台骨架能力',
  },
  {
    id: 8,
    categories: ['interface'],
    kicker: 'Interactive · Python',
    title: 'Pygame Dino',
    desc: '雖然不是生醫題材，但它展示 Python 互動應用與即時邏輯設計的基本功，補充了作品集完整的軟體實作底子。',
    meta: [
      { k: '角色', v: 'Python 互動開發' },
      { k: '關鍵詞', v: 'Pygame · Real-time Logic' },
      { k: '價值', v: '基礎程式實作能力' },
    ],
    tags: ['Python', 'Pygame', 'Interactive'],
    links: [{ text: '作品影片', href: 'https://www.youtube.com/watch?v=EvhITMTTl48' }],
    score: '互動開發基礎',
  },
  {
    id: 9,
    categories: ['interface'],
    kicker: 'Browser Game · Canvas 2D',
    title: '仙俠傳 · 回合制 RPG',
    desc: '純瀏覽器、零依賴的回合制 RPG，仙劍奇俠傳風格。三位角色、三張地圖、完整戰鬥 AI、裝備技能系統，全以 Canvas 2D API 手繪實作。',
    meta: [
      { k: '技術', v: 'Canvas 2D · Vanilla JS' },
      { k: '特色', v: '回合制 AI · 存檔系統' },
      { k: '類型', v: '完整遊戲實作' },
    ],
    tags: ['JavaScript', 'Canvas', 'RPG', 'Game Design'],
    links: [{ text: '立即遊玩', href: '/games/xian/' }],
    score: '完整遊戲',
  },
];

const filters = [
  { id: 'all', label: '全部' },
  { id: 'biomed', label: '生醫 / NGS' },
  { id: 'platform', label: '平台 / 系統' },
  { id: 'interface', label: '互動介面' },
  { id: 'local', label: '本站新頁面' },
];

export default function WorksApp() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Filter works
  const filteredWorks = useMemo(() => {
    return worksData.filter(work => {
      const matchFilter = activeFilter === 'all' || work.categories.includes(activeFilter);
      const matchSearch = !search || 
        work.title.toLowerCase().includes(search.toLowerCase()) ||
        work.desc.toLowerCase().includes(search.toLowerCase()) ||
        work.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
      return matchFilter && matchSearch;
    });
  }, [search, activeFilter]);

  return (
    <>
      <div data-site-nav />

      {/* Hero */}
      <header className="hero">
        <div className="hero-inner reveal">
          <div className="eyebrow"><span className="live-dot"></span>Works · Engineering × Biomedical · AI Platforms</div>
          <h1>把分散的經歷整理成<br /><span>一個可閱讀的作品地圖</span></h1>
          <p className="hero-sub">跨域作品一覽：研究主題、工具流程與介面產品，連成同一條能力線。</p>
          <div className="cta-row">
            <a href="/about" className="btn btn-primary">先看 About Me</a>
            <a href="https://jtlai0921.wixsite.com/mysite" target="_blank" rel="noreferrer" className="btn btn-secondary">原始個人網站</a>
          </div>
        </div>
      </header>

      <main className="container">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-copy">
            <h2>作品篩選</h2>
            <p>用分類篩選，快速掌握工程介面、生醫研究、資料平台與互動展示的作品分布。</p>
          </div>
          <div className="works-search-wrap">
            <input
              type="text"
              className="works-search-input"
              placeholder="🔍 搜尋作品名稱、技術、關鍵詞..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <span className="works-search-count">{filteredWorks.length} 筆結果</span>}
          </div>
          <div className="filters">
            {filters.map(f => (
              <button
                key={f.id}
                className={`filter-btn ${activeFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Works Grid */}
        <section className="works-grid">
          {filteredWorks.map(work => (
            <article key={work.id} className="work-card" data-cat={work.categories.join(' ')}>
              <div className="work-head">
                <div>
                  <div className="work-kicker">{work.kicker}</div>
                  <h3>{work.title}</h3>
                </div>
                <div className="score-pill">{work.score}</div>
              </div>
              <p className="work-desc">{work.desc}</p>
              <div className="meta-grid">
                {work.meta.map((m, i) => (
                  <div key={i} className="meta">
                    <div className="k">{m.k}</div>
                    <div className="v">{m.v}</div>
                  </div>
                ))}
              </div>
              <div className="tag-row">
                {work.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
              <div className="work-links">
                {work.links.map(link => (
                  <a key={link.text} href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                    {link.text}
                  </a>
                ))}
              </div>
            </article>
          ))}

          {filteredWorks.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
              <div style={{ fontSize: '2rem' }}>🔍</div>
              <p style={{ marginTop: '12px' }}>沒有符合條件的作品</p>
              <button className="btn btn-ghost" onClick={() => { setSearch(''); setActiveFilter('all'); }} style={{ marginTop: '16px' }}>
                清除篩選
              </button>
            </div>
          )}
        </section>
      </main>

      <div data-site-footer />
      <button className="scroll-top" aria-label="返回頂部">↑</button>
    </>
  );
}