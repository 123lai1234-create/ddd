const objectivePresets = {
    upreg: {
        label: 'Promoter amplification',
        motifs: ['GC-box', 'CCAAT', 'TATA-lite', 'Kozak-tuned', 'CpG-balance'],
        bases: { expression: 86, specificity: 70, synthesis: 76, safety: 72 },
        narrative: '偏向提升整體訊號，但要避免把表達噪音一起放大。'
    },
    specific: {
        label: 'Tissue-specific control',
        motifs: ['Insulator edge', 'Cell-state motif', 'Low-leakage core', 'Enhancer spacing', 'Context gate'],
        bases: { expression: 74, specificity: 88, synthesis: 72, safety: 80 },
        narrative: '將 focus 放在 cell-context specificity，而不是追求單純最大表達。'
    },
    edit_ready: {
        label: 'Edit-window accessibility',
        motifs: ['Open-chromatin bias', 'PAM-friendly flank', 'Spacer-safe zone', 'Low-repeat patch', 'Repair-aware core'],
        bases: { expression: 70, specificity: 82, synthesis: 74, safety: 78 },
        narrative: '優先保留可編輯窗口與 genomic context 的穩定性。'
    },
    manufacture: {
        label: 'Manufacturability-first',
        motifs: ['GC flattening', 'Repeat suppression', 'Short-synthesis block', 'Low-hairpin', 'Assembly-safe'],
        bases: { expression: 68, specificity: 74, synthesis: 92, safety: 88 },
        narrative: '這類候選分數不一定最亮眼，但通常最適合進入製造與 assay。'
    }
};

const organismPresets = {
    human: { gcShift: 6, safetyShift: 4, label: 'human regulatory context' },
    mouse: { gcShift: 2, safetyShift: 1, label: 'mouse discovery panel' },
    ecoli: { gcShift: -5, safetyShift: -2, label: 'bacterial screen' }
};

let designRadarChart = null;
let guideScatterChart = null;
let variantImpactChart = null;
let currentCandidates = [];
let resolvedSequenceApiBase = '';
const sequenceVaultState = {
    activeType: 'protein',
    selectedId: null,
    records: {
        protein: [],
        gene: []
    },
    summary: {
        proteinCount: 0,
        geneCount: 0,
        latestFetchedAt: null
    }
};
const sequencingRunState = {
    selectedId: null,
    records: [],
    summary: {
        runCount: 0,
        organismCount: 0,
        studyCount: 0,
        latestFetchedAt: null
    }
};
const knowledgeVaultState = {
    activeType: 'protein_annotation',
    selectedId: null,
    records: {
        protein_annotation: [],
        literature: []
    },
    summary: {
        proteinAnnotationCount: 0,
        literatureCount: 0,
        latestFetchedAt: null
    },
    ragDocuments: [],
    ragMeta: {
        totalChunks: 0,
        knowledgeRecords: 0,
        sequenceRecords: 0,
        includeSequences: true
    }
};

