/* ── Scroll reveal ── */
const obs = new IntersectionObserver(
    es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: .08 }
);
document.querySelectorAll('.reveal').forEach(r => obs.observe(r));

function safeRenderChart(renderFn) {
    try {
        return renderFn();
    } catch (error) {
        console.error('[ngs] chart render failed:', error);
        return null;
    }
}

/* ── Depth calculator ── */
const DEPTH_CONFIG = {
    rnaseq: { readsPerSample: 30e6, unit: '萬 reads/樣本', base: 30, costPerM: 5 },
    wgs: { readsPerSample: 300e6, unit: '百萬 reads/樣本', base: 300, costPerM: 3 },
    wes: { readsPerSample: 100e6, unit: '百萬 reads/樣本', base: 100, costPerM: 4 },
    chipseq: { readsPerSample: 30e6, unit: '萬 reads/樣本', base: 30, costPerM: 5 },
    atacseq: { readsPerSample: 100e6, unit: '百萬 reads/樣本', base: 100, costPerM: 5 },
    scrna: { readsPerCell: 5000, unit: 'reads/cell', costPerM: 6, isCell: true },
    amplicon: { readsPerSample: 5e6, unit: '萬 reads/樣本', base: 5, costPerM: 4 },
};

function calcDepth() {
    const type = document.getElementById('seqType').value;
    const cfg = DEPTH_CONFIG[type];
    const n = parseInt(document.getElementById('sampleNum').value) || 1;
    const ef = document.getElementById('extraField');
    const el = document.getElementById('extraLabel');

    // scRNA-seq 顯示細胞數欄位
    if (cfg.isCell) {
        ef.style.display = 'flex'; el.textContent = '細胞數';
    } else {
        ef.style.display = 'none';
    }

    let totalReads, totalM;
    if (cfg.isCell) {
        const cells = parseInt(document.getElementById('extraVal').value) || 5000;
        totalReads = cells * n * cfg.readsPerCell;
        totalM = totalReads / 1e6;
    } else {
        totalReads = n * cfg.readsPerSample;
        totalM = totalReads / 1e6;
    }

    const costEst = (totalM * cfg.costPerM).toFixed(0);
    const lanesEst = Math.ceil(totalM / 2000);   // NovaSeq SP: ~2B reads/lane

    const fmt = v =>
        v >= 1e8 ? (v / 1e8).toFixed(1) + ' 億' :
            v >= 1e4 ? (v / 1e4).toFixed(1) + ' 萬' :
                v.toFixed(0);

    document.getElementById('calcResult').innerHTML = `
            <div class="calc-stat">
                <div class="calc-stat-val">${fmt(totalReads)}</div>
                <div class="calc-stat-lbl">總 Reads 數</div>
            </div>
            <div class="calc-stat">
                <div class="calc-stat-val">${totalM.toFixed(0)} M</div>
                <div class="calc-stat-lbl">百萬 reads</div>
            </div>
            <div class="calc-stat">
                <div class="calc-stat-val" style="color:var(--green)">~${lanesEst}</div>
                <div class="calc-stat-lbl">NovaSeq lanes</div>
            </div>
            <div class="calc-stat">
                <div class="calc-stat-val" style="color:var(--orange)">~NT$ ${(costEst * 30).toLocaleString()}</div>
                <div class="calc-stat-lbl">估算費用（參考）</div>
            </div>`;
}
calcDepth();

