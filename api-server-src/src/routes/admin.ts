import { Router, type IRouter } from "express";
import { db, markersTable } from "../_shims/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { fetchCandles } from "../lib/yahoo";
import { runStrategy } from "../lib/indicators";
import { getWatchlist, resolveStock } from "../lib/stocks";
import { fetchStockNews } from "../lib/news";
import { rateLimit } from "../lib/ratelimit";
import { cached } from "../lib/cache";

const router: IRouter = Router();

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged operator actions are disabled until an
  // operator secret is configured (per project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

// ════════════════════════════════════════════════════════════════════
// System log ring buffer (in-memory; cleared on restart)
// Captures real console.warn / console.error output plus a seed entry.
// ════════════════════════════════════════════════════════════════════
interface LogEntry {
  id: number;
  ts: number; // unix seconds
  level: string;
  logger: string;
  msg: string;
  exc: string | null;
}
const LOG_CAP = 2000;
const logBuf: LogEntry[] = [];
let logSeq = 0;

function pushLog(level: string, logger: string, msg: string, exc: string | null): void {
  logSeq += 1;
  logBuf.push({ id: logSeq, ts: Math.floor(Date.now() / 1000), level, logger, msg, exc });
  if (logBuf.length > LOG_CAP) logBuf.splice(0, logBuf.length - LOG_CAP);
}

// Wrap console.warn / console.error once so genuine warnings/errors land in
// the ring buffer without editing the shared logger lib.
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);
console.warn = (...args: unknown[]): void => {
  try {
    pushLog("WARNING", "console", args.map((a) => String(a)).join(" "), null);
  } catch {
    /* never break logging */
  }
  _origWarn(...args);
};
console.error = (...args: unknown[]): void => {
  try {
    pushLog("ERROR", "console", args.map((a) => String(a)).join(" "), null);
  } catch {
    /* never break logging */
  }
  _origError(...args);
};
pushLog("WARNING", "system", "Log buffer initialized (in-memory ring buffer, clears on restart)", null);

router.get("/admin/logs", (req, res) => {
  // Operator-only PII/diagnostic data — password via header, NEVER query string.
  // Closed by default until STOCK_OPERATOR_PASSWORD is configured.
  if (!operatorOk(req.header("x-operator-password"))) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const level = String(req.query.level ?? "ALL").toUpperCase();
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const sinceId = Number(req.query.since_id ?? 0) || 0;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 2000) || 2000, 1), LOG_CAP);

  const levelOk = (lv: string): boolean => {
    if (level === "ALL" || level === "") return true;
    if (level === "WARNING") return lv === "WARNING";
    if (level === "ERROR") return lv === "ERROR" || lv === "CRITICAL";
    if (level === "CRITICAL") return lv === "CRITICAL";
    return true;
  };

  let items = logBuf.filter((e) => e.id > sinceId && levelOk(e.level));
  if (q) {
    items = items.filter(
      (e) => e.msg.toLowerCase().includes(q) || e.logger.toLowerCase().includes(q),
    );
  }
  items = items.slice(-limit);
  res.json({ ok: true, items, buffer_size: logBuf.length, capacity: LOG_CAP });
});

router.post(
  "/admin/logs/clear",
  rateLimit({ windowMs: 60_000, max: 5, key: "logs_clear" }),
  (req, res) => {
  if (!operatorOk(req.body?.password)) {
    res.status(403).json({ ok: false, error: "密碼錯誤" });
    return;
  }
  logBuf.length = 0;
  res.json({ ok: true });
  },
);

