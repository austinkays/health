// src/services/billing.js
// Client-side Stripe billing helpers.
// Requires api/stripe-checkout.js to be deployed.

import { getAuthToken } from './token.js';

/**
 * Build-time flag for whether Stripe is fully configured.
 * Set VITE_BILLING_ENABLED=true in Vercel env vars once:
 *   - Stripe account is set up
 *   - Product + price are created
 *   - STRIPE_SECRET_KEY / STRIPE_PREMIUM_PRICE_ID / STRIPE_WEBHOOK_SECRET
 *     env vars are populated in Vercel
 *   - The webhook URL (/api/stripe-webhook) is configured in the Stripe dashboard
 *
 * While false, every upgrade CTA in the app is hidden so beta users
 * aren't sent to a broken checkout flow.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true';

/**
 * Redirects the current user to a Stripe hosted checkout.
 * Requires the user to be signed in (token fetched via getAuthToken).
 * Throws if the checkout URL cannot be obtained.
 */
export async function startCheckout() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/stripe-checkout?action=checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Checkout failed (${res.status})`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');

  // Full redirect — Stripe handles the checkout on their hosted page
  window.location.href = url;
}

/**
 * Redirects the current user to their Stripe Billing Portal where they can
 * update their payment method, view invoices, or cancel their subscription.
 *
 * Stripe requires a server-side session to generate a one-time portal URL
 * (unlike Lemon Squeezy which had a static generic portal link).
 * Requires the user to have completed at least one checkout (stripe_customer_id
 * must be stored on their profile).
 */
export async function openCustomerPortal() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/stripe-checkout?action=portal', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Could not open billing portal (${res.status})`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('No portal URL returned');

  window.location.href = url;
}
