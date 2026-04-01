W# Salve - Health Companion App

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
│   ├── drug.js                   # Vercel serverless: RxNorm + OpenFDA + NADAC proxy (autocomplete, details, interactions, price)
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
│       ├── 008_pharmacies_table.sql          # Pharmacies table with preferred flag, hours, website
│       ├── 009_allergy_type.sql               # Add type column to allergies (medication/food/environmental/etc)
│       ├── 010_appointment_video_url.sql      # Add video_call_url to appointments for telehealth
│       ├── 011_drug_prices.sql                # Drug prices table for NADAC price snapshots
│       └── 012_insurance_claims.sql           # Insurance claims tracking with amounts and status
├── src/
│   ├── main.jsx                  # Entry point, mount App
│   ├── index.css                 # Tailwind directives + Google Fonts import + custom utilities + magical hover/glow/shimmer effects + highlight-ring animation + no-scrollbar utility + expand-section CSS grid animation + toast-enter animation
│   ├── App.jsx                   # Auth gate, session management, router shell (<main> wrapper), view switching, ErrorBoundary wrapper, lazyWithRetry chunk recovery, section-enter animations, highlightId deep-link state, onNav(tab, opts) extended navigation, ToastProvider wrapper, toast-wrapped CRUD
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
│   │   ├── drugs.js              # Client service: drugAutocomplete, drugDetails, drugInteractions, drugPrice (via /api/drug, 429-aware)
│   │   ├── npi.js                # Client service: searchProviders, lookupNPI (via /api/provider, 429-aware)
│   │   ├── storage.js            # Import/export: exportAll, encryptExport, decryptExport, validateImport, importRestore, importMerge
│   │   └── profile.js            # buildProfile() - assembles comprehensive health context for AI prompts (sanitized against prompt injection; configurable san() char limits; includes ALL medical data: full FDA drug details, providers, upcoming appointments + questions, recent appointment notes, pharmacies, insurance claims, NADAC pricing + monthly cost summary + mechanism of action)
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
│   │   │   ├── Motif.jsx         # Decorative sparkle/moon/leaf SVG motifs (aria-hidden)
│   │   │   └── Toast.jsx         # Toast notification system (ToastProvider context + useToast hook)
│   │   ├── layout/
│   │   │   ├── Header.jsx        # Semantic <header>, aria-label on back button, search icon button (all pages)
│   │   │   └── BottomNav.jsx     # Semantic <nav>, aria-current on active tab, scroll-reveal "made with love" tagline (Home page only, requires scroll), nav item hover glow
│   │   └── sections/             # One file per app section (21 total)
│   │       ├── Dashboard.jsx     # Home: contextual greeting, live search centerpiece (animated gradient border, rotating placeholders, inline results with stagger animation, "See all" deep-link), consolidated alerts (interactions, anesthesia, care gaps, abnormal labs, price increases, severe allergies), AI insight, appointment prep nudge (48hr), unified timeline, customizable 6+More quick access
│   │       ├── Search.jsx        # Full search view: debounced client-side search across all 16 entity types, filter pills, highlighted match text, deep-link navigation to specific records (uses shared utils from search.jsx)
│   │       ├── Medications.jsx   # Med list + add/edit + display_name + RxNorm autocomplete + OpenFDA drug info + NLM link status flags + bulk RxCUI linking + bulk FDA enrichment (reports failed med names) + auto-enrich on link + maps links (skips non-physical like OTC/N/A) + pharmacy picker + pharmacy filter (excludes non-physical) + GoodRx price links + NADAC price lookup + price sparklines + price history + bulk price check + compare prices (Cost Plus, Amazon, Blink) + interaction warnings on add + expandable per-section FDA details with Show more/less toggles (side effects, dosing, contraindications, drug interactions, precautions, pregnancy, overdosage, storage) + stripFdaHeader() removes redundant section titles + NADAC price + Generic/Brand badge on cards + monthly wholesale cost estimate + mechanism of action display
│   │       ├── Vitals.jsx        # Vitals tracking + chart with reference ranges + abnormal flags
│   │       ├── Conditions.jsx    # Condition list + add/edit + status filter tabs + provider picker + cross-referenced medications + ClinicalTrials.gov links
│   │       ├── Providers.jsx     # Provider directory + NPI registry search + CMS registry links + maps links + phone/portal links + cross-referenced meds & conditions
│   │       ├── Allergies.jsx     # Allergy list + add/edit + type categorization (medication/food/environmental/etc)
│   │       ├── Appointments.jsx  # Upcoming/past visits + add/edit + location maps links + provider picker + auto-fill location + provider phone quick-link + video call links + Google Calendar links
│   │       ├── Journal.jsx       # Health journal entries + add/edit + tag filter pills
│   │       ├── Interactions.jsx  # Drug interaction checker (static + live NLM RxNorm)
│   │       ├── Pharmacies.jsx    # Pharmacy directory + auto-discovers pharmacies from medications + preferred flag + hours/website + meds per pharmacy + upcoming refills + pharmacy filter + "Save & Add Details" promote flow for discovered pharmacies
│   │       ├── AIPanel.jsx       # AI Insight panel: rich card-based results with accent borders (insight=lavender, connections=sage, news=amber, resources=rose, costs=sage); ResultHeader with icon badge + copy-to-clipboard; InsightResult, ConnectionsResult, NewsResult (per-story parsing with headline/body/source extraction, inline article source links, bookmark/save toggle per story via localStorage `salve:saved-news`, preamble filtering in splitSections, unbookmark confirmation), ResourcesResult, CostResult; chat with per-message copy buttons + persistence (load/save/new chat); SourcesBadges collapsible source list for web search; styled Disclaimer component; "What AI Sees" preview button at bottom of main menu; Saved News collapsible section on main menu (shows bookmarked stories with headlines, truncated body, source links, saved date, remove button with confirmation)
│   │       ├── Labs.jsx          # Lab results + flag-based filtering + AI interpretation + auto reference ranges
│   │       ├── Procedures.jsx    # Medical procedures + outcome tracking
│   │       ├── Immunizations.jsx # Vaccination records
│   │       ├── CareGaps.jsx      # Preventive care gaps + urgency sorting
│   │       ├── AnesthesiaFlags.jsx # Anesthesia safety alerts
│   │       ├── Appeals.jsx       # Insurance appeals & disputes + deadline countdown badges
│   │       ├── SurgicalPlanning.jsx # Pre/post-surgical planning
│   │       ├── Insurance.jsx     # Insurance details + benefits + claims tracking (Plans/Claims tabs, running totals)
│   │       ├── HealthSummary.jsx  # Full health profile summary view
│   │       └── Settings.jsx      # Profile, AI mode, pharmacy, insurance, health bg, data mgmt, import/export, Claude sync artifact download
│   └── utils/
│       ├── uid.js                # ID generator (legacy, Supabase uses gen_random_uuid())
│       ├── dates.js              # Date formatting helpers
│       ├── interactions.js       # checkInteractions() logic
│       ├── links.js              # URL generators: dailyMedUrl (direct setid link or cleaned name search), medlinePlusUrl, cdcVaccineUrl, npiRegistryUrl, providerLookupUrl (NPI → registry, else Google with specialty+clinic), googleCalendarUrl, goodRxUrl, clinicalTrialsUrl, costPlusDrugsUrl, amazonPharmacyUrl, blinkHealthUrl
│       ├── maps.js               # mapsUrl(address) → Google Maps search URL
│       └── search.jsx            # Shared search logic: ENTITY_CONFIG, searchEntities(), highlightMatch(), FILTER_TABS, MORE_CATEGORIES
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
| `allergies` | substance, reaction, severity (mild/moderate/severe), type (medication/food/environmental/latex/dye/insect/other), notes | |
| `providers` | name, specialty, clinic, phone, fax, portal_url, notes, npi, address | npi links to NPPES registry; address enables maps |
| `vitals` | date, type (pain/mood/energy/sleep/bp/hr/weight/temp/glucose), value, value2, unit, notes | |
| `appointments` | date, time, provider, location, reason, questions, post_notes, video_call_url | |
| `journal_entries` | date, title, mood, severity, content, tags | |
| `ai_conversations` | title, messages (JSONB) | |
| `drug_prices` | medication_id, rxcui, ndc, nadac_per_unit, pricing_unit, drug_name, effective_date, as_of_date, classification, fetched_at | NADAC price snapshots for medications |
| `insurance_claims` | date, provider, description, billed_amount, allowed_amount, paid_amount, patient_responsibility, status (submitted/processing/paid/denied/appealed), claim_number, insurance_plan, notes | Tracks individual insurance claims with amounts |

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
- All 21 section components are **code-split** with `lazyWithRetry()` (wraps `React.lazy()`) + `Suspense` — only loaded when first visited; on chunk load failure (stale deploy), does a one-time `sessionStorage`-guarded page reload to fetch updated chunks

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

