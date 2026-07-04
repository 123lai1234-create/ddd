/**
 * 🧬 Protein AI handler
 *
 *   protein                    → 主題摘要 + 連結
 *   esm <seqA> vs <seqB>       → ESM-2 相似度（mock 計算，本地無 ML）
 *   mpnn <pdb_id>              → ProteinMPNN 設計序列（mock 回傳骨架）
 *
 * Mock 設計：cosine similarity 用「胺基酸組成向量」算（不準但 demo 用），面試時
 * 解釋「介面已寫好，換實作接 HF Space / 本地 ESM-2 模型只改 runEsmSimilarity」。
 */

import type { Handler, Ctx } from "../dispatcher";
import type { LineMessage } from "../../lib/line";
import { topicCard, TOPICS, THEME, textBubble } from "../../lib/flex-topics";
import { logger } from "../../lib/logger";

const T = TOPICS.find((t) => t.id === "protein")!;

// ---- Mock implementations --------------------------------------------------

const AA = "ACDEFGHIKLMNPQRSTVWY";
function aaVector(seq: string): number[] {
  const v = new Array(AA.length).fill(0);
  for (const ch of seq.toUpperCase()) {
    const i = AA.indexOf(ch);
    if (i >= 0) v[i]++;
  }
  return v;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] ** 2;
    nb += b[i] ** 2;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function runEsmSimilarity(seqA: string, seqB: string): Promise<{ sim: number; lenA: number; lenB: number }> {
  // In production: fetch(`${HF_SPACE_URL}/esm`, { method: 'POST', body: JSON.stringify({ seqA, seqB }) })
  // For demo: cheap local heuristic
  const sim = cosine(aaVector(seqA), aaVector(seqB));
  return { sim: +sim.toFixed(3), lenA: seqA.length, lenB: seqB.length };
}

async function runMpnnDesign(pdbId: string): Promise<{ pdbId: string; sequence: string; confidence: number }> {
  // In production: call ProteinMPNN backend or local model
  // For demo: deterministic mock based on PDB id hash
  let h = 0;
  for (const ch of pdbId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const seed = h % 1000;
  const len = 50 + (seed % 80);
  const seq = Array.from({ length: len }, (_, i) => AA[(h + i * 7) % AA.length]).join("");
  return { pdbId: pdbId.toLowerCase(), sequence: seq, confidence: +((seed % 100) / 100).toFixed(2) };
}

// ---- Handlers --------------------------------------------------------------

export const protein: Handler = {
  name: "protein",
  priority: 50,
  match: (t) => /^(protein|蛋白質|protein ai)$/i.test(t.trim()),
  run: async () => [topicCard(T, `${T.blurb}\n\n試試：\n• esm MKTIIALSY vs MRIIALSY\n• mpnn 1ubq`, {
    buttons: [
      { label: "ESM-2 相似度", text: "esm MKTIIALSY vs MRIIALSY", color: T.color },
      { label: "ProteinMPNN", text: "mpnn 1ubq", color: "#a371f7" },
      { label: "完整版 →", uri: T.url },
    ],
  })],
};
handlers.register(protein);

export const esm: Handler = {
  name: "esm",
  priority: 50,
  match: (t) => /^esm\s+/i.test(t.trim()),
  run: async (text) => {
    // parse: esm <seqA> vs <seqB>
    const m = text.match(/^esm\s+([A-Za-z]+)\s+(?:vs|和|与)\s+([A-Za-z]+)/i);
    if (!m) return [textBubble("格式：`esm <序列A> vs <序列B>`", THEME.red)];
    const [, a, b] = m;
    try {
      const { sim, lenA, lenB } = await runEsmSimilarity(a, b);
      const pct = (sim * 100).toFixed(1);
      const bar = "█".repeat(Math.round(sim * 20)) + "░".repeat(20 - Math.round(sim * 20));
      const body =
        `🧬 ESM-2 相似度\n\n` +
        `A: ${a}  (${lenA} aa)\n` +
        `B: ${b}  (${lenB} aa)\n\n` +
        `${bar} ${pct}%\n\n` +
        `⚠️ Demo: 本地 heuristic，介面已寫好接 HF Space。`;
      return [textBubble(body, THEME.fg)];
    } catch (err) {
      logger.error({ err }, "esm failed");
      return [textBubble("ESM 計算失敗，請稍後再試", THEME.red)];
    }
  },
};
handlers.register(esm);

export const mpnn: Handler = {
  name: "mpnn",
  priority: 50,
  match: (t) => /^mpnn(\s+|$)/i.test(t.trim()),
  run: async (text) => {
    const arg = text.replace(/^mpnn\s*/i, "").trim();
    if (!arg) {
      return [textBubble("用法：`mpnn <pdb_id>` 例如 `mpnn 1ubq`", THEME.muted)];
    }
    const { pdbId, sequence, confidence } = await runMpnnDesign(arg);
    const preview = sequence.length > 60 ? sequence.slice(0, 60) + "..." : sequence;
    const body =
      `🧪 ProteinMPNN 設計\n\n` +
      `PDB: ${pdbId.toUpperCase()}\n` +
      `長度: ${sequence.length} aa\n` +
      `信心: ${(confidence * 100).toFixed(0)}%\n\n` +
      `${preview}\n\n` +
      `👉 完整互動版：${T.url.replace("/report", "/protein-mpnn")}`;
    return [textBubble(body, THEME.fg)];
  },
};
handlers.register(mpnn);