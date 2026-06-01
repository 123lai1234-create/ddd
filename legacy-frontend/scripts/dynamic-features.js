/**
 * Dynamic features: Vanta.js, GSAP ScrollTrigger, tsParticles,
 * Lottie, GitHub API, Cytoscape.js, Plotly, Pyodide, Anthropic chatbot.
 *
 * Each feature initializes only if its target DOM element exists on the page.
 * CDN libs are loaded lazily on demand.
 */

/* ── Lazy CDN loader ──────────────────────────────────────────────────────── */

const _loaded = new Set();
function loadScript(url, id) {
  if (_loaded.has(id || url)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => { _loaded.add(id || url); resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
function loadCSS(url) {
  if (_loaded.has(url)) return;
  _loaded.add(url);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = url;
  document.head.appendChild(l);
}

/* ── 1. Vanta.js DNA background ───────────────────────────────────────────── */

async function initVantaDNA() {
  const el = document.querySelector('.hero-canvas');
  if (!el) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js', 'three');
    await loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js', 'vanta');
    if (!window.VANTA) return;
    window._vantaEffect = window.VANTA.NET({
      el,
      mouseControls: true,
      touchControls: true,
      minHeight: 400,
      minWidth: 200,
      scale: 1.0,
      scaleMobile: 1.0,
      color: 0x58d7ff,
      backgroundColor: 0x0a1116,
      points: 8,
      maxDistance: 22,
      spacing: 18,
      showDots: true,
    });
  } catch { /* Vanta unavailable — silent degrade */ }
}

/* ── 2. GSAP ScrollTrigger ────────────────────────────────────────────────── */

async function initGSAP() {
  const reveals = document.querySelectorAll('section, .card, .metric-card, .algo-card, .surface-card, .runtime-card, .explore-card, .img-card, .faq-item');
  if (!reveals.length) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'gsap');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', 'scrolltrigger');
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    reveals.forEach((el, i) => {
      gsap.from(el, {
        y: 40, opacity: 0, duration: 0.7,
        delay: (i % 4) * 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
      });
    });

    // Animate stat numbers
    document.querySelectorAll('.hero-stat .val, .metric-val').forEach(el => {
      const target = parseFloat(el.textContent);
      if (!isFinite(target)) return;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target, duration: 1.6, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
        onUpdate: () => {
          el.textContent = target >= 100 ? Math.round(obj.v) : obj.v.toFixed(1);
        },
      });
    });
  } catch { /* GSAP unavailable */ }
}

/* ── 3. tsParticles molecular background ──────────────────────────────────── */

async function initParticles() {
  const el = document.getElementById('tsparticles');
  if (!el) return;
  try {
    await loadScript('https://cdn.jsdelivr.net/npm/tsparticles-slim@2/tsparticles.slim.bundle.min.js', 'tsparticles');
    if (!window.tsParticles) return;
    await tsParticles.load('tsparticles', {
      fullScreen: false,
      particles: {
        number: { value: 18 },
        color: { value: ['#58d7ff', '#7bf0be', '#b59cff'] },
        shape: { type: 'circle' },
        opacity: { value: 0.15, random: true },
        size: { value: { min: 1, max: 2 } },
        links: { enable: true, distance: 100, color: '#58d7ff', opacity: 0.06 },
        move: { enable: true, speed: 0.4, direction: 'none', outModes: 'bounce' },
      },
      interactivity: {
        events: {
          onHover: { enable: true, mode: 'grab' },
          onClick: { enable: false },
        },
        modes: {
          grab: { distance: 120, links: { opacity: 0.15 } },
        },
      },
    });
  } catch { /* tsParticles unavailable */ }
}

/* ── 4. Lottie micro-animations ───────────────────────────────────────────── */

async function initLottie() {
  const containers = document.querySelectorAll('[data-lottie]');
  if (!containers.length) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js', 'lottie');
    if (!window.lottie) return;
    containers.forEach(el => {
      const src = el.dataset.lottie;
      if (!src) return;
      lottie.loadAnimation({
        container: el,
        renderer: 'svg',
        loop: el.dataset.lottieLoop !== 'false',
        autoplay: true,
        path: src,
      });
    });
  } catch { /* Lottie unavailable */ }
}

/* ── 5. GitHub API activity ───────────────────────────────────────────────── */