function safeRenderChart(renderFn) {
    try {
        return renderFn();
    } catch (error) {
        console.error('[gene_ai] chart render failed:', error);
        return null;
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
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

function formatCompactNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString('zh-TW');
}

function formatBytes(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = parsed;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }
    const digits = size >= 100 || index === 0 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(digits)} ${units[index]}`;
}

function setSequenceStatus(message, state = 'info') {
    const statusEl = document.getElementById('sequenceStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state;
}

function setSharedApiLabels(value) {
    ['sequenceApiLabel', 'sequencingRunApiLabel', 'knowledgeApiLabel'].forEach((id) => {
        const label = document.getElementById(id);
        if (label) {
            label.textContent = value;
        }
    });
}

function deriveSequenceApiCandidates() {
    if (typeof window.APP_CONFIG_UTILS?.deriveApiCandidates === 'function') {
        return window.APP_CONFIG_UTILS.deriveApiCandidates();
    }

    const configuredApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
        ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    return configuredApiBase ? [configuredApiBase] : [];
}

async function resolveSequenceApiBase() {
    if (resolvedSequenceApiBase) {
        return resolvedSequenceApiBase;
    }

    if (typeof window.APP_CONFIG_UTILS?.resolveApiBase === 'function') {
        resolvedSequenceApiBase = await window.APP_CONFIG_UTILS.resolveApiBase({ cacheKey: 'gene-ai' });
        if (resolvedSequenceApiBase) {
            setSharedApiLabels(resolvedSequenceApiBase);
            return resolvedSequenceApiBase;
        }
    }

    const candidates = deriveSequenceApiCandidates();
    for (const candidate of candidates) {
        try {
            const response = await fetch(`${candidate}/healthz`);
            if (!response.ok) {
                continue;
            }

            const data = await response.json().catch(() => null);
            if (data?.status === 'ok') {
                resolvedSequenceApiBase = candidate;
                setSharedApiLabels(candidate);
                return resolvedSequenceApiBase;
            }
        } catch (error) {
            continue;
        }
    }

    setSharedApiLabels('unavailable');
    return '';
}

async function requestSequenceApi(path, options = {}) {
    const apiBase = await resolveSequenceApiBase();
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

async function requestKnowledgeApi(path, options = {}) {
    return requestSequenceApi(path, options);
}

function formatSequencePreview(sequence) {
    const normalized = String(sequence || '').replace(/\s+/g, '').toUpperCase();
    if (!normalized) return '-';
    if (normalized.length <= 42) return normalized;
    return `${normalized.slice(0, 24)}...${normalized.slice(-12)}`;
}

function formatSequenceBlock(sequence) {
    const normalized = String(sequence || '').replace(/\s+/g, '').toUpperCase();
    if (!normalized) return '-';
    const truncated = normalized.length > 720
        ? `${normalized.slice(0, 360)}...${normalized.slice(-240)}`
        : normalized;
    const grouped = truncated.match(/.{1,60}/g) || [truncated];
    return escapeHtml(grouped.join('\n')).replace(/\n/g, '<br>');
}

function renderSequenceFilterOptions() {
    const select = document.getElementById('sequenceOrganismFilter');
    if (!select) return;

    const currentValue = select.value;
    const records = sequenceVaultState.records[sequenceVaultState.activeType] || [];
    const organisms = [...new Set(records.map((record) => String(record.organism || '').trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));

    select.innerHTML = `
                <option value="">全部物種</option>
                ${organisms.map((organism) => `<option value="${escapeHtml(organism)}">${escapeHtml(organism)}</option>`).join('')}
            `;

    select.value = organisms.includes(currentValue) ? currentValue : '';
}

function getVisibleSequenceRecords() {
    const records = sequenceVaultState.records[sequenceVaultState.activeType] || [];
    const searchText = String(document.getElementById('sequenceSearch')?.value || '').trim().toLowerCase();
    const organismFilter = String(document.getElementById('sequenceOrganismFilter')?.value || '').trim().toLowerCase();

    return records.filter((record) => {
        const matchesOrganism = !organismFilter || String(record.organism || '').toLowerCase() === organismFilter;
        if (!matchesOrganism) {
            return false;
        }

        if (!searchText) {
            return true;
        }

        const haystack = [
            record.displayName,
            record.organism,
            record.sourceId,
            record.sourceName,
            record.queryTerm,
            record.description,
        ].join(' ').toLowerCase();

        return haystack.includes(searchText);
    });
}

function updateSequenceFilterMeta(visibleCount, totalCount) {
    const metaEl = document.getElementById('sequenceFilterMeta');
    if (!metaEl) return;
    metaEl.textContent = `顯示 ${visibleCount} / ${totalCount} 筆`;
}

function renderSequenceSummary() {
    const summaryEl = document.getElementById('sequenceSummary');
    if (!summaryEl) return;

    const summary = sequenceVaultState.summary;
    summaryEl.innerHTML = `
                <div class="summary-card"><div class="k">Protein cache</div><div class="v">${summary.proteinCount}</div></div>
                <div class="summary-card"><div class="k">Gene cache</div><div class="v">${summary.geneCount}</div></div>
                <div class="summary-card"><div class="k">Latest sync</div><div class="v">${escapeHtml(formatDateTime(summary.latestFetchedAt))}</div></div>
            `;
}

function renderSequenceTabs() {
    document.querySelectorAll('.sequence-tab[data-sequence-type]').forEach((button) => {
        const type = button.dataset.sequenceType;
        const count = sequenceVaultState.records[type]?.length || 0;
        const label = type === 'protein' ? 'Protein Cache' : 'Gene Cache';
        button.innerHTML = `${label} <span>${count}</span>`;
        button.classList.toggle('active', type === sequenceVaultState.activeType);
    });
}

function renderSequenceDetail(record) {
    const detailEl = document.getElementById('sequenceDetail');
    if (!detailEl) return;

    if (!record) {
        detailEl.innerHTML = '<div class="sequence-empty">目前沒有可顯示的序列資料。可以先同步 UniProt / Ensembl，再回到這裡檢視 DB 快取。</div>';
        return;
    }

    const sequenceUnit = record.sequenceType === 'protein' ? 'aa' : 'nt';
    const compositionLabel = record.sequenceType === 'gene'
        ? `${Number(record.gcContent || 0).toFixed(2)}% GC`
        : escapeHtml(record.queryTerm || 'protein search');
    const compositionKey = record.sequenceType === 'gene' ? 'GC content' : 'Query term';
    const sourceLink = record.recordUrl
        ? `<a class="sequence-source-link" href="${escapeHtml(record.recordUrl)}" target="_blank" rel="noreferrer">查看來源紀錄</a>`
        : '<span></span>';

    detailEl.innerHTML = `
                <div class="detail-title">${escapeHtml(record.displayName)}</div>
                <div class="detail-copy">${escapeHtml(record.description || 'No description available.')}</div>
                <div class="detail-meta">
                    <div class="box"><div class="k">Source</div><div class="v">${escapeHtml(record.sourceName)} · ${escapeHtml(record.sourceId)}</div></div>
                    <div class="box"><div class="k">Organism</div><div class="v">${escapeHtml(record.organism)}</div></div>
                    <div class="box"><div class="k">Length</div><div class="v">${Number(record.sequenceLength || 0).toLocaleString()} ${sequenceUnit}</div></div>
                    <div class="box"><div class="k">${compositionKey}</div><div class="v">${compositionLabel}</div></div>
                </div>
                <div class="sequence-link-row">
                    ${sourceLink}
                    <span>寫入時間：${escapeHtml(formatDateTime(record.fetchedAt))}</span>
                </div>
                <div class="sequence-detail-seq mono">${formatSequenceBlock(record.sequence)}</div>
            `;
}

function renderSequenceFeed() {
    const feedEl = document.getElementById('sequenceFeed');
    if (!feedEl) return;

    const records = sequenceVaultState.records[sequenceVaultState.activeType] || [];
    const visibleRecords = getVisibleSequenceRecords();
    const deleteBtn = document.getElementById('sequenceDelete');
    updateSequenceFilterMeta(visibleRecords.length, records.length);

    if (!records.length) {
        feedEl.innerHTML = '<div class="sequence-feed-empty">這個快取目前是空的。先按「同步序列到 DB」，或讓頁面首次自動初始化。</div>';
        if (deleteBtn) deleteBtn.disabled = true;
        renderSequenceDetail(null);
        return;
    }

    if (!visibleRecords.length) {
        feedEl.innerHTML = '<div class="sequence-feed-empty">目前沒有符合搜尋或物種篩選的紀錄。調整條件後就會重新顯示。</div>';
        if (deleteBtn) deleteBtn.disabled = true;
        renderSequenceDetail(null);
        return;
    }

    const selectedRecord = visibleRecords.find((record) => record.id === sequenceVaultState.selectedId) || visibleRecords[0];
    sequenceVaultState.selectedId = selectedRecord.id;
    if (deleteBtn) deleteBtn.disabled = false;

    feedEl.innerHTML = visibleRecords.map((record) => {
        const activeClass = record.id === sequenceVaultState.selectedId ? 'active' : '';
        const sequenceUnit = record.sequenceType === 'protein' ? 'aa' : 'nt';
        const secondaryMetric = record.sequenceType === 'gene'
            ? `${Number(record.gcContent || 0).toFixed(1)}% GC`
            : escapeHtml(record.queryTerm || 'protein search');

        return `
                    <button class="sequence-card ${activeClass}" type="button" data-record-id="${record.id}">
                        <div class="sequence-card-top">
                            <div>
                                <div class="sequence-card-title">${escapeHtml(record.displayName)}</div>
                                <div class="sequence-card-sub">${escapeHtml(record.organism)}</div>
                            </div>
                            <div class="sequence-chip ${record.sequenceType}">${record.sequenceType.toUpperCase()}</div>
                        </div>
                        <div class="sequence-preview mono">${escapeHtml(formatSequencePreview(record.sequence))}</div>
                        <div class="sequence-meta-row">
                            <span>${Number(record.sequenceLength || 0).toLocaleString()} ${sequenceUnit}</span>
                            <span>${secondaryMetric}</span>
                            <span>${escapeHtml(record.sourceName)}</span>
                        </div>
                    </button>
                `;
    }).join('');

    feedEl.querySelectorAll('.sequence-card').forEach((button) => {
        button.addEventListener('click', () => {
            sequenceVaultState.selectedId = Number(button.dataset.recordId);
            renderSequenceFeed();
        });
    });

    renderSequenceDetail(selectedRecord);
}

function updateSequenceStateFromPayload(payload) {
    sequenceVaultState.records.protein = Array.isArray(payload.proteinRecords)
        ? payload.proteinRecords
        : Array.isArray(payload.records) && payload.sequenceType === 'protein'
            ? payload.records
            : sequenceVaultState.records.protein;

    sequenceVaultState.records.gene = Array.isArray(payload.geneRecords)
        ? payload.geneRecords
        : Array.isArray(payload.records) && payload.sequenceType === 'gene'
            ? payload.records
            : sequenceVaultState.records.gene;

    sequenceVaultState.summary = {
        proteinCount: Number(payload.proteinCount ?? sequenceVaultState.records.protein.length ?? 0),
        geneCount: Number(payload.geneCount ?? sequenceVaultState.records.gene.length ?? 0),
        latestFetchedAt: payload.latestFetchedAt ?? sequenceVaultState.summary.latestFetchedAt
    };
}

function sequenceSyncPayload() {
    const symbols = document.getElementById('sequenceGeneSymbols').value
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 8);

    return {
        protein_query: document.getElementById('sequenceProteinQuery').value.trim() || 'kinase',
        gene_symbols: symbols.length ? symbols : ['TP53', 'BRCA1', 'EGFR', 'APOE'],
        species: document.getElementById('sequenceSpecies').value,
        limit: Number(document.getElementById('sequenceLimit').value) || 4
    };
}

function setSequenceBusy(isBusy) {
    document.getElementById('sequenceSync').disabled = isBusy;
    document.getElementById('sequenceReload').disabled = isBusy;
    document.getElementById('sequenceDelete').disabled = isBusy || !sequenceVaultState.selectedId;
}

async function loadSequenceCache(autoSyncIfEmpty = true) {
    setSequenceBusy(true);
    setSequenceStatus('正在從 Render DB 讀取序列快取...', 'info');

    try {
        const [summary, proteinPayload, genePayload] = await Promise.all([
            requestSequenceApi('/api/sequences/summary'),
            requestSequenceApi('/api/sequences?sequence_type=protein&limit=20'),
            requestSequenceApi('/api/sequences?sequence_type=gene&limit=20')
        ]);

        updateSequenceStateFromPayload(summary);
        updateSequenceStateFromPayload({ ...proteinPayload, sequenceType: 'protein' });
        updateSequenceStateFromPayload({ ...genePayload, sequenceType: 'gene' });
        renderSequenceSummary();
        renderSequenceTabs();
        renderSequenceFilterOptions();
        renderSequenceFeed();

        const total = sequenceVaultState.records.protein.length + sequenceVaultState.records.gene.length;
        if (autoSyncIfEmpty && total === 0) {
            setSequenceStatus('DB 目前沒有序列資料，開始從 UniProt / Ensembl 初始化快取...', 'warning');
            await syncSequenceVault(true);
            return;
        }

        setSequenceStatus(`已載入 ${sequenceVaultState.records.protein.length} 筆 protein 與 ${sequenceVaultState.records.gene.length} 筆 gene 快取。`, 'success');
    } catch (error) {
        renderSequenceSummary();
        renderSequenceTabs();
        renderSequenceFilterOptions();
        renderSequenceFeed();
        setSequenceStatus(`序列快取讀取失敗：${error.message}`, 'error');
    } finally {
        setSequenceBusy(false);
    }
}

async function syncSequenceVault(autoMode = false) {
    setSequenceBusy(true);
    setSequenceStatus(autoMode ? '正在自動初始化資料源...' : '正在同步 UniProt / Ensembl 並寫入 DB...', 'info');

    try {
        const payload = sequenceSyncPayload();
        const response = await requestSequenceApi('/api/sequences/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        updateSequenceStateFromPayload(response);
        renderSequenceSummary();
        renderSequenceTabs();
        renderSequenceFilterOptions();
        renderSequenceFeed();

        setSequenceStatus(
            `同步完成，已寫入 ${Number(response.stored?.protein || 0)} 筆 protein 與 ${Number(response.stored?.gene || 0)} 筆 gene 紀錄。`,
            'success'
        );
    } catch (error) {
        setSequenceStatus(`同步失敗：${error.message}`, 'error');
    } finally {
        setSequenceBusy(false);
    }
}

async function deleteSelectedSequence() {
    const activeRecords = getVisibleSequenceRecords();
    const selectedRecord = activeRecords.find((record) => record.id === sequenceVaultState.selectedId);
    if (!selectedRecord) {
        setSequenceStatus('目前沒有選取可刪除的紀錄。', 'warning');
        return;
    }

    const confirmed = window.confirm(`確定要刪除 ${selectedRecord.displayName} (${selectedRecord.sourceId}) 嗎？`);
    if (!confirmed) {
        return;
    }

    setSequenceBusy(true);
    setSequenceStatus(`正在刪除 ${selectedRecord.displayName}...`, 'info');

    try {
        const response = await requestSequenceApi(`/api/sequences/${selectedRecord.id}`, {
            method: 'DELETE'
        });

        const deletedType = response.deleted?.sequenceType;
        if (deletedType && sequenceVaultState.records[deletedType]) {
            sequenceVaultState.records[deletedType] = sequenceVaultState.records[deletedType].filter((record) => record.id !== selectedRecord.id);
        }
        sequenceVaultState.selectedId = null;
        updateSequenceStateFromPayload(response);
        renderSequenceSummary();
        renderSequenceTabs();
        renderSequenceFilterOptions();
        renderSequenceFeed();
        setSequenceStatus(`已刪除 ${response.deleted?.displayName || selectedRecord.displayName}。`, 'success');
    } catch (error) {
        setSequenceStatus(`刪除失敗：${error.message}`, 'error');
    } finally {
        setSequenceBusy(false);
    }
}

function initSequenceVault() {
    document.querySelectorAll('.sequence-tab[data-sequence-type]').forEach((button) => {
        button.addEventListener('click', () => {
            sequenceVaultState.activeType = button.dataset.sequenceType;
            sequenceVaultState.selectedId = null;
            renderSequenceTabs();
            renderSequenceFilterOptions();
            renderSequenceFeed();
        });
    });

    document.getElementById('sequenceSearch').addEventListener('input', () => {
        sequenceVaultState.selectedId = null;
        renderSequenceFeed();
    });

    document.getElementById('sequenceOrganismFilter').addEventListener('change', () => {
        sequenceVaultState.selectedId = null;
        renderSequenceFeed();
    });

    document.getElementById('sequenceSync').addEventListener('click', () => {
        syncSequenceVault(false);
    });

    document.getElementById('sequenceReload').addEventListener('click', () => {
        loadSequenceCache(false);
    });

    document.getElementById('sequenceDelete').addEventListener('click', () => {
        deleteSelectedSequence();
    });

    loadSequenceCache(true);
}

function setSequencingRunStatus(message, state = 'info') {
    const statusEl = document.getElementById('sequencingRunStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state;
}

function renderSequencingRunStrategyOptions() {
    const select = document.getElementById('sequencingRunStrategyFilter');
    if (!select) return;

    const currentValue = select.value;
    const strategies = [...new Set(sequencingRunState.records
        .map((record) => String(record.libraryStrategy || '').trim())
        .filter(Boolean))].sort((left, right) => left.localeCompare(right));

    select.innerHTML = `
                <option value="">全部 strategy</option>
                ${strategies.map((strategy) => `<option value="${escapeHtml(strategy)}">${escapeHtml(strategy)}</option>`).join('')}
            `;
    select.value = strategies.includes(currentValue) ? currentValue : '';
}

function getVisibleSequencingRunRecords() {
    const searchText = String(document.getElementById('sequencingRunSearch')?.value || '').trim().toLowerCase();
    const strategyFilter = String(document.getElementById('sequencingRunStrategyFilter')?.value || '').trim().toLowerCase();

    return sequencingRunState.records.filter((record) => {
        const matchesStrategy = !strategyFilter || String(record.libraryStrategy || '').toLowerCase() === strategyFilter;
        if (!matchesStrategy) {
            return false;
        }

        if (!searchText) {
            return true;
        }

        const haystack = [
            record.sourceId,
            record.studyAccession,
            record.experimentAccession,
            record.sampleAccession,
            record.organism,
            record.libraryStrategy,
            record.instrumentModel,
            record.instrumentPlatform,
            record.queryTerm,
        ].join(' ').toLowerCase();

        return haystack.includes(searchText);
    });
}

function updateSequencingRunFilterMeta(visibleCount, totalCount) {
    const metaEl = document.getElementById('sequencingRunFilterMeta');
    if (!metaEl) return;
    metaEl.textContent = `顯示 ${visibleCount} / ${totalCount} 筆`;
}

function renderSequencingRunSummary() {
    const summaryEl = document.getElementById('sequencingRunSummary');
    if (!summaryEl) return;

    const summary = sequencingRunState.summary;
    summaryEl.innerHTML = `
                <div class="summary-card"><div class="k">Runs</div><div class="v">${formatCompactNumber(summary.runCount)}</div></div>
                <div class="summary-card"><div class="k">Studies</div><div class="v">${formatCompactNumber(summary.studyCount)}</div></div>
                <div class="summary-card"><div class="k">Organisms</div><div class="v">${formatCompactNumber(summary.organismCount)}</div></div>
                <div class="summary-card"><div class="k">Latest sync</div><div class="v">${escapeHtml(formatDateTime(summary.latestFetchedAt))}</div></div>
            `;
}

function renderSequencingRunDetail(record) {
    const detailEl = document.getElementById('sequencingRunDetail');
    if (!detailEl) return;

    if (!record) {
        detailEl.innerHTML = '<div class="knowledge-empty">目前沒有可顯示的 sequencing run 紀錄。可以先同步 ENA metadata，再在這裡檢視 study / sample / instrument 細節。</div>';
        return;
    }

    const links = [];
    if (record.recordUrl) {
        links.push(`<a class="sequence-source-link" href="${escapeHtml(record.recordUrl)}" target="_blank" rel="noreferrer">查看 ENA 紀錄</a>`);
    }
    if (record.ftpUrl) {
        links.push(`<a class="sequence-source-link" href="${escapeHtml(record.ftpUrl)}" target="_blank" rel="noreferrer">查看 FASTQ FTP</a>`);
    }

    detailEl.innerHTML = `
                <div class="detail-title">${escapeHtml(record.sourceId)}</div>
                <div class="detail-copy">${escapeHtml(record.organism || 'Unknown organism')} · ${escapeHtml(record.libraryStrategy || 'Unknown strategy')} · ${escapeHtml(record.instrumentModel || 'Unknown instrument')}</div>
                <div class="detail-meta">
                    <div class="box"><div class="k">Study</div><div class="v">${escapeHtml(record.studyAccession || '-')}</div></div>
                    <div class="box"><div class="k">Experiment</div><div class="v">${escapeHtml(record.experimentAccession || '-')}</div></div>
                    <div class="box"><div class="k">Sample</div><div class="v">${escapeHtml(record.sampleAccession || '-')}</div></div>
                    <div class="box"><div class="k">Layout</div><div class="v">${escapeHtml(record.libraryLayout || '-')}</div></div>
                    <div class="box"><div class="k">Reads</div><div class="v">${formatCompactNumber(record.readCount)}</div></div>
                    <div class="box"><div class="k">Bases</div><div class="v">${formatCompactNumber(record.baseCount)}</div></div>
                    <div class="box"><div class="k">FASTQ size</div><div class="v">${formatBytes(record.fastqBytes)}</div></div>
                    <div class="box"><div class="k">Published</div><div class="v">${escapeHtml(record.publishedAt || '-')}</div></div>
                </div>
                <div class="sequence-link-row">
                    <span>${links.join(' · ') || 'No external links available.'}</span>
                    <span>寫入時間：${escapeHtml(formatDateTime(record.fetchedAt))}</span>
                </div>
                <div class="sequence-detail-seq">
                    <div><strong>Query:</strong> ${escapeHtml(record.queryTerm || '-')}</div>
                    <div><strong>Library Source:</strong> ${escapeHtml(record.librarySource || '-')}</div>
                    <div><strong>Instrument Platform:</strong> ${escapeHtml(record.instrumentPlatform || '-')}</div>
                </div>
            `;
}

function renderSequencingRunFeed() {
    const feedEl = document.getElementById('sequencingRunFeed');
    if (!feedEl) return;

    const visibleRecords = getVisibleSequencingRunRecords();
    updateSequencingRunFilterMeta(visibleRecords.length, sequencingRunState.records.length);

    if (!sequencingRunState.records.length) {
        feedEl.innerHTML = '<div class="knowledge-empty">這個 sequencing run 快取目前是空的。先按「同步 ENA run 到 DB」，或讓頁面首次自動初始化。</div>';
        renderSequencingRunDetail(null);
        return;
    }

    if (!visibleRecords.length) {
        feedEl.innerHTML = '<div class="knowledge-empty">目前沒有符合搜尋或 strategy 篩選的 sequencing run。調整條件後就會重新顯示。</div>';
        renderSequencingRunDetail(null);
        return;
    }

    const selectedRecord = visibleRecords.find((record) => record.id === sequencingRunState.selectedId) || visibleRecords[0];
    sequencingRunState.selectedId = selectedRecord.id;

    feedEl.innerHTML = visibleRecords.map((record) => {
        const activeClass = record.id === sequencingRunState.selectedId ? 'active' : '';
        const strategy = record.libraryStrategy || 'RUN';
        const snippetParts = [
            record.studyAccession,
            record.sampleAccession,
            record.instrumentModel,
        ].filter(Boolean);

        return `
                    <button class="knowledge-card ${activeClass}" type="button" data-record-id="${record.id}">
                        <div class="knowledge-card-top">
                            <div>
                                <div class="knowledge-card-title">${escapeHtml(record.sourceId)}</div>
                                <div class="knowledge-card-sub">${escapeHtml(record.organism || '-')}</div>
                            </div>
                            <div class="knowledge-chip run">${escapeHtml(strategy)}</div>
                        </div>
                        <div class="knowledge-snippet">${escapeHtml(snippetParts.join(' · ') || 'No study / sample / instrument metadata available.')}</div>
                        <div class="knowledge-meta-row">
                            <span>${escapeHtml(record.libraryLayout || '-')}</span>
                            <span>${escapeHtml(record.instrumentPlatform || '-')}</span>
                            <span>${formatCompactNumber(record.readCount)}</span>
                        </div>
                    </button>
                `;
    }).join('');

    feedEl.querySelectorAll('.knowledge-card').forEach((button) => {
        button.addEventListener('click', () => {
            sequencingRunState.selectedId = Number(button.dataset.recordId);
            renderSequencingRunFeed();
        });
    });

    renderSequencingRunDetail(selectedRecord);
}

function updateSequencingRunStateFromPayload(payload) {
    sequencingRunState.records = Array.isArray(payload.records)
        ? payload.records
        : sequencingRunState.records;

    sequencingRunState.summary = {
        runCount: Number(payload.runCount ?? sequencingRunState.records.length ?? 0),
        organismCount: Number(payload.organismCount ?? sequencingRunState.summary.organismCount ?? 0),
        studyCount: Number(payload.studyCount ?? sequencingRunState.summary.studyCount ?? 0),
        latestFetchedAt: payload.latestFetchedAt ?? sequencingRunState.summary.latestFetchedAt,
    };
}

function sequencingRunSyncPayload() {
    return {
        query: document.getElementById('sequencingRunQuery').value.trim() || 'tax_name("Homo sapiens") AND library_strategy="RNA-Seq"',
        limit: Number(document.getElementById('sequencingRunLimit').value) || 4,
    };
}

function setSequencingRunBusy(isBusy) {
    document.getElementById('sequencingRunSync').disabled = isBusy;
    document.getElementById('sequencingRunReload').disabled = isBusy;
}

async function loadSequencingRunCache(autoSyncIfEmpty = true) {
    setSequencingRunBusy(true);
    setSequencingRunStatus('正在從 Render DB 讀取 sequencing run 快取...', 'info');

    try {
        const [summary, payload] = await Promise.all([
            requestSequenceApi('/api/sequencing-runs/summary'),
            requestSequenceApi('/api/sequencing-runs?limit=20')
        ]);

        updateSequencingRunStateFromPayload(summary);
        updateSequencingRunStateFromPayload(payload);
        renderSequencingRunSummary();
        renderSequencingRunStrategyOptions();
        renderSequencingRunFeed();

        if (autoSyncIfEmpty && sequencingRunState.records.length === 0) {
            setSequencingRunStatus('DB 目前沒有 sequencing run metadata，開始從 ENA 初始化快取...', 'warning');
            await syncSequencingRunVault(true);
            return;
        }

        setSequencingRunStatus(`已載入 ${sequencingRunState.records.length} 筆 sequencing run metadata。`, 'success');
    } catch (error) {
        renderSequencingRunSummary();
        renderSequencingRunStrategyOptions();
        renderSequencingRunFeed();
        setSequencingRunStatus(`sequencing run 快取讀取失敗：${error.message}`, 'error');
    } finally {
        setSequencingRunBusy(false);
    }
}

async function syncSequencingRunVault(autoMode = false) {
    setSequencingRunBusy(true);
    setSequencingRunStatus(autoMode ? '正在自動初始化 ENA sequencing metadata...' : '正在同步 ENA sequencing metadata 並寫入 DB...', 'info');

    try {
        const response = await requestSequenceApi('/api/sequencing-runs/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(sequencingRunSyncPayload())
        });

        updateSequencingRunStateFromPayload(response);
        renderSequencingRunSummary();
        renderSequencingRunStrategyOptions();
        renderSequencingRunFeed();
        setSequencingRunStatus(`同步完成，已寫入 ${formatCompactNumber(response.stored || 0)} 筆 sequencing run metadata。`, 'success');
    } catch (error) {
        setSequencingRunStatus(`同步失敗：${error.message}`, 'error');
    } finally {
        setSequencingRunBusy(false);
    }
}

function initSequencingRunVault() {
    document.getElementById('sequencingRunSearch').addEventListener('input', () => {
        sequencingRunState.selectedId = null;
        renderSequencingRunFeed();
    });

    document.getElementById('sequencingRunStrategyFilter').addEventListener('change', () => {
        sequencingRunState.selectedId = null;
        renderSequencingRunFeed();
    });

    document.getElementById('sequencingRunSync').addEventListener('click', () => {
        syncSequencingRunVault(false);
    });

    document.getElementById('sequencingRunReload').addEventListener('click', () => {
        loadSequencingRunCache(false);
    });

    loadSequencingRunCache(true);
}

function setKnowledgeStatus(message, state = 'info') {
    const statusEl = document.getElementById('knowledgeStatus');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state;
}

function renderKnowledgeSourceOptions() {
    const select = document.getElementById('knowledgeSourceFilter');
    if (!select) return;

    const currentValue = select.value;
    const records = knowledgeVaultState.records[knowledgeVaultState.activeType] || [];
    const sources = [...new Set(records.map((record) => String(record.sourceName || '').trim()).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));

    select.innerHTML = `
                <option value="">全部來源</option>
                ${sources.map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`).join('')}
            `;

    select.value = sources.includes(currentValue) ? currentValue : '';
}

