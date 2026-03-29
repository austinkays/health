# Security & Quality Audit — Remaining Items

Previous agent addressed the most critical issues. These are the remaining lower-priority items identified during the audit.

## Completed (by previous agent)

- [x] `api/chat.js`: Auth bypass when env vars missing — now mandatory
- [x] `api/chat.js`: Input validation (max_tokens, messages, system)
- [x] `api/chat.js`: Localhost removed from production CORS
- [x] `api/chat.js`: Anthropic errors no longer leaked to client
- [x] `crypto.js`: PBKDF2 iterations bumped from 100k to 600k
- [x] `storage.js`: Version-aware PBKDF2 (v2=600k, v1=100k backward compat)
- [x] `vercel.json`: Removed `unsafe-eval` from CSP script-src
- [x] `index.html`: Removed zoom restrictions (WCAG 1.4.4)

## Remaining — Medium Priority

### 1. Rate limiting on `api/chat.js`
- No per-user request limits on the API proxy
- Any valid session can make unlimited Anthropic API calls
- Options: Vercel KV, Upstash Redis, or in-memory map with TTL
- Suggested: 100 requests/hour per user

### 2. Static PBKDF2 salt in `crypto.js`
- `src/services/crypto.js:5` uses hardcoded salt `'salve-health-cache-v1'`
- All users share the same salt for cache encryption
- Consider incorporating user_id into salt: `salve-${userId}-cache-v2`
- Requires passing userId to encrypt/decrypt functions

### 3. Hardcoded magic link redirect URL in `auth.js`
- `src/services/auth.js:7` hardcodes `'https://salve-three.vercel.app'`
- Should use an env var (`VITE_AUTH_REDIRECT_URL`) with the current URL as fallback
- Breaks preview/staging deployments

### 4. Race condition in useHealthData CRUD helpers
- `src/hooks/useHealthData.js:28-49` — CRUD helpers update local state optimistically
- If the Supabase call fails, UI is out of sync with database
- Consider: optimistic update with rollback on error, or update state after server confirms

### 5. Missing error state in useHealthData
- Hook logs errors to console but doesn't expose them to components
- Add `error` state to hook return value so UI can show error messages

### 6. Memory leak in App.jsx auth flow
- `src/App.jsx:50` — `exchangeCodeForSession` promise has no cleanup if component unmounts
- Low risk since App is the root component, but add a cleanup flag for correctness

### 7. Import validation — no record-level validation
- `src/services/storage.js:145-156` — `validateImport()` checks file structure only
- Individual records aren't validated for type, length, or format
- Could allow malformed data into the database
- Consider: validate field types and string lengths per table schema

## Remaining — Low Priority

### 8. Array index keys in React lists
- `src/components/sections/AIPanel.jsx:66` — chat messages use index as key
- `src/components/sections/Interactions.jsx:38` — interaction warnings use index
- `src/components/sections/Medications.jsx:70` — same
- `src/components/sections/SurgicalPlanning.jsx:128,135,142` — array items
- Should use stable IDs (record id, or generated key)

### 9. Missing accessibility attributes
- `src/components/ui/Button.jsx` — no `aria-label` for icon-only buttons
- `src/components/ui/Card.jsx` — missing `role` when onClick is present
- `src/components/ui/ConfirmBar.jsx` — backdrop missing `role="dialog"`
- Multiple section components have clickable divs without keyboard handlers

### 10. Supabase client silent failure on missing env vars
- `src/services/supabase.js:3-12` — falls back to empty strings if env vars missing
- Creates a client with invalid credentials that only fails when used
- Consider throwing in non-dev builds

### 11. CSP still requires `unsafe-inline` for script-src
- Needed because Vite injects inline module preload scripts
- Long-term fix: move to nonce-based CSP with a Vercel middleware/edge function
- Not achievable with static `vercel.json` headers alone
