// api/healthz.mjs — env diag (longer op prefix)
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const op = process.env.STOCK_OPERATOR_PASSWORD ?? "";
  res.status(200).json({
    status: "ok",
    op_len: op.length,
    op_first_8: op.slice(0, 8),
    op_last_4: op.slice(-4),
  });
}
export const config = { maxDuration: 10 };
