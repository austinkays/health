# Salve - Health Companion App

## Project Overview

Personal health management app. Originally a Claude.ai React artifact (~2000+ line monolithic JSX), now a standalone Vite + React + Tailwind app with Supabase backend, deployed on Vercel.

**Live deployment target:** Vercel
**Auth:** Supabase magic-link email auth (multi-user capable)
**Storage:** Supabase PostgreSQL (with localStorage offline cache fallback)

## Tech Stack

- **Framework:** Vite + React 18
- **Styling:** Tailwind CSS v3
- **Charts:** Recharts
- **Icons:** lucide-react
- **Fonts:** Google Fonts - Playfair Display (headings), Montserrat (body)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Auth:** Supabase Auth (magic link / OTP email)
- **Offline cache:** localStorage (AES-GCM encrypted via `cache.js` + `crypto.js`)
- **AI Backend:** Vercel serverless function proxying Anthropic API (auth-gated)
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
│   └── places.js                 # Vercel serverless: auth-gated Google Places API proxy
├── public/
│   ├── manifest.json             # PWA manifest
│   └── favicon.svg
├── docs/
│   └── IMPORT_IMPLEMENTATION.md  # Import/export/merge implementation guide
├── supabase/
│   └── migrations/
│       └── 001_schema.sql        # Full DB schema: profiles, meds, conditions, etc.
├── src/
│   ├── main.jsx                  # Entry point, mount App
│   ├── index.css                 # Tailwind directives + Google Fonts import + custom utilities
│   ├── App.jsx                   # Auth gate, session management, router shell, view switching
│   ├── constants/
│   │   ├── colors.js             # Color palette (C object) as Tailwind-compatible tokens
│   │   ├── interactions.js       # Drug interaction database (static, client-side)
│   │   └── defaults.js           # Default data shapes, empty states, vital types, moods
│   ├── services/
│   │   ├── supabase.js           # Supabase client init (from VITE_SUPABASE_URL/ANON_KEY)
│   │   ├── auth.js               # signIn (magic link), signOut, getSession, onAuthChange
│   │   ├── db.js                 # Generic CRUD factory + table-specific services + loadAll + eraseAll
│   │   ├── cache.js              # Encrypted offline localStorage cache + pending write queue + sync
│   │   ├── crypto.js             # AES-GCM encrypt/decrypt + PBKDF2 key derivation for cache & exports
│   │   ├── ai.js                 # Anthropic API calls via /api/chat proxy (auth-gated, requires consent)
│   │   ├── storage.js            # Import/export: exportAll, encryptExport, decryptExport, validateImport, importRestore, importMerge
│   │   ├── profile.js            # buildProfile() - assembles health context for AI prompts
│   │   ├── google.js             # Google Places API client (via /api/places proxy) — provider & pharmacy search
│   │   ├── drugs.js              # RxNorm drug autocomplete + openFDA recalls (direct, no key needed)
│   │   └── health-info.js        # MedlinePlus Connect health topic info (direct, no key needed)
│   ├── hooks/
│   │   ├── useHealthData.js      # Main data hook: load from Supabase, CRUD operations, state mgmt, reloadData
│   │   └── useConfirmDelete.js   # Delete confirmation state management
│   ├── components/
│   │   ├── Auth.jsx              # Magic link sign-in screen
│   │   ├── ui/                   # Shared primitives
│   │   │   ├── Card.jsx
│   │   │   ├── Button.jsx
│   │   │   ├── Field.jsx         # Label + input/textarea/select
│   │   │   ├── Badge.jsx
│   │   │   ├── SearchDropdown.jsx # Reusable debounced search-as-you-type dropdown
│   │   │   ├── ConfirmBar.jsx    # Inline delete confirmation
│   │   │   ├── EmptyState.jsx
│   │   │   ├── FormWrap.jsx      # Back-arrow + title wrapper; also exports SectionTitle
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── AIConsentGate.jsx  # AI data-sharing consent gate + hasAIConsent/revokeAIConsent
│   │   │   └── Motif.jsx         # Decorative sparkle/moon/leaf SVG motifs
│   │   ├── layout/
│   │   │   ├── Header.jsx
│   │   │   └── BottomNav.jsx
│   │   └── sections/             # One file per app section
│   │       ├── Dashboard.jsx     # Home: greeting, quick stats, AI insight, interaction alerts
│   │       ├── Medications.jsx   # Med list + add/edit form
│   │       ├── Vitals.jsx        # Vitals tracking + chart
│   │       ├── Conditions.jsx    # Condition list + add/edit
│   │       ├── Providers.jsx     # Provider directory + add/edit
│   │       ├── Allergies.jsx     # Allergy list + add/edit
│   │       ├── Appointments.jsx  # Upcoming/past visits + add/edit
│   │       ├── Journal.jsx       # Health journal entries + add/edit
│   │       ├── Interactions.jsx  # Drug interaction checker (standalone view)
│   │       ├── AIPanel.jsx       # AI chat panel with health context
│   │       └── Settings.jsx      # Profile, AI mode, pharmacy, insurance, health bg, data mgmt, import/export
│   └── utils/
│       ├── uid.js                # ID generator (legacy, Supabase uses gen_random_uuid())
│       ├── dates.js              # Date formatting helpers
│       └── interactions.js       # checkInteractions() logic
```

### Database (Supabase)

PostgreSQL via Supabase with Row Level Security on all tables. Schema in `supabase/migrations/001_schema.sql`.

**Tables:**

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `profiles` | id (= auth.users.id), name, location, pharmacy, insurance_*, health_background, ai_mode | 1:1 with user, auto-created on signup via trigger |
| `medications` | name, dose, frequency, route, prescriber, pharmacy, purpose, start_date, refill_date, active, notes | |
| `conditions` | name, diagnosed_date, status (active/managed/remission/resolved), provider, linked_meds, notes | |
| `allergies` | substance, reaction, severity (mild/moderate/severe), notes | |
| `providers` | name, specialty, clinic, phone, fax, portal_url, notes | |
| `vitals` | date, type (pain/mood/energy/sleep/bp/hr/weight/temp/glucose), value, value2, unit, notes | |
| `appointments` | date, time, provider, location, reason, questions, post_notes | |
| `journal_entries` | date, title, mood, severity, content, tags | |
| `ai_conversations` | title, messages (JSONB) | |

All tables have `user_id` FK (except profiles which uses `id`), `created_at`, `updated_at` (auto-trigger), and RLS policies scoped to `auth.uid()`. Realtime enabled for cross-device sync.

The `db.js` service provides a generic CRUD factory: `list()`, `add()`, `update()`, `remove()` per table, plus `db.loadAll()` for initial hydration and `db.eraseAll()` to wipe user data.

### Import / Export

`storage.js` provides data portability via the Settings UI:
- **Download Backup** — exports all current Supabase data as a JSON file with `_export` metadata envelope
- **Download Encrypted Backup** — same as above but AES-GCM encrypted with a user-supplied passphrase (`encryptExport()`)
- **Import Restore** — erases all data, then bulk-inserts from the uploaded file (full overwrite)
- **Import Merge** — adds only records whose ID doesn't already exist (sync mode, triggered by `_export.type: "mcp-sync"`)
- **Encrypted Import** — detects `_encrypted` envelope, prompts for passphrase, decrypts via `decryptExport()`, then proceeds with normal validation
- Supports Salve v1 export format, legacy `ambers-remedy` format, and localStorage v2/v3 formats
- After merge, `useHealthData.reloadData()` re-fetches from Supabase to update React state

### Auth Flow

- `Auth.jsx` renders a magic-link email sign-in form
- `auth.js` wraps Supabase auth: `signIn(email)` sends OTP, `signOut()`, `getSession()`, `onAuthChange()`
- `App.jsx` manages session state, handles OAuth code exchange from URL params, gates the app behind auth
- Unauthenticated users see the sign-in screen; authenticated users see the full app

### Offline Cache

`cache.js` provides an **encrypted** localStorage-based read cache and offline write queue:
- On successful Supabase fetch, data is AES-GCM encrypted using a key derived (PBKDF2) from the user's auth token and cached to `hc:cache`
- `cache.setToken(token)` must be called with the session access token before read/write; `cache.clearToken()` on sign-out
- `read()` and `write()` are async (use `crypto.subtle`)
- When offline, pending writes queue to `hc:pending` (operation metadata only, no PHI)
- `setupOfflineSync()` flushes the pending queue when connectivity returns
- `crypto.js` provides `encrypt()`, `decrypt()`, and `clearKeyCache()` used by both cache and export encryption

### API Proxy

`api/chat.js` is a Vercel serverless function:
- **Verifies Supabase auth token** via `Authorization: Bearer <token>` header
- Validates token against Supabase Auth API using `SUPABASE_SERVICE_ROLE_KEY`
- **CORS restricted** to allowlisted origins: `VERCEL_URL`, `ALLOWED_ORIGIN` env var, and `localhost:5173` (dev)
- Accepts POST with `{ messages, system, max_tokens?, use_web_search? }`
- Forwards to `https://api.anthropic.com/v1/messages` with model `claude-sonnet-4-20250514`
- Optionally includes Anthropic web search tool when `use_web_search` is true
- Returns the response JSON
- 120-second timeout configured in vercel.json
- Client-side (`ai.js`) **fails early** if no auth token — never sends unauthenticated requests

