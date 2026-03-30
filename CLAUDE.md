# Salve - Health Companion App

## Project Overview

Personal health management app. Originally a Claude.ai React artifact (~2000+ line monolithic JSX), now a standalone Vite + React + Tailwind app with Supabase backend, deployed on Vercel.

**Live deployment target:** Vercel
**Auth:** Supabase magic-link email auth (multi-user capable)
**Storage:** Supabase PostgreSQL (with localStorage offline cache fallback)

## Tech Stack

- **Framework:** Vite + React 18 (code-split with `lazyWithRetry` wrapper around `React.lazy` + `Suspense`; auto-reloads on stale chunks)
- **PWA:** `vite-plugin-pwa` (Workbox service worker, cache-first for assets, network-first for API/Supabase)
- **Styling:** Tailwind CSS v3
- **Charts:** Recharts
- **Icons:** lucide-react
- **Fonts:** Google Fonts - Playfair Display (headings), Montserrat (body)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Auth:** Supabase Auth (magic link / OTP email; session expiry detection; OTP 10-min countdown)
- **Offline cache:** localStorage (AES-GCM encrypted via `cache.js` + `crypto.js`)
- **AI Backend:** Vercel serverless function proxying Anthropic API (auth-gated)
- **Medical APIs:** RxNorm (NLM drug data), OpenFDA (drug labels), NPPES (NPI provider registry) — all via Vercel serverless proxies
- **Maps:** Google Maps URL links (no API key, URL construction only)
- **Deployment:** Vercel

## Architecture

### Directory Structure