/* ── NGS Results Gallery ── */
const GALLERY_DATA = {
    qc1: {
        name: 'Per-Base Quality (FastQC)',
        badge: '\u2460 QC', badgeClass: 'qc',
        tool: 'FastQC · MultiQC · Trim Galore',
        interviewLine: '「『讀取後段 Phred < 20 』是正常現象，因為 橏序合成誤誤率會累積。實際處理時我展示了 MultiQC 能將十個樣本的品質報告合并，讓審閱者一眼看出是否需要 adapter trimming。」',
        keyPoints: [
            'Phred 分數 Q20 = 誤誤率 1%，Q30 = 0.1%，一般要求 &ge;Q30 > 70% Bases',
            '讀取後十個數刀位元品質狀跟通常是囀系支鍵產生的 bias，可送進 soft-clip',
            '不均一 Adapter dimer 残留會導致比對率骟降 (< 70% 要檢查)',
            '多樣本報告一定要用 MultiQC 合併，防止漏看單一樣本的异常'
        ],
        flags: [
            'Phred < 28 持續超過 10 bp → Trim Galore re-trim',
            '帳序總長變短 (e.g., PE150 變 PE100) → 檢查 adapter contamination',
            'GC 分布非長形分布 → 可能有序列對污染或 GC-bias'
        ]
    },
    qc2: {
        name: 'Coverage Depth Histogram',
        badge: '\u2461 QC', badgeClass: 'qc',
        tool: 'samtools depth · mosdepth · GATK DepthOfCoverage',
        interviewLine: '「WGS 我將目標設定為 30× median depth，但比平均深度更重要的是 和幇度一致性 (uniformity)——我用 mosdepth 評估 % Bases &ge;10×，前者可防坥假陽性，後者規避式柳區域被漏檢。」',
        keyPoints: [
            'WGS &ge;30×，WES &ge;100×，RNA-seq &ge;20M uniquely mapped reads',
            '深度分布應犺單峰分布；雙峰 = PCR duplicates 繼續導致假高覆蓋',
            'Uniformity: &ge;80% 基因組的 depth &ge; 0.2× median，低於此要會險漏變點',
            '常見低覆蓋區域：重複序列、高 GC 區域 (BRCA1)、磁間母陳（centromere）'
        ],
        flags: [
            'Mean depth < 20× → 繼續安排补序',
            'PCR duplicate rate > 20% → ⚠️ calibrate library prep'
        ]
    },
    var1: {
        name: 'Lollipop Plot',
        badge: '\u2462 Variant', badgeClass: 'var',
        tool: 'maftools (R) · lollipops · MutationMapper',
        interviewLine: '「這張圖一看就能值出 EGFR exon 20 插入突變是燱點——這是 TKI 耀藥性突變的典型位置。面試時我一定法提到戴杅00e 已知燱點而非隨機分布，方能資討翻譯意義。」',
        keyPoints: [
            '滞棒高度 ∝ 各位置突變樣本數 (VAF 或 sample count)',
            '顎色可区分 missense / nonsense / splice / frameshift，快速判斷功能影響',
            '常見 domain 標註 (kinase domain, PH domain) 讓團健喜歡',
            'COSMIC 燱點续課能直接對映臨床意義'
        ],
        flags: [
            '燱點集中在 COSMIC oncogene 的 active site → 優先功能驗證',
            '全庋「溫和『突變’ VAF 因樣本較低 < 5% → 確認深度议魔'
        ]
    },
    var2: {
        name: 'IGV Pileup',
        badge: '\u2465 Variant', badgeClass: 'var',
        tool: 'IGV · samtools tview · Ribbon',
        interviewLine: '「每個遙傳候選變點我會先用 IGV 目視檢查——特別是压測到的 indel。最常遇到的陷阱是：延陳內 soft-clip 被工具誤認為 insertion，實際是 mapping artifact。」',
        keyPoints: [
            '查看 read 方向性 (forward/reverse strand)：兩側都有諦力 = 真實變點',
            'Read end pileup = PCR 複製嗚延 artifact，不是真實變點',
            '&ge;3 reads 支持、曠 soft-clip artifact = VAF 可信度高',
            'Indel 一定要登錄針對性變點呈現方式 (deletion: reads 跳與; insertion: reads 總長増加)'
        ],
        flags: [
            '廣帶軟序實驗 artifact: read pairs 方向相同，温湐確誊卆造被应用 duplicate filter',
            '延陳 repetitive region 的 variant → local realignment (GATK IndelRealigner)'
        ]
    },
    de1: {
        name: 'Volcano Plot',
        badge: '\u2463 DE', badgeClass: 'de',
        tool: 'DESeq2 · edgeR · ggplot2 (EnhancedVolcano)',
        interviewLine: '「我用 R² 和 fold-change 一起選名單——實開德或拘制基因平衡叮看 log2FC > 1 會漏掉低表達基因的志測變化。面試時我強調：『和幇度一致性比區切更重要，我會阹蒇差異表達基因公告後再用 GSEA 驗證。』」',
        keyPoints: [
            'X 軍: log2 Fold Change，Y 軍: -log10(adj p-value)，右上 = 顯著上調',
            'DESeq2 默認閾値: |log2FC| &ge; 1 AND padj &lt; 0.05',
            '前 3–5 名基因標譋 (HGNC symbol) 能直接呼應常見問題',
            '小心 volcano 图『飛走』的點: 調坊後不顯著成畣但 raw FC 大 (hyperactivated oncogene)'
        ],
        flags: [
            '定序資料 RNA-seq 差異表達分析前需居中正規化 (rlog / vst)'
        ]
    },
    de2: {
        name: 'Heatmap',
        badge: '\u2464 DE', badgeClass: 'de',
        tool: 'pheatmap · ComplexHeatmap (R) · Seaborn (Python)',
        interviewLine: '「這張 Heatmap 不是用 raw counts 畫的——我用 vst 轉換後再 z-score，防止高表達基因統治色彩屺度。欄聚類能確認實驗樣本是否隙分展9，周次該生物集『道儲』。」',
        keyPoints: [
            '輸入: vst / rlog 轉換後的標準化表達量 (z-score per gene)',
            '層次聚類方法: complete linkage + Euclidean distance (預設)，有時用 1-Pearson',
            '横軍 (樣本) 聚類能發現批次效應 (一個 cluster 包含所有樣本 1)',
            '追加 annotation bar 標註樣本把控組 vs 實驗組，韬UMAP 互相印證'
        ],
        flags: [
            '樣本不分群 (all mixed together) → 考慮 batch effect correction (ComBat)',
            '色尺賽飮 - 點點點主要效果: 不要用 default rainbow, 用 viridis / RdBu'
        ]
    },
    de3: {
        name: 'PCA Plot',
        badge: '\u2466 DE', badgeClass: 'de',
        tool: 'DESeq2 plotPCA · prcomp (R) · sklearn PCA (Python)',
        interviewLine: '「我用 PCA 補捕宣示 batch effect: 樣本按實驗期分展變 PC2，而非按組別分展 PC1——這是我利用 ComBat 參考的依據。酢正後 PC1/PC2 就正確反映組別差異。」',
        keyPoints: [
            '輸入: 500–1000 most variable genes (MVG) 的 vst 表達量',
            'PC1 vs PC2 應能分離組別 (不能 = batch / 樣本品質問題)',
            '樟圓大小可映射為誤序延陳高 read count',
            '現實中 PC1 + PC2 共同解釋 70% 以上的變異才能安心 interpret'
        ],
        flags: [
            '样品离群 (outlier) → 繼續乏除樣本分析時小心討論',
            '全部樣本集中在同一峰 (zero variance) → 樣本批次技術分析行失效'
        ]
    },
    de4: {
        name: 'MA Plot',
        badge: '\u2467 DE', badgeClass: 'de',
        tool: 'DESeq2 plotMA · edgeR · limma',
        interviewLine: '「MA plot 是我用來監測 shrinkage 效果: apeglm shrinkage 後，低表達量基因的 FC 應綎於零，而不是將噪音放大。若控制組和實驗組如果跨 A 軍對樱 (scatter) 在 M=0 附近，代表正規化正滎。」',
        keyPoints: [
            'A 軍 = Average (log2 mean expression)，M 軍 = Minus (log2 fold change)',
            '低表達基因的 M 分散大 (sampling noise)，需要 shrinkage (apeglm / ashr)',
            '重要: 變點應均勻對称分布在 M=0 兩側，否則表著正規化有問題',
            '最小陣 DESeq2 plotMA 就能發視對照組不對稱的批次效應'
        ],
        flags: [
            '高 A 傼結點不對稱展發 (MA fanning) → normalization 失辺，考慮 TMM / DESeq2 MedianRatio'
        ]
    },
    func1: {
        name: 'GSEA Bubble Plot',
        badge: '\u2468 Functional', badgeClass: 'func',
        tool: 'clusterProfiler (R) · fgsea · GSEA Java',
        interviewLine: '「我展示的 GSEA 元數据就是然而發展，沒用 ORA，因為 ORA 對閾値與分析化羢誤拜。GSEA 討測全基因組的排序信号，結果較少受前者设定影響。NES > 0 = 逢迎性高表達，NES < 0 = 拡制。」',
        keyPoints: [
            '水泡大小: 通路內 gene count，顏色: NES (Normalized Enrichment Score)',
            'FDR q-value < 0.25 = GSEA 預設达到廣泏羢誤控制',
            '需規避包括路徑 (pathway) 和實驗組心發對應的漏洞：從多個 MSigDB 基因組分析',
            'Leading edge genes 是最面試用的: 還能進一步自產驗證實彗'
        ],
        flags: [
            '± NES 都高的通路僅少數幾個 → 組別標籤頭顕寯， MSigDB 定義有關聯'
        ]
    },
    sc1: {
        name: 'UMAP',
        badge: '\u2469 scRNA', badgeClass: 'sc',
        tool: 'Seurat (R) · Scanpy (Python) · umap-learn',
        interviewLine: '「我在面試中描述：『UMAP 是 t-SNE 的更好替代，它保留局部和全局結構，不再仅是葸 cluster shape。』我會加上 Harmony 幹預處理後再跑 UMAP，防止 batch cluster 拈曼biological cluster。」',
        keyPoints: [
            '前處理：視質控管 → normalization → HVG 選取 → PCA → Harmony/Seurat integration → UMAP',
            '色料: 細胞類型 (marker gene)，差異表達準則，或仔偽降畲指標',
            'n_neighbors = 15–30 (local resolution)，min_dist = 0.1–0.3 (cluster spacing)',
            '每個 cluster 用 findMarkers 驗證 marker gene 确認細胞身分'
        ],
        flags: [
            'UMAP 轉軍非線性，不要直接比較不同 batch 的 cluster 位置',
            '每個鑑別圆奈伏都只是假設的縮譖簾鹫，填繂擇用生物學標誌確認'
        ]
    },
    sc2: {
        name: 'Circos Plot',
        badge: '\u246a SV', badgeClass: 'sc',
        tool: 'STAR-Fusion · Manta · circos.js · OmicCircos (R)',
        interviewLine: '「当我看到 Circos 臨床獨小母標本有 FGFR3–TACC3 融合 arcs，我會暴星詉言其有潛力的治療價値——這就是臨床小三陽融合的典型峠譫御史。」',
        keyPoints: [
            '弧線連接兩收發點表示花苟 (translocation) / 倒位 (inversion) / 融合',
            '弧寬度: read pair support count (相停謼就是控刻滞棒類似)，寬 = evidence 強',
            '外圈顏色 track 可叠加 CNV / methylation 共同显示',
            'WGS > 30× 且键長 &ge;150 bp 方能可靠 SV 退測'
        ],
        flags: [
            '弧線數量暴冗 (> 100 SVs) → 可能是 chromothripsis，需要雙端序列 (long-read WGS) 進一步確認'
        ]
    }
};