// ════════════════════════════════════════════════════════════════════
// Conference (法說會) — best-effort REAL data via a keyword-filtered proxy
// over TWSE 重大訊息 (material announcements, openapi t187ap04_L).
//
// IMPORTANT: This is NOT a dedicated 法說會 transcript / AI-sentiment
// source — no such free feed exists. We surface real material
// announcements whose 主旨/說明 mention 法說會 / 法人說明會 / 業績發表會 /
// 法人說明 as conference events. AI sentiment is therefore unavailable
// (`ai: null` → the page renders "尚未 AI 解讀"), and sentiment_stats keeps
// honest-limited zero buckets while still reporting the real total/date.
// (NOTE: /conference/:code lives in stock.ts — do NOT redefine it here.)
// ════════════════════════════════════════════════════════════════════
const CONFERENCE_KEYWORDS = ["法說會", "法人說明會", "業績發表會", "法人說明"];
const CONFERENCE_TTL = 21600; // 6h

interface MopsRecord {
  出表日期?: string;
  發言日期?: string;
  發言時間?: string;
  公司代號?: string;
  公司名稱?: string;
  // NOTE: the 主旨 key has a trailing space in the source payload.
  "主旨 "?: string;
  符合條款?: string;
  事實發生日?: string;
  說明?: string;
}

interface ConferenceEvent {
  code: string;
  name: string;
  meeting_date: string;
  meeting_time: string;
  location: string;
  subject: string;
  pdf_zh: string | null;
  ai: null;
}

// ROC date like "1150612" (民國年) → Gregorian "2026-06-12".
function rocToGregorian(s: unknown): string | null {
  const digits = String(s ?? "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  const day = digits.slice(-2);
  const month = digits.slice(-4, -2);
  const yearRoc = Number(digits.slice(0, -4));
  if (!Number.isFinite(yearRoc) || yearRoc <= 0) return null;
  const year = yearRoc + 1911;
  return `${year}-${month}-${day}`;
}

// Normalize a ROC "HHMMSS" / "HH:MM" time string into "HH:MM" (best-effort).
function fmtMopsTime(s: unknown): string {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  return raw;
}

async function fetchConferenceEvents(): Promise<{
  events: ConferenceEvent[];
  lastUpdate: string | null;
}> {
  const url = "https://openapi.twse.com.tw/v1/opendata/t187ap04_L";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; donttalk/1.0)" },
  });
  if (!res.ok) throw new Error(`TWSE t187ap04_L HTTP ${res.status}`);
  const json = (await res.json()) as unknown as MopsRecord[];
  if (!Array.isArray(json)) throw new Error("unexpected MOPS payload");

  let lastUpdate: string | null = null;
  const events: ConferenceEvent[] = [];
  for (const rec of json) {
    const subject = String(rec["主旨 "] ?? "").trim();
    const detail = String(rec["說明"] ?? "").trim();
    const hay = `${subject}\n${detail}`;
    if (!CONFERENCE_KEYWORDS.some((kw) => hay.includes(kw))) continue;

    const code = String(rec["公司代號"] ?? "").trim();
    const name = String(rec["公司名稱"] ?? "").trim();
    const meetingDate = rocToGregorian(rec["發言日期"]);
    if (!code || !meetingDate) continue;

    const issue = rocToGregorian(rec["出表日期"]);
    if (issue && (!lastUpdate || issue > lastUpdate)) lastUpdate = issue;

    events.push({
      code,
      name,
      meeting_date: meetingDate,
      meeting_time: fmtMopsTime(rec["發言時間"]),
      location: "",
      subject,
      pdf_zh: null,
      ai: null,
    });
  }
  events.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : a.meeting_date > b.meeting_date ? -1 : 0));
  return { events, lastUpdate };
}

router.get("/conference", async (req, res) => {
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const watchOnly = String(req.query.watch_only ?? "0") === "1";
  try {
    const { events, lastUpdate } = await cached(
      "conference_events",
      CONFERENCE_TTL,
      fetchConferenceEvents,
    );
    let rows = events;
    if (from) rows = rows.filter((e) => e.meeting_date >= from);
    if (to) rows = rows.filter((e) => e.meeting_date <= to);
    if (watchOnly) {
      try {
        const wl = await getWatchlist();
        const codes = new Set(wl.map((s) => s.code));
        rows = rows.filter((e) => codes.has(e.code));
      } catch {
        /* if watchlist lookup fails, fall back to unfiltered */
      }
    }
    res.json({ ok: true, count: rows.length, data: rows, last_update: lastUpdate });
  } catch (e) {
    // Honest-limited: source unavailable — render empty, never crash/fabricate.
    res.json({
      ok: true,
      count: 0,
      data: [],
      last_update: null,
      is_limited: true,
      note: `法說會資料來源（TWSE 重大訊息）暫時無法取得：${(e as Error).message}`,
    });
  }
});

