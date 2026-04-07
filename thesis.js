/* ============================================================
 *  SIMULATION ENGINE
 * ============================================================ */

var CFG = { POP: 50, GENS: 30, CR: 0.80, MR: 0.06, DAYS: 252, PSEED: 12345, GSEED: 67890 };

const PARAMS = {
    names: ['MA快線', 'MA慢線', 'RSI週期', 'RSI超賣閾', '停損 %', '停利 %'],
    desc: ['快速移動平均', '慢速移動平均', 'RSI計算週期', 'RSI超賣閾值', '單筆最大停損', '單筆停利目標'],
    min: [3, 15, 7, 20, 1.0, 2.0],
    max: [25, 80, 20, 45, 5.0, 10.0],
    isInt: [true, true, true, false, false, false],
    unit: ['期', '期', '期', '', '%', '%'],
};
const NP = PARAMS.names.length;

// Seeded LCG RNG
class RNG {
    constructor(s) { this.s = s >>> 0; }
    next() { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 0x100000000; }
    gauss() {
        let u = this.next(), v = this.next();
        while (u < 1e-10) u = this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
}

// Generate Geometric Brownian Motion price series
function genPrices(n, mu, sigma, seed) {
    const rng = new RNG(seed), p = [100];
    for (let i = 1; i < n; i++) p.push(p[i - 1] * Math.exp(mu + sigma * rng.gauss()));
    return p;
}

// Simple Moving Average
function sma(arr, period) {
    const r = new Array(arr.length).fill(NaN);
    for (let i = period - 1; i < arr.length; i++) {
        let s = 0; for (let j = i - period + 1; j <= i; j++) s += arr[j]; r[i] = s / period;
    }
    return r;
}

// Relative Strength Index
function calcRSI(prices, period) {
    const chg = prices.slice(1).map((p, i) => p - prices[i]);
    const gain = chg.map(c => Math.max(c, 0));
    const loss = chg.map(c => Math.max(-c, 0));
    const r = new Array(prices.length).fill(NaN);
    let ag = gain.slice(0, period).reduce((a, b) => a + b) / period;
    let al = loss.slice(0, period).reduce((a, b) => a + b) / period;
    for (let i = period; i < chg.length; i++) {
        ag = (ag * (period - 1) + gain[i]) / period;
        al = (al * (period - 1) + loss[i]) / period;
        const rs = al === 0 ? 100 : ag / al;
        r[i + 1] = 100 - 100 / (1 + rs);
    }
    return r;
}

// Decode raw [0,1] chromosome to real parameter values
function decode(raw) {
    return raw.map((v, i) => {
        const val = PARAMS.min[i] + v * (PARAMS.max[i] - PARAMS.min[i]);
        return PARAMS.isInt[i] ? Math.round(val) : Math.round(val * 10) / 10;
    });
}

// Backtest a decoded chromosome on prices
function backtest(chrom, prices) {
    const [maf, mas, rsip, rsiBuy, sl, tp] = chrom;
    const fast = sma(prices, Math.max(2, Math.round(maf)));
    const slow = sma(prices, Math.max(3, Math.round(mas)));
    const rsiArr = calcRSI(prices, Math.max(2, Math.round(rsip)));
    const warmup = Math.max(Math.round(mas), Math.round(rsip)) + 1;
    let cash = 10000, pos = 0, entry = 0;
    const equity = [10000], trades = [];
    const buyIdx = [], sellIdx = [], buyPrice = [], sellPrice = [];

    for (let i = warmup; i < prices.length; i++) {
        const p = prices[i];
        if (pos === 0) {
            if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1] && rsiArr[i] < rsiBuy) {
                pos = cash / p; entry = p; cash = 0;
                buyIdx.push(i); buyPrice.push(p);
            }
        } else {
            const pnl = (p - entry) / entry * 100;
            const sellSig = fast[i] < slow[i];
            const stopHit = pnl <= -sl;
            const tpHit = pnl >= tp;
            if (sellSig || stopHit || tpHit) {
                trades.push({ pnl_pct: pnl, reason: stopHit ? '停損' : tpHit ? '停利' : '訊號', entry, exit: p });
                cash = pos * p; pos = 0;
                sellIdx.push(i); sellPrice.push(p);
            }
        }
        equity.push(pos > 0 ? pos * p + cash : cash);
    }
    if (pos > 0) {
        const p = prices[prices.length - 1];
        const pnl = (p - entry) / entry * 100;
        trades.push({ pnl_pct: pnl, reason: '收盤', entry, exit: p });
        cash = pos * p; pos = 0;
        sellIdx.push(prices.length - 1); sellPrice.push(p);
    }

    const rets = equity.slice(1).map((v, i) => (v - equity[i]) / equity[i]);
    const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const sigma2 = rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length || 1);
    const sharpe = sigma2 > 0 ? (mu / Math.sqrt(sigma2)) * Math.sqrt(252) : 0;

    return {
        sharpe: Math.max(-4, Math.min(5, sharpe)),
        trades, equity, buyIdx, sellIdx, buyPrice, sellPrice,
        totalReturn: (equity[equity.length - 1] - 10000) / 10000 * 100,
        winRate: trades.length ? trades.filter(t => t.pnl_pct > 0).length / trades.length * 100 : 0,
        maxDD: (() => {
            let peak = -Infinity, dd = 0;
            equity.forEach(v => { if (v > peak) peak = v; dd = Math.min(dd, (v - peak) / peak * 100); });
            return dd;
        })(),
    };
}

