import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchMacroNews } from "./_lib/news";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const data = await fetchMacroNews();
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json({ cached: false, age_sec: 0, items: [], error: (e as Error).message });
  }
}
