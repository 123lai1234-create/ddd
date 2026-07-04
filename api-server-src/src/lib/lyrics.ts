// Lyrics service — backs the LINE bot's "隨機歌詞" / "歌詞 <keyword>" commands.
//
// Data sources (all already deployed at donttalk.vercel.app):
//   - /music/playlist.json     → 33 tracks with lyrics path
//   - /music/lyrics_NNN.txt    → raw lyrics, UTF-8 plain text
//
// Two-level in-memory cache:
//   - index cache: playlist.json for 10 min
//   - track cache: lyrics body for 30 min
//
// The Express route imports { randomLyrics, searchLyrics } — same API as
// the JS version that backs api/line/lyrics.js.

import { logger } from "./logger";

const SITE = "https://donttalk.vercel.app";
const PLAYLIST_URL = `${SITE}/music/playlist.json`;
const UA = "Mozilla/5.0 (compatible; donttalk-line-ts/1.0; +https://donttalk.vercel.app)";

const INDEX_TTL_MS = 10 * 60 * 1000;
const TRACK_TTL_MS = 30 * 60 * 1000;

export interface Track {
  id: number;
  title: string;
  artist: string;
  language: string;
  lyricsUrl: string;
}

interface IndexCache {
  fetchedAt: number;
  tracks: Track[];
}

interface TrackCache {
  fetchedAt: number;
  body: string;
}

let indexCache: IndexCache | null = null;
const trackCache = new Map<number, TrackCache>();

// ── Index ──────────────────────────────────────────────────────────

function normalizeIndexEntry(t: Record<string, unknown>): Track | null {
  const lyricsPath = typeof t["lyrics"] === "string" ? (t["lyrics"] as string) : "";
  const m = lyricsPath.match(/lyrics_(\d+)\.txt$/);
  const id = m ? Number(m[1]) : null;
  if (!id) return null;
  return {
    id,
    title: typeof t["title"] === "string" && t["title"] ? (t["title"] as string) : `第 ${id} 首`,
    artist: typeof t["artist"] === "string" ? (t["artist"] as string) : "",
    language: typeof t["language"] === "string" ? (t["language"] as string) : "",
    lyricsUrl: lyricsPath.startsWith("http")
      ? lyricsPath
      : `${SITE}${lyricsPath.startsWith("/") ? "" : "/"}${lyricsPath}`,
  };
}

async function loadIndex(timeoutMs = 4000): Promise<{ tracks: Track[]; stale: boolean }> {
  if (indexCache && Date.now() - indexCache.fetchedAt < INDEX_TTL_MS) {
    return { tracks: indexCache.tracks, stale: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(PLAYLIST_URL, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`playlist ${res.status}`);
    const json = (await res.json()) as { tracks?: Array<Record<string, unknown>> };
    const rawTracks = Array.isArray(json?.tracks) ? json.tracks : [];
    const tracks = rawTracks
      .map(normalizeIndexEntry)
      .filter((t): t is Track => Boolean(t))
      .sort((a, b) => a.id - b.id);
    indexCache = { fetchedAt: Date.now(), tracks };
    return { tracks, stale: false };
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ err: String(err) }, "lyrics index load failed");
    if (indexCache) return { tracks: indexCache.tracks, stale: true };
    throw err;
  }
}

// ── Track body ─────────────────────────────────────────────────────

async function fetchTrackBody(track: Track, timeoutMs = 4000): Promise<{ body: string; stale: boolean }> {
  const hit = trackCache.get(track.id);
  if (hit && Date.now() - hit.fetchedAt < TRACK_TTL_MS) {
    return { body: hit.body, stale: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(track.lyricsUrl, {
      headers: { "User-Agent": UA, Accept: "text/plain" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`lyrics ${track.id} ${res.status}`);
    const body = await res.text();
    trackCache.set(track.id, { fetchedAt: Date.now(), body });
    return { body, stale: false };
  } catch (err) {
    clearTimeout(timer);
    if (hit) return { body: hit.body, stale: true };
    throw err;
  }
}

// ── Search helpers ─────────────────────────────────────────────────

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const hasCjk = /[一-鿿]/.test(word);
    if (hasCjk) {
      for (const ch of word) {
        if (/[一-鿿]/.test(ch)) out.push(ch);
      }
    } else {
      out.push(word.toLowerCase());
    }
  }
  return out;
}

function scoreBody(body: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  const lower = body.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (t.length === 1) {
      let i = 0;
      while ((i = lower.indexOf(t, i)) !== -1) {
        score++;
        i += t.length;
      }
    } else if (lower.includes(t)) {
      score += 3;
    }
  }
  return score;
}

