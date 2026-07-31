// api/music-lyrics.mjs — pure fetch, no native deps
export const config = { runtime: 'edge' };

// Neon HTTP API: {results: [{rows, fields, command, rowCount}]}
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
  if (!res.ok) throw new Error(`Neon HTTP ${res.status}`);
  const data = await res.json();
  return data?.results?.[0]?.rows || [];
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('method_not_allowed', { status: 405 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('missing_id', { status: 400 });

  try {
    const rows = await neonQuery(
      `SELECT lyrics_text FROM music_uploads WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) return new Response('not_found', { status: 404 });
    return new Response(rows[0][0] || '', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[music-lyrics]', err);
    return new Response('server_error', { status: 500 });
  }
}
