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

// Prompt templates
const prompts = {
  summary: `請分析以下財報數據，輸出：(1) 營收趨勢 (2) 毛利率變化 (3) 業外損益 (4) 現金流 (5) 建議摘要。

【輸入財報數據】請提供欲分析的財報數據
【時效】資料截止：2024-Q3
【注意】以上為機器學習輔助分析，不構成投資建議`,
  technical: `針對以下股票進行技術面分析：
股票代號：[請填入]
時間範圍：過去 3 個月日線資料
【分析項目】1. 趨勢判斷 2. 支撐壓力位 3. 技術指標信號 4. 短中長期觀點
【注意】技術分析僅供參考，不構成投資建議`,
  macro: `請分析目前總經環境對[產業/標的]的影響：
【宏觀指標】CPI、Fed利率、PMI、台幣匯率
【分析框架】1. 資金成本 2. 需求動能 3. 原物料 4. 操作建議
【注意】總經分析僅供參考，不構成投資建議`,
  news: `請解讀以下新聞對股價的潛在影響：
【新聞標題】[請貼上內容摘要]
【分析維度】1. 產業鏈位置 2. 時間影響 3. 市場預期 4. 風險與機會
【注意】以上為資訊整理，不構成投資建議`,
  compare: `請比較以下兩家公司：
公司A：[代號] 公司B：[代號]
【比較維度】1. 產業地位 2. 營收獲利 3. 成長性 4. 風險 5. 適合投資者
【注意】以上為比較分析，不構成投資建議`,
  risk: `請評估以下投資標的的風險：
標的：[股票/ETF] 持有期間：[短線/波段/長期]
【風險維度】1. 市場風險 2. 產業風險 3. 流動性 4. 系統性風險 5. 最大虧損
【注意】風險評估僅供參考，不保證預測準確性`,
  strategy: `請根據以下條件制定交易策略：
標的：[股票代號] 風格：[日內/波段/長線] 資金：[金額]
【策略需求】1. 進場條件 2. 停損停利 3. 資金管理 4. 心理建設
【注意】策略僅供參考，不保證獲利`
};

// Algorithm comparison data
const algos = [
  { name: 'GAPPTS', precision: '高', complexity: '中', scale: '中', explain: '高', nonlinear: '高' },
  { name: 'LSTM', precision: '高', complexity: '高', scale: '大', explain: '低', nonlinear: '高' },
  { name: 'ARIMA', precision: '中', complexity: '中', scale: '小', explain: '中', nonlinear: '低' },
  { name: 'SVM', precision: '中', complexity: '中', scale: '中', explain: '中', nonlinear: '中' },
  { name: 'Random Forest', precision: '中高', complexity: '中', scale: '大', explain: '中', nonlinear: '高' }
];

