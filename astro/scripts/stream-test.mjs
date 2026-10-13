// SSE streaming + RAG accordion test
const BASE = 'http://localhost:4321';

async function main() {
    console.log('=== SSE streaming test ===');
    const res = await fetch(`${BASE}/api/chat?stream=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system: '你是 元嬰不說, 繁中簡短回答 (≤150字)。',
            messages: [{ role: 'user', content: 'ProteinMPNN 是什麼? 給一段簡短說明' }],
        }),
    });
    console.log(`status: ${res.status}, content-type: ${res.headers.get('content-type')}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let streamed = '';
    let ragData = null;
    let doneMeta = null;
    let tokenCount = 0;
    const started = Date.now();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            const lines = frame.split('\n');
            let event = 'message';
            const dataParts = [];
            for (const ln of lines) {
                if (ln.startsWith('event:')) event = ln.slice(6).trim();
                else if (ln.startsWith('data:')) dataParts.push(ln.slice(5).trim());
            }
            if (!dataParts.length) continue;
            const data = dataParts.join('\n');
            const elapsed = Date.now() - started;
            if (event === 'rag') {
                ragData = JSON.parse(data);
                console.log(`[+${elapsed}ms] event:rag | hits=${ragData.hits.length} | rag_ms=${ragData.ms} | error=${ragData.error}`);
            } else if (event === 'token') {
                const t = JSON.parse(data);
                streamed += t.text;
                tokenCount++;
                if (tokenCount <= 3 || tokenCount % 20 === 0) {
                    console.log(`[+${elapsed}ms] token #${tokenCount}: "${t.text.replace(/\n/g, '\\n')}"`);
                }
            } else if (event === 'done') {
                doneMeta = JSON.parse(data);
                console.log(`[+${elapsed}ms] event:done | ms=${doneMeta.ms} | tokens=${JSON.stringify(doneMeta.tokens)}`);
            } else if (event === 'error') {
                console.log(`[+${elapsed}ms] event:error: ${data}`);
            }
        }
    }

    console.log(`\n=== Final ===`);
    console.log(`streamed (${streamed.length} chars): ${streamed.slice(0, 200)}…`);
    if (ragData?.hits) {
        console.log(`RAG hits (${ragData.hits.length}):`);
        ragData.hits.forEach((h, i) => console.log(`  [${i+1}] ${h.source} · ${h.path} · ${h.score}`));
    }
}

main().catch((e) => { console.error(e); process.exit(1); });