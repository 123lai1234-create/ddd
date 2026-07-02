// 龍洞和美國小 — Open-Meteo 即時/預報資料 (Open-Meteo: free, no API key, CC-BY 4.0)
// 龍洞和美 lat=25.1133, lon=121.9199 — Windguru spot #464009 對應座標
// Marine model = WAVEWATCH III + ECMWF; Weather model = GFS + ICON
// Reference: https://open-meteo.com/en/docs

const SPOT = { name: '龍洞和美國小', lat: 25.10, lon: 121.92, tz: 'Asia%2FTaipei' };

const MARINE_URL =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${SPOT.lat}&longitude=${SPOT.lon}` +
    `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature&forecast_days=10&timezone=${SPOT.tz}`;

const WEATHER_URL =
    `https://api.open-meteo.com/v1/forecast?latitude=${SPOT.lat}&longitude=${SPOT.lon}` +
    `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation,cloud_cover` +
    `&forecast_days=10&timezone=${SPOT.tz}&wind_speed_unit=ms`;

// 中央氣象署 龍洞浮標 MID=46694A, 48hr 觀測 (浪高/週期/風/水溫/氣壓/海流)
// 注意: CWA 不開 CORS — 用 <script> tag injection 載 (script tag 不受 CORS 限制)
const CWA_URL = 'https://www.cwa.gov.tw/Data/js/marine/48hr_plot/ChartData_48hr_46694A.js';
const CWA_MID = '龍洞浮標';

// ──────────── 顏色分級 (Windguru 風格) ────────────
// 風速 m/s: < 2.5 綠, 2.5-5 青, 5-8 黃, 8-11 橘, > 11 粉
function colorWind(ms) {
    if (ms == null) return '#3a3f4b';
    if (ms < 2.5)  return '#1a4d2e';  // 深綠
    if (ms < 5)    return '#3fb950';  // 綠
    if (ms < 8)    return '#d29922';  // 黃
    if (ms < 11)   return '#db6d28';  // 橘
    return '#f85149';                  // 粉紅
}
function txtOnWind(ms) {
    if (ms == null) return '#aaa';
    if (ms < 5) return '#0d1d10';
    return '#fff';
}

// 浪高 m: < 0.6 綠, 0.6-1.0 青, 1.0-1.4 黃, 1.4-1.8 橘, > 1.8 粉
function colorWave(m) {
    if (m == null) return '#3a3f4b';
    if (m < 0.6)  return '#1a4d2e';
    if (m < 1.0)  return '#3fb950';
    if (m < 1.4)  return '#d29922';
    if (m < 1.8)  return '#db6d28';
    return '#f85149';
}

// 浪週期 s: < 5 紅 (亂), 5-7 橘, 7-9 黃, 9-12 青, 12+ 綠
function colorPeriod(s) {
    if (s == null) return '#3a3f4b';
    if (s < 5)     return '#f85149';
    if (s < 7)     return '#db6d28';
    if (s < 9)     return '#d29922';
    if (s < 12)    return '#3fb950';
    return '#1a4d2e';
}

// 溫度 °C: < 20 紅, 20-24 青, 24-28 綠 (sweet spot), 28-30 黃, > 30 橘
function colorTemp(c) {
    if (c == null) return '#3a3f4b';
    if (c < 20)   return '#f85149';
    if (c < 24)   return '#58a6c4';
    if (c <= 28)  return '#3fb950';
    if (c <= 30)  return '#d29922';
    return '#db6d28';
}

// 方向箭頭 (8 方位)
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function arrowFor(deg) {
    if (deg == null) return '·';
    return ARROWS[Math.round(((deg % 360) / 45)) % 8];
}
function arrowLongFor(deg) {
    if (deg == null) return '·';
    const arrows = ['↑', '↗', '⇗', '→', '⇘', '↘', '⇙', '↓', '⇙', '↙', '⇙', '←', '⇖', '↖', '⇖', '↑'];
    return arrows[Math.round(((deg % 360) / 22.5)) % 16];
}

// 風向分級 (龍洞口朝東)
//   迎岸風 (onshore, ✅): E-ENE-SE 60-130°
//   離岸風 (offshore, ❌): WNW-W-SW 240-300°
//   沿岸風 (cross-shore, ⚠️): 其他
function classifyWindDir(deg) {
    if (deg == null) return 'unknown';
    if (deg >= 60 && deg <= 130)  return 'onshore';
    if (deg >= 240 && deg <= 300) return 'offshore';
    return 'cross-shore';
}
function dirLabel(cls) {
    return { onshore: '迎岸', offshore: '離岸', 'cross-shore': '沿岸', unknown: '?' }[cls];
}

// ──────────── Data loading ────────────
async function loadForecast() {
    const [marR, wxR] = await Promise.all([
        fetch(MARINE_URL).then(r => r.json()),
        fetch(WEATHER_URL).then(r => r.json()),
    ]);

    if (!marR.hourly || !wxR.hourly) {
        throw new Error('Open-Meteo 回傳結構異常');
    }

    const times = wxR.hourly.time;
    const out = [];
    for (let i = 0; i < times.length; i++) {
        out.push({
            t: times[i],                          // "2026-07-03T08:00"
            date: new Date(times[i]),            // local Date object
            hour: new Date(times[i]).getHours(),  // 0-23
            windMs:  wxR.hourly.wind_speed_10m[i],
            gustMs:  wxR.hourly.wind_gusts_10m[i],
            windDeg: wxR.hourly.wind_direction_10m[i],
            tempC:   wxR.hourly.temperature_2m[i],
            precip:  wxR.hourly.precipitation[i],
            cloud:   wxR.hourly.cloud_cover[i],
            waveM:   marR.hourly.wave_height[i],
            wavePer: marR.hourly.wave_period[i],
            waveDir: marR.hourly.wave_direction[i],
            sstC:   marR.hourly.sea_surface_temperature?.[i],
        });
    }
    return out;
}

// ──────────── CWA 龍洞浮標 載入 + 解析 ────────────
// CWA 不開 CORS, 所以用 <script> tag injection 載入, 讀 window.Data_Array_48hr
let _cwaLoading = null;  // mutex promise, 避免重複載入
function loadCWA() {
    if (_cwaLoading) return _cwaLoading;
    _cwaLoading = new Promise((resolve, reject) => {
        // CWA 檔案會設定 window.Data_Array_48hr 全域變數
        const s = document.createElement('script');
        s.src = CWA_URL + '?t=' + Date.now();
        let settled = false;
        const cleanup = () => {
            try { s.remove(); } catch {}
        };
        s.onload = () => {
            settled = true;
            cleanup();
            const data = window.Data_Array_48hr;
            // 移除 CWA 全域變數, 避免污染 window
            try { delete window.Data_Array_48hr; } catch {}
            if (!data || !data.time) {
                reject(new Error('CWA: Data_Array_48hr 缺失'));
                return;
            }
            resolve(data);
        };
        s.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('CWA script load fail'));
        };
        document.head.appendChild(s);
        // 15s timeout
        setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error('CWA: timeout 15s'));
        }, 15000);
    });
    return _cwaLoading;
}