function getVisibleKnowledgeRecords() {
    const records = knowledgeVaultState.records[knowledgeVaultState.activeType] || [];
    const searchText = String(document.getElementById('knowledgeSearch')?.value || '').trim().toLowerCase();
    const sourceFilter = String(document.getElementById('knowledgeSourceFilter')?.value || '').trim().toLowerCase();

    return records.filter((record) => {
        const matchesSource = !sourceFilter || String(record.sourceName || '').toLowerCase() === sourceFilter;
        if (!matchesSource) {
            return false;
        }

        if (!searchText) {
            return true;
        }

        const haystack = [
            record.title,
            record.sourceName,
            record.sourceId,
            record.queryTerm,
            record.summaryText,
            record.contentText,
            ...(Array.isArray(record.keywords) ? record.keywords : []),
        ].join(' ').toLowerCase();

        return haystack.includes(searchText);
    });
}

function updateKnowledgeFilterMeta(visibleCount, totalCount) {
    const metaEl = document.getElementById('knowledgeFilterMeta');
    if (!metaEl) return;
    metaEl.textContent = `顯示 ${visibleCount} / ${totalCount} 筆`;
}

function renderKnowledgeSummary() {
    const summaryEl = document.getElementById('knowledgeSummary');
    if (!summaryEl) return;

    const summary = knowledgeVaultState.summary;
    summaryEl.innerHTML = `
                <div class="summary-card"><div class="k">Protein annotations</div><div class="v">${summary.proteinAnnotationCount}</div></div>
                <div class="summary-card"><div class="k">PubMed literature</div><div class="v">${summary.literatureCount}</div></div>
                <div class="summary-card"><div class="k">Latest sync</div><div class="v">${escapeHtml(formatDateTime(summary.latestFetchedAt))}</div></div>
            `;
}

