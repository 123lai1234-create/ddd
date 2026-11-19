// kitchen-server/local-server.mjs — 本機驗證伺服器（不上線、不進版控流程外使用）。
// 靜態 serve astro/dist + /api/games/kitchen* 走 in-memory 引擎，
// 讓 headless 瀏覽器用「真前端＋真後端」跑雙人流程。
// Run: node kitchen-server/local-server.mjs [port]  (預設 8901)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'astro', 'dist');
const PORT = Number(process.argv[2] || 8901);

function memoryStore() {
  const rooms = new Map(), accounts = new Map(), byName = new Map(), byEmail = new Map(), sessions = new Map(), records = new Map(), oauth = new Map();
  return {
    async getKitchenRoom(c) { return rooms.get(String(c).toUpperCase()) || null; },
    async saveKitchenRoom(r) { rooms.set(r.code, r); },
    async listKitchenRooms() { return [...rooms.values()]; },
    async getRoom(c) { return rooms.get(String(c).toUpperCase()) || null; },
    async saveRoom(r) { rooms.set(r.code, r); },
    async listRooms() { return [...rooms.values()]; },
    async getAccount(id) { return accounts.get(id) || null; },
    async getAccountByName(n) { return byName.get(n) || null; },
    async getAccountByEmail(e) { return byEmail.get(e) || null; },
    async saveAccount(a) { accounts.set(a.id, a); byName.set(a.display_name, a); if (a.email) byEmail.set(a.email, a); },
    async getSession(h) { return sessions.get(h) || null; },
    async saveSession(s) { sessions.set(s.token_hash, s); },
    async deleteSession(h) { sessions.delete(h); },
    async getRecord(id) { return records.get(id) || null; },
    async saveRecord(r) { records.set(r.account_id, r); },
    async getOAuth(s) { return oauth.get(s) || null; },
    async saveOAuth(o) { oauth.set(o.state, o); },
    async deleteOAuth(s) { oauth.delete(s); },
  };
}
const app = createApp(memoryStore());
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/api/games/kitchen')) {
      let bodyText = '';
      for await (const c of req) bodyText += c;
      let body = {};
      if (bodyText) { try { body = JSON.parse(bodyText); } catch { body = {}; } }
      const result = await app.handle(req.method, u.pathname, Object.fromEntries(u.searchParams.entries()), body, req.headers);
      res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.json));
      return;
    }
    let p = u.pathname;
    if (p === '/games/kitchen') { res.writeHead(308, { Location: '/games/kitchen/' }); res.end(); return; }
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(dist, decodeURIComponent(p));
    if (!file.startsWith(dist) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`kitchen verify server on http://127.0.0.1:${PORT}`));
