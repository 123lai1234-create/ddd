import type { VercelRequest, VercelResponse } from "@vercel/node";

// Intraday scan is disabled in this Vercel-hosted clone. The original
// Express server had a process-local toggle (`intradayEnabled`) that is
// meaningless on a stateless Function. Frontend reads the disabled shape.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ enabled: false, running: false });
}
