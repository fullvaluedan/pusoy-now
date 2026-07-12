// Deno entry point for the TikTok login bridge. Deploy with:
//
//   supabase functions deploy tiktok-auth
//   supabase secrets set TIKTOK_CLIENT_KEY=... TIKTOK_CLIENT_SECRET=... \
//                        TIKTOK_REDIRECT_URI=pusoynow://auth-callback
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
//
// This file is the only Deno-specific one in the function, and it holds no
// logic: everything testable lives in handler.ts, which runs in plain node (see
// handlerTest.ts). That is why the app's tsconfig excludes this file, and why
// `npm test` can cover the bridge without a Deno toolchain.
//
// SECURITY. TIKTOK_CLIENT_SECRET and SUPABASE_SERVICE_ROLE_KEY are read here
// and nowhere else. They never reach the client bundle, and the handler is
// tested to keep them out of every response body.

// @ts-nocheck -- Deno runtime, typechecked by `deno check`, not by the app's tsc.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleTikTokAuth, type AdminApiLike, type HandlerRequest } from './handler.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY');
  const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET');
  const redirectUri = Deno.env.get('TIKTOK_REDIRECT_URI');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!clientKey || !clientSecret || !redirectUri || !supabaseUrl || !serviceRoleKey) {
    // Never name which one is missing: that tells a caller what we hold.
    console.error('tiktok-auth is missing required environment variables');
    return json(500, { error: 'TikTok sign-in is not configured.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await handleTikTokAuth(req as unknown as HandlerRequest, {
    fetchFn: fetch,
    admin: supabase.auth.admin as unknown as AdminApiLike,
    clientKey,
    clientSecret,
    redirectUri,
  });

  return json(result.status, result.body);
});
