// api/healthz.mjs — simple ping
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({ status: "ok" });
}
export const config = { maxDuration: 10 };
