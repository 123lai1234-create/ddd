/**
 * Astro integration: /api/chat 代理到本地 Ollama (含 RAG context + SSE streaming)
 *
 * - POST /api/chat?stream=1 → SSE 串流逐 token
 * - POST /api/chat (default)  → JSON {reply, tokens, rag, ...}
 *
 * RAG context 在 streaming mode 注入到 system prompt 一次（不重複）。
 */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
const RAG_ENABLED = (process.env.RAG_ENABLED ?? '1') !== '0';
const RAG_TOPK = Number(process.env.RAG_TOPK || 5);
const RAG_MIN_SCORE = Number(process.env.RAG_MIN_SCORE || 0.30);

function buildFinalSystem(systemPrompt, ragContext) {
    return ragContext
        ? `${systemPrompt}\n\n---\n以下是與使用者問題最相關的站內 / 文件 / 論文內容，請優先引用:\n${ragContext}\n---\n若內容無關，請照原本 system prompt 回答。回答時若引用了某條內容，結尾附上編號 [1][2]...`
        : systemPrompt;
}

async function fetchRag(query) {
    if (!RAG_ENABLED || query.length < 3) {
        return { context: '', hits: [], ms: 0, error: null };
    }
    const t0 = Date.now();
    try {
        const r = await fetch(
            `http://localhost:${process.env.PORT || 4321}/api/rag/search`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, topK: RAG_TOPK }),
                signal: AbortSignal.timeout(20_000),
            },
        );
        if (!r.ok) return { context: '', hits: [], ms: Date.now() - t0, error: `rag_status_${r.status}` };
        const j = await r.json();
        const allHits = Array.isArray(j.hits) ? j.hits : [];
        const filtered = allHits.filter((h) => (h.score ?? 0) >= RAG_MIN_SCORE);
        if (!filtered.length) return { context: '', hits: [], ms: Date.now() - t0, error: 'no_hits_above_threshold' };
        const context = filtered
            .map((h, i) => `[${i + 1}] (${h.source} · ${h.path} · score=${h.score})\n${h.text}`)
            .join('\n\n');
        const hits = filtered.map((h) => ({
            source: h.source, path: h.path, score: h.score, snippet: h.text.slice(0, 180),
        }));
        return { context, hits, ms: Date.now() - t0, error: null };
    } catch (e) {
        return { context: '', hits: [], ms: Date.now() - t0, error: String(e?.message || e) };
    }
}

