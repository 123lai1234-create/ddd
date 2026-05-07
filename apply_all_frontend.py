import sys

# ─── 1. Append new JS functions to frontend/scripts/thesis.js ────────────────
new_js = r"""
/* ═══════════════════════════════════════════════════════════════════════
   技術指標輔助確認模組 — BBand / MACD / KD / 三重共振訊號
   ═══════════════════════════════════════════════════════════════════════ */

function calcEMA(prices, period) {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
        ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
}

function calcBBand(prices, period = 20) {
    const upper = [], mid = [], lower = [], width = [];
    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) { upper.push(null); mid.push(null); lower.push(null); width.push(null); continue; }
        const slice = prices.slice(i - period + 1, i + 1);
        const mean = slice.reduce((s, v) => s + v, 0) / period;
        const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
        const std = Math.sqrt(variance);
        const u = mean + 2 * std;
        const l = mean - 2 * std;
        upper.push(u); mid.push(mean); lower.push(l);
        width.push(mean > 0 ? (u - l) / mean * 100 : null);
    }
    return { upper, mid, lower, width };
}

function calcMACD(prices, fast = 12, slow = 26, signal = 9) {
    const ema12 = calcEMA(prices, fast);
    const ema26 = calcEMA(prices, slow);
    const dif = ema12.map((v, i) => v - ema26[i]);
    const k = 2 / (signal + 1);
    const sig = [dif[0]];
    for (let i = 1; i < dif.length; i++) sig.push(dif[i] * k + sig[i - 1] * (1 - k));
    return { dif, sig, osc: dif.map((v, i) => v - sig[i]) };
}

function calcKD(prices, period = 9) {
    const K = [], D = [];
    let prevK = 50, prevD = 50;
    for (let i = 0; i < prices.length; i++) {
        if (i < period - 1) { K.push(null); D.push(null); continue; }
        const slice = prices.slice(i - period + 1, i + 1);
        const highest = Math.max(...slice), lowest = Math.min(...slice);
        const range = highest - lowest;
        const rsv = range > 0 ? (prices[i] - lowest) / range * 100 : 50;
        const kv = 2 / 3 * prevK + 1 / 3 * rsv;
        const dv = 2 / 3 * prevD + 1 / 3 * kv;
        K.push(kv); D.push(dv); prevK = kv; prevD = dv;
    }
    return { K, D };
}

function detectTripleSignals(prices, bb, macd, kd) {
    const validWidths = bb.width.filter(Boolean);
    if (!validWidths.length) return [];
    const avgWidth = validWidths.reduce((s, v) => s + v, 0) / validWidths.length;
    const signals = [];
    for (let i = 1; i < prices.length; i++) {
        if (!bb.width[i] || kd.K[i] == null || kd.D[i] == null) continue;
        const bbConverge = bb.width[i] < avgWidth * 0.70;
        const kdCross = kd.K[i - 1] != null && kd.D[i - 1] != null
            && kd.K[i - 1] <= kd.D[i - 1] && kd.K[i] > kd.D[i] && kd.K[i] < 50;
        const macdPositive = macd.osc[i] > 0 && macd.osc[i - 1] <= 0;
        const score = [bbConverge, kdCross, macdPositive].filter(Boolean).length;
        if (score >= 2) signals.push({ idx: i, price: prices[i], bbConverge, kdCross, macdPositive, score });
    }
    return signals.slice(-8);
}

function renderTechIndicators(run) {
    const series = SERIES_CACHE.get(run.stock.code) || getStockSeries(run.stock);
    const prices = series.test;
    if (!prices || prices.length < 30) return;

    const bb = calcBBand(prices, 20);
    const macd = calcMACD(prices, 12, 26, 9);
    const kd = calcKD(prices, 9);
    const labels = prices.map((_, i) => i + 1);

    createChart('bbandChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '上軌', data: bb.upper, borderColor: 'rgba(255,188,114,0.55)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: '+2', backgroundColor: 'rgba(123,240,190,0.05)' },
                { label: '中軌 MA20', data: bb.mid, borderColor: 'rgba(181,156,255,0.45)', borderWidth: 1, borderDash: [2, 4], pointRadius: 0, fill: false },
                { label: '下軌', data: bb.lower, borderColor: 'rgba(255,188,114,0.55)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false },
                { label: '收盤價', data: prices, borderColor: C.teal, borderWidth: 1.8, pointRadius: 0, fill: false },
            ],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, ticks: { maxTicksLimit: 8, color: C.muted, font: { size: 9 } } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '價格', color: C.muted } },
            },
        },
    });

    createChart('macdKdChart', {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'K 值', data: kd.K, borderColor: C.blue, borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y' },
                { label: 'D 值', data: kd.D, borderColor: C.yellow, borderWidth: 1.5, pointRadius: 0, fill: false, yAxisID: 'y' },
                { type: 'bar', label: 'MACD OSC', data: macd.osc, backgroundColor: macd.osc.map(v => v >= 0 ? 'rgba(123,240,190,0.72)' : 'rgba(255,131,146,0.72)'), borderWidth: 0, yAxisID: 'y1' },
            ],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, ticks: { maxTicksLimit: 8, color: C.muted, font: { size: 9 } } },
                y: { ...BASE_OPTS.scales.y, min: 0, max: 100, title: { display: true, text: 'KD 值', color: C.muted } },
                y1: { position: 'right', grid: { drawOnChartArea: false, color: C.border }, ticks: { color: C.muted, font: { size: 9 } }, title: { display: true, text: 'MACD OSC', color: C.muted } },
            },
        },
    });

    const panel = document.getElementById('tripleSignalPanel');
    if (!panel) return;
    const signals = detectTripleSignals(prices, bb, macd, kd);
    if (!signals.length) {
        panel.innerHTML = '<div style="color:var(--muted);font-size:.84rem;padding:16px 0;text-align:center">測試期間未偵測到三重共振訊號（需同時滿足 ≥ 2 項條件）</div>';
        return;
    }
    panel.innerHTML = signals.map(s => {
        const scoreColor = s.score === 3 ? 'var(--green)' : 'var(--orange)';
        return `<div class="triple-signal-row">
            <div class="ts-idx">T+${s.idx}</div>
            <div class="ts-price">${s.price.toFixed(1)}</div>
            <div class="ts-chip ${s.bbConverge ? 'active' : ''}">BBand 收斂</div>
            <div class="ts-chip ${s.kdCross ? 'active' : ''}">KD 黃金交叉</div>
            <div class="ts-chip ${s.macdPositive ? 'active' : ''}">MACD OSC +</div>
            <div class="ts-score" style="color:${scoreColor}">${s.score}/3</div>
        </div>`;
    }).join('');
}

/* ═══════════════════════════════════════════════════════════════════════
   衍生性商品延伸模組 — 權證 vs 選擇權
   ═══════════════════════════════════════════════════════════════════════ */

function renderDerivativesSection() {
    const rows = [
        ['發行方', '券商（唯一造市者，散戶只能買）', '期交所掛牌，散戶可買可賣', '選擇權較佳 ✓'],
        ['定價公平性', '隱含波動率 (IV) 由券商調控，漲時常調降 IV', '市場撮合，IV 為共識定價，透明可比對', '選擇權較佳 ✓'],
        ['流動性', '冷門標的買賣點差寬，造市商主導深度', '台指選 TXO 深度足、買賣差小', '選擇權較佳 ✓'],
        ['槓桿結構', '以小搏大，最大損失為所付權利金', '買方最大損失為權利金；賣方需繳保證金', '相當'],
        ['最大損失（買方）', '僅限所付權利金，不追繳保證金', '僅限所付權利金，不追繳保證金', '相當'],
        ['標的資產', '個股為主（部分指數型），整體標準化差', '台指選流動性最佳；個股選流動性普遍差', '視標的而定'],
        ['量化策略適用性', '受限：IV 操控風險高、流動性不穩', '適合：TXO 活絡，策略可重複執行並回測', '選擇權推薦 ✓'],
    ];
    const table = document.getElementById('derivativesTable');
    if (table) {
        table.innerHTML = rows.map(([feat, warrant, option, verdict]) => {
            const vc = verdict.includes('選擇權') ? 'var(--green)' : verdict === '相當' ? 'var(--muted)' : 'var(--teal)';
            return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:10px 12px;font-weight:600;color:var(--text)">${feat}</td>
                <td style="padding:10px 12px;color:var(--muted);font-size:.82rem">${warrant}</td>
                <td style="padding:10px 12px;color:var(--muted);font-size:.82rem">${option}</td>
                <td style="padding:10px 12px;font-weight:700;font-size:.82rem;color:${vc}">${verdict}</td>
            </tr>`;
        }).join('');
    }
    createChart('derivativesPayoffChart', {
        type: 'bar',
        data: {
            labels: ['漲至 1050 (+5%)', '停在 1000 (0%)', '跌至 950 (−5%)'],
            datasets: [
                { label: '權證買方 P&L%', data: [40, -70, -100], backgroundColor: 'rgba(88,215,255,0.65)', borderColor: C.teal, borderWidth: 2, borderRadius: 6, borderSkipped: false },
                { label: '選擇權買方 P&L%', data: [150, -70, -100], backgroundColor: 'rgba(123,240,190,0.65)', borderColor: C.green, borderWidth: 2, borderRadius: 6, borderSkipped: false },
            ],
        },
        options: {
            ...BASE_OPTS,
            plugins: { ...BASE_OPTS.plugins, tooltip: { ...BASE_OPTS.plugins.tooltip, callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.raw > 0 ? '+' : ''}${ctx.raw}%` } } },
            scales: {
                x: { ...BASE_OPTS.scales.x, ticks: { color: C.text, font: { size: 11 } } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '損益 (%)', color: C.muted } },
            },
        },
    });
    const advice = document.getElementById('derivativesAdvicePanel');
    if (advice) {
        advice.innerHTML = renderKVRows([
            ['推薦工具', '台指選 TXO · 近月虛值一檔 Call', C.green],
            ['GAPPTS 連動', 'PPTS 買入區間 → 方向確認 → 買入近月買權', C.teal],
            ['最大風險', '僅限所付權利金，無保證金追繳', C.muted],
            ['IV 管理', '避開財報 / 除息前後隱波急升期間', C.orange],
            ['流動性優先', '個股選擇權流動性差，優先使用台指選', C.purple],
            ['權證風險', '券商調降 IV 等同隱性損耗，不利量化回測驗證', C.red],
        ]);
    }
}
"""

