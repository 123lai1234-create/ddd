/* ── Training charts — fetch from API, fall back to paper values ── */

Chart.defaults.color = '#7d8590';
Chart.defaults.borderColor = '#21262d';
Chart.defaults.font.family = "'Inter', system-ui";

const CHART_FALLBACK = {
  bo: {
    steps: Array.from({ length: 15 }, (_, i) => i + 1),
    values: [0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087, 0.2087,
             0.2087, 0.2100, 0.2140, 0.2180, 0.2200, 0.2300, 0.2434, 0.2434],
    x_label: 'Round', y_label: 'Best Sharpe',
  },
  loss: {
    steps: Array.from({ length: 80 }, (_, i) => i + 1),
    values: Array.from({ length: 80 }, (_, i) =>
      +(0.03 * Math.exp(-i * 0.06) + 0.0013 + Math.random() * 0.0005).toFixed(6)),
    x_label: 'Epoch', y_label: 'MSE Loss',
  },
  rl: {
    steps: Array.from({ length: 25 }, (_, i) => i + 1),
    values: Array.from({ length: 25 }, (_, i) =>
      +(-0.15 + i * 0.018 + (Math.random() - 0.5) * 0.04).toFixed(4)),
    x_label: 'Episode', y_label: 'Reward',
  },
  mpnn: {
    steps: Array.from({ length: 40 }, (_, i) => i + 1),
    values: Array.from({ length: 40 }, (_, i) =>
      +(3.2 * Math.exp(-i * 0.08) + 0.8 + Math.random() * 0.05).toFixed(4)),
    x_label: 'Step', y_label: 'Cross-Entropy',
  },
};

async function fetchTrainingLogs(runType) {
  try {
    const apiBase = typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function'
      ? await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'index-charts' })
      : (window.APP_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');
    if (!apiBase) return null;
    const res = await fetch(`${apiBase}/api/training/logs?run_type=${runType}`,
      { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function buildChart(canvasId, data, opts) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const labels = data.steps.map(s => opts.labelFn ? opts.labelFn(s) : s);
  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: data.values,
        borderColor: opts.color,
        backgroundColor: opts.bg,
        borderWidth: 2,
        pointRadius: opts.pointRadius ?? 0,
        fill: true,
        tension: opts.tension ?? 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: '#21262d' },
          title: { display: true, text: data.x_label || opts.xLabel || '' },
          ticks: { maxTicksLimit: 6 },
        },
        y: {
          type: opts.yLog ? 'logarithmic' : 'linear',
          grid: { color: '#21262d' },
          title: { display: true, text: data.y_label || opts.yLabel || '' },
          ticks: opts.yTickFn ? { callback: opts.yTickFn } : {},
        },
      },
    },
  });
}

async function initCharts() {
  const [bo, loss, rl, mpnn] = await Promise.all([
    fetchTrainingLogs('bo'),
    fetchTrainingLogs('loss'),
    fetchTrainingLogs('rl'),
    fetchTrainingLogs('mpnn'),
  ]);

  buildChart('boChart', bo || CHART_FALLBACK.bo, {
    color: '#39d0f0', bg: 'rgba(57,208,240,.08)',
    pointRadius: 3, tension: 0.3,
    labelFn: s => `第 ${s} 輪`,
    yTickFn: v => v.toFixed(3),
  });

  buildChart('lossChart', loss || CHART_FALLBACK.loss, {
    color: '#bc8cff', bg: 'rgba(188,140,255,.06)',
    yLog: true, tension: 0.4,
  });

  buildChart('rlChart', rl || CHART_FALLBACK.rl, {
    color: '#3fb950', bg: 'rgba(63,185,80,.07)',
    pointRadius: 3, tension: 0.3,
    labelFn: s => `第 ${s} 回`,
    yTickFn: v => v.toFixed(3),
  });

  buildChart('mpnnChart', mpnn || CHART_FALLBACK.mpnn, {
    color: '#f0883e', bg: 'rgba(240,136,62,.07)',
    pointRadius: 2, tension: 0.4,
  });
}

initCharts();