async function initGitHubFeed() {
  const container = document.getElementById('github-feed');
  if (!container) return;
  try {
    const user = container.dataset.user || 'onlyforwork2026';
    const resp = await fetch(`https://api.github.com/users/${user}/events/public?per_page=6`,
      { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return;
    const events = await resp.json();

    container.innerHTML = events.slice(0, 5).map(ev => {
      const repo = ev.repo?.name || '';
      const type = ev.type.replace('Event', '');
      const date = new Date(ev.created_at).toLocaleDateString('zh-TW');
      let detail = '';
      if (ev.type === 'PushEvent') {
        const commits = ev.payload?.commits || [];
        detail = commits[0]?.message?.split('\n')[0] || '';
      } else if (ev.type === 'CreateEvent') {
        detail = `${ev.payload?.ref_type || ''} ${ev.payload?.ref || ''}`;
      }
      return `<div class="gh-event">
        <span class="gh-type">${type}</span>
        <span class="gh-repo">${repo.split('/')[1] || repo}</span>
        <span class="gh-detail">${detail.slice(0, 60)}</span>
        <span class="gh-date">${date}</span>
      </div>`;
    }).join('');
  } catch { /* GitHub API unavailable */ }
}

/* ── 6. Cytoscape.js protein network ──────────────────────────────────────── */

async function initCytoscape() {
  const container = document.getElementById('cytoscape-network');
  if (!container) return;

  const PATHWAYS = {
    tp53: {
      nodes: [
        {id:'TP53',role:'tumor_suppressor'},{id:'MDM2',role:'e3_ligase'},{id:'BRCA1',role:'dna_repair'},
        {id:'BARD1',role:'dna_repair'},{id:'ATM',role:'kinase'},{id:'CHEK2',role:'kinase'},
        {id:'RAD51',role:'dna_repair'},{id:'CDKN2A',role:'tumor_suppressor'},{id:'EP300',role:'tf'},
        {id:'PTEN',role:'tumor_suppressor'},{id:'RB1',role:'tumor_suppressor'},
        {id:'PUMA',role:'apoptosis'},{id:'BAX',role:'apoptosis'},{id:'BCL2',role:'apoptosis'},
        {id:'CASP3',role:'apoptosis'},
      ],
      edges: [
        {s:'TP53',t:'MDM2',score:980},{s:'TP53',t:'BRCA1',score:750},{s:'BRCA1',t:'BARD1',score:970},
        {s:'MDM2',t:'CDKN2A',score:700},{s:'TP53',t:'ATM',score:850},{s:'BRCA1',t:'RAD51',score:890},
        {s:'ATM',t:'CHEK2',score:920},{s:'TP53',t:'EP300',score:800},{s:'TP53',t:'PTEN',score:650},
        {s:'PTEN',t:'RB1',score:600},{s:'TP53',t:'PUMA',score:870},{s:'PUMA',t:'BAX',score:810},
        {s:'BAX',t:'BCL2',score:750},{s:'BAX',t:'CASP3',score:700},{s:'MDM2',t:'RB1',score:580},
        {s:'CHEK2',t:'BRCA1',score:720},
      ]
    },
    egfr: {
      nodes: [
        {id:'EGFR',role:'kinase'},{id:'GRB2',role:'signaling'},{id:'SOS1',role:'signaling'},
        {id:'KRAS',role:'signaling'},{id:'BRAF',role:'kinase'},{id:'RAF1',role:'kinase'},
        {id:'MAP2K1',role:'kinase'},{id:'MAPK1',role:'kinase'},{id:'MAPK3',role:'kinase'},
        {id:'MYC',role:'tf'},{id:'FOS',role:'tf'},{id:'PIK3CA',role:'kinase'},
        {id:'AKT1',role:'kinase'},{id:'MTOR',role:'kinase'},
      ],
      edges: [
        {s:'EGFR',t:'GRB2',score:950},{s:'GRB2',t:'SOS1',score:930},{s:'SOS1',t:'KRAS',score:880},
        {s:'KRAS',t:'BRAF',score:840},{s:'KRAS',t:'RAF1',score:780},{s:'BRAF',t:'MAP2K1',score:900},
        {s:'RAF1',t:'MAP2K1',score:870},{s:'MAP2K1',t:'MAPK1',score:970},{s:'MAP2K1',t:'MAPK3',score:960},
        {s:'MAPK1',t:'MYC',score:650},{s:'MAPK1',t:'FOS',score:700},{s:'EGFR',t:'PIK3CA',score:810},
        {s:'PIK3CA',t:'AKT1',score:890},{s:'AKT1',t:'MTOR',score:820},
      ]
    },
    brca: {
      nodes: [
        {id:'BRCA1',role:'dna_repair'},{id:'BRCA2',role:'dna_repair'},{id:'PALB2',role:'dna_repair'},
        {id:'RAD51',role:'dna_repair'},{id:'RAD52',role:'dna_repair'},{id:'ATM',role:'kinase'},
        {id:'ATR',role:'kinase'},{id:'CHEK1',role:'kinase'},{id:'CHEK2',role:'kinase'},
        {id:'FANCD2',role:'dna_repair'},{id:'BARD1',role:'dna_repair'},{id:'TP53',role:'tumor_suppressor'},
        {id:'RPA1',role:'dna_repair'},
      ],
      edges: [
        {s:'BRCA1',t:'BARD1',score:970},{s:'BRCA1',t:'BRCA2',score:760},{s:'BRCA2',t:'PALB2',score:940},
        {s:'BRCA2',t:'RAD51',score:920},{s:'PALB2',t:'BRCA1',score:890},{s:'RAD51',t:'RAD52',score:780},
        {s:'ATM',t:'BRCA1',score:850},{s:'ATM',t:'CHEK2',score:920},{s:'ATR',t:'CHEK1',score:940},
        {s:'CHEK1',t:'BRCA1',score:720},{s:'FANCD2',t:'BRCA1',score:700},{s:'BRCA1',t:'TP53',score:750},
        {s:'RAD51',t:'RPA1',score:810},{s:'ATM',t:'TP53',score:850},
      ]
    },
    pi3k: {
      nodes: [
        {id:'PIK3CA',role:'kinase'},{id:'PIK3R1',role:'signaling'},{id:'PTEN',role:'tumor_suppressor'},
        {id:'AKT1',role:'kinase'},{id:'AKT2',role:'kinase'},{id:'MTOR',role:'kinase'},
        {id:'RPTOR',role:'signaling'},{id:'TSC1',role:'signaling'},{id:'TSC2',role:'signaling'},
        {id:'RHEB',role:'signaling'},{id:'RPS6KB1',role:'kinase'},{id:'GSK3B',role:'kinase'},
        {id:'FOXO1',role:'tf'},
      ],
      edges: [
        {s:'PIK3CA',t:'PIK3R1',score:970},{s:'PIK3CA',t:'AKT1',score:890},{s:'PIK3CA',t:'AKT2',score:820},
        {s:'PTEN',t:'PIK3CA',score:700},{s:'AKT1',t:'MTOR',score:850},{s:'AKT1',t:'TSC2',score:810},
        {s:'AKT1',t:'GSK3B',score:870},{s:'AKT1',t:'FOXO1',score:790},{s:'MTOR',t:'RPTOR',score:940},
        {s:'MTOR',t:'RPS6KB1',score:880},{s:'TSC1',t:'TSC2',score:970},{s:'TSC2',t:'RHEB',score:830},
        {s:'RHEB',t:'MTOR',score:800},
      ]
    }
  };

  const PROTEIN_INFO = {
    TP53:{en:'Tumor protein p53',role:'轉錄因子，細胞週期與凋亡的中心調節子',note:'~50% 人類癌症帶有 TP53 突變，是最常被研究的抑癌基因。'},
    MDM2:{en:'E3 ubiquitin ligase MDM2',role:'負向調節 TP53',note:'結合 TP53 並促其降解；MDM2 過表達是 TP53 失活的常見途徑。'},
    BRCA1:{en:'Breast cancer type 1',role:'DNA 雙股斷裂修復',note:'與 BARD1 形成 E3 ligase 複合體；胚系突變顯著提高乳癌/卵巢癌風險。'},
    BARD1:{en:'BRCA1-associated RING domain 1',role:'BRCA1 夥伴',note:'與 BRCA1 形成穩定異源二聚體，為其泛素連接酶活性所需。'},
    ATM:{en:'Ataxia Telangiectasia Mutated',role:'DNA 損傷感測激酶',note:'雙股斷裂後啟動；磷酸化 TP53、CHEK2 等下游效應子。'},
    ATR:{en:'ATR serine/threonine kinase',role:'DNA 複製壓力感測激酶',note:'感測單鏈 DNA；CHEK1 的上游激活激酶。'},
    CHEK1:{en:'Checkpoint kinase 1',role:'ATR 下游激酶',note:'磷酸化 CDC25，阻止有絲分裂進入受損細胞。'},
    CHEK2:{en:'Checkpoint kinase 2',role:'細胞週期檢查點激酶',note:'ATM 下游；穩定 TP53，觸發 G1/S 阻滯。'},
    RAD51:{en:'DNA repair protein RAD51',role:'同源重組核心',note:'催化 ssDNA 與同源模板配對；BRCA2 負責將其裝載到 DNA 上。'},
    RAD52:{en:'DNA repair protein RAD52',role:'同源重組輔助蛋白',note:'RAD51 旁路途徑；協助單鏈退火。'},
    CDKN2A:{en:'Cyclin-dependent kinase inhibitor 2A',role:'抑癌蛋白 p16/p14ARF',note:'p14ARF 透過抑制 MDM2 穩定 TP53；p16 抑制 CDK4/6。'},
    EP300:{en:'E1A binding protein p300',role:'組蛋白乙醯轉移酶',note:'作為 TP53 的轉錄共激活子，以乙醯化方式強化其 DNA 結合。'},
    PTEN:{en:'Phosphatase and tensin homolog',role:'磷脂磷酸酶，PI3K 拮抗子',note:'去磷酸化 PIP3，拮抗 PI3K 訊號；最常被缺失的抑癌基因之一。'},
    RB1:{en:'Retinoblastoma protein',role:'細胞週期阻斷',note:'非磷酸化時抑制 E2F 轉錄因子；CDK4/6 磷酸化使其釋放 E2F 啟動 S 期。'},
    PUMA:{en:'p53 upregulated modulator of apoptosis',role:'BCL-2 家族促凋亡因子',note:'TP53 轉錄靶標；結合並拮抗 BCL-2/BCL-XL，促進粒線體外膜通透化。'},
    BAX:{en:'BCL-2-associated X protein',role:'促凋亡 BCL-2 家族成員',note:'在細胞壓力下插入粒線體膜，形成孔洞釋放 cytochrome c。'},
    BCL2:{en:'B-cell lymphoma 2',role:'抗凋亡蛋白',note:'阻止粒線體外膜通透化；在許多 B 細胞淋巴瘤中高表達。'},
    CASP3:{en:'Caspase-3',role:'執行凋亡的半胱天冬酶',note:'被 CASP8/CASP9 切割活化；裂解多種底物導致凋亡表現型。'},
    EGFR:{en:'Epidermal growth factor receptor',role:'受體酪胺酸激酶',note:'配體結合觸發二聚化與自體磷酸化；啟動 RAS-MAPK 與 PI3K-AKT 路徑。'},
    GRB2:{en:'Growth factor receptor-bound protein 2',role:'接合蛋白',note:'SH2 結合磷酸化 EGFR，SH3 招募 SOS1 至膜上；EGFR→RAS 訊號橋梁。'},
    SOS1:{en:'SOS Ras guanine nucleotide exchange factor 1',role:'RAS 鳥苷核苷酸交換因子',note:'催化 RAS 的 GDP→GTP 交換，啟動 RAS 訊號。'},
    KRAS:{en:'KRAS proto-oncogene',role:'RAS GTPase 致癌基因',note:'最常見的人類致癌基因；G12D/V 突變致 GTP 鎖定狀態，持續啟動下游路徑。'},
    BRAF:{en:'B-Raf proto-oncogene',role:'MAP 激酶激酶激酶',note:'KRAS 下游；V600E 突變見於黑色素瘤，vemurafenib 靶向此突變。'},
    RAF1:{en:'Raf-1 proto-oncogene',role:'絲氨酸/蘇氨酸激酶',note:'RAS 效應子；磷酸化 MEK1/2（MAP2K1/2）。'},
    MAP2K1:{en:'Mitogen-activated protein kinase kinase 1',role:'MEK1，MAPK 激酶',note:'磷酸化 ERK1/2；MEK 抑制劑（trametinib）用於 BRAF/RAS 突變癌症。'},
    MAPK1:{en:'Mitogen-activated protein kinase 1',role:'ERK2，MAPK 家族',note:'調控增殖、存活與分化；許多轉錄因子的磷酸化底物。'},
    MAPK3:{en:'Mitogen-activated protein kinase 3',role:'ERK1，MAPK 家族',note:'ERK2 旁系同源物；與 MAPK1 共享多數底物。'},
    MYC:{en:'MYC proto-oncogene',role:'轉錄因子，細胞增殖主控',note:'與 MAX 形成異源二聚體；調控數千個靶基因，廣泛過表達於人類癌症。'},
    FOS:{en:'Fos proto-oncogene',role:'AP-1 轉錄因子',note:'與 JUN 形成 AP-1 複合體；調控增殖、分化與炎症反應。'},
    PIK3CA:{en:'PI3-kinase catalytic subunit alpha',role:'PI3 激酶催化亞基',note:'催化 PIP2→PIP3；H1047R 等突變見於多種癌症。'},
    PIK3R1:{en:'PI3-kinase regulatory subunit 1',role:'p85α，PI3K 調節亞基',note:'抑制 PIK3CA 基礎活性；招募 PI3K 複合體到磷酸化受體。'},
    AKT1:{en:'AKT serine/threonine kinase 1',role:'PKB，PI3K 下游效應子',note:'PDK1 在 PIP3 富集膜上磷酸化激活；調控存活、生長與代謝。'},
    AKT2:{en:'AKT serine/threonine kinase 2',role:'PKBβ，胰島素訊號',note:'肝臟與脂肪組織的胰島素效應子；AKT2 突變與 2 型糖尿病相關。'},
    MTOR:{en:'Mechanistic target of rapamycin',role:'PI3K 相關激酶，生長整合子',note:'整合營養、能量與生長因子訊號；mTORC1/2 分別調控 S6K1 和 AKT。'},
    RPTOR:{en:'Regulatory-associated protein of mTOR',role:'mTORC1 支架蛋白',note:'組成 mTORC1 必需組件；招募 S6K1 與 4EBP1 至 mTOR 複合體。'},
    TSC1:{en:'TSC complex subunit 1',role:'錯構瘤蛋白，mTOR 調節子',note:'與 TSC2 形成異源二聚體；突變導致結節性硬化症。'},
    TSC2:{en:'TSC complex subunit 2',role:'tuberin，Rheb GAP',note:'抑制 Rheb 的 GTP 酶活性；AKT 磷酸化使其失活，解除對 mTOR 的抑制。'},
    RHEB:{en:'Ras homolog enriched in brain',role:'mTOR 上游 GTPase',note:'GTP 結合態直接激活 mTORC1；TSC2 是其 GAP。'},
    RPS6KB1:{en:'Ribosomal protein S6 kinase B1',role:'S6K1，mTORC1 底物',note:'mTOR 磷酸化激活；促進核糖體生物合成與蛋白質翻譯。'},
    GSK3B:{en:'Glycogen synthase kinase 3 beta',role:'多效絲氨酸/蘇氨酸激酶',note:'AKT 磷酸化抑制 GSK3B；活性時磷酸化 glycogen synthase 及 β-catenin 降解。'},
    FOXO1:{en:'Forkhead box O1',role:'叉頭框轉錄因子',note:'AKT 磷酸化使其滯留細胞質；核內活性調控 apoptosis 與代謝基因。'},
    BRCA2:{en:'Breast cancer type 2',role:'RAD51 載入蛋白',note:'直接與 RAD51 結合，協助其裝載到 ssDNA；BRCA2 截斷突變高度致癌。'},
    PALB2:{en:'Partner and localizer of BRCA2',role:'BRCA1-BRCA2 橋梁蛋白',note:'連接 BRCA1 與 BRCA2；PALB2 突變是中等風險乳癌易感基因。'},
    FANCD2:{en:'FA complementation group D2',role:'Fanconi 貧血路徑核心',note:'BRCA1/ATM 磷酸化後單泛素化；標記 DNA 跨損傷修復位點。'},
    RPA1:{en:'Replication protein A1',role:'ssDNA 結合蛋白',note:'穩定 DNA 修復中產生的單鏈 DNA；招募 ATR 至 ssDNA 損傷位點。'},
  };

  const ROLE_COLORS = {
    tumor_suppressor:'#ff6b9d', kinase:'#58d7ff', e3_ligase:'#f0883e',
    tf:'#7ef7c0', dna_repair:'#b59cff', apoptosis:'#ff7675', signaling:'#ffd32a',
  };
  const ROLE_LABELS = {
    tumor_suppressor:'抑癌', kinase:'激酶', e3_ligase:'E3連接酶',
    tf:'轉錄因子', dna_repair:'DNA修復', apoptosis:'凋亡', signaling:'訊號傳遞',
  };

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.29.2/cytoscape.min.js', 'cytoscape');
    if (!window.cytoscape) return;

    let currentPathway = 'tp53';
    let cy = null;

    function buildElements(pathwayKey) {
      const pw = PATHWAYS[pathwayKey];
      const degree = {};
      pw.nodes.forEach(n => { degree[n.id] = 0; });
      pw.edges.forEach(e => { degree[e.s] = (degree[e.s]||0)+1; degree[e.t] = (degree[e.t]||0)+1; });
      const maxDeg = Math.max(...Object.values(degree), 1);
      return [
        ...pw.nodes.map(n => ({ data: {
          id: n.id, label: n.id, role: n.role,
          degree: degree[n.id]||0,
          size: 22 + ((degree[n.id]||0)/maxDeg)*22,
          color: ROLE_COLORS[n.role]||'#58d7ff'
        }})),
        ...pw.edges.map((e,i) => ({ data: {
          id:'e'+i, source:e.s, target:e.t, score:e.score,
          width: 1 + (e.score/1000)*3
        }}))
      ];
    }

    function renderNodeInfo(id) {
      const body = document.getElementById('ppi-side-body');
      if (!body || !cy) return;
      const node = cy.$('#'+id);
      const d = PROTEIN_INFO[id];
      const roleKey = node.data('role')||'';
      const roleLabel = ROLE_LABELS[roleKey]||roleKey;
      const roleColor = ROLE_COLORS[roleKey]||'#58d7ff';
      const deg = node.data('degree')||0;
      const neighbors = node.neighborhood('node').map(n=>n.id());
      body.innerHTML = `
        <div class="ppi-sym">${id}</div>
        <span class="ppi-role-badge" style="background:${roleColor}22;color:${roleColor};border:1px solid ${roleColor}55;border-radius:4px;font-size:.72rem;padding:2px 8px;display:inline-block;margin:4px 0 8px">${roleLabel}</span>
        ${d?`<div class="ppi-en" style="font-size:.78rem;color:var(--muted);margin-bottom:4px">${d.en}</div>
        <div class="ppi-role" style="font-size:.82rem;color:var(--fg);margin-bottom:8px">${d.role}</div>
        <p class="ppi-note" style="font-size:.8rem;color:var(--dim);line-height:1.5;margin-bottom:10px">${d.note}</p>`:''}
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:6px"><strong>${deg}</strong> 個交互夥伴</div>
        ${neighbors.length?`<div style="display:flex;flex-wrap:wrap;gap:4px">${neighbors.map(n=>`<span style="font-size:.7rem;padding:2px 7px;border-radius:20px;background:rgba(88,215,255,.1);border:1px solid rgba(88,215,255,.25);color:#58d7ff">${n}</span>`).join('')}</div>`:''}
      `;
    }

    function updateStatsBar(selectedId) {
      const bar = document.getElementById('ppi-stats-bar');
      if (!bar) return;
      const pw = PATHWAYS[currentPathway];
      if (selectedId) {
        const deg = cy && cy.$('#'+selectedId).data('degree')||0;
        bar.innerHTML = `<span>選中：<strong>${selectedId}</strong></span><span>交互夥伴數：<strong>${deg}</strong></span><span style="margin-left:auto;font-size:.7rem;opacity:.5">點空白取消選擇</span>`;
      } else {
        bar.innerHTML = `<span>節點：<strong>${pw.nodes.length}</strong></span><span>邊：<strong>${pw.edges.length}</strong></span><span style="margin-left:auto;font-size:.7rem;opacity:.5">點選節點探索</span>`;
      }
    }

    function initCy(pathwayKey) {
      if (cy) { cy.destroy(); cy = null; }
      cy = window.cytoscape({
        container,
        elements: buildElements(pathwayKey),
        style: [
          { selector:'node', style:{
            'background-color':'data(color)', 'label':'data(label)',
            'color':'#e9f0ec', 'font-size':'11px', 'text-valign':'bottom', 'text-margin-y':5,
            'width':'data(size)', 'height':'data(size)',
            'border-width':2, 'border-color':'data(color)', 'border-opacity':0.4,
            'text-outline-color':'#0a1116', 'text-outline-width':2,
          }},
          { selector:'node:selected', style:{'border-width':3,'border-opacity':1,'border-color':'#fff'}},
          { selector:'node.dimmed', style:{'opacity':0.15}},
          { selector:'node.highlighted', style:{'border-width':3,'border-opacity':1,'border-color':'#fff','opacity':1}},
          { selector:'edge', style:{
            'width':'data(width)', 'line-color':'rgba(88,215,255,0.2)',
            'curve-style':'bezier', 'opacity':0.8,
          }},
          { selector:'edge.dimmed', style:{'opacity':0.04}},
          { selector:'edge.highlighted', style:{'line-color':'rgba(88,215,255,0.6)','opacity':1,'width':3}},
        ],
        layout:{ name:'cose', animate:true, animationDuration:600, nodeRepulsion:8000, idealEdgeLength:80, gravity:0.8 },
        userZoomingEnabled:true, userPanningEnabled:true,
      });

      cy.on('tap','node', e => {
        const id = e.target.id();
        cy.elements().removeClass('highlighted dimmed');
        const nbhd = cy.$('#'+id).closedNeighborhood();
        cy.elements().not(nbhd).addClass('dimmed');
        nbhd.addClass('highlighted');
        renderNodeInfo(id);
        updateStatsBar(id);
      });
      cy.on('tap', e => {
        if (e.target === cy) {
          cy.elements().removeClass('highlighted dimmed');
          const body = document.getElementById('ppi-side-body');
          if (body) body.innerHTML = '<p class="ppi-placeholder">點擊任一節點查看該蛋白質的功能摘要。</p>';
          updateStatsBar(null);
        }
      });
      updateStatsBar(null);
      window.__ppiCy = cy;
    }

    // Pathway tabs
    document.querySelectorAll('.ppi-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ppi-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPathway = btn.dataset.pathway;
        const body = document.getElementById('ppi-side-body');
        if (body) body.innerHTML = '<p class="ppi-placeholder">點擊任一節點查看該蛋白質的功能摘要。</p>';
        document.querySelectorAll('.ppi-role-filter').forEach(b => b.classList.remove('active'));
        initCy(currentPathway);
      });
    });

    // Layout selector
    const layoutSel = document.getElementById('ppi-layout-sel');
    if (layoutSel) layoutSel.addEventListener('change', () => {
      if (!cy) return;
      cy.layout({ name:layoutSel.value, animate:true, animationDuration:500,
        nodeRepulsion:8000, idealEdgeLength:80 }).run();
    });

    // Search
    const searchInput = document.getElementById('ppi-search');
    if (searchInput) searchInput.addEventListener('input', () => {
      if (!cy) return;
      const q = searchInput.value.trim().toUpperCase();
      cy.elements().removeClass('highlighted dimmed');
      if (!q) return;
      const match = cy.nodes().filter(n => n.id().toUpperCase().includes(q));
      if (match.length) {
        cy.elements().not(match.closedNeighborhood()).addClass('dimmed');
        match.addClass('highlighted');
      }
    });

    // Fit button
    const fitBtn = document.getElementById('ppi-fit-btn');
    if (fitBtn) fitBtn.addEventListener('click', () => { if (cy) cy.fit(undefined, 30); });

    // Role filters
    document.querySelectorAll('.ppi-role-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!cy) return;
        btn.classList.toggle('active');
        const activeRoles = [...document.querySelectorAll('.ppi-role-filter.active')].map(b => b.dataset.role);
        cy.elements().removeClass('highlighted dimmed');
        if (activeRoles.length) {
          const match = cy.nodes().filter(n => activeRoles.includes(n.data('role')));
          cy.elements().not(match.closedNeighborhood()).addClass('dimmed');
          match.addClass('highlighted');
        }
      });
    });

    initCy(currentPathway);
  } catch(e) { /* Cytoscape unavailable */ }
}

