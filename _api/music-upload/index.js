// api/music-upload.mjs — pure fetch + hex encode, no native deps
export const config = { runtime: 'edge' };
const UPLOAD_PASSWORD = '123';

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Neon HTTP API: sends {queries:[{query,params}]}, receives {results:[{rows,fields,command,rowCount}]}
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
  // Always {results: [{rows, command, rowCount}]}
  return data;
}

// Get rows from first query result
function firstRows(data) {
  return data?.results?.[0]?.rows || [];
}

function checkPassword(req) {
  return req.headers.get('x-upload-password') === UPLOAD_PASSWORD;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  if (!checkPassword(req)) return jsonResponse({ error: 'wrong_password' }, 401);

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const id = url.searchParams.get('id');
  const idx = url.searchParams.get('idx');

  try {
    if (action === 'init') {
      const body = await req.json().catch(() => null);
      if (!body?.id || !body?.name) return jsonResponse({ error: 'missing_fields' }, 400);
      const { id: rid, name, artist = '上傳歌曲', audioType = 'audio/mpeg' } = body;
      await neonQuery(`
        INSERT INTO music_uploads (id, name, artist, audio_type, status)
        VALUES ($1, $2, $3, $4, 'init')
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, artist=EXCLUDED.artist,
          audio_type=EXCLUDED.audio_type, status='init',
          audio_data=NULL, audio_size=NULL, lyrics_text=NULL, created_at=NOW()
      `, [rid, name, artist, audioType]);
      return jsonResponse({ ok: true, id: rid });
    }

    if (action === 'chunk') {
      if (!id || idx === null) return jsonResponse({ error: 'missing_id_or_idx' }, 400);
      const buf = await req.arrayBuffer();
      if (!buf || buf.byteLength === 0) return jsonResponse({ error: 'empty_chunk' }, 400);
      const hex = '\\x' + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      await neonQuery(`
        UPDATE music_uploads
        SET audio_data = CASE WHEN audio_data IS NULL THEN $2::bytea
          ELSE audio_data || $2::bytea END
        WHERE id = $1
      `, [id, hex]);
      return jsonResponse({ ok: true, id, idx: parseInt(idx), size: buf.byteLength });
    }

    if (action === 'finalize') {
      if (!id) return jsonResponse({ error: 'missing_id' }, 400);
      const body = await req.json().catch(() => ({}));
      const lyrics = body?.lyrics ? String(body.lyrics) : null;
      const audioType = body?.audioType || 'audio/mpeg';
      const rows = firstRows(await neonQuery(`
        UPDATE music_uploads
        SET status='complete', audio_type=$2,
            audio_size=OCTET_LENGTH(audio_data), lyrics_text=$3
        WHERE id = $1
        RETURNING id, OCTET_LENGTH(audio_data) as audio_size
      `, [id, audioType, lyrics]));
      if (!rows.length) return jsonResponse({ error: 'id_not_found' }, 404);
      return jsonResponse({ ok: true, id, audioSize: rows[0][1] });
    }

    if (action === 'delete') {
      if (!id) return jsonResponse({ error: 'missing_id' }, 400);
      await neonQuery(`DELETE FROM music_uploads WHERE id = $1`, [id]);
      return jsonResponse({ ok: true, id });
    }

    if (action === 'inspect') {
      if (!id) return jsonResponse({ error: 'missing_id' }, 400);
      const rows = firstRows(await neonQuery(
        `SELECT id, status, OCTET_LENGTH(audio_data) as sz, audio_size, audio_type FROM music_uploads WHERE id=$1`,
        [id]
      ));
      return jsonResponse({ id, row: rows[0] || null });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('[music-upload]', err);
    return jsonResponse({ error: 'server_error', message: err?.message }, 500);
  }
}