router.get("/conference/sentiment_stats", async (req, res) => {
  const days = Number(req.query.days ?? 365) || 365;
  const emptyWindows = {
    "5": { n: 0, avg_return: null },
    "20": { n: 0, avg_return: null },
    "60": { n: 0, avg_return: null },
  };
  const stats = ["利多", "利空", "中性"].map((sentiment) => ({
    sentiment,
    n_total: 0,
    windows: emptyWindows,
  }));
  try {
    const { events, lastUpdate } = await cached(
      "conference_events",
      CONFERENCE_TTL,
      fetchConferenceEvents,
    );
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const recent = events.filter((e) => e.meeting_date >= cutoff);
    // n_conferences/as_of are REAL; per-sentiment buckets stay zero because
    // no free 法說會 sentiment source exists (honest-limited).
    res.json({
      ok: true,
      days,
      n_conferences: recent.length,
      as_of: lastUpdate,
      stats,
      is_limited: true,
      note: "情緒分類無免費資料源；總場數/日期為真實值，多空中性後續報酬統計暫不提供。",
    });
  } catch (e) {
    res.json({
      ok: true,
      days,
      n_conferences: 0,
      as_of: null,
      stats,
      is_limited: true,
      note: `法說會資料來源暫時無法取得：${(e as Error).message}`,
    });
  }
});

// ════════════════════════════════════════════════════════════════════
// Ad-hoc 個股新聞掃描 (stock news scan) — reuses fetchStockNews (RSS) +
// local keyword scoring. Runs synchronously and returns a cached-style
// result so the page renders immediately.
// ════════════════════════════════════════════════════════════════════
const NEWS_SCAN_CAP = 50;
let newsScanDate = "";
let newsScanUsed = 0;
function newsQuota(): { cap: number; used: number; left: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== newsScanDate) {
    newsScanDate = today;
    newsScanUsed = 0;
  }
  return { cap: NEWS_SCAN_CAP, used: newsScanUsed, left: Math.max(0, NEWS_SCAN_CAP - newsScanUsed) };
}

router.get("/stock_news_scan/quota", (_req, res) => {
  const q = newsQuota();
  res.json({ ok: true, ...q });
});

router.post(
  "/stock_news_scan",
  rateLimit({ windowMs: 60_000, max: 6, key: "news_scan" }),
  async (req, res) => {
    const inputs: string[] = Array.isArray(req.body?.inputs)
      ? req.body.inputs.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 5)
      : [];
    if (!inputs.length) {
      res.status(400).json({ ok: false, msg: "請至少輸入 1 檔股票代碼或名稱" });
      return;
    }
    const q = newsQuota();
    if (q.left <= 0) {
      res.json({ ok: false, msg: "今日掃描額度已用盡" });
      return;
    }

    const results: {
      stock_code: string;
      stock_name: string;
      news_count: number;
      ai: { label: string; confidence: number | null; source: string; reason: string };
      news: {
        title: string;
        link: string;
        source: string | null;
        hours_ago: number | null;
        sentiment_label: string | null;
      }[];
    }[] = [];

    for (const input of inputs) {
      try {
        const { name } = await resolveStock(input);
        const sn = await fetchStockNews(input, name);
        const label = sn.sentiment.sentiment;
        const reason =
          sn.sentiment.matched.length > 0
            ? `關鍵字命中：${sn.sentiment.matched.join("、")}（綜合分數 ${sn.sentiment.score}）`
            : "近期新聞無明顯多空關鍵字";
        results.push({
          stock_code: input,
          stock_name: name,
          news_count: sn.sentiment.totalNews,
          ai: { label, confidence: null, source: "fallback", reason },
          news: sn.news.map((n) => ({
            title: n.title,
            link: n.link,
            source: n.source ?? null,
            hours_ago: n.pub_ts ? Math.max(0, Math.round((Date.now() - n.pub_ts) / 3_600_000)) : null,
            sentiment_label: null,
          })),
        });
      } catch {
        /* unresolved code/name — skip */
      }
    }

    newsScanUsed += results.length || 1;

    const summary = {
      bullish: results.filter((r) => r.ai.label.includes("多")).length,
      bearish: results.filter((r) => r.ai.label.includes("空")).length,
      neutral: results.filter((r) => !r.ai.label.includes("多") && !r.ai.label.includes("空")).length,
      ai_available: false,
    };

    res.json({
      ok: true,
      cached: true,
      result: {
        scanned_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        summary,
        results,
      },
    });
  },
);

