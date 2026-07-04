// 東北角 6 個潛點當下海況 — 在站點卡片底下顯示 mini 摘要
// 用 Open-Meteo current_weather + Marine current 端點, 6 站並行 fetch
// 失敗的站點降級顯示「無資料」, 不影響主預報區

const TZ = 'Asia%2FTaipei';

// 從站點卡片的 data-site-id 讀 sites 資料 (lat/lon 從 .site-tab 同步讀, 確保跟主預報一致)
function readSites() {
    const tabs = document.querySelectorAll('.site-tab');
    return Array.from(tabs).map(b => ({
        id:       b.getAttribute('data-site-id'),
        name:     b.getAttribute('data-site-name'),
        lat:      parseFloat(b.getAttribute('data-site-lat')),
        lon:      parseFloat(b.getAttribute('data-site-lon')),
        buoyMID:  b.getAttribute('data-site-buoy') || null,
    })).filter(s => s.id && !isNaN(s.lat) && !isNaN(s.lon));
}

// ──────────── 顏色分級 (跟 diving-forecast.js 對齊) ────────────
function colorWind(ms) {
    if (ms == null) return '#3a3f4b';
    if (ms < 2.5)  return '#1a4d2e';
    if (ms < 5)    return '#3fb950';
    if (ms < 8)    return '#d29922';
    if (ms < 11)   return '#db6d28';
    return '#f85149';
}
function colorWave(m) {
    if (m == null) return '#3a3f4b';
    if (m < 0.6)  return '#1a4d2e';
    if (m < 1.0)  return '#3fb950';
    if (m < 1.4)  return '#d29922';
    if (m < 1.8)  return '#db6d28';
    return '#f85149';
}
function colorTemp(c) {
    if (c == null) return '#3a3f4b';
    if (c < 20)   return '#f85149';
    if (c < 24)   return '#58a6c4';
    if (c <= 28)  return '#3fb950';
    if (c <= 30)  return '#d29922';
    return '#db6d28';
}
function arrowFor(deg) {
    if (deg == null) return '·';
    const arr = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    return arr[Math.round(((deg % 360) / 45)) % 8];
}
const DIR_NAMES_8 = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
function dirName8(deg) {
    if (deg == null) return '?';
    return DIR_NAMES_8[Math.round(((deg % 360) / 45)) % 8];
}

// 龍洞口朝東, 通用龍洞判讀; 其他站點用通用 classifyWindDirForSite
function classifyWindDir(deg, siteId) {
    if (deg == null) return 'unknown';
    if (siteId === 'longdong') {
        if (deg >= 60 && deg <= 130)  return 'onshore';
        if (deg >= 240 && deg <= 300) return 'offshore';
        return 'cross-shore';
    }
    // 其他站點保守判定: 東北角主流潛點多朝東/東北, 暫用寬鬆標準
    if (deg >= 50 && deg <= 140)  return 'onshore';
    if (deg >= 230 && deg <= 310) return 'offshore';
    return 'cross-shore';
}

function txtOnWind(v) {
    if (v == null) return '#aaa';
    return v < 5 ? '#0d1d10' : '#fff';
}

function verdictBadge(v) {
    if (v === 'go')      return '<span class="mini-verdict go">🟢 GO</span>';
    if (v === 'caution') return '<span class="mini-verdict caution">🟡 小心</span>';
    if (v === 'nogo')    return '<span class="mini-verdict nogo">🔴 NO-GO</span>';
    return '<span class="mini-verdict unknown">—</span>';
}

// 對單站點抓當下海況
async function fetchCurrent(spot) {
    const weatherURL =
        `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}` +
        `&current_weather=true&windspeed_unit=ms&timezone=${TZ}`;
    const marineURL =
        `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}` +
        `&current=wave_height,wave_period,sea_surface_temperature&timezone=${TZ}`;
    const [wxR, marR] = await Promise.all([
        fetch(weatherURL).then(r => r.json()),
        fetch(marineURL).then(r => r.json()).catch(() => ({})),  // 海岸/內陸可能沒有 marine
    ]);
    const cw = wxR.current_weather;
    const mc = marR.current || {};
    return {
        windMs:  cw?.windspeed ?? null,
        windDeg: cw?.winddirection ?? null,
        tempC:   cw?.temperature ?? null,
        waveM:   mc.wave_height ?? null,
        wavePer: mc.wave_period ?? null,
        sstC:    mc.sea_surface_temperature ?? null,
        ts:      cw?.time || null,
    };
}

