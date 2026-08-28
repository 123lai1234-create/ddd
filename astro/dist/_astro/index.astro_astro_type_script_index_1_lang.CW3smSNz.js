(function(){const m=`你是這個作品集網站的 AI 助手。作者是一位擁有電資工程與生物醫學雙碩士的跨域工程師（JT Lai）。
專長：ESM-2 蛋白質語言模型、ProteinMPNN、Bayesian Optimization（BoTorch/qLogEI）、REINFORCE RL、FastAPI、Astro、NGS 分析（RNA-seq/WGS/scRNA）、PostgreSQL、台股市場資料平台。
請用繁體中文回答，保持專業友善，回答不超過 200 字。只回答與作品集相關的問題。`,h=[{keys:["背景","學歷","碩士","經歷","介紹","about","履歷","bio"],reply:`我是 JT Lai，擁有電資工程（北科電子所）與生物醫學（陽明交大解剖細胞生物所）雙碩士背景。

研究主題涵蓋蛋白質 AI 設計、基因體分析與量化交易，現在專注於把研究做成可操作的 AI 平台。

👉 詳細看 /about 頁面`},{keys:["技術","會什麼","skill","專長","stack","語言"],reply:`主要技術棧：

• **AI/ML**：PyTorch、ESM-2、ProteinMPNN、BoTorch、REINFORCE
• **後端**：FastAPI、Python、PostgreSQL、Neon、psycopg
• **前端**：Astro、React、TypeScript、Chart.js
• **NGS**：RNA-seq、WGS、scRNA-seq 流程
• **資料平台**：TWSE、Yahoo Finance、FinMind

👉 看 /works 看實際作品`},{keys:["蛋白質","mpnn","esm","protein","rosetta"],reply:`蛋白質 AI 是核心專長，涵蓋：

• **ESM-2**：蛋白質語言模型 embedding
• **ProteinMPNN**：序列設計
• **BoTorch / qLogEI**：Bayesian Optimization 主動學習
• **REINFORCE**：序列微調
• **3D 結構預覽** + **Rosetta** 簡化評分

👉 /protein-mpnn 直接玩互動工作台
👉 /report 看完整技術報告`},{keys:["基因","gene","ngs","定序","crispr"],reply:`基因體領域的兩個主要作品：

• **Gene AI 平台** (/gene-ai)：序列資料庫、RAG 文件搜尋、啟動子設計、CRISPR 導引排序、變異效應評估
• **NGS 工作站** (/ngs)：實驗設計計算器、定序深度估算、QC 到功能分析

背後串接 UniProt、Ensembl、PubMed、OpenAlex 等公開 API。`},{keys:["論文","研究","thesis","量化","遺傳"],reply:`碩士論文主題：以 48 檔 ETF50 股票池重建 PPTS × GAPPTS 遺傳演算法。

比較族群演化過程、逐檔回測表現，並用 GA + 量化指標做策略驗證。

👉 /thesis 看完整論文頁面`},{keys:["作品","作品集","project","作品總覽","portfolio"],reply:`主要作品分類：

🧬 **Protein**：蛋白質 AI 設計系統、ProteinMPNN 互動工作台
🔬 **Genomics**：基因 AI 平台、NGS 工作站
📖 **Research**：遺傳演算法論文、技術部落格
💼 **Other**：面試準備手冊、作品總覽

👉 /works 一覽所有作品`},{keys:["聯絡","email","mail","合作","contact"],reply:`📧 主要聯絡方式在 /about 頁面底部。

GitHub: github.com/123lai1234-create
HuggingFace: huggingface.co/Donttalk123

面試或合作邀約都可以直接寫信。`},{keys:["demo","範例","相似度","互動"],reply:`首頁就有兩個即時 demo：

1. **ESM-2 相似度計算**：輸入兩段蛋白質序列，看 embedding 之間的 cosine similarity
2. **GitHub 開源活動**：自動抓 repo、stars、followers 統計

往下捲就能玩。`},{keys:["你好","hi","hello","嗨","哈囉"],reply:"你好！👋 試試點下面的快速問題，或直接問我有關 JT 的背景、技術、作品集的任何問題。"}];function f(e){const t=e.toLowerCase();for(const n of h)if(n.keys.some(s=>t.includes(s.toLowerCase())))return n.reply;return null}let i=[],p=!1;const E=document.getElementById("chatbot-toggle"),a=document.getElementById("chatbot-panel"),I=document.querySelector(".chatbot-close"),b=document.querySelector(".chatbot-reset"),o=document.getElementById("chatbot-messages"),c=document.getElementById("chatbot-input"),d=document.getElementById("chatbot-send"),A=document.querySelectorAll(".chat-chip");E.addEventListener("click",()=>{a.classList.toggle("open"),a.classList.contains("open")&&setTimeout(()=>c.focus(),200)}),I.addEventListener("click",()=>a.classList.remove("open")),b?.addEventListener("click",()=>{i=[],o.innerHTML="",l("bot","對話已重置。問我任何問題吧！"),P()}),d.addEventListener("click",r),c.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),r())}),A.forEach(e=>{e.addEventListener("click",()=>{c.value=e.dataset.q,r()})});async function r(){const e=c.value.trim();if(!e||p)return;c.value="",l("user",e),i.push({role:"user",content:e}),L(),u(!0);let t=null;try{const n=typeof window.APP_CONFIG_UTILS?.resolveApiBase=="function"?await window.APP_CONFIG_UTILS.resolveApiBase({cacheKey:"chatbot"}):"",s=n?`${n}/api/chat`:"/api/chat",y=await fetch(s,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:m,messages:i.slice(-10)}),signal:AbortSignal.timeout(2e4)});if(y.ok){const g=await y.json();t=g.reply??g.content?.[0]?.text??null,t&&i.push({role:"assistant",content:t})}}catch{}if(!t){const n=f(e);n?t=n+`

_(本機離線回覆，AI 模型目前未連線)_`:t=`目前 AI 模型暫時無法連線，也沒有對應到本機知識庫。

你問的「${e}」可以試著換個關鍵字（例如：背景、技術、作品、聯絡）。`}l("bot",t,!0),u(!1)}function L(){const e=document.getElementById("chat-suggestions");e&&(e.style.display="none")}function P(){const e=document.getElementById("chat-suggestions");e&&(e.style.display="")}function l(e,t,n=!1){const s=document.createElement("div");s.className=`chat-msg chat-${e}`,n?s.innerHTML=S(t).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\n/g,"<br/>"):s.textContent=t,o.appendChild(s),o.scrollTop=o.scrollHeight}function S(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function u(e){if(p=e,d.disabled=e,c.disabled=e,document.getElementById("chat-typing")?.remove(),e){const t=document.createElement("div");t.id="chat-typing",t.className="chat-msg chat-bot chat-typing",t.innerHTML="<span></span><span></span><span></span>",o.appendChild(t),o.scrollTop=o.scrollHeight}}document.addEventListener("keydown",e=>{e.key==="Escape"&&a.classList.contains("open")&&a.classList.remove("open")})})();
