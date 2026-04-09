// src/services/billing.js
// Client-side Lemon Squeezy billing helpers.
// Requires api/lemon-checkout.js to be deployed.

import { getAuthToken } from './token.js';

/**
 * Build-time flag for whether Lemon Squeezy is fully configured.
 * Set VITE_BILLING_ENABLED=true in Vercel env vars once:
 *   - LS account is set up
 *   - Store + product + variant are created
 *   - LEMON_API_KEY / LEMON_STORE_ID / LEMON_PREMIUM_VARIANT_ID /
 *     LEMON_WEBHOOK_SECRET env vars are populated
 *   - The webhook URL (/api/lemon-webhook) is configured in LS dashboard
 *
 * While false, every upgrade CTA in the app is hidden so beta users
 * aren't sent to a broken checkout flow.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true';

/**
 * Redirects the current user to a Lemon Squeezy hosted checkout.
 * Requires the user to be signed in (token fetched via getAuthToken).
 * Throws if the checkout URL cannot be obtained.
 */
export async function startCheckout() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/lemon-checkout', {
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

  // Full redirect, Lemon Squeezy handles the checkout in their hosted page
  window.location.href = url;
}

/**
 * Opens the Lemon Squeezy customer portal where subscribers can update their
 * payment method, view invoices, or cancel their subscription.
 *
 * The portal URL comes from the subscription object. Since we don't store it
 * client-side, we open the generic Lemon Squeezy customer portal page and the
 * user signs in with their purchase email.
 */
export function openCustomerPortal() {
  window.open('https://app.lemonsqueezy.com/billing', '_blank', 'noopener,noreferrer');
}
