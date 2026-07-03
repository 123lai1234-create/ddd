// ════════════════════════════════════════════════════════════════════════════
// chatbot.js — Portfolio AI Assistant (intent-aware, project-aware)
// ════════════════════════════════════════════════════════════════════════════
//
// Self-contained ES module loaded by the portfolio pages. Features:
//
//   A. Preset triggers    — keyword/synonym match → auto highlight relevant project
//   B. Proactive listing  — every reply can attach 1-4 related project cards
//   C. Multi-turn memory  — localStorage history + per-project interest score
//   D. Opening mode       — first visit shows greeting + featured project picker
//
// Reply flow:
//   1. detect intent (preset triggers)
//   2. try LLM via same-origin /api/chat proxy — graceful failure
//   3. fall back to intent-driven smart reply (always works, no LLM needed)
//   4. attach cards for the matched project + same-category peers
//
// Storage key: 'chatbot-state-v2' (bump on schema changes).
//
// ════════════════════════════════════════════════════════════════════════════

'use strict';

// ─── 1. PROJECT REGISTRY ─────────────────────────────────────────────────────
// Each entry: id, title, subtitle, url, icon, category, keywords[], summary
// `keywords` are matched case-insensitively against the user message.

const PROJECTS = [
  // ── Bio / Health ──────────────────────────────────────────────────────────
  {
    id: 'protein-ai',
    title: '蛋白質 AI 設計',
    subtitle: 'ESM-2 · ProteinMPNN · Bayesian Opt',
    url: '/report',
    icon: '🧬',
    category: 'bio',
    keywords: ['蛋白質', 'protein', 'esm', 'esm-2', 'proteinmpnn', 'mpnn',
               'rosetta', 'fold', '折疊', '序列設計', 'sequence design',
               '氨基酸', 'amino acid', '語言模型', 'language model',
               'reinforce', 'rl ', 'rl微調', 'ppi', 'binder'],
    summary: '從序列到結構的 AI 設計 pipeline：ESM-2 嵌入、Bayesian Optimization 找最佳採樣條件、ProteinMPNN 設計序列、REINFORCE 微調。'
  },
  {
    id: 'protein-mpnn',
    title: 'ProteinMPNN 互動工作台',
    subtitle: '瀏覽器即時序列設計 + 3D 預覽',
    url: '/protein-mpnn',
    icon: '🧪',
    category: 'bio',
    keywords: ['proteinmpnn', 'mpnn', '互動', 'interactive', '3d 預覽',
               '突變', 'mutation', 'rosetta 評分', '設計工具', '工作台'],
    summary: '把 ProteinMPNN 塞進瀏覽器：輸入序列、選固定位置、即時看 3D 結構與突變著色。'
  },
  {
    id: 'gene-ai',
    title: '基因 AI 平台',
    subtitle: '序列 · 知識庫 · RAG',
    url: '/gene-ai',
    icon: '🔬',
    category: 'bio',
    keywords: ['基因', 'gene', 'crispr', '啟動子', 'promoter',
               '序列', 'dna', 'rna', '變異', 'variant',
               'knowledge', '知識庫', 'rag', 'ot ', 'opentargets',
               'pathway', 'pathways'],
    summary: '把序列資料、知識文件、變異效應評估整合成一個即時可用的基因資料平台。'
  },
  {
    id: 'ngs',
    title: 'NGS 次世代定序',
    subtitle: '實驗設計 + QC + 功能分析',
    url: '/ngs',
    icon: '📊',
    category: 'bio',
    keywords: ['ngs', '定序', 'sequencing', 'rna-seq', 'rnaseq', 'wgs',
               'scRNA', '單細胞', 'single cell', 'qc', 'reads',
               'coverage', '覆蓋度', 'fastq', 'bam', 'vcf'],
    summary: '從實驗設計（深度估算、read 配置）一路到 QC、功能分析的完整 NGS 工作站。'
  },
  {
    id: 'stem-cell',
    title: '幹細胞研究',
    subtitle: '細胞治療與再生醫學背景',
    url: '/stem-cell',
    icon: '🧫',
    category: 'bio',
    keywords: ['幹細胞', 'stem cell', 'stemcell', 'ipsc', '再生',
               'regenerative', '細胞治療', 'cell therapy',
               '分化', 'differentiation'],
    summary: '我的碩士背景：幹細胞與再生醫學研究，現在延伸到 AI 蛋白質設計。'
  },
  {
    id: 'thesis',
    title: '論文 · 遺傳演算法',
    subtitle: 'PPTS × GAPPTS 量化研究',
    url: '/thesis',
    icon: '📝',
    category: 'bio',
    keywords: ['論文', 'thesis', '遺傳演算法', 'genetic algorithm',
               'ga ', 'evolution', '演化', 'ppts', 'gappts',
               '回測', 'backtest', '台股', 'twse', 'etf50',
               '族群', 'population', 'fitness'],
    summary: '重建 PPTS × GAPPTS 論文：用 48 檔 ETF50 股票池做族群演化交易策略，附逐檔回測與視覺化。'
  },

  // ── Engineering / Tech ─────────────────────────────────────────────────────
  {
    id: 'firmware',
    title: '韌體工程',
    subtitle: 'Cortex-M0 MCU + EBI + RGB LCD',
    url: '/firmware',
    icon: '⚙️',
    category: 'engineering',
    keywords: ['韌體', 'firmware', 'cortex', 'mcu', 'nano130',
               'keil', 'j-link', 'jlink', 'ebi', 'rgb565',
               'spi', 'i2c', 'uart', 'embedded', 'embedded',
               'arm', '暫存器', 'register', '中斷', 'interrupt'],
    summary: '從 datasheet 到實機驅動的完整流程：EBI 並列匯流排、RGB565 影像輸出、Keil 工具鏈 + J-Link。'
  },
  {
    id: 'interactive',
    title: '互動作品',
    subtitle: 'Three.js · WebGL · Shader',
    url: '/interactive-showcase',
    icon: '🎮',
    category: 'engineering',
    keywords: ['互動', 'interactive', 'three.js', 'threejs', 'webgl',
               'shader', 'glsl', '粒子', 'particle', '動畫',
               'animation', '遊戲', 'game', 'canvas', 'gsap',
               'three', '3d'],
    summary: 'Three.js + 自寫 GLSL shader 的互動作品集：粒子背景、滾動觸發、3D 場景。'
  },
  {
    id: 'video-gen',
    title: 'AI 影片生成',
    subtitle: 'Seedance × 文字生影片',
    url: '/video-gen',
    icon: '🎬',
    category: 'engineering',
    keywords: ['影片', 'video', 'seedance', 'text-to-video',
               't2v', '生影片', 'video gen', '短片'],
    summary: '用 Seedance 2.0 從文字直接生成影片，整合 prompt 優化與分鏡腳本。'
  },
  {
    id: 'tools',
    title: '小工具集',
    subtitle: '音訊轉譜 · 歌詞對齊 · 量化',
    url: '/tools',
    icon: '🛠️',
    category: 'engineering',
    keywords: ['工具', 'tool', 'utility', '小工具', '轉譜',
               'whisper', 'audio', '音訊', '歌詞', 'lyrics',
               '對齊', 'align'],
    summary: '各種小型實用工具：Whisper 轉譜、歌詞對齊、即時資料小面板。'
  },
  {
    id: 'music',
    title: '音樂平台',
    subtitle: 'AI 寫歌 · 歌詞生成',
    url: '/music',
    icon: '🎵',
    category: 'engineering',
    keywords: ['音樂', 'music', '歌曲', 'song', '寫歌', 'lyrics',
               'lyric', 'tts', '音樂生成', 'music gen', '作曲'],
    summary: 'AI 寫歌 pipeline：MiniMax 文字生音樂、歌詞對齊、TTS 旁白生成。'
  },

  // ── Personal / Meta ────────────────────────────────────────────────────────
  {
    id: 'about',
    title: '關於我',
    subtitle: '雙碩士 · 跨域工程師',
    url: '/about',
    icon: '👤',
    category: 'personal',
    keywords: ['關於', 'about', '你', '你是', '自我介紹', '介紹',
               '背景', 'background', '經歷', '履歷', 'cv',
               '雙碩士', 'dual master'],
    summary: '電資工程 × 生物醫學雙碩士，把研究經驗轉成可操作的產品系統。'
  },
  {
    id: 'works',
    title: '全部作品',
    subtitle: '完整作品集總覽',
    url: '/works',
    icon: '💼',
    category: 'personal',
    keywords: ['作品', 'works', 'portfolio', '總覽', 'overview',
               '所有專案', 'all projects'],
    summary: '所有專案一覽，依主題篩選、含即時 API 統計。'
  },
  {
    id: 'interview',
    title: '面試準備',
    subtitle: '模擬問答 + 數學推導',
    url: '/interview',
    icon: '🎯',
    category: 'personal',
    keywords: ['面試', 'interview', '準備', 'prep', '模擬',
               '問答', 'qa', '衝刺', 'sprint', '六週',
               'math', '數學推導'],
    summary: '六週衝刺計劃、模擬面試問答、技術數學推導筆記。'
  },
  {
    id: 'diving',
    title: '潛水 · 龍洞',
    subtitle: '風浪預報 + 即時資料',
    url: '/diving',
    icon: '🤿',
    category: 'personal',
    keywords: ['潛水', 'diving', 'dive', '龍洞', 'longdong',
               '風浪', 'wind', 'wave', 'marine', '海象',
               'open-meteo', 'cwa'],
    summary: '龍洞和美國小即時海況：Open-Meteo 風浪預報、CWA 浮標觀測、最佳下水時段。'
  },
];