**`api/drug.js`** — RxNorm + OpenFDA + NADAC proxy:
- **Actions:** `autocomplete` (RxNorm approximateTerm search), `details` (OpenFDA drug label lookup; searches by RxCUI first, falls back to 3-tier name search: `extractIngredient()` strips dosage/form from RxNorm names, then tries exact-quoted brand/generic match → unquoted flexible match → substance_name search; logs `[FDA]` for genuinely missing drugs; `formatLabel()` captures 22+ fields including spl_set_id, pharm_class_moa, pharm_class_pe, dosage_form, precautions, overdosage, storage, effective_time), `interactions` (RxNorm interaction list for multiple RxCUIs), `price` (RxCUI → NDCs via RxNorm → NADAC DKAN API lookup for cheapest per-unit price)
- **NADAC pipeline:** `rxcuiToNDCs(rxcui)` → normalize to 11-digit → parallel `nadacLookup(ndc)` queries (up to 5 NDCs) → return cheapest `nadac_per_unit` with all prices
- **NADAC API:** CMS Medicaid DKAN endpoint at `data.medicaid.gov/api/1/datastore/query/{dataset-id}/0` (dataset ID stored as constant for annual rotation)
- **Rate limited:** 40 requests/minute per user (in-memory sliding window)
- **Cached:** In-memory 30-minute TTL, max 500 entries
- **Client service:** `src/services/drugs.js` — `drugAutocomplete(query)`, `drugDetails(query, name?)`, `drugInteractions(rxcuis[])`, `drugPrice(rxcui)`

