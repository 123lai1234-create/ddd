import { Router, type IRouter } from "express";
import { db, recipientsTable, markersTable, positionHistoryTable } from "../_shims/db";
import { desc, eq } from "drizzle-orm";
import { fetchCandles, type Candle } from "../lib/yahoo";
import {
  maSeries,
  computeMacd,
  computeRsi,
  computeFib,
  computeSupport,
  runStrategy,
  computeTradePlan,
  volumeBars,
  type Point,
} from "../lib/indicators";
import { getWatchlist, resolveStock, addStock, removeStock } from "../lib/stocks";
import { INDUSTRY_GROUPS } from "../lib/seed-data";
import { fetchInstitutional, fetchIndexInstitutional } from "../lib/twse";
import { fetchForeignFutures } from "../lib/taifex";
import { fetchStockNews, fetchMarketNews, fetchMacroNews } from "../lib/news";
import { buildFinancial, buildIntro } from "../lib/financial";
import { cached } from "../lib/cache";
import { sendScanEmail } from "../lib/email";
import { rateLimit } from "../lib/ratelimit";
import { scanWatchlist } from "../lib/scan-watchlist";

const router: IRouter = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;
const DISPLAY = 250;

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged operator actions are disabled until an
  // operator secret is configured (per project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

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

// ---- Watchlist & metadata ----
router.get("/stocks", async (_req, res) => {
  const list = await getWatchlist();
  res.json(list.map((s) => ({ code: s.code, name: s.name, ticker: s.ticker })));
});

router.get("/stock_industry", (_req, res) => {
  res.json({ groups: INDUSTRY_GROUPS });
});

router.post("/stocks/add", async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, error: "密碼錯誤" });
    return;
  }
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    res.status(400).json({ ok: false, error: "缺少代號" });
    return;
  }
  try {
    const added = await addStock(code);
    res.json({ ok: true, ...added });
  } catch {
    res.status(404).json({ ok: false, error: "查無此股票代號" });
  }
});

router.delete("/stocks/remove/:code", async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, error: "密碼錯誤" });
    return;
  }
  await removeStock(req.params.code);
  res.json({ ok: true });
});

// ---- Core stock data ----
router.get("/stock/:code", async (req, res) => {
  try {
    const { name, ticker } = await resolveStock(req.params.code);
    const payload = await cached(`payload:${req.params.code}`, 60 * 5, () =>
      buildStockPayload(req.params.code, name, ticker),
    );
    res.json(payload);
  } catch (e) {
    res.status(404).json({ error: (e as Error).message || "查無資料" });
  }
});

router.get("/institutional/:code", async (req, res) => {
  try {
    res.json(await fetchInstitutional(req.params.code));
  } catch {
    res.json({ foreign: [], trust: [], dealer: [], summary: { foreign_3d: 0, trust_3d: 0, dealer_3d: 0 }, is_etf: false });
  }
});

router.get("/financial/:code", async (req, res) => {
  try {
    const { name, ticker } = await resolveStock(req.params.code);
    res.json(await buildFinancial(req.params.code, name, ticker));
  } catch {
    res.status(404).json({ error: "查無財務資料" });
  }
});

router.get("/fibonacci/:code", async (req, res) => {
  try {
    const { ticker } = await resolveStock(req.params.code);
    const candles = await fetchCandles(ticker, 400);
    const fib = computeFib(candles, 90);
    const close = candles[candles.length - 1].close;
    const signals: { level: string; price: number; note: string }[] = [];
    for (const [label, price] of [
      ["38.2%", fib.fib382],
      ["50%", fib.fib500],
      ["61.8%", fib.fib618],
    ] as [string, number][]) {
      if (Math.abs(close - price) / close < 0.03) {
        signals.push({ level: label, price, note: "接近回撤支撐" });
      }
    }
    res.json({ code: req.params.code, fib, signals });
  } catch {
    res.status(404).json({ error: "查無資料" });
  }
});

