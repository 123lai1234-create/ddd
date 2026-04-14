/**
 * Dynamic features: Vanta.js, GSAP ScrollTrigger, tsParticles,
 * Lottie, GitHub API, Cytoscape.js, Plotly, Pyodide, Anthropic chatbot.
 *
 * Each feature initializes only if its target DOM element exists on the page.
 * CDN libs are loaded lazily on demand.
 */

/* ── Lazy CDN loader ──────────────────────────────────────────────────────── */

const _loaded = new Set();
function loadScript(url, id) {
  if (_loaded.has(id || url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => { _loaded.add(id || url); resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadCSS(url) {
  if (_loaded.has(url)) return;
  _loaded.add(url);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = url;
  document.head.appendChild(l);
}

/* ── 1. Vanta.js DNA background ───────────────────────────────────────────── */

async function initVantaDNA() {
  const el = document.querySelector('.hero-canvas');
  if (!el) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js', 'three');
    await loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js', 'vanta');
    if (!window.VANTA) return;
    window._vantaEffect = window.VANTA.NET({
      el,
      mouseControls: true,
      touchControls: true,
      minHeight: 400,
      minWidth: 200,
      scale: 1.0,
      scaleMobile: 1.0,
      color: 0x58d7ff,
      backgroundColor: 0x0a1116,
      points: 8,
      maxDistance: 22,
      spacing: 18,
      showDots: true,
    });
  } catch { /* Vanta unavailable — silent degrade */ }
}

/* ── 2. GSAP ScrollTrigger ────────────────────────────────────────────────── */

async function initGSAP() {
  const reveals = document.querySelectorAll('section, .card, .metric-card, .algo-card, .surface-card, .runtime-card, .explore-card, .img-card, .faq-item');
  if (!reveals.length) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'gsap');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', 'scrolltrigger');
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    reveals.forEach((el, i) => {
      gsap.from(el, {
        y: 40, opacity: 0, duration: 0.7,
        delay: (i % 4) * 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
      });
    });

    // Animate stat numbers
    document.querySelectorAll('.hero-stat .val, .metric-val').forEach(el => {
      const target = parseFloat(el.textContent);
      if (!isFinite(target)) return;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.6, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
        onUpdate: () => {
          el.textContent = target >= 100 ? Math.round(obj.v) : obj.v.toFixed(1);
        },
      });
    });
  } catch { /* GSAP unavailable */ }
}

/* ── 3. tsParticles molecular background ──────────────────────────────────── */

async function initParticles() {
  const el = document.getElementById('tsparticles');
  if (!el) return;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/tsparticles-slim@2/tsparticles.slim.bundle.min.js', 'tsparticles');
    if (!window.tsParticles) return;
    await tsParticles.load('tsparticles', {
      fullScreen: false,
      particles: {
        number: { value: 18 },
        color: { value: ['#58d7ff', '#7bf0be', '#b59cff'] },
        shape: { type: 'circle' },
        opacity: { value: 0.15, random: true },
        size: { value: { min: 1, max: 2 } },
        links: { enable: true, distance: 100, color: '#58d7ff', opacity: 0.06 },
        move: { enable: true, speed: 0.4, direction: 'none', outModes: 'bounce' },
      },
      interactivity: {
        events: {
          onHover: { enable: true, mode: 'grab' },
          onClick: { enable: false },
        },
        modes: {
          grab: { distance: 120, links: { opacity: 0.15 } },
        },
      },
    });
  } catch { /* tsParticles unavailable */ }
}

/* ── 4. Lottie micro-animations ───────────────────────────────────────────── */

async function initLottie() {
  const containers = document.querySelectorAll('[data-lottie]');
  if (!containers.length) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js', 'lottie');
    if (!window.lottie) return;
    containers.forEach(el => {
      const src = el.dataset.lottie;
      if (!src) return;
      lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: el.dataset.lottieLoop !== 'false',
        autoplay: true,
        path: src,
      });
    });
  } catch { /* Lottie unavailable */ }
}

/* ── 5. GitHub API activity ───────────────────────────────────────────────── */

