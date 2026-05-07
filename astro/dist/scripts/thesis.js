const PAPER_CONTEXT = {
    positiveRate: 93.75,
    universeSize: 48,
    effectiveCount: 19,
    generalCount: 22,
    ineffectiveCount: 7,
    trainPeriod: '2019-2023',
    testPeriod: '2024',
    trainDays: 252 * 5,
    testDays: 252,
};

const PARAMS = [
    { key: 'intervals', label: '價格區間數', bits: 5, min: 32, max: 63, unit: '格', decimals: 0 },
    { key: 'holdDays', label: '持有天數', bits: 6, min: 5, max: 30, unit: '天', decimals: 0 },
    { key: 'targetProfit', label: '目標利潤', bits: 10, min: 1.5, max: 12.0, unit: '%', decimals: 1 },
    { key: 'alpha', label: '進場門檻 α', bits: 8, min: 0.25, max: 0.95, unit: '', decimals: 3 },
];

const DEFAULT_GA_CFG = { POP: 50, GENS: 50, CR: 0.80, MR: 0.10, ELITE: 1 };
const FIXED_PPTS_PARAMS = { intervals: 48, holdDays: 20, targetProfit: 5.0, alpha: 0.65 };

const C = {
    green: '#3cb95a',
    red: '#e84040',
    teal: '#30c8e8',
    blue: '#4fa0f8',
    purple: '#b490ff',
    yellow: '#ffd56b',
    muted: '#7a8f98',
    border: '#1e2730',
    text: '#e4ecf0',
    surface: '#131a20',
};

const BASE_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: C.muted, font: { size: 11 } } },
        tooltip: { backgroundColor: C.surface },
    },
    scales: {
        x: { grid: { color: C.border }, ticks: { color: C.muted, font: { size: 10 } } },
        y: { grid: { color: C.border }, ticks: { color: C.muted, font: { size: 10 } } },
    },
};

const CLASS_LABELS = {
    effective: '有效果類',
    general: '一般類',
    ineffective: '無效果類',
};

const INDUSTRY_LIBRARY = {
    水泥: { drift: 0.00018, vol: 0.011, cycle: 68, cycleAmp: 0.0008, secondaryAmp: 0.0005, eventAmp: 0.005, startMin: 28, startMax: 52 },
    食品: { drift: 0.00022, vol: 0.012, cycle: 60, cycleAmp: 0.0011, secondaryAmp: 0.0007, eventAmp: 0.006, startMin: 32, startMax: 68 },
    塑膠: { drift: 0.00010, vol: 0.013, cycle: 64, cycleAmp: 0.0012, secondaryAmp: 0.0008, eventAmp: 0.008, startMin: 36, startMax: 82 },
    鋼鐵: { drift: 0.00008, vol: 0.015, cycle: 58, cycleAmp: 0.0013, secondaryAmp: 0.0009, eventAmp: 0.009, startMin: 24, startMax: 48 },
    汽車: { drift: 0.00028, vol: 0.013, cycle: 56, cycleAmp: 0.0015, secondaryAmp: 0.0011, eventAmp: 0.008, startMin: 80, startMax: 180 },
    電子零組件: { drift: 0.00035, vol: 0.018, cycle: 44, cycleAmp: 0.0021, secondaryAmp: 0.0012, eventAmp: 0.014, startMin: 38, startMax: 120 },
    '電腦及週邊設備': { drift: 0.00038, vol: 0.019, cycle: 42, cycleAmp: 0.0022, secondaryAmp: 0.0015, eventAmp: 0.015, startMin: 36, startMax: 130 },
    半導體: { drift: 0.00042, vol: 0.020, cycle: 40, cycleAmp: 0.0024, secondaryAmp: 0.0015, eventAmp: 0.016, startMin: 42, startMax: 180 },
    通信網路: { drift: 0.00008, vol: 0.008, cycle: 88, cycleAmp: 0.0008, secondaryAmp: 0.0006, eventAmp: 0.004, startMin: 42, startMax: 90 },
    航運: { drift: 0.00055, vol: 0.028, cycle: 30, cycleAmp: 0.0036, secondaryAmp: 0.0025, eventAmp: 0.024, startMin: 26, startMax: 74 },
    金融: { drift: 0.00020, vol: 0.009, cycle: 74, cycleAmp: 0.0010, secondaryAmp: 0.0007, eventAmp: 0.005, startMin: 18, startMax: 38 },
    其他: { drift: 0.00030, vol: 0.016, cycle: 50, cycleAmp: 0.0018, secondaryAmp: 0.0011, eventAmp: 0.010, startMin: 28, startMax: 92 },
};

const CLASS_LIBRARY = {
    effective: { trainDrift: 0.00008, testDrift: 0.00055, volMul: 0.98, eventMul: 1.00 },
    general: { trainDrift: 0.00002, testDrift: 0.00018, volMul: 1.00, eventMul: 1.00 },
    ineffective: { trainDrift: -0.00003, testDrift: -0.00018, volMul: 1.08, eventMul: 1.06 },
};

const ANCHOR_LIBRARY = {
    水泥: { intervals: 50, holdDays: 19, targetProfit: 4.5, alpha: 0.74 },
    食品: { intervals: 48, holdDays: 18, targetProfit: 4.2, alpha: 0.76 },
    塑膠: { intervals: 47, holdDays: 20, targetProfit: 4.0, alpha: 0.72 },
    鋼鐵: { intervals: 46, holdDays: 17, targetProfit: 3.5, alpha: 0.73 },
    汽車: { intervals: 44, holdDays: 17, targetProfit: 4.4, alpha: 0.69 },
    電子零組件: { intervals: 45, holdDays: 13, targetProfit: 5.9, alpha: 0.57 },
    '電腦及週邊設備': { intervals: 46, holdDays: 14, targetProfit: 6.8, alpha: 0.56 },
    半導體: { intervals: 47, holdDays: 15, targetProfit: 6.2, alpha: 0.58 },
    通信網路: { intervals: 43, holdDays: 21, targetProfit: 3.4, alpha: 0.82 },
    航運: { intervals: 49, holdDays: 16, targetProfit: 8.5, alpha: 0.62 },
    金融: { intervals: 52, holdDays: 22, targetProfit: 4.8, alpha: 0.78 },
    其他: { intervals: 45, holdDays: 16, targetProfit: 5.0, alpha: 0.65 },
};

const STOCK_OVERRIDES = {
    '2330': { bias: 0.00055, anchor: { intervals: 48, holdDays: 15, targetProfit: 6.6, alpha: 0.59 } },
    '2382': { bias: 0.00075, anchor: { intervals: 49, holdDays: 18, targetProfit: 7.2, alpha: 0.58 } },
    '2609': { bias: 0.00110, volMul: 1.12, anchor: { intervals: 49, holdDays: 16, targetProfit: 9.2, alpha: 0.62 } },
    '2615': { bias: 0.00090, volMul: 1.08, anchor: { intervals: 49, holdDays: 15, targetProfit: 8.4, alpha: 0.59 } },
    '2888': { bias: -0.00012, volMul: 1.16, anchor: { intervals: 51, holdDays: 21, targetProfit: 3.8, alpha: 0.86 } },
    '2889': { bias: -0.00016, volMul: 1.04, anchor: { intervals: 50, holdDays: 22, targetProfit: 3.4, alpha: 0.84 } },
    '3045': { bias: -0.00035, volMul: 0.92, anchor: { intervals: 43, holdDays: 22, targetProfit: 3.2, alpha: 0.86 } },
    '3231': { bias: 0.00068, anchor: { intervals: 50, holdDays: 17, targetProfit: 7.1, alpha: 0.57 } },
    '3711': { bias: 0.00062, anchor: { intervals: 47, holdDays: 16, targetProfit: 6.7, alpha: 0.58 } },
    '4904': { bias: -0.00018, volMul: 0.94, anchor: { intervals: 44, holdDays: 21, targetProfit: 3.5, alpha: 0.82 } },
    '5876': { bias: 0.00024, anchor: { intervals: 53, holdDays: 21, targetProfit: 5.0, alpha: 0.79 } },
    '5880': { bias: 0.00018, anchor: { intervals: 52, holdDays: 22, targetProfit: 4.8, alpha: 0.78 } },
};

const STOCK_NOTES = {
    '2330': '論文指出半導體族群在本方法下具備明顯超額報酬能力，台積電 (2330) 為代表性案例。',
    '2382': '論文點名的電腦及週邊設備高績效樣本，廣達回測報酬達 694.84%。',
    '2454': '聯發科 fitness 0.6994，為短期動態型最高績效個股。',
    '2303': '聯電 fitness 0.7058，全樣本最高，中期轉型型代表。',
    '2412': '中華電屬長期穩定型，訓練期間建議 5–8 年，fitness 相對偏低但策略穩定。',
    '2609': '論文列為最高報酬案例，陽明海運 2024 測試集報酬達 1176.08%，航運族群表現最突出。',
    '2615': '論文點名的航運高績效樣本，萬海 2024 報酬 612.10%，勝率達 100%。',
    '2880': '華南金屬有效果類金融股，論文報酬 132.38%。',
    '2888': '論文指出雖為正報酬，但勝率僅 45.9%，且最大回撤達 19.8%，需調整 α 門檻。',
    '2889': '論文列為需進一步調參的案例，國票金 2024 回測呈負報酬（-9.07%）。',
    '3045': '論文明確提到此股在通信網路族群中呈現負報酬（-24.42%），為無效果類代表。',
    '3231': '論文指出緯創的適應度分數相對突出（484.36%），電腦及週邊設備族群代表。',
    '5876': '上海商銀屬有效果類金融股，論文報酬 120.45%。',
    '5880': '合庫金 (5880)，正確代號為 5880（非 2330），為長期穩定型金融股代表，建議年度重新訓練。',
    '1301': '台塑屬長期穩定型塑膠族群，本方法下列為無效果類，產業週期波動影響策略效果。',
};

const PAPER_RESULTS = {
    '1101': { paperReturn: 28.14 },
    '1102': { paperReturn: 76.43 },
    '1216': { paperReturn: 54.22 },
    '1301': { paperReturn: -18.50 },
    '2303': { paperReturn: 312.88, paperWin: 82.4 },
    '2308': { paperReturn: 198.76 },
    '2317': { paperReturn: 88.34 },
    '2330': { paperReturn: 150.02, paperWin: 78.6 },
    '2382': { paperReturn: 694.84, paperWin: 91.2 },
    '2412': { paperReturn: 22.18, paperWin: 68.4 },
    '2454': { paperReturn: 256.44, paperWin: 86.2 },
    '2603': { paperReturn: 142.50 },
    '2609': { paperReturn: 1176.08, paperWin: 100, paperDrawdown: 0.0 },
    '2615': { paperReturn: 612.10, paperWin: 100 },
    '2880': { paperReturn: 132.38, paperWin: 74.2 },
    '2881': { paperReturn: 64.80 },
    '2882': { paperReturn: 58.66 },
    '2884': { paperReturn: 96.34 },
    '2886': { paperReturn: 88.14 },
    '2887': { paperReturn: 78.92 },
    '2888': { paperReturn: 55.71, paperWin: 45.9, paperDrawdown: 19.8 },
    '2889': { paperReturn: -9.07, paperWin: 75.0 },
    '2891': { paperReturn: 112.44 },
    '2892': { paperReturn: 94.60 },
    '3045': { paperReturn: -24.42, paperWin: 62.5, paperDrawdown: 6.27 },
    '3231': { paperReturn: 484.36, paperWin: 88.6 },
    '3711': { paperReturn: 188.22, paperWin: 80.4 },
    '4904': { paperReturn: -14.88, paperWin: 60.0 },
    '5871': { paperReturn: 160.44 },
    '5876': { paperReturn: 120.45, paperWin: 72.8 },
    '5880': { paperReturn: 84.22, paperWin: 70.6 },
};

const RAW_STOCKS = [
    ['1101', '台泥', '水泥', 'general'],
    ['1102', '亞泥', '水泥', 'effective'],
    ['1215', '卜蜂', '食品', 'general'],
    ['1216', '統一', '食品', 'effective'],
    ['1301', '台塑', '塑膠', 'ineffective'],
    ['1303', '南亞', '塑膠', 'general'],
    ['2002', '中鋼', '鋼鐵', 'ineffective'],
    ['2207', '和泰車', '汽車', 'general'],
    ['2301', '光寶科', '電子零組件', 'general'],
    ['2303', '聯電', '半導體', 'general'],
    ['2308', '台達電', '電子零組件', 'effective'],
    ['2317', '鴻海', '電腦及週邊設備', 'general'],
    ['2330', '台積電', '半導體', 'effective'],
    ['2345', '智邦', '電腦及週邊設備', 'general'],
    ['2357', '華碩', '電腦及週邊設備', 'general'],
    ['2379', '瑞昱', '半導體', 'general'],
    ['2382', '廣達', '電腦及週邊設備', 'effective'],
    ['2395', '研華', '電腦及週邊設備', 'general'],
    ['2408', '南亞科', '半導體', 'ineffective'],
    ['2412', '中華電', '通信網路', 'general'],
    ['2454', '聯發科', '半導體', 'effective'],
    ['2603', '長榮', '航運', 'general'],
    ['2609', '陽明海運', '航運', 'effective'],
    ['2615', '萬海', '航運', 'effective'],
    ['2880', '華南金', '金融', 'effective'],
    ['2881', '富邦金', '金融', 'general'],
    ['2882', '國泰金', '金融', 'general'],
    ['2884', '玉山金', '金融', 'effective'],
    ['2885', '元大金', '金融', 'general'],
    ['2886', '兆豐金', '金融', 'effective'],
    ['2887', '台新金', '金融', 'effective'],
    ['2888', '新光金', '金融', 'ineffective'],
    ['2889', '國票金', '金融', 'ineffective'],
    ['2890', '永豐金', '金融', 'general'],
    ['2891', '中信金', '金融', 'effective'],
    ['2892', '第一金', '金融', 'effective'],
    ['2912', '統一超', '食品', 'general'],
    ['3008', '大立光', '半導體', 'general'],
    ['3017', '奇鋐', '電子零組件', 'general'],
    ['3034', '聯詠', '半導體', 'general'],
    ['3045', '台灣大', '通信網路', 'ineffective'],
    ['3231', '緯創', '電腦及週邊設備', 'effective'],
    ['3711', '日月光投控', '半導體', 'effective'],
    ['4904', '遠傳', '通信網路', 'ineffective'],
    ['4938', '和碩', '電腦及週邊設備', 'general'],
    ['5871', '中租-KY', '其他', 'effective'],
    ['5876', '上海商銀', '金融', 'effective'],
    ['5880', '合庫金', '金融', 'effective'],
];

const SERIES_CACHE = new Map();
const REAL_PRICE_CACHE = new Map();
const CHARTS = {};

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return hash >>> 0;
}

function createRng(seed) {
    let state = seed >>> 0;
    return {
        next() {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 0x100000000;
        },
        gauss() {
            let left = this.next();
            let right = this.next();
            while (left <= 1e-9) {
                left = this.next();
            }
            return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
        },
    };
}

