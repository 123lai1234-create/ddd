// api/[...slug].mjs — Vercel Serverless Function (catch-all).
// The `[...slug]` filename is the Vercel convention for multi-segment
// catch-all routes. Previously we used `[...path]` which Vercel
// appears to interpret as a single-segment catch-all (matches /api/foo
// but not /api/foo/bar).
//
// We boot a tiny in-process HTTP server, route the Node IncomingMessage
// through it (so Express gets a real ServerResponse), capture the
// response, and stream it back into res.

import { createServer, request as httpRequest } from "node:http";

let _appPromise = null;
async function getApp() {
  if (!_appPromise) {
    _appPromise = import("../_backend.mjs").then((m) => m.default || m.app);
  }
  return _appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  // Vercel rewrites from /api/<path> to /api, with the original path
  // delivered two ways:
  //  - `p` query string (set explicitly in vercel.json: destination "/api?p=:path*")
  //  - `x-vercel-original-path` / `x-original-url` headers (Vercel fallback)
  // Prefer the explicit query param so the rewrite is self-documenting.
  const url = new URL(req.url, "http://localhost");
  const originalPath = url.searchParams.get("p")
    ? `/${url.searchParams.get("p")}${url.searchParams.toString().includes("=") ? "?" + url.searchParams.toString().split("&").filter(s => s.startsWith("p=") === false).join("&") : ""}`
    : (req.headers["x-vercel-original-path"] || req.headers["x-original-url"] || req.url);
  // Rebuild the URL preserving the original query string (drop the
  // injected `p` param so it doesn't leak into backend route handlers).
  const originalQs = req.headers["x-vercel-original-path"] || req.headers["x-original-url"]
    ? new URL(originalPath, "http://localhost").search
    : "";
  const finalUrl = new URL(originalPath, "http://localhost");
  if (originalQs) finalUrl.search = originalQs;
  // Strip the injected `p` param if present.
  finalUrl.searchParams.delete("p");
  const path = finalUrl.pathname + finalUrl.search;

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
      delete headers["content-length"];
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

// maxDuration only — let Vercel auto-pick the runtime from the .mjs
// extension (nodejs20.x on this project's pinned version).
export const config = {
  maxDuration: 60,
};