// 把 CWA 原始 data 轉成跟 Open-Meteo 一樣的 normalized samples 格式
// 關鍵: CWA 陣列裡用 '-' 代表缺測 (要轉成 null), 數字字串轉 number
function parseCWA(data) {
    const siteName = data.name?.C || data.name?.E || CWA_MID;
    const station = data.name?.E || 'Longdong Buoy';
    const updTxt  = data.Time_Interval?.[0] || '';  // e.g. "2026/07/01 00:00 ~ 2026/07/03 00:00"

    const numify = (v) => {
        if (v === undefined || v === null || v === '-') return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
    };

    // 各時段指標 (跟 Open-Meteo 同 key 名對齊)
    const waveH = data.waveHeight || [];
    const waveP = data.wavePeriod || [];
    const windMS = data.windSpeed?.MS || [];
    const seaTemp = data.seaTemperature?.C || [];
    const pressure = data.stationPressure || [];

    // 風向從 windSpeed2.MS 內的 marker.url 解 (檔名 SSW.gif -> 方位)
    const windDeg = (data.windSpeed2?.MS || []).map(p => {
        if (p == null) return null;
        const m = p.marker?.symbol?.match(/wind_icon\/([A-Z]+)\.gif/);
        if (!m) return null;
        return windDirFromCode(m[1]);
    });

    const samples = [];
    for (let i = 0; i < (data.time?.length ?? 0); i++) {
        const utcMs = data.time[i];  // Date.UTC() 已 evaluate 為 number
        samples.push({
            t: new Date(utcMs).toISOString(),
            date: new Date(utcMs),
            hour: new Date(utcMs).getHours(),
            source: 'cwa',
            waveM: numify(waveH[i]),
            wavePer: numify(waveP[i]),
            windMs: numify(windMS[i]),
            windDeg: windDeg[i],
            tempC: numify(seaTemp[i]),  // CWA sea temperature (for display)
            sstC: numify(seaTemp[i]),   // alias 統一在比較函式裡用
            pressure: numify(pressure[i]),
        });
    }
    return { siteName, station, updTxt, samples };
}

// CWA 風向檔名 → 方位角度 (北為 0, 東為 90)
function windDirFromCode(code) {
    const dirMap = {
        N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
        E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
        S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
        W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
    };
    return dirMap[code] ?? null;
}