function renderKnowledgeTabs() {
    document.querySelectorAll('.knowledge-tab').forEach((button) => {
        const type = button.dataset.recordType;
        const count = knowledgeVaultState.records[type]?.length || 0;
        const label = type === 'protein_annotation' ? 'Protein Annotation' : 'Literature';
        button.innerHTML = `${label} <span>${count}</span>`;
        button.classList.toggle('active', type === knowledgeVaultState.activeType);
    });
}

function renderKnowledgeDetail(record) {
    const detailEl = document.getElementById('knowledgeDetail');
    if (!detailEl) return;

    if (!record) {
        detailEl.innerHTML = '<div class="knowledge-empty">目前沒有可顯示的知識紀錄。可以先同步 UniProt / PubMed，再在這裡檢視證據內容。</div>';
        return;
    }

    const keywordTags = (Array.isArray(record.keywords) ? record.keywords : []).slice(0, 12)
        .map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join('');
    const sourceLink = record.recordUrl
        ? `<a class="sequence-source-link" href="${escapeHtml(record.recordUrl)}" target="_blank" rel="noreferrer">查看來源紀錄</a>`
        : '<span></span>';

    detailEl.innerHTML = `
                <div class="detail-title">${escapeHtml(record.title)}</div>
                <div class="detail-copy">${escapeHtml(record.summaryText || 'No summary available.')}</div>
                <div class="detail-meta">
                    <div class="box"><div class="k">Source</div><div class="v">${escapeHtml(record.sourceName)} · ${escapeHtml(record.sourceId)}</div></div>
                    <div class="box"><div class="k">Query</div><div class="v">${escapeHtml(record.queryTerm || '-')}</div></div>
                    <div class="box"><div class="k">Published</div><div class="v">${escapeHtml(record.publishedAt || '-')}</div></div>
                    <div class="box"><div class="k">Organism</div><div class="v">${escapeHtml(record.organism || '-')}</div></div>
                </div>
                ${keywordTags ? `<div class="tag-row" style="margin:14px 0 10px">${keywordTags}</div>` : ''}
                <div class="sequence-link-row">
                    ${sourceLink}
                    <span>寫入時間：${escapeHtml(formatDateTime(record.fetchedAt))}</span>
                </div>
                <div class="sequence-detail-seq">${escapeHtml(record.contentText || record.summaryText || '-').replace(/\n/g, '<br>')}</div>
            `;
}

