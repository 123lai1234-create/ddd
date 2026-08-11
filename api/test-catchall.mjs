export default async function handler(request) {
  const url = new URL(request.url);
  return new Response(JSON.stringify({
    test: "minimal-catchall",
    path: url.pathname,
    method: request.method
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