with open('D:/project/frontend/scripts/thesis.js', 'r', encoding='utf-8') as f:
    js = f.read()

if 'calcBBand' not in js:
    js = js.rstrip() + '\n' + new_js
    with open('D:/project/frontend/scripts/thesis.js', 'w', encoding='utf-8') as f:
        f.write(js)
    print(f'JS: appended {len(new_js)} chars')
else:
    print('JS: already patched')

# ─── 2. Append new CSS to frontend/styles/thesis.css ─────────────────────────
new_css = """
/* ── 技術指標補充 ── */
.indicator-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 700px) {
  .indicator-grid { grid-template-columns: 1fr; }
}

.ind-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 18px;
  transition: border-color 0.25s;
}

.ind-card:hover { border-color: var(--border-hover); }

.ind-icon { font-size: 1.45rem; line-height: 1; flex-shrink: 0; margin-top: 2px; }

.ind-title {
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .06em;
  color: var(--teal);
  margin-bottom: 5px;
  text-transform: uppercase;
}

.ind-body { font-size: .79rem; color: var(--muted); line-height: 1.6; margin-bottom: 8px; }

.ind-signal {
  display: inline-block;
  font-size: .72rem;
  font-weight: 600;
  color: var(--green);
  background: rgba(123,240,190,.07);
  border: 1px solid rgba(123,240,190,.18);
  border-radius: 6px;
  padding: 3px 10px;
}

/* ── Triple Signal ── */
.triple-signal-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }

.triple-signal-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(123,240,190,.03);
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: .8rem;
  flex-wrap: wrap;
}

.ts-idx { color: var(--dim); min-width: 38px; font-family: var(--mono); font-size: .72rem; }
.ts-price { color: var(--text); font-weight: 600; min-width: 52px; font-family: var(--mono); }

.ts-chip {
  padding: 3px 9px;
  border-radius: 5px;
  font-size: .71rem;
  font-weight: 600;
  background: rgba(255,255,255,.04);
  color: var(--dim);
  border: 1px solid rgba(255,255,255,.07);
}

.ts-chip.active {
  background: rgba(123,240,190,.12);
  color: var(--green);
  border-color: rgba(123,240,190,.28);
}

.ts-score { margin-left: auto; font-weight: 700; font-size: .86rem; }

/* ── 工具資源整理 ── */
.tools-category { margin-bottom: 28px; }

.tools-category-label {
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--green);
  margin-bottom: 12px;
  padding-left: 2px;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.tool-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 16px 18px;
  transition: border-color 0.25s, transform 0.2s;
}

.tool-card:hover { border-color: var(--border-hover); transform: translateY(-2px); }
.tool-card-icon { font-size: 1.3rem; margin-bottom: 8px; }
.tool-card-name { font-size: .84rem; font-weight: 700; color: var(--text); margin-bottom: 5px; }
.tool-card-desc { font-size: .77rem; color: var(--muted); line-height: 1.55; }

.tool-card-tag {
  display: inline-block;
  margin-top: 8px;
  font-size: .68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(88,215,255,.08);
  color: var(--teal);
  border: 1px solid rgba(88,215,255,.18);
}

.tool-card-warning {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  font-size: .7rem;
  color: var(--orange);
  background: rgba(255,188,114,.07);
  border: 1px solid rgba(255,188,114,.18);
  border-radius: 6px;
  padding: 5px 9px;
  line-height: 1.5;
}

.macro-notice {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(88,215,255,.05);
  border: 1px solid rgba(88,215,255,.18);
  border-radius: var(--radius-sm);
  padding: 18px 22px;
  margin-bottom: 28px;
  font-size: .84rem;
  color: var(--muted);
  line-height: 1.7;
}

.macro-notice-icon { font-size: 1.8rem; flex-shrink: 0; }
"""