**AI features using this proxy:**
1. **Dashboard insight** - one-shot health tip based on full profile
2. **Health connections** - cross-analysis of meds, conditions, vitals patterns
3. **Health news** - web-search-powered recent medical news for user's conditions
4. **Disability resources** - web-search-powered programs/benefits finder
5. **AI chat panel** - multi-turn conversation with health context as system prompt

### Vercel Configuration

```json
{
  "functions": {
    "api/chat.js": {
      "maxDuration": 120
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'none'; object-src 'none'; base-uri 'self'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### Security

| Layer | Mechanism |
|-------|----------|
| **Database** | Row Level Security on all tables, scoped to `auth.uid()` |
| **API** | Auth token verified server-side; CORS restricted to allowlisted origins |
| **Client → Server** | HTTPS via Vercel; Bearer token required (fails early if missing) |
| **Cache at rest** | AES-GCM encrypted localStorage using PBKDF2-derived key from auth token |
| **Exports at rest** | Optional passphrase-encrypted backups (AES-GCM + PBKDF2) |
| **AI data sharing** | Requires explicit user consent via `AIConsentGate` before any data sent to Anthropic; revocable in Settings |
| **HTTP headers** | CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy |
| **Secrets** | `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-only; never exposed to client |

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
- Bottom navigation with 6 tabs: Dashboard, Meds, Vitals, Journal, AI, Quick Access
- Quick Access is a grid menu linking to: Conditions, Providers, Allergies, Appointments, Interactions, Settings
- All section views have a back arrow in the header that returns to Dashboard