router.get("/margin_burst/:code", async (req, res) => {
  try {
    const { ticker } = await resolveStock(req.params.code);
    const candles = await fetchCandles(ticker, 200);
    const closes = candles.map((c) => c.close);
    const n = candles.length;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ma60now = closes.slice(-60).reduce((a, b) => a + b, 0) / 60;
    const ma60prev = closes.slice(-65, -5).reduce((a, b) => a + b, 0) / 60;
    const slope = r2(((ma60now - ma60prev) / ma60prev) * 100);
    const rsi = computeRsi(candles, 14);
    const avgVol = candles.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
    const volRatio = avgVol ? r2(candles[n - 1].volume / avgVol) : 0;
    const avgCost = r2(
      candles.slice(-20).reduce((a, c) => a + (c.high + c.low + c.close) / 3, 0) / 20,
    );
    const close = candles[n - 1].close;
    const premium = r2(((close - avgCost) / avgCost) * 100);
    const failReasons: string[] = [];
    if (slope <= 0) failReasons.push("MA60 未上彎");
    if (rsi > 80) failReasons.push("RSI 過熱");
    if (volRatio < 1) failReasons.push("量能不足");
    res.json({
      code: req.params.code,
      ok: true,
      metrics: {
        ma20: r2(ma20),
        ma60_slope_pct: slope,
        rsi14: rsi,
        vol_ratio: volRatio,
        margin_burst_ratio: volRatio > 1.5 ? r2(volRatio * 0.6) : 0,
        avg_cost_est: avgCost,
        cost_premium_pct: premium,
        exit_line: r2(ma20 * 0.97),
        warning_line: r2(ma20 * 0.99),
        is_g7: slope > 0 && rsi > 50 && volRatio > 1 && close > ma20,
        fail_reasons: failReasons,
      },
    });
  } catch {
    res.json({ code: req.params.code, ok: false, metrics: null });
  }
});

router.get("/strategy_signals/:code", (req, res) => {
  // No intraday signal cache pool in this clone → hidden on the frontend.
  res.json({ code: req.params.code, ok: false, error: "no_cache_today" });
});

// ---- News ----
router.get("/news/market", async (_req, res) => {
  res.json(await fetchMarketNews());
});
router.get("/macro_news", async (_req, res) => {
  res.json(await fetchMacroNews());
});
router.get("/news/:code", async (req, res) => {
  try {
    const { name } = await resolveStock(req.params.code);
    res.json(await fetchStockNews(req.params.code, name));
  } catch {
    res.json({ code: req.params.code, name: req.params.code, events: [], news: [], sentiment: { score: 0, sentiment: "中性", color: "#9e9e9e", matched: [], totalNews: 0 }, combined: null });
  }
});

// ---- Index & macro structure ----
function indexTicker(idx: string): string {
  const v = decodeURIComponent(idx).replace(/^\^/, "").toUpperCase();
  if (v.includes("TWOII") || v.includes("櫃") || v === "OTC") return "^TWOII";
  if (v.includes("TWII") || v.includes("加權") || v === "TAIEX") return "^TWII";
  return `^${v}`;
}

async function buildIndexPayload(ticker: string) {
  const full = await fetchCandles(ticker, 600);
  if (full.length < 5) throw new Error("無資料");
  const disp = full.slice(-DISPLAY);
  const start = disp[0].time;
  const within = (pts: Point[]) => pts.filter((p) => p.time >= start);
  const last = disp[disp.length - 1];
  const prev = disp[disp.length - 2] ?? last;
  return {
    candles: disp.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    volumes: volumeBars(disp),
    ma: { ma5: within(maSeries(full, 5)), ma20: within(maSeries(full, 20)), ma60: within(maSeries(full, 60)) },
    latest: {
      close: last.close,
      change: r2(last.close - prev.close),
      changePct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
      date: last.time,
      prevClose: prev.close,
    },
  };
}

router.get("/index/:idx", async (req, res) => {
  try {
    const ticker = indexTicker(req.params.idx);
    res.json(await cached(`index:${ticker}`, 60 * 5, () => buildIndexPayload(ticker)));
  } catch (e) {
    res.status(200).json({ error: (e as Error).message || "查無指數資料" });
  }
});