/* ── 7. Plotly.js interactive charts ──────────────────────────────────────── */

async function initPlotly() {
  const containers = document.querySelectorAll('[data-plotly]');
  if (!containers.length) return;
  try {
    await loadScript('https://cdn.plot.ly/plotly-2.32.0.min.js', 'plotly');
    if (!window.Plotly) return;
    const dark = { paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#94a59f' }, xaxis: { gridcolor: '#1e2730' }, yaxis: { gridcolor: '#1e2730' } };

    containers.forEach(el => {
      const type = el.dataset.plotly;
      if (type === 'volcano') {
        const n = 200;
        const x = Array.from({ length: n }, () => (Math.random() - 0.5) * 8);
        const y = Array.from({ length: n }, () => Math.random() * 10);
        const colors = x.map((v, i) => Math.abs(v) > 1.5 && y[i] > 3 ? (v > 0 ? '#ff6b6b' : '#58d7ff') : '#3a4550');
        Plotly.newPlot(el, [{ x, y, mode: 'markers', type: 'scatter',
          marker: { color: colors, size: 5, opacity: 0.7 } }],
          { ...dark, margin: { t: 20, b: 40, l: 50, r: 20 }, xaxis: { ...dark.xaxis, title: 'log₂FC' },
            yaxis: { ...dark.yaxis, title: '-log₁₀(p)' } },
          { responsive: true, displayModeBar: false });
      } else if (type === 'heatmap') {
        const z = Array.from({ length: 10 }, () => Array.from({ length: 8 }, () => (Math.random() - 0.5) * 4));
        Plotly.newPlot(el, [{ z, type: 'heatmap', colorscale: [[0, '#2563eb'], [0.5, '#0a1116'], [1, '#dc2626']] }],
          { ...dark, margin: { t: 10, b: 30, l: 30, r: 10 } }, { responsive: true, displayModeBar: false });
      }
    });
  } catch { /* Plotly unavailable */ }
}

/* ── 8. Pyodide Python runner ─────────────────────────────────────────────── */

async function initPyodide() {
  const runBtn = document.getElementById('pyodide-run');
  const codeEl = document.getElementById('pyodide-code');
  const outputEl = document.getElementById('pyodide-output');
  if (!runBtn || !codeEl || !outputEl) return;

  let pyodide = null;

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.textContent = '載入 Python...';
    outputEl.textContent = '';

    if (!pyodide) {
      try {
        await loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js', 'pyodide');
        pyodide = await loadPyodide();
        await pyodide.loadPackage(['numpy']);
      } catch (e) {
        outputEl.textContent = `Pyodide 載入失敗: ${e.message}`;
        runBtn.disabled = false;
        runBtn.textContent = '▶ 執行 Python';
        return;
      }
    }

    runBtn.textContent = '執行中...';
    try {
      pyodide.runPython('import sys; from io import StringIO; _buf = StringIO(); sys.stdout = _buf');

      if (typeof window.getThesisPyodideContext === 'function') {
        const ctx = window.getThesisPyodideContext();
        pyodide.globals.set('stock_code', ctx.stock_code || '');
        pyodide.globals.set('stock_name', ctx.stock_name || '');
        pyodide.globals.set('prices', pyodide.toPy(ctx.prices || []));
        pyodide.globals.set('pop', ctx.pop);
        pyodide.globals.set('gens', ctx.gens);
        pyodide.globals.set('cr', ctx.cr);
        pyodide.globals.set('mr', ctx.mr);
        pyodide.globals.set('m', ctx.m);
        pyodide.globals.set('hold_days', ctx.hold_days);
        pyodide.globals.set('target_profit', ctx.target_profit);
      }
      pyodide.runPython(codeEl.value || codeEl.textContent);
      const out = pyodide.runPython('_buf.getvalue()');
      outputEl.textContent = out || '(no output)';
    } catch (e) {
      outputEl.textContent = `Error: ${e.message}`;
    }
    runBtn.disabled = false;
    runBtn.textContent = '▶ 執行 Python';
  });
}