async function initGitHubFeed() {
  const container = document.getElementById('github-feed');
  if (!container) return;
  try {
    const user = container.dataset.user || 'onlyforwork2026';
    const resp = await fetch(`https://api.github.com/users/${user}/events/public?per_page=6`,
      { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return;
    const events = await resp.json();

    container.innerHTML = events.slice(0, 5).map(ev => {
      const repo = ev.repo?.name || '';
      const type = ev.type.replace('Event', '');
      const date = new Date(ev.created_at).toLocaleDateString('zh-TW');
      let detail = '';
      if (ev.type === 'PushEvent') {
        const commits = ev.payload?.commits || [];
        detail = commits[0]?.message?.split('\n')[0] || '';
      } else if (ev.type === 'CreateEvent') {
        detail = `${ev.payload?.ref_type || ''} ${ev.payload?.ref || ''}`;
      }
      return `<div class="gh-event">
        <span class="gh-type">${type}</span>
        <span class="gh-repo">${repo.split('/')[1] || repo}</span>
        <span class="gh-detail">${detail.slice(0, 60)}</span>
        <span class="gh-date">${date}</span>
      </div>`;
    }).join('');
  } catch { /* GitHub API unavailable */ }
}

/* ── 6. Cytoscape.js protein network ──────────────────────────────────────── */

async function initCytoscape() {
  const container = document.getElementById('cytoscape-network');
  if (!container) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.29.2/cytoscape.min.js', 'cytoscape');
    if (!window.cytoscape) return;

    // Fetch interaction data from our API
    const apiBase = typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function'
      ? await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'cytoscape' })
      : '';
    let interactions = [];
    if (apiBase) {
      try {
        const resp = await fetch(`${apiBase}/api/interactions?limit=30`, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) interactions = (await resp.json()).records || [];
      } catch { /* use demo data */ }
    }

    // Build graph elements
    const nodes = new Set();
    const edges = [];
    if (interactions.length > 0) {
      interactions.forEach(i => {
        nodes.add(i.proteinA);
        nodes.add(i.proteinB);
        edges.push({ data: { source: i.proteinA, target: i.proteinB, score: i.combinedScore } });
      });
    } else {
      // Demo data
      const demo = [['TP53', 'MDM2'], ['TP53', 'BRCA1'], ['BRCA1', 'BARD1'], ['MDM2', 'CDKN2A'],
        ['TP53', 'ATM'], ['BRCA1', 'RAD51'], ['ATM', 'CHEK2'], ['TP53', 'EP300']];
      demo.forEach(([a, b]) => { nodes.add(a); nodes.add(b); edges.push({ data: { source: a, target: b, score: 800 } }); });
    }

    const cy = cytoscape({
      container,
      elements: [
        ...[...nodes].map(id => ({ data: { id } })),
        ...edges,
      ],
      style: [
        { selector: 'node', style: {
          'background-color': '#58d7ff', 'label': 'data(id)', 'color': '#e9f0ec',
          'font-size': '11px', 'text-valign': 'bottom', 'text-margin-y': 6,
          'width': 28, 'height': 28, 'border-width': 2, 'border-color': 'rgba(88,215,255,0.3)',
        }},
        { selector: 'edge', style: {
          'width': 2, 'line-color': 'rgba(88,215,255,0.25)',
          'curve-style': 'bezier',
        }},
      ],
      layout: { name: 'cose', animate: true, animationDuration: 800, nodeRepulsion: 6000 },
      userZoomingEnabled: true,
      userPanningEnabled: true,
    });
  } catch { /* Cytoscape unavailable */ }
}

/* ── 7. Plotly.js interactive charts ──────────────────────────────────────── */

async function initPlotly() {
  const containers = document.querySelectorAll('[data-plotly]');
  if (!containers.length) return;
  try {
    await loadScript('https://cdn.plot.ly/plotly-2.32.0.min.js', 'plotly');
    if (!window.Plotly) return;
    const dark = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#94a59f' }, xaxis: { gridcolor: '#1e2730' }, yaxis: { gridcolor: '#1e2730' } };

    containers.forEach(el => {
      const type = el.dataset.plotly;
      if (type === 'volcano') {
        const n = 200;
        const x = Array.from({ length: n }, () => (Math.random() - 0.5) * 8);
        const y = Array.from({ length: n }, () => Math.random() * 10);
        const colors = x.map((v, i) => Math.abs(v) > 1.5 && y[i] > 3 ? (v > 0 ? '#ff6b6b' : '#58d7ff') : '#3a4550');
        Plotly.newPlot(el, [{ x, y, mode: 'markers', type: 'scatter',
          marker: { color: colors, size: 5, opacity: 0.7 } }],
          { ...dark, margin: { t: 20, b: 40, l: 50, r: 20 }, xaxis: { ...dark.xaxis, title: 'log₂FC' },
            yaxis: { ...dark.yaxis, title: '-log₁₀(p)' } },
          { responsive: true, displayModeBar: false });
      } else if (type === 'heatmap') {
        const z = Array.from({ length: 10 }, () => Array.from({ length: 8 }, () => (Math.random() - 0.5) * 4));
        Plotly.newPlot(el, [{ z, type: 'heatmap', colorscale: [[0, '#2563eb'], [0.5, '#0a1116'], [1, '#dc2626']] }],
          { ...dark, margin: { t: 10, b: 30, l: 30, r: 10 } }, { responsive: true, displayModeBar: false });
      }
    });
  } catch { /* Plotly unavailable */ }
}