// Featured subset shown in opening mode (curated: 6 diverse entries)
const FEATURED_IDS = ['protein-ai', 'gene-ai', 'firmware', 'thesis', 'diving', 'interactive'];

// ─── 2. CATEGORIES (for grouping related projects) ──────────────────────────

const CATEGORIES = {
  bio: { label: '生物 × AI', emoji: '🧬' },
  engineering: { label: '工程 × 互動', emoji: '⚙️' },
  personal: { label: '個人 × 日常', emoji: '🌱' },
};

// ─── 3. STATE (localStorage) ─────────────────────────────────────────────────

const STORAGE_KEY = 'chatbot-state-v2';
const HISTORY_MAX = 30;     // total turns kept (incl. system-side)
const HISTORY_SEND = 12;    // sent to LLM (sliding window)

function defaultState() {
  return {
    history: [],          // [{role:'user'|'assistant', content, ts, projectIds:[]}]
    interests: {},        // {projectId: score}
    openedBefore: false,  // for opening-mode gate
    dismissedWelcome: false,
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch {
    return defaultState();
  }
}

function saveState() {
  try {
    // Cap history to last N turns to keep storage tiny
    if (state.history.length > HISTORY_MAX) {
      state.history = state.history.slice(-HISTORY_MAX);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* quota — silently drop */
  }
}

function bumpInterest(projectId, weight = 1) {
  if (!projectId) return;
  state.interests[projectId] = (state.interests[projectId] || 0) + weight;
}

// Return top-N project IDs by interest score (descending)
function topInterests(n = 3) {
  return Object.entries(state.interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}

// ─── 4. INTENT DETECTION (preset triggers) ──────────────────────────────────

function detectIntent(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const p of PROJECTS) {
    for (const kw of p.keywords) {
      if (kw && lower.includes(kw.toLowerCase())) {
        hits.push({ project: p, keyword: kw });
        break; // one keyword per project is enough
      }
    }
  }
  // Stable order: by category, then by interest score
  const catOrder = { bio: 0, engineering: 1, personal: 2 };
  hits.sort((a, b) => {
    const ca = catOrder[a.project.category] ?? 9;
    const cb = catOrder[b.project.category] ?? 9;
    if (ca !== cb) return ca - cb;
    const ia = state.interests[a.project.id] || 0;
    const ib = state.interests[b.project.id] || 0;
    return ib - ia;
  });
  return hits;
}

// ─── 5. LLM CALL (optional, with graceful failure) ──────────────────────────
// Two-tier fallback:
//   Tier 1: same-origin /api/chat proxy (preferred when deployed)
//   Tier 2: smart intent-based reply (always works, no key needed)
//
// We intentionally do NOT call api.anthropic.com directly from the browser:
//   - CORS requires `anthropic-dangerous-direct-browser-access: true` which
//     exposes the API key in shipped JS (security hole)
//   - The /api/chat proxy is the supported path when it exists

const SYSTEM_PROMPT = `你是這個作品集網站的 AI 助手。回答請用繁體中文，簡潔專業，不超過 180 字。
作者背景：電資工程與生物醫學雙碩士。作品集涵蓋蛋白質 AI、基因平台、NGS、韌體、互動作品、AI 影片生成、音樂、潛水等。
當用戶提到某個關鍵詞時，請聚焦回答那個領域；其他時候可引導用戶挑選有興趣的專案。`;

async function callLLM(text) {
  const recent = state.history.slice(-HISTORY_SEND).map(h => ({
    role: h.role, content: h.content,
  }));
  recent.push({ role: 'user', content: text });

  // Try /api/chat proxy (same-origin)
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: SYSTEM_PROMPT, messages: recent }),
    });
    if (res.ok) {
      const data = await res.json();
      const reply = data.reply ?? data.content?.[0]?.text ?? null;
      if (reply) return reply;
    }
  } catch { /* fall through */ }

  return null;
}