// ──────────── CWA 對 Open-Meteo 對照 ────────────
// 對齊方式: 兩者 timestamp 都轉 local 24h, 同時段的 (CWA observed, OM forecast), 計 Δ
function compareCWA(cwaSamples, omSamples) {
    // 對齊用 key: 24h HH 格式 — 不夠, 還要日期: 用 yyyy-mm-dd HH
    const key = (s) => {
        const d = s.date;
        return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()} ${String(d.getHours()).padStart(2,'0')}`;
    };

    const omMap = new Map();
    omSamples.forEach(s => omMap.set(key(s), s));

    const pairs = [];
    for (const cwa of cwaSamples) {
        const om = omMap.get(key(cwa));
        if (!om) continue;
        const waveDelta = (cwa.waveM != null && om.waveM != null)
            ? { obs: cwa.waveM, fcst: om.waveM, diff: cwa.waveM - om.waveM, pct: ((cwa.waveM - om.waveM) / om.waveM) * 100 }
            : null;
        const windDelta = (cwa.windMs != null && om.windMs != null)
            ? { obs: cwa.windMs, fcst: om.windMs, diff: cwa.windMs - om.windMs, pct: ((cwa.windMs - om.windMs) / om.windMs) * 100 }
            : null;
        const tempDelta = (cwa.tempC != null && om.sstC != null)
            ? { obs: cwa.tempC, fcst: om.sstC, diff: cwa.tempC - om.sstC, pct: ((cwa.tempC - om.sstC) / om.sstC) * 100 }
            : null;

        // Δ 顏色: |pct| ≤ 15% 綠 (預報準), ≤ 30% 黃 (有偏差), > 30% 紅 (不準)
        const classifyDelta = (p) => {
            if (p == null) return 'na';
            const a = Math.abs(p);
            if (a <= 15) return 'go';
            if (a <= 30) return 'caution';
            return 'nogo';
        };

        pairs.push({
            date: cwa.date,
            waveDelta, windDelta, tempDelta,
            waveCls: classifyDelta(waveDelta?.pct),
            windCls: classifyDelta(windDelta?.pct),
            tempCls: classifyDelta(tempDelta?.pct),
        });
    }

    // 整體 verdict: 大部分 pairs 為綠就綠
    let worst = 'go';
    const rank = { go: 0, caution: 1, nogo: 2 };
    for (const p of pairs) {
        for (const c of [p.waveCls, p.windCls, p.tempCls]) {
            if (rank[c] > rank[worst]) worst = c;
        }
    }
    return { pairs, verdict: worst };
}

// ──────────── Render CWA 對照 strip ────────────
// 6h 觀測 vs 預報 sparkline: 三 band split chart (上: 浪高, 中: 風速, 下: 水溫)
// 實線=觀測, 虛線=Open-Meteo 預報; 一眼看出模型在哪些指標偏離實況
function cwaCompareSparkline(pairs) {
    if (!pairs.length) return '';
    const W = 700, H = 130, PAD_L = 38, PAD_R = 12, PAD_T = 8, PAD_B = 22;
    const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
    const bandH = innerH / 3;

    // 三個 band 的 Y range + 位置
    // band 0 = top (wave), band 1 = mid (wind), band 2 = bot (temp)
    const bands = [
        { name: 'wave', max: 2.0, unit: 'm', color: '#58d7ff', desc: '浪高' },
        { name: 'wind', max: 12,  unit: 'm/s', color: '#d29922', desc: '風速' },
        { name: 'temp', min: 18, max: 32, unit: '°C', color: '#3fb950', desc: '水溫' },
    ];
    function bandY(name, v) {
        const b = bands.find(b => b.name === name);
        const idx = bands.indexOf(b);
        const yTop = PAD_T + idx * bandH;
        const yBot = yTop + bandH;
        const inner = bandH - 4;
        if (v == null) return null;
        if (name === 'temp') {
            const t = (Math.max(b.min, Math.min(b.max, v)) - b.min) / (b.max - b.min);
            return yBot - t * inner - 2;  // bottom=min, top=max
        }
        const t = Math.max(0, Math.min(b.max, v)) / b.max;
        return yBot - t * inner - 2;  // bottom=0, top=max
    }

    // 取最近 6 筆
    const recent = pairs.slice(-6);
    const x = (i) => PAD_L + (i / Math.max(1, recent.length - 1)) * innerW;

    // 三組 obs / fcst path
    function path(field) {
        return recent.map((p, i) => p[field]?.obs).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY('wave', v).toFixed(1)}` : '').filter(Boolean).join(' ');
    }
    function pathFcst(field) {
        return recent.map((p, i) => p[field]?.fcst).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY('wave', v).toFixed(1)}` : '').filter(Boolean).join(' ');
    }
    // 三個 band 分別畫 obs / fcst (顏色不同)
    const series = [
        { field: 'waveDelta', yName: 'wave', obs: '#58d7ff', label: '浪高' },
        { field: 'windDelta', yName: 'wind', obs: '#d29922', label: '風速' },
        { field: 'tempDelta', yName: 'temp', obs: '#3fb950', label: '水溫' },
    ];

    // 背景分隔線
    const dividers = [1, 2].map(i => {
        const y = PAD_T + i * bandH;
        return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="rgba(120,180,255,0.18)" stroke-dasharray="3 3"/>`;
    }).join('');

    // 三 band 的 obs + fcst 路徑
    const lines = series.flatMap(s => {
        const obs = recent.map((p, i) => p[s.field]?.obs).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY(s.yName, v).toFixed(1)}` : '').filter(Boolean).join(' ');
        const fcst = recent.map((p, i) => p[s.field]?.fcst).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY(s.yName, v).toFixed(1)}` : '').filter(Boolean).join(' ');
        return [
            obs ? `<path d="${obs}" fill="none" stroke="${s.obs}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : '',
            fcst ? `<path d="${fcst}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.3" stroke-dasharray="3 2"/>` : '',
        ];
    }).join('');

    // X 軸標籤 (時段)
    const xLabels = recent.map((p, i) => {
        const hh = String(p.date.getHours()).padStart(2, '0');
        return i % 2 === 0
            ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8b949e" font-family="JetBrains Mono, monospace">${hh}</text>`
            : '';
    }).join('');

    // Y 軸標籤 (三 band 各自的 scale)
    const yLabels = bands.map((b, i) => {
        const y = PAD_T + i * bandH + 10;
        const label = b.name === 'temp' ? `${b.min}–${b.max}${b.unit}` : `${b.max}${b.unit}`;
        return `<text x="${PAD_L - 4}" y="${y}" text-anchor="end" font-size="9" fill="#8b949e">${label}</text>`;
    }).join('');

    // Legend 精簡版: 三色 (obs 線 + 顏色標籤) 在右上
    const legend = series.map((s, i) => {
        const y = PAD_T + 6 + i * 12;
        return `<line x1="${W - 130}" y1="${y}" x2="${W - 110}" y2="${y}" stroke="${s.obs}" stroke-width="1.8"/>
            <text x="${W - 106}" y="${y + 3}" font-size="9" fill="#cdd9e5" font-family="Inter, sans-serif">${s.label} 觀</text>
            <line x1="${W - 70}" y1="${y}" x2="${W - 50}" y2="${y}" stroke="rgba(255,255,255,0.4)" stroke-width="1.3" stroke-dasharray="3 2"/>
            <text x="${W - 46}" y="${y + 3}" font-size="9" fill="#cdd9e5" font-family="Inter, sans-serif">${s.label} 預</text>`;
    }).join('');

    return `<svg class="cwa-spark" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="6h 觀測 vs 預報 sparkline">
        ${dividers}
        ${lines}
        <g class="cwa-spark-legend">${legend}</g>
        ${yLabels}
        ${xLabels}
    </svg>`;
}