// ════════════════════════════════════════════════════════════════════
// Marker history — REAL data from markersTable.
// ════════════════════════════════════════════════════════════════════
function markerSource(type: string, text: string): "trade" | "event" {
  const t = (type || "").toLowerCase();
  if (t === "trade" || t === "event") return t;
  const s = String(text || "");
  if (s.includes("買") || s.includes("賣") || t.includes("buy") || t.includes("sell")) return "trade";
  return "event";
}
function markerPosition(text: string): string {
  const s = String(text || "");
  if (s.includes("賣")) return "aboveBar";
  if (s.includes("買")) return "belowBar";
  return "";
}
function fmtCreatedAt(d: Date | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toISOString().replace("T", " ").slice(0, 19);
  } catch {
    return null;
  }
}

interface MarkerRow {
  code: string;
  date: string;
  type: string;
  text: string;
  price: number | null;
  createdAt: Date;
}
function mapMarkerRow(r: MarkerRow) {
  return {
    scan_date: r.date,
    code: r.code,
    source: markerSource(r.type, r.text),
    position: markerPosition(r.text),
    marker_text: r.text,
    close: r.price,
    ma5: null as number | null,
    ma10: null as number | null,
    ma20: null as number | null,
    ma60: null as number | null,
    created_at: fmtCreatedAt(r.createdAt),
  };
}

async function queryMarkers(opts: {
  code: string;
  source: string;
  from: string;
  to: string;
  limit: number;
}) {
  const conds = [];
  if (opts.code) conds.push(eq(markersTable.code, opts.code));
  if (opts.from) conds.push(gte(markersTable.date, opts.from));
  if (opts.to) conds.push(lte(markersTable.date, opts.to));
  const rows = await db
    .select()
    .from(markersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(markersTable.date))
    .limit(opts.limit * 2);
  let mapped = rows.map(mapMarkerRow);
  if (opts.source) mapped = mapped.filter((r) => r.source === opts.source);
  return mapped.slice(0, opts.limit);
}

