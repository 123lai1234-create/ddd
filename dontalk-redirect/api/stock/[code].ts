import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchCandles } from "../_lib/yahoo";
import { resolveStock } from "../_lib/stocks";
import { cached } from "../_lib/cache";
import {
  maSeries,
  computeMacd,
  computeFib,
  computeSupport,
  runStrategy,
  computeTradePlan,
  volumeBars,
  type Point,
} from "../_lib/indicators";

const r2 = (n: number) => Math.round(n * 100) / 100;
const DISPLAY = 250;

function lastVal(pts: Point[]): number | null {
  return pts.length ? pts[pts.length - 1].value : null;
}

async function buildStockPayload(code: string, name: string, ticker: string) {
  const full = await fetchCandles(ticker, 800);
  if (full.length < 30) throw new Error("insufficient data");
  const disp = full.slice(-DISPLAY);
  const start = disp[0].time;
  const within = (pts: Point[]) => pts.filter((p) => p.time >= start);

  const ma = {
    ma5: within(maSeries(full, 5)),
    ma10: within(maSeries(full, 10)),
    ma20: within(maSeries(full, 20)),
    ma60: within(maSeries(full, 60)),
    ma240: within(maSeries(full, 240)),
  };
  const macdFull = computeMacd(full);
  const macd = {
    macd_line: within(macdFull.macd_line),
    signal_line: within(macdFull.signal_line),
    histogram: within(macdFull.histogram),
    divergences: macdFull.divergences.filter((d) => d.time >= start),
  };
  const fib = computeFib(full, 90);
  const support = computeSupport(full);
  const strat = runStrategy(full);
  const markers = strat.markers.filter((m) => m.time >= start);

  const last = disp[disp.length - 1];
  const prev = disp[disp.length - 2] ?? last;
  const latestMa = {
    ma5: lastVal(ma.ma5),
    ma10: lastVal(ma.ma10),
    ma20: lastVal(ma.ma20),
    ma60: lastVal(ma.ma60),
    ma240: lastVal(ma.ma240),
  };
  const aboveAll = Object.values(latestMa).every((m) => m != null && last.close > m);
  const recent60 = disp.slice(-60);
  const maxH = Math.max(...recent60.map((c) => c.high));
  const minL = Math.min(...recent60.map((c) => c.low));
  const rangePct = r2(((maxH - minL) / minL) * 100);
  const consolidation = { is_consolidation: rangePct < 15, range_pct: rangePct };
  const volMax = Math.max(...disp.map((c) => c.volume));

  const mas = {
    ma5: latestMa.ma5 ?? last.close,
    ma10: latestMa.ma10 ?? last.close,
    ma20: latestMa.ma20 ?? last.close,
    ma60: latestMa.ma60 ?? last.close,
    ma240: latestMa.ma240 ?? last.close,
  };
  const tradePlan = computeTradePlan(disp, mas, support, fib);

  return {
    code,
    name,
    candles: disp.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
    volumes: volumeBars(disp),
    ma,
    macd,
    markers,
    latest: {
      aboveAll,
      change: r2(last.close - prev.close),
      changePct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
      close: last.close,
      date: last.time,
      isConsol: consolidation.is_consolidation,
      isVolMax: last.volume === volMax,
      ma5: latestMa.ma5,
      ma10: latestMa.ma10,
      ma20: latestMa.ma20,
      ma60: latestMa.ma60,
      ma240: latestMa.ma240,
      prevClose: prev.close,
    },
    strategy: "original",
    performance: strat.performance,
    supportLine: disp.map((c) => ({ time: c.time, value: support })),
    supportPrice: support,
    tradePlan,
    consolidation,
    exdivWarn: { warn: false },
    channelHigh: [] as Point[],
    channelLow: [] as Point[],
    rollingVolLow: r2(Math.min(...disp.slice(-20).map((c) => c.low))),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code ?? "").trim();
  if (!code) {
    res.status(400).json({ error: "缺少代號" });
    return;
  }
  // CORS preflight for cross-origin frontend embeds.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  try {
    const { name, ticker } = await resolveStock(code);
    const payload = await cached(`payload:${code}`, 60 * 5, () =>
      buildStockPayload(code, name, ticker),
    );
    res.status(200).json(payload);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message || "查無資料" });
  }
}
