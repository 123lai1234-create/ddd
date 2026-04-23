let _portfolioApiBase = '';

function portfolioEscapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function portfolioFormatDateTime(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('zh-TW', {
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function portfolioSequencePreview(sequence) {
    const normalized = String(sequence || '').replace(/\s+/g, '').toUpperCase();
    if (!normalized) return '-';
    if (normalized.length <= 36) return normalized;
    return `${normalized.slice(0, 18)}...${normalized.slice(-12)}`;
}

function setPortfolioSequenceStatus(message, state = 'info') {
    const el = document.getElementById('portfolioSequenceStatus');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
}

function derivePortfolioApiCandidates() {
    if (typeof window.APP_CONFIG_UTILS?.deriveApiCandidates === 'function') {
        return window.APP_CONFIG_UTILS.deriveApiCandidates();
    }

    const configuredApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
        ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    return configuredApiBase ? [configuredApiBase] : [];
}

async function resolvePortfolioApiBase() {
    if (_portfolioApiBase) {
        return _portfolioApiBase;
    }

    if (typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function') {
        _portfolioApiBase = await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'index-live' });
        if (_portfolioApiBase) {
            ['portfolioApiBase', 'portfolioKnowledgeApiBase'].forEach((id) => {
                const label = document.getElementById(id);
                if (label) label.textContent = _portfolioApiBase;
            });
            return _portfolioApiBase;
        }
    }

    const candidates = derivePortfolioApiCandidates();
    for (const candidate of candidates) {
        try {
            const response = await fetch(`${candidate}/healthz`);
            if (!response.ok) continue;

            const data = await response.json().catch(() => null);
            if (data?.status === 'ok') {
                _portfolioApiBase = candidate;
                ['portfolioApiBase', 'portfolioKnowledgeApiBase'].forEach((id) => {
                    const label = document.getElementById(id);
                    if (label) label.textContent = candidate;
                });
                return _portfolioApiBase;
            }
        } catch (error) {
            continue;
        }
    }

    ['portfolioApiBase', 'portfolioKnowledgeApiBase'].forEach((id) => {
        const label = document.getElementById(id);
        if (label) label.textContent = 'unavailable';
    });
    return '';
}

async function portfolioApiJson(path, options) {
    const apiBase = await resolvePortfolioApiBase();
    if (!apiBase) {
        throw new Error('目前找不到可用的後端 API。');
    }

    const response = await fetch(`${apiBase}${path}`, options);
    if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `HTTP ${response.status}`);
    }
    return response.json();
}

function renderPortfolioSequenceList(containerId, records, sequenceType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(records) || !records.length) {
        container.innerHTML = '<div class="live-seq-empty">目前沒有資料。先到 gene_ai 頁同步公開資料到資料庫。</div>';
        return;
    }

    container.innerHTML = records.map((record) => {
        const unit = sequenceType === 'protein' ? 'aa' : 'nt';
        const tertiary = sequenceType === 'gene'
            ? `${Number(record.gcContent || 0).toFixed(1)}% GC`
            : portfolioEscapeHtml(record.queryTerm || 'protein search');
        const link = record.recordUrl
            ? `<a class="live-seq-link" href="${portfolioEscapeHtml(record.recordUrl)}" target="_blank" rel="noreferrer">來源</a>`
            : '<span></span>';

        return `<article class="live-seq-item">
            <div class="live-seq-item-head">
                <div>
                    <div class="live-seq-item-title">${portfolioEscapeHtml(record.displayName)}</div>
                    <div class="live-seq-item-sub">${portfolioEscapeHtml(record.organism)}</div>
                </div>
                <div class="live-seq-pill">${sequenceType.toUpperCase()}</div>
            </div>
            <div class="live-seq-preview">${portfolioEscapeHtml(portfolioSequencePreview(record.sequence))}</div>
            <div class="live-seq-item-meta">
                <span>${Number(record.sequenceLength || 0).toLocaleString()} ${unit}</span>
                <span>${tertiary}</span>
                <span>${portfolioEscapeHtml(record.sourceName || '')}</span>
                ${link}
            </div>
        </article>`;
    }).join('');
}

