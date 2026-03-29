# Audit Prompt — Salve Health App

Use this file to guide security and quality audits. Read CLAUDE.md first for full architecture context.

## Previously Fixed (this audit round)

1. **Auth bypass in `api/chat.js`** — Auth verification was skipped when Supabase env vars were missing. Now fails closed with 500 error.
2. **`max_tokens` uncapped in `api/chat.js`** — Client could send arbitrary token counts. Now clamped to 4096 server-side.
3. **AI auto-insight broken in `Dashboard.jsx`** — Checked `ai_mode === 'auto'` but valid values are `alwaysOn`/`onDemand`/`off`. Fixed to `'alwaysOn'`.
4. **CSP allowed direct `api.anthropic.com` in `connect-src`** — Client never connects directly; removed from `vercel.json`.
5. **CLAUDE.md outdated** — Added 8 new sections (Labs, Procedures, Immunizations, CareGaps, AnesthesiaFlags, Appeals, SurgicalPlanning, Insurance) to directory tree, database tables, and updated CSP reference.

## Known Remaining Issues

### Security

- **CSP uses `unsafe-inline` and `unsafe-eval` for `script-src`** — Added as a workaround for Vite/React. Investigate whether a nonce-based approach or stricter policy is feasible for production builds.
- **`system` prompt passthrough in `api/chat.js`** — The `system` field from the client request body is forwarded directly to Anthropic without validation. A compromised client could override AI behavior. Consider allowlisting known system prompts server-side.
- **No rate limiting on `/api/chat`** — A malicious user with a valid session could spam the Anthropic API. Consider adding rate limiting (e.g., via Vercel Edge Middleware or Upstash).
- **Supabase anon key exposed to client** — This is by design (Supabase RLS protects data), but ensure RLS policies are comprehensive for all 15+ tables including the new ones.

### Code Quality

- **Offline cache is dead code** — `cache.js` and `setupOfflineSync()` exist but are never called from `useHealthData.js` or `App.jsx`. Either integrate the cache or remove the dead code.
- **No error boundaries** — A React error in any section crashes the whole app. Add `<ErrorBoundary>` wrappers around sections.
- **`useHealthData` swallows errors** — `loadAll()` failures are caught and logged to console but the user sees no indication of failure. Should surface errors in the UI.
- **No input sanitization for profile data sent to AI** — `buildProfile()` concatenates user data directly into AI system prompts. While this is internal (not user-facing prompt injection), malformed data could confuse the AI.

### Functionality

- **Realtime subscriptions set up but unused** — `db.js` exports `subscribeToChanges()` but no component subscribes. Cross-device sync won't work until this is wired up.
- **Import restore does `window.location.reload()` after 1.5s timeout** — Fragile; if Supabase insert is slow, the user may see stale data. Should wait for completion signal.
- **`eraseAll()` doesn't clear `ai_conversations`** — Wait, it does (line 152 in db.js). Verified.

### Testing

- **No automated tests** — No test files exist. Consider adding at least integration tests for auth flow, CRUD operations, and import/export.
- **No build-time type checking** — Plain JSX with no TypeScript or PropTypes. Runtime errors from prop mismatches are possible.

## Audit Checklist for Future Rounds

- [ ] Review all RLS policies in Supabase match the 15+ tables
- [ ] Verify all new tables (labs, procedures, etc.) have proper RLS
- [ ] Test encrypted export/import round-trip
- [ ] Test merge import deduplication with sync_id
- [ ] Verify CORS allowlist in api/chat.js covers all deployment URLs
- [ ] Check for console.log/console.error statements that might leak PHI
- [ ] Review all `catch {}` blocks for silent error swallowing
- [ ] Test offline behavior (disconnect network, verify cache fallback)