/* ── 9. Anthropic chatbot widget ──────────────────────────────────────────── */

function initChatbot() {
  // Only init if chat elements exist
  const toggle = document.getElementById('chatbot-toggle');
  const panel = document.getElementById('chatbot-panel');
  const input = document.getElementById('chatbot-input');
  const send = document.getElementById('chatbot-send');
  const messages = document.getElementById('chatbot-messages');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    if (panel.classList.contains('open') && input) input.focus();
  });

  const closeBtn = panel.querySelector('.chatbot-close');
  if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.remove('open'));

  if (!send || !input || !messages) return;

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send.disabled = true;
    input.disabled = true;

    const userDiv = document.createElement('div');
    userDiv.className = 'chat-msg chat-user';
    userDiv.textContent = text;
    messages.appendChild(userDiv);

    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-msg chat-bot chat-typing';
    typingDiv.textContent = '思考中...';
    messages.appendChild(typingDiv);
    messages.scrollTop = messages.scrollHeight;

    try {
      const apiBase = typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function'
        ? await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'chatbot' })
        : '';
      const resp = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(30000),
      });
      typingDiv.remove();

      if (resp.ok) {
        const data = await resp.json();
        const reply = data.reply || '...';
        const botDiv = document.createElement('div');
        botDiv.className = 'chat-msg chat-bot';
        messages.appendChild(botDiv);
        messages.scrollTop = messages.scrollHeight;
        let i = 0;
        const tick = () => {
          if (i < reply.length) {
            botDiv.textContent += reply[i++];
            messages.scrollTop = messages.scrollHeight;
            setTimeout(tick, 15);
          } else {
            send.disabled = false;
            input.disabled = false;
            input.focus();
          }
        };
        tick();
        return;
      } else {
        const errDiv = document.createElement('div');
        errDiv.className = 'chat-msg chat-bot';
        errDiv.textContent = '目前無法回應，請稍後再試。';
        messages.appendChild(errDiv);
      }
    } catch {
      typingDiv.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'chat-msg chat-bot';
      errDiv.textContent = '連線失敗，請確認後端已啟動。';
      messages.appendChild(errDiv);
    }
    messages.scrollTop = messages.scrollHeight;
    send.disabled = false;
    input.disabled = false;
  }

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

