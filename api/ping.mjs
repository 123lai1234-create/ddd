// api/ping.mjs — super simple (Express-style, matches healthz)
export default function (req, res) {
  res.status(200).json({ ok: true, node: process.version, t: Date.now(), runtime: "ping-express" });
}
export const config = { maxDuration: 10 };