function countUp(el, endValue, format, duration = 700) {
    if (!el) return;
    const t0 = performance.now();
    const tick = (now) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = format(endValue * eased);
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function formatPercent(value, digits = 1) {
    return `${roundTo(value, digits).toFixed(digits)}%`;
}

function formatValue(value, digits = 2) {
    return roundTo(value, digits).toFixed(digits);
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }
    return parsed.toLocaleString('zh-TW', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return '-';
    }
    return parsed.toLocaleString('zh-TW');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function renderKVRows(rows) {
    return rows.map(([key, value, color]) => `
        <div class="kv-row">
            <span class="kv-key">${key}</span>
            <span class="kv-val" style="color:${color || 'var(--text)'}">${value}</span>
        </div>
    `).join('');
}

function getParamSpec(key) {
    return PARAMS.find((spec) => spec.key === key);
}

function quantiseParam(spec, value) {
    const levels = (2 ** spec.bits) - 1;
    const ratio = (value - spec.min) / (spec.max - spec.min);
    return clamp(Math.round(ratio * levels), 0, levels);
}

function encodeBitSegments(params) {
    return PARAMS.map((spec) => quantiseParam(spec, params[spec.key]).toString(2).padStart(spec.bits, '0'));
}

function buildStock(code, name, industry, performanceClass) {
    const industryConfig = INDUSTRY_LIBRARY[industry] || INDUSTRY_LIBRARY.其他;
    const anchorBase = ANCHOR_LIBRARY[industry] || ANCHOR_LIBRARY.其他;
    const override = STOCK_OVERRIDES[code] || {};
    const seed = hashString(`${code}-${name}`);
    const jitter = (((seed >>> 8) % 1000) / 1000) - 0.5;
    const startRatio = ((seed >>> 16) % 1000) / 1000;
    const startPrice = roundTo(industryConfig.startMin + startRatio * (industryConfig.startMax - industryConfig.startMin), 2);
    const classShift = performanceClass === 'effective' ? -0.02 : performanceClass === 'ineffective' ? 0.05 : 0.0;
    const anchor = {
        intervals: clamp(Math.round(anchorBase.intervals + jitter * 6), 32, 63),
        holdDays: clamp(Math.round(anchorBase.holdDays + jitter * 4), 5, 30),
        targetProfit: clamp(roundTo(anchorBase.targetProfit + jitter * 1.4 + (performanceClass === 'effective' ? 0.7 : performanceClass === 'ineffective' ? -0.5 : 0), 1), 1.5, 12.0),
        alpha: clamp(roundTo(anchorBase.alpha + jitter * 0.08 + classShift, 3), 0.25, 0.95),
    };

    if (override.anchor) {
        Object.assign(anchor, override.anchor);
    }

    return {
        code,
        name,
        industry,
        performanceClass,
        startPrice,
        bias: (((seed >>> 4) % 1000) / 1000 - 0.5) * 0.00014,
        phaseShift: seed % 360,
        note: STOCK_NOTES[code] || '',
        paperResult: PAPER_RESULTS[code] || null,
        anchor,
        override,
    };
}

const STOCKS = RAW_STOCKS.map(([code, name, industry, performanceClass]) => buildStock(code, name, industry, performanceClass));

function getStockByCode(code) {
    return STOCKS.find((stock) => stock.code === code) || STOCKS[0];
}

function getStockSeries(stock) {
    if (SERIES_CACHE.has(stock.code)) {
        return SERIES_CACHE.get(stock.code);
    }

    const industryConfig = INDUSTRY_LIBRARY[stock.industry] || INDUSTRY_LIBRARY.其他;
    const classConfig = CLASS_LIBRARY[stock.performanceClass];
    const rng = createRng(hashString(`${stock.code}-${stock.name}-series`));
    const totalDays = PAPER_CONTEXT.trainDays + PAPER_CONTEXT.testDays;
    const prices = [stock.startPrice];
    const volMul = stock.override.volMul || 1;
    const bias = stock.override.bias || 0;

    for (let index = 1; index < totalDays; index += 1) {
        const isTest = index >= PAPER_CONTEXT.trainDays;
        const cycle = Math.sin((index + stock.phaseShift) / industryConfig.cycle) * industryConfig.cycleAmp;
        const secondary = Math.cos((index + stock.phaseShift * 0.35) / (industryConfig.cycle * 0.55)) * industryConfig.secondaryAmp;
        const event = rng.next() > 0.987
            ? rng.gauss() * industryConfig.eventAmp * classConfig.eventMul * volMul
            : 0;
        const drift = industryConfig.drift
            + (isTest ? classConfig.testDrift : classConfig.trainDrift)
            + stock.bias
            + bias
            + cycle
            + secondary * 0.65;
        const shock = rng.gauss() * industryConfig.vol * classConfig.volMul * volMul + event;
        const nextPrice = Math.max(6, prices[index - 1] * Math.exp(drift + shock));
        prices.push(nextPrice);
    }

    const series = {
        train: prices.slice(0, PAPER_CONTEXT.trainDays),
        test: prices.slice(PAPER_CONTEXT.trainDays),
    };
    SERIES_CACHE.set(stock.code, series);
    return series;
}

function createIntervalModel(prices, count) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const width = Math.max((max - min) / count, 1e-6);
    const intervals = Array.from({ length: count }, (_, index) => {
        const lower = min + width * index;
        const upper = index === count - 1 ? max : min + width * (index + 1);
        return {
            index,
            lower,
            upper,
            label: `${roundTo(lower, 1).toFixed(1)}–${roundTo(upper, 1).toFixed(1)}`,
        };
    });

    return { min, max, width, count, intervals };
}

function priceToIntervalIndex(model, price) {
    if (!Number.isFinite(price) || model.count === 1) {
        return 0;
    }
    if (price <= model.min) {
        return 0;
    }
    if (price >= model.max) {
        return model.count - 1;
    }
    return clamp(Math.floor((price - model.min) / model.width), 0, model.count - 1);
}

function generateProfitPairs(prices, holdDays) {
    const pairs = [];
    for (let index = 0; index < prices.length - holdDays; index += 1) {
        const buyPrice = prices[index];
        const sellPrice = prices[index + holdDays];
        pairs.push({
            buyPrice,
            profitPct: ((sellPrice - buyPrice) / buyPrice) * 100,
        });
    }
    return pairs;
}

function analyzeIntervals(model, profitPairs, targetProfit, alpha) {
    const buckets = Array.from({ length: model.count }, () => []);
    profitPairs.forEach((pair) => {
        buckets[priceToIntervalIndex(model, pair.buyPrice)].push(pair.profitPct);
    });

    return model.intervals.map((interval, index) => {
        const profits = buckets[index];
        if (!profits.length) {
            return {
                ...interval,
                avgProfit: 0,
                successProb: 0,
                sampleSize: 0,
                signal: 'sell',
                entryPrice: roundTo(interval.lower + (interval.upper - interval.lower) * 0.2, 2),
            };
        }

        const avgProfit = profits.reduce((sum, value) => sum + value, 0) / profits.length;
        const successProb = profits.filter((value) => value >= targetProfit).length / profits.length;
        return {
            ...interval,
            avgProfit,
            successProb,
            sampleSize: profits.length,
            signal: successProb >= alpha ? 'buy' : 'sell',
            entryPrice: roundTo(interval.lower + (interval.upper - interval.lower) * 0.2, 2),
        };
    });
}

function computeMaxDrawdown(equityCurve) {
    let peak = equityCurve[0] || 0;
    let maxDrawdown = 0;
    equityCurve.forEach((value) => {
        peak = Math.max(peak, value);
        if (peak > 0) {
            maxDrawdown = Math.min(maxDrawdown, ((value - peak) / peak) * 100);
        }
    });
    return maxDrawdown;
}

function runBacktest(testPrices, intervalModel, intervalAnalysis, holdDays, targetProfit) {
    let cash = 100;
    let shares = 0;
    let position = null;
    const equity = [100];
    const trades = [];
    const buyMarkers = [];
    const sellMarkers = [];

    for (let index = 0; index < testPrices.length; index += 1) {
        const price = testPrices[index];
        const zone = intervalAnalysis[priceToIntervalIndex(intervalModel, price)];

        if (!position && zone.signal === 'buy' && index + holdDays < testPrices.length) {
            shares = cash / price;
            cash = 0;
            position = {
                entryIndex: index,
                entryPrice: price,
                exitDue: index + holdDays,
            };
            buyMarkers.push({ x: index, y: price });
        } else if (position) {
            const pnlPct = ((price - position.entryPrice) / position.entryPrice) * 100;
            const due = index >= position.exitDue;
            const targetHit = pnlPct >= targetProfit;
            const sellSignal = index > position.entryIndex && zone.signal === 'sell';

            if (due || targetHit || sellSignal) {
                cash = shares * price;
                shares = 0;
                sellMarkers.push({ x: index, y: price });
                trades.push({
                    entry: position.entryPrice,
                    exit: price,
                    pnlPct,
                    holdingDays: index - position.entryIndex,
                    reason: targetHit ? '達標' : due ? '到期' : '區間轉弱',
                });
                position = null;
            }
        }

        equity.push(position ? shares * price : cash);
    }

    if (position) {
        const lastPrice = testPrices[testPrices.length - 1];
        const pnlPct = ((lastPrice - position.entryPrice) / position.entryPrice) * 100;
        cash = shares * lastPrice;
        shares = 0;
        sellMarkers.push({ x: testPrices.length - 1, y: lastPrice });
        trades.push({
            entry: position.entryPrice,
            exit: lastPrice,
            pnlPct,
            holdingDays: (testPrices.length - 1) - position.entryIndex,
            reason: '期末結算',
        });
        position = null;
    }

    const totalReturn = ((cash / 100) - 1) * 100;
    const buyHoldReturn = ((testPrices[testPrices.length - 1] / testPrices[0]) - 1) * 100;
    const winRate = trades.length
        ? (trades.filter((trade) => trade.pnlPct > 0).length / trades.length) * 100
        : 0;
    const avgTrade = trades.length
        ? trades.reduce((sum, trade) => sum + trade.pnlPct, 0) / trades.length
        : 0;
    const maxDrawdown = computeMaxDrawdown(equity);

    return {
        totalReturn,
        buyHoldReturn,
        winRate,
        avgTrade,
        maxDrawdown,
        tradeCount: trades.length,
        equity,
        priceSeries: testPrices,
        buyMarkers,
        sellMarkers,
        trades,
    };
}

function getParameterDistance(params, anchor) {
    const weights = { intervals: 1.0, holdDays: 1.0, targetProfit: 1.1, alpha: 1.2 };
    const weighted = PARAMS.map((spec) => {
        const distance = Math.abs(params[spec.key] - anchor[spec.key]) / (spec.max - spec.min);
        return distance * weights[spec.key];
    });
    return weighted.reduce((sum, value) => sum + value, 0) / weighted.length;
}

function decodeGene(gene) {
    const params = {};
    PARAMS.forEach((spec, index) => {
        const value = spec.min + gene[index] * (spec.max - spec.min);
        params[spec.key] = spec.decimals === 0 ? Math.round(value) : roundTo(value, spec.decimals);
    });
    return params;
}

function createEvaluator(stock) {
    const { train, test } = getStockSeries(stock);
    const cache = new Map();

    return (params) => {
        const key = `${params.intervals}|${params.holdDays}|${params.targetProfit.toFixed(1)}|${params.alpha.toFixed(3)}`;
        if (cache.has(key)) {
            return cache.get(key);
        }

        const intervalModel = createIntervalModel(train, params.intervals);
        const profitPairs = generateProfitPairs(train, params.holdDays);
        const intervalAnalysis = analyzeIntervals(intervalModel, profitPairs, params.targetProfit, params.alpha);
        const metrics = runBacktest(test, intervalModel, intervalAnalysis, params.holdDays, params.targetProfit);
        const buyZoneCount = intervalAnalysis.filter((zone) => zone.signal === 'buy').length;

        // Thesis fitness (§3.3 pseudocode / pyodide runner):
        //   fitness = (Σ avg_profit / bins) × (Σ success_prob / bins)
        // where bins = non-empty intervals. avg_profit is already in percent; normalise by
        // targetProfit so the two factors are on a comparable scale and the product stays bounded.
        let sumAvg = 0;
        let sumProb = 0;
        let bins = 0;
        for (const zone of intervalAnalysis) {
            if (zone.sampleSize > 0) {
                sumAvg += zone.avgProfit / Math.max(params.targetProfit, 0.1);
                sumProb += zone.successProb;
                bins += 1;
            }
        }
        const fitness = bins
            ? roundTo((sumAvg / bins) * (sumProb / bins), 4)
            : -1;

        const result = {
            ...metrics,
            intervalModel,
            intervalAnalysis,
            params,
            fitness,
            buyZoneCount,
        };

        cache.set(key, result);
        return result;
    };
}

class GAOptimizer {
    constructor(stock, evaluator, config) {
        this.stock = stock;
        this.evaluator = evaluator;
        this.config = config;
        this.rng = createRng(hashString(`${stock.code}-${JSON.stringify(config)}`));
        this.population = Array.from({ length: config.POP }, () => PARAMS.map(() => this.rng.next()));
        this.history = [];
    }

    selectRoulette(fitnesses) {
        const minFitness = Math.min(...fitnesses);
        const offset = minFitness < 0 ? Math.abs(minFitness) + 1 : 1;
        const weights = fitnesses.map((fitness) => fitness + offset);
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let threshold = this.rng.next() * total;
        for (let index = 0; index < weights.length; index += 1) {
            threshold -= weights[index];
            if (threshold <= 0) {
                return this.population[index];
            }
        }
        return this.population[this.population.length - 1];
    }

    crossover(left, right) {
        if (this.rng.next() > this.config.CR) {
            return this.rng.next() < 0.5 ? left.slice() : right.slice();
        }
        const point = Math.floor(1 + this.rng.next() * (PARAMS.length - 1));
        return [...left.slice(0, point), ...right.slice(point)];
    }

    mutate(gene) {
        return gene.map((value, index) => {
            if (this.rng.next() < this.config.MR) {
                const spread = 0.16 - index * 0.015;
                return clamp(value + this.rng.gauss() * spread, 0, 1);
            }
            return value;
        });
    }

    step() {
        const evaluations = this.population.map((gene) => this.evaluator(decodeGene(gene)));
        const fitnesses = evaluations.map((evaluation) => evaluation.fitness);
        const order = [...fitnesses.keys()].sort((left, right) => fitnesses[right] - fitnesses[left]);
        const bestIndex = order[0];
        const bestEvaluation = evaluations[bestIndex];
        const meanFit = fitnesses.reduce((sum, fitness) => sum + fitness, 0) / fitnesses.length;
        const worstFit = Math.min(...fitnesses);

        this.history.push({
            bestFit: fitnesses[bestIndex],
            meanFit,
            worstFit,
            bestParams: bestEvaluation.params,
            bestEvaluation,
            allFits: [...fitnesses],
        });

        const nextPopulation = order.slice(0, this.config.ELITE).map((index) => this.population[index].slice());
        while (nextPopulation.length < this.config.POP) {
            const parentA = this.selectRoulette(fitnesses);
            const parentB = this.selectRoulette(fitnesses);
            nextPopulation.push(this.mutate(this.crossover(parentA, parentB)));
        }
        this.population = nextPopulation;
    }

    run() {
        for (let generation = 0; generation < this.config.GENS; generation += 1) {
            this.step();
        }
        return this.history;
    }
}

function runRandomSearch(evaluator, config, seedKey) {
    const rng = createRng(hashString(seedKey));
    let best = -Infinity;
    const rolling = [];

    for (let generation = 0; generation < config.GENS; generation += 1) {
        for (let index = 0; index < config.POP; index += 1) {
            const params = decodeGene(PARAMS.map(() => rng.next()));
            const evaluation = evaluator(params);
            best = Math.max(best, evaluation.fitness);
        }
        rolling.push(roundTo(best, 3));
    }

    return rolling;
}