// ─── 6. SMART FALLBACK (always works, no LLM) ────────────────────────────────

function smartReply(intents, isFirstMessage) {
  if (intents.length === 0) {
    // No clear topic → invite exploration
    const featured = FEATURED_IDS
      .map(id => PROJECTS.find(p => p.id === id))
      .filter(Boolean);
    return {
      text: isFirstMessage
        ? '嗨！我是這個作品集的 AI 助手。這裡 16 個專案我都熟，告訴我你有興趣的領域（講講蛋白質、基因、韌體、潛水⋯），我直接幫你挑重點。也可以從下面幾張卡開始 ↓'
        : '想了解哪個領域？從這幾張卡開始 ↓',
      cards: featured,
      mode: 'suggest',
    };
  }

  const top = intents[0];
  const related = PROJECTS
    .filter(p => p.id !== top.project.id && p.category === top.project.category)
    .slice(0, 3);

  // Pick a couple of cross-category cards if user showed other interests
  const crossCategory = PROJECTS
    .filter(p => p.id !== top.project.id && p.category !== top.project.category)
    .filter(p => (state.interests[p.id] || 0) > 0)
    .slice(0, 1);

  return {
    text: `你提到「${top.keyword}」，這部分我有專門的「${top.project.title}」。${top.project.summary} 想直接看嗎？`,
    cards: [top.project, ...related, ...crossCategory],
    mode: 'match',
  };
}

