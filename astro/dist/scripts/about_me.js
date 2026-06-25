(() => {
    const form           = document.getElementById('contactForm');
    const statusEl       = document.getElementById('contactStatus');
    const submitBtn      = document.getElementById('contactSubmitBtn');
    const apiHealthLabel = document.getElementById('apiHealthLabel');
    const dbHealthLabel  = document.getElementById('dbHealthLabel');
    const dbCountLabel   = document.getElementById('dbCountLabel');
    const dbLastSeen     = document.getElementById('dbLastSeen');
    const apiBaseLabel   = document.getElementById('apiBaseLabel');

    const SUPA_URL = 'https://wbamdjgcoezevimohlcb.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs';
    const SUPA_HEADERS = {
        'apikey':        SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type':  'application/json',
    };

    const setStatus = (message, state) => {
        statusEl.textContent    = message;
        statusEl.dataset.state  = state;
    };

    const setMetrics = ({ api, db, count, lastSeen }) => {
        if (apiHealthLabel) apiHealthLabel.textContent = api;
        if (dbHealthLabel)  dbHealthLabel.textContent  = db;
        if (dbCountLabel)   dbCountLabel.textContent   = count;
        if (dbLastSeen)     dbLastSeen.textContent     = lastSeen;
    };

    const formatDateTime = (value) => {
        if (!value) return '-';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '-';
        return d.toLocaleString('zh-TW', {
            hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    };

    // Hide admin panel — was FastAPI-specific
    const adminPanel = document.getElementById('dbMultiStatus');
    if (adminPanel) adminPanel.style.display = 'none';
    if (apiBaseLabel) apiBaseLabel.textContent = SUPA_URL;

    const updateStats = async () => {
        try {
            const r = await fetch(`${SUPA_URL}/rest/v1/rpc/get_contact_stats`, {
                method:  'POST',
                headers: SUPA_HEADERS,
                body:    '{}',
                signal:  AbortSignal.timeout(4000),
            });
            if (!r.ok) throw new Error('stats failed');
            const data = await r.json();
            setMetrics({
                api:      'Supabase',
                db:       'Connected',
                count:    String(data.total ?? 0),
                lastSeen: formatDateTime(data.latest_at),
            });
            submitBtn.disabled = false;
            setStatus('表單已就緒，可以送出留言。', 'success');
        } catch (e) {
            setMetrics({ api: 'Supabase', db: 'Unavailable', count: '-', lastSeen: '-' });
            submitBtn.disabled = false;
            setStatus('無法確認連線狀態，仍可嘗試送出。', 'warning');
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const fd = new FormData(form);
        const payload = {
            name:         String(fd.get('name')         || '').trim(),
            email:        String(fd.get('email')        || '').trim(),
            organization: String(fd.get('organization') || '').trim() || null,
            message:      String(fd.get('message')      || '').trim(),
            website:      String(fd.get('website')      || '').trim() || null,
            source_page:  window.location.pathname.split('/').pop() || 'about_me',
        };

        // Honeypot — bot trap
        if (payload.website) return;

        if (!payload.name || !payload.email || !payload.message) {
            setStatus('請至少填寫姓名、Email 與訊息內容。', 'warning');
            return;
        }

        submitBtn.disabled    = true;
        submitBtn.textContent = '送出中…';
        setStatus('正在送出留言…', 'idle');

        try {
            const rlRes = await fetch(`${SUPA_URL}/rest/v1/rpc/check_contact_rate_limit`, {
                method: 'POST', headers: SUPA_HEADERS,
                body: JSON.stringify({ p_email: payload.email }),
            });
            const allowed = await rlRes.json();
            if (!allowed) {
                setStatus('同一 Email 每天最多送出 3 次，請明天再試。', 'warning');
                submitBtn.disabled    = false;
                submitBtn.textContent = '送出留言';
                return;
            }

            const r = await fetch(`${SUPA_URL}/rest/v1/contact_inquiries`, {
                method:  'POST',
                headers: { ...SUPA_HEADERS, 'Prefer': 'return=representation' },
                body:    JSON.stringify(payload),
            });

            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.message || '送出失敗，請稍後再試。');

            const id = Array.isArray(data) ? data[0]?.id : data?.id;
            form.reset();
            setStatus(`留言已送出！記錄編號 #${id}。感謝您的聯絡 🎉`, 'success');
            updateStats();
        } catch (err) {
            setStatus(err.message || '目前無法送出，請稍後再試。', 'error');
        } finally {
            submitBtn.disabled    = false;
            submitBtn.textContent = '送出留言';
        }
    });

    updateStats();
})();
