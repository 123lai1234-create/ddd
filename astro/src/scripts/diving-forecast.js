// 東北角多潛點即時/預報資料 — Open-Meteo Marine + Weather API
// 站點列表由 diving.astro 的 <button data-site-id=...> 提供
// 龍洞和美 lat=25.1133, lon=121.9199 — Windguru spot #464009 對應座標
// Marine model = WAVEWATCH III + ECMWF; Weather model = GFS + ICON
// Reference: https://open-meteo.com/en/docs

const TZ = 'Asia%2FTaipei';

// ──────────── 站點資料（從 DOM 讀, 確保單一來源是 diving.astro） ────────────
function readSitesFromDOM() {
    const btns = document.querySelectorAll('.site-tab');
    return Array.from(btns).map(b => ({
        id:       b.getAttribute('data-site-id'),
        name:     b.getAttribute('data-site-name'),
        lat:      parseFloat(b.getAttribute('data-site-lat')),
        lon:      parseFloat(b.getAttribute('data-site-lon')),
        buoyMID:  b.getAttribute('data-site-buoy') || null,
    })).filter(s => s.id && !isNaN(s.lat) && !isNaN(s.lon));
}

const SITES = readSitesFromDOM();

function getSite(id) {
    return SITES.find(s => s.id === id) || SITES[0];
}

// ──────────── 顏色分級 (Windguru 風格, 對齊 diving.astro 決策矩陣) ────────────
function colorWind(ms) {
    if (ms == null) return '#3a3f4b';
    if (ms < 2.5)  return '#1a4d2e';
    if (ms < 5)    return '#3fb950';
    if (ms < 8)    return '#d29922';
    if (ms < 11)   return '#db6d28';
    return '#f85149';
}
function txtOnWind(ms) {
    if (ms == null) return '#aaa';
    if (ms < 5) return '#0d1d10';
    return '#fff';
}
function colorWave(m) {
    if (m == null) return '#3a3f4b';
    if (m < 0.6)  return '#1a4d2e';
    if (m < 1.0)  return '#3fb950';
    if (m < 1.4)  return '#d29922';
    if (m < 1.8)  return '#db6d28';
    return '#f85149';
}
function colorPeriod(s) {
    if (s == null) return '#3a3f4b';
    if (s < 5)     return '#f85149';
    if (s < 7)     return '#db6d28';
    if (s < 9)     return '#d29922';
    if (s < 12)    return '#3fb950';
    return '#1a4d2e';
}
function colorTemp(c) {
    if (c == null) return '#3a3f4b';
    if (c < 20)   return '#f85149';
    if (c < 24)   return '#58a6c4';
    if (c <= 28)  return '#3fb950';
    if (c <= 30)  return '#d29922';
    return '#db6d28';
}

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

// 風向分級: 通用版本 (對「該潛點的口朝某個方向」)
//   參數 siteExposeDeg: 該潛點入口/主要面對的角度 (0-360, 北為 0)
//   迎岸 = 風從海吹來 (風向 deg 在 siteExposeDeg ± 35°)
//   離岸 = 風從陸吹來 (風向 deg 在 siteExposeDeg+180° ± 35°)
function classifyWindDirForSite(deg, siteExposeDeg) {
    if (deg == null || siteExposeDeg == null) return 'unknown';
    const norm = (a) => ((a % 360) + 360) % 360;
    const d = norm(deg);
    const exp = norm(siteExposeDeg);
    const delta = Math.min(Math.abs(d - exp), 360 - Math.abs(d - exp));
    const oppDelta = Math.min(Math.abs(d - (exp + 180)), 360 - Math.abs(d - (exp + 180)));
    if (delta <= 35) return 'onshore';        // 風從海面吹向陸 (deg 跟 expose 一致)
    if (oppDelta <= 35) return 'offshore';    // 風從陸吹向海 (deg 跟 expose+180 一致)
    return 'cross-shore';
}

// 龍洞口朝東 (90°), 維持原本龍洞專屬邏輯
function classifyWindDir(deg) {
    if (deg == null) return 'unknown';
    if (deg >= 60 && deg <= 130)  return 'onshore';
    if (deg >= 240 && deg <= 300) return 'offshore';
    return 'cross-shore';
}

function dirLabel(cls) {
    return { onshore: '迎岸', offshore: '離岸', 'cross-shore': '沿岸', unknown: '?' }[cls];
}

