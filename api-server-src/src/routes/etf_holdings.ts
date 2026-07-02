import { Router, type IRouter, type Request } from "express";
import { cached, cacheSet, cacheGet } from "../lib/cache";
import { rateLimit } from "../lib/ratelimit";
import { fetchMeta } from "../lib/yahoo";

const router: IRouter = Router();

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: ETF *constituent-holdings* (成分股權重/明細) have NO unified, reliable,
// free data source in Taiwan. Endpoints that need constituent weights therefore
// return correctly-shaped but HONEST empty/limited payloads (the frontend renders
// an empty state instead of crashing). What IS obtainable for free — each ETF's
// REAL market price / daily change — is fetched from Yahoo Finance and attached
// to the tracking-list response (`/etf_holdings/list`). The ETF tracking list +
// snapshot bookkeeping use MODULE-LEVEL in-memory stores — they RESET on server
// restart (no DB schema added, to avoid migration conflicts during parallel work).
// ─────────────────────────────────────────────────────────────────────────────

function operatorOk(password: unknown): boolean {
  const expected = process.env["STOCK_OPERATOR_PASSWORD"];
  // Closed by default: privileged operator actions are disabled until an
  // operator secret is configured (per project threat model — no open mode).
  if (!expected) return false;
  return typeof password === "string" && password === expected;
}

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function qs(req: Request, key: string): string {
  const v = req.query[key];
  if (Array.isArray(v)) return String(v[0] ?? "");
  return v == null ? "" : String(v);
}

const NO_SOURCE_NOTE =
  "各 ETF 成分股權重/明細無統一免費 API，無法提供成分股級資料；ETF 本身的價格與漲跌幅為即時真實值（見追蹤清單）。";

// ── In-memory ETF tracking list (seeded; resets on restart) ──────────────────
type EtfItem = { code: string; name: string };
const SEED_ETFS: EtfItem[] = [
  { code: "0050", name: "元大台灣50" },
  { code: "0051", name: "元大中型100" },
  { code: "0052", name: "富邦科技" },
  { code: "0053", name: "元大電子" },
  { code: "0055", name: "元大MSCI金融" },
  { code: "0056", name: "元大高股息" },
  { code: "0057", name: "富邦摩台" },
  { code: "006203", name: "元大MSCI台灣" },
  { code: "006204", name: "永豐臺灣加權" },
  { code: "006208", name: "富邦台50" },
  { code: "00690", name: "兆豐藍籌30" },
  { code: "00692", name: "富邦公司治理" },
  { code: "00701", name: "國泰股利精選30" },
  { code: "00713", name: "元大台灣高息低波" },
  { code: "00728", name: "第一金工業30" },
  { code: "00730", name: "富邦臺灣優質高息" },
  { code: "00731", name: "復華富時高息低波" },
  { code: "00733", name: "富邦臺灣中小" },
  { code: "00735", name: "國泰臺韓科技" },
  { code: "00850", name: "元大臺灣ESG永續" },
  { code: "00878", name: "國泰永續高股息" },
  { code: "00881", name: "國泰台灣5G+" },
  { code: "00888", name: "永豐台灣ESG" },
  { code: "00891", name: "中信關鍵半導體" },
  { code: "00892", name: "富邦台灣半導體" },
  { code: "00894", name: "中信小資高價30" },
  { code: "00900", name: "富邦特選高股息30" },
  { code: "00901", name: "永豐智能車供應鏈" },
  { code: "00905", name: "FT臺灣Smart" },
  { code: "00907", name: "永豐優息存股" },
  { code: "00912", name: "中信臺灣智慧50" },
  { code: "00913", name: "兆豐台灣晶圓製造" },
  { code: "00915", name: "凱基優選高股息30" },
  { code: "00919", name: "群益台灣精選高息" },
  { code: "00921", name: "兆豐龍頭等權重" },
  { code: "00922", name: "國泰台灣領袖50" },
  { code: "00923", name: "群益台ESG低碳50" },
  { code: "00927", name: "群益半導體收益" },
  { code: "00929", name: "復華台灣科技優息" },
  { code: "00930", name: "永豐ESG低碳高息" },
  { code: "00932", name: "兆豐永續高息等權" },
  { code: "00934", name: "中信成長高股息" },
  { code: "00935", name: "野村臺灣新科技50" },
  { code: "00936", name: "台新永續高息中小" },
  { code: "00944", name: "野村趨勢動能高息" },
  { code: "00947", name: "台新臺灣IC設計" },
  { code: "00952", name: "凱基台灣AI50" },
  { code: "009802", name: "富邦旗艦50" },
  { code: "009803", name: "保德信市值動能50" },
  { code: "00981A", name: "統一台股增長" },
  { code: "00982A", name: "群益台灣強棒" },
];
const etfList = new Map<string, EtfItem>(SEED_ETFS.map((e) => [e.code, e]));