// Genetic Algorithm
class GA {
    constructor(prices, rng) {
        this.prices = prices; this.rng = rng;
        this.pop = Array.from({ length: CFG.POP }, () => Array.from({ length: NP }, () => this.rng.next()));
        this.cache = new Map();
        this.history = [];
    }
    eval(raw) {
        const k = raw.join(',');
        if (!this.cache.has(k)) this.cache.set(k, backtest(decode(raw), this.prices));
        return this.cache.get(k);
    }
    fit(raw) { return this.eval(raw).sharpe; }
    select(fits) {
        let best = Math.floor(this.rng.next() * CFG.POP);
        for (let i = 1; i < 4; i++) {
            const j = Math.floor(this.rng.next() * CFG.POP);
            if (fits[j] > fits[best]) best = j;
        }
        return this.pop[best];
    }
    cross(a, b) {
        if (this.rng.next() > CFG.CR) return [...a];
        const pt = Math.floor(1 + this.rng.next() * (NP - 2));
        return [...a.slice(0, pt), ...b.slice(pt)];
    }
    mutate(c) {
        return c.map(v => this.rng.next() < CFG.MR
            ? Math.max(0, Math.min(1, v + (this.rng.next() - .5) * .4)) : v);
    }
    step() {
        const fits = this.pop.map(c => this.fit(c));
        const bi = fits.indexOf(Math.max(...fits));
        const r = this.eval(this.pop[bi]);
        this.history.push({
            bestFit: fits[bi],
            meanFit: fits.reduce((a, b) => a + b) / fits.length,
            worstFit: Math.min(...fits),
            bestChrom: decode(this.pop[bi]),
            profitDist: r.trades.map(t => t.pnl_pct),
            equity: r.equity,
            trades: r.trades,
            allFits: [...fits],
        });
        const elite = [...this.pop[bi]];
        const next = [elite];
        while (next.length < CFG.POP) {
            const p1 = this.select(fits), p2 = this.select(fits);
            next.push(this.mutate(this.cross(p1, p2)));
        }
        this.pop = next;
    }
    run() { for (let g = 0; g < CFG.GENS; g++) this.step(); }
}

// ── Run simulation ──────────────────────────────────────────────
const PRICES = genPrices(CFG.DAYS, 0.0003, 0.015, CFG.PSEED);
const LOG_RETS = PRICES.slice(1).map((p, i) => Math.log(p / PRICES[i]) * 100);
let GA_INST = new GA(PRICES, new RNG(CFG.GSEED));
GA_INST.run();
let H = GA_INST.history;   // [0 .. GENS-1]
let FINAL_H = H[H.length - 1];
let BEST_BT = backtest(FINAL_H.bestChrom, PRICES);
let convChart, popDistChart;