// ──────────── Open-Meteo fetch ────────────
async function fetchOpenMeteo(spot) {
    const marineURL =
        `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}` +
        `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature&forecast_days=10&timezone=${TZ}`;
    const weatherURL =
        `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
        `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation,cloud_cover` +
        `&forecast_days=10&timezone=${TZ}&wind_speed_unit=ms`;
    const [marR, wxR] = await Promise.all([
        fetch(marineURL).then(r => r.json()),
        fetch(weatherURL).then(r => r.json()),
    ]);
    if (!marR.hourly || !wxR.hourly) {
        throw new Error('Open-Meteo 回傳結構異常');
    }
    const times = wxR.hourly.time;
    const out = [];
    for (let i = 0; i < times.length; i++) {
        out.push({
            siteId: spot.id,
            t: times[i],
            date: new Date(times[i]),
            hour: new Date(times[i]).getHours(),
            windMs:  wxR.hourly.wind_speed_10m[i],
            gustMs:  wxR.hourly.wind_gusts_10m[i],
            windDeg: wxR.hourly.wind_direction_10m[i],
            tempC:   wxR.hourly.temperature_2m[i],
            precip:  wxR.hourly.precipitation[i],
            cloud:   wxR.hourly.cloud_cover[i],
            waveM:   marR.hourly.wave_height[i],
            wavePer: marR.hourly.wave_period[i],
            waveDir: marR.hourly.wave_direction[i],
            sstC:    marR.hourly.sea_surface_temperature?.[i],
        });
    }
    return out;
}

// ──────────── CWA 浮標 (僅有 buoyMID 的站點載入) ────────────
// CWA 不開 CORS — 用 <script> tag injection
let _cwaLoading = null;
function loadCWA(mid) {
    if (_cwaLoading && _cwaLoading.mid === mid) return _cwaLoading.promise;
    const url = `https://www.cwa.gov.tw/Data/js/marine/48hr_plot/ChartData_48hr_${mid}.js`;
    const promise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url + '?t=' + Date.now();
        let settled = false;
        const cleanup = () => { try { s.remove(); } catch {} };
        const globalName = 'Data_Array_48hr';
        s.onload = () => {
            settled = true;
            cleanup();
            const data = window[globalName];
            try { delete window[globalName]; } catch {}
            if (!data || !data.time) {
                reject(new Error(`CWA ${mid}: ${globalName} 缺失`));
                return;
            }
            resolve(data);
        };
        s.onerror = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`CWA ${mid} script load fail`));
        };
        document.head.appendChild(s);
        setTimeout(() => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`CWA ${mid}: timeout 15s`));
        }, 15000);
    });
    _cwaLoading = { mid, promise };
    return promise;
}

function parseCWA(data) {
    const siteName = data.name?.C || data.name?.E || 'CWA 浮標';
    const station = data.name?.E || 'Buoy';
    const updTxt = data.Time_Interval?.[0] || '';
    const numify = (v) => {
        if (v === undefined || v === null || v === '-') return null;
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
    };
    const waveH = data.waveHeight || [];
    const waveP = data.wavePeriod || [];
    const windMS = data.windSpeed?.MS || [];
    const seaTemp = data.seaTemperature?.C || [];
    const pressure = data.stationPressure || [];
    const windDeg = (data.windSpeed2?.MS || []).map(p => {
        if (p == null) return null;
        const m = p.marker?.symbol?.match(/wind_icon\/([A-Z]+)\.gif/);
        if (!m) return null;
        return windDirFromCode(m[1]);
    });
    const samples = [];
    for (let i = 0; i < (data.time?.length ?? 0); i++) {
        const utcMs = data.time[i];
        samples.push({
            t: new Date(utcMs).toISOString(),
            date: new Date(utcMs),
            hour: new Date(utcMs).getHours(),
            source: 'cwa',
            waveM: numify(waveH[i]),
            wavePer: numify(waveP[i]),
            windMs: numify(windMS[i]),
            windDeg: windDeg[i],
            tempC: numify(seaTemp[i]),
            sstC: numify(seaTemp[i]),
            pressure: numify(pressure[i]),
        });
    }
    return { siteName, station, updTxt, samples };
}

function windDirFromCode(code) {
    const dirMap = {
        N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
        E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
        S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
        W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
    };
    return dirMap[code] ?? null;
}

