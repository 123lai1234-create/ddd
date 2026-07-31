// api/music-list.mjs — Vercel Edge Function
// List all uploaded music tracks from Neon. Returns minimal metadata (no audio data).

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS music_uploads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '上傳歌曲',
        audio_data BYTEA,
        audio_size BIGINT,
        audio_type TEXT NOT NULL DEFAULT 'audio/mpeg',
        lyrics_text TEXT,
        status TEXT NOT NULL DEFAULT 'init',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const rows = await sql(
      `SELECT id, name, artist, audio_size, audio_type, created_at
       FROM music_uploads
       WHERE status = 'complete' AND audio_data IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 200`
    );

    return jsonResponse({
      tracks: rows.map((r) => ({
        id: r.id,
        name: r.name,
        artist: r.artist,
        audioSize: r.audio_size,
        audioType: r.audio_type,
        audioUrl: `${origin}/api/music-stream?id=${encodeURIComponent(r.id)}`,
        lyricsUrl: `${origin}/api/music-lyrics?id=${encodeURIComponent(r.id)}`,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('[music-list] error', err);
    return jsonResponse({ error: 'server_error', message: err?.message }, 500);
  }
}
