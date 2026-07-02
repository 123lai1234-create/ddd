/* ╔══════════════════════════════════════════════════════════════╗
   ║  🤿 CWA Loader — 抓中央氣象署浮標即時觀測                    ║
   ║                                                              ║
   ║  純前端 <script> 載入(免 API key、免 server proxy)            ║
   ║                                                              ║
   ║  為什麼用 <script> 而不是 fetch:                              ║
   ║    CWA 的 ChartData_48hr_*.js 沒回 Access-Control-Allow-Origin ║
   ║    瀏覽器 fetch 會被 CORS 擋。但 <script src=跨網域> 不受 CORS  ║
   ║    限制,只要 server 回 Content-Type: application/javascript   ║
   ║    瀏覽器就會執行。CWA 確實回 application/javascript ✓        ║
   ║                                                              ║
   ║  46694A = 龍洞資料浮標(離岸 0.26km,水深 26m)                  ║
   ║                                                              ║
   ║  Data_Array_48hr 結構:                                        ║
   ║    • waveHeight[]      49 點(浪高 m)                         ║
   ║    • wavePeriod[]      49 點(週期 s)                         ║
   ║    • windSpeed.MS[]    49 點(風速 m/s)                       ║
   ║    • windSpeed2.MS[]   49 點含風向 marker(URL 結尾 NNE.gif 等) ║
   ║    • seaTemperature.C  49 點(水溫 °C)                        ║
   ║    • temperature.C     49 點(氣溫 °C)                        ║
   ║    • stationPressure[] 49 點(hPa)                            ║
   ║    • tideHeight[]      全 -(此浮標無潮位計)                   ║
   ║    • currentSpeedms[]  全 -(此浮標無流速計)                   ║
   ║                                                              ║
   ║  資料更新:CWA 每小時更新一次                                   ║
   ╚══════════════════════════════════════════════════════════════╝ */

(function () {
  'use strict';

  // 風向 marker URL → 方位字母
  // e.g. .../wind_icon/NNE.gif → 'NNE'
  const DIR_FROM_URL = (url) => {
    const m = String(url || '').match(/\/([A-Z]{1,3})\.gif/);
    return m ? m[1] : null;
  };

  // 方位 → 度數
  const CARDINAL_DEG = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5
  };

  // 取第一個有效值(跳過 '-' 和 null/undefined)
  const currentValue = (arr) => {
    if (!Array.isArray(arr)) return null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== '-' && arr[i] != null && !Number.isNaN(arr[i])) return arr[i];
    }
    return null;
  };

  /**
   * 載入 CWA 46694A 資料(純前端 <script> tag 注入)
   * @param {string} stationId 預設 '46694A' = 龍洞資料浮標
   * @returns {Promise<{ok: boolean, data?: object, error?: string, source?: string}>}
   */
  function loadCWA(stationId = '46694A') {
    return new Promise((resolve) => {
      const url = `https://www.cwa.gov.tw/Data/js/marine/48hr_plot/ChartData_48hr_${stationId}.js?t=${Date.now()}`;

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      // 注意:不加 crossOrigin — CWA 沒 ACAO header,加了反而會 fail
      // 用純 <script> 載入,瀏覽器不在乎來源網域

      script.onload = () => {
        cleanup();
        const raw = window.Data_Array_48hr;
        if (raw && typeof raw === 'object') {
          resolve({ ok: true, data: normalize(raw, stationId), source: url });
        } else {
          resolve({ ok: false, error: 'Data_Array_48hr not found after load', source: url });
        }
      };

      script.onerror = () => {
        cleanup();
        resolve({ ok: false, error: 'Script load failed (CWA rejected or network)', source: url });
      };

      // 8 秒 timeout
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: 'CWA load timeout', source: url });
      }, 8000);

      function cleanup() {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        // 清掉污染的全域变量,免得污染页面
        try { delete window.Data_Array_48hr; } catch (_) { window.Data_Array_48hr = undefined; }
      }

      document.head.appendChild(script);
    });
  }

  /**
   * 把 CWA 原始資料正規化成我們要的格式
   */
  function normalize(d, stationId) {
    const windNow = currentValue(d.windSpeed?.MS);
    const dirNow = (() => {
      if (!d.windSpeed2?.MS) return null;
      for (let i = 0; i < d.windSpeed2.MS.length; i++) {
        const item = d.windSpeed2.MS[i];
        if (item && typeof item === 'object') {
          const dir = DIR_FROM_URL(item.marker?.symbol);
          if (dir) return { code: dir, deg: CARDINAL_DEG[dir] };
        }
      }
      return null;
    })();

    return {
      station: {
        id: stationId,
        name: d.name?.C || stationId,
        nameEn: d.name?.E || ''
      },
      snapshot: {
        waveHeight: currentValue(d.waveHeight),
        wavePeriod: currentValue(d.wavePeriod),
        windSpeed: windNow,
        windDir: dirNow,
        seaTemp: currentValue(d.seaTemperature?.C),
        airTemp: currentValue(d.temperature?.C),
        pressure: currentValue(d.stationPressure),
        tide: null,       // 此浮標無潮位計
        current: null     // 此浮標無流速計
      },
      series: {
        // 49 點:index 0 約為「現在前 ~1h」,CWA 用過去 + 未來預報混合
        hours: Array.from({ length: (d.waveHeight || []).length }, (_, i) => i - 1),
        waveHeight: (d.waveHeight || []).map(v => v === '-' ? null : v),
        wavePeriod: (d.wavePeriod || []).map(v => v === '-' ? null : v),
        windSpeed: (d.windSpeed?.MS || []).map(v => v === '-' ? null : v),
        windDirCode: (d.windSpeed2?.MS || []).map(item => {
          if (typeof item !== 'object') return null;
          return DIR_FROM_URL(item.marker?.symbol);
        }),
        windDirDeg: (d.windSpeed2?.MS || []).map(item => {
          if (typeof item !== 'object') return null;
          const code = DIR_FROM_URL(item.marker?.symbol);
          return code ? CARDINAL_DEG[code] : null;
        }),
        seaTemp: (d.seaTemperature?.C || []).map(v => v === '-' ? null : v),
        airTemp: (d.temperature?.C || []).map(v => v === '-' ? null : v),
        pressure: (d.stationPressure || []).map(v => v === '-' ? null : v)
      },
      availability: d.status || {},
      range: d.Time_Interval?.[0] || null,
      fetchedAt: new Date().toISOString()
    };
  }

  // 對外 API
  window.CWALoader = { load: loadCWA, normalize, CARDINAL_DEG };
})();