**`api/provider.js`** — NPPES NPI Registry proxy:
- **Actions:** `search` (by name, optional state filter), `lookup` (by 10-digit NPI number)
- **Rate limited:** 30 requests/minute per user
- **Cached:** In-memory 1-hour TTL, max 500 entries
- **Client service:** `src/services/npi.js` — `searchProviders(name, state?)`, `lookupNPI(npi)`
- Parses NPI results into `{npi, name, first_name, last_name, credential, specialty, other_specialties, address, phone, fax, organization, enumeration_type}` format

**`src/utils/maps.js`** — Google Maps URL helper:
- `mapsUrl(address)` returns `https://www.google.com/maps/search/?api=1&query=<encoded>` — no API key needed
- Used in Providers (address + clinic), Appointments (location), Medications (pharmacy — skipped for non-physical values like OTC, N/A, none, self)

**`src/constants/labRanges.js`** — Reference range lookup:
- Static table of ~80 common lab tests with low/high/unit reference ranges
- `findLabRange(testName)` fuzzy-matches lab names and returns range object
- Used in Labs.jsx to auto-show reference ranges when user hasn't entered one

**AI features using this proxy:**
1. **Dashboard insight** - one-shot health tip based on full profile
2. **Health connections** - cross-analysis of meds, conditions, vitals patterns
3. **Health news** - web-search-powered recent medical news for user's conditions (3-5 sentence summaries, per-story inline source links, no preamble, bookmark/save per story)
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
14. **Cost optimization** - web-search-powered analysis of medication costs with generic alternatives, PAPs, discount programs, and savings strategies

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
| **AI prompt safety** | `profile.js` sanitizes all user-provided text (strips `<>{}`, configurable char limits via `san(text, limit)` — default 500, up to 1000 for FDA data) before embedding in AI prompts |
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
- "made with love for my best friend & soulmate" tagline above bottom nav — Home page only, scroll-reveal (hidden until user scrolls past 50px to bottom, resets on tab change, transparent background, 500ms fade-in transition)
- Magical UI effects: card hover lift + lavender glow, button shimmer sweep, quick-access tile rotating conic gradient, nav item radial glow, gradient-shift greeting text, badge shimmer, field focus glow ring, section-enter fade-slide-up animations
- Dashboard uses "Calm Intelligence" design philosophy — shows only actionable info, not data counts
- Dashboard sections: contextual greeting → live search centerpiece → consolidated alerts (dismissible, fully hidden when dismissed) → AI insight → appointment prep nudge (48hr) → unified timeline → journal preview → quick access grid (6 primary + expandable "More")
- Quick Access default 6: Summary, Conditions, Providers, Allergies, Appointments, Labs; "More" expander reveals remaining sections
- Quick Access tiles are **user-customizable**: Edit button (pencil icon) enters edit mode → tap a tile to select it → bottom sheet shows available replacements → tap replacement to swap → Done button saves. Persisted in `localStorage` under `salve:dash-primary` (array of 6 IDs). Falls back to `DEFAULT_PRIMARY_IDS` if corrupt/missing.
- Quick Access expanded/collapsed state persists in `localStorage` under `salve:dash-more`
- All section views have a back arrow in the header that returns to Dashboard
- **Global Search:** Header magnifying glass icon (visible on all pages) opens the Search view; Dashboard has a live search centerpiece with inline results (up to 5) and "See all" deep-link to full Search view
- **Deep-link navigation:** `onNav(tab, { highlightId })` navigates to a section AND auto-expands + scrolls to a specific record; used by Search results. All 15 expandable sections support `highlightId` prop (expand + scrollIntoView + lavender pulse animation). Appointments and AnesthesiaFlags support scroll-only deep-link (no expandable cards).
- **highlight-ring animation:** `highlight-pulse` keyframes in `index.css` — 1.5s lavender box-shadow pulse applied to deep-linked cards
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
- [ ] Dashboard: Quick Access Edit button enters edit mode with dashed borders and swap icons
- [ ] Dashboard: Tapping a tile in edit mode selects it (lavender ring) and shows replacement bottom sheet
- [ ] Dashboard: Selecting a replacement swaps the tile and persists to localStorage
- [ ] Dashboard: Done button exits edit mode; "More sections" hidden during editing
- [ ] Dashboard: Quick Access customization survives page reload (localStorage `salve:dash-primary`)
- [ ] Dashboard: Corrupt/missing localStorage falls back to default 6 tiles
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
- [ ] AI results: News stories have 3-5 sentence summaries (not 1-2 sentence teasers)
- [ ] AI results: News preamble text is filtered out (no "I'll search..." card)
- [ ] AI results: News per-story inline source link with "Read full article" shows at bottom
- [ ] AI results: News bookmark icon toggles saved state (filled amber = saved)
- [ ] AI results: News saved stories persist in localStorage under `salve:saved-news`
- [ ] AI results: Saved News collapsible section appears on AI main menu when stories are saved
- [ ] AI results: Removing bookmark from saved news view removes the story
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
- [ ] All 20 sections reachable via Quick Access (6 primary + 10 in More expander + 5 in bottom nav)
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

