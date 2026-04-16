import { c as createComponent } from './astro-component_DIKdwFAr.mjs';
import 'piccolore';
import { r as renderComponent, a as renderTemplate, F as Fragment, u as unescapeHTML } from './prerender_OQTAnlvW.mjs';
import { $ as $$Base } from './Base_msUDbCzB.mjs';

const $$Ngs = createComponent(($$result, $$props, $$slots) => {
  const bodyHtml = `\r
\r
    <!-- ── Nav ── -->\r
    <div data-site-nav></div>\r
\r
    <!-- ── Hero ── -->\r
    <div class="page-hero">\r
        <div class="page-eyebrow"><span class="live-dot"></span>Genomics · Sequencing · NGS</div>\r
        <h1 class="page-title">NGS <span>次世代定序</span><br>實驗設計指南</h1>\r
        <p class="page-subtitle">從研究目的到分析流程的系統性規劃——覆蓋建庫策略、定序深度計算、品質控管與生物資訊分析。</p>\r
    </div>\r
\r
    <!-- ── Content ── -->\r
    <div class="container">\r
        <section class="service-overview reveal">\r
            <div class="service-overview-head">\r
                <div>\r
                    <div class="service-overview-label">Multi-omics Service Catalog</div>\r
                    <h2 class="service-overview-title">本站已具備多體學分析入口的架構基礎</h2>\r
                    <p class="service-overview-sub">\r
                        最合理的定位不是「所有分析都在瀏覽器內完成」，而是把本站做成分析模組總覽、任務入口、結果報告與雲端工作台，再把重計算流程交給後端 pipeline。\r
                    </p>\r
                </div>\r
                <div class="service-overview-note">\r
                    前台可先承接：模組介紹、資料上傳、任務提交、報告瀏覽、互動圖表與結果下載。真正要跑 scRNA、WES/WGS、Proteomics 等高計算量分析時，接 job queue、物件儲存與 worker 即可擴充。\r
                </div>\r
            </div>\r
\r
            <div class="service-grid">\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-green">標準轉錄體</span>\r
                        <h3>RNAseq</h3>\r
                    </div>\r
                    <p>轉錄體定序分析，用於差異表現、PCA、volcano plot、heatmap、GSEA 與 pathway enrichment。</p>\r
                    <div class="service-meta">\r
                        <span>STAR / Salmon</span><span>DESeq2</span><span>GSEA</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-red">高計算量</span>\r
                        <h3>scRNA</h3>\r
                    </div>\r
                    <p>單細胞 RNA 定序，可做 QC、細胞分群、marker genes、UMAP/TSNE 與 cell type annotation。</p>\r
                    <div class="service-meta">\r
                        <span>Cell Ranger</span><span>Seurat</span><span>Scanpy</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-teal">微生物相</span>\r
                        <h3>FL16S</h3>\r
                    </div>\r
                    <p>全長 16S rRNA 菌相分析，可輸出 taxonomy profile、alpha/beta diversity、relative abundance 與群落比較。</p>\r
                    <div class="service-meta">\r
                        <span>SILVA</span><span>DADA2</span><span>Kraken2</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card service-card-highlight">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-green">最適合產品化</span>\r
                        <h3>FL16S ASAP</h3>\r
                    </div>\r
                    <p>把 FL16S 做成一鍵式自動分析平台，特別適合網站型產品：上傳樣本、跑標準流程、回傳固定報告。</p>\r
                    <div class="service-meta">\r
                        <span>Upload Portal</span><span>Auto Report</span><span>Batch Mode</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-purple">變異分析</span>\r
                        <h3>WES / WGS</h3>\r
                    </div>\r
                    <p>全外顯子與全基因體定序，可做 variant calling、annotation、CNV / SV 報告與優先排序。</p>\r
                    <div class="service-meta">\r
                        <span>BWA</span><span>GATK</span><span>VEP / ANNOVAR</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-orange">特色模組</span>\r
                        <h3>miLinker / miRNA</h3>\r
                    </div>\r
                    <p>小分子 RNA 定序與標靶基因預測分析，可延伸成 regulatory network、target ranking 與 pathway view。</p>\r
                    <div class="service-meta">\r
                        <span>miRDeep2</span><span>TargetScan</span><span>Network View</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-yellow">蛋白質體</span>\r
                        <h3>Proteomics</h3>\r
                    </div>\r
                    <p>蛋白質體分析雲平台，可做顯著差異蛋白、火山圖、聚類熱圖與功能富集分析。</p>\r
                    <div class="service-meta">\r
                        <span>MaxQuant</span><span>FragPipe</span><span>DEP</span>\r
                    </div>\r
                </article>\r
\r
                <article class="service-card">\r
                    <div class="service-card-top">\r
                        <span class="service-badge service-badge-teal">瀏覽器可直接做</span>\r
                        <h3>Toolbox</h3>\r
                    </div>\r
                    <p>內建統計圖表、序列反轉互補、轉譯、GC 計算與多序列比對等工具，最適合先做成前端即時小工具。</p>\r
                    <div class="service-meta">\r
                        <span>Sequence Utils</span><span>Chart Tools</span><span>Alignment</span>\r
                    </div>\r
                </article>\r
            </div>\r
        </section>\r
\r
        <div class="steps-grid">\r
\r
            <!-- Step 1 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(57,208,240,.12);color:var(--teal);border:1px solid rgba(57,208,240,.25)">01\r
                </div>\r
                <div class="step-body">\r
                    <h2>確定研究目的 — 選擇定序策略</h2>\r
                    <p>不同生物問題需要不同的 NGS 方法，策略選擇影響後續所有設計決策。</p>\r
                    <table class="ngs-table">\r
                        <thead>\r
                            <tr>\r
                                <th>研究問題</th>\r
                                <th>策略</th>\r
                                <th>代表工具</th>\r
                                <th>平台</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>全基因組變異</td>\r
                                <td><span class="badge badge-teal">WGS</span></td>\r
                                <td>GATK HaplotypeCaller</td>\r
                                <td>Illumina NovaSeq</td>\r
                            </tr>\r
                            <tr>\r
                                <td>基因表現量</td>\r
                                <td><span class="badge badge-green">RNA-seq</span></td>\r
                                <td>STAR + DESeq2</td>\r
                                <td>Illumina NovaSeq / NextSeq</td>\r
                            </tr>\r
                            <tr>\r
                                <td>蛋白質結合位點</td>\r
                                <td><span class="badge badge-yellow">ChIP-seq</span></td>\r
                                <td>MACS2 + deepTools</td>\r
                                <td>Illumina HiSeq</td>\r
                            </tr>\r
                            <tr>\r
                                <td>染色質開放區域</td>\r
                                <td><span class="badge badge-orange">ATAC-seq</span></td>\r
                                <td>MACS2 + chromVAR</td>\r
                                <td>Illumina NextSeq</td>\r
                            </tr>\r
                            <tr>\r
                                <td>甲基化分析</td>\r
                                <td><span class="badge badge-purple">Bisulfite-seq</span></td>\r
                                <td>Bismark + DSS</td>\r
                                <td>Illumina NovaSeq</td>\r
                            </tr>\r
                            <tr>\r
                                <td>目標區域</td>\r
                                <td><span class="badge badge-teal">Panel / Amplicon</span></td>\r
                                <td>GATK + Pindel</td>\r
                                <td>Illumina MiSeq / Ion Torrent</td>\r
                            </tr>\r
                            <tr>\r
                                <td>單細胞轉錄組</td>\r
                                <td><span class="badge badge-green">scRNA-seq</span></td>\r
                                <td>Cell Ranger + Seurat</td>\r
                                <td>Illumina + 10x Genomics</td>\r
                            </tr>\r
                            <tr>\r
                                <td>全長轉錄本</td>\r
                                <td><span class="badge badge-orange">ISO-seq</span></td>\r
                                <td>SQANTI3 + IsoQuant</td>\r
                                <td>PacBio Sequel II / ONT</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                    <div class="tip tip-info" style="margin-top:14px">\r
                        💡 蛋白質工程應用中 DNA-seq（Amplicon）常用於 <strong>深突變掃描（DMS）</strong>，而 RNA-seq 用於評估設計序列的表現量變化。\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- Step 2 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(63,185,80,.12);color:var(--green);border:1px solid rgba(63,185,80,.25)">02\r
                </div>\r
                <div class="step-body">\r
                    <h2>樣本設計</h2>\r
                    <p>充足的統計效力來自合適的生物重複數與對照組設計。</p>\r
                    <ul class="checklist">\r
                        <li><strong>生物重複數</strong>：RNA-seq 建議 ≥ 3，差異表現分析至少 4–6</li>\r
                        <li><strong>技術重複</strong>：同一樣本跑兩次，評估定序重現性（通常非必要）</li>\r
                        <li><strong>對照組</strong>：明確 control vs. treatment，避免混淆因子</li>\r
                        <li><strong>批次效應</strong>：盡量同批次建庫定序；若無法避免，記錄批次資訊供 <code>ComBat</code> /\r
                            <code>limma::removeBatchEffect</code> 校正\r
                        </li>\r
                        <li><strong>樣本量估算工具</strong>：<code>RnaSeqSampleSize</code>（R）、<code>pwr</code>（R）、<code>PROPER</code>\r
                        </li>\r
                    </ul>\r
                    <div class="tip tip-warn" style="margin-top:14px">\r
                        ⚠️ 批次效應是 RNA-seq 分析最常見的混淆來源，實驗計劃階段就應規劃好隨機化策略。\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- Step 3 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(240,136,62,.12);color:var(--orange);border:1px solid rgba(240,136,62,.25)">03\r
                </div>\r
                <div class="step-body">\r
                    <h2>定序深度計算</h2>\r
                    <p>深度不足導致偵測力下降；過深則浪費成本。下方計算機協助估算總 reads 數與成本。</p>\r
                    <table class="ngs-table">\r
                        <thead>\r
                            <tr>\r
                                <th>應用</th>\r
                                <th>建議 Reads 數</th>\r
                                <th>涵蓋率</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>WGS (人類 3 Gb)</td>\r
                                <td>~90 億 bp</td>\r
                                <td>30× coverage</td>\r
                            </tr>\r
                            <tr>\r
                                <td>WES (人類 exome)</td>\r
                                <td>~1–2 億 reads</td>\r
                                <td>100× coverage</td>\r
                            </tr>\r
                            <tr>\r
                                <td>RNA-seq</td>\r
                                <td>20–50M reads / 樣本</td>\r
                                <td>多數轉錄本 >10 reads</td>\r
                            </tr>\r
                            <tr>\r
                                <td>ChIP-seq</td>\r
                                <td>20–40M reads</td>\r
                                <td>取決於峰寬</td>\r
                            </tr>\r
                            <tr>\r
                                <td>ATAC-seq</td>\r
                                <td>50–150M reads</td>\r
                                <td>核小體解析度</td>\r
                            </tr>\r
                            <tr>\r
                                <td>scRNA-seq</td>\r
                                <td>1,000–10,000 reads / cell</td>\r
                                <td>依細胞數而定</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Amplicon-seq (DMS)</td>\r
                                <td>≥ 500× / variant</td>\r
                                <td>依突變數量決定</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
\r
                    <!-- Reads depth bar chart -->\r
                    <div\r
                        style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-top:14px">\r
                        <div style="font-size:.82rem;font-weight:600;color:var(--muted);margin-bottom:14px">📊 各定序類型建議\r
                            reads 數比較（百萬 / 樣本）</div>\r
                        <canvas id="depthChart" height="90"></canvas>\r
                    </div>\r
\r
                    <!-- 互動計算機 -->\r
                    <div class="calc-panel">\r
                        <div style="font-size:.88rem;font-weight:600;color:var(--text);margin-bottom:14px">⚡ 定序深度快速估算機\r
                        </div>\r
                        <div class="calc-row">\r
                            <div class="calc-field">\r
                                <label>定序類型</label>\r
                                <select id="seqType" onchange="calcDepth()">\r
                                    <option value="rnaseq">RNA-seq</option>\r
                                    <option value="wgs">WGS (人類)</option>\r
                                    <option value="wes">WES (Exome)</option>\r
                                    <option value="chipseq">ChIP-seq</option>\r
                                    <option value="atacseq">ATAC-seq</option>\r
                                    <option value="scrna">scRNA-seq</option>\r
                                    <option value="amplicon">Amplicon-seq</option>\r
                                </select>\r
                            </div>\r
                            <div class="calc-field" id="sampleNumField">\r
                                <label>樣本數</label>\r
                                <input type="number" id="sampleNum" value="6" min="1" max="200" oninput="calcDepth()">\r
                            </div>\r
                            <div class="calc-field" id="extraField" style="display:none">\r
                                <label id="extraLabel">細胞數</label>\r
                                <input type="number" id="extraVal" value="5000" min="100" oninput="calcDepth()">\r
                            </div>\r
                        </div>\r
                        <div class="calc-result" id="calcResult"></div>\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- Step 4 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(188,140,255,.12);color:var(--purple);border:1px solid rgba(188,140,255,.25)">\r
                    04</div>\r
                <div class="step-body">\r
                    <h2>定序平台選擇</h2>\r
                    <table class="ngs-table">\r
                        <thead>\r
                            <tr>\r
                                <th>平台</th>\r
                                <th>讀長</th>\r
                                <th>準確率</th>\r
                                <th>適合應用</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td><strong>Illumina</strong><br><span style="font-size:.75rem;color:var(--dim)">NovaSeq\r
                                        / NextSeq / MiSeq</span></td>\r
                                <td>75–300 bp</td>\r
                                <td><span class="badge badge-green">Q30 > 85%</span></td>\r
                                <td>RNA-seq、WGS、ChIP-seq、Amplicon</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>PacBio</strong><br><span style="font-size:.75rem;color:var(--dim)">Sequel\r
                                        IIe / Revio</span></td>\r
                                <td>10–25 kb (HiFi)</td>\r
                                <td><span class="badge badge-green">Q30 > 99%</span></td>\r
                                <td>全長轉錄本、SV 分析、基因組組裝</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Oxford Nanopore</strong><br><span\r
                                        style="font-size:.75rem;color:var(--dim)">PromethION / MinION</span></td>\r
                                <td>kb–Mb 級</td>\r
                                <td><span class="badge badge-orange">Q20 ~99%</span></td>\r
                                <td>超長讀長、即時定序、直接 RNA-seq</td>\r
                            </tr>\r
                            <tr>\r
                                <td><strong>Ion Torrent</strong></td>\r
                                <td>200–600 bp</td>\r
                                <td><span class="badge badge-teal">Q30 > 80%</span></td>\r
                                <td>臨床 Panel、Amplicon</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                    <!-- Platform comparison chart -->\r
                    <div\r
                        style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-top:14px">\r
                        <div style="font-size:.82rem;font-weight:600;color:var(--muted);margin-bottom:14px">🔬 定序平台特性比較\r
                        </div>\r
                        <canvas id="platformChart" height="100"></canvas>\r
                    </div>\r
\r
                    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">\r
                        <div\r
                            style="flex:1;min-width:220px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:14px">\r
                            <div style="font-size:.78rem;font-weight:700;color:var(--muted);margin-bottom:8px">讀長選擇\r
                            </div>\r
                            <ul class="checklist" style="margin-top:0">\r
                                <li><strong>Single-end 50/100 bp</strong>：RNA-seq 基本分析（省成本）</li>\r
                                <li><strong>Paired-end 150 bp</strong>：基因組、ChIP-seq、差異表現（最常用）</li>\r
                                <li><strong>Paired-end 250/300 bp</strong>：16S 擴增子、低複雜度樣本</li>\r
                            </ul>\r
                        </div>\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- Step 5 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(210,153,34,.12);color:var(--yellow);border:1px solid rgba(210,153,34,.25)">05\r
                </div>\r
                <div class="step-body">\r
                    <h2>建庫設計</h2>\r
                    <div\r
                        style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:4px">\r
                        <div\r
                            style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">\r
                            <div style="font-size:.82rem;font-weight:700;color:var(--orange);margin-bottom:10px">🧫 DNA\r
                                建庫</div>\r
                            <ol style="padding-left:18px;font-size:.83rem;color:var(--muted);line-height:2">\r
                                <li>Fragmentation（超音波或酵素）</li>\r
                                <li>End repair + A-tailing</li>\r
                                <li>Adapter ligation</li>\r
                                <li>Size selection (SPRI beads)</li>\r
                                <li>PCR amplification</li>\r
                            </ol>\r
                        </div>\r
                        <div\r
                            style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">\r
                            <div style="font-size:.82rem;font-weight:700;color:var(--green);margin-bottom:10px">🔬 RNA\r
                                建庫</div>\r
                            <ol style="padding-left:18px;font-size:.83rem;color:var(--muted);line-height:2">\r
                                <li>RNA 品質確認（RIN ≥ 7）</li>\r
                                <li>rRNA 去除 <em>或</em> polyA 選取</li>\r
                                <li>RNA 片段化</li>\r
                                <li>逆轉錄（cDNA 合成）</li>\r
                                <li>Strand-specific 建庫（建議）</li>\r
                                <li>PCR + 定量</li>\r
                            </ol>\r
                        </div>\r
                        <div\r
                            style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">\r
                            <div style="font-size:.82rem;font-weight:700;color:var(--teal);margin-bottom:10px">🏷️ UMI\r
                                去重複</div>\r
                            <p style="font-size:.83rem;color:var(--muted);line-height:1.7">Unique Molecular Identifier\r
                                在逆轉錄前加入，可區分 PCR duplication 與真實分子，提升定量精準度。</p>\r
                            <div class="tip tip-success" style="margin-top:10px;font-size:.78rem">推薦用於定量要求高的 bulk\r
                                RNA-seq 及 scRNA-seq</div>\r
                        </div>\r
                    </div>\r
                </div>\r
            </div>\r
\r
            <!-- Step 6 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(248,81,73,.12);color:var(--red);border:1px solid rgba(248,81,73,.25)">06\r
                </div>\r
                <div class="step-body">\r
                    <h2>品質控管（QC）</h2>\r
                    <table class="ngs-table">\r
                        <thead>\r
                            <tr>\r
                                <th>步驟</th>\r
                                <th>工具</th>\r
                                <th>關鍵指標</th>\r
                            </tr>\r
                        </thead>\r
                        <tbody>\r
                            <tr>\r
                                <td>建庫前 RNA 品質</td>\r
                                <td>Bioanalyzer、Qubit</td>\r
                                <td>RIN ≥ 7、DV200 ≥ 30%</td>\r
                            </tr>\r
                            <tr>\r
                                <td>建庫前 DNA 品質</td>\r
                                <td>Bioanalyzer、NanoDrop</td>\r
                                <td>260/280 ≈ 1.8、無降解</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Raw reads QC</td>\r
                                <td><code>FastQC</code>、<code>MultiQC</code></td>\r
                                <td>Q30 > 80%、GC 分佈正常</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Adapter trimming</td>\r
                                <td><code>Trimmomatic</code>、<code>fastp</code></td>\r
                                <td>殘留 adapter < 1%</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Alignment QC</td>\r
                                <td><code>Picard</code>、<code>RSeQC</code></td>\r
                                <td>對齊率 > 85%（RNA > 70%）</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Duplication</td>\r
                                <td><code>Picard MarkDuplicates</code></td>\r
                                <td>WGS dup < 20%；Amplicon 可接受高 dup</td>\r
                            </tr>\r
                            <tr>\r
                                <td>Coverage uniformity</td>\r
                                <td><code>mosdepth</code>、<code>samtools</code></td>\r
                                <td>目標區域 > 95% 達到最低深度</td>\r
                            </tr>\r
                        </tbody>\r
                    </table>\r
                </div>\r
            </div>\r
\r
            <!-- Step 7 -->\r
            <div class="step-card reveal">\r
                <div class="step-num"\r
                    style="background:rgba(57,208,240,.12);color:var(--teal);border:1px solid rgba(57,208,240,.25)">07\r
                </div>\r
                <div class="step-body">\r
                    <h2>分析流程設計</h2>\r
                    <div class="pipeline">\r
                        <span class="pipe-step" style="color:var(--muted)">📥 Raw FASTQ</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--orange)">🔍 FastQC</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--yellow)">✂️ Trimming</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--teal)">🗺️ Alignment</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--green)">📊 Quantify / Call</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--purple)">📈 統計分析</span>\r
                        <span class="pipe-arrow">→</span>\r
                        <span class="pipe-step" style="color:var(--text)">🖼️ 視覺化</span>\r
                    </div>\r
\r
                    <div\r
                        style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px">\r
                        <div\r
                            style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">\r
                            <div style="font-size:.78rem;font-weight:700;color:var(--green);margin-bottom:8px">RNA-seq\r
                                流程</div>\r
                            <pre style="margin-top:0;font-size:.75rem">STAR --genomeDir /ref \\\r
  --readFilesIn R1.fq R2.fq \\\r
  --outSAMtype BAM SortedByCoordinate\r
\r
featureCounts -a gtf -o counts.txt bam\r
\r
# DESeq2 (R)\r
dds &lt;- DESeqDataSetFromMatrix(...)\r
res &lt;- results(DESeq(dds))</pre>\r
                        </div>\r
                        <div\r
                            style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px">\r
                            <div style="font-size:.78rem;font-weight:700;color:var(--teal);margin-bottom:8px">WGS\r
                                Variant Calling</div>\r
                            <pre style="margin-top:0;font-size:.75rem">bwa mem ref.fa R1.fq R2.fq | \\\r
  samtools sort -o sorted.bam\r
\r
gatk HaplotypeCaller \\\r
  -I sorted.bam -O variants.vcf \\\r
  -R ref.fa\r
\r
gatk VariantFiltration \\\r
  --variant variants.vcf</pre>\r
                        </div>\r
                    </div>\r
                    <div class="tip tip-success" style="margin-top:14px">\r
                        ✅ 建議使用 <strong>Snakemake</strong> 或 <strong>Nextflow</strong> 建立可重現的工作流程，並搭配 <code>conda</code>\r
                        / <code>Docker</code> 管理環境。\r
                    </div>\r
                </div>\r
            </div>\r
\r
        </div><!-- /steps-grid -->\r
    </div><!-- /container -->\r
\r
    <!-- ── NGS 結果圖示庫 ── -->\r
    <section class="gallery-section reveal">\r
        <h2>NGS 結果<span style="color:var(--teal)"> 圖示解讀庫</span></h2>\r
        <p class="section-sub">11 種常見輸出圖表 &middot; 點擊任意卡片查看深度解讀指南和面試語術</p>\r
\r
        <!-- 品質控管 -->\r
        <div class="gallery-group-label qc">🔵 品質控管 QC</div>\r
        <div class="chart-cards-grid">\r
            <div class="chart-card" onclick="openChartModal('qc1')">\r
                <div class="chart-card-num">①</div>\r
                <canvas id="mini-qc1" height="90"></canvas>\r
                <div class="chart-card-name">Per-Base Quality</div>\r
                <div class="chart-card-desc">FastQC 讀取每一位元的 Phred 分數分布</div>\r
                <div class="chart-card-hint">FastQC &middot; MultiQC</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('qc2')">\r
                <div class="chart-card-num">②</div>\r
                <canvas id="mini-qc2" height="90"></canvas>\r
                <div class="chart-card-name">Coverage Depth Histogram</div>\r
                <div class="chart-card-desc">WGS/WES 每個位元的深度次數分布</div>\r
                <div class="chart-card-hint">samtools &middot; mosdepth</div>\r
            </div>\r
        </div>\r
\r
        <!-- 變異分析 -->\r
        <div class="gallery-group-label var">🟠 變異分析</div>\r
        <div class="chart-cards-grid">\r
            <div class="chart-card" onclick="openChartModal('var1')">\r
                <div class="chart-card-num">③</div>\r
                <canvas id="mini-var1" height="90"></canvas>\r
                <div class="chart-card-name">Lollipop Plot</div>\r
                <div class="chart-card-desc">VCF 突變熱點標記，館位上抱的進行性突變</div>\r
                <div class="chart-card-hint">maftools &middot; lollipops</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('var2')">\r
                <div class="chart-card-num">⑥</div>\r
                <canvas id="mini-var2" height="90"></canvas>\r
                <div class="chart-card-name">IGV Pileup</div>\r
                <div class="chart-card-desc">SNP/Indel 的 read-level 視覺化，確認是翟變還是工具誤差</div>\r
                <div class="chart-card-hint">IGV &middot; RSeQC</div>\r
            </div>\r
        </div>\r
\r
        <!-- 差異表現 -->\r
        <div class="gallery-group-label de">🟢 差異表現分析</div>\r
        <div class="chart-cards-grid">\r
            <div class="chart-card" onclick="openChartModal('de1')">\r
                <div class="chart-card-num">④</div>\r
                <canvas id="mini-de1" height="90"></canvas>\r
                <div class="chart-card-name">Volcano Plot</div>\r
                <div class="chart-card-desc">倍數变化 vs 統計顯著性，檢向差異表現基因</div>\r
                <div class="chart-card-hint">DESeq2 &middot; edgeR</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('de2')">\r
                <div class="chart-card-num">⑤</div>\r
                <canvas id="mini-de2" height="90"></canvas>\r
                <div class="chart-card-name">Heatmap</div>\r
                <div class="chart-card-desc">層次聚類的基因表現量矩陣，樣本分組確認</div>\r
                <div class="chart-card-hint">pheatmap &middot; ComplexHeatmap</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('de3')">\r
                <div class="chart-card-num">⑦</div>\r
                <canvas id="mini-de3" height="90"></canvas>\r
                <div class="chart-card-name">PCA Plot</div>\r
                <div class="chart-card-desc">樣本重複性確認，發現批次效應 (batch effect)</div>\r
                <div class="chart-card-hint">DESeq2 plotPCA &middot; ggplot2</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('de4')">\r
                <div class="chart-card-num">⑧</div>\r
                <canvas id="mini-de4" height="90"></canvas>\r
                <div class="chart-card-name">MA Plot</div>\r
                <div class="chart-card-desc">低表現量偏差検查，A 軌怎平均表達反映批次效應</div>\r
                <div class="chart-card-hint">DESeq2 plotMA &middot; edgeR</div>\r
            </div>\r
        </div>\r
\r
        <!-- 功能分析 -->\r
        <div class="gallery-group-label func">💜 功能分析</div>\r
        <div class="chart-cards-grid">\r
            <div class="chart-card" onclick="openChartModal('func1')">\r
                <div class="chart-card-num">⑨</div>\r
                <canvas id="mini-func1" height="90"></canvas>\r
                <div class="chart-card-name">GSEA Bubble Plot</div>\r
                <div class="chart-card-desc">通路富集分析，水泡大小 = 基因數，顏色 = NES</div>\r
                <div class="chart-card-hint">clusterProfiler &middot; GSEA</div>\r
            </div>\r
        </div>\r
\r
        <!-- 單細胞 / 結構變異 -->\r
        <div class="gallery-group-label sc">🔴 單細胞 / 結構變異</div>\r
        <div class="chart-cards-grid">\r
            <div class="chart-card" onclick="openChartModal('sc1')">\r
                <div class="chart-card-num">⑩</div>\r
                <canvas id="mini-sc1" height="90"></canvas>\r
                <div class="chart-card-name">UMAP</div>\r
                <div class="chart-card-desc">高維 embedding 壓縮到 2D，標註細胞類型分布</div>\r
                <div class="chart-card-hint">Seurat &middot; Scanpy</div>\r
            </div>\r
            <div class="chart-card" onclick="openChartModal('sc2')">\r
                <div class="chart-card-num">⑪</div>\r
                <canvas id="mini-sc2" height="90"></canvas>\r
                <div class="chart-card-name">Circos Plot</div>\r
                <div class="chart-card-desc">結構變異 / 基因融合弧線圖，全基因組觀點</div>\r
                <div class="chart-card-hint">STAR-Fusion &middot; circos.js</div>\r
            </div>\r
        </div>\r
    </section>\r
\r
    <!-- ── Modal 覆蓋層 ── -->\r
    <div class="chart-modal-overlay" id="chartModal" onclick="closeChartModal(event)">\r
        <div class="chart-modal-box">\r
            <button class="chart-modal-close" onclick="closeChartModal()">&times;</button>\r
            <div id="modalBadge" class="modal-badge"></div>\r
            <h3 id="modalTitle"></h3>\r
            <div id="modalTool" class="modal-tool"></div>\r
            <div class="modal-canvas-wrap">\r
                <canvas id="modalCanvas" height="180"></canvas>\r
            </div>\r
            <div class="modal-body" id="modalBody"></div>\r
        </div>\r
    </div>\r
\r
    <!-- ════════ INTERACTIVE PLOTLY CHARTS ════════ -->\r
    <section class="section reveal" style="max-width:1000px;margin:0 auto 32px;">\r
        <h2>互動分析圖表</h2>\r
        <p style="color:var(--muted);font-size:0.88rem;margin-bottom:20px;">可拖曳選取、縮放、hover 查看數值</p>\r
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">\r
            <div>\r
                <h3 style="font-size:0.82rem;color:var(--teal);margin-bottom:8px;">Volcano Plot (DE Analysis)</h3>\r
                <div data-plotly="volcano" style="height:320px;background:var(--surface);border-radius:12px;border:1px solid var(--border);"></div>\r
            </div>\r
            <div>\r
                <h3 style="font-size:0.82rem;color:var(--orange);margin-bottom:8px;">Expression Heatmap</h3>\r
                <div data-plotly="heatmap" style="height:320px;background:var(--surface);border-radius:12px;border:1px solid var(--border);"></div>\r
            </div>\r
        </div>\r
    </section>\r
\r
    <hr class="divider">\r
    <div data-site-footer></div>\r
\r
    <!-- ── RAG Knowledge Search ── -->\r
    <section class="rag-section reveal">\r
        <div class="rag-section-label">Render API 動態連接</div>\r
        <h2 class="rag-section-title">NGS <span style="color:var(--teal)">知識庫搜尋</span></h2>\r
        <p class="rag-section-sub">\r
            透過後端 RAG（檢索增強）模型，從同步自 UniProt / PubMed 的知識庫中搜尋與 NGS 相關的蛋白質注釋與文獻片段。\r
        </p>\r
        <div class="rag-input-row">\r
            <input class="rag-input" id="ragInput" type="text"\r
                placeholder="輸入關鍵字，例如：variant calling, RNA sequencing, quality control…" maxlength="120">\r
            <button class="rag-btn" id="ragSearchBtn" onclick="doRagSearch()">🔍 搜尋</button>\r
        </div>\r
        <div class="rag-status" id="ragStatus"></div>\r
        <div class="rag-results" id="ragResults">\r
            <div class="rag-empty">輸入關鍵字後按搜尋，從知識庫取得相關文獻與注釋片段。</div>\r
        </div>\r
    </section>\r
\r
    <button class="scroll-top" aria-label="返回頂部">↑</button>\r
\r
    <script src="scripts/app-config.js"><\/script>\r
    <script src="scripts/ngs.js"><\/script>\r
\r
`;
  const headInline = "";
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "NGS 次世代定序 · 實驗設計", "description": "NGS 次世代定序互動工作站——實驗設計計算器、定序深度估算、QC 至功能分析完整流程展示。", "bodyPage": "ngs", "pageStyles": ["/styles/ngs.css"], "pageScripts": ["https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js", "/scripts/app-config.js", "/scripts/ngs.js"], "headInline": headInline }, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "Fragment", Fragment, {}, { "default": ($$result3) => renderTemplate`${unescapeHTML(bodyHtml)}` })} ` })}`;
}, "D:/project/astro/src/pages/ngs.astro", void 0);

const $$file = "D:/project/astro/src/pages/ngs.astro";
const $$url = "/ngs.html";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
    __proto__: null,
    default: $$Ngs,
    file: $$file,
    url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
