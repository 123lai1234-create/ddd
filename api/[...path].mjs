// api/[...path].mjs — Vercel Serverless Function wrapping the bundled
// Express app. We use the (req, res) signature Vercel uses to identify
// Node.js functions. (A `(request)` signature would mark this as an Edge
// function, which cannot use `node:http` / `node:stream`.)

import { createServer, request as httpRequest } from "node:http";

let _appPromise = null;
async function getApp() {
  if (!_appPromise) {
    _appPromise = import("../_backend.mjs").then((m) => m.default || m.app);
  }
  return _appPromise;
}

export default async function handler(req, res) {
  // Translate the Vercel IncomingMessage into a request our in-process
  // express server can handle. The simplest reliable way: spin up a tiny
  // HTTP server, fire one request at it through http.request, capture the
  // response, and stream it back into res.

  const app = await getApp();
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname + url.search;

  // Express expects (req, res) with a streaming body. Vercel's IncomingMessage
  // is itself a Readable, so we can pass it through directly.
  await new Promise((resolve) => {
    const server = createServer(app);
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch (_) {}
      resolve();
    };

    server.on("error", (err) => {
      console.error("[api] server error:", err?.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "server", message: err?.message }));
      }
      settle();
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const headers = { ...req.headers };
      delete headers.host;
      delete headers["content-length"]; // http.request sets it for us
      const proxyReq = httpRequest({
        hostname: "127.0.0.1",
        port,
        method: req.method,
        path,
        headers,
      });
      proxyReq.on("error", (e) => {
        console.error("[api] proxy req error:", e?.message);
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "proxy", message: e?.message }));
        }
        settle();
      });
      proxyReq.on("response", (proxyRes) => {
        res.statusCode = proxyRes.statusCode;
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v !== undefined) res.setHeader(k, v);
        }
        proxyRes.pipe(res);
        proxyRes.on("end", settle);
        proxyRes.on("close", settle);
        proxyRes.on("error", (e) => {
          console.error("[api] proxy res error:", e?.message);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.end();
          }
          settle();
        });
      });
      // Stream the incoming body through to the inner request.
      req.pipe(proxyReq);
      req.on("error", (e) => {
        console.error("[api] req error:", e?.message);
        proxyReq.destroy();
        if (!res.headersSent) {
          res.statusCode = 502;
          res.end();
        }
        settle();
      });
      req.on("end", () => { try { proxyReq.end(); } catch (_) {} });
    });
  });
}

export const config = {
  runtime: "nodejs20.x",
  maxDuration: 60,
};
