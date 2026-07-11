// Social sign-in providers (Google + Facebook) and the profile mapping that
// puts a real name and a usable-size avatar on the user row at first sign-in.
//
// Feature-detected: a provider is only registered when BOTH its client id and
// secret are present as wrangler secrets. A missing pair means the provider is
// absent (the client shows it as unavailable) rather than a half-configured
// endpoint that errors. TikTok is deferred (it needs its own Login Kit bridge).
//
// Avatar sizing ports the Round-1 logic:
//   Google   encodes the requested size in a trailing `=s96-c` token on the
//            picture URL, so a bigger one means rewriting that token.
//   Facebook returns a tiny thumbnail by default; asking the Graph API for
//            `picture.width(400)` via the provider's `fields` option makes the
//            returned picture.data.url already the right size, so no separate
//            token fetch is needed here.

import type { BetterAuthOptions } from 'better-auth';
import type { Env } from './auth';

export const AVATAR_SIZE = 400;

// Google's picture URL carries its size as a trailing `=s96-c` / `=s64` token.
// Appending a second token yields an invalid URL, so replace any existing one.
export function sizeGoogleAvatarUrl(url: string): string {
  return `${url.replace(/=s\d+(-c)?$/, '')}=s${AVATAR_SIZE}`;
}

// Minimal structural subsets of the provider profiles (better-auth passes the
// full object; we only read these fields).
export interface GoogleProfileLike {
  name?: string;
  picture?: string;
}
export interface FacebookProfileLike {
  name?: string;
  picture?: { data?: { url?: string } };
}

export function mapGoogleProfile(profile: GoogleProfileLike): { name?: string; image?: string } {
  return {
    name: profile.name,
    image: profile.picture ? sizeGoogleAvatarUrl(profile.picture) : undefined,
  };
}

export function mapFacebookProfile(profile: FacebookProfileLike): { name?: string; image?: string } {
  return {
    name: profile.name,
    image: profile.picture?.data?.url,
  };
}

// The provider ids that are fully configured. Exposed over GET /api/providers so
// the client can show only the buttons that will actually work.
export function configuredProviderIds(env: Env): string[] {
  const ids: string[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) ids.push('google');
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) ids.push('facebook');
  // Apple needs all three: the Services ID (clientId), the ES256 JWT
  // (clientSecret), and the native bundle id (verifies native idTokens).
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET && env.APPLE_APP_BUNDLE_IDENTIFIER) ids.push('apple');
  return ids;
}

// Build the socialProviders block, including only fully configured providers.
// Always an object (possibly empty), never undefined, so callers can inspect it.
export function socialProvidersFor(env: Env): NonNullable<BetterAuthOptions['socialProviders']> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      mapProfileToUser: (profile) => mapGoogleProfile(profile as GoogleProfileLike),
    };
  }

  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    providers.facebook = {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      // Ask Facebook for a 400px avatar up front so picture.data.url is already
      // the size we want (no second Graph call with the provider token).
      fields: ['id', 'name', 'email', `picture.width(${AVATAR_SIZE}).height(${AVATAR_SIZE})`],
      mapProfileToUser: (profile) => mapFacebookProfile(profile as FacebookProfileLike),
    };
  }

  // Apple: the Services ID is the OAuth client for the web/redirect flow, and
  // `appBundleIdentifier` is what lets better-auth verify the native idToken
  // (whose audience is the app bundle id) -- without it native sign-in fails
  // with "Invalid id token". All three fields are required, matching
  // configuredProviderIds so the client button and the provider agree.
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET && env.APPLE_APP_BUNDLE_IDENTIFIER) {
    providers.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
    };
  }

  return providers;
}
