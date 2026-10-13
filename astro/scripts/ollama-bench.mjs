#!/usr/bin/env node
/**
 * Ollama benchmark — latency / throughput / VRAM / smoke test
 *
 * 用法:
 *   node scripts/ollama-bench.mjs                    # 全跑
 *   node scripts/ollama-bench.mjs --only latency     # 只跑 latency
 *   node scripts/ollama-bench.mjs --model qwen2.5:3b
 *
 * 環境變數: OLLAMA_URL, CHAT_MODEL, EMBED_MODEL
 */
import process from 'node:process';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.CHAT_MODEL || 'llama3.2';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

const args = process.argv.slice(2);
function flag(name, def = null) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] || true) : def;
}
const only = flag('only'); // 'latency' | 'throughput' | 'memory' | 'smoke' | null
const modelOverride = flag('model', CHAT_MODEL);
const chatModel = modelOverride;
const cycles = Number(flag('cycles', 5));
const concur = Number(flag('concurrent', 4));

const PROMPTS_LATENCY = [
    { role: 'user', content: '用一句話解釋 RAG 與微調的差別。' },
    { role: 'user', content: '列舉三個常見的 embedding 模型並說明差異。' },
    { role: 'user', content: '以繁體中文介紹你自己的名字與專長。' },
    { role: 'user', content: '請以不超過 80 字總結檢索增強生成的優點。' },
    { role: 'user', content: 'protein mpnn 是什麼？給我一段簡短說明。' },
];

const PROMPTS_SMOKE = [
    '你好，請用繁體中文自我介紹',
    '請問 RAG 是什麼？用一句話回答',
    'ESM-2 蛋白質語言模型可以用在哪裡？',
    '基因體定序的 NGS 三個字母是什麼意思',
    'protein-mpnn 的 mpnn 是什麼縮寫？',
    'ChatGPT 是哪一家公司的產品？',
    '台灣的股票代號 2330 是哪一家公司？',
    '請把 3.14 寫成小數點後兩位',
    'JSON 是什麼的縮寫？',
    '列出三個 GPU 製造商',
];

function pct(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * p)];
}

function fmtMs(ms) { return `${ms.toFixed(0)}ms`; }
function fmtTokPerSec(n) { return `${n.toFixed(1)} tok/s`; }

async function psSnapshot() {
    try {
        const r = await fetch(`${OLLAMA_URL}/api/ps`);
        if (!r.ok) return null;
        return await r.json();
    } catch { return null; }
}

function parseMemory(ps) {
    if (!ps) return { vram_gb: null, ram_gb: null, models: [] };
    const models = (ps.models || []).map((m) => ({
        name: m.name,
        vram_gb: Number((m.size_vram / 1e9).toFixed(2)),
        expires_at: m.expires_at,
    }));
    const totalVram = models.reduce((a, m) => a + m.vram_gb, 0);
    return { vram_gb: totalVram, models };
}

async function runChat(promptMessages, model = chatModel) {
    const sw = { start: Date.now(), first: null };
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            messages: promptMessages,
            options: { temperature: 0.7, num_ctx: 4096 },
        }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const j = await res.json();
    sw.end = Date.now();
    sw.elapsed = sw.end - sw.start;
    const evalCount = j.eval_count || 0;
    const evalDurNs = j.eval_duration || 0;
    const tokPerSec = evalDurNs > 0 ? evalCount / (evalDurNs / 1e9) : 0;
    return {
        ok: true,
        reply: j.message?.content || '',
        elapsed_ms: sw.elapsed,
        prompt_tokens: j.prompt_eval_count || 0,
        completion_tokens: evalCount,
        tok_per_sec: tokPerSec,
    };
}

async function benchLatency() {
    console.log(`\n=== Latency (model=${chatModel}, cycles=${cycles}) ===`);
    const samples = [];
    for (let i = 0; i < cycles; i++) {
        const p = PROMPTS_LATENCY[i % PROMPTS_LATENCY.length];
        process.stdout.write(`  cycle ${i + 1}/${cycles} ... `);
        try {
            const r = await runChat([p]);
            samples.push(r);
            console.log(
                `${fmtMs(r.elapsed_ms)} | ${r.completion_tokens} tok | ${fmtTokPerSec(r.tok_per_sec)} | "${r.reply.slice(0, 30)}..."`,
            );
        } catch (e) {
            console.log(`ERR: ${e.message}`);
        }
    }
    if (!samples.length) return null;
    const elapsed = samples.map((s) => s.elapsed_ms);
    const tps = samples.map((s) => s.tok_per_sec);
    console.log(`  ── median latency ${fmtMs(pct(elapsed, 0.5))} | p95 ${fmtMs(pct(elapsed, 0.95))}`);
    console.log(`  ── median tok/s ${fmtTokPerSec(pct(tps, 0.5))} | p95 ${fmtTokPerSec(pct(tps, 0.95))}`);
    return { elapsed_ms: elapsed, tok_per_sec: tps };
}