function compareCWA(cwaSamples, omSamples) {
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
    let worst = 'go';
    const rank = { go: 0, caution: 1, nogo: 2 };
    for (const p of pairs) {
        for (const c of [p.waveCls, p.windCls, p.tempCls]) {
            if (rank[c] > rank[worst]) worst = c;
        }
    }
    return { pairs, verdict: worst };
}

function cwaCompareSparkline(pairs) {
    if (!pairs.length) return '';
    const W = 700, H = 130, PAD_L = 38, PAD_R = 12, PAD_T = 8, PAD_B = 22;
    const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
    const bandH = innerH / 3;
    const bands = [
        { name: 'wave', max: 2.0, unit: 'm', desc: '浪高' },
        { name: 'wind', max: 12,  unit: 'm/s', desc: '風速' },
        { name: 'temp', min: 18, max: 32, unit: '°C', desc: '水溫' },
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
            return yBot - t * inner - 2;
        }
        const t = Math.max(0, Math.min(b.max, v)) / b.max;
        return yBot - t * inner - 2;
    }
    const recent = pairs.slice(-6);
    const x = (i) => PAD_L + (i / Math.max(1, recent.length - 1)) * innerW;
    const series = [
        { field: 'waveDelta', yName: 'wave', obs: '#58d7ff', label: '浪高' },
        { field: 'windDelta', yName: 'wind', obs: '#d29922', label: '風速' },
        { field: 'tempDelta', yName: 'temp', obs: '#3fb950', label: '水溫' },
    ];
    const dividers = [1, 2].map(i => {
        const y = PAD_T + i * bandH;
        return `<line x1="${PAD_L}" y1="${y.toFixed(1)}" x2="${W - PAD_R}" y2="${y.toFixed(1)}" stroke="rgba(120,180,255,0.18)" stroke-dasharray="3 3"/>`;
    }).join('');
    const lines = series.flatMap(s => {
        const obs = recent.map((p, i) => p[s.field]?.obs).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY(s.yName, v).toFixed(1)}` : '').filter(Boolean).join(' ');
        const fcst = recent.map((p, i) => p[s.field]?.fcst).map((v, i) => v != null ? `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${bandY(s.yName, v).toFixed(1)}` : '').filter(Boolean).join(' ');
        return [
            obs ? `<path d="${obs}" fill="none" stroke="${s.obs}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>` : '',
            fcst ? `<path d="${fcst}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.3" stroke-dasharray="3 2"/>` : '',
        ];
    }).join('');
    const xLabels = recent.map((p, i) => {
        const hh = String(p.date.getHours()).padStart(2, '0');
        return i % 2 === 0
            ? `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8b949e" font-family="JetBrains Mono, monospace">${hh}</text>`
            : '';
    }).join('');
    const yLabels = bands.map((b, i) => {
        const y = PAD_T + i * bandH + 10;
        const label = b.name === 'temp' ? `${b.min}–${b.max}${b.unit}` : `${b.max}${b.unit}`;
        return `<text x="${PAD_L - 4}" y="${y}" text-anchor="end" font-size="9" fill="#8b949e">${label}</text>`;
    }).join('');
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

function renderCWAStrip(cwaParsed, comparison, site) {
    const el = document.getElementById('cwa-strip');
    if (!el) return;
    if (!cwaParsed || !comparison || !comparison.pairs.length) {
        el.innerHTML = `<div class="cwa-empty">📡 ${site.name} 沒有對應 CWA 浮標觀測 (岸潛浮標只覆蓋龍洞, 龜山島等船潛點改看 Open-Meteo 預報)。</div>`;
        return;
    }
    const { siteName, station, updTxt, samples: cwaSamples } = cwaParsed;
    const { pairs, verdict } = comparison;
    const latest = [...cwaSamples].reverse().find(s => s.waveM != null || s.windMs != null);
    const verdictBadge = verdict === 'go'
        ? '<span class="cwa-badge go">🟢 預報與實況一致</span>'
        : verdict === 'caution'
        ? '<span class="cwa-badge caution">🟡 預報有偏差</span>'
        : '<span class="cwa-badge nogo">🔴 預報不準, 改參考實況</span>';
    const recent = pairs.slice(-6);
    const fmtHour = (d) => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
    el.innerHTML = `
        <div class="cwa-head">
            <div class="cwa-head-l">
                <div class="cwa-station">📡 ${siteName} · ${site.name}</div>
                <div class="cwa-station-en">${station} (MID ${site.buoyMID})</div>
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
            <a href="https://www.cwa.gov.tw/V8/C/M/OBS_Marine_plot.html?MID=${site.buoyMID}" target="_blank" rel="noopener">📊 在 CWA 官網看完整 48hr 時序圖 ↗</a>
            <span>資料: 中央氣象署 ${site.name} 浮標 (MID ${site.buoyMID}) · Open-Meteo Marine ECMWF + GFS</span>
        </div>
    `;
}

