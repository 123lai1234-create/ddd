import { c as createComponent } from './astro-component_DIKdwFAr.mjs';
import 'piccolore';
import { r as renderComponent, a as renderTemplate, F as Fragment, u as unescapeHTML } from './prerender_OQTAnlvW.mjs';
import { $ as $$Base } from './Base_msUDbCzB.mjs';

const $$InterviewPrep = createComponent(($$result, $$props, $$slots) => {
  const bodyHtml = `\r
\r
    <!-- ── Nav ── -->\r
    <div data-site-nav></div>\r
\r
    <header>\r
        <div class="header-top">\r
            <div class="badge">AI Biotech</div>\r
            <div class="badge" style="background:var(--accent2)">6週衝刺</div>\r
        </div>\r
        <h1>大分子AI演算法研究職位 · 面試準備手冊</h1>\r
        <p>濕實驗 × 最佳化演算法 × PyTorch → 蛋白質AI</p>\r
        <nav class="tabs">\r
            <button class="tab-btn active" onclick="switchTab('overview',this)">01 總覽</button>\r
            <button class="tab-btn" onclick="switchTab('project',this)">02 Mini Project</button>\r
            <button class="tab-btn" onclick="switchTab('math',this)">03 數學推導</button>\r
            <button class="tab-btn" onclick="switchTab('rl',this)">04 RL應用</button>\r
            <button class="tab-btn" onclick="switchTab('mock',this)">05 模擬面試</button>\r
            <button class="tab-btn" onclick="switchTab('checklist',this)">06 準備清單</button>\r
        </nav>\r
    </header>\r
\r
    <!-- ══════════════════════════════════════════════════════ -->\r
    <!-- TAB 01: Overview                                       -->\r
    <!-- ══════════════════════════════════════════════════════ -->\r
    <div id="tab-overview" class="tab-content active">\r
\r
        <div class="card">\r
            <div class="card-title">🔬 你的優勢組合（主動在面試中強調）</div>\r
            <div class="grid2">\r
                <div>\r
                    <span class="tag green">濕實驗 3年+</span>\r
                    <ul class="styled" style="margin-top:10px">\r
                        <li>理解蛋白質/抗體的實驗流程（篩選、親和力測定、可開發性）</li>\r
                        <li>知道數據從哪裡來、有什麼噪音和限制</li>\r
                        <li>能與濕實驗團隊溝通，這正是職責 2、3 的核心</li>\r
                        <li>3年以上代表你懂項目推進，不只是學生</li>\r
                    </ul>\r
                </div>\r
                <div>\r
                    <span class="tag">最佳化演算法論文</span>\r
                    <ul class="styled" style="margin-top:10px">\r
                        <li>有計算思維和數學基礎——目標函數、約束、搜索策略</li>\r
                        <li>已有 PyTorch 實作經驗，不是從零開始</li>\r
                        <li>能用數學框架解讀生物 AI 問題，純 CS 難以複製</li>\r
                        <li>論文寫作 → 具備追蹤前沿、撰寫論文/專利的潛力</li>\r
                    </ul>\r
                </div>\r
            </div>\r
        </div>\r
\r
        <div class="card">\r
            <div class="card-title">📚 技術缺口與補強優先順序</div>\r
            <table>\r
                <thead>\r
                    <tr>\r
                        <th>優先級</th>\r
                        <th>技術</th>\r
                        <th>說明</th>\r
                        <th>預估時間</th>\r
                    </tr>\r
                </thead>\r
                <tbody>\r
                    <tr>\r
                        <td><span class="priority-red">🔴 最優先</span></td>\r
                        <td>蛋白質AI領域知識</td>\r
                        <td>AlphaFold2、ProteinMPNN、ESM-2 的數學與應用</td>\r
                        <td>2–3週</td>\r
                    </tr>\r
                    <tr>\r
                        <td><span class="priority-red">🔴 最優先</span></td>\r
                        <td>強化學習基礎</td>\r
                        <td>MDP框架、PPO目標函數、Reward設計</td>\r
                        <td>1–2週</td>\r
                    </tr>\r
                    <tr>\r
                        <td><span class="priority-red">🔴 最優先</span></td>\r
                        <td>圖神經網路（GCN）</td>\r
                        <td>節點/邊訊息傳遞、PyTorch Geometric</td>\r
                        <td>1週</td>\r
                    </tr>\r
                    <tr>\r
                        <td><span class="priority-orange">🟡 中優先</span></td>\r
                        <td>擴散模型</td>\r
                        <td>DDPM數學原理、RFdiffusion應用</td>\r
                        <td>1週</td>\r
                    </tr>\r
                    <tr>\r
                        <td><span class="priority-orange">🟡 中優先</span></td>\r
                        <td>Hugging Face生態</td>\r
                        <td>ESM模型載入、微調基礎</td>\r
                        <td>3–5天</td>\r
                    </tr>\r
                    <tr>\r
                        <td><span class="priority-green">🟢 低優先</span></td>\r
                        <td>大模型微調</td>\r
                        <td>LoRA、instruction tuning概念</td>\r
                        <td>按需補</td>\r
                    </tr>\r
                </tbody>\r
            </table>\r
        </div>\r
\r
        <div class="card">\r
            <div class="card-title">📄 必讀論文清單（按數學角度切入）</div>\r
            <table>\r
                <thead>\r
                    <tr>\r
                        <th>#</th>\r
                        <th>論文</th>\r
                        <th>核心數學概念</th>\r
                        <th>優先級</th>\r
                    </tr>\r
                </thead>\r
                <tbody>\r
                    <tr>\r
                        <td>1</td>\r
                        <td>ProteinMPNN (Science 2022)</td>\r
                        <td>自迴歸條件概率、圖上訊息傳遞</td>\r
                        <td><span class="priority-red">必讀</span></td>\r
                    </tr>\r
                    <tr>\r
                        <td>2</td>\r
                        <td>ESM-2 / ESMFold (Meta 2022)</td>\r
                        <td>遮罩語言模型訓練目標</td>\r
                        <td><span class="priority-red">必讀</span></td>\r
                    </tr>\r
                    <tr>\r
                        <td>3</td>\r
                        <td>AlphaFold2 (Nature 2021)</td>\r
                        <td>attention + 幾何約束最佳化</td>\r
                        <td><span class="priority-red">必讀</span></td>\r
                    </tr>\r
                    <tr>\r
                        <td>4</td>\r
                        <td>RFdiffusion (Nature 2023)</td>\r
                        <td>擴散過程的去噪目標函數</td>\r
                        <td><span class="priority-orange">第2批</span></td>\r
                    </tr>\r
                    <tr>\r
                        <td>5</td>\r
                        <td>DPO/RLHF 綜述</td>\r
                        <td>將偏好轉化為最佳化問題</td>\r
                        <td><span class="priority-orange">第2批</span></td>\r
                    </tr>\r
                </tbody>\r
            </table>\r
        </div>\r
\r
        <div class="card">\r
            <div class="card-title">🗓️ 6週衝刺計劃</div>\r
            <div style="margin-bottom:14px">\r
                <div class="week-header">第 1–2 週</div>\r
                <ul class="styled">\r
                    <li>讀 ProteinMPNN + ESM-2 論文，專注數學部分</li>\r
                    <li>跑通 Hugging Face 上的 ESM-2 模型（嵌入提取）</li>\r
                    <li>學習 GCN 基本概念，PyTorch Geometric 入門</li>\r
                </ul>\r
            </div>\r
            <div style="margin-bottom:14px">\r
                <div class="week-header">第 3–4 週</div>\r
                <ul class="styled">\r
                    <li>學 RL 基礎：OpenAI Spinning Up 前三章</li>\r
                    <li>讀 RFdiffusion 論文，理解擴散模型目標函數</li>\r
                    <li>開始 Mini Project：ESM-2 embedding + GP 代理模型</li>\r
                </ul>\r
            </div>\r
            <div>\r
                <div class="week-header">第 5–6 週</div>\r
                <ul class="styled">\r
                    <li>完成 Mini Project：貝葉斯最佳化 + 可視化</li>\r
                    <li>練習 3–5 個「最佳化框架解釋生物AI」的標準回答</li>\r
                    <li>模擬面試 × 3，針對弱點補強</li>\r
                </ul>\r
            </div>\r
        </div>\r
\r
        <div class="card">\r
            <div class="card-title">💡 核心面試敘事框架</div>\r
            <div class="quote">\r
                「我有濕實驗背景所以我知道數據的真實局限；我有最佳化背景所以我把每個AI問題都先問『目標函數是什麼、約束是什麼』；我有PyTorch基礎所以我能實現這些想法。這三件事加在一起，讓我能在模型設計、實驗設計和跨團隊溝通上同時貢獻。」\r
            </div>\r
        </div>\r
\r
    </div>\r
\r
    <!-- ══════════════════════════════════════════════════════ -->\r
    <!-- TAB 02: Mini Project                                   -->\r
    <!-- ══════════════════════════════════════════════════════ -->\r
    <div id="tab-project" class="tab-content">\r
\r
        <div class="card">\r
            <div class="card-title">🧬 Mini Project：ESM-2 Embedding + 貝葉斯最佳化 蛋白質熱穩定性預測與序列優化</div>\r
            <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">\r
                展示三個核心優勢：最佳化背景 × PyTorch × 生物直覺。完整可執行，附詳細注釋。\r
            </p>\r
\r
            <div class="code-label">Step 0 — 安裝依賴</div>\r
            <pre><code>pip install transformers torch botorch gpytorch scikit-learn matplotlib pandas</code></pre>\r
\r
            <div class="code-label">Step 1 — 數據準備（使用 ProteinGym 公開突變數據集）</div>\r
            <pre><code>import pandas as pd\r
import numpy as np\r
import torch\r
\r
# 使用 ProteinGym 中的 GB1 突變穩定性數據集（公開）\r
# 下載：https://github.com/OATML-Markslab/ProteinGym\r
# 簡化版：直接用含序列和 fitness 分數的 CSV\r
\r
def load_data(csv_path):\r
    """\r
    CSV 格式：sequence | fitness_score\r
    fitness_score 越高代表熱穩定性越好\r
    """\r
    df = pd.read_csv(csv_path)\r
    sequences = df['sequence'].tolist()\r
    labels = torch.tensor(df['fitness_score'].values, dtype=torch.float32)\r
    return sequences, labels\r
\r
# Demo 用假數據（實際使用時替換為真實 CSV）\r
def make_demo_data(n=100, seq_len=56):\r
    """生成示意用的隨機序列和隨機穩定性分數"""\r
    amino_acids = 'ACDEFGHIKLMNPQRSTVWY'\r
    sequences = [\r
        ''.join(np.random.choice(list(amino_acids), seq_len))\r
        for _ in range(n)\r
    ]\r
    # 假設 fitness 與序列中 'A'、'L' 比例正相關（簡化模擬）\r
    labels = torch.tensor([\r
        (s.count('A') + s.count('L')) / len(s) + np.random.normal(0, 0.05)\r
        for s in sequences\r
    ], dtype=torch.float32)\r
    return sequences, labels\r
\r
sequences, labels = make_demo_data(n=200)\r
print(f"數據集大小: {len(sequences)} 條序列")</code></pre>\r
\r
            <div class="code-label">Step 2 — ESM-2 Embedding 特徵提取</div>\r
            <pre><code>from transformers import EsmModel, EsmTokenizer\r
\r
# 使用最小的 ESM-2 版本（8M 參數），適合本地跑\r
MODEL_NAME = "facebook/esm2_t6_8M_UR50D"\r
tokenizer = EsmTokenizer.from_pretrained(MODEL_NAME)\r
esm_model = EsmModel.from_pretrained(MODEL_NAME)\r
esm_model.eval()\r
\r
def get_embeddings(sequences, batch_size=16):\r
    """\r
    輸入：蛋白質序列列表\r
    輸出：shape (N, 320) 的 embedding tensor\r
    320 = ESM-2 8M 模型的隱藏層維度\r
    \r
    用 mean pooling 把變長序列壓縮為固定維度向量\r
    """\r
    all_embeddings = []\r
    for i in range(0, len(sequences), batch_size):\r
        batch = sequences[i:i+batch_size]\r
        inputs = tokenizer(\r
            batch,\r
            return_tensors="pt",\r
            padding=True,\r
            truncation=True,\r
            max_length=512\r
        )\r
        with torch.no_grad():\r
            outputs = esm_model(**inputs)\r
        \r
        # last_hidden_state: (batch, seq_len, hidden_dim)\r
        # attention_mask: (batch, seq_len) — 0 表示 padding\r
        hidden = outputs.last_hidden_state\r
        mask = inputs['attention_mask'].unsqueeze(-1).float()\r
        \r
        # Masked mean pooling（忽略 padding token）\r
        embeddings = (hidden * mask).sum(dim=1) / mask.sum(dim=1)\r
        all_embeddings.append(embeddings)\r
    \r
    return torch.cat(all_embeddings, dim=0)\r
\r
print("正在提取 ESM-2 embedding（首次執行會下載模型約 30MB）...")\r
embeddings = get_embeddings(sequences)\r
print(f"Embedding shape: {embeddings.shape}")  # (200, 320)</code></pre>\r
\r
            <div class="code-label">Step 3 — 訓練穩定性預測模型（神經網路代理模型）</div>\r
            <pre><code>import torch.nn as nn\r
from torch.utils.data import DataLoader, TensorDataset\r
from sklearn.model_selection import train_test_split\r
from sklearn.preprocessing import StandardScaler\r
\r
# ── 數據分割 ──\r
X = embeddings.numpy()\r
y = labels.numpy()\r
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\r
\r
# 標準化（重要：穩定 GP 和 NN 訓練）\r
scaler = StandardScaler()\r
X_train_s = torch.tensor(scaler.fit_transform(X_train), dtype=torch.float32)\r
X_test_s  = torch.tensor(scaler.transform(X_test), dtype=torch.float32)\r
y_train_t = torch.tensor(y_train, dtype=torch.float32).unsqueeze(1)\r
y_test_t  = torch.tensor(y_test, dtype=torch.float32).unsqueeze(1)\r
\r
# ── 模型架構 ──\r
class StabilityPredictor(nn.Module):\r
    """\r
    簡單的前饋網路，把 ESM-2 embedding 映射到穩定性分數\r
    Dropout 防止小數據集過擬合\r
    """\r
    def __init__(self, input_dim=320):\r
        super().__init__()\r
        self.net = nn.Sequential(\r
            nn.Linear(input_dim, 128),\r
            nn.LayerNorm(128),\r
            nn.ReLU(),\r
            nn.Dropout(0.2),\r
            nn.Linear(128, 64),\r
            nn.ReLU(),\r
            nn.Dropout(0.1),\r
            nn.Linear(64, 1)\r
        )\r
    def forward(self, x):\r
        return self.net(x)\r
\r
model = StabilityPredictor(input_dim=X_train_s.shape[1])\r
optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)\r
criterion = nn.MSELoss()\r
loader = DataLoader(TensorDataset(X_train_s, y_train_t), batch_size=32, shuffle=True)\r
\r
# ── 訓練迴圈 ──\r
train_losses = []\r
for epoch in range(100):\r
    model.train()\r
    epoch_loss = 0\r
    for xb, yb in loader:\r
        optimizer.zero_grad()\r
        pred = model(xb)\r
        loss = criterion(pred, yb)\r
        loss.backward()\r
        optimizer.step()\r
        epoch_loss += loss.item()\r
    train_losses.append(epoch_loss / len(loader))\r
    if (epoch + 1) % 20 == 0:\r
        print(f"Epoch {epoch+1:3d} | Loss: {train_losses[-1]:.4f}")\r
\r
# ── 評估 ──\r
model.eval()\r
with torch.no_grad():\r
    y_pred = model(X_test_s).squeeze().numpy()\r
corr = np.corrcoef(y_pred, y_test)[0, 1]\r
print(f"\\nPearson 相關係數 (test): {corr:.3f}")</code></pre>\r
\r
            <div class="code-label">Step 4 — 貝葉斯最佳化（核心差異化：用 GP + EI 在 latent space 搜索）</div>\r
            <pre><code>from botorch.models import SingleTaskGP\r
from botorch.fit import fit_gpytorch_mll\r
from botorch.acquisition import ExpectedImprovement\r
from botorch.optim import optimize_acqf\r
from gpytorch.mlls import ExactMarginalLogLikelihood\r
\r
def bayesian_optimization_loop(\r
    X_init,      # 初始訓練點 (n_init, d)\r
    y_init,      # 初始觀測值 (n_init, 1)\r
    bounds,      # 搜索範圍 (2, d)，通常是標準化後的 [-3, 3]\r
    n_iter=10    # BO 迭代輪數\r
):\r
    """\r
    貝葉斯最佳化核心流程：\r
    1. 用現有數據擬合高斯過程（代理模型）\r
    2. 用 Expected Improvement（EI）採集函數選下一個候選點\r
    3. 评估候選點（這裡用 NN 代理，實際應用中送去實驗）\r
    4. 更新數據，重複\r
    \r
    EI 的核心思想：平衡探索（不確定性高的區域）與利用（預測分數高的區域）\r
    """\r
    X_obs = X_init.clone()\r
    y_obs = y_init.clone()\r
    \r
    best_values = [y_obs.max().item()]\r
    \r
    for i in range(n_iter):\r
        # Step 1: 擬合 GP\r
        gp = SingleTaskGP(X_obs, y_obs)\r
        mll = ExactMarginalLogLikelihood(gp.likelihood, gp)\r
        fit_gpytorch_mll(mll)\r
        \r
        # Step 2: 定義 EI 採集函數\r
        EI = ExpectedImprovement(model=gp, best_f=y_obs.max())\r
        \r
        # Step 3: 最佳化採集函數，找下一個候選點\r
        candidate, acq_value = optimize_acqf(\r
            EI,\r
            bounds=bounds,\r
            q=1,              # 每輪提議 1 個候選點\r
            num_restarts=5,   # 多起點避免局部最佳\r
            raw_samples=50\r
        )\r
        \r
        # Step 4: 模擬「評估」新候選點（真實應用中為實驗結果）\r
        with torch.no_grad():\r
            new_y = model(candidate).detach()\r
        \r
        # 更新觀測集\r
        X_obs = torch.cat([X_obs, candidate], dim=0)\r
        y_obs = torch.cat([y_obs, new_y], dim=0)\r
        best_values.append(y_obs.max().item())\r
        \r
        print(f"BO 第 {i+1:2d} 輪 | 當前最佳: {best_values[-1]:.4f} | EI: {acq_value.item():.4f}")\r
    \r
    return X_obs, y_obs, best_values\r
\r
# 用 embedding 空間的主成分做為搜索空間（降維後更穩定）\r
from sklearn.decomposition import PCA\r
pca = PCA(n_components=10)\r
X_pca = pca.fit_transform(X_train_s.numpy())\r
X_bo = torch.tensor(X_pca[:20], dtype=torch.float64)  # BoTorch 需要 float64\r
y_bo = torch.tensor(y_train[:20], dtype=torch.float64).unsqueeze(1)\r
\r
# 搜索範圍：標準化後各維度的 [-3, 3]\r
bounds = torch.stack([\r
    torch.full((10,), -3., dtype=torch.float64),\r
    torch.full((10,), 3.,  dtype=torch.float64)\r
])\r
\r
print("開始貝葉斯最佳化...")\r
X_final, y_final, improvement_curve = bayesian_optimization_loop(X_bo, y_bo, bounds, n_iter=10)</code></pre>\r
\r
            <div class="code-label">Step 5 — 視覺化輸出（四張圖串成完整面試故事）</div>\r
            <pre><code># 執行 pipeline 後，outputs/ 目錄會產生 results.png\r
# 內含 2×2 四格圖，每格對應一個面試故事：\r
python run_pipeline.py --mode bo</code></pre>\r
\r
            <div class="card-title" style="margin-top:20px">📊 四張圖 × 四個故事（15 分鐘 Project Presentation 框架）</div>\r
\r
            <div style="display:grid;gap:14px;margin-top:14px">\r
                <div\r
                    style="background:var(--surface);border:1px solid #2e3352;border-left:3px solid #6c63ff;border-radius:10px;padding:16px">\r
                    <div style="font-size:.75rem;font-weight:700;color:#6c63ff;letter-spacing:.08em;margin-bottom:6px">①\r
                        學習曲線　Training + Validation Loss</div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin:0 0 8px">訓練與驗證損失同步下降、間距收窄 → 模型有效學習且未過擬合。\r
                    </p>\r
                    <div\r
                        style="background:#0a0d15;border-radius:6px;padding:10px 14px;font-size:.82rem;color:#e6edf3;font-style:italic;border-left:2px solid #6c63ff">\r
                        「兩條曲線的間距代表 generalization gap。若驗證損失開始反彈（overfitting），我的對策是提早停止或加強 Dropout。這個模型訓練到 ~60 epoch 後\r
                        val loss 趨於平穩，表示沒有 overfit。」\r
                    </div>\r
                </div>\r
\r
                <div\r
                    style="background:var(--surface);border:1px solid #2e3352;border-left:3px solid #00d4aa;border-radius:10px;padding:16px">\r
                    <div style="font-size:.75rem;font-weight:700;color:#00d4aa;letter-spacing:.08em;margin-bottom:6px">②\r
                        散點圖　Predicted vs. True Fitness</div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin:0 0 8px">點越靠近紅色對角線（Ideal line）代表預測越準確。X\r
                        軸為實驗測量值，Y 軸為模型預測值。</p>\r
                    <div\r
                        style="background:#0a0d15;border-radius:6px;padding:10px 14px;font-size:.82rem;color:#e6edf3;font-style:italic;border-left:2px solid #00d4aa">\r
                        「R² = 0.81 表示模型能解釋 81% 的實驗變異。在這類含高噪音的生物數據上，這是合理且實用的結果。更重要的是 Spearman ρ 也達到\r
                        0.79，代表模型的排序能力強——這在虛擬篩選中比絕對值準確度更關鍵。」\r
                    </div>\r
                </div>\r
\r
                <div\r
                    style="background:var(--surface);border:1px solid #2e3352;border-left:3px solid #ffd166;border-radius:10px;padding:16px">\r
                    <div style="font-size:.75rem;font-weight:700;color:#ffd166;letter-spacing:.08em;margin-bottom:6px">③\r
                        BO 收斂曲線　Bayesian Optimization Convergence</div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin:0 0 8px">每輪迭代後「當前最佳 fitness」的變化。曲線持續上升（或\r
                        Kd 持續下降）代表 BO 有效在序列空間探索。</p>\r
                    <div\r
                        style="background:#0a0d15;border-radius:6px;padding:10px 14px;font-size:.82rem;color:#e6edf3;font-style:italic;border-left:2px solid #ffd166">\r
                        「這條曲線展示了主動學習的效率。不需要窮舉所有序列，每一輪 EI（Expected Improvement）都在做最有資訊量的探索——它自動平衡『開採已知好區域』和『探索不確定高的區域』。15\r
                        輪中我找到初始最佳值 +0.23 的候選。」\r
                    </div>\r
                </div>\r
\r
                <div\r
                    style="background:var(--surface);border:1px solid #2e3352;border-left:3px solid #ff6b6b;border-radius:10px;padding:16px">\r
                    <div style="font-size:.75rem;font-weight:700;color:#ff6b6b;letter-spacing:.08em;margin-bottom:6px">④\r
                        多樣性散點圖　UMAP Diversity（BO 候選以紅星標記）</div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin:0 0 8px">用 UMAP 將高維 ESM-2 embedding 壓縮到\r
                        2D。紅星是 BO 推薦的候選序列。</p>\r
                    <div\r
                        style="background:#0a0d15;border-radius:6px;padding:10px 14px;font-size:.82rem;color:#e6edf3;font-style:italic;border-left:2px solid #ff6b6b">\r
                        「理想情況是紅星聚集在高穩定性區域，但不擠在同一個點——這代表解的多樣性，不只找到單一局部最優。如果所有候選都疊在一起，我會調高 EI 的 exploration 權重或加入\r
                        diversity penalty。」\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <div class="card-title" style="margin-top:20px">💬 15 分鐘 Project Presentation 腳本</div>\r
            <div\r
                style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;align-items:start;font-size:.85rem;margin-top:10px">\r
                <span style="color:#ffd166;font-weight:700;white-space:nowrap">0–2 min</span>\r
                <span style="color:var(--text-muted)">問題定義：「蛋白質設計是在龐大序列空間（20^N）中找高穩定性序列。直接實驗太慢，所以我用代理模型加速搜索。」</span>\r
                <span style="color:#ffd166;font-weight:700;white-space:nowrap">2–5 min</span>\r
                <span style="color:var(--text-muted)">架構說明：ESM-2 embedding（為什麼比 one-hot 好）→ MLP surrogate → PCA latent\r
                    space → GP + EI。</span>\r
                <span style="color:#ffd166;font-weight:700;white-space:nowrap">5–8 min</span>\r
                <span style="color:var(--text-muted)">展示①②：學習曲線收斂正常，R² = 0.81，模型可靠。</span>\r
                <span style="color:#ffd166;font-weight:700;white-space:nowrap">8–12 min</span>\r
                <span style="color:var(--text-muted)">展示③④：BO 15 輪找到 +0.23 提升，UMAP 顯示解具多樣性。</span>\r
                <span style="color:#ffd166;font-weight:700;white-space:nowrap">12–15 min</span>\r
                <span style="color:var(--text-muted)">局限性與下一步：「真實應用我會換成濕實驗 oracle，並加入 batch BO\r
                    同時評估多個候選，降低實驗與等待成本。」</span>\r
            </div>\r
\r
            <div class="card-title" style="margin-top:16px">⚠️ 準備好討論局限性（展示深度）</div>\r
            <ul class="styled">\r
                <li>Latent space 中的連續移動不保證產生可折疊序列（對策：ProteinMPNN 做 decoder）</li>\r
                <li>GP 在高維（&gt; 20D）效果下降，需先降維（PCA / VAE）</li>\r
                <li>真實 oracle（濕實驗）很昂貴，需設計 batch BO 同時提交多個候選</li>\r
                <li>Demo 數據為模擬，真實上線需用 ProteinGym 或自家 assay 數據驗證</li>\r
            </ul>\r
\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <!-- TAB 03: Math Derivations                              -->\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <div id="tab-math" class="tab-content">\r
\r
                <div class="card">\r
                    <div class="card-title">📐 ProteinMPNN 完整數學推導</div>\r
\r
                    <h3 style="color:var(--accent2);margin:16px 0 8px;font-size:.95rem">1. 核心問題定義</h3>\r
                    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:10px">\r
                        給定蛋白質結構 <strong>G</strong>（原子座標），找最佳序列 <strong>s = (s₁, s₂, ..., sₙ)</strong>，使序列能折疊回該結構。\r
                    </p>\r
                    <div class="math">\r
                        P(s | G) = ∏ᵢ₌₁ᴺ P(sᵢ | s&lt;ᵢ, G)\r
                    </div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin-top:8px">\r
                        自迴歸分解：每個位置的胺基酸，依賴結構 G + 已知的前序位置 s&lt;ᵢ。\r
                    </p>\r
\r
                    <h3 style="color:var(--accent2);margin:20px 0 8px;font-size:.95rem">2. 圖的構建</h3>\r
                    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:10px">蛋白質結構 → 圖 G = (V, E)：</p>\r
                    <ul class="styled">\r
                        <li><strong>節點 vᵢ</strong>：每個殘基，特徵包含骨架原子座標（N, Cα, C, O）</li>\r
                        <li><strong>邊 eᵢⱼ</strong>：空間距離 &lt; 閾值（通常10Å）的殘基對，特徵包含相對位置和方向的幾何編碼</li>\r
                        <li><strong>幾何特徵</strong>：使用四元數或旋轉矩陣編碼殘基的局部坐標系，確保旋轉等變性</li>\r
                    </ul>\r
\r
                    <h3 style="color:var(--accent2);margin:20px 0 8px;font-size:.95rem">3. 訊息傳遞（Message Passing）</h3>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:10px">每一層更新節點表示：</p>\r
                    <div class="math">\r
                        hᵢ⁽ˡ⁺¹⁾ = Update(hᵢ⁽ˡ⁾, Σⱼ∈N(i) Message(hᵢ⁽ˡ⁾, hⱼ⁽ˡ⁾, eᵢⱼ))\r
                    </div>\r
                    <ul class="styled" style="margin-top:10px">\r
                        <li>Message = MLP([hᵢ, hⱼ, eᵢⱼ])，捕捉殘基對之間的交互</li>\r
                        <li>Update = LayerNorm(hᵢ + Linear(聚合後的訊息))</li>\r
                        <li>本質等價於帶結構約束的座標下降——你的最佳化背景最相關</li>\r
                    </ul>\r
\r
                    <h3 style="color:var(--accent2);margin:20px 0 8px;font-size:.95rem">4. 訓練目標函數</h3>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin-bottom:10px">最大化條件對數似然：</p>\r
                    <div class="math">\r
                        L = -Σᵢ₌₁ᴺ log P(sᵢ* | s&lt;ᵢ, G)\r
                    </div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin-top:8px">\r
                        理解為：帶圖結構約束的交叉熵最小化，目標是讓模型學到「什麼結構偏好什麼序列」。\r
                    </p>\r
\r
                    <h3 style="color:var(--accent2);margin:20px 0 8px;font-size:.95rem">5. ProteinMPNN vs. Rosetta</h3>\r
                    <table style="margin-top:8px">\r
                        <thead>\r
                            <tr>\r
                                <th>維度</th>\r
                                <th>Rosetta</th>\r
                                <th>ProteinMPNN</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>目標函數</td>\r
                                <td>物理能量函數（手工設計）</td>\r
                                <td>學習到的條件概率</td>\r
                            </tr>\r
                            <tr>\r
                                <td>搜索方式</td>\r
                                <td>Monte Carlo / 貪婪搜索</td>\r
                                <td>自迴歸採樣</td>\r
                            </tr>\r
                            <tr>\r
                                <td>泛化能力</td>\r
                                <td>依賴能量函數精度</td>\r
                                <td>從大量實驗數據學習</td>\r
                            </tr>\r
                            <tr>\r
                                <td>速度</td>\r
                                <td>慢（秒~分鐘/序列）</td>\r
                                <td>快（毫秒）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>局限</td>\r
                                <td>無法學習未知物理交互</td>\r
                                <td>依賴訓練數據分布</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">📐 ESM-2 訓練目標（遮罩語言模型）</div>\r
\r
                    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:10px">\r
                        ESM-2 使用 Masked Language Modeling（MLM）預訓練：\r
                    </p>\r
                    <div class="math">\r
                        L_MLM = -Σᵢ∈Mask log P(sᵢ | s\\{Mask})\r
                    </div>\r
                    <ul class="styled" style="margin-top:10px">\r
                        <li>隨機遮蔽 15% 的胺基酸，讓模型從上下文恢復</li>\r
                        <li>訓練後的 embedding 隱含進化資訊（訓練數據為 2.5 億條蛋白質序列）</li>\r
                        <li>關鍵洞見：序列中「共同進化」的位置 → 結構接觸 → embedding 中有隱含結構資訊</li>\r
                    </ul>\r
\r
                    <h3 style="color:var(--accent2);margin:16px 0 8px;font-size:.95rem">為什麼 ESM-2 embedding 適合做代理模型輸入\r
                    </h3>\r
                    <ul class="styled">\r
                        <li>把離散的序列空間映射到連續向量空間，使梯度最佳化和高斯過程可行</li>\r
                        <li>預訓練學到的進化知識作為正則化先驗，避免預測模型過擬合小數據集</li>\r
                        <li>遷移學習：僅需少量有label數據（親和力實驗結果）就能微調</li>\r
                    </ul>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">📐 AlphaFold2 核心架構（高層理解）</div>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>模組</th>\r
                                <th>數學本質</th>\r
                                <th>生物對應</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>Evoformer</td>\r
                                <td>雙軸 attention（序列軸 + 殘基對軸）</td>\r
                                <td>序列共進化資訊 → 接觸圖</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Structure Module</td>\r
                                <td>SE(3)-equivariant transformer</td>\r
                                <td>骨架剛體旋轉 + 平移迭代細化</td>\r
                            </tr>\r
                            <tr>\r
                                <td>訓練目標</td>\r
                                <td>FAPE（Frame Aligned Point Error）</td>\r
                                <td>預測坐標 vs 真實坐標的幾何損失</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Recycling</td>\r
                                <td>迭代精化（3~4輪）</td>\r
                                <td>模擬折疊的漸進收斂</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                    <div class="quote" style="margin-top:14px">\r
                        面試答法：「AlphaFold2 本質是一個帶幾何約束的最佳化問題：在 SE(3) 空間中，最小化預測剛體坐標和真實坐標的對齊誤差（FAPE）。Evoformer 用雙軸 attention\r
                        提取共進化約束，Structure Module 在每次迭代中用這些約束調整骨架，類似約束最佳化的內點法迭代。」\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <!-- TAB 04: RL Applications                               -->\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <div id="tab-rl" class="tab-content">\r
\r
                <div class="card">\r
                    <div class="card-title">🤖 為什麼RL天然適合分子設計</div>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>MDP要素</th>\r
                                <th>在分子設計中的對應</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td><strong>State</strong></td>\r
                                <td>當前分子/序列的狀態表示</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Action</strong></td>\r
                                <td>添加原子、突變一個殘基、修改側鏈</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Reward</strong></td>\r
                                <td>預測的親和力、穩定性、可開發性評分</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Policy</strong></td>\r
                                <td>生成下一步修改的模型（可以是 LLM/GNN）</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Episode</strong></td>\r
                                <td>從初始序列到最終設計序列的完整設計流程</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">案例一：抗體 CDR 優化（最貼近職責描述）</div>\r
                    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">\r
                        問題：固定抗體框架，優化 CDR3 序列以提高對靶點的親和力\r
                    </p>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>RL設定</th>\r
                                <th>實作細節</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>State</td>\r
                                <td>當前 CDR 序列 + ESM-2 embedding + 結構 context</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Action</td>\r
                                <td>在某個位置替換為某個胺基酸（20 × CDR長度 種）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Reward</td>\r
                                <td>Rosetta 計算的結合能 or 代理模型預測的 Kd（需要 sign 轉換：-ΔΔG）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Policy</td>\r
                                <td>自迴歸語言模型（微調的 ESM-2 作為 policy）</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                    <div style="margin-top:12px;color:var(--text-muted);font-size:.9rem">\r
                        <strong style="color:var(--accent4)">關鍵挑戰：</strong> Reward 稀疏（大多數突變沒有改善）<br>\r
                        <strong style="color:var(--accent2)">解法：</strong> Shaped reward — 加入中間獎勵如結構合理性分數（RMSD、pLDDT）\r
                    </div>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">案例二：REINFORCE 用於序列生成（最基礎的 Policy Gradient）</div>\r
                    <div class="math">\r
                        ∇θ L = 𝔼ₛ~πθ[R(s) · ∇θ log πθ(s)]\r
                    </div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin:12px 0">\r
                        直觀理解：讓 reward 高的序列生成概率上升，reward 低的下降。<br>\r
                        這就是你熟悉的梯度上升，只是目標函數換成了期望 reward。\r
                    </p>\r
                    <div class="code-label">簡化實作（概念示意）</div>\r
                    <pre><code>import torch\r
import torch.nn.functional as F\r
\r
def reinforce_update(model, sequences, rewards, optimizer, baseline=None):\r
    """\r
    REINFORCE 算法核心更新\r
    sequences: 採樣到的序列（token ids 列表）\r
    rewards: 對應的 reward（如親和力代理模型分數）\r
    baseline: 方差縮減的基線值（通常用歷史 reward 的移動平均）\r
    """\r
    if baseline is None:\r
        baseline = rewards.mean()\r
    \r
    advantages = rewards - baseline  # 優勢函數：高於平均就鼓勵\r
    \r
    total_loss = 0\r
    for seq_tokens, advantage in zip(sequences, advantages):\r
        # 計算策略的 log 概率\r
        logits = model(seq_tokens[:-1])  # 預測下一個 token\r
        log_probs = F.log_softmax(logits, dim=-1)\r
        seq_log_prob = log_probs[range(len(seq_tokens)-1), seq_tokens[1:]].sum()\r
        \r
        # REINFORCE 目標：最大化 E[R] = 梯度上升\r
        loss = -advantage * seq_log_prob  # 負號：因為 optimizer 做梯度下降\r
        total_loss += loss\r
    \r
    optimizer.zero_grad()\r
    total_loss.backward()\r
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # 防止梯度爆炸\r
    optimizer.step()\r
    \r
    return total_loss.item()</code></pre>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">案例三：多目標RL（最接近實際製藥需求）</div>\r
                    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:12px">\r
                        真實場景需要同時優化多個目標（可開發性三元組）：\r
                    </p>\r
                    <div class="math">\r
                        R_total = w₁·R_affinity + w₂·R_stability + w₃·R_developability − w₄·R_immunogenicity\r
                    </div>\r
                    <p style="color:var(--text-muted);font-size:.88rem;margin-top:10px;margin-bottom:12px">\r
                        你的最佳化背景在這裡最有價值——如何設定權重、如何處理目標衝突（Pareto front）。\r
                    </p>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>方法</th>\r
                                <th>適用場景</th>\r
                                <th>數學工具</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>加權和</td>\r
                                <td>目標間可量化 trade-off</td>\r
                                <td>線性組合，需要調參</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Pareto RL</td>\r
                                <td>需要找 trade-off frontier</td>\r
                                <td>多目標優化、Hypervolume 指標</td>\r
                            </tr>\r
                            <tr>\r
                                <td>約束 RL</td>\r
                                <td>某些指標必須達到硬性閾值</td>\r
                                <td>Lagrangian duality + 對偶梯度下降</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Lexicographic</td>\r
                                <td>目標有明確優先級</td>\r
                                <td>分層最佳化</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">RL vs. 貝葉斯最佳化：如何選擇</div>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>維度</th>\r
                                <th>貝葉斯最佳化（BO）</th>\r
                                <th>強化學習（RL）</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>評估代價</td>\r
                                <td>高代價（少量實驗）</td>\r
                                <td>低代價（模擬/代理模型）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>搜索空間</td>\r
                                <td>連續、低維（&lt;20D）</td>\r
                                <td>離散、高維、序列型</td>\r
                            </tr>\r
                            <tr>\r
                                <td>先驗知識</td>\r
                                <td>GP kernel 編碼先驗</td>\r
                                <td>Policy 架構編碼歸納偏置</td>\r
                            </tr>\r
                            <tr>\r
                                <td>數據效率</td>\r
                                <td>高（主動學習）</td>\r
                                <td>低（需要大量樣本）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>可解釋性</td>\r
                                <td>高（GP 提供不確定性估計）</td>\r
                                <td>低（policy 為黑箱）</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                    <div class="quote" style="margin-top:14px">\r
                        面試框架：「對預算緊張的早期多輪篩選，貝葉斯最佳化更合適；對迭代設計cycle短、可以大量模擬的場景（如虛擬篩選），RL更適合。在我的mini\r
                        project中，我選BO是因為假設真實實驗評估代價高。」\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <!-- TAB 05: Mock Interview                                 -->\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <div id="tab-mock" class="tab-content">\r
\r
                <div class="card" style="margin-bottom:12px">\r
                    <p style="color:var(--text-muted);font-size:.9rem">\r
                        建議：先閉著答案想30秒，再展開參考回答。重點不是背答案，而是用「最佳化框架」解讀每個問題。\r
                    </p>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q1｜AlphaFold2 的基本原理是什麼？它能做什麼、不能做什麼？</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架：</strong>\r
                        <p>「AlphaFold2 本質是一個帶幾何約束的最佳化問題，目標是學習一個映射 f: 序列 → 3D坐標，損失函數是FAPE（Frame Aligned Point\r
                            Error），在SE(3)空間度量剛體坐標的對齊誤差。</p>\r
                        <p style="margin-top:8px">架構上有兩個關鍵創新：Evoformer用雙軸attention同時建模序列和殘基對關係，Structure\r
                            Module用可微分的幾何操作迭代精化骨架坐標，類似約束最佳化的迭代细化。</p>\r
                        <p style="margin-top:8px"><strong style="color:var(--accent4)">能做：</strong>\r
                            單體蛋白質結構預測（從序列），精度接近實驗方法（PDB\r
                            benchmark &lt;1Å RMSD多數情況）。</p>\r
                        <p style="margin-top:8px"><strong style="color:var(--accent3)">不能做：</strong>\r
                            預測動態狀態（只給一個靜態構象）；對本質無序蛋白（IDR）置信度低（pLDDT &lt;70要注意）；無法預測結合後的構象變化（需要AlphaFold-Multimer或Rosetta\r
                            dock）；不預測序列→功能。」</p>\r
                    </div>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q2｜如何設計抗體親和力優化的AI方案？（開放式設計題）</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架（展示最佳化思維）：</strong>\r
                        <p>「我會先把這個問題框架化：目標函數是最大化CDR序列的抗原結合親和力（可用Kd或ΔΔG量化），約束包括可開發性（溶解度、免疫原性、PTM位點），搜索空間是CDR3位置的20^L種組合（L為序列長）。\r
                        </p>\r
                        <p style="margin-top:8px"><strong>方案一（數據豐富）：</strong>\r
                            用現有親和力SAR數據微調ESM-2或IgLM，作為序列生成的prior；用PPO或REINFORCE微調，reward為代理模型預測的ΔΔG，加入可開發性作為約束reward。\r
                        </p>\r
                        <p style="margin-top:8px"><strong>方案二（數據稀缺）：</strong> 用ESM-2\r
                            embedding作特徵，用貝葉斯最佳化做主動學習循環，每輪選擇EI最大的幾條候選序列送實驗，模型隨實驗數據迭代更新。這在早期項目、預算緊張時更高效。</p>\r
                        <p style="margin-top:8px"><strong>我的優勢：</strong>\r
                            因為我有濕實驗背景，我能評估哪個方案在實際實驗流程中可落地，避免『模型很漂亮但實驗無法配合』的問題。」</p>\r
                    </div>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q3｜ProteinMPNN 和傳統 Rosetta 設計有什麼本質差異？</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架：</strong>\r
                        <p>「從最佳化的角度，兩者解決的問題相同——給定結構，找最佳序列——但目標函數本質不同。</p>\r
                        <p style="margin-top:8px">Rosetta 使用手工設計的物理能量函數（Lennard-Jones、氫鍵項等），在這個能量函數上用Monte\r
                            Carlo做序列搜索。它的問題是：能量函數是人對物理的近似，有誤差，而且計算慢（秒~分鐘/序列）。</p>\r
                        <p style="margin-top:8px">ProteinMPNN 直接學習 P(sequence |\r
                            structure)，目標函數是最大化對數條件概率。它學到的不是物理規則，而是大量真實蛋白質數據中「哪種結構喜歡哪種序列」的統計模式。優點是能捕捉到能量函數沒有明確建模的交互，速度快几千倍。\r
                        </p>\r
                        <p style="margin-top:8px">但 ProteinMPNN 的局限是：它的生成域受訓練數據分布限制，對非天然骨架可能外推失效。在實際應用中，我會用 ProteinMPNN\r
                            快速生成大量候選序列，再用 Rosetta 對 top 候選做精細能量評估，兩者互補。」</p>\r
                    </div>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q4｜GCN（圖神經網路）為什麼適合處理分子結構？</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架：</strong>\r
                        <p>「分子天然是圖結構：原子是節點，化學鍵/空間接觸是邊。這種結構有兩個特性使得傳統向量方法不適用：一是變長（不同分子/蛋白質原子數不同）；二是不具位置不變性（分子圖的節點沒有固定的全局座位）。\r
                        </p>\r
                        <p style="margin-top:8px">GCN 的訊息傳遞機制天然滿足這兩個需求：無論分子多大，都可以用相同的訊息函數 Message(v_i, v_j, e_ij)\r
                            聚合局部鄰居信息；而且由於用的是局部聚合，對節點重排是不變的（置換不變性）。</p>\r
                        <p style="margin-top:8px">在蛋白質結構中，每個殘基的化學性質由它周圍的環境決定（正是GCN的感受野概念），這和實驗中觀察到的接觸殘基協同進化現象完全吻合。這也是為什麼\r
                            ProteinMPNN 用圖上訊息傳遞比純序列模型在設計任務上效果好：它顯式用了結構圖的局部環境信息。」</p>\r
                    </div>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q5｜你的濕實驗數據如何轉化為AI訓練數據？你踩過哪些坑？</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架（展示稀缺的跨界視角）：</strong>\r
                        <p>「這是大多數計算背景的人容易忽略的問題，但實際上卻是整個pipeline最脆弱的部分。</p>\r
                        <p style="margin-top:8px"><strong>數據清洗層面：</strong> 親和力測定（如SPR/ITC）的結果受surface\r
                            density、參考buffer、批次等影響，直接拿\r
                            Kd 值做訓練標籤會引入系統誤差。我在實驗中學到：最好是用同批次內的相對排名（ordinal label）而不是絕對 Kd 值，或者對跨批次數據做 batch correction。\r
                        </p>\r
                        <p style="margin-top:8px"><strong>selection bias：</strong>\r
                            實驗通常只測定「看起來有希望」的候選，導致訓練數據分布偏向序列空間的特定區域，模型對未探索區域的外推能力差。主動學習（貝葉斯最佳化）能部分解決這個問題。</p>\r
                        <p style="margin-top:8px"><strong>Label noise：</strong> 多次重複實驗之間的差異（尤其是 cell-based assay）可能超過\r
                            2~3倍，需要在損失函數中顯式建模不確定性，或用異方差回歸。」</p>\r
                    </div>\r
                </div>\r
\r
                <div class="accordion">\r
                    <div class="accordion-header" onclick="toggleAccordion(this)">\r
                        <span>Q6｜如果模型預測和實驗結果不一致，你怎麼排查？</span>\r
                        <span class="accordion-arrow">▼</span>\r
                    </div>\r
                    <div class="accordion-body">\r
                        <strong style="color:var(--accent2)">回答框架（結構化分析）：</strong>\r
                        <p>「我會系統性地排查三個層次：</p>\r
                        <p style="margin-top:8px"><strong>1. 是否是數據問題：</strong>\r
                            新實驗結果是否在訓練集的分布範圍內？如果不一致的序列和訓練數據差異很大，這是正常的外推誤差，不是模型bug。確認實驗assay條件是否有變化（batch effect）。</p>\r
                        <p style="margin-top:8px"><strong>2. 是否是特徵問題：</strong> 模型用的特徵（如ESM\r
                            embedding）是否捕獲了導致實驗差異的物理機制？例如：如果親和力差異來自特定的構象變化，而模型只看了一個靜態結構，那模型天然會盲。</p>\r
                        <p style="margin-top:8px"><strong>3. 是否是模型問題：</strong>\r
                            在已知正確答案的留存集上，模型在類似序列上是否也有這種偏差？是系統性誤差（需要重新設計特徵）還是隨機誤差（需要更多數據）？</p>\r
                        <p style="margin-top:8px">最後，我很重視把這些不一致的案例記錄下來，它們往往是模型改善最寶貴的信號。」</p>\r
                    </div>\r
                </div>\r
\r
            </div>\r
\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <!-- TAB 06: Checklist                                      -->\r
            <!-- ══════════════════════════════════════════════════════ -->\r
            <div id="tab-checklist" class="tab-content">\r
\r
                <div class="card">\r
                    <div class="card-title">✅ 週度準備清單</div>\r
\r
                    <p class="week-header">第 1 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c1"><label for="c1">在 Hugging Face 上跑通 ESM-2\r
                            模型，提取一條序列的\r
                            embedding</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c2"><label for="c2">閱讀 ProteinMPNN 論文 Methods\r
                            部分，手寫一遍訊息傳遞公式</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c3"><label for="c3">完成 PyTorch Geometric\r
                            的「Introduction\r
                            by Example」教學</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c4"><label for="c4">用 BioPython 解析一個 PDB\r
                            文件，提取殘基座標</label></div>\r
\r
                    <p class="week-header">第 2 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c5"><label for="c5">閱讀 ESM-2 論文，理解 MLM 預訓練目標和\r
                            scaling law\r
                            部分</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c6"><label for="c6">能口頭解釋 ProteinMPNN 和 Rosetta\r
                            的本質差異（不看筆記版）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c7"><label for="c7">下載 ProteinGym 數據集，做基本的\r
                            EDA（序列長度分布、fitness分布）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c8"><label for="c8">完成 Mini Project 的 Step\r
                            1–2（數據準備 +\r
                            embedding 提取）</label></div>\r
\r
                    <p class="week-header">第 3 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c9"><label for="c9">讀 OpenAI Spinning Up：Part\r
                            1（Key\r
                            Concepts）+ Part 2（Vanilla Policy Gradient）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c10"><label for="c10">能解釋 REINFORCE 的目標函數推導（從期望\r
                            reward\r
                            到梯度估計）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c11"><label for="c11">完成 Mini Project 的 Step\r
                            3（訓練穩定性預測模型）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c12"><label for="c12">閱讀 AlphaFold2 論文的 Abstract\r
                            +\r
                            Methods 概覽（了解 FAPE 和 Evoformer）</label></div>\r
\r
                    <p class="week-header">第 4 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c13"><label for="c13">閱讀 RFdiffusion\r
                            論文，理解擴散過程的去噪目標函數</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c14"><label for="c14">完成 Mini Project 的 Step\r
                            4（貝葉斯最佳化循環）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c15"><label\r
                            for="c15">能畫出擴散模型的前向/逆向過程示意圖，解釋訓練目標</label>\r
                    </div>\r
\r
                    <p class="week-header">第 5 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c16"><label for="c16">完成 Mini Project 的 Step\r
                            5（可視化），整理成 2\r
                            頁的 PDF/Notebook</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c17"><label for="c17">準備 3\r
                            個「用最佳化框架解釋生物AI問題」的回答（參考模擬面試\r
                            Q2）</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c18"><label for="c18">自我模擬面試：計時回答本手冊中的 6 題，每題控制在\r
                            3\r
                            分鐘內</label></div>\r
\r
                    <p class="week-header">第 6 週</p>\r
                    <div class="check-item"><input type="checkbox" id="c19"><label\r
                            for="c19">找一個朋友模擬技術面試（若無，用錄音回放自評）</label>\r
                    </div>\r
                    <div class="check-item"><input type="checkbox" id="c20"><label for="c20">準備 3 個體現「濕實驗 + 計算」跨界思維的\r
                            STAR\r
                            案例</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c21"><label for="c21">研究目標公司的 GitHub/論文，準備 2\r
                            個關於他們技術的針對性問題</label></div>\r
                    <div class="check-item"><input type="checkbox" id="c22"><label for="c22">更新 CV：把 Mini Project\r
                            和論文的最佳化方法用 AI\r
                            domain 語言重新描述</label></div>\r
\r
                    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">\r
                        <div id="progress-text" style="color:var(--text-muted);font-size:.85rem;margin-bottom:6px">進度：0\r
                            / 22\r
                        </div>\r
                        <div class="progress-wrap">\r
                            <div class="progress-bar" id="progress-bar" style="width:0%"></div>\r
                        </div>\r
                    </div>\r
                </div>\r
\r
                <div class="card">\r
                    <div class="card-title">📌 資源清單</div>\r
                    <table>\r
                        <thead>\r
                            <tr>\r
                                <th>資源</th>\r
                                <th>用途</th>\r
                                <th>連結</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>Hugging Face ESM-2</td>\r
                                <td>Mini Project 特徵提取</td>\r
                                <td>facebook/esm2_t6_8M_UR50D</td>\r
                            </tr>\r
                            <tr>\r
                                <td>ProteinGym</td>\r
                                <td>突變穩定性數據集</td>\r
                                <td>github.com/OATML-Markslab/ProteinGym</td>\r
                            </tr>\r
                            <tr>\r
                                <td>OpenAI Spinning Up</td>\r
                                <td>RL 基礎入門</td>\r
                                <td>spinningup.openai.com</td>\r
                            </tr>\r
                            <tr>\r
                                <td>PyTorch Geometric</td>\r
                                <td>GCN 實作</td>\r
                                <td>pytorch-geometric.readthedocs.io</td>\r
                            </tr>\r
                            <tr>\r
                                <td>BoTorch</td>\r
                                <td>貝葉斯最佳化</td>\r
                                <td>botorch.org</td>\r
                            </tr>\r
                            <tr>\r
                                <td>fast.ai Practical DL</td>\r
                                <td>PyTorch 補強</td>\r
                                <td>fast.ai（免費）</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                </div>\r
            </div>\r
\r
            <script src="scripts/interview_prep.js"><\/script>\r
\r
            <div data-site-footer></div>\r
            <button class="scroll-top" aria-label="返回頂部">↑</button>\r
`;
  const headInline = "";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "大分子AI演算法研究職位 · 面試準備手冊", "description": "大分子 AI 演算法研究職位面試準備手冊——模擬問答、數學推導、Mini Project 程式碼與六週衝刺計劃。", "bodyPage": "interview_prep", "pageStyles": ["/styles/interview_prep.css"], "pageScripts": ["/scripts/interview_prep.js"], "headInline": headInline }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Fragment", Fragment, {}, { "default": ($$result3) => renderTemplate`${unescapeHTML(bodyHtml)}` })} ` })}`;
}, "D:/project/astro/src/pages/interview_prep.astro", void 0);

const $$file = "D:/project/astro/src/pages/interview_prep.astro";
const $$url = "/interview_prep.html";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$InterviewPrep,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