function renderKnowledgeFeed() {
    const feedEl = document.getElementById('knowledgeFeed');
    if (!feedEl) return;

    const records = knowledgeVaultState.records[knowledgeVaultState.activeType] || [];
    const visibleRecords = getVisibleKnowledgeRecords();
    updateKnowledgeFilterMeta(visibleRecords.length, records.length);

    if (!records.length) {
        feedEl.innerHTML = '<div class="knowledge-empty">這個知識快取目前是空的。先按「同步知識到 DB」，或讓頁面首次自動初始化。</div>';
        renderKnowledgeDetail(null);
        return;
    }

    if (!visibleRecords.length) {
        feedEl.innerHTML = '<div class="knowledge-empty">目前沒有符合搜尋或來源篩選的紀錄。調整條件後就會重新顯示。</div>';
        renderKnowledgeDetail(null);
        return;
    }

    const selectedRecord = visibleRecords.find((record) => record.id === knowledgeVaultState.selectedId) || visibleRecords[0];
    knowledgeVaultState.selectedId = selectedRecord.id;

    feedEl.innerHTML = visibleRecords.map((record) => {
        const activeClass = record.id === knowledgeVaultState.selectedId ? 'active' : '';
        const chipClass = record.recordType === 'literature' ? 'literature' : 'annotation';
        const chipLabel = record.recordType === 'literature' ? 'PUBMED' : 'UNIPROT';
        const snippet = String(record.summaryText || record.contentText || '').trim();
        const secondary = record.publishedAt || record.organism || '-';
        const keywordPreview = Array.isArray(record.keywords) ? record.keywords.slice(0, 3).join(', ') : '';

        return `
                    <button class="knowledge-card ${activeClass}" type="button" data-record-id="${record.id}">
                        <div class="knowledge-card-top">
                            <div>
                                <div class="knowledge-card-title">${escapeHtml(record.title)}</div>
                                <div class="knowledge-card-sub">${escapeHtml(record.sourceName)} · ${escapeHtml(record.sourceId)}</div>
                            </div>
                            <div class="knowledge-chip ${chipClass}">${chipLabel}</div>
                        </div>
                        <div class="knowledge-snippet">${escapeHtml(snippet || 'No summary available.')}</div>
                        <div class="knowledge-meta-row">
                            <span>${escapeHtml(secondary)}</span>
                            <span>${escapeHtml(record.queryTerm || '-')}</span>
                            <span>${escapeHtml(keywordPreview || 'no-keywords')}</span>
                        </div>
                    </button>
                `;
    }).join('');

    feedEl.querySelectorAll('.knowledge-card').forEach((button) => {
        button.addEventListener('click', () => {
            knowledgeVaultState.selectedId = Number(button.dataset.recordId);
            renderKnowledgeFeed();
        });
    });

    renderKnowledgeDetail(selectedRecord);
}

function updateKnowledgeStateFromPayload(payload) {
    knowledgeVaultState.records.protein_annotation = Array.isArray(payload.proteinAnnotationRecords)
        ? payload.proteinAnnotationRecords
        : Array.isArray(payload.records) && payload.recordType === 'protein_annotation'
            ? payload.records
            : knowledgeVaultState.records.protein_annotation;

    knowledgeVaultState.records.literature = Array.isArray(payload.literatureRecords)
        ? payload.literatureRecords
        : Array.isArray(payload.records) && payload.recordType === 'literature'
            ? payload.records
            : knowledgeVaultState.records.literature;

    knowledgeVaultState.summary = {
        proteinAnnotationCount: Number(payload.proteinAnnotationCount ?? knowledgeVaultState.records.protein_annotation.length ?? 0),
        literatureCount: Number(payload.literatureCount ?? knowledgeVaultState.records.literature.length ?? 0),
        latestFetchedAt: payload.latestFetchedAt ?? knowledgeVaultState.summary.latestFetchedAt
    };
}

