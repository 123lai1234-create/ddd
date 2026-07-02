import { Router, type IRouter } from "express";
import { fetchCandles, fetchSummary, type Candle } from "../lib/yahoo";
import { getWatchlist } from "../lib/stocks";
import { INDUSTRY_GROUPS } from "../lib/seed-data";
import { cached, cacheGet, cacheSet } from "../lib/cache";
import { rateLimit } from "../lib/ratelimit";

const router: IRouter = Router();
const r2 = (n: number) => Math.round(n * 100) / 100;

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged operator actions are disabled until an
  // operator secret is configured (per project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

const nowIso = () => new Date().toISOString();

// Shared User-Agent for every external fetch (per project rules).
const UA = { "User-Agent": "Mozilla/5.0 (compatible; donttalk/1.0)" } as const;

// Parse a possibly-string/HTML/full-width-dash numeric field → number | null.
function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/<[^>]*>/g, "")
    .replace(/,/g, "")
    .trim();
  if (!s || s === "－" || s === "-" || s === "N/A" || s === "n/a") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ROC 資料年月 (e.g. "11505") → Gregorian "YYYY-MM".
function rocYmToYm(roc: unknown): string | null {
  const s = String(roc ?? "").trim();
  if (s.length < 4) return null;
  const y = Number(s.slice(0, s.length - 2));
  const m = s.slice(s.length - 2);
  if (!Number.isFinite(y)) return null;
  return `${y + 1911}-${m}`;
}

// ROC 出表日期 (e.g. "1150611") → Gregorian "YYYY-MM-DD".
function rocDateToYmd(roc: unknown): string | null {
  const s = String(roc ?? "").trim();
  if (s.length < 6) return null;
  const y = Number(s.slice(0, s.length - 4));
  const m = s.slice(s.length - 4, s.length - 2);
  const d = s.slice(s.length - 2);
  if (!Number.isFinite(y)) return null;
  return `${y + 1911}-${m}-${d}`;
}