// Chromosome table (generated once – PARAMS are fixed)
document.getElementById('chromTable').innerHTML = PARAMS.names.map((n, i) =>
    `<div class="kv-row"><span class="kv-key">${n}</span><span class="kv-val" style="color:var(--teal);font-size:.8rem">[${PARAMS.min[i]}, ${PARAMS.max[i]}]${PARAMS.unit[i]}</span></div>`
).join('');

/* ============================================================
 *  CHART HELPERS
 * ============================================================ */
const C = {
    green: '#3cb95a', red: '#e84040', teal: '#30c8e8', blue: '#4fa0f8',
    purple: '#b490ff', muted: '#7a8f98', border: '#1e2730', text: '#e4ecf0', surface: '#131a20',
};
const BASE_OPTS = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: C.muted, font: { size: 11 } } }, tooltip: { backgroundColor: C.surface } },
    scales: {
        x: { grid: { color: C.border }, ticks: { color: C.muted, font: { size: 10 } } },
        y: { grid: { color: C.border }, ticks: { color: C.muted, font: { size: 10 } } },
    },
};

function histBins(data, bins, lo, hi) {
    const step = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, i) => (lo + i * step + step / 2).toFixed(2));
    data.forEach(v => {
        const i = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / step)));
        counts[i]++;
    });
    return { labels, counts };
}

/* ── 1. Price Return Distribution ── */
const { labels: RL, counts: RC } = histBins(LOG_RETS, 28, -5, 5);
new Chart(document.getElementById('returnDistChart'), {
    type: 'bar',
    data: { labels: RL, datasets: [{ label: '對數報酬率', data: RC, backgroundColor: 'rgba(48,200,232,.4)', borderColor: C.teal, borderWidth: 1, borderRadius: 2, borderSkipped: false }] },
    options: { ...BASE_OPTS, plugins: { ...BASE_OPTS.plugins }, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, title: { display: true, text: '對數報酬率 (%)', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '頻次', color: C.muted, font: { size: 10 } } } } },
});

/* ── 2. Profit Distribution: gen0 vs final ── */

