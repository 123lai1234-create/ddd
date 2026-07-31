// api/music-list.mjs — pure fetch, no native deps
export const config = { runtime: 'edge' };

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Neon HTTP API helper — uses Neon HTTP API {results: [...]} format
async function neonQuery(sql, params = []) {
  const dbUrl = process.env.DATABASE_URL;
  const host = new URL(dbUrl).hostname;
  const apiHost = host.replace(/^[^.]+\./, 'api.');
  const endpoint = `https://${apiHost}/sql`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Raw-Text-Output': 'true',
      'Neon-Array-Mode': 'true',
      'Neon-Connection-String': dbUrl,
    },
    body: JSON.stringify({ queries: [{ query: sql, params }] }),
  });
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  // Neon HTTP API returns {results: [{rows: [[...]], command: "...", rowCount: N}]}
  return data;
}

// Convenience: get rows from first query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result[0]?.rows || [];
  return result.results?.[0]?.rows || [];
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('method_not_allowed', { status: 405 });
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  try {
    await neonQuery(`
      CREATE TABLE IF NOT EXISTS music_uploads (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '上傳歌曲',
        audio_data BYTEA, audio_size BIGINT,
        audio_type TEXT NOT NULL DEFAULT 'audio/mpeg',
        lyrics_text TEXT, status TEXT NOT NULL DEFAULT 'init',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const rows = getRows(await neonQuery(`
      SELECT id, name, artist, audio_size, audio_type, created_at
      FROM music_uploads
      WHERE status = 'complete' AND audio_data IS NOT NULL
      ORDER BY created_at DESC LIMIT 200
    `));
    return jsonResponse({
      tracks: rows.map(r => ({
        id: r[0], name: r[1], artist: r[2],
        audioSize: r[3], audioType: r[4], createdAt: r[5],
        audioUrl: `${origin}/api/music-stream?id=${encodeURIComponent(r[0])}`,
        lyricsUrl: `${origin}/api/music-lyrics?id=${encodeURIComponent(r[0])}`,
      })),
    });
  } catch (err) {
    console.error('[music-list]', err);
    return jsonResponse({ error: 'server_error', message: err?.message }, 500);
  }
}