function renderPortfolioKnowledgeList(containerId, records, recordType) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!Array.isArray(records) || !records.length) {
        container.innerHTML = '<div class="live-seq-empty">目前沒有知識紀錄。可前往 gene_ai 頁同步 UniProt 與 PubMed 資料。</div>';
        return;
    }

    container.innerHTML = records.map((record) => {
        const chip = recordType === 'literature' ? 'PUBMED' : 'UNIPROT';
        const preview = String(record.summaryText || record.contentText || '').trim();
        const sourceLink = record.recordUrl
            ? `<a class="live-seq-link" href="${portfolioEscapeHtml(record.recordUrl)}" target="_blank" rel="noreferrer">來源</a>`
            : '<span></span>';

        return `<article class="live-seq-item">
            <div class="live-seq-item-head">
                <div>
                    <div class="live-seq-item-title">${portfolioEscapeHtml(record.title)}</div>
                    <div class="live-seq-item-sub">${portfolioEscapeHtml(record.sourceName || '-')} · ${portfolioEscapeHtml(record.sourceId || '-')}</div>
                </div>
                <div class="live-seq-pill">${chip}</div>
            </div>
            <div class="live-knowledge-preview">${portfolioEscapeHtml(preview || 'No summary available.')}</div>
            <div class="live-seq-item-meta">
                <span>${portfolioEscapeHtml(record.organism || record.publishedAt || '-')}</span>
                <span>${portfolioEscapeHtml(record.queryTerm || '-')}</span>
                ${sourceLink}
            </div>
        </article>`;
    }).join('');
}

function renderPortfolioRagPreview(documents) {
    const container = document.getElementById('portfolioRagFeed');
    if (!container) return;

    if (!Array.isArray(documents) || !documents.length) {
        container.innerHTML = '<div class="live-seq-empty">目前沒有 RAG 文件預覽。知識資料同步後就會在這裡看到 chunk 與 metadata。</div>';
        return;
    }

    container.innerHTML = documents.map((doc) => `<article class="live-rag-item">
        <div class="live-seq-item-head">
            <div>
                <div class="live-seq-item-title">${portfolioEscapeHtml(doc.title || doc.documentId)}</div>
                <div class="live-seq-item-sub">${portfolioEscapeHtml(doc.chunkId || '-')}</div>
            </div>
            <div class="live-seq-pill">${portfolioEscapeHtml(doc.embeddingHint || 'rag')}</div>
        </div>
        <div class="live-rag-text">${portfolioEscapeHtml(String(doc.text || '').trim() || 'No text available.')}</div>
        <div class="live-rag-meta">
            <span>${portfolioEscapeHtml(doc.metadata?.sourceName || '-')}</span>
            <span>${portfolioEscapeHtml(doc.metadata?.sourceId || '-')}</span>
            <span>${portfolioEscapeHtml(doc.metadata?.queryTerm || '-')}</span>
        </div>
    </article>`).join('');
}

async function loadPortfolioSequenceFeed() {
    setPortfolioSequenceStatus('正在載入 Render Postgres 的 sequence_library...', 'info');

    try {
        const [summary, proteinPayload, genePayload] = await Promise.all([
            portfolioApiJson('/api/sequences/summary'),
            portfolioApiJson('/api/sequences?sequence_type=protein&limit=3'),
            portfolioApiJson('/api/sequences?sequence_type=gene&limit=3')
        ]);

        document.getElementById('portfolioProteinCount').textContent = String(summary.proteinCount ?? 0);
        document.getElementById('portfolioGeneCount').textContent = String(summary.geneCount ?? 0);
        document.getElementById('portfolioLatestFetched').textContent = portfolioFormatDateTime(summary.latestFetchedAt);

        renderPortfolioSequenceList('portfolioProteinFeed', proteinPayload.records || [], 'protein');
        renderPortfolioSequenceList('portfolioGeneFeed', genePayload.records || [], 'gene');

        // Auto-sync if DB is empty
        const totalSeq = (summary.proteinCount ?? 0) + (summary.geneCount ?? 0);
        if (totalSeq === 0) {
            setPortfolioSequenceStatus('資料庫為空，正在自動同步 UniProt / Ensembl…', 'info');
            try {
                const syncSecret = window.APP_CONFIG_UTILS?.getSyncSecret?.() || '';
                await portfolioApiJson('/api/sequences/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(syncSecret ? { 'X-Sync-Secret': syncSecret } : {}) },
                    body: JSON.stringify({ protein_query: 'kinase', gene_symbols: ['TP53', 'BRCA1', 'EGFR'], species: 'homo_sapiens', limit: 4 }),
                });
                return loadPortfolioSequenceFeed(); // reload after sync
            } catch { /* sync failed — show empty state */ }
        }

        setPortfolioSequenceStatus('首頁已接上動態序列資料庫，顯示的是目前 DB 中最新快取。', 'success');
    } catch (error) {
        renderPortfolioSequenceList('portfolioProteinFeed', [], 'protein');
        renderPortfolioSequenceList('portfolioGeneFeed', [], 'gene');
        document.getElementById('portfolioProteinCount').textContent = '0';
        document.getElementById('portfolioGeneCount').textContent = '0';
        document.getElementById('portfolioLatestFetched').textContent = '-';
        setPortfolioSequenceStatus(`序列資料庫讀取失敗：${error.message}`, 'error');
    }
}

