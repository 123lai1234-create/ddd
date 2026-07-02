import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}

/**
 * Fixed-window per-IP rate limiter. In-memory; resets on restart.
 * Used to throttle public write / expensive (email fan-out) endpoints
 * per the project threat model's DoS / abuse requirements.
 */
export function rateLimit(opts: { windowMs: number; max: number; key: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const k = `${opts.key}:${ip}`;
    let b = buckets.get(k);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > opts.max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ ok: false, error: "請求過於頻繁，請稍後再試", retry_after: retryAfter });
      return;
    }
    next();
  };
}
