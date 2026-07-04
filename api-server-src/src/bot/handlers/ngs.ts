/**
 * 📊 NGS handler
 *
 *   ngs                              → 主題摘要
 *   depth <samples> <coverage>      → 計算建議讀序數
 *
 * 公式（illumina WGS, human 3Gb genome）：
 *   reads = (genome_size * coverage) / (read_length * 2) * samples
 */

import type { Handler } from "../dispatcher";
import type { LineMessage } from "../../lib/line";
import { topicCard, TOPICS, THEME, textBubble } from "../../lib/flex-topics";

const T = TOPICS.find((t) => t.id === "ngs")!;

const GENOMES: Record<string, { size: number; name: string }> = {
  human: { size: 3_000_000_000, name: "Human (3 Gb)" },
  mouse: { size: 2_700_000_000, name: "Mouse (2.7 Gb)" },
  ecoli: { size: 4_600_000, name: "E. coli (4.6 Mb)" },
  yeast: { size: 12_000_000, name: "Yeast (12 Mb)" },
};

interface DepthArgs {
  genome: string;
  coverage: number;
  samples: number;
  readLen: number;
}

function parseDepth(text: string): DepthArgs | null {
  // forms:
  //   depth <samples> <coverage>
  //   depth <genome> <samples> <coverage> [read_len]
  const parts = text.replace(/^depth\s*/i, "").trim().split(/\s+/);
  if (parts.length < 2) return null;

  // try: depth <samples> <coverage>
  if (parts.length === 2) {
    const samples = Number(parts[0]);
    const coverage = Number(parts[1]);
    if (!Number.isFinite(samples) || !Number.isFinite(coverage)) return null;
    return { genome: "human", coverage, samples, readLen: 150 };
  }

  // try: depth <genome> <samples> <coverage> [read_len]
  const genome = parts[0].toLowerCase();
  if (!(genome in GENOMES)) {
    // shift: maybe first is samples
    const samples = Number(parts[0]);
    const coverage = Number(parts[1]);
    if (!Number.isFinite(samples) || !Number.isFinite(coverage)) return null;
    return { genome: "human", coverage, samples, readLen: parts[2] ? Number(parts[2]) : 150 };
  }
  const samples = Number(parts[1]);
  const coverage = Number(parts[2]);
  const readLen = parts[3] ? Number(parts[3]) : 150;
  if (!Number.isFinite(samples) || !Number.isFinite(coverage) || !Number.isFinite(readLen)) return null;
  return { genome, coverage, samples, readLen };
}

function calcReads(g: DepthArgs): { reads: number; bp: number; gb: number } {
  const genome = GENOMES[g.genome];
  const bp = genome.size * g.coverage * g.samples;
  const reads = bp / g.readLen;
  const gb = bp / 1e9;
  return { reads: Math.ceil(reads), bp, gb: +gb.toFixed(2) };
}

export const ngs: Handler = {
  name: "ngs",
  priority: 50,
  match: (t) => /^(ngs|定序|次世代)$/i.test(t.trim()),
  run: async () => [topicCard(T, `${T.blurb}\n\n試試：\n• depth 30 100  (人類 WGS 30 樣本 100x)\n• depth ecoli 5 50 150`, {
    buttons: [
      { label: "深度計算", text: "depth 30 100", color: T.color },
      { label: "完整版 →", uri: T.url },
    ],
  })],
};
handlers.register(ngs);

export const depth: Handler = {
  name: "depth",
  priority: 50,
  match: (t) => /^depth\s+/i.test(t.trim()),
  run: async (text) => {
    const args = parseDepth(text);
    if (!args) {
      return [textBubble(
        "用法：\n• `depth <樣本數> <覆蓋率>` (人類 150bp)\n• `depth <基因體> <樣本數> <覆蓋率> [讀長]`\n基因體：human / mouse / ecoli / yeast",
        THEME.muted,
      )];
    }
    const { reads, gb } = calcReads(args);
    const cost = (gb * 5).toFixed(0); // rough $5/Gb Illumina WGS estimate
    const body =
      `📊 NGS 讀序計算\n\n` +
      `基因體: ${GENOMES[args.genome].name}\n` +
      `讀長: ${args.readLen} bp (paired-end → 2x)\n` +
      `樣本: ${args.samples}\n` +
      `覆蓋率: ${args.coverage}x\n\n` +
      `總讀序: ${reads.toLocaleString()}  reads\n` +
      `總資料: ${gb.toLocaleString()} Gb\n` +
      `💰 預估成本: ~$${cost} USD\n\n` +
      `(成本為公開市場行情估算)`;
    return [textBubble(body, THEME.fg)];
  },
};
handlers.register(depth);