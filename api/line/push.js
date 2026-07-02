// Manual test-push endpoint. Used to verify the LINE channel token works
// against a real userId without needing the full api-server.
//
//   GET  /api/line/push?to=Uxxxxxxxxxxxxxxxxxxx              → text test
//   GET  /api/line/push?to=Uxxx&kind=flex                    → flex bubble test
//   POST /api/line/push  { to, messages: [...raw messages...] }  → arbitrary
//
// Operator-protected: requires ?password=... or X-Operator-Password header
// matching process.env.STOCK_OPERATOR_PASSWORD.

function operatorOk(req) {
  const expected = process.env.STOCK_OPERATOR_PASSWORD;
  if (!expected) return false;
  const url = new URL(req.url, `https://${req.headers.host ?? "localhost"}`);
  const supplied =
    url.searchParams.get("password") ??
    req.headers["x-operator-password"] ??
    "";
  return supplied === expected;
}

async function push(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  // Node 18+ has global fetch; Vercel Node runtime is Node 20.
  const r = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`LINE push ${r.status}: ${text}`);
  }
  return { status: r.status };
}

const sampleFlex = () => ({
  type: "bubble",
  size: "mega",
  header: {
    type: "box", layout: "vertical", backgroundColor: "#0d1117",
    contents: [
      { type: "text", text: "📊 dontalk-stock 測試推播", weight: "bold", size: "lg", color: "#ffffff" },
      { type: "text", text: new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC", size: "xs", color: "#8b949e" },
    ],
  },
  body: {
    type: "box", layout: "vertical", spacing: "sm",
    contents: [
      { type: "text", text: "✅ LINE push 通道正常", weight: "bold", size: "md", color: "#3fb950" },
      { type: "text", text: "• Flex Message 渲染 OK", size: "sm", color: "#e6edf3" },
      { type: "text", text: "• Carousel / button 可用", size: "sm", color: "#e6edf3" },
      { type: "separator", margin: "md" },
      { type: "text", text: "下一步：等 api-server 上線後，這裡會改成 scan_and_push_line 排程。", size: "xs", color: "#8b949e", wrap: true },
    ],
  },
  footer: {
    type: "box", layout: "vertical",
    contents: [{
      type: "button", style: "primary", color: "#1f6feb",
      action: { type: "uri", label: "開啟看盤", uri: "https://donttalk.vercel.app/stock/" },
    }],
  },
});

export default async function handler(req, res) {
  if (!operatorOk(req)) {
    return res.status(403).json({
      ok: false,
      error: "需要 STOCK_OPERATOR_PASSWORD（query ?password=... 或 header X-Operator-Password）",
    });
  }

  const url = new URL(req.url, `https://${req.headers.host ?? "localhost"}`);
  const to = url.searchParams.get("to");
  const kind = url.searchParams.get("kind") ?? "text";

  if (req.method === "GET") {
    if (!to) return res.status(400).json({ ok: false, error: "missing ?to=Uxxxx" });
    try {
      const messages = kind === "flex"
        ? [{ type: "flex", altText: "dontalk-stock 測試", contents: sampleFlex() }]
        : [{ type: "text", text: `🔔 dontalk-stock push 測試 (${new Date().toISOString()})` }];
      const out = await push(to, messages);
      return res.status(200).json({ ok: true, to, kind, line: out });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
    } catch {
      return res.status(400).json({ ok: false, error: "invalid JSON" });
    }
    if (!body.to || !Array.isArray(body.messages)) {
      return res.status(400).json({ ok: false, error: "need { to, messages: [...] }" });
    }
    try {
      const out = await push(body.to, body.messages);
      return res.status(200).json({ ok: true, line: out });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ ok: false, error: "GET or POST only" });
}