/**
 * Shared interactive enhancements — scroll progress, page transitions,
 * card glow tracking, keyboard shortcuts, chatbot quick replies, live stats.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    initScrollProgress();
    initPageTransition();
    initCardGlow();
    initKeyboardShortcuts();
    initChatQuickReplies();
    initLiveStats();
    initWeatherWidget();
    initUnsplashHero();
    initToast();
  });

  /* ── 1. Scroll progress bar ──────────────────────────────────────────────── */
  function initScrollProgress() {
    const bar = document.createElement('div');
    bar.id = 'scroll-progress';
    document.body.appendChild(bar);

    window.addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = h > 0 ? (window.scrollY / h * 100) + '%' : '0%';
    }, { passive: true });
  }

  /* ── 2. Page load transition ─────────────────────────────────────────────── */
  function initPageTransition() {
    const cover = document.createElement('div');
    cover.className = 'page-transition';
    document.body.appendChild(cover);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => cover.classList.add('done'));
    });
    cover.addEventListener('transitionend', () => cover.remove());
  }

  /* ── 3. Card glow follow cursor ──────────────────────────────────────────── */
  function initCardGlow() {
    const sel = '.explore-card, .chart-card, .metric-card, .work-card, .service-card';
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest(sel);
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mouse-x', (e.clientX - r.left) + 'px');
      card.style.setProperty('--mouse-y', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ── 4. Keyboard shortcuts ───────────────────────────────────────────────── */
  function initKeyboardShortcuts() {
    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-overlay';
    overlay.innerHTML = `
      <div class="shortcuts-box">
        <h3>快捷鍵</h3>
        <div class="shortcut-row">
          <span class="shortcut-label">顯示此面板</span>
          <span class="shortcut-keys"><span class="shortcut-key">?</span></span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-label">回到頂部</span>
          <span class="shortcut-keys"><span class="shortcut-key">T</span></span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-label">首頁</span>
          <span class="shortcut-keys"><span class="shortcut-key">G</span> <span class="shortcut-key">H</span></span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-label">作品總覽</span>
          <span class="shortcut-keys"><span class="shortcut-key">G</span> <span class="shortcut-key">W</span></span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-label">開啟 AI 助手</span>
          <span class="shortcut-keys"><span class="shortcut-key">G</span> <span class="shortcut-key">C</span></span>
        </div>
        <div class="shortcut-row">
          <span class="shortcut-label">管理員模式</span>
          <span class="shortcut-keys"><span class="shortcut-key">Ctrl</span> <span class="shortcut-key">Shift</span> <span class="shortcut-key">L</span></span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });

    let pendingG = false;
    let gTimer = null;

    document.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.target.isContentEditable) return;

      // ? — toggle shortcuts overlay
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        overlay.classList.toggle('open');
        return;
      }

      // Escape — close overlay
      if (e.key === 'Escape' && overlay.classList.contains('open')) {
        overlay.classList.remove('open');
        return;
      }

      // T — scroll to top
      if (e.key === 't' || e.key === 'T') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      // G + key combos (vim-style go-to)
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        if (!pendingG) {
          pendingG = true;
          gTimer = setTimeout(() => { pendingG = false; }, 800);
          return;
        }
      }

      if (pendingG) {
        clearTimeout(gTimer);
        pendingG = false;
        const k = e.key.toLowerCase();
        if (k === 'h') { window.location.href = '/'; return; }
        if (k === 'w') { window.location.href = '/works'; return; }
        if (k === 'c') {
          const toggle = document.getElementById('chatbot-toggle');
          if (toggle) toggle.click();
          return;
        }
      }
    });
  }

  /* ── 5. Chatbot quick replies ────────────────────────────────────────────── */
  function initChatQuickReplies() {
    const messages = document.getElementById('chatbot-messages');
    const input = document.getElementById('chatbot-input');
    const send = document.getElementById('chatbot-send');
    if (!messages || !input || !send) return;

    const replies = [
      '這個作品集有哪些項目？',
      '你的技術背景是什麼？',
      'ProteinMPNN 是什麼？',
      '如何聯絡你？',
    ];

    const container = document.createElement('div');
    container.className = 'chat-quick-replies';
    replies.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'chat-quick-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        input.value = text;
        send.click();
        container.remove();
      });
      container.appendChild(btn);
    });

    messages.after(container);
  }

  /* ── 6. Homepage live stats from API ─────────────────────────────────────── */
  function initLiveStats() {
    const hero = document.getElementById('hero');
    if (!hero) return;

    const bar = document.createElement('div');
    bar.className = 'live-stats-bar reveal';
    bar.innerHTML = `
      <div class="live-stat"><div class="live-val" data-stat="sequences">—</div><div class="live-lbl">蛋白質序列</div></div>
      <div class="live-stat"><div class="live-val" data-stat="knowledge">—</div><div class="live-lbl">知識庫條目</div></div>
      <div class="live-stat"><div class="live-val" data-stat="variants">—</div><div class="live-lbl">變異紀錄</div></div>
      <div class="live-stat"><div class="live-val" data-stat="inquiries">—</div><div class="live-lbl">訪客留言</div></div>
    `;

    // Insert after hero-stats
    const heroContent = hero.querySelector('.hero-content');
    if (heroContent) heroContent.appendChild(bar);

    // Fetch stats from API
    fetchLiveStats(bar);
  }

  async function fetchLiveStats(bar) {
    const resolveBase = typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function'
      ? window.APP_CONFIG_UTILS.resolveApiBase
      : async () => '';

    try {
      const base = await resolveBase({ cacheKey: 'livestats' });
      const endpoints = {
        sequences: `${base}/api/sequences/summary`,
        knowledge: `${base}/api/knowledge/summary`,
        variants: `${base}/api/variants/summary`,
        inquiries: `${base}/api/inquiries/stats`,
      };

      const results = await Promise.allSettled(
        Object.entries(endpoints).map(async ([key, url]) => {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) return { key, count: null };
          const data = await resp.json();
          return { key, count: data.total_count ?? data.count ?? data.total ?? null };
        })
      );

      results.forEach(r => {
        if (r.status !== 'fulfilled' || r.value.count == null) return;
        const el = bar.querySelector(`[data-stat="${r.value.key}"]`);
        if (el) {
          animateCount(el, r.value.count);
          el.closest('.live-stat').classList.add('loaded');
        }
      });
    } catch { /* silently fail — stats are non-critical */ }
  }

  function animateCount(el, target) {
    const duration = 600;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(ease * target).toLocaleString();
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── 7. Weather widget (OpenWeatherMap — no key needed for basic) ─────────── */
  function initWeatherWidget() {
    const hero = document.getElementById('hero');
    if (!hero) return;

    const widget = document.createElement('div');
    widget.className = 'weather-widget';
    widget.innerHTML = '<span class="weather-loading">...</span>';
    hero.appendChild(widget);

    fetchWeather(widget);
  }

  async function fetchWeather(widget) {
    try {
      // Use wttr.in — no API key needed
      const resp = await fetch('https://wttr.in/Taipei?format=%c%t&lang=zh-tw', {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const text = (await resp.text()).trim();
      widget.innerHTML = `<span class="weather-icon">${text.charAt(0)}</span><span class="weather-text">Taipei ${text.slice(1)}</span>`;
      widget.classList.add('loaded');
    } catch { widget.remove(); }
  }

  /* ── 8. Unsplash dynamic hero background ─────────────────────────────────── */
  function initUnsplashHero() {
    const canvas = document.querySelector('.hero-canvas');
    if (!canvas) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'https://source.unsplash.com/1920x1080/?biotechnology,laboratory,dna,science';
    img.addEventListener('load', () => {
      canvas.style.backgroundImage = `linear-gradient(rgba(8,12,16,0.82), rgba(8,12,16,0.92)), url(${img.src})`;
      canvas.style.backgroundSize = 'cover';
      canvas.style.backgroundPosition = 'center';
      canvas.classList.add('unsplash-loaded');
    });
  }

  /* ── 9. Toast notification system ────────────────────────────────────────── */
  function initToast() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);

    window._toast = (message, type = 'info', duration = 4000) => {
      const el = document.createElement('div');
      el.className = `toast toast-${type}`;
      el.textContent = message;
      container.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        el.addEventListener('transitionend', () => el.remove());
      }, duration);
    };

    // Global fetch error listener
    window.addEventListener('unhandledrejection', (e) => {
      if (e.reason?.name === 'AbortError') return;
      if (e.reason?.message?.includes('fetch')) {
        window._toast?.('網路連線失敗，請檢查網路', 'error');
      }
    });
  }
})();