```
health/
├── CLAUDE.md
├── EXPORT_ARTIFACT.jsx           # Original export from Claude artifact
├── SOURCE.jsx                    # Original monolithic source
├── MIGRATION_PLAN.md             # Migration planning notes
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
├── index.html
├── .env.local                    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (not committed)
├── .gitignore
├── api/
│   ├── chat.js                   # Vercel serverless: auth-gated Anthropic API proxy
│   ├── drug.js                   # Vercel serverless: RxNorm + OpenFDA proxy (autocomplete, details, interactions)
│   └── provider.js               # Vercel serverless: NPPES NPI registry proxy (search, lookup)
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── favicon.svg
│   └── salve-sync.jsx            # Claude artifact for MCP health data sync into Salve
├── docs/
│   ├── IMPORT_IMPLEMENTATION.md  # Import/export/merge implementation guide
│   └── MIGRATION_PLAN.md         # Migration planning notes
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql        # Full DB schema: profiles, meds, conditions, etc.
│       ├── 002_sync_id.sql
│       ├── 003_comprehensive_schema.sql  # Labs, procedures, immunizations, etc.
│       ├── 004_remove_fabricated_conditions.sql
│       ├── 005_api_enrichment_columns.sql  # Add rxcui to meds, npi+address to providers
│       ├── 006_display_name.sql              # Add display_name to medications
│       ├── 007_fda_enrichment.sql            # Add fda_data JSONB to medications for OpenFDA label cache
│       └── 008_pharmacies_table.sql          # Pharmacies table with preferred flag, hours, website
├── src/
│   ├── main.jsx                  # Entry point, mount App
│   ├── index.css                 # Tailwind directives + Google Fonts import + custom utilities + magical hover/glow/shimmer effects
│   ├── App.jsx                   # Auth gate, session management, router shell (<main> wrapper), view switching, ErrorBoundary wrapper, lazyWithRetry chunk recovery, section-enter animations
│   ├── constants/
│   │   ├── colors.js             # Color palette (C object) as Tailwind-compatible tokens
│   │   ├── interactions.js       # Drug interaction database (static, client-side)
│   │   ├── labRanges.js          # Reference ranges for ~80 common lab tests + fuzzy matcher
│   │   └── defaults.js           # Default data shapes, empty states, vital types, moods
│   ├── services/
│   │   ├── supabase.js           # Supabase client init (from VITE_SUPABASE_URL/ANON_KEY)
│   │   ├── auth.js               # signIn (magic link), signOut, getSession, onAuthChange
│   │   ├── db.js                 # Generic CRUD factory + table-specific services + loadAll (allSettled) + eraseAll
│   │   ├── cache.js              # Encrypted offline localStorage cache + pending write queue + sync
│   │   ├── crypto.js             # AES-GCM encrypt/decrypt + PBKDF2 key derivation for cache & exports
│   │   ├── ai.js                 # Anthropic API calls via /api/chat proxy (auth-gated, requires consent, 120s timeout, empty response validation)
│   │   ├── token.js              # Shared auth token cache (5s TTL, concurrent-call dedup, clearTokenCache on sign-out)
│   │   ├── drugs.js              # Client service: drugAutocomplete, drugDetails, drugInteractions (via /api/drug, 429-aware)
│   │   ├── npi.js                # Client service: searchProviders, lookupNPI (via /api/provider, 429-aware)
│   │   ├── storage.js            # Import/export: exportAll, encryptExport, decryptExport, validateImport, importRestore, importMerge
│   │   └── profile.js            # buildProfile() - assembles health context for AI prompts (sanitized against prompt injection)
│   ├── hooks/
│   │   ├── useHealthData.js      # Main data hook: load from Supabase, CRUD operations, state mgmt, reloadData
│   │   └── useConfirmDelete.js   # Delete confirmation state management
│   ├── components/
│   │   ├── Auth.jsx              # Magic link / 8-digit OTP sign-in screen (expired-code guard on submit)
│   │   ├── ui/                   # Shared primitives
│   │   │   ├── Card.jsx
│   │   │   ├── Button.jsx
│   │   │   ├── Field.jsx         # Label + input/textarea/select (htmlFor/id via React useId(); supports error prop)
│   │   │   ├── Badge.jsx
│   │   │   ├── ConfirmBar.jsx    # Inline delete confirmation (keyboard: Escape/Enter, role=alertdialog)
│   │   │   ├── EmptyState.jsx
│   │   │   ├── ErrorBoundary.jsx  # React error boundary with friendly fallback + Go Home
│   │   │   ├── FormWrap.jsx      # Back-arrow + title wrapper; also exports SectionTitle
│   │   │   ├── LoadingSpinner.jsx # role=status, aria-live=polite
│   │   │   ├── AIConsentGate.jsx  # AI data-sharing consent gate + hasAIConsent/revokeAIConsent
│   │   │   ├── AIMarkdown.jsx     # Markdown renderer for AI responses (react-markdown, auto-linkifies bare URLs)
│   │   │   ├── AIProfilePreview.jsx # "What AI Sees" pill button + full-screen slide-up panel
│   │   │   └── Motif.jsx         # Decorative sparkle/moon/leaf SVG motifs (aria-hidden)
│   │   ├── layout/
│   │   │   ├── Header.jsx        # Semantic <header>, aria-label on back button
│   │   │   └── BottomNav.jsx     # Semantic <nav>, aria-current on active tab, scroll-reveal "made with love" tagline, nav item hover glow
│   │   └── sections/             # One file per app section (20 total)
│   │       ├── Dashboard.jsx     # Home: contextual greeting, consolidated alerts, AI insight, unified timeline, 6+More quick access
│   │       ├── Medications.jsx   # Med list + add/edit + display_name + RxNorm autocomplete + OpenFDA drug info + NLM link status flags + bulk RxCUI linking + bulk FDA enrichment (reports failed med names) + auto-enrich on link + maps links + pharmacy picker + pharmacy filter
│   │       ├── Vitals.jsx        # Vitals tracking + chart with reference ranges + abnormal flags
│   │       ├── Conditions.jsx    # Condition list + add/edit + status filter tabs + provider picker + cross-referenced medications
│   │       ├── Providers.jsx     # Provider directory + NPI registry search + CMS registry links + maps links + phone/portal links + cross-referenced meds & conditions
│   │       ├── Allergies.jsx     # Allergy list + add/edit
│   │       ├── Appointments.jsx  # Upcoming/past visits + add/edit + location maps links + provider picker + auto-fill location + provider phone quick-link
│   │       ├── Journal.jsx       # Health journal entries + add/edit
│   │       ├── Interactions.jsx  # Drug interaction checker (static + live NLM RxNorm)
│   │       ├── Pharmacies.jsx    # Pharmacy directory + auto-discovers pharmacies from medications + preferred flag + hours/website + meds per pharmacy + upcoming refills + pharmacy filter + "Save & Add Details" promote flow for discovered pharmacies
│   │       ├── AIPanel.jsx       # AI Insight panel: rich card-based results with accent borders (insight=lavender, connections=sage, news=amber, resources=rose); ResultHeader with icon badge + copy-to-clipboard; InsightResult (single accent card), ConnectionsResult (section-split cards with stagger animation), NewsResult (per-story accent cards), ResourcesResult (accordion with accent bars); chat with per-message copy buttons; SourcesBadges for web search; styled Disclaimer component; "What AI Sees" preview button opens full-screen slide-up panel
│   │       ├── Labs.jsx          # Lab results + flag-based filtering + AI interpretation + auto reference ranges
│   │       ├── Procedures.jsx    # Medical procedures + outcome tracking
│   │       ├── Immunizations.jsx # Vaccination records
│   │       ├── CareGaps.jsx      # Preventive care gaps + urgency sorting
│   │       ├── AnesthesiaFlags.jsx # Anesthesia safety alerts
│   │       ├── Appeals.jsx       # Insurance appeals & disputes
│   │       ├── SurgicalPlanning.jsx # Pre/post-surgical planning
│   │       ├── Insurance.jsx     # Insurance details + benefits
│   │       └── Settings.jsx      # Profile, AI mode, pharmacy, insurance, health bg, data mgmt, import/export, Claude sync artifact download
│   └── utils/
│       ├── uid.js                # ID generator (legacy, Supabase uses gen_random_uuid())
│       ├── dates.js              # Date formatting helpers
│       ├── interactions.js       # checkInteractions() logic
│       └── maps.js               # mapsUrl(address) → Google Maps search URL
```