### Global Search & Deep-Link Tests
- [ ] Search: Header magnifying glass icon opens Search view from any page
- [ ] Search: Dashboard live search centerpiece shows inline results after typing 2+ chars
- [ ] Search: Input auto-focuses on open
- [ ] Search: Results appear after typing 2+ characters with 150ms debounce
- [ ] Search: All 16 entity types are searchable
- [ ] Search: Filter pills narrow results to selected entity type
- [ ] Search: Match text is highlighted in results
- [ ] Search: Tapping a result navigates to the section AND expands + scrolls to the specific record
- [ ] Search: Deep-linked card shows lavender pulse animation (highlight-ring)
- [ ] Search: Back button from deep-linked section returns to previous view
- [ ] Search: Empty query shows placeholder with searchable categories
- [ ] Search: No results shows empty state message

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
- [ ] Medications: DailyMed link uses direct `drugInfo.cfm?setid=` URL when spl_set_id available
- [ ] Medications: DailyMed fallback search strips dosage, forms, and parentheticals from drug name
- [ ] Medications: DailyMed never searches by numeric RxCUI
- [ ] Medications: "Enrich All" button appears when ≥1 linked med has no fda_data; fetches FDA label for each
- [ ] Medications: collapsed card shows drug class badge (sage) and boxed warning badge (rose) when fda_data present
- [ ] Medications: DailyMed link uses brand/generic name from FDA data (not raw RxNorm name with dosage)
- [ ] Medications: expanded card shows inline FDA summary (generic/brand, class, manufacturer, mechanism of action, boxed warning text, indications)
- [ ] Medications: expanded card shows "Fetch drug info" link for linked meds missing fda_data
- [ ] Medications: "More drug details" toggle reveals side effects, dosing, contraindications, drug interactions, precautions, pregnancy, overdosage, storage (each with per-section Show more/Show less expand toggles)
- [ ] Medications: FDA detail text has redundant section headers stripped (e.g. "ADVERSE REACTIONS" not duplicated)
- [ ] Medications: NADAC price shown with Generic/Brand badge on expanded cards
- [ ] Medications: monthly wholesale cost estimate displayed above medication list
- [ ] Medications: pharmacy name links to Google Maps (skipped for OTC, N/A, none, self, etc.)
- [ ] Medications: pharmacy filter excludes non-physical pharmacy values
- [ ] Providers: NPI Lookup button triggers NPPES search and shows dropdown
- [ ] Providers: selecting NPI result auto-populates name, specialty, clinic, phone, fax, NPI, address
- [ ] Providers: address in expanded card links to Google Maps; fallback uses clinic name
- [ ] Providers: NPI number links to CMS NPPES registry (`npiregistry.cms.hhs.gov/provider-view/{NPI}`)
- [ ] Providers: non-NPI provider links use Google search with specialty + clinic name for specificity
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

