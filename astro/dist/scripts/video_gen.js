(() => {
    const POLL_MS = 5000;
    let pollTimer = null;
    const $ = id => document.getElementById(id);
    const setStatus = (msg, state) => {
        const el = $('videoStatus');
        if (!el) return;
        el.textContent = msg;
        el.dataset.state = state || 'info';
    };
    const setGenerating = active => {
        const btn = $('videoGenBtn');
        if (!btn) return;
        btn.disabled = active;
        btn.textContent = active ? '生成中...' : '生成影片';
        const sp = $('videoSpinner');
        if (sp) sp.hidden = !active;
    };
    const showVideo = url => {
        const v = $('videoResult');
        const p = $('videoPlaceholder');
        if (!v) return;
        v.src = url;
        v.hidden = false;
        if (p) p.hidden = true;
    };
    const stopPolling = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
    const pollStatus = async (api, rid) => {
        try {
            const r = await fetch(api + '/api/video/status/' + rid);
            if (!r.ok) {
                const e = await r.json().catch(() => ({}));
                stopPolling(); setGenerating(false);
                setStatus('錯誤：' + (e.detail || r.statusText), 'error');
                return;
            }
            const d = await r.json();
            if (d.status === 'done') { stopPolling(); setGenerating(false); setStatus('生成完成！', 'success'); showVideo(d.video_url); }
            else if (d.status === 'failed') { stopPolling(); setGenerating(false); setStatus('失敗：' + (d.error || '未知'), 'error'); }
            else { setStatus('生成中，請稍候…（約 30–120 秒）', 'info'); }
        } catch (e) { stopPolling(); setGenerating(false); setStatus('網路錯誤：' + e.message, 'error'); }
    };
    const generate = async api => {
        const prompt = ($('videoPrompt')?.value || '').trim();
        const resolution = $('videoResolution')?.value || '720p';
        const duration = $('videoDuration')?.value || '5';
        if (!prompt) { setStatus('請輸入 prompt', 'warning'); return; }
        stopPolling();
        const v = $('videoResult'); if (v) { v.src = ''; v.hidden = true; }
        const p = $('videoPlaceholder'); if (p) p.hidden = false;
        setGenerating(true); setStatus('提交中…', 'info');
        try {
            const r = await fetch(api + '/api/video/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, resolution, duration }),
            });
            const d = await r.json();
            if (!r.ok) { setGenerating(false); setStatus('錯誤：' + (d.detail || r.statusText), 'error'); return; }
            setStatus('已提交，等待 fal.ai…', 'info');
            pollTimer = setInterval(() => pollStatus(api, d.request_id), POLL_MS);
        } catch (e) { setGenerating(false); setStatus('網路錯誤：' + e.message, 'error'); }
    };
    const init = async () => {
        const api = await window.APP_CONFIG_UTILS?.resolveApiBase?.() || window.APP_CONFIG?.API_BASE_URL || '';
        const lbl = $('videoApiLabel'); if (lbl) lbl.textContent = api || 'detecting...';
        $('videoGenBtn')?.addEventListener('click', () => generate(api));
        document.querySelectorAll('[data-example-prompt]').forEach(b =>
            b.addEventListener('click', () => { const el = $('videoPrompt'); if (el) { el.value = b.dataset.examplePrompt; el.focus(); } })
        );
        document.querySelectorAll('.faq-header').forEach(h =>
            h.addEventListener('click', () => {
                const b = h.nextElementSibling; if (!b) return;
                b.hidden = !b.hidden;
                const a = h.querySelector('.faq-arrow'); if (a) a.textContent = b.hidden ? '▼' : '▲';
            })
        );
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