function renderCWAStrip(cwaParsed, comparison) {
    const el = document.getElementById('cwa-strip');
    if (!el) return;

    if (!cwaParsed || !comparison || !comparison.pairs.length) {
        el.innerHTML = '<div class="cwa-empty">CWA 龍洞浮標無資料 (可能是 buoys 維護中)。</div>';
        return;
    }

    const { siteName, station, updTxt, samples: cwaSamples } = cwaParsed;
    const { pairs, verdict } = comparison;

    // 最新一筆觀測 (取 CWA samples 最後有資料的)
    const latest = [...cwaSamples].reverse().find(s => s.waveM != null || s.windMs != null);
    const latestPair = pairs.length ? pairs[pairs.length - 1] : null;

    const verdictBadge = verdict === 'go'
        ? '<span class="cwa-badge go">🟢 預報與實況一致</span>'
        : verdict === 'caution'
        ? '<span class="cwa-badge caution">🟡 預報有偏差</span>'
        : '<span class="cwa-badge nogo">🔴 預報不準, 改參考實況</span>';

    // 最近 N 筆對照 (取最後 6 個)
    const recent = pairs.slice(-6);
    const fmtHour = (d) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;

    el.innerHTML = `
        <div class="cwa-head">
            <div class="cwa-head-l">
                <div class="cwa-station">📡 ${siteName}</div>
                <div class="cwa-station-en">${station} (MID 46694A)</div>
                <div class="cwa-upd">資料時段: ${updTxt}</div>
            </div>
            <div class="cwa-head-r">
                ${verdictBadge}
            </div>
        </div>

        <div class="cwa-latest">
            <div class="cwa-cell">
                <div class="cwa-cell-label">最新觀測</div>
                <div class="cwa-cell-val">${latest ? fmtHour(latest.date) : '—'}</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">浪高</div>
                <div class="cwa-cell-val" style="background:${colorWave(latest?.waveM)};color:${txtOnWind(latest?.waveM)}">${latest?.waveM?.toFixed(2) ?? '—'} m</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">浪週期</div>
                <div class="cwa-cell-val" style="background:${colorPeriod(latest?.wavePer)};color:${txtOnWind(latest?.wavePer)}">${latest?.wavePer?.toFixed(1) ?? '—'} s</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">風速</div>
                <div class="cwa-cell-val" style="background:${colorWind(latest?.windMs)};color:${txtOnWind(latest?.windMs)}">${latest?.windMs?.toFixed(1) ?? '—'} m/s</div>
            </div>
            <div class="cwa-cell">
                <div class="cwa-cell-label">水溫</div>
                <div class="cwa-cell-val" style="background:${colorTemp(latest?.tempC)};color:${txtOnWind(latest?.tempC)}">${latest?.tempC?.toFixed(1) ?? '—'}°C</div>
            </div>
        </div>

        <div class="cwa-spark-wrap">
            <div class="cwa-spark-title">6h 觀測 vs 預報 曲線對照 · 實線=觀測 · 虛線=Open-Meteo 預報</div>
            ${cwaCompareSparkline(pairs)}
        </div>

        <div class="cwa-cmp">
            <div class="cwa-cmp-head">過去 6 小時 vs Open-Meteo 預報同期對照 · Δ 顏色: 🟢 ≤15% · 🟡 15-30% · 🔴 >30%</div>
            <table class="cwa-cmp-table">
                <thead>
                    <tr>
                        <th class="cwa-cmp-th">時段</th>
                        <th class="cwa-cmp-th">浪高 觀測</th>
                        <th class="cwa-cmp-th">浪高 預報</th>
                        <th class="cwa-cmp-th">Δ</th>
                        <th class="cwa-cmp-th">風速 觀測</th>
                        <th class="cwa-cmp-th">風速 預報</th>
                        <th class="cwa-cmp-th">Δ</th>
                    </tr>
                </thead>
                <tbody>
                    ${recent.map(p => `
                        <tr>
                            <td class="cwa-cmp-time">${fmtHour(p.date)}</td>
                            <td class="cwa-cmp-cell" style="background:${colorWave(p.waveDelta?.obs)};color:${txtOnWind(p.waveDelta?.obs)}">${p.waveDelta?.obs?.toFixed(2) ?? '—'}</td>
                            <td class="cwa-cmp-cell" style="background:#1a1f2e;color:var(--muted)">${p.waveDelta?.fcst?.toFixed(2) ?? '—'}</td>
                            <td class="cwa-cmp-delta" style="background:${deltaBg(p.waveCls)};color:${deltaTxt(p.waveCls)}">${p.waveDelta ? `${p.waveDelta.diff >= 0 ? '+' : ''}${p.waveDelta.diff.toFixed(2)} (${p.waveDelta.pct >= 0 ? '+' : ''}${p.waveDelta.pct.toFixed(0)}%)` : '—'}</td>
                            <td class="cwa-cmp-cell" style="background:${colorWind(p.windDelta?.obs)};color:${txtOnWind(p.windDelta?.obs)}">${p.windDelta?.obs?.toFixed(1) ?? '—'}</td>
                            <td class="cwa-cmp-cell" style="background:#1a1f2e;color:var(--muted)">${p.windDelta?.fcst?.toFixed(1) ?? '—'}</td>
                            <td class="cwa-cmp-delta" style="background:${deltaBg(p.windCls)};color:${deltaTxt(p.windCls)}">${p.windDelta ? `${p.windDelta.diff >= 0 ? '+' : ''}${p.windDelta.diff.toFixed(1)} (${p.windDelta.pct >= 0 ? '+' : ''}${p.windDelta.pct.toFixed(0)}%)` : '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="cwa-foot">
            <a href="https://www.cwa.gov.tw/V8/C/M/OBS_Marine_plot.html?MID=46694A" target="_blank" rel="noopener">📊 在 CWA 官網看完整 48hr 時序圖 ↗</a>
            <span>資料: 中央氣象署 龍洞浮標 (MID 46694A) · Open-Meteo Marine ECMWF + GFS</span>
        </div>
    `;
}

function deltaBg(cls) {
    return cls === 'go' ? '#1a4d2e' : cls === 'caution' ? '#d29922' : cls === 'nogo' ? '#f85149' : '#1a1f2e';
}
function deltaTxt(cls) {
    return cls === 'go' ? '#0d1d10' : '#fff';
}

// ──────────── Decision logic (對齊 /diving/ 頁面決策矩陣) ────────────
function scoreRow(s) {
    // worst-of across 3 metrics: 浪高 / 風速 / 風向 (對齊頁面決策矩陣的閾值)
    const waveV = s.waveM == null ? 'go'
        : s.waveM < 0.6 ? 'go'
        : s.waveM < 1.2 ? 'caution'
        : 'nogo';
    const windV = s.windMs == null ? 'go'
        : s.windMs < 5 ? 'go'
        : s.windMs < 8 ? 'caution'
        : 'nogo';
    const dirV = classifyWindDir(s.windDeg);
    const dirLevel = dirV === 'offshore' ? 'nogo'
        : dirV === 'cross-shore' ? 'caution'
        : 'go';
    const rank = { go: 0, caution: 1, nogo: 2 };
    return [waveV, windV, dirLevel].reduce(
        (acc, lv) => (rank[lv] > rank[acc] ? lv : acc),
        'go'
    );
}

function recommendForDay(samples) {
    // 拿早上 6-12 點的 samples 評估
    const morning = samples.filter(s => s.hour >= 6 && s.hour <= 12);
    if (morning.length === 0) return null;
    const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
    const verdict = morning.reduce((acc, s) => {
        const r = scoreRow(s);
        return rank[r] > rank[acc] ? r : acc;
    }, 'go');

    // 找最佳時段 (worst 欄位最低的 hour)
    const bestHour = morning.reduce((best, s) => {
        if (rank[scoreRow(s)] < rank[scoreRow(best)]) return s;
        return best;
    }, morning[0]);

    let site, tip;
    if (verdict === 'go') {
        site = '🥇 龍洞西口';
        tip = '全部綠燈 — 帶愉快心情下水';
    } else if (verdict === 'caution') {
        const hasOffshore = morning.some(s => classifyWindDir(s.windDeg) === 'offshore');
        site = hasOffshore ? '🥈 潮境 (海科館)' : '🥈 龍洞東口 (水深)';
        tip = '有黃燈 — 看潛點經驗調整';
    } else {
        site = '🔴 改期';
        tip = '有紅燈 — 強烈建議不要下水';
    }

    return { verdict, site, tip, bestHour };
}

// ──────────── Date helpers ────────────
function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function fmtDayHeader(date) {
    const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    return `週${wd} ${date.getMonth() + 1}/${date.getDate()}`;
}

function nextWeekend() {
    const now = new Date();
    const day = now.getDay();
    let sat;
    if (day === 6)      sat = new Date(now);
    else if (day === 0) sat = new Date(now.getTime() + 6 * 86400000);
    else                sat = new Date(now.getTime() + (6 - day) * 86400000);
    sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat.getTime() + 86400000);
    return [sat, sun];
}

// ──────────── Renderers ────────────
// 24h sparkline: 把一天 24 個小時的 score (0=GO/1=CAUTION/2=NO-GO) 畫成曲線
// 視覺化「這天的哪個時段最好、最差」
function sparkline24h(daySamples, bestHour) {
    const W = 280, H = 48, PAD = 4;
    // 每小時 score
    const points = [];
    for (let h = 0; h < 24; h++) {
        const s = daySamples.find(x => x.hour === h);
        const score = s ? scoreRow(s) : null;
        const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
        points.push({ h, s, score, y: score == null ? null : rank[score] });
    }
    const innerW = W - PAD * 2, innerH = H - PAD * 2;
    const x = (h) => PAD + (h / 23) * innerW;
    const y = (rank) => PAD + (rank / 2) * innerH;  // 0=top (GO), 2=bottom (NO-GO)

    // 背景三色 band (GO 上, CAUTION 中, NO-GO 下)
    const bands = [
        { rank: 0, color: 'rgba(63,185,80,0.10)' },
        { rank: 1, color: 'rgba(210,153,34,0.10)' },
        { rank: 2, color: 'rgba(248,81,73,0.10)' },
    ];
    const bandRects = bands.map((b, i) => {
        const yTop = PAD + (b.rank / 2) * innerH;
        const yBot = PAD + ((b.rank + 1) / 2) * innerH;
        return `<rect x="${PAD}" y="${yTop}" width="${innerW}" height="${yBot - yTop}" fill="${b.color}"/>`;
    }).join('');

    // 曲線 path
    const segs = [];
    for (let i = 0; i < points.length; i++) {
        if (points[i].y == null) continue;
        segs.push(`${i === 0 || points[i - 1].y == null ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(points[i].y).toFixed(1)}`);
    }
    const path = segs.join(' ');

    // 點 (有資料的小時)
    const dots = points.filter(p => p.y != null).map(p => {
        const color = p.score === 'go' ? '#3fb950' : p.score === 'caution' ? '#d29922' : '#f85149';
        return `<circle cx="${x(p.h).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="1.8" fill="${color}"/>`;
    }).join('');

    // Best hour 垂直 highlight
    const bh = bestHour?.hour ?? null;
    const bestLine = bh != null
        ? `<line x1="${x(bh).toFixed(1)}" y1="${PAD - 1}" x2="${x(bh).toFixed(1)}" y2="${H - PAD + 1}" stroke="#58d7ff" stroke-width="1" stroke-dasharray="2 2" opacity="0.85"/>
           <text x="${x(bh).toFixed(1)}" y="${PAD - 1}" text-anchor="middle" font-size="8" fill="#58d7ff" font-weight="700">最佳</text>`
        : '';

    return `<svg class="ww-spark" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="24h verdict sparkline">
        ${bandRects}
        <line x1="${PAD}" y1="${PAD + innerH / 2}" x2="${W - PAD}" y2="${PAD + innerH / 2}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 2"/>
        ${path ? `<path d="${path}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${dots}
        ${bestLine}
    </svg>`;
}

function renderWeekendCards(samples) {
    const container = document.getElementById('weekend-rec');
    if (!container) return;

    const [sat, sun] = nextWeekend();
    const satSamples = samples.filter(s => sameDay(s.date, sat));
    const sunSamples = samples.filter(s => sameDay(s.date, sun));

    if (satSamples.length === 0 && sunSamples.length === 0) {
        container.innerHTML = '<div class="ww-empty">目前 Open-Meteo 預報只到 10 日內，下一個週末超出預報範圍。</div>';
        return;
    }

    const cards = [
        { date: sat, samples: satSamples, label: '週六' },
        { date: sun, samples: sunSamples, label: '週日' },
    ];

    container.innerHTML = cards.map(({ date, samples, label }) => {
        const rec = recommendForDay(samples);
        if (!rec) {
            return `<div class="ww-day-card ww-empty-card">
                <div class="ww-day-name">${fmtDayHeader(date)}</div>
                <div class="ww-day-empty">目前無資料</div>
            </div>`;
        }
        const vClass = `ww-${rec.verdict}`;
        const vBadge = { go: '🟢 GO', caution: '🟡 CAUTION', nogo: '🔴 NO-GO' }[rec.verdict];
        const peak = samples.reduce((max, s) => s.windMs > (max?.windMs ?? -1) ? s : max, samples[0]);
        const peakWave = samples.reduce((max, s) => s.waveM > (max?.waveM ?? -1) ? s : max, samples[0]);
        const dir = classifyWindDir(peak.windDeg);
        const dirEmoji = { onshore: '✅', 'cross-shore': '⚠️', offshore: '❌', unknown: '·' }[dir];

        // 趨勢箭頭: 跟前 6 小時比, 風/浪變大/變小/不變
        const now = samples[0] || peak;
        const later = samples.find(s => s.hour === Math.min(23, (now.hour || 6) + 6)) || peak;
        const windTrend = (later.windMs ?? 0) - (now.windMs ?? 0);
        const waveTrend = (later.waveM ?? 0) - (now.waveM ?? 0);
        const trendArrow = (delta) => delta > 0.3 ? '↗' : delta < -0.3 ? '↘' : '→';
        const trendColor = (delta) => delta > 0.3 ? '#f85149' : delta < -0.3 ? '#3fb950' : '#8b949e';
        const trendNote = (delta, unit, name) => {
            const pct = now ? (delta / (now[`${name}Ms`] || now[`${name}M`] || 1)) * 100 : 0;
            return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit} (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)`;
        };

        const timeStr = String(rec.bestHour.hour).padStart(2, '0') + ':00';
        return `
        <div class="ww-day-card ${vClass}">
            <div class="ww-day-head">
                <div class="ww-day-name">${fmtDayHeader(date)}</div>
                <div class="ww-day-badge ${rec.verdict}">${vBadge}</div>
            </div>
            <div class="ww-day-site">${rec.site}</div>
            <div class="ww-day-tip">${rec.tip}</div>
            ${sparkline24h(samples, rec.bestHour)}
            <div class="ww-day-stats">
                <div class="ww-stat">
                    <span class="ww-stat-label">建議時段</span>
                    <span class="ww-stat-val">${timeStr}</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">最大風速</span>
                    <span class="ww-stat-val" style="background:${colorWind(peak.windMs)};color:${txtOnWind(peak.windMs)}">${peak.windMs?.toFixed(1) ?? '—'} m/s</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">最大浪高</span>
                    <span class="ww-stat-val" style="background:${colorWave(peakWave.waveM)};color:${txtOnWind(peakWave.waveM)}">${peakWave.waveM?.toFixed(2) ?? '—'} m</span>
                </div>
                <div class="ww-stat">
                    <span class="ww-stat-label">風向</span>
                    <span class="ww-stat-val">${dirEmoji} ${dirLabel(dir)} ${arrowLongFor(peak.windDeg)} ${Math.round(peak.windDeg ?? 0)}°</span>
                </div>
            </div>
            <div class="ww-day-trend">
                <span class="ww-trend-item">
                    <span class="ww-trend-label">風 6h 趨勢</span>
                    <span class="ww-trend-val" style="color:${trendColor(windTrend)}">${trendArrow(windTrend)} ${trendNote(windTrend, 'm/s', 'wind')}</span>
                </span>
                <span class="ww-trend-item">
                    <span class="ww-trend-label">浪 6h 趨勢</span>
                    <span class="ww-trend-val" style="color:${trendColor(waveTrend)}">${trendArrow(waveTrend)} ${trendNote(waveTrend, 'm', 'wave')}</span>
                </span>
            </div>
        </div>`;
    }).join('');
}