function histBins(data, bins, lower, upper) {
    const safeLower = Number.isFinite(lower) ? lower : 0;
    const safeUpper = Number.isFinite(upper) && upper > safeLower ? upper : safeLower + 1;
    const step = (safeUpper - safeLower) / bins;
    const counts = new Array(bins).fill(0);
    const labels = Array.from({ length: bins }, (_, index) => (safeLower + index * step + step / 2).toFixed(2));
    data.forEach((value) => {
        const binIndex = clamp(Math.floor((value - safeLower) / step), 0, bins - 1);
        counts[binIndex] += 1;
    });
    return { labels, counts };
}

function createChart(id, config) {
    if (CHARTS[id]) {
        CHARTS[id].destroy();
    }
    const canvas = document.getElementById(id);
    CHARTS[id] = new Chart(canvas, config);
    return CHARTS[id];
}

const uiState = {
    currentRun: null,
    currentStockCode: '2609',
    currentIndustry: '全部',
};

const marketState = {
    selectedSymbol: '',
    selectedAssetType: '',
    instruments: [],
    bars: [],
    summary: {
        instrumentCounts: { stock: 0, etf: 0, futures: 0 },
        totalInstruments: 0,
        barCount: 0,
        contractMonthCount: 0,
        latestTradeDate: null,
        latestFetchedAt: null,
    },
};

let curGen = 0;
let playTimer = null;
let rerunTimer = null;
let marketReloadTimer = null;
let resolvedMarketApiBase = '';

function getVisibleStocks() {
    if (uiState.currentIndustry === '全部') {
        return STOCKS;
    }
    return STOCKS.filter((stock) => stock.industry === uiState.currentIndustry);
}

function populateFilters() {
    const industrySelect = document.getElementById('industryFilter');
    const industries = ['全部', ...new Set(STOCKS.map((stock) => stock.industry))];
    industrySelect.innerHTML = industries.map((industry) => `
        <option value="${industry}">${industry}</option>
    `).join('');
    industrySelect.value = uiState.currentIndustry;
}

function populateStockSelect(preferredCode) {
    const select = document.getElementById('stockSelect');
    const visibleStocks = getVisibleStocks();
    const selectedCode = visibleStocks.some((stock) => stock.code === preferredCode)
        ? preferredCode
        : visibleStocks[0].code;

    select.innerHTML = visibleStocks.map((stock) => `
        <option value="${stock.code}">${stock.code} · ${stock.name}</option>
    `).join('');
    select.value = selectedCode;
    uiState.currentStockCode = selectedCode;
}

function renderHeroStats() {
    document.getElementById('statSharpe').textContent = formatPercent(PAPER_CONTEXT.positiveRate, 2);
    document.getElementById('statReturn').textContent = String(PAPER_CONTEXT.universeSize);
    document.getElementById('statWin').textContent = PAPER_CONTEXT.trainPeriod;
    document.getElementById('statTest').textContent = PAPER_CONTEXT.testPeriod;
}

function renderStaticCards() {
    document.getElementById('chromTable').innerHTML = renderKVRows(PARAMS.map((spec) => {
        const range = spec.decimals === 0
            ? `${spec.min}–${spec.max}${spec.unit}`
            : `${spec.min.toFixed(spec.decimals)}–${spec.max.toFixed(spec.decimals)}${spec.unit}`;
        return [spec.label, `${spec.bits} bit · ${range}`, C.teal];
    }));

    document.getElementById('fitnessTable').innerHTML = renderKVRows([
        ['總報酬', '策略期末淨值相對起始資金的變化', C.green],
        ['勝率', '獲利交易筆數 / 總交易筆數', C.teal],
        ['最大回撤', '衡量資金曲線的下行風險', C.red],
        ['相對基準', '同時與固定 PPTS、Buy & Hold 對照', C.purple],
    ]);
}

function renderSelectedStockMeta(stock, run) {
    const meta = document.getElementById('selectedStockMeta');
    const note = stock.note || '依論文方法切換逐檔股票，重跑 GAPPTS 以觀察參數收斂差異。';
    const paper = stock.paperResult?.paperReturn != null
        ? ` 論文表列報酬：${formatPercent(stock.paperResult.paperReturn, 2)}。`
        : '';
    const live = run
        ? ` 目前重建結果：${formatPercent(run.best.bestEvaluation.totalReturn, 2)}，勝率 ${formatPercent(run.best.bestEvaluation.winRate, 1)}。`
        : '';
    meta.innerHTML = `<strong>${stock.name} (${stock.code})</strong> · ${stock.industry} · ${CLASS_LABELS[stock.performanceClass]}。${note}${paper}${live}`;
}

function renderSummaryCards(run) {
    const { stock, best } = run;
    const evaluation = best.bestEvaluation;
    const paper = stock.paperResult || {};

    document.getElementById('gen0Stats').innerHTML = renderKVRows([
        ['股票', `${stock.name} (${stock.code})`, C.teal],
        ['產業', stock.industry, C.muted],
        ['價格區間數', `${evaluation.params.intervals} 格`, C.green],
        ['持有天數', `${evaluation.params.holdDays} 天`, C.green],
        ['目標利潤', formatPercent(evaluation.params.targetProfit, 1), C.green],
        ['進場門檻 α', evaluation.params.alpha.toFixed(3), C.green],
    ]);

    document.getElementById('finalStats').innerHTML = renderKVRows([
        ['GAPPTS 報酬', formatPercent(evaluation.totalReturn, 2), evaluation.totalReturn >= 0 ? C.green : C.red],
        ['Buy & Hold', formatPercent(evaluation.buyHoldReturn, 2), C.blue],
        ['論文表列', paper.paperReturn != null ? formatPercent(paper.paperReturn, 2) : '—', C.purple],
        ['勝率', formatPercent(evaluation.winRate, 1), C.green],
        ['最大回撤', formatPercent(Math.abs(evaluation.maxDrawdown), 2), C.red],
        ['Fitness', formatValue(evaluation.fitness, 3), C.yellow],
    ]);

    document.getElementById('impStats').innerHTML = renderKVRows([
        ['有效果類', `${PAPER_CONTEXT.effectiveCount} 檔 (39.6%)`, C.green],
        ['一般類', `${PAPER_CONTEXT.generalCount} 檔 (45.8%)`, C.teal],
        ['無效果類', `${PAPER_CONTEXT.ineffectiveCount} 檔 (14.6%)`, C.red],
        ['最高報酬', '陽明海運 2609：1176.08%', C.green],
        ['第二高', '廣達 2382：694.84%', C.green],
        ['最佳 fitness', '聯電 2303：0.7058', C.yellow],
        ['正報酬覆蓋率', '93.75%（45/48 檔）', C.muted],
    ]);
}

function renderIntervalChart(run) {
    const zones = run.best.bestEvaluation.intervalAnalysis;
    createChart('returnDistChart', {
        type: 'bar',
        data: {
            labels: zones.map((zone) => `#${zone.index + 1}`),
            datasets: [
                {
                    type: 'bar',
                    label: '平均利潤 (%)',
                    data: zones.map((zone) => roundTo(zone.avgProfit, 2)),
                    backgroundColor: zones.map((zone) => zone.signal === 'buy' ? 'rgba(60,185,90,.45)' : 'rgba(232,64,64,.18)'),
                    borderColor: zones.map((zone) => zone.signal === 'buy' ? C.green : C.red),
                    borderWidth: 1,
                    borderRadius: 3,
                    borderSkipped: false,
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: '達標機率 (%)',
                    data: zones.map((zone) => roundTo(zone.successProb * 100, 1)),
                    borderColor: C.teal,
                    backgroundColor: 'rgba(48,200,232,.15)',
                    tension: 0.25,
                    pointRadius: 2,
                    borderWidth: 2,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, ticks: { color: C.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '平均利潤 (%)', color: C.muted } },
                y1: {
                    position: 'right',
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false, color: C.border },
                    ticks: { color: C.muted, font: { size: 10 } },
                    title: { display: true, text: '達標機率 (%)', color: C.muted },
                },
            },
        },
    });
}

function renderClassChart(selectedStock) {
    createChart('profitDistChart', {
        type: 'doughnut',
        data: {
            labels: ['有效果', '一般', '無效果'],
            datasets: [{
                data: [PAPER_CONTEXT.effectiveCount, PAPER_CONTEXT.generalCount, PAPER_CONTEXT.ineffectiveCount],
                backgroundColor: ['rgba(60,185,90,.7)', 'rgba(48,200,232,.65)', 'rgba(232,64,64,.65)'],
                borderColor: [C.green, C.teal, C.red],
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: C.muted, font: { size: 11 } } },
                tooltip: { backgroundColor: C.surface },
                title: {
                    display: true,
                    text: `${selectedStock.name} 屬於 ${CLASS_LABELS[selectedStock.performanceClass]}`,
                    color: C.text,
                    font: { size: 12, weight: '600' },
                },
            },
            cutout: '62%',
        },
    });
}

function updateParamGrid(generation) {
    const run = uiState.currentRun;
    if (!run) {
        return;
    }
    const params = run.history[generation].bestParams;
    const bitSegments = encodeBitSegments(params);

    document.getElementById('paramGrid').innerHTML = PARAMS.map((spec, index) => {
        const ratio = (params[spec.key] - spec.min) / (spec.max - spec.min);
        const value = spec.decimals === 0
            ? `${params[spec.key]}${spec.unit}`
            : `${params[spec.key].toFixed(spec.decimals)}${spec.unit}`;
        return `
            <div class="param-cell">
                <div class="param-name">${spec.label}</div>
                <div><span class="param-val">${value}</span></div>
                <div class="param-bar-bg"><div class="param-bar-fill" style="width:${Math.max(6, ratio * 100)}%"></div></div>
                <div style="margin-top:8px;font-size:.68rem;color:var(--dim);font-family:var(--mono)">${bitSegments[index]}</div>
            </div>
        `;
    }).join('');
}

function updatePopulationChart(generation) {
    const run = uiState.currentRun;
    if (!run) {
        return;
    }
    const fits = run.history[generation].allFits;
    const lower = Math.min(...fits) - 2;
    const upper = Math.max(...fits) + 2;
    const { labels, counts } = histBins(fits, 12, lower, upper);

    CHARTS.popDistChart.data.labels = labels;
    CHARTS.popDistChart.data.datasets = [{
        label: `第 ${generation + 1} 代`,
        data: counts,
        backgroundColor: 'rgba(79,160,248,.48)',
        borderColor: C.blue,
        borderWidth: 1,
        borderRadius: 3,
        borderSkipped: false,
    }];
    CHARTS.popDistChart.update('none');
    document.getElementById('popGenLabel').textContent = String(generation + 1);
}

function renderGACharts(run) {
    createChart('convChart', {
        type: 'line',
        data: {
            labels: run.history.map((_, index) => index + 1),
            datasets: [
                { label: '最佳 fitness', data: run.history.map((item) => item.bestFit), borderColor: C.green, backgroundColor: 'rgba(60,185,90,.08)', fill: true, tension: 0.28, pointRadius: 1.5, borderWidth: 2 },
                { label: '平均 fitness', data: run.history.map((item) => item.meanFit), borderColor: C.teal, backgroundColor: 'transparent', fill: false, tension: 0.28, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
                { label: '最差 fitness', data: run.history.map((item) => item.worstFit), borderColor: C.red, backgroundColor: 'transparent', fill: false, tension: 0.28, pointRadius: 0, borderWidth: 1, borderDash: [2, 4] },
                { label: '目前代', data: run.history.map(() => NaN), type: 'scatter', pointRadius: 8, pointBackgroundColor: C.purple, pointBorderColor: '#fff', pointBorderWidth: 2, showLine: false },
            ],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: '世代', color: C.muted } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: 'fitness', color: C.muted } },
            },
        },
    });

    createChart('popDistChart', {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: 'fitness 區間', color: C.muted } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '個體數', color: C.muted } },
            },
        },
    });
}

function renderBacktestCharts(run) {
    // DOM targets removed; kept as no-op to preserve call sites.
    if (!document.getElementById('priceChart')) return;
    const evaluation = run.best.bestEvaluation;
    const priceScatterBuy = evaluation.buyMarkers.map((marker) => ({ x: marker.x + 1, y: marker.y }));
    const priceScatterSell = evaluation.sellMarkers.map((marker) => ({ x: marker.x + 1, y: marker.y }));

    createChart('priceChart', {
        type: 'line',
        data: {
            labels: (() => {
                const cached = SERIES_CACHE.get(run.stock.code);
                if (cached?.isReal && cached.testDates) {
                    return cached.testDates.map((d) => d.slice(5)); // MM-DD
                }
                return evaluation.priceSeries.map((_, index) => index + 1);
            })(),
            datasets: [
                { label: '測試價格', data: evaluation.priceSeries.map((y, i) => ({ x: i + 1, y })), borderColor: C.teal, backgroundColor: 'rgba(48,200,232,.05)', fill: true, tension: 0.14, pointRadius: 0, borderWidth: 1.6 },
                { label: '買入', data: priceScatterBuy, type: 'scatter', pointRadius: 6, pointStyle: 'triangle', pointBackgroundColor: C.green, pointBorderColor: '#fff', pointBorderWidth: 1, showLine: false },
                { label: '賣出', data: priceScatterSell, type: 'scatter', pointRadius: 6, pointStyle: 'triangle', rotation: 180, pointBackgroundColor: C.red, pointBorderColor: '#fff', pointBorderWidth: 1, showLine: false },
            ],
        },
        options: {
            ...BASE_OPTS,
            parsing: false,
            scales: {
                x: { ...BASE_OPTS.scales.x, type: 'linear', title: { display: true, text: SERIES_CACHE.get(run.stock.code)?.isReal ? '日期' : '交易日', color: C.muted }, ticks: { maxTicksLimit: 9, color: C.muted, font: { size: 9 } } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '價格', color: C.muted } },
            },
        },
    });

    createChart('equityChart', {
        type: 'line',
        data: {
            labels: evaluation.equity.map((_, index) => index),
            datasets: [{
                label: '淨值',
                data: evaluation.equity,
                borderColor: evaluation.totalReturn >= 0 ? C.green : C.red,
                backgroundColor: evaluation.totalReturn >= 0 ? 'rgba(60,185,90,.08)' : 'rgba(232,64,64,.08)',
                fill: true,
                tension: 0.12,
                pointRadius: 0,
                borderWidth: 2,
            }],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, ticks: { maxTicksLimit: 6, color: C.muted, font: { size: 9 } } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '資金', color: C.muted } },
            },
        },
    });

    document.getElementById('perfStats').innerHTML = renderKVRows([
        ['GAPPTS 總報酬', formatPercent(evaluation.totalReturn, 2), evaluation.totalReturn >= 0 ? C.green : C.red],
        ['Buy & Hold', formatPercent(evaluation.buyHoldReturn, 2), C.blue],
        ['平均單筆利潤', formatPercent(evaluation.avgTrade, 2), evaluation.avgTrade >= 0 ? C.green : C.red],
        ['勝率', formatPercent(evaluation.winRate, 1), C.green],
        ['最大回撤', formatPercent(Math.abs(evaluation.maxDrawdown), 2), C.red],
        ['交易筆數', `${evaluation.tradeCount} 筆`, C.muted],
        ['fitness', formatValue(evaluation.fitness, 3), C.yellow],
    ]);

    document.getElementById('tradeList').innerHTML = evaluation.trades.slice(0, 8).map((trade, index) => `
        <div class="trade-row">
            <span class="tn">#${String(index + 1).padStart(2, '0')}</span>
            <span class="tr">${trade.entry.toFixed(2)} → ${trade.exit.toFixed(2)}</span>
            <span style="font-size:.72rem;color:var(--dim)">${trade.reason}</span>
            <span class="${trade.pnlPct >= 0 ? 'tp' : 'tl'}">${trade.pnlPct >= 0 ? '+' : ''}${trade.pnlPct.toFixed(2)}%</span>
        </div>
    `).join('') || '<div style="color:var(--muted);font-size:.85rem;text-align:center;padding:16px">沒有產生交易訊號</div>';
}

