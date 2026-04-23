import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { name, email, message } = await req.json();
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: 'Missing fields' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: 3 submissions per email per hour
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supa.from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', hourAgo);
    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const { error } = await supa.from('contacts').insert({ name, email, message });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
