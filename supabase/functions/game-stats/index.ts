import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  );

  const [lbRes, achRes] = await Promise.all([
    supa.from('leaderboard').select('name,level,gold', { count: 'exact' }).order('level', { ascending: false }).limit(10),
    supa.from('achievements').select('achievement_id', { count: 'exact', head: true }),
  ]);

  return new Response(JSON.stringify({
    top_players:      lbRes.data ?? [],
    total_leaders:    lbRes.count ?? 0,
    total_ach_unlock: achRes.count ?? 0,
  }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
});