function setPortfolioKnowledgeStatus(message, state = 'info') {
    const statusEl = document.getElementById('portfolioKnowledgeStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state;
}

async function loadPortfolioKnowledgeFeed() {
    setPortfolioKnowledgeStatus('正在載入 Render Postgres 的 knowledge_library 與 RAG 預覽...', 'info');

    try {
        const [summary, annotationPayload, literaturePayload, ragPayload] = await Promise.all([
            portfolioApiJson('/api/knowledge/summary'),
            portfolioApiJson('/api/knowledge?record_type=protein_annotation&limit=2'),
            portfolioApiJson('/api/knowledge?record_type=literature&limit=2'),
            portfolioApiJson('/api/rag/documents?include_sequences=true&limit=3&chunk_size=680&chunk_overlap=100')
        ]);

        document.getElementById('portfolioKnowledgeProteinCount').textContent = String(summary.proteinAnnotationCount ?? 0);
        document.getElementById('portfolioKnowledgeLiteratureCount').textContent = String(summary.literatureCount ?? 0);
        document.getElementById('portfolioKnowledgeLatestFetched').textContent = portfolioFormatDateTime(summary.latestFetchedAt);

        renderPortfolioKnowledgeList('portfolioKnowledgeProteinFeed', annotationPayload.records || [], 'protein_annotation');
        renderPortfolioKnowledgeList('portfolioKnowledgeLiteratureFeed', literaturePayload.records || [], 'literature');
        renderPortfolioRagPreview(ragPayload.documents || []);

        // Auto-sync if DB is empty
        const totalKnow = (summary.proteinAnnotationCount ?? 0) + (summary.literatureCount ?? 0);
        if (totalKnow === 0) {
            setPortfolioKnowledgeStatus('知識庫為空，正在自動同步 UniProt / PubMed…', 'info');
            try {
                const syncSecret = window.APP_CONFIG_UTILS?.getSyncSecret?.() || '';
                await portfolioApiJson('/api/knowledge/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(syncSecret ? { 'X-Sync-Secret': syncSecret } : {}) },
                    body: JSON.stringify({ protein_query: 'kinase', literature_query: 'kinase AND cancer', limit: 4 }),
                });
                return loadPortfolioKnowledgeFeed(); // reload after sync
            } catch { /* sync failed — show empty state */ }
        }

        setPortfolioKnowledgeStatus('首頁已接上知識資料庫與 RAG 文件預覽。', 'success');
    } catch (error) {
        document.getElementById('portfolioKnowledgeProteinCount').textContent = '0';
        document.getElementById('portfolioKnowledgeLiteratureCount').textContent = '0';
        document.getElementById('portfolioKnowledgeLatestFetched').textContent = '-';
        renderPortfolioKnowledgeList('portfolioKnowledgeProteinFeed', [], 'protein_annotation');
        renderPortfolioKnowledgeList('portfolioKnowledgeLiteratureFeed', [], 'literature');
        renderPortfolioRagPreview([]);
        setPortfolioKnowledgeStatus(`知識資料庫讀取失敗：${error.message}`, 'error');
    }
}