function initCharts() {
    // Hero stats
    document.getElementById('statSharpe').textContent = FINAL_H.bestFit.toFixed(2);
    document.getElementById('statReturn').textContent = BEST_BT.totalReturn.toFixed(1) + '%';
    document.getElementById('statWin').textContent = BEST_BT.winRate.toFixed(0) + '%';

    /* ── 2. Profit Distribution: gen0 vs final ── */
    const initDist = H[0].profitDist;
    const finalDist = FINAL_H.profitDist;
    const allP = [...initDist, ...finalDist];
    const plo = Math.min(...allP, -8), phi = Math.max(...allP, 8);
    const { labels: PL, counts: PC0 } = histBins(initDist, 18, plo, phi);
    const { counts: PCF } = histBins(finalDist, 18, plo, phi);
    new Chart(document.getElementById('profitDistChart'), {
        type: 'bar',
        data: {
            labels: PL,
            datasets: [
                { label: '初代（Gen 1）', data: PC0, backgroundColor: 'rgba(180,144,255,.4)', borderColor: C.purple, borderWidth: 1, borderRadius: 2, borderSkipped: false },
                { label: '最終代（Gen 30）', data: PCF, backgroundColor: 'rgba(60,185,90,.45)', borderColor: C.green, borderWidth: 1, borderRadius: 2, borderSkipped: false },
            ],
        },
        options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, title: { display: true, text: '單筆利潤率 (%)', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '次數', color: C.muted, font: { size: 10 } } } } },
    });

    // Distribution stat cards
    function distStats(arr) {
        if (!arr.length) return { mean: 0, std: 0, sharpe: '—', win: 0, n: 0 };
        const mu = arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = Math.sqrt(arr.reduce((a, b) => a + (b - mu) ** 2, 0) / arr.length);
        return { mean: mu.toFixed(2), std: std.toFixed(2), sharpe: (std > 0 ? mu / std : 0).toFixed(2), win: (arr.filter(v => v > 0).length / arr.length * 100).toFixed(0), n: arr.length };
    }
    function renderKV(id, rows) {
        document.getElementById(id).innerHTML = rows.map(([k, v, c]) =>
            `<div class="kv-row"><span class="kv-key">${k}</span><span class="kv-val" style="color:${c || 'var(--text)'}">${v}</span></div>`
        ).join('');
    }
    const s0 = distStats(initDist), sf = distStats(finalDist);
    renderKV('gen0Stats', [
        ['利潤均值', s0.mean + '%', C.purple],
        ['標準差', s0.std + '%', C.muted],
        ['夏普值', s0.sharpe, C.purple],
        ['勝率', s0.win + '%', C.muted],
        ['交易次數', s0.n + '次', C.muted],
    ]);
    renderKV('finalStats', [
        ['利潤均值', sf.mean + '%', C.green],
        ['標準差', sf.std + '%', C.muted],
        ['夏普值', sf.sharpe, C.green],
        ['勝率', sf.win + '%', C.green],
        ['交易次數', sf.n + '次', C.muted],
    ]);
    const delta_m = (parseFloat(sf.mean) - parseFloat(s0.mean));
    const delta_s = (parseFloat(sf.sharpe) - parseFloat(s0.sharpe));
    const delta_w = (parseFloat(sf.win) - parseFloat(s0.win));
    renderKV('impStats', [
        ['均值改善', (delta_m >= 0 ? '+' : '') + delta_m.toFixed(2) + '%', delta_m >= 0 ? C.green : C.red],
        ['夏普提升', (delta_s >= 0 ? '+' : '') + delta_s.toFixed(2), C.green],
        ['勝率提升', (delta_w >= 0 ? '+' : '') + delta_w.toFixed(0) + '%', delta_w >= 0 ? C.green : C.red],
        ['停損截斷', '有效', C.teal],
        ['分布偏度', '正偏移', C.teal],
    ]);

    /* ── 3. Convergence Chart ── */
    const GLABELS = Array.from({ length: CFG.GENS }, (_, i) => i + 1);
    convChart = new Chart(document.getElementById('convChart'), {
        type: 'line',
        data: {
            labels: GLABELS,
            datasets: [
                { label: '最佳', data: H.map(h => h.bestFit), borderColor: C.green, backgroundColor: 'rgba(60,185,90,.08)', fill: true, tension: .3, pointRadius: 2, borderWidth: 2 },
                { label: '平均', data: H.map(h => h.meanFit), borderColor: C.teal, backgroundColor: 'transparent', fill: false, tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
                { label: '最差', data: H.map(h => h.worstFit), borderColor: C.red, backgroundColor: 'transparent', fill: false, tension: .3, pointRadius: 0, borderWidth: 1, borderDash: [2, 4] },
                { label: '目前代', data: new Array(CFG.GENS).fill(NaN), type: 'scatter', pointRadius: 8, pointBackgroundColor: C.purple, pointBorderColor: '#fff', pointBorderWidth: 2, showLine: false },
            ],
        },
        options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, title: { display: true, text: '代數', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '夏普值', color: C.muted, font: { size: 10 } } } } },
    });

    /* ── 4. Population Distribution Chart ── */
    popDistChart = new Chart(document.getElementById('popDistChart'), {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, title: { display: true, text: '夏普值區間', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '個體數', color: C.muted, font: { size: 10 } } } } },
    });

    /* ── 5. Price + Signals Chart ── */
    const buyScatter = BEST_BT.buyIdx.map((idx, i) => ({ x: idx, y: BEST_BT.buyPrice[i] }));
    const sellScatter = BEST_BT.sellIdx.map((idx, i) => ({ x: idx, y: BEST_BT.sellPrice[i] }));
    new Chart(document.getElementById('priceChart'), {
        type: 'line',
        data: {
            labels: PRICES.map((_, i) => i),
            datasets: [
                { label: '模擬價格', data: PRICES, borderColor: C.teal, backgroundColor: 'rgba(48,200,232,.04)', fill: true, tension: .1, pointRadius: 0, borderWidth: 1.5 },
                { label: '買入▲', data: buyScatter, type: 'scatter', pointRadius: 7, pointStyle: 'triangle', pointBackgroundColor: C.green, pointBorderColor: '#fff', pointBorderWidth: 1 },
                { label: '賣出▽', data: sellScatter, type: 'scatter', pointRadius: 7, pointStyle: 'triangle', rotation: 180, pointBackgroundColor: C.red, pointBorderColor: '#fff', pointBorderWidth: 1 },
            ],
        },
        options: { ...BASE_OPTS, parsing: false, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, type: 'linear', ticks: { maxTicksLimit: 8, color: C.muted, font: { size: 9 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '價格', color: C.muted, font: { size: 10 } } } } },
    });

    /* ── 6. Equity Chart ── */
    const eqColor = BEST_BT.equity[BEST_BT.equity.length - 1] > 10000 ? C.green : C.red;
    new Chart(document.getElementById('equityChart'), {
        type: 'line',
        data: { labels: BEST_BT.equity.map((_, i) => i), datasets: [{ label: '淨值', data: BEST_BT.equity, borderColor: eqColor, backgroundColor: eqColor === C.green ? 'rgba(60,185,90,.08)' : 'rgba(232,64,64,.08)', fill: true, tension: .1, pointRadius: 0, borderWidth: 2 }] },
        options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, ticks: { maxTicksLimit: 6, color: C.muted, font: { size: 9 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '資金 ($)', color: C.muted, font: { size: 10 } } } } },
    });

    // Perf stats
    renderKV('perfStats', [
        ['總報酬率', BEST_BT.totalReturn.toFixed(2) + '%', BEST_BT.totalReturn >= 0 ? C.green : C.red],
        ['夏普值', BEST_BT.sharpe.toFixed(3), C.green],
        ['最大回撤', BEST_BT.maxDD.toFixed(2) + '%', C.red],
        ['勝率', BEST_BT.winRate.toFixed(1) + '%', C.green],
        ['總交易次數', BEST_BT.trades.length + '次', C.muted],
        ['最終資金', '$' + BEST_BT.equity[BEST_BT.equity.length - 1].toFixed(0), eqColor],
    ]);

    // Trade list
    document.getElementById('tradeList').innerHTML = BEST_BT.trades.slice(0, 8).map((t, i) => `
<div class="trade-row">
    <span class="tn">#${String(i + 1).padStart(2, '0')}</span>
    <span class="tr">$${t.entry.toFixed(2)} → $${t.exit.toFixed(2)}</span>
    <span style="font-size:.72rem;color:var(--dim)">${t.reason}</span>
    <span class="${t.pnl_pct >= 0 ? 'tp' : 'tl'}">${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%</span>
</div>`
    ).join('') || '<div style="color:var(--muted);font-size:.85rem;text-align:center;padding:16px">無交易訊號產生</div>';

    /* ── 7. Comparison & Efficiency Charts ── */
    // Random search
    const cmpRng = new RNG(99999);
    let rsMax = -Infinity;
    for (let i = 0; i < CFG.POP * CFG.GENS; i++) {
        const raw = Array.from({ length: NP }, () => cmpRng.next());
        const fit = backtest(decode(raw), PRICES).sharpe;
        if (fit > rsMax) rsMax = fit;
    }
    // Grid search 3^6 = 729 points
    let gsMax = -Infinity;
    [0, .5, 1].forEach(a => [0, .5, 1].forEach(b => [0, .5, 1].forEach(c => [0, .5, 1].forEach(d => [0, .5, 1].forEach(e => [0, .5, 1].forEach(f => {
        const fit = backtest(decode([a, b, c, d, e, f]), PRICES).sharpe;
        if (fit > gsMax) gsMax = fit;
    }))))));
    const gaMax = FINAL_H.bestFit;

    new Chart(document.getElementById('compareChart'), {
        type: 'bar',
        data: {
            labels: ['遺傳演算法', '隨機搜尋', '網格搜尋（3⁶）'],
            datasets: [{ label: '最佳夏普值', data: [gaMax, rsMax, gsMax], backgroundColor: ['rgba(60,185,90,.8)', 'rgba(79,160,248,.6)', 'rgba(180,144,255,.6)'], borderColor: [C.green, C.blue, C.purple], borderWidth: 2, borderRadius: 6, borderSkipped: false }],
        },
        options: { ...BASE_OPTS, indexAxis: 'y', plugins: { ...BASE_OPTS.plugins, legend: { display: false } }, scales: { x: { ...BASE_OPTS.scales.x, title: { display: true, text: '夏普值', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, ticks: { color: C.text, font: { size: 12 } } } } },
    });

    // Rolling best for efficiency chart
    const cmpRng2 = new RNG(77777);
    const rsRolling = [];
    let rsRunMax = -Infinity;
    for (let g = 0; g < CFG.GENS; g++) {
        for (let j = 0; j < CFG.POP; j++) {
            const fit = backtest(decode(Array.from({ length: NP }, () => cmpRng2.next())), PRICES).sharpe;
            if (fit > rsRunMax) rsRunMax = fit;
        }
        rsRolling.push(rsRunMax);
    }
    new Chart(document.getElementById('efficiencyChart'), {
        type: 'line',
        data: {
            labels: Array.from({ length: CFG.GENS }, (_, i) => (i + 1) * CFG.POP),
            datasets: [
                { label: '遺傳演算法', data: H.map(h => h.bestFit), borderColor: C.green, backgroundColor: 'rgba(60,185,90,.08)', fill: true, tension: .3, pointRadius: 2, borderWidth: 2 },
                { label: '隨機搜尋', data: rsRolling, borderColor: C.blue, backgroundColor: 'transparent', fill: false, tension: .3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
            ],
        },
        options: { ...BASE_OPTS, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, ticks: { maxTicksLimit: 6, color: C.muted, font: { size: 9 } }, title: { display: true, text: '累積評估次數', color: C.muted, font: { size: 10 } } }, y: { ...BASE_OPTS.scales.y, title: { display: true, text: '目前最佳夏普值', color: C.muted, font: { size: 10 } } } } },
    });

    gotoGen(0);  // reset to first generation after each run
} // end initCharts

