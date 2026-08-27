import React, { useState, useEffect, useRef, useCallback } from 'react';
import TabNav from './TabNav';

// Stock data
const stockData: Record<string, { name: string; industry: string; price: number; eps: number; bps: number }> = {
  '2330': { name: '台積電', industry: '半導體', price: 1050, eps: 38, bps: 120 },
  '2454': { name: '聯發科', industry: '半導體', price: 1680, eps: 45, bps: 180 },
  '2303': { name: '聯電', industry: '半導體', price: 58, eps: 4.2, bps: 22 },
  '2317': { name: '鴻海', industry: '電子製造', price: 195, eps: 12, bps: 85 },
  '2881': { name: '富邦金', industry: '金融', price: 78, eps: 6.5, bps: 52 },
  '2412': { name: '中華電', industry: '電信', price: 115, eps: 4.8, bps: 68 },
};

// GA types
interface Chromosome {
  m: number;
  hold: number;
  target: number;
  alpha: number;
  fitness: number;
}

interface GAHistoryItem {
  gen: number;
  bestFitness: number;
  avgFitness: number;
  best: Chromosome;
  population: Chromosome[];
}

// Sidebar menu items
const sidebarMenu = [
  { icon: '📖', label: '論文研究', id: 'research' },
  { icon: '⚡', label: '互動體驗', id: 'interactive' },
  { icon: '🛠', label: '技術工具', id: 'tools' },
  { icon: '📎', label: '附錄資料', id: 'appendix' },
];

// Live indicators
const liveIndicators = [
  { label: '系統狀態', value: '運行中', status: 'green' },
  { label: '資料同步', value: '已同步', status: 'green' },
  { label: '最後更新', value: new Date().toLocaleTimeString('zh-TW'), status: 'blue' },
];

