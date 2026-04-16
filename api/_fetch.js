// ── Shared fetch helpers for API routes ──
// `fetchWithTimeout(url, opts, timeoutMs?)` aborts the request after
// `timeoutMs` (default 15s) and clears the timer on settle. Use for any
// outbound call to a third-party API so a hung upstream can't eat the
// whole function's execution time.

export const DEFAULT_EXTERNAL_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}