// 風向轉 16 方位文字
const WIND_DIR_NAMES = ['北', '北東北', '東北', '東東北', '東', '東東南', '東南', '南東南', '南', '南西南', '西南', '西西南', '西', '西西北', '西北', '北西北'];
function windDirName(deg) {
    if (deg == null) return '?';
    return WIND_DIR_NAMES[Math.round(((deg % 360) / 22.5)) % 16];
}

// 7-day 風向分布 wind rose: 8 方位 bin, 計算過去幾天的 sample 各佔多少小時
function renderWindRose(samples) {
    const petalsEl  = document.getElementById('windrose-petals');
    const ringsEl   = document.getElementById('windrose-rings');
    const labelsEl  = document.getElementById('windrose-labels');
    if (!petalsEl || !ringsEl || !labelsEl) return;

    // 8 方位 bin (0=N, 1=NE, ..., 7=NW), 角度 0=up 順時針
    const bins = new Array(8).fill(0);
    let maxCount = 0;
    for (const s of samples) {
        if (s.windDeg == null) continue;
        // bin: 0=N (center 0°), 1=NE (center 45°), ..., idx = round((deg % 360) / 45) % 8
        const idx = Math.round(((s.windDeg % 360) / 45)) % 8;
        bins[idx]++;
        if (bins[idx] > maxCount) maxCount = bins[idx];
    }

    const R = 50;  // max radius in viewBox 120x120 (centered)
    const labels8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    // 安全配色: 依「該方位的代表角度」對應到 compass 上的色
    // 0=N(cross-shore) 1=NE(onshore-ish) 2=E(SAFEST) 3=SE(cross) 4=S(cross) 5=SW(offshore) 6=W(MOST DANGEROUS) 7=NW(offshore)
    const fillByBin = [
        'rgba(210,153,34,0.55)',  // N cross-shore
        'rgba(63,185,80,0.45)',    // NE onshore-ish
        'rgba(63,185,80,0.65)',    // E SAFEST
        'rgba(210,153,34,0.55)',  // SE cross-shore
        'rgba(210,153,34,0.55)',  // S cross-shore
        'rgba(248,81,73,0.45)',   // SW offshore-ish
        'rgba(248,81,73,0.65)',   // W MOST DANGEROUS
        'rgba(248,81,73,0.45)',   // NW offshore-ish
    ];
    const strokeByBin = ['#d29922', '#3fb950', '#3fb950', '#d29922', '#d29922', '#f85149', '#f85149', '#f85149'];

    // 同心圓 ring (4 圈, 25/50/75/100%)
    ringsEl.innerHTML = [0.25, 0.5, 0.75].map(f => {
        const r = R * f;
        return `<circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(120,180,255,0.18)" stroke-width="0.5" stroke-dasharray="1 2"/>`;
    }).join('');

    // 8 個 petal
    petalsEl.innerHTML = bins.map((count, i) => {
        if (count === 0) return '';
        const angle = i * 45;  // 0=N, 45=NE, ...; 0=up, 順時針
        const a1 = (angle - 22.5) * Math.PI / 180;
        const a2 = (angle + 22.5) * Math.PI / 180;
        // 計算 inner/outer radius (圓弧的兩個端點): 角從 up 開始, 順時針
        // (0,0) 是中心, (x, y) = (r*sin(a), -r*cos(a))  (因為 SVG y 朝下, 北方是 -y)
        const outerR = Math.max(4, (count / Math.max(1, maxCount)) * R);
        const innerR = 5;  // 留個小空心
        const x1o = outerR * Math.sin(a1), y1o = -outerR * Math.cos(a1);
        const x2o = outerR * Math.sin(a2), y2o = -outerR * Math.cos(a2);
        const x1i = innerR * Math.sin(a1), y1i = -innerR * Math.cos(a1);
        const x2i = innerR * Math.sin(a2), y2i = -innerR * Math.cos(a2);
        const largeArc = 0;  // 每片 45°, 小於 180° 用 0
        // outer arc + return inner arc (donut slice)
        const d = `M ${x1o.toFixed(1)} ${y1o.toFixed(1)} A ${outerR.toFixed(1)} ${outerR.toFixed(1)} 0 ${largeArc} 1 ${x2o.toFixed(1)} ${y2o.toFixed(1)} L ${x2i.toFixed(1)} ${y2i.toFixed(1)} A ${innerR.toFixed(1)} ${innerR.toFixed(1)} 0 ${largeArc} 0 ${x1i.toFixed(1)} ${y1i.toFixed(1)} Z`;
        return `<path class="windrose-petal" d="${d}" fill="${fillByBin[i]}" stroke="${strokeByBin[i]}" stroke-width="0.8" stroke-linejoin="round"><title>${labels8[i]} · ${count} 小時</title></path>`;
    }).join('');

    // 8 方位 labels
    const labelR = R + 10;
    labelsEl.innerHTML = labels8.map((lbl, i) => {
        const a = i * 45 * Math.PI / 180;
        const x = labelR * Math.sin(a);
        const y = -labelR * Math.cos(a);
        return `<text x="${x.toFixed(1)}" y="${(y + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#8b949e" font-family="'JetBrains Mono', monospace">${lbl}</text>`;
    }).join('');
}

