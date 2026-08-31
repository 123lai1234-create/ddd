const u = "postgresql://neondb_owner:npg_ulB9zySiAr8J@ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const r = await fetch("https://ep-aged-waterfall-amnn2xye-pooler.c-5.us-east-1.aws.neon.tech/sql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; donttalk-stocks/1.0)",
    "Neon-Connection-String": u
  },
  body: JSON.stringify({
    query: "SELECT type, text, COUNT(*)::int AS n FROM markers GROUP BY type, text ORDER BY n DESC LIMIT 20",
    params: []
  })
});
const j = await r.json();
const rows = (j.rows || []).map(r => ({
  type: r.type,
  text: r.text ? r.text.slice(0, 100) : null,
  n: r.n
}));
console.log(JSON.stringify(rows, null, 2));