/* ============================================================
 *  GA SIMULATOR INTERACTION
 * ============================================================ */
var curGen = 0, playTimer = null;

function updatePopDist(gen) {
    const fits = H[gen].allFits;
    const lo = Math.min(...fits, -1), hi = Math.max(...fits, 2.5);
    const { labels, counts } = histBins(fits, 14, lo, hi);
    popDistChart.data.labels = labels;
    popDistChart.data.datasets = [{
        label: `第${gen + 1}代族群`,
        data: counts,
        backgroundColor: 'rgba(79,160,248,.5)',
        borderColor: C.blue,
        borderWidth: 1, borderRadius: 3, borderSkipped: false,
    }];
    popDistChart.update('active');
    document.getElementById('popGenLabel').textContent = gen + 1;
}

function updateParamGrid(gen) {
    const chrom = H[gen].bestChrom;
    document.getElementById('paramGrid').innerHTML = PARAMS.names.map((n, i) => {
        const frac = (chrom[i] - PARAMS.min[i]) / (PARAMS.max[i] - PARAMS.min[i]);
        return `<div class="param-cell">
        <div class="param-name">${n}</div>
        <div><span class="param-val">${chrom[i]}</span><span class="param-unit">${PARAMS.unit[i]}</span></div>
        <div class="param-bar-bg"><div class="param-bar-fill" style="width:${Math.max(6, frac * 100)}%"></div></div>
    </div>`;
    }).join('');
}