function renderComparisonCharts(run) {
    const best = run.best.bestEvaluation;
    const fixed = run.fixed;

    createChart('compareChart', {
        type: 'bar',
        data: {
            labels: ['GAPPTS', '固定 PPTS', 'Buy & Hold'],
            datasets: [{
                label: '總報酬 (%)',
                data: [best.totalReturn, fixed.totalReturn, best.buyHoldReturn],
                backgroundColor: ['rgba(60,185,90,.78)', 'rgba(79,160,248,.62)', 'rgba(180,144,255,.62)'],
                borderColor: [C.green, C.blue, C.purple],
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false,
            }],
        },
        options: {
            ...BASE_OPTS,
            indexAxis: 'y',
            plugins: { ...BASE_OPTS.plugins, legend: { display: false } },
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: '總報酬 (%)', color: C.muted } },
                y: { ...BASE_OPTS.scales.y, ticks: { color: C.text, font: { size: 12 } } },
            },
        },
    });

    createChart('efficiencyChart', {
        type: 'line',
        data: {
            labels: run.history.map((_, index) => (index + 1) * run.config.POP),
            datasets: [
                { label: 'GAPPTS', data: run.history.map((item) => item.bestFit), borderColor: C.green, backgroundColor: 'rgba(60,185,90,.08)', fill: true, tension: 0.28, pointRadius: 2, borderWidth: 2 },
                { label: '隨機搜尋', data: run.randomRolling, borderColor: C.blue, backgroundColor: 'transparent', fill: false, tension: 0.28, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3] },
            ],
        },
        options: {
            ...BASE_OPTS,
            scales: {
                x: { ...BASE_OPTS.scales.x, title: { display: true, text: '累積評估次數', color: C.muted }, ticks: { maxTicksLimit: 6, color: C.muted, font: { size: 9 } } },
                y: { ...BASE_OPTS.scales.y, title: { display: true, text: '最佳 fitness', color: C.muted } },
            },
        },
    });
}

function updateGenerationState(generation) {
    const run = uiState.currentRun;
    if (!run) {
        return;
    }

    const nextGeneration = clamp(generation, 0, run.history.length - 1);
    curGen = nextGeneration;
    window.curGen = nextGeneration;
    const highlight = run.history.map(() => NaN);
    highlight[nextGeneration] = run.history[nextGeneration].bestFit;
    CHARTS.convChart.data.datasets[3].data = highlight;
    CHARTS.convChart.update('none');

    updatePopulationChart(nextGeneration);
    updateParamGrid(nextGeneration);
    document.getElementById('genDisplay').textContent = `第 ${nextGeneration + 1} 代 / ${run.history.length}`;
    document.getElementById('fitBadge').textContent = `Fitness ${formatValue(run.history[nextGeneration].bestFit, 3)}`;
    document.getElementById('btnPrev').disabled = nextGeneration === 0;
    document.getElementById('btnNext').disabled = nextGeneration === run.history.length - 1;
    document.getElementById('btnFirst').disabled = nextGeneration === 0;
    document.getElementById('btnLast').disabled = nextGeneration === run.history.length - 1;
}

function lastGenIndex() {
    return uiState.currentRun ? uiState.currentRun.history.length - 1 : 0;
}

function gotoGen(generation) {
    updateGenerationState(generation);
}

function togglePlay() {
    const run = uiState.currentRun;
    if (!run) {
        return;
    }

    if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
        document.getElementById('btnPlay').textContent = '▶ 自動播放';
        return;
    }

    if (curGen >= run.history.length - 1) {
        gotoGen(0);
    }

    document.getElementById('btnPlay').textContent = '⏸ 暫停';
    playTimer = setInterval(() => {
        if (curGen >= run.history.length - 1) {
            clearInterval(playTimer);
            playTimer = null;
            document.getElementById('btnPlay').textContent = '▶ 自動播放';
            return;
        }
        gotoGen(curGen + 1);
    }, 520);
}

function parseConfig() {
    return {
        POP: clamp(parseInt(document.getElementById('cfgPop').value, 10) || DEFAULT_GA_CFG.POP, 20, 120),
        GENS: clamp(parseInt(document.getElementById('cfgGens').value, 10) || DEFAULT_GA_CFG.GENS, 10, 80),
        CR: clamp(parseFloat(document.getElementById('cfgCR').value) || DEFAULT_GA_CFG.CR, 0.30, 1.00),
        MR: clamp(parseFloat(document.getElementById('cfgMR').value) || DEFAULT_GA_CFG.MR, 0.01, 0.30),
        ELITE: 1,
    };
}

function runSimulation(stock, config) {
    const evaluator = createEvaluator(stock);
    const optimizer = new GAOptimizer(stock, evaluator, config);
    const history = optimizer.run();
    const best = history.reduce((winner, current) => current.bestFit > winner.bestFit ? current : winner, history[0]);
    const fixed = evaluator(FIXED_PPTS_PARAMS);
    const randomRolling = runRandomSearch(evaluator, config, `${stock.code}-random-${JSON.stringify(config)}`);

    return { stock, history, best, fixed, randomRolling, config };
}

function renderAll(run) {
    renderSelectedStockMeta(run.stock, run);
    renderSummaryCards(run);
    renderIntervalChart(run);
    renderClassChart(run.stock);
    renderGACharts(run);
    renderBacktestCharts(run);
    renderComparisonCharts(run);
    updateGenerationState(0);
    try { renderTechIndicators(run); } catch (e) { console.warn('renderTechIndicators:', e); }
}

async function rerunGA() {
    const button = document.getElementById('btnRerun');
    const status = document.getElementById('cfgStatus');
    const stock = getStockByCode(document.getElementById('stockSelect').value);
    const config = parseConfig();

    if (rerunTimer) {
        clearTimeout(rerunTimer);
        rerunTimer = null;
    }

    button.disabled = true;
    status.textContent = `⏳ ${stock.name} · 載入數據中…`;

    if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
        document.getElementById('btnPlay').textContent = '▶ 自動播放';
    }

    // Use pre-cached real data only (populated by "同步真實股價" button).
    // Skip blocking API call so strategy renders immediately with synthetic data.
    const realData = REAL_PRICE_CACHE.get(stock.code) || null;
    if (!realData || realData.closes.length < 50) {
        if (SERIES_CACHE.get(stock.code)?.isReal) {
            SERIES_CACHE.delete(stock.code);
        }
        // Use synthetic data so charts always render
        const synth = getStockSeries(stock);
        if (!SERIES_CACHE.has(stock.code)) SERIES_CACHE.set(stock.code, synth);
        const dataSource = '模擬數據（點「📡 同步真實股價」可改用真實 TWSE）';
        status.textContent = `⏳ ${stock.name} · ${dataSource} · POP=${config.POP} · GENS=${config.GENS} 計算中…`;
        setTimeout(() => {
            try {
                const run = runSimulation(stock, config);
                uiState.currentRun = run;
                renderAll(run);
                status.textContent = `✓ 完成 [${dataSource}]：${stock.name} 最佳 fitness ${formatValue(run.best.bestFit, 3)}`;
                const priceCanvas = document.getElementById('priceChart');
                if (priceCanvas) {
                    const target = priceCanvas.closest('.section') || priceCanvas;
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (err) {
                status.textContent = `⚠ 計算錯誤：${err.message}`;
            }
            button.disabled = false;
        }, 20);
        return;
    }

    // Date-based train/test split: before 2024 = train, 2024+ = test
    const cutoff = '2024-01-01';
    let splitIdx = realData.dates.findIndex((d) => d >= cutoff);
    if (splitIdx < 20) splitIdx = Math.max(20, Math.floor(realData.closes.length * 0.8));
    if (realData.closes.length - splitIdx < 10) splitIdx = Math.floor(realData.closes.length * 0.8);

    SERIES_CACHE.set(stock.code, {
        train: realData.closes.slice(0, splitIdx),
        test: realData.closes.slice(splitIdx),
        trainDates: realData.dates.slice(0, splitIdx),
        testDates: realData.dates.slice(splitIdx),
        isReal: true,
    });
    const dataSource = `真實 TWSE ${realData.closes.length} 筆 (${realData.dates[0]} ~ ${realData.dates[realData.dates.length - 1]})`;

    status.textContent = `⏳ ${stock.name} · ${dataSource} · POP=${config.POP} · GENS=${config.GENS} 計算中…`;

    setTimeout(() => {
        try {
            const run = runSimulation(stock, config);
            uiState.currentRun = run;
            renderAll(run);
            status.textContent = `✓ 完成 [${dataSource}]：${stock.name} 最佳 fitness ${formatValue(run.best.bestFit, 3)}`;
            const priceCanvas = document.getElementById('priceChart');
            if (priceCanvas) {
                const target = priceCanvas.closest('.section') || priceCanvas;
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (error) {
            status.textContent = `錯誤：${error.message}`;
        } finally {
            button.disabled = false;
        }
    }, 20);
}

function scheduleRerun(message = '參數已更新，重新計算中…') {
    const status = document.getElementById('cfgStatus');
    if (status) {
        status.textContent = message;
    }

    if (rerunTimer) {
        clearTimeout(rerunTimer);
    }

    rerunTimer = setTimeout(() => {
        rerunTimer = null;
        rerunGA();
    }, 220);
}

function resetGaCfg() {
    document.getElementById('cfgPop').value = String(DEFAULT_GA_CFG.POP);
    document.getElementById('cfgGens').value = String(DEFAULT_GA_CFG.GENS);
    document.getElementById('cfgCR').value = DEFAULT_GA_CFG.CR.toFixed(2);
    document.getElementById('cfgMR').value = DEFAULT_GA_CFG.MR.toFixed(2);
    scheduleRerun('已恢復論文預設值，重新計算中…');
}

function bindEvents() {
    document.getElementById('industryFilter').addEventListener('change', (event) => {
        uiState.currentIndustry = event.target.value;
        populateStockSelect(uiState.currentStockCode);
        renderSelectedStockMeta(getStockByCode(document.getElementById('stockSelect').value), uiState.currentRun);
        rerunGA();
    });

    document.getElementById('stockSelect').addEventListener('change', (event) => {
        uiState.currentStockCode = event.target.value;
        renderSelectedStockMeta(getStockByCode(uiState.currentStockCode), uiState.currentRun);
        rerunGA();
    });

    ['cfgPop', 'cfgGens', 'cfgCR', 'cfgMR'].forEach((id) => {
        const input = document.getElementById(id);
        input.addEventListener('change', () => {
            scheduleRerun('GA 參數已變更，重新計算中…');
        });
        input.addEventListener('input', () => {
            scheduleRerun('GA 參數已變更，重新計算中…');
        });
    });

    const syncBtn = document.getElementById('btnSyncStocks');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => syncThesisStocks());
    }
}

function setMarketStatus(message, state = 'info') {
    const status = document.getElementById('marketStatus');
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.state = state;
}

function setMarketApiLabel(value) {
    const label = document.getElementById('marketApiLabel');
    if (label) {
        label.textContent = value;
    }
}

function deriveMarketApiCandidates() {
    if (typeof window.APP_CONFIG_UTILS?.deriveApiCandidates === 'function') {
        return window.APP_CONFIG_UTILS.deriveApiCandidates();
    }

    const configuredApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
        ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    return configuredApiBase ? [configuredApiBase] : [];
}

async function fetchRealPriceSeries(symbol) {
    if (REAL_PRICE_CACHE.has(symbol)) {
        return REAL_PRICE_CACHE.get(symbol);
    }
    try {
        const apiBase = await resolveMarketApiBase();
        if (!apiBase) return null;
        // Try DB bars first
        const params = new URLSearchParams({ symbol, limit: 2000, asset_type: 'stock' });
        const res = await fetch(`${apiBase}/api/market/bars?${params}`, {
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
            const payload = await res.json();
            const bars = (payload.records || [])
                .filter((r) => r.close != null && r.tradeDate)
                .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
            if (bars.length >= 50) {
                const result = { dates: bars.map((r) => r.tradeDate), closes: bars.map((r) => Number(r.close)) };
                REAL_PRICE_CACHE.set(symbol, result);
                return result;
            }
        }
        // Fallback: public Yahoo proxy (no auth needed)
        return await fetchYahooDirect(apiBase, symbol);
    } catch {
        return null;
    }
}

async function fetchYahooDirect(apiBase, symbol) {
    try {
        const res = await fetch(`${apiBase}/api/market/yahoo-prices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbols: [symbol], range: '2y' }),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const entry = data.results?.[symbol];
        if (!entry || entry.closes.length < 50) return null;
        REAL_PRICE_CACHE.set(symbol, entry);
        return entry;
    } catch {
        return null;
    }
}

async function batchFetchYahoo(symbols) {
    try {
        const apiBase = await resolveMarketApiBase();
        if (!apiBase) return;
        const uncached = symbols.filter((s) => !REAL_PRICE_CACHE.has(s));
        if (!uncached.length) return;
        // Batch in groups of 10
        for (let i = 0; i < uncached.length; i += 10) {
            const batch = uncached.slice(i, i + 10);
            const res = await fetch(`${apiBase}/api/market/yahoo-prices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbols: batch, range: '2y' }),
                signal: AbortSignal.timeout(30000),
            });
            if (!res.ok) continue;
            const data = await res.json();
            for (const [sym, entry] of Object.entries(data.results || {})) {
                if (entry?.closes?.length >= 50) {
                    REAL_PRICE_CACHE.set(sym, entry);
                }
            }
        }
    } catch { /* silent */ }
}

const THESIS_STOCK_CODES = RAW_STOCKS.map(([code]) => code);
let _preloadDone = false;

async function preloadAllStockData() {
    if (_preloadDone) return;
    _preloadDone = true;
    // Batch fetch all uncached stocks via Yahoo proxy
    await batchFetchYahoo(THESIS_STOCK_CODES);
}

async function syncThesisStocks() {
    const status = document.getElementById('cfgStatus');
    if (status) status.textContent = '正在從 Yahoo Finance 載入 48 檔真實股價…';
    try {
        REAL_PRICE_CACHE.clear();
        await batchFetchYahoo(THESIS_STOCK_CODES);
        const loaded = THESIS_STOCK_CODES.filter((c) => REAL_PRICE_CACHE.has(c)).length;
        if (loaded === 0) throw new Error('未取得任何股價資料');
        if (status) status.textContent = `✓ 已載入 ${loaded}/48 檔真實股價，重新計算中…`;
        rerunGA();
    } catch (error) {
        if (status) status.textContent = `同步失敗：${error.message}`;
    }
}

async function resolveMarketApiBase() {
    if (resolvedMarketApiBase) {
        return resolvedMarketApiBase;
    }

    if (typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function') {
        resolvedMarketApiBase = await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'thesis-market' });
        if (resolvedMarketApiBase) {
            setMarketApiLabel(resolvedMarketApiBase);
            return resolvedMarketApiBase;
        }
    }

    const candidates = deriveMarketApiCandidates();
    for (const candidate of candidates) {
        try {
            const response = await fetch(`${candidate}/healthz`);
            if (!response.ok) {
                continue;
            }
            const payload = await response.json().catch(() => null);
            if (payload?.status === 'ok') {
                resolvedMarketApiBase = candidate;
                setMarketApiLabel(candidate);
                return resolvedMarketApiBase;
            }
        } catch {
            continue;
        }
    }

    setMarketApiLabel('unavailable');
    return '';
}

async function requestMarketApi(path, options = {}) {
    const apiBase = await resolveMarketApiBase();
    if (!apiBase) {
        throw new Error('目前找不到可用的市場 API。');
    }

    const response = await fetch(`${apiBase}${path}`, options);
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `HTTP ${response.status}`);
    }

    return response.json();
}

function parseSymbolList(rawValue) {
    if (!rawValue) {
        return [];
    }

    const seen = new Set();
    return String(rawValue)
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => {
            if (!value || seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        })
        .slice(0, 20);
}

function marketSyncPayload() {
    return {
        stock_symbols: parseSymbolList(document.getElementById('marketStockSymbols').value),
        etf_symbols: parseSymbolList(document.getElementById('marketEtfSymbols').value),
        futures_symbols: parseSymbolList(document.getElementById('marketFuturesSymbols').value),
        twse_months: Number(document.getElementById('marketTwseMonths').value) || 3,
        yahoo_range: document.getElementById('marketYahooRange').value || '3mo',
    };
}

function setMarketBusy(isBusy) {
    document.getElementById('marketSyncBtn').disabled = isBusy;
    document.getElementById('marketReloadBtn').disabled = isBusy;
}

function updateMarketStateFromPayload(payload) {
    marketState.summary = {
        instrumentCounts: payload.instrumentCounts || marketState.summary.instrumentCounts,
        totalInstruments: Number(payload.totalInstruments ?? marketState.summary.totalInstruments ?? 0),
        barCount: Number(payload.barCount ?? marketState.summary.barCount ?? 0),
        contractMonthCount: Number(payload.contractMonthCount ?? marketState.summary.contractMonthCount ?? 0),
        latestTradeDate: payload.latestTradeDate ?? marketState.summary.latestTradeDate,
        latestFetchedAt: payload.latestFetchedAt ?? marketState.summary.latestFetchedAt,
    };
}