/* ── Init all ─────────────────────────────────────────────────────────────── */

/* ── Global card cursor-tracking glow ────────────────────────────────────── */
function initCardGlow() {
  const CARD_SELECTORS = '.card, .metric-card, .explore-card, .chart-card, .work-card, .service-card, .platform-card, .skill-card, .timeline-card, .signal-card';
  document.querySelectorAll(CARD_SELECTORS).forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--cx', `${e.clientX - r.left}px`);
      card.style.setProperty('--cy', `${e.clientY - r.top}px`);
    });
  });
}

/* ── Scroll Progress Bar ─────────────────────────────────────────────────── */
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.id = 'global-scroll-bar';
  bar.style.cssText = `
    position:fixed; top:0; left:0; height:2px; width:0%; z-index:9999;
    background:linear-gradient(90deg,var(--cyan,#58d7ff),var(--purple,#b59cff));
    transition:width 0.1s; pointer-events:none;
  `;
  document.body.appendChild(bar);
  window.addEventListener('scroll', () => {
    const pct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) * 100;
    bar.style.width = `${Math.min(pct, 100).toFixed(2)}%`;
  }, { passive: true });
}

/* ── Ripple on all .btn ──────────────────────────────────────────────────── */
function initGlobalRipple() {
  // Inject keyframe once
  if (!document.getElementById('ripple-kf')) {
    const s = document.createElement('style');
    s.id = 'ripple-kf';
    s.textContent = `
      @keyframes _ripple { to { transform:scale(4); opacity:0; } }
      .btn { position:relative; overflow:hidden; }
      ._ripple-wave {
        position:absolute; border-radius:50%;
        background:rgba(255,255,255,0.2);
        transform:scale(0); pointer-events:none;
        animation:_ripple 0.55s ease-out forwards;
      }
    `;
    document.head.appendChild(s);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const wave = document.createElement('span');
    wave.className = '_ripple-wave';
    wave.style.cssText = `
      width:${size}px; height:${size}px;
      left:${e.clientX - r.left - size/2}px;
      top:${e.clientY - r.top - size/2}px;
    `;
    btn.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove());
  });
}