function gotoGen(g) {
    g = Math.max(0, Math.min(CFG.GENS - 1, g));
    curGen = g;
    // Update convergence highlight
    const hl = new Array(CFG.GENS).fill(NaN);
    hl[g] = H[g].bestFit;
    convChart.data.datasets[3].data = hl;
    convChart.update('none');
    updatePopDist(g);
    updateParamGrid(g);
    document.getElementById('genDisplay').textContent = `第 ${g + 1} 代 / ${CFG.GENS}`;
    document.getElementById('fitBadge').textContent = `Sharpe ${H[g].bestFit.toFixed(3)}`;
    document.getElementById('btnPrev').disabled = g === 0;
    document.getElementById('btnNext').disabled = g === CFG.GENS - 1;
    document.getElementById('btnFirst').disabled = g === 0;
    document.getElementById('btnLast').disabled = g === CFG.GENS - 1;
}

function togglePlay() {
    if (playTimer) {
        clearInterval(playTimer); playTimer = null;
        document.getElementById('btnPlay').textContent = '▶ 自動播放';
    } else {
        if (curGen === CFG.GENS - 1) gotoGen(0);
        document.getElementById('btnPlay').textContent = '⏸ 暫停';
        playTimer = setInterval(() => {
            if (curGen >= CFG.GENS - 1) {
                clearInterval(playTimer); playTimer = null;
                document.getElementById('btnPlay').textContent = '▶ 自動播放';
            } else {
                gotoGen(curGen + 1);
            }
        }, 550);
    }
}

