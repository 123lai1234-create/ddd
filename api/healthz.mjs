// api/healthz.mjs — full op dump
export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  const op = process.env.STOCK_OPERATOR_PASSWORD ?? "";
  res.status(200).json({
    status: "ok",
    op_len: op.length,
    op: op,  // 完整 dump（部署完就改掉）
  });
}
export const config = { maxDuration: 10 };
