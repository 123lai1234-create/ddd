import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getWatchlist } from "./_lib/stocks";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const list = await getWatchlist();
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");
    res.status(200).json(list.map((s) => ({ code: s.code, name: s.name, ticker: s.ticker })));
  } catch (e) {
    res.status(200).json([]);
  }
}