## Roadmap — Amber's Top 3 Feature Requests

### 1. DNA / Promethease / Genomind Integration

**Goal:** Import pharmacogenomic (PGx) and genetic health data so the AI can factor gene variants into medication analysis, flag drug-gene interactions, and surface genetic predispositions alongside conditions.

**Data Sources:**
- **Promethease** — SNP analysis reports from raw genetic data (23andMe, AncestryDNA, etc.). Users download reports as JSON or HTML.
- **Genomind PGx** — Pharmacogenomic test results showing how the patient metabolizes specific drug classes (CYP2D6, CYP2C19, CYP3A4, etc.). PDF reports with gene-drug tables.
- **Genomind MentalHealthMap** — Genetic determinants for mood, stress, sleep, focus, substance use. PDF reports.

**Implementation Plan:**

| Phase | Work | Details |
|-------|------|---------|
| **Schema** | New `genetic_results` table | `user_id`, `source` (promethease/genomind/23andme/other), `test_date`, `gene`, `variant` (rsID or star allele), `result` (e.g. *1/*2, AG), `phenotype` (poor/intermediate/normal/rapid/ultrarapid metabolizer), `affected_drugs` (JSONB array), `category` (pharmacogenomic/health/wellness), `raw_data` (JSONB), `notes` | RLS scoped to user |
| **Import: Promethease** | Parse Promethease JSON export | Extract SNP entries (`rsid`, `genotype`, `magnitude`, `summary`). Map high-magnitude SNPs to pharmacogenomic categories. Flag clinically relevant variants (CYP450 enzymes, MTHFR, COMT, VKORC1, HLA-B, etc.) |
| **Import: Genomind** | Parse Genomind PDF or manual entry | OCR/manual entry of gene-drug table. Each row = gene + result + affected medications + metabolizer status. Genomind PGx covers ~24 genes across psychiatric, cardiology, pain meds |
| **Import: Raw DNA** | Parse 23andMe/AncestryDNA raw data files | Tab-separated `rsid \t chromosome \t position \t genotype`. Cross-reference against a curated pharmacogenomic SNP table (PharmGKB public data) to extract clinically relevant variants |
| **Medications cross-ref** | Drug-gene interaction warnings | When viewing a medication, check `genetic_results` for relevant CYP enzyme metabolizer status. Show badge: "⚡ CYP2D6 Poor Metabolizer — may need dose adjustment" on affected meds. Use FDA Table of Pharmacogenomic Biomarkers in Drug Labeling as reference |
| **AI Profile** | Add genetics to `buildProfile()` | Include metabolizer phenotypes, high-risk variants, gene-drug conflicts in AI context. AI can flag: "Patient is CYP2D6 poor metabolizer — current dose of tramadol may have elevated effect" |
| **New section: Genetics** | UI for viewing/managing genetic data | Filter by category (PGx/Health/Wellness), gene cards with variant + phenotype + affected drugs, import button, link to source reports |
| **Dashboard alerts** | Genetic interaction warnings | Add to consolidated alerts: medications prescribed that conflict with known metabolizer status |

**Key Technical Decisions:**
- Import via file upload (JSON/TSV/PDF) in Settings, NOT via third-party API (Promethease and Genomind don't offer patient-facing APIs)
- PharmGKB clinical annotations (public domain) as the drug-gene reference database — ship as static JSON like `interactions.js`
- PDF parsing for Genomind: explore client-side `pdf.js` extraction; fallback to manual structured entry form
- Genetic data included in encrypted exports/imports
- AI disclaimers must be even stronger for genetic interpretations: "Genetic information requires professional interpretation. Discuss with your healthcare provider or genetic counselor."

---

### 2. Flo Period & Fertility Tracker Integration

**Goal:** Track menstrual cycles, symptoms, and fertility windows alongside other health data so the AI can correlate cycle phases with symptoms, medication effects, mood patterns, and energy levels.

**Data Sources:**
- **Flo app** — Exports cycle data (period dates, flow intensity, symptoms, ovulation predictions). Export format: typically JSON or CSV from Flo's data export feature (GDPR "Download My Data" request).
- **Manual entry** — Direct logging of period dates, flow, symptoms, fertility markers (BBT, cervical mucus, OPKs).

**Implementation Plan:**

| Phase | Work | Details |
|-------|------|---------|
| **Schema** | New `cycles` table | `user_id`, `date`, `type` (period/ovulation/symptom/fertility_marker), `value` (flow: light/medium/heavy/spotting; OPK: positive/negative; BBT: temperature), `symptom` (cramps/bloating/headache/fatigue/breast_tenderness/acne/mood_swing/nausea/backache/insomnia), `notes` | RLS scoped to user |
| **Import: Flo** | Parse Flo GDPR data export | Flo's "Download My Data" produces a ZIP with JSON files: `cycles.json` (period start/end dates, flow levels), `symptoms.json` (daily symptom logs), `ovulation.json` (predicted fertile windows). Map to `cycles` table format |
| **New section: Cycle Tracker** | Full cycle tracking UI | Calendar view showing period days (rose), fertile window (amber), ovulation (sage). Log flow intensity, symptoms, fertility markers. Cycle history with average length calculation. Current cycle day indicator |
| **Predictions** | Client-side cycle predictions | Calculate average cycle length from history (last 6 cycles). Predict next period start, fertile window (5 days before + ovulation day), luteal phase. Show countdown on Dashboard |
| **Vitals correlation** | Link cycles to existing vitals | Auto-tag vitals entries (mood, energy, pain, sleep) with cycle phase (menstrual/follicular/ovulatory/luteal). Enable "color by cycle phase" toggle on Vitals chart |
| **Journal correlation** | Cycle phase context in journal | Show current cycle day/phase badge on journal entries. AI pattern recognition can correlate journal mood/symptoms with cycle phases |
| **AI Profile** | Add cycle data to `buildProfile()` | Include: current cycle day, average cycle length, last period date, common cycle-related symptoms, upcoming predicted period. AI can flag: "Fatigue pattern correlates with luteal phase days 20-28" |
| **Medication interactions** | Cycle-aware med reminders | Flag medications affected by hormonal fluctuations. Note birth control in cycle context. AI awareness of HRT, hormonal medications, supplements (iron during heavy flow, etc.) |
| **Dashboard integration** | Cycle status on Dashboard | Timeline entry for predicted period. Alert for late period. Quick-log button for period start |

**Key Technical Decisions:**
- Calendar UI: build with CSS grid (not a heavy calendar library) to match existing minimal-dependency approach
- Cycle predictions: simple average-based algorithm, NOT a medical-grade fertility predictor. Clear disclaimer: "Cycle predictions are estimates based on your history. Not reliable for contraception or fertility planning."
- Flo import via GDPR data export (user requests from Flo app → receives ZIP → uploads to Salve)
- Sensitive data: cycle data encrypted at rest like all other health data. Included in backup exports.
- Search integration: cycle entries searchable (symptoms, dates, notes)

---

### 3. Apple Health Integration

**Goal:** Import health data from Apple Health (steps, heart rate, sleep, workouts, medications, lab results, vitals) to consolidate all health tracking in one place with AI analysis.

**Data Sources:**
- **Apple Health Export** — iOS Settings → Health → Export All Health Data → ZIP file containing `export.xml` (CDA format) with all HealthKit data types.
- **Apple Shortcuts bridge** — An iOS Shortcut that queries HealthKit and sends data to Salve's import endpoint.

**Implementation Plan:**

| Phase | Work | Details |
|-------|------|---------|
| **Import: XML Export** | Parse Apple Health `export.xml` | Apple Health exports a large XML file with `<Record>` elements. Each record has `type` (e.g. `HKQuantityTypeIdentifierHeartRate`), `value`, `unit`, `startDate`, `endDate`, `sourceName`. Parse with streaming XML parser (client-side, `DOMParser` or chunked) to handle large files (can be 100MB+) |
| **Type mapping** | Map HealthKit types to Salve tables | `HKQuantityTypeIdentifierHeartRate` → vitals (hr), `HKQuantityTypeIdentifierBloodPressureSystolic/Diastolic` → vitals (bp), `HKQuantityTypeIdentifierBodyMass` → vitals (weight), `HKQuantityTypeIdentifierBodyTemperature` → vitals (temp), `HKQuantityTypeIdentifierBloodGlucose` → vitals (glucose), `HKCategoryTypeIdentifierSleepAnalysis` → vitals (sleep), `HKQuantityTypeIdentifierStepCount` → new vitals type (steps), `HKWorkoutTypeIdentifier` → new activities table, `HKClinicalTypeIdentifierLabResultRecord` → labs (FHIR R4 format) |
| **Data aggregation** | Summarize high-frequency data | Apple Watch records heart rate every few minutes → aggregate to daily min/avg/max/resting. Steps → daily totals. Sleep → daily duration. Workouts → individual entries. Avoids flooding Supabase with millions of rows |
| **Schema additions** | New vitals types + activities table | Add `steps` and `active_energy` to VITAL_TYPES in `defaults.js`. New `activities` table: `user_id`, `date`, `type` (walk/run/cycle/swim/yoga/strength/etc.), `duration_minutes`, `distance`, `calories`, `heart_rate_avg`, `source`, `notes` |
| **Apple Shortcuts bridge** | iOS Shortcut for periodic sync | Build a downloadable iOS Shortcut (like `salve-sync.jsx` pattern) that: queries HealthKit for last 7 days of data → formats as Salve-compatible JSON → POSTs to user's Salve import endpoint or copies to clipboard for paste-import. Avoids the bulk XML export for regular syncing |
| **Import UI** | Apple Health import in Settings | "Import from Apple Health" button → file picker for `export.xml` or `export.zip` → progress bar (large file parsing) → preview of data to import (record counts by type) → confirm → merge import (additive, skip duplicates by date+type+value) |
| **Vitals enrichment** | Richer vitals with Apple data | Steps chart, activity history, resting heart rate trends, sleep duration tracking. All feed into existing Vitals section with new chart types |
| **AI Profile** | Add Apple Health data to `buildProfile()` | Include: average daily steps (7-day), average resting heart rate, sleep duration trends, recent workouts, activity level assessment. AI can correlate: "Sleep duration dropped to 4.5hr avg this week — coincides with increased pain scores" |
| **Dashboard integration** | Activity summary on Dashboard | Daily step count, last workout, sleep score in timeline or quick stats. Activity streak tracking |

**Key Technical Decisions:**
- PWA limitation: no direct HealthKit API access (requires native iOS app). Two workarounds: (1) XML export file import, (2) iOS Shortcuts bridge for lighter periodic sync
- XML parsing: must handle large files (50-200MB). Use streaming/chunked parsing, NOT `DOMParser` on the full file. Consider Web Workers for background parsing to avoid UI freeze
- Data aggregation is critical — Apple Watch generates thousands of data points per day. Store daily summaries, not raw readings
- Duplicate detection: match on `date + type + value` to prevent re-importing same data
- Apple Shortcuts: distribute as `.shortcut` file downloadable from Settings (similar to existing Claude sync artifact in `public/salve-sync.jsx`)
- Clinical records (FHIR R4): Apple Health can store lab results from participating health systems. These use FHIR format — parse into Salve's labs table with proper unit mapping
- Large import = progress indicator + Web Worker + cancelable
