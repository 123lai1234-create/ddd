(() => {
    const form = document.getElementById('contactForm');
    const statusEl = document.getElementById('contactStatus');
    const submitBtn = document.getElementById('contactSubmitBtn');
    const apiHealthLabel = document.getElementById('apiHealthLabel');
    const dbHealthLabel = document.getElementById('dbHealthLabel');
    const dbCountLabel = document.getElementById('dbCountLabel');
    const dbLastSeen = document.getElementById('dbLastSeen');
    const apiBaseLabel = document.getElementById('apiBaseLabel');
    const configuredApiBase = typeof window.APP_CONFIG?.API_BASE_URL === 'string'
        ? window.APP_CONFIG.API_BASE_URL.trim().replace(/\/+$/, '')
        : '';
    let resolvedApiBase = '';

    const setStatus = (message, state) => {
        statusEl.textContent = message;
        statusEl.dataset.state = state;
    };

    const setMetrics = (payload) => {
        apiHealthLabel.textContent = payload.api;
        dbHealthLabel.textContent = payload.db;
        dbCountLabel.textContent = payload.count;
        dbLastSeen.textContent = payload.lastSeen;
    };

    const formatDateTime = (value) => {
        if (!value) {
            return '-';
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return '-';
        }

        return parsed.toLocaleString('zh-TW', {
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const deriveApiCandidates = () => {
        const candidates = [];
        const renderPortfolioServiceNames = ['donttalk'];
        const renderApiServiceNames = ['donttalk-api'];
        const pushCandidate = (value) => {
            const normalized = String(value || '').trim().replace(/\/+$/, '');
            if (normalized && !candidates.includes(normalized)) {
                candidates.push(normalized);
            }
        };

        pushCandidate(configuredApiBase);

        const currentOrigin = window.location.origin.replace(/\/+$/, '');
        pushCandidate(currentOrigin);
        for (const renderPortfolioServiceName of renderPortfolioServiceNames) {
            if (currentOrigin.includes(renderPortfolioServiceName)) {
                for (const renderApiServiceName of renderApiServiceNames) {
                    pushCandidate(currentOrigin.replace(renderPortfolioServiceName, renderApiServiceName));
                }
            }
        }

        pushCandidate('https://donttalk-api.onrender.com');
        return candidates;
    };

    const resolveApiBase = async () => {
        if (resolvedApiBase) {
            return resolvedApiBase;
        }

        const candidates = deriveApiCandidates();
        for (const candidate of candidates) {
            try {
                const response = await fetch(`${candidate}/healthz`);
                if (!response.ok) {
                    continue;
                }

                const data = await response.json().catch(() => null);
                if (data?.status === 'ok') {
                    resolvedApiBase = candidate;
                    return resolvedApiBase;
                }
            } catch (error) {
                continue;
            }
        }

        return '';
    };

    const updateStats = async () => {
        const apiBase = await resolveApiBase();
        apiBaseLabel.textContent = apiBase || configuredApiBase || 'Not configured';

        if (!apiBase) {
            submitBtn.disabled = true;
            setMetrics({
                api: 'Offline',
                db: 'Unavailable',
                count: '-',
                lastSeen: '-'
            });
            setStatus('目前無法找到可用的 API。請確認靜態站的 API 設定或等候部署完成。', 'error');
            return;
        }

        try {
            const response = await fetch(`${apiBase}/api/inquiries/stats`);
            if (!response.ok) {
                throw new Error('API request failed');
            }

            const data = await response.json();
            const dbConfigured = Boolean(data.databaseConfigured);
            const dbConnected = Boolean(data.connected);

            submitBtn.disabled = !(dbConfigured && dbConnected);
            setMetrics({
                api: 'Online',
                db: dbConnected ? 'Connected' : dbConfigured ? 'Booting' : 'Missing DB',
                count: String(data.totalInquiries ?? 0),
                lastSeen: formatDateTime(data.latestCreatedAt)
            });

            if (dbConfigured && dbConnected) {
                setStatus('API 與資料庫已連線，可以直接把表單寫進 PostgreSQL。', 'success');
            } else if (!dbConfigured) {
                setStatus('API 已上線，但尚未設定任何 DATABASE_URL，所以表單暫時不能寫入資料庫。', 'warning');
            } else {
                setStatus('API 已上線，但資料庫仍在啟動或尚未可連線。', 'warning');
            }
        } catch (error) {
            submitBtn.disabled = true;
            setMetrics({
                api: 'Offline',
                db: 'Unavailable',
                count: '-',
                lastSeen: '-'
            });
            setStatus('目前無法連線到 API。請先建立 API service 與 PostgreSQL database。', 'error');
        }

        updateDbMultiStatus(apiBase);
    };

    const getAdminToken = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('admin') || '';
    };

    const updateDbMultiStatus = async (apiBase) => {
        const container = document.getElementById('dbMultiStatus');
        if (!container || !apiBase) return;

        const adminToken = getAdminToken();
        if (!adminToken) {
            container.style.display = 'none';
            return;
        }

        try {
            const response = await fetch(`${apiBase}/api/db/status`, {
                headers: { 'X-Admin-Token': adminToken }
            });
            if (!response.ok) {
                container.style.display = 'none';
                return;
            }

            const data = await response.json();
            if (!data.databases || data.databases.length === 0) {
                container.innerHTML = '<div class="db-row db-row--empty">尚未設定任何雲端 DB</div>';
                return;
            }

            const rows = data.databases.map(db => {
                const statusClass = db.connected ? 'db-row--ok' : 'db-row--fail';
                const statusText = db.connected ? '✓ Connected' : '✗ ' + (db.error || 'Unreachable');
                const label = db.envKey.replace('DATABASE_URL_', '').replace('DATABASE_URL', 'PRIMARY');
                return `<div class="db-row ${statusClass}"><span class="db-label">${label}</span><span class="db-host">${db.host}</span><span class="db-status">${statusText}</span></div>`;
            });

            container.innerHTML = `<div class="db-summary">${data.totalConnected}/${data.totalConfigured} DB connected</div>${rows.join('')}`;
        } catch (error) {
            // silently ignore
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const apiBase = await resolveApiBase();

        if (!apiBase) {
            setStatus('目前沒有可用的 API 端點，因此無法送出表單。', 'warning');
            return;
        }

        const formData = new FormData(form);
        const payload = {
            name: String(formData.get('name') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            organization: String(formData.get('organization') || '').trim(),
            message: String(formData.get('message') || '').trim(),
            website: String(formData.get('website') || '').trim(),
            source_page: window.location.pathname.split('/').pop() || 'about_me.html'
        };

        if (!payload.name || !payload.email || !payload.message) {
            setStatus('請至少填寫姓名、Email 與訊息內容。', 'warning');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';
        setStatus('正在把訊息寫入 PostgreSQL...', 'idle');

        try {
            const response = await fetch(`${apiBase}/api/inquiries`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.detail || '訊息送出失敗');
            }

            form.reset();
            setStatus(`已成功寫入 PostgreSQL，記錄編號 #${data.id}。`, 'success');
            await updateStats();
        } catch (error) {
            setStatus(error.message || '目前無法送出，請稍後再試。', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送出到 PostgreSQL';
        }
    });

    updateStats();
})();