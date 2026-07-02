/* ╔══════════════════════════════════════════════════════════════╗
   ║  🤿 CWA Loader — 抓中央氣象署浮標即時觀測                    ║
   ║                                                              ║
   ║  策略:<script> 載入後讀取全域變數 Data_Array_48hr             ║
   ║       CWA 的 JS 設了 'application/javascript' Content-Type    ║
   ║       沒設 CORS,意味著設計上就是給同網域 <script> 載入         ║
   ║       我們用 CSP 繞道(donttalk 是 SPA,Astro static 沒 CSP)    ║
   ║                                                              ║
   ║  46694A = 龍洞資料浮標(離岸 0.26km,水深 26m)                  ║
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

  // 取 index 0(現在)的有效值,若無效往後找第一個
  const currentValue = (arr) => {
    if (!Array.isArray(arr)) return null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] !== '-' && arr[i] != null && !Number.isNaN(arr[i])) return arr[i];
    }
    return null;
  };

  /**
   * 載入 CWA 46694A 資料
   * @returns {Promise<{ok: boolean, data?: object, error?: string, source?: string}>}
   */
  function loadCWA(stationId = '46694A') {
    return new Promise((resolve) => {
      const url = `https://www.cwa.gov.tw/Data/js/marine/48hr_plot/ChartData_48hr_${stationId}.js?t=${Date.now()}`;

      // 載入後用 onload 讀全域變數
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.crossOrigin = 'anonymous';  // 嘗試帶 credential-free

      script.onload = () => {
        cleanup();
        const raw = window.Data_Array_48hr;
        if (raw && typeof raw === 'object') {
          resolve({ ok: true, data: normalize(raw, stationId), source: url });
        } else {
          resolve({ ok: false, error: 'Data_Array_48hr not found after load', source: url });
        }
      };

      script.onerror = (e) => {
        cleanup();
        resolve({ ok: false, error: `Script load failed (likely CORS). CWA only serves same-origin scripts. Use a proxy. [${e?.type || ''}]`, source: url });
      };

      // 8 秒 timeout
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ok: false, error: 'CWA load timeout', source: url });
      }, 8000);

      function cleanup() {
        clearTimeout(timer);
        if (script.parentNode) script.parentNode.removeChild(script);
        // 清掉汙染的全域變數,免得汙染頁面
        try { delete window.Data_Array_48hr; } catch (_) { window.Data_Array_48hr = undefined; }
      }

      document.head.appendChild(script);
    });
  }

  /**
   * 從 raw JSON 物件載入(當 proxy 已經幫我們抓到資料時用)
   */
  function loadFromJSON(raw, stationId = '46694A') {
    return normalize(raw, stationId);
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
  window.CWALoader = { load: loadCWA, loadFromJSON, normalize, CARDINAL_DEG };
})();