// LINE bot health/diagnostic endpoint.
// Reports whether the required env vars are present (boolean + length only,
// NEVER echoes the secret itself). Also pings api.line.me to confirm
// outbound TLS works from this region.
//
// GET /api/line/health
//   -> { ok, region, env: { secretSet, tokenSet, secretLen, tokenLen },
//        apiLineReachable, apiLineStatus, checkedAt }

const LINE_API = "https://api.line.me";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  const secret = process.env.LINE_CHANNEL_SECRET;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const region = process.env.VERCEL_REGION ?? null;

  let apiLineReachable = false;
  let apiLineStatus = null;
  let apiLineErr = null;
  try {
    // Use a HEAD-like probe: GET /v2/bot/info requires the access token, so
    // we instead just check the bare host with a short timeout. A TLS/region
    // problem surfaces here before we ever try the real reply API.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${LINE_API}/v2/bot/info/`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timer);
    apiLineReachable = true;
    apiLineStatus = r.status;
  } catch (err) {
    apiLineErr = String(err?.cause ?? err?.message ?? err);
  }

  return res.status(200).json({
    ok: true,
    region,
    env: {
      secretSet: Boolean(secret),
      tokenSet: Boolean(token),
      secretLen: secret?.length ?? 0,
      tokenLen: token?.length ?? 0,
    },
    apiLine: {
      reachable: apiLineReachable,
      status: apiLineStatus,
      err: apiLineErr,
    },
    checkedAt: new Date().toISOString(),
  });
}