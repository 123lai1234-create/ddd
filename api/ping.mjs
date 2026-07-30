// api/ping.mjs — super simple, zero imports, instant response.
export default function () {
  return new Response(JSON.stringify({
    ok: true, node: process.version, t: Date.now(), runtime: "ping-min",
  }), { headers: { "Content-Type": "application/json" } });
}
export const config = { maxDuration: 15 };
