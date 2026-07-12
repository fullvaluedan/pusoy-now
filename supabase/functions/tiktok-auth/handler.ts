// The TikTok login bridge, minus the runtime.
//
// TikTok is not a Supabase provider and is not OIDC-compliant, so there is no
// native path: the code has to be exchanged server-side and a Supabase session
// minted from the result. That is what this handler does.
//
// Everything it touches is injected. No Deno globals, no Supabase client
// construction, no network at import time. index.ts supplies the real
// dependencies; handlerTest.ts supplies fakes and runs in plain node.
//
// SECURITY. The TikTok client secret and the Supabase service-role key exist
// only in this function's environment. They are never returned to the caller,
// never logged, and never shipped in the app bundle. The client receives a
// single-use magic-link token hash, which it exchanges for a session itself.
// If you change the response shape, keep it that way.

export const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
export const TIKTOK_USER_URL =
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url';

// A TikTok open_id is only unique per developer app, so it is namespaced into a
// synthetic email. The user never sees or uses this address; it exists because
// GoTrue keys users by email and we need a stable, collision-free handle for
// "the same TikTok account signing in again".
export const TIKTOK_EMAIL_DOMAIN = 'tiktok.pusoynow.internal';

export function tiktokEmail(openId: string): string {
  return `tiktok_${openId}@${TIKTOK_EMAIL_DOMAIN}`;
}

export interface AdminUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AdminError {
  message?: string;
  code?: string;
  status?: number;
}

export interface CreateUserAttrs {
  email: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

// The three Admin API calls this bridge needs, and nothing else.
export interface AdminApiLike {
  createUser(attrs: CreateUserAttrs): Promise<{ data: { user: AdminUser | null }; error: AdminError | null }>;
  updateUserById(
    id: string,
    attrs: { user_metadata?: Record<string, unknown> },
  ): Promise<{ data: { user: AdminUser | null }; error: AdminError | null }>;
  generateLink(args: {
    type: 'magiclink';
    email: string;
  }): Promise<{
    data: { properties: { hashed_token: string } | null; user: AdminUser | null };
    error: AdminError | null;
  }>;
}

export interface Deps {
  fetchFn: typeof fetch;
  admin: AdminApiLike;
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export interface HandlerRequest {
  method: string;
  json(): Promise<unknown>;
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

interface TikTokProfile {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
}

function bad(status: number, error: string): HandlerResponse {
  return { status, body: { error } };
}

// GoTrue signals a duplicate differently across versions, so match on both the
// stable code and the human message.
function isDuplicateUser(error: AdminError): boolean {
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('already been registered') || msg.includes('already exists');
}

async function exchangeCode(code: string, deps: Deps): Promise<string | null> {
  const body = new URLSearchParams({
    client_key: deps.clientKey,
    client_secret: deps.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: deps.redirectUri,
  });
  let res: Response;
  try {
    res = await deps.fetchFn(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: unknown; error?: unknown };
  // TikTok answers 200 with an `error` field for a bad or replayed code.
  if (json.error) return null;
  return typeof json.access_token === 'string' && json.access_token ? json.access_token : null;
}

async function fetchProfile(accessToken: string, deps: Deps): Promise<TikTokProfile | null> {
  let res: Response;
  try {
    res = await deps.fetchFn(TIKTOK_USER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { user?: { open_id?: unknown; display_name?: unknown; avatar_url?: unknown } };
  };
  const user = json.data?.user;
  const openId = typeof user?.open_id === 'string' ? user.open_id : '';
  if (!openId) return null;
  return {
    openId,
    displayName: typeof user?.display_name === 'string' && user.display_name ? user.display_name : 'TikTok player',
    avatarUrl: typeof user?.avatar_url === 'string' && user.avatar_url ? user.avatar_url : null,
  };
}

// Create on first sign-in, reuse on every one after. Two TikTok logins from the
// same account must never produce two Supabase users, so the synthetic email is
// the idempotency key and a duplicate error is a success, not a failure.
// Returns whether the user already existed, or an error response.
async function ensureUser(profile: TikTokProfile, deps: Deps): Promise<{ existed: boolean } | HandlerResponse> {
  const created = await deps.admin.createUser({
    email: tiktokEmail(profile.openId),
    email_confirm: true,
    user_metadata: userMetadata(profile),
    app_metadata: { provider: 'tiktok', tiktok_open_id: profile.openId },
  });

  if (!created.error) return { existed: false };
  if (isDuplicateUser(created.error)) return { existed: true };
  return bad(500, 'Could not create the account.');
}

function userMetadata(profile: TikTokProfile): Record<string, unknown> {
  return { full_name: profile.displayName, avatar_url: profile.avatarUrl };
}

export async function handleTikTokAuth(req: HandlerRequest, deps: Deps): Promise<HandlerResponse> {
  if (req.method !== 'POST') return bad(405, 'Method not allowed.');

  let payload: { code?: unknown };
  try {
    payload = (await req.json()) as { code?: unknown };
  } catch {
    return bad(400, 'Expected a JSON body.');
  }

  const code = typeof payload?.code === 'string' ? payload.code.trim() : '';
  if (!code) return bad(400, 'Missing authorization code.');

  const accessToken = await exchangeCode(code, deps);
  // A bad, expired, or replayed code is an authentication failure, not a bug.
  if (!accessToken) return bad(401, 'TikTok rejected the authorization code.');

  const profile = await fetchProfile(accessToken, deps);
  if (!profile) return bad(502, 'Could not read the TikTok profile.');

  const ensured = await ensureUser(profile, deps);
  if ('status' in ensured) return ensured;

  const email = tiktokEmail(profile.openId);
  // Exactly one generateLink call: a second would mint a second token and
  // invalidate the first.
  const link = await deps.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) return bad(500, 'Could not start the session.');

  // A returning user's display name and avatar may have changed on TikTok, and
  // TikTok avatar URLs expire. Refresh them, exactly as the Google/Facebook
  // path does on every sign-in. A failure here is not worth losing the session.
  const userId = link.data?.user?.id;
  if (ensured.existed && userId) {
    await deps.admin.updateUserById(userId, { user_metadata: userMetadata(profile) });
  }

  // Single-use token hash. The client calls verifyOtp with it to get a session,
  // so no privileged key ever leaves this function.
  return {
    status: 200,
    body: {
      email,
      token_hash: tokenHash,
      display_name: profile.displayName,
      avatar_url: profile.avatarUrl,
    },
  };
}
