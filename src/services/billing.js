// src/services/billing.js
// Client-side Stripe billing helpers.

import { getAuthToken } from './token.js';

/**
 * Build-time flag for whether Stripe is fully configured.
 * Set VITE_BILLING_ENABLED=true in Vercel env vars once:
 *   - Stripe account is set up
 *   - Product + prices are created
 *   - STRIPE_SECRET_KEY / STRIPE_PREMIUM_PRICE_ID / STRIPE_ANNUAL_PRICE_ID /
 *     STRIPE_WEBHOOK_SECRET env vars are populated
 *   - The webhook URL (/api/stripe-webhook) is configured in Stripe dashboard
 *
 * While false, every upgrade CTA in the app is hidden so beta users
 * aren't sent to a broken checkout flow.
 */
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === 'true';

/**
 * Redirects the user to Stripe Checkout for the selected plan.
 * @param {'monthly'|'annual'} plan — defaults to 'monthly'
 */
export async function startCheckout(plan = 'monthly') {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/stripe-checkout?action=checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Checkout failed (${res.status})`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('No checkout URL returned');
  window.location.href = url;
}

/**
 * Opens the Stripe Billing Portal where subscribers can update payment,
 * view invoices, or cancel.
 */
export async function openCustomerPortal() {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch('/api/stripe-checkout?action=portal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Could not open billing portal (${res.status})`);
  }

  const { url } = await res.json();
  if (!url) throw new Error('No portal URL returned');
  window.location.href = url;
}
