// api/healthz.mjs — env diag
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const db = process.env.DATABASE_URL ?? "";
  const op = process.env.STOCK_OPERATOR_PASSWORD ?? "";
  res.status(200).json({
    status: "ok",
    db_len: db.length,
    db_prefix: db.slice(0, 25),
    op_len: op.length,
    op_prefix: op.slice(0, 6),
  });
}
export const config = { maxDuration: 10 };
