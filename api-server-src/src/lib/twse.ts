import { cached } from "./cache";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockSignal/1.0)" };
const num = (s: unknown) => Number(String(s ?? "").replace(/,/g, "")) || 0;

function ymd(d: Date): string {
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

function recentBusinessDays(n: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < n + 4) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export interface InstRow {
  date: string;
  buy: number;
  sell: number;
  net: number;
}
export interface Institutional {
  foreign: InstRow[];
  trust: InstRow[];
  dealer: InstRow[];
  summary: { foreign_3d: number; trust_3d: number; dealer_3d: number };
  is_etf: boolean;
  _cache_status?: string;
}

/** TWSE T86: 三大法人買賣超 per listed stock (last `days` trading days). */
export async function fetchInstitutional(code: string, days = 5): Promise<Institutional> {
  return cached(`inst:${code}:${days}`, 60 * 60 * 2, async () => {
    const foreign: InstRow[] = [];
    const trust: InstRow[] = [];
    const dealer: InstRow[] = [];
    const dates = recentBusinessDays(days);
    for (const d of dates) {
      if (foreign.length >= days) break;
      const date = ymd(d);
      try {
        const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${date}&selectType=ALLBUT0999&response=json`;
        const res = await fetch(url, { headers: UA });
        const j = (await res.json()) as { stat?: string; data?: string[][] };
        if (j.stat !== "OK" || !Array.isArray(j.data)) continue;
        const row = j.data.find((r) => r[0]?.trim() === code);
        const ds = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
        if (!row) continue;
        foreign.push({ date: ds, buy: Math.round(num(row[2]) / 1000), sell: Math.round(num(row[3]) / 1000), net: Math.round(num(row[4]) / 1000) });
        trust.push({ date: ds, buy: Math.round(num(row[8]) / 1000), sell: Math.round(num(row[9]) / 1000), net: Math.round(num(row[10]) / 1000) });
        dealer.push({
          date: ds,
          buy: Math.round((num(row[12]) + num(row[15])) / 1000),
          sell: Math.round((num(row[13]) + num(row[16])) / 1000),
          net: Math.round(num(row[11]) / 1000),
        });
      } catch {
        /* skip day */
      }
    }
    const sum3 = (arr: InstRow[]) => arr.slice(0, 3).reduce((a, b) => a + b.net, 0);
    return {
      foreign,
      trust,
      dealer,
      summary: { foreign_3d: sum3(foreign), trust_3d: sum3(trust), dealer_3d: sum3(dealer) },
      is_etf: code.startsWith("00"),
    };
  });
}

export interface IndexInst {
  foreign: { date: string; net: number }[];
  trust: { date: string; net: number }[];
  summary: { foreign_5d: number; trust_5d: number };
}

/** TWSE BFI82U: market-wide 三大法人 net (億元), last `days` days. */
export async function fetchIndexInstitutional(days = 5): Promise<IndexInst> {
  return cached(`idxinst:${days}`, 60 * 60 * 2, async () => {
    const foreign: { date: string; net: number }[] = [];
    const trust: { date: string; net: number }[] = [];
    const dates = recentBusinessDays(days);
    for (const d of dates) {
      if (foreign.length >= days) break;
      const date = ymd(d);
      try {
        const url = `https://www.twse.com.tw/rwd/zh/fund/BFI82U?dayDate=${date}&type=day&response=json`;
        const res = await fetch(url, { headers: UA });
        const j = (await res.json()) as { stat?: string; data?: string[][] };
        if (j.stat !== "OK" || !Array.isArray(j.data)) continue;
        const ds = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
        let f = 0;
        let t = 0;
        for (const row of j.data) {
          const label = row[0] ?? "";
          const diff = num(row[3]) / 1e8;
          if (label.includes("外資") || label.includes("陸資")) f += diff;
          if (label.includes("投信")) t += diff;
        }
        foreign.push({ date: ds, net: Math.round(f * 100) / 100 });
        trust.push({ date: ds, net: Math.round(t * 100) / 100 });
      } catch {
        /* skip */
      }
    }
    const s = (arr: { net: number }[]) => Math.round(arr.reduce((a, b) => a + b.net, 0) * 100) / 100;
    return { foreign, trust, summary: { foreign_5d: s(foreign), trust_5d: s(trust) } };
  });
}