// 計算 verdict (跟主預報對齊)
function calcVerdict(cur) {
    if (cur.windMs == null && cur.waveM == null) return 'unknown';
    let worst = 'go';
    const rank = { go: 0, caution: 1, nogo: 2 };
    const set = (l) => { if (rank[l] > rank[worst]) worst = l; };
    if (cur.waveM != null) {
        if (cur.waveM < 0.6) set('go');
        else if (cur.waveM < 1.2) set('caution');
        else set('nogo');
    }
    if (cur.windMs != null) {
        if (cur.windMs < 5) set('go');
        else if (cur.windMs < 8) set('caution');
        else set('nogo');
    }
    return worst;
}

function renderMini(site, cur) {
    const el = document.querySelector(`[data-site-mini-id="${site.id}"]`);
    if (!el) return;
    const verdict = calcVerdict(cur);
    const dirCls  = classifyWindDir(cur.windDeg, site.id);
    const dirEmoji = { onshore: '✅', 'cross-shore': '⚠️', offshore: '❌', unknown: '·' }[dirCls];
    el.innerHTML = `
        <div class="site-mini-head">
            <span class="site-mini-label">當下海況</span>
            ${verdictBadge(verdict)}
        </div>
        <div class="site-mini-grid">
            <div class="mini-cell" style="background:${colorWind(cur.windMs)};color:${txtOnWind(cur.windMs)}">
                <div class="mini-cell-label">風速</div>
                <div class="mini-cell-val">${cur.windMs != null ? cur.windMs.toFixed(1) : '—'}<span class="mini-cell-unit">m/s</span></div>
            </div>
            <div class="mini-cell" style="background:${colorWave(cur.waveM)};color:${txtOnWind(cur.waveM)}">
                <div class="mini-cell-label">浪高</div>
                <div class="mini-cell-val">${cur.waveM != null ? cur.waveM.toFixed(2) : '—'}<span class="mini-cell-unit">m</span></div>
            </div>
            <div class="mini-cell" style="background:${colorTemp(cur.sstC ?? cur.tempC)};color:${txtOnWind(cur.sstC ?? cur.tempC)}">
                <div class="mini-cell-label">水溫</div>
                <div class="mini-cell-val">${(cur.sstC ?? cur.tempC) != null ? (cur.sstC ?? cur.tempC).toFixed(0) : '—'}<span class="mini-cell-unit">°C</span></div>
            </div>
            <div class="mini-cell mini-cell-dir" title="${dirEmoji} ${dirCls}">
                <div class="mini-cell-label">風向</div>
                <div class="mini-cell-val">
                    <span class="mini-arrow">${arrowFor(cur.windDeg)}</span>
                    <span class="mini-dir-name">${dirName8(cur.windDeg)}</span>
                    <span class="mini-dir-deg">${cur.windDeg != null ? Math.round(cur.windDeg) : '—'}°</span>
                </div>
            </div>
        </div>
        <div class="site-mini-foot">
            <span class="mini-foot-item">${dirEmoji} ${({onshore:'迎岸',offshore:'離岸','cross-shore':'沿岸',unknown:'?'})[dirCls]}</span>
            <span class="mini-foot-ts">${cur.ts ? new Date(cur.ts).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit' }) : ''}</span>
        </div>
    `;
    el.classList.remove('site-mini-loading');
}

function renderError(site, errMsg) {
    const el = document.querySelector(`[data-site-mini-id="${site.id}"]`);
    if (!el) return;
    el.innerHTML = `
        <div class="site-mini-head">
            <span class="site-mini-label">當下海況</span>
            <span class="mini-verdict unknown">連不上</span>
        </div>
        <div class="site-mini-error">⚠️ Open-Meteo 暫時取不到資料 (${errMsg.slice(0, 60)})</div>
    `;
    el.classList.add('site-mini-error-wrap');
}

async function init() {
    const sites = readSites();
    if (!sites.length) return;

    // 6 站並行 fetch — 任一站失敗不影響其他
    await Promise.all(sites.map(async (site) => {
        try {
            const cur = await fetchCurrent(site);
            renderMini(site, cur);
        } catch (err) {
            console.warn(`[sites-conditions] ${site.id} fetch fail:`, err.message);
            renderError(site, err.message || 'unknown');
        }
    }));
}

document.addEventListener('DOMContentLoaded', init);