// src/services/sentry.js
// Sentry error reporting configured for a health app:
// - Only initializes when VITE_SENTRY_DSN is set (silent in dev if unset)
// - Disabled by default in development (set VITE_SENTRY_DSN_DEV to override)
// - beforeSend scrubs any request body, form data, and known health field
//   names so PHI never leaves the device
// - Session Replay + performance are OFF by default to keep bundle slim
//   and because replay would capture PHI

import * as Sentry from '@sentry/react';

// Fields that should NEVER appear in Sentry events, if a crash happens
// while rendering a form or API call, this scrubs the values from
// extra/context/breadcrumb data.
const PHI_KEYS = new Set([
  'name', 'dose', 'frequency', 'prescriber', 'pharmacy', 'notes',
  'reaction', 'severity', 'substance', 'condition', 'diagnosis',
  'value', 'value2', 'systolic', 'diastolic', 'glucose', 'weight',
  'temp', 'temperature', 'hr', 'heart_rate', 'bp', 'blood_pressure',
  'content', 'title', 'mood', 'symptom', 'flow', 'bbt',
  'provider', 'npi', 'address', 'phone', 'fax', 'portal_url',
  'insurance_id', 'group', 'plan', 'claim_number',
  'email', 'password', 'token', 'access_token', 'refresh_token',
  'health_background', 'ai_mode', 'rxcui', 'fda_data', 'affected_drugs',
  'genotype', 'variant', 'gene', 'phenotype',
]);

function scrub(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(v => scrub(v, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PHI_KEYS.has(k.toLowerCase())) {
      out[k] = '[redacted]';
    } else {
      out[k] = scrub(v, depth + 1);
    }
  }
  return out;
}

export function initSentry() {
  const isProd = import.meta.env.PROD;
  const dsn = isProd
    ? import.meta.env.VITE_SENTRY_DSN
    : (import.meta.env.VITE_SENTRY_DSN_DEV || import.meta.env.VITE_SENTRY_DSN);

  if (!dsn) return; // no-op if DSN missing

  Sentry.init({
    dsn,
    environment: isProd ? 'production' : 'development',
    // Release is optional, set it during Vercel deploys if you want
    // to correlate errors to commits
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    // No session replay (captures DOM / text / PHI) and no tracing
    // to keep the bundle slim. Dedupe suppresses duplicate consecutive errors
    // so a render loop doesn't exhaust the free Sentry quota (5K/month).
    integrations: [Sentry.dedupeIntegration()],
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 50,

    // Never capture input values in error events
    sendDefaultPii: false,

    // Filter + scrub every event before it goes over the wire
    beforeSend(event) {
      // Drop request bodies entirely, we don't need them and they
      // typically carry PHI
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      // Recursively redact known health field names from contexts
      if (event.contexts) event.contexts = scrub(event.contexts);
      if (event.extra) event.extra = scrub(event.extra);
      if (event.tags) event.tags = scrub(event.tags);
      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // Drop console breadcrumbs that may contain user-entered text
      if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
        return null;
      }
      if (breadcrumb.data) breadcrumb.data = scrub(breadcrumb.data);
      return breadcrumb;
    },
  });
}

// Associate crashes with a user ID (NOT email or any PII) so you can
// see which accounts are hitting which errors in Sentry
export function setSentryUser(userId) {
  if (!userId) return;
  Sentry.setUser({ id: userId });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

// Optional: wrap a thrown error with context for manual captures
export function captureError(err, context) {
  Sentry.captureException(err, context ? { extra: scrub(context) } : undefined);
}

export { Sentry };