with open('D:/project/frontend/styles/thesis.css', 'r', encoding='utf-8') as f:
    css = f.read()

if 'indicator-grid' not in css:
    css = css.rstrip() + '\n' + new_css
    with open('D:/project/frontend/styles/thesis.css', 'w', encoding='utf-8') as f:
        f.write(css)
    print(f'CSS: appended {len(new_css)} chars')
else:
    print('CSS: already patched')

# ─── 3. Insert HTML sections into frontend/thesis.html ────────────────────────
tech_section = """
    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">技術指標補充</div>
            <h2 class="section-title">布林通道 · MACD · KD · 籌碼面 — 輔助進場確認</h2>
            <p class="section-sub">PPTS 以統計利潤分布識別買入區間，搭配技術面與籌碼面訊號可進一步提升進場品質。台股量化實戰案例顯示，「BBand 收斂 + KD 低檔回升 + MACD 動能翻正」三重共振型態，對應 PPTS 買入區間時，能有效過濾假突破、提升勝率。</p>
            <div class="indicator-grid">
                <div class="ind-card">
                    <div class="ind-icon">📊</div>
                    <div>
                        <div class="ind-title">布林通道 Bollinger Bands</div>
                        <div class="ind-body">上下軌 = MA20 ± 2σ，通道寬度代表市場波動程度。通道收斂（Width ≤ 70% 均寬）是即將變盤的預警訊號，收斂後突破方向往往延續。</div>
                        <div class="ind-signal">收斂訊號：Width ≤ 均寬 × 0.70</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">📉</div>
                    <div>
                        <div class="ind-title">MACD 動能指標</div>
                        <div class="ind-body">DIF = EMA12 − EMA26，Signal = EMA9(DIF)，OSC = DIF − Signal。OSC 直方圖由紅轉綠（負翻正）代表短期動能開始回升，是早期多方確認。</div>
                        <div class="ind-signal">確認訊號：OSC 由負轉正（柱狀翻綠）</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">🎯</div>
                    <div>
                        <div class="ind-title">KD 隨機指標</div>
                        <div class="ind-body">RSV 計算最近 9 日相對位置，K = 2/3 × K_prev + 1/3 × RSV，D = 2/3 × D_prev + 1/3 × K。K 值從低檔向上穿越 D 值為黃金交叉，代表超賣後動能反轉。</div>
                        <div class="ind-signal">黃金交叉：K 由低檔上穿 D（K &lt; 50）</div>
                    </div>
                </div>
                <div class="ind-card">
                    <div class="ind-icon">🏦</div>
                    <div>
                        <div class="ind-title">籌碼面 — 法人動向</div>
                        <div class="ind-body">外資 + 投信 + 自營商連續買超為多方籌碼訊號。主力買超千張以上且散戶同步賣超，代表聰明錢在低檔積累，是底部反轉候選股的關鍵條件之一。</div>
                        <div class="ind-signal">多方籌碼：法人連 3 日淨買超</div>
                    </div>
                </div>
            </div>
            <div class="grid-2" style="margin-top:18px">
                <div class="card">
                    <div class="card-title">所選個股 · 布林通道（測試集）</div>
                    <div class="card-note">實線為收盤價，橙色虛線為布林上下軌，半透明帶為通道範圍。通道收窄時即將面臨方向性突破。</div>
                    <div class="chart-box"><canvas id="bbandChart"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-title">KD 隨機指標 + MACD OSC（測試集）</div>
                    <div class="card-note">藍/橙線為 K/D 值（左軸 0–100），綠/紅直方圖為 MACD OSC（右軸）。</div>
                    <div class="chart-box"><canvas id="macdKdChart"></canvas></div>
                </div>
            </div>
            <div class="card" style="margin-top:14px">
                <div class="card-title">三重共振訊號偵測 — 同時滿足 ≥ 2 項技術條件</div>
                <div class="card-note">偵測測試集中同時達到「BBand 收斂 + KD 黃金交叉 + MACD OSC 翻正」中至少兩項的訊號點，為 PPTS 買入區間提供技術面輔助確認。</div>
                <div id="tripleSignalPanel" class="triple-signal-grid"></div>
            </div>
        </div>
    </div>

    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">衍生性商品延伸</div>
            <h2 class="section-title">權證 vs 選擇權 — GAPPTS 策略延伸討論</h2>
            <p class="section-sub">GAPPTS 以價格區間識別方向性進場機會，除現股之外可搭配衍生性商品放大槓桿。台灣市場中，選擇權（台指選 TXO）在定價透明度與流動性上遠優於個股權證，更適合量化策略重複執行與歷史回測驗證。</p>
            <div class="card">
                <div class="card-title">量化策略適用性比較：權證 vs 選擇權</div>
                <div style="overflow-x:auto;margin-top:12px">
                    <table style="width:100%;border-collapse:collapse;font-size:.84rem">
                        <thead>
                            <tr style="border-bottom:2px solid var(--border);color:var(--muted);text-align:left">
                                <th style="padding:10px 12px">特性</th>
                                <th style="padding:10px 12px">權證 (Warrant)</th>
                                <th style="padding:10px 12px">選擇權 (Option)</th>
                                <th style="padding:10px 12px">量化適用</th>
                            </tr>
                        </thead>
                        <tbody id="derivativesTable"></tbody>
                    </table>
                </div>
            </div>
            <div class="grid-2" style="margin-top:14px">
                <div class="card">
                    <div class="card-title">台積電假設情境損益比較（買方）</div>
                    <div class="card-note">現價 1000 元，履約價 1050，比較三種到期情境下的損益比。選擇權因 IV 公平定價，漲幅情境報酬明顯優於權證。</div>
                    <div class="chart-box"><canvas id="derivativesPayoffChart"></canvas></div>
                </div>
                <div class="card">
                    <div class="card-title">GAPPTS 延伸至衍生商品的操作建議</div>
                    <div id="derivativesAdvicePanel" style="margin-top:8px"></div>
                </div>
            </div>
        </div>
    </div>

    <div class="section reveal">
        <div class="section-inner">
            <div class="section-label">資源整理</div>
            <h2 class="section-title">投資研究工具全覽 · 今日重點複習</h2>
            <p class="section-sub">從總體經濟到個股分析，面對龐雜的財經資訊，善用對的工具能大幅提升研究效率。以下整理今日介紹的實用工具，建議依據自己的需求組合搭配使用。</p>
            <div class="macro-notice">
                <div class="macro-notice-icon">🌐</div>
                <div>
                    <strong style="color:var(--teal)">總經局勢複習</strong>：掌握大環境方向是個股分析的基礎。總體經濟數據（GDP、通膨、利率、PMI）的趨勢變化，會直接影響資金流向與產業輪動節奏。建議定期追蹤總經指標，由上而下選股，並搭配今日附上的圖卡一起回顧總經重點。
                </div>
            </div>
            <div class="tools-category">
                <div class="tools-category-label">📊 投資與數據分析工具</div>
                <div class="tools-grid">
                    <div class="tool-card">
                        <div class="tool-card-icon">📈</div>
                        <div class="tool-card-name">財經 M 平方</div>
                        <div class="tool-card-desc">專注於「總體經濟」數據與趨勢分析，提供全球 GDP、通膨、利率、PMI 等關鍵指標視覺化，掌握大方向的必備工具。</div>
                        <span class="tool-card-tag">總體經濟</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">🐕</div>
                        <div class="tool-card-name">財報狗</div>
                        <div class="tool-card-desc">專精於「企業財報分析」，提供台股個股損益表、資產負債表、現金流量表整理，研究基本面、檢視公司體質的好幫手。</div>
                        <span class="tool-card-tag">基本面分析</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">💻</div>
                        <div class="tool-card-name">XQ 全球贏家</div>
                        <div class="tool-card-desc">強大的「股票分析」軟體，涵蓋即時看盤、技術指標、籌碼動向與程式交易，電腦版與手機版皆有。</div>
                        <span class="tool-card-tag">技術分析 · 籌碼</span>
                    </div>
                    <div class="tool-card">
                        <div class="tool-card-icon">⚡</div>
                        <div class="tool-card-name">金十數據 APP</div>
                        <div class="tool-card-desc">提供即時且快速的全球財經新聞與數據庫，消息面追蹤效率高，適合需要即時掌握市場動態的投資人。</div>
                        <span class="tool-card-tag">即時財經新聞</span>
                        <div class="tool-card-warning">⚠ 中國大陸開發軟體，對資安或隱私有疑慮者請審慎評估後再決定是否下載使用。</div>
                    </div>
                </div>
            </div>
            <div class="tools-category">
                <div class="tools-category-label">💡 補充與輔助工具</div>
                <div class="tools-grid">
                    <div class="tool-card">
                        <div class="tool-card-icon">🚦</div>
                        <div class="tool-card-name">處置王 APP</div>
                        <div class="tool-card-desc">專門查詢股票「何時被列入處置」的工具，避免在處置期間發生非預期的交易限制，對留意個股流動性風險非常實用。</div>
                        <span class="tool-card-tag">處置股票查詢</span>
                    </div>
                    <div class="tool-card" style="border-color:rgba(123,240,190,0.22)">
                        <div class="tool-card-icon">🤖</div>
                        <div class="tool-card-name">Claude · Gemini · Notebook LM</div>
                        <div class="tool-card-desc">強大的 AI 生產力助手。可快速整理龐雜財經資訊、總結長篇報告重點、梳理投資邏輯，善用 AI 能大幅提升研究效率，打破舊有思考框架，看見更多投資機會。</div>
                        <span class="tool-card-tag" style="background:rgba(123,240,190,.1);color:var(--green);border-color:rgba(123,240,190,.25)">AI 輔助工具</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

"""

with open('D:/project/frontend/thesis.html', 'r', encoding='utf-8') as f:
    html = f.read()

if 'bbandChart' not in html:
    marker = '    <div id="market-ops"'
    idx = html.find(marker)
    if idx == -1:
        print('ERROR: market-ops marker not found in thesis.html')
        sys.exit(1)
    html = html[:idx] + tech_section + html[idx:]
    with open('D:/project/frontend/thesis.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'HTML: inserted {len(tech_section)} chars before market-ops')
else:
    print('HTML: already patched')

print('All done.')
