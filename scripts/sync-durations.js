// Scan all track_*.mp3 in astro/public/music, read duration via music-metadata,
// write into astro/public/music/playlist.json as 'duration' field per track.
const fs = require('fs');
const path = require('path');
const url = require('url');

const MUSIC_DIR = path.join(__dirname, '..', 'astro', 'public', 'music');
const PLAYLIST_PATH = path.join(MUSIC_DIR, 'playlist.json');

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

(async () => {
  // Dynamic import of ESM music-metadata
  const mm = await import(url.pathToFileURL(path.join(__dirname, '..', 'astro', 'node_modules', 'music-metadata', 'lib', 'index.js')).href);
  const raw = fs.readFileSync(PLAYLIST_PATH, 'utf-8');
  const data = JSON.parse(raw);
  const tracks = data.tracks;

  console.log(`Scanning ${tracks.length} tracks...`);
  let updated = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const audioRel = t.audio.replace(/^\//, '').replace(/^music\//, '');
    const audioPath = path.join(MUSIC_DIR, audioRel);
    if (!fs.existsSync(audioPath)) {
      console.warn(`  [${i}] MISSING: ${audioRel}`);
      continue;
    }
    try {
      const meta = await mm.parseFile(audioPath, { duration: true, skipCovers: true });
      const dur = meta?.format?.duration;
      t.duration = formatTime(dur);
      updated++;
    } catch (err) {
      console.warn(`  [${i}] ERR: ${audioRel}: ${err.message}`);
      t.duration = '--:--';
    }
  }

  fs.writeFileSync(PLAYLIST_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Done. Updated ${updated}/${tracks.length} tracks.`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