function knowledgeSyncPayload() {
    return {
        protein_query: document.getElementById('knowledgeProteinQuery').value.trim() || 'kinase',
        literature_query: document.getElementById('knowledgeLiteratureQuery').value.trim() || 'kinase AND cancer',
        limit: Number(document.getElementById('knowledgeLimit').value) || 2
    };
}

function setKnowledgeBusy(isBusy) {
    document.getElementById('knowledgeSync').disabled = isBusy;
    document.getElementById('knowledgeReload').disabled = isBusy;
    document.getElementById('knowledgeRagRefresh').disabled = isBusy;
}

function renderKnowledgeRagPreview() {
    const previewEl = document.getElementById('knowledgeRagPreview');
    const metaEl = document.getElementById('knowledgeRagMeta');
    if (!previewEl || !metaEl) return;

    metaEl.textContent = `知識紀錄 ${knowledgeVaultState.ragMeta.knowledgeRecords} 筆 · 序列紀錄 ${knowledgeVaultState.ragMeta.sequenceRecords} 筆 · chunks ${knowledgeVaultState.ragMeta.totalChunks} 個`;

    if (!knowledgeVaultState.ragDocuments.length) {
        previewEl.innerHTML = '<div class="knowledge-empty">目前沒有可預覽的 RAG documents。可先同步知識資料，或調整搜尋條件後再更新。</div>';
        return;
    }

    previewEl.innerHTML = knowledgeVaultState.ragDocuments.slice(0, 4).map((document) => {
        const chipClass = document.sourceKind === 'sequence'
            ? 'sequence'
            : document.recordType === 'literature' ? 'literature' : 'annotation';
        const previewText = String(document.text || '').trim();
        return `
                    <article class="rag-doc-card">
                        <div class="rag-doc-head">
                            <div>
                                <div class="rag-doc-title">${escapeHtml(document.title || document.documentId)}</div>
                                <div class="knowledge-card-sub">${escapeHtml(document.chunkId || '-')}</div>
                            </div>
                            <div class="rag-doc-chip ${chipClass}">${escapeHtml(document.embeddingHint || 'rag')}</div>
                        </div>
                        <div class="rag-doc-text">${escapeHtml(previewText || 'No chunk text available.')}</div>
                        <div class="rag-doc-meta">
                            <span>${escapeHtml(document.metadata?.sourceName || '-')}</span>
                            <span>${escapeHtml(document.metadata?.sourceId || '-')}</span>
                            <span>${escapeHtml(document.metadata?.queryTerm || '-')}</span>
                        </div>
                    </article>
                `;
    }).join('');
}

async function loadRagDocumentPreview(silent = false) {
    if (!silent) {
        setKnowledgeStatus('正在產生 RAG-ready 文件預覽...', 'info');
    }

    try {
        const params = new URLSearchParams();
        const searchText = String(document.getElementById('knowledgeSearch')?.value || '').trim();
        params.set('include_sequences', 'true');
        params.set('limit', '4');
        params.set('record_type', knowledgeVaultState.activeType);
        params.set('chunk_size', '720');
        params.set('chunk_overlap', '120');
        if (searchText) {
            params.set('query', searchText);
        }

        const response = await requestKnowledgeApi(`/api/rag/documents?${params.toString()}`);
        knowledgeVaultState.ragDocuments = Array.isArray(response.documents) ? response.documents : [];
        knowledgeVaultState.ragMeta = {
            totalChunks: Number(response.totalChunks || 0),
            knowledgeRecords: Number(response.knowledgeRecords || 0),
            sequenceRecords: Number(response.sequenceRecords || 0),
            includeSequences: Boolean(response.includeSequences)
        };
        renderKnowledgeRagPreview();

        if (!silent) {
            setKnowledgeStatus(`RAG 預覽已更新，共 ${knowledgeVaultState.ragMeta.totalChunks} 個 chunks。`, 'success');
        }
    } catch (error) {
        knowledgeVaultState.ragDocuments = [];
        knowledgeVaultState.ragMeta = {
            totalChunks: 0,
            knowledgeRecords: 0,
            sequenceRecords: 0,
            includeSequences: true
        };
        renderKnowledgeRagPreview();
        if (!silent) {
            setKnowledgeStatus(`RAG 文件預覽失敗：${error.message}`, 'error');
        }
    }
}

async function loadKnowledgeCache(autoSyncIfEmpty = true) {
    setKnowledgeBusy(true);
    setKnowledgeStatus('正在從 Render DB 讀取知識庫...', 'info');

    try {
        const [summary, annotationPayload, literaturePayload] = await Promise.all([
            requestKnowledgeApi('/api/knowledge/summary'),
            requestKnowledgeApi('/api/knowledge?record_type=protein_annotation&limit=20'),
            requestKnowledgeApi('/api/knowledge?record_type=literature&limit=20')
        ]);

        updateKnowledgeStateFromPayload(summary);
        updateKnowledgeStateFromPayload({ ...annotationPayload, recordType: 'protein_annotation' });
        updateKnowledgeStateFromPayload({ ...literaturePayload, recordType: 'literature' });
        renderKnowledgeSummary();
        renderKnowledgeTabs();
        renderKnowledgeSourceOptions();
        renderKnowledgeFeed();

        const total = knowledgeVaultState.records.protein_annotation.length + knowledgeVaultState.records.literature.length;
        if (autoSyncIfEmpty && total === 0) {
            setKnowledgeStatus('DB 目前沒有知識資料，開始初始化 UniProt / PubMed 快取...', 'warning');
            await syncKnowledgeVault(true);
            return;
        }

        await loadRagDocumentPreview(true);
        setKnowledgeStatus(`已載入 ${knowledgeVaultState.records.protein_annotation.length} 筆 annotation 與 ${knowledgeVaultState.records.literature.length} 筆 literature。`, 'success');
    } catch (error) {
        renderKnowledgeSummary();
        renderKnowledgeTabs();
        renderKnowledgeSourceOptions();
        renderKnowledgeFeed();
        renderKnowledgeRagPreview();
        setKnowledgeStatus(`知識庫讀取失敗：${error.message}`, 'error');
    } finally {
        setKnowledgeBusy(false);
    }
}

