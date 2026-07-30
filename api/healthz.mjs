// api/healthz.mjs — health + env dump (debug)
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const db = process.env.DATABASE_URL ?? "";
  const op = process.env.STOCK_OPERATOR_PASSWORD ?? "";
  res.status(200).json({
    ok: true,
    node: process.version,
    db_len: db.length,
    db_prefix: db.slice(0, 25),
    op_len: op.length,
    t: Date.now(),
  });
}
export const config = { maxDuration: 10 };