function setSseHeaders(res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

export default function ollamaChatIntegration() {
    return {
        name: 'ollama-chat-dev',
        hooks: {
            'astro:config:setup': ({ updateConfig, command }) => {
                if (command === 'build') return;
                updateConfig({
                    vite: {
                        plugins: [
                            {
                                name: 'ollama-chat-middleware',
                                configureServer(server) {
                                    server.middlewares.use(async (req, res, next) => {
                                        if (req.method !== 'POST' || !req.url?.startsWith('/api/chat')) {
                                            return next();
                                        }

                                        const url = new URL(req.url, 'http://localhost');
                                        const wantStream = url.searchParams.get('stream') === '1';

                                        const chunks = [];
                                        for await (const c of req) chunks.push(c);
                                        const raw = Buffer.concat(chunks).toString('utf8');
                                        let body;
                                        try { body = JSON.parse(raw); }
                                        catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_json' })); return; }

                                        const systemPrompt = body.system || '';
                                        const messages = Array.isArray(body.messages) ? body.messages : [];
                                        let query = '';
                                        for (let i = messages.length - 1; i >= 0; i--) {
                                            if (messages[i].role === 'user') {
                                                query = String(messages[i].content || '').trim();
                                                break;
                                            }
                                        }

                                        const rag = await fetchRag(query);
                                        const finalSystem = buildFinalSystem(systemPrompt, rag.context);
                                        const ollamaBody = {
                                            model: CHAT_MODEL,
                                            stream: wantStream,
                                            messages: [
                                                ...(finalSystem ? [{ role: 'system', content: finalSystem }] : []),
                                                ...messages,
                                            ],
                                            options: {
                                                temperature: typeof body.temperature === 'number' ? body.temperature : 0.7,
                                                num_ctx: 8192,
                                            },
                                        };

                                        if (!wantStream) {
                                            // non-stream mode: aggregate response
                                            const started = Date.now();
                                            try {
                                                const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify(ollamaBody),
                                                    signal: AbortSignal.timeout(60_000),
                                                });
                                                if (!ollamaRes.ok) {
                                                    const t = await ollamaRes.text();
                                                    res.statusCode = ollamaRes.status;
                                                    res.end(JSON.stringify({ error: 'ollama_error', detail: t.slice(0, 500) }));
                                                    return;
                                                }
                                                const ollamaJson = await ollamaRes.json();
                                                const reply = ollamaJson?.message?.content ?? '';
                                                res.statusCode = 200;
                                                res.setHeader('Content-Type', 'application/json');
                                                res.end(JSON.stringify({
                                                    reply,
                                                    cache: 'miss',
                                                    ms: Date.now() - started,
                                                    model: CHAT_MODEL,
                                                    tokens: {
                                                        prompt: ollamaJson?.prompt_eval_count ?? 0,
                                                        completion: ollamaJson?.eval_count ?? 0,
                                                    },
                                                    rag: {
                                                        enabled: RAG_ENABLED,
                                                        queried: query,
                                                        hits: rag.hits,
                                                        ms: rag.ms,
                                                        error: rag.error,
                                                    },
                                                }));
                                            } catch (err) {
                                                res.statusCode = 502;
                                                res.end(JSON.stringify({ error: 'ollama_unreachable', detail: String(err?.message || err) }));
                                            }
                                            return;
                                        }

                                        // SSE streaming mode
                                        setSseHeaders(res);
                                        const started = Date.now();
                                        // 1) Emit rag metadata first so UI can render citations while text streams
                                        res.write(`event: rag\ndata: ${JSON.stringify({
                                            enabled: RAG_ENABLED,
                                            queried: query,
                                            hits: rag.hits,
                                            ms: rag.ms,
                                            error: rag.error,
                                        })}\n\n`);

                                        let abortCtl;
                                        try {
                                            abortCtl = new AbortController();
                                            const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(ollamaBody),
                                                signal: abortCtl.signal,
                                            });

                                            if (!ollamaRes.ok) {
                                                res.write(`event: error\ndata: ${JSON.stringify({ status: ollamaRes.status })}\n\n`);
                                                res.end();
                                                return;
                                            }

                                            const reader = ollamaRes.body.getReader();
                                            const decoder = new TextDecoder();
                                            let buf = '';
                                            let totalPrompt = 0;
                                            let totalEval = 0;
                                            let reply = '';

                                            while (true) {
                                                const { value, done } = await reader.read();
                                                if (done) break;
                                                buf += decoder.decode(value, { stream: true });
                                                let nl;
                                                while ((nl = buf.indexOf('\n')) >= 0) {
                                                    const line = buf.slice(0, nl).trim();
                                                    buf = buf.slice(nl + 1);
                                                    if (!line) continue;
                                                    try {
                                                        const o = JSON.parse(line);
                                                        if (o.message?.content) {
                                                            reply += o.message.content;
                                                            res.write(`event: token\ndata: ${JSON.stringify({ text: o.message.content })}\n\n`);
                                                        }
                                                        if (typeof o.prompt_eval_count === 'number') totalPrompt = o.prompt_eval_count;
                                                        if (typeof o.eval_count === 'number') totalEval = o.eval_count;
                                                        if (o.done) {
                                                            res.write(`event: done\ndata: ${JSON.stringify({
                                                                ms: Date.now() - started,
                                                                model: CHAT_MODEL,
                                                                tokens: { prompt: totalPrompt, completion: totalEval },
                                                            })}\n\n`);
                                                        }
                                                    } catch (_) {
                                                        // skip malformed chunk
                                                    }
                                                }
                                            }
                                        } catch (err) {
                                            res.write(`event: error\ndata: ${JSON.stringify({ detail: String(err?.message || err) })}\n\n`);
                                        } finally {
                                            res.end();
                                        }
                                    });

                                    console.log(`\n[ollama-chat] /api/chat → ${OLLAMA_URL} (model: ${CHAT_MODEL}, rag: ${RAG_ENABLED ? 'on' : 'off'}, stream: SSE)\n`);
                                },
                            },
                        ],
                    },
                });
            },
        },
    };
}