function previewLines(body: string, maxChars = 140): string {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const picked: string[] = [];
  let len = 0;
  for (const ln of lines) {
    if (len + ln.length + 1 > maxChars) break;
    picked.push(ln);
    len += ln.length + 1;
  }
  return picked.join("\n");
}

function firstMatchLine(body: string, tokens: string[]): string | null {
  const lines = body.split(/\r?\n/);
  for (const ln of lines) {
    const lower = ln.toLowerCase();
    if (tokens.some((t) => lower.includes(t))) return ln.trim();
  }
  return null;
}

// ── Public API ─────────────────────────────────────────────────────

export interface LyricsResultTrack extends Track {
  score: number;
  preview: string;
}

export interface LyricsResult {
  ok: boolean;
  kind: "random" | "search";
  query?: string;
  count: number;
  source: string;
  tracks: LyricsResultTrack[];
  error?: string;
}

/** Random lyrics pick. */
export async function randomLyrics(opts: { timeoutMs?: number } = {}): Promise<LyricsResult> {
  const { timeoutMs = 4000 } = opts;
  const { tracks, stale } = await loadIndex(timeoutMs);
  if (!tracks.length) return { ok: false, kind: "random", count: 0, source: "error", tracks: [], error: "empty playlist" };
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  const { body, stale: bodyStale } = await fetchTrackBody(track, timeoutMs);
  return {
    ok: true,
    kind: "random",
    count: 1,
    source: stale || bodyStale ? "cache-stale" : "live",
    tracks: [{ ...track, score: 0, preview: previewLines(body, 140) }],
  };
}

/** Keyword search across lyrics. */
export async function searchLyrics(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<LyricsResult> {
  const { limit = 3, timeoutMs = 8000 } = opts;
  const q = (query ?? "").trim();
  if (!q) return { ok: false, kind: "search", count: 0, source: "error", tracks: [], error: "empty query" };

  const tokens = tokenize(q);
  if (!tokens.length) return { ok: false, kind: "search", count: 0, source: "error", tracks: [], error: "no searchable tokens" };

  const { tracks, stale } = await loadIndex(timeoutMs);
  // Parallel fetch with concurrency cap so we don't blast 33 concurrent requests.
  const CONCURRENCY = 6;
  const PER_FETCH_MS = Math.max(1500, Math.floor((timeoutMs - 500) / Math.ceil(tracks.length / CONCURRENCY)));
  const scored: LyricsResultTrack[] = [];

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tracks.length) {
      const idx = cursor++;
      const t = tracks[idx];
      try {
        const { body } = await fetchTrackBody(t, PER_FETCH_MS);
        const s = scoreBody(body, tokens);
        if (s > 0) {
          const highlight = firstMatchLine(body, tokens);
          scored.push({
            ...t,
            score: s,
            preview: highlight ? highlight : previewLines(body, 120),
          });
        }
      } catch {
        // skip tracks we can't fetch
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker));
  scored.sort((a, b) => b.score - a.score);

  return {
    ok: true,
    kind: "search",
    query: q,
    count: scored.length,
    source: stale ? "cache-stale" : "live",
    tracks: scored.slice(0, limit),
  };
}

/** Health/debug helper. */
export function cacheInfo(): {
  index: { fetchedAt: number; tracks: number; ageMs: number } | null;
  tracks: number;
} {
  return {
    index: indexCache
      ? { fetchedAt: indexCache.fetchedAt, tracks: indexCache.tracks.length, ageMs: Date.now() - indexCache.fetchedAt }
      : null,
    tracks: trackCache.size,
  };
}