### Database (Supabase)

PostgreSQL via Supabase with Row Level Security on all tables. Schema in `supabase/migrations/001_schema.sql`.

**Tables:**

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `profiles` | id (= auth.users.id), name, location, pharmacy, insurance_*, health_background, ai_mode | 1:1 with user, auto-created on signup via trigger |
│ `pharmacies` | name, address, phone, fax, hours, website, is_preferred, notes | Preferred pharmacy badge; cross-linked with medications |
| `medications` | name, display_name, dose, frequency, route, prescriber, pharmacy, purpose, start_date, refill_date, active, notes, rxcui, fda_data | rxcui links to RxNorm drug database; display_name is optional user-friendly casual name; fda_data (JSONB) stores OpenFDA label info (auto-populated on RxCUI link); pharmacy links to pharmacies table by name |
| `conditions` | name, diagnosed_date, status (active/managed/remission/resolved), provider, linked_meds, notes | |
| `allergies` | substance, reaction, severity (mild/moderate/severe), notes | |
| `providers` | name, specialty, clinic, phone, fax, portal_url, notes, npi, address | npi links to NPPES registry; address enables maps |
| `vitals` | date, type (pain/mood/energy/sleep/bp/hr/weight/temp/glucose), value, value2, unit, notes | |
| `appointments` | date, time, provider, location, reason, questions, post_notes | |
| `journal_entries` | date, title, mood, severity, content, tags | |
| `ai_conversations` | title, messages (JSONB) | |

All tables have `user_id` FK (except profiles which uses `id`), `created_at`, `updated_at` (auto-trigger), and RLS policies scoped to `auth.uid()`. Realtime enabled for cross-device sync.

The `db.js` service provides a generic CRUD factory: `list()`, `add()`, `update()`, `remove()` per table, plus `db.loadAll()` (uses `Promise.allSettled()` for resilient initial hydration — individual table failures return empty defaults) and `db.eraseAll()` (sequential per-table deletes with per-table error handling) to wipe user data.

### Import / Export

`storage.js` provides data portability via the Settings UI:
- **Download Backup** — exports all current Supabase data as a JSON file with `_export` metadata envelope
- **Download Encrypted Backup** — same as above but AES-GCM encrypted with a user-supplied passphrase (`encryptExport()`)
- **Import Restore** — creates in-memory backup, erases all data, then bulk-inserts from the uploaded file (full overwrite); auto-restores backup on failure
- **Import Merge** — adds only records whose ID doesn't already exist (sync mode, triggered by `_export.type: "mcp-sync"`)
- **Encrypted Import** — detects `_encrypted` envelope, prompts for passphrase, decrypts via `decryptExport()`, then proceeds with normal validation
- Supports Salve v1 export format, legacy `ambers-remedy` format, and localStorage v2/v3 formats
- After merge, `useHealthData.reloadData()` re-fetches from Supabase to update React state

### Auth Flow