## Key Design Decisions

1. **Preserve the visual design precisely.** The warm dark theme with lavender/sage/amber accents is intentional and personal. When converting inline styles to Tailwind, match colors and spacing exactly.
2. **Every inline style `style={{...}}` becomes Tailwind classes.** Use arbitrary values `[#1a1a2e]` for custom colors only if the color isn't mapped in the config. All palette colors should be mapped.
3. **The drug interaction database has two layers.** Static rules in `interactions.js` provide instant local checking. `checkInteractionsEnhanced()` supplements with real-time RxNorm API data, merging both sources. The static rules are always available offline as a fallback.
4. **AI features must include medical disclaimers.** Every AI response surface shows "AI suggestions are not medical advice. Always consult your healthcare providers." This is non-negotiable. The disclaimer is appended in `ai.js`.
8. **AI features require explicit data-sharing consent.** `AIConsentGate` wraps all AI surfaces (AIPanel, Dashboard insight). Users must acknowledge that health data is sent to Anthropic before any AI call is made. Consent is stored in `localStorage` under `salve:ai-consent` and can be revoked in Settings.
5. **Delete operations require confirmation.** The `useConfirmDelete` hook and `ConfirmBar` component provide inline confirm/cancel UI. No `window.confirm()` calls.
6. **Settings save on field change** (no explicit save button). Each field calls `updateSettings({ key: value })` which writes to Supabase immediately.
7. **Profile fields** now include: name, location, pharmacy, insurance (plan/id/group/phone), health_background, ai_mode.

## Testing Checklist

- [ ] Auth: magic link sends, sign-in works, session persists
- [ ] All 11 sections render without errors (including Auth screen)
- [ ] Data persists across sessions (Supabase)
- [ ] Add/edit/delete works for: meds, conditions, allergies, providers, vitals, appointments, journal entries
- [ ] Delete confirmation appears and can be cancelled
- [ ] Drug interaction checker flags known combos
- [ ] AI insight loads on dashboard (with /api/chat proxy + auth token)
- [ ] AI chat panel sends/receives messages
- [ ] AI news and resources features work (web search)
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
- [ ] Quick Access grid links to all subsections
- [ ] Back button returns to Dashboard from any section
- [ ] Layout is correct at 375px width (iPhone SE) and 480px width
- [ ] Fonts load (Playfair Display for headings, Montserrat for body)
- [ ] Vercel deployment works with all env vars
- [ ] Sign-out works and returns to auth screen
- [ ] AI consent gate appears on first AI use (AIPanel or Dashboard insight)
- [ ] AI consent can be revoked in Settings
- [ ] After revoking, AI features show consent gate again
- [ ] localStorage cache (`hc:cache`) is encrypted (not readable plaintext JSON)
- [ ] No console errors in production build

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel env vars | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel env vars | Supabase anonymous/public key |
| `ANTHROPIC_API_KEY` | Vercel env vars only | Proxied to Anthropic API |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars only | Server-side auth token verification |
| `SUPABASE_URL` | Vercel env vars (fallback) | Fallback for api/chat.js if VITE_ prefix not available server-side |
| `ALLOWED_ORIGIN` | Vercel env vars (optional) | Custom allowed CORS origin for api/chat.js (e.g. your production domain) |
| `GOOGLE_PLACES_API_KEY` | Vercel env vars only | Google Places API key for provider/pharmacy search (server-side proxy) |

## Commands

```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run preview      # Preview production build locally
vercel --prod        # Deploy to production
```
