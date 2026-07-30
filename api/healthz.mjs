// api/healthz.mjs — health check (Vercel Node function, Express-style).
export default function handler(req, res) {
  res.status(200).json({ status: "ok" });
}
export const config = { maxDuration: 10 };
