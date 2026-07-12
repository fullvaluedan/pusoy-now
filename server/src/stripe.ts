// Stripe: web checkout for the $9.99/year no-ads offer, plus signature-verified
// webhook parsing. Follows the official stripe-node Cloudflare Workers pattern:
// the Fetch HTTP client (Workers has no Node http) and the SubtleCrypto
// provider with the async webhook verifier (Workers has no synchronous crypto).
//
// Native app-store IAP is deferred: this round is web only, and the paywall
// copy on native points at the website.

import Stripe from 'stripe';
import type { Env } from './auth';

// Both the secret key and the yearly price id are required to sell anything.
// Until they exist the money routes report "not configured" and the paywall
// stays in coming-soon/test mode - nothing crashes.
export function stripeConfigured(env: Env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID);
}

export function stripeClient(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY as string, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export interface CheckoutInput {
  userId: string;
  email?: string;
  // The web app origin to return to after checkout (success or cancel).
  origin: string;
}

// Create a subscription-mode Checkout Session for the yearly price and return
// its hosted URL. client_reference_id carries the user id back on the webhook.
export async function createCheckout(env: Env, input: CheckoutInput): Promise<string | null> {
  const stripe = stripeClient(env);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: env.STRIPE_PRICE_ID as string, quantity: 1 }],
    client_reference_id: input.userId,
    customer_email: input.email,
    // Also stamp the user id into subscription metadata so renewal invoices can
    // be attributed without a customer->user lookup table.
    subscription_data: { metadata: { userId: input.userId } },
    success_url: `${input.origin}/?upgrade=success`,
    cancel_url: `${input.origin}/?upgrade=cancel`,
  });
  return session.url;
}

// Verify a webhook signature and return the parsed event. Throws on a bad
// signature (the route turns that into a 400). Async because Workers crypto is
// async only.
export async function constructEvent(env: Env, payload: string, signature: string): Promise<Stripe.Event> {
  const stripe = stripeClient(env);
  return stripe.webhooks.constructEventAsync(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET as string,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}

// The minimal event shape the entitlement processor reads. Kept structural so
// tests can build fixtures without the full Stripe.Event type.
export interface StripeLikeEvent {
  id: string;
  type: string;
  data: {
    object: {
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
    };
  };
}

// Pull the app user id out of an event. Checkout sessions carry it as
// client_reference_id; invoices and other objects carry it in metadata (stamped
// on the subscription at checkout).
export function stripeEventUserId(event: StripeLikeEvent): string | null {
  const obj = event.data?.object ?? {};
  return obj.client_reference_id || obj.metadata?.userId || null;
}
