(() => {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const workCards = document.querySelectorAll('.work-card');
    const configuredApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
        ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    const appConfigUtils = window.APP_CONFIG_UTILS;
    let resolvedApiBase = '';

    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            filterButtons.forEach((node) => node.classList.remove('active'));
            button.classList.add('active');
            const filter = button.dataset.filter;

            workCards.forEach((card, index) => {
                const categories = card.dataset.cat.split(' ');
                const visible = filter === 'all' || categories.includes(filter);
                if (visible) {
                    card.classList.remove('hidden');
                    card.style.animationDelay = `${index * 0.04}s`;
                    card.style.animation = 'none';
                    requestAnimationFrame(() => {
                        card.style.animation = '';
                    });
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    });

    async function resolveApiBase() {
        if (resolvedApiBase) {
            return resolvedApiBase;
        }

        if (typeof appConfigUtils?.resolveApiBase === 'function') {
            resolvedApiBase = await appConfigUtils.resolveApiBase({ cacheKey: 'works' });
            return resolvedApiBase;
        }

        resolvedApiBase = configuredApiBase || window.location.origin.replace(/\/+$/, '');
        return resolvedApiBase;
    }

    async function apiGet(path) {
        const apiBase = await resolveApiBase();
        if (!apiBase) {
            throw new Error('API unavailable');
        }

        const response = await fetch(apiBase + path, { signal: AbortSignal.timeout(9000) });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }

    async function loadLiveStats() {
        const indicator = document.getElementById('liveIndicator');
        const label = document.getElementById('liveLabel');
        try {
            const health = await apiGet('/healthz');
            if (health.status !== 'ok') {
                throw new Error('API offline');
            }

            const [seqSummary, knowSummary, inquiryStats] = await Promise.all([
                apiGet('/api/sequences/summary'),
                apiGet('/api/knowledge/summary'),
                apiGet('/api/inquiries/stats')
            ]);

            const seqTotal = (seqSummary.protein_count || 0) + (seqSummary.gene_count || 0);
            const knowTotal = (knowSummary.protein_annotation_count || 0) + (knowSummary.literature_count || 0);
            const inquiryTotal = inquiryStats.total || inquiryStats.count || 0;

            document.getElementById('lsSeq').textContent = seqTotal.toLocaleString();
            document.getElementById('lsKnow').textContent = knowTotal.toLocaleString();
            document.getElementById('lsInq').textContent = inquiryTotal.toLocaleString();
            document.getElementById('lsTime').textContent = new Date().toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit'
            });

            ['lsSeq', 'lsKnow', 'lsInq', 'lsTime'].forEach((id) => {
                const element = document.getElementById(id);
                if (element) {
                    element.classList.remove('loading');
                }
            });

            indicator.classList.add('connected');
            label.textContent = 'API 後端 · 已連線';

            // Auto-sync if DB completely empty
            if (seqTotal === 0 && knowTotal === 0) {
                label.textContent = 'API 已連線 · 正在初始化資料…';
                const base = await resolveApiBase();
                const syncSecret = window.APP_CONFIG_UTILS?.getSyncSecret?.() || '';
                const headers = { 'Content-Type': 'application/json', ...(syncSecret ? { 'X-Sync-Secret': syncSecret } : {}) };
                try {
                    await Promise.allSettled([
                        fetch(`${base}/api/sequences/sync`, { method: 'POST', headers, body: JSON.stringify({ protein_query: 'kinase', gene_symbols: ['TP53', 'BRCA1'], species: 'homo_sapiens', limit: 4 }) }),
                        fetch(`${base}/api/knowledge/sync`, { method: 'POST', headers, body: JSON.stringify({ protein_query: 'kinase', literature_query: 'kinase AND cancer', limit: 4 }) }),
                    ]);
                    label.textContent = 'API 已連線 · 初始化完成';
                    loadLiveStats(); // reload stats
                } catch { label.textContent = 'API 已連線'; }
            }
        } catch (error) {
            indicator.classList.add('error');
            label.textContent = 'API 暫時離線';
            ['lsSeq', 'lsKnow', 'lsInq'].forEach((id) => {
                const element = document.getElementById(id);
                if (element) {
                    element.textContent = '—';
                    element.classList.add('loading');
                }
            });
        }
    }

    loadLiveStats();
})();