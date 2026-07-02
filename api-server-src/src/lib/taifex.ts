import { cached } from "./cache";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockSignal/1.0)" };
const num = (s: unknown) => Number(String(s ?? "").replace(/,/g, "")) || 0;

export interface FuturesRow {
  date: string;
  longOI: number;
  shortOI: number;
  netOI: number;
}
export interface ForeignFutures {
  history: FuturesRow[];
  signal: {
    netOI: number | null;
    change: number | null;
    trend: string;
    bias: "bullish" | "bearish" | "neutral";
    is_limited: boolean;
  };
}

function rocRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(Date.now() - (days + 10) * 86400000);
  const f = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return { start: f(start), end: f(end) };
}

/**
 * TAIFEX 三大法人-區分各期貨契約: 外資 臺股期貨(TX) 未平倉口數.
 * Falls back to is_limited when the public CSV endpoint is unavailable.
 */
export async function fetchForeignFutures(days = 30): Promise<ForeignFutures> {
  return cached(`futures:${days}`, 60 * 60 * 2, async () => {
    const { start, end } = rocRange(days);
    try {
      const body = new URLSearchParams({
        firstDate: "",
        lastDate: "",
        queryStartDate: start,
        queryEndDate: end,
        commodityId: "TXF",
      });
      const res = await fetch("https://www.taifex.com.tw/cht/3/futContractsDateDown", {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const history: FuturesRow[] = [];
      for (const line of lines) {
        const cols = line.split(",").map((c) => c.replace(/"/g, "").trim());
        // rows for 外資 contain the identifier 外資 and contract 臺股期貨
        if (cols.length < 14) continue;
        if (!cols.some((c) => c.includes("外資")) || !cols.some((c) => c.includes("臺股期貨"))) continue;
        const dateRaw = cols[0];
        const m = dateRaw.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (!m) continue;
        const date = `${m[1]}-${m[2]}-${m[3]}`;
        const longOI = num(cols[cols.length - 6]);
        const shortOI = num(cols[cols.length - 4]);
        const netOI = num(cols[cols.length - 2]);
        if (longOI || shortOI || netOI) history.push({ date, longOI, shortOI, netOI });
      }
      if (history.length === 0) throw new Error("no rows");
      history.sort((a, b) => a.date.localeCompare(b.date));
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      const change = prev ? last.netOI - prev.netOI : null;
      return {
        history: history.slice(-days),
        signal: {
          netOI: last.netOI,
          change,
          trend: change == null ? "—" : change > 0 ? "增加" : "減少",
          bias: last.netOI > 0 ? "bullish" : last.netOI < 0 ? "bearish" : "neutral",
          is_limited: false,
        },
      };
    } catch {
      return {
        history: [],
        signal: { netOI: null, change: null, trend: "—", bias: "neutral", is_limited: true },
      };
    }
  });
}
