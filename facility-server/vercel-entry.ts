// Vercel function 入口（「封鎖設施求生」serverless 後端）。
// 2026-11-02 fix：先前版本 export Web handler (request) => Response，
// Vercel Node runtime 不認這個簽名（Logs 出現 WARN: default export
// returned a 'Response'），回傳值被忽略、請求永遠不結束，直到
// Task timed out after 300 seconds。Node runtime 要求 (req, res) => void，
// 故本檔改為 Node 寫法：讀 Node req、呼叫 handleGamesRequest、把結果
// 寫回 Node res。遊戲邏輯全在 handler.ts，本檔只做轉接。
// 若呼叫端仍是 Web Request（本機測試），維持舊行為回傳 Response。

import { handleGamesRequest } from "./handler";

type NodeReq = {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer>;
};

type NodeRes = {
  statusCode?: number;
  headersSent?: boolean;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

async function readNodeBody(req: NodeReq): Promise<string> {
  const chunks: Buffer[] = [];
  const it = req[Symbol.asyncIterator];
  if (!it) return "";
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(req: unknown, res?: unknown) {
  const nodeRes = res as NodeRes | undefined;
  const isNodeRes =
    nodeRes && typeof nodeRes.setHeader === "function" && typeof nodeRes.end === "function";
  if (!isNodeRes) {
    // Web 呼叫端（本機測試）：維持舊行為。
    const request = req as Request;
    try {
      const url = new URL(request.url);
      let bodyText = "";
      if (request.method === "POST") {
        bodyText = await request.text().catch(() => "");
      }
      const result = await handleGamesRequest(
        request.method,
        url.pathname,
        url.searchParams,
        bodyText,
      );
      // 轉址（Google OAuth）：回 302 + Location，不包 JSON。
      if (result.headers?.Location) {
        return new Response(null, { status: result.status, headers: { Location: result.headers.Location } });
      }
      return jsonResponse(result.body, result.status);
    } catch (e) {
      return jsonResponse({ error: (e as Error).message || "伺服器錯誤" }, 500);
    }
  }
  // Node 呼叫端（Vercel @vercel/node）：必須寫 res，不能回傳 Response。
  const nodeReq = req as NodeReq;
  try {
    const url = new URL(nodeReq.url || "/", "https://localhost");
    let bodyText = "";
    if (nodeReq.method === "POST") {
      bodyText = await readNodeBody(nodeReq);
    }
    const result = await handleGamesRequest(
      nodeReq.method || "GET",
      url.pathname,
      url.searchParams,
      bodyText,
    );
    nodeRes.statusCode = result.status;
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) nodeRes.setHeader(k, v);
    }
    if (result.headers?.Location) {
      nodeRes.end("");
      return;
    }
    nodeRes.setHeader("Content-Type", "application/json");
    nodeRes.end(JSON.stringify(result.body));
  } catch (e) {
    try {
      if (!nodeRes.headersSent) nodeRes.statusCode = 500;
      nodeRes.setHeader("Content-Type", "application/json");
      nodeRes.end(JSON.stringify({ error: (e as Error).message || "伺服器錯誤" }));
    } catch {}
  }
}

export const config = { maxDuration: 60 };