// ROC Chinese date (e.g. "115年06月17日") → Gregorian "YYYY-MM-DD".
function rocChineseDate(s: unknown): string | null {
  const m = String(s ?? "").match(/(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (!m) return null;
  const y = Number(m[1]) + 1911;
  return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// Whole-day difference from local today to a "YYYY-MM-DD" date.
function daysFromToday(ymd: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${ymd}T00:00:00`);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// code -> industry label lookup, built once from seed groups.
const INDUSTRY_BY_CODE = new Map<string, string>();
for (const g of INDUSTRY_GROUPS) {
  for (const c of g.codes) INDUSTRY_BY_CODE.set(c, g.label);
}

function changePct(candles: Candle[], n: number): number | null {
  if (candles.length < n + 1) return null;
  const last = candles[candles.length - 1].close;
  const past = candles[candles.length - 1 - n].close;
  if (!past) return null;
  return r2(((last - past) / past) * 100);
}

// ─────────────────────────────────────────────────────────────
// 熱力圖 /heatmap — per-watchlist change% + market cap (treemap + 產業排名)
// ─────────────────────────────────────────────────────────────
interface HeatStock {
  code: string;
  name: string;
  industry: string;
  market_cap: number | null;
  chg_1d: number | null;
  chg_5d: number | null;
  chg_10d: number | null;
  chg_20d: number | null;
  chg_60d: number | null;
}

async function marketCapOf(ticker: string): Promise<number | null> {
  const sum = await fetchSummary(ticker, ["summaryDetail", "price"]);
  if (!sum) return null;
  const sd = sum["summaryDetail"] as Record<string, unknown> | undefined;
  const pr = sum["price"] as Record<string, unknown> | undefined;
  const fromSd = sd && typeof sd["marketCap"] === "number" ? (sd["marketCap"] as number) : null;
  const fromPr = pr && typeof pr["marketCap"] === "number" ? (pr["marketCap"] as number) : null;
  return fromSd ?? fromPr;
}

function wavg(items: HeatStock[], key: keyof HeatStock): number | null {
  let num = 0;
  let den = 0;
  let sum = 0;
  let cnt = 0;
  for (const s of items) {
    const v = s[key];
    if (typeof v !== "number" || isNaN(v)) continue;
    const w = s.market_cap && s.market_cap > 0 ? s.market_cap : 0;
    if (w > 0) {
      num += v * w;
      den += w;
    }
    sum += v;
    cnt += 1;
  }
  if (den > 0) return r2(num / den);
  if (cnt > 0) return r2(sum / cnt);
  return null;
}

async function buildHeatmap() {
  const list = (await getWatchlist()).slice(0, 60);
  const stocks: HeatStock[] = [];
  for (const s of list) {
    try {
      const candles = await fetchCandles(s.ticker, 120);
      if (candles.length < 2) continue;
      const cap = await marketCapOf(s.ticker).catch(() => null);
      stocks.push({
        code: s.code,
        name: s.name,
        industry: INDUSTRY_BY_CODE.get(s.code) || "其他",
        market_cap: cap,
        chg_1d: changePct(candles, 1),
        chg_5d: changePct(candles, 5),
        chg_10d: changePct(candles, 10),
        chg_20d: changePct(candles, 20),
        chg_60d: changePct(candles, 60),
      });
    } catch {
      /* skip stocks that fail to fetch */
    }
  }

  // Aggregate per-industry (market-cap weighted, falls back to simple avg).
  const byLabel = new Map<string, HeatStock[]>();
  for (const s of stocks) {
    const arr = byLabel.get(s.industry) || [];
    arr.push(s);
    byLabel.set(s.industry, arr);
  }
  const industries = [...byLabel.entries()].map(([label, items]) => ({
    label,
    count: items.length,
    market_cap: items.reduce((a, s) => a + (s.market_cap || 0), 0),
    chg_5d: wavg(items, "chg_5d"),
    chg_10d: wavg(items, "chg_10d"),
    chg_20d: wavg(items, "chg_20d"),
    chg_60d: wavg(items, "chg_60d"),
  }));

  return {
    ok: true,
    as_of: nowIso().slice(0, 16).replace("T", " "),
    count: stocks.length,
    stocks,
    industries,
  };
}

router.get("/heatmap", async (_req, res) => {
  try {
    res.json(await cached("markets:heatmap", 60 * 15, buildHeatmap));
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message || "載入失敗", as_of: null, count: 0, stocks: [], industries: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// 走勢比較 /price_compare — normalized cumulative return series
// ─────────────────────────────────────────────────────────────
const RANGE_DAYS: Record<string, number> = {
  "1w": 10,
  "1m": 35,
  "3m": 100,
  "6m": 190,
  "1y": 380,
  "3y": 1120,
  "5y": 1850,
};

function datesBetween(candles: Candle[], start: string | null, end: string | null): Candle[] {
  return candles.filter((c) => (!start || c.time >= start) && (!end || c.time <= end));
}

async function buildPriceCompare(kind: string, range: string, start: string | null, end: string | null) {
  const isEtf = kind === "etf";
  const list = (await getWatchlist()).filter((s) =>
    isEtf ? s.code.startsWith("00") : !s.code.startsWith("00"),
  );
  const capped = list.slice(0, isEtf ? 25 : 35);

  // Determine fetch window.
  let days = RANGE_DAYS[range] ?? 380;
  if (!range && start) {
    const span = Math.ceil((Date.now() - new Date(start).getTime()) / 86400000);
    days = Math.max(span + 10, 20);
  }

  const allDates = new Set<string>();
  const collected: { code: string; name: string; candles: Candle[] }[] = [];
  for (const s of capped) {
    try {
      const full = await fetchCandles(s.ticker, days);
      const win = range ? full.slice(-(RANGE_DAYS[range] ?? full.length)) : datesBetween(full, start, end);
      if (win.length < 2) continue;
      win.forEach((c) => allDates.add(c.time));
      collected.push({ code: s.code, name: s.name, candles: win });
    } catch {
      /* skip */
    }
  }

  const dates = [...allDates].sort();
  const series = collected.map((it) => {
    const byDate = new Map(it.candles.map((c) => [c.time, c.close]));
    const base = it.candles[0].close;
    const data = dates.map((d) => {
      const close = byDate.get(d);
      return close != null && base ? r2((close / base - 1) * 100) : null;
    });
    const last = it.candles[it.candles.length - 1].close;
    const ret = base ? r2((last / base - 1) * 100) : null;
    return { code: it.code, name: it.name, ret, data };
  });

  return {
    ok: true,
    count: series.length,
    total: capped.length,
    fetched: series.length,
    partial: false,
    start: dates[0] ?? (start || ""),
    end: dates[dates.length - 1] ?? (end || ""),
    dates,
    series,
  };
}

router.get("/price_compare", async (req, res) => {
  const kind = String(req.query["kind"] ?? "stock");
  const range = String(req.query["range"] ?? "");
  const start = req.query["start"] ? String(req.query["start"]) : null;
  const end = req.query["end"] ? String(req.query["end"]) : null;
  const key = `markets:pc:${kind}:${range}:${start}:${end}`;
  try {
    res.json(await cached(key, 60 * 10, () => buildPriceCompare(kind, range, start, end)));
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message || "載入失敗", count: 0, dates: [], series: [] });
  }
});

// ─────────────────────────────────────────────────────────────
// 月營收 /revenue — TWSE openapi 上市公司每月營收 t187ap05_L（真實資料）
// ─────────────────────────────────────────────────────────────
interface TwseRevenueRow {
  "出表日期"?: string;
  "資料年月"?: string;
  "公司代號"?: string;
  "公司名稱"?: string;
  "營業收入-當月營收"?: string;
  "營業收入-上月比較增減(%)"?: string;
  "營業收入-去年同月增減(%)"?: string;
  "累計營業收入-當月累計營收"?: string;
  "累計營業收入-前期比較增減(%)"?: string;
}

async function fetchRevenueSrc(): Promise<TwseRevenueRow[]> {
  const r = await fetch("https://openapi.twse.com.tw/v1/opendata/t187ap05_L", { headers: UA });
  if (!r.ok) throw new Error(`TWSE 月營收 HTTP ${r.status}`);
  const j = (await r.json()) as unknown;
  if (!Array.isArray(j)) throw new Error("TWSE 月營收回傳格式異常");
  return j as TwseRevenueRow[];
}

router.get("/revenue", async (req, res) => {
  const ymQuery = req.query["year_month"] ? String(req.query["year_month"]) : null;
  try {
    const records = await cached("markets:revenue:src", 21600, fetchRevenueSrc);
    const wl = await getWatchlist();
    const codeToName = new Map(wl.map((s) => [s.code, s.name]));
    const data: {
      code: string;
      name: string;
      year_month: string | null;
      revenue_current: number | null;
      mom_pct: number | null;
      yoy_pct: number | null;
      ytd_revenue: number | null;
      ytd_yoy_pct: number | null;
    }[] = [];
    let lastUpdate: string | null = null;
    let latestYm: string | null = null;
    for (const rec of records) {
      const code = String(rec["公司代號"] ?? "").trim();
      if (!codeToName.has(code)) continue; // watchlist-scoped (前頁顯示「命中自選股」)
      const rowYm = rocYmToYm(rec["資料年月"]);
      if (ymQuery && rowYm !== ymQuery) continue;
      if (rowYm) latestYm = rowYm;
      if (!lastUpdate) lastUpdate = rocDateToYmd(rec["出表日期"]);
      const mom = numOrNull(rec["營業收入-上月比較增減(%)"]);
      const yoy = numOrNull(rec["營業收入-去年同月增減(%)"]);
      const ytdYoy = numOrNull(rec["累計營業收入-前期比較增減(%)"]);
      data.push({
        code,
        name: codeToName.get(code) || String(rec["公司名稱"] ?? code),
        year_month: rowYm,
        revenue_current: numOrNull(rec["營業收入-當月營收"]),
        mom_pct: mom == null ? null : r2(mom),
        yoy_pct: yoy == null ? null : r2(yoy),
        ytd_revenue: numOrNull(rec["累計營業收入-當月累計營收"]),
        ytd_yoy_pct: ytdYoy == null ? null : r2(ytdYoy),
      });
    }
    res.json({
      ok: true,
      data,
      last_update: lastUpdate,
      year_month: ymQuery ?? latestYm,
      is_limited: false,
      note: "",
    });
  } catch (e) {
    res.json({
      ok: true,
      data: [],
      last_update: null,
      year_month: ymQuery,
      is_limited: true,
      note: `資料來源連線失敗（TWSE 月營收）：${(e as Error).message || ""}`,
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 除權息 /exdiv — TWSE 除權除息預告表 TWT48U（真實資料）
// ─────────────────────────────────────────────────────────────
interface ExdivSrcRow {
  date: string | null;
  code: string;
  name: string;
  type: string;
  cash: number | null;
}

async function fetchExdivSrc(): Promise<ExdivSrcRow[]> {
  const r = await fetch("https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json", { headers: UA });
  if (!r.ok) throw new Error(`TWSE 除權息 HTTP ${r.status}`);
  const j = (await r.json()) as unknown as { stat?: string; fields?: string[]; data?: unknown[][] };
  if (!j || j.stat !== "OK" || !Array.isArray(j.data) || !Array.isArray(j.fields)) {
    throw new Error("TWSE 除權息回傳格式異常");
  }
  const idx = (label: string) => j.fields!.indexOf(label);
  const iDate = idx("除權除息日期");
  const iCode = idx("股票代號");
  const iName = idx("名稱");
  const iType = idx("除權息");
  const iCash = idx("現金股利");
  const out: ExdivSrcRow[] = [];
  for (const row of j.data) {
    if (!Array.isArray(row)) continue;
    const code = String(iCode >= 0 ? row[iCode] ?? "" : "").trim();
    if (!code) continue;
    out.push({
      date: rocChineseDate(iDate >= 0 ? row[iDate] : ""),
      code,
      name: String(iName >= 0 ? row[iName] ?? "" : "").trim(),
      type: String(iType >= 0 ? row[iType] ?? "" : "").trim(),
      cash: numOrNull(iCash >= 0 ? row[iCash] : null),
    });
  }
  return out;
}

router.get("/exdiv/calendar", async (req, res) => {
  const days = Number(req.query["days"] ?? 90) || 90;
  let selected = 0;
  try {
    const src = await cached("markets:exdiv:src", 21600, fetchExdivSrc);
    const wl = await getWatchlist();
    selected = wl.length;
    const codeToName = new Map(wl.map((s) => [s.code, s.name]));
    const matched = new Set<string>();
    const data: {
      name: string;
      code: string;
      category: string;
      ex_date: string;
      days_left: number;
      dividend: number | null;
      yield: number | null;
    }[] = [];
    for (const rec of src) {
      if (!rec.date || !codeToName.has(rec.code)) continue; // watchlist-scoped
      const dl = daysFromToday(rec.date);
      if (dl < 0 || dl > days) continue; // 僅今日之後、視窗內
      matched.add(rec.code);
      data.push({
        name: codeToName.get(rec.code) || rec.name,
        code: rec.code,
        category: rec.code.startsWith("00") ? "ETF" : "股票",
        ex_date: rec.date,
        days_left: dl,
        dividend: rec.cash,
        yield: null,
      });
    }
    data.sort((a, b) => a.days_left - b.days_left);
    res.json({
      status: "ok",
      update_time: nowIso().slice(0, 16).replace("T", " "),
      days,
      data,
      debug: { total_exdiv_records: src.length, matched_stocks: matched.size, selected_stocks: selected },
    });
  } catch (e) {
    // 抓取失敗 → 回傳前頁可辨識的「空但形狀正確」結果，不崩潰。
    res.json({
      status: "ok",
      update_time: nowIso().slice(0, 16).replace("T", " "),
      days,
      data: [],
      debug: { total_exdiv_records: 0, matched_stocks: 0, selected_stocks: selected, error: (e as Error).message || "" },
    });
  }
});

// 注意：此端點的消費端（etf.html 側欄）直接把回應當作 JSON 陣列使用
// （data.forEach / data.length），因此回傳「陣列」而非物件，符合前端契約。
router.get("/exdiv/upcoming", async (req, res) => {
  const days = Number(req.query["days"] ?? 3) || 3;
  try {
    const src = await cached("markets:exdiv:src", 21600, fetchExdivSrc);
    const wl = await getWatchlist();
    const codeToName = new Map(wl.map((s) => [s.code, s.name]));
    const items: {
      code: string;
      name: string;
      ex_date: string;
      days_left: number;
      type: string;
      dividend: number | string;
    }[] = [];
    for (const rec of src) {
      if (!rec.date || !codeToName.has(rec.code)) continue; // watchlist-scoped
      const dl = daysFromToday(rec.date);
      if (dl < 0 || dl > days) continue;
      items.push({
        code: rec.code,
        name: codeToName.get(rec.code) || rec.name,
        ex_date: rec.date,
        days_left: dl,
        type: rec.type || "息",
        dividend: rec.cash ?? "待公告",
      });
    }
    items.sort((a, b) => a.days_left - b.days_left);
    res.json(items);
  } catch {
    res.json([]);
  }
});

// ─────────────────────────────────────────────────────────────
// 總經 /macro_data — 由 Yahoo 取得可計算的公債殖利率 / 指數
// ─────────────────────────────────────────────────────────────
interface MacroRow {
  指標: string;
  最新值: number | null;
  前值: number | null;
  日期: string | null;
  變化: string;
  訊號: string;
  來源: string;
  來源標記?: string;
}

async function macroPoint(ticker: string): Promise<{ value: number; prev: number; date: string } | null> {
  try {
    const c = await fetchCandles(ticker, 30);
    if (c.length < 2) return null;
    const last = c[c.length - 1];
    const prev = c[c.length - 2];
    return { value: last.close, prev: prev.close, date: last.time };
  } catch {
    return null;
  }
}

function arrowChange(diff: number | null): string {
  if (diff === null || isNaN(diff)) return "─";
  if (diff > 0) return "▲+" + r2(diff).toFixed(3).replace(/\.?0+$/, "");
  if (diff < 0) return "▼" + r2(diff).toFixed(3).replace(/\.?0+$/, "");
  return "─";
}

function pctChange(value: number, prev: number): string {
  if (!prev) return "─";
  const p = ((value - prev) / prev) * 100;
  return (p >= 0 ? "+" : "") + r2(p).toFixed(2) + "%";
}

async function buildMacro(): Promise<MacroRow[]> {
  const [tnx, tyx, fvx, irx, vix, gspc, dxy] = await Promise.all([
    macroPoint("^TNX"),
    macroPoint("^TYX"),
    macroPoint("^FVX"),
    macroPoint("^IRX"),
    macroPoint("^VIX"),
    macroPoint("^GSPC"),
    macroPoint("DX-Y.NYB"),
  ]);

  const rows: MacroRow[] = [];

  const yieldRow = (label: string, p: typeof tnx, sig: (v: number) => string) => {
    if (!p) return;
    rows.push({
      指標: label,
      最新值: r2(p.value),
      前值: r2(p.prev),
      日期: p.date,
      變化: arrowChange(p.value - p.prev),
      訊號: sig(p.value),
      來源: "FRED",
      來源標記: "yfinance",
    });
  };

  yieldRow("美10年公債殖利率(%)", tnx, (v) => (v >= 4.5 ? "偏高" : v < 3 ? "偏低" : "正常"));
  yieldRow("美5年公債殖利率(%)", fvx, (v) => (v >= 4.5 ? "偏高" : v < 3 ? "偏低" : "正常"));
  yieldRow("美30年公債殖利率(%)", tyx, (v) => (v >= 4.7 ? "偏高" : v < 3.2 ? "偏低" : "正常"));
  yieldRow("美3月公債殖利率(%)", irx, (v) => (v >= 5 ? "偏高" : v < 2 ? "偏低" : "正常"));

  if (tnx && irx) {
    const spread = tnx.value - irx.value;
    const prevSpread = tnx.prev - irx.prev;
    rows.push({
      指標: "10年-3月公債利差",
      最新值: r2(spread),
      前值: r2(prevSpread),
      日期: tnx.date,
      變化: arrowChange(spread - prevSpread),
      訊號: spread < 0 ? "偏弱" : "正常",
      來源: "FRED",
      來源標記: "yfinance",
    });
  }

  const yahooRow = (label: string, p: typeof vix, sig: string) => {
    if (!p) return;
    rows.push({
      指標: label,
      最新值: r2(p.value),
      前值: r2(p.prev),
      日期: p.date,
      變化: pctChange(p.value, p.prev),
      訊號: sig,
      來源: "Yahoo",
    });
  };

  yahooRow("VIX恐慌指數", vix, vix ? (vix.value >= 30 ? "偏高" : vix.value < 15 ? "偏低" : "正常") : "");
  yahooRow("標普500指數", gspc, "");
  yahooRow("美元指數", dxy, "");

  return rows;
}

router.get("/macro_data", async (req, res) => {
  const refresh = req.query["refresh"] != null || req.query["force"] != null;
  const key = "markets:macro";
  try {
    if (!refresh) {
      const hit = cacheGet<{ data: MacroRow[]; ts: number; updated: string }>(key);
      if (hit) {
        res.json({
          data: hit.data,
          cached: true,
          cache_age_min: Math.max(0, Math.round((Date.now() - hit.ts) / 60000)),
          updated: hit.updated,
        });
        return;
      }
    }
    const data = await buildMacro();
    const updated = nowIso().slice(0, 16).replace("T", " ");
    cacheSet(key, { data, ts: Date.now(), updated }, 60 * 30);
    res.json({ data, cached: false, updated });
  } catch (e) {
    res.json({ data: [], cached: false, updated: "", error: (e as Error).message || "載入失敗" });
  }
});

// 2 年期公債殖利率（DGS2）無穩定 Yahoo 端點可計算 → 誠實回傳空 history，前頁顯示「無數據」。
router.get("/macro_yield2y_history", (_req, res) => {
  res.json({ history: [], update_time: null, is_limited: true, note: "資料來源未接（2年期公債 DGS2）" });
});

// 別名：計畫文件中的 /macro_yieldNy_history（與上同形狀）。
router.get("/macro_yieldNy_history", (_req, res) => {
  res.json({ history: [], update_time: null, is_limited: true, note: "資料來源未接" });
});

// ─────────────────────────────────────────────────────────────
// AI 資本支出 /ai_capex — SEC EDGAR companyconcept 季度 capex（真實資料）
// us-gaap/PaymentsToAcquirePropertyPlantAndEquipment
// ─────────────────────────────────────────────────────────────
const CAPEX_COMPANIES = [
  { code: "NVDA", name: "Nvidia", cik: "0001045810" },
  { code: "MSFT", name: "Microsoft", cik: "0000789019" },
  { code: "GOOGL", name: "Alphabet", cik: "0001652044" },
  { code: "AMZN", name: "Amazon", cik: "0001018724" },
  { code: "META", name: "Meta", cik: "0001326801" },
] as const;

// SEC 要求帶有可辨識聯絡資訊的 User-Agent。
const SEC_UA = { "User-Agent": "donttalk-portfolio/1.0 (capex research; admin@donttalk.app)" } as const;

interface CapexQuarter {
  cq: number; // calendar-quarter index = year*4 + quarterIdx（連續整數）
  label: string; // e.g. "2025Q3"
  val: number; // USD
}

interface CapexCompanyOut {
  code: string;
  name: string;
  group: string;
  latest_capex: number | null;
  latest_quarter: string | null;
  qoq_pct: number | null;
  yoy_pct: number | null;
  ttm: number | null;
  ttm_yoy_pct: number | null;
  spark: number[];
}

// 不同公司在 SEC 使用的 capex 標籤不一致：多數用
// PaymentsToAcquirePropertyPlantAndEquipment，但 NVDA/AMZN 近年改用
// PaymentsToAcquireProductiveAssets。逐一嘗試並挑「最新一季最近」的序列。
const CAPEX_TAGS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
  "PaymentsToAcquireProductiveAssets",
] as const;

const DAY_MS = 86400000;

async function fetchTagQuarters(cik: string, tag: string): Promise<CapexQuarter[]> {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
  const r = await fetch(url, { headers: SEC_UA });
  if (!r.ok) return []; // 該標籤可能不存在（404）→ 視為無資料
  const j = (await r.json()) as unknown as {
    units?: { USD?: { start?: string; end?: string; val?: number; form?: string; filed?: string }[] };
  };
  const arr = j.units?.USD ?? [];
  // capex 在現金流量表多以「會計年度累計（YTD）」申報：同一 start（會計年度起點）下
  // 會有 3 個月 / 6 個月 / 9 個月 / 12 個月等多筆累計值。要還原「單季」金額，
  // 須在同一 start 群組內，將相鄰累計值相減（第一筆即為當季）。少數公司直接申報單季
  // （每季 start 不同、群組只有一筆）則直接採用。最後只保留跨度約 90 天的單季值。
  // 同一期間（start|end）若有多筆（原始 + 後續修正），取 filed 最新者，避免採用過時數值。
  const groups = new Map<string, Map<string, { val: number; filed: string }>>(); // start → (end → {val,filed})
  for (const e of arr) {
    if (typeof e.val !== "number" || !e.start || !e.end) continue;
    let g = groups.get(e.start);
    if (!g) {
      g = new Map();
      groups.set(e.start, g);
    }
    const filed = e.filed ?? "";
    const prev = g.get(e.end);
    if (!prev || filed >= prev.filed) g.set(e.end, { val: e.val, filed });
  }
  const byCq = new Map<number, CapexQuarter>();
  for (const [start, ends] of groups) {
    const items = [...ends.entries()].sort((a, b) => a[0].localeCompare(b[0])); // 依 end 升冪
    let prevVal = 0;
    let prevEnd = start;
    for (let i = 0; i < items.length; i++) {
      const [end, { val }] = items[i];
      const disc = i === 0 ? val : val - prevVal;
      const spanDays = (new Date(end).getTime() - new Date(prevEnd).getTime()) / DAY_MS;
      prevVal = val;
      prevEnd = end;
      if (spanDays < 80 || spanDays > 100) continue; // 僅保留單季（~90 天）跨度
      const d = new Date(end);
      const y = d.getUTCFullYear();
      const qi = Math.floor(d.getUTCMonth() / 3);
      const cq = y * 4 + qi;
      if (!byCq.has(cq)) byCq.set(cq, { cq, label: `${y}Q${qi + 1}`, val: disc });
    }
  }
  return [...byCq.values()].sort((a, b) => a.cq - b.cq);
}

async function fetchCapexQuarters(cik: string): Promise<CapexQuarter[]> {
  let best: CapexQuarter[] = [];
  let bestLatest = -Infinity;
  for (const tag of CAPEX_TAGS) {
    const q = await fetchTagQuarters(cik, tag);
    if (q.length === 0) continue;
    const latest = q[q.length - 1].cq;
    if (latest > bestLatest) {
      bestLatest = latest;
      best = q;
    }
  }
  if (best.length === 0) throw new Error("SEC 無可用 capex 標籤資料");
  return best;
}

function sumRange(arr: number[], from: number, to: number): number {
  let s = 0;
  for (let i = from; i <= to; i++) s += arr[i];
  return s;
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return r2(((cur - prev) / prev) * 100);
}

interface AiCapexPayload {
  ok: boolean;
  as_of: string;
  light: string;
  headline: string;
  agg_ttm_usd_bn: number | null;
  agg_yoy_pct: number | null;
  accel_pp: number | null;
  chart: { labels: string[]; agg_ttm: (number | null)[]; agg_yoy: (number | null)[] };
  companies: CapexCompanyOut[];
  data_stale: boolean;
  is_limited?: boolean;
  note?: string;
}

function honestCapex(note: string): AiCapexPayload {
  return {
    ok: true,
    as_of: nowIso().slice(0, 16).replace("T", " "),
    light: "gray",
    headline: "資料來源連線失敗（SEC EDGAR），暫無資本支出數據",
    agg_ttm_usd_bn: null,
    agg_yoy_pct: null,
    accel_pp: null,
    chart: { labels: [], agg_ttm: [], agg_yoy: [] },
    companies: [],
    data_stale: false,
    is_limited: true,
    note,
  };
}

async function buildAiCapex(): Promise<AiCapexPayload> {
  const fetched = await Promise.all(
    CAPEX_COMPANIES.map(async (c) => {
      try {
        return { c, q: await fetchCapexQuarters(c.cik) };
      } catch {
        return { c, q: [] as CapexQuarter[] };
      }
    }),
  );

  const haveData = fetched.filter((f) => f.q.length > 0);
  if (haveData.length === 0) return honestCapex("資料來源連線失敗（SEC EDGAR 季度 capex）");

  // 各公司指標
  const companies: CapexCompanyOut[] = [];
  // 合計 TTM：加總各公司自身的 TTM（不受不同會計年度季別對齊影響），作為最穩健的合計總額。
  let aggTtmSum = 0;
  let aggHasTtm = false;
  // 合計 YoY：僅在「同時具備本期與去年同期 TTM」的公司子集（同一 cohort）上計算，
  // 分子分母須用相同公司，否則缺少去年資料的公司會灌大年增率。
  let yoyCurSum = 0;
  let yoyPrevSum = 0;
  let aggHasYoy = false;
  for (const { c, q } of haveData) {
    const n = q.length;
    const vals = q.map((x) => x.val);
    const latest = q[n - 1];
    const ttm = n >= 4 ? sumRange(vals, n - 4, n - 1) : null;
    const prevTtm = n >= 8 ? sumRange(vals, n - 8, n - 5) : null;
    if (ttm != null) {
      aggTtmSum += ttm;
      aggHasTtm = true;
    }
    if (ttm != null && prevTtm != null) {
      yoyCurSum += ttm;
      yoyPrevSum += prevTtm;
      aggHasYoy = true;
    }
    companies.push({
      code: c.code,
      name: c.name,
      group: "core",
      latest_capex: latest.val,
      latest_quarter: latest.label,
      qoq_pct: n >= 2 ? pct(latest.val, q[n - 2].val) : null,
      yoy_pct: n >= 5 ? pct(latest.val, q[n - 5].val) : null,
      ttm,
      ttm_yoy_pct: ttm != null && prevTtm != null ? pct(ttm, prevTtm) : null,
      spark: q.slice(-8).map((x) => r2(x.val / 1e9)),
    });
  }

  // 合計趨勢圖：先各公司自行算出「以該日曆季為結尾的滾動 TTM」序列（需各自連續四季），
  // 再於「所有公司皆有 TTM 值」的日曆季加總。比起直接取原始單季交集穩健得多
  // （各公司會計年度季別不同、且部分季度以累計值申報而非單季）。
  const cqLabel = new Map<number, string>();
  for (const f of haveData) for (const x of f.q) cqLabel.set(x.cq, x.label);
  // 每家公司：cq → 該季結尾之 TTM（前推四季需 cq 連續）
  const companyTtmByCq = haveData.map((f) => {
    const m = new Map<number, number>();
    const q = f.q; // 已依 cq 升冪排序
    for (let i = 3; i < q.length; i++) {
      if (q[i].cq - q[i - 3].cq === 3) {
        m.set(q[i].cq, q[i].val + q[i - 1].val + q[i - 2].val + q[i - 3].val);
      }
    }
    return m;
  });
  // 所有公司皆有 TTM 的日曆季
  let commonTtmCqs: number[] | null = null;
  for (const m of companyTtmByCq) {
    const keys = [...m.keys()];
    commonTtmCqs = commonTtmCqs === null ? keys : commonTtmCqs.filter((k) => m.has(k));
  }
  const cqs = (commonTtmCqs ?? []).sort((a, b) => a - b);
  // 各共同季的合計 TTM
  const ttmByCq = new Map<number, number>();
  for (const cq of cqs) ttmByCq.set(cq, companyTtmByCq.reduce((s, m) => s + (m.get(cq) ?? 0), 0));

  const labels: string[] = [];
  const aggTtm: (number | null)[] = [];
  const aggYoy: (number | null)[] = [];
  for (let i = 0; i < cqs.length; i++) {
    const cq = cqs[i];
    const ttmI = ttmByCq.get(cq)!;
    labels.push(cqLabel.get(cq) ?? String(cq));
    aggTtm.push(r2(ttmI / 1e9));
    // YoY：四個日曆季前（cq 相差 4）
    const prev = ttmByCq.get(cq - 4);
    aggYoy.push(prev != null && prev !== 0 ? r2(((ttmI - prev) / prev) * 100) : null);
  }

  // 取最近 12 季避免圖表過長
  const keep = 12;
  const cLabels = labels.slice(-keep);
  const cTtm = aggTtm.slice(-keep);
  const cYoy = aggYoy.slice(-keep);

  // 優先採用各公司 TTM 直接加總（最穩健）；圖表序列僅作視覺化。
  const aggTtmBn = aggHasTtm
    ? r2(aggTtmSum / 1e9)
    : cTtm.length
      ? cTtm[cTtm.length - 1]
      : null;
  // YoY 僅用同 cohort 的本期/去年 TTM 加總；無完整 cohort 時退回圖表序列最後一筆。
  const aggYoyPct =
    aggHasYoy && yoyPrevSum !== 0
      ? r2(((yoyCurSum - yoyPrevSum) / yoyPrevSum) * 100)
      : cYoy.length
        ? cYoy[cYoy.length - 1]
        : null;
  // 二階導（成長率加速度）：最新 YoY 與約半年前（2 季）YoY 之差
  let accelPp: number | null = null;
  if (cYoy.length >= 3) {
    const last = cYoy[cYoy.length - 1];
    const prior = cYoy[cYoy.length - 3];
    if (last != null && prior != null) accelPp = r2(last - prior);
  }

  let light = "gray";
  if (aggYoyPct != null) {
    if (aggYoyPct < 0) light = "red";
    else if (accelPp != null && accelPp < 0) light = "yellow";
    else light = "green";
  }

  const headline =
    aggYoyPct == null
      ? "資料不足，暫無法判斷合計 capex 趨勢"
      : light === "green"
        ? `雲端資本支出擴張且動能加速（合計 TTM 年增 ${aggYoyPct >= 0 ? "+" : ""}${aggYoyPct}%）`
        : light === "yellow"
          ? `雲端資本支出仍擴張但動能轉弱（合計 TTM 年增 ${aggYoyPct >= 0 ? "+" : ""}${aggYoyPct}%）`
          : `雲端資本支出合計轉收縮（合計 TTM 年增 ${aggYoyPct}%）`;

  return {
    ok: true,
    as_of: nowIso().slice(0, 16).replace("T", " "),
    light,
    headline,
    agg_ttm_usd_bn: aggTtmBn,
    agg_yoy_pct: aggYoyPct,
    accel_pp: accelPp,
    chart: { labels: cLabels, agg_ttm: cTtm, agg_yoy: cYoy },
    companies,
    data_stale: haveData.length < CAPEX_COMPANIES.length,
  };
}

router.get("/ai_capex", async (req, res) => {
  const force = req.query["force"] != null || req.query["refresh"] != null;
  try {
    let payload: AiCapexPayload;
    if (force) {
      payload = await buildAiCapex();
      cacheSet("markets:ai_capex", payload, 21600);
    } else {
      payload = await cached("markets:ai_capex", 21600, buildAiCapex);
    }
    res.json(payload);
  } catch (e) {
    res.json(honestCapex(`資料來源連線失敗（SEC EDGAR）：${(e as Error).message || ""}`));
  }
});

// ─────────────────────────────────────────────────────────────
// 本益比上限 /pe_threshold — 由 ^TNX 10年殖利率計算（GET），可由 operator 覆寫（POST）
// 設定以模組層 in-memory 儲存，重啟後重置。
// ─────────────────────────────────────────────────────────────
let peOverride: number | null = null;

async function computePe() {
  const tnx = await macroPoint("^TNX");
  if (!tnx || !tnx.value) return null;
  const peMax = peOverride ?? r2(1 / (tnx.value / 100));
  const pePrev = tnx.prev ? r2(1 / (tnx.prev / 100)) : null;
  return {
    pe_max: peMax,
    pe_max_prev: pePrev,
    y10: r2(tnx.value),
    y10_prev: r2(tnx.prev),
  };
}

router.get("/pe_threshold", async (_req, res) => {
  try {
    const v = await cached("markets:pe", 60 * 15, computePe);
    if (!v) {
      res.json({ ok: false, error: "無法取得殖利率" });
      return;
    }
    res.json({ ok: true, ...v, overridden: peOverride != null });
  } catch (e) {
    res.json({ ok: false, error: (e as Error).message || "載入失敗" });
  }
});

router.post("/pe_threshold", rateLimit({ windowMs: 60_000, max: 5, key: "pe_set" }), (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, error: "密碼錯誤" });
    return;
  }
  const v = Number(req.body?.pe_max);
  if (!isFinite(v) || v <= 0) {
    res.status(400).json({ ok: false, error: "無效的本益比上限" });
    return;
  }
  peOverride = r2(v);
  res.json({ ok: true, pe_max: peOverride });
});

export default router;