function deltaBg(cls) {
    return cls === 'go' ? '#1a4d2e' : cls === 'caution' ? '#d29922' : cls === 'nogo' ? '#f85149' : '#1a1f2e';
}
function deltaTxt(cls) {
    return cls === 'go' ? '#0d1d10' : '#fff';
}

// ──────────── 決策邏輯 (對齊 diving.astro 決策矩陣) ────────────
function scoreRow(s) {
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
    const morning = samples.filter(s => s.hour >= 6 && s.hour <= 12);
    if (morning.length === 0) return null;
    const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
    const verdict = morning.reduce((acc, s) => {
        const r = scoreRow(s);
        return rank[r] > rank[acc] ? r : acc;
    }, 'go');
    const bestHour = morning.reduce((best, s) => {
        if (rank[scoreRow(s)] < rank[scoreRow(best)]) return s;
        return best;
    }, morning[0]);
    let site, tip;
    if (verdict === 'go') {
        site = '🥇 條件達標';
        tip = '全部綠燈 — 帶愉快心情下水';
    } else if (verdict === 'caution') {
        const hasOffshore = morning.some(s => classifyWindDir(s.windDeg) === 'offshore');
        site = hasOffshore ? '🥈 換遮蔽點 (潮境/和平島)' : '🥈 評估後可下';
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

// ──────────── 24h sparkline ────────────
function sparkline24h(daySamples, bestHour) {
    const W = 280, H = 48, PAD = 4;
    const points = [];
    for (let h = 0; h < 24; h++) {
        const s = daySamples.find(x => x.hour === h);
        const score = s ? scoreRow(s) : null;
        const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
        points.push({ h, s, score, y: score == null ? null : rank[score] });
    }
    const innerW = W - PAD * 2, innerH = H - PAD * 2;
    const x = (h) => PAD + (h / 23) * innerW;
    const y = (rank) => PAD + (rank / 2) * innerH;
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
    const segs = [];
    for (let i = 0; i < points.length; i++) {
        if (points[i].y == null) continue;
        segs.push(`${i === 0 || points[i - 1].y == null ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(points[i].y).toFixed(1)}`);
    }
    const path = segs.join(' ');
    const dots = points.filter(p => p.y != null).map(p => {
        const color = p.score === 'go' ? '#3fb950' : p.score === 'caution' ? '#d29922' : '#f85149';
        return `<circle cx="${x(p.h).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="1.8" fill="${color}"/>`;
    }).join('');
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

// ──────────── Wind rose (7-day 8 方位) ────────────
const WIND_DIR_NAMES = ['北', '北東北', '東北', '東東北', '東', '東東南', '東南', '南東南', '南', '南西南', '西南', '西西南', '西', '西西北', '西北', '北西北'];
function windDirName(deg) {
    if (deg == null) return '?';
    return WIND_DIR_NAMES[Math.round(((deg % 360) / 22.5)) % 16];
}

function renderWindRose(samples) {
    const petalsEl  = document.getElementById('windrose-petals');
    const ringsEl   = document.getElementById('windrose-rings');
    const labelsEl  = document.getElementById('windrose-labels');
    if (!petalsEl || !ringsEl || !labelsEl) return;
    const bins = new Array(8).fill(0);
    let maxCount = 0;
    for (const s of samples) {
        if (s.windDeg == null) continue;
        const idx = Math.round(((s.windDeg % 360) / 45)) % 8;
        bins[idx]++;
        if (bins[idx] > maxCount) maxCount = bins[idx];
    }
    const R = 50;
    const labels8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const fillByBin = [
        'rgba(210,153,34,0.55)', 'rgba(63,185,80,0.45)', 'rgba(63,185,80,0.65)',
        'rgba(210,153,34,0.55)', 'rgba(210,153,34,0.55)', 'rgba(248,81,73,0.45)',
        'rgba(248,81,73,0.65)', 'rgba(248,81,73,0.45)',
    ];
    const strokeByBin = ['#d29922', '#3fb950', '#3fb950', '#d29922', '#d29922', '#f85149', '#f85149', '#f85149'];
    ringsEl.innerHTML = [0.25, 0.5, 0.75].map(f => {
        const r = R * f;
        return `<circle cx="0" cy="0" r="${r}" fill="none" stroke="rgba(120,180,255,0.18)" stroke-width="0.5" stroke-dasharray="1 2"/>`;
    }).join('');
    petalsEl.innerHTML = bins.map((count, i) => {
        if (count === 0) return '';
        const angle = i * 45;
        const a1 = (angle - 22.5) * Math.PI / 180;
        const a2 = (angle + 22.5) * Math.PI / 180;
        const outerR = Math.max(4, (count / Math.max(1, maxCount)) * R);
        const innerR = 5;
        const x1o = outerR * Math.sin(a1), y1o = -outerR * Math.cos(a1);
        const x2o = outerR * Math.sin(a2), y2o = -outerR * Math.cos(a2);
        const x1i = innerR * Math.sin(a1), y1i = -innerR * Math.cos(a1);
        const x2i = innerR * Math.sin(a2), y2i = -innerR * Math.cos(a2);
        const largeArc = 0;
        const d = `M ${x1o.toFixed(1)} ${y1o.toFixed(1)} A ${outerR.toFixed(1)} ${outerR.toFixed(1)} 0 ${largeArc} 1 ${x2o.toFixed(1)} ${y2o.toFixed(1)} L ${x2i.toFixed(1)} ${y2i.toFixed(1)} A ${innerR.toFixed(1)} ${innerR.toFixed(1)} 0 ${largeArc} 0 ${x1i.toFixed(1)} ${y1i.toFixed(1)} Z`;
        return `<path class="windrose-petal" d="${d}" fill="${fillByBin[i]}" stroke="${strokeByBin[i]}" stroke-width="0.8" stroke-linejoin="round"><title>${labels8[i]} · ${count} 小時</title></path>`;
    }).join('');
    const labelR = R + 10;
    labelsEl.innerHTML = labels8.map((lbl, i) => {
        const a = i * 45 * Math.PI / 180;
        const x = labelR * Math.sin(a);
        const y = -labelR * Math.cos(a);
        return `<text x="${x.toFixed(1)}" y="${(y + 2.5).toFixed(1)}" text-anchor="middle" font-size="7" fill="#8b949e" font-family="'JetBrains Mono', monospace">${lbl}</text>`;
    }).join('');
}

function renderLiveCompass(samples) {
    const el = document.getElementById('compass-live');
    const arrow = document.getElementById('compass-live-arrow');
    const label = document.getElementById('compass-live-label');
    if (!el || !arrow || !label) return;
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
    arrow.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
    label.setAttribute('transform', `rotate(${deg.toFixed(1)})`);
    const txt = label.querySelector('text');
    if (txt) txt.textContent = `${ms.toFixed(1)} m/s`;
    const cap = document.getElementById('compass-current');
    if (cap) {
        const val = cap.querySelector('.compass-current-val');
        const dir = cap.querySelector('.compass-current-dir');
        if (val) val.textContent = `${ms.toFixed(1)} m/s`;
        if (dir) dir.textContent = `${windDirName(deg)} ${Math.round(deg)}°`;
    }
}

// ──────────── 7 日逐時 grid ────────────
function renderHourlyGrid(samples, opts = {}) {
    const container = document.getElementById('forecast-grid');
    if (!container) return;
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
        days.push({ date: dayDate, samples: daySamples });
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
    const WIND_MAX = 15;
    const GUST_MAX = 25;
    const WAVE_MAX = 2.5;
    const PER_MAX = 14;
    const TEMP_MAX_HI = 32;
    const PRECIP_MAX = 5;
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
    function bestHourRow() {
        const rank = { 'go': 0, 'caution': 1, 'nogo': 2 };
        const satDayIdx = days.findIndex(d => d.date.getDay() === 6);
        const sunDayIdx = days.findIndex(d => d.date.getDay() === 0);
        const cells = days.flatMap((d, dayIdx) => {
            if (!d.samples.length) {
                return hours.map(() => `<td class="fg-cell fg-na" colspan="1">—</td>`).slice(0, hours.length);
            }
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
            <span>座標: ${getCurrentSite().lat}°N, ${getCurrentSite().lon}°E · ${getCurrentSite().name}</span>
        </div>
    `;
}

function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + (b ?? 0), 0) / arr.filter(v => v != null).length;
}

// ──────────── State + 站點切換 ────────────
let currentSiteId = 'longdong';
let currentSamples = [];
let currentCwaData = null;
let isFetching = false;

function getCurrentSite() {
    return getSite(currentSiteId);
}

function setActiveTab(siteId) {
    document.querySelectorAll('.site-tab').forEach(b => {
        const isActive = b.getAttribute('data-site-id') === siteId;
        b.classList.toggle('is-active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    // 同步 site-card 上的 highlight
    document.querySelectorAll('.site-card').forEach(card => {
        const isActive = card.getAttribute('data-site-id') === siteId;
        card.classList.toggle('is-current', isActive);
    });
}

async function loadForSite(siteId) {
    if (isFetching) return;
    isFetching = true;
    currentSiteId = siteId;
    const site = getSite(siteId);
    setActiveTab(siteId);

    const weekendEl = document.getElementById('weekend-rec');
    const gridEl    = document.getElementById('forecast-grid');
    const cwaEl     = document.getElementById('cwa-strip');
    weekendEl && (weekendEl.innerHTML = '<div class="ww-loader">載入 Open-Meteo 預報中…</div>');
    gridEl    && (gridEl.innerHTML = '<div class="fg-loader">載入中…</div>');

    try {
        currentSamples = await fetchOpenMeteo(site);

        renderWeekendCards(currentSamples);
        renderHourlyGrid(currentSamples);
        renderLiveCompass(currentSamples);
        renderWindRose(currentSamples);

        // CWA 只有 buoyMID 的站點才載
        if (site.buoyMID) {
            try {
                currentCwaData = await loadCWA(site.buoyMID);
                const cwaParsed = parseCWA(currentCwaData);
                const comparison = compareCWA(cwaParsed.samples, currentSamples);
                renderCWAStrip(cwaParsed, comparison, site);
            } catch (err) {
                console.warn(`CWA ${site.buoyMID} load fail (non-fatal):`, err.message);
                cwaEl && (cwaEl.innerHTML = `<div class="cwa-error">📡 CWA 浮標 (${site.buoyMID}) 暫時連不上 (預報仍可用, 觀測對照跳過)</div>`);
            }
        } else {
            cwaEl && (cwaEl.innerHTML = `<div class="cwa-info">ℹ️ ${site.name} 沒有對應 CWA 浮標 — 岸潛浮標只覆蓋龍洞, 預報仍可用。</div>`);
        }

        // grid 互動
        gridEl.querySelectorAll('.fg-row').forEach(row => {
            row.addEventListener('click', e => {
                row.classList.toggle('fg-row-open');
            });
        });
        gridEl.querySelectorAll('.fg-best-cell-clickable').forEach(cell => {
            cell.addEventListener('click', e => {
                e.stopPropagation();
                const wday = cell.getAttribute('data-wday');
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
        console.error('forecast load fail:', err);
        if (weekendEl) weekendEl.innerHTML = `<div class="ww-error">⚠️ 預報載入失敗 — Open-Meteo 暫時不可用, 回到 <a href="https://www.windguru.cz/464009" target="_blank">Windguru</a> 手動查看。</div>`;
        if (gridEl)    gridEl.innerHTML    = `<div class="fg-error">⚠️ 預報載入失敗, 請稍後重試。</div>`;
    } finally {
        isFetching = false;
    }
}

function bindTabs() {
    document.querySelectorAll('.site-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-site-id');
            if (!id || id === currentSiteId) return;
            // 更新 URL hash (不滾動)
            history.replaceState(null, '', `#${id}`);
            loadForSite(id);
        });
    });
}

function initFromHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash && getSite(hash)) {
        currentSiteId = hash;
    }
}

// ──────────── Init ────────────
async function init() {
    if (!SITES.length) {
        console.error('diving-forecast: 找不到任何 site-tab, 頁面結構可能不對');
        return;
    }
    initFromHash();
    bindTabs();
    await loadForSite(currentSiteId);
}

document.addEventListener('DOMContentLoaded', init);