async function benchThroughput() {
    console.log(`\n=== Throughput (model=${chatModel}, ${concur} concurrent × ${cycles}) ===`);
    const p = PROMPTS_LATENCY[0];
    const sw = Date.now();
    const results = await Promise.allSettled(
        Array.from({ length: concur * cycles }, () => runChat([p])),
    );
    const total = Date.now() - sw;
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    const totalTokens = ok.reduce((s, r) => s + (r.value.completion_tokens || 0), 0);
    const totalElapsed = ok.reduce((s, r) => s + r.value.elapsed_ms, 0);
    console.log(`  ── wall ${fmtMs(total)} | ok=${ok.length}/${results.length} fail=${failed.length}`);
    console.log(`  ── total tokens ${totalTokens} | aggregate ${(totalTokens / total * 1000).toFixed(1)} tok/s`);
    console.log(`  ── avg per request ${(totalElapsed / ok.length / 1000).toFixed(2)}s`);
    if (failed.length) {
        console.log(`  ── first failure: ${failed[0].reason?.message || failed[0].reason}`);
    }
    return { total_ms: total, ok: ok.length, failed: failed.length, total_tokens: totalTokens };
}

async function benchMemory() {
    console.log(`\n=== Memory (model=${chatModel}) ===`);
    // warm up
    await runChat([{ role: 'user', content: 'hi' }]);
    await new Promise((r) => setTimeout(r, 500));
    const idle = parseMemory(await psSnapshot());
    console.log(`  ── idle: ${idle.vram_gb ?? '?'} GB VRAM | models=${idle.models.length}`);

    // during workload
    const workload = Array.from({ length: concur }, () =>
        runChat([{ role: 'user', content: '請寫一段 200 字繁中自我介紹' }]));
    const peak = await psSnapshot();
    const peakMem = parseMemory(peak);
    await Promise.allSettled(workload);
    await new Promise((r) => setTimeout(r, 500));
    const after = parseMemory(await psSnapshot());
    console.log(`  ── during (peak snapshot): ${peakMem.vram_gb ?? '?'} GB VRAM`);
    console.log(`  ── after:  ${after.vram_gb ?? '?'} GB VRAM | models=${after.models.length}`);
    if (after.models.length) {
        after.models.forEach((m) =>
            console.log(`     · ${m.name} | ${m.vram_gb} GB`));
    }
    return { idle_gb: idle.vram_gb, peak_gb: peakMem.vram_gb, after_gb: after.vram_gb, models: after.models };
}

async function benchSmoke() {
    console.log(`\n=== Smoke (model=${chatModel}, ${PROMPTS_SMOKE.length} 繁中 QA) ===`);
    const results = [];
    for (const q of PROMPTS_SMOKE) {
        const r = await runChat([{ role: 'user', content: q }]);
        const cjk = (r.reply.match(/[一-鿿]/g) || []).length;
        const total = r.reply.length;
        const cjkRatio = total ? cjk / total : 0;
        results.push({ q, ok: r.ok, len: r.reply.length, cjk, cjk_ratio: cjkRatio, elapsed_ms: r.elapsed_ms });
        console.log(
            `  Q: ${q.slice(0, 25).padEnd(25)} | ${r.reply.length.toString().padStart(3)}字 | CJK ${(cjkRatio * 100).toFixed(0)}% | ${fmtMs(r.elapsed_ms)}`,
        );
    }
    const avgCjk = results.reduce((s, r) => s + r.cjk_ratio, 0) / results.length;
    console.log(`  ── avg CJK ratio: ${(avgCjk * 100).toFixed(1)}% (期望 > 60%)`);
    return results;
}

async function main() {
    console.log(`Ollama: ${OLLAMA_URL}`);
    console.log(`Chat model: ${chatModel}`);
    console.log(`Embed model: ${EMBED_MODEL}`);

    const ps = await psSnapshot();
    if (!ps) {
        console.error(`❌ Cannot reach Ollama at ${OLLAMA_URL}. 確認 ollama serve 跑著。`);
        process.exit(1);
    }

    if (only === 'latency' || !only) await benchLatency();
    if (only === 'throughput' || !only) await benchThroughput();
    if (only === 'memory' || !only) await benchMemory();
    if (only === 'smoke' || !only) await benchSmoke();

    console.log('\n✓ done\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});