function renderMarketSummary() {
    const container = document.getElementById('marketSummary');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="ops-summary-card"><div class="k">Instruments</div><div class="v">${formatCount(marketState.summary.totalInstruments)}</div></div>
        <div class="ops-summary-card"><div class="k">Bars</div><div class="v">${formatCount(marketState.summary.barCount)}</div></div>
        <div class="ops-summary-card"><div class="k">Contract Months</div><div class="v">${formatCount(marketState.summary.contractMonthCount)}</div></div>
        <div class="ops-summary-card"><div class="k">Latest Trade</div><div class="v">${escapeHtml(marketState.summary.latestTradeDate || '-')}</div></div>
    `;
}

function renderMarketFilterMeta() {
    const meta = document.getElementById('marketFilterMeta');
    if (!meta) {
        return;
    }

    const counts = marketState.summary.instrumentCounts || { stock: 0, etf: 0, futures: 0 };
    const selected = marketState.selectedSymbol
        ? ` · selected ${marketState.selectedAssetType || '-'} ${marketState.selectedSymbol}`
        : '';
    meta.textContent = `stock ${counts.stock || 0} · etf ${counts.etf || 0} · futures ${counts.futures || 0}${selected}`;
}

function renderMarketBars() {
    const meta = document.getElementById('marketBarsMeta');
    const list = document.getElementById('marketBarsList');
    if (!meta || !list) {
        return;
    }

    if (!marketState.selectedSymbol) {
        meta.textContent = '尚未選取 instrument。';
        list.innerHTML = '<div class="ops-empty">先點選一個 instrument，再查看最近 bars。</div>';
        return;
    }

    const contractMonth = document.getElementById('marketContractMonthFilter').value.trim();
    meta.textContent = `${marketState.selectedAssetType || '-'} ${marketState.selectedSymbol} · bars ${marketState.bars.length} 筆${contractMonth ? ` · contract ${contractMonth}` : ''} · latest sync ${formatDateTime(marketState.summary.latestFetchedAt)}`;

    if (!marketState.bars.length) {
        list.innerHTML = '<div class="ops-empty">這個 symbol 目前沒有符合條件的 bars。</div>';
        return;
    }

    list.innerHTML = marketState.bars.map((bar) => `
        <article class="ops-bar-row">
            <div>
                <div class="ops-bar-primary">${escapeHtml(bar.tradeDate || '-')}</div>
                <div class="ops-bar-secondary">${escapeHtml(bar.displayName || bar.symbol || '-')}</div>
            </div>
            <div class="ops-bar-secondary">${escapeHtml(bar.sourceName || '-')} · ${escapeHtml(bar.symbol || '-')}</div>
            <div class="ops-bar-chip">${escapeHtml(bar.contractMonth || bar.market || '-')}</div>
            <div class="ops-bar-value">C ${bar.close == null ? '-' : formatValue(bar.close, 2)}</div>
            <div class="ops-bar-value">V ${bar.volume == null ? '-' : formatCount(bar.volume)}</div>
        </article>
    `).join('');
}

function renderMarketInstrumentList() {
    const list = document.getElementById('marketInstrumentList');
    if (!list) {
        return;
    }

    renderMarketFilterMeta();

    if (!marketState.instruments.length) {
        list.innerHTML = '<div class="ops-empty">目前沒有 instrument cache。先按「同步市場資料」建立快取。</div>';
        return;
    }

    list.innerHTML = marketState.instruments.map((record) => {
        const metadata = safeJsonParse(record.metadataText || '{}') || {};
        const activeClass = record.symbol === marketState.selectedSymbol && record.assetType === marketState.selectedAssetType
            ? 'active'
            : '';
        const detailBits = [];
        if (record.sourceName === 'TAIFEX' && metadata.commodityCode) {
            detailBits.push(`code ${metadata.commodityCode}`);
        }
        if (Array.isArray(metadata.contractMonths) && metadata.contractMonths.length) {
            detailBits.push(`${metadata.contractMonths.length} contract months`);
        }
        if (record.exchangeName) {
            detailBits.push(record.exchangeName);
        }

        return `
            <button class="ops-card ${activeClass}" type="button" data-symbol="${escapeHtml(record.symbol)}" data-asset-type="${escapeHtml(record.assetType)}">
                <div class="ops-card-top">
                    <div>
                        <div class="ops-card-title">${escapeHtml(record.displayName || record.symbol)}</div>
                        <div class="ops-card-sub">${escapeHtml(record.symbol)} · ${escapeHtml(record.sourceName || '-')} · ${escapeHtml(record.market || '-')}</div>
                    </div>
                    <div class="ops-chip ${escapeHtml(record.assetType || '')}">${escapeHtml((record.assetType || '').toUpperCase())}</div>
                </div>
                <div class="ops-card-meta">
                    <span>${escapeHtml(detailBits.join(' · ') || 'metadata unavailable')}</span>
                    <span>${escapeHtml(formatDateTime(record.fetchedAt))}</span>
                </div>
            </button>
        `;
    }).join('');

    list.querySelectorAll('.ops-card').forEach((button) => {
        button.addEventListener('click', async () => {
            marketState.selectedSymbol = button.dataset.symbol || '';
            marketState.selectedAssetType = button.dataset.assetType || '';
            renderMarketInstrumentList();
            await loadMarketBars(true);
        });
    });
}

async function loadMarketBars(silent = false) {
    const params = new URLSearchParams();
    const contractMonth = document.getElementById('marketContractMonthFilter').value.trim();

    if (marketState.selectedAssetType) {
        params.set('asset_type', marketState.selectedAssetType);
    }
    if (marketState.selectedSymbol) {
        params.set('symbol', marketState.selectedSymbol);
    }
    if (contractMonth) {
        params.set('contract_month', contractMonth);
    }
    params.set('limit', '40');

    try {
        const response = await requestMarketApi(`/api/market/bars?${params.toString()}`);
        marketState.bars = Array.isArray(response.records) ? response.records : [];
        updateMarketStateFromPayload(response);
        renderMarketSummary();
        renderMarketBars();
        if (!silent) {
            setMarketStatus(`已載入 ${marketState.selectedSymbol || '市場'} 的 ${marketState.bars.length} 筆 bars。`, 'success');
        }
    } catch (error) {
        marketState.bars = [];
        renderMarketBars();
        if (!silent) {
            setMarketStatus(`bar 快取讀取失敗：${error.message}`, 'error');
        }
    }
}

async function loadMarketCache(silent = false) {
    setMarketBusy(true);
    if (!silent) {
        setMarketStatus('正在讀取市場 instrument 與 summary...', 'info');
    }

    const params = new URLSearchParams();
    const assetType = document.getElementById('marketAssetTypeFilter').value;
    const query = document.getElementById('marketInstrumentQuery').value.trim();
    if (assetType) {
        params.set('asset_type', assetType);
    }
    if (query) {
        params.set('query', query);
    }
    params.set('limit', '18');

    try {
        const [summary, instrumentsPayload] = await Promise.all([
            requestMarketApi('/api/market/summary'),
            requestMarketApi(`/api/market/instruments?${params.toString()}`),
        ]);

        updateMarketStateFromPayload(summary);
        updateMarketStateFromPayload(instrumentsPayload);
        marketState.instruments = Array.isArray(instrumentsPayload.records) ? instrumentsPayload.records : [];

        const activeRecord = marketState.instruments.find((record) => record.symbol === marketState.selectedSymbol && record.assetType === marketState.selectedAssetType)
            || marketState.instruments[0]
            || null;

        if (activeRecord) {
            marketState.selectedSymbol = activeRecord.symbol;
            marketState.selectedAssetType = activeRecord.assetType;
        } else {
            marketState.selectedSymbol = '';
            marketState.selectedAssetType = '';
            marketState.bars = [];
        }

        renderMarketSummary();
        renderMarketInstrumentList();
        renderMarketBars();

        if (marketState.selectedSymbol) {
            await loadMarketBars(true);
        }

        if (!silent) {
            setMarketStatus(`已載入 ${marketState.instruments.length} 筆 instrument cache。`, 'success');
        }
    } catch (error) {
        marketState.instruments = [];
        marketState.bars = [];
        renderMarketSummary();
        renderMarketInstrumentList();
        renderMarketBars();
        setMarketStatus(`市場快取讀取失敗：${error.message}`, 'error');
    } finally {
        setMarketBusy(false);
    }
}

async function syncMarketCache() {
    setMarketBusy(true);
    setMarketStatus('正在同步 TWSE / TAIFEX / Yahoo 市場資料...', 'info');

    try {
        const syncSecret = window.APP_CONFIG_UTILS?.getSyncSecret?.() || '';
        const response = await requestMarketApi('/api/market/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(syncSecret ? { 'X-Sync-Secret': syncSecret } : {}),
            },
            body: JSON.stringify(marketSyncPayload()),
        });
        updateMarketStateFromPayload(response);
        await loadMarketCache(true);
        const stored = response.stored || {};
        const failureCount = Array.isArray(response.failures) ? response.failures.length : 0;
        setMarketStatus(`同步完成，stock ${stored.stock?.symbols || 0} 檔 · etf ${stored.etf?.symbols || 0} 檔 · futures ${stored.futures?.symbols || 0} 檔 · failures ${failureCount}。`, failureCount ? 'warning' : 'success');
    } catch (error) {
        setMarketStatus(`市場同步失敗：${error.message}`, 'error');
    } finally {
        setMarketBusy(false);
    }
}

function scheduleMarketReload(message = '市場條件已更新，重新查詢快取…') {
    setMarketStatus(message, 'info');
    if (marketReloadTimer) {
        clearTimeout(marketReloadTimer);
    }
    marketReloadTimer = setTimeout(() => {
        marketReloadTimer = null;
        loadMarketCache(true);
    }, 220);
}

function initMarketOps() {
    document.getElementById('marketSyncBtn').addEventListener('click', () => {
        syncMarketCache();
    });

    document.getElementById('marketReloadBtn').addEventListener('click', () => {
        loadMarketCache(false);
    });

    document.getElementById('marketAssetTypeFilter').addEventListener('change', () => {
        scheduleMarketReload('資產類型已變更，重新查詢市場快取…');
    });

    document.getElementById('marketInstrumentQuery').addEventListener('input', () => {
        scheduleMarketReload('搜尋條件已變更，重新查詢市場快取…');
    });

    document.getElementById('marketContractMonthFilter').addEventListener('input', () => {
        if (!marketState.selectedSymbol) {
            renderMarketBars();
            return;
        }
        scheduleMarketReload('合約月條件已變更，重新查詢 bars…');
    });

    loadMarketCache(true);
}

function initialisePage() {
    renderHeroStats();
    // Count-up animation for numeric hero stats
    countUp(document.getElementById('statSharpe'), PAPER_CONTEXT.positiveRate,
        (v) => `${v.toFixed(2)}%`, 900);
    countUp(document.getElementById('statReturn'), PAPER_CONTEXT.universeSize,
        (v) => String(Math.round(v)), 700);
    renderStaticCards();
    try { renderThesisFindings(); } catch (err) { console.warn('renderThesisFindings failed:', err); }
    populateFilters();
    populateStockSelect(uiState.currentStockCode);
    bindEvents();
    initMarketOps();
    renderSelectedStockMeta(getStockByCode(uiState.currentStockCode), null);
    rerunGA();
    // Background: preload real price data, auto-sync if DB empty
    autoSyncAndPreload();
}

function renderThesisFindings() {
    // Fitness ranking from thesis §4.4
    const fitnessData = [
        { stock: '聯電 2303', fitness: 0.7058, type: 'mid' },
        { stock: '聯發科 2454', fitness: 0.6994, type: 'short' },
        { stock: '廣達 2382', fitness: 0.6881, type: 'short' },
        { stock: '台積電 2330', fitness: 0.6665, type: 'long' },
        { stock: '日月光 3711', fitness: 0.6412, type: 'short' },
        { stock: '緯創 3231', fitness: 0.6280, type: 'mid' },
        { stock: '陽明 2609', fitness: 0.6154, type: 'short' },
        { stock: '台達電 2308', fitness: 0.5988, type: 'mid' },
        { stock: '中華電 2412', fitness: 0.5410, type: 'long' },
        { stock: '合庫金 5880', fitness: 0.4892, type: 'long' },
    ];
    const typeColor = { short: '#ffbc72', mid: '#7bf0be', long: '#6ab4ff' };
    createChart('fitnessRankChart', {
        type: 'bar',
        data: {
            labels: fitnessData.map((d) => d.stock),
            datasets: [{
                label: 'Fitness',
                data: fitnessData.map((d) => d.fitness),
                backgroundColor: fitnessData.map((d) => typeColor[d.type]),
                borderRadius: 6,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, max: 0.8, ticks: { color: '#94a59f' }, grid: { color: 'rgba(151,190,181,0.08)' } },
                y: { ticks: { color: '#e9f0ec', font: { size: 12 } }, grid: { display: false } },
            },
        },
    });

    // Industry optimal training periods
    const industries = [
        { name: '半導體', min: 3.8, max: 5.3 },
        { name: '電子製造', min: 3.5, max: 5.5 },
        { name: '金融', min: 4.0, max: 6.0 },
        { name: '石化', min: 5.0, max: 7.0 },
        { name: '電信', min: 5.0, max: 8.0 },
    ];
    createChart('industryPeriodChart', {
        type: 'bar',
        data: {
            labels: industries.map((d) => d.name),
            datasets: [
                {
                    label: '下限 (年)',
                    data: industries.map((d) => d.min),
                    backgroundColor: 'rgba(88,215,255,0.25)',
                    borderColor: '#58d7ff',
                    borderWidth: 1,
                    stack: 'period',
                },
                {
                    label: '上限範圍',
                    data: industries.map((d) => d.max - d.min),
                    backgroundColor: 'rgba(123,240,190,0.45)',
                    borderColor: '#7bf0be',
                    borderWidth: 1,
                    stack: 'period',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a59f', font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const row = industries[ctx.dataIndex];
                            return `${row.name}：${row.min}–${row.max} 年`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { color: '#e9f0ec' }, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, ticks: { color: '#94a59f' }, grid: { color: 'rgba(151,190,181,0.08)' } },
            },
        },
    });

    // Algorithm comparison table (thesis table 4.4)
    const algoRows = [
        ['ARIMA', '中', '低', '小–中型', '高', '低'],
        ['指數平滑法', '低–中', '極低', '小型', '高', '低'],
        ['GARCH', '中（波動）', '中', '小–中型', '中–高', '中'],
        ['SVM', '中–高', '中–高', '中型', '低', '高'],
        ['隨機森林', '高', '高', '中–大型', '中', '高'],
        ['XGBoost', '高', '高', '中–大型', '中', '高'],
        ['RNN / LSTM', '高', '極高', '大型', '極低', '極高'],
        ['CNN', '中–高', '高', '大型', '極低', '高'],
        ['Transformer', '高', '極高', '大型', '極低', '極高'],
        ['集成方法', '極高', '極高', '中–大型', '低', '極高'],
        ['GAPPTS（本研究）', '高', '中–高', '中型', '高', '高'],
    ];
    const table = document.getElementById('algoCompareTable');
    if (table) {
        table.innerHTML = algoRows.map((row, idx) => {
            const highlight = row[0].startsWith('GAPPTS');
            const bg = highlight ? 'background:rgba(123,240,190,0.08)' : '';
            const weight = highlight ? 'font-weight:700;color:var(--green)' : '';
            return `<tr data-algo-idx="${idx}" style="border-bottom:1px solid var(--border);${bg};cursor:pointer;transition:background .15s" onmouseenter="this.style.background='rgba(255,255,255,0.04)'" onmouseleave="this.style.background='${highlight ? 'rgba(123,240,190,0.08)' : ''}'" onclick="showAlgoStrategy(${idx})">
                <td style="padding:10px 12px;${weight}">${row[0]} <span style="font-size:.72rem;color:var(--teal);vertical-align:middle">›</span></td>
                <td style="padding:10px 12px;color:var(--muted)">${row[1]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[2]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[3]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[4]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[5]}</td>
            </tr>`;
        }).join('');
    }
}

const ALGO_STRATEGIES = [
    {
        name: 'ARIMA 時序預測策略',
        color: 'var(--teal)',
        type: '線性時序模型',
        entry: '當 ARIMA(p,d,q) 預測值高於當前價格超過 1σ 時觸發買入訊號',
        exit: '預測值轉為下降或持有達設定天數 d',
        params: [
            { k: 'AR 階數 p', v: '自回歸項數，捕捉趨勢慣性' },
            { k: '差分階數 d', v: '使序列平穩，通常 d=1 或 2' },
            { k: 'MA 階數 q', v: '移動平均修正殘差誤差' },
            { k: '進場門檻 σ', v: '預測偏差超過 1–1.5σ 才進場' },
        ],
        note: '優點：可解釋、計算快速。限制：假設線性平穩，對台股大幅波動或突發事件反應遲滯。',
        fit: '適合電信、公用事業等趨勢穩定個股，不適合高波動半導體股。',
    },
    {
        name: '指數平滑法 (ETS) 策略',
        color: 'var(--blue)',
        type: '加權移動平均',
        entry: '短期 ETS 預測均值上穿長期 ETS 時做多（均線交叉）',
        exit: '短期均值下穿或達停損線',
        params: [
            { k: '平滑係數 α', v: '近期資料權重，α 越大反應越靈敏' },
            { k: '趨勢係數 β', v: 'Holt 方法加入趨勢修正' },
            { k: '季節週期 s', v: 'Holt-Winters 捕捉週期性波動' },
            { k: '短/長周期', v: '典型設定 5/20 日或 10/50 日' },
        ],
        note: '優點：極低計算成本、容易實作。限制：只能捕捉平滑趨勢，無法處理非線性結構。',
        fit: '適合作為基準策略或作為集成方法的子模型輸入。',
    },
    {
        name: 'GARCH 波動率目標策略',
        color: 'var(--orange)',
        type: '波動率預測模型',
        entry: '預測波動率低於歷史 20 百分位時做多，視為低風險進場視窗',
        exit: '波動率急升超過閾值或達目標報酬',
        params: [
            { k: 'GARCH(p,q)', v: '條件異方差，捕捉波動聚集效應' },
            { k: '波動率閾值', v: '低波動率分位數進場條件' },
            { k: '部位槓桿', v: '依當前波動率動態調整倉位大小' },
            { k: '風險預算', v: '每日最大虧損 = 目標波動 × 持有部位' },
        ],
        note: '優點：波動率預測精準、適合風控導向交易。限制：對價格方向預測能力有限。',
        fit: '台股外資大量進出時波動聚集明顯，GARCH 在金融股和電子龍頭股效果較佳。',
    },
    {
        name: 'SVM 分類訊號策略',
        color: 'var(--purple)',
        type: '支持向量機分類',
        entry: 'SVM 分類器輸出「上漲」類別且信心分數 > 0.65 時做多',
        exit: '分類器輸出「下跌」或信心分數反轉',
        params: [
            { k: '核函數', v: 'RBF 或多項式核，依個股特性選擇' },
            { k: '正規化 C', v: '控制分類邊界鬆緊度' },
            { k: '特徵工程', v: 'RSI / MACD / 布林帶 / 成交量比' },
            { k: '信心閾值', v: '決策函數分數轉換為進場門檻' },
        ],
        note: '優點：小樣本下仍有效、可處理非線性。限制：特徵工程耗時、超參敏感度高。',
        fit: '在 48 檔樣本中，中型流動性股票（廣達、技嘉等）適合 SVM 分類框架。',
    },
    {
        name: '隨機森林多因子策略',
        color: 'var(--green)',
        type: '集成決策樹',
        entry: '隨機森林預測漲幅 > 1.5% 且特徵重要度最高的技術指標同向時進場',
        exit: '多數決策樹投票轉為持平或空頭',
        params: [
            { k: '樹的數量', v: '通常 200–500 棵決策樹' },
            { k: '最大深度', v: '限制過擬合，通常 5–12 層' },
            { k: '特徵子集 m', v: '每次分裂隨機選取 √n 個特徵' },
            { k: '訓練窗口', v: '滾動重訓，通常 6–12 個月' },
        ],
        note: '優點：穩定、不易過擬合、特徵重要度可解釋。限制：預測連續值能力不如 LSTM。',
        fit: '台灣中大型股基本面因子（本益比、月營收）+ 技術指標的組合在隨機森林下效果良好。',
    },
    {
        name: 'XGBoost 梯度提升策略',
        color: 'var(--orange)',
        type: '梯度提升樹',
        entry: 'XGBoost 輸出 5 日預測漲幅 > 2% 且特徵值未觸發異常警示時進場',
        exit: '預測值轉負或觸發動態止損',
        params: [
            { k: '學習率 η', v: '通常 0.01–0.1，配合 early stopping' },
            { k: '樹的數量', v: '100–500 棵，依驗證集決定' },
            { k: '子採樣率', v: 'colsample / subsample 防過擬合' },
            { k: '正規化 λ', v: 'L1 / L2 正規化減少特徵冗餘' },
        ],
        note: '優點：精度高、訓練快速、Kaggle 競賽常勝軍。限制：需要大量特徵工程，黑箱程度比隨機森林高。',
        fit: '台股高頻多因子策略的首選，在 48 檔樣本上整體精度最高的傳統 ML 方法。',
    },
    {
        name: 'RNN / LSTM 序列預測策略',
        color: 'var(--blue)',
        type: '循環神經網路',
        entry: 'LSTM 預測未來 t+5 收盤價高於當前 2% 且 Attention 權重集中在近期 K 線時進場',
        exit: '預測序列轉向或持有達上限天數',
        params: [
            { k: '序列長度', v: '輸入視窗 20–60 個交易日' },
            { k: '隱藏單元數', v: '128–256 個 LSTM 單元' },
            { k: 'Dropout', v: '0.2–0.4 防序列過擬合' },
            { k: '批次大小', v: '32–64，搭配 Adam 優化器' },
        ],
        note: '優點：捕捉長期依賴、序列模式建模能力強。限制：需要大量數據，訓練時間長，台股 48 檔樣本量不足。',
        fit: '適合資料量大的指數或 ETF 預測，在個股層面容易過擬合。本研究 GAPPTS 以可解釋規則彌補此不足。',
    },
    {
        name: 'CNN 型態識別策略',
        color: 'var(--purple)',
        type: '卷積神經網路',
        entry: 'CNN 辨識 K 線型態（頭肩底、雙底、旗形突破）分類為「買入訊號」時進場',
        exit: 'CNN 輸出型態反轉訊號或達目標漲幅',
        params: [
            { k: '輸入格式', v: '將 K 線 OHLCV 編碼為 2D 影像或 1D 序列' },
            { k: '濾波器數量', v: '32–128 個卷積核捕捉不同型態' },
            { k: '池化方式', v: 'MaxPooling 保留最強型態特徵' },
            { k: '分類頭', v: '輸出漲跌二分類或多類型態標籤' },
        ],
        note: '優點：自動學習圖形型態、不需人工定義型態規則。限制：標籤資料難以取得，解釋性差。',
        fit: '本研究 48 檔樣本量偏小，CNN 訓練效果受限；適合資料量大且成交量充足的主流股。',
    },
    {
        name: 'Transformer 注意力策略',
        color: 'var(--teal)',
        type: '自注意力機制',
        entry: 'Transformer Encoder 輸出的全域注意力加權預測值超過進場門檻時做多',
        exit: '注意力分布轉移至負向特徵或達停損線',
        params: [
            { k: '注意力頭數', v: '4–8 個 Multi-head Attention' },
            { k: 'Positional Encoding', v: '編碼時間位置資訊' },
            { k: '序列長度', v: '60–120 個交易日輸入視窗' },
            { k: '預訓練', v: '可用更大市場資料做遷移學習' },
        ],
        note: '優點：全域依賴建模、注意力可視化提供部分解釋性。限制：計算量大、台股小樣本容易過擬合。',
        fit: '更適合多市場、多股票聯合預訓練場景。本研究 48 檔個股使用 GAPPTS 反而更具優勢。',
    },
    {
        name: '集成方法多模型投票策略',
        color: 'var(--green)',
        type: '多模型集成',
        entry: '超過半數子模型（ARIMA + RF + LSTM + XGBoost）同時輸出買入訊號時進場',
        exit: '多數模型投票轉為中性或任一模型觸發強烈空頭警示',
        params: [
            { k: '子模型組合', v: '時序 + 傳統ML + 深度學習 三類混合' },
            { k: '投票權重', v: '依歷史績效動態調整各模型權重' },
            { k: '異議處理', v: '分歧超過 40% 時降低倉位或跳過訊號' },
            { k: '再訓練週期', v: '每季依最新績效重新標定權重' },
        ],
        note: '優點：整體精度最高、降低單一模型失效風險。限制：系統複雜、維護成本高，實際交易中部署困難。',
        fit: '機構級量化系統的標準做法，適合有完整基礎設施支撐的操作環境。',
    },
    {
        name: 'GAPPTS 遺傳演算法區間策略（本研究）',
        color: 'var(--green)',
        type: '遺傳演算法 × 價格區間',
        entry: '當買入價落在 PPTS 高 α 機率區間且平均利潤為正時觸發，不依賴預測模型',
        exit: '持有 hold_days 天後自動出場，或達到 target_profit 提前離場',
        params: [
            { k: '區間數 m', v: '將個股歷史價格切成 m 個等距區間（GA 優化）' },
            { k: '持有天數 hold', v: '買入後固定持有期間（GA 優化，典型 18–29 天）' },
            { k: '目標利潤 target', v: '區間達標門檻（GA 優化，低水位高頻交易）' },
            { k: 'α 進場係數', v: '機率門檻 0.4–0.8，過濾低品質區間' },
        ],
        note: '優點：全域搜尋避免局部最優、可解釋交易規則、不需大量訓練資料。限制：每個個股需獨立優化。',
        fit: '本研究實證：在台灣 48 檔 ETF50 樣本股上，GAPPTS 顯著優於固定參數 PPTS 與 Buy & Hold 基準。',
    },
];

function showAlgoStrategy(idx) {
    const s = ALGO_STRATEGIES[idx];
    const panel = document.getElementById('algoStrategyPanel');
    const content = document.getElementById('algoStrategyContent');
    if (!panel || !content || !s) return;

    const paramsHtml = s.params.map(p =>
        `<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <div style="min-width:130px;font-size:.78rem;color:${s.color};font-weight:600">${p.k}</div>
            <div style="font-size:.78rem;color:var(--muted);line-height:1.6">${p.v}</div>
        </div>`
    ).join('');

    content.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:20px">
            <div style="flex:1;min-width:280px">
                <div style="font-size:1.05rem;font-weight:700;color:${s.color};margin-bottom:4px">${s.name}</div>
                <div style="font-size:.75rem;letter-spacing:.06em;color:var(--dim);margin-bottom:14px;text-transform:uppercase">${s.type}</div>
                <div style="margin-bottom:10px">
                    <div style="font-size:.75rem;color:var(--muted);margin-bottom:3px">進場條件</div>
                    <div style="font-size:.82rem;line-height:1.7;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid ${s.color}">${s.entry}</div>
                </div>
                <div style="margin-bottom:10px">
                    <div style="font-size:.75rem;color:var(--muted);margin-bottom:3px">出場條件</div>
                    <div style="font-size:.82rem;line-height:1.7;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid rgba(255,255,255,0.15)">${s.exit}</div>
                </div>
                <div style="font-size:.78rem;line-height:1.7;color:var(--dim);padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:8px">${s.note}</div>
                <div style="font-size:.78rem;line-height:1.7;color:${s.color};opacity:.85">${s.fit}</div>
            </div>
            <div style="min-width:240px;max-width:320px">
                <div style="font-size:.75rem;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">關鍵參數</div>
                ${paramsHtml}
            </div>
        </div>`;

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    document.querySelectorAll('#algoCompareTable tr').forEach((tr, i) => {
        tr.style.outline = i === idx ? `2px solid ${s.color}` : '';
    });
}

function closeAlgoStrategy() {
    const panel = document.getElementById('algoStrategyPanel');
    if (panel) panel.style.display = 'none';
    document.querySelectorAll('#algoCompareTable tr').forEach(tr => { tr.style.outline = ''; });
}

async function autoSyncAndPreload() {
    const status = document.getElementById('cfgStatus');
    const testStock = THESIS_STOCK_CODES[0]; // 1101

    // 1. Check if DB already has data
    const data = await fetchRealPriceSeries(testStock);
    if (data && data.closes.length >= 50) {
        if (status) status.textContent = '✓ 已從資料庫載入真實股價';
        preloadAllStockData();
        return;
    }

    // 2. Try authenticated DB sync (admin or CI)
    const syncSecret = window.APP_CONFIG_UTILS?.getSyncSecret?.() || '';
    if (syncSecret) {
        if (status) status.textContent = '正在同步 TWSE 股價至資料庫…';
        try {
            const apiBase = await resolveMarketApiBase();
            if (apiBase) {
                const resp = await fetch(`${apiBase}/api/market/sync`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sync-Secret': syncSecret,
                    },
                    body: JSON.stringify({
                        stock_symbols: THESIS_STOCK_CODES,
                        etf_symbols: [],
                        futures_symbols: [],
                        twse_months: 6,
                        yahoo_range: '2y',
                    }),
                    signal: AbortSignal.timeout(90000),
                });
                if (resp.ok) {
                    REAL_PRICE_CACHE.clear();
                    if (status) status.textContent = '✓ TWSE 同步完成，重新計算中…';
                    rerunGA();
                    preloadAllStockData();
                    return;
                }
            }
        } catch { /* fall through to Yahoo */ }
    }

    // 3. Fallback: public Yahoo proxy (no auth needed)
    if (status) status.textContent = '正在從 Yahoo Finance 載入真實股價…';
    await batchFetchYahoo(THESIS_STOCK_CODES);
    const loaded = THESIS_STOCK_CODES.filter((c) => REAL_PRICE_CACHE.has(c)).length;
    if (loaded > 0) {
        if (status) status.textContent = `✓ 已載入 ${loaded}/48 檔真實股價（Yahoo），重新計算中…`;
        rerunGA();
    } else {
        if (status) status.textContent = '⚠ 無法取得真實股價，使用模擬數據。請稍後重試。';
    }
}

