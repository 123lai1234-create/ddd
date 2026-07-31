// api/music-stream.mjs — pure fetch, no native deps
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
  return data;
}

// Decode hex string \\x... or plain hex to Uint8Array
function hexToBytes(hex) {
  const clean = hex.startsWith('\\x') ? hex.slice(2) : hex.replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function decodeAudio(raw) {
  if (!raw) return new Uint8Array(0);
  if (typeof raw === 'string') return hexToBytes(raw);
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return new Uint8Array(0);
}

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('method_not_allowed', { status: 405 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('missing_id', { status: 400 });

  try {
    const data = await neonQuery(`
      SELECT audio_data, audio_type, audio_size
      FROM music_uploads
      WHERE id = $1 AND status = 'complete' AND audio_data IS NOT NULL
      LIMIT 1
    `, [id]);
    const rows = data?.results?.[0]?.rows || [];
    if (!rows.length) return new Response('not_found', { status: 404 });

    const [rawAudio, audioType, audioSize] = rows[0];
    const bytes = decodeAudio(rawAudio);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': audioType || 'audio/mpeg',
        'Content-Length': String(audioSize || bytes.length),
        'Cache-Control': 'private, max-age=3600',
        'Accept-Ranges': 'none',
      },
    });
  } catch (err) {
    console.error('[music-stream]', err);
    return new Response('server_error', { status: 500 });
  }
}