/* ── Mini chart renders ── */
function renderMiniChart(canvasId, type) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof window.Chart === 'undefined') return null;
    const common = {
        responsive: true, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
    };
    if (type === 'qc1') {
        // Per-base quality
        return new Chart(ctx, {
            type: 'line', data: {
                labels: Array.from({ length: 20 }, (_, i) => i + 1),
                datasets: [{
                    data: [38, 37, 37, 36, 36, 35, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22],
                    borderColor: '#39d0f0', backgroundColor: 'rgba(57,208,240,.10)',
                    borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3
                }]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false, min: 15, max: 42 } } }
        });
    } else if (type === 'qc2') {
        // Coverage histogram (bell-ish)
        const d = [0, 1, 4, 12, 28, 45, 52, 46, 29, 13, 5, 2, 1];
        return new Chart(ctx, {
            type: 'bar', data: {
                labels: d.map((_, i) => (i + 24) + 'x'),
                datasets: [{ data: d, backgroundColor: 'rgba(63,185,80,.65)', borderWidth: 0, borderRadius: 3 }]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'var1') {
        // Lollipop: scatter with custom lines
        const positions = [45, 120, 155, 198, 245, 310, 350];
        const heights = [3, 12, 6, 2, 8, 4, 20];
        const colors = heights.map(h => h > 15 ? '#f85149' : h > 8 ? '#f0883e' : '#39d0f0');
        return new Chart(ctx, {
            type: 'scatter', data: {
                datasets: [{
                    data: positions.map((x, i) => ({ x, y: heights[i] })),
                    pointBackgroundColor: colors, pointBorderColor: colors,
                    pointRadius: heights.map(h => Math.min(4 + h / 3, 9))
                }]
            }, options: {
                ...common, scales: {
                    x: { display: false, min: 0, max: 380 },
                    y: { display: false, min: 0, max: 24 }
                }
            }
        });
    } else if (type === 'var2') {
        // IGV pileup (stacked bar simulation)
        const fwd = [8, 9, 10, 11, 12, 10, 9, 8, 9, 11, 10, 9];
        const rev = [7, 8, 9, 9, 8, 9, 8, 8, 9, 10, 9, 8];
        return new Chart(ctx, {
            type: 'bar', data: {
                labels: fwd.map((_, i) => i),
                datasets: [
                    { data: fwd, backgroundColor: 'rgba(57,208,240,.55)', borderWidth: 0, borderRadius: 0 },
                    { data: rev, backgroundColor: 'rgba(240,136,62,.45)', borderWidth: 0, borderRadius: 0 }
                ]
            }, options: {
                ...common, scales: { x: { display: false }, y: { display: false } },
                plugins: { ...common.plugins }
            }
        });
    } else if (type === 'de1') {
        // Volcano: scatter
        const pts = [];
        for (let i = 0; i < 120; i++) {
            const fc = (Math.random() - 0.5) * 6;
            const p = Math.random() * 12;
            pts.push({
                x: fc, y: p,
                color: (Math.abs(fc) > 1.5 && p > 5) ?
                    (fc > 0 ? '#f85149' : '#39d0f0') : '#484f58'
            });
        }
        return new Chart(ctx, {
            type: 'scatter', data: {
                datasets: [{
                    data: pts, pointBackgroundColor: pts.map(p => p.color),
                    pointRadius: 2.5, pointBorderWidth: 0
                }]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'de2') {
        // Heatmap via bar (stacked colors)
        const rows = 6, cols = 8;
        const datasets = Array.from({ length: rows }, (_, r) => ({
            data: Array.from({ length: cols }, () => 1),
            backgroundColor: Array.from({ length: cols }, () => {
                const v = Math.random();
                return v > .6 ? '#f85149' : v < .4 ? '#39d0f0' : '#24292e';
            }),
            borderWidth: 1, borderColor: '#0d1117'
        }));
        return new Chart(ctx, {
            type: 'bar', data: { labels: Array.from({ length: cols }, (_, i) => i), datasets },
            options: { ...common, scales: { x: { display: false, stacked: true }, y: { display: false, stacked: true } } }
        });
    } else if (type === 'de3') {
        // PCA: scatter two groups
        const g1 = Array.from({ length: 15 }, () => ({ x: Math.random() * 2 - 3, y: Math.random() * 2 - 1 }));
        const g2 = Array.from({ length: 15 }, () => ({ x: Math.random() * 2 + 1, y: Math.random() * 2 - 1 }));
        return new Chart(ctx, {
            type: 'scatter', data: {
                datasets: [
                    { data: g1, pointBackgroundColor: '#39d0f0', pointRadius: 3.5, pointBorderWidth: 0 },
                    { data: g2, pointBackgroundColor: '#f0883e', pointRadius: 3.5, pointBorderWidth: 0 }
                ]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'de4') {
        // MA: scatter
        const pts = Array.from({ length: 100 }, () => {
            const a = Math.random() * 14 + 2;
            const m = (Math.random() - 0.5) * 4 * (a < 6 ? 3 : 1);
            return { x: a, y: m, color: Math.abs(m) > 1.5 ? '#f85149' : '#484f58' };
        });
        return new Chart(ctx, {
            type: 'scatter', data: {
                datasets: [
                    { data: pts, pointBackgroundColor: pts.map(p => p.color), pointRadius: 2, pointBorderWidth: 0 }
                ]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'func1') {
        // Bubble (simulated via scatter with variable radius)
        const bubbles = [
            { x: 1.8, y: 5, r: 12 }, { x: -1.4, y: 4, r: 9 },
            { x: 1.2, y: 3, r: 7 }, { x: -0.8, y: 2.5, r: 5 },
            { x: 0.5, y: 2, r: 4 }, { x: -1.9, y: 3.5, r: 8 }
        ];
        return new Chart(ctx, {
            type: 'bubble', data: {
                datasets: [
                    {
                        data: bubbles.map((b, i) => ({ ...b, color: b.x > 0 ? '#f85149' : '#39d0f0' })),
                        backgroundColor: bubbles.map(b => b.x > 0 ? 'rgba(248,81,73,.5)' : 'rgba(57,208,240,.5)'),
                        borderColor: bubbles.map(b => b.x > 0 ? '#f85149' : '#39d0f0')
                    }
                ]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'sc1') {
        // UMAP clusters
        const clusters = [
            { cx: -2, cy: -1, color: '#39d0f0', n: 20 },
            { cx: 2, cy: -1, color: '#f0883e', n: 15 },
            { cx: 0, cy: 2, color: '#3fb950', n: 18 },
            { cx: -1, cy: 2.5, color: '#bc8cff', n: 10 },
        ];
        const pts = clusters.flatMap(c =>
            Array.from({ length: c.n }, () => ({ x: c.cx + (Math.random() - .5) * 1.2, y: c.cy + (Math.random() - .5) * 1.2, color: c.color }))
        );
        return new Chart(ctx, {
            type: 'scatter', data: {
                datasets: [
                    { data: pts, pointBackgroundColor: pts.map(p => p.color), pointRadius: 2.5, pointBorderWidth: 0 }
                ]
            }, options: { ...common, scales: { x: { display: false }, y: { display: false } } }
        });
    } else if (type === 'sc2') {
        // Circos arcs = just polar area as placeholder
        return new Chart(ctx, {
            type: 'polarArea', data: {
                labels: ['chr1', 'chr2', 'chr3', 'chr4', 'chr5', 'chr6'],
                datasets: [{
                    data: [12, 8, 15, 6, 10, 9],
                    backgroundColor: ['rgba(57,208,240,.4)', 'rgba(63,185,80,.4)',
                        'rgba(240,136,62,.4)', 'rgba(188,140,255,.4)',
                        'rgba(248,81,73,.4)', 'rgba(210,153,34,.4)'],
                    borderColor: ['#39d0f0', '#3fb950', '#f0883e', '#bc8cff', '#f85149', '#d29922'],
                    borderWidth: 1.5
                }]
            }, options: {
                ...common, scales: { r: { display: false } },
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
    }

    return null;
}

// Render all 11 mini charts
['qc1', 'qc2', 'var1', 'var2', 'de1', 'de2', 'de3', 'de4', 'func1', 'sc1', 'sc2'].forEach(id => {
    safeRenderChart(() => renderMiniChart('mini-' + id, id));
});

/* ── Modal logic ── */
let _modalChart = null;
const BADGE_COLORS = {
    qc: { bg: 'rgba(57,208,240,.12)', fg: '#39d0f0' },
    var: { bg: 'rgba(240,136,62,.12)', fg: '#f0883e' },
    de: { bg: 'rgba(63,185,80,.12)', fg: '#3fb950' },
    func: { bg: 'rgba(188,140,255,.12)', fg: '#bc8cff' },
    sc: { bg: 'rgba(248,81,73,.12)', fg: '#f85149' },
};

function openChartModal(id) {
    const d = GALLERY_DATA[id];
    if (!d) return;

    // Badge
    const bc = BADGE_COLORS[d.badgeClass] || BADGE_COLORS.qc;
    const badge = document.getElementById('modalBadge');
    badge.textContent = d.badge;
    badge.style.background = bc.bg;
    badge.style.color = bc.fg;

    document.getElementById('modalTitle').textContent = d.name;
    document.getElementById('modalTool').textContent = '🔧 ' + d.tool;

    // Build body
    const kpHtml = d.keyPoints.map(k => `<li>${k}</li>`).join('');
    const flagHtml = d.flags.map(f => `<li>${f}</li>`).join('');
    document.getElementById('modalBody').innerHTML = `
                <div class="modal-section-title">解讀要點</div>
                <ul>${kpHtml}</ul>
                ${d.flags.length ? `<div class="modal-section-title">⚖️ 异常紅旗 / 下一步</div><ul>${flagHtml}</ul>` : ''}
                <div class="modal-interview-box">
                    <div class="label">🎙️ 面試語術示範</div>
                    <p>${d.interviewLine}</p>
                </div>`;

    // Modal canvas chart
    const mc = document.getElementById('modalCanvas');
    if (typeof window.Chart === 'undefined') {
        mc.style.display = 'none';
    } else {
        const existingChart = Chart.getChart(mc);
        if (existingChart) existingChart.destroy();
        mc.style.display = 'block';
        setTimeout(() => {
            _modalChart = safeRenderChart(() => renderMiniChart('modalCanvas', id));
        }, 60);
    }

    document.getElementById('chartModal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeChartModal(e) {
    if (e && e.target !== document.getElementById('chartModal')) return;
    document.getElementById('chartModal').classList.remove('open');
    document.body.style.overflow = '';
    const modalCanvas = document.getElementById('modalCanvas');
    if (typeof window.Chart !== 'undefined') {
        const existingChart = Chart.getChart(modalCanvas);
        if (existingChart) existingChart.destroy();
    }
    if (_modalChart) { _modalChart.destroy(); _modalChart = null; }
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeChartModal();
});

/* ── Chart.js charts ── */
if (typeof window.Chart !== 'undefined') {
    Chart.defaults.color = '#7d8590';
    Chart.defaults.borderColor = '#21262d';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

    // Reads Depth Bar Chart
    safeRenderChart(() => new Chart(document.getElementById('depthChart'), {
        type: 'bar',
        data: {
            labels: ['WGS\n(30×)', 'WES\n(Exome)', 'RNA-seq', 'ChIP-seq', 'ATAC-seq', 'scRNA-seq\n(5k cells/樣本)', 'Amplicon'],
            datasets: [{
                label: '建議 Reads 數 (M)',
                data: [300, 150, 35, 30, 100, 25, 5],
                backgroundColor: [
                    'rgba(57,208,240,.7)', 'rgba(57,208,240,.5)',
                    'rgba(63,185,80,.7)', 'rgba(210,153,34,.7)',
                    'rgba(240,136,62,.7)', 'rgba(188,140,255,.7)',
                    'rgba(248,81,73,.7)'
                ],
                borderColor: [
                    '#39d0f0', '#39d0f0', '#3fb950', '#d29922',
                    '#f0883e', '#bc8cff', '#f85149'
                ],
                borderWidth: 1,
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y + ' M reads' } }
            },
            scales: {
                y: {
                    beginAtZero: true, title: { display: true, text: '百萬 reads (M)', color: '#484f58' },
                    grid: { color: 'rgba(33,38,45,.8)' }
                },
                x: { grid: { display: false } }
            }
        }
    }));

    // Platform Comparison Radar Chart
    safeRenderChart(() => new Chart(document.getElementById('platformChart'), {
        type: 'radar',
        data: {
            labels: ['準確率', '讀長', '通量', '成本效益', '速度', '可攜性'],
            datasets: [
                {
                    label: 'Illumina',
                    data: [95, 25, 95, 85, 75, 40],
                    borderColor: '#39d0f0', backgroundColor: 'rgba(57,208,240,.12)',
                    pointBackgroundColor: '#39d0f0', borderWidth: 2
                },
                {
                    label: 'PacBio HiFi',
                    data: [90, 90, 60, 50, 55, 30],
                    borderColor: '#3fb950', backgroundColor: 'rgba(63,185,80,.12)',
                    pointBackgroundColor: '#3fb950', borderWidth: 2
                },
                {
                    label: 'Oxford Nanopore',
                    data: [75, 98, 70, 70, 85, 95],
                    borderColor: '#f0883e', backgroundColor: 'rgba(240,136,62,.12)',
                    pointBackgroundColor: '#f0883e', borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } } },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { stepSize: 20, backdropColor: 'transparent', color: '#484f58', font: { size: 10 } },
                    grid: { color: 'rgba(33,38,45,.9)' },
                    angleLines: { color: 'rgba(33,38,45,.9)' },
                    pointLabels: { color: '#7d8590', font: { size: 11 } }
                }
            }
        }
    }));
}

/* ── RAG Search ── */
const configuredRagApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
    ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
    : '';
const appConfigUtils = window.APP_CONFIG_UTILS;

async function resolveRagApiBase() {
    if (typeof appConfigUtils?.resolveApiBase === 'function') {
        return (await appConfigUtils.resolveApiBase({ cacheKey: 'ngs-rag' }))
            || configuredRagApiBase
            || window.location.origin.replace(/\/+$/, '');
    }

    return configuredRagApiBase || window.location.origin.replace(/\/+$/, '');
}

async function doRagSearch() {
    const input = document.getElementById('ragInput');
    const btn = document.getElementById('ragSearchBtn');
    const status = document.getElementById('ragStatus');
    const results = document.getElementById('ragResults');
    const q = input.value.trim();
    if (!q) { input.focus(); return; }

    btn.disabled = true;
    btn.textContent = '搜尋中…';
    status.textContent = '正在連接知識庫…';
    results.innerHTML = '';

    try {
        const ragApiBase = await resolveRagApiBase();
        const params = new URLSearchParams({ query: q, limit: 6, chunk_size: 600, chunk_overlap: 80 });
        const r = await fetch(`${ragApiBase}/api/rag/documents?${params}`, {
            signal: AbortSignal.timeout(12000)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const docs = data.documents || data.items || data || [];

        status.textContent = docs.length
            ? `找到 ${docs.length} 筆相關片段`
            : '知識庫中暫無匹配結果，可先至「基因 AI」頁同步資料。';

        if (!docs.length) {
            results.innerHTML = '<div class="rag-empty">目前知識庫無此關鍵字的相關條目。<br>請前往 <a href="gene_ai.html" style="color:var(--teal)">基因 AI</a> 頁面同步資料後再試。</div>';
            return;
        }

        results.innerHTML = docs.map(doc => {
            const title = doc.source_name || doc.title || doc.name || '知識條目';
            const type = doc.record_type || doc.type || 'document';
            const text = doc.content || doc.text || doc.chunk || doc.summary || '';
            const typeLabel = type === 'literature' ? '📄 文獻' :
                type === 'protein_annotation' ? '🧬 蛋白質注釋' : '📚 文件';
            return `<div class="rag-card">
                        <div class="rag-card-type">${typeLabel}</div>
                        <div class="rag-card-title">${escapeHtml(title)}</div>
                        <div class="rag-card-text">${escapeHtml(text.slice(0, 320))}${text.length > 320 ? '…' : ''}</div>
                    </div>`;
        }).join('');
    } catch (err) {
        status.textContent = 'API 連線失敗：' + err.message;
        results.innerHTML = '<div class="rag-empty">無法連接 API，請稍後再試。</div>';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 搜尋';
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Allow Enter key to trigger search
document.getElementById('ragInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doRagSearch();
});