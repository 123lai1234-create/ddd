// facility2-server/vercel.mjs — Vercel Node runtime glue: (req, res) => void.
// Web Request fallback is kept for local testing only.
import { createApp } from './engine.mjs';
import { createNeonStore, neonConfigured } from './neon.mjs';

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: 'https://donttalk.vercel.app/api/games/accounts/google/callback',
  async exchange(code) {
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUri, grant_type: 'authorization_code' }) });
    return res.json().catch(() => ({}));
  },
  async userinfo(token) {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + token } });
    return res.json().catch(() => ({}));
  },
};
const app = createApp(createNeonStore(), { google: (google.clientId && google.clientSecret) ? google : null });

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
    if (!neonConfigured() && !(method === 'GET' && pathname.endsWith('/world'))) {
      const r = { status: 503, json: { error: 'DATABASE_URL_NEON 未設定' } };
      if (isNode) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(r.json)); return; }
      return new Response(JSON.stringify(r.json), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    const result = await app.handle(method, pathname, query, body, headers);
    if (result.redirect) {
      if (isNode) { res.statusCode = 302; res.setHeader('Location', result.redirect); res.end(); return; }
      return new Response(null, { status: 302, headers: { Location: result.redirect } });
    }
    if (isNode) { res.statusCode = result.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result.json)); return; }
    return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = { error: String(e && e.message ? e.message : e) };
    if (isNode) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(msg)); return; }
    return new Response(JSON.stringify(msg), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