/* ── 8. Pyodide Python runner ─────────────────────────────────────────────── */

async function initPyodide() {
  const runBtn = document.getElementById('pyodide-run');
  const codeEl = document.getElementById('pyodide-code');
  const outputEl = document.getElementById('pyodide-output');
  if (!runBtn || !codeEl || !outputEl) return;

  let pyodide = null;

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.textContent = '載入 Python...';
    outputEl.textContent = '';

    if (!pyodide) {
      try {
        await loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js', 'pyodide');
        pyodide = await loadPyodide();
        await pyodide.loadPackage(['numpy']);
      } catch (e) {
        outputEl.textContent = `Pyodide 載入失敗: ${e.message}`;
        runBtn.disabled = false;
        runBtn.textContent = '▶ 執行 Python';
        return;
      }
    }

    runBtn.textContent = '執行中...';
    try {
      pyodide.runPython('import sys; from io import StringIO; _buf = StringIO(); sys.stdout = _buf');

      const stratM = document.getElementById('strat-m');
      const stratHold = document.getElementById('strat-hold');
      const stratTarget = document.getElementById('strat-target');
      let userCode = codeEl.value || codeEl.textContent;
      if (stratM || stratHold || stratTarget) {
        const clamp = (v, lo, hi, def) => {
          const n = Number(v);
          if (!Number.isFinite(n)) return def;
          return Math.min(hi, Math.max(lo, n));
        };
        const m = clamp(stratM?.value, 2, 20, 8);
        const hold = clamp(stratHold?.value, 1, 30, 5);
        const target = clamp(stratTarget?.value, 0.5, 20, 3.0);
        userCode = userCode
          .replace(/^hold_days\s*=.*$/m, `hold_days = ${Math.round(hold)}`)
          .replace(/^m\s*=.*$/m, `m = ${Math.round(m)}  # 價格區間數`)
          .replace(/^target_profit\s*=.*$/m, `target_profit = ${target}  # 目標利潤 %`);
      }
      pyodide.runPython(userCode);
      const out = pyodide.runPython('_buf.getvalue()');
      outputEl.textContent = out || '(no output)';
    } catch (e) {
      outputEl.textContent = `Error: ${e.message}`;
    }
    runBtn.disabled = false;
    runBtn.textContent = '▶ 執行 Python';
  });
}

/* ── 9. Anthropic chatbot widget ──────────────────────────────────────────── */

function initChatbot() {
  // Only init if chat elements exist
  const toggle = document.getElementById('chatbot-toggle');
  const panel = document.getElementById('chatbot-panel');
  const input = document.getElementById('chatbot-input');
  const send = document.getElementById('chatbot-send');
  const messages = document.getElementById('chatbot-messages');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && input) input.focus();
  });

  const closeBtn = panel.querySelector('.chatbot-close');
  if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  if (!send || !input || !messages) return;

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    messages.innerHTML += `<div class="chat-msg chat-user">${escapeHtml(text)}</div>`;
    messages.innerHTML += `<div class="chat-msg chat-bot chat-typing">思考中...</div>`;
    messages.scrollTop = messages.scrollHeight;

    try {
      const apiBase = typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function'
        ? await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'chatbot' })
        : '';
      // Proxy through our backend to avoid exposing API key
      const resp = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(30000),
      });
      const typing = messages.querySelector('.chat-typing');
      if (typing) typing.remove();

      if (resp.ok) {
        const data = await resp.json();
        messages.innerHTML += `<div class="chat-msg chat-bot">${escapeHtml(data.reply || '...')}</div>`;
      } else {
        messages.innerHTML += `<div class="chat-msg chat-bot">目前無法回應，請稍後再試。</div>`;
      }
    } catch {
      const typing = messages.querySelector('.chat-typing');
      if (typing) typing.remove();
      messages.innerHTML += `<div class="chat-msg chat-bot">連線失敗，請確認後端已啟動。</div>`;
    }
    messages.scrollTop = messages.scrollHeight;
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

/* ── Init all ─────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initVantaDNA();
  initGSAP();
  initParticles();
  initLottie();
  initGitHubFeed();
  initCytoscape();
  initPlotly();
  initPyodide();
  initChatbot();
});
