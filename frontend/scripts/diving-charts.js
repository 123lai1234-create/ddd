/* ╔══════════════════════════════════════════════════════════════╗
   ║  🤿 Diving Charts — 純 SVG 動態視覺化(零依賴)               ║
   ║  1. 波浪背景動畫  2. 指標儀表板  3. 互動羅盤               ║
   ║  4. 時序圖  5. 季節雷達圖  6. 進場動畫                      ║
   ╚══════════════════════════════════════════════════════════════╝ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     0. 工具:數值 tween 動畫
     ───────────────────────────────────────────────────────────── */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  function tween(from, to, duration, onUpdate, onDone) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      onUpdate(from + (to - from) * easeOutCubic(t), t);
      if (t < 1) requestAnimationFrame(frame);
      else onDone && onDone();
    }
    requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────────────────────────────────
     1. 波浪背景(插在 .dive-hero 內)
     ───────────────────────────────────────────────────────────── */
  function mountWaves() {
    const hero = document.querySelector('.dive-hero');
    if (!hero || hero.querySelector('.hero-waves')) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'hero-waves');
    svg.setAttribute('viewBox', '0 0 1200 200');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <linearGradient id="waveGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#58d7ff" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#58d7ff" stop-opacity="0.02"/>
        </linearGradient>
        <linearGradient id="waveGrad2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#3fb950" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#3fb950" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path class="wave-back" fill="url(#waveGrad)"
            d="M0,100 Q300,60 600,100 T1200,100 V200 H0 Z"/>
      <path class="wave-front" fill="url(#waveGrad2)"
            d="M0,120 Q300,90 600,120 T1200,120 V200 H0 Z"/>
      <!-- 浮標 -->
      <g class="buoy" transform="translate(800,90)">
        <circle r="6" fill="#f85149"/>
        <line x1="0" y1="-6" x2="0" y2="-22" stroke="#f85149" stroke-width="1.5" opacity="0.6"/>
        <path d="M-5,-22 L5,-22 L0,-30 Z" fill="#f85149"/>
      </g>
    `;
    hero.appendChild(svg);
  }

  /* ─────────────────────────────────────────────────────────────
     2. 動態指標儀表板(8 個指標 → GO/CAUTION/NO-GO 條 + 大數字)
     ───────────────────────────────────────────────────────────── */
  // 從 CWA snapshot 動態計算指標值
  function buildIndicators(snap) {
    if (!snap) return null;
    // 能見度 CWA 沒給,先用週期推算(週期 ≥ 8s 通常能見度佳)
    const period = snap.wavePeriod;
    const visEst = period >= 8 ? 12 : period >= 6 ? 6 : 3;

    // 流速/潮汐:此浮標沒設備 → 用估算標籤
    // 假設一般岸潛條件
    return [
      { key: 'wave',   icon: '🌊', name: '浪高',   en: 'Wave',   unit: 'm',  v: snap.waveHeight, lo: 0.6,  hi: 1.2,  opt: [0.3, 0.5] },
      { key: 'wind',   icon: '🌬️', name: '風速',   en: 'Wind',   unit: 'm/s',v: snap.windSpeed,  lo: 5.0,  hi: 8.0,  opt: [2.0, 4.0] },
      { key: 'wdir',   icon: '🧭', name: '風向',   en: 'Wind Dir', unit: '°',v: snap.windDir?.deg, lo: 180, hi: 270, opt: [70, 110], angular: true, unit_label: '°' },
      { key: 'period', icon: '📏', name: '週期',   en: 'Period', unit: 's', v: snap.wavePeriod, lo: 7.0,  hi: 9.0,  opt: [10, 13], reverse: true },
      { key: 'temp',   icon: '🌡️', name: '水溫',   en: 'Temp',   unit: '°C',v: snap.seaTemp,   lo: 21,   hi: 28,   opt: [25, 27] },
      { key: 'vis',    icon: '👁️', name: '能見度', en: 'Vis',    unit: 'm', v: visEst,         lo: 3.0,  hi: 8.0,  opt: [10, 20], reverse: true, est: true },
      { key: 'current',icon: '🌀', name: '流速',   en: 'Current',unit: 'kn',v: null,           lo: 0.5,  hi: 1.0,  opt: [0.0, 0.3], na: true },
      { key: 'tide',   icon: '🌙', name: '潮汐',   en: 'Tide',   unit: '',  v: '—',            lo: 0,    hi: 0,    opt: [0, 0], na: true }
    ];
  }

  function levelOf(ind, v) {
    if (ind.na || v == null) return 'na';
    const { lo, hi, opt, reverse } = ind;
    if (reverse) {
      if (v >= opt[0]) return 'go';
      if (v >= hi) return 'caution';
      return 'nogo';
    }
    if (v < lo) return 'go';
    if (v < hi) return 'caution';
    return 'nogo';
  }

  function mountDashboard(snap) {
    const target = document.getElementById('dive-dashboard');
    if (!target) return;

    const indicators = buildIndicators(snap) || getFallbackIndicators();
    const grid = document.createElement('div');
    grid.className = 'dash-grid';
    indicators.forEach((ind) => {
      const lvl = levelOf(ind, ind.v);
      const card = document.createElement('div');
      card.className = `dash-card lvl-${lvl}`;
      card.dataset.key = ind.key;
      card.innerHTML = `
        <div class="dash-bar"><span class="dash-bar-fill"></span></div>
        <div class="dash-icon">${ind.icon}</div>
        <div class="dash-name">${ind.name}${ind.est ? ' <span class="dash-est" title="此浮標無觀測,以週期估算">≈</span>' : ''}</div>
        <div class="dash-value">
          <span class="dash-num">${formatValue(ind.v, ind)}</span>
          <span class="dash-unit">${ind.unit || ''}</span>
        </div>
        <div class="dash-track">
          <div class="dash-track-zones">
            <span class="zone z-go"></span>
            <span class="zone z-caution"></span>
            <span class="zone z-nogo"></span>
          </div>
          ${ind.na ? '' : `<div class="dash-needle" style="left:${needlePos(ind, ind.v)}%"></div>`}
        </div>
        <div class="dash-badge">${badgeText(lvl)}</div>
      `;
      grid.appendChild(card);
    });
    target.appendChild(grid);

    // 進場動畫
    const cards = grid.querySelectorAll('.dash-card');
    cards.forEach((card, i) => {
      const ind = indicators[i];
      const numEl = card.querySelector('.dash-num');
      const finalV = ind.v;
      if (typeof finalV !== 'number') return;
      numEl.textContent = '0';
      tween(0, finalV, 900 + i * 80, (cur) => {
        numEl.textContent = formatValue(cur, ind);
      });
    });

    // 總體判定
    const summary = document.getElementById('dive-dash-summary');
    if (summary) {
      const nogoCount = indicators.filter(i => levelOf(i, i.v) === 'nogo').length;
      const cautionCount = indicators.filter(i => levelOf(i, i.v) === 'caution').length;
      const goCount = indicators.filter(i => levelOf(i, i.v) === 'go').length;
      let cls, label, msg;
      if (nogoCount > 0) {
        cls = 'nogo'; label = `🔴 NO-GO · ${nogoCount} 項紅燈`;
        msg = '建議改期。潛水永遠有下一次。';
      } else if (cautionCount > 0) {
        cls = 'caution'; label = `🟡 CAUTION · ${cautionCount} 項黃燈`;
        msg = '看潛點經驗、人數、後備方案再決定。';
      } else {
        cls = 'go'; label = `🟢 GO · ${goCount}/${indicators.length - indicators.filter(i=>i.na).length} 項綠燈`;
        msg = '帶著愉快心情下水。';
      }
      summary.className = `dash-summary-box lvl-${cls}`;
      summary.innerHTML = `
        <div class="dsb-label">${label}</div>
        <div class="dsb-msg">${msg}</div>
        <div class="dsb-meta">資料來源:CWA 龍洞資料浮標 46694A · ${snap?.fetchedAt?.slice(11,16) || ''} 更新</div>
      `;
    }
  }

  function formatValue(v, ind) {
    if (v == null) return '—';
    if (typeof v === 'string') return v;
    return v.toFixed(v < 10 ? 1 : 0);
  }

  function getFallbackIndicators() {
    // 沒有資料時的 placeholder
    return [
      { key: 'wave', icon: '🌊', name: '浪高', unit: 'm', v: null, lo: 0.6, hi: 1.2, opt: [0.3, 0.5], na: true },
      { key: 'wind', icon: '🌬️', name: '風速', unit: 'm/s', v: null, lo: 5.0, hi: 8.0, opt: [2.0, 4.0], na: true },
      { key: 'wdir', icon: '🧭', name: '風向', unit: '°', v: null, lo: 180, hi: 270, opt: [70, 110], na: true },
      { key: 'period', icon: '📏', name: '週期', unit: 's', v: null, lo: 7.0, hi: 9.0, opt: [10, 13], reverse: true, na: true },
      { key: 'temp', icon: '🌡️', name: '水溫', unit: '°C', v: null, lo: 21, hi: 28, opt: [25, 27], na: true },
      { key: 'vis', icon: '👁️', name: '能見度', unit: 'm', v: null, lo: 3.0, hi: 8.0, opt: [10, 20], reverse: true, na: true },
      { key: 'current', icon: '🌀', name: '流速', unit: 'kn', v: null, lo: 0.5, hi: 1.0, opt: [0.0, 0.3], na: true },
      { key: 'tide', icon: '🌙', name: '潮汐', unit: '', v: null, na: true }
    ];
  }

  function badgeText(lvl) {
    return lvl === 'go' ? '🟢 GO' : lvl === 'caution' ? '🟡 CAUTION' : lvl === 'nogo' ? '🔴 NO-GO' : '⚪ N/A';
  }

  function needlePos(ind, v) {
    if (v == null) return 50;
    const min = ind.reverse ? Math.max(0, ind.opt[0] - 4) : 0;
    const max = ind.reverse ? ind.opt[0] + 4 : ind.hi * 1.5;
    return Math.max(2, Math.min(98, ((v - min) / (max - min)) * 100));
  }

  /* ─────────────────────────────────────────────────────────────
     3. 互動風向羅盤(用滑鼠拖指針 → 即時算安全等級)
     ───────────────────────────────────────────────────────────── */
  function mountInteractiveCompass() {
    const wrap = document.getElementById('dive-compass-interactive');
    if (!wrap) return;

    // 龍洞口朝東,定義安全區
    const SAFETY = [
      { from:  60, to: 120, level: 'go',      label: '迎岸風', hint: '海面白沫但不推人出海' },
      { from: 120, to: 160, level: 'caution', label: '沿岸',   hint: '需規劃出水點' },
      { from: 160, to: 200, level: 'caution', label: '沿岸',   hint: '漂移,小心' },
      { from: 200, to: 240, level: 'nogo',    label: '離岸',   hint: '推向外海 — 危險' },
      { from: 240, to: 300, level: 'nogo',    label: '離岸',   hint: '推向外海 — 最危險' },
      { from: 300, to: 360, level: 'caution', label: '沿岸',   hint: '需規劃出水點' },
      { from:   0, to:  60, level: 'caution', label: '沿岸',   hint: '漂移,小心' }
    ];
    const lookup = (deg) => {
      const d = ((deg % 360) + 360) % 360;
      return SAFETY.find(s => d >= s.from && d < s.to) || SAFETY[0];
    };

    wrap.innerHTML = `
      <div class="compass-interactive">
        <svg viewBox="-110 -110 220 220" xmlns="http://www.w3.org/2000/svg" aria-label="互動風向羅盤">
          <defs>
            <radialGradient id="ic-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#1c2438" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#0a0d14" stop-opacity="0.6"/>
            </radialGradient>
          </defs>
          <circle r="100" fill="url(#ic-bg)"/>
          <!-- 安全色塊 -->
          <g id="ic-sectors" opacity="0.7"></g>
          <!-- 刻度 -->
          <g stroke="rgba(120,180,255,0.4)" stroke-width="1" fill="none">
            <circle r="100"/>
            <circle r="86" stroke-opacity="0.18"/>
            <line x1="0" y1="-100" x2="0" y2="100" stroke-opacity="0.35" stroke-width="1.2"/>
            <line x1="-100" y1="0" x2="100" y2="0" stroke-opacity="0.35" stroke-width="1.2"/>
            <line x1="-70.7" y1="-70.7" x2="70.7" y2="70.7" stroke-opacity="0.18"/>
            <line x1="-70.7" y1="70.7" x2="70.7" y2="-70.7" stroke-opacity="0.18"/>
          </g>
          <!-- 標籤 -->
          <g font-family="'JetBrains Mono',monospace" font-weight="700" text-anchor="middle">
            <text x="0" y="-105" font-size="16" fill="#e6edf3">N</text>
            <text x="105" y="0" font-size="16" fill="#3fb950" dominant-baseline="middle">E</text>
            <text x="0" y="115" font-size="16" fill="#e6edf3" dominant-baseline="middle">S</text>
            <text x="-105" y="0" font-size="16" fill="#f85149" dominant-baseline="middle">W</text>
          </g>
          <!-- 入水方向箭頭 -->
          <path d="M18 0 L86 0 M86 0 L76 -7 M86 0 L76 7"
                stroke="#3fb950" stroke-width="2.4" fill="none" stroke-linecap="round"/>
          <text x="52" y="-9" text-anchor="middle" font-size="9" fill="#3fb950" font-weight="700">入水方向 →</text>
          <!-- 中心 -->
          <circle r="14" fill="rgba(88,215,255,0.18)" stroke="rgba(88,215,255,0.5)"/>
          <text y="-1" text-anchor="middle" font-size="14">🤿</text>
          <text y="14" text-anchor="middle" font-size="7" fill="#58d7ff" font-weight="600">龍洞口</text>
          <!-- 可拖動的指針(風從哪來) -->
          <g id="ic-needle" style="cursor:grab" transform="rotate(95)">
            <line x1="0" y1="0" x2="0" y2="-90" stroke="#58d7ff" stroke-width="3" stroke-linecap="round"/>
            <polygon points="0,-95 -7,-82 7,-82" fill="#58d7ff"/>
            <circle r="6" fill="#58d7ff" stroke="#fff" stroke-width="1.5"/>
          </g>
          <!-- 隱形拖曳區 -->
          <circle id="ic-handle" r="100" fill="transparent" style="cursor:grab"/>
        </svg>
        <div class="ic-readout">
          <div class="ic-row"><span class="ic-label">風向</span><span class="ic-val" id="ic-deg">95°</span></div>
          <div class="ic-row"><span class="ic-label">方位</span><span class="ic-val" id="ic-card">E</span></div>
          <div class="ic-result" id="ic-result">迎岸風 · 安全</div>
          <div class="ic-hint">拖圓盤上的箭頭(或點圓盤任一點)改變風向,看安全等級即時變化。</div>
        </div>
      </div>
    `;

    // 畫安全色塊
    const sectors = wrap.querySelector('#ic-sectors');
    SAFETY.forEach(s => {
      // 從 s.from 到 s.to,跨 0 時拆兩段
      const drawArc = (from, to, color) => {
        const a1 = (from - 90) * Math.PI / 180;
        const a2 = (to - 90) * Math.PI / 180;
        const x1 = Math.cos(a1) * 100, y1 = Math.sin(a1) * 100;
        const x2 = Math.cos(a2) * 100, y2 = Math.sin(a2) * 100;
        const large = (to - from) > 180 ? 1 : 0;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M0,0 L${x1.toFixed(2)},${y1.toFixed(2)} A100,100 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`);
        const fill = s.level === 'go' ? 'rgba(63,185,80,0.32)' :
                     s.level === 'caution' ? 'rgba(210,153,34,0.28)' :
                     'rgba(248,81,73,0.32)';
        path.setAttribute('fill', fill);
        sectors.appendChild(path);
      };
      if (s.to > s.from) drawArc(s.from, s.to);
      else { drawArc(s.from, 360, s.level); drawArc(0, s.to, s.level); }
    });

    const needle = wrap.querySelector('#ic-needle');
    const handle = wrap.querySelector('#ic-handle');
    const degEl = wrap.querySelector('#ic-deg');
    const cardEl = wrap.querySelector('#ic-card');
    const resultEl = wrap.querySelector('#ic-result');
    const svg = wrap.querySelector('svg');

    function setAngle(deg) {
      deg = ((deg % 360) + 360) % 360;
      needle.setAttribute('transform', `rotate(${deg})`);
      degEl.textContent = `${Math.round(deg)}°`;
      cardEl.textContent = degToCardinal(deg);
      const info = lookup(deg);
      resultEl.className = `ic-result lvl-${info.level}`;
      resultEl.textContent = `${info.label} · ${info.hint}`;
    }

    function degToCardinal(deg) {
      const cards = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return cards[Math.round(deg / 22.5) % 16];
    }

    function pointToAngle(evt) {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const x = (evt.clientX || evt.touches?.[0]?.clientX) - cx;
      const y = (evt.clientY || evt.touches?.[0]?.clientY) - cy;
      // SVG y 軸向下,所以 -y
      let deg = Math.atan2(-y, x) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      return deg;
    }

    let dragging = false;
    const startDrag = (e) => {
      dragging = true;
      needle.style.cursor = 'grabbing';
      handle.style.cursor = 'grabbing';
      setAngle(pointToAngle(e));
      e.preventDefault();
    };
    const moveDrag = (e) => {
      if (!dragging) return;
      setAngle(pointToAngle(e));
    };
    const endDrag = () => {
      dragging = false;
      needle.style.cursor = 'grab';
      handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', startDrag);
    handle.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', moveDrag);
    window.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
    handle.addEventListener('click', (e) => {
      if (e.target === handle && !dragging) setAngle(pointToAngle(e));
    });

    setAngle(95); // 預設東風
  }

  /* ─────────────────────────────────────────────────────────────
     4. 24h 模擬時序圖(浪高 + 風速 + 流速 三條折線)
     ───────────────────────────────────────────────────────────── */
  function mountTimeline(series) {
    const target = document.getElementById('dive-timeline');
    if (!target) return;

    // 沒有 CWA 資料時用模擬資料
    const hours = Array.from({ length: 25 }, (_, i) => i);
    let wave, wind, current;

    if (series) {
      // CWA series 是 49 點,hour 偏移 -1 為「現在前 1h」,0 為「現在」
      // 取現在 + 未來 24 小時(index 1..25,跳過 index 0 的 placeholder)
      const slice = (arr) => (arr || []).slice(1, 26).map(v => v == null ? null : v);
      wave = slice(series.waveHeight);
      wind = slice(series.windSpeed);
      // currentSpeedms 此浮標無資料 → 用週期當代理(週期大 → 流弱)
      const period = slice(series.wavePeriod);
      current = period.map(p => p == null ? null : Math.max(0.1, 1.2 - p / 12));
    } else {
      // fallback 模擬
      wave = hours.map(h => 0.4 + 0.8 * Math.sin((h - 6) / 24 * Math.PI * 2) + (Math.random() - 0.5) * 0.2);
      wind = hours.map(h => 3.5 + 4.0 * Math.abs(Math.sin((h - 9) / 24 * Math.PI)) + (Math.random() - 0.5) * 0.5);
      current = hours.map(h => 0.2 + 0.6 * Math.abs(Math.sin((h - 3) / 12 * Math.PI)) + (Math.random() - 0.5) * 0.1);
    }

    const W = 800, H = 240, P = { l: 40, r: 16, t: 20, b: 32 };
    const innerW = W - P.l - P.r;
    const innerH = H - P.t - P.b;

    function scale(v, min, max) { return P.t + innerH * (1 - (v - min) / (max - min)); }
    const xAt = (h) => P.l + (h / 24) * innerW;

    function path(arr, min, max) {
      // null 點斷線(分多段子路徑)
      const segments = [[]];
      arr.forEach((v, i) => {
        if (v == null) {
          if (segments[segments.length - 1].length) segments.push([]);
        } else {
          segments[segments.length - 1].push([i, scale(v, min, max)]);
        }
      });
      return segments
        .filter(seg => seg.length > 0)
        .map(seg => seg.map(([i, y], j) => `${j === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${y.toFixed(1)}`).join(' '))
        .join(' ');
    }

    // y 軸刻度
    const yTicks = (min, max, steps) => {
      let html = '';
      for (let i = 0; i <= steps; i++) {
        const v = min + (max - min) * (i / steps);
        const y = scale(v, min, max);
        html += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="rgba(120,180,255,0.06)"/>`;
        html += `<text x="${P.l - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#8b949e" text-anchor="end">${v.toFixed(1)}</text>`;
      }
      return html;
    };

    // x 軸刻度(每 3 小時)
    const xTicks = hours.filter(h => h % 3 === 0).map(h =>
      `<text x="${xAt(h).toFixed(1)}" y="${H - 10}" font-size="10" fill="#8b949e" text-anchor="middle">${h}:00</text>`
    ).join('');

    // 「現在」垂直線(index 1 = 真正的「現在」,index 0 是 1 小時前)
    const nowIdx = 1;
    const nowX = xAt(nowIdx);

    target.innerHTML = `
      <div class="timeline-legend">
        <span><i style="background:#58d7ff"></i> 浪高 (m)</span>
        <span><i style="background:#3fb950"></i> 風速 (m/s)</span>
        <span><i style="background:#d29922"></i> 流速 (kn,推算)</span>
        <span class="timeline-now"><i style="background:#f85149"></i> 現在</span>
      </div>
      <svg class="timeline-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
        ${yTicks(0, 3, 3)}
        ${xTicks}
        <line x1="${nowX.toFixed(1)}" y1="${P.t}" x2="${nowX.toFixed(1)}" y2="${H - P.b}"
              stroke="#f85149" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.7"/>
        <text x="${nowX.toFixed(1)}" y="${P.t - 6}" font-size="10" fill="#f85149" text-anchor="middle" font-weight="700">現在</text>
        <!-- 警戒線 -->
        <line x1="${P.l}" y1="${scale(1.2, 0, 3).toFixed(1)}" x2="${W - P.r}" y2="${scale(1.2, 0, 3).toFixed(1)}"
              stroke="#f85149" stroke-width="0.8" stroke-dasharray="2 4" opacity="0.4"/>
        <text x="${W - P.r - 4}" y="${(scale(1.2, 0, 3) - 4).toFixed(1)}" font-size="9" fill="#f85149" text-anchor="end" opacity="0.7">浪 NO-GO 線</text>
        <!-- 折線 -->
        <path class="tl-line" d="${path(wave, 0, 3)}" stroke="#58d7ff" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="tl-line" d="${path(wind, 0, 8)}" stroke="#3fb950" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path class="tl-line" d="${path(current, 0, 1.5)}" stroke="#d29922" stroke-width="2" fill="none" stroke-linecap="round"/>
        <!-- 資料點 -->
        ${wave.map((v, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${scale(v, 0, 3).toFixed(1)}" r="2.5" fill="#58d7ff"/>`).join('')}
        ${wind.map((v, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${scale(v, 0, 8).toFixed(1)}" r="2.5" fill="#3fb950"/>`).join('')}
      </svg>
      <p class="timeline-foot">
        ${series
          ? '📊 資料來源:CWA 龍洞資料浮標 46694A — 過去 1h + 未來 23h 預報。流速為推估值(此浮標無流速計,以週期代理)。'
          : '📊 模擬資料(展示用)。實接 CWA 46694A 後會自動切換。'}
      </p>
    `;

    // 折線繪製動畫(opacity fade-in,因為現在 path 是多段斷線)
    const lines = target.querySelectorAll('.tl-line');
    lines.forEach((line, idx) => {
      line.style.opacity = 0;
      line.style.transition = 'opacity 0.9s ease-out';
      setTimeout(() => { line.style.opacity = 1; }, 200 + idx * 150);
    });
    // 資料點延遲出現
    const dots = target.querySelectorAll('.timeline-svg circle');
    dots.forEach((dot, idx) => {
      dot.style.opacity = 0;
      dot.style.transition = 'opacity 0.4s';
      setTimeout(() => { dot.style.opacity = 1; }, 600 + idx * 20);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     5. 季節雷達圖(冬 vs 夏 6 維比較)
     ───────────────────────────────────────────────────────────── */
  function mountSeasonRadar() {
    const target = document.getElementById('dive-season-radar');
    if (!target) return;

    const WINTER = { wave: 8, wind: 9, temp: 3, vis: 5, current: 7, comfort: 4 };
    const SUMMER = { wave: 3, wind: 3, temp: 8, vis: 9, current: 4, comfort: 9 };
    const AXES = [
      { key: 'wave',    label: '浪平' },
      { key: 'wind',    label: '風弱' },
      { key: 'temp',    label: '水溫適中' },
      { key: 'vis',     label: '能見度' },
      { key: 'current', label: '流弱' },
      { key: 'comfort', label: '舒適度' }
    ];

    const size = 280, cx = size / 2, cy = size / 2, R = 110;
    function point(value, idx, total) {
      const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
      const r = (value / 10) * R;
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, angle];
    }

    function polygon(values) {
      return AXES.map((a, i) => point(values[a.key], i, AXES.length))
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
    }

    const gridLevels = [2, 4, 6, 8, 10];
    const grid = gridLevels.map(level => {
      const pts = AXES.map((_, i) => {
        const [x, y] = point(level, i, AXES.length);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(120,180,255,0.12)" stroke-width="0.8"/>`;
    }).join('');

    const axes = AXES.map((a, i) => {
      const [x, y, angle] = point(10, i, AXES.length);
      const lx = cx + Math.cos(angle) * (R + 18);
      const ly = cy + Math.sin(angle) * (R + 18);
      return `
        <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(120,180,255,0.2)" stroke-width="0.8"/>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" fill="#e6edf3" text-anchor="middle" dominant-baseline="middle" font-weight="600">${a.label}</text>
      `;
    }).join('');

    target.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-label="季節雷達圖">
        ${grid}
        ${axes}
        <polygon class="radar-poly radar-winter" points="${polygon(WINTER)}"
                 fill="rgba(88,215,255,0.18)" stroke="#58d7ff" stroke-width="2"/>
        <polygon class="radar-poly radar-summer" points="${polygon(SUMMER)}"
                 fill="rgba(63,185,80,0.18)" stroke="#3fb950" stroke-width="2"/>
        ${AXES.map((a, i) => {
          const [wx, wy] = point(WINTER[a.key], i, AXES.length);
          const [sx, sy] = point(SUMMER[a.key], i, AXES.length);
          return `
            <circle cx="${wx.toFixed(1)}" cy="${wy.toFixed(1)}" r="3" fill="#58d7ff"/>
            <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="3" fill="#3fb950"/>
          `;
        }).join('')}
      </svg>
      <div class="radar-legend">
        <div><span style="background:#58d7ff"></span> ❄️ 東北季風期 (10–3 月)</div>
        <div><span style="background:#3fb950"></span> ☀️ 西南季風期 (4–9 月)</div>
      </div>
    `;

    // 進場動畫
    const polys = target.querySelectorAll('.radar-poly');
    polys.forEach((p, idx) => {
      p.style.transformOrigin = `${cx}px ${cy}px`;
      p.style.transform = 'scale(0)';
      p.style.transition = 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
      setTimeout(() => { p.style.transform = 'scale(1)'; }, 300 + idx * 200);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     6. 進場動畫(IntersectionObserver)
     ───────────────────────────────────────────────────────────── */
  function mountRevealAnim() {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.dive-anim').forEach(el => io.observe(el));
  }

  /* ─────────────────────────────────────────────────────────────
     Boot
     ───────────────────────────────────────────────────────────── */
  async function boot() {
    // 1. 視覺不需要資料的元件先掛上(立即有反饋)
    mountWaves();
    mountInteractiveCompass();  // 用 CWA 風向預設,稍後 updateInteractiveCompass
    mountSeasonRadar();
    mountRevealAnim();

    // 2. 儀表板先掛上「loading」狀態
    const dashEl = document.getElementById('dive-dashboard');
    if (dashEl) {
      dashEl.innerHTML = '<div class="dash-loading">⏳ 從 CWA 龍洞浮標 46694A 抓即時觀測…</div>';
    }

    // 3. 抓 CWA 資料
    let cwaData = null;
    try {
      // 直接呼叫 Vercel proxy(部署在 /api/cwa-wave.js)
      const r = await fetch('/api/cwa-wave?station=46694A', {
        signal: AbortSignal.timeout(6000)
      });
      const json = await r.json();
      if (json.ok && json.data) {
        cwaData = window.CWALoader.loadFromJSON(json.data, json.station);
        console.log('[diving] CWA data loaded:', cwaData.snapshot);
      } else {
        console.warn('[diving] CWA proxy returned error:', json.error);
      }
    } catch (e) {
      console.warn('[diving] CWA fetch failed:', e.message);
    }

    // 4. 用 CWA 資料掛載儀表板 + 時序圖
    if (dashEl) dashEl.innerHTML = '';  // 清掉 loading
    mountDashboard(cwaData?.snapshot);

    // 5. 互動羅盤預設風向跟著 CWA 風向
    if (cwaData?.snapshot?.windDir?.deg != null) {
      // 找互動羅盤的 needle 並更新
      const needle = document.querySelector('#dive-compass-interactive #ic-needle');
      if (needle) {
        const deg = cwaData.snapshot.windDir.deg;
        needle.setAttribute('transform', `rotate(${deg})`);
        const degEl = document.querySelector('#dive-compass-interactive #ic-deg');
        const cardEl = document.querySelector('#dive-compass-interactive #ic-card');
        if (degEl) degEl.textContent = `${Math.round(deg)}°`;
        if (cardEl) cardEl.textContent = cwaData.snapshot.windDir.code;
        // 觸發一次 lookup 邏輯
        needle.dispatchEvent(new Event('cwa-loaded'));
      }
    }

    mountTimeline(cwaData?.series);

    // 6. 顯示最後更新時間
    if (cwaData?.fetchedAt) {
      const stamp = document.getElementById('dive-cwa-stamp');
      if (stamp) {
        const t = new Date(cwaData.fetchedAt);
        stamp.textContent = `CWA 龍洞浮標 46694A · 最後更新 ${t.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`;
        stamp.title = cwaData.range || '';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();