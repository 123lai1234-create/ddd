#!/usr/bin/env node
/**
 * QA comparison: 跑 5 個繁中問題給兩個 model 對比
 * 用法: node scripts/qa-compare.mjs
 * 需要 dev server 跑著 (預設 http://localhost:4321)
 */
const BASE = process.env.DEV_URL || 'http://localhost:4321';
const SYSTEM = `你是「元嬰不說」,繁體中文簡短回答(≤150字)。`;

const QUESTIONS = [
    '你好,請自我介紹',
    'ProteinMPNN 是什麼? 給我一段簡短說明',
    'RAG 跟微調有什麼差別?',
    '你的技術專長有哪些?',
    '台灣股票 2330 是哪一家公司?',
];

async function chat(model) {
    const res = await fetch(`${BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            // 透過 OLLAMA_CHAT_MODEL env 切換; 我們直接呼叫 /api/chat
            // 因為 server 端用 env 設的 model, 這裡只能做 client-side 切換
            system: SYSTEM,
            messages: [{ role: 'user', content: questions[qi] }],
        }),
    });
    return res.json();
}

// 直接打 Ollama API 才能切 model
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODELS = ['qwen2.5:3b', 'llama3.2'];

async function ollamaChat(model, question) {
    const sw = Date.now();
    const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: question },
            ],
            options: { temperature: 0.7, num_ctx: 4096 },
        }),
        signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return {
        reply: j.message?.content || '',
        elapsed_ms: Date.now() - sw,
        tok_per_sec: j.eval_count / (j.eval_duration / 1e9) || 0,
        completion_tokens: j.eval_count,
    };
}

function cjkRatio(s) {
    const total = s.length;
    if (!total) return 0;
    const cjk = (s.match(/[一-鿿]/g) || []).length;
    return cjk / total;
}

async function main() {
    console.log(`Comparing models: ${MODELS.join(' vs ')}`);
    console.log(`Ollama: ${OLLAMA}\n`);

    for (const q of QUESTIONS) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Q: ${q}\n`);
        for (const model of MODELS) {
            try {
                const r = await ollamaChat(model, q);
                const cjk = (cjkRatio(r.reply) * 100).toFixed(0);
                console.log(`--- ${model} (${r.elapsed_ms}ms, ${r.completion_tokens} tok, ${r.tok_per_sec.toFixed(1)} tok/s, CJK ${cjk}%) ---`);
                console.log(r.reply.slice(0, 300));
                console.log();
            } catch (e) {
                console.log(`--- ${model}: ERROR ${e.message} ---`);
            }
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });