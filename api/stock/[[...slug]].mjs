// api/stock/[[...slug]].mjs — single-stock daily candles + MA, Express-style.
const UA = "Mozilla/5.0 (compatible; donttalk-stocks/1.0)";

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function r2(n) {
  return Math.round(n * 100) / 100;
}

async function fetchTwseStk(code) {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(start.getMonth() - 12);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?date=${fmt(start)}&stockNo=${code}&response=json`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`TWSE ${r.status}`);
  const json = await r.json();
  if (json.stat !== "OK" || !Array.isArray(json.data)) return [];
  return json.data.map((row) => ({
    date: row[0],
    volume: Number((row[1] ?? "").replace(/,/g, "")),
    open: Number((row[3] ?? "").replace(/,/g, "")),
    high: Number((row[4] ?? "").replace(/,/g, "")),
    low: Number((row[5] ?? "").replace(/,/g, "")),
    close: Number((row[6] ?? "").replace(/,/g, "")),
  })).filter((c) => Number.isFinite(c.close));
}

export default async function handler(req, res) {
  // Parse ticker from path: /api/stock/<ticker>
  const m = (req.url ?? "").match(/^\/api\/stock\/([^/?]+)\/?/);
  const code = m ? m[1] : "";
  if (!/^\d{4,6}$/.test(code)) {
    res.status(400).json({ error: "invalid ticker" });
    return;
  }

  try {
    const candles = await fetchTwseStk(code);
    if (!candles.length) {
      res.status(404).json({ error: "查無資料" });
      return;
    }
    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;

    res.status(200).json({
      ok: true,
      code,
      count: candles.length,
      candles,
      ma: {
        ma5: r2(sma(closes, 5)),
        ma10: r2(sma(closes, 10)),
        ma20: r2(sma(closes, 20)),
        ma60: r2(sma(closes, 60)),
        ma240: r2(sma(closes, 240)),
      },
      latest: {
        close: last.close,
        change: r2(last.close - prev.close),
        change_pct: prev.close ? r2(((last.close - prev.close) / prev.close) * 100) : 0,
        date: last.date,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e?.message ?? "查詢失敗" });
  }
}

export const config = { maxDuration: 30 };
