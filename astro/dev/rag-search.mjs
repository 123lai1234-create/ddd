/**
 * Astro integration: /api/rag/search + /api/rag/stats + /api/rag/cache/stats
 *
 * - Vector search via LanceDB (fast ANN, handles >10k chunks)
 * - Optional reranking via Ollama bge-reranker-v2-m3 (precision boost)
 * - In-memory LRU + TTL query cache
 *
 * Falls back to JSON brute-force cosine if LanceDB table not built.
 */
import fs from 'node:fs';
import path from 'node:path';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const RERANK_MODEL = process.env.OLLAMA_RERANK_MODEL || 'bge-reranker-v2-m3';
const RERANK_ENABLED = (process.env.RERANK_ENABLED ?? '0') !== '0';
const RERANK_INITIAL_TOPK = Number(process.env.RERANK_INITIAL_TOPK || 15);
const DEFAULT_JSON_INDEX = path.resolve(process.cwd(), '..', '.rag', 'index.json');
const DEFAULT_LANCE_DIR = path.resolve(process.cwd(), '..', '.rag', 'lance');
const JSON_INDEX_PATH = process.env.RAG_INDEX_PATH || DEFAULT_JSON_INDEX;
const LANCE_DIR = process.env.RAG_LANCE_DIR || DEFAULT_LANCE_DIR;

// Query cache
const CACHE_MAX = Number(process.env.RAG_CACHE_MAX || 500);
const CACHE_TTL_MS = Number(process.env.RAG_CACHE_TTL_MS || 10 * 60 * 1000);
const cache = new Map();
const cacheStats = { hits: 0, misses: 0 };

function cacheKey(query, topK, withRerank) {
    return `${String(query).toLowerCase().replace(/[\s\u3000]+/g, ' ').replace(/[，。！？、；：,.!?;:"'‘’“”()（）【】\[\]<>《》?？!！.]/g, '').trim().slice(0, 200)}|k=${topK}|r=${withRerank ? 1 : 0}`;
}

function cacheGet(key) {
    const e = cache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > CACHE_TTL_MS) {
        cache.delete(key);
        cacheStats.misses++;
        return null;
    }
    cacheStats.hits++;
    cache.delete(key);
    cache.set(key, e);
    return e;
}

function cacheSet(key, hits) {
    if (cache.has(key)) cache.delete(key);
    if (cache.size >= CACHE_MAX) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
    }
    cache.set(key, { ts: Date.now(), hits });
}

// Backends
let lanceDb = null;
let lanceTbl = null;
let jsonIdx = null;
let jsonIdxMtime = 0;
let backend = 'unknown'; // 'lance' | 'json' | 'unavailable'

async function initLance() {
    try {
        if (!fs.existsSync(path.join(LANCE_DIR, 'chunks.lance'))) {
            return false;
        }
        const { connect } = await import('@lancedb/lancedb');
        lanceDb = await connect(LANCE_DIR);
        lanceTbl = await lanceDb.openTable('chunks');
        backend = 'lance';
        console.log(`[rag] LanceDB backend ready (${LANCE_DIR})`);
        return true;
    } catch (e) {
        console.warn(`[rag] LanceDB init failed: ${e?.message || e}`);
        return false;
    }
}

function loadJson() {
    try {
        if (!fs.existsSync(JSON_INDEX_PATH)) {
            return { docs: [], error: `index not found at ${JSON_INDEX_PATH}` };
        }
        const mtime = fs.statSync(JSON_INDEX_PATH).mtimeMs;
        if (jsonIdx && mtime === jsonIdxMtime) return jsonIdx;
        const raw = fs.readFileSync(JSON_INDEX_PATH, 'utf8');
        const idx = JSON.parse(raw);
        if (!Array.isArray(idx.docs) || !idx.docs.length) {
            return { docs: [], error: 'index empty or malformed' };
        }
        jsonIdx = idx;
        jsonIdxMtime = mtime;
        console.log(`[rag] JSON index loaded: ${idx.docs.length} chunks from ${idx.source || 'unknown'}`);
        return idx;
    } catch (e) {
        return { docs: [], error: String(e?.message || e) };
    }
}

