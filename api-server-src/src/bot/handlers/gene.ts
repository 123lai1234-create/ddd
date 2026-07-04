/**
 * 🔬 Gene AI handler
 *
 *   gene              → 主題摘要 + 連結
 *   crispr <seq>      → CRISPR guide RNA 評分 (GC content + off-target heuristic)
 *   promoter <seq>    → 啟動子強度預測 (TATA box + GC content)
 */

import type { Handler } from "../dispatcher";
import type { LineMessage } from "../../lib/line";
import { topicCard, TOPICS, THEME, textBubble } from "../../lib/flex-topics";
import { logger } from "../../lib/logger";

const T = TOPICS.find((t) => t.id === "gene")!;

// ---- Mock implementations --------------------------------------------------

function gcContent(seq: string): number {
  const s = seq.toUpperCase().replace(/[^ACGT]/g, "");
  if (!s.length) return 0;
  let gc = 0;
  for (const ch of s) if (ch === "G" || ch === "C") gc++;
  return gc / s.length;
}

/**
 * CRISPR guide 評分 (0-100)：
 *   - 長度 20 ± 2 最佳
 *   - GC 40-60% 最佳
 *   - 不允許 poly-T（TTTT = RNA pol III terminator）
 */
function scoreCrispr(seq: string): { score: number; reasons: string[] } {
  const s = seq.toUpperCase().replace(/[^ACGT]/g, "");
  const reasons: string[] = [];
  let score = 100;

  // length penalty
  const lenDelta = Math.abs(s.length - 20);
  if (lenDelta > 0) {
    score -= lenDelta * 5;
    reasons.push(`長度 ${s.length} (理想 20)`);
  }

  // GC penalty
  const gc = gcContent(s);
  if (gc < 0.4 || gc > 0.6) {
    score -= Math.round(Math.abs(gc - 0.5) * 200);
    reasons.push(`GC ${(gc * 100).toFixed(0)}% (理想 40-60%)`);
  }

  // poly-T terminator
  if (/TTTT/.test(s)) {
    score -= 50;
    reasons.push("⚠️ 含 TTTT (Pol III terminator)");
  }

  // 5' G preference for U6 promoter
  if (s[0] === "G") {
    score += 5;
    reasons.push("5' G ✓ (U6 promoter 友善)");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * 啟動子強度 (0-1)：
 *   - TATA box (TATAAA) +10
 *   - GC-rich region >60% +10
 *   - length < 50 扣分
 */
function scorePromoter(seq: string): { score: number; reasons: string[] } {
  const s = seq.toUpperCase();
  const reasons: string[] = [];
  let score = 0.5;

  if (/TATA(AA|A)/.test(s)) {
    score += 0.15;
    reasons.push("✓ TATA box");
  }
  const gc = gcContent(s);
  if (gc > 0.6) {
    score += 0.1;
    reasons.push(`✓ GC-rich ${(gc * 100).toFixed(0)}%`);
  }
  if (s.length < 50) {
    score -= 0.1;
    reasons.push(`⚠️ 長度 ${s.length} 太短`);
  }

  return { score: Math.max(0, Math.min(1, +score.toFixed(2))), reasons };
}

// ---- Handlers --------------------------------------------------------------

export const gene: Handler = {
  name: "gene",
  priority: 50,
  match: (t) => /^(gene|基因|gene ai)$/i.test(t.trim()),
  run: async () => [topicCard(T, `${T.blurb}\n\n試試：\n• crispr GGCACTGCGGCTGGAGAGGG\n• promoter TATAAAGCGCATGCAT`, {
    buttons: [
      { label: "CRISPR 評分", text: "crispr GGCACTGCGGCTGGAGAGGG", color: T.color },
      { label: "啟動子預測", text: "promoter TATAAAGCGCATGCAT", color: "#a371f7" },
      { label: "完整版 →", uri: T.url },
    ],
  })],
};
handlers.register(gene);

export const crispr: Handler = {
  name: "crispr",
  priority: 50,
  match: (t) => /^crispr\s+/i.test(t.trim()),
  run: async (text) => {
    const seq = text.replace(/^crispr\s*/i, "").trim().toUpperCase();
    if (!/^[ACGT]+$/.test(seq)) {
      return [textBubble("請輸入 20 nt DNA 序列（只含 ACGT）", THEME.red)];
    }
    try {
      const { score, reasons } = scoreCrispr(seq);
      const grade = score >= 80 ? "🟢 優" : score >= 60 ? "🟡 可" : "🔴 差";
      const body =
        `🔬 CRISPR Guide 評分\n\n` +
        `序列: ${seq}  (${seq.length} nt)\n` +
        `評分: ${score}/100  ${grade}\n\n` +
        (reasons.length ? "備註：\n" + reasons.map((r) => `• ${r}`).join("\n") : "✓ 全部參數都在理想範圍");
      return [textBubble(body, THEME.fg)];
    } catch (err) {
      logger.error({ err }, "crispr failed");
      return [textBubble("CRISPR 計算失敗", THEME.red)];
    }
  },
};
handlers.register(crispr);

export const promoter: Handler = {
  name: "promoter",
  priority: 50,
  match: (t) => /^promoter\s+/i.test(t.trim()),
  run: async (text) => {
    const seq = text.replace(/^promoter\s*/i, "").trim().toUpperCase();
    if (!seq) return [textBubble("請輸入啟動子序列", THEME.red)];
    try {
      const { score, reasons } = scorePromoter(seq);
      const bar = "█".repeat(Math.round(score * 20)) + "░".repeat(20 - Math.round(score * 20));
      const body =
        `🧬 啟動子強度\n\n` +
        `長度: ${seq.length} bp\n` +
        `強度: ${bar} ${(score * 100).toFixed(0)}%\n\n` +
        (reasons.length ? "備註：\n" + reasons.map((r) => `• ${r}`).join("\n") : "");
      return [textBubble(body, THEME.fg)];
    } catch (err) {
      logger.error({ err }, "promoter failed");
      return [textBubble("啟動子計算失敗", THEME.red)];
    }
  },
};
handlers.register(promoter);