// Live compass: 把當下風向/風速顯示在 compass 上 (arrow 跟 speed label 都 rotate)
// 用「最接近現在的 sample」當 live 狀態 (Open-Meteo current hour)
function renderLiveCompass(samples) {
    const el = document.getElementById('compass-live');
    const arrow = document.getElementById('compass-live-arrow');
    const label = document.getElementById('compass-live-label');
    if (!el || !arrow || !label) return;

    // 找最接近 now 的 sample
    const now = Date.now();
    let cur = null;
    let bestDelta = Infinity;
    for (const s of samples) {
        if (s.windDeg == null || s.windMs == null) continue;
        const d = Math.abs(s.date.getTime() - now);
        if (d < bestDelta) { bestDelta = d; cur = s; }
    }
    if (!cur) return;

    const deg = cur.windDeg;
    const ms = cur.windMs;
    el.setAttribute('data-wind-deg', deg.toFixed(0));
    el.setAttribute('data-wind-ms', ms.toFixed(1));
    el.setAttribute('data-loaded', 'true');

    // arrow 跟 label 都用 rotate(deg) 套上 (label 一起轉, 文字才不會上下顛倒)
    arrow.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
    label.setAttribute('transform', `rotate(${deg.toFixed(1)})`);

    // label 內文字: 風速
    const txt = label.querySelector('text');
    if (txt) txt.textContent = `${ms.toFixed(1)} m/s`;

    // 下方 caption
    const cap = document.getElementById('compass-current');
    if (cap) {
        const val = cap.querySelector('.compass-current-val');
        const dir = cap.querySelector('.compass-current-dir');
        if (val) val.textContent = `${ms.toFixed(1)} m/s`;
        if (dir) dir.textContent = `${windDirName(deg)} ${Math.round(deg)}°`;
    }
}

