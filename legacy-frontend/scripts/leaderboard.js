(() => {
    const SUPA_URL = 'https://wbamdjgcoezevimohlcb.supabase.co';
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs';

    const list    = document.getElementById('lb-list');
    const loading = document.getElementById('lb-loading');
    if (!list) return;

    const MEDALS = ['🥇', '🥈', '🥉'];

    const render = (rows) => {
        if (!rows || rows.length === 0) {
            list.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:24px 0">尚無紀錄，快去擊敗魔王！</div>';
            return;
        }
        list.innerHTML = rows.map((r, i) => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;
                        background:var(--surface);border:1px solid var(--border);border-radius:8px">
                <span style="font-size:1.3rem;width:28px;text-align:center">${MEDALS[i] || (i + 1)}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(r.name)}</div>
                    <div style="font-size:.8rem;color:var(--muted)">Lv.${r.level} · 靈石 ${r.gold}</div>
                </div>
                <div style="font-size:.8rem;color:var(--muted);white-space:nowrap">${fmtDate(r.created_at)}</div>
            </div>`).join('');
    };

    const escHtml = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    const fmtDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const fetchRows = async () => {
        try {
            const res = await fetch(
                `${SUPA_URL}/rest/v1/leaderboard?select=name,level,gold,created_at&order=level.desc,gold.desc&limit=10`,
                { headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` } }
            );
            if (!res.ok) throw new Error();
            const rows = await res.json();
            if (loading) loading.remove();
            render(rows);
        } catch {
            if (loading) loading.textContent = '無法載入排行榜。';
        }
    };

    fetchRows();

    // Supabase Realtime — subscribe to INSERT on leaderboard
    try {
        const wsUrl = `wss://wbamdjgcoezevimohlcb.supabase.co/realtime/v1/websocket?apikey=${SUPA_KEY}&vsn=1.0.0`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            ws.send(JSON.stringify({
                topic: 'realtime:public:leaderboard',
                event: 'phx_join',
                payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [{ event: 'INSERT', schema: 'public', table: 'leaderboard' }] } },
                ref: '1',
            }));
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                if (msg.event === 'postgres_changes' || (msg.payload?.data?.type === 'INSERT')) {
                    fetchRows();
                }
            } catch {}
        };

        // Heartbeat every 30s to keep connection alive
        setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null })); }, 30000);
    } catch {}
})();
