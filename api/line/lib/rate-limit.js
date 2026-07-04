// In-memory rate limiter. Per-instance counter; clears on cold start.
// Trade-off: a determined attacker hitting across cold starts could bypass,
// but this protects against single-source DoS which is the realistic threat
// for a webhook URL.
//
// To swap for a global limiter (Upstash Redis, Vercel KV, etc.) just replace
// the `kv` export with one that has `incr(key, ttlSeconds)` and `get(key)`.
//
// Usage:
//   const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
//   if (!limiter.allow(key)) return res.status(429).json({ error: "rate_limited" });

export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const buckets = new Map(); // key → { count, resetAt }

  function allow(key) {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    return b.count <= max;
  }

  function remaining(key) {
    const b = buckets.get(key);
    if (!b) return max;
    return Math.max(0, max - b.count);
  }

  // Periodic GC to prevent unbounded Map growth in long-lived instances.
  // Vercel functions are short-lived anyway but cheap to be safe.
  const gc = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
  }, windowMs * 2).unref?.();

  return { allow, remaining };
}