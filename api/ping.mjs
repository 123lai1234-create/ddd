// api/ping.mjs — Express-style health/diag.
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    ok: true,
    node: process.version,
    t: Date.now(),
    style: "express",
    commit: "ping-v2-6ba2f41",
  });
}
export const config = { maxDuration: 10 };
