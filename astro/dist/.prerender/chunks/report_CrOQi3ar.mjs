import { c as createComponent } from './astro-component_DIKdwFAr.mjs';
import 'piccolore';
import { r as renderComponent, a as renderTemplate, F as Fragment, u as unescapeHTML } from './prerender_OQTAnlvW.mjs';
import { $ as $$Base } from './Base_msUDbCzB.mjs';

const $$Report = createComponent(($$result, $$props, $$slots) => {
  const bodyHtml = `\r
    <!-- ── Nav ── -->\r
    <div data-site-nav></div>\r
\r
    <div class="container">\r
\r
        <!-- Header -->\r
        <header class="reveal">\r
            <div class="report-eyebrow"><span class="live-dot"></span>Protein AI · Technical Report</div>\r
            <h1>蛋白質設計 <span>AI Pipeline</span></h1>\r
            <p>ESM-2 × 貝葉斯最佳化 × ProteinMPNN × REINFORCE 強化學習</p>\r
            <div class="badges">\r
                <span class="badge">PyTorch</span>\r
                <span class="badge">HuggingFace Transformers</span>\r
                <span class="badge">BoTorch</span>\r
                <span class="badge">GPyTorch</span>\r
                <span class="badge">scikit-learn</span>\r
            </div>\r
        </header>\r
\r
        <!-- Pipeline -->\r
        <section class="reveal">\r
            <h2>Pipeline 架構</h2>\r
            <div class="pipeline">\r
                <div class="pipe-step">\r
                    <div class="icon">🧬</div>\r
                    <div class="label">蛋白質序列</div>\r
                    <div class="sub">示範資料 / ProteinGym</div>\r
                </div>\r
                <div class="pipe-arrow">→</div>\r
                <div class="pipe-step">\r
                    <div class="icon">🤖</div>\r
                    <div class="label">ESM-2 8M</div>\r
                    <div class="sub">320 維嵌入</div>\r
                </div>\r
                <div class="pipe-arrow">→</div>\r
                <div class="pipe-step">\r
                    <div class="icon">🧠</div>\r
                    <div class="label">MLP 代理模型</div>\r
                    <div class="sub">適應度預測器</div>\r
                </div>\r
                <div class="pipe-arrow">⤵</div>\r
                <div class="pipe-step">\r
                    <div class="icon">📈</div>\r
                    <div class="label">貝葉斯最佳化</div>\r
                    <div class="sub">GP + LogEI</div>\r
                </div>\r
                <div class="pipe-arrow">|</div>\r
                <div class="pipe-step">\r
                    <div class="icon">🕸</div>\r
                    <div class="label">ProteinMPNN</div>\r
                    <div class="sub">圖神經網路設計</div>\r
                </div>\r
                <div class="pipe-arrow">|</div>\r
                <div class="pipe-step">\r
                    <div class="icon">🎯</div>\r
                    <div class="label">REINFORCE RL</div>\r
                    <div class="sub">LSTM 策略網路</div>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Key Results -->\r
        <section class="reveal">\r
            <h2>關鍵實驗結果</h2>\r
            <div class="results-grid">\r
                <div class="metric-card">\r
                    <div class="metric-val">320-D</div>\r
                    <div class="metric-label">ESM-2 嵌入維度</div>\r
                    <div class="metric-detail">8M 參數，以 2.5 億序列透過 MLM 預訓練</div>\r
                </div>\r
                <div class="metric-card">\r
                    <div class="metric-val">81.9%</div>\r
                    <div class="metric-label">PCA 8D 解釋變異量</div>\r
                    <div class="metric-detail">使 GP 協方差矩陣數值穩定</div>\r
                </div>\r
                <div class="metric-card">\r
                    <div class="metric-val">+16.6%</div>\r
                    <div class="metric-label">適應度提升（貝葉斯最佳化）</div>\r
                    <div class="metric-detail">0.209 → 0.243，15 次迭代（qLogEI）</div>\r
                </div>\r
                <div class="metric-card">\r
                    <div class="metric-val">✓ 收斂</div>\r
                    <div class="metric-label">強化學習策略收斂</div>\r
                    <div class="metric-detail">REINFORCE + 教師強制，20 回合</div>\r
                </div>\r
                <div class="metric-card">\r
                    <div class="metric-val">✓ 收斂</div>\r
                    <div class="metric-label">ProteinMPNN 損失收斂</div>\r
                    <div class="metric-detail">k-NN Cα 圖，scatter-add 訊息傳遞</div>\r
                </div>\r
                <div class="metric-card">\r
                    <div class="metric-val">&lt;2 分鐘</div>\r
                    <div class="metric-label">完整 Pipeline 執行時間</div>\r
                    <div class="metric-detail">僅需 CPU，可重現，ESM-2 下載後</div>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Output Images -->\r
        <section class="reveal">\r
            <h2>視覺化結果</h2>\r
            <div class="img-grid">\r
                <div class="img-card">\r
                    <img src="outputs/results_esm2.png" alt="貝葉斯最佳化結果"\r
                        onerror="this.style.display='none';this.nextElementSibling.style.display='block'">\r
                    <div class="img-fallback">results_esm2.png</div>\r
                    <div class="cap">貝葉斯最佳化：訓練損失、代理模型預測與 BO 適應度曲線</div>\r
                </div>\r
                <div class="img-card">\r
                    <img src="outputs/rl_training.png" alt="RL 獎勵曲線"\r
                        onerror="this.style.display='none';this.nextElementSibling.style.display='block'">\r
                    <div class="img-fallback">rl_training.png</div>\r
                    <div class="cap">REINFORCE RL：多目標獎勵隨訓練回合的變化</div>\r
                </div>\r
                <div class="img-card">\r
                    <img src="outputs/mpnn_loss.png" alt="ProteinMPNN 損失"\r
                        onerror="this.style.display='none';this.nextElementSibling.style.display='block'">\r
                    <div class="img-fallback">mpnn_loss.png</div>\r
                    <div class="cap">ProteinMPNN：交叉熵訓練損失隨步驟的收斂情形</div>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Core Algorithms -->\r
        <section class="reveal">\r
            <h2>核心演算法</h2>\r
            <div class="algo-grid">\r
                <div class="algo-card">\r
                    <h3>ESM-2 平均池化</h3>\r
                    <div class="math-block">z = Σ(mₜ · hₜ) / Σ mₜ</div>\r
                    <ul>\r
                        <li>遮蔽語言模型（MLM）預訓練</li>\r
                        <li>捕捉演化共變異資訊</li>\r
                        <li>零樣本遷移至適應度預測</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>貝葉斯最佳化</h3>\r
                    <div class="math-block">α(x) = log E[max(f(x)−f*, 0)]</div>\r
                    <ul>\r
                        <li>PCA 降維空間中的 GP 代理模型</li>\r
                        <li>qLogExpectedImprovement（BoTorch）</li>\r
                        <li>樣本效率高：&lt;20 次 oracle 查詢</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>ProteinMPNN</h3>\r
                    <div class="math-block">h⁽ˡ⁺¹⁾ = LN(h⁽ˡ⁾ + ReLU(Wₒ · Σ φ(h,e)))</div>\r
                    <ul>\r
                        <li>基於 Cα 座標的 k-NN 圖</li>\r
                        <li>19 維邊特徵（距離 + 方向）</li>\r
                        <li>逐殘基交叉熵目標函數</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>REINFORCE 強化學習</h3>\r
                    <div class="math-block">∇J(θ) = E[∇log π(a|s) · Gₜ]</div>\r
                    <ul>\r
                        <li>LSTM 自迴歸策略網路</li>\r
                        <li>教師強制對數機率計算</li>\r
                        <li>多目標獎勵（穩定性 + 疏水性 + 帶電性）</li>\r
                    </ul>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <!-- Module Overview -->\r
        <section class="reveal">\r
            <h2>程式結構</h2>\r
            <table class="mod-table">\r
                <thead>\r
                    <tr>\r
                        <th>模組</th>\r
                        <th>用途</th>\r
                        <th>主要 API</th>\r
                        <th>狀態</th>\r
                    </tr>\r
                </thead>\r
                <tbody>\r
                    <tr>\r
                        <td><code>src/embeddings.py</code></td>\r
                        <td>ESM-2 特徵抽取、延遲載入、批次推論與平均池化</td>\r
                        <td><span class="tag">ESM2Embedder.transform(seqs)</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>src/predictor.py</code></td>\r
                        <td>MLP 代理模型（LayerNorm + Dropout）、AdamW 訓練，並以 Pearson / Spearman 評估</td>\r
                        <td><span class="tag">PredictorTrainer.fit()</span> <span class="tag">.evaluate()</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>src/bayes_opt.py</code></td>\r
                        <td>高斯過程 + qLogEI、PCA 降維與 BoTorch 整合</td>\r
                        <td><span class="tag">BayesianOptimizer.run(n_iter)</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>src/protein_mpnn.py</code></td>\r
                        <td>k-NN Cα 圖建構器、MessagePassingLayer 與交叉熵訓練</td>\r
                        <td><span class="tag">ProteinMPNNTrainer.train_demo()</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>src/rl_reinforce.py</code></td>\r
                        <td>LSTM 策略網路、REINFORCE 更新、多目標獎勵與教師強制梯度</td>\r
                        <td><span class="tag">REINFORCETrainer.run(episodes)</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>src/data_prep.py</code></td>\r
                        <td>合成示範資料產生器 + ProteinGym CSV 載入器</td>\r
                        <td><span class="tag">make_demo_data(n, seq_len)</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>run_pipeline.py</code></td>\r
                        <td>CLI 入口，協調所有模組執行</td>\r
                        <td><span class="tag">--mode all/bo/rl/mpnn</span></td>\r
                        <td class="status">✅ 已測試</td>\r
                    </tr>\r
                    <tr>\r
                        <td><code>demo_notebook.ipynb</code></td>\r
                        <td>面試現場示範，含逐步說明與內嵌圖表</td>\r
                        <td><span class="tag">Jupyter 筆記本</span></td>\r
                        <td class="status">✅ 可用</td>\r
                    </tr>\r
                </tbody>\r
            </table>\r
        </section>\r
\r
        <!-- How to Run -->\r
        <section class="reveal">\r
            <h2>快速開始</h2>\r
            <pre><code># 安裝相依套件（約 2 分鐘）\r
pip install -r requirements.txt\r
\r
# 以真實 ESM-2 嵌入執行完整 pipeline（首次會下載約 30 MB）\r
python run_pipeline.py --mode all\r
\r
# 個別模組模式\r
python run_pipeline.py --mode bo    --epochs 100 --bo-iters 20\r
python run_pipeline.py --mode rl    --rl-episodes 50\r
python run_pipeline.py --mode mpnn\r
\r
# 互動式示範（Jupyter）\r
jupyter notebook demo_notebook.ipynb</code></pre>\r
        </section>\r
\r
        <!-- Discussion Points -->\r
        <section class="reveal">\r
            <h2>面試可討論重點</h2>\r
            <div class="algo-grid">\r
                <div class="algo-card">\r
                    <h3>為什麼選 ESM-2，而不是獨熱編碼？</h3>\r
                    <ul>\r
                        <li>可捕捉長距離共演化訊號，且不依賴 MSA</li>\r
                        <li>預訓練過程中隱含學到結構知識</li>\r
                        <li>遷移學習可降低標註資料需求</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>為什麼在 GP 前先做 PCA？</h3>\r
                    <ul>\r
                        <li>320 維輸入下的 GP 協方差矩陣容易病態</li>\r
                        <li>8 維仍保留 81.9% 變異量，數值條件更穩定</li>\r
                        <li>可降低計算成本，從 O(n^3) 壓到較可控的低維運算</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>REINFORCE 和 PPO 差在哪裡？</h3>\r
                    <ul>\r
                        <li>REINFORCE：簡單、屬於精確策略梯度，但變異較高</li>\r
                        <li>PPO：使用截斷代理目標，訓練通常更穩定</li>\r
                        <li>若要產品化通常更偏向 PPO / SAC；REINFORCE 適合原型驗證</li>\r
                    </ul>\r
                </div>\r
                <div class="algo-card">\r
                    <h3>如何接進濕實驗驗證？</h3>\r
                    <ul>\r
                        <li>每一輪先用 BO 挑出 top-k 序列</li>\r
                        <li>將 assay 結果回填到 GP 訓練集</li>\r
                        <li>反覆迭代成主動學習閉環，也就是貝葉斯最佳化流程</li>\r
                    </ul>\r
                </div>\r
            </div>\r
        </section>\r
\r
        <div data-site-footer></div>\r
\r
    </div>\r
\r
    <button class="scroll-top" aria-label="返回頂部">↑</button>\r
`;
  const headInline = "";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "蛋白質設計 AI — 專案報告", "description": "蛋白質 AI Pipeline 完整報告，涵蓋 ESM-2 嵌入、貝葉斯最佳化、REINFORCE 強化學習、ProteinMPNN 架構與實驗結果。", "bodyPage": "report", "pageStyles": ["/styles/report.css"], "pageScripts": [], "headInline": headInline }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Fragment", Fragment, {}, { "default": ($$result3) => renderTemplate`${unescapeHTML(bodyHtml)}` })} ` })}`;
}, "D:/project/astro/src/pages/report.astro", void 0);

const $$file = "D:/project/astro/src/pages/report.astro";
const $$url = "/report.html";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Report,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