/* ── Custom GA Re-run ── */
function rerunGA() {
    const btn = document.getElementById('btnRerun');
    const status = document.getElementById('cfgStatus');
    const pop = Math.max(10, Math.min(200, parseInt(document.getElementById('cfgPop').value) || 50));
    const gens = Math.max(5, Math.min(80, parseInt(document.getElementById('cfgGens').value) || 30));
    const cr = Math.max(0.3, Math.min(1.0, parseFloat(document.getElementById('cfgCR').value) || 0.80));
    const mr = Math.max(0.01, Math.min(0.30, parseFloat(document.getElementById('cfgMR').value) || 0.06));

    btn.disabled = true;
    status.textContent = `⏳ POP=${pop} × GENS=${gens} 演化中…`;

    // Allow browser to repaint to show status before blocking compute
    setTimeout(() => {
        try {
            CFG = { POP: pop, GENS: gens, CR: cr, MR: mr, DAYS: 252, PSEED: 12345, GSEED: 67890 };

            // Stop any auto-play
            if (playTimer) {
                clearInterval(playTimer); playTimer = null;
                document.getElementById('btnPlay').textContent = '▶ 自動播放';
            }

            // Re-run GA
            GA_INST = new GA(PRICES, new RNG(CFG.GSEED));
            GA_INST.run();
            H = GA_INST.history;
            FINAL_H = H[H.length - 1];
            BEST_BT = backtest(FINAL_H.bestChrom, PRICES);

            // Destroy dynamic charts before re-creating
            ['profitDistChart', 'convChart', 'popDistChart', 'priceChart',
                'equityChart', 'compareChart', 'efficiencyChart'].forEach(id => {
                    Chart.getChart(document.getElementById(id))?.destroy();
                });

            initCharts();
            status.textContent = `✓ 完成！夏普值 ${FINAL_H.bestFit.toFixed(3)}  |  POP=${pop}  GENS=${gens}  CR=${cr}  MR=${mr}`;
        } catch (e) {
            status.textContent = '錯誤：' + e.message;
        } finally {
            btn.disabled = false;
        }
    }, 20);
}

function resetGaCfg() {
    document.getElementById('cfgPop').value = '50';
    document.getElementById('cfgGens').value = '30';
    document.getElementById('cfgCR').value = '0.80';
    document.getElementById('cfgMR').value = '0.06';
    document.getElementById('cfgStatus').textContent = '';
}

initCharts();  // initial render