/* ── Magnetic hover on primary CTAs ─────────────────────────────────────── */
function initMagneticCTAs() {
  const sel = '.btn-primary, .hero-ctas .btn, .cta-row .btn';
  document.querySelectorAll(sel).forEach(btn => {
    btn.addEventListener('mousemove', function(e) {
      const r = this.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width/2) * 0.22;
      const dy = (e.clientY - r.top - r.height/2) * 0.22;
      this.style.transform = `translate(${dx}px,${dy}px)`;
    });
    btn.addEventListener('mouseleave', function() {
      this.style.transform = '';
    });
  });
}

/* ── Parallax hero sections ──────────────────────────────────────────────── */
function initHeroParallax() {
  const heroes = document.querySelectorAll('.hero-canvas, .hero-wrap, .sc-hero .hero-bg, .page-hero-bg');
  if (!heroes.length) return;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    heroes.forEach(el => {
      el.style.transform = `translateY(${y * 0.25}px)`;
    });
  }, { passive: true });
}

/* ── Count-up for stat numbers via Intersection Observer ─────────────────── */
function initCountUp() {
  const SEL = '.val, .mval, .hero-stat .val, .live-stat-val, [data-countup]';
  const NUMERIC = /^[\d.,]+$/;

  document.querySelectorAll(SEL).forEach(el => {
    if (el.dataset.countupDone) return;
    const raw = el.textContent.trim();
    const num = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(num) || !NUMERIC.test(raw.replace(/[^0-9.,]/g, ''))) return;
    el.dataset.countupDone = '1';
    el.dataset.countupTarget = num;
    el.dataset.countupOrig = raw;
  });

  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      obs.unobserve(entry.target);
      const el = entry.target;
      const target = parseFloat(el.dataset.countupTarget);
      const orig   = el.dataset.countupOrig;
      const isFloat = orig.includes('.');
      const duration = 1400;
      const start = performance.now();
      const tick = now => {
        const p = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const v = target * ease;
        el.textContent = isFloat ? v.toFixed(1) : Math.round(v).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = orig; // restore original text (e.g. "雙碩士" stays)
      };
      // Only animate numeric-only values
      if (/^\d+(\.\d+)?$/.test(el.dataset.countupOrig)) {
        requestAnimationFrame(tick);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-countup-done]').forEach(el => obs.observe(el));
  // Re-scan after lazy render
  setTimeout(() => {
    document.querySelectorAll(SEL).forEach(el => {
      if (el.dataset.countupDone) obs.observe(el);
    });
  }, 300);
}

/* ── Lazy Loading all images ─────────────────────────────────────────────── */
function initLazyImages() {
  const imgs = document.querySelectorAll('img:not([loading]):not([data-lazy-done])');
  if (!imgs.length) return;

  const obs = new IntersectionObserver((entries, o) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      const img = e.target;
      img.loading = 'lazy';
      img.style.transition = 'opacity 0.4s';
      img.style.opacity = '0';
      img.onload = () => { img.style.opacity = '1'; };
      if (img.src) img.src = img.src; // trigger reload with lazy
      img.dataset.lazyDone = '1';
    });
  }, { rootMargin: '120px' });

  imgs.forEach(img => { img.dataset.lazyDone = '1'; obs.observe(img); });
}

/* ── Typing animation on hero h1 ─────────────────────────────────────────── */
function initTypingAnimation() {
  // Only run on pages that don't already have a canvas/heavy hero
  if (document.querySelector('.hero-canvas, #tsparticles')) return;

  const target = document.querySelector('header.hero h1, .page-hero h1, section#hero h1');
  if (!target || target.dataset.typed) return;
  target.dataset.typed = '1';

  const spans = target.querySelectorAll('span');
  if (!spans.length) return;
  const span = spans[spans.length - 1];
  const original = span.textContent;
  span.textContent = '';

  let i = 0;
  const timer = setInterval(() => {
    span.textContent += original[i++];
    if (i >= original.length) clearInterval(timer);
  }, 55);
}

