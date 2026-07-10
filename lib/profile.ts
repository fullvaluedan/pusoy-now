// Pure helpers for turning a Supabase user into a `players` row.
//
// Nothing here imports react-native or constructs a Supabase client, so it is
// unit-testable in plain node (see lib/profileTest.ts). lib/auth.tsx is the
// React layer on top.
//
// Two provider quirks drive most of this file:
//
//   Google   hands back a small avatar whose size lives in the URL itself, as a
//            trailing `=s96-c` token. Asking for a bigger one means rewriting
//            that token, not appending a second one.
//   Facebook hands back a fixed 50px thumbnail through GoTrue and offers no way
//            to ask for more. The usable picture has to be re-fetched from the
//            Graph API with the short-lived `provider_token`, which we only
//            hold during the sign-in callback. So `players.avatar_url` is a
//            cache, refreshed on every sign-in, not a permanent record.

// Structural subsets of the Supabase types, so this module needs no runtime
// dependency on @supabase/supabase-js.
export interface IdentityLike {
  provider?: string;
  identity_data?: Record<string, unknown> | null;
}

export interface UserLike {
  user_metadata?: Record<string, unknown> | null;
  identities?: IdentityLike[] | null;
  app_metadata?: { provider?: string } | null;
  email?: string | null;
}

export interface PlayerRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  social_provider: string | null;
}

// Minimal shape of the one Supabase call this module makes, so tests can pass a
// fake and we never reach the network.
export interface UpsertClientLike {
  from(table: string): {
    upsert(row: PlayerRow, opts: { onConflict: string }): Promise<{ error: unknown }>;
  };
}

const AVATAR_SIZE = 400;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// Google encodes the requested size in a trailing `=s96-c` / `=s64` token.
// Appending a second token gives an invalid URL, so replace any existing one.
export function sizeGoogleAvatarUrl(url: string): string {
  return `${url.replace(/=s\d+(-c)?$/, '')}=s${AVATAR_SIZE}`;
}

export function pickRawAvatarUrl(user: UserLike): string | null {
  const meta = user.user_metadata ?? {};
  const fromMeta = str(meta.avatar_url) ?? str(meta.picture);
  if (fromMeta) return fromMeta;

  for (const identity of user.identities ?? []) {
    const data = identity.identity_data ?? {};
    const fromIdentity = str(data.avatar_url) ?? str(data.picture);
    if (fromIdentity) return fromIdentity;
  }
  return null;
}

export function pickProvider(user: UserLike): string | null {
  return str(user.app_metadata?.provider) ?? str(user.identities?.[0]?.provider) ?? null;
}

export function pickDisplayName(user: UserLike): string {
  const meta = user.user_metadata ?? {};
  const named = str(meta.full_name) ?? str(meta.name) ?? str(meta.user_name);
  if (named) return named;
  const email = str(user.email);
  if (email) return email.split('@')[0];
  return 'Player';
}

// Re-fetch the Facebook picture at a usable width. Any failure falls back to
// the thumbnail: a small avatar beats a broken sign-in.
async function fetchFacebookAvatar(
  providerToken: string,
  fetchFn: typeof fetch,
): Promise<string | null> {
  const url =
    `https://graph.facebook.com/me?fields=picture.width(${AVATAR_SIZE})` +
    `&access_token=${encodeURIComponent(providerToken)}`;
  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { picture?: { data?: { url?: unknown } } };
    return str(body?.picture?.data?.url);
  } catch {
    return null;
  }
}

export interface ResolveAvatarOptions {
  // Only available during the sign-in callback, and only for some providers.
  providerToken?: string | null;
  fetchFn?: typeof fetch;
}

// The avatar URL to cache on the players row, or null when the user has no
// picture at all (the UI then falls back to an initial-letter disc).
export async function resolveAvatarUrl(
  user: UserLike,
  opts: ResolveAvatarOptions = {},
): Promise<string | null> {
  const raw = pickRawAvatarUrl(user);
  const provider = pickProvider(user);

  if (provider === 'google') {
    return raw ? sizeGoogleAvatarUrl(raw) : null;
  }

  if (provider === 'facebook') {
    const token = opts.providerToken;
    if (!token) return raw;
    const big = await fetchFacebookAvatar(token, opts.fetchFn ?? fetch);
    return big ?? raw;
  }

  return raw;
}

export function buildPlayerRow(
  userId: string,
  user: UserLike,
  avatarUrl: string | null,
): PlayerRow {
  return {
    user_id: userId,
    display_name: pickDisplayName(user),
    avatar_url: avatarUrl,
    social_provider: pickProvider(user),
  };
}

// Keyed on user_id, so the first sign-in inserts and every later one refreshes
// the avatar_url that Facebook will have expired by then.
export async function upsertPlayer(client: UpsertClientLike, row: PlayerRow): Promise<void> {
  const { error } = await client.from('players').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

// --- OAuth callback --------------------------------------------------------

export type AuthCallbackOutcome =
  | { kind: 'cancelled' }
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string };

function queryParams(url: string): URLSearchParams {
  const q = url.indexOf('?');
  return new URLSearchParams(q >= 0 ? url.slice(q + 1) : '');
}

// Closing the browser, backing out, and declining consent are all ordinary user
// choices, not failures. Collapsing them to `cancelled` is what keeps the UI
// from looping an error toast at someone who simply changed their mind.
export function interpretAuthSessionResult(res: { type: string; url?: string }): AuthCallbackOutcome {
  if (res.type !== 'success' || !res.url) return { kind: 'cancelled' };

  const params = queryParams(res.url);
  const error = params.get('error');
  if (error) {
    if (error === 'access_denied' || error === 'user_cancelled_login') return { kind: 'cancelled' };
    return { kind: 'error', message: params.get('error_description') ?? error };
  }

  const code = params.get('code');
  if (!code) return { kind: 'error', message: 'Sign-in did not return an authorization code.' };
  return { kind: 'code', code };
}
