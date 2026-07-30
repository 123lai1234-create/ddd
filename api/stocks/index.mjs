// api/stocks/index.mjs — GET /api/stocks
// Inline everything first to rule out import issues.

const SEED = [
  { code: "2330", name: "台積電", ticker: "2330.TW" },
  { code: "2454", name: "聯發科", ticker: "2454.TW" },
  { code: "2317", name: "鴻海",   ticker: "2317.TW" },
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
];

export default async function (req, res) {
  const t0 = Date.now();
  // Skip Neon for now — return seed directly.
  res.status(200).json({
    ok: true, source: "seed-inline", count: SEED.length, stocks: SEED,
    ms: Date.now() - t0, marker: "stocks-inline-2",
  });
}

export const config = { maxDuration: 10 };