/* ── Scroll-reveal for timeline-card elements ────────────────────────────── */
function initTimelineReveal() {
  if (!document.getElementById('timeline-reveal-style')) {
    const s = document.createElement('style');
    s.id = 'timeline-reveal-style';
    s.textContent = `
      .timeline-card { opacity:0; transform:translateX(-24px); transition:opacity 0.6s ease, transform 0.6s ease; }
      .timeline-card.tl-visible { opacity:1; transform:translateX(0); }
      .timeline-card:nth-child(even) { transform:translateX(24px); }
      .timeline-card:nth-child(even).tl-visible { transform:translateX(0); }
      @media (prefers-reduced-motion:reduce) { .timeline-card { opacity:1; transform:none; } }
    `;
    document.head.appendChild(s);
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('tl-visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.2 });

  document.querySelectorAll('.timeline-card').forEach(el => obs.observe(el));
}

/* ── Staggered card entrance ─────────────────────────────────────────────── */
function initCardEntrance() {
  if (!document.getElementById('card-entrance-style')) {
    const s = document.createElement('style');
    s.id = 'card-entrance-style';
    s.textContent = `
      .card-grid .card, .skills-grid .skill-card, .explore-grid .explore-card {
        opacity:0; transform:translateY(20px);
        transition:opacity 0.5s ease, transform 0.5s ease;
      }
      .card-grid .card.ce-visible, .skills-grid .skill-card.ce-visible, .explore-grid .explore-card.ce-visible {
        opacity:1; transform:translateY(0);
      }
      @media (prefers-reduced-motion:reduce) {
        .card-grid .card, .skills-grid .skill-card, .explore-grid .explore-card { opacity:1; transform:none; }
      }
    `;
    document.head.appendChild(s);
  }

  const obs = new IntersectionObserver((entries, o) => {
    entries.forEach((e, idx) => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      const siblings = [...e.target.parentElement.children];
      const i = siblings.indexOf(e.target);
      setTimeout(() => e.target.classList.add('ce-visible'), i * 80);
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.card-grid .card, .skills-grid .skill-card, .explore-grid .explore-card')
    .forEach(el => obs.observe(el));
}

/* ── Canvas Skill Radar (about_me page) ──────────────────────────────────── */
function initSkillRadar() {
  const canvas = document.getElementById('skill-radar-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth;
  const H = canvas.height = 260;
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 32;

  const skills = [
    { label: 'Frontend',  value: 0.88 },
    { label: 'Python/AI', value: 0.85 },
    { label: 'Biomedical',value: 0.92 },
    { label: 'NGS/Genomics',value: 0.80 },
    { label: 'DevOps',    value: 0.68 },
    { label: 'Research',  value: 0.90 },
  ];

  const N = skills.length;
  const step = (Math.PI * 2) / N;
  let progress = 0;

  function draw(p) {
    ctx.clearRect(0, 0, W, H);

    // Grid rings
    [0.25, 0.5, 0.75, 1].forEach(r => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = i * step - Math.PI / 2;
        const x = cx + Math.cos(a) * R * r;
        const y = cy + Math.sin(a) * R * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(88,215,255,0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Spokes
    for (let i = 0; i < N; i++) {
      const a = i * step - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = 'rgba(88,215,255,0.15)';
      ctx.stroke();
    }

    // Filled polygon
    ctx.beginPath();
    skills.forEach((s, i) => {
      const a = i * step - Math.PI / 2;
      const v = s.value * p;
      const x = cx + Math.cos(a) * R * v;
      const y = cy + Math.sin(a) * R * v;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(88,215,255,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(88,215,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots + Labels
    skills.forEach((s, i) => {
      const a = i * step - Math.PI / 2;
      const v = s.value * p;
      const x = cx + Math.cos(a) * R * v;
      const y = cy + Math.sin(a) * R * v;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#58d7ff';
      ctx.fill();

      const lx = cx + Math.cos(a) * (R + 22);
      const ly = cy + Math.sin(a) * (R + 22);
      ctx.fillStyle = 'rgba(230,237,243,0.75)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = Math.cos(a) > 0.1 ? 'left' : Math.cos(a) < -0.1 ? 'right' : 'center';
      ctx.fillText(s.label, lx, ly + 4);
    });
  }

  // Animate in when visible
  const obs = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    const start = performance.now();
    const animate = now => {
      progress = Math.min((now - start) / 900, 1);
      draw(1 - Math.pow(1 - progress, 3));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, { threshold: 0.3 });
  obs.observe(canvas);
}

/* ── Web Speech voice input on gene_ai page ──────────────────────────────── */
function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  // Attach to each .voice-input-btn created in HTML
  document.querySelectorAll('[data-voice-target]').forEach(btn => {
    const targetId = btn.dataset.voiceTarget;
    const input = document.getElementById(targetId);
    if (!input) return;

    const rec = new SpeechRecognition();
    rec.lang = 'zh-TW';
    rec.interimResults = false;

    rec.onresult = e => {
      const text = e.results[0][0].transcript;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      btn.classList.remove('voice-listening');
      btn.textContent = '🎙️';
    };
    rec.onend = () => { btn.classList.remove('voice-listening'); btn.textContent = '🎙️'; };
    rec.onerror = () => { btn.classList.remove('voice-listening'); btn.textContent = '🎙️'; };

    btn.addEventListener('click', () => {
      if (btn.classList.contains('voice-listening')) { rec.stop(); return; }
      btn.classList.add('voice-listening');
      btn.textContent = '⏹';
      rec.start();
    });
  });
}

/* ── WAA Skill Bars (about_me page) ─────────────────────────────────────── */
function initSkillBars() {
  const bars = document.querySelectorAll('[data-skill-bar]');
  if (!bars.length) return;

  const obs = new IntersectionObserver((entries, o) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      const fill = e.target.querySelector('.skill-bar-fill');
      const pct  = parseFloat(e.target.dataset.skillBar) / 100;
      if (!fill) return;
      fill.animate(
        [{ width: '0%' }, { width: `${pct * 100}%` }],
        { duration: 900, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' }
      );
    });
  }, { threshold: 0.3 });

  bars.forEach(el => obs.observe(el));
}

/* ── Card Tilt 3D ─────────────────────────────────────────────────────────── */
function initCardTilt() {
  const SEL = '.card, .work-card, .explore-card, .algo-card, .metric-card, .skill-card, .surface-card, .runtime-card, .chart-card, .sc-if-item';
  const MAX = 8; // max tilt degrees

  document.querySelectorAll(SEL).forEach(card => {
    card.style.transformStyle = 'preserve-3d';
    card.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';

    card.addEventListener('mousemove', function(e) {
      const r = this.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width  - 0.5; // -0.5 ~ 0.5
      const y = (e.clientY - r.top)  / r.height - 0.5;
      const rotY =  x * MAX;
      const rotX = -y * MAX;
      this.style.transform = `perspective(600px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(4px)`;
      this.style.boxShadow = `${-rotY * 1.5}px ${rotX * 1.5}px 24px rgba(88,215,255,0.12)`;
    });
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'perspective(600px) rotateX(0) rotateY(0) translateZ(0)';
      this.style.boxShadow = '';
    });
  });
}

/* ── Custom Cursor ────────────────────────────────────────────────────────── */
function initCustomCursor() {
  // Skip touch-only devices
  if (window.matchMedia('(hover: none)').matches) return;

  const dot  = document.createElement('div');
  const ring = document.createElement('div');
  dot.id  = 'cursor-dot';
  ring.id = 'cursor-ring';
  document.body.append(dot, ring);

  let mx = -100, my = -100, rx = -100, ry = -100;
  let clicking = false;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
  document.addEventListener('mousedown', () => { clicking = true; ring.classList.add('cursor-click'); });
  document.addEventListener('mouseup',   () => { clicking = false; ring.classList.remove('cursor-click'); });

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('a, button, .btn, [role="button"], input, textarea, select, .card, .work-card, .explore-card');
    dot.classList.toggle('cursor-hover', !!target);
    ring.classList.toggle('cursor-hover', !!target);
  });

  const lerp = (a, b, t) => a + (b - a) * t;
  const loop = () => {
    rx = lerp(rx, mx, 0.12);
    ry = lerp(ry, my, 0.12);
    dot.style.transform  = `translate(${mx}px, ${my}px)`;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(loop);
  };
  loop();
}

/* ── Page Transition ──────────────────────────────────────────────────────── */
function initPageTransition() {
  // Inject overlay
  const overlay = document.createElement('div');
  overlay.id = 'page-transition-overlay';
  document.body.appendChild(overlay);

  // Fade in on load
  document.body.classList.add('page-entering');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.body.classList.remove('page-entering');
      document.body.classList.add('page-entered');
    });
  });

  // Intercept internal links
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    // Only internal same-origin non-hash links
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || link.target === '_blank') return;
    e.preventDefault();
    document.body.classList.add('page-leaving');
    setTimeout(() => { window.location.href = href; }, 280);
  });
}