window.gotoGen = gotoGen;
window.togglePlay = togglePlay;
window.rerunGA = rerunGA;
window.resetGaCfg = resetGaCfg;
window.lastGenIndex = lastGenIndex;
window.curGen = curGen;
window.syncThesisStocks = syncThesisStocks;
window.showAlgoStrategy = showAlgoStrategy;
window.closeAlgoStrategy = closeAlgoStrategy;

window.getThesisPyodideContext = function () {
    const code = uiState.currentStockCode;
    const cached = SERIES_CACHE.get(code);
    const stock = getStockByCode(code);
    let prices = [];
    if (cached && cached.train && cached.test) {
        prices = [...cached.train, ...cached.test];
    } else if (stock && stock.synth) {
        prices = [...stock.synth.train, ...stock.synth.test];
    }
    const num = (id, def) => {
        const el = document.getElementById(id);
        const v = el ? Number(el.value) : NaN;
        return Number.isFinite(v) ? v : def;
    };
    return {
        stock_code: code,
        stock_name: stock ? stock.name : '',
        prices,
        pop: num('cfgPop', 50),
        gens: num('cfgGens', 50),
        cr: num('cfgCR', 0.8),
        mr: num('cfgMR', 0.1),
        m: num('strat-m', 8),
        hold_days: num('strat-hold', 5),
        target_profit: num('strat-target', 3.0),
    };
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePage);
} else {
    initialisePage();
}

/* ═══════════════════════════════════════════════════════════════════════
   AI 輔助估值計算器 — PE × PB 情境矩陣
   ═══════════════════════════════════════════════════════════════════════ */

let _valCurrentPrice = null;