function renderHourlyGrid(samples, opts = {}) {
    const container = document.getElementById('forecast-grid');
    if (!container) return;

    // 預設顯示 06:00–18:00, 7 天
    const HOUR_START = opts.hourStart ?? 6;
    const HOUR_END = opts.hourEnd ?? 18;
    const DAYS = opts.days ?? 7;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startDay = new Date(now);
    const endDay = new Date(now.getTime() + (DAYS - 1) * 86400000);

    const days = [];
    for (let d = 0; d < DAYS; d++) {
        const dayDate = new Date(startDay.getTime() + d * 86400000);
        const daySamples = samples.filter(s => sameDay(s.date, dayDate)
            && s.hour >= HOUR_START && s.hour <= HOUR_END);
        const dayAvg = daySamples.length ? {
            wind: avg(daySamples.map(s => s.windMs)),
            wave: avg(daySamples.map(s => s.waveM)),
            temp: avg(daySamples.map(s => s.tempC)),
        } : null;
        const dayWorst = daySamples.length ? {
            wind: Math.max(...daySamples.map(s => s.windMs ?? 0)),
            wave: Math.max(...daySamples.map(s => s.waveM ?? 0)),
            gust: Math.max(...daySamples.map(s => s.gustMs ?? 0)),
        } : null;

        days.push({ date: dayDate, samples: daySamples, avg: dayAvg, worst: dayWorst });
    }

    const hours = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

    const headRow = `<tr class="fg-dayhead">
        <th class="fg-label fg-sticky">指標</th>
        ${days.map(d => {
            const weekend = d.date.getDay() === 0 || d.date.getDay() === 6;
            return `<th class="fg-day ${weekend ? 'fg-weekend' : ''}" colspan="${hours.length}">${fmtDayHeader(d.date)}</th>`;
        }).join('')}
    </tr>`;

    const subheadRow = `<tr class="fg-hourhead">
        <th class="fg-label fg-sticky"></th>
        ${days.flatMap(d =>
            hours.map(h => `<th class="fg-hour ${d.date.getDay() === 0 || d.date.getDay() === 6 ? 'fg-weekend' : ''}">${h}</th>`)
        ).join('')}
    </tr>`;

    // bar 比例 helper: 把指標值線性映射到 [0, 1] (0 = 該指標最低, 1 = max)
    // 用在每格底部的迷你 bar 上, 視覺化數值在 [0, max] 的相對位置
    const WIND_MAX = 15;     // m/s
    const GUST_MAX = 25;     // m/s
    const WAVE_MAX = 2.5;    // m
    const PER_MAX = 14;      // s
    const TEMP_MAX_LO = 18;
    const TEMP_MAX_HI = 32;
    const PRECIP_MAX = 5;    // mm

    function barPct(v, max) {
        if (v == null || isNaN(v)) return 0;
        return Math.max(0, Math.min(1, Math.abs(v) / max));
    }

    function cell(s, colorFn, valFn, unit, barMax = 1) {
        if (!s || valFn(s) == null) return '<td class="fg-cell fg-na">—</td>';
        const v = valFn(s);
        const bg = colorFn(v);
        const dir = s.windDeg != null ? arrowLongFor(s.windDeg) : '·';
        const dirCls = classifyWindDir(s.windDeg);
        const tip = `風 ${s.windMs?.toFixed(1) ?? '?'} m/s ${dir} ${Math.round(s.windDeg ?? 0)}° (${dirLabel(dirCls)}) · 陣風 ${s.gustMs?.toFixed(1) ?? '?'} · 浪 ${s.waveM?.toFixed(2) ?? '?'} m @ ${s.wavePer?.toFixed(0) ?? '?'}s · 水溫 ${s.tempC?.toFixed(0) ?? '?'}°C`;
        const pct = barPct(v, barMax);
        const valStr = unit != null ? v.toFixed(unit) : v;
        return `<td class="fg-cell" style="background:${bg};color:${txtOnWind(v)}" title="${tip}">
            <div class="fg-cell-num">${valStr}</div>
            <div class="fg-cell-bar" style="width:${(pct * 100).toFixed(0)}%"></div>
        </td>`;
    }

    function row(label, colorFn, valFn, unit, barMax) {
        return `<tr class="fg-row">
            <td class="fg-label fg-sticky">${label}</td>
            ${days.flatMap(d =>
                hours.map(h => {
                    const s = d.samples.find(x => x.hour === h);
                    return cell(s, colorFn, valFn, unit, barMax);
                })
            ).join('')}
        </tr>`;
    }

    // 每天「最佳時段」summary row — 跨整列找最綠的小時, 顯示該小時的時間
    // 視覺上跟其他 row 一致 (用 threshold 色), 但只顯示 HH:00 文字 + 該小時的綜合評分
    function bestHourRow() {
        const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
        // 找 Sat/Sun 對應在 days 裡的 index, 給 click → scroll 用
        // Sat = getDay()=6, Sun = getDay()=0
        const satDayIdx = days.findIndex(d => d.date.getDay() === 6);
        const sunDayIdx = days.findIndex(d => d.date.getDay() === 0);
        const cells = days.flatMap((d, dayIdx) => {
            // 找當天 score 最低 (最綠) 的 hour
            if (!d.samples.length) {
                return hours.map(() => `<td class="fg-cell fg-na" colspan="1">—</td>`).slice(0, hours.length);
            }
            // 先算當天所有 hour 的 score, 找最低; 最低相同時, 取小時最早的那個
            const hourScores = hours.map(h => {
                const valid = d.samples.find(s => s.hour === h);
                return valid ? rank[scoreRow(valid)] : null;
            });
            const minScore = Math.min(...hourScores.filter(v => v != null));
            const firstBestHour = hours[hourScores.findIndex(v => v === minScore)];

            return hours.map(h => {
                const valid = d.samples.find(s => s.hour === h);
                if (!valid) return `<td class="fg-cell fg-na">—</td>`;
                const s = valid;
                const sc = scoreRow(s);
                const bg = sc === 'go' ? '#1a4d2e' : sc === 'caution' ? '#d29922' : '#f85149';
                const txt = sc === 'go' ? '#0d1d10' : '#fff';
                const isBest = (h === firstBestHour);
                const cellText = isBest ? `✓ ${String(h).padStart(2,'0')}:00` : '·';
                const tip = `${fmtDayHeader(d.date)} ${String(h).padStart(2,'0')}:00 — ${sc === 'go' ? 'GO' : sc === 'caution' ? 'CAUTION' : 'NO-GO'}`;
                // Sat/Sun 最佳 cell 變 clickable
                const isWeekend = (dayIdx === satDayIdx || dayIdx === sunDayIdx);
                const clickable = isBest && isWeekend;
                const cls = `fg-cell fg-best-cell ${isBest ? 'fg-best-cell-mark' : ''} ${clickable ? 'fg-best-cell-clickable' : ''}`;
                const dataAttrs = clickable
                    ? `data-wday="${d.date.getDay()}" data-day-idx="${dayIdx}"`
                    : '';
                const tipWithAction = clickable
                    ? `${tip} · 點擊跳到週末卡`
                    : tip;
                return `<td class="${cls}" style="background:${bg};color:${txt}" title="${tipWithAction}" ${dataAttrs}>${cellText}</td>`;
            });
        }).join('');
        return `<tr class="fg-row fg-row-summary">
            <td class="fg-label fg-sticky">最佳時段</td>
            ${cells}
        </tr>`;
    }

    const rows = `
        ${bestHourRow()}
        ${row('風速 (m/s)', colorWind, s => s.windMs, 1, WIND_MAX)}
        ${row('陣風 (m/s)', colorWind, s => s.gustMs, 1, GUST_MAX)}
        ${row('風向 (°)', () => '#252b3b', s => s.windDeg != null ? `${arrowLongFor(s.windDeg)} ${Math.round(s.windDeg)}` : null, null, 1)}
        ${row('浪高 (m)', colorWave, s => s.waveM, 2, WAVE_MAX)}
        ${row('週期 (s)', colorPeriod, s => s.wavePer, 0, PER_MAX)}
        ${row('溫度 (°C)', colorTemp, s => s.tempC, 0, TEMP_MAX_HI)}
        ${row('降雨 (mm)', s => s == null ? '#3a3f4b' : s.precip > 2 ? '#f85149' : s.precip > 0.1 ? '#d29922' : '#1a4d2e', s => s.precip, 1, PRECIP_MAX)}
    `;

    container.innerHTML = `
        <div class="fg-scroll">
            <table class="fg-table">
                <thead>${headRow}${subheadRow}</thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="fg-foot">
            <span>資料: Open-Meteo (Marine ECMWF + WAVEWATCH III / Weather GFS)</span>
            <span>座標: ${SPOT.lat}°N, ${SPOT.lon}°E · 龍洞和美</span>
        </div>
    `;
}