/* ── Section Title Split Animation ───────────────────────────────────────── */
function initSectionTitleAnim() {
  if (!document.getElementById('title-anim-style')) {
    const s = document.createElement('style');
    s.id = 'title-anim-style';
    s.textContent = `
      .section-title.ta-init span.ta-word {
        display:inline-block;
        opacity:0;
        transform:translateY(28px);
        transition:opacity 0.5s ease, transform 0.5s ease;
      }
      .section-title.ta-init.ta-visible span.ta-word { opacity:1; transform:translateY(0); }
      @media (prefers-reduced-motion:reduce) {
        .section-title.ta-init span.ta-word { opacity:1; transform:none; transition:none; }
      }
    `;
    document.head.appendChild(s);
  }

  const titles = document.querySelectorAll('.section-title, .sc-section-title, h2.section-title');
  const obs = new IntersectionObserver((entries, o) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      o.unobserve(e.target);
      e.target.classList.add('ta-visible');
    });
  }, { threshold: 0.3 });

  titles.forEach(el => {
    if (el.dataset.taInit) return;
    el.dataset.taInit = '1';
    // Wrap each word in a span
    const words = el.innerHTML.split(/(\s+|<br\s*\/?>)/gi);
    el.innerHTML = words.map(w =>
      /^\s+$/.test(w) || /^<br/i.test(w) ? w : `<span class="ta-word" style="transition-delay:${Math.random()*0.15}s">${w}</span>`
    ).join('');
    el.classList.add('ta-init');
    obs.observe(el);
  });
}

/* ── Keyboard Shortcuts ───────────────────────────────────────────────────── */
function initKeyboardShortcuts() {
  // Show help overlay on '?'
  if (!document.getElementById('kb-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'kb-overlay';
    overlay.innerHTML = `
      <div class="kb-modal">
        <div class="kb-header"><h3>⌨️ 鍵盤快捷鍵</h3><button class="kb-close">✕</button></div>
        <div class="kb-list">
          <div class="kb-row"><kbd>/</kbd><span>聚焦搜尋欄</span></div>
          <div class="kb-row"><kbd>?</kbd><span>顯示此說明</span></div>
          <div class="kb-row"><kbd>Esc</kbd><span>關閉彈窗 / 清除聚焦</span></div>
          <div class="kb-row"><kbd>G H</kbd><span>前往首頁</span></div>
          <div class="kb-row"><kbd>G W</kbd><span>前往作品總覽</span></div>
          <div class="kb-row"><kbd>G A</kbd><span>前往 About Me</span></div>
          <div class="kb-row"><kbd>G G</kbd><span>前往基因 AI</span></div>
          <div class="kb-row"><kbd>↑ ↑ ↓ ↓</kbd><span>回到頁面頂部 (彩蛋)</span></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.kb-close').addEventListener('click', () => overlay.classList.remove('kb-visible'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('kb-visible'); });
  }

  let keyBuffer = '';
  let konamiSeq = '';
  const KONAMI = 'ArrowUpArrowUpArrowDownArrowDown';

  document.addEventListener('keydown', e => {
    // Skip when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    const overlay = document.getElementById('kb-overlay');

    // '?' → show help
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      overlay?.classList.toggle('kb-visible');
      return;
    }

    // 'Escape' → close
    if (e.key === 'Escape') { overlay?.classList.remove('kb-visible'); return; }

    // '/' → focus first search input
    if (e.key === '/') {
      e.preventDefault();
      const inp = document.querySelector('input[type="text"], input[type="search"]');
      inp?.focus();
      return;
    }

    // G + letter navigation
    keyBuffer += e.key.toUpperCase();
    if (keyBuffer.length > 2) keyBuffer = keyBuffer.slice(-2);
    if (keyBuffer === 'GH') { window.location.href = '/'; keyBuffer = ''; }
    if (keyBuffer === 'GW') { window.location.href = '/works'; keyBuffer = ''; }
    if (keyBuffer === 'GA') { window.location.href = '/about'; keyBuffer = ''; }
    if (keyBuffer === 'GG') { window.location.href = '/gene-ai'; keyBuffer = ''; }

    // Konami-style: scroll to top
    konamiSeq += e.key;
    if (konamiSeq.length > KONAMI.length) konamiSeq = konamiSeq.slice(-KONAMI.length);
    if (konamiSeq === KONAMI) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      konamiSeq = '';
      // Show a small toast
      showToast('⬆️ 回到頂部！');
    }
  });
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'global-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast-show'));
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 2200);
}

/* ── Theme Toggle with Animation ─────────────────────────────────────────── */
function initThemeToggle() {
  // Add toggle button to nav
  const nav = document.querySelector('nav');
  if (!nav || document.getElementById('theme-toggle-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'theme-toggle-btn';
  btn.setAttribute('aria-label', '切換主題');
  btn.innerHTML = '🎨';
  nav.appendChild(btn);

  const THEMES_ORDER = ['neon-tokyo', 'bio-lab', 'cyber-rose', 'deep-space'];
  const root = document.documentElement;

  btn.addEventListener('click', () => {
    const current = root.dataset.theme || 'deep-space';
    const idx = THEMES_ORDER.indexOf(current);
    const next = THEMES_ORDER[(idx + 1) % THEMES_ORDER.length];

    // Ripple flash transition
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;inset:0;z-index:10000;pointer-events:none;
      background:radial-gradient(circle at center, rgba(88,215,255,0.2), transparent 70%);
      opacity:0;transition:opacity 0.25s;
    `;
    document.body.appendChild(flash);
    requestAnimationFrame(() => { flash.style.opacity = '1'; });
    setTimeout(() => {
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 260);
    }, 200);

    // Apply next theme (re-trigger randomizer logic)
    root.dataset.theme = next;
    try { sessionStorage.setItem('portfolio_theme_v1', next); } catch(_) {}
    // Force reload to get proper theme vars (simpler than reimplementing all theme logic)
    window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initVantaDNA();
  initGSAP();
  initParticles();
  initLottie();
  initGitHubFeed();
  initCytoscape();
  initPlotly();
  initPyodide();
  initChatbot();
  initCardGlow();
  // Global enhancements
  initScrollProgress();
  initGlobalRipple();
  initMagneticCTAs();
  initHeroParallax();
  initCountUp();
  initLazyImages();
  initTypingAnimation();
  initTimelineReveal();
  initCardEntrance();
  // Page-specific
  initSkillRadar();
  initSkillBars();
  initVoiceInput();
  initCardTilt();
  initCustomCursor();
  initPageTransition();
  initSectionTitleAnim();
  initKeyboardShortcuts();
  initThemeToggle();
});
