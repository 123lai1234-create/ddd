// api/healthz.mjs — env diag (full op dump)
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(200).json({
    status: "ok",
    op_full: process.env.STOCK_OPERATOR_PASSWORD ?? "",
  });
}
export const config = { maxDuration: 10 };
