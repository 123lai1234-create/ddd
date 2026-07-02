import { XMLParser } from "fast-xml-parser";
import { cached } from "./cache";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockSignal/1.0)" };
const parser = new XMLParser({ ignoreAttributes: false });

export interface NewsItem {
  title: string;
  link: string;
  pub_date: string;
  pub_ts: number;
  source?: string;
}

async function fetchRss(query: string, limit = 12): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const res = await fetch(url, { headers: UA });
  const xml = await res.text();
  const obj = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
  };
  let items = obj.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  const out: NewsItem[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const title = String(it.title ?? "");
    const link = String(it.link ?? "");
    const pub = String(it.pubDate ?? "");
    const ts = pub ? new Date(pub).getTime() : Date.now();
    out.push({
      title,
      link,
      pub_date: pub,
      pub_ts: Number.isFinite(ts) ? ts : Date.now(),
      source: (it.source as { "#text"?: string })?.["#text"],
    });
  }
  return out.slice(0, limit);
}

const BULLISH = ["大漲", "漲停", "創新高", "看好", "利多", "成長", "獲利", "受惠", "報喜", "增", "強勁", "突破", "買超", "目標價調升", "升評", "樂觀", "回升", "需求暢旺", "訂單"];
const BEARISH = ["大跌", "跌停", "創新低", "看壞", "利空", "衰退", "虧損", "重挫", "下修", "減", "疲弱", "跌破", "賣超", "目標價調降", "降評", "悲觀", "示警", "庫存", "示弱", "裁員"];

function scoreText(text: string): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  for (const w of BULLISH) if (text.includes(w)) { score += 1; matched.push(`+${w}`); }
  for (const w of BEARISH) if (text.includes(w)) { score -= 1; matched.push(`-${w}`); }
  return { score, matched };
}

function sentimentLabel(score: number): { sentiment: string; color: string } {
  if (score >= 3) return { sentiment: "偏多", color: "#ff1744" };
  if (score <= -3) return { sentiment: "偏空", color: "#00c853" };
  if (score > 0) return { sentiment: "略偏多", color: "#ff8a80" };
  if (score < 0) return { sentiment: "略偏空", color: "#69f0ae" };
  return { sentiment: "中性", color: "#9e9e9e" };
}

export interface StockNews {
  code: string;
  name: string;
  events: { event: string; direction: string; icon: string; strength: number }[];
  news: NewsItem[];
  sentiment: { score: number; sentiment: string; color: string; matched: string[]; totalNews: number };
  combined: null;
}

const EVENT_RULES: { kw: string[]; event: string; direction: string; icon: string; strength: number }[] = [
  { kw: ["法說", "法人說明會"], event: "法說會", direction: "neutral", icon: "🔵", strength: 2 },
  { kw: ["除息", "除權"], event: "除權息", direction: "neutral", icon: "🟡", strength: 2 },
  { kw: ["營收", "月營收"], event: "營收公布", direction: "bullish", icon: "🟢", strength: 2 },
  { kw: ["財報", "獲利", "EPS"], event: "財報", direction: "bullish", icon: "🟢", strength: 2 },
  { kw: ["減資", "增資"], event: "資本變動", direction: "bearish", icon: "🔴", strength: 2 },
  { kw: ["庫藏股"], event: "庫藏股", direction: "bullish", icon: "🟢", strength: 3 },
  { kw: ["訂單", "需求"], event: "訂單需求", direction: "bullish", icon: "🟢", strength: 3 },
];

export async function fetchStockNews(code: string, name: string): Promise<StockNews> {
  return cached(`news:${code}`, 60 * 20, async () => {
    const items = await fetchRss(`${name} ${code} 股票`, 12);
    let total = 0;
    const allMatched: string[] = [];
    for (const it of items) {
      const { score, matched } = scoreText(it.title);
      total += score;
      allMatched.push(...matched);
    }
    const events: StockNews["events"] = [];
    const joined = items.map((i) => i.title).join(" ");
    for (const rule of EVENT_RULES) {
      if (rule.kw.some((k) => joined.includes(k))) {
        events.push({ event: `${name}${rule.event}`, direction: rule.direction, icon: rule.icon, strength: rule.strength });
      }
    }
    const { sentiment, color } = sentimentLabel(total);
    return {
      code,
      name,
      events: events.slice(0, 5),
      news: items.slice(0, 10),
      sentiment: { score: total, sentiment, color, matched: [...new Set(allMatched)].slice(0, 12), totalNews: items.length },
      combined: null,
    };
  });
}

export async function fetchMarketNews(): Promise<{
  events: { event: string; direction: string; icon: string; strength: number }[];
  news: NewsItem[];
  sentiment: { score: number; sentiment: string; color: string; matched: string[]; totalNews: number };
}> {
  return cached("news:market", 60 * 15, async () => {
    const items = await fetchRss("台股 加權指數 盤勢", 14);
    let total = 0;
    const allMatched: string[] = [];
    for (const it of items) {
      const { score, matched } = scoreText(it.title);
      total += score;
      allMatched.push(...matched);
    }
    const { sentiment, color } = sentimentLabel(total);
    const joined = items.map((i) => i.title).join(" ");
    const events: { event: string; direction: string; icon: string; strength: number }[] = [];
    if (joined.includes("外資")) events.push({ event: "外資動向", direction: "neutral", icon: "🔵", strength: 2 });
    if (joined.includes("升息") || joined.includes("降息") || joined.includes("Fed") || joined.includes("聯準會"))
      events.push({ event: "央行政策", direction: "neutral", icon: "🟡", strength: 3 });
    if (joined.includes("關稅") || joined.includes("貿易")) events.push({ event: "貿易情勢", direction: "bearish", icon: "🔴", strength: 3 });
    return {
      events,
      news: items.slice(0, 12),
      sentiment: { score: total, sentiment, color, matched: [...new Set(allMatched)].slice(0, 12), totalNews: items.length },
    };
  });
}

const MACRO_TOPICS: { topic: string; query: string; weight: number }[] = [
  { topic: "美股", query: "美股 道瓊 那斯達克", weight: 2 },
  { topic: "費半", query: "費城半導體 SOX 晶片股", weight: 3 },
  { topic: "Fed", query: "聯準會 Fed 利率 通膨", weight: 3 },
  { topic: "匯率", query: "新台幣 美元 匯率", weight: 1 },
  { topic: "原油", query: "原油 油價 OPEC", weight: 1 },
  { topic: "貴金屬", query: "黃金 金價", weight: 1 },
  { topic: "地緣", query: "地緣政治 戰爭 關稅", weight: 3 },
];

export interface MacroItem {
  title: string;
  link: string;
  pub_date: string;
  pub_ts: number;
  score: number;
  severe: boolean;
  topic: string;
}

export async function fetchMacroNews(): Promise<{ cached: boolean; age_sec: number; items: MacroItem[] }> {
  const items = await cached("news:macro", 60 * 15, async () => {
    const all: MacroItem[] = [];
    for (const t of MACRO_TOPICS) {
      try {
        const news = await fetchRss(t.query, 5);
        for (const it of news) {
          const { score } = scoreText(it.title);
          const sev = Math.abs(score) * t.weight;
          all.push({
            title: it.title,
            link: it.link,
            pub_date: it.pub_date,
            pub_ts: it.pub_ts,
            score: sev,
            severe: sev >= 4,
            topic: t.topic,
          });
        }
      } catch {
        /* skip topic */
      }
    }
    all.sort((a, b) => b.pub_ts - a.pub_ts);
    return all.slice(0, 30);
  });
  return { cached: true, age_sec: 0, items };
}
