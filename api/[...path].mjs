// api/[...path].mjs — Vercel Serverless Function wrapping the bundled
// Express app. We boot a tiny in-process HTTP server, route the Web Request
// through it, capture the response, and return a Web Response. This avoids
// monkey-patching http internals and lets Express use a real ServerResponse.

import { createServer, request as httpRequest } from "node:http";

let _appPromise = null;
async function getApp() {
  if (!_appPromise) {
    _appPromise = import("./_backend.mjs").then((m) => m.default || m.app);
  }
  return _appPromise;
}

export default async function handler(webRequest) {
  const app = await getApp();

  // Translate Web Request headers into a plain object.
  const headers = {};
  if (webRequest.headers && typeof webRequest.headers.forEach === "function") {
    webRequest.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  } else if (webRequest.headers) {
    for (const [k, v] of Object.entries(webRequest.headers)) {
      if (typeof v === "string") headers[k.toLowerCase()] = v;
      else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
    }
  }

  const method = webRequest.method;
  const url = new URL(webRequest.url, "http://localhost");
  const path = url.pathname + url.search;
  const body = (method !== "GET" && method !== "HEAD")
    ? Buffer.from(await webRequest.arrayBuffer())
    : null;

  return new Promise((resolve) => {
    // Create a server that mounts the express app, then immediately fire
    // a request at it. Capture the response, close the server, resolve.
    const server = createServer(app);
    let settled = false;
    const settle = (resp) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch (e) { /* */ }
      resolve(resp);
    };

    server.on("error", (err) => {
      console.error("[api] server error:", err?.message);
      settle(new Response(JSON.stringify({ error: "server", message: err?.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }));
    });

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const req = httpRequest({
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers,
      });
      req.on("error", (e) => {
        console.error("[api] proxy req error:", e?.message);
        settle(new Response(JSON.stringify({ error: "proxy", message: e?.message }), {
          status: 502,
          headers: { "content-type": "application/json" },
        }));
      });
      const chunks = [];
      req.on("response", (res) => {
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const out = Buffer.concat(chunks);
          const outHeaders = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (Array.isArray(v)) {
              for (const one of v) outHeaders.append(k, String(one));
            } else if (v !== undefined) {
              outHeaders.set(k, String(v));
            }
          }
          if (!outHeaders.has("access-control-allow-origin")) {
            outHeaders.set("access-control-allow-origin", "*");
          }
          settle(new Response(out, {
            status: res.statusCode || 200,
            statusText: res.statusMessage || "",
            headers: outHeaders,
          }));
        });
      });
      if (body) req.write(body);
      req.end();
    });
  });
}

export const config = {
  runtime: "nodejs",
  maxDuration: 30,
};
