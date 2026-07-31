// api/stock/index.mjs — single-stock daily candles + MA (edge runtime, Web Fetch API)
// Reads from Neon `market_price_bars` (JT already populated 36845 rows).
// Reads ticker from query string `?code=2330`.
import { q } from "../_db.mjs";

function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((s, v) => s + v, 0) / period;
}
const r2 = (n) => Math.round(n * 100) / 100;

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function toTwseStyleDate(s) {
  // "2024-06-03" -> "113/06/03" (民國)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const y = parseInt(m[1], 10) - 1911;
  return `${y}/${m[2]}/${m[3]}`;
}

export default async function (request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!/^\d{4,6}$/.test(code)) {
    return json({ error: "missing or invalid code query param" }, { status: 400 });
  }
  try {
    // Pull latest 200 daily bars from DB, ascending by date
    const { rows } = await q(
      `SELECT trade_date, open_price, high_price, low_price, close_price, volume, change_value
       FROM market_price_bars
       WHERE symbol = $1 AND asset_type = 'stock' AND market = 'TWSE'
         AND trade_date IS NOT NULL
       ORDER BY trade_date DESC
       LIMIT 200`,
      [code]
    );
    if (!rows.length) {
      return json({ error: "查無資料", code, count: 0 }, { status: 404 });
    }
    // rows are objects (Neon HTTP returns key->value objects)
    const asc = rows.slice().reverse();
    const candles = asc.map((r) => ({
      date: toTwseStyleDate(String(r.trade_date).slice(0, 10)),
      volume: Number(r.volume) || 0,
      open: Number(r.open_price),
      high: Number(r.high_price),
      low: Number(r.low_price),
      close: Number(r.close_price),
    })).filter((c) => Number.isFinite(c.close));

    const closes = candles.map((c) => c.close);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2] ?? last;
    return json({
      ok: true, source: "db", code,
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
    return json({ error: e?.message ?? "查詢失敗" }, { status: 500 });
  }
}

export const config = { runtime: "edge", maxDuration: 25 };