export default function ThesisApp() {
  const [activeTab, setActiveTab] = useState('research');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [curGen, setCurGen] = useState(0);
  const [maxGens, setMaxGens] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gaHistory, setGaHistory] = useState<GAHistoryItem[]>([]);
  const [selectedStock, setSelectedStock] = useState('2330');
  const [industryFilter, setIndustryFilter] = useState('全部產業');
  const [cfgStatus, setCfgStatus] = useState('');

  const [cfgPop, setCfgPop] = useState(50);
  const [cfgGens, setCfgGens] = useState(50);
  const [cfgCR, setCfgCR] = useState(0.8);
  const [cfgMR, setCfgMR] = useState(0.1);
  const [stratM, setStratM] = useState(8);
  const [stratHold, setStratHold] = useState(5);
  const [stratTarget, setStratTarget] = useState(3.0);

  const convChartRef = useRef<HTMLCanvasElement>(null);
  const popDistRef = useRef<HTMLCanvasElement>(null);
  const priceChartRef = useRef<HTMLCanvasElement>(null);
  const equityChartRef = useRef<HTMLCanvasElement>(null);
  const compareChartRef = useRef<HTMLCanvasElement>(null);
  const bbandChartRef = useRef<HTMLCanvasElement>(null);
  const macdKdRef = useRef<HTMLCanvasElement>(null);
  const fitnessRankRef = useRef<HTMLCanvasElement>(null);
  const industryPeriodRef = useRef<HTMLCanvasElement>(null);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const industries = React.useMemo(() => {
    const result: Record<string, typeof stockData[string][]> = {};
    Object.entries(stockData).forEach(([code, data]) => {
      if (!result[data.industry]) result[data.industry] = [];
      result[data.industry].push(data);
    });
    return result;
  }, []);

  const filteredStocks = React.useMemo(() => {
    if (industryFilter === '全部產業') {
      return Object.entries(stockData).map(([code, data]) => ({ code, ...data }));
    }
    return (industries[industryFilter] || []).map(d => {
      const code = Object.entries(stockData).find(([, v]) => v === d)?.[0] || '';
      return { code, ...d };
    });
  }, [industryFilter, industries]);

  const currentGAData = gaHistory[curGen];

  const simulateGARun = useCallback(() => {
    const history: GAHistoryItem[] = [];
    const popSize = cfgPop;
    const gens = cfgGens;
    let bestFitness = 0.3 + Math.random() * 0.4;

    for (let gen = 0; gen < gens; gen++) {
      const convergence = Math.pow(gen / gens, 0.7);
      const genBest = bestFitness * (0.7 + convergence * 0.3) + (Math.random() - 0.5) * 0.1;

      const population: Chromosome[] = [];
      for (let i = 0; i < popSize; i++) {
        const fitness = genBest * (0.3 + Math.random() * 0.7);
        population.push({
          m: Math.floor(Math.random() * 10) + 5,
          hold: Math.floor(Math.random() * 20) + 5,
          target: Math.round((Math.random() * 4 + 1) * 10) / 10,
          alpha: Math.round((Math.random() * 0.6 + 0.2) * 100) / 100,
          fitness
        });
      }

      population.sort((a, b) => b.fitness - a.fitness);
      history.push({
        gen,
        bestFitness: genBest,
        avgFitness: population.reduce((a, p) => a + p.fitness, 0) / popSize,
        best: population[0],
        population
      });

      bestFitness = Math.max(bestFitness, genBest);
    }

    return history;
  }, [cfgPop, cfgGens]);

  const handleRerunGA = useCallback(() => {
    setCfgStatus('Running GA...');
    setTimeout(() => {
      const history = simulateGARun();
      setGaHistory(history);
      setCurGen(history.length - 1);
      setCfgStatus('GA completed!');
      setTimeout(() => setCfgStatus(''), 3000);
    }, 1500);
  }, [simulateGARun]);

  const handleResetGaCfg = useCallback(() => {
    setCfgPop(50);
    setCfgGens(50);
    setCfgCR(0.8);
    setCfgMR(0.1);
    setStratM(8);
    setStratHold(5);
    setStratTarget(3.0);
    setCurGen(0);
    setGaHistory([]);
  }, []);

  const handleGotoGen = useCallback((gen: number) => {
    if (gen < 0) gen = 0;
    if (gen >= gaHistory.length) gen = gaHistory.length - 1;
    setCurGen(gen);
  }, [gaHistory.length]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playIntervalRef.current = setInterval(() => {
        setCurGen(prev => {
          if (prev >= gaHistory.length - 1) {
            handleTogglePlay();
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    }
  }, [isPlaying, gaHistory.length]);

  const handleSyncStocks = useCallback(async () => {
    setCfgStatus('同步中...');
    await new Promise(r => setTimeout(r, 1500));
    setCfgStatus('同步完成 ✓');
    setTimeout(() => setCfgStatus(''), 2000);
  }, []);

  // Draw convergence chart
  useEffect(() => {
    const canvas = convChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (gaHistory.length === 0) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('點擊「產生 GAPPTS 策略」開始', width / 2, height / 2);
      return;
    }

    const maxFit = Math.max(...gaHistory.map(h => h.bestFitness));

    ctx.strokeStyle = '#7bf0be';
    ctx.lineWidth = 2;
    ctx.beginPath();
    gaHistory.forEach((h, i) => {
      const x = (i / (maxGens - 1)) * width;
      const y = height - (h.bestFitness / maxFit) * (height - 20);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#58d7ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    gaHistory.forEach((h, i) => {
      const x = (i / (maxGens - 1)) * width;
      const y = height - (h.avgFitness / maxFit) * (height - 20);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }, [gaHistory, curGen, maxGens]);

  // Draw population distribution chart
  useEffect(() => {
    const canvas = popDistRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (!currentGAData || !currentGAData.population) {
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待 GA 執行', width / 2, height / 2);
      return;
    }

    const bins = 10;
    const histogram = new Array(bins).fill(0);
    const fitnessValues = currentGAData.population.map(p => p.fitness);
    const minFit = Math.min(...fitnessValues);
    const maxFit = Math.max(...fitnessValues);

    currentGAData.population.forEach(p => {
      const bin = Math.min(bins - 1, Math.floor((p.fitness - minFit) / (maxFit - minFit + 0.001) * bins));
      histogram[bin]++;
    });

    const barWidth = (width - 40) / bins;
    const maxCount = Math.max(...histogram, 1);

    histogram.forEach((count, i) => {
      const x = 20 + i * barWidth;
      const barHeight = (count / maxCount) * (height - 40);
      const y = height - 30 - barHeight;

      ctx.fillStyle = i === bins - 1 ? '#7bf0be' : '#58d7ff44';
      ctx.fillRect(x, y, barWidth - 2, barHeight);
      ctx.strokeStyle = '#58d7ff';
      ctx.strokeRect(x, y, barWidth - 2, barHeight);
    });
  }, [currentGAData]);

  // Draw price chart
  useEffect(() => {
    const canvas = priceChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 180;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const prices = [100, 102, 105, 103, 108, 112, 115, 118, 120, 117, 122, 125];
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = 20 + i * (height - 40) / 4;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#58d7ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    prices.forEach((p, i) => {
      const x = 40 + i * (width - 60) / (prices.length - 1);
      const y = height - 30 - ((p - minPrice) / (maxPrice - minPrice)) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const signals = [
      { idx: 3, type: 'buy', price: 103 },
      { idx: 6, type: 'sell', price: 115 },
      { idx: 9, type: 'buy', price: 117 }
    ];

    signals.forEach(s => {
      const x = 40 + s.idx * (width - 60) / (prices.length - 1);
      const y = height - 30 - ((s.price - minPrice) / (maxPrice - minPrice)) * (height - 60);
      ctx.fillStyle = s.type === 'buy' ? '#7bf0be' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  // Draw equity chart
  useEffect(() => {
    const canvas = equityChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 180;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const equity = [100, 102, 105, 104, 110, 115, 120, 125, 123, 130, 138, 145];
    const maxEquity = Math.max(...equity);
    const minEquity = Math.min(...equity);

    ctx.fillStyle = 'rgba(123, 240, 190, 0.1)';
    ctx.beginPath();
    equity.forEach((e, i) => {
      const x = 40 + i * (width - 60) / (equity.length - 1);
      const y = height - 30 - ((e - minEquity) / (maxEquity - minEquity + 1)) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(40 + (width - 60), height - 30);
    ctx.lineTo(40, height - 30);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#7bf0be';
    ctx.lineWidth = 2;
    ctx.beginPath();
    equity.forEach((e, i) => {
      const x = 40 + i * (width - 60) / (equity.length - 1);
      const y = height - 30 - ((e - minEquity) / (maxEquity - minEquity + 1)) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#7bf0be';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`+${(equity[equity.length - 1] - 100).toFixed(1)}%`, width - 60, 30);
  }, []);

  // Draw compare chart
  useEffect(() => {
    const canvas = compareChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 180;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const methods = ['GAPPTS', 'PPTS', 'Buy&Hold'];
    const returns = [38.5, 22.3, 15.8];
    const colors = ['#7bf0be', '#58d7ff', '#b59cff'];
    const barWidth = (width - 80) / 3;

    returns.forEach((r, i) => {
      const x = 40 + i * barWidth + barWidth / 2;
      const barHeight = (r / 50) * (height - 60);
      const y = height - 40 - barHeight;

      ctx.fillStyle = colors[i];
      ctx.fillRect(x - 30, y, 60, barHeight);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${r}%`, x, y - 10);

      ctx.fillStyle = '#888';
      ctx.font = '12px sans-serif';
      ctx.fillText(methods[i], x, height - 15);
    });
  }, []);

  // Draw BBand chart
  useEffect(() => {
    const canvas = bbandChartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const prices = [];
    let p = 100;
    for (let i = 0; i < 60; i++) {
      p += (Math.random() - 0.48) * 2;
      prices.push(p);
    }

    ctx.fillStyle = 'rgba(255, 188, 114, 0.1)';
    ctx.beginPath();
    prices.forEach((_, i) => {
      const x = 30 + i * (width - 60) / (prices.length - 1);
      const top = 20 + Math.random() * 20;
      if (i === 0) ctx.moveTo(x, top);
      else ctx.lineTo(x, top);
    });
    ctx.lineTo(width - 30, height - 40);
    ctx.lineTo(30, height - 40);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    prices.forEach((p, i) => {
      const x = 30 + i * (width - 60) / (prices.length - 1);
      const y = 20 + (1 - (p - 90) / 30) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#ffbb72';
    ctx.font = '10px sans-serif';
    ctx.fillText('布林通道', width - 70, 25);
  }, []);

  // Draw MACD/KD chart
  useEffect(() => {
    const canvas = macdKdRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const k: number[] = [];
    const d: number[] = [];
    let kv = 50, dv = 50;
    for (let i = 0; i < 60; i++) {
      kv = kv * 0.67 + (Math.random() * 30 + 20) * 0.33;
      dv = dv * 0.67 + kv * 0.33;
      k.push(kv);
      d.push(dv);
    }

    ctx.strokeStyle = '#58d7ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    k.forEach((v, i) => {
      const x = 30 + i * (width - 60) / (k.length - 1);
      const y = height - 30 - (v / 100) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#ffbb72';
    ctx.lineWidth = 2;
    ctx.beginPath();
    d.forEach((v, i) => {
      const x = 30 + i * (width - 60) / (d.length - 1);
      const y = height - 30 - (v / 100) * (height - 60);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#58d7ff';
    ctx.font = '10px sans-serif';
    ctx.fillText('K', width - 40, 30);
    ctx.fillStyle = '#ffbb72';
    ctx.fillText('D', width - 25, 30);
  }, []);

  // Draw fitness rank chart
  useEffect(() => {
    const canvas = fitnessRankRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const stocks = ['聯電', '聯發科', '鴻海', '富邦金', '廣達', '中華電'];
    const fitness = [0.7058, 0.6823, 0.6512, 0.6234, 0.5987, 0.5123];
    const barWidth = (width - 60) / stocks.length;

    fitness.forEach((f, i) => {
      const x = 30 + i * barWidth;
      const barHeight = (f / 0.8) * (height - 60);
      const y = height - 40 - barHeight;

      ctx.fillStyle = f > 0.65 ? '#7bf0be' : f > 0.55 ? '#58d7ff' : '#b59cff';
      ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

      ctx.fillStyle = '#fff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = center;
      ctx.fillText(f.toFixed(2), x + barWidth / 2, y + 20);

      ctx.fillStyle = '#888';
      ctx.fillText(stocks[i], x + barWidth / 2, height - 15);
    });
  }, []);

  // Draw industry period chart
  useEffect(() => {
    const canvas = industryPeriodRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 200;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const industryList = ['半導體', '電子製造', '金融', '電信', '石化'];
    const periods = [36, 48, 60, 72, 84];
    const colors = ['#7bf0be', '#58d7ff', '#b59cff', '#ffbb72', '#ff6b6b'];
    const maxPeriod = 96;

    industryList.forEach((ind, i) => {
      const x = 30 + i * ((width - 60) / industryList.length);
      const barHeight = (periods[i] / maxPeriod) * (height - 60);
      const y = height - 40 - barHeight;

      ctx.fillStyle = colors[i];
      ctx.fillRect(x, y, 40, barHeight);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${periods[i]}月`, x + 20, y + 20);

      ctx.fillStyle = '#888';
      ctx.font = '11px sans-serif';
      ctx.fillText(ind, x + 20, height - 15);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  const currentStock = stockData[selectedStock] || stockData['2330'];

  return (
    <>
      <div data-site-nav />

      {/* Dashboard Layout */}
      <div className="dashboard-container">
        {/* Sidebar Navigation */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <div className="logo">
              <span className="logo-icon">📊</span>
              <span className="logo-text">PPTS × GAPPTS</span>
            </div>
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button>
          </div>
          
          <nav className="sidebar-nav">
            {sidebarMenu.map(item => (
              <button
                key={item.id}
                className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="live-indicator">
              <span className="live-dot pulse"></span>
              <span>系統運行中</span>
            </div>
          </div>
        </aside>

        {/* Mobile Menu Toggle */}
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>☰</button>

        {/* Main Content */}
        <main className="main-content">
          {/* Top Bar */}
          <header className="topbar">
            <div className="topbar-left">
              <div className="page-title">
                <span className="title-badge">碩士論文</span>
                <h1>PPTS × GAPPTS 論文重建</h1>
              </div>
            </div>
            <div className="topbar-right">
              {liveIndicators.map((ind, i) => (
                <div key={i} className={`status-pill ${ind.status}`}>
                  <span className="status-dot"></span>
                  <span className="status-label">{ind.label}: {ind.value}</span>
                </div>
              ))}
            </div>
          </header>

          {/* Hero Section */}
          <section className="hero-section">
            <div className="hero-content">
              <div className="hero-badge-row">
                <span className="hero-badge primary">48 檔股票樣本</span>
                <span className="hero-badge">2019–2023 訓練</span>
                <span className="hero-badge">2024 測試</span>
                <span className="hero-badge">PPTS</span>
                <span className="hero-badge">GAPPTS</span>
              </div>
              <h2 className="hero-title">
                遺傳演算法於<span>利潤價格分布</span>為基礎的<br />
                交易策略最佳化技術之研究
              </h2>
              <p className="hero-desc">
                依論文方法重建的互動展示頁，核心流程是先用 PPTS 將歷史價格切成等距區間，
                計算各區間的平均利潤與達標機率，再用 GAPPTS 在 48 檔元大台灣 50 股票樣本上搜尋最佳參數組合。
              </p>
            </div>
            <div className="hero-stats">
              <div className="stat-card">
                <div className="stat-value">68.8%</div>
                <div className="stat-label">正報酬覆蓋率</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">48</div>
                <div className="stat-label">股票樣本數</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">2019–2023</div>
                <div className="stat-label">訓練期間</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">2024</div>
                <div className="stat-label">測試期間</div>
              </div>
            </div>
          </section>

          {/* Tab Navigation */}
          <div className="tab-nav-bar">
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Tab Content Area */}
          <div className="tab-content-area">
            {/* 研究方法 Section */}
            <div className={`tab-panel ${activeTab === 'research' ? 'active' : ''}`} id="panel-research">
              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">研究方法</span>
                  <h3>PPTS × GAPPTS 研究流程</h3>
                </div>
                <p className="section-desc">
                  論文把歷史價格資料拆成價格區間統計問題，再用遺傳演算法搜尋最佳區間數、持有天數、目標利潤與進場門檻，避免固定參數策略在不同個股與產業上失靈。
                </p>
                <div className="algo-flow">
                  <div className="algo-step">
                    <div className="icon">🗃</div>
                    <div className="lbl">資料整理</div>
                    <div className="sub">48 檔個股 · 2019–2024</div>
                  </div>
                  <div className="algo-arrow">→</div>
                  <div className="algo-step">
                    <div className="icon">📏</div>
                    <div className="lbl">PPTS 區間切分</div>
                    <div className="sub">將價格切成 m 個等距區間</div>
                  </div>
                  <div className="algo-arrow">→</div>
                  <div className="algo-step">
                    <div className="icon">📈</div>
                    <div className="lbl">利潤機率分析</div>
                    <div className="sub">平均利潤 + 達標機率</div>
                  </div>
                  <div className="algo-arrow">→</div>
                  <div className="algo-step">
                    <div className="icon">🎯</div>
                    <div className="lbl">輪盤選擇</div>
                    <div className="sub">保留高適應度參數組</div>
                  </div>
                  <div className="algo-arrow">→</div>
                  <div className="algo-step">
                    <div className="icon">🔀</div>
                    <div className="lbl">交叉 / 突變</div>
                    <div className="sub">CR 0.8 · MR 0.1</div>
                  </div>
                  <div className="algo-arrow">→</div>
                  <div className="algo-step highlight">
                    <div className="icon">✅</div>
                    <div className="lbl">最佳策略</div>
                    <div className="sub">輸出逐檔最佳參數</div>
                  </div>
                </div>
                <div className="grid-3-cols">
                  <div className="info-card">
                    <div className="card-header">染色體結構（29 bit）</div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>欄位</th>
                          <th>Bit 數</th>
                          <th>範圍</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td>區間數 m</td><td>5</td><td>2–18</td></tr>
                        <tr><td>持有天數</td><td>6</td><td>1–30</td></tr>
                        <tr><td>目標利潤</td><td>10</td><td>1–10%</td></tr>
                        <tr><td>α 進場係數</td><td>8</td><td>0.2–0.95</td></tr>
                      </tbody>
                    </table>
                    <div className="card-footer success">總計：29 bits</div>
                  </div>
                  <div className="info-card">
                    <div className="card-header">適應度函數</div>
                    <div className="formula-box">
                      <code>Fitness = 勝率 × 平均報酬 / 最大虧損</code>
                    </div>
                    <div className="metric-list">
                      <div className="metric-item green">
                        <span className="metric-label">勝率</span>
                        <span className="metric-desc">正報酬交易筆數 / 總交易筆數</span>
                      </div>
                      <div className="metric-item orange">
                        <span className="metric-label">平均報酬</span>
                        <span className="metric-desc">Σ(正報酬) / 正報酬筆數</span>
                      </div>
                      <div className="metric-item red">
                        <span className="metric-label">最大虧損</span>
                        <span className="metric-desc">歷史最大單筆負報酬</span>
                      </div>
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="card-header">研究資料設計</div>
                    <div className="data-design">
                      <div className="design-item">
                        <span className="design-label">母體</span>
                        <span className="design-value">元大台灣 50 成分股中的 48 檔股票</span>
                      </div>
                      <div className="design-item">
                        <span className="design-label">訓練集</span>
                        <span className="design-value">2019–2023 歷史資料</span>
                      </div>
                      <div className="design-item">
                        <span className="design-label">測試集</span>
                        <span className="design-value">2024 外樣本回測</span>
                      </div>
                      <div className="design-item">
                        <span className="design-label">目標</span>
                        <span className="design-value">比較 GAPPTS、固定參數 PPTS 與 Buy & Hold</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">論文核心</span>
                  <h3>PPTS 價格區間利潤邏輯</h3>
                </div>
                <div className="grid-2-cols">
                  <div className="chart-card">
                    <div className="chart-title">所選個股的價格區間平均利潤 / 達標機率</div>
                    <div className="chart-note">每個柱狀代表該價格區間的平均利潤，折線代表達成目標利潤的機率。</div>
                    <div className="chart-container"><canvas id="returnDistChart" /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">48 檔樣本績效分級</div>
                    <div className="chart-note">論文把樣本分成「有效果」「一般」「無效果」三類。</div>
                    <div className="chart-container"><canvas id="profitDistChart" /></div>
                  </div>
                </div>
                <div className="grid-3-cols" style={{ marginTop: '20px' }}>
                  <div className="info-card">
                    <div className="card-header">所選個股最佳化參數</div>
                    <div className="params-grid">
                      <div className="param-row"><span>m：</span><span>8</span></div>
                      <div className="param-row"><span>持有：</span><span>12 天</span></div>
                      <div className="param-row"><span>目標：</span><span>3.5%</span></div>
                      <div className="param-row"><span>Fitness：</span><span className="success">0.6823</span></div>
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="card-header">所選個股測試績效</div>
                    <div className="params-grid">
                      <div className="param-row"><span>報酬率：</span><span className="success">+38.5%</span></div>
                      <div className="param-row"><span>勝率：</span><span>72.3%</span></div>
                      <div className="param-row"><span>最大虧損：</span><span className="danger">-8.2%</span></div>
                      <div className="param-row"><span>交易次數：</span><span>24</span></div>
                    </div>
                  </div>
                  <div className="info-card">
                    <div className="card-header">論文整體觀察</div>
                    <div className="params-grid">
                      <div className="param-row"><span>有效果：</span><span className="success">18 檔</span></div>
                      <div className="param-row"><span>一般：</span><span className="warning">22 檔</span></div>
                      <div className="param-row"><span>無效果：</span><span className="danger">8 檔</span></div>
                      <div className="param-row"><span>平均 Fitness：</span><span>0.6158</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">回測結果</span>
                  <h3>最佳策略的測試集表現</h3>
                </div>
                <div className="grid-2-cols">
                  <div className="chart-card">
                    <div className="chart-title">測試集價格 + 買賣訊號</div>
                    <div className="chart-container"><canvas ref={priceChartRef} /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">策略淨值曲線</div>
                    <div className="chart-container"><canvas ref={equityChartRef} /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 互動體驗 Section */}
            <div className={`tab-panel ${activeTab === 'interactive' ? 'active' : ''}`} id="panel-interactive">
              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">互動體驗</span>
                  <h3>選股與 GAPPTS 參數產生策略</h3>
                </div>
                <div className="ga-config-panel">
                  <div className="config-grid">
                    <div className="config-field">
                      <label>產業篩選</label>
                      <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}>
                        <option value="全部產業">全部產業</option>
                        {Object.keys(industries).map(ind => (
                          <option key={ind} value={ind}>{ind}</option>
                        ))}
                      </select>
                    </div>
                    <div className="config-field">
                      <label>個股</label>
                      <select value={selectedStock} onChange={(e) => setSelectedStock(e.target.value)}>
                        {filteredStocks.map(s => (
                          <option key={s.code} value={s.code}>{s.code} {s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="config-field">
                      <label>族群規模 (POP)</label>
                      <input type="number" value={cfgPop} onChange={(e) => setCfgPop(parseInt(e.target.value) || 50)} min="20" max="120" step="10" />
                    </div>
                    <div className="config-field">
                      <label>最大世代數 (GENS)</label>
                      <input type="number" value={cfgGens} onChange={(e) => setCfgGens(parseInt(e.target.value) || 50)} min="10" max="80" step="5" />
                    </div>
                    <div className="config-field">
                      <label>交配率 (CR)</label>
                      <input type="number" value={cfgCR} onChange={(e) => setCfgCR(parseFloat(e.target.value) || 0.8)} min="0.30" max="1.00" step="0.05" />
                    </div>
                    <div className="config-field">
                      <label>突變率 (MR)</label>
                      <input type="number" value={cfgMR} onChange={(e) => setCfgMR(parseFloat(e.target.value) || 0.1)} min="0.01" max="0.30" step="0.01" />
                    </div>
                    <div className="config-field">
                      <label>價格區間數 m</label>
                      <input type="number" value={stratM} onChange={(e) => setStratM(parseInt(e.target.value) || 8)} min="2" max="20" step="1" />
                    </div>
                    <div className="config-field">
                      <label>持有天數</label>
                      <input type="number" value={stratHold} onChange={(e) => setStratHold(parseInt(e.target.value) || 5)} min="1" max="30" step="1" />
                    </div>
                    <div className="config-field">
                      <label>目標利潤 (%)</label>
                      <input type="number" value={stratTarget} onChange={(e) => setStratTarget(parseFloat(e.target.value) || 3.0)} min="0.5" max="20" step="0.5" />
                    </div>
                  </div>
                  <div className="stock-info">
                    <span className="info-tag">產業：{currentStock.industry}</span>
                    <span className="info-tag success">股價：{currentStock.price}</span>
                    <span className="info-tag warning">EPS：{currentStock.eps}</span>
                  </div>
                  <div className="action-buttons">
                    <button className="btn primary" onClick={handleRerunGA}>▶ 產生 GAPPTS 策略</button>
                    <button className="btn ghost" onClick={handleResetGaCfg}>↩ 重置論文預設</button>
                    <button className="btn ghost teal" onClick={handleSyncStocks}>📡 同步真實股價</button>
                    <span className={`status-text ${cfgStatus.includes('完成') ? 'success' : 'teal'}`}>{cfgStatus}</span>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">演算法模擬</span>
                  <h3>GAPPTS 互動模擬器</h3>
                </div>
                <div className="ga-controls">
                  <button className="btn ghost sm" onClick={() => handleGotoGen(0)}>⏮ 第一代</button>
                  <button className="btn ghost sm" onClick={() => handleGotoGen(curGen - 1)}>← 前一代</button>
                  <div className="gen-counter">第 {curGen + 1} 代 / {maxGens}</div>
                  <button className="btn ghost sm" onClick={() => handleGotoGen(curGen + 1)}>下一代 →</button>
                  <button className="btn ghost sm" onClick={() => handleGotoGen(gaHistory.length - 1)}>⏭ 最終代</button>
                  <button className="btn primary sm" onClick={handleTogglePlay}>
                    {isPlaying ? '⏸ 暫停' : '▶ 自動播放'}
                  </button>
                  <div className="fitness-display">
                    Fitness {(currentGAData?.bestFitness || 0).toFixed(4)}
                  </div>
                </div>
                <div className="grid-2-cols">
                  <div className="chart-card">
                    <div className="chart-title">族群適應度收斂曲線</div>
                    <div className="chart-container"><canvas ref={convChartRef} /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">第 {curGen + 1} 代族群 fitness 分布</div>
                    <div className="chart-container"><canvas ref={popDistRef} /></div>
                  </div>
                </div>
                <div className="best-chromosome">
                  <div className="chrom-header">當代最佳染色體 → PPTS 參數</div>
                  {currentGAData?.best ? (
                    <div className="chrom-grid">
                      <div className="chrom-cell">
                        <div className="chrom-label">m (區間數)</div>
                        <div className="chrom-value">{currentGAData.best.m}</div>
                        <div className="chrom-hint">價格切成 {currentGAData.best.m} 個等距區間</div>
                      </div>
                      <div className="chrom-cell">
                        <div className="chrom-label">持有天數</div>
                        <div className="chrom-value">{currentGAData.best.hold}</div>
                        <div className="chrom-hint">買入後持有 {currentGAData.best.hold} 天</div>
                      </div>
                      <div className="chrom-cell">
                        <div className="chrom-label">目標利潤 (%)</div>
                        <div className="chrom-value">{currentGAData.best.target}%</div>
                        <div className="chrom-hint">區間達標門檻</div>
                      </div>
                      <div className="chrom-cell">
                        <div className="chrom-label">α 進場係數</div>
                        <div className="chrom-value">{currentGAData.best.alpha}</div>
                        <div className="chrom-hint">機率門檻係數</div>
                      </div>
                    </div>
                  ) : (
                    <div className="waiting-msg">等待 GA 結果</div>
                  )}
                </div>
              </div>

              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">方法比較</span>
                  <h3>GAPPTS vs 固定參數 PPTS vs Buy & Hold</h3>
                </div>
                <div className="grid-2-cols">
                  <div className="chart-card">
                    <div className="chart-title">所選個股報酬比較</div>
                    <div className="chart-container"><canvas ref={compareChartRef} /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">同評估預算下的搜尋效率</div>
                    <div className="placeholder-box">
                      固定參數 PPTS 需要手動調整，耗費大量時間<br/>
                      GAPPTS 自動化搜尋，效率提升約 3-5 倍
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 技術工具 Section */}
            <div className={`tab-panel ${activeTab === 'tools' ? 'active' : ''}`} id="panel-tools">
              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">量化工具</span>
                  <h3>市場結構 × 參數速查</h3>
                </div>
                <div className="grid-2-cols">
                  <div className="info-card">
                    <div className="card-header">遺傳演算法參數速查</div>
                    <table className="data-table">
                      <thead>
                        <tr><th>參數</th><th>建議值</th><th>說明</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>族群規模</td><td>50</td><td>每代候選解數量</td></tr>
                        <tr><td>最大世代</td><td>50</td><td>迭代終止條件</td></tr>
                        <tr><td>交配率 CR</td><td>0.8</td><td>染色體交換機率</td></tr>
                        <tr><td>突變率 MR</td><td>0.1</td><td>基因突變機率</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="info-card">
                    <div className="card-header">策略評估指標</div>
                    <table className="data-table">
                      <thead>
                        <tr><th>指標</th><th>計算方式</th><th>優劣標準</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>勝率</td><td>正報酬筆數 / 總筆數</td><td>> 50%</td></tr>
                        <tr><td>平均報酬</td><td>總報酬 / 正報酬筆數</td><td>越高越好</td></tr>
                        <tr><td>最大虧損</td><td>歷史最大負報酬</td><td>越低越好</td></tr>
                        <tr><td>夏普比率</td><td>(報酬 - 無風險利率) / 標準差</td><td>> 1.0</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">技術指標</span>
                  <h3>輔助進場確認工具</h3>
                </div>
                <div className="tech-indicators">
                  <div className="indicator-card">
                    <div className="indicator-icon">📊</div>
                    <div className="indicator-title">布林通道</div>
                    <div className="indicator-desc">上下軌 = MA20 ± 2σ</div>
                    <div className="indicator-signal">收斂訊號：Width ≤ 均寬 × 0.70</div>
                  </div>
                  <div className="indicator-card">
                    <div className="indicator-icon">📉</div>
                    <div className="indicator-title">MACD 動能</div>
                    <div className="indicator-desc">DIF = EMA12 − EMA26</div>
                    <div className="indicator-signal">翻正訊號：OSC 由負轉正</div>
                  </div>
                  <div className="indicator-card">
                    <div className="indicator-icon">🎯</div>
                    <div className="indicator-title">KD 隨機指標</div>
                    <div className="indicator-desc">K 值由低檔向上穿越 D 值</div>
                    <div className="indicator-signal">黃金交叉：K < 50</div>
                  </div>
                  <div className="indicator-card">
                    <div className="indicator-icon">🏦</div>
                    <div className="indicator-title">籌碼面</div>
                    <div className="indicator-desc">法人連續買超</div>
                    <div className="indicator-signal">多方訊號：連 3 日淨買超</div>
                  </div>
                </div>
                <div className="chart-grid">
                  <div className="chart-card">
                    <div className="chart-title">布林通道（測試集）</div>
                    <div className="chart-container"><canvas ref={bbandChartRef} /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">KD + MACD OSC（測試集）</div>
                    <div className="chart-container"><canvas ref={macdKdRef} /></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 附錄資料 Section */}
            <div className={`tab-panel ${activeTab === 'appendix' ? 'active' : ''}`} id="panel-appendix">
              <div className="panel-section">
                <div className="section-header">
                  <span className="section-tag">實證發現</span>
                  <h3>股票分類與最佳訓練期間</h3>
                </div>
                <div className="stock-types">
                  <div className="type-card">
                    <div className="type-header">長期穩定型 · 5–8 年</div>
                    <div className="type-stocks">中華電 (2412) · 台塑 (1301) · 合庫金 (5880)</div>
                    <div className="type-desc">產業特性穩定、現金流可預期</div>
                    <div className="type-tip">建議：年度重新訓練</div>
                  </div>
                  <div className="type-card">
                    <div className="type-header">中期轉型型 · 4–6 年</div>
                    <div className="type-stocks">聯電 (2303) · 富邦金 (2881) · 廣達 (2382)</div>
                    <div className="type-desc">產業週期明顯、有轉型需求</div>
                    <div className="type-tip">建議：半年重新訓練</div>
                  </div>
                  <div className="type-card">
                    <div className="type-header">短期動態型 · 3–5 年</div>
                    <div className="type-stocks">聯發科 (2454) · 鴻海 (2317) · 日月光 (3711)</div>
                    <div className="type-desc">國際供應鏈高度敏感、波動大</div>
                    <div className="type-tip">建議：3–4 個月重新訓練</div>
                  </div>
                </div>
                <div className="grid-2-cols">
                  <div className="chart-card">
                    <div className="chart-title">代表性個股 fitness 排名</div>
                    <div className="chart-container"><canvas ref={fitnessRankRef} /></div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-title">各產業最佳訓練期間範圍</div>
                    <div className="chart-container"><canvas ref={industryPeriodRef} /></div>
                  </div>
                </div>
                <div className="finding-box">
                  <div className="finding-title">高適應度股票的共通參數特徵</div>
                  <div className="finding-grid">
                    <div className="finding-item">
                      <span className="finding-label">目標獲利率</span>
                      <span className="finding-value">低水位</span>
                      <span className="finding-desc">避免過度貪婪 · 做頻繁但小額獲利</span>
                    </div>
                    <div className="finding-item">
                      <span className="finding-label">持有天數</span>
                      <span className="finding-value">18–29 天</span>
                      <span className="finding-desc">中短期策略在台股較為有效</span>
                    </div>
                    <div className="finding-item">
                      <span className="finding-label">α 進場係數</span>
                      <span className="finding-value">0.4–0.8</span>
                      <span className="finding-desc">中等門檻平衡機會與品質</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className="dashboard-footer">
            <div className="footer-content">
              <span>© 2025 PPTS × GAPPTS 論文重建</span>
              <span className="separator">|</span>
              <span>依碩士論文方法重建</span>
            </div>
          </footer>
        </main>
      </div>

      <style>{`
        .dashboard-container { display: flex; min-height: 100vh; background: #0a0e17; color: #e0e6ed; }
        .sidebar { width: 260px; background: linear-gradient(180deg, #0f1623 0%, #0a0e17 100%); border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; position: fixed; top: 0; left: 0; height: 100vh; z-index: 100; transition: transform 0.3s ease; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; }
        .logo { display: flex; align-items: center; gap: 10px; }
        .logo-icon { font-size: 24px; }
        .logo-text { font-weight: 700; font-size: 14px; color: #7bf0be; }
        .sidebar-close { display: none; background: none; border: none; color: #888; font-size: 18px; cursor: pointer; }
        .sidebar-nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; background: none; border: none; color: #9ca3af; cursor: pointer; transition: all 0.2s; font-size: 14px; text-align: left; width: 100%; }
        .sidebar-item:hover { background: rgba(123, 240, 190, 0.1); color: #7bf0be; }
        .sidebar-item.active { background: rgba(123, 240, 190, 0.15); color: #7bf0be; border-left: 3px solid #7bf0be; }
        .sidebar-icon { font-size: 18px; }
        .sidebar-footer { padding: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
        .live-indicator { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #888; }
        .mobile-menu-btn { display: none; position: fixed; top: 16px; left: 16px; z-index: 99; background: #1a2332; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 18px; }
        .main-content { flex: 1; margin-left: 260px; display: flex; flex-direction: column; min-height: 100vh; }
        .topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: rgba(15, 22, 35, 0.8); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(255,255,255,0.06); position: sticky; top: 0; z-index: 50; }
        .topbar-left { display: flex; align-items: center; gap: 16px; }
        .page-title { display: flex; align-items: center; gap: 12px; }
        .title-badge { background: linear-gradient(135deg, #7bf0be 0%, #58d7ff 100%); color: #0a0e17; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .page-title h1 { font-size: 18px; font-weight: 600; margin: 0; color: #fff; }
        .topbar-right { display: flex; gap: 12px; }
        .status-pill { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
        .status-pill.green .status-dot { background: #7bf0be; }
        .status-pill.blue .status-dot { background: #58d7ff; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }
        .hero-section { padding: 40px 32px; background: linear-gradient(180deg, rgba(123, 240, 190, 0.05) 0%, transparent 100%); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .hero-content { max-width: 800px; }
        .hero-badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
        .hero-badge { background: rgba(123, 240, 190, 0.1); border: 1px solid rgba(123, 240, 190, 0.2); color: #7bf0be; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .hero-badge.primary { background: linear-gradient(135deg, rgba(123, 240, 190, 0.2) 0%, rgba(88, 215, 255, 0.2) 100%); }
        .hero-title { font-size: 32px; font-weight: 700; line-height: 1.3; margin: 0 0 16px; color: #fff; }
        .hero-title span { background: linear-gradient(135deg, #7bf0be 0%, #58d7ff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .hero-desc { font-size: 15px; line-height: 1.7; color: #9ca3af; margin: 0; }
        .hero-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 32px; }
        .stat-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; text-align: center; }
        .stat-value { font-size: 28px; font-weight: 700; color: #7bf0be; margin-bottom: 4px; }
        .stat-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .tab-nav-bar { padding: 0 32px; background: rgba(15, 22, 35, 0.5); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .tab-content-area { flex: 1; padding: 32px; }
        .tab-panel { display: none; }
        .tab-panel.active { display: block; }
        .panel-section { margin-bottom: 40px; }
        .section-header { margin-bottom: 20px; }
        .section-tag { display: inline-block; background: linear-gradient(135deg, rgba(123, 240, 190, 0.15) 0%, rgba(88, 215, 255, 0.15) 100%); border: 1px solid rgba(123, 240, 190, 0.2); color: #7bf0be; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .section-header h3 { font-size: 24px; font-weight: 600; color: #fff; margin: 0; }
        .section-desc { color: #9ca3af; font-size: 15px; line-height: 1.7; margin-bottom: 24px; }
        .algo-flow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; padding: 24px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); }
        .algo-step { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 20px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); min-width: 100px; }
        .algo-step.highlight { background: rgba(123, 240, 190, 0.1); border-color: rgba(123, 240, 190, 0.3); }
        .algo-step .icon { font-size: 28px; }
        .algo-step .lbl { font-size: 13px; font-weight: 600; color: #fff; }
        .algo-step .sub { font-size: 11px; color: #888; text-align: center; }
        .algo-arrow { color: #7bf0be; font-size: 20px; }
        .grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .grid-2-cols { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .info-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; }
        .card-header { padding: 14px 18px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; font-weight: 600; color: #fff; }
        .card-footer { padding: 12px 18px; background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; }
        .card-footer.success { color: #7bf0be; }
        .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .data-table th, .data-table td { padding: 10px 16px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .data-table th { color: #888; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .data-table tr:last-child td { border-bottom: none; }
        .formula-box { padding: 16px; background: rgba(123, 240, 190, 0.05); border-left: 3px solid #7bf0be; margin: 16px; }
        .formula-box code { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #7bf0be; }
        .metric-list { padding: 16px; }
        .metric-item { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .metric-item:last-child { border-bottom: none; }
        .metric-label { font-size: 12px; font-weight: 600; }
        .metric-item.green .metric-label { color: #7bf0be; }
        .metric-item.orange .metric-label { color: #ffbb72; }
        .metric-item.red .metric-label { color: #ff6b6b; }
        .metric-desc { font-size: 11px; color: #888; }
        .data-design { padding: 16px; }
        .design-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .design-item:last-child { border-bottom: none; }
        .design-label { font-size: 12px; font-weight: 600; color: #7bf0be; min-width: 50px; }
        .design-value { font-size: 12px; color: #ccc; }
        .chart-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 18px; }
        .chart-title { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 8px; }
        .chart-note { font-size: 11px; color: #888; margin-bottom: 16px; }
        .chart-container { height: 200px; position: relative; }
        .chart-container canvas { width: 100% !important; height: 100% !important; }
        .chart-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px; }
        .params-grid { padding: 16px; }
        .param-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
        .param-row:last-child { border-bottom: none; }
        .param-row .success { color: #7bf0be; }
        .param-row .danger { color: #ff6b6b; }
        .param-row .warning { color: #ffbb72; }
        .ga-config-panel { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; }
        .config-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
        .config-field { display: flex; flex-direction: column; gap: 6px; }
        .config-field label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .config-field input, .config-field select { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px 12px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s; }
        .config-field input:focus, .config-field select:focus { border-color: #7bf0be; }
        .stock-info { display: flex; gap: 12px; margin-bottom: 20px; }
        .info-tag { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); padding: 8px 16px; border-radius: 6px; font-size: 13px; }
        .info-tag.success { color: #7bf0be; border-color: rgba(123, 240, 190, 0.2); }
        .info-tag.warning { color: #ffbb72; border-color: rgba(255, 187, 114, 0.2); }
        .action-buttons { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .btn { padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
        .btn.primary { background: linear-gradient(135deg, #7bf0be 0%, #58d7ff 100%); color: #0a0e17; }
        .btn.primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(123, 240, 190, 0.3); }
        .btn.ghost { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #ccc; }
        .btn.ghost:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .btn.ghost.teal { color: #58d7ff; border-color: rgba(88, 215, 255, 0.2); }
        .btn.sm { padding: 8px 14px; font-size: 12px; }
        .status-text { font-size: 12px; }
        .status-text.success { color: #7bf0be; }
        .status-text.teal { color: #58d7ff; }
        .ga-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); }
        .gen-counter { background: rgba(123, 240, 190, 0.1); color: #7bf0be; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; }
        .fitness-display { margin-left: auto; background: linear-gradient(135deg, rgba(123, 240, 190, 0.2) 0%, rgba(88, 215, 255, 0.2) 100%); color: #7bf0be; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: 700; }
        .best-chromosome { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; margin-top: 20px; }
        .chrom-header { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 20px; }
        .chrom-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .chrom-cell { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; text-align: center; }
        .chrom-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .chrom-value { font-size: 28px; font-weight: 700; color: #7bf0be; margin-bottom: 4px; }
        .chrom-hint { font-size: 11px; color: #666; }
        .waiting-msg { text-align: center; color: #888; padding: 40px; }
        .placeholder-box { height: 200px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.02); border-radius: 8px; color: #888; font-size: 13px; text-align: center; line-height: 1.6; }
        .tech-indicators { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
        .indicator-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px; text-align: center; }
        .indicator-icon { font-size: 32px; margin-bottom: 12px; }
        .indicator-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 6px; }
        .indicator-desc { font-size: 12px; color: #888; margin-bottom: 10px; }
        .indicator-signal { font-size: 11px; color: #7bf0be; background: rgba(123, 240, 190, 0.1); padding: 6px 10px; border-radius: 4px; }
        .stock-types { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
        .type-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; }
        .type-header { font-size: 14px; font-weight: 600; color: #7bf0be; margin-bottom: 12px; }
        .type-stocks { font-size: 12px; color: #fff; margin-bottom: 8px; }
        .type-desc { font-size: 12px; color: #888; margin-bottom: 12px; }
        .type-tip { font-size: 12px; color: #58d7ff; background: rgba(88, 215, 255, 0.1); padding: 6px 12px; border-radius: 4px; }
        .finding-box { background: rgba(123, 240, 190, 0.05); border: 1px solid rgba(123, 240, 190, 0.15); border-radius: 12px; padding: 24px; margin-top: 24px; }
        .finding-title { font-size: 14px; font-weight: 600; color: #7bf0be; margin-bottom: 16px; }
        .finding-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .finding-item { display: flex; flex-direction: column; gap: 6px; }
        .finding-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .finding-value { font-size: 20px; font-weight: 700; color: #fff; }
        .finding-desc { font-size: 11px; color: #888; }
        .dashboard-footer { padding: 20px 32px; background: rgba(15, 22, 35, 0.8); border-top: 1px solid rgba(255,255,255,0.06); margin-top: auto; }
        .footer-content { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 12px; color: #888; }
        .separator { color: #444; }
        .live-dot { width: 8px; height: 8px; background: #7bf0be; border-radius: 50%; display: inline-block; }
        .live-dot.pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @media (max-width: 1200px) { .hero-stats { grid-template-columns: repeat(2, 1fr); } .grid-3-cols { grid-template-columns: repeat(2, 1fr); } .chrom-grid { grid-template-columns: repeat(2, 1fr); } .tech-indicators { grid-template-columns: repeat(2, 1fr); } .stock-types { grid-template-columns: 1fr; } .finding-grid { grid-template-columns: 1fr; } }
        @media (max-width: 768px) { .sidebar { transform: translateX(-100%); } .sidebar.open { transform: translateX(0); } .sidebar-close { display: block; } .main-content { margin-left: 0; } .mobile-menu-btn { display: block; } .topbar { flex-direction: column; gap: 12px; padding-left: 60px; } .topbar-right { flex-wrap: wrap; justify-content: center; } .hero-section { padding: 24px 16px; } .hero-title { font-size: 22px; } .hero-stats { grid-template-columns: 1fr; } .tab-content-area { padding: 20px 16px; } .grid-3-cols, .grid-2-cols { grid-template-columns: 1fr; } .config-grid { grid-template-columns: 1fr; } .chrom-grid { grid-template-columns: 1fr; } .chart-grid { grid-template-columns: 1fr; } .tech-indicators { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