// ── Real per-ETF price/return (Yahoo Finance) ────────────────────────────────
// This is the ONE piece of ETF-level data obtainable for free. Constituent
// holdings remain honest-limited; the ETF's own market price/change does not.
type EtfPrice = { price: number | null; change: number | null; change_pct: number | null };
const NULL_PRICE: EtfPrice = { price: null, change: null, change_pct: null };

async function fetchEtfPrice(code: string): Promise<EtfPrice> {
  try {
    // Listed ETFs trade on TWSE → ".TW". Wrapped fetchMeta never throws (returns null).
    const meta = await fetchMeta(`${code}.TW`);
    if (!meta || meta.price == null || !Number.isFinite(meta.price)) return { ...NULL_PRICE };
    const price = r2(meta.price);
    let change: number | null = null;
    let change_pct: number | null = null;
    if (meta.prevClose != null && Number.isFinite(meta.prevClose) && meta.prevClose !== 0) {
      change = r2(meta.price - meta.prevClose);
      change_pct = r2(((meta.price - meta.prevClose) / meta.prevClose) * 100);
    }
    return { price, change, change_pct };
  } catch {
    return { ...NULL_PRICE };
  }
}

// Cached map code→price (10 min). Computed across the current tracked codes.
async function getEtfPriceMap(codes: string[]): Promise<Record<string, EtfPrice>> {
  return cached("etf_price_map", 600, async () => {
    const entries = await Promise.all(
      codes.map(async (code): Promise<[string, EtfPrice]> => [code, await fetchEtfPrice(code)]),
    );
    return Object.fromEntries(entries);
  });
}

// ── In-memory snapshot store (resets on restart) ─────────────────────────────
type Holding = { stock_code: string; stock_name: string; weight: number };
type Snapshot = {
  id: number;
  etf_code: string;
  fetched_at: string;
  source: string;
  holding_count: number;
  holdings: Holding[];
};
let snapshotSeq = 1;
const snapshots = new Map<string, Snapshot[]>(); // etf_code → snapshots (oldest→newest)

function addSnapshot(etfCode: string): Snapshot {
  // No real holdings source → store an honest empty snapshot.
  const snap: Snapshot = {
    id: snapshotSeq++,
    etf_code: etfCode,
    fetched_at: nowStr(),
    source: "無資料來源",
    holding_count: 0,
    holdings: [],
  };
  const arr = snapshots.get(etfCode) ?? [];
  arr.push(snap);
  snapshots.set(etfCode, arr);
  return snap;
}

// ── analyze (共同持股) job — in-memory ────────────────────────────────────────
type AnalyzeResult = {
  total_etf: number;
  success_etf: number;
  failed_etf: string[];
  top_holdings: unknown[];
  source_stats: Record<string, number>;
  prev_compared_at: string | null;
};
type AnalyzeJob = {
  running: boolean;
  done: number;
  total: number;
  error: string | null;
  result: AnalyzeResult | null;
  started_at: string | null;
  finished_at: string | null;
};
let analyzeJob: AnalyzeJob = {
  running: false,
  done: 0,
  total: 0,
  error: null,
  result: null,
  started_at: null,
  finished_at: null,
};

// POST /etf_holdings/analyze
router.post(
  "/etf_holdings/analyze",
  rateLimit({ windowMs: 60_000, max: 10, key: "etf_analyze" }),
  (req, res) => {
    // Expensive maintenance action → operator-gated (closed by default) per threat model.
    if (!operatorOk((req.body ?? {}).password)) {
      res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
      return;
    }
    const total = etfList.size;
    const started = nowStr();
    // No constituent-holding data source → complete immediately with honest empty result.
    analyzeJob = {
      running: false,
      done: total,
      total,
      error: null,
      started_at: started,
      finished_at: nowStr(),
      result: {
        total_etf: total,
        success_etf: 0,
        failed_etf: [],
        top_holdings: [],
        source_stats: {},
        prev_compared_at: null,
      },
    };
    res.json({ ok: true, msg: "分析已啟動", note: NO_SOURCE_NOTE });
  },
);

