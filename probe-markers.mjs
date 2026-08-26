// Quick probe of the live /api/markers/record endpoint
const url = "https://donttalk.vercel.app/api/markers/record";

async function test(name, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n=== ${name} ===`);
  console.log(`status: ${res.status}`);
  console.log(`body  : ${text}`);
}

// 1. Valid code + items array
await test("valid code+items", {
  code: "2330",
  items: [
    { source: "auto", text: "probe-test", time: 1723456789, close: 580, ma5: 575 }
  ],
});

// 2. Frontend-style: time as unix-seconds number
await test("frontend-shape", {
  code: "2330",
  items: [
    { time: 1723456789, source: "trade", text: "buy signal", close: 580, ma5: 575, ma10: 570, ma20: 565, ma60: 560, position: "above", shape: "triangle", color: "red" },
    { time: 1723457000, source: "event", text: "earnings", close: 582, ma5: 577 },
  ],
});

// 3. Empty items array
await test("empty items", { code: "2330", items: [] });

// 4. Missing code
await test("missing code", { items: [{ text: "x" }] });

// 5. Missing both password and items
await test("nothing", { code: "2330" });

// 6. Frontend-style payload (no code at top-level, items have different shape)
await test("code-in-item", {
  code: "2330",
  items: [
    { code: "2330", time: 1723456789, source: "auto", text: "no code fail" },
  ],
});
