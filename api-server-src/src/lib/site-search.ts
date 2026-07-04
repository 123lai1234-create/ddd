// Site search backed by https://donttalk.vercel.app/llms-full.txt.
//
// Why this and not Pagefind: Pagefind is a browser-side WASM index that
// needs to run inside a DOM. From a Vercel serverless function that's
// impractical (would need to ship the WASM + the entire fragment index).
// The site's /llms-full.txt is a curated, plain-text sitemap that already
// lists every work + tech stack + URL — perfect for keyword search. ~2KB
// so we cache it in-memory.
//
// Public API:
//   const r = await searchSite("protein", { limit: 3, timeoutMs: 4000 });
//   → { ok, query, results: [{title,url,excerpt,score}], source, fetchedAt }

import { logger } from "./logger";

const SITE = "https://donttalk.vercel.app";
const INDEX_URL = `${SITE}/llms-full.txt`;
const UA = "Mozilla/5.0 (compatible; donttalk-line-ts/1.0; +https://donttalk.vercel.app)";

let cache: { fetchedAt: number; body: string } | null = null;
const TTL_MS = 5 * 60 * 1000; // 5 min

async function fetchIndex(timeoutMs = 4000): Promise<{ body: string; stale: boolean }> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return { body: cache.body, stale: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(INDEX_URL, {
      headers: { "User-Agent": UA, Accept: "text/plain" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`llms-full ${res.status}`);
    const body = await res.text();
    cache = { fetchedAt: Date.now(), body };
    return { body, stale: false };
  } catch (err) {
    clearTimeout(timer);
    logger.warn({ err: String(err) }, "site-search index fetch failed");
    if (cache) return { body: cache.body, stale: true };
    throw err;
  }
}

interface Section {
  title: string;
  url: string;
  body: string;
}

function parseSections(body: string): Section[] {
  const sections: Section[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^#{2,3}\s+(.+)/);
    if (m) {
      if (current) sections.push(finalizeSection(current));
      current = { title: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(finalizeSection(current));
  return sections.filter((s) => s.body.length > 0);
}

function finalizeSection(s: { title: string; lines: string[] }): Section {
  const text = s.lines.join("\n").trim();
  const urlMatch = text.match(/https:\/\/donttalk\.vercel\.app\/[\w\-/]*/);
  return {
    title: s.title,
    url: urlMatch ? urlMatch[0] : SITE,
    body: text,
  };
}

function buildExcerpt(text: string, query: string, max = 120): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, max) + (text.length > max ? "…" : "");
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + max - 30);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + snippet + (end < text.length ? "…" : "");
}

function scoreSection(section: Section, query: string): number {
  const lower = section.body.toLowerCase();
  const q = query.toLowerCase();
  let score = 0;
  let i = 0;
  while ((i = lower.indexOf(q, i)) !== -1) {
    score++;
    i += q.length;
  }
  if (section.title.toLowerCase().includes(q)) score += 2;
  return score;
}

export interface SiteSearchResult {
  title: string;
  url: string;
  excerpt: string;
  score: number;
}

export interface SiteSearchResponse {
  ok: boolean;
  query: string;
  results: SiteSearchResult[];
  source: string;
  fetchedAt: number | null;
  error?: string;
}

export async function searchSite(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {}
): Promise<SiteSearchResponse> {
  const { limit = 3, timeoutMs = 4000 } = opts;
  const q = (query ?? "").trim();
  if (!q) return { ok: false, query: "", results: [], source: "error", fetchedAt: null, error: "empty query" };

  const { body, stale } = await fetchIndex(timeoutMs);
  const sections = parseSections(body);
  const scored = sections
    .map((s) => ({ ...s, score: scoreSection(s, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      title: s.title,
      url: s.url,
      excerpt: buildExcerpt(s.body, q, 120),
      score: s.score,
    }));

  return {
    ok: true,
    query: q,
    results: scored,
    source: stale ? "cache-stale" : "live",
    fetchedAt: cache?.fetchedAt ?? null,
  };
}

/** Health/debug helper. */
export function cacheInfo(): { fetchedAt: number; ageMs: number } | null {
  if (!cache) return null;
  return { fetchedAt: cache.fetchedAt, ageMs: Date.now() - cache.fetchedAt };
}