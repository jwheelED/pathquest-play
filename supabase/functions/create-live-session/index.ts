import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCreate } from "./handler.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Auth resolver: validate the JWT via a user-scoped client.
    const getUser = async (authHeader: string): Promise<{ id: string } | null> => {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      return error || !user ? null : { id: user.id };
    };

    const authHeader = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));

    const { status, body: respBody } = await handleCreate({ body, authHeader }, { admin, getUser });

    return new Response(JSON.stringify(respBody), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
