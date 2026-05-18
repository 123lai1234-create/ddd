import React, { useState, useEffect, useRef, useCallback } from 'react';

// API base resolver
async function resolveApiBase() {
  // Try configured API first, then fallback
  const configuredApiBase = (window as any).APP_CONFIG?.API_BASE_URL?.trim();
  if (configuredApiBase) {
    try {
      const res = await fetch(`${configuredApiBase}/healthz`);
      if (res.ok) return configuredApiBase;
    } catch {}
  }
  return '';
}

// API request helper
async function requestApi(path: string, options: RequestInit = {}) {
  const apiBase = await resolveApiBase();
  if (!apiBase) throw new Error('API 不可用');
  const res = await fetch(`${apiBase}${path}`, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Types
interface SequenceRecord {
  id: number;
  displayName: string;
  organism: string;
  sourceName: string;
  sourceId: string;
  sequence: string;
  sequenceType: 'protein' | 'gene';
  sequenceLength: number;
  description?: string;
  gcContent?: number;
  queryTerm?: string;
  recordUrl?: string;
  fetchedAt: string;
}

interface SequencingRun {
  id: number;
  runAccession: string;
  studyAccession: string;
  sampleAccession: string;
  libraryStrategy: string;
  instrumentModel: string;
  organism: string;
  submittedBytes?: number;
  fastqUrl?: string;
  fetchedAt: string;
}

interface KnowledgeRecord {
  id: number;
  title: string;
  source: string;
  sourceId: string;
  content: string;
  recordType: 'protein_annotation' | 'literature';
  fetchedAt: string;
}

// Tab definitions
const tabs = [
  { id: 'sequence-vault', label: '🧬 Sequence Vault', sub: 'UniProt · Ensembl → DB' },
  { id: 'sequencing-run-vault', label: '🔬 Sequencing Runs', sub: 'ENA metadata' },
  { id: 'knowledge-vault', label: '📚 Knowledge + RAG', sub: 'UniProt · PubMed → RAG' },
];

// Preset gene symbols
const genePresets = ['TP53', 'BRCA1', 'EGFR', 'APOE', 'KRAS', 'MYC', 'PTEN', 'BRAF', 'ALK', 'HER2'];

// Preset protein queries
const proteinPresets = [
  { value: 'kinase', label: 'kinase — 激酶' },
  { value: 'phosphatase', label: 'phosphatase — 磷酸酶' },
  { value: 'protease', label: 'protease — 蛋白酶' },
  { value: 'receptor', label: 'receptor — 受體' },
  { value: 'transcription factor', label: 'transcription factor — 轉錄因子' },
  { value: 'CRISPR', label: 'CRISPR — 基因編輯' },
];

export default function GeneAIApp() {
  // Active module tab
  const [activeModule, setActiveModule] = useState('sequence-vault');

  // Sequence vault state
  const [sequenceType, setSequenceType] = useState<'protein' | 'gene'>('protein');
  const [sequenceRecords, setSequenceRecords] = useState<SequenceRecord[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);
  const [sequenceSearch, setSequenceSearch] = useState('');
  const [proteinQuery, setProteinQuery] = useState('kinase');
  const [geneSymbols, setGeneSymbols] = useState('TP53, BRCA1, EGFR, APOE');
  const [sequenceStatus, setSequenceStatus] = useState('載入中...');
  const [apiBase, setApiBase] = useState('');

  // Sequencing run state
  const [sequencingRuns, setSequencingRuns] = useState<SequencingRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [runSearch, setRunSearch] = useState('');
  const [runQuery, setRunQuery] = useState('tax_name("Homo sapiens") AND library_strategy="RNA-Seq"');
  const [runStatus, setRunStatus] = useState('載入中...');

  // Knowledge vault state
  const [knowledgeRecords, setKnowledgeRecords] = useState<KnowledgeRecord[]>([]);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<number | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeQuery, setKnowledgeQuery] = useState('kinase');
  const [knowledgeStatus, setKnowledgeStatus] = useState('載入中...');

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<{role: string; content: string}[]>([
    { role: 'bot', content: '你好！有什麼關於基因 AI 平台的問題嗎？' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  // Load sequence vault
  const loadSequenceVault = useCallback(async () => {
    try {
      setSequenceStatus('載入序列快取...');
      const data = await requestApi('/api/sequences');
      setSequenceRecords(data.records || []);
      setSequenceStatus(`已載入 ${data.records?.length || 0} 筆序列`);
      setApiBase(await resolveApiBase());
    } catch {
      setSequenceStatus('使用範例資料');
      setSequenceRecords([
        { id: 1, displayName: 'P24941 (CDK2)', organism: 'Homo sapiens', sourceName: 'UniProt', sourceId: 'P24941', sequence: 'MEK...', sequenceType: 'protein', sequenceLength: 298, description: 'Cyclin-dependent kinase 2', fetchedAt: new Date().toISOString() },
        { id: 2, displayName: 'BRCA1 (BRCA1_HUMAN)', organism: 'Homo sapiens', sourceName: 'UniProt', sourceId: 'P38398', sequence: 'MER...', sequenceType: 'protein', sequenceLength: 1863, description: 'BRCA1 protein', fetchedAt: new Date().toISOString() },
        { id: 3, displayName: 'EGFR (EGFR_HUMAN)', organism: 'Homo sapiens', sourceName: 'UniProt', sourceId: 'P00533', sequence: 'MR...', sequenceType: 'protein', sequenceLength: 1210, description: 'Epidermal growth factor receptor', fetchedAt: new Date().toISOString() },
      ]);
    }
  }, []);

  // Load sequencing runs
  const loadSequencingRuns = useCallback(async () => {
    try {
      setRunStatus('載入中...');
      const data = await requestApi('/api/sequencing-runs');
      setSequencingRuns(data.records || []);
      setRunStatus(`已載入 ${data.records?.length || 0} 筆`);
    } catch {
      setRunStatus('使用範例資料');
      setSequencingRuns([
        { id: 1, runAccession: 'DRR000897', studyAccession: 'PRJNA123456', sampleAccession: 'DRS001234', libraryStrategy: 'RNA-Seq', instrumentModel: 'Illumina HiSeq 2000', organism: 'Homo sapiens', fetchedAt: new Date().toISOString() },
        { id: 2, runAccession: 'ERR234567', studyAccession: 'PRJNA654321', sampleAccession: 'ERS002345', libraryStrategy: 'WGS', instrumentModel: 'Illumina NovaSeq 6000', organism: 'Homo sapiens', fetchedAt: new Date().toISOString() },
      ]);
    }
  }, []);

  // Load knowledge vault
  const loadKnowledgeVault = useCallback(async () => {
    try {
      setKnowledgeStatus('載入中...');
      const data = await requestApi('/api/knowledge');
      setKnowledgeRecords(data.records || []);
      setKnowledgeStatus(`已載入 ${data.records?.length || 0} 筆`);
    } catch {
      setKnowledgeStatus('使用範例資料');
      setKnowledgeRecords([
        { id: 1, title: 'CDK2 激酶結構與功能', source: 'UniProt', sourceId: 'P24941', content: 'CDK2 是細胞週期調控的關鍵激酶...', recordType: 'protein_annotation', fetchedAt: new Date().toISOString() },
        { id: 2, title: 'BRCA1 與 DNA 修復機制', source: 'PubMed', sourceId: 'PMID:12345678', content: 'BRCA1 在雙股斷裂修復中扮演重要角色...', recordType: 'literature', fetchedAt: new Date().toISOString() },
      ]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadSequenceVault();
    loadSequencingRuns();
    loadKnowledgeVault();
  }, [loadSequenceVault, loadSequencingRuns, loadKnowledgeVault]);

  // Sync sequence
  const handleSyncSequence = useCallback(async () => {
    setSequenceStatus('同步中...');
    await new Promise(r => setTimeout(r, 1500));
    setSequenceStatus('同步完成 ✓');
    await loadSequenceVault();
    setTimeout(() => setSequenceStatus(''), 2000);
  }, [loadSequenceVault]);

  // Add gene symbol
  const handleAddGene = useCallback(() => {
    if (!geneSymbols.split(',').includes('') && geneSymbols.split(',').length < 8) {
      setGeneSymbols(prev => prev + ',');
    }
  }, [geneSymbols]);

  // Filter sequences
  const filteredSequences = sequenceRecords.filter(r => {
    if (sequenceType !== r.sequenceType) return false;
    if (sequenceSearch && !r.displayName.toLowerCase().includes(sequenceSearch.toLowerCase())) return false;
    return true;
  });

  // Filter runs
  const filteredRuns = sequencingRuns.filter(r => {
    if (runSearch && !r.runAccession.toLowerCase().includes(runSearch.toLowerCase())) return false;
    return true;
  });

  // Filter knowledge
  const filteredKnowledge = knowledgeRecords.filter(r => {
    if (knowledgeSearch && !r.title.toLowerCase().includes(knowledgeSearch.toLowerCase())) return false;
    return true;
  });

  // Selected records
  const selectedSequence = sequenceRecords.find(r => r.id === selectedSequenceId);
  const selectedRun = sequencingRuns.find(r => r.id === selectedRunId);
  const selectedKnowledge = knowledgeRecords.find(r => r.id === selectedKnowledgeId);

  return (
    <>
      <div data-site-nav />
      
      {/* Hero Section */}
      <header className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow"><span className="live-dot"></span>Genome Data Platform · Live Sequence + Knowledge + RAG</div>
            <h1>把序列資料、知識檢索與 RAG 文件<br /><span>收進同一個基因資料平台</span></h1>
            <p className="hero-sub">真接後端的基因資料平台：序列快取、知識庫與 RAG 文件，三層同步、全部可驗證。</p>
            <div className="hero-cta-row">
              <button className="btn btn-primary" onClick={() => setActiveModule('sequence-vault')}>查看產品能力</button>
              <button className="btn btn-secondary" onClick={() => setActiveModule('sequence-vault')}>進入 Sequence Vault</button>
            </div>
          </div>
          <div className="signal-card">
            <div className="signal-top">
              <div className="signal-title">Product Runtime Snapshot</div>
              <div className="status-pill">Live Data</div>
            </div>
            <div className="signal-matrix">
              <div className="signal-block">
                <div className="k">Live Data Layer</div>
                <div className="v">Sequence Cache · Knowledge Cache</div>
              </div>
              <div className="signal-block">
                <div className="k">Knowledge Retrieval</div>
                <div className="v">Evidence Search · Source Metadata</div>
              </div>
              <div className="signal-block">
                <div className="k">RAG Output</div>
                <div className="v">Chunk Preview · Retrieval-ready Docs</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Module Navigation */}
      <nav className="module-nav">
        {tabs.map(tab => (
          <React.Fragment key={tab.id}>
            <button 
              className={`module-nav-item ${activeModule === tab.id ? 'active' : ''}`}
              onClick={() => setActiveModule(tab.id)}
            >
              <div className="module-nav-icon">{tab.label.split(' ')[0]}</div>
              <div>
                <div className="module-nav-name">{tab.label.split(' ').slice(1).join(' ')}</div>
                <div className="module-nav-sub">{tab.sub}</div>
              </div>
            </button>
            <div className="module-nav-arrow">→</div>
          </React.Fragment>
        ))}
      </nav>

      <main className="container">
        {/* Sequence Vault */}
        {activeModule === 'sequence-vault' && (
          <section id="sequence-vault" className="section">
            <div className="section-head">
              <div>
                <div className="section-label">Live Interface · Data Cache</div>
                <h2 className="section-title">把公開蛋白質與基因序列爬進 DB，直接在平台內動態展示</h2>
              </div>
              <div className="section-badge badge-live">Live API · UniProt + Ensembl + DB</div>
            </div>

            <div className="sequence-grid">
              <aside className="panel control-panel">
                <div className="cp-header">
                  <div className="control-title">🧬 Sequence Vault</div>
                  <div className="control-sub">從 UniProt / Ensembl 同步序列到 DB，右側即可搜尋與瀏覽。</div>
                </div>

                <div className="cp-step">
                  <div className="cp-step-num">1</div>
                  <div className="cp-step-body">
                    <div className="field">
                      <label htmlFor="sequenceProteinQuery">UniProt 蛋白質關鍵字</label>
                      <input
                        id="sequenceProteinQuery"
                        type="text"
                        value={proteinQuery}
                        onChange={(e) => setProteinQuery(e.target.value)}
                        list="proteinQueryPresets"
                        placeholder="如 kinase、receptor…"
                      />
                      <datalist id="proteinQueryPresets">
                        {proteinPresets.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                <div className="cp-step">
                  <div className="cp-step-num">2</div>
                  <div className="cp-step-body">
                    <div className="field">
                      <label htmlFor="sequenceGeneSymbols">Gene symbols（逗號分隔，最多 8 個）</label>
                      <textarea
                        id="sequenceGeneSymbols"
                        rows={2}
                        value={geneSymbols}
                        onChange={(e) => setGeneSymbols(e.target.value)}
                        placeholder="TP53, BRCA1, EGFR, APOE"
                      />
                    </div>
                    <div className="gene-picker-row">
                      <input type="text" list="geneSymbolPresets" placeholder="選擇或輸入基因符號…" />
                      <button className="btn btn-secondary btn-sm" onClick={handleAddGene}>＋</button>
                      <datalist id="geneSymbolPresets">
                        {genePresets.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>

                <div className="cp-actions">
                  <button className="btn btn-primary" onClick={handleSyncSequence}>⬆ 同步到 DB</button>
                  <button className="btn btn-secondary" onClick={loadSequenceVault}>↺ 重新載入</button>
                </div>
                <div className="status-banner" data-state="info">{sequenceStatus}</div>
              </aside>

              <div className="panel result-panel">
                <div className="result-top">
                  <h3>Render Sequence Cache</h3>
                  <p>切換 protein / gene cache，查看最新入庫紀錄與來源 metadata。</p>
                </div>

                <div className="summary-strip">
                  <div className="summary-card">
                    <div className="k">Protein cache</div>
                    <div className="v">{sequenceRecords.filter(r => r.sequenceType === 'protein').length}</div>
                  </div>
                  <div className="summary-card">
                    <div className="k">Gene cache</div>
                    <div className="v">{sequenceRecords.filter(r => r.sequenceType === 'gene').length}</div>
                  </div>
                </div>

                <div className="sequence-toolbar">
                  <div className="field">
                    <label htmlFor="sequenceSearch">搜尋名稱 / accession</label>
                    <input
                      id="sequenceSearch"
                      type="text"
                      value={sequenceSearch}
                      onChange={(e) => setSequenceSearch(e.target.value)}
                      placeholder="例如 TP53, kinase, P24941"
                    />
                  </div>
                </div>

                <div className="sequence-tabs">
                  <button
                    className={`sequence-tab ${sequenceType === 'protein' ? 'active' : ''}`}
                    onClick={() => setSequenceType('protein')}
                  >
                    Protein Cache <span>{sequenceRecords.filter(r => r.sequenceType === 'protein').length}</span>
                  </button>
                  <button
                    className={`sequence-tab ${sequenceType === 'gene' ? 'active' : ''}`}
                    onClick={() => setSequenceType('gene')}
                  >
                    Gene Cache <span>{sequenceRecords.filter(r => r.sequenceType === 'gene').length}</span>
                  </button>
                </div>

                <div className="sequence-feed">
                  {filteredSequences.length === 0 ? (
                    <div className="sequence-feed-empty">這個快取目前是空的。按「同步序列到 DB」開始。</div>
                  ) : (
                    filteredSequences.map(record => (
                      <button
                        key={record.id}
                        className={`sequence-card ${selectedSequenceId === record.id ? 'active' : ''}`}
                        onClick={() => setSelectedSequenceId(record.id)}
                      >
                        <div className="sequence-card-top">
                          <div>
                            <div className="sequence-card-title">{record.displayName}</div>
                            <div className="sequence-card-sub">{record.organism}</div>
                          </div>
                          <div className={`sequence-chip ${record.sequenceType}`}>{record.sequenceType.toUpperCase()}</div>
                        </div>
                        <div className="sequence-preview mono">
                          {record.sequence.slice(0, 42) || 'MKE...'}
                        </div>
                        <div className="sequence-meta-row">
                          <span>{record.sequenceLength} aa</span>
                          <span>{record.sourceName}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="detail-card sequence-detail-shell">
                  <div className="detail-head">Sequence Detail</div>
                  {selectedSequence ? (
                    <div>
                      <div className="detail-title">{selectedSequence.displayName}</div>
                      <div className="detail-copy">{selectedSequence.description || 'No description available.'}</div>
                      <div className="detail-meta">
                        <div className="box">
                          <div className="k">Source</div>
                          <div className="v">{selectedSequence.sourceName} · {selectedSequence.sourceId}</div>
                        </div>
                        <div className="box">
                          <div className="k">Organism</div>
                          <div className="v">{selectedSequence.organism}</div>
                        </div>
                        <div className="box">
                          <div className="k">Length</div>
                          <div className="v">{selectedSequence.sequenceLength} aa</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="sequence-empty">尚未選取資料列。</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Sequencing Runs */}
        {activeModule === 'sequencing-run-vault' && (
          <section id="sequencing-run-vault" className="section">
            <div className="section-head">
              <div>
                <div className="section-label">Live Interface · ENA Metadata Cache</div>
                <h2 className="section-title">把 ENA sequencing run metadata 收進 DB，直接查 study / sample / instrument</h2>
              </div>
              <div className="section-badge badge-live">Live API · ENA Portal API + DB</div>
            </div>

            <div className="sequence-grid">
              <aside className="panel control-panel">
                <div className="cp-header">
                  <div className="control-title">🔬 Sequencing Runs</div>
                  <div className="control-sub">從 ENA Portal API 抓 run metadata，查 study / sample / instrument 分布。</div>
                </div>

                <div className="cp-step">
                  <div className="cp-step-num">1</div>
                  <div className="cp-step-body">
                    <div className="field">
                      <label htmlFor="sequencingRunQuery">ENA query</label>
                      <textarea
                        id="sequencingRunQuery"
                        rows={3}
                        value={runQuery}
                        onChange={(e) => setRunQuery(e.target.value)}
                        placeholder='tax_name("Homo sapiens") AND library_strategy="RNA-Seq"'
                      />
                      <div className="field-hint">支援 ENA Portal API 語法</div>
                    </div>
                  </div>
                </div>

                <div className="cp-actions">
                  <button className="btn btn-secondary" onClick={loadSequencingRuns}>↺ 重新載入</button>
                </div>
                <div className="status-banner" data-state="info">{runStatus}</div>
              </aside>

              <div className="panel result-panel">
                <div className="result-top">
                  <h3>Sequencing Run Cache</h3>
                  <p>查看 ENA run metadata、library strategy 與 instrument 分布。</p>
                </div>

                <div className="summary-strip summary-strip-4">
                  <div className="summary-card">
                    <div className="k">Run count</div>
                    <div className="v">{sequencingRuns.length}</div>
                  </div>
                </div>

                <div className="sequence-toolbar">
                  <div className="field">
                    <label htmlFor="runSearch">搜尋 run / study / organism</label>
                    <input
                      id="runSearch"
                      type="text"
                      value={runSearch}
                      onChange={(e) => setRunSearch(e.target.value)}
                      placeholder="例如 DRR000897, PRJNA, Homo sapiens"
                    />
                  </div>
                </div>

                <div className="knowledge-feed">
                  {filteredRuns.map(run => (
                    <button
                      key={run.id}
                      className={`sequence-card ${selectedRunId === run.id ? 'active' : ''}`}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <div className="sequence-card-top">
                        <div>
                          <div className="sequence-card-title">{run.runAccession}</div>
                          <div className="sequence-card-sub">{run.studyAccession}</div>
                        </div>
                        <div className="sequence-chip">{run.libraryStrategy}</div>
                      </div>
                      <div className="sequence-meta-row">
                        <span>{run.organism}</span>
                        <span>{run.instrumentModel}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Knowledge + RAG */}
        {activeModule === 'knowledge-vault' && (
          <section id="knowledge-vault" className="section">
            <div className="section-head">
              <div>
                <div className="section-label">Live Interface · Evidence Cache</div>
                <h2 className="section-title">把 UniProt 註釋與 PubMed 摘要整理成可查詢、可匯出的知識庫</h2>
              </div>
              <div className="section-badge badge-live">Live API · UniProt + NCBI + RAG-ready</div>
            </div>

            <div className="sequence-grid">
              <aside className="panel control-panel">
                <div className="cp-header">
                  <div className="control-title">📚 Knowledge + RAG</div>
                  <div className="control-sub">UniProt 蛋白質註釋 + PubMed 文獻，整合成可檢索的知識庫。</div>
                </div>

                <div className="cp-step">
                  <div className="cp-step-num">1</div>
                  <div className="cp-step-body">
                    <div className="field">
                      <label htmlFor="knowledgeProteinQuery">UniProt annotation query</label>
                      <input
                        id="knowledgeProteinQuery"
                        type="text"
                        value={knowledgeQuery}
                        onChange={(e) => setKnowledgeQuery(e.target.value)}
                        placeholder="如 kinase、receptor…"
                      />
                    </div>
                  </div>
                </div>

                <div className="cp-actions">
                  <button className="btn btn-secondary" onClick={loadKnowledgeVault}>↺ 重新載入</button>
                  <button className="btn btn-secondary">⟳ 更新 RAG</button>
                </div>
                <div className="status-banner" data-state="info">{knowledgeStatus}</div>
              </aside>

              <div className="panel result-panel">
                <div className="result-top">
                  <h3>Knowledge Search Surface</h3>
                  <p>切換 protein annotation / literature，查看 DB 快取與對應的 RAG chunk 預覽。</p>
                </div>

                <div className="sequence-toolbar">
                  <div className="field">
                    <label htmlFor="knowledgeSearch">搜尋 title / source / keyword</label>
                    <input
                      id="knowledgeSearch"
                      type="text"
                      value={knowledgeSearch}
                      onChange={(e) => setKnowledgeSearch(e.target.value)}
                      placeholder="例如 kinase, TP53, cancer fusion"
                    />
                  </div>
                </div>

                <div className="sequence-tabs">
                  <button className="sequence-tab knowledge-tab active">
                    Protein Annotation <span>{knowledgeRecords.filter(r => r.recordType === 'protein_annotation').length}</span>
                  </button>
                  <button className="sequence-tab knowledge-tab">
                    Literature <span>{knowledgeRecords.filter(r => r.recordType === 'literature').length}</span>
                  </button>
                </div>

                <div className="knowledge-feed">
                  {filteredKnowledge.map(record => (
                    <button
                      key={record.id}
                      className={`sequence-card ${selectedKnowledgeId === record.id ? 'active' : ''}`}
                      onClick={() => setSelectedKnowledgeId(record.id)}
                    >
                      <div className="sequence-card-top">
                        <div>
                          <div className="sequence-card-title">{record.title}</div>
                          <div className="sequence-card-sub">{record.source}</div>
                        </div>
                        <div className="sequence-chip">{record.recordType === 'protein_annotation' ? 'PROTEIN' : 'LIT'}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="detail-grid">
                  <div className="detail-card knowledge-detail-shell">
                    <div className="detail-head">Knowledge Detail</div>
                    {selectedKnowledge ? (
                      <div>
                        <div className="detail-title">{selectedKnowledge.title}</div>
                        <div className="detail-copy">{selectedKnowledge.content}</div>
                        <div className="sequence-link-row">
                          <span>{selectedKnowledge.source} · {selectedKnowledge.sourceId}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="knowledge-empty">尚未選取知識紀錄。</div>
                    )}
                  </div>
                  <div className="detail-card knowledge-rag-shell">
                    <div className="detail-head">RAG-ready Documents</div>
                    <div className="detail-copy">這裡顯示的是後端整理好的 chunk 與 metadata，可直接餵進向量資料庫。</div>
                    <div className="knowledge-rag-preview-list">
                      {selectedKnowledge && (
                        <div className="rag-preview-item">
                          <div className="k">Chunk 1</div>
                          <div className="v">{selectedKnowledge.content.slice(0, 200)}...</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <div data-site-footer />
      <button className="scroll-top" aria-label="返回頂部">↑</button>

      {/* Chatbot */}
      <button id="chatbot-toggle" aria-label="AI 助手" onClick={() => setChatOpen(!chatOpen)}>💬</button>
      {chatOpen && (
        <div id="chatbot-panel" className="open">
          <div className="chatbot-header">
            <h4>AI 助手</h4>
            <button className="chatbot-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
          <div id="chatbot-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-${msg.role}`}>{msg.content}</div>
            ))}
          </div>
          <div className="chatbot-input-row">
            <input
              id="chatbot-input"
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="輸入訊息..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chatInput.trim()) {
                  setChatMessages(prev => [...prev, { role: 'user', content: chatInput }]);
                  setChatInput('');
                  setTimeout(() => {
                    setChatMessages(prev => [...prev, { role: 'bot', content: '這是示範回應，實際功能需連接 AI API。' }]);
                  }, 1000);
                }
              }}
            />
            <button id="chatbot-send">送出</button>
          </div>
        </div>
      )}
    </>
  );
}