import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://wbamdjgcoezevimohlcb.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiYW1kamdjb2V6ZXZpbW9obGNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Mzk1NDQsImV4cCI6MjA5MTExNTU0NH0.0YZUVDiCFYVDMDo20aG4sSBcON8SXoET6vEiX5NCEbs";

const SUPA_HEADERS: Record<string, string> = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

// In-memory IP-based rate limit: max 5 submissions per 15 minutes per IP.
// req.ip is trusted because app.ts sets "trust proxy", so Express resolves the
// correct client IP from the infrastructure-set X-Forwarded-For header rather
// than accepting an arbitrary attacker-supplied value.
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_REQUESTS = 5;
const ipTimestamps = new Map<string, number[]>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (ipTimestamps.get(ip) ?? []).filter(
    (t) => now - t < IP_WINDOW_MS
  );
  if (recent.length >= IP_MAX_REQUESTS) return false;
  recent.push(now);
  ipTimestamps.set(ip, recent);
  return true;
}

function isValidString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

// GET /contact/stats — returns aggregate stats for the about page display.
// Keeps Supabase credentials server-side; the browser never needs them.
router.get("/contact/stats", async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_contact_stats`, {
      method: "POST",
      headers: SUPA_HEADERS,
      body: "{}",
    });
    if (!r.ok) {
      res.status(502).json({ error: "stats unavailable" });
      return;
    }
    const data = await r.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: "stats unavailable" });
  }
});

// POST /contact — validates, rate-limits, and proxies the form submission
// to Supabase server-side so the enforcement cannot be bypassed by the browser.
router.post("/contact", async (req: Request, res: Response) => {
  // req.ip is set by Express using the trusted proxy chain configured in app.ts.
  const ip = req.ip ?? "unknown";

  if (!checkIpRateLimit(ip)) {
    res.status(429).json({ error: "請求過於頻繁，請稍後再試。" });
    return;
  }

  const body = req.body as Record<string, unknown>;

  if (!isValidString(body.name, 120)) {
    res.status(400).json({ error: "姓名為必填且長度不得超過 120 字元。" });
    return;
  }
  if (!isValidEmail(body.email)) {
    res.status(400).json({ error: "請填寫有效的 Email 地址。" });
    return;
  }
  if (!isValidString(body.message, 4000)) {
    res.status(400).json({ error: "訊息為必填且長度不得超過 4000 字元。" });
    return;
  }
  if (
    body.organization !== undefined &&
    body.organization !== null &&
    typeof body.organization !== "string"
  ) {
    res.status(400).json({ error: "公司欄位格式錯誤。" });
    return;
  }

  const payload = {
    name: String(body.name).trim(),
    email: String(body.email).trim(),
    organization:
      typeof body.organization === "string" && body.organization.trim()
        ? body.organization.trim().slice(0, 160)
        : null,
    message: String(body.message).trim(),
    source_page:
      typeof body.source_page === "string"
        ? body.source_page.trim().slice(0, 100)
        : "about_me",
  };

  // Enforce per-email rate limit server-side — this check cannot be skipped
  // because the browser no longer has the credentials to call Supabase directly.
  let rlRes: globalThis.Response;
  try {
    rlRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_contact_rate_limit`,
      {
        method: "POST",
        headers: SUPA_HEADERS,
        body: JSON.stringify({ p_email: payload.email }),
      }
    );
  } catch {
    res.status(502).json({ error: "無法驗證請求，請稍後再試。" });
    return;
  }

  if (!rlRes.ok) {
    res.status(502).json({ error: "無法驗證請求，請稍後再試。" });
    return;
  }

  const allowed = await rlRes.json().catch(() => false);
  if (!allowed) {
    res
      .status(429)
      .json({ error: "同一 Email 每天最多送出 3 次，請明天再試。" });
    return;
  }

  let insertRes: globalThis.Response;
  try {
    insertRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_inquiries`, {
      method: "POST",
      headers: { ...SUPA_HEADERS, Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
  } catch {
    res.status(502).json({ error: "送出失敗，請稍後再試。" });
    return;
  }

  const data = await insertRes.json().catch(() => ({}));
  if (!insertRes.ok) {
    res.status(502).json({
      error:
        (data as { message?: string }).message ?? "送出失敗，請稍後再試。",
    });
    return;
  }

  const id = Array.isArray(data)
    ? (data[0] as { id?: unknown })?.id
    : (data as { id?: unknown })?.id;
  res.json({ id });
});

export default router;