function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/** Compute cosine sim in [-1, 1] using row.vector + query (both assumed already L2-normalized
 *  by the embed model).  Handles LanceDB Vector class via .toArray(). */
function rowCosine(q, row) {
    const raw = row.vector;
    if (!raw) return 0;
    // LanceDB 0.0.x returns a custom Vector class; convert to plain array
    const b = (typeof raw.toArray === 'function') ? raw.toArray() : raw;
    if (!b || !b.length) return 0;
    const a = q;
    let dot = 0, na = 0, nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function embed(text) {
    const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
        throw new Error(`embed_failed: ${r.status} ${await r.text()}`);
    }
    const j = await r.json();
    return j.embedding;
}

/**
 * Call Ollama rerank endpoint (or fall back to /api/embeddings-based).
 * Ollama 0.40+ supports /api/rerank via cross-encoder models.
 */
async function rerank(query, docs) {
    if (!docs.length) return docs;
    try {
        const r = await fetch(`${OLLAMA_URL}/api/rerank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: RERANK_MODEL,
                query,
                documents: docs.map((d) => d.text),
                top_n: docs.length,
            }),
            signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) {
            const t = await r.text();
            throw new Error(`rerank_failed: ${r.status} ${t.slice(0, 200)}`);
        }
        const j = await r.json();
        // Ollama /api/rerank returns { results: [{index, relevance_score}] }
        const results = Array.isArray(j.results) ? j.results : [];
        if (!results.length) return docs;
        // Reorder + attach score
        return results
            .map((r) => ({ ...docs[r.index], rerank_score: r.relevance_score }))
            .sort((a, b) => b.rerank_score - a.rerank_score);
    } catch (e) {
        console.warn(`[rag] rerank failed, falling back to original order: ${e?.message || e}`);
        return docs;
    }
}

async function searchLance(queryVec, topK) {
    if (!lanceTbl) return null;
    try {
        const rows = await lanceTbl.search(queryVec).limit(topK).toArray();
        return rows.map((r) => {
            // Recompute cosine sim from row.vector + query (nomic-embed normalizes already)
            const sim = rowCosine(queryVec, r);
            return {
                id: r.id,
                source: r.source,
                path: r.path,
                text: r.text,
                score: Number(sim.toFixed(4)),
                meta: (() => { try { return JSON.parse(r.meta || '{}'); } catch { return {}; } })(),
            };
        });
    } catch (e) {
        console.warn(`[rag] LanceDB search failed: ${e?.message || e}`);
        return null;
    }
}

function searchJson(idx, queryVec, topK) {
    return idx.docs
        .map((d) => ({ ...d, score: cosine(queryVec, d.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((d) => ({
            id: d.id,
            source: d.source,
            path: d.path,
            text: d.text,
            score: Number(d.score.toFixed(4)),
            meta: d.meta || {},
        }));
}

export default function ragIntegration() {
    return {
        name: 'rag-search-dev',
        hooks: {
            'astro:config:setup': ({ updateConfig, command }) => {
                if (command === 'build') return;
                updateConfig({
                    vite: {
                        plugins: [
                            {
                                name: 'rag-search-middleware',
                                configureServer(server) {
                                    // init backend (lance preferred)
                                    initLance().then((ok) => {
                                        if (!ok) {
                                            // fallback to JSON
                                            const idx = loadJson();
                                            if (idx.docs.length) {
                                                backend = 'json';
                                                console.log(`[rag] JSON fallback backend ready (${idx.docs.length} chunks)`);
                                            } else {
                                                backend = 'unavailable';
                                                console.warn(`[rag] no backend: build lance via 'node scripts/lance-migrate.mjs' or rebuild JSON via 'python scripts/rag-ingest.py'`);
                                            }
                                        }
                                    });

                                    // /api/rag/stats + /api/rag/cache/stats
                                    server.middlewares.use((req, res, next) => {
                                        if (req.method !== 'GET') return next();
                                        if (req.url?.startsWith('/api/rag/cache/stats')) {
                                            const total = cacheStats.hits + cacheStats.misses;
                                            const hitRate = total ? cacheStats.hits / total : 0;
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify({
                                                size: cache.size,
                                                max_size: CACHE_MAX,
                                                ttl_ms: CACHE_TTL_MS,
                                                hits: cacheStats.hits,
                                                misses: cacheStats.misses,
                                                hit_rate: Number(hitRate.toFixed(3)),
                                            }));
                                            return;
                                        }
                                        if (req.url?.startsWith('/api/rag/stats')) {
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify({
                                                ok: backend !== 'unavailable',
                                                backend,
                                                lance_dir: LANCE_DIR,
                                                json_index: JSON_INDEX_PATH,
                                                model: EMBED_MODEL,
                                                rerank: RERANK_ENABLED ? RERANK_MODEL : 'off',
                                                error: backend === 'unavailable' ? 'no backend ready' : null,
                                            }));
                                            return;
                                        }
                                        next();
                                    });

                                    // /api/rag/search
                                    server.middlewares.use(async (req, res, next) => {
                                        if (req.method !== 'POST' || !req.url?.startsWith('/api/rag/search')) {
                                            return next();
                                        }
                                        if (backend === 'unavailable') {
                                            res.statusCode = 503;
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify({
                                                error: 'index_unavailable',
                                                hint: 'node scripts/lance-migrate.mjs or python scripts/rag-ingest.py',
                                            }));
                                            return;
                                        }

                                        const chunks = [];
                                        for await (const c of req) chunks.push(c);
                                        const raw = Buffer.concat(chunks).toString('utf8');
                                        let body;
                                        try { body = JSON.parse(raw); }
                                        catch {
                                            res.statusCode = 400;
                                            res.end(JSON.stringify({ error: 'invalid_json' }));
                                            return;
                                        }

                                        const query = String(body.query || '').trim();
                                        const topK = Math.min(Number(body.topK) || 5, 50);
                                        const wantRerank = RERANK_ENABLED && body.rerank !== false;
                                        const initialK = wantRerank ? Math.max(RERANK_INITIAL_TOPK, topK) : topK;
                                        if (!query) {
                                            res.statusCode = 400;
                                            res.end(JSON.stringify({ error: 'empty_query' }));
                                            return;
                                        }

                                        // Check cache
                                        const ck = cacheKey(query, topK, wantRerank);
                                        const cached = cacheGet(ck);
                                        if (cached) {
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify({
                                                ok: true,
                                                query,
                                                backend,
                                                total_docs: backend === 'lance' ? (await lanceTbl.countRows()) : (loadJson().docs.length),
                                                hits: cached.hits,
                                                cached: true,
                                            }));
                                            return;
                                        }

                                        try {
                                            const t0 = Date.now();
                                            const qVec = await embed(query);
                                            const tEmbed = Date.now() - t0;

                                            let top;
                                            if (backend === 'lance') {
                                                top = await searchLance(qVec, initialK);
                                            } else {
                                                const idx = loadJson();
                                                top = searchJson(idx, qVec, initialK);
                                            }
                                            if (!top) {
                                                throw new Error('search returned null');
                                            }

                                            let rerankMs = 0;
                                            if (wantRerank && top.length > topK) {
                                                const tR = Date.now();
                                                top = await rerank(query, top);
                                                top = top.slice(0, topK);
                                                rerankMs = Date.now() - tR;
                                            }

                                            cacheSet(ck, top);

                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify({
                                                ok: true,
                                                query,
                                                backend,
                                                embed_ms: tEmbed,
                                                rerank_ms: rerankMs,
                                                total_docs: backend === 'lance' ? (await lanceTbl.countRows()) : (loadJson().docs.length),
                                                hits: top,
                                                cached: false,
                                            }));
                                        } catch (err) {
                                            res.statusCode = 500;
                                            res.end(JSON.stringify({
                                                error: 'rag_failed',
                                                detail: String(err?.message || err),
                                            }));
                                        }
                                    });

                                    console.log(`[rag] backend=init... (lance: ${LANCE_DIR}, json: ${JSON_INDEX_PATH})`);
                                },
                            },
                        ],
                    },
                });
            },
        },
    };
}