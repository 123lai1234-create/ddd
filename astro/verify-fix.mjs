// Verify watchlist fixes
const url = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
async function q(sql, params = []) {
  const r = await fetch("https://" + new URL(url).hostname + "/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "x", "Neon-Connection-String": url },
    body: JSON.stringify({ query: sql, params }),
  });
  return r.json();
}
const r1 = await q("SELECT code, name, ticker FROM watchlist WHERE code = ANY($1::text[]) ORDER BY code", [["2887", "2883", "2006", "1590", "6531", "2327", "00679B", "00881", "00891", "00675L", "006205", "00888", "00937B", "00687B"]]);
console.log("watchlist after fix:");
for (const r of r1.rows) console.log(" ", r.code || r[0], "|", r.name || r[1], "|", r.ticker || r[2]);
const r2 = await q("SELECT code, name, ticker FROM etf_watchlist ORDER BY code");
console.log("\netf_watchlist all:");
for (const r of r2.rows) console.log(" ", r.code || r[0], "|", r.name || r[1], "|", r.ticker || r[2]);
