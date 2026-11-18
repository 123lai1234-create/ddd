// kitchen-server/vercel.mjs — Vercel Node runtime glue for 不說廚房。
// 與 facility2-server/vercel.mjs 同一寫法：(req, res) => void。
import { createApp } from './engine.mjs';
import { createKitchenStore, neonConfigured } from './neon.mjs';

const app = createApp(createKitchenStore());

async function readNodeBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf-8');
}
export default async function handler(req, res) {
  const isNode = res && typeof res.setHeader === 'function' && typeof res.end === 'function';
  try {
    let method, pathname, query, bodyText = '', headers = {};
    if (isNode) {
      method = req.method || 'GET';
      const u = new URL(req.url || '/', 'https://donttalk.vercel.app');
      pathname = u.pathname; query = Object.fromEntries(u.searchParams.entries()); headers = req.headers || {};
      if (method === 'POST' || method === 'PUT') bodyText = await readNodeBody(req);
    } else {
      method = req.method; const u = new URL(req.url);
      pathname = u.pathname; query = Object.fromEntries(u.searchParams.entries()); headers = {};
      if (method === 'POST') bodyText = await req.text().catch(() => '');
    }
    let body = {};
    if (bodyText) { try { body = JSON.parse(bodyText); } catch { body = {}; } }
    if (!neonConfigured() && !(method === 'GET' && pathname.replace(/\/$/, '') === '/api/games/kitchen')) {
      const r = { status: 503, json: { error: 'DATABASE_URL_NEON 未設定' } };
      if (isNode) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(r.json)); return; }
      return new Response(JSON.stringify(r.json), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const result = await app.handle(method, pathname, query, body, headers);
    if (isNode) { res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.json)); return; }
    return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = { error: String(e && e.message ? e.message : e) };
    if (isNode) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(msg)); return; }
    return new Response(JSON.stringify(msg), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
