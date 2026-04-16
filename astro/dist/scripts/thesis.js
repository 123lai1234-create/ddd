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
        table.innerHTML = algoRows.map((row) => {
            const highlight = row[0].startsWith('GAPPTS');
            const bg = highlight ? 'background:rgba(123,240,190,0.08)' : '';
            const weight = highlight ? 'font-weight:700;color:var(--green)' : '';
            return `<tr style="border-bottom:1px solid var(--border);${bg}">
                <td style="padding:10px 12px;${weight}">${row[0]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[1]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[2]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[3]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[4]}</td>
                <td style="padding:10px 12px;color:var(--muted)">${row[5]}</td>
            </tr>`;
        }).join('');
    }
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