router.get("/index_institutional", async (req, res) => {
  const days = Number(req.query.days ?? 5) || 5;
  res.json(await fetchIndexInstitutional(days));
});

router.get("/foreign_futures", async (req, res) => {
  const days = Number(req.query.days ?? 30) || 30;
  res.json(await fetchForeignFutures(days));
});

router.get("/market_gaps", async (req, res) => {
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
    res.json({
      "^TWII": {
        name: "加權指數",
        gaps,
        summary: { total: gaps.length, unfilled: unfilled.length, up: gaps.filter((g) => g.type === "up").length, down: gaps.filter((g) => g.type === "down").length },
      },
    });
  } catch {
    res.json({ "^TWII": { name: "加權指數", gaps: [], summary: { total: 0, unfilled: 0, up: 0, down: 0 } } });
  }
});

router.get("/overnight_signal", async (_req, res) => {
  try {
    const data = await cached("overnight", 60 * 10, async () => {
      const [sox, twii] = await Promise.all([
        fetchCandles("^SOX", 15).catch(() => [] as Candle[]),
        fetchCandles("^TWII", 15).catch(() => [] as Candle[]),
      ]);
      const ret = (arr: Candle[]) => {
        if (arr.length < 2) return null;
        const a = arr[arr.length - 2];
        const b = arr[arr.length - 1];
        return { date: b.time, ret: r2(((b.close - a.close) / a.close) * 100) };
      };
      const soxR = ret(sox);
      const twR = ret(twii);
      const signals: string[] = [];
      if (soxR) signals.push(`費半 ${soxR.ret >= 0 ? "上漲" : "下跌"} ${soxR.ret}%`);
      let rec = "中性偏觀望";
      if (soxR && soxR.ret > 1.5) rec = "偏多";
      else if (soxR && soxR.ret < -1.5) rec = "偏空";
      return {
        night_date: twR?.date ?? null,
        night_ret: twR?.ret ?? null,
        sox_date: soxR?.date ?? null,
        sox_ret: soxR?.ret ?? null,
        recommendation: rec,
        signals,
      };
    });
    res.json(data);
  } catch {
    res.json({ night_date: null, night_ret: null, sox_date: null, sox_ret: null, recommendation: "—", signals: [] });
  }
});