// ─── 7. UI RENDERING ─────────────────────────────────────────────────────────

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      e.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== undefined && v !== null) {
      e.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function addMessage(role, text, opts = {}) {
  const msgs = $('#chatbot-messages');
  if (!msgs) return;

  const d = el('div', { class: `chat-msg chat-${role}` },
    opts.html ? el('div', { class: 'chat-html' }, opts.html) : null,
    text ? document.createTextNode(text) : null
  );
  // Use innerHTML for safety-controlled content (cards rendered separately)
  if (opts.html) d.classList.add('chat-msg-rich');
  msgs.appendChild(d);

  // Optional project cards
  if (opts.cards && opts.cards.length) {
    appendCards(opts.cards);
  }

  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function appendCards(projects) {
  const msgs = $('#chatbot-messages');
  if (!msgs) return;
  const wrap = el('div', { class: 'chat-cards' });
  for (const p of projects) {
    wrap.appendChild(renderCard(p));
  }
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function renderCard(p) {
  return el('a', {
    class: 'chat-card',
    href: p.url,
    'data-project-id': p.id,
    onclick: (e) => {
      // Don't navigate if user is just reading; allow normal click for navigation
      bumpInterest(p.id, 2);
      saveState();
      return true;
    },
  },
    el('div', { class: 'chat-card-icon' }, p.icon || '·'),
    el('div', { class: 'chat-card-body' },
      el('div', { class: 'chat-card-title' }, p.title),
      el('div', { class: 'chat-card-sub' }, p.subtitle || ''),
    ),
    el('div', { class: 'chat-card-arrow' }, '→')
  );
}

// Opening greeting (project picker)
function showOpeningMode() {
  if (state.openedBefore && !state.history.length) return;

  const featured = FEATURED_IDS
    .map(id => PROJECTS.find(p => p.id === id))
    .filter(Boolean);

  addMessage('bot', '嗨！我是這個作品集的 AI 助手 🤖 挑一張開始，或直接打字問我 ↓', {
    cards: featured,
  });

  state.openedBefore = true;
  saveState();
}

// ─── 8. TYPING INDICATOR ────────────────────────────────────────────────────

function setBusy(busy) {
  const input = $('#chatbot-input');
  const send = $('#chatbot-send');
  if (!input || !send) return;
  input.disabled = busy;
  send.disabled = busy;
  const existing = $('#chat-typing');
  if (existing) existing.remove();
  if (busy) {
    const t = el('div', { id: 'chat-typing', class: 'chat-msg chat-bot chat-typing' });
    t.innerHTML = '<span></span><span></span><span></span>';
    const msgs = $('#chatbot-messages');
    if (msgs) {
      msgs.appendChild(t);
      msgs.scrollTop = msgs.scrollHeight;
    }
  }
}

// ─── 9. MAIN FLOW ───────────────────────────────────────────────────────────

async function handleSubmit() {
  const input = $('#chatbot-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  const isFirstMessage = state.history.length === 0;

  // Echo user message
  addMessage('user', text);
  state.history.push({ role: 'user', content: text, ts: Date.now() });

  // Detect intent (preset triggers — A)
  const intents = detectIntent(text);
  // Bump interest for matched projects
  intents.forEach(h => bumpInterest(h.project.id, 1));

  setBusy(true);

  // Try LLM; fall back to smart reply if it fails
  let reply = null;
  try {
    reply = await callLLM(text);
  } catch { /* swallow */ }

  let final;
  if (reply) {
    final = {
      text: reply,
      cards: intents.length > 0
        ? intents.map(h => h.project)
        : PROJECTS.slice(0, 4),
      mode: 'llm',
    };
  } else {
    final = smartReply(intents, isFirstMessage);
  }

  state.history.push({
    role: 'assistant',
    content: final.text,
    ts: Date.now(),
    projectIds: (final.cards || []).map(c => c.id),
    mode: final.mode,
  });

  // Bump interest for cards shown (B)
  (final.cards || []).forEach(c => bumpInterest(c.id, 0.5));

  setBusy(false);
  addMessage('bot', final.text, { cards: final.cards });
  saveState();
}

function clearHistory() {
  if (!confirm('清除對話紀錄？')) return;
  state = defaultState();
  saveState();
  const msgs = $('#chatbot-messages');
  if (msgs) {
    msgs.innerHTML = '';
    showOpeningMode();
  }
}

// ─── 10. BOOT ────────────────────────────────────────────────────────────────

function boot() {
  const toggle = $('#chatbot-toggle');
  const panel = $('#chatbot-panel');
  const close = $('#chatbot-close') || $('.chatbot-close');
  const send = $('#chatbot-send');
  const input = $('#chatbot-input');
  const messages = $('#chatbot-messages');

  if (!toggle || !panel) {
    console.warn('[chatbot] missing toggle/panel — not booting');
    return;
  }

  // Restore history if any
  if (messages && state.history.length) {
    messages.innerHTML = '';
    for (const h of state.history) {
      if (h.role === 'user') addMessage('user', h.content);
      else addMessage('bot', h.content);
      if (h.projectIds && h.projectIds.length) {
        const projs = h.projectIds
          .map(id => PROJECTS.find(p => p.id === id))
          .filter(Boolean);
        if (projs.length) appendCards(projs);
      }
    }
  }

  // Opening mode on first ever open
  let firstOpen = !state.openedBefore;
  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      if (firstOpen && !state.history.length) {
        showOpeningMode();
        firstOpen = false;
      }
    }
  });
  if (close) close.addEventListener('click', () => panel.classList.remove('open'));

  if (send) send.addEventListener('click', handleSubmit);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    });
  }

  // Optional: clear button (added if element exists)
  const clearBtn = $('#chatbot-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearHistory);

  console.log('[chatbot] booted — %d projects, %d history turns',
              PROJECTS.length, state.history.length);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Expose for debugging / testing
window.__chatbot = { PROJECTS, state, detectIntent, smartReply };