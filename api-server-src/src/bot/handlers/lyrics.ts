/**
 * 🎵 Lyrics handler — random + keyword search.
 *
 *   隨機歌詞 / 歌詞 / random        → 隨機抽 1 首
 *   歌詞 <keyword> / lyrics <keyword>  → 搜尋
 *
 * Wraps the existing `lib/lyrics.ts` (randomLyrics, searchLyrics) into
 * the dispatcher pattern. Errors fall back to text messages.
 */

import type { Handler } from "../dispatcher";
import { lyricsResultFlex, lyricsCarouselFlex } from "../../lib/flex-templates";
import { randomLyrics, searchLyrics } from "../../lib/lyrics";
import { textBubble, THEME } from "../../lib/flex-topics";
import { logger } from "../../lib/logger";

export const lyricsRandom: Handler = {
  name: "lyrics-random",
  priority: 50,
  match: (t) => /^(隨機歌詞|歌詞|lyrics?|lyric|random)$/i.test(t.trim()),
  run: async () => {
    try {
      const r = await randomLyrics({ timeoutMs: 4000 });
      if (!r.ok || !r.tracks.length) {
        return [textBubble("歌詞服務暫時無法使用，請稍後再試。", THEME.red)];
      }
      return [lyricsResultFlex(r.tracks[0])];
    } catch (err) {
      logger.error({ err }, "lyrics random failed");
      return [textBubble("歌詞服務錯誤，請稍後再試。", THEME.red)];
    }
  },
};
handlers.register(lyricsRandom);

export const lyricsSearch: Handler = {
  name: "lyrics-search",
  priority: 50,
  match: (t) => /^(?:歌詞|lyrics?|lyric)\s+.+/i.test(t.trim()),
  run: async (text) => {
    const q = text.replace(/^(?:歌詞|lyrics?|lyric)\s+/i, "").trim();
    if (!q) return [textBubble("用法：歌詞 <關鍵字>", THEME.muted)];
    try {
      const r = await searchLyrics(q, { limit: 5, timeoutMs: 8000 });
      if (!r.ok || !r.count) {
        return [textBubble(`在 33 首歌詞裡找不到「${q}」相關內容。試試別的關鍵字？`, THEME.muted)];
      }
      if (r.tracks.length === 1) return [lyricsResultFlex(r.tracks[0])];
      return [lyricsCarouselFlex(q, r.tracks)];
    } catch (err) {
      logger.error({ err, q }, "lyrics search failed");
      return [textBubble("歌詞搜尋錯誤，請稍後再試。", THEME.red)];
    }
  },
};
handlers.register(lyricsSearch);