// ---- Recipients ----
router.get("/recipients", async (req, res) => {
  // PII (email list) — operator-only; password via header, never query string.
  if (!operatorOk(req.header("x-operator-password"))) {
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  const list = await db.select().from(recipientsTable);
  res.json({ ok: true, recipients: list.map((r) => ({ name: r.name, email: r.email })) });
});
router.post("/recipients/add", rateLimit({ windowMs: 60_000, max: 5, key: "rec_add" }), async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  const email = String(req.body?.email ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  if (!email) {
    res.status(400).json({ ok: false, error: "缺少 email" });
    return;
  }
  await db.insert(recipientsTable).values({ email, name }).onConflictDoNothing();
  res.json({ ok: true });
});
router.delete("/recipients/remove", rateLimit({ windowMs: 60_000, max: 5, key: "rec_remove" }), async (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  const email = String(req.body?.email ?? "").trim();
  await db.delete(recipientsTable).where(eq(recipientsTable.email, email));
  res.json({ ok: true });
});

// ---- Markers persistence ----
router.post("/markers/record", rateLimit({ windowMs: 60_000, max: 30, key: "markers" }), async (req, res) => {
  const code = String(req.body?.code ?? "");
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (code && items.length) {
    await db.delete(markersTable).where(eq(markersTable.code, code));
    const rows = items
      .filter((it: { time?: string }) => it && it.time)
      .map((it: { time: string; text?: string; type?: string; price?: number }) => ({
        code,
        date: it.time,
        type: it.type ?? "",
        text: it.text ?? "",
        price: typeof it.price === "number" ? it.price : null,
      }));
    if (rows.length) await db.insert(markersTable).values(rows);
  }
  res.json({ ok: true, count: items.length });
});

// ---- Position history ----
router.get("/position_history", async (req, res) => {
  const days = Number(req.query.days ?? 30) || 30;
  let rows = await db.select().from(positionHistoryTable).orderBy(desc(positionHistoryTable.date)).limit(days);
  if (rows.length === 0) {
    // backfill a baseline series from index trend
    try {
      const candles = await fetchCandles("^TWII", days + 70);
      const closes = candles.map((c) => c.close);
      const sma20 = closes.map((_, i) => (i >= 19 ? closes.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20 : null));
      const seed = candles.slice(-days).map((c, i) => {
        const idx = candles.length - days + i;
        const ratio = sma20[idx] != null && c.close > (sma20[idx] as number) ? 70 : 40;
        return { date: c.time, ratio, source: "backfill" };
      });
      if (seed.length) await db.insert(positionHistoryTable).values(seed).onConflictDoNothing();
      rows = await db.select().from(positionHistoryTable).orderBy(desc(positionHistoryTable.date)).limit(days);
    } catch {
      /* ignore */
    }
  }
  const history = rows
    .map((r) => ({ date: r.date, ratio: r.ratio, source: r.source }))
    .sort((a, b) => a.date.localeCompare(b.date));
  res.json({ count: history.length, history });
});

// ---- Company profile (個股介紹) ----
function industryTagFor(code: string): string | null {
  for (const g of INDUSTRY_GROUPS) {
    if (g.codes.includes(code)) return g.label;
  }
  return null;
}

router.get("/stock/:code/intro", async (req, res) => {
  try {
    const { name, ticker } = await resolveStock(req.params.code);
    const intro = await cached(`intro:${req.params.code}`, 60 * 30, () =>
      buildIntro(req.params.code, name, ticker, industryTagFor(req.params.code)),
    );
    res.json(intro);
  } catch {
    res.status(404).json({ error: "查無個股介紹資料" });
  }
});

// ---- Corporate-action event markers (external data source limited) ----
router.get("/stock/:code/events", (req, res) => {
  res.json({ ok: true, code: req.params.code, events: [] });
});

// ---- ETF membership (data source limited) ----
router.get("/stock/:code/etf_membership", (req, res) => {
  res.json({
    ok: true,
    stock_code: req.params.code,
    top5: [],
    changes: [],
    overlap: { stock_code: req.params.code, etf_count: 0, total_etf: 0, etf_list: [], etf_name_list: [], avg_weight: 0, max_weight: 0, in_top: 0, overlap_rank: null },
  });
});

// ---- Conference (法說會) — none cached, matches reference empty shape ----
router.get("/conference/:code", (req, res) => {
  res.json({ ok: true, code: req.params.code, count: 0, data: [] });
});

// ---- Scan watchlist for fresh signals ----
// Implementation moved to lib/scan-watchlist.ts so /api/line/* can reuse it.

router.get("/scan", async (_req, res) => {
  res.json(await cached("scan", 60 * 5, scanWatchlist));
});

router.post("/scan_and_email", rateLimit({ windowMs: 5 * 60_000, max: 2, key: "scan_email" }), async (req, res) => {
  // Triggers an expensive watchlist fan-out + email blast — operator-only.
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, need_password: true, error: "密碼錯誤" });
    return;
  }
  res.json({ ok: true, queued: true });
  // fire-and-forget
  (async () => {
    try {
      const results = await cached("scan", 60 * 5, scanWatchlist);
      const recipients = await db.select().from(recipientsTable);
      if (recipients.length) await sendScanEmail(recipients.map((r) => r.email), results);
    } catch {
      /* logged inside email */
    }
  })();
});

// ---- Intraday (not enabled in this clone) ----
let intradayEnabled = false;
router.get("/intraday_scan/status", (_req, res) => {
  res.json({ enabled: intradayEnabled, running: false });
});
router.post("/intraday_scan/toggle", (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, error: "密碼錯誤" });
    return;
  }
  intradayEnabled = Boolean(req.body?.enabled);
  res.json({ ok: true, enabled: intradayEnabled });
});
router.get("/intraday_check/:code", (_req, res) => {
  if (!intradayEnabled) {
    res.json({ disabled: true, error: "盤中掃描未啟用" });
    return;
  }
  res.json({ error: "無盤中資料" });
});

export default router;