function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + (b ?? 0), 0) / arr.filter(v => v != null).length;
}

// ──────────── Init ────────────
async function init() {
    const weekendEl = document.getElementById('weekend-rec');
    const gridEl = document.getElementById('forecast-grid');
    const cwaEl = document.getElementById('cwa-strip');
    try {
        weekendEl && (weekendEl.innerHTML = '<div class="ww-loader">載入 Open-Meteo 預報中…</div>');
        gridEl && (gridEl.innerHTML = '<div class="fg-loader">載入中…</div>');
        cwaEl && (cwaEl.innerHTML = '<div class="cwa-loader">載入 CWA 龍洞浮標觀測中…</div>');

        // Open-Meteo + CWA 同時拉
        const [samples, cwaData] = await Promise.all([
            loadForecast(),
            loadCWA().catch(err => {
                console.warn('CWA load fail (non-fatal, 預報仍可用):', err.message);
                return null;
            }),
        ]);

        renderWeekendCards(samples);
        renderHourlyGrid(samples);
        renderLiveCompass(samples);
        renderWindRose(samples);

        // CWA 對照 strip (只有 CWA 拿到資料才渲染)
        if (cwaData) {
            const cwaParsed = parseCWA(cwaData);
            const comparison = compareCWA(cwaParsed.samples, samples);
            renderCWAStrip(cwaParsed, comparison);
        } else {
            cwaEl && (cwaEl.innerHTML = '<div class="cwa-error">📡 CWA 龍洞浮標暫時連不上 (預報仍可用, 觀測對照跳過)</div>');
        }

        // 點擊 row 互動 (展開細節)
        gridEl.querySelectorAll('.fg-row').forEach(row => {
            row.addEventListener('click', e => {
                row.classList.toggle('fg-row-open');
            });
        });

        // 點擊「最佳時段」的週末 ✓ cell → 滾動到對應的週末卡
        gridEl.querySelectorAll('.fg-best-cell-clickable').forEach(cell => {
            cell.addEventListener('click', e => {
                e.stopPropagation();
                const wday = cell.getAttribute('data-wday');
                // wday 6 = Sat, 0 = Sun; 第一個 .ww-day-card 是 Sat, 第二個是 Sun
                const idx = wday === '0' ? 1 : 0;
                const target = document.querySelectorAll('.ww-day-card')[idx];
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('ww-day-card-flash');
                    setTimeout(() => target.classList.remove('ww-day-card-flash'), 1500);
                }
            });
        });
    } catch (err) {
        console.error('diving-forecast load fail:', err);
        if (weekendEl) weekendEl.innerHTML = '<div class="ww-error">⚠️ 預報載入失敗 — Open-Meteo 暫時不可用，回到 <a href="https://www.windguru.cz/464009" target="_blank">Windguru</a> 手動查看。</div>';
        if (gridEl)    gridEl.innerHTML    = '<div class="fg-error">⚠️ 預報載入失敗，請稍後重試或開 <a href="https://www.windguru.cz/464009" target="_blank">Windguru 464009</a> 手動查看。</div>';
    }
}

document.addEventListener('DOMContentLoaded', init);