- `Auth.jsx` renders a magic-link email sign-in form with 8-digit OTP code entry (auto-advance, paste support, auto-submit, 10-minute expiry countdown; sign-in button disabled after OTP expiry)
- `auth.js` wraps Supabase auth: `signIn(email)` sends 8-digit OTP, `signOut()`, `getSession()`, `onAuthChange(event, session)` (passes event for expiry detection)
- `App.jsx` manages session state, handles OAuth code exchange from URL params, gates the app behind auth; listens for `SIGNED_OUT`/`TOKEN_REFRESHED` events to show session-expired banner
- Unauthenticated users see the sign-in screen with session-expired notice when applicable; authenticated users see the full app
- All 20 section components are **code-split** with `lazyWithRetry()` (wraps `React.lazy()`) + `Suspense` — only loaded when first visited; on chunk load failure (stale deploy), does a one-time `sessionStorage`-guarded page reload to fetch updated chunks

### Offline Cache

`cache.js` provides an **encrypted** localStorage-based read cache and offline write queue:
- On successful Supabase fetch, data is AES-GCM encrypted using a key derived (PBKDF2) from the user's auth token and cached to `hc:cache`
- `cache.setToken(token)` must be called with the session access token before read/write; `cache.clearToken()` on sign-out
- `read()` and `write()` are async (use `crypto.subtle`)
- When offline, pending writes queue to `hc:pending` (operation metadata only, no PHI)
- `setupOfflineSync()` is initialized in `App.jsx` on mount with a flush callback that replays pending operations through `db.js`; cleans up on unmount
- `crypto.js` provides `encrypt()`, `decrypt()`, and `clearKeyCache()` used by both cache and export encryption

### API Proxy