async function syncKnowledgeVault(autoMode = false) {
    setKnowledgeBusy(true);
    setKnowledgeStatus(autoMode ? '正在自動初始化 UniProt / PubMed 知識源...' : '正在同步知識資料並寫入 DB...', 'info');

    try {
        const payload = knowledgeSyncPayload();
        const response = await requestKnowledgeApi('/api/knowledge/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        updateKnowledgeStateFromPayload(response);
        renderKnowledgeSummary();
        renderKnowledgeTabs();
        renderKnowledgeSourceOptions();
        renderKnowledgeFeed();
        await loadRagDocumentPreview(true);

        setKnowledgeStatus(
            `同步完成，已寫入 ${Number(response.stored?.proteinAnnotation || 0)} 筆 protein annotation 與 ${Number(response.stored?.literature || 0)} 筆 literature。`,
            'success'
        );
    } catch (error) {
        setKnowledgeStatus(`同步失敗：${error.message}`, 'error');
    } finally {
        setKnowledgeBusy(false);
    }
}

function initKnowledgeVault() {
    document.querySelectorAll('.knowledge-tab').forEach((button) => {
        button.addEventListener('click', async () => {
            knowledgeVaultState.activeType = button.dataset.recordType;
            knowledgeVaultState.selectedId = null;
            renderKnowledgeTabs();
            renderKnowledgeSourceOptions();
            renderKnowledgeFeed();
            await loadRagDocumentPreview(true);
        });
    });

    document.getElementById('knowledgeSearch').addEventListener('input', () => {
        knowledgeVaultState.selectedId = null;
        renderKnowledgeFeed();
    });

    document.getElementById('knowledgeSourceFilter').addEventListener('change', () => {
        knowledgeVaultState.selectedId = null;
        renderKnowledgeFeed();
    });

    document.getElementById('knowledgeSync').addEventListener('click', () => {
        syncKnowledgeVault(false);
    });

    document.getElementById('knowledgeReload').addEventListener('click', () => {
        loadKnowledgeCache(false);
    });

    document.getElementById('knowledgeRagRefresh').addEventListener('click', () => {
        loadRagDocumentPreview(false);
    });

    loadKnowledgeCache(true);
}

function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    return function () {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function pick(rand, items) {
    return items[Math.floor(rand() * items.length)];
}

function pickMany(rand, items, count) {
    const pool = [...items];
    const out = [];
    while (pool.length && out.length < count) {
        out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    return out;
}

function scoreWithNoise(rand, base, swing, min, max) {
    return Math.round(clamp(base + (rand() - .5) * swing, min, max));
}

function maskedSequence(rand, length, suffix) {
    const alphabet = ['A', 'C', 'G', 'T'];
    let seq = '';
    for (let i = 0; i < length; i++) seq += pick(rand, alphabet);
    const start = seq.slice(0, 6);
    const end = seq.slice(-4);
    return `${start}••••••${end}${suffix ? ' ' + suffix : ''}`;
}

function strictnessLabel(value) {
    if (value < 34) return 'Exploratory';
    if (value < 67) return 'Balanced';
    return 'High';
}

function updateRangeOutputs() {
    document.getElementById('designStrictnessOut').textContent = strictnessLabel(Number(document.getElementById('designStrictness').value));
    document.getElementById('guideStrictnessOut').textContent = strictnessLabel(Number(document.getElementById('guideStrictness').value));
    document.getElementById('variantPosOut').textContent = document.getElementById('variantPos').value;
}

function createCandidates() {
    const target = document.getElementById('designTarget').value.trim() || 'untitled-design';
    const objective = document.getElementById('designObjective').value;
    const organism = document.getElementById('designOrganism').value;
    const model = document.getElementById('designModel').value;
    const strictness = Number(document.getElementById('designStrictness').value);
    const preset = objectivePresets[objective];
    const org = organismPresets[organism];

    const seed = hashString(`${target}|${objective}|${organism}|${model}|${strictness}`);
    const candidates = [];

    for (let i = 0; i < 4; i++) {
        const rand = mulberry32(seed + i * 97);
        const expression = scoreWithNoise(rand, preset.bases.expression + org.gcShift * .6 - strictness * .03, 16, 52, 98);
        const specificity = scoreWithNoise(rand, preset.bases.specificity + strictness * .18, 14, 48, 99);
        const synthesis = scoreWithNoise(rand, preset.bases.synthesis - Math.abs(org.gcShift) * .4, 18, 45, 97);
        const safety = scoreWithNoise(rand, preset.bases.safety + org.safetyShift + strictness * .15, 12, 44, 99);
        const gc = Math.round(clamp(48 + org.gcShift + (rand() - .5) * 18, 32, 69));
        const length = Math.round(120 + rand() * 46);
        const tags = pickMany(rand, preset.motifs, 3);
        const score = Math.round(expression * .34 + specificity * .28 + synthesis * .20 + safety * .18);
        const riskBand = safety > 84 ? 'Low review load' : safety > 68 ? 'Moderate review' : 'High review';
        const anchor = ['core promoter', 'flanking enhancer', 'editing access lane', 'assembly-safe block'][i];
        candidates.push({
            id: `GX-${i + 1}`,
            name: `${preset.label} · Candidate ${i + 1}`,
            preview: maskedSequence(rand, 18, `(${anchor})`),
            tags,
            expression,
            specificity,
            synthesis,
            safety,
            gc,
            length,
            score,
            riskBand,
            narrative: `${preset.narrative} 目前這組候選偏向 ${i % 2 === 0 ? '訊號強度' : '審核穩定性'}，適合先進入 reporter assay 規劃。`,
            nextSteps: [
                '先用 reporter assay 比較相對表達與 leakage。',
                '把高分候選送進 context-specific sequencing readout。',
                '若要進入製造階段，再加入更嚴格的 synthesis filter。'
            ]
        });
    }

    candidates.sort((a, b) => b.score - a.score);
    return { candidates, target, objective, organism, model, strictness };
}

function renderCandidates() {
    const candidateList = document.getElementById('candidateList');
    candidateList.innerHTML = '';
    currentCandidates.forEach((candidate, index) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'candidate-card' + (index === 0 ? ' active' : '');
        card.innerHTML = `
                    <div class="candidate-head">
                        <div class="candidate-name">${candidate.id}</div>
                        <div class="candidate-score">Score ${candidate.score}</div>
                    </div>
                    <div class="candidate-preview mono">${candidate.preview}</div>
                    <div class="tag-row">${candidate.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
                    <div class="mini-metrics">
                        <div class="mini-metric"><div class="k">Expr</div><div class="v">${candidate.expression}</div></div>
                        <div class="mini-metric"><div class="k">Spec</div><div class="v">${candidate.specificity}</div></div>
                        <div class="mini-metric"><div class="k">Synth</div><div class="v">${candidate.synthesis}</div></div>
                        <div class="mini-metric"><div class="k">Risk</div><div class="v">${candidate.safety}</div></div>
                    </div>
                `;
        card.addEventListener('click', () => {
            document.querySelectorAll('.candidate-card').forEach(node => node.classList.remove('active'));
            card.classList.add('active');
            renderCandidateDetail(candidate);
        });
        candidateList.appendChild(card);
    });

    if (currentCandidates.length) renderCandidateDetail(currentCandidates[0]);
}

function renderCandidateDetail(candidate) {
    const container = document.getElementById('candidateDetail');
    container.innerHTML = `
                <div class="detail-title">${candidate.name}</div>
                <div class="detail-copy">${candidate.narrative}</div>
                <div class="detail-meta">
                    <div class="box"><div class="k">Masked Preview</div><div class="v">${candidate.preview}</div></div>
                    <div class="box"><div class="k">Review Band</div><div class="v">${candidate.riskBand}</div></div>
                    <div class="box"><div class="k">GC%</div><div class="v">${candidate.gc}%</div></div>
                    <div class="box"><div class="k">Design Length</div><div class="v">${candidate.length} bp</div></div>
                </div>
                <div class="detail-list">
                    ${candidate.nextSteps.map(step => `<div class="detail-item">${step}</div>`).join('')}
                </div>
            `;

    if (typeof window.Chart === 'undefined') return;
    const canvas = document.getElementById('designRadar');
    if (designRadarChart) designRadarChart.destroy();
    designRadarChart = safeRenderChart(() => new Chart(canvas, {
        type: 'radar',
        data: {
            labels: ['Expression', 'Specificity', 'Synthesis', 'Safety'],
            datasets: [{
                data: [candidate.expression, candidate.specificity, candidate.synthesis, candidate.safety],
                borderColor: '#77f2b2',
                backgroundColor: 'rgba(119,242,178,.15)',
                pointBackgroundColor: '#5ed7ff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { display: false },
                    angleLines: { color: 'rgba(255,255,255,.08)' },
                    grid: { color: 'rgba(255,255,255,.08)' },
                    pointLabels: { color: '#95a7a4', font: { size: 11 } }
                }
            }
        }
    }));
}

function refreshStudio() {
    const batch = createCandidates();
    currentCandidates = batch.candidates;
    const modelLabel = document.getElementById('designModel').selectedOptions[0].textContent;
    document.getElementById('designSummary').textContent = `${batch.target} · ${objectivePresets[batch.objective].label}`;
    document.getElementById('designSummarySub').textContent = `${modelLabel} 在 ${organismPresets[batch.organism].label} 條件下，生成四組偏好不同的候選。`;
    renderCandidates();
}

function createGuides() {
    const target = document.getElementById('guideTarget').value.trim() || 'guide-target';
    const pam = document.getElementById('pamType').value;
    const mode = document.getElementById('editMode').value;
    const strictness = Number(document.getElementById('guideStrictness').value);
    const seed = hashString(`${target}|${pam}|${mode}|${strictness}`);
    const items = [];

    for (let i = 0; i < 6; i++) {
        const rand = mulberry32(seed + i * 131);
        const efficiencyBase = mode === 'knockout' ? 78 : mode === 'base' ? 72 : 68;
        const specificityBase = 56 + strictness * .35;
        const bystanderBase = mode === 'base' ? 28 : mode === 'prime' ? 20 : 16;
        const efficiency = scoreWithNoise(rand, efficiencyBase, 18, 38, 96);
        const specificity = scoreWithNoise(rand, specificityBase, 16, 34, 99);
        const risk = scoreWithNoise(rand, bystanderBase + (100 - strictness) * .16, 14, 3, 52);
        const score = Math.round(efficiency * .45 + specificity * .40 - risk * .15 + 8);
        const windowStart = 90 + Math.floor(rand() * 260);
        const repairBias = mode === 'knockout'
            ? pick(rand, ['NHEJ-biased', 'frameshift-rich', 'balanced'])
            : mode === 'base'
                ? pick(rand, ['narrow window', 'bystander-prone', 'clean edit'])
                : pick(rand, ['pegRNA-sensitive', 'PBS-stable', 'long RTT']);

        items.push({
            rank: i + 1,
            preview: maskedSequence(rand, 20, pam),
            window: `${windowStart}-${windowStart + 19}`,
            efficiency,
            specificity,
            risk,
            repairBias,
            score
        });
    }

    items.sort((a, b) => b.score - a.score);
    return items.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function renderGuides() {
    const guides = createGuides();
    const tbody = document.getElementById('guideTable');
    tbody.innerHTML = guides.map(guide => `
                <tr>
                    <td class="mono">#${guide.rank}</td>
                    <td class="mono">${guide.preview}</td>
                    <td class="mono">${guide.window}</td>
                    <td class="good mono">${guide.efficiency}</td>
                    <td class="mono">${guide.specificity}</td>
                    <td class="${guide.risk > 28 ? 'risk' : 'warn'} mono">${guide.risk}</td>
                    <td>${guide.repairBias}</td>
                </tr>
            `).join('');

    const recommended = guides[0];
    const avgSpecificity = Math.round(guides.reduce((sum, item) => sum + item.specificity, 0) / guides.length);
    const avgRisk = Math.round(guides.reduce((sum, item) => sum + item.risk, 0) / guides.length);
    document.getElementById('guideSummary').innerHTML = `
                <div class="summary-card"><div class="k">Top ranked</div><div class="v">${recommended.preview}</div></div>
                <div class="summary-card"><div class="k">Mean specificity</div><div class="v">${avgSpecificity}</div></div>
                <div class="summary-card"><div class="k">Mean bystander risk</div><div class="v">${avgRisk}</div></div>
            `;

    if (typeof window.Chart === 'undefined') return;
    const canvas = document.getElementById('guideScatter');
    if (guideScatterChart) guideScatterChart.destroy();
    guideScatterChart = safeRenderChart(() => new Chart(canvas, {
        type: 'bubble',
        data: {
            datasets: [{
                data: guides.map(guide => ({
                    x: guide.specificity,
                    y: guide.efficiency,
                    r: clamp((guide.score - 40) / 4, 6, 15)
                })),
                backgroundColor: guides.map(guide => guide.rank === 1 ? 'rgba(119,242,178,.45)' : 'rgba(94,215,255,.28)'),
                borderColor: guides.map(guide => guide.rank === 1 ? '#77f2b2' : '#5ed7ff'),
                borderWidth: 1.5
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    title: { display: true, text: 'Specificity', color: '#95a7a4' },
                    min: 20,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,.06)' }
                },
                y: {
                    title: { display: true, text: 'Efficiency', color: '#95a7a4' },
                    min: 20,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,.06)' }
                }
            }
        }
    }));
}

function evaluateVariantCase() {
    const gene = document.getElementById('variantGene').value.trim() || 'panel-case';
    const region = document.getElementById('variantRegion').value;
    const pos = Number(document.getElementById('variantPos').value);
    const model = document.getElementById('variantModel').value;
    const ref = document.getElementById('variantRef').value;
    const alt = document.getElementById('variantAlt').value;
    const seed = hashString(`${gene}|${region}|${pos}|${model}|${ref}|${alt}`);
    const rand = mulberry32(seed);

    const regionBias = {
        promoter: { expr: .44, splice: .14, chrom: .52 },
        splice: { expr: .28, splice: .78, chrom: .12 },
        coding: { expr: .22, splice: .34, chrom: .18 },
        utr: { expr: .30, splice: .18, chrom: .26 }
    }[region];

    const expressionDelta = clamp((rand() - .5) * .9 + regionBias.expr - .18, -1.2, 1.2);
    const spliceRisk = clamp(regionBias.splice + rand() * .26, 0, .98);
    const chromShift = clamp((rand() - .5) * .8 + regionBias.chrom - .2, -1, 1);
    const reviewScore = Math.round((Math.abs(expressionDelta) * 42) + spliceRisk * 36 + Math.abs(chromShift) * 22);

    const priority = reviewScore > 68 ? 'High review priority' : reviewScore > 46 ? 'Moderate review priority' : 'Low review priority';
    const exprLabel = expressionDelta > .18 ? '+' : expressionDelta < -.18 ? '-' : '≈';

    document.getElementById('variantSummary').innerHTML = `
                <div class="summary-card"><div class="k">Predicted expression</div><div class="v">${exprLabel}${Math.abs(expressionDelta).toFixed(2)}</div></div>
                <div class="summary-card"><div class="k">Splice risk</div><div class="v">${Math.round(spliceRisk * 100)}%</div></div>
                <div class="summary-card"><div class="k">Review priority</div><div class="v">${priority}</div></div>
            `;

    const cellTypes = ['Hepatic', 'Lymphoid', 'Epithelial', 'Neuronal', 'Stem-like'];
    const values = cellTypes.map((_, i) => clamp(expressionDelta * 100 + (rand() - .5) * 22 + i * (chromShift * 8), -95, 95));

    document.getElementById('variantNarrative').innerHTML = `
                <div class="detail-head">Interpretation Note</div>
                <div class="detail-title mono">${gene} · ${region} · ${ref}>${alt} @ ${pos}</div>
                <div class="detail-copy">
                    ${model === 'enformer' ? 'Enformer-style context scoring' : model === 'nt' ? 'Nucleotide Transformer encoding' : 'Hybrid stack'}
                    顯示這個變異在 ${region} 背景下帶有 ${priority.toLowerCase()}。
                    目前最值得注意的是 ${spliceRisk > .55 ? 'splicing disruption 風險' : Math.abs(expressionDelta) > .35 ? 'expression shift' : 'context-dependent chromatin movement'}。
                </div>
                <div class="detail-list">
                    <div class="detail-item">若這是臨床判讀情境，下一步應優先回看 coverage、allelic balance 與樣本 QC。</div>
                    <div class="detail-item">若這是功能驗證情境，可先做 reporter assay 或 targeted RNA readout，比對 cell-type-specific response。</div>
                    <div class="detail-item">模型分數只能做優先排序，最後仍需結合文獻、族群頻率與實驗訊號。</div>
                </div>
            `;

    if (typeof window.Chart === 'undefined') return;
    const canvas = document.getElementById('variantImpactChart');
    if (variantImpactChart) variantImpactChart.destroy();
    variantImpactChart = safeRenderChart(() => new Chart(canvas, {
        type: 'bar',
        data: {
            labels: cellTypes,
            datasets: [{
                label: 'Relative change',
                data: values,
                backgroundColor: values.map(v => v >= 0 ? 'rgba(119,242,178,.48)' : 'rgba(255,123,139,.42)'),
                borderColor: values.map(v => v >= 0 ? '#77f2b2' : '#ff7b8b'),
                borderWidth: 1.3,
                borderRadius: 8
            }]
        },
        options: {
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    min: -100,
                    max: 100,
                    title: { display: true, text: 'Relative shift', color: '#95a7a4' },
                    grid: { color: 'rgba(255,255,255,.06)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    }));
}

function initChartDefaults() {
    if (typeof window.Chart === 'undefined') return;
    Chart.defaults.color = '#95a7a4';
    Chart.defaults.borderColor = 'rgba(255,255,255,.08)';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
}

function initPage() {
    initSequenceVault();
    initSequencingRunVault();
    initKnowledgeVault();
}

initPage();