// Transactional email for auth: verification links and password resets.
//
// Two modes, chosen at send time by whether a Resend key is configured:
//
//   resend       POST to the Resend API. Used once RESEND_API_KEY is set.
//   dev-mailbox  Log the link to the Worker console. This keeps the whole
//                sign-up/verify/reset flow testable end to end before any
//                third-party email account exists (the plan's dev-mailbox mode).
//
// Passwords never pass through here, and are never logged anywhere. The only
// secret in a link is a single-use, short-lived token, which is what the user
// is meant to receive.

import type { Env } from './auth';

export type AuthEmailKind = 'verify' | 'reset';

export interface AuthEmail {
  to: string;
  kind: AuthEmailKind;
  // The better-auth-generated URL carrying the one-time token.
  url: string;
}

const SUBJECTS: Record<AuthEmailKind, string> = {
  verify: 'Verify your email for Prends',
  reset: 'Reset your Prends password',
};

// Plain-text bodies. No em dashes, no emojis (UI copy rules), and no HTML so
// there is nothing to sanitize. The link is the payload.
export function emailBody(kind: AuthEmailKind, url: string): string {
  if (kind === 'verify') {
    return [
      'Welcome to Prends.',
      '',
      'Confirm this email address to finish creating your account:',
      url,
      '',
      'If you did not create an account, you can ignore this message.',
    ].join('\n');
  }
  return [
    'We received a request to reset your Prends password.',
    '',
    'Use this link to choose a new password:',
    url,
    '',
    'If you did not request this, you can ignore this message. Your password stays the same.',
  ].join('\n');
}

// 'resend' when a key is configured, otherwise 'dev-mailbox'. Exposed so the
// health/setup surfaces and tests can report which mode is live.
export function emailMode(env: Env): 'resend' | 'dev-mailbox' {
  return env.RESEND_API_KEY ? 'resend' : 'dev-mailbox';
}

// Resend's shared sandbox sender works without domain verification for early
// testing; production sets EMAIL_FROM to a verified domain address.
const DEFAULT_FROM = 'Prends <onboarding@resend.dev>';

export async function sendAuthEmail(
  env: Env,
  email: AuthEmail,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // dev-mailbox: the link is what a real inbox would receive. Distinctive
    // prefix so it is easy to grep out of `wrangler tail`.
    console.log(`[dev-mailbox] ${email.kind} link for ${email.to}: ${email.url}`);
    return;
  }

  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? DEFAULT_FROM,
      to: email.to,
      subject: SUBJECTS[email.kind],
      text: emailBody(email.kind, email.url),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}