`api/chat.js` is a Vercel serverless function:
- **Verifies Supabase auth token** via `Authorization: Bearer <token>` header
- Validates token against Supabase Auth API using `SUPABASE_SERVICE_ROLE_KEY`
- **Rate limited:** In-memory sliding window — 20 requests/minute per user ID (resets on cold start)
- **CORS restricted** to allowlisted origins: `VERCEL_URL`, `ALLOWED_ORIGIN` env var, and `localhost:5173` (dev)
- Accepts POST with `{ messages, system, max_tokens?, use_web_search? }`
- Forwards to `https://api.anthropic.com/v1/messages` with model `claude-sonnet-4-20250514`
- **Fetch timeout:** 115-second AbortController timeout (under Vercel's 120s function limit); returns 504 on timeout
- Optionally includes Anthropic web search tool when `use_web_search` is true
- Returns the response JSON
- 120-second timeout configured in vercel.json
- Client-side (`ai.js`) **fails early** if no auth token — never sends unauthenticated requests

### Medical API Proxies

Two additional Vercel serverless functions proxy free government medical APIs. Both follow the same auth + rate-limit + cache pattern as `api/chat.js`. Both use `fetchWithTimeout()` (15-second AbortController) for external API calls.

**`api/drug.js`** — RxNorm + OpenFDA proxy:
- **Actions:** `autocomplete` (RxNorm approximateTerm search), `details` (OpenFDA drug label lookup; searches by RxCUI first, falls back to 3-tier name search: `extractIngredient()` strips dosage/form from RxNorm names, then tries exact-quoted brand/generic match → unquoted flexible match → substance_name search; logs `[FDA]` for genuinely missing drugs), `interactions` (RxNorm interaction list for multiple RxCUIs)
- **Rate limited:** 40 requests/minute per user (in-memory sliding window)
- **Cached:** In-memory 30-minute TTL, max 500 entries
- **Client service:** `src/services/drugs.js` — `drugAutocomplete(query)`, `drugDetails(query, name?)`, `drugInteractions(rxcuis[])`

**`api/provider.js`** — NPPES NPI Registry proxy:
- **Actions:** `search` (by name, optional state filter), `lookup` (by 10-digit NPI number)
- **Rate limited:** 30 requests/minute per user
- **Cached:** In-memory 1-hour TTL, max 500 entries
- **Client service:** `src/services/npi.js` — `searchProviders(name, state?)`, `lookupNPI(npi)`
- Parses NPI results into `{npi, name, credential, specialty, address, phone, fax, organization}` format

**`src/utils/maps.js`** — Google Maps URL helper:
- `mapsUrl(address)` returns `https://www.google.com/maps/search/?api=1&query=<encoded>` — no API key needed
- Used in Providers (address + clinic), Appointments (location), Medications (pharmacy)

**`src/constants/labRanges.js`** — Reference range lookup:
- Static table of ~80 common lab tests with low/high/unit reference ranges
- `findLabRange(testName)` fuzzy-matches lab names and returns range object
- Used in Labs.jsx to auto-show reference ranges when user hasn't entered one

**AI features using this proxy:**
1. **Dashboard insight** - one-shot health tip based on full profile
2. **Health connections** - cross-analysis of meds, conditions, vitals patterns
3. **Health news** - web-search-powered recent medical news for user's conditions
4. **Disability resources** - web-search-powered programs/benefits finder
5. **AI chat panel** - multi-turn conversation with health context as system prompt
6. **Lab interpretation** - contextual explanation of abnormal lab results using patient profile
7. **Vitals trend analysis** - analyzes last 20 vitals readings for trend direction, patterns, and correlations with conditions/meds
8. **Appointment preparation** - generates personalized questions based on provider specialty, active conditions, recent vitals/labs, and journal
9. **Care gap suggestions** - analyzes profile against clinical guidelines (USPSTF, CDC) to suggest missing preventive screenings
10. **Journal pattern recognition** - identifies recurring symptoms, mood-severity correlations, triggers across journal entries
11. **Immunization schedule review** - checks immunization records against CDC/ACIP schedules, flags overdue boosters and contraindications
12. **Appeal letter drafting** - generates professional appeal letters using patient health profile and appeal details
13. **Medication cross-reactivity** - AI analysis of drug-class relationships when adding meds with known allergies (e.g., penicillin→cephalosporin)

### Vercel Configuration

```json
{
  "functions": {
    "api/chat.js": { "maxDuration": 120 },
    "api/drug.js": { "maxDuration": 30 },
    "api/provider.js": { "maxDuration": 30 }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'; manifest-src 'self'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "geolocation=(), microphone=(), camera=(), payment=()" }
      ]
    }
  ]
}
```

### Security

| Layer | Mechanism |
|-------|----------|
| **Database** | Row Level Security on all tables, scoped to `auth.uid()` |
| **API** | Auth token verified server-side; CORS restricted to allowlisted origins; rate limited 20 req/min per user |
| **API Timeouts** | `chat.js`: 115s AbortController timeout; `drug.js`/`provider.js`: 15s `fetchWithTimeout()` for external calls |
| **Client → Server** | HTTPS via Vercel; Bearer token required (fails early if missing); shared token cache with concurrent-call dedup (`token.js`) |
| **Cache at rest** | AES-GCM encrypted localStorage using PBKDF2-derived key from auth token |
| **Exports at rest** | Optional passphrase-encrypted backups (AES-GCM + PBKDF2) |
| **AI data sharing** | Requires explicit user consent via `AIConsentGate` before any data sent to Anthropic; revocable in Settings |
| **AI prompt safety** | `profile.js` sanitizes all user-provided text (strips `<>{}`, truncates to 500 chars) before embedding in AI prompts |
| **HTTP headers** | CSP (no unsafe-inline/eval in script-src), X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy |
| **Stale chunk recovery** | `lazyWithRetry()` wrapper catches chunk load failures from stale deploys; one-time `sessionStorage`-guarded page reload fetches updated assets |
| **Import safety** | `importRestore()` creates in-memory backup before erasing; auto-restores on failure |
| **Offline sync** | `setupOfflineSync()` wired up in App.jsx; flushes pending writes when connectivity returns |
| **Data erase** | `eraseAll()` runs sequential per-table deletes with error handling; throws on partial failure |
| **Secrets** | `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-only; never exposed to client |
| **Resilient loading** | `loadAll()` uses `Promise.allSettled()` — individual table failures return empty defaults instead of crashing the app |

### Accessibility (WCAG 2.1 Level A)

| Feature | Implementation |
|---------|---------------|
| **ARIA labels** | All icon-only and text-only action buttons (edit/delete/send/drug-info) have descriptive `aria-label` attributes across all 19 section files |
| **Color-only indicators** | Severity, urgency, status, and lab flag badges include icon prefixes (✓/◆/⚠/✦/·/↗) so information is not conveyed through color alone (WCAG 1.4.1) |
| **Semantic HTML** | `<nav>` for BottomNav, `<header>` for Header, `<main>` for content area, `<section>` with `aria-label` for Dashboard cards, `<article>` for AIPanel chat messages |
| **Form labels** | `Field.jsx` associates `<label htmlFor>` with `<input id>` using React `useId()` for guaranteed uniqueness; supports `error` prop for red inline error messages |
| **Keyboard support** | `ConfirmBar` responds to Escape (cancel) and Enter (confirm); `role="alertdialog"` for screen readers |
| **Chart accessibility** | Vitals chart has `role="img"` with descriptive `aria-label` + visually-hidden (`sr-only`) data table alternative |
| **Loading states** | `LoadingSpinner` uses `role="status"` + `aria-live="polite"` with `sr-only` fallback text |
| **Decorative elements** | `Motif.jsx` SVGs have `aria-hidden="true"`; Divider uses gradient glow |
| **Hover interactions** | Cards lift with lavender glow; buttons have shimmer sweep; quick-access tiles scale with conic gradient; nav items hover-lift with radial glow; timeline rows slide-right on hover |
| **Autocomplete ARIA** | Drug and NPI autocomplete dropdowns use `role="listbox"` / `role="option"` with `aria-label` |
| **Error announcements** | Autocomplete errors use `role="alert"` for screen reader announcement |

## Design System

### Color Palette

The app uses a warm, calming aesthetic. Preserve these exact colors:

```
bg:       #1a1a2e    (deep navy background)
card:     #22223a    (card surface)
card2:    #2a2a44    (elevated card / input bg)
border:   #33335a    (subtle borders)
border2:  #3d3d66    (stronger borders)
text:     #e8e4f0    (primary text)
textMid:  #a8a4b8    (secondary text)
textFaint:#6e6a80    (disabled/hint text)
lav:      #b8a9e8    (lavender accent - primary)
lavDim:   #9888cc    (lavender muted)
sage:     #8fbfa0    (sage green - secondary)
sageDim:  #6a9978    (sage muted)
amber:    #e8c88a    (warm amber - tertiary)
amberDim: #c4a060    (amber muted)
rose:     #e88a9a    (rose - alerts/warnings)
roseDim:  #cc6878    (rose muted)
```

Map these to Tailwind custom colors in `tailwind.config.js` under `theme.extend.colors.salve`.

### Typography

- **Headings:** Playfair Display (serif), 400/600/700 weight
- **Body:** Montserrat, 300-600 weight
- Import via Google Fonts in `index.css`

### Layout

- Max width 480px, centered (mobile-first, phone-optimized)
- Bottom navigation with 6 tabs: Home, Meds, Vitals, Insight (AI), Journal, Settings
- "made with love for my best friend & soulmate" tagline above bottom nav — scroll-reveal (hidden until user scrolls to bottom, transparent background, 500ms fade-in transition)
- Magical UI effects: card hover lift + lavender glow, button shimmer sweep, quick-access tile rotating conic gradient, nav item radial glow, gradient-shift greeting text, badge shimmer, field focus glow ring, section-enter fade-slide-up animations
- Dashboard uses "Calm Intelligence" design philosophy — shows only actionable info, not data counts
- Dashboard sections: contextual greeting → consolidated alerts → AI insight → unified timeline → journal preview → quick access grid (6 primary + expandable "More")
- Quick Access primary 6: Conditions, Providers, Allergies, Appointments, Labs, Insurance; "More" expander reveals 8 additional sections
- Quick Access expanded/collapsed state persists in `localStorage` under `salve:dash-more`
- All section views (19 total) have a back arrow in the header that returns to Dashboard
- Staggered entrance animations on Dashboard cards (`dash-stagger` CSS classes)
- `ErrorBoundary` wraps all section renders — crashes show friendly fallback, not white screen

## Key Design Decisions

1. **Preserve the visual design precisely.** The warm dark theme with lavender/sage/amber accents is intentional and personal. When converting inline styles to Tailwind, match colors and spacing exactly.
2. **Every inline style `style={{...}}` becomes Tailwind classes.** Use arbitrary values `[#1a1a2e]` for custom colors only if the color isn't mapped in the config. All palette colors should be mapped.
3. **The drug interaction database is static and ships client-side** as a baseline. Additionally, the Interactions view can fetch **live interactions from NLM RxNorm** when medications have linked RxCUI values.
4. **AI features must include medical disclaimers.** Every AI response surface shows "AI suggestions are not medical advice. Always consult your healthcare providers." This is non-negotiable. The disclaimer is appended in `ai.js`.
8. **AI features require explicit data-sharing consent.** `AIConsentGate` wraps all AI surfaces (AIPanel, Dashboard insight). Users must acknowledge that health data is sent to Anthropic before any AI call is made. Consent is stored in `localStorage` under `salve:ai-consent` and can be revoked in Settings.
5. **Delete operations require confirmation.** The `useConfirmDelete` hook and `ConfirmBar` component provide inline confirm/cancel UI. No `window.confirm()` calls.
6. **Settings save on field change** (no explicit save button). Each field calls `updateSettings({ key: value })` which writes to Supabase immediately.
7. **Profile fields** now include: name, location, pharmacy, insurance (plan/id/group/phone), health_background, ai_mode.

## Testing Checklist

- [ ] Auth: session expiry shows "Your session expired. Please sign in again." banner on re-auth screen
- [ ] Auth: OTP countdown shows "Code expires in X:XX"; turns red at <60 seconds; shows expired state
- [ ] Auth: Sign-in button disabled and shows "Code expired" after OTP expiry; auto-submit blocked
- [ ] Sections load lazily (Suspense fallback spinner shown on first navigation to each section)
- [ ] Service worker registered in production build (PWA installable)
- [ ] App works offline for cached data (service worker cache-first for static assets)
- [ ] Auth: magic link sends, sign-in works, session persists
- [ ] All 20 sections render without errors (including Auth screen)
- [ ] Data persists across sessions (Supabase)
- [ ] Add/edit/delete works for: meds, conditions, allergies, providers, vitals, appointments, journal entries, labs, procedures, immunizations, care gaps, anesthesia flags, appeals, surgical planning, insurance
- [ ] Delete confirmation appears and can be cancelled
- [ ] Drug interaction checker flags known combos
- [ ] Dashboard: contextual greeting shows correct time-of-day message
- Dashboard: alerts consolidate into single card (anesthesia + interactions + care gaps + abnormal labs)
- [ ] Dashboard: AI insight hidden when no consent; shimmer when loading; quote-style when loaded
- [ ] Dashboard: unified timeline shows appointments and refills sorted by date
- [ ] Dashboard: Quick Access shows 6 primary tiles; "More" expands to reveal all
- [ ] Dashboard: entrance animations stagger correctly without layout shift
- [ ] Dashboard: "More" expanded state persists across page loads
- [ ] AI insight loads on dashboard (with /api/chat proxy + auth token)
- [ ] AI chat panel sends/receives messages
- [ ] AI chat: copy button appears on assistant responses (copies text to clipboard)
- [ ] AI news and resources features work (web search)
- [ ] AI results: ResultHeader shows feature icon + label + copy button for each feature
- [ ] AI results: Insight shows lavender accent card with left border
- [ ] AI results: Connections splits into section cards with sage accent and stagger animation
- [ ] AI results: News shows per-story amber accent cards + SourcesBadges
- [ ] AI results: Resources shows rose accordion sections with accent bars + SourcesBadges
- [ ] AI results: Disclaimer renders as styled component (not raw markdown)
- [ ] Settings: all profile fields save correctly
- [ ] Erase All Data clears Supabase data and reloads
- [ ] Download Backup exports valid JSON with all data
- [ ] Encrypted backup: passphrase encrypts, downloads `.json` with `_encrypted` envelope
- [ ] Encrypted import: detects encrypted file, prompts passphrase, decrypts, then validates
- [ ] Wrong passphrase shows error, does not import
- [ ] Import Restore overwrites data and reloads
- [ ] Import Merge adds new records, skips existing
- [ ] Import rejects non-JSON, non-Salve, and empty files
- [ ] Bottom nav switches between all tabs
- [ ] All 20 sections reachable via Quick Access (6 primary + 9 in More expander + 5 in bottom nav)
- [ ] Back button returns to Dashboard from any section
- [ ] Layout is correct at 375px width (iPhone SE) and 480px width
- [ ] Fonts load (Playfair Display for headings, Montserrat for body)
- [ ] Vercel deployment works with all env vars
- [ ] Sign-out works and returns to auth screen
- [ ] AI consent gate appears on first AI use (AIPanel or Dashboard insight)
- [ ] AI consent can be revoked in Settings
- [ ] After revoking, AI features show consent gate again
- [ ] localStorage cache (`hc:cache`) is encrypted (not readable plaintext JSON)
- [ ] ErrorBoundary catches section crashes and shows fallback with Go Home button
- [ ] No console errors in production build

### Pharmacy & QoL Cross-Reference Tests
- [ ] Pharmacies: CRUD works (add, edit, delete with confirmation)
- [ ] Pharmacies: preferred toggle sets/unsets star badge
- [ ] Pharmacies: filter tabs work (All, Preferred, With Meds)
- [ ] Pharmacies: expanded card shows Maps link, phone link, website link, hours
- [ ] Pharmacies: medication count badge shows correct count of active meds at that pharmacy
- [ ] Pharmacies: expanded card lists medications with doses and refill dates
- [ ] Pharmacies: upcoming refills badge shows count
- [ ] Medications: pharmacy picker dropdown shows saved pharmacies (with ★ for preferred)
- [ ] Medications: "Type custom" option allows freetext pharmacy entry
- [ ] Medications: pharmacy filter pills appear when 2+ distinct pharmacies exist
- [ ] Medications: pharmacy filter correctly filters med list
- [ ] Conditions: provider picker dropdown shows saved providers with specialties
- [ ] Conditions: "Type custom" option allows freetext provider entry
- [ ] Conditions: collapsed card shows med count badge when related meds exist
- [ ] Conditions: expanded card lists active medications related to the condition
- [ ] Providers: collapsed card shows med count and condition count badges
- [ ] Providers: expanded card lists "Prescribed Medications" with doses
- [ ] Providers: expanded card lists "Conditions" with status
- [ ] Appointments: provider picker dropdown shows saved providers
- [ ] Appointments: selecting provider auto-fills location from provider address
- [ ] Appointments: upcoming card shows provider phone quick-link when available
- [ ] Dashboard: Pharmacies tile appears in "More sections" grid

### Medical API Integration Tests
- [ ] Medications: typing in name field triggers RxNorm autocomplete dropdown after 300ms debounce
- [ ] Medications: selecting autocomplete result stores name + rxcui
- [ ] Medications: display_name field is optional; when set, shows as primary title in card with official name as subtitle
- [ ] Medications: unlinked meds (no rxcui) show amber unlink indicator; linked meds show sage link indicator
- [ ] Medications: bulk "Link All" button appears when ≥1 active med has no rxcui; iterates drugAutocomplete per med
- [ ] Medications: bulk link shows progress ("Linking 2 of 5...") and result summary
- [ ] Medications: bulk link also fetches FDA data for each linked med (fda_data auto-populated)
- [ ] Medications: selecting autocomplete result auto-fetches FDA data in background, auto-suggests route and purpose
- [ ] Medications: "Enrich All" button appears when ≥1 linked med has no fda_data; fetches FDA label for each
- [ ] Medications: collapsed card shows drug class badge (sage) and boxed warning badge (rose) when fda_data present
- [ ] Medications: expanded card shows inline FDA summary (generic/brand, class, manufacturer, boxed warning indicator)
- [ ] Medications: expanded card shows "Fetch drug info" link for linked meds missing fda_data
- [ ] Medications: "Drug Info" button fetches and displays FDA label data (generic, brand, class, warnings, side effects)
- [ ] Medications: pharmacy name links to Google Maps
- [ ] Providers: NPI Lookup button triggers NPPES search and shows dropdown
- [ ] Providers: selecting NPI result auto-populates name, specialty, clinic, phone, fax, NPI, address
- [ ] Providers: address in expanded card links to Google Maps; fallback uses clinic name
- [ ] Providers: NPI number links to CMS NPPES registry (`npiregistry.cms.hhs.gov/provider-view/{NPI}`)
- [ ] Appointments: location field in upcoming/past cards links to Google Maps
- [ ] Interactions: meds with rxcui show ✓ indicator in active meds list
- [ ] Interactions: "Check NLM Interactions" button appears when 2+ meds have rxcui
- [ ] Interactions: live NLM results display with source attribution above local results
- [ ] Labs: reference range auto-displays from labRanges.js when no manual range entered
- [ ] Labs: "(standard)" label distinguishes auto-ranges from user-entered ranges

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel env vars | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel env vars | Supabase anonymous/public key |
| `ANTHROPIC_API_KEY` | Vercel env vars only | Proxied to Anthropic API |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars only | Server-side auth token verification |
| `SUPABASE_URL` | Vercel env vars (fallback) | Fallback for api/chat.js if VITE_ prefix not available server-side |
| `ALLOWED_ORIGIN` | Vercel env vars (optional) | Custom allowed CORS origin for api/chat.js (e.g. your production domain) |

## Reference Docs

| Document | Purpose |
|----------|---------|
| `docs/PRODUCTION_AUDIT.md` | Full production-readiness audit: security fixes, data integrity issues, AI underutilization, UX gaps per section, accessibility, PWA/performance, implementation priority checklist |
| `docs/IMPORT_IMPLEMENTATION.md` | Import/export/merge implementation guide |
| `docs/MIGRATION_PLAN.md` | Migration planning notes |

## Commands

```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run preview      # Preview production build locally
vercel --prod        # Deploy to production
```
