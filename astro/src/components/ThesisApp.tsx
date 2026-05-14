import React, { useState } from 'react';
import TabNav from './TabNav';

export default function ThesisApp() {
  const [activeTab, setActiveTab] = useState('research');

  return (
    <>
      <div data-site-nav />
      
      {/* Hero Section - Always visible */}
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow"><span className="live-dot"></span>碩士論文 · 電資工程研究所 · PPTS × GAPPTS</div>
          <h1>遺傳演算法於<span>利潤價格分布</span>為基礎的<br/>交易策略最佳化技術之研究</h1>
          <p className="hero-sub">
            依論文方法重建的互動展示頁，核心流程是先用 PPTS 將歷史價格切成等距區間，計算各區間的平均利潤與達標機率，再用 GAPPTS 在 48 檔元大台灣 50 股票樣本上搜尋最佳參數組合。
          </p>
          <div className="hero-badges">
            <span className="badge">48 檔股票樣本</span>
            <span className="badge">2019–2023 訓練</span>
            <span className="badge">2024 測試</span>
            <span className="badge">PPTS</span>
            <span className="badge">GAPPTS</span>
            <span className="badge">價格區間利潤分析</span>
          </div>
          <div className="stats-strip">
            <div className="stat-cell">
              <div className="stat-val" id="statSharpe">—</div>
              <div className="stat-lbl">正報酬覆蓋率</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statReturn">—</div>
              <div className="stat-lbl">股票樣本數</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statWin">—</div>
              <div className="stat-lbl">訓練期間</div>
            </div>
            <div className="stat-cell">
              <div className="stat-val" id="statTest">—</div>
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
              <p className="section-sub">論文把歷史價格資料拆成價格區間統計問題，再用遺傳演算法搜尋最佳區間數、持有天數、目標利潤與進場門檻，避免固定參數策略在不同個股與產業上失靈。</p>
              <div className="algo-flow" style={{marginBottom: '28px'}}>
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
                  <div id="chromTable" />
                </div>
                <div className="card">
                  <div className="card-title">適應度與評估指標</div>
                  <div id="fitnessTable" />
                </div>
                <div className="card">
                  <div className="card-title">研究資料設計</div>
                  <div style={{fontSize: '.82rem', lineHeight: '1.8', color: 'var(--muted)'}}>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>母體：</span>元大台灣 50 成分股中的 48 檔股票<br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>訓練集：</span>2019–2023 歷史資料<br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>測試集：</span>2024 外樣本回測<br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>系統：</span>Python、SQL Server、Gradio 介面<br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>目標：</span>比較 GAPPTS、固定參數 PPTS 與 Buy & Hold
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">論文核心</div>
              <h2 className="section-title">PPTS 價格區間利潤邏輯</h2>
              <p className="section-sub">PPTS 先依買入價把歷史交易切進不同價格區間，統計每個區間的平均利潤與達標機率，再用 α 門檻判斷該區間屬於買入訊號還是保守區間。</p>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">所選個股的價格區間平均利潤 / 達標機率</div>
                  <div className="card-note">每個柱狀代表該價格區間的平均利潤，折線代表達成目標利潤的機率。綠色區間表示通過 α 門檻的買入候選。</div>
                  <div className="chart-box"><canvas id="returnDistChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">48 檔樣本績效分級</div>
                  <div className="card-note">論文把樣本分成「有效果」「一般」「無效果」三類。互動頁保留同一個分級框架，方便直接對照研究結果。</div>
                  <div className="chart-box"><canvas id="profitDistChart" /></div>
                </div>
              </div>
              <div className="grid-3" style={{marginTop: '14px'}}>
                <div className="card">
                  <div className="card-title">所選個股最佳化參數</div>
                  <div id="gen0Stats" style={{marginTop: '6px'}} />
                </div>
                <div className="card">
                  <div className="card-title">所選個股測試績效</div>
                  <div id="finalStats" style={{marginTop: '6px'}} />
                </div>
                <div className="card">
                  <div className="card-title">論文整體觀察</div>
                  <div id="impStats" style={{marginTop: '6px'}} />
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">回測結果</div>
              <h2 className="section-title">最佳策略的測試集表現與交易明細</h2>
              <p className="section-sub">依 GA 搜尋得到的最佳參數（m / hold / target）回到 2024+ 測試集重跑，疊上買賣訊號、淨值曲線、績效統計與最近 8 筆交易。</p>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">測試集價格 + 買賣訊號</div>
                  <div className="chart-box"><canvas id="priceChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">策略淨值曲線</div>
                  <div className="chart-box"><canvas id="equityChart" /></div>
                </div>
              </div>
              <div className="grid-2" style={{marginTop: '18px'}}>
                <div className="card">
                  <div className="card-title">績效統計</div>
                  <div id="perfStats" className="kv-rows" />
                </div>
                <div className="card">
                  <div className="card-title">近 8 筆交易</div>
                  <div id="tradeList" className="trade-list" />
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
              <h2 className="section-title">選股與 GAPPTS 參數產生 GAPPTS 策略</h2>
              <p className="section-sub">你可以切換不同 ETF50 個股，重新執行 GAPPTS，觀察相同方法在不同產業與價格結構上會如何收斂到不同的參數組合。</p>
              <div className="ga-cfg-panel">
                <div className="ga-cfg-grid">
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="industryFilter">產業篩選</label>
                    <select className="ga-cfg-input" id="industryFilter" />
                    <div className="ga-cfg-hint">依論文的跨產業比較方式切換股票池</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="stockSelect">個股</label>
                    <select className="ga-cfg-input" id="stockSelect" />
                    <div className="ga-cfg-hint">逐檔查看 PPTS / GAPPTS 的參數與績效差異</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgPop">族群規模 (POP)</label>
                    <input className="ga-cfg-input" id="cfgPop" type="number" defaultValue="50" min="20" max="120" step="10" />
                    <div className="ga-cfg-hint">論文建議值：50</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgGens">最大世代數 (GENS)</label>
                    <input className="ga-cfg-input" id="cfgGens" type="number" defaultValue="50" min="10" max="80" step="5" />
                    <div className="ga-cfg-hint">論文系統預設：50</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgCR">交配率 (CR)</label>
                    <input className="ga-cfg-input" id="cfgCR" type="number" defaultValue="0.80" min="0.30" max="1.00" step="0.05" />
                    <div className="ga-cfg-hint">輪盤選擇後的單點交叉機率</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="cfgMR">突變率 (MR)</label>
                    <input className="ga-cfg-input" id="cfgMR" type="number" defaultValue="0.10" min="0.01" max="0.30" step="0.01" />
                    <div className="ga-cfg-hint">論文系統預設：0.10</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-m">價格區間數 m</label>
                    <input className="ga-cfg-input" id="strat-m" type="number" defaultValue="8" min="2" max="20" step="1" />
                    <div className="ga-cfg-hint">PPTS 將價格切成 m 個等距區間</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-hold">持有天數</label>
                    <input className="ga-cfg-input" id="strat-hold" type="number" defaultValue="5" min="1" max="30" step="1" />
                    <div className="ga-cfg-hint">買入後持有天數</div>
                  </div>
                  <div className="ga-cfg-field">
                    <label className="ga-cfg-label" htmlFor="strat-target">目標利潤 (%)</label>
                    <input className="ga-cfg-input" id="strat-target" type="number" defaultValue="3.0" min="0.5" max="20" step="0.5" />
                    <div className="ga-cfg-hint">區間達標機率的門檻</div>
                  </div>
                </div>
                <div className="stock-meta" id="selectedStockMeta" />
                <div className="ga-cfg-actions">
                  <button className="btn btn-primary" id="btnRerun" onClick={() => {}}>▶ 產生 GAPPTS 策略</button>
                  <button className="btn btn-ghost" onClick={() => {}}>↩ 重置論文預設</button>
                  <button className="btn btn-ghost" id="btnSyncStocks" style={{color: 'var(--teal)', borderColor: 'rgba(88,215,255,0.2)'}}>📡 同步真實股價</button>
                  <span className="ga-cfg-status" id="cfgStatus" />
                </div>
              </div>
              <div id="pyodide-runner-card" style={{display: 'none'}}>
                <textarea id="pyodide-code" />
                <div id="pyodide-output" />
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">演算法模擬</div>
              <h2 className="section-title">GAPPTS 互動模擬器</h2>
              <p className="section-sub">逐代觀察族群適應度如何收斂，以及最優染色體如何在 4 維參數空間中逼近所選個股的最佳策略設定。</p>
              <div className="ga-controls">
                <button className="btn btn-ghost" id="btnFirst" onClick={() => {}}>⏮ 第一代</button>
                <button className="btn btn-ghost" id="btnPrev" onClick={() => {}}>← 前一代</button>
                <div className="gen-display" id="genDisplay">第 1 代 / 50</div>
                <button className="btn btn-ghost" id="btnNext" onClick={() => {}}>下一代 →</button>
                <button className="btn btn-ghost" id="btnLast" onClick={() => {}}>⏭ 最終代</button>
                <button className="btn btn-primary" id="btnPlay" onClick={() => {}}>▶ 自動播放</button>
                <div className="fitness-badge" id="fitBadge">Fitness —</div>
              </div>
              <div className="ga-grid">
                <div className="card">
                  <div className="card-title">族群適應度收斂曲線</div>
                  <div className="chart-box"><canvas id="convChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">第 <span id="popGenLabel">1</span> 代族群 fitness 分布</div>
                  <div className="chart-box"><canvas id="popDistChart" /></div>
                </div>
                <div className="card" style={{gridColumn: '1/-1'}}>
                  <div className="card-title" style={{marginBottom: '16px'}}>當代最佳染色體 → PPTS 參數</div>
                  <div className="param-grid" id="paramGrid" />
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">方法比較</div>
              <h2 className="section-title">GAPPTS vs 固定參數 PPTS vs Buy & Hold</h2>
              <p className="section-sub">論文指出 GAPPTS 相較固定參數策略與 Buy & Hold 能更有效提升報酬與風險控制。這裡用所選個股的互動重跑結果做同一視角比較。</p>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">所選個股報酬比較</div>
                  <div className="chart-box"><canvas id="compareChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">同評估預算下的搜尋效率</div>
                  <div className="chart-box"><canvas id="efficiencyChart" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 技術工具 Section */}
        <div className={`tab-panel ${activeTab === 'tools' ? 'active' : ''}`} id="panel-tools">
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">技術指標補充</div>
              <h2 className="section-title">布林通道 · MACD · KD · 籌碼面 — 輔助進場確認</h2>
              <p className="section-sub">PPTS 以統計利潤分布識別買入區間，搭配技術面與籌碼面訊號可進一步提升進場品質。台股量化實戰案例顯示，「BBand 收斂 + KD 低檔回升 + MACD 動能翻正」三重共振型態，對應 PPTS 買入區間時，能有效過濾假突破、提升勝率。</p>
              <div className="indicator-grid">
                <div className="ind-card">
                  <div className="ind-icon">📊</div>
                  <div>
                    <div className="ind-title">布林通道 Bollinger Bands</div>
                    <div className="ind-body">上下軌 = MA20 ± 2σ，通道寬度代表市場波動程度。通道收斂（Width ≤ 70% 均寬）是即將變盤的預警訊號，收斂後突破方向往往延續。</div>
                    <div className="ind-signal">收斂訊號：Width ≤ 均寬 × 0.70</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">📉</div>
                  <div>
                    <div className="ind-title">MACD 動能指標</div>
                    <div className="ind-body">DIF = EMA12 − EMA26，Signal = EMA9(DIF)，OSC = DIF − Signal。OSC 直方圖由紅轉綠（負翻正）代表短期動能開始回升，是早期多方確認。</div>
                    <div className="ind-signal">確認訊號：OSC 由負轉正（柱狀翻綠）</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">🎯</div>
                  <div>
                    <div className="ind-title">KD 隨機指標</div>
                    <div className="ind-body">RSV 計算最近 9 日相對位置，K = 2/3 × K_prev + 1/3 × RSV，D = 2/3 × D_prev + 1/3 × K。K 值從低檔向上穿越 D 值為黃金交叉，代表超賣後動能反轉。</div>
                    <div className="ind-signal">黃金交叉：K 由低檔上穿 D（K < 50）</div>
                  </div>
                </div>
                <div className="ind-card">
                  <div className="ind-icon">🏦</div>
                  <div>
                    <div className="ind-title">籌碼面 — 法人動向</div>
                    <div className="ind-body">外資 + 投信 + 自營商連續買超為多方籌碼訊號。主力買超千張以上且散戶同步賣超，代表聰明錢在低檔積累，是底部反轉候選股的關鍵條件之一。</div>
                    <div className="ind-signal">多方籌碼：法人連 3 日淨買超</div>
                  </div>
                </div>
              </div>
              <div className="grid-2" style={{marginTop: '18px'}}>
                <div className="card">
                  <div className="card-title">所選個股 · 布林通道（測試集）</div>
                  <div className="card-note">實線為收盤價，橙色虛線為布林上下軌，半透明帶為通道範圍。通道收窄時即將面臨方向性突破。</div>
                  <div className="chart-box"><canvas id="bbandChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">KD 隨機指標 + MACD OSC（測試集）</div>
                  <div className="card-note">藍/橙線為 K/D 值（左軸 0–100），綠/紅直方圖為 MACD OSC（右軸）。</div>
                  <div className="chart-box"><canvas id="macdKdChart" /></div>
                </div>
              </div>
              <div className="card" style={{marginTop: '14px'}}>
                <div className="card-title">三重共振訊號偵測 — 同時滿足 ≥ 2 項技術條件</div>
                <div className="card-note">偵測測試集中同時達到「BBand 收斂 + KD 黃金交叉 + MACD OSC 翻正」中至少兩項的訊號點，為 PPTS 買入區間提供技術面輔助確認。</div>
                <div id="tripleSignalPanel" className="triple-signal-grid" />
              </div>
            </div>
          </div>

          {/* AI 估值計算器 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">AI 輔助估值</div>
              <h2 className="section-title">PE × PB 情境矩陣計算器</h2>
              <p className="section-sub">輸入個股的 EPS / BPS 與同業本益比範圍，即時產生悲觀 / 基本 / 樂觀三情境估值矩陣，並與真實市價比對。</p>
              <div className="val-layout">
                <div className="val-inputs card">
                  <div className="card-title">估值輸入</div>
                  <div className="val-form">
                    <div className="val-field">
                      <label>股票代號</label>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <input className="ga-cfg-input" id="valCode" type="text" defaultValue="2330" placeholder="例：2330" style={{flex: 1}} />
                        <button className="btn btn-ghost" id="valFetchBtn" onClick={() => {}}>抓現價</button>
                      </div>
                      <div className="ga-cfg-hint" id="valPriceHint">—</div>
                    </div>
                    <div className="val-field-group">
                      <div className="val-field">
                        <label>預估 EPS 悲觀 ($)</label>
                        <input className="ga-cfg-input" id="valEpsBear" type="number" defaultValue="32" step="0.5" />
                      </div>
                      <div className="val-field">
                        <label>預估 EPS 基本 ($)</label>
                        <input className="ga-cfg-input" id="valEpsBase" type="number" defaultValue="38" step="0.5" />
                      </div>
                      <div className="val-field">
                        <label>預估 EPS 樂觀 ($)</label>
                        <input className="ga-cfg-input" id="valEpsBull" type="number" defaultValue="45" step="0.5" />
                      </div>
                    </div>
                    <div className="val-field-group">
                      <div className="val-field">
                        <label>PE 悲觀 (倍)</label>
                        <input className="ga-cfg-input" id="valPeBear" type="number" defaultValue="18" step="1" />
                      </div>
                      <div className="val-field">
                        <label>PE 基本 (倍)</label>
                        <input className="ga-cfg-input" id="valPeBase" type="number" defaultValue="22" step="1" />
                      </div>
                      <div className="val-field">
                        <label>PE 樂觀 (倍)</label>
                        <input className="ga-cfg-input" id="valPeBull" type="number" defaultValue="25" step="1" />
                      </div>
                    </div>
                    <div style={{borderTop: '1px solid var(--border)', margin: '10px 0', paddingTop: '10px'}}>
                      <div className="val-field-group">
                        <div className="val-field">
                          <label>預估 BPS ($)</label>
                          <input className="ga-cfg-input" id="valBps" type="number" defaultValue="120" step="1" />
                        </div>
                        <div className="val-field">
                          <label>PB 悲觀 (倍)</label>
                          <input className="ga-cfg-input" id="valPbBear" type="number" defaultValue="2.0" step="0.1" />
                        </div>
                        <div className="val-field">
                          <label>PB 基本 (倍)</label>
                          <input className="ga-cfg-input" id="valPbBase" type="number" defaultValue="2.5" step="0.1" />
                        </div>
                        <div className="val-field">
                          <label>PB 樂觀 (倍)</label>
                          <input className="ga-cfg-input" id="valPbBull" type="number" defaultValue="3.0" step="0.1" />
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-primary" style={{width: '100%', marginTop: '6px'}} onClick={() => {}}>計算估值矩陣</button>
                  </div>
                </div>
                <div className="val-results">
                  <div className="card" id="valPeCard" style={{display: 'none'}}>
                    <div className="card-title">PE 法估值矩陣 <span className="badge" style={{fontSize: '.7rem'}}>悲 / 基 / 樂</span></div>
                    <div className="card-note">單位：元。星號 ⭐ 為基本情境交叉點。</div>
                    <div id="valPeTable" style={{overflowX: 'auto', marginTop: '10px'}} />
                  </div>
                  <div className="card" id="valPbCard" style={{display: 'none'}}>
                    <div className="card-title">PB 法估值矩陣</div>
                    <div id="valPbTable" style={{overflowX: 'auto', marginTop: '10px'}} />
                  </div>
                  <div className="card" id="valSummaryCard" style={{display: 'none'}}>
                    <div className="card-title">重疊區間分析</div>
                    <div id="valSummary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 技術分析看板 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">技術分析</div>
              <h2 className="section-title">均線 × 支撐壓力即時看板</h2>
              <p className="section-sub">選擇個股後自動載入真實價格，計算 MA5 / MA20 / MA60、RSI(14) 與關鍵支撐壓力位，並標示多頭排列 / 黃金交叉等訊號。</p>
              <div className="ta-controls">
                <div className="ga-cfg-field">
                  <label className="ga-cfg-label" htmlFor="taStockSelect">個股</label>
                  <select className="ga-cfg-input" id="taStockSelect" />
                </div>
                <div className="ga-cfg-field">
                  <label className="ga-cfg-label" htmlFor="taCustomCode">或自行輸入代號</label>
                  <input className="ga-cfg-input" id="taCustomCode" type="text" placeholder="例：2454" />
                </div>
                <button className="btn btn-primary" onClick={() => {}}>載入分析</button>
                <span className="ga-cfg-hint" id="taStatus" style={{alignSelf: 'center'}} />
              </div>
              <div id="taResultArea" style={{display: 'none'}}>
                <div className="ta-signal-strip" id="taSignals" />
                <div className="grid-2" style={{marginTop: '14px'}}>
                  <div className="card">
                    <div className="card-title">價格 + 均線 <span id="taPriceLabel" style={{color: 'var(--muted)', fontSize: '.78rem'}} /></div>
                    <div className="chart-box" style={{height: '240px'}}><canvas id="taChart" /></div>
                  </div>
                  <div className="card">
                    <div className="card-title">RSI(14)</div>
                    <div className="chart-box" style={{height: '240px'}}><canvas id="taRsiChart" /></div>
                  </div>
                </div>
                <div className="grid-3" style={{marginTop: '14px'}}>
                  <div className="card">
                    <div className="card-title">均線數值</div>
                    <div id="taMaTable" className="kv-rows" style={{marginTop: '8px'}} />
                  </div>
                  <div className="card">
                    <div className="card-title">關鍵支撐壓力</div>
                    <div id="taSRTable" style={{marginTop: '8px'}} />
                  </div>
                  <div className="card">
                    <div className="card-title">技術訊號判讀</div>
                    <div id="taSignalDetail" style={{marginTop: '8px', fontSize: '.82rem', lineHeight: '1.9'}} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 量化工具速查 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">量化工具速查</div>
              <h2 className="section-title">市場結構 × VIX × 籌碼 × 策略參考</h2>
              <p className="section-sub">整合課程精華：四大市場連動、VIX 恐慌指數解讀、量比籌碼判讀、個股期 vs 融資券比較，以及台指期日內均值回歸策略模板。</p>
              <div className="grid-2" style={{marginBottom: '18px'}}>
                <div className="card">
                  <div className="card-title">VIX 恐慌指數速查</div>
                  <div className="card-note">VIX 越高，未來 1 個月報酬統計上越好（均值回歸）</div>
                  <table className="ref-table" style={{marginTop: '10px'}}>
                    <thead><tr><th>VIX 區間</th><th>狀態</th><th>統計預期報酬</th></tr></thead>
                    <tbody>
                      <tr><td className="ref-val">< 12</td><td><span className="ref-tag" style={{color: 'var(--green)'}}>極度平靜</span></td><td>正常水位</td></tr>
                      <tr><td className="ref-val">12–20</td><td><span className="ref-tag">正常</span></td><td>正常水位</td></tr>
                      <tr><td className="ref-val">20–30</td><td><span className="ref-tag" style={{color: 'var(--orange)'}}>緊張</span></td><td>↑ 略有正偏</td></tr>
                      <tr><td className="ref-val">30–40</td><td><span className="ref-tag" style={{color: 'var(--red)'}}>恐慌</span></td><td className="ref-val" style={{color: 'var(--green)'}}>+3% / 月</td></tr>
                      <tr><td className="ref-val">> 40</td><td><span className="ref-tag" style={{color: 'var(--red)', fontWeight: '700'}}>崩盤級</span></td><td className="ref-val" style={{color: 'var(--green)', fontWeight: '700'}}>+6% / 月</td></tr>
                    </tbody>
                  </table>
                  <div style={{marginTop: '12px', fontSize: '.78rem', color: 'var(--muted)'}}>
                    Contango（正價差）= 遠月 > 近月 = 平靜（80% 時間）<br/>
                    Backwardation（逆價差）= 近月 > 遠月 = 危機爆發
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">量比籌碼判讀</div>
                  <div className="card-note">量先價行 — 量比 = 當前成交量 / N 日平均成交量</div>
                  <table className="ref-table" style={{marginTop: '10px'}}>
                    <thead><tr><th>量比</th><th>成交量</th><th>價格</th><th>解讀</th></tr></thead>
                    <tbody>
                      <tr><td className="ref-val">> 2</td><td>量增</td><td style={{color: 'var(--green)'}}>價漲</td><td>主力買進 ✅</td></tr>
                      <tr><td className="ref-val">> 2</td><td>量增</td><td style={{color: 'var(--red)'}}>價跌</td><td style={{color: 'var(--red)'}}>主力出貨 ⚠️</td></tr>
                      <tr><td className="ref-val">1–1.5</td><td>正常</td><td>—</td><td>正常市況</td></tr>
                      <tr><td className="ref-val">< 0.5</td><td>量縮</td><td style={{color: 'var(--green)'}}>價漲</td><td>力道不足</td></tr>
                      <tr><td className="ref-val">< 0.5</td><td>量縮</td><td style={{color: 'var(--red)'}}>價跌</td><td style={{color: 'var(--green)'}}>跌勢將盡</td></tr>
                    </tbody>
                  </table>
                  <div className="quant-golden-box" style={{marginTop: '12px'}}>
                    黃金組合：量比 > 2 + 法人連續買超 + 融資餘額下降 = 強烈做多訊號
                  </div>
                </div>
              </div>
              <div className="card" style={{marginBottom: '18px'}}>
                <div className="card-title">商品工具箱比較：個股期 vs 融資 vs 融券</div>
                <div style={{overflowX: 'auto', marginTop: '12px'}}>
                  <table className="ref-table" style={{width: '100%'}}>
                    <thead>
                      <tr><th>項目</th><th style={{color: 'var(--green)'}}>個股期貨 ✅</th><th>融資</th><th>融券</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>槓桿</td><td className="ref-val" style={{color: 'var(--green)', fontWeight: '700'}}>7.4 倍</td><td className="ref-val">2.5 倍</td><td className="ref-val">1.1 倍</td></tr>
                      <tr><td>做空</td><td style={{color: 'var(--green)'}}>✅ 可</td><td style={{color: 'var(--red)'}}>❌ 不可</td><td style={{color: 'var(--green)'}}>✅ 可</td></tr>
                      <tr><td>持有成本</td><td style={{color: 'var(--green)'}}>幾乎零</td><td style={{color: 'var(--red)'}}>6–7%/年利息</td><td>借券費+回補</td></tr>
                      <tr><td>強制回補</td><td style={{color: 'var(--green)'}}>❌ 無</td><td style={{color: 'var(--green)'}}>❌ 無</td><td style={{color: 'var(--red)'}}>✅ 有</td></tr>
                      <tr><td>交易稅</td><td style={{color: 'var(--green)'}}>十萬分之 2</td><td>千分之 3</td><td>千分之 3</td></tr>
                      <tr><td>一口規格</td><td>2,000 股</td><td>—</td><td>—</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid-2">
                <div className="card">
                  <div className="card-title">台指期規格速查</div>
                  <table className="ref-table" style={{marginTop: '10px'}}>
                    <thead><tr><th>商品</th><th>每點</th><th>保證金</th><th>槓桿</th></tr></thead>
                    <tbody>
                      <tr><td>大台 (TX)</td><td className="ref-val">200 元</td><td className="ref-val">~18 萬</td><td className="ref-val">15–20×</td></tr>
                      <tr><td>小台 (MTX)</td><td className="ref-val">50 元</td><td className="ref-val">~4.5 萬</td><td className="ref-val">15–20×</td></tr>
                      <tr><td>微台</td><td className="ref-val">12.5 元</td><td className="ref-val">~1.1 萬</td><td className="ref-val">15–20×</td></tr>
                    </tbody>
                  </table>
                  <div style={{marginTop: '10px', fontSize: '.78rem', color: 'var(--muted)', lineHeight: '1.8'}}>
                    結算：每月第三個禮拜三<br/>
                    日盤：08:45–13:45 ／ 夜盤：15:00–翌日 05:00
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">台指期日內均值回歸策略模板</div>
                  <div className="strategy-recipe">
                    <div className="recipe-row"><span className="recipe-key">進場</span><span>09:00 前累計漲跌幅 > 0.5%，逆勢進場</span></div>
                    <div className="recipe-row"><span className="recipe-key">止盈</span><span>跳空缺口 50% 回補</span></div>
                    <div className="recipe-row"><span className="recipe-key">止損</span><span>−30 點</span></div>
                    <div className="recipe-row"><span className="recipe-key">工具</span><span>小台 1 口（保證金 ~4.5 萬）</span></div>
                    <div className="recipe-row"><span className="recipe-key">風控</span><span>單日最多 2 次 · 連虧 3 天暫停</span></div>
                  </div>
                  <div className="quant-golden-box" style={{marginTop: '10px'}}>
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
              <p className="section-sub">論文第四章實證結果顯示，不同產業與公司特性對應不同的最佳訓練期間與參數組合。統一的預測模型在台股不適用，差異化策略才能發揮 GAPPTS 的優勢。</p>
              <div className="grid-3" style={{marginBottom: '18px'}}>
                <div className="card" style={{borderTop: '3px solid var(--blue)'}}>
                  <div className="card-title" style={{color: 'var(--blue)'}}>長期穩定型 · 5–8 年</div>
                  <div style={{fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px'}}>
                    中華電 (2412) · 台塑 (1301) · 合庫金 (5880)<br/>
                    <span style={{color: 'var(--dim)'}}>產業特性穩定、現金流可預期</span><br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>建議：</span>年度重新訓練
                  </div>
                </div>
                <div className="card" style={{borderTop: '3px solid var(--green)'}}>
                  <div className="card-title" style={{color: 'var(--green)'}}>中期轉型型 · 4–6 年</div>
                  <div style={{fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px'}}>
                    聯電 (2303) · 富邦金 (2881) · 廣達 (2382)<br/>
                    <span style={{color: 'var(--dim)'}}>產業週期明顯、有轉型需求</span><br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>建議：</span>半年重新訓練
                  </div>
                </div>
                <div className="card" style={{borderTop: '3px solid var(--orange)'}}>
                  <div className="card-title" style={{color: 'var(--orange)'}}>短期動態型 · 3–5 年</div>
                  <div style={{fontSize: '.82rem', lineHeight: '1.9', color: 'var(--muted)', marginTop: '6px'}}>
                    聯發科 (2454) · 鴻海 (2317) · 日月光 (3711)<br/>
                    <span style={{color: 'var(--dim)'}}>國際供應鏈高度敏感、波動大</span><br/>
                    <span style={{color: 'var(--green)', fontWeight: '600'}}>建議：</span>3–4 個月重新訓練
                  </div>
                </div>
              </div>
              <div className="grid-2" style={{marginBottom: '18px'}}>
                <div className="card">
                  <div className="card-title">代表性個股 fitness 排名（論文第四章）</div>
                  <div className="card-note">聯電在中期轉型型中取得最高 fitness 0.7058，聯發科次之。長期穩定型股票整體 fitness 相對較低。</div>
                  <div className="chart-box"><canvas id="fitnessRankChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">各產業最佳訓練期間範圍</div>
                  <div className="card-note">科技類（半導體、電子製造）偏短，金融適中，電信/石化等傳統產業偏長。</div>
                  <div className="chart-box"><canvas id="industryPeriodChart" /></div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">高適應度股票的共通參數特徵</div>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '12px'}}>
                  <div style={{padding: '14px', background: 'rgba(123,240,190,0.06)', borderRadius: '12px', border: '1px solid rgba(123,240,190,0.15)'}}>
                    <div style={{color: 'var(--green)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600'}}>目標獲利率</div>
                    <div style={{fontSize: '1.4rem', fontWeight: '700', margin: '4px 0'}}>低水位</div>
                    <div style={{color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6'}}>避免過度貪婪 · 做頻繁但小額獲利</div>
                  </div>
                  <div style={{padding: '14px', background: 'rgba(88,215,255,0.06)', borderRadius: '12px', border: '1px solid rgba(88,215,255,0.15)'}}>
                    <div style={{color: 'var(--teal)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600'}}>持有天數</div>
                    <div style={{fontSize: '1.4rem', fontWeight: '700', margin: '4px 0'}}>18–29 天</div>
                    <div style={{color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6'}}>中短期策略在台股較為有效</div>
                  </div>
                  <div style={{padding: '14px', background: 'rgba(181,156,255,0.06)', borderRadius: '12px', border: '1px solid rgba(181,156,255,0.15)'}}>
                    <div style={{color: 'var(--purple)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600'}}>α 進場係數</div>
                    <div style={{fontSize: '1.4rem', fontWeight: '700', margin: '4px 0'}}>0.4–0.8</div>
                    <div style={{color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6'}}>中等門檻平衡機會與品質</div>
                  </div>
                  <div style={{padding: '14px', background: 'rgba(255,188,114,0.06)', borderRadius: '12px', border: '1px solid rgba(255,188,114,0.15)'}}>
                    <div style={{color: 'var(--orange)', fontSize: '.75rem', letterSpacing: '.08em', fontWeight: '600'}}>染色體結構</div>
                    <div style={{fontSize: '1.4rem', fontWeight: '700', margin: '4px 0'}}>29 bit</div>
                    <div style={{color: 'var(--muted)', fontSize: '.78rem', lineHeight: '1.6'}}>區間 5 · 週期 6 · 目標 10 · α 8</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">文獻對照</div>
              <h2 className="section-title">GAPPTS 相對其他演算法的定位</h2>
              <p className="section-sub">論文第二章系統性比較了多種股價預測方法。GAPPTS 的優勢在於不需要問題的嚴格數學模型、能避開局部最優、同時保留可解釋的交易規則輸出。</p>
              <div className="card">
                <div className="card-title">主流預測演算法比較表（論文表 4.4）</div>
                <div style={{overflowX: 'auto', marginTop: '12px'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '.84rem'}}>
                    <thead>
                      <tr style={{borderBottom: '2px solid var(--border)', color: 'var(--muted)', textAlign: 'left'}}>
                        <th style={{padding: '10px 12px'}}>演算法類別</th>
                        <th style={{padding: '10px 12px'}}>預測精度</th>
                        <th style={{padding: '10px 12px'}}>計算複雜度</th>
                        <th style={{padding: '10px 12px'}}>適用資料規模</th>
                        <th style={{padding: '10px 12px'}}>解釋性</th>
                        <th style={{padding: '10px 12px'}}>非線性捕捉</th>
                      </tr>
                    </thead>
                    <tbody id="algoCompareTable" />
                  </table>
                </div>
                <div className="card-note" style={{marginTop: '14px', lineHeight: '1.8'}}>
                  <span style={{color: 'var(--green)', fontWeight: '600'}}>GAPPTS 定位：</span>
                  結合基因演算法的全域搜索能力與 PPTS 的可解釋交易規則，在中型資料規模下取得高解釋性與高非線性捕捉的平衡 — 相較 LSTM/Transformer 不需海量資料，相較 ARIMA 能處理非線性區間結構。
                </div>
                <div id="algoStrategyPanel" style={{display: 'none', marginTop: '20px', padding: '18px', borderRadius: '12px', border: '1px solid rgba(123,240,190,0.2)', background: 'rgba(123,240,190,0.04)'}}>
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px'}}>
                    <div style={{fontSize: '.8rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)'}}>選取演算法的交易策略</div>
                    <button onClick={() => {}} style={{background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px'}}>✕</button>
                  </div>
                  <div id="algoStrategyContent" />
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">衍生性商品延伸</div>
              <h2 className="section-title">權證 vs 選擇權 — GAPPTS 策略延伸討論</h2>
              <p className="section-sub">GAPPTS 以價格區間識別方向性進場機會，除現股之外可搭配衍生性商品放大槓桿。台灣市場中，選擇權（台指選 TXO）在定價透明度與流動性上遠優於個股權證，更適合量化策略重複執行與歷史回測驗證。</p>
              <div className="card">
                <div className="card-title">量化策略適用性比較：權證 vs 選擇權</div>
                <div style={{overflowX: 'auto', marginTop: '12px'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '.84rem'}}>
                    <thead>
                      <tr style={{borderBottom: '2px solid var(--border)', color: 'var(--muted)', textAlign: 'left'}}>
                        <th style={{padding: '10px 12px'}}>特性</th>
                        <th style={{padding: '10px 12px'}}>權證 (Warrant)</th>
                        <th style={{padding: '10px 12px'}}>選擇權 (Option)</th>
                        <th style={{padding: '10px 12px'}}>量化適用</th>
                      </tr>
                    </thead>
                    <tbody id="derivativesTable" />
                  </table>
                </div>
              </div>
              <div className="grid-2" style={{marginTop: '14px'}}>
                <div className="card">
                  <div className="card-title">台積電假設情境損益比較（買方）</div>
                  <div className="card-note">現價 1000 元，履約價 1050，比較三種到期情境下的損益比。選擇權因 IV 公平定價，漲幅情境報酬明顯優於權證。</div>
                  <div className="chart-box"><canvas id="derivativesPayoffChart" /></div>
                </div>
                <div className="card">
                  <div className="card-title">GAPPTS 延伸至衍生商品的操作建議</div>
                  <div id="derivativesAdvicePanel" style={{marginTop: '8px'}} />
                </div>
              </div>
            </div>
          </div>

          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">資源整理</div>
              <h2 className="section-title">投資研究工具全覽 · 今日重點複習</h2>
              <p className="section-sub">從總體經濟到個股分析，面對龐雜的財經資訊，善用對的工具能大幅提升研究效率。以下整理今日介紹的實用工具，建議依據自己的需求組合搭配使用。</p>
              <div className="macro-notice">
                <div className="macro-notice-icon">🌐</div>
                <div>
                  <strong style={{color: 'var(--teal)'}}>總經局勢複習</strong>：掌握大環境方向是個股分析的基礎。總體經濟數據（GDP、通膨、利率、PMI）的趨勢變化，會直接影響資金流向與產業輪動節奏。建議定期追蹤總經指標，由上而下選股，並搭配今日附上的圖卡一起回顧總經重點。
                </div>
              </div>
              <div className="tools-category">
                <div className="tools-category-label">📊 投資與數據分析工具</div>
                <div className="tools-grid">
                  <div className="tool-card">
                    <div className="tool-card-icon">📈</div>
                    <div className="tool-card-name">財經 M 平方</div>
                    <div className="tool-card-desc">專注於「總體經濟」數據與趨勢分析，提供全球 GDP、通膨、利率、PMI 等關鍵指標視覺化，掌握大方向的必備工具。</div>
                    <span className="tool-card-tag">總體經濟</span>
                  </div>
                  <div className="tool-card">
                    <div className="tool-card-icon">🐕</div>
                    <div className="tool-card-name">財報狗</div>
                    <div className="tool-card-desc">專精於「企業財報分析」，提供台股個股損益表、資產負債表、現金流量表整理，研究基本面、檢視公司體質的好幫手。</div>
                    <span className="tool-card-tag">基本面分析</span>
                  </div>
                  <div className="tool-card">
                    <div className="tool-card-icon">💻</div>
                    <div className="tool-card-name">XQ 全球贏家</div>
                    <div className="tool-card-desc">強大的「股票分析」軟體，涵蓋即時看盤、技術指標、籌碼動向與程式交易，電腦版與手機版皆有。</div>
                    <span className="tool-card-tag">技術分析 · 籌碼</span>
                  </div>
                  <div className="tool-card">
                    <div className="tool-card-icon">⚡</div>
                    <div className="tool-card-name">金十數據 APP</div>
                    <div className="tool-card-desc">提供即時且快速的全球財經新聞與數據庫，消息面追蹤效率高，適合需要即時掌握市場動態的投資人。</div>
                    <span className="tool-card-tag">即時財經新聞</span>
                    <div className="tool-card-warning">⚠ 中國大陸開發軟體，對資安或隱私有疑慮者請審慎評估後再決定是否下載使用。</div>
                  </div>
                </div>
              </div>
              <div className="tools-category">
                <div className="tools-category-label">💡 補充與輔助工具</div>
                <div className="tools-grid">
                  <div className="tool-card">
                    <div className="tool-card-icon">🚦</div>
                    <div className="tool-card-name">處置王 APP</div>
                    <div className="tool-card-desc">專門查詢股票「何時被列入處置」的工具，避免在處置期間發生非預期的交易限制，對留意個股流動性風險非常實用。</div>
                    <span className="tool-card-tag">處置股票查詢</span>
                  </div>
                  <div className="tool-card" style={{borderColor: 'rgba(123,240,190,0.22)'}}>
                    <div className="tool-card-icon">🤖</div>
                    <div className="tool-card-name">Claude · Gemini · Notebook LM</div>
                    <div className="tool-card-desc">強大的 AI 生產力助手。可快速整理龐雜財經資訊、總結長篇報告重點、梳理投資邏輯，善用 AI 能大幅提升研究效率，打破舊有思考框架，看見更多投資機會。</div>
                    <span className="tool-card-tag" style={{background: 'rgba(123,240,190,.1)', color: 'var(--green)', borderColor: 'rgba(123,240,190,.25)'}}>AI 輔助工具</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Prompt 模板庫 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">AI 分析工具</div>
              <h2 className="section-title">Prompt 模板庫</h2>
              <p className="section-sub">7 個經過實戰驗證的金融分析 Prompt 模板，點「複製」即可貼入 ChatGPT / Claude 使用。合規鐵律：不薦股 · 不保證 · 標時效。</p>
              <div className="prompt-tabs" id="promptTabs" />
              <div className="prompt-body card" id="promptBody" />
            </div>
          </div>

          {/* 課程複習 */}
          <div className="section reveal">
            <div className="section-inner">
              <div className="section-label">課程複習</div>
              <h2 className="section-title">今日重點 × 工具箱整理</h2>
              <p className="section-sub">搭配圖卡回顧總經局勢，並善用以下工具提升研究效率。面對瞬息萬變的市場，勇敢走出舒適圈，將 AI 融入日常學習！</p>
              <div className="recap-macro-banner">
                <div className="recap-macro-icon">🌐</div>
                <div>
                  <div className="recap-macro-title">總體經濟局勢</div>
                  <div className="recap-macro-sub">請搭配課程圖卡一起回顧當前總經環境，掌握大方向才能做出更好的投資判斷。</div>
                </div>
              </div>
              <div className="recap-category-label">
                <span className="recap-cat-icon">📊</span> 投資與數據分析工具
              </div>
              <div className="recap-tools-grid">
                <div className="recap-tool-card">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-macro">總體經濟</div>
                  </div>
                  <div className="recap-tool-name">財經 M 平方</div>
                  <div className="recap-tool-desc">專注於總體經濟數據與趨勢分析，掌握大方向必備。可追蹤 GDP、PMI、CPI、Fed 利率等全球關鍵指標。</div>
                  <div className="recap-tool-use">
                    <span className="recap-use-key">最佳用法</span>結合 FOMC 決策週期，每月固定查看一次總經儀表板
                  </div>
                </div>
                <div className="recap-tool-card">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-fundamental">基本面</div>
                  </div>
                  <div className="recap-tool-name">財報狗</div>
                  <div className="recap-tool-desc">專精企業財報分析，研究基本面、檢視公司體質的好幫手。EPS 趨勢、毛利率、ROE 一目了然。</div>
                  <div className="recap-tool-use">
                    <span className="recap-use-key">最佳用法</span>法說會前後用財報狗確認 EPS / 毛利率長期趨勢
                  </div>
                </div>
                <div className="recap-tool-card">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-tech">技術 / 籌碼</div>
                  </div>
                  <div className="recap-tool-name">XQ 全球贏家</div>
                  <div className="recap-tool-desc">強大的股票分析軟體（電腦版 + 手機版），涵蓋看盤、技術分析與籌碼動向，專業交易者首選。</div>
                  <div className="recap-tool-use">
                    <span className="recap-use-key">最佳用法</span>盤中監看籌碼異動 + 法人買超，搭配 GAPPTS 訊號進出場
                  </div>
                </div>
                <div className="recap-tool-card">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-news">即時資訊</div>
                    <div className="recap-tool-warning">⚠ 請評估資安疑慮</div>
                  </div>
                  <div className="recap-tool-name">金十數據 APP</div>
                  <div className="recap-tool-desc">提供即時且快速的全球財經新聞與數據庫。<span style={{color: 'var(--orange)'}}>注意：此為中國大陸開發之軟體，若對資安或隱私有疑慮，請審慎評估後再決定是否下載使用。</span></div>
                  <div className="recap-tool-use">
                    <span className="recap-use-key">最佳用法</span>需要極速掌握國際突發事件時使用，建議用隔離裝置
                  </div>
                </div>
              </div>
              <div className="recap-category-label" style={{marginTop: '28px'}}>
                <span className="recap-cat-icon">💡</span> 額外補充與輔助工具
              </div>
              <div className="recap-tools-grid">
                <div className="recap-tool-card">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-risk">風險管理</div>
                  </div>
                  <div className="recap-tool-name">處置王 APP</div>
                  <div className="recap-tool-desc">專門查詢股票何時被列入處置。對於留意個股流動性與交易限制非常實用，避免在無法正常交易時被套牢。</div>
                  <div className="recap-tool-use">
                    <span className="recap-use-key">最佳用法</span>買進前先查是否為處置股，避免流動性陷阱
                  </div>
                </div>
                <div className="recap-tool-card recap-tool-card-ai">
                  <div className="recap-tool-header">
                    <div className="recap-tool-tag recap-tag-ai">AI 助手</div>
                    <div className="recap-tool-badge-ai">推薦</div>
                  </div>
                  <div className="recap-tool-name">Claude · Gemini · NotebookLM</div>
                  <div className="recap-tool-desc">強大的生產力助手，可快速整理龐雜財經資訊、總結長篇報告重點，或協助梳理投資邏輯。善用科技大幅提升效率！</div>
                  <div className="recap-ai-chips">
                    <span className="recap-ai-chip">Claude — 長文分析、繁中優化、邏輯推論</span>
                    <span className="recap-ai-chip">Gemini — 聯網搜尋、多模態、Google 整合</span>
                    <span className="recap-ai-chip">NotebookLM — 上傳報告 PDF，AI 幫你摘要問答</span>
                  </div>
                </div>
              </div>
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
                <span style={{color: 'var(--orange)', fontWeight: '700'}}>合規鐵律</span>
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