/**
 * 🔍 Site search handler — search the portfolio's llms-full.txt index.
 *
 *   搜尋 <keyword> / search <keyword> / 找 <keyword>
 *
 * Wraps the existing `lib/site-search.ts` (searchSite) into the dispatcher.
 */

import type { Handler } from "../dispatcher";
import { searchResultsFlex } from "../../lib/flex-templates";
import { searchSite } from "../../lib/site-search";
import { textBubble, THEME } from "../../lib/flex-topics";
import { logger } from "../../lib/logger";

export const siteSearch: Handler = {
  name: "site-search",
  priority: 50,
  match: (t) => /^(?:搜尋|search|找)\s+.+/i.test(t.trim()),
  run: async (text) => {
    const q = text.replace(/^(?:搜尋|search|找)\s+/i, "").trim();
    if (!q) return [textBubble("用法：搜尋 <關鍵字>", THEME.muted)];
    try {
      const r = await searchSite(q, { limit: 5, timeoutMs: 4000 });
      if (!r.ok || !r.results.length) {
        return [textBubble(
          `站內找不到「${q}」相關作品。試試「蛋白質」「基因」「NGS」「RL」「BoTorch」這類技術關鍵字。`,
          THEME.muted,
        )];
      }
      return [searchResultsFlex(q, r.results)];
    } catch (err) {
      logger.error({ err, q }, "site search failed");
      return [textBubble("搜尋錯誤，請稍後再試。", THEME.red)];
    }
  },
};
handlers.register(siteSearch);