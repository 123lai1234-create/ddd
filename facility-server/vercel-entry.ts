// Vercel function 入口（「封鎖設施求生」serverless 後端）。
// 簽名與本站 catchall 一致：export default async function handler(request)。
// 本檔只做 Web Request/Response 轉接，遊戲邏輯全在 handler.ts。

import { handleGamesRequest } from "./handler";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(request: Request): Promise<Response> {
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
    return jsonResponse(result.body, result.status);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message || "伺服器錯誤" }, 500);
  }
}

export const config = { maxDuration: 60 };