router.get("/markers/history", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 500) || 500, 10), 5000);
    const rows = await queryMarkers({
      code: String(req.query.code ?? "").trim(),
      source: String(req.query.source ?? "").trim(),
      from: String(req.query.from ?? "").trim(),
      to: String(req.query.to ?? "").trim(),
      limit,
    });
    res.json({ ok: true, rows });
  } catch (e) {
    res.json({ ok: false, msg: (e as Error).message || "查詢失敗", rows: [] });
  }
});

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get(
  "/markers/export.csv",
  // Marker history is the same non-PII data exposed by the public
  // /markers/history endpoint, so this export is rate-limited (to deter
  // bulk-scrape abuse) rather than password-gated — the threat model
  // forbids reading secrets from the query string, which is the only
  // channel a browser navigation/download can use here.
  rateLimit({ windowMs: 60_000, max: 5, key: "markers_csv" }),
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20000) || 20000, 10), 50000);
      const rows = await queryMarkers({
        code: String(req.query.code ?? "").trim(),
        source: String(req.query.source ?? "").trim(),
        from: String(req.query.from ?? "").trim(),
        to: String(req.query.to ?? "").trim(),
        limit,
      });
      const header = [
        "scan_date",
        "code",
        "source",
        "position",
        "marker_text",
        "close",
        "ma5",
        "ma10",
        "ma20",
        "ma60",
        "created_at",
      ];
      const lines = rows.map((r) =>
        [
          r.scan_date,
          r.code,
          r.source,
          r.position,
          r.marker_text,
          r.close,
          r.ma5,
          r.ma10,
          r.ma20,
          r.ma60,
          r.created_at,
        ]
          .map(csvEscape)
          .join(","),
      );
      const csv = "\uFEFF" + header.join(",") + "\n" + lines.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="markers_${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (e) {
      res.status(500).json({ ok: false, msg: (e as Error).message || "匯出失敗" });
    }
  },
);

// ════════════════════════════════════════════════════════════════════
// Batch marker scan — operator-gated + rate-limited. Iterates a capped
// slice of the watchlist, recomputes MA strategy markers and persists
// them to markersTable (REAL data). In-memory job map (clears on restart).
// ════════════════════════════════════════════════════════════════════
interface BatchTask {
  status: "running" | "completed";
  total: number;
  done: number;
  recorded: number;
  errors: number;
}
const batchJobs = new Map<string, BatchTask>();
let currentBatchId: string | null = null;

async function runBatchScan(taskId: string, days: number): Promise<void> {
  const task = batchJobs.get(taskId);
  if (!task) return;
  try {
    const list = await getWatchlist();
    const capped = list.slice(0, 40); // cap to avoid timeouts on market-wide scan
    task.total = capped.length;
    for (const s of capped) {
      try {
        const candles = await fetchCandles(s.ticker, Math.min(days, 400) + 60);
        const strat = runStrategy(candles);
        const byTime = new Map(candles.map((c) => [c.time, c]));
        const recent = strat.markers.slice(-50);
        if (recent.length) {
          await db
            .delete(markersTable)
            .where(and(eq(markersTable.code, s.code), eq(markersTable.type, "trade")));
          const insertRows = recent.map((m) => ({
            code: s.code,
            date: m.time,
            type: "trade",
            text: m.text,
            price: byTime.get(m.time)?.close ?? null,
          }));
          await db.insert(markersTable).values(insertRows);
          task.recorded += insertRows.length;
        }
      } catch {
        task.errors += 1;
      }
      task.done += 1;
    }
  } catch {
    /* fall through to completed */
  } finally {
    task.status = "completed";
    if (currentBatchId === taskId) currentBatchId = null;
  }
}

router.post(
  "/markers/batch_scan",
  rateLimit({ windowMs: 5 * 60_000, max: 2, key: "markers_batch" }),
  (req, res) => {
    if (!operatorOk(req.body?.pwd ?? req.body?.password)) {
      res.status(403).json({ ok: false, msg: "密碼錯誤" });
      return;
    }
    if (currentBatchId && batchJobs.get(currentBatchId)?.status === "running") {
      res.json({ ok: true, already_running: true, task_id: currentBatchId });
      return;
    }
    const days = Math.min(Math.max(Number(req.body?.days ?? 250) || 250, 30), 400);
    const taskId = `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    batchJobs.set(taskId, { status: "running", total: 0, done: 0, recorded: 0, errors: 0 });
    currentBatchId = taskId;
    // fire-and-forget
    void runBatchScan(taskId, days);
    res.json({ ok: true, already_running: false, task_id: taskId });
  },
);

router.get("/markers/batch_scan/status/:id", (req, res) => {
  const task = batchJobs.get(req.params.id);
  if (!task) {
    res.json({ ok: false, msg: "查無此任務" });
    return;
  }
  res.json({ ok: true, task });
});

export default router;