function initPortfolioSequenceLive() {
    document.getElementById('portfolioSequenceRefresh')?.addEventListener('click', () => {
        loadPortfolioSequenceFeed();
    });
    loadPortfolioSequenceFeed();
}

function initPortfolioKnowledgeLive() {
    document.getElementById('portfolioKnowledgeRefresh')?.addEventListener('click', () => {
        loadPortfolioKnowledgeFeed();
    });
    loadPortfolioKnowledgeFeed();
}

// ── ESM-2 Similarity Demo ────────────────────────────────
const _ESM2_SPACE = 'https://donttalk123-web.hf.space';
const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY');

function esmValidate(seq) {
    const s = seq.toUpperCase().replace(/\s/g, '');
    if (!s) return { ok: false, msg: '序列不能為空' };
    if (s.length > 512) return { ok: false, msg: '序列太長（最多 512 個殘基）' };
    const bad = [...new Set([...s].filter(c => !VALID_AA.has(c)))];
    if (bad.length) return { ok: false, msg: `無效字元：${bad.join(', ')}` };
    return { ok: true, seq: s };
}

function esmSetResult(html) {
    const el = document.getElementById('esm-result');
    if (el) el.innerHTML = html;
}

async function runEsmSimilarity() {
    const btn = document.getElementById('esm-run-btn');
    const va = esmValidate(document.getElementById('esm-seq-a')?.value || '');
    const vb = esmValidate(document.getElementById('esm-seq-b')?.value || '');
    if (!va.ok) { esmSetResult(`<span style="color:var(--red)">${va.msg}（序列 A）</span>`); return; }
    if (!vb.ok) { esmSetResult(`<span style="color:var(--red)">${vb.msg}（序列 B）</span>`); return; }

    btn.disabled = true;
    btn.textContent = '計算中…';
    esmSetResult('<span style="color:var(--muted)">正在喚醒 HF Space，首次約需 30–60 秒…</span>');

    try {
        const resp = await fetch(`${_ESM2_SPACE}/similarity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sequence_a: va.seq, sequence_b: vb.seq }),
            signal: AbortSignal.timeout(120_000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const d = await resp.json();
        const score = d.cosine_similarity ?? 0;
        const pct = Math.round(score * 100);
        const color = score > 0.95 ? '#50c878' : score > 0.85 ? '#e8c060' : score > 0.70 ? '#e08840' : '#e05050';
        const barW = Math.max(0, Math.min(100, pct));
        esmSetResult(`
            <div style="padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                    <span style="color:var(--muted);font-size:.85rem">Cosine Similarity（ESM-2 embedding）</span>
                    <span style="font-size:1.2rem;font-weight:700;color:${color}">${score.toFixed(4)}</span>
                </div>
                <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;margin-bottom:8px">
                    <div style="height:100%;width:${barW}%;background:${color};transition:width .5s"></div>
                </div>
                <span style="font-size:.85rem;color:${color}">${d.interpretation || ''}</span>
                <div style="margin-top:12px;font-size:.8rem;color:var(--muted)">
                    序列 A：${va.seq.length} aa　序列 B：${vb.seq.length} aa　模型：ESM-2 8M
                </div>
            </div>`);
    } catch (e) {
        esmSetResult(`<span style="color:var(--red)">錯誤：${e.message}。HF Space 可能正在冷啟動，請稍候再試。</span>`);
    } finally {
        btn.disabled = false;
        btn.textContent = '計算相似度';
    }
}

function initEsmDemo() {
    document.getElementById('esm-run-btn')?.addEventListener('click', runEsmSimilarity);
    document.getElementById('esm-seq-a')?.addEventListener('keydown', e => { if (e.key === 'Enter') runEsmSimilarity(); });
    document.getElementById('esm-seq-b')?.addEventListener('keydown', e => { if (e.key === 'Enter') runEsmSimilarity(); });
}

window.addEventListener('DOMContentLoaded', () => {
    initPortfolioSequenceLive();
    initPortfolioKnowledgeLive();
    initEsmDemo();
});