// GET /etf_holdings/status
router.get("/etf_holdings/status", (_req, res) => {
  res.json(analyzeJob);
});

// POST /etf_holdings/clear_cache
router.post(
  "/etf_holdings/clear_cache",
  rateLimit({ windowMs: 60_000, max: 5, key: "etf_clear_cache" }),
  (req, res) => {
  if (!operatorOk((req.body ?? {}).password)) {
    res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
    return;
  }
  analyzeJob = {
    running: false,
    done: 0,
    total: 0,
    error: null,
    result: null,
    started_at: null,
    finished_at: null,
  };
  res.json({ ok: true, msg: "已清除快取" });
  },
);

// ── ETF tracking list CRUD ───────────────────────────────────────────────────
// GET /etf_holdings/list
router.get("/etf_holdings/list", async (_req, res) => {
  const items = Array.from(etfList.values()).sort((a, b) => a.code.localeCompare(b.code));
  // Enrich each ETF with its REAL market price / daily change from Yahoo (the only
  // free ETF-level data). Constituent holdings stay honest-limited elsewhere.
  // Existing keys (code, name) are preserved; price fields are additive and never
  // break the page if Yahoo is unavailable (they come back null).
  let priceMap: Record<string, EtfPrice> = {};
  try {
    priceMap = await getEtfPriceMap(items.map((i) => i.code));
  } catch {
    priceMap = {};
  }
  const enriched = items.map((it) => ({ ...it, ...(priceMap[it.code] ?? NULL_PRICE) }));
  res.json({ ok: true, count: enriched.length, items: enriched });
});

// POST /etf_holdings/list/add  (operator-gated)
router.post("/etf_holdings/list/add", (req, res) => {
  const body = (req.body ?? {}) as { code?: unknown; name?: unknown; password?: unknown };
  if (!operatorOk(body.password)) {
    res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
    return;
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || !name) {
    res.json({ ok: false, msg: "代號與名稱皆必填" });
    return;
  }
  if (etfList.has(code)) {
    res.json({ ok: false, msg: `${code} 已在清單中` });
    return;
  }
  etfList.set(code, { code, name });
  res.json({ ok: true, msg: `已新增 ${code} ${name}` });
});

// POST /etf_holdings/list/remove  (operator-gated)
router.post("/etf_holdings/list/remove", (req, res) => {
  const body = (req.body ?? {}) as { code?: unknown; password?: unknown };
  if (!operatorOk(body.password)) {
    res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
    return;
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!etfList.has(code)) {
    res.json({ ok: false, msg: `${code} 不在清單中` });
    return;
  }
  etfList.delete(code);
  // 歷史快照保留（不刪除）。
  res.json({ ok: true, msg: `已移除 ${code}（歷史快照保留）` });
});

// ── Snapshots ────────────────────────────────────────────────────────────────
// GET /etf_holdings/snapshots/:code
router.get("/etf_holdings/snapshots/:code", (req, res) => {
  const code = req.params.code.replace(".TW", "");
  const limit = Math.max(1, Math.min(200, Number(qs(req, "limit")) || 30));
  const arr = (snapshots.get(code) ?? []).slice().reverse().slice(0, limit);
  res.json({
    ok: true,
    snapshots: arr.map((s) => ({
      id: s.id,
      fetched_at: s.fetched_at,
      source: s.source,
      holding_count: s.holding_count,
    })),
  });
});

// POST /etf_holdings/snapshot  body {etf_code}
router.post(
  "/etf_holdings/snapshot",
  rateLimit({ windowMs: 60_000, max: 20, key: "etf_snapshot" }),
  (req, res) => {
    const body = (req.body ?? {}) as { etf_code?: unknown; password?: unknown };
    if (!operatorOk(body.password)) {
      res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
      return;
    }
    const code = typeof body.etf_code === "string" ? body.etf_code.replace(".TW", "").trim() : "";
    if (!code) {
      res.json({ ok: false, msg: "缺少 etf_code" });
      return;
    }
    const snap = addSnapshot(code);
    res.json({ ok: true, snapshot_id: snap.id, note: NO_SOURCE_NOTE });
  },
);

