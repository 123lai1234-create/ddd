import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchCandles } from "./_lib/yahoo";

const r2 = (n: number) => Math.round(n * 100) / 100;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const lookback = Number(req.query.lookback ?? 120) || 120;
  const minGap = Number(req.query.min_gap ?? 0.3) || 0.3;
  try {
    const candles = await fetchCandles("^TWII", 400);
    const slice = candles.slice(-lookback);
    const gaps: { date: string; type: string; from: number; to: number; gap_pct: number; filled: boolean }[] = [];
    for (let i = 1; i < slice.length; i++) {
      const prev = slice[i - 1];
      const cur = slice[i];
      if (cur.low > prev.high) {
        const gapPct = r2(((cur.low - prev.high) / prev.high) * 100);
        if (gapPct >= minGap) {
          const filled = slice.slice(i + 1).some((c) => c.low <= prev.high);
          gaps.push({ date: cur.time, type: "up", from: prev.high, to: cur.low, gap_pct: gapPct, filled });
        }
      } else if (cur.high < prev.low) {
        const gapPct = r2(((prev.low - cur.high) / prev.low) * 100);
        if (gapPct >= minGap) {
          const filled = slice.slice(i + 1).some((c) => c.high >= prev.low);
          gaps.push({ date: cur.time, type: "down", from: prev.low, to: cur.high, gap_pct: gapPct, filled });
        }
      }
    }
    const unfilled = gaps.filter((g) => !g.filled);
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");
    res.status(200).json({
      "^TWII": {
        name: "加權指數",
        gaps,
        summary: {
          total: gaps.length,
          unfilled: unfilled.length,
          up: gaps.filter((g) => g.type === "up").length,
          down: gaps.filter((g) => g.type === "down").length,
        },
      },
    });
  } catch {
    res.status(200).json({
      "^TWII": { name: "加權指數", gaps: [], summary: { total: 0, unfilled: 0, up: 0, down: 0 } },
    });
  }
}
