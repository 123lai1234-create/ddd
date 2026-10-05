// Express wrapper for astro/api/[...catchall].mjs (Vercel Web Streams API
// style handler). Converts Express req → Web Request, calls handler,
// pipes Web Response → Express res.
//
// Deployed on Render as donttalk-catchall (separate web service from
// line-bot-api). Replaces the broken Vercel Edge Function route that
// never auto-generated.
//
// 2026-10-05 created.

import express from 'express';
import handler from '../api/[...catchall].mjs';

const app = express();
app.disable('x-powered-by');

// Body parsing for JSON / urlencoded. The catchall handler reads
// request.json() / request.formData() internally so we just pass raw
// stream through (see below).
app.use(express.raw({ type: '*/*', limit: '10mb' }));

// Health check (Render free plan needs this for healthcheck pass).
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'donttalk-catchall', ts: Date.now() });
});

// Root: same healthz shape (some Uptime monitors hit "/").
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'donttalk-catchall', ts: Date.now() });
});

// Catch-all: route every /api/* (and other paths) to the Vercel handler.
app.all(/.*/, async (req, res) => {
  try {
    // Express req → Web Request
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const url = `${protocol}://${host}${req.originalUrl || req.url}`;

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach(x => headers.append(k, x));
      else headers.set(k, String(v));
    }

    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      // express.raw() gives us a Buffer in req.body
      body = req.body && req.body.length ? req.body : undefined;
    }

    const request = new Request(url, { method: req.method, headers, body });

    // Dispatch
    const response = await handler(request);

    // Web Response → Express res
    res.status(response.status);
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) {
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    } else {
      res.end();
    }
  } catch (err) {
    console.error('[catchall-server] dispatch error:', err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`[catchall-server] listening on :${port}`);
});