async function valFetchPrice() {
    const code = (document.getElementById('valCode')?.value || '').trim().replace('.TW', '');
    if (!code) return;
    const hint = document.getElementById('valPriceHint');
    const btn = document.getElementById('valFetchBtn');
    if (hint) hint.textContent = '載入中…';
    if (btn) btn.disabled = true;
    try {
        // Try existing real-price infrastructure first
        let price = null;
        const cached = REAL_PRICE_CACHE.get(code);
        if (cached && cached.closes?.length) {
            price = cached.closes[cached.closes.length - 1];
        } else {
            const apiBase = await resolveMarketApiBase();
            if (apiBase) {
                const res = await fetch(`${apiBase}/api/market/yahoo-prices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols: [code + '.TW'], range: '5d' }),
                    signal: AbortSignal.timeout(10000),
                }).catch(() => null);
                if (res?.ok) {
                    const data = await res.json();
                    const sym = data?.data?.[code + '.TW'] || data?.data?.[code];
                    if (sym?.closes?.length) price = sym.closes[sym.closes.length - 1];
                }
            }
            // Fallback: TWSE Open API (CORS-friendly)
            if (!price) {
                const today = new Date();
                const yyyymm = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}01`;
                const r = await fetch(
                    `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}&stockNo=${code}`,
                    { signal: AbortSignal.timeout(8000) }
                ).catch(() => null);
                if (r?.ok) {
                    const rows = await r.json().catch(() => []);
                    if (Array.isArray(rows) && rows.length) {
                        const last = rows[rows.length - 1];
                        price = parseFloat((last.closingPrice || '').replace(/,/g, ''));
                    }
                }
            }
        }
        _valCurrentPrice = Number.isFinite(price) ? price : null;
        if (hint) hint.textContent = _valCurrentPrice ? `現價：$${_valCurrentPrice.toFixed(1)}` : '無法取得現價（可手動比對）';
    } catch {
        if (hint) hint.textContent = '無法取得現價';
    } finally {
        if (btn) btn.disabled = false;
    }
}

function _buildMatrix(rowVals, colVals, rowLabel, colLabel) {
    const rows = rowVals.map((rv, ri) =>
        colVals.map((cv, ci) => ({ val: rv * cv, isBase: ri === 1 && ci === 1 }))
    );
    let html = `<table class="val-matrix-table"><thead><tr><th>${rowLabel} \\ ${colLabel}</th>`;
    colVals.forEach((cv, ci) => {
        const cls = ci === 0 ? 'vm-bear' : ci === 2 ? 'vm-bull' : 'vm-base';
        html += `<th class="${cls}">${cv}×</th>`;
    });
    html += '</tr></thead><tbody>';
    rows.forEach((row, ri) => {
        const rCls = ri === 0 ? 'vm-bear' : ri === 2 ? 'vm-bull' : 'vm-base';
        html += `<tr><td class="vm-row-hd ${rCls}">$${rowVals[ri]}</td>`;
        row.forEach(cell => {
            html += `<td class="${cell.isBase ? 'vm-star' : ''}">$${cell.val.toFixed(0)}${cell.isBase ? ' ⭐' : ''}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    return { html, baseVal: rows[1][1].val, allVals: rows.flat().map(c => c.val) };
}

function calcValuation() {
    const n = id => parseFloat(document.getElementById(id)?.value) || 0;
    const epsBear = n('valEpsBear'), epsBase = n('valEpsBase'), epsBull = n('valEpsBull');
    const peBear = n('valPeBear'), peBase = n('valPeBase'), peBull = n('valPeBull');
    const bps = n('valBps');
    const pbBear = n('valPbBear'), pbBase = n('valPbBase'), pbBull = n('valPbBull');

    if (!epsBase || !peBase || !bps || !pbBase) return;

    const peResult = _buildMatrix([epsBear, epsBase, epsBull], [peBear, peBase, peBull], 'EPS', 'PE');
    const pbResult = _buildMatrix([bps], [pbBear, pbBase, pbBull], 'BPS', 'PB');

    const peCard = document.getElementById('valPeCard');
    const pbCard = document.getElementById('valPbCard');
    const sumCard = document.getElementById('valSummaryCard');
    if (peCard) { peCard.style.display = ''; document.getElementById('valPeTable').innerHTML = peResult.html; }

    // PB table — single BPS row
    const pbHtml = `<table class="val-matrix-table"><thead><tr>
        <th>BPS \\ PB</th>
        <th class="vm-bear">${pbBear}×</th><th class="vm-base">${pbBase}×</th><th class="vm-bull">${pbBull}×</th>
    </tr></thead><tbody><tr>
        <td class="vm-row-hd">$${bps}</td>
        <td class="vm-bear">$${(bps * pbBear).toFixed(0)}</td>
        <td class="vm-star">$${(bps * pbBase).toFixed(0)} ⭐</td>
        <td class="vm-bull">$${(bps * pbBull).toFixed(0)}</td>
    </tr></tbody></table>`;
    if (pbCard) { pbCard.style.display = ''; document.getElementById('valPbTable').innerHTML = pbHtml; }

    // Overlap analysis
    const peBase_ = epsBase * peBase;
    const pbBase_ = bps * pbBase;
    const lo = Math.min(peBase_, pbBase_) * 0.97;
    const hi = Math.max(peBase_, pbBase_) * 1.03;
    const midpoint = (peBase_ + pbBase_) / 2;
    let priceComment = '';
    if (_valCurrentPrice) {
        const pct = ((_valCurrentPrice - midpoint) / midpoint * 100).toFixed(1);
        const dir = _valCurrentPrice > midpoint ? '高估' : '低估';
        priceComment = `<div class="val-price-vs">
            <div class="val-price-chip" style="background:rgba(255,255,255,.05);border:1px solid var(--border)">現價 $${_valCurrentPrice.toFixed(1)}</div>
            <div class="val-price-chip" style="background:rgba(123,240,190,.07);border:1px solid rgba(123,240,190,.2);color:var(--green)">重疊中點 $${midpoint.toFixed(0)}</div>
            <div class="val-price-chip" style="background:rgba(255,188,114,.07);border:1px solid rgba(255,188,114,.2);color:var(--orange)">${dir} ${Math.abs(pct)}%</div>
        </div>`;
    }
    const sumHtml = `
        <div class="val-summary-row"><span class="val-summary-label">PE 基本情境</span><span class="val-summary-value">$${peBase_.toFixed(0)}</span></div>
        <div class="val-summary-row"><span class="val-summary-label">PB 基本情境</span><span class="val-summary-value">$${pbBase_.toFixed(0)}</span></div>
        <div class="val-overlap-band">
            <div class="band-label">兩法重疊合理估值區間</div>
            <div class="band-range">$${lo.toFixed(0)} – $${hi.toFixed(0)}</div>
        </div>
        ${priceComment}
        <div style="margin-top:12px;font-size:.76rem;color:var(--dim);line-height:1.6">
            ⚠ 本計算器僅供學術研究參考，不構成任何買賣建議。所有假設由使用者自行負責，數字須回原始財報驗證。
        </div>`;
    if (sumCard) { sumCard.style.display = ''; document.getElementById('valSummary').innerHTML = sumHtml; }
}

window.valFetchPrice = valFetchPrice;
window.calcValuation = calcValuation;

/* ═══════════════════════════════════════════════════════════════════════
   技術分析看板 — MA / RSI / 支撐壓力
   ═══════════════════════════════════════════════════════════════════════ */

const TA_CHARTS = {};

function _calcMA(closes, n) {
    return closes.map((_, i) =>
        i < n - 1 ? null : closes.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n
    );
}

function _calcRSI(closes, n = 14) {
    const rsi = Array(closes.length).fill(null);
    if (closes.length <= n) return rsi;
    let gains = 0, losses = 0;
    for (let i = 1; i <= n; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) gains += d; else losses -= d;
    }
    let avgG = gains / n, avgL = losses / n;
    rsi[n] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    for (let i = n + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        avgG = (avgG * (n - 1) + Math.max(d, 0)) / n;
        avgL = (avgL * (n - 1) + Math.max(-d, 0)) / n;
        rsi[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
    }
    return rsi;
}

function _supportResistance(closes, highLow) {
    const window = 10;
    const levels = [];
    for (let i = window; i < closes.length - window; i++) {
        const slice = closes.slice(i - window, i + window + 1);
        const isHigh = closes[i] === Math.max(...slice);
        const isLow = closes[i] === Math.min(...slice);
        if (isHigh || isLow) levels.push({ price: closes[i], type: isHigh ? 'resistance' : 'support' });
    }
    // deduplicate within 2% band
    const deduped = [];
    levels.forEach(l => {
        const dup = deduped.find(d => Math.abs(d.price - l.price) / l.price < 0.02 && d.type === l.type);
        if (!dup) deduped.push(l);
    });
    return deduped.slice(-6);
}

async function loadTechAnalysis() {
    const sel = document.getElementById('taStockSelect');
    const custom = (document.getElementById('taCustomCode')?.value || '').trim();
    const code = custom || sel?.value || '2330';
    const statusEl = document.getElementById('taStatus');
    const resultArea = document.getElementById('taResultArea');

    if (statusEl) statusEl.textContent = '載入中…';
    if (resultArea) resultArea.style.display = 'none';

    let closes = [], dates = [];

    // Try real data from cache or API
    const cached = REAL_PRICE_CACHE.get(code);
    if (cached && cached.closes?.length >= 30) {
        closes = cached.closes;
        dates = cached.dates || [];
    } else {
        try {
            const apiBase = await resolveMarketApiBase();
            if (apiBase) {
                const res = await fetch(`${apiBase}/api/market/yahoo-prices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols: [code + '.TW'], range: '1y' }),
                    signal: AbortSignal.timeout(12000),
                }).catch(() => null);
                if (res?.ok) {
                    const data = await res.json();
                    const sym = data?.data?.[code + '.TW'] || data?.data?.[code];
                    if (sym?.closes?.length >= 30) {
                        closes = sym.closes;
                        dates = sym.dates || [];
                        REAL_PRICE_CACHE.set(code, { closes, dates });
                    }
                }
            }
        } catch { /* fall through to synthetic */ }

        // Fallback: TWSE Open API (last 2 months)
        if (closes.length < 30) {
            try {
                const months = [new Date(), new Date(Date.now() - 32 * 86400000)];
                for (const m of months) {
                    const yyyymm = `${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}01`;
                    const r = await fetch(
                        `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}&stockNo=${code}`,
                        { signal: AbortSignal.timeout(8000) }
                    ).catch(() => null);
                    if (r?.ok) {
                        const rows = await r.json().catch(() => []);
                        rows.forEach(row => {
                            const p = parseFloat((row.closingPrice || '').replace(/,/g, ''));
                            if (Number.isFinite(p)) { closes.push(p); dates.push(row.Date || ''); }
                        });
                    }
                }
            } catch { /* ignore */ }
        }

        // Fallback: synthetic from SERIES_CACHE
        if (closes.length < 30) {
            const stock = getStockByCode(code);
            if (stock) {
                const synth = getStockSeries(stock);
                closes = [...(synth.train || []), ...(synth.test || [])];
                dates = closes.map((_, i) => `D${i + 1}`);
                if (statusEl) statusEl.textContent = '⚠ 使用模擬數據（無法取得真實股價）';
            } else {
                if (statusEl) statusEl.textContent = '❌ 找不到此代號，請確認後重試';
                return;
            }
        }
    }

    // Use last 120 data points
    const N = Math.min(closes.length, 120);
    const c = closes.slice(-N);
    const d = dates.slice(-N);

    const ma5 = _calcMA(c, 5);
    const ma20 = _calcMA(c, 20);
    const ma60 = _calcMA(c, 60);
    const rsi = _calcRSI(c, 14);
    const srLevels = _supportResistance(c, c);

    const lastClose = c[c.length - 1];
    const lastMa5 = ma5[ma5.length - 1];
    const lastMa20 = ma20[ma20.length - 1];
    const lastMa60 = ma60[ma60.length - 1];
    const lastRsi = rsi[rsi.length - 1];

    // Generate signals
    const signals = [];
    if (lastMa5 && lastMa20 && lastMa60 && lastMa5 > lastMa20 && lastMa20 > lastMa60) {
        signals.push({ text: '多頭排列 5>20>60', cls: 'ta-signal-bull' });
    } else if (lastMa5 && lastMa20 && lastMa5 < lastMa20) {
        signals.push({ text: '空頭排列', cls: 'ta-signal-bear' });
    }
    if (lastMa5 && lastMa20) {
        const prev5 = ma5[ma5.length - 2], prev20 = ma20[ma20.length - 2];
        if (prev5 && prev20 && prev5 < prev20 && lastMa5 >= lastMa20) {
            signals.push({ text: '黃金交叉 ✓', cls: 'ta-signal-bull' });
        } else if (prev5 && prev20 && prev5 > prev20 && lastMa5 <= lastMa20) {
            signals.push({ text: '死亡交叉 ✗', cls: 'ta-signal-bear' });
        }
    }
    if (lastMa20 && Math.abs((lastClose - lastMa20) / lastMa20) > 0.05) {
        const dir = lastClose > lastMa20 ? '偏離 20MA 過熱' : '偏離 20MA 過冷';
        signals.push({ text: dir, cls: 'ta-signal-neutral' });
    }
    if (lastRsi) {
        if (lastRsi > 70) signals.push({ text: `RSI ${lastRsi.toFixed(0)} 超買`, cls: 'ta-signal-bear' });
        else if (lastRsi < 30) signals.push({ text: `RSI ${lastRsi.toFixed(0)} 超賣`, cls: 'ta-signal-bull' });
        else signals.push({ text: `RSI ${lastRsi.toFixed(0)} 中性`, cls: 'ta-signal-neutral' });
    }

    if (resultArea) resultArea.style.display = '';
    if (statusEl) statusEl.textContent = `✓ 已載入 ${c.length} 筆數據`;

    // Signal strip
    document.getElementById('taSignals').innerHTML = signals
        .map(s => `<span class="ta-signal ${s.cls}">${s.text}</span>`).join('');

    document.getElementById('taPriceLabel').textContent =
        `${code} · 最新 $${lastClose?.toFixed(1) || '—'} · ${N} 日`;

    // Price + MA chart
    const priceCtx = document.getElementById('taChart')?.getContext('2d');
    if (priceCtx) {
        if (TA_CHARTS.price) TA_CHARTS.price.destroy();
        TA_CHARTS.price = new Chart(priceCtx, {
            type: 'line',
            data: {
                labels: d,
                datasets: [
                    { label: '收盤價', data: c, borderColor: C.text, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
                    { label: 'MA5', data: ma5, borderColor: C.yellow, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false, borderDash: [] },
                    { label: 'MA20', data: ma20, borderColor: C.teal, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
                    { label: 'MA60', data: ma60, borderColor: C.purple, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
                ],
            },
            options: {
                ...BASE_OPTS,
                scales: {
                    x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxTicksLimit: 8 } },
                    y: { ...BASE_OPTS.scales.y, ticks: { ...BASE_OPTS.scales.y.ticks, callback: v => `$${v.toFixed(0)}` } },
                },
            },
        });
    }

    // RSI chart
    const rsiCtx = document.getElementById('taRsiChart')?.getContext('2d');
    if (rsiCtx) {
        if (TA_CHARTS.rsi) TA_CHARTS.rsi.destroy();
        TA_CHARTS.rsi = new Chart(rsiCtx, {
            type: 'line',
            data: {
                labels: d,
                datasets: [
                    { label: 'RSI(14)', data: rsi, borderColor: C.orange, borderWidth: 1.5, pointRadius: 0, tension: 0.2, fill: false },
                ],
            },
            options: {
                ...BASE_OPTS,
                scales: {
                    x: { ...BASE_OPTS.scales.x, ticks: { ...BASE_OPTS.scales.x.ticks, maxTicksLimit: 8 } },
                    y: { ...BASE_OPTS.scales.y, min: 0, max: 100,
                        ticks: { ...BASE_OPTS.scales.y.ticks, stepSize: 20 } },
                },
                plugins: {
                    ...BASE_OPTS.plugins,
                    annotation: undefined,
                },
            },
        });
    }

    // MA table
    const maRows = [
        { label: 'MA5', val: lastMa5, color: C.yellow },
        { label: 'MA20', val: lastMa20, color: C.teal },
        { label: 'MA60', val: lastMa60, color: C.purple },
    ];
    document.getElementById('taMaTable').innerHTML = maRows.map(r => {
        const diff = r.val ? ((lastClose - r.val) / r.val * 100) : null;
        const sign = diff > 0 ? '+' : '';
        const col = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--muted)';
        return `<div class="kv-row"><span class="kv-key" style="color:${r.color}">${r.label}</span>
            <span class="kv-val">$${r.val?.toFixed(1) || '—'} <small style="color:${col}">${diff != null ? sign + diff.toFixed(1) + '%' : ''}</small></span></div>`;
    }).join('');

    // Support/Resistance table
    const highPt = Math.max(...c);
    const lowPt = Math.min(...c);
    const supports = srLevels.filter(s => s.type === 'support').sort((a, b) => b.price - a.price).slice(0, 2);
    const resistances = srLevels.filter(s => s.type === 'resistance').sort((a, b) => a.price - b.price).slice(0, 2);
    const srHtml = [
        { label: '強壓力（近期高點）', price: highPt, color: 'var(--red)', icon: '🔴' },
        ...resistances.map(r => ({ label: '次壓力', price: r.price, color: 'var(--orange)', icon: '🟠' })),
        { label: '現價', price: lastClose, color: 'var(--text)', icon: '⚪' },
        ...supports.map(s => ({ label: '強支撐', price: s.price, color: 'var(--green)', icon: '🟢' })),
        { label: '關鍵支撐（近期低點）', price: lowPt, color: 'var(--blue)', icon: '🔵' },
    ].sort((a, b) => b.price - a.price).map(l =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.8rem">
            <span>${l.icon} <span style="color:var(--muted)">${l.label}</span></span>
            <span style="color:${l.color};font-family:var(--mono);font-weight:600">$${l.price.toFixed(1)}</span>
        </div>`
    ).join('');
    document.getElementById('taSRTable').innerHTML = srHtml;

    // Signal detail
    const isGolden = signals.some(s => s.text.includes('黃金交叉'));
    const isDeath = signals.some(s => s.text.includes('死亡交叉'));
    const isBull = signals.some(s => s.text.includes('多頭排列'));
    const signalDetail = `
        ${isBull ? '<span style="color:var(--green)">✅ 多頭排列</span>：5>20>60均線，趨勢強健<br>' : ''}
        ${isGolden ? '<span style="color:var(--green)">📈 黃金交叉</span>：MA5 上穿 MA20，短線買進訊號<br>' : ''}
        ${isDeath ? '<span style="color:var(--red)">📉 死亡交叉</span>：MA5 下穿 MA20，短線賣出訊號<br>' : ''}
        ${lastRsi > 70 ? `<span style="color:var(--red)">⚠ RSI ${lastRsi.toFixed(0)}</span>：超買區，動能可能減弱<br>` : ''}
        ${lastRsi < 30 ? `<span style="color:var(--green)">💡 RSI ${lastRsi.toFixed(0)}</span>：超賣區，可能出現反彈<br>` : ''}
        <br><span style="color:var(--dim);font-size:.75rem">⚠ 技術分析僅供學術參考，不構成投資建議。若…則可能…，最終判斷須由投資人自行負責。</span>
    `;
    document.getElementById('taSignalDetail').innerHTML = signalDetail;
}

function initTaStockSelect() {
    const sel = document.getElementById('taStockSelect');
    if (!sel) return;
    const defaultStocks = [
        ['2330', '台積電'], ['2317', '鴻海'], ['2454', '聯發科'],
        ['2303', '聯電'], ['2382', '廣達'], ['2412', '中華電'],
        ['0050', '元大台50'],
    ];
    sel.innerHTML = defaultStocks.map(([c, n]) => `<option value="${c}">${c} ${n}</option>`).join('');
}

window.loadTechAnalysis = loadTechAnalysis;

/* ═══════════════════════════════════════════════════════════════════════
   AI Prompt 模板庫
   ═══════════════════════════════════════════════════════════════════════ */

const PROMPT_TEMPLATES = [
    {
        id: 'etf',
        label: 'ETF 持股分析',
        desc: '分析 ETF 持股結構：產業分布、AI 概念股佔比、集中度、風格判斷。',
        body: `角色：你是專業的台股 ETF 分析師
任務：分析以下 ETF 的持股結構

資料：
[基金名稱]：
[資料日期]：
[持股清單]：（貼上持股明細）

請產出：
1. 產業分布（各產業佔比，表格呈現）
2. AI 概念股佔比
3. 集中度（前 5、前 10 持股佔比）
4. 風格判斷（成長 / 價值 / 股息）
5. 一句話總結

格式：表格 + 條列
限制：只用提供的數據，不給買賣建議，標明資料日期`,
    },
    {
        id: 'report',
        label: '財報快速摘要',
        desc: '快速萃取財報核心數字：營收、毛利率、EPS、管理層展望、超出/低於預期項目。',
        body: `角色：你是賣方分析師
任務：摘要本季財報

資料：[貼入財報文字或 PDF 擷取內容]

【Section 1：本季表現】
- 營收 (YoY / QoQ)：
- 毛利率：
- 營業利益率：
- EPS：

【Section 2：管理層展望】
- 下季營收區間（公司原話）：
- 全年資本支出：
- 毛利率指引：

【Section 3：法說問答重點】
- 被追問最多的議題：
- 經理人語氣：
- 沒有正面回答的問題：

【Section 4：超出 / 低於預期的點】

限制：guidance 用公司原文、不做股價預測、不給投資建議、標明數據來源與時效`,
    },
    {
        id: 'valuation',
        label: '估值情境矩陣',
        desc: 'PE × PB 雙重驗證，產出 3×3 情境矩陣與重疊區間分析。',
        body: `角色：你是賣方股票分析師
任務：產出目標價情境分析

資料：
- 公司名稱 / 代號：
- 預估 EPS：悲觀 $__ / 基本 $__ / 樂觀 $__
- 同業 / 歷史 PE 區間：__x / __x / __x
- 預估 BPS：$__
- 同業 / 歷史 PB 區間：__x / __x / __x

請產出：
【表 1】PE 法 3×3 矩陣（EPS × PE 情境）
【表 2】PB 法 3×3 矩陣（BPS × PB 情境）
【表 3】兩法重疊分析（說明重疊區間及可信度）
【現價對比】現價相對重疊中點的溢折價
【敏感度分析】哪個假設對估值影響最大

合規限制：
- 不寫「建議買進 / 賣出」
- 用「合理估值區間」而非「目標價」
- 標明所有假設依據及資料時效`,
    },
    {
        id: 'technical',
        label: '技術分析',
        desc: '根據 OHLC 數據判斷 K 線型態、支撐壓力位、均線多空訊號。',
        body: `角色：你是技術分析師
任務：判斷型態與支撐壓力

資料：
- 近期高點 / 低點：$__ / $__
- 當前股價：$__
- 5 日均線：$__
- 20 日均線：$__
- 60 日均線：$__
- RSI(14)：__
- 近期整理區間：$__~$__
- [可附上 OHLC 日 K 數據]

請產出：
【型態判斷】（W底 / M頭 / 三角收斂 / 旗形 等，若無明顯型態請說明）
【關鍵價位】
- 主要壓力：$__ （依據：）
- 強支撐：$__ （依據：）
【均線狀態】多頭 / 空頭排列，最近交叉訊號
【RSI 解讀】
【風險警示】

限制：只描述型態，用「若...則可能...」條件句，不下買賣結論`,
    },
    {
        id: 'theme',
        label: '議題受惠族群',
        desc: '從新聞事件快速找出受惠 / 受害的台股產業鏈與個股。',
        body: `角色：你是產業研究員
任務：從議題找受惠 / 受害族群

資料：
議題：[例：美國對中晶片禁令升級]
背景：[貼入相關新聞 1~3 則]

請產出：
【議題本質】（一句話說明供需影響邏輯）

【受惠族群】（按程度由高到低排列）
| 類型 | 代表公司 | 受益邏輯 |
|------|---------|---------|
| 直接受益 | | |
| 間接受益 | | |

【受害族群】
| 類型 | 代表公司 | 受損邏輯 |

【時序分析】
- 短期（1~3 個月）：
- 中期（3~12 個月）：
- 長期（>1 年）：

格式：表格化
限制：個股只列代表性案例，標明對中營收曝險需個別驗證`,
    },
    {
        id: 'earnings',
        label: '法說會 Takeaway',
        desc: '從法說會逐字稿萃取 5 大 Takeaway、關鍵字頻率、避而不談議題。',
        body: `角色：你是法人圈買方分析師
任務：找出 5 個最關鍵 Takeaway

資料：[貼入法說會逐字稿或摘要]

【Top 5 Takeaway】（按重要性排序）
1.
2.
3.
4.
5.

【經理人關鍵字頻率】
- 出現最多次的正面詞彙：
- 出現最多次的不確定詞彙：

【避而不談的議題】（被問但未正面回答的問題）

【相比上次法說的差異】
- 升溫（語氣更積極）：
- 降溫（語氣保守化）：
- 新增說法：

限制：直接引述必須一字不差，推斷部分須標明「推斷」`,
    },
    {
        id: 'compliance',
        label: '合規檢查',
        desc: '逐條核查報告是否符合金管會規範，產出紅旗清單與修改建議。',
        body: `角色：你是金融合規法遵主管
任務：檢查報告是否違反金管會規範

待檢查文本：[貼入報告 / 分析文字]

請逐條檢查以下紅線：
1. 明確薦股（「建議買進」「目標價 XX 元」「強力推薦」）
2. 保證報酬（「保證」「穩賺」「絕對」「一定」）
3. 誇大渲染（「飆漲」「噴出」「主力鎖籌」「必漲」）
4. 缺乏風險揭露
5. 資料來源不明確
6. 未標示 AI 輔助（若有使用 AI）
7. 資料時效性未標明
8. 利益衝突未揭露

請產出：
【紅旗清單】（條列違規段落 + 違規類型）
【修改建議】（逐條對應）
【修改後版本】（完整修改稿）
【合規評分】（滿分 100，僅供參考）`,
    },
];

let _activePromptId = PROMPT_TEMPLATES[0].id;

function renderPromptLib() {
    const tabsEl = document.getElementById('promptTabs');
    const bodyEl = document.getElementById('promptBody');
    if (!tabsEl || !bodyEl) return;

    tabsEl.innerHTML = PROMPT_TEMPLATES.map(t =>
        `<button class="prompt-tab ${t.id === _activePromptId ? 'active' : ''}"
            onclick="switchPrompt('${t.id}')">${t.label}</button>`
    ).join('');

    const tmpl = PROMPT_TEMPLATES.find(t => t.id === _activePromptId) || PROMPT_TEMPLATES[0];
    bodyEl.innerHTML = `
        <div class="prompt-meta">
            <div class="prompt-title">${tmpl.label}</div>
            <button class="btn-copy" id="promptCopyBtn" onclick="copyPrompt()">
                <span>複製</span>
            </button>
        </div>
        <div class="prompt-desc">${tmpl.desc}</div>
        <div class="prompt-code" id="promptCode">${escHtml(tmpl.body)}</div>
    `;
}

function switchPrompt(id) {
    _activePromptId = id;
    renderPromptLib();
}

async function copyPrompt() {
    const tmpl = PROMPT_TEMPLATES.find(t => t.id === _activePromptId);
    if (!tmpl) return;
    const btn = document.getElementById('promptCopyBtn');
    try {
        await navigator.clipboard.writeText(tmpl.body);
        if (btn) { btn.innerHTML = '<span>✓ 已複製</span>'; btn.classList.add('copied'); }
        setTimeout(() => {
            if (btn) { btn.innerHTML = '<span>複製</span>'; btn.classList.remove('copied'); }
        }, 2000);
    } catch {
        if (btn) btn.innerHTML = '<span>複製失敗</span>';
    }
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.switchPrompt = switchPrompt;
window.copyPrompt = copyPrompt;

/* ═══════════════════════════════════════════════════════════════════════
   初始化新增模組
   ═══════════════════════════════════════════════════════════════════════ */

function initNewModules() {
    initTaStockSelect();
    renderPromptLib();
    // Wire up valuation inputs for live recalc on Enter
    ['valEpsBear','valEpsBase','valEpsBull','valPeBear','valPeBase','valPeBull',
     'valBps','valPbBear','valPbBase','valPbBull'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') calcValuation(); });
    });
    try { renderDerivativesSection(); } catch (e) { console.warn('renderDerivativesSection:', e); }
}

// Hook into DOMContentLoaded after existing initialisePage
const _origInitialisePage = typeof initialisePage === 'function' ? initialisePage : null;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewModules);
} else {
    initNewModules();
}

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
