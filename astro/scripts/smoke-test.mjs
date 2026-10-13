// quick end-to-end smoke test
const BASE = 'http://localhost:4321';

async function main() {
    // RAG search
    const r = await fetch(`${BASE}/api/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'ProteinMPNN 是什麼', topK: 2 }),
    });
    const j = await r.json();
    console.log('=== /api/rag/search ===');
    console.log(`hits: ${j.hits.length} | embed_ms: ${j.embed_ms}`);
    j.hits.forEach((h, i) => {
        console.log(`  [${i + 1}] score=${h.score} src=${h.source} path=${h.path}`);
        console.log(`     ${h.text.slice(0, 150).replace(/\n/g, ' ')}`);
    });

    // chat (full Ollama + RAG)
    console.log('\n=== /api/chat (Ollama llama3.2 + RAG) ===');
    const c = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system: '你是 元嬰不說。回答簡短、繁中、200字內。',
            messages: [{ role: 'user', content: 'ProteinMPNN 是什麼？給我一段簡短說明' }],
        }),
    });
    const cj = await c.json();
    console.log('reply:', cj.reply);
    console.log(`\nms: ${cj.ms} | tokens: ${JSON.stringify(cj.tokens)}`);
    console.log(`rag hits: ${cj.rag?.hits?.length} | rag_ms: ${cj.rag?.ms}`);
}

main().catch((e) => { console.error(e); process.exit(1); });