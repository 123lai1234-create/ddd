// Mock API for /api/* — returns placeholder JSON so the f1 SPA (and any other
// client) doesn't hit the dead Railway backend. The ddd vercel.json has the
// /api/:path* rewrite removed so this Edge Function handles all /api/* traffic.
//
// Replace this file with a real proxy (e.g. forward to a working backend)
// once the API target is decided.

export const config = {
  runtime: 'edge',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);

  return json({
    status: 'mock',
    code: 200,
    message: 'API is mocked. Real backend not configured.',
    path: url.pathname,
    method: request.method,
    data: null,
  });
}
