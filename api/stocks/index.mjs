// api/stocks/index.mjs — GET /api/stocks (super simple inline, no imports)
const SEED = [
  { code: "2330", name: "台積電", ticker: "2330.TW" },
  { code: "2454", name: "聯發科", ticker: "2454.TW" },
  { code: "2317", name: "鴻海",   ticker: "2317.TW" },
  { code: "0050", name: "元大台灣50", ticker: "0050.TW" },
];

export default function () {
  return new Response(JSON.stringify({
    ok: true, source: "seed-inline", count: SEED.length, stocks: SEED,
    t: Date.now(), node: process.version, marker: "inline-2",
  }), { headers: { "Content-Type": "application/json" } });
}
export const config = { maxDuration: 15 };