export default function ThesisApp() {
  // Tab state
  const [activeTab, setActiveTab] = useState('research');

  // GA state
  const [curGen, setCurGen] = useState(0);
  const [maxGens, setMaxGens] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gaHistory, setGaHistory] = useState<GAHistoryItem[]>([]);
  const [selectedStock, setSelectedStock] = useState('2330');
  const [industryFilter, setIndustryFilter] = useState('全部產業');
  const [cfgStatus, setCfgStatus] = useState('');

  // GA config
  const [cfgPop, setCfgPop] = useState(50);
  const [cfgGens, setCfgGens] = useState(50);
  const [cfgCR, setCfgCR] = useState(0.8);
  const [cfgMR, setCfgMR] = useState(0.1);
  const [stratM, setStratM] = useState(8);
  const [stratHold, setStratHold] = useState(5);
  const [stratTarget, setStratTarget] = useState(3.0);

  // Valuation state
  const [valCode, setValCode] = useState('2330');
  const [valEpsBear, setValEpsBear] = useState(32);
  const [valEpsBase, setValEpsBase] = useState(38);
  const [valEpsBull, setValEpsBull] = useState(45);
  const [valPeBear, setValPeBear] = useState(18);
  const [valPeBase, setValPeBase] = useState(22);
  const [valPeBull, setValPeBull] = useState(25);
  const [valBps, setValBps] = useState(120);
  const [valPbBear, setValPbBear] = useState(2.0);
  const [valPbBase, setValPbBase] = useState(2.5);
  const [valPbBull, setValPbBull] = useState(3.0);
  const [valPrice, setValPrice] = useState<number | null>(null);
  const [showPeMatrix, setShowPeMatrix] = useState(false);
  const [showPbMatrix, setShowPbMatrix] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Tech analysis state
  const [taStock, setTaStock] = useState('2330');
  const [taCustomCode, setTaCustomCode] = useState('');
  const [taStatus, setTaStatus] = useState('');
  const [showTaResult, setShowTaResult] = useState(false);

  // Prompt state
  const [activePrompt, setActivePrompt] = useState('summary');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Algo strategy state
  const [showStrategy, setShowStrategy] = useState(false);
  const [strategyContent, setStrategyContent] = useState('');

  // Canvas refs
  const convChartRef = useRef<HTMLCanvasElement>(null);
  const popDistRef = useRef<HTMLCanvasElement>(null);
  const priceChartRef = useRef<HTMLCanvasElement>(null);
  const equityChartRef = useRef<HTMLCanvasElement>(null);
  const compareChartRef = useRef<HTMLCanvasElement>(null);
  const bbandChartRef = useRef<HTMLCanvasElement>(null);
  const macdKdRef = useRef<HTMLCanvasElement>(null);
  const fitnessRankRef = useRef<HTMLCanvasElement>(null);
  const industryPeriodRef = useRef<HTMLCanvasElement>(null);
  const taChartRef = useRef<HTMLCanvasElement>(null);
  const taRsiRef = useRef<HTMLCanvasElement>(null);

  // Play interval ref
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Industries
  const industries = React.useMemo(() => {
    const result: Record<string, typeof stockData[string][]> = {};
    Object.entries(stockData).forEach(([code, data]) => {
      if (!result[data.industry]) result[data.industry] = [];
      result[data.industry].push(data);
    });
    return result;
  }, []);

  // Filtered stocks
  const filteredStocks = React.useMemo(() => {
    if (industryFilter === '全部產業') {
      return Object.entries(stockData).map(([code, data]) => ({ code, ...data }));
    }
    return (industries[industryFilter] || []).map(d => {
      const code = Object.entries(stockData).find(([, v]) => v === d)?.[0] || '';
      return { code, ...d };
    });
  }, [industryFilter, industries]);

  // Current GA data
  const currentGAData = gaHistory[curGen];

  // Simulate GA run
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

  // Run GA
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

  // Reset config
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

  // Navigate generation
  const handleGotoGen = useCallback((gen: number) => {
    if (gen < 0) gen = 0;
    if (gen >= gaHistory.length) gen = gaHistory.length - 1;
    setCurGen(gen);
  }, [gaHistory.length]);

  // Toggle play
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

  // Sync stocks
  const handleSyncStocks = useCallback(async () => {
    setCfgStatus('同步中...');
    await new Promise(r => setTimeout(r, 1500));
    setCfgStatus('同步完成 ✓');
    setTimeout(() => setCfgStatus(''), 2000);
  }, []);

  // Calculate valuation
  const handleCalcValuation = useCallback(() => {
    setShowPeMatrix(true);
    setShowPbMatrix(true);
    setShowSummary(true);
  }, []);

  // Fetch price
  const handleValFetchPrice = useCallback(() => {
    const stock = stockData[valCode] || stockData['2330'];
    setValPrice(stock.price);
  }, [valCode]);

  // Load tech analysis
  const handleLoadTechAnalysis = useCallback(() => {
    setTaStatus('載入中...');
    setTimeout(() => {
      setShowTaResult(true);
      setTaStatus('完成');
      setTimeout(() => setTaStatus(''), 2000);
    }, 800);
  }, []);

  // Copy prompt
  const handleCopyPrompt = useCallback(() => {
    navigator.clipboard.writeText(prompts[activePrompt as keyof typeof prompts]);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, [activePrompt]);

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

    // Best fitness line
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

    // Average fitness line
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

    // Current marker
    if (currentGAData) {
      const x = (curGen / (maxGens - 1)) * width;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Legend
    ctx.fillStyle = '#7bf0be';
    ctx.fillRect(10, height - 18, 20, 2);
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('Best', 35, height - 14);
    ctx.fillStyle = '#58d7ff';
    ctx.fillRect(70, height - 18, 20, 2);
    ctx.fillText('Avg', 95, height - 14);
  }, [gaHistory, curGen, maxGens, currentGAData]);

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
      ctx.textAlign = 'center';
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

    const industries = ['半導體', '電子製造', '金融', '電信', '石化'];
    const periods = [36, 48, 60, 72, 84];
    const colors = ['#7bf0be', '#58d7ff', '#b59cff', '#ffbb72', '#ff6b6b'];
    const maxPeriod = 96;

    industries.forEach((ind, i) => {
      const x = 30 + i * ((width - 60) / industries.length);
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

  // Draw TA chart
  useEffect(() => {
    const canvas = taChartRef.current;
    if (!canvas || !showTaResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const prices: number[] = [];
    let p = 100;
    for (let i = 0; i < 90; i++) {
      p += (Math.random() - 0.48) * 1.5;
      prices.push(p);
    }

    const last30 = prices.slice(-30);
    const priceRange = Math.max(...last30) - Math.min(...last30);
    const baseY = height - 40;
    const scale = (height - 60) / priceRange;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    last30.forEach((price, i) => {
      const x = 30 + i * (width - 60) / 29;
      const y = baseY - (price - Math.min(...last30)) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // MA5
    const ma5 = last30.map((_, i, arr) => {
      const slice = arr.slice(Math.max(0, i - 4), i + 1);
      return slice.reduce((a, b) => a + b) / slice.length;
    });

    ctx.strokeStyle = '#58d7ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ma5.forEach((v, i) => {
      const x = 30 + i * (width - 60) / (ma5.length - 1);
      const y = baseY - (v - Math.min(...last30)) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // MA20
    const ma20 = prices.slice(-60).map((_, i, arr) => {
      const slice = arr.slice(Math.max(0, i - 19), i + 1);
      return slice.reduce((a, b) => a + b) / slice.length;
    });

    ctx.strokeStyle = '#ffbb72';
    ctx.beginPath();
    ma20.forEach((v, i) => {
      const x = 30 + i * (width - 60) / (ma20.length - 1);
      const y = baseY - (v - Math.min(...last30)) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [showTaResult]);

  // Draw RSI chart
  useEffect(() => {
    const canvas = taRsiRef.current;
    if (!canvas || !showTaResult) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth || 400;
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const rsi: number[] = [];
    let r = 50;
    for (let i = 0; i < 30; i++) {
      r = r * 0.86 + (Math.random() * 30) * 0.14;
      rsi.push(r);
    }

    ctx.strokeStyle = '#333';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.lineTo(width - 30, 40);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, height - 40);
    ctx.lineTo(width - 30, height - 40);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#b59cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    rsi.forEach((v, i) => {
      const x = 30 + i * (width - 60) / (rsi.length - 1);
      const y = (1 - v / 100) * (height - 60) + 30;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText('70 (Overbought)', 30, 35);
    ctx.fillText('30 (Oversold)', 30, height - 25);
  }, [showTaResult]);

  // Cleanup play interval on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  // PE Matrix calculation
  const peMatrix = showPeMatrix ? [
    [valEpsBear * valPeBear, valEpsBear * valPeBase, valEpsBear * valPeBull],
    [valEpsBase * valPeBear, valEpsBase * valPeBase, valEpsBase * valPeBull],
    [valEpsBull * valPeBear, valEpsBull * valPeBase, valEpsBull * valPeBull]
  ] : [];

  // Current stock data
  const currentStock = stockData[selectedStock] || stockData['2330'];

  return (
    <>
      <div data-site-nav />

      {/* Hero Section */}
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow">
            <span className="live-dot"></span>碩士論文 · 電資工程研究所 · PPTS × GAPPTS
          </div>
          <h1>
            遺傳演算法於<span>利潤價格分布</span>為基礎的<br />
            交易策略最佳化技術之研究
          </h1>
          <p className="hero-sub">
            依論文方法重建的互動展示頁，核心流程是先用 PPTS 將歷史價格切成等距區間，計算各區間的平均利潤與達標機率，再用 GAPPTS 在 48 檔元大台灣 50 股票樣本上搜尋最佳參數組合。
          </p>
          <div className="hero-badges">
            <span className="badge">48 檔股票樣本</span>
            <span className="badge">2019–2023 訓練</span>
            <span className="badge">2024 測試</span>
            <span className="badge">PPTS</span>
            <span className="badge">GAPPTS</span>
          </div>
          <div className="stats-strip">
            <div className="stat-cell">
              <div className="stat-val" id="statSharpe">68.8%</div>
              <div className="stat-lbl">正報酬覆蓋率</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statReturn">48</div>
              <div className="stat-lbl">股票樣本數</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statWin">2019–2023</div>
              <div className="stat-lbl">訓練期間</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statTest">2024</div>
              <div className="stat-lbl">測試期間</div>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="tab-container">
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      <main className="tab-content">
        {/* 研究方法 Section */}
        <div className={`tab-panel ${activeTab === 'research' ? 'active' : ''}`} id="panel-research">
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">研究方法</div>
              <h2 className="section-title">PPTS × GAPPTS 研究流程</h2>
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
                <div className="algo-step">
                  <div className="icon">✅</div>
                  <div className="lbl">最佳策略</div>
                  <div className="sub">輸出逐檔最佳參數</div>
                </div>
              </div>
              <div className="grid-3">
                <div className="card">
                  <div className="card-title">染色體結構（29 bit）</div>
                  <table style={{ width: '100%', fontSize: '.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '6px', textAlign: 'left' }}>欄位</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>Bit 數</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>範圍</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px' }}>區間數 m</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>5</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>2–18</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px' }}>持有天數</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>6</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>1–30</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px' }}>目標利潤</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>10</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>1–10%</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px' }}>α 進場係數</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>8</td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>0.2–0.95</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: '8px', color: 'var(--green)', fontSize: '.78rem' }}>總計：29 bits</div>
                </div>
                <div className="card">
                  <div className="card-title">適應度函數</div>
                  <table style={{ width: '100%', fontSize: '.8rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '6px', color: 'var(--teal)' }}>Fitness =</td>
                        <td style={{ padding: '6px' }}>勝率 × 平均報酬 / 最大虧損</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px', color: 'var(--green)' }}>勝率</td>
                        <td style={{ padding: '6px' }}>正報酬交易筆數 / 總交易筆數</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px', color: 'var(--orange)' }}>平均報酬</td>
                        <td style={{ padding: '6px' }}>Σ(正報酬) / 正報酬筆數</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '6px', color: 'var(--red)' }}>最大虧損</td>
                        <td style={{ padding: '6px' }}>歷史最大單筆負報酬</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="card">
                  <div className="card-title">研究資料設計</div>
                  <div style={{ fontSize: '.82rem', lineHeight: '1.8', color: 'var(--muted)' }}>
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>母體：</span>元大台灣 50 成分股中的 48 檔股票<br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>訓練集：</span>2019–2023 歷史資料<br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>測試集：</span>2024 外樣本回測<br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>目標：</span>比較 GAPPTS、固定參數 PPTS 與 Buy & Hold
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">論文核心</div>
              <h2 className="section-title">PPTS 價格區間利潤邏輯</h2>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">所選個股的價格區間平均利潤 / 達標機率</div>
                  <div className="card-note">每個柱狀代表該價格區間的平均利潤，折線代表達成目標利潤的機率。</div>
                  <div className="chart-box">
                    <canvas id="returnDistChart" />
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">48 檔樣本績效分級</div>
                  <div className="card-note">論文把樣本分成「有效果」「一般」「無效果」三類。</div>
                  <div className="chart-box">
                    <canvas id="profitDistChart" />
                  </div>
                </div>
              </div>
              <div className="grid-3" style={{ marginTop: '14px' }}>
                <div className="card">
                  <div className="card-title">所選個股最佳化參數</div>
                  <div style={{ marginTop: '6px' }}>
                    <div className="kv-row"><span>m：</span><span>8</span></div>
                    <div className="kv-row"><span>持有：</span><span>12 天</span></div>
                    <div className="kv-row"><span>目標：</span><span>3.5%</span></div>
                    <div className="kv-row"><span>Fitness：</span><span style={{ color: 'var(--green)' }}>0.6823</span></div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">所選個股測試績效</div>
                  <div style={{ marginTop: '6px' }}>
                    <div className="kv-row"><span>報酬率：</span><span style={{ color: 'var(--green)' }}>+38.5%</span></div>
                    <div className="kv-row"><span>勝率：</span><span>72.3%</span></div>
                    <div className="kv-row"><span>最大虧損：</span><span style={{ color: 'var(--red)' }}>-8.2%</span></div>
                    <div className="kv-row"><span>交易次數：</span><span>24</span></div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">論文整體觀察</div>
                  <div style={{ marginTop: '6px' }}>
                    <div className="kv-row"><span>有效果：</span><span style={{ color: 'var(--green)' }}>18 檔</span></div>
                    <div className="kv-row"><span>一般：</span><span style={{ color: 'var(--orange)' }}>22 檔</span></div>
                    <div className="kv-row"><span>無效果：</span><span style={{ color: 'var(--red)' }}>8 檔</span></div>
                    <div className="kv-row"><span>平均 Fitness：</span><span>0.6158</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">回測結果</div>
              <h2 className="section-title">最佳策略的測試集表現</h2>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">測試集價格 + 買賣訊號</div>
                  <div className="chart-box"><canvas ref={priceChartRef} /></div>
                </div>
                <div className="card">
                  <div className="card-title">策略淨值曲線</div>
                  <div className="chart-box"><canvas ref={equityChartRef} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 互動體驗 Section */}
        <div className={`tab-panel ${activeTab === 'interactive' ? 'active' : ''}`} id="panel-interactive">
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">互動體驗</div>
              <h2 className="section-title">選股與 GAPPTS 參數產生策略</h2>
              <div className="ga-cfg-panel">
                <div className="ga-cfg-grid">
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="industryFilter">產業篩選</label>
                    <select
                      className="ga-cfg-input"
                      id="industryFilter"
                      value={industryFilter}
                      onChange={(e) => setIndustryFilter(e.target.value)}
                    >
                      <option value="全部產業">全部產業</option>
                      {Object.keys(industries).map(ind => (
                        <option key={ind} value={ind}>{ind}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="stockSelect">個股</label>
                    <select
                      className="ga-cfg-input"
                      id="stockSelect"
                      value={selectedStock}
                      onChange={(e) => setSelectedStock(e.target.value)}
                    >
                      {filteredStocks.map(s => (
                        <option key={s.code} value={s.code}>{s.code} {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgPop">族群規模 (POP)</label>
                    <input
                      className="ga-cfg-input"
                      id="cfgPop"
                      type="number"
                      value={cfgPop}
                      onChange={(e) => setCfgPop(parseInt(e.target.value) || 50)}
                      min="20"
                      max="120"
                      step="10"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgGens">最大世代數 (GENS)</label>
                    <input
                      className="ga-cfg-input"
                      id="cfgGens"
                      type="number"
                      value={cfgGens}
                      onChange={(e) => setCfgGens(parseInt(e.target.value) || 50)}
                      min="10"
                      max="80"
                      step="5"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgCR">交配率 (CR)</label>
                    <input
                      className="ga-cfg-input"
                      id="cfgCR"
                      type="number"
                      value={cfgCR}
                      onChange={(e) => setCfgCR(parseFloat(e.target.value) || 0.8)}
                      min="0.30"
                      max="1.00"
                      step="0.05"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgMR">突變率 (MR)</label>
                    <input
                      className="ga-cfg-input"
                      id="cfgMR"
                      type="number"
                      value={cfgMR}
                      onChange={(e) => setCfgMR(parseFloat(e.target.value) || 0.1)}
                      min="0.01"
                      max="0.30"
                      step="0.01"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-m">價格區間數 m</label>
                    <input
                      className="ga-cfg-input"
                      id="strat-m"
                      type="number"
                      value={stratM}
                      onChange={(e) => setStratM(parseInt(e.target.value) || 8)}
                      min="2"
                      max="20"
                      step="1"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-hold">持有天數</label>
                    <input
                      className="ga-cfg-input"
                      id="strat-hold"
                      type="number"
                      value={stratHold}
                      onChange={(e) => setStratHold(parseInt(e.target.value) || 5)}
                      min="1"
                      max="30"
                      step="1"
                    />
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-target">目標利潤 (%)</label>
                    <input
                      className="ga-cfg-input"
                      id="strat-target"
                      type="number"
                      value={stratTarget}
                      onChange={(e) => setStratTarget(parseFloat(e.target.value) || 3.0)}
                      min="0.5"
                      max="20"
                      step="0.5"
                    />
                  </div>
                </div>
                <div className="stock-meta">
                  <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                    <span style={{ color: 'var(--teal)' }}>產業：{currentStock.industry}</span>
                    <span style={{ color: 'var(--green)' }}>股價：{currentStock.price}</span>
                    <span style={{ color: 'var(--orange)' }}>EPS：{currentStock.eps}</span>
                  </div>
                </div>
                <div className="ga-cfg-actions">
                  <button className="btn btn-primary" id="btnRerun" onClick={handleRerunGA}>▶ 產生 GAPPTS 策略</button>
                  <button className="btn btn-ghost" onClick={handleResetGaCfg}>↩ 重置論文預設</button>
                  <button className="btn btn-ghost" id="btnSyncStocks" style={{ color: 'var(--teal)', borderColor: 'rgba(88,215,255,0.2)' }} onClick={handleSyncStocks}>📡 同步真實股價</button>
                  <span className="ga-cfg-status" id="cfgStatus" style={{ color: cfgStatus.includes('完成') ? 'var(--green)' : 'var(--teal)' }}>{cfgStatus}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">演算法模擬</div>
              <h2 className="section-title">GAPPTS 互動模擬器</h2>
              <div className="ga-controls">
                <button className="btn btn-ghost" id="btnFirst" onClick={() => handleGotoGen(0)}>⏮ 第一代</button>
                <button className="btn btn-ghost" id="btnPrev" onClick={() => handleGotoGen(curGen - 1)}>← 前一代</button>
                <div className="gen-display">第 {curGen + 1} 代 / {maxGens}</div>
                <button className="btn btn-ghost" id="btnNext" onClick={() => handleGotoGen(curGen + 1)}>下一代 →</button>
                <button className="btn btn-ghost" id="btnLast" onClick={() => handleGotoGen(gaHistory.length - 1)}>⏭ 最終代</button>
                <button className="btn btn-primary" id="btnPlay" onClick={handleTogglePlay}>
                  {isPlaying ? '⏸ 暫停' : '▶ 自動播放'}
                </button>
                <div className="fitness-badge">
                  Fitness {(currentGAData?.bestFitness || 0).toFixed(4)}
                </div>
              </div>
              <div className="ga-grid">
                <div className="card">
                  <div className="card-title">族群適應度收斂曲線</div>
                  <div className="chart-box"><canvas ref={convChartRef} /></div>
                </div>
                <div className="card">
                  <div className="card-title">第 {curGen + 1} 代族群 fitness 分布</div>
                  <div className="chart-box"><canvas ref={popDistRef} /></div>
                </div>
                <div className="card" style={{ gridColumn: '1/-1' }}>
                  <div className="card-title" style={{ marginBottom: '16px' }}>當代最佳染色體 → PPTS 參數</div>
                  {currentGAData?.best ? (
                    <div className="param-grid">
                      <div className="param-cell">
                        <div className="param-label">m (區間數)</div>
                        <div className="param-value">{currentGAData.best.m}</div>
                        <div className="param-hint">價格切成 {currentGAData.best.m} 個等距區間</div>
                      </div>
                      <div className="param-cell">
                        <div className="param-label">持有天數</div>
                        <div className="param-value">{currentGAData.best.hold}</div>
                        <div className="param-hint">買入後持有 {currentGAData.best.hold} 天</div>
                      </div>
                      <div className="param-cell">
                        <div className="param-label">目標利潤 (%)</div>
                        <div className="param-value">{currentGAData.best.target}%</div>
                        <div className="param-hint">區間達標門檻</div>
                      </div>
                      <div className="param-cell">
                        <div className="param-label">α 進場係數</div>
                        <div className="param-value">{currentGAData.best.alpha}</div>
                        <div className="param-hint">機率門檻係數</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>等待 GA 結果</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">方法比較</div>
              <h2 className="section-title">GAPPTS vs 固定參數 PPTS vs Buy & Hold</h2>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">所選個股報酬比較</div>
                  <div className="chart-box"><canvas ref={compareChartRef} /></div>
                </div>
                <div className="card">
                  <div className="card-title">搜尋效率比較</div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '20px' }}>
                    <div>
                      <div style={{ background: '#7bf0be', width: '100px', height: '20px', borderRadius: '4px' }} />
                      <div style={{ fontSize: '.78rem', color: '#888', marginTop: '4px' }}>GAPPTS (最佳)</div>
                    </div>
                    <div>
                      <div style={{ background: '#58d7ff', width: '70px', height: '20px', borderRadius: '4px' }} />
                      <div style={{ fontSize: '.78rem', color: '#888', marginTop: '4px' }}>PPTS</div>
                    </div>
                    <div>
                      <div style={{ background: '#666', width: '40px', height: '20px', borderRadius: '4px' }} />
                      <div style={{ fontSize: '.78rem', color: '#888', marginTop: '4px' }}>Random</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 技術工具 Section */}
        <div className={`tab-panel ${activeTab === 'tools' ? 'active' : ''}`} id="panel-tools">
          {/* 技術指標 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">技術指標補充</div>
              <h2 className="section-title">布林通道 · MACD · KD · 籌碼面</h2>
              <div className="indicator-grid">
                <div className="ind-card">
                  <div className="ind-icon">📊</div>
                  <div>
                    <div className="ind-title">布林通道 Bollinger Bands</div>
                    <div className="ind-body">上下軌 = MA20 ± 2σ，通道寬度代表市場波動程度。通道收斂（Width ≤ 70% 均寬）是即將變盤的預警訊號。</div>
                    <div className="ind-signal">收斂訊號：Width ≤ 均寬 × 0.70</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">📉</div>
                  <div>
                    <div className="ind-title">MACD 動能指標</div>
                    <div className="ind-body">DIF = EMA12 − EMA26，Signal = EMA9(DIF)，OSC = DIF − Signal。OSC 直方圖由紅轉綠（負翻正）代表短期動能開始回升。</div>
                    <div className="ind-signal">確認訊號：OSC 由負轉正（柱狀翻綠）</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">🎯</div>
                  <div>
                    <div className="ind-title">KD 隨機指標</div>
                    <div className="ind-body">RSV 計算最近 9 日相對位置，K = 2/3 × K_prev + 1/3 × RSV，D = 2/3 × D_prev + 1/3 × K。K 值從低檔向上穿越 D 值為黃金交叉。</div>
                    <div className="ind-signal">黃金交叉：K 由低檔上穿 D（K {"<"} 50）</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">🏦</div>
                  <div>
                    <div className="ind-title">籌碼面 — 法人動向</div>
                    <div className="ind-body">外資 + 投信 + 自營商連續買超為多方籌碼訊號。主力買超千張以上且散戶同步賣超，代表聰明錢在低檔積累。</div>
                    <div className="ind-signal">多方籌碼：法人連 3 日淨買超</div>
                  </div>
                </div>
              </div>
              <div className="grid-2" style={{ marginTop: '18px' }}>
                <div className="card">
                  <div className="card-title">所選個股 · 布林通道（測試集）</div>
                  <div className="card-note">實線為收盤價，橙色虛線為布林上下軌，半透明帶為通道範圍。</div>
                  <div className="chart-box"><canvas ref={bbandChartRef} /></div>
                </div>
                <div className="card">
                  <div className="card-title">KD 隨機指標 + MACD OSC（測試集）</div>
                  <div className="card-note">藍/橙線為 K/D 值（左軸 0–100），綠/紅直方圖為 MACD OSC（右軸）。</div>
                  <div className="chart-box"><canvas ref={macdKdRef} /></div>
                </div>
              </div>
            </div>
          </div>

          {/* AI 估值計算器 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">AI 輔助估值</div>
              <h2 className="section-title">PE × PB 情境矩陣計算器</h2>
              <div className="val-layout">
                <div className="val-inputs card">
                  <div className="card-title">估值輸入</div>
                  <div className="val-form">
                    <div className="val-field">
                      <label>股票代號</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          className="ga-cfg-input"
                          id="valCode"
                          type="text"
                          value={valCode}
                          onChange={(e) => setValCode(e.target.value)}
                          placeholder="例：2330"
                          style={{ flex: 1 }}
                        />
                        <button className="btn btn-ghost" id="valFetchBtn" onClick={handleValFetchPrice}>抓現價</button>
                      </div>
                      <div className="ga-cfg-hint" id="valPriceHint" style={{ color: valPrice ? 'var(--green)' : undefined }}>
                        {valPrice ? `現價：${valPrice} 元` : '—'}
                      </div>
                    </div>
                    <div className="val-field-group">
                      <div className="val-field">
                        <label>預估 EPS 悲觀 ($)</label>
                        <input className="ga-cfg-input" type="number" value={valEpsBear} onChange={(e) => setValEpsBear(parseFloat(e.target.value) || 32)} step="0.5" />
                      </div>
                      <div className="val-field">
                        <label>預估 EPS 基本 ($)</label>
                        <input className="ga-cfg-input" type="number" value={valEpsBase} onChange={(e) => setValEpsBase(parseFloat(e.target.value) || 38)} step="0.5" />
                      </div>
                      <div className="val-field">
                        <label>預估 EPS 樂觀 ($)</label>
                        <input className="ga-cfg-input" type="number" value={valEpsBull} onChange={(e) => setValEpsBull(parseFloat(e.target.value) || 45)} step="0.5" />
                      </div>
                    </div>
                    <div className="val-field-group">
                      <div className="val-field">
                        <label>PE 悲觀 (倍)</label>
                        <input className="ga-cfg-input" type="number" value={valPeBear} onChange={(e) => setValPeBear(parseFloat(e.target.value) || 18)} step="1" />
                      </div>
                      <div className="val-field">
                        <label>PE 基本 (倍)</label>
                        <input className="ga-cfg-input" type="number" value={valPeBase} onChange={(e) => setValPeBase(parseFloat(e.target.value) || 22)} step="1" />
                      </div>
                      <div className="val-field">
                        <label>PE 樂觀 (倍)</label>
                        <input className="ga-cfg-input" type="number" value={valPeBull} onChange={(e) => setValPeBull(parseFloat(e.target.value) || 25)} step="1" />
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0', paddingTop: '10px' }}>
                      <div className="val-field-group">
                        <div className="val-field">
                          <label>預估 BPS ($)</label>
                          <input className="ga-cfg-input" type="number" value={valBps} onChange={(e) => setValBps(parseFloat(e.target.value) || 120)} step="1" />
                        </div>
                        <div className="val-field">
                          <label>PB 悲觀 (倍)</label>
                          <input className="ga-cfg-input" type="number" value={valPbBear} onChange={(e) => setValPbBear(parseFloat(e.target.value) || 2.0)} step="0.1" />
                        </div>
                        <div className="val-field">
                          <label>PB 基本 (倍)</label>
                          <input className="ga-cfg-input" type="number" value={valPbBase} onChange={(e) => setValPbBase(parseFloat(e.target.value) || 2.5)} step="0.1" />
                        </div>
                        <div className="val-field">
                          <label>PB 樂觀 (倍)</label>
                          <input className="ga-cfg-input" type="number" value={valPbBull} onChange={(e) => setValPbBull(parseFloat(e.target.value) || 3.0)} step="0.1" />
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '6px' }} onClick={handleCalcValuation}>計算估值矩陣</button>
                  </div>
                </div>
                <div className="val-results">
                  {showPeMatrix && (
                    <div className="card" id="valPeCard">
                      <div className="card-title">PE 法估值矩陣 <span className="badge" style={{ fontSize: '.7rem' }}>悲 / 基 / 樂</span></div>
                      <div className="card-note">單位：元。星號 ⭐ 為基本情境交叉點。</div>
                      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                        <table style={{ width: '100%', fontSize: '.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: '8px' }}>EPS \ PE</th>
                              <th style={{ padding: '8px' }}>悲觀 {valPeBear}倍</th>
                              <th style={{ padding: '8px' }}>基本 {valPeBase}倍</th>
                              <th style={{ padding: '8px' }}>樂觀 {valPeBull}倍</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px' }}>悲觀 {valEpsBear}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[0]?.[0]?.toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[0]?.[1]?.toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[0]?.[2]?.toFixed(0)}</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px' }}>基本 {valEpsBase}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[1]?.[0]?.toFixed(0)}</td>
                              <td style={{ padding: '8px', background: 'rgba(123,240,190,0.1)' }}>⭐ {peMatrix[1]?.[1]?.toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[1]?.[2]?.toFixed(0)}</td>
                            </tr>
                            <tr>
                              <td style={{ padding: '8px' }}>樂觀 {valEpsBull}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[2]?.[0]?.toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[2]?.[1]?.toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{peMatrix[2]?.[2]?.toFixed(0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {showPbMatrix && (
                    <div className="card" id="valPbCard" style={{ marginTop: showPeMatrix ? '12px' : 0 }}>
                      <div className="card-title">PB 法估值矩陣</div>
                      <div style={{ overflowX: 'auto', marginTop: '10px' }}>
                        <table style={{ width: '100%', fontSize: '.8rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              <th style={{ padding: '8px' }}>BPS</th>
                              <th style={{ padding: '8px' }}>PB {valPbBear}</th>
                              <th style={{ padding: '8px' }}>PB {valPbBase}</th>
                              <th style={{ padding: '8px' }}>PB {valPbBull}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ padding: '8px' }}>{valBps}</td>
                              <td style={{ padding: '8px' }}>{(valBps * valPbBear).toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{(valBps * valPbBase).toFixed(0)}</td>
                              <td style={{ padding: '8px' }}>{(valBps * valPbBull).toFixed(0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {showSummary && (
                    <div className="card" id="valSummaryCard" style={{ marginTop: showPeMatrix || showPbMatrix ? '12px' : 0 }}>
                      <div className="card-title">重疊區間分析</div>
                      <div className="kv-rows">
                        <div className="kv-row">
                          <span>PE 基本估值：</span>
                          <span style={{ color: 'var(--teal)' }}>{(valEpsBase * valPeBase).toFixed(0)} 元</span>
                        </div>
                        <div className="kv-row">
                          <span>PB 基本估值：</span>
                          <span style={{ color: 'var(--teal)' }}>{(valBps * valPbBase).toFixed(0)} 元</span>
                        </div>
                        <div className="kv-row">
                          <span>重疊區間：</span>
                          <span style={{ color: 'var(--green)' }}>
                            {Math.min(valEpsBase * valPeBase, valBps * valPbBase).toFixed(0)} – {Math.max(valEpsBase * valPeBase, valBps * valPbBase).toFixed(0)} 元
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 技術分析看板 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">技術分析</div>
              <h2 className="section-title">均線 × 支撐壓力即時看板</h2>
              <div className="ta-controls">
                <div className="ga-cfg-field">
                  <label className="ga-cfg-label" htmlFor="taStockSelect">個股</label>
                  <select
                    className="ga-cfg-input"
                    id="taStockSelect"
                    value={taStock}
                    onChange={(e) => setTaStock(e.target.value)}
                  >
                    {Object.entries(stockData).map(([code, data]) => (
                      <option key={code} value={code}>{code} {data.name}</option>
                    ))}
                  </select>
                </div>
                <div className="ga-cfg-field">
                  <label className="ga-cfg-label" htmlFor="taCustomCode">或自行輸入代號</label>
                  <input
                    className="ga-cfg-input"
                    id="taCustomCode"
                    type="text"
                    value={taCustomCode}
                    onChange={(e) => setTaCustomCode(e.target.value)}
                    placeholder="例：2454"
                  />
                </div>
                <button className="btn btn-primary" onClick={handleLoadTechAnalysis}>載入分析</button>
                <span className="ga-cfg-hint" id="taStatus" style={{ alignSelf: 'center', color: taStatus === '完成' ? 'var(--green)' : undefined }}>{taStatus}</span>
              </div>
              {showTaResult && (
                <div id="taResultArea">
                  <div className="ta-signal-strip" id="taSignals">
                    <span style={{ color: 'var(--green)' }}>✅ MA5 {" > "} MA20 {" > "} MA60（多頭排列）</span>
                    <span style={{ color: 'var(--green)' }}>✅ RSI 50 中性偏多</span>
                    <span style={{ color: 'var(--orange)' }}>⚠ 接近壓力區 105</span>
                  </div>
                  <div className="grid-2" style={{ marginTop: '14px' }}>
                    <div className="card">
                      <div className="card-title">價格 + 均線</div>
                      <div className="chart-box" style={{ height: '240px' }}><canvas ref={taChartRef} /></div>
                    </div>
                    <div className="card">
                      <div className="card-title">RSI(14)</div>
                      <div className="chart-box" style={{ height: '240px' }}><canvas ref={taRsiRef} /></div>
                    </div>
                  </div>
                  <div className="grid-3" style={{ marginTop: '14px' }}>
                    <div className="card">
                      <div className="card-title">均線數值</div>
                      <div className="kv-rows" style={{ marginTop: '8px' }}>
                        <div className="kv-row"><span>MA5：</span><span style={{ color: 'var(--teal)' }}>102.35</span></div>
                        <div className="kv-row"><span>MA20：</span><span style={{ color: 'var(--orange)' }}>98.72</span></div>
                        <div className="kv-row"><span>MA60：</span><span style={{ color: 'var(--purple)' }}>95.18</span></div>
                        <div className="kv-row"><span>MA5 {" > "} MA20：</span><span style={{ color: 'var(--green)' }}>多頭排列 ✓</span></div>
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-title">關鍵支撐壓力</div>
                      <div style={{ marginTop: '8px' }}>
                        <div className="kv-row"><span style={{ color: 'var(--green)' }}>支撐：</span><span>98.5 / 95.2</span></div>
                        <div className="kv-row"><span style={{ color: 'var(--red)' }}>壓力：</span><span>105.8 / 110.0</span></div>
                        <div className="kv-row"><span>突破區間：</span><span style={{ color: 'var(--teal)' }}>102–105</span></div>
                      </div>
                    </div>
                    <div className="card">
                      <div className="card-title">技術訊號判讀</div>
                      <div style={{ marginTop: '8px', fontSize: '.82rem', lineHeight: '1.9' }}>
                        <div style={{ color: 'var(--green)' }}>✅ MA5 {" > "} MA20 {" > "} MA60（多頭排列）</div>
                        <div style={{ color: 'var(--green)' }}>✅ RSI 50 中性偏多</div>
                        <div style={{ color: 'var(--orange)' }}>⚠ 接近壓力區 105</div>
                        <div style={{ marginTop: '8px', color: 'var(--muted)' }}>
                          綜合判斷：短線動能偏多，但需突破 105 才能確認中線趨勢反轉。建議等待回測支撐 98.5 附近進場。
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 量化工具速查 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">量化工具速查</div>
              <h2 className="section-title">市場結構 × VIX × 籌碼 × 策略參考</h2>
              <div className="grid-2" style={{ marginBottom: '18px' }}>
                <div className="card">
                  <div className="card-title">VIX 恐慌指數速查</div>
                  <div className="card-note">VIX 越高，未來 1 個月報酬統計上越好（均值回歸）</div>
                  <table className="ref-table" style={{ marginTop: '10px' }}>
                    <thead><tr><th>VIX 區間</th><th>狀態</th><th>統計預期報酬</th></tr></thead>
                    <tbody>
                      <tr><td className="ref-val">{"< 12"}</td><td><span className="ref-tag" style={{ color: 'var(--green)' }}>極度平靜</span></td><td>正常水位</td></tr>
                      <tr><td className="ref-val">12–20</td><td><span className="ref-tag">正常</span></td><td>正常水位</td></tr>
                      <tr><td className="ref-val">20–30</td><td><span className="ref-tag" style={{ color: 'var(--orange)' }}>緊張</span></td><td>↑ 略有正偏</td></tr>
                      <tr><td className="ref-val">30–40</td><td><span className="ref-tag" style={{ color: 'var(--red)' }}>恐慌</span></td><td className="ref-val" style={{ color: 'var(--green)' }}>+3% / 月</td></tr>
                      <tr><td className="ref-val">{"> 40"}</td><td><span className="ref-tag" style={{ color: 'var(--red)', fontWeight: '700' }}>崩盤級</span></td><td className="ref-val" style={{ color: 'var(--green)', fontWeight: '700' }}>+6% / 月</td></tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: '12px', fontSize: '.78rem', color: 'var(--muted)' }}>
                    Contango（正價差）= 遠月 {" > "} 近月 = 平靜（80% 時間）<br />
                    Backwardation（逆價差）= 近月 {" > "} 遠月 = 危機爆發
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">量比籌碼判讀</div>
                  <div className="card-note">量先價行 — 量比 = 當前成交量 / N 日平均成交量</div>
                  <table className="ref-table" style={{ marginTop: '10px' }}>
                    <thead><tr><th>量比</th><th>成交量</th><th>價格</th><th>解讀</th></tr></thead>
                    <tbody>
                      <tr><td className="ref-val">{"> 2"}</td><td>量增</td><td style={{ color: 'var(--green)' }}>價漲</td><td>主力買進 ✅</td></tr>
                      <tr><td className="ref-val">{"> 2"}</td><td>量增</td><td style={{ color: 'var(--red)' }}>價跌</td><td style={{ color: 'var(--red)' }}>主力出貨 ⚠️</td></tr>
                      <tr><td className="ref-val">1–1.5</td><td>正常</td><td>—</td><td>正常市況</td></tr>
                      <tr><td className="ref-val">{"< 0.5"}</td><td>量縮</td><td style={{ color: 'var(--green)' }}>價漲</td><td>力道不足</td></tr>
                      <tr><td className="ref-val">{"< 0.5"}</td><td>量縮</td><td style={{ color: 'var(--red)' }}>價跌</td><td style={{ color: 'var(--green)' }}>跌勢將盡</td></tr>
                    </tbody>
                  </table>
                  <div className="quant-golden-box" style={{ marginTop: '12px' }}>
                    黃金組合：量比 {"<"} 2 + 法人連續買超 + 融資餘額下降 = 強烈做多訊號
                  </div>
                </div>
              </div>
              <div className="card" style={{ marginBottom: '18px' }}>
                <div className="card-title">商品工具箱比較：個股期 vs 融資 vs 融券</div>
                <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                  <table className="ref-table" style={{ width: '100%' }}>
                    <thead>
                      <tr><th>項目</th><th style={{ color: 'var(--green)' }}>個股期貨 ✅</th><th>融資</th><th>融券</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>槓桿</td><td className="ref-val" style={{ color: 'var(--green)', fontWeight: '700' }}>7.4 倍</td><td className="ref-val">2.5 倍</td><td className="ref-val">1.1 倍</td></tr>
                      <tr><td>做空</td><td style={{ color: 'var(--green)' }}>✅ 可</td><td style={{ color: 'var(--red)' }}>❌ 不可</td><td style={{ color: 'var(--green)' }}>✅ 可</td></tr>
                      <tr><td>持有成本</td><td style={{ color: 'var(--green)' }}>幾乎零</td><td style={{ color: 'var(--red)' }}>6–7%/年利息</td><td>借券費+回補</td></tr>
                      <tr><td>強制回補</td><td style={{ color: 'var(--green)' }}>❌ 無</td><td style={{ color: 'var(--green)' }}>❌ 無</td><td style={{ color: 'var(--red)' }}>✅ 有</td></tr>
                      <tr><td>交易稅</td><td style={{ color: 'var(--green)' }}>十萬分之 2</td><td>千分之 3</td><td>千分之 3</td></tr>
                      <tr><td>一口規格</td><td>2,000 股</td><td>—</td><td>—</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">台指期規格速查</div>
                  <table className="ref-table" style={{ marginTop: '10px' }}>
                    <thead><tr><th>商品</th><th>每點</th><th>保證金</th><th>槓桿</th></tr></thead>
                    <tbody>
                      <tr><td>大台 (TX)</td><td className="ref-val">200 元</td><td className="ref-val">~18 萬</td><td className="ref-val">15–20×</td></tr>
                      <tr><td>小台 (MTX)</td><td className="ref-val">50 元</td><td className="ref-val">~4.5 萬</td><td className="ref-val">15–20×</td></tr>
                      <tr><td>微台</td><td className="ref-val">12.5 元</td><td className="ref-val">~1.1 萬</td><td className="ref-val">15–20×</td></tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: '10px', fontSize: '.78rem', color: 'var(--muted)', lineHeight: '1.8' }}>
                    結算：每月第三個禮拜三<br />
                    日盤：08:45–13:45 ／ 夜盤：15:00–翌日 05:00
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">台指期日內均值回歸策略模板</div>
                  <div className="strategy-recipe">
                    <div className="recipe-row"><span className="recipe-key">進場</span><span>09:00 前累計漲跌幅 {"<"} 0.5%，逆勢進場</span></div>
                    <div className="recipe-row"><span className="recipe-key">止盈</span><span>跳空缺口 50% 回補</span></div>
                    <div className="recipe-row"><span className="recipe-key">止損</span><span>−30 點</span></div>
                    <div className="recipe-row"><span className="recipe-key">工具</span><span>小台 1 口（保證金 ~4.5 萬）</span></div>
                    <div className="recipe-row"><span className="recipe-key">風控</span><span>單日最多 2 次 · 連虧 3 天暫停</span></div>
                  </div>
                  <div className="quant-golden-box" style={{ marginTop: '10px' }}>
                    均值回歸適用盤整行情；勝率 60–70%，賺賠比偏小
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 附錄資料 Section */}
        <div className={`tab-panel ${activeTab === 'appendix' ? 'active' : ''}`} id="panel-appendix">
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">實證發現</div>
              <h2 className="section-title">股票分類與最佳訓練期間</h2>
              <div className="grid-3" style={{ marginBottom: '18px' }}>
                <div className="card" style={{ borderTop: '3px solid var(--blue)' }}>
                  <div className="card-title" style={{ color: 'var(--blue)' }}>長期穩定型 · 5–8 年</div>
                  <div style={{ fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px' }}>
                    中華電 (2412) · 台塑 (1301) · 合庫金 (5880)<br />
                    <span style={{ color: 'var(--dim)' }}>產業特性穩定、現金流可預期</span><br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>建議：</span>年度重新訓練
                  </div>
                </div>
                <div className="card" style={{ borderTop: '3px solid var(--green)' }}>
                  <div className="card-title" style={{ color: 'var(--green)' }}>中期轉型型 · 4–6 年</div>
                  <div style={{ fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px' }}>
                    聯電 (2303) · 富邦金 (2881) · 廣達 (2382)<br />
                    <span style={{ color: 'var(--dim)' }}>產業週期明顯、有轉型需求</span><br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>建議：</span>半年重新訓練
                  </div>
                </div>
                <div className="card" style={{ borderTop: '3px solid var(--orange)' }}>
                  <div className="card-title" style={{ color: 'var(--orange)' }}>短期動態型 · 3–5 年</div>
                  <div style={{ fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px' }}>
                    聯發科 (2454) · 鴻海 (2317) · 日月光 (3711)<br />
                    <span style={{ color: 'var(--dim)' }}>國際供應鏈高度敏感、波動大</span><br />
                    <span style={{ color: 'var(--green)', fontWeight: '600' }}>建議：</span>3–4 個月重新訓練
                  </div>
                </div>
              </div>
              <div className="grid-2" style={{ marginBottom: '18px' }}>
                <div className="card">
                  <div className="card-title">代表性個股 fitness 排名</div>
                  <div className="card-note">聯電在中期轉型型中取得最高 fitness 0.7058，聯發科次之。</div>
                  <div className="chart-box"><canvas ref={fitnessRankRef} /></div>
                </div>
                <div className="card">
                  <div className="card-title">各產業最佳訓練期間範圍</div>
                  <div className="card-note">科技類偏短，金融適中，電信/石化等傳統產業偏長。</div>
                  <div className="chart-box"><canvas ref={industryPeriodRef} /></div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">高適應度股票的共通參數特徵</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '12px' }}>
                  <div style={{ padding: '14px', background: 'rgba(123,240,190,0.06)', borderRadius: '12px', border: '1px solid rgba(123,240,190,0.15)' }}>
                    <div style={{ color: 'var(--green)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600' }}>目標獲利率</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '700', margin: '4px 0' }}>低水位</div>
                    <div style={{ color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6' }}>避免過度貪婪</div>
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(88,215,255,0.06)', borderRadius: '12px', border: '1px solid rgba(88,215,255,0.15)' }}>
                    <div style={{ color: 'var(--teal)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600' }}>持有天數</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '700', margin: '4px 0' }}>18–29 天</div>
                    <div style={{ color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6' }}>中短期策略</div>
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(181,156,255,0.06)', borderRadius: '12px', border: '1px solid rgba(181,156,255,0.15)' }}>
                    <div style={{ color: 'var(--purple)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600' }}>α 進場係數</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '700', margin: '4px 0' }}>0.4–0.8</div>
                    <div style={{ color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6' }}>中等門檻</div>
                  </div>
                  <div style={{ padding: '14px', background: 'rgba(255,188,114,0.06)', borderRadius: '12px', border: '1px solid rgba(255,188,114,0.15)' }}>
                    <div style={{ color: 'var(--orange)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600' }}>染色體結構</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '700', margin: '4px 0' }}>29 bit</div>
                    <div style={{ color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6' }}>區間5·週期6·目標10·α8</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">文獻對照</div>
              <h2 className="section-title">GAPPTS 相對其他演算法的定位</h2>
              <div className="card">
                <div className="card-title">主流預測演算法比較表</div>
                <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--muted)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px' }}>演算法類別</th>
                        <th style={{ padding: '10px 12px' }}>預測精度</th>
                        <th style={{ padding: '10px 12px' }}>計算複雜度</th>
                        <th style={{ padding: '10px 12px' }}>適用資料規模</th>
                        <th style={{ padding: '10px 12px' }}>解釋性</th>
                        <th style={{ padding: '10px 12px' }}>非線性捕捉</th>
                      </tr>
                    </thead>
                    <tbody>
                      {algos.map(a => (
                        <tr
                          key={a.name}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => {
                            setStrategyContent(a.name === 'GAPPTS' 
                              ? 'GAPPTS 結合基因演算法的全域搜索與 PPTS 的可解釋交易規則。策略流程：(1) 初始化族群 (2) 評估適應度 (3) 輪盤選擇 (4) 單點交叉 (5) 位元突變 (6) 重複直到收斂。優點：可解釋、全域搜索、避免局部最優。缺點：需大量參數調優、收斂時間長。'
                              : a.name === 'LSTM'
                              ? 'LSTM 可捕捉長期時間依賴性，適合股價趨勢預測。輸入特徵包括 OHLCV、技術指標、宏觀變量。優點：長期依賴、精度高。缺點：黑盒子、解釋性低、需要大量資料。'
                              : `${a.name} 是一種常用的機器學習演算法，在時間序列預測中有其應用場景。`
                            );
                            setShowStrategy(true);
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(123,240,190,0.05)')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <td style={{ padding: '10px 12px', color: 'var(--teal)' }}>{a.name}</td>
                          <td style={{ padding: '10px 12px' }}>{a.precision}</td>
                          <td style={{ padding: '10px 12px' }}>{a.complexity}</td>
                          <td style={{ padding: '10px 12px' }}>{a.scale}</td>
                          <td style={{ padding: '10px 12px' }}>{a.explain}</td>
                          <td style={{ padding: '10px 12px' }}>{a.nonlinear}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card-note" style={{ marginTop: '14px', lineHeight: '1.8' }}>
                  <span style={{ color: 'var(--green)', fontWeight: '600' }}>GAPPTS 定位：</span>
                  結合基因演算法的全域搜索能力與 PPTS 的可解釋交易規則，在中型資料規模下取得高解釋性與高非線性捕捉的平衡。
                </div>
                {showStrategy && (
                  <div style={{ marginTop: '20px', padding: '18px', borderRadius: '12px', border: '1px solid rgba(123,240,190,0.2)', background: 'rgba(123,240,190,0.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div style={{ fontSize: '.8rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>選取演算法的交易策略</div>
                      <button onClick={() => setShowStrategy(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px' }}>✕</button>
                    </div>
                    <div style={{ fontSize: '.85rem', lineHeight: '1.7' }}>{strategyContent}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Prompt 模板庫 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">AI 分析工具</div>
              <h2 className="section-title">Prompt 模板庫</h2>
              <p className="section-sub">7 個經過實戰驗證的金融分析 Prompt 模板，點「複製」即可貼入 ChatGPT / Claude 使用。</p>
              <div className="prompt-tabs" id="promptTabs">
                {Object.entries(prompts).map(([key, _]) => (
                  <button
                    key={key}
                    className={`prompt-tab ${activePrompt === key ? 'active' : ''}`}
                    onClick={() => setActivePrompt(key)}
                  >
                    {key === 'summary' && '📊 '}
                    {key === 'technical' && '📈 '}
                    {key === 'macro' && '🌐 '}
                    {key === 'news' && '📰 '}
                    {key === 'compare' && '🔍 '}
                    {key === 'risk' && '⚠️ '}
                    {key === 'strategy' && '💡 '}
                    {key === 'summary' && '財報摘要'}
                    {key === 'technical' && '技術分析'}
                    {key === 'macro' && '總經判讀'}
                    {key === 'news' && '新聞解讀'}
                    {key === 'compare' && '產業比較'}
                    {key === 'risk' && '風險評估'}
                    {key === 'strategy' && '策略建議'}
                  </button>
                ))}
              </div>
              <div className="prompt-body card" id="promptBody">
                <div className="prompt-content">
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '.85rem', lineHeight: '1.7' }}>
                    {prompts[activePrompt as keyof typeof prompts]}
                  </pre>
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: '12px' }}
                    onClick={handleCopyPrompt}
                  >
                    {copiedPrompt ? '✅ 已複製！' : '📋 複製 Prompt'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 課程複習 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">課程複習</div>
              <h2 className="section-title">今日重點 × 工具箱整理</h2>
              <div className="recap-action-box">
                <div className="recap-action-title">本週行動建議</div>
                <div className="recap-action-grid">
                  <div className="recap-action-item">
                    <div className="recap-action-num">01</div>
                    <div className="recap-action-text">用<strong>財經M平方</strong>查一次 PMI 與 Fed 利率點陣圖，了解目前總經週期位置</div>
                  </div>
                  <div className="recap-action-item">
                    <div className="recap-action-num">02</div>
                    <div className="recap-action-text">對持有的個股，用<strong>財報狗</strong>確認最近 4 季 EPS 趨勢與毛利率變化</div>
                  </div>
                  <div className="recap-action-item">
                    <div className="recap-action-num">03</div>
                    <div className="recap-action-text">把上方<strong>Prompt 模板庫</strong>的「財報摘要」模板存起來，下次法說會直接用</div>
                  </div>
                  <div className="recap-action-item">
                    <div className="recap-action-num">04</div>
                    <div className="recap-action-text">試著用<strong>PE × PB 估值計算器</strong>對一支你熟悉的股票跑一次三情境估值</div>
                  </div>
                </div>
              </div>
              <div className="recap-compliance">
                <span style={{ color: 'var(--orange)', fontWeight: '700' }}>合規鐵律</span>
                &ensp;🚫 不薦股 &ensp; 🚫 不保證報酬 &ensp; ✅ 標明資料時效 &ensp; ✅ 所有數字回原始來源驗證 &ensp; ✅ AI 輔助須人工審閱
              </div>
            </div>
          </div>
        </div>
      </main>

      <div data-site-footer />
      <button className="scroll-top" aria-label="返回頂部">↑</button>
    </>
  );
}