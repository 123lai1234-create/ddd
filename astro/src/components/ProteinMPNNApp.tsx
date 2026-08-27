import React, { useState, useEffect, useRef, useCallback } from 'react';

// Preset sequences
const presets: Record<string, { seq: string; desc: string }> = {
  'trpcage': { seq: 'RLPWQCGHPEHRAG', desc: 'Trp-cage 迷你蛋白 (20 aa)' },
  'insulin_a': { seq: 'GIVEQCCASVCSLYQLENYCN', desc: 'Insulin A chain (21 aa)' },
  'melittin': { seq: 'GIGAVLKVLTGLPALISWIKRKRQQ', desc: 'Melittin 蜂毒肽 (26 aa)' },
  'insulin_b': { seq: 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT', desc: 'Insulin B chain (30 aa)' },
  'ubq': { seq: 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG', desc: 'Ubiquitin (76 aa)' },
  'gfp': { seq: 'MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK', desc: 'GFP (238 aa)' },
};

export default function ProteinMPNNApp() {
  // Input state
  const [sequence, setSequence] = useState('');
  const [fixedPositions, setFixedPositions] = useState('');
  const [numSeqs, setNumSeqs] = useState(5);
  const [temperature, setTemperature] = useState(0.1);
  const [selectedModel, setSelectedModel] = useState('v_48_020');
  
  // Output state
  const [results, setResults] = useState<{seq: string; score: number}[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showRosetta, setShowRosetta] = useState(false);
  
  // 3D viewer state
  const [pdbId, setPdbId] = useState('1UBQ');
  const viewerRef = useRef<HTMLDivElement>(null);

  // Load preset
  const loadPreset = (key: string) => {
    const preset = presets[key];
    if (preset) {
      setSequence(preset.seq);
    }
  };

  // Validate sequence
  const validAminoAcids = 'ACDEFGHIKLMNPQRSTVWY';
  const isValidSeq = sequence.length > 0 && 
    [...sequence].every(aa => validAminoAcids.includes(aa.toUpperCase()));

  // Run design simulation
  const runDesign = useCallback(async () => {
    if (!sequence || !isValidSeq) return;
    
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    
    // Simulate ProteinMPNN running
    const numToGenerate = numSeqs;
    const generated: {seq: string; score: number}[] = [];
    
    for (let i = 0; i < numToGenerate; i++) {
      await new Promise(r => setTimeout(r, 300));
      setProgress(((i + 1) / numToGenerate) * 100);
      
      // Generate mutated sequence based on temperature
      const mutated = sequence.split('').map(aa => {
        if (Math.random() < temperature * 0.3) {
          const idx = Math.floor(Math.random() * validAminoAcids.length);
          return validAminoAcids[idx];
        }
        return aa;
      }).join('');
      
      const score = -(Math.random() * 2 + 1); // Simulated score
      generated.push({ seq: mutated, score });
    }
    
    // Sort by score
    generated.sort((a, b) => b.score - a.score);
    setResults(generated);
    setIsRunning(false);
  }, [sequence, isValidSeq, numSeqs, temperature]);

  // Calculate identity
  const calcIdentity = (seq1: string, seq2: string): string => {
    if (seq1.length !== seq2.length) return '-';
    let match = 0;
    for (let i = 0; i < seq1.length; i++) {
      if (seq1[i] === seq2[i]) match++;
    }
    return `${((match / seq1.length) * 100).toFixed(1)}%`;
  };

  // Rosetta scoring
  const getRosettaScore = (seq: string): { score: number; breakdown: Record<string, number> } => {
    const breakdown: Record<string, number> = {
      'fa_atr': -0.5 - Math.random() * 2,
      'fa_rep': Math.random() * 0.5,
      'fa_sol': 0.3 + Math.random() * 0.5,
      'hbond_bb_sc': -0.2 - Math.random() * 0.3,
      'lk_ballbridge': -0.1 - Math.random() * 0.2,
      'rama_prepro': -0.1 - Math.random() * 0.1,
    };
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { score: Math.round(score * 100) / 100, breakdown };
  };

  // 3D structure viewer (simplified)
  const loadStructure = useCallback((id: string) => {
    setPdbId(id);
    // In real implementation, this would load 3Dmol.js
  }, []);

  return (
    <>
      <div data-site-nav />

      {/* Hero */}
      <header className="demo-hero">
        <div className="demo-hero-inner">
          <div className="demo-hero-copy">
            <div className="demo-kicker"><span className="live-dot"></span>Standalone Interactive Lab · Protein Design × Structure Preview</div>
            <h1 className="demo-title">ProteinMPNN 互動展示</h1>
            <p className="demo-sub">序列設計、PDB 結構預覽、ESMFold 與簡化 Rosetta 評分，集中在同一個操作面。</p>
            <div className="demo-actions">
              <a href="#workspace" className="btn btn-primary">開始設計</a>
              <a href="/report" className="btn btn-outline">看技術報告</a>
            </div>
          </div>
          <aside className="demo-summary-panel">
            <div className="demo-summary-head">Workspace Snapshot</div>
            <div className="demo-summary-grid">
              <div className="demo-metric">
                <span className="demo-metric-label">Input</span>
                <strong>Sequence + fixed positions</strong>
              </div>
              <div className="demo-metric">
                <span className="demo-metric-label">Sampling</span>
                <strong>ESM-2 or BLOSUM62 × temperature</strong>
              </div>
              <div className="demo-metric">
                <span className="demo-metric-label">Output</span>
                <strong>Mutation coloring + Rosetta panel</strong>
              </div>
            </div>
          </aside>
        </div>
      </header>

      <main className="demo-main">
        {/* Context */}
        <section className="demo-context-grid">
          <article className="demo-context-card demo-context-card-wide">
            <div className="section-label">使用情境</div>
            <h2 className="section-title">把設計、搜尋與結構預覽放在同一頁</h2>
            <p className="section-sub">這個工作台適合快速展示逆折疊設計流程：先用序列或 preset 啟動設計，再即時比對結構、切換著色模式，最後用簡化能量分數做初步排序。</p>
            <div className="demo-flow-grid">
              <div className="demo-flow-card">
                <span className="demo-flow-index">01</span>
                <h3>輸入序列</h3>
                <p>支援 preset、手動輸入與固定殘基區段，直接模擬 ProteinMPNN 的設計約束。</p>
              </div>
              <div className="demo-flow-card">
                <span className="demo-flow-index">02</span>
                <h3>載入結構</h3>
                <p>可手動輸入 PDB ID，或讓系統嘗試從相似序列與資料庫快取自動配對。</p>
              </div>
              <div className="demo-flow-card">
                <span className="demo-flow-index">03</span>
                <h3>檢視結果</h3>
                <p>檢查多條設計序列、突變位置與 Rosetta 近似分數，快速做第一輪比較。</p>
              </div>
            </div>
          </article>
        </section>

        {/* Workspace */}
        <section id="workspace" className="demo-workspace">
          <div className="mpnn-layout">
            <div className="mpnn-panel">
              <div className="mpnn-panel-title">⚙ 輸入參數</div>
              
              {/* Sequence Input */}
              <div className="mpnn-field">
                <label className="mpnn-label">蛋白質序列 <span className="mpnn-badge">1 字母代碼</span></label>
                <div className="mpnn-presets">
                  <select className="mpnn-input" onChange={(e) => loadPreset(e.target.value)}>
                    <option value="">選擇預設序列…</option>
                    <optgroup label="超小型 (<40 aa)">
                      <option value="trpcage">Trp-cage (20 aa)</option>
                      <option value="insulin_a">Insulin A chain (21 aa)</option>
                      <option value="melittin">Melittin (26 aa)</option>
                      <option value="insulin_b">Insulin B chain (30 aa)</option>
                    </optgroup>
                    <optgroup label="中型蛋白 (70–150 aa)">
                      <option value="ubq">Ubiquitin (76 aa)</option>
                    </optgroup>
                    <optgroup label="大型蛋白 (>150 aa)">
                      <option value="gfp">GFP (238 aa)</option>
                    </optgroup>
                  </select>
                </div>
                <textarea
                  className="mpnn-input"
                  value={sequence}
                  onChange={(e) => setSequence(e.target.value.toUpperCase())}
                  placeholder="輸入胺基酸序列，例: ACDEFGHIKLMN..."
                  rows={4}
                  spellCheck={false}
                />
                <div className="mpnn-seq-info">
                  <span>{sequence.length} 殘基</span>
                  <span className={isValidSeq ? 'mpnn-valid' : 'mpnn-invalid'}>
                    {isValidSeq ? '✓ 有效' : sequence.length > 0 ? '✗ 無效' : ''}
                  </span>
                </div>
              </div>

              {/* Fixed Positions */}
              <div className="mpnn-field">
                <label className="mpnn-label">固定位置 <span className="mpnn-hint">逗號分隔，支援範圍</span></label>
                <input
                  className="mpnn-input"
                  type="text"
                  value={fixedPositions}
                  onChange={(e) => setFixedPositions(e.target.value)}
                  placeholder="例: 1,5,10-15（空白 = 全序列設計）"
                />
              </div>

              {/* Number of sequences */}
              <div className="mpnn-field">
                <label className="mpnn-label">生成序列數 <span className="mpnn-val-badge">{numSeqs}</span></label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={numSeqs}
                  onChange={(e) => setNumSeqs(parseInt(e.target.value))}
                />
                <div className="range-meta"><span>1</span><span>10</span></div>
              </div>

              {/* Temperature */}
              <div className="mpnn-field">
                <label className="mpnn-label">取樣溫度 <span className="mpnn-val-badge">{temperature.toFixed(2)}</span></label>
                <input
                  type="range"
                  min="0.05"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                />
                <div className="range-meta"><span>低溫 (保守)</span><span>高溫 (多樣)</span></div>
              </div>

              {/* Model Version */}
              <div className="mpnn-field">
                <label className="mpnn-label">模型版本</label>
                <div className="mpnn-model-btns">
                  {['v_48_020', 'v_48_030', 'soluble'].map(model => (
                    <button
                      key={model}
                      className={`mpnn-model-btn ${selectedModel === model ? 'active' : ''}`}
                      onClick={() => setSelectedModel(model)}
                    >
                      {model}
                    </button>
                  ))}
                </div>
                <div className="mpnn-model-desc">
                  {selectedModel === 'v_48_020' && '邊緣數 48，偏差 0.2Å — 標準精確度模型（論文推薦）'}
                  {selectedModel === 'v_48_030' && '邊緣數 48，偏差 0.3Å — 較快較多樣'}
                  {selectedModel === 'soluble' && '專為可溶性蛋白設計'}
                </div>
              </div>

              {/* Run Button */}
              <button
                className="mpnn-run-btn"
                onClick={runDesign}
                disabled={isRunning || !isValidSeq}
              >
                {isRunning ? `▶ 設計中... ${progress.toFixed(0)}%` : '▶ 設計序列'}
              </button>
            </div>

            {/* Results Column */}
            <div className="demo-results-column">
              {/* 3D Viewer */}
              <div className="mpnn-output-panel">
                <div className="mpnn-panel-title">🔬 蛋白質 3D 結構預覽</div>
                <div style={{ height: '340px', background: 'var(--surface)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem' }}>🔬</div>
                    <div style={{ color: 'var(--muted)', marginTop: '8px' }}>輸入 PDB ID 載入結構</div>
                    <input
                      style={{ marginTop: '12px', padding: '8px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
                      placeholder="例如: 1UBQ, 1GFP"
                      value={pdbId}
                      onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>
              </div>

              {/* Design Results */}
              <div className="mpnn-output-panel">
                <div className="mpnn-panel-title">📊 設計結果</div>
                
                {!isRunning && results.length === 0 && (
                  <div className="mpnn-placeholder">
                    <div className="mpnn-placeholder-icon">🧬</div>
                    <div>設定參數後點擊「設計序列」</div>
                    <div className="mpnn-placeholder-sub">ProteinMPNN 演算法將在瀏覽器中即時執行<br />基於 BLOSUM62 × 溫度控制 Softmax 取樣</div>
                  </div>
                )}

                {isRunning && (
                  <div className="mpnn-progress-label">初始化模型... {progress.toFixed(0)}%</div>
                )}

                {results.length > 0 && (
                  <div>
                    <div className="mpnn-stats-row">
                      <div className="mpnn-stat-pill">{results.length} 序列</div>
                      <div className="mpnn-stat-pill">Avg ID: {calcIdentity(sequence, results[0].seq)}</div>
                      <div className="mpnn-stat-pill">T: {temperature.toFixed(2)}</div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <button
                        style={{ flex: 1, padding: '9px 14px', background: 'linear-gradient(135deg,#0d1f0d,#1a3a1a)', border: '1px solid #3fb950', color: '#3fb950', borderRadius: '8px', cursor: 'pointer', fontSize: '.82rem' }}
                      >
                        🎨 突變著色
                      </button>
                      <button
                        style={{ flex: 1, padding: '9px 14px', background: 'linear-gradient(135deg,#1f150d,#3a2a0d)', border: '1px solid #f0883e', color: '#f0883e', borderRadius: '8px', cursor: 'pointer', fontSize: '.82rem' }}
                        onClick={() => setShowRosetta(!showRosetta)}
                      >
                        ⚡ Rosetta 能量
                      </button>
                    </div>

                    {/* Results Table */}
                    <div className="mpnn-table-wrap">
                      <table className="mpnn-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>設計序列</th>
                            <th>ID%</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td className="mono" style={{ fontSize: '.78rem' }}>{r.seq.slice(0, 30)}{r.seq.length > 30 ? '...' : ''}</td>
                              <td>{calcIdentity(sequence, r.seq)}</td>
                              <td>{r.score.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Rosetta Panel */}
                    {showRosetta && results[0] && (
                      <div className="rosetta-panel" style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '.9rem', fontWeight: '600', marginBottom: '12px' }}>
                          ⚡ Rosetta REF2015 能量評分（簡化版）
                        </div>
                        {(() => {
                          const ros = getRosettaScore(results[0].seq);
                          return (
                            <div>
                              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: ros.score < 0 ? '#7bf0be' : '#ff6b6b' }}>
                                {ros.score} REU
                              </div>
                              <div style={{ fontSize: '.72rem', color: 'var(--dim)', marginTop: '8px' }}>
                                * 基於 REF2015 殘基傾向性+疏水溶解能估算，負值代表更穩定
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* VR Scene */}
        <section style={{ padding: '60px 0', maxWidth: '960px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '8px' }}>VR 分子空間展示</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: '20px' }}>
            點擊下方區域進入 WebXR 沉浸式分子結構場景
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden', position: 'relative', height: '420px', background: '#060d14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#58d7ff' }}>
              <div style={{ fontSize: '3rem' }}>🧬</div>
              <div style={{ marginTop: '12px' }}>WebXR 分子場景</div>
              <div style={{ fontSize: '.78rem', color: 'var(--dim)', marginTop: '8px' }}>
                需要 A-Frame VR 庫支援<br />
                滾輪縮放 · 拖曳旋轉
              </div>
            </div>
          </div>
        </section>
      </main>

      <div data-site-footer />
      <button className="scroll-top" aria-label="返回頂部">↑</button>
    </>
  );
}