// FinMind backfill: pull TaiwanStockInfo for watchlist (130 stocks) and store issued_shares
// into market_instruments.metadata_text under key "shares_outstanding".
//
// Run: node finmind-issued.mjs
// Or POST to /api/admin/load/finmind_info?codes=2330,...

const codes = process.argv[2]
  ? process.argv[2].split(",")
  : null; // null → server uses watchlist

const url = codes
  ? `https://donttalk.vercel.app/api/admin/load/finmind_info?codes=${encodeURIComponent(codes.join(","))}`
  : `https://donttalk.vercel.app/api/admin/load/finmind_info`;

console.log("URL:", url);
fetch(url, { method: "POST" })
  .then(r => r.json())
  .then(j => {
    console.log("Result:", JSON.stringify(j, null, 2));
  })
  .catch(e => console.error("ERR:", e));