// GET /etf_holdings/export/:code  → CSV download
router.get("/etf_holdings/export/:code", (req, res) => {
  const code = req.params.code.replace(".TW", "");
  const limit = Math.max(1, Math.min(200, Number(qs(req, "limit")) || 30));
  const arr = (snapshots.get(code) ?? []).slice().reverse().slice(0, limit);
  const lines: string[] = ["snapshot_id,fetched_at,source,stock_code,stock_name,weight"];
  for (const s of arr) {
    if (s.holdings.length === 0) {
      lines.push(`${s.id},${s.fetched_at},${s.source},,,`);
    } else {
      for (const h of s.holdings) {
        lines.push(`${s.id},${s.fetched_at},${s.source},${h.stock_code},${h.stock_name},${h.weight}`);
      }
    }
  }
  const csv = "\uFEFF" + lines.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="etf_holdings_${code}.csv"`);
  res.send(csv);
});

// POST /etf_holdings/snapshot_all  — batch snapshot all tracked ETFs
type SnapshotAllJob = {
  running: boolean;
  done: number;
  total: number;
  current: string;
  ok_count: number;
  fail_count: number;
  error: string | null;
  failed_codes: string[];
};
let snapshotAllJob: SnapshotAllJob = {
  running: false,
  done: 0,
  total: 0,
  current: "",
  ok_count: 0,
  fail_count: 0,
  error: null,
  failed_codes: [],
};

router.post(
  "/etf_holdings/snapshot_all",
  rateLimit({ windowMs: 60_000, max: 3, key: "etf_snapshot_all" }),
  (req, res) => {
    if (!operatorOk((req.body ?? {}).password)) {
      res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
      return;
    }
    const codes = Array.from(etfList.keys());
    // Synchronous, honest: create an empty snapshot per tracked ETF.
    for (const code of codes) addSnapshot(code);
    snapshotAllJob = {
      running: false,
      done: codes.length,
      total: codes.length,
      current: "",
      ok_count: codes.length,
      fail_count: 0,
      error: null,
      failed_codes: [],
    };
    res.json({ ok: true, msg: "批次快照完成", note: NO_SOURCE_NOTE });
  },
);

// GET /etf_holdings/snapshot_all/status
router.get("/etf_holdings/snapshot_all/status", (_req, res) => {
  res.json(snapshotAllJob);
});

// GET /etf_holdings/diff/:code — diff of last two snapshots
router.get("/etf_holdings/diff/:code", (req, res) => {
  const code = req.params.code.replace(".TW", "");
  const arr = snapshots.get(code) ?? [];
  if (arr.length < 2) {
    res.json({
      ok: true,
      status: "no_diff",
      message: "快照不足，無法比對（需至少 2 筆）",
      snapshot_count: arr.length,
    });
    return;
  }
  const newSnap = arr[arr.length - 1];
  const oldSnap = arr[arr.length - 2];
  // Holdings are empty (no source) → honest empty diff.
  res.json({
    ok: true,
    status: "ok",
    new_time: newSnap.fetched_at,
    old_time: oldSnap.fetched_at,
    summary: { added: 0, removed: 0, changed: 0, unchanged: 0 },
    holdings: [],
    note: NO_SOURCE_NOTE,
  });
});

// ── 個股新聞 AI 掃描（前 10 大持股）— task based ──────────────────────────────
type ScanResult = {
  scanned_at: string;
  summary: { bullish: number; neutral: number; bearish: number; ai_available: boolean };
  results: unknown[];
};
type ScanTask = {
  id: string;
  code: string;
  total: number;
  done: number;
  step: string;
  status: "queued" | "running" | "done" | "error";
  result: ScanResult | null;
  error: string | null;
};
const scanTasks = new Map<string, ScanTask>();
let scanSeq = 1;

function emptyScanResult(): ScanResult {
  return {
    scanned_at: nowStr(),
    summary: { bullish: 0, neutral: 0, bearish: 0, ai_available: false },
    results: [],
  };
}

// POST /etf_holdings/stock_scan/:code
router.post(
  "/etf_holdings/stock_scan/:code",
  rateLimit({ windowMs: 60_000, max: 10, key: "etf_stock_scan" }),
  (req, res) => {
    if (!operatorOk((req.body ?? {}).password)) {
      res.status(403).json({ ok: false, msg: "密碼錯誤或管理功能未啟用" });
      return;
    }
    const code = String(req.params.code).replace(".TW", "");
    const id = `scan_${scanSeq++}`;
    // No holdings source → finish immediately with honest empty result, also cache it.
    const result = emptyScanResult();
    const task: ScanTask = {
      id,
      code,
      total: 0,
      done: 0,
      step: "done",
      status: "done",
      result,
      error: null,
    };
    scanTasks.set(id, task);
    cacheSet(`etf_scan_result:${code}`, result, 1800);
    res.json({ ok: true, task_id: id });
  },
);

// GET /etf_holdings/stock_scan/status/:taskId
router.get("/etf_holdings/stock_scan/status/:taskId", (req, res) => {
  const task = scanTasks.get(req.params.taskId);
  if (!task) {
    res.json({ ok: false, msg: "任務不存在" });
    return;
  }
  res.json({
    ok: true,
    total: task.total,
    done: task.done,
    step: task.step,
    status: task.status,
    result: task.result,
    error: task.error,
  });
});

// GET /etf_holdings/stock_scan/result/:code
router.get("/etf_holdings/stock_scan/result/:code", (req, res) => {
  const code = req.params.code.replace(".TW", "");
  const cachedResult = cacheGet<ScanResult>(`etf_scan_result:${code}`);
  if (cachedResult) {
    res.json({ ok: true, result: cachedResult });
    return;
  }
  res.json({ ok: false });
});

// ── Pivot analytics ──────────────────────────────────────────────────────────
// All require constituent-holding history (≥2 snapshots with weights) which has
// no source → return honest empty/limited shapes the pages already handle.

// GET /etf_holdings/pivot/overlap
router.get("/etf_holdings/pivot/overlap", (req, res) => {
  const etfs = qs(req, "etfs").split(",").map((s) => s.trim()).filter(Boolean);
  const method = qs(req, "method") || "jaccard";
  res.json({ ok: false, method, cached: false, etfs, error: NO_SOURCE_NOTE });
});

// GET /etf_holdings/pivot/overlap_detail/:a/:b
router.get("/etf_holdings/pivot/overlap_detail/:a/:b", (_req, res) => {
  res.json({ ok: true, total_common: 0, stocks: [], note: NO_SOURCE_NOTE });
});

// GET /etf_holdings/pivot/weight_matrix
router.get("/etf_holdings/pivot/weight_matrix", (req, res) => {
  const etfs = qs(req, "etfs").split(",").map((s) => s.trim()).filter(Boolean);
  res.json({
    ok: true,
    cached: false,
    etfs,
    summary: { total_unique_stocks: 0, shown: 0 },
    stocks: [],
    note: NO_SOURCE_NOTE,
  });
});

// GET /etf_holdings/pivot/time_heatmap/:etf
router.get("/etf_holdings/pivot/time_heatmap/:etf", (_req, res) => {
  res.json({
    ok: true,
    snapshots: [],
    stocks: [],
    message: "快照不足或無成分股資料（需 ≥ 2 筆含權重快照）",
  });
});

// GET /etf_holdings/pivot/consensus
router.get("/etf_holdings/pivot/consensus", (req, res) => {
  const days = Number(qs(req, "days")) || 5;
  res.json({
    ok: true,
    days,
    etf_count_compared: 0,
    cached: false,
    increased: [],
    added: [],
    decreased: [],
    removed: [],
    message: NO_SOURCE_NOTE,
  });
});

// GET /etf_holdings/pivot/concentration
router.get("/etf_holdings/pivot/concentration", (_req, res) => {
  res.json({ ok: true, items: [], note: NO_SOURCE_NOTE });
});

// GET /etf_holdings/pivot/turnover
router.get("/etf_holdings/pivot/turnover", (req, res) => {
  const lookback = Number(qs(req, "lookback")) || 30;
  res.json({ ok: true, lookback_days: lookback, skipped: [], items: [], note: NO_SOURCE_NOTE });
});

// ── /strategy/etf_added_resonance (signal-filter.html) ───────────────────────
router.get("/strategy/etf_added_resonance", async (req, res) => {
  const refresh = qs(req, "refresh") === "1";
  const payload = await cached("etf_added_resonance", refresh ? 0 : 600, async () => ({
    ok: true,
    hits: [] as unknown[],
    scanned_etfs: etfList.size,
    added_total: 0,
    skipped_etfs: [] as string[],
    f1_enabled: false,
    f1_filtered_count: 0,
    scan_date: nowStr().slice(0, 10),
    updated_at: nowStr(),
    cached: false,
    note: NO_SOURCE_NOTE,
  }));
  res.json({ ...payload, cached: !refresh });
});

export default router;
