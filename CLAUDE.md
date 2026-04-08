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
- **Fonts:** Google Fonts - per-theme heading font (Fraunces / Playfair Display / Instrument Serif / Space Grotesk), Montserrat (body universally)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Auth:** Supabase Auth (magic link / OTP email; session expiry detection; OTP 10-min countdown)
- **Offline cache:** localStorage (AES-GCM encrypted via `cache.js` + `crypto.js`)
- **AI Backend:** Tiered provider system — Gemini (free tier) + Anthropic Claude (premium tier) via Vercel serverless proxies; smart model routing per feature complexity
- **Medical APIs:** RxNorm (NLM drug data), OpenFDA (drug labels), NPPES (NPI provider registry) — all via Vercel serverless proxies
- **Wearables:** Oura Ring V2 API (OAuth2, daily temperature → BBT for cycle tracking) — via Vercel serverless proxy
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
│   ├── _prompts.js               # Server-side prompt allowlist: PROMPTS object (19 prompt keys), buildSystemPrompt(key, profileText, opts), isValidPromptKey(), sanProfile() sanitizer, TOOLS_ADDENDUM constant — clients send prompt_key not raw system prompts
│   ├── _rateLimit.js             # Shared: persistent rate limiting (Supabase check_rate_limit) + usage logging (api_usage table)
│   ├── chat.js                   # Vercel serverless: auth-gated Anthropic API proxy (premium tier only — checks profiles.tier); server-side prompt construction via _prompts.js (raw system only for admin tier)
│   ├── gemini.js                 # Vercel serverless: Gemini API proxy with full Anthropic↔Gemini format translation (free tier); server-side prompt construction via _prompts.js
│   ├── lemon-checkout.js         # Vercel serverless: creates Lemon Squeezy hosted checkout session (auth-gated, returns {url})
│   ├── lemon-webhook.js          # Vercel serverless: Lemon Squeezy subscription lifecycle webhook (HMAC-SHA256 verified; sets profiles.tier)
│   ├── drug.js                   # Vercel serverless: RxNorm + OpenFDA + NADAC proxy (autocomplete, details, interactions, price)
│   ├── oura.js                   # Vercel serverless: Oura Ring V2 API proxy (OAuth2 token exchange/refresh, temperature/sleep/readiness data, config)
│   ├── provider.js               # Vercel serverless: NPPES NPI registry proxy (search, lookup)
│   └── delete-account.js         # Vercel serverless: account deletion endpoint (auth-gated, cascading delete)
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── favicon.svg
│   └── salve-sync.jsx            # Claude artifact for MCP health data sync into Salve (directive header instructs Claude.ai to auto-render)
├── docs/
│   ├── IMPORT_IMPLEMENTATION.md  # Import/export/merge implementation guide
│   ├── MIGRATION_PLAN.md         # Migration planning notes
│   └── superpowers/specs/        # Design specs for upcoming features
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
│       ├── 012_insurance_claims.sql           # Insurance claims tracking with amounts and status
│       ├── 015_cycles.sql                     # Cycle tracking: period, ovulation, symptom, fertility_marker entries with RLS
│       ├── 016_activities.sql                 # Activities/workouts table for Apple Health import with RLS
│       ├── 017_genetic_results.sql            # Pharmacogenomic results table with RLS
│       ├── 018_api_usage.sql                  # API usage tracking table + check_rate_limit() SQL function
│       ├── 019_user_tier.sql                  # Add tier column (free/premium) to profiles
│       ├── 020_trial_expires_at.sql           # Add trial_expires_at to profiles for premium trial tracking
│       └── 021_feedback.sql                   # In-app user feedback table with RLS
├── src/
│   ├── main.jsx                  # Entry point, mount App
│   ├── index.css                 # Tailwind directives + Google Fonts import + CSS variable defaults for theme system (:root with RGB triplets) + all color references use CSS variables (rgb(var(--salve-*) / opacity)) + time-aware ambiance CSS variables (theme-adaptive) + magical hover/glow/shimmer effects + highlight-ring animation + no-scrollbar utility + expand-section CSS grid animation + toast-enter animation + wellness-fade animation + breathe meditation animation (10s cycle) + section-enter deblur transition + AI prose reveal stagger + celebration particle burst + ready-reveal shimmer + responsive desktop typography (14px base at md+) + print styles (hides nav/decorations, white bg, forces sections open, page breaks)
│   ├── App.jsx                   # Auth gate, session management, router shell (<main> wrapper), view switching, ErrorBoundary wrapper, lazyWithRetry chunk recovery, ThemeProvider wrapper, section-enter deblur animations, highlightId deep-link state, onNav(tab, opts) extended navigation with navHistory stack (back button returns to previous section instead of always Home, capped at 20 entries), ToastProvider wrapper, toast-wrapped CRUD (with celebration sparkle burst on success), time-aware ambiance hook (applies ambiance-morning/day/evening/night class to html element every 60s), sageOpen state + SagePopup render at app root, SideNav render for desktop sidebar, global keyboard shortcuts (Cmd/Ctrl+K → search, Escape → close Sage popup), responsive layout wrapper (md:ml-[220px] sidebar offset, md:max-w-[720px] lg:max-w-[960px] content column)
│   ├── constants/
│   │   ├── colors.js             # Color palette: Proxy C object that reads active theme's hex colors at access time (backward-compatible with all 28+ importers)
│   │   ├── themes.js             # Theme presets (single source of truth): 15 themes (6 core: lilac/noir/midnight/forest/dawnlight/sunrise + 9 experimental: aurora/neon/cherry/sunbeam/blaze/ember/galactic/prismatic/crystal). Each theme: 16 hex colors + ambiance RGB (4 periods) + gradient array (3 color keys) + optional experimental:true flag; hexToRgbTriplet() utility
│   │   ├── interactions.js       # Drug interaction database (static, client-side)
│   │   ├── labRanges.js          # Reference ranges for ~80 common lab tests + fuzzy matcher
│   │   ├── defaults.js           # Default data shapes, empty states, vital types, moods, EMPTY_CYCLE, FLOW_LEVELS, CYCLE_SYMPTOMS, CERVICAL_MUCUS_LEVELS (4-level: dry/sticky/creamy/eggwhite with fertility labels), FERTILITY_MARKERS
│   │   ├── pgx.js                # Pharmacogenomic drug-gene lookup: PGX_GENES, PHENOTYPES, PGX_INTERACTIONS (~40 gene-drug pairs), findPgxMatches()
│   │   ├── tools.js              # Anthropic tool definitions: HEALTH_TOOLS (27 tools incl add/remove cycle, todos, activity, genetic), DESTRUCTIVE_TOOLS set, TOOL_TABLE_MAP, RECORD_SUMMARIES
│   │   └── resources/
│   │       ├── index.js           # Resource registry: RESOURCES[], registerResources(), normalizeCondition(), matchResources(data) ranking utility
│   │       ├── everycure.js       # 10 active EveryCure drug repurposing programs (portfolio data, condition/medication tags, research stages)
│   │       └── understood.js      # 42 curated Understood.org articles tagged by condition/symptom/audience (ADHD, dyslexia, dyscalculia, dysgraphia, exec function, APD, anxiety, accommodations)
│   ├── services/
│   │   ├── supabase.js           # Supabase client init (from VITE_SUPABASE_URL/ANON_KEY)
│   │   ├── auth.js               # signIn (magic link), signOut, getSession, onAuthChange
│   │   ├── db.js                 # Generic CRUD factory + table-specific services + loadAll (allSettled) + eraseAll
│   │   ├── cache.js              # Encrypted offline localStorage cache + pending write queue + sync
│   │   ├── crypto.js             # AES-GCM encrypt/decrypt + PBKDF2 key derivation for cache & exports
│   │   ├── ai.js                 # Tiered AI service: provider routing (Gemini free / Anthropic premium via getAIProvider/setAIProvider), smart model selection per feature (getModel: lite/flash/pro tiers), feature gating (isFeatureLocked blocks Pro features on free tier), daily limit error handling; sendChatWithTools() agentic loop for tool-use data control (10 iteration cap); sends prompt_key + profile_text to server (not raw system prompts)
│   │   ├── token.js              # Shared auth token cache (5s TTL, concurrent-call dedup, clearTokenCache on sign-out)
│   │   ├── drugs.js              # Client service: drugAutocomplete, drugDetails, drugInteractions, drugPrice (via /api/drug, 429-aware)
│   │   ├── npi.js                # Client service: searchProviders, lookupNPI (via /api/provider, 429-aware)
│   │   ├── storage.js            # Import/export: exportAll, encryptExport, decryptExport, validateImport, importRestore, importMerge
│   │   ├── profile.js            # buildProfile() - assembles comprehensive health context for AI prompts (sanitized against prompt injection; configurable san() char limits; includes ALL medical data: full FDA drug details, providers, upcoming appointments + questions, recent appointment notes, pharmacies, insurance claims, NADAC pricing + monthly cost summary + mechanism of action + cycle stats)
│   │   ├── billing.js            # Lemon Squeezy client helpers: startCheckout() → POST /api/lemon-checkout → redirect to hosted checkout; openCustomerPortal() → LS billing portal
│   │   ├── toolExecutor.js       # AI tool execution engine: createToolExecutor() routes Anthropic tool_use calls to useHealthData CRUD (add/update/remove/search/list); input sanitization; record existence validation; validateToolInput() gates add/update with per-entity validation (vitals range checks, field length limits)
│   │   ├── healthkit.js           # Apple Health XML export parser: detectAppleHealthFormat(), parseAppleHealthExport() with chunked regex, **hourly bucketing for HR/SpO2/resp** (up to 24 records/day with `time: 'HH:00'` field) vs. daily for steps/sleep/weight/glucose/BP; workout + FHIR lab parsing, deduplicateAgainst(); DEDUP_KEYS includes time field
│   │   ├── flo.js                # Flo GDPR data export parser: detectFloFormat(), parseFloExport() → cycles table records; handles period date ranges, symptoms, ovulation; dedupes by date+type+value+symptom
│   │   └── oura.js               # Oura Ring integration: OAuth2 flow (getOuraAuthUrl, exchangeOuraCode), token storage (encrypted localStorage), auto-refresh, data fetching (temperature/sleep/readiness/spo2/stress/workouts via /api/oura proxy), temperature deviation→BBT conversion (ouraDeviationToBBT), syncAllOuraData() bulk sync (temperature→cycles BBT, sleep/HR/SpO2/readiness/stress→vitals, workouts→activities), manual entry override protection, per-data-type dedup
│   ├── hooks/
│   │   ├── useHealthData.js      # Main data hook: load from Supabase, CRUD operations, state mgmt, reloadData
│   │   ├── useConfirmDelete.js   # Delete confirmation state management
│   │   ├── useTheme.jsx          # Theme system: ThemeProvider (applies --salve-* color vars + --ambiance-* RGB + --salve-gradient-1/2/3 per-theme gradient stops to :root), useTheme() hook (themeId, setTheme, saveTheme, C, themes), getActiveC() standalone getter for non-React contexts
│   │   └── useWellnessMessage.js # Cycling wellness/mindfulness messages for AI loading states (60 messages, 10s interval, random no-repeat, fade animation)
│   ├── components/
│   │   ├── Auth.jsx              # Magic link / 8-digit OTP sign-in screen (expired-code guard on submit, brute-force protection with escalating cooldown: 3 attempts→30s, 5→120s, 7→300s)
│   │   ├── ui/                   # Shared primitives
│   │   │   ├── Card.jsx
│   │   │   ├── Button.jsx
│   │   │   ├── Field.jsx         # Label + input/textarea/select (htmlFor/id via React useId(); supports error prop, maxLength with char counter, hint, min/max)
│   │   │   ├── Badge.jsx
│   │   │   ├── ConfirmBar.jsx    # Inline delete confirmation (keyboard: Escape/Enter, role=alertdialog)
│   │   │   ├── EmptyState.jsx
│   │   │   ├── ErrorBoundary.jsx  # React error boundary with friendly fallback + Go Home
│   │   │   ├── FormWrap.jsx      # Back-arrow + title wrapper; also exports SectionTitle
│   │   │   ├── LoadingSpinner.jsx # role=status, aria-live=polite
│   │   │   ├── AIConsentGate.jsx  # AI data-sharing consent gate + hasAIConsent/revokeAIConsent
│   │   │   ├── AIMarkdown.jsx     # Markdown renderer for AI responses (react-markdown, auto-linkifies bare URLs); `reveal` prop wraps output in `.ai-prose-reveal` for paragraph-by-paragraph stagger animation
│   │   │   ├── AIProfilePreview.jsx # "What AI Sees" pill button + full-screen slide-up panel
│   │   │   ├── Motif.jsx         # Decorative sparkle/moon/leaf SVG motifs (aria-hidden)
│   │   │   ├── AppleHealthImport.jsx # Apple Health import UI: file picker (.xml/.zip) + drag-and-drop DropZone (desktop), progress bar, dedup preview, bulk insert, clipboard paste for iOS Shortcut
│   │   │   ├── Toast.jsx         # Toast notification system (ToastProvider context + useToast hook); celebration sparkle burst on success toasts (CelebrationBurst component with 6 radial Sparkles particles)
│   │   │   ├── DropZone.jsx      # Drag-and-drop file target for desktop: dashed border, hover/active states, click-to-browse fallback. Hidden on mobile (md:block) unless alwaysVisible. Used by Settings import, AppleHealthImport, CycleTracker Flo import
│   │   │   ├── OfflineBanner.jsx  # Persistent sticky banner when navigator.onLine is false; shows pending sync count from cache.js; auto-hides on reconnect
│   │   │   ├── SkeletonCard.jsx   # Shimmer loading skeleton cards (SkeletonCard + SkeletonList); replaces LoadingSpinner as Suspense fallback for code-split sections
│   │   │   └── SagePopup.jsx     # Bottom-sheet modal chat with Sage. Triggered by Leaf button in Header (mobile) or Ask Sage button in SideNav (desktop). Multi-turn chat via sendChat, consent-gated, auto-scroll, Enter-to-send. "Full chat" shortcut navigates to AI tab. Wider on desktop (md:max-w-[600px]), rounded corners on desktop. On desktop uses `md:pl-[260px]` on the outer wrapper so the dialog centers in the content area rather than the full viewport (accounting for 260px sidebar).
│   │   ├── layout/
│   │   │   ├── Header.jsx        # Semantic <header>, clean (no background decor), aria-labels on all buttons, Sage leaf-icon button on left (opens SagePopup via onSage callback), Search magnifying-glass button on right (all pages); "Hello, {name}" on Home uses theme-aware .text-gradient-magic; optional action prop for section-specific buttons; TAB_LABELS for all 27 sections. Desktop: back/search/sage buttons hidden at md+ (sidebar provides these), responsive font sizes
│   │   │   ├── BottomNav.jsx     # Semantic <nav>, aria-current on active tab, scroll-reveal "made with love" tagline (Home page only, requires scroll), nav item hover glow. Hidden on desktop (md:hidden) — SideNav takes over
│   │   │   ├── SideNav.jsx       # Desktop sidebar navigation (hidden md:flex, 260px fixed left). App branding + user name at top, Search button (full-width, standalone), 7 nav items (Home/Meds/Vitals/Sage/Scribe/Journal/Settings) with active left-border accent + background tint + dimmed number key hint (1–7) on inactive items for discoverability. Replaces BottomNav at md+ breakpoint
│   │   │   └── SplitView.jsx     # Desktop list/detail layout primitive + useIsDesktop() hook. Mobile: passes through list content (sections handle inline expand). Desktop (md+): side-by-side with scrollable list on left (360-420px, min-h-[300px]) and sticky detail pane on right. `detailKey` prop triggers `splitview-detail-enter` fade+slide animation (0.14s) when selection changes. Empty state shows themed icon + message instead of plain text. Used by Medications, Conditions, Labs, Providers
│   │   └── sections/             # One file per app section (28 total)
│   │       ├── Dashboard.jsx     # Home: contextual greeting + tagline, "Today at a glance" chips row (next appt, refills due this week, overdue todos), live search centerpiece (animated gradient border, rotating placeholders, inline results), Quick Navigation Hub (6 hub tiles: Records/Care Team/Tracking/Safety/Plans/Devices), Recent Vitals card + Activity snapshot side-by-side, Health Trends section (sleep bar chart + HR band chart + SpO2 chart), Getting Started tips (dismissible, data-aware, snooze/permanent per tip), unified timeline, Pinned shortcuts (user-starred). Desktop-only "made with love" tagline at bottom of page — scroll-reveal (fades in when scrolled past 80px AND near bottom, `hidden md:block`). Getting Started tips use `dismissBehavior` ('auto'/'snooze'/'permanent') stored as `[{id, permanent?, snoozedUntil?}]` in localStorage `salve:dismissed-tips` with migration from old string-array format; data-aware (add-meds/add-providers auto-hide when data exists); feedback tip removed as card → persistent footer button inside the tips section
│   │       ├── Search.jsx        # Full search view: debounced client-side search across all 16 entity types, filter pills, highlighted match text, deep-link navigation to specific records (uses shared utils from search.jsx)
│   │       ├── Medications.jsx   # Med list + add/edit + display_name + RxNorm autocomplete + OpenFDA drug info + NLM link status flags + bulk RxCUI linking + bulk FDA enrichment (reports failed med names) + auto-enrich on link + maps links (skips non-physical like OTC/N/A) + pharmacy picker + pharmacy filter (excludes non-physical) + GoodRx price links + NADAC price lookup + price sparklines + price history + bulk price check + compare prices (Cost Plus, Amazon, Blink) + interaction warnings on add + expandable per-section FDA details with Show more/less toggles (side effects, dosing, contraindications, drug interactions, precautions, pregnancy, overdosage, storage) + stripFdaHeader() removes redundant section titles + NADAC price + Generic/Brand badge on cards + monthly wholesale cost estimate + mechanism of action display + **Desktop SplitView**: list/detail side-by-side via SplitView + renderMedDetail() extracted function, lavender selection ring on active card
│   │       ├── Vitals.jsx        # Vitals tracking + chart with reference ranges + abnormal flags + source badges (Oura/Apple Health/Manual) + source filter pills
│   │       ├── Conditions.jsx    # Condition list + add/edit + status filter tabs + provider picker + cross-referenced medications + ClinicalTrials.gov links + per-condition "Resources & research" expandable section (EveryCure 🔬 research cards with disclaimer + Understood.org article links via matchResources) + **Desktop SplitView**: list/detail side-by-side via renderConditionDetail()
│   │       ├── Providers.jsx     # Provider directory + NPI registry search + CMS registry links + maps links + phone/portal links + cross-referenced meds & conditions + **Desktop SplitView**: list/detail side-by-side via renderProviderDetail()
│   │       ├── Allergies.jsx     # Allergy list + add/edit + type categorization (medication/food/environmental/etc)
│   │       ├── Appointments.jsx  # Upcoming/past visits + add/edit + location maps links + provider picker + auto-fill location + provider phone quick-link + video call links + Google Calendar links
│   │       ├── Journal.jsx       # Health journal entries + add/edit + tag filter pills
│   │       ├── Interactions.jsx  # Drug interaction checker (static + live NLM RxNorm)
│   │       ├── Pharmacies.jsx    # Pharmacy directory + auto-discovers pharmacies from medications + preferred flag + hours/website + meds per pharmacy + upcoming refills + pharmacy filter + "Save & Add Details" promote flow for discovered pharmacies
│   │       ├── AIPanel.jsx       # AI Insight panel: provider badge ("via Gemini"/"via Claude") on chat responses; premium feature gating with lock badges and upsell messages on Pro-tier features; daily limit error handling; rich card-based results with accent borders (insight=lavender, connections=sage, news=amber, resources=rose, costs=sage); ResultHeader with icon badge + copy-to-clipboard + save/bookmark button; InsightResult, ConnectionsResult, NewsResult (per-story parsing with headline/body/source extraction, inline article source links, bookmark/save toggle per story via localStorage `salve:saved-news`, preamble filtering in splitSections, unbookmark confirmation), ResourcesResult, CostResult; **universal save/bookmark** for all 5 result types via `useSavedInsights` hook (localStorage `salve:saved-insights`); SaveInsightButton in ResultHeader; SavedInsightsSection collapsible on main menu; chat with per-message copy buttons + persistence (load/save/new chat); SourcesBadges collapsible source list for web search; styled Disclaimer component; "What AI Sees" preview button at bottom of main menu; Saved News collapsible section on main menu; Saved Insights collapsible section on main menu; **FeatureLoading** breathe meditation loader (10s deep breathing cycle with star bloom 0.6→1.6x, expanding rings starting invisible, card glow pulse, "Breathe with me" + wellness messages); three-phase loading: loading→ready→revealed; "Your insight is ready" button with 2.5s fade-in + shimmer sweep; **AI prose reveal**: paragraphs fade in sequentially via `reveal` prop on AIMarkdown; ChatThinking with cycling wellness messages; **AI-powered data control**: chat uses Anthropic tool-use API to add/update/remove health records via natural language; ToolExecutionCard shows live status (pending/running/success/error/cancelled); destructive tools require inline Confirm/Cancel before execution; tool results persist in chat message history
│   │       ├── Labs.jsx          # Lab results + flag-based filtering + AI interpretation + auto reference ranges + **Desktop SplitView**: list/detail side-by-side via renderLabDetail()
│   │       ├── Procedures.jsx    # Medical procedures + outcome tracking
│   │       ├── Immunizations.jsx # Vaccination records
│   │       ├── CareGaps.jsx      # Preventive care gaps + urgency sorting
│   │       ├── AnesthesiaFlags.jsx # Anesthesia safety alerts
│   │       ├── Appeals.jsx       # Insurance appeals & disputes + deadline countdown badges
│   │       ├── SurgicalPlanning.jsx # Pre/post-surgical planning
│   │       ├── Insurance.jsx     # Insurance details + benefits + claims tracking (Plans/Claims tabs, running totals)
│   │       ├── CycleTracker.jsx  # Menstrual cycle tracking: CSS grid calendar with toggleable overlays (predicted period, fertile window, ovulation, symptoms, fertility % — all persisted in localStorage `salve:cycle-overlays`); fertility % shows per-day relative estimate with HPO axis zones (peak/fertile/buffer/relative/absolute); cervical mucus logging (4 clinical levels: dry/sticky/creamy/egg-white with inline fertility hints); BBT temperature logging (decimal °F input); detectBBTShift() confirms ovulation via 3-day sustained ≥0.3°F rise above prior 6 readings; buffer zones (2-day safety margin before fertile window); edge case alerts (short cycles <21 days, peak mucus detection, BBT shift confirmation/missing); stats card (current day, avg length, days until next); quick-log (tap calendar day); filter pills (all/period/mucus/BBT/symptoms/fertility); cycle phase detection; predictions (count-backward rule: avgLength - 14); Oura Ring sync button (syncs last 30 days of temperature data as BBT entries, respects manual override); Flo GDPR import with dedup; deep-link + highlight support
│   │       ├── Activities.jsx     # Workouts + daily activity: weekly summary stats, filter pills (All/Workouts/Daily), type-colored cards, duration/calories/distance/HR details, manual entry form, Apple Health import data home, source badges (Oura/Apple Health/Manual) + source filter pills
│   │       ├── OuraRing.jsx       # Dedicated Oura Ring page: live auto-updating data (auto-fetch on mount + 5min periodic sync), overview stat cards (sleep hrs, readiness score, resting HR, temp deviation), sleep stage breakdown bars (deep/REM/light/awake), readiness contributors grid, 7-day sleep + readiness history bar charts, trend indicators, manual sync button, settings link, green pulse dot for live sync status
│   │       ├── Genetics.jsx       # Pharmacogenomics: gene results with phenotype badges, affected drug cross-reference, auto-populated from pgx.js lookup, clipboard paste import, drug-gene conflict highlighting against current meds
│   │       ├── Todos.jsx          # Health to-do list: filter tabs (Active/All/Done/Overdue), priority badges (urgent=rose, high=amber, medium=lav, low=sage), due date countdown, complete toggle with strikethrough, recurring indicator, expandable cards, add/edit form, deep-link + highlight support
│   │       ├── HealthSummary.jsx  # Full health profile summary view + Print Summary button (desktop only, triggers window.print())
│   │       ├── FormHelper.jsx      # "Scribe" — AI-powered medical intake form filler: paste form questions, Sage generates first-person answers from health profile, per-answer copy buttons + Copy All, sensitive question detection (⚠ flags for self-harm/trauma/substance/relationship questions), AIConsentGate-wrapped, wellness messages during loading. Navigation: SideNav item on desktop (key 5), dedicated card on Dashboard mobile (hidden md:hidden on desktop)
│   │       ├── Feedback.jsx        # In-app feedback form: type selector pills (feedback/bug/suggestion), message textarea, submit with confirmation, previously submitted list with expand/delete
│   │       ├── Legal.jsx          # Privacy Policy, Terms of Service, HIPAA Notice (tabbed interface)
│   │       └── Settings.jsx      # Appearance (theme selector: Midnight/Ember/Dawnlight/Frost with color preview dots), AI Provider (Gemini free / Claude premium toggle), Profile, Sage mode, pharmacy, insurance, health bg, Oura Ring connection (OAuth2 connect/disconnect, BBT baseline config, manual sync), data mgmt, import/export, Claude sync artifact download + copyable prompt, Support section (Report a Bug → GitHub issues, Send Feedback → in-app Feedback section)
│   └── utils/
│       ├── uid.js                # ID generator (legacy, Supabase uses gen_random_uuid())
│       ├── dates.js              # Date formatting helpers
│       ├── interactions.js       # checkInteractions() logic
│       ├── links.js              # URL generators: dailyMedUrl (direct setid link or cleaned name search), medlinePlusUrl, cdcVaccineUrl, npiRegistryUrl, providerLookupUrl (NPI → registry, else Google with specialty+clinic), googleCalendarUrl, goodRxUrl, clinicalTrialsUrl, costPlusDrugsUrl, amazonPharmacyUrl, blinkHealthUrl
│       ├── maps.js               # mapsUrl(address) → Google Maps search URL
│       ├── cycles.js             # Cycle logic: computeCycleStats (period start detection, avg length), getCyclePhase, predictNextPeriod (count-backward rule), getDayOfCycle, getCyclePhaseForDate, estimateFertility (returns {pct, zone} with peak/fertile/buffer/relative/absolute zones based on HPO axis physiology), detectBBTShift (3-day sustained ≥0.3°F rise above 6-day baseline), getCycleAlerts (short cycle, peak mucus, BBT shift/missing)
│       ├── search.jsx            # Shared search logic: ENTITY_CONFIG, searchEntities(), highlightMatch(), FILTER_TABS, MORE_CATEGORIES
│       └── validate.js           # Per-entity form validators: validateField (generic), validateVital (VITAL_LIMITS per-type hard ranges), validateMedication, validateLab, getVitalWarning; used by Vitals/Meds/Labs forms + toolExecutor.js
```

### Database (Supabase)

PostgreSQL via Supabase with Row Level Security on all tables. Schema in `supabase/migrations/001_schema.sql`.

**Tables:**

| Table | Key Fields | Notes |
|-------|-----------|-------|
| `profiles` | id (= auth.users.id), name, location, pharmacy, insurance_*, health_background, ai_mode, tier (free/premium) | 1:1 with user, auto-created on signup via trigger; tier gates access to Anthropic Claude AI |
| `api_usage` | user_id, endpoint, tokens_in, tokens_out, created_at | API call tracking for rate limiting + analytics; check_rate_limit() SQL function for persistent rate limits |
│ `pharmacies` | name, address, phone, fax, hours, website, is_preferred, notes | Preferred pharmacy badge; cross-linked with medications |
| `medications` | name, display_name, dose, frequency, route, prescriber, pharmacy, purpose, start_date, refill_date, active, notes, rxcui, fda_data | rxcui links to RxNorm drug database; display_name is optional user-friendly casual name; fda_data (JSONB) stores OpenFDA label info (auto-populated on RxCUI link); pharmacy links to pharmacies table by name |
| `conditions` | name, diagnosed_date, status (active/managed/remission/resolved), provider, linked_meds, notes | |
| `allergies` | substance, reaction, severity (mild/moderate/severe), type (medication/food/environmental/latex/dye/insect/other), notes | |
| `providers` | name, specialty, clinic, phone, fax, portal_url, notes, npi, address | npi links to NPPES registry; address enables maps |
| `vitals` | date, time (nullable, 'HH:00' for hourly import records), type (pain/mood/energy/sleep/bp/hr/weight/temp/glucose/spo2/resp), value, value2, unit, notes | `time` column added in migration 022; HR/SpO2/resp from Apple Health stored as hourly buckets (up to 24/day); chart uses datetime x-axis when `time` present showing intraday curve; list collapses ≥3 same-type same-day entries to avg/min/max summary row |
| `appointments` | date, time, provider, location, reason, questions, post_notes, video_call_url | |
| `journal_entries` | date, title, mood, severity, content, tags | |
| `ai_conversations` | title, messages (JSONB) | |
| `drug_prices` | medication_id, rxcui, ndc, nadac_per_unit, pricing_unit, drug_name, effective_date, as_of_date, classification, fetched_at | NADAC price snapshots for medications |
| `insurance_claims` | date, provider, description, billed_amount, allowed_amount, paid_amount, patient_responsibility, status (submitted/processing/paid/denied/appealed), claim_number, insurance_plan, notes | Tracks individual insurance claims with amounts |
| `cycles` | date, type (period/ovulation/symptom/cervical_mucus/bbt/fertility_marker), value, symptom, notes | Menstrual cycle tracking; period flow levels, ovulation markers, cycle symptoms, cervical mucus (4 levels: dry/sticky/creamy/eggwhite), BBT temperature (decimal °F), other fertility markers (OPK, mittelschmerz) |
| `todos` | title, notes, due_date (nullable), priority (low/medium/high/urgent), category (custom/medication/appointment/follow_up/insurance/lab/research), completed, completed_at, recurring (none/daily/weekly/monthly), related_id, related_table, source (manual/ai_suggested), dismissed | Health to-do items with optional due dates, priorities, and cross-references. Dashboard alerts for overdue/urgent items. |
| `activities` | date, type, duration_minutes, distance, calories, heart_rate_avg, source, notes | Workout/exercise tracking from Apple Health import or manual entry. |
| `genetic_results` | source, gene, variant, phenotype, affected_drugs (JSONB), category, notes | Pharmacogenomic test results (CYP450 metabolizer status, HLA variants). Drug-gene badges on medication cards. |
| `feedback` | type (feedback/bug/suggestion), message | In-app user feedback submissions. Not included in data exports. |

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
- All 28 section components are **code-split** with `lazyWithRetry()` (wraps `React.lazy()`) + `Suspense` — only loaded when first visited; on chunk load failure (stale deploy), does a one-time `sessionStorage`-guarded page reload to fetch updated chunks

### Offline Cache

`cache.js` provides an **encrypted** localStorage-based read cache and offline write queue:
- On successful Supabase fetch, data is AES-GCM encrypted using a key derived (PBKDF2) from the user's auth token and cached to `hc:cache`
- `cache.setToken(token)` must be called with the session access token before read/write; `cache.clearToken()` on sign-out
- `read()` and `write()` are async (use `crypto.subtle`)
- When offline, pending writes queue to `hc:pending` (operation metadata only, no PHI)
- `setupOfflineSync()` is initialized in `App.jsx` on mount with a flush callback that replays pending operations through `db.js`; cleans up on unmount
- `crypto.js` provides `encrypt()`, `decrypt()`, and `clearKeyCache()` used by both cache and export encryption

**Settings sidecar (`hc:settings`)** — unencrypted plain JSON for non-PHI settings (name, ai_mode, etc.):
- `cache.readSettingsSync()` reads synchronously (no async/crypto) — used in `useHealthData` `useState` initializer so name/prefs are available before any network or decrypt call
- `cache.writeSettingsSync(settings)` is called inside `cache.write()` automatically whenever the encrypted cache is updated
- `cache.clear()` also removes the sidecar key
- Purpose: eliminates the flash where the Dashboard shows empty name/settings for several seconds on first render

**PBKDF2 key pre-warming** — `crypto.js` exports `prewarmKey(token)`:
- Called via `cache.prewarm()` in `App.jsx`'s `onAuthStateChange` handler immediately when a session arrives
- Starts the 100k-iteration PBKDF2 derivation in the background so the key is cached in memory by the time `useHealthData` calls `cache.read()`
- Without this, the first `cache.read()` call would block for ~200–500ms on the crypto work

**Auth init pattern** — `App.jsx` uses `onAuthStateChange` exclusively (no competing `getSession()` call):
- Supabase gotrue uses a storage lock; calling both `getSession()` and `onAuthStateChange` in React Strict Mode (double-mount) triggers a 5-second forced timeout
- The `INITIAL_SESSION` event from `onAuthStateChange` is sufficient; `getSession()` was removed

### AI API Proxies (Tiered Provider System)

The app uses a **tiered AI provider system** with smart model routing per feature complexity:

**Free tier (Gemini)** — `api/gemini.js`:
- Translates Anthropic-format requests ↔ Gemini API format (messages, tools, responses, web search)
- **Model routing:** `model` param from client selects: `gemini-2.0-flash-lite` (simple), `gemini-2.5-flash` (general), `gemini-2.5-pro-preview-06-05` (complex)
- **Rate limited:** 15 req/min per user (in-memory + persistent via `_rateLimit.js`)
- **Daily limit:** 10 calls/day per user (queries `api_usage` table, resets midnight PT — computed via `Intl.DateTimeFormat` parts, DST-safe)
- **Upstream error passthrough:** non-2xx Gemini responses (or responses with `error` body) are surfaced to the client with the real status code instead of being translated into a 200 "no response" message
- **API key transport:** Gemini key sent via `x-goog-api-key` header (not URL query string) to avoid exposure in server logs / CDN caches
- **Feature gating:** Pro-tier features (connections, care gaps, etc.) blocked client-side via `isFeatureLocked()`
- **Web search:** Gemini's `googleSearch` tool; grounding metadata translated to `web_search_tool_result` blocks for source extraction
- **Tool-use:** Function calling with Anthropic↔Gemini format translation (tool_use ↔ functionCall, tool_result ↔ functionResponse)
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

**Premium tier (Anthropic Claude)** — `api/chat.js`:
- **Tier gate:** Checks `profiles.tier = 'premium'` before allowing requests; returns 403 for free users
- **Model routing:** `model` param selects: `claude-haiku-4-5-20251001` (simple), `claude-sonnet-4-6` (general), `claude-opus-4-6` (complex)
- **Rate limited:** 20 req/min per user (in-memory + persistent)
- No daily limit for premium users
- Forwards to `https://api.anthropic.com/v1/messages`

**Smart model routing** (client-side in `ai.js`):
| Tier | Features | Gemini Model | Claude Model |
|------|----------|-------------|-------------|
| Lite | insight, labInterpret, vitalsTrend, geneticExplanation, crossReactivity | Flash-Lite | Haiku |
| Flash | chat, news, appointmentPrep, everything else | Flash | Sonnet |
| Pro | connections, careGapDetect, journalPatterns, cyclePatterns, appealDraft, costOptimization, immunizationSchedule | Pro | Opus |

**Shared infrastructure** (`api/_rateLimit.js`):
- `checkPersistentRateLimit(userId, endpoint, max, windowSec)` — cross-instance rate limiting via Supabase `check_rate_limit()` SQL function
- `logUsage(userId, endpoint, { tokens_in, tokens_out })` — fire-and-forget usage tracking to `api_usage` table
- Both endpoints verify Supabase auth token, enforce CORS, and log usage
- **Fail-closed on upstream errors:** returns `false` (deny) when Supabase responds 5xx or the network call throws, so attackers can't bypass rate limits during Supabase outages. Only 4xx responses (e.g., RPC missing during a migration) are treated as fail-open with the in-memory bucket as backstop.

**Provider selection** (client-side):
- `getAIProvider()` / `setAIProvider()` — reads/writes `localStorage` key `salve:ai-provider` (default: `'gemini'`)
- `getModel(feature)` — returns `{ endpoint, model }` based on provider + feature tier
- `isFeatureLocked(feature)` — returns true if feature requires premium and user is on free tier
- Settings UI: AI Provider selector with Gemini (free) / Claude (premium) toggle

### Medical API Proxies

Two additional Vercel serverless functions proxy free government medical APIs. Both follow the same auth + rate-limit + cache pattern as `api/chat.js`. Both use `fetchWithTimeout()` (15-second AbortController) for external API calls.

**`api/drug.js`** — RxNorm + OpenFDA + NADAC proxy:
- **Actions:** `autocomplete` (RxNorm approximateTerm search), `details` (OpenFDA drug label lookup; searches by RxCUI first, falls back to 3-tier name search: `extractIngredient()` strips dosage/form from RxNorm names, then tries exact-quoted brand/generic match → unquoted flexible match → substance_name search; logs `[FDA]` for genuinely missing drugs; `formatLabel()` captures 22+ fields including spl_set_id, pharm_class_moa, pharm_class_pe, dosage_form, precautions, overdosage, storage, effective_time), `interactions` (RxNorm interaction list for multiple RxCUIs), `price` (RxCUI → NDCs via RxNorm → NADAC DKAN API lookup for cheapest per-unit price)
- **NADAC pipeline:** `rxcuiToNDCs(rxcui)` → normalize to 11-digit → parallel `nadacLookup(ndc)` queries (up to 5 NDCs) → return cheapest `nadac_per_unit` with all prices. `nadacLookup()` returns a tagged result (`{price}` / `{notFound}` / `{upstreamError}`) so the pipeline can distinguish "drug not covered by NADAC" from "CMS API is down" and surface a "service temporarily unavailable" message when every attempt hits an upstream error
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

**`api/oura.js`** — Oura Ring V2 API proxy:
- **Actions:** `token` (exchange OAuth2 authorization code for access/refresh tokens, POST), `refresh` (refresh expired access token, POST), `data` (proxy GET to Oura V2 usercollection endpoints), `config` (return client_id + configured status)
- **Allowed endpoints:** `daily_temperature`, `daily_sleep`, `daily_readiness`, `heartrate`, `daily_spo2`
- **Rate limited:** 30 requests/minute per user
- **OAuth2 flow:** Authorization code grant → `https://cloud.ouraring.com/oauth/authorize` (scope: `daily`) → callback with code → server exchanges for tokens (client_secret stays server-side)
- **Client service:** `src/services/oura.js` — `getOuraAuthUrl()`, `exchangeOuraCode(code)`, `syncOuraTemperature(cycles, addItem, days, baseline)`, `fetchOuraTemperature(start, end)`, `ouraDeviationToBBT(deviationC, baselineF)`
- **Temperature conversion:** Oura provides temperature as deviation from personal baseline in Celsius. `ouraDeviationToBBT()` converts to approximate Fahrenheit BBT using configurable baseline (default 97.7°F). Formula: `baselineF + (deviationC × 1.8)`
- **Data hierarchy:** Manual BBT entries override Oura-sourced entries (checked by date before inserting)
- **Token storage:** localStorage (`salve:oura`) with access_token, refresh_token, expires_at, connected_at. Auto-refresh when within 5 minutes of expiry
- **BBT baseline:** User-configurable in Settings, stored in `localStorage` under `salve:oura-baseline` (default 97.7°F)

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
15. **AI-powered data control** - natural language CRUD via Anthropic tool-use API in chat; 26 tools (add/update/remove medications, conditions, allergies, appointments, providers, todos; add vitals/journal/cycle entries/activities/genetic results; remove cycle entries; update profile; search/list records); destructive actions require inline confirmation; tool execution cards show live status; 10-iteration agentic loop cap
16. **Scribe** - paste medical intake form questions, Sage generates first-person answers from health profile; per-answer copy buttons + Copy All; sensitive questions (self-harm, trauma, substance use, relationships) flagged with ⚠ for user to answer personally; facts-only from profile, never fabricates

### Vercel Configuration

```json
{
  "functions": {
    "api/chat.js": { "maxDuration": 120 },
    "api/drug.js": { "maxDuration": 30 },
    "api/provider.js": { "maxDuration": 30 },
    "api/oura.js": { "maxDuration": 30 }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com https://cloud.ouraring.com https://api.ouraring.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'; manifest-src 'self'" },
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
| **API** | Auth token verified server-side; CORS restricted to allowlisted origins; rate limited 20 req/min per user; persistent rate limiter fails **closed** on Supabase 5xx / network errors so outages can't be exploited to bypass limits |
| **Input validation** | `api/chat.js` validates client-provided tools: max 30 tools, ≤64 char names, ≤10KB per `input_schema` (DoS guard). `content-range` header parsing guarded against malformed values. |
| **Trial expiry** | Both server (`api/chat.js`) and client (`ai.js`) guard against `NaN` from invalid `trial_expires_at`, so a malformed date never silently extends a trial |
| **API Timeouts** | `chat.js`: 115s AbortController timeout; `drug.js`/`provider.js`: 15s `fetchWithTimeout()` for external calls |
| **Client → Server** | HTTPS via Vercel; Bearer token required (fails early if missing); shared token cache with concurrent-call dedup (`token.js`) |
| **Cache at rest** | AES-GCM encrypted localStorage using PBKDF2-derived key from auth token |
| **Exports at rest** | Optional passphrase-encrypted backups (AES-GCM + PBKDF2) |
| **AI data sharing** | Requires explicit user consent via `AIConsentGate` before any data sent to Anthropic; revocable in Settings |
| **AI prompt safety** | System prompts constructed server-side via `api/_prompts.js` — client sends `prompt_key` from allowlist + `profile_text`, NOT raw system prompts. `profile.js` sanitizes all user-provided text (strips `<>{}`, configurable char limits via `san(text, limit)` — default 500, up to 1000 for FDA data). Raw `system` only accepted for admin tier (House Consultation escape hatch) |
| **OTP brute-force** | `Auth.jsx` tracks failed OTP attempts with escalating cooldown schedule (3 attempts → 30s, 5 → 120s, 7 → 300s). Verify button disabled during cooldown with live countdown. Resets on code resend |
| **Form validation** | `utils/validate.js` provides per-entity validators with hard range checks (vitals: pain 0-10, bp 20-300, hr 10-350, etc.), field length limits (notes 2000, name 200), required field enforcement. Wired into Vitals, Medications, Labs forms + AI tool executor |
| **HTTP headers** | CSP (no unsafe-inline/eval in script-src), X-Frame-Options DENY, X-Content-Type-Options nosniff, strict Referrer-Policy, Permissions-Policy |
| **Stale chunk recovery** | `lazyWithRetry()` wrapper catches chunk load failures from stale deploys; one-time `sessionStorage`-guarded page reload fetches updated assets |
| **Import safety** | `importRestore()` creates in-memory backup before erasing; auto-restores on failure |
| **Offline sync** | `setupOfflineSync()` wired up in App.jsx; flushes pending writes when connectivity returns |
| **Data erase** | `eraseAll()` runs sequential per-table deletes with error handling; throws on partial failure |
| **Secrets** | `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OURA_CLIENT_SECRET` server-only; never exposed to client |
| **Oura OAuth** | OAuth2 authorization code flow; client_secret stays server-side in `api/oura.js`; tokens stored in localStorage with auto-refresh (single in-flight refresh mutex prevents concurrent callers from racing and invalidating the refresh_token); `expires_in` validated as positive finite number; Oura API calls proxied through Vercel (no direct client→Oura) |
| **Export integrity** | `exportAll()` records per-table errors in `_export.errors` + `_export.partial: true` instead of silently omitting failed tables, so users can detect incomplete backups |
| **Encrypted import** | `decryptExport()` distinguishes wrong-passphrase from corrupt-file errors with explicit try/catch around base64 decoding, AES-GCM decrypt, and JSON.parse |
| **Concurrent-add dedup** | `db.js` shares an in-flight promise keyed by `(table, uid, dedup signature)` so two identical CRUD adds from the same tab collapse to one insert (prevents check-then-insert race for vitals/cycles/activities) |
| **Resilient loading** | `loadAll()` uses `Promise.allSettled()` — individual table failures return empty defaults instead of crashing the app |

### Accessibility (WCAG 2.1 Level A)

| Feature | Implementation |
|---------|---------------|
| **ARIA labels** | All icon-only and text-only action buttons (edit/delete/send/drug-info) have descriptive `aria-label` attributes across all 20 section files |
| **Color-only indicators** | Severity, urgency, status, and lab flag badges include icon prefixes (✓/◆/⚠/✦/·/↗) so information is not conveyed through color alone (WCAG 1.4.1) |
| **Semantic HTML** | `<nav>` for BottomNav, `<header>` for Header, `<main>` for content area, `<section>` with `aria-label` for Dashboard cards, `<article>` for AIPanel chat messages |
| **Form labels** | `Field.jsx` associates `<label htmlFor>` with `<input id>` using React `useId()` for guaranteed uniqueness; supports `error` prop for red inline error messages; `maxLength` prop with live char counter (turns red at 90%+); `hint` prop for helper text; `min`/`max` for numeric inputs |
| **Keyboard support** | `ConfirmBar` responds to Escape (cancel) and Enter (confirm); `role="alertdialog"` for screen readers |
| **Chart accessibility** | Vitals chart has `role="img"` with descriptive `aria-label` + visually-hidden (`sr-only`) data table alternative |
| **Loading states** | `LoadingSpinner` uses `role="status"` + `aria-live="polite"` with `sr-only` fallback text |
| **Decorative elements** | `Motif.jsx` SVGs have `aria-hidden="true"`; Divider uses gradient glow |
| **Hover interactions** | Cards lift with time-aware ambiance glow (sage morning, lavender afternoon, amber evening, dim night); buttons have shimmer sweep; quick-access tiles have contained radial gradient hover; nav items hover-lift with radial glow; timeline rows slide-right on hover |
| **Autocomplete ARIA** | Drug and NPI autocomplete dropdowns use `role="listbox"` / `role="option"` with `aria-label` |
| **Error announcements** | Autocomplete errors use `role="alert"` for screen reader announcement |

## Design System

### Color Palette & Theme System

The app uses an **extensible theme system** with CSS custom properties. All 16 color keys are defined as CSS variables (RGB triplets) consumed by Tailwind's `<alpha-value>` pattern, and as hex strings via the `C` Proxy object for Recharts/dynamic styles.

**Architecture:**
- **Single source of truth:** `src/constants/themes.js` — each theme is a plain object with 16 hex colors + `ambiance` (4 RGB triplets) + `gradient` (3 color keys) + optional `experimental: true` flag
- **CSS variables:** `--salve-bg`, `--salve-card`, `--salve-lav`, `--salve-gradient-1/2/3`, etc. (set by `ThemeProvider` on `document.documentElement`)
- **Tailwind:** `tailwind.config.js` maps `salve.*` to `rgb(var(--salve-*) / <alpha-value>)` — all opacity modifiers work
- **Recharts/JS:** `import { C } from 'constants/colors'` returns a Proxy reading active theme hex values
- **Persistence:** `localStorage` key `salve:theme` (default: `'lilac'`)
- **FODT prevention:** Inline `<script>` in `index.html` applies **all** CSS custom properties synchronously before React hydrates — sets all 16 `--salve-*` color vars (as RGB triplets), `--salve-gradient-1/2/3`, all 4 `--ambiance-*` vars, and the `theme-X` class. All 15 themes are embedded as compact JSON in the script so no async work is needed. `useTheme.jsx`'s `applyThemeVariables()` accepts an `animate` flag — initial render calls it synchronously (no rAF) to stay in sync with the already-set vars; theme switches use the overlay approach.
- **Theme transition (overlay approach):** On switch, captures current `--salve-bg` CSS var, immediately applies new theme vars, then creates a `position:fixed; z-index:99999; will-change:opacity` overlay div with the *old* background colour. Fades the overlay from opacity 1→0 over 0.5s (`ease-in`). Only one element animates (GPU-composited) — the rest of the DOM is already in its final state. Handles rapid switches by cancelling any in-flight rAF + removing any leftover overlay div.
- **CSS animation performance:** Experimental theme `::before`/`::after` layers use `will-change: opacity` or `will-change: transform, opacity` for GPU layer promotion. All `filter: brightness/saturate/hue-rotate` keyframes in Blaze, Neon, Sunbeam, Crystal were replaced with `opacity`-only animations (filter triggers paint on every frame). `.search-hero` uses `transition: box-shadow 0.4s ease` instead of `transition: all`. **Spark/petal `background-position` animations converted to `transform: translateY()`**: Blaze (`body::after`, `height:260vh`, `translateY(-160vh)`), Ember (`body::after`, `height:300vh`, `translateY(-200vh)`), and Cherry (`body::after`, `top:-180vh; height:280vh`, `translateY(+180vh)`) now use GPU-composited transforms instead of main-thread `background-position` repaints. `cherry-sway` was removed (conflicting transform animation). Sunbeam retains `background-position` for dust motes (mixed no-repeat/repeat-y layers can't share a single transform) but has `will-change:transform` for layer isolation.
- **Text legibility:** All dark themes have brightened `textFaint` and `textMid` values to ensure ≥4.5:1 contrast ratio. Global CSS rule `font-weight: 500` applied to `.text-salve-textFaint` and `.text-salve-textMid` (Montserrat Medium) for readable small-label text.
- **Experimental themes** are filtered by `.experimental` flag in Settings into a collapsed "Experimental themes" section. **All users (including free) can click/preview experimental themes** — clicking applies the theme to the DOM immediately via `setTheme()`. Free users see a "🔒 Save · Premium" notification bar when previewing an experimental theme; the Save button is disabled. When a free user leaves Settings with an unsaved experimental theme active, `revertTheme()` auto-reverts to their saved (non-experimental) theme. Premium/admin users can save experimental themes normally.
- **To add a new theme:** Add one object to `themes.js` with colors, ambiance, gradient, and optional CSS effect block in `index.css`. Nothing else changes.

**15 Themes (6 core + 9 experimental):**

*Core themes:*

| Theme | Type | Palette |
|-------|------|---------|
| **Lilac** (default) | Light | Soft pastel lavender + sage + rose |
| **Noir** | Dark | Charcoal, minimal monochrome silver |
| **Midnight** | Dark | Navy + lavender + sage + amber |
| **Forest** | Dark | Woodland greens, olive, amber, warm rust |
| **Dawnlight** | Light | Warm cream + deep lavender + forest green + berry |
| **Sunrise** | Light | Warm peach + coral cream + pink |

*Experimental themes (with signature animated effect layer):*

| Theme | Type | Effect |
|-------|------|--------|
| **Aurora** | Dark | Drifting green/cyan/violet northern-lights curtains + 22 twinkling stars + slow cyan/mint meteor (via html::before) |
| **Neon** | Dark | Cyberpunk hot-pink/cyan grid with drift + pulse animation, heading text glow |
| **Cherry Blossom** | Light | Pink sky wash + 22 scattered falling petals (pink + white) with horizontal sway |
| **Sunny Day** | Light | Blue sky gradient + haloed golden sun + diagonal sunray bands + drifting dust motes |
| **Blaze** | Dark | Ember turned to 11 — intense multi-layer fire + 14 ember sparks + coordinated breathe animation (opacity + brightness + saturation + hue-rotate in one keyframe, ±18°→+10° hue swing) |
| **Ember** | Dark | Flickering firelight glow (raised to upper 84–92% Y) + floating sparks |
| **Galactic** | Dark | 30-star field drifting left-to-right in a gentle arc (120s cycle) + nebula wash + diagonal shooting star every 22s (body::after) |
| **Prismatic** | Light | Iridescent rainbow shimmer on white bg (low-opacity 20%, heavy blur, soft white mist overlay); headings rendered IN the rainbow via background-clip |
| **Crystal Cave** | Dark | Amethyst + sapphire radial glows + twinkling sparkles + hologram white-glare sweep across cards on hover + uppercase letter-spaced Space Grotesk headings (shared with other architectural themes) + cyan/pink heading glow + crisp cyan focus outlines |

**Per-theme features:**
- **`gradient: [key1, key2, key3]`**: each theme picks 3 color keys from its own palette for the `.text-gradient-magic` "Hello, {name}" greeting, so the animated gradient harmonizes with each theme (no more lav→sage→amber clash). Applied via `--salve-gradient-1/2/3` CSS vars.
- **`ambiance`**: 4 RGB triplets (morning/day/evening/night) for time-aware card hover glow
- **Glassmorphism on experimental themes**: cards with `bg-salve-card`, `bg-salve-card/5`, and `bg-salve-lav/5|10|15` get `backdrop-filter: blur(14-18px) saturate(1.2-1.4)` for frosted-glass over the animated backdrops. Border color is strengthened for definition.
- **Effect layers**: `html.theme-X body::before` (background layer) + `html.theme-X body::after` (additional layer, usually stars/sparks) + `html.theme-X::before` (used by Aurora meteor when body::after is already taken). All at `z-index: 0` with content at z-index 1.
- **Shooting stars / meteors** (Galactic + Aurora) use fixed-dimension rotated bars with `transform: translate(X vw, Y vw)` where Y = X × tan(angle) so motion path stays aligned with bar rotation across all viewport aspect ratios.

**Color key roles (16 keys, same across all themes):**
- `bg`, `card`, `card2` — background surfaces (darkest → lightest for dark themes, reversed for light)
- `border`, `border2` — subtle/stronger borders
- `text`, `textMid`, `textFaint` — primary/secondary/disabled text
- `lav`, `lavDim` — primary accent (actions, focus, highlights)
- `sage`, `sageDim` — secondary accent (success, health, positive)
- `amber`, `amberDim` — tertiary accent (warnings, fertility, attention)
- `rose`, `roseDim` — alert accent (errors, urgency, danger)

### Typography

- **Headings (per-theme via `.font-playfair` class targeting `html.theme-X` in `index.css`):**
  - *Soft romantic* (Lilac, Dawnlight, Sunrise): **Fraunces** variable, SOFT axis 100, weight 500
  - *Preserved Playfair* (Cherry Blossom, Sunny Day): **Playfair Display** 400/600/700 (tailwind default)
  - *Dark editorial* (Midnight, Forest, Noir): **Instrument Serif** 400, 0.005em letter-spacing
  - *Warm dramatic* (Blaze, Ember, Aurora): **Fraunces** variable, SOFT axis 0, opsz 96, weight 600
  - *Architectural* (Crystal, Neon, Galactic, Prismatic): **Space Grotesk** 500, uppercase, 0.14em letter-spacing (Crystal stacks cyan/pink text-shadow glow on top)
- **Body:** Montserrat, 300-600 weight (universal)
- Import via Google Fonts in `index.css` (Fraunces variable font + Instrument Serif + Playfair Display + Montserrat + Space Grotesk in one request)
- Tailwind alias: `.font-playfair` is the universal heading class name (name kept for backwards-compat with 30 files); actual font family is swapped per active theme via CSS selectors like `html.theme-midnight .font-playfair { font-family: 'Instrument Serif', ... }`

### Layout

- **Mobile** (< 768px): Max width 480px, centered. Bottom navigation with 6 tabs. Unchanged from original mobile-first design.
- **Tablet** (768px – 1023px, `md:`): SideNav replaces BottomNav (260px fixed left sidebar). Content column widens to 820px. SplitView list/detail for Medications, Conditions, Labs, Providers. Drag-and-drop file import zones appear.
- **Desktop** (≥ 1024px, `lg:`): Content column widens to 1060px. Dashboard tile grids expand to 5 columns. All md: features apply.
- **Responsive strategy:** All desktop behavior is additive via Tailwind `md:`/`lg:` prefixes + `useIsDesktop()` hook. Mobile layout is completely untouched — no breakpoint changes affect < 768px.
- **SideNav** (desktop): Fixed left, 260px wide, full viewport height. App branding + user name at top, Search button (standalone, full-width with ⌘K hint), 7 nav items (Home/Meds/Vitals/Sage/Scribe/Journal/Settings) with left-border accent on active + dimmed number key hint (1–7) on inactive items. BottomNav hidden at md+ (`md:hidden`).
- **SplitView** (desktop): List on left (360-420px scrollable, min-h-[300px]), detail pane on right (sticky). `detailKey` prop triggers fade+slide entry animation on selection change. Themed empty state with icon. Used by Medications, Conditions, Labs, Providers. Selected card shows lavender ring. Arrow keys (↑↓) navigate between items in Medications and Labs when no text input is focused.
- **Keyboard shortcuts:** `Cmd/Ctrl+K` → open search, `Escape` → close Sage popup, `1–7` → jump to Home/Medications/Vitals/Sage/Scribe/Journal/Settings (blocked when a text input is focused). Number hints shown in SideNav. Implemented via global keydown listener in App.jsx.
- **Drag-and-drop import** (desktop): DropZone component in Settings (backup .json), AppleHealthImport (.xml/.zip), CycleTracker (Flo .json). Dashed border target with hover/active states. Hidden on mobile, existing file picker buttons remain.
- **Print support:** Print button on HealthSummary (desktop only). Print CSS hides nav/sidebar/decorative elements, forces expand-sections open, white background, page breaks.
- Bottom navigation with 6 tabs: Home, Meds, Vitals, Insight (AI), Journal, Settings
- "made with love for my best friend & soulmate" tagline — **Mobile**: above BottomNav, scroll-reveal (scrolled past 50px AND near bottom, resets on tab change). **Desktop**: at very bottom of Dashboard page content (`hidden md:block`), scroll-reveal (scrolled past 80px AND near bottom, 500ms fade-in + translateY transition)
- Magical UI effects: time-aware ambiance (card hover glow shifts sage→lavender→amber→dim by time of day), button shimmer sweep, quick-access tile contained radial gradient, nav item radial glow, gradient-shift greeting text, badge shimmer, field focus glow ring, section-enter fade+slide+deblur transitions, AI prose reveal (paragraph-by-paragraph stagger), celebration sparkle burst on success toasts, breathe meditation loader (10s deep breathing cycle with bloom/rings/glow)
- Dashboard uses "Calm Intelligence" design philosophy — shows only actionable info, not data counts
- Dashboard sections: contextual greeting → live search centerpiece (hidden on desktop `md:hidden` — sidebar Search button replaces it) → Recent Vitals hero card + Activity Snapshot in 2-column grid at `lg+` → consolidated alerts (dismissible, fully hidden when dismissed) → Sage insight → Discover card (matched resources, per-card dismissible) → unified timeline → journal preview → quick access grid (expandable, 6 default + "More")
- **Recent Vitals card** (hero + chips layout): one featured vital (top-priority available, usually Sleep) shown hero-style with uppercase label + 32px value + full-width 56px Recharts area chart (neutral textMid stroke at 55% opacity + lav gradient fill) + **natural-language trend caption** (e.g., "↓ 1.2 hrs below your 7-day average") with direction-aware color (sage=good, amber=watch, neutral=flat) based on `VITAL_POLARITY` map (sleep/steps/energy/mood=up-is-good, hr/bp/pain=down-is-good, weight/temp/glucose=neutral). Below a thin divider: 2-3 supporting vital chips (label + value + trend arrow only, no charts). Card uses standard `bg-salve-card` surface — no color tint — so it never hijacks the theme palette. Click navigates to Vitals section.
- Quick Access default 6: Summary, Conditions, Providers, Allergies, Appointments, Labs; "More" expander reveals remaining sections
- Quick Access tiles are **user-customizable**: Edit button (pencil icon) enters edit mode → tap a tile to select it → bottom sheet shows available replacements → tap replacement to swap → Done button saves. "+" tile at end of grid adds new tiles from available sections. "×" badge on each tile removes it (minimum 1 tile enforced). Persisted in `localStorage` under `salve:dash-primary` (array of 1–16 IDs). Falls back to `DEFAULT_PRIMARY_IDS` if corrupt/missing.
- Quick Access expanded/collapsed state persists in `localStorage` under `salve:dash-more`
- "More sections" button auto-hides when all tiles are promoted to primary grid
- All section views have a back arrow in the header that returns to the **previous section** (navigation history stack, not always Dashboard). Bottom nav tabs and error recovery clear the stack.
- Section page titles are shown only in the Header — no duplicate `SectionTitle` below. Action buttons (Add/Log/Write) are right-aligned below the header. Sub-section headings (e.g., "Interaction Warnings", "Recent Entries") are preserved.
- **Header** (minimal, no background decor): contains back button (non-Home), title with theme-aware `text-gradient-magic` animated gradient on "Hello, {name}" for Home, Sage leaf-icon button on the left, and Search magnifying-glass button on the right. Hovers sage-green / lav respectively.
- **Sage popup** (`SagePopup.jsx`): tapping the leaf button in the header opens a bottom-sheet modal with a minimal multi-turn chat powered by `services/ai.js → sendChat`. Consent-gated via `hasAIConsent()`. Includes "full chat" shortcut button that closes popup and navigates to the AI tab. State managed via `sageOpen` in `App.jsx`, rendered at app root outside the max-width column.
- **Global Search:** Header magnifying glass icon (visible on all pages) opens the Search view; Dashboard has a live search centerpiece with inline results (up to 5) and "See all" deep-link to full Search view
- **Deep-link navigation:** `onNav(tab, { highlightId })` navigates to a section AND auto-expands + scrolls to a specific record; used by Search results. All 15 expandable sections support `highlightId` prop (expand + scrollIntoView + lavender pulse animation). Appointments and AnesthesiaFlags support scroll-only deep-link (no expandable cards).
- **highlight-ring animation:** `highlight-pulse` keyframes in `index.css` — 1.5s lavender box-shadow pulse applied to deep-linked cards
- Staggered entrance animations on Dashboard cards (`dash-stagger` CSS classes)
- `ErrorBoundary` wraps all section renders — crashes show friendly fallback, not white screen

## Key Design Decisions

1. **Use the theme system for all colors.** Never hardcode hex values — use Tailwind classes (`bg-salve-card`, `text-salve-lav/20`) or the `C` object for dynamic styles. All colors flow through CSS variables set by the active theme. Adding `style={{ color: '#b8a9e8' }}` will break theming.
2. **Every inline style `style={{...}}` becomes Tailwind classes.** Use the `salve-*` color classes, never arbitrary hex values. For Recharts and dynamic computations, use `C.lav`, `C.sage`, etc. from `constants/colors`.
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
- [ ] All 28 sections render without errors (including Auth screen)
- [ ] Data persists across sessions (Supabase)
- [ ] Add/edit/delete works for: meds, conditions, allergies, providers, vitals, appointments, journal entries, labs, procedures, immunizations, care gaps, anesthesia flags, appeals, surgical planning, insurance
- [ ] Delete confirmation appears and can be cancelled
- [ ] Drug interaction checker flags known combos
- [ ] Dashboard: contextual greeting shows correct time-of-day message
- Dashboard: alerts consolidate into single card (anesthesia + interactions + care gaps + abnormal labs)
- [ ] Dashboard: Sage insight hidden when no consent; shimmer when loading; quote-style when loaded
- [ ] Dashboard: unified timeline shows appointments and refills sorted by date
- [ ] Dashboard: Quick Access shows 6 primary tiles by default; "More" expands to reveal remaining
- [ ] Dashboard: Quick Access Edit button enters edit mode with dashed borders, swap icons, and × remove badges
- [ ] Dashboard: Tapping a tile in edit mode selects it (lavender ring) and shows replacement bottom sheet
- [ ] Dashboard: Selecting a replacement swaps the tile and persists to localStorage
- [ ] Dashboard: "+" tile appears at end of grid in edit mode; tapping opens "Add a section" bottom sheet
- [ ] Dashboard: Adding a tile promotes it to primary grid; added tiles persist across reload
- [ ] Dashboard: "×" badge on tiles removes them from primary grid (minimum 1 tile enforced)
- [ ] Dashboard: Done button exits edit mode; "More sections" hidden during editing
- [ ] Dashboard: "More sections" button auto-hides when all tiles are promoted
- [ ] Dashboard: Quick Access customization (1–16 tiles) survives page reload (localStorage `salve:dash-primary`)
- [ ] Dashboard: Corrupt/missing localStorage falls back to default 6 tiles
- [ ] Dashboard: entrance animations stagger correctly without layout shift
- [ ] Dashboard: "More" expanded state persists across page loads
- [ ] Sage insight loads on dashboard (with /api/chat proxy + auth token)
- [ ] Sage chat panel sends/receives messages
- [ ] AI chat: copy button appears on assistant responses (copies text to clipboard)
- [ ] AI chat: "Add Lexapro 10mg" creates medication via tool-use (ToolExecutionCard shows success)
- [ ] AI chat: "Remove [medication]" shows pending confirmation card with Confirm/Cancel buttons
- [ ] AI chat: Cancelling destructive action returns "User cancelled" to AI
- [ ] AI chat: Tool execution cards persist in saved conversation history
- [ ] AI chat: search_records and list_records tools return record IDs for follow-up operations
- [ ] AI chat: 10-iteration loop cap prevents runaway tool-use chains
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
- [ ] All 28 sections reachable via Quick Access (6+ primary tiles, expandable up to all 20, + 6 in bottom nav)
- [ ] Back button returns to Dashboard from any section
- [ ] Layout is correct at 375px width (iPhone SE) and 480px width
- [ ] Fonts load (per-theme heading font + Montserrat body); switching theme swaps heading typeface without flash
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

### Cycle Tracker Tests
- [ ] CycleTracker: CRUD works (add, edit, delete with confirmation)
- [ ] CycleTracker: calendar shows period days (rose), predicted (dashed rose), fertile (amber)
- [ ] CycleTracker: stats card shows current cycle day, avg length, days until next period
- [ ] CycleTracker: quick-log (tap calendar day) pre-fills form for that date
- [ ] CycleTracker: filter pills work (All, Period, Symptoms, Ovulation, Fertility)
- [ ] CycleTracker: Flo import parses JSON, dedupes against existing records
- [ ] CycleTracker: deep-link from Search expands + scrolls to specific record with highlight pulse
- [ ] Dashboard: predicted period shows in unified timeline
- [ ] Dashboard: late period alert shows in consolidated alerts with days-late count
- [ ] AI chat: add_cycle_entry tool creates cycle record via natural language
- [ ] AI chat: remove_cycle_entry requires confirmation before deleting
- [ ] AI profile: includes cycle stats (avg length, current day, common symptoms)
- [ ] Search: cycle entries searchable by type, symptom, date, notes

### Oura Ring Integration Tests
- [ ] Settings: "Connect Oura Ring" button appears when not connected
- [ ] Settings: Clicking connect redirects to Oura OAuth authorization page (requires OURA_CLIENT_ID/SECRET env vars)
- [ ] Settings: OAuth callback exchanges code for tokens and shows "Connected" state
- [ ] Settings: BBT baseline field defaults to 97.7°F and persists changes to localStorage
- [ ] Settings: "Sync Temperature" fetches last 30 days and inserts new BBT entries
- [ ] Settings: Sync skips dates that already have manual BBT entries (manual override)
- [ ] Settings: "Disconnect" clears tokens and reverts to connect button
- [ ] Settings: Expired token triggers auto-refresh; if refresh fails, disconnects gracefully
- [ ] CycleTracker: "Oura Sync" button appears in action bar when connected
- [ ] CycleTracker: Oura sync inserts temperature readings as BBT entries with Oura source note
- [ ] CycleTracker: Oura-sourced BBT entries show deviation note in card
- [ ] CycleTracker: BBT shift detection works with Oura-sourced temperatures
- [ ] api/oura.js: Rejects unauthenticated requests (401)
- [ ] api/oura.js: Rate limits at 30 req/min per user
- [ ] api/oura.js: Only allows whitelisted endpoints (daily_temperature, daily_sleep, etc.)
- [ ] api/oura.js: Returns 500 with "Oura not configured" when env vars missing

### Health To-Do Tests
- [ ] Todos: CRUD works (add, edit, delete with confirmation)
- [ ] Todos: filter tabs work (Active, All, Done, Overdue)
- [ ] Todos: priority badges show correct colors (urgent=rose, high=amber, medium=lav, low=sage)
- [ ] Todos: due date countdown shows "Due today", "Due in 3 days", "Overdue by 2 days"
- [ ] Todos: complete toggle strikethroughs title, sets completed_at
- [ ] Todos: overdue filter shows red pill with count
- [ ] Todos: recurring indicator shows on cards
- [ ] Todos: expandable cards show notes, category, edit/delete
- [ ] Todos: deep-link from Search expands + scrolls to specific record with highlight pulse
- [ ] Dashboard: overdue/urgent todos appear in consolidated alerts
- [ ] Dashboard: due-soon todos appear in unified timeline
- [ ] Dashboard: To-Do's tile appears in Quick Access grid
- [ ] Dashboard: todo alert count included in getContextLine total
- [ ] AI chat: "Add a todo to refill prescription" creates todo via tool-use
- [ ] AI chat: "Mark my refill todo as complete" updates todo
- [ ] AI chat: "Remove todo" requires confirmation before deleting
- [ ] AI profile: includes active to-do items with priorities and due dates
- [ ] Search: todos searchable by title, notes, category, priority
- [ ] Export/import: todos included in backup and restore

### Feedback Tests
- [ ] Feedback: type selector pills switch between feedback/bug/suggestion
- [ ] Feedback: submitting feedback saves to Supabase and shows "Sent!" confirmation
- [ ] Feedback: previously submitted feedback appears in list below form
- [ ] Feedback: expanding a submission shows full message text + delete button
- [ ] Feedback: delete requires ConfirmBar confirmation before removing
- [ ] Settings: "Send Feedback" button navigates to Feedback section (not mailto)
- [ ] Dashboard: Getting Started feedback tip navigates to Feedback section (not mailto)

### Scribe Tests
- [ ] Scribe: section reachable via Quick Access tile (Scribe with PenLine icon)
- [ ] Scribe: AIConsentGate appears if AI consent not yet granted
- [ ] Scribe: Paste button reads from clipboard and populates textarea
- [ ] Scribe: question count detects lines ending with "?"
- [ ] Scribe: "Generate Answers" calls AI with health profile and form questions
- [ ] Scribe: loading state shows Sage leaf animation + cycling wellness messages
- [ ] Scribe: results display as expandable Q&A cards with per-answer copy buttons
- [ ] Scribe: "Copy all" copies all Q&A pairs to clipboard
- [ ] Scribe: sensitive questions (self-harm, trauma, substance use, relationships) show ⚠ flag with amber border
- [ ] Scribe: "New form" button resets to input state
- [ ] Scribe: answers use first-person voice ("I", "my", "me")
- [ ] Scribe: questions with no matching profile data show ⚠ "answer this one yourself"
- [ ] Scribe: disclaimer card appears below results

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel env vars | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel env vars | Supabase anonymous/public key |
| `ANTHROPIC_API_KEY` | Vercel env vars only | Proxied to Anthropic API |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars only | Server-side auth token verification |
| `SUPABASE_URL` | Vercel env vars (fallback) | Fallback for api/chat.js if VITE_ prefix not available server-side |
| `ALLOWED_ORIGIN` | Vercel env vars (optional) | Custom allowed CORS origin for api/chat.js (e.g. your production domain) |
| `GEMINI_API_KEY` | Vercel env vars only | Google Gemini API key (free tier AI) |
| `OURA_CLIENT_ID` | Vercel env vars only | Oura Ring OAuth2 client ID (from Oura Developer Portal) |
| `OURA_CLIENT_SECRET` | Vercel env vars only | Oura Ring OAuth2 client secret (server-side only, never exposed to client) |
| `VITE_SENTRY_DSN` | `.env.local` + Vercel env vars (optional) | Sentry project DSN for production error reporting. If unset, Sentry is silently disabled. |
| `VITE_SENTRY_DSN_DEV` | `.env.local` (optional) | Optional override to enable Sentry in development mode for testing the scrub pipeline |
| `VITE_SENTRY_RELEASE` | Vercel env vars (optional) | Release identifier (e.g. git SHA) to correlate errors to commits |
| `LEMON_API_KEY` | Vercel env vars only | Lemon Squeezy API key (from LS dashboard → Settings → API) |
| `LEMON_STORE_ID` | Vercel env vars only | Lemon Squeezy store ID (numeric, from LS dashboard URL) |
| `LEMON_PREMIUM_VARIANT_ID` | Vercel env vars only | Lemon Squeezy variant ID for the Premium subscription plan |
| `LEMON_WEBHOOK_SECRET` | Vercel env vars only | Lemon Squeezy webhook signing secret (from LS dashboard → Webhooks) |

## Reference Docs

| Document | Purpose |
|----------|---------|
| `docs/PRODUCTION_AUDIT.md` | Full production-readiness audit: security fixes, data integrity issues, AI underutilization, UX gaps per section, accessibility, PWA/performance, implementation priority checklist |
| `docs/LAUNCH_CHECKLIST.md` | Focused pre-launch checklist for sharing publicly: Sentry setup, AI cost ceilings, Vercel plan, RLS verification test, Lemon Squeezy payments implementation plan, UX polish checklist, PHI breach response plan |
| `docs/IMPORT_IMPLEMENTATION.md` | Import/export/merge implementation guide |
| `docs/APPLE_HEALTH_SHORTCUT.md` | iOS Shortcut build spec for the Apple Health paste-sync bridge: JSON contract, action-by-action build guide, unit conversions, workout type mapping, testing, distribution |
| `docs/MIGRATION_PLAN.md` | Migration planning notes |
| `docs/superpowers/specs/2026-04-01-cycle-tracker-completion-design.md` | Cycle Tracker completion spec: vitals/journal correlation, AI cycle analysis, med awareness, Dashboard quick-log |
| `docs/DESKTOP_UI_PLAN.md` | Desktop UI adaptation roadmap: 7 phases (shell/nav, header, dashboard multi-column, list/detail split view, hub enhancements, data-dense polish, keyboard shortcuts). Phases 1-2 + parts of 4 & 7 implemented. |

## Commands

```bash
npm run dev          # Local dev server
npm run build        # Production build
npm run preview      # Preview production build locally
vercel --prod        # Deploy to production
```

## Pre-Launch Action Items (NOT CODE — USER TO DO)

**Critical path before sharing publicly (e.g., on Reddit).** These are outside-the-codebase tasks the user must complete — dashboard configuration, account signups, manual testing. Any assistant session reading this file should proactively remind the user about unchecked items.

Full details + exact commands in [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md).

- [ ] **Sentry account + DSN** — sign up at sentry.io (free tier), create a React/Vite project, copy DSN, add `VITE_SENTRY_DSN` to Vercel env vars (Production + Preview), redeploy. Verify with `throw new Error('sentry-test')` in the prod DevTools console.
- [ ] **AI provider spend caps** — set monthly $ limit + 50/75/90% email alerts in Anthropic Console → Billing. If using paid Gemini, do the same in Google Cloud Console → Billing → Budgets.
- [ ] **Uptime monitor** — UptimeRobot or BetterStack free tier, 5-min ping on production URL, email alerts.
- [ ] **Vercel plan decision** — stay on Hobby if launching free + under quotas. Upgrade to Pro ($20/mo) BEFORE adding any paid tier (commercial use requires Pro).
- [ ] **RLS end-to-end verification** — follow the DevTools script in `docs/LAUNCH_CHECKLIST.md` section 2. Create two test accounts, try to read each other's data via Supabase REST API, confirm zero cross-contamination on every sensitive table. REQUIRED before public share.
- [ ] **Fresh-user walkthrough** — sign up with a clean email, tap through every section, verify all empty states render without crashes. Test on iPhone Safari + Android Chrome. Test PWA install flow (Add to Home Screen).
- [ ] **Offline mode verification** — enable airplane mode, confirm cached data loads and pending writes queue correctly.
- [ ] **Support workflow documented** — decide response-time commitment + who owns the `salveapp@proton.me` inbox. Document PHI breach response plan (assess scope → revoke tokens → notify within 72h → patch → post-mortem).
- [x] **Lemon Squeezy payments** — Code complete: `api/lemon-checkout.js` (creates hosted checkout), `api/lemon-webhook.js` (HMAC-verified subscription lifecycle → flips profiles.tier), `src/services/billing.js` (startCheckout/openCustomerPortal). Settings.jsx shows "Upgrade to Premium →" button for free/trial-expired users, "Manage subscription →" for active premium. App.jsx handles `?checkout=success` redirect with toast. **User still needs to**: create LS account, set up store + product + variant, add 4 env vars (LEMON_API_KEY, LEMON_STORE_ID, LEMON_PREMIUM_VARIANT_ID, LEMON_WEBHOOK_SECRET), configure webhook URL (`/api/lemon-webhook`) in LS dashboard.

**Support email:** `salveapp@proton.me` (set in `src/components/sections/Legal.jsx`)

## To-Do

- [x] **Name the AI chatbot "Sage"** — Done. Leaf avatar, "Hey, I'm Sage" greeting, "Sage is thinking" loading, sage-green Daily Insight cards, BottomNav tab renamed, consent gate updated, disclaimers rebranded.
- [ ] **Configure Google Sign In** — Button is wired up in Auth.jsx, needs Google Cloud Console OAuth credentials + Supabase provider config to work.
- [ ] **External patient-resource integrations (EveryCure + Understood.org, extensible)** — Build a unified "Discover" / curated-resource framework that cross-references user's conditions, meds, journal tags, etc., against hand-curated external resource libraries. No org has a public query API, so static tagged JSON files are the mechanism. See detailed plan in Roadmap section below.
- [ ] **Multi-model "Second Opinion" chat** (future exploration) — Let users get a parallel response from the other AI provider (Gemini if Sage was Claude, vice versa) via a "Get a second opinion" button in SagePopup/AIPanel. Both responses render as distinct bubbles with provider badges, framing AI health info as "don't trust just one voice." Trickier parts: tool-use deduplication (only one model gets write tools), cost of dual calls, UX of comparing two answers.
- [x] **Health To-Do's & Reminders** — Done. Full Todos.jsx section with CRUD, filter tabs, priority badges, due date countdown, complete toggle, recurring support. Dashboard integration (overdue/urgent alerts, due-soon timeline, Quick Access tile). AI tool-use (add/update/remove via Sage chat). Search integration. Active todos in AI profile context.
- [x] **Cycle Tracker Completion** — Done. Shared `utils/cycles.js` with `getCyclePhaseForDate`, Vitals phase badges + chart overlay, Journal phase badges + mood-phase summary, AI cycle patterns feature, medication cycle awareness badges, Dashboard quick-log.
- [x] **Apple Health Integration** — Done. XML import parser (`services/healthkit.js`) with chunked regex extraction, daily aggregation (HR, steps, sleep, weight, temp, glucose, BP pairing), workout parsing, FHIR R4 lab results. Import UI in Settings (`AppleHealthImport.jsx`) with progress bar, dedup preview, bulk insert. New `activities` table for workouts. New vitals types: steps, active_energy. Paste-from-clipboard for iOS Shortcut bridge with full build spec in `docs/APPLE_HEALTH_SHORTCUT.md` (JSON contract, action-by-action iOS Shortcuts build guide, unit conversions, workout type mapping, testing procedure, distribution options). Full wiring: db, storage, search, AI tools, profile context. Remaining: actually building the .shortcut file on an iPhone + hosting the iCloud install link, dedicated Dashboard activity card.
- [x] **DNA / Pharmacogenomics Integration** — Done. New `genetic_results` table with RLS. Static drug-gene lookup (`constants/pgx.js`) with ~40 FDA/PharmGKB gene-drug pairs across 15 genes (CYP2D6, CYP2C19, CYP2C9, CYP3A4, VKORC1, HLA-B, SLCO1B1, DPYD, TPMT, NUDT15, UGT1A1, CYP1A2, CYP2B6, COMT, MTHFR). Genetics.jsx section with manual entry, auto-populated affected drugs, phenotype badges, clipboard paste import. PGx badges on medication cards (severity-colored: danger=rose, caution=amber, info=lavender). Dashboard drug-gene conflict alerts. Sage AI profile includes pharmacogenomics + drug-gene conflict flags. Full wiring: db, storage, search, AI tools, profile context.

## Roadmap — Amber's Top 5 Feature Requests (Easiest → Hardest)

### 1. Health To-Do's & Reminders

**Goal:** Let users create custom actionable items (refill reminders, follow-up calls, symptom tracking tasks, appointment prep) that surface as Dashboard alerts alongside existing system alerts. Optionally integrate with Apple Reminders for native notifications.

**Data Sources:**
- **Manual entry** — User creates to-do items directly in-app with optional due dates, recurrence, and priority.
- **AI-generated** — AI features (appointment prep, care gaps, cost optimization) can suggest actionable to-do items that the user confirms.
- **Apple Reminders (stretch)** — iOS Shortcuts bridge to sync to-do items bidirectionally with Apple Reminders lists.

**Implementation Plan:**

| Phase | Work | Details |
|-------|------|---------|
| **Schema** | New `todos` table | `user_id`, `title`, `notes`, `due_date` (nullable), `priority` (low/medium/high/urgent), `category` (medication/appointment/follow_up/insurance/lab/custom), `completed`, `completed_at`, `recurring` (none/daily/weekly/monthly), `related_id` (nullable FK to any record), `related_table` (nullable — medications/appointments/etc.), `source` (manual/ai_suggested), `dismissed` | RLS scoped to user |
| **CRUD** | Add `db.todos` service | Standard CRUD factory via `db.js`. Add `todos` to `db.loadAll()`, `db.eraseAll()`, `useHealthData` state, `tableToKey` mapping, `storage.js` export/import, search config |
| **New section: To-Do's** | Full to-do management UI | List with filter tabs (All/Active/Completed/Overdue), priority badges (urgent=rose, high=amber, medium=lav, low=sage), category icons, due date countdown, mark complete with strikethrough animation, swipe or tap to dismiss, add/edit form with optional due date + recurrence picker |
| **Dashboard integration** | To-do alerts in consolidated alerts | Overdue and urgent to-do items appear in the Dashboard alert card alongside interactions/care gaps/anesthesia/abnormal labs. Count included in `getContextLine()` total. Due-today items show in unified timeline. Dismissable per existing `ALERT_DISMISS_KEY` pattern |
| **Quick-add** | Dashboard quick-add button | Floating or inline "+" button on Dashboard for rapid to-do creation without navigating to full section. Minimal form: title + optional due date + priority |
| **AI suggestions** | AI-generated to-do items | When AI features return actionable recommendations (e.g., "Schedule follow-up with cardiologist", "Refill metformin before trip"), show "Add as to-do?" button that pre-populates a to-do with the suggestion. Source tagged as `ai_suggested` |
| **Recurring** | Recurring to-do support | When a recurring to-do is completed, auto-create next occurrence based on recurrence pattern. Show recurrence icon (↻) on card |
| **Related records** | Cross-reference to-do items | Optional link to a medication (refill reminder), appointment (prep task), provider (follow-up call), etc. Deep-link from to-do card to related record. Related record shows to-do badge |
| **Apple Reminders bridge** | iOS Shortcuts sync (stretch) | Downloadable iOS Shortcut that: reads Salve to-do items from clipboard/export → creates Apple Reminders with due dates + lists. Reverse: exports Apple Reminders list → Salve import merge. NOT real-time sync — manual trigger like existing `salve-sync.jsx` pattern |
| **Notifications** | PWA push notifications (stretch) | Service worker push notifications for due/overdue to-do items. Requires push subscription registration + Vercel serverless cron or Supabase Edge Function for scheduling. Optional — app already works without native notifications |

**Key Technical Decisions:**
- To-do items are first-class data — included in encrypted cache, backup exports, import merge, and search
- Dashboard alert integration reuses the existing `getContextLine()` + consolidated alert card pattern — no new alert UI needed
- `related_id` + `related_table` enables polymorphic association to any record type without foreign key constraints
- Recurring to-do logic runs client-side on completion — no server-side scheduler needed
- Apple Reminders: Shortcuts-based (no API), same distribution pattern as Apple Health Shortcuts bridge
- Quick Access grid: add "To-Do's" to `ALL_LINKS` in Dashboard.jsx (becomes 17th tile)

---

### 2. AI-Powered Data Control via Chat

**Goal:** Let users modify their health data through natural language commands in the AI chat. Instead of navigating to sections and filling forms, users can say "add Lexapro 10mg to my medications" or "remove all meds from CVS pharmacy" and the AI executes the changes against Supabase, with confirmation before any destructive action.

**Architecture: Tool-Use Pattern**

The AI chat already uses Anthropic's API via `callAPI()`. This feature adds **client-side tool execution** — the AI returns structured tool calls, the client executes them against `db.js` CRUD, and confirms results back to the AI.

**Implementation Plan:**

| Phase | Work | Details |
|-------|------|---------|
| **Tool definitions** | Define health data tools for Anthropic | Create tool schemas for: `add_medication`, `update_medication`, `remove_medication`, `add_condition`, `update_condition`, `remove_condition`, `add_allergy`, `remove_allergy`, `add_appointment`, `update_appointment`, `add_todo`, `update_profile`, `search_records`, `list_records`. Each tool has typed input parameters matching the table schemas |
| **System prompt** | Extend `PROMPTS.ask` for data control | Add instructions: "You have tools to modify the user's health data. When asked to add, update, or remove records, use the appropriate tool. ALWAYS confirm destructive actions (remove, bulk update) before executing. Show what will change and ask 'Should I proceed?'" |
| **Tool execution engine** | Client-side tool call handler in AIPanel | When AI response contains `tool_use` blocks, parse tool name + parameters → map to `addItem(table, item)` / `updateItem(table, id, changes)` / `removeItem(table, id)` from `useHealthData` → execute → return `tool_result` to AI for confirmation message |
| **Confirmation flow** | User approval for destructive actions | For `remove_*` and bulk `update_*` tools: AI first describes what will change → user confirms via chat ("yes" / "no") or inline Confirm/Cancel buttons → only then execute. Non-destructive adds can auto-execute with undo option |
| **Preview panel** | Show pending changes visually | Before execution, render a diff-style preview card in chat: "Will add: Lexapro 10mg daily, prescribed by Dr. Smith" or "Will remove 3 medications from CVS pharmacy: [list]". Styled like existing alert cards |
| **State sync** | Update React state after tool execution | After successful CRUD via `useHealthData.addItem/updateItem/removeItem`, the data state auto-updates. AI profile rebuilds on next feature call. Toast notifications confirm each action |
| **Multi-step operations** | Batch and conditional operations | Support compound requests: "Add diagnosis of GERD and add omeprazole 20mg for it" → AI chains `add_condition` then `add_medication` with `purpose: "GERD"`. "Remove everything from my old pharmacy" → AI calls `list_records` to find matching meds, shows list, confirms, then iterates `update_medication` |
| **Undo support** | Reversible actions | After each modification, show "Undo" button in chat that reverses the last action. For adds → remove. For removes → re-add with original data (stored in chat message metadata). For updates → revert to previous values |
| **Profile preview integration** | "What AI Sees" reflects changes | After tool execution, offer "See updated profile?" link that opens `AIProfilePreview` to verify the AI's context has been updated |
| **Audit trail** | Log AI-initiated changes | Tag records modified by AI tools with `source: 'ai_chat'` metadata or log to a lightweight `ai_actions` audit trail (conversation_id, action, table, record_id, timestamp). Visible in Settings under "AI Activity Log" |

**Tool Schema Example:**
```
add_medication: { name (required), dose, frequency, route, prescriber, pharmacy, purpose, display_name, start_date, active }
update_medication: { id (required), ...partial fields to update }
remove_medication: { id (required) } — requires user confirmation
search_records: { query, table (optional) } — returns matching records for context
```

**Key Technical Decisions:**
- Uses Anthropic's native tool-use API (already supported by `api/chat.js` which forwards arbitrary message structures) — NOT regex parsing of chat text
- Tool execution happens **client-side** in AIPanel.jsx, NOT server-side — tools call `useHealthData` CRUD which goes through normal Supabase auth + RLS
- Destructive actions (remove, bulk update) ALWAYS require explicit user confirmation — AI cannot auto-delete
- The AI sees the full health profile via system prompt, so it can resolve references like "my heart medication" → find the beta blocker in the med list
- Rate limiting: tool executions count against normal Supabase operations, not AI rate limit. Max 10 tool calls per chat turn to prevent runaway loops
- Error handling: if a CRUD operation fails, the tool result includes the error and the AI reports it to the user naturally
- This does NOT bypass any security — all writes go through the same `db.js` → Supabase RLS pipeline as manual UI edits

---

### 3. Flo Period & Fertility Tracker Integration — PARTIALLY BUILT

**Goal:** Track menstrual cycles, symptoms, and fertility windows alongside other health data so the AI can correlate cycle phases with symptoms, medication effects, mood patterns, and energy levels.

**Status: Core feature built, cross-feature correlation remaining.**

**What's built:**
- `cycles` table with RLS (`015_cycles.sql`), CRUD via `db.cycles`, included in `loadAll`/`eraseAll`/exports/imports
- Full CycleTracker.jsx UI: CSS grid calendar, stats card, filter pills, record list, add/edit form, deep-link + highlight
- Flo GDPR import (`flo.js` parser + import UI with dedup)
- Cycle predictions (next period, fertile window, ovulation), phase detection (menstrual/follicular/ovulatory/luteal)
- Calendar overlays (period=rose, predicted=dashed rose, fertile=amber, ovulation=amber, symptom=lav)
- AI profile integration (`profile.js` includes cycle stats, avg length, current day, common symptoms)
- Dashboard integration (predicted period in timeline, late period alert with days-late count)
- Search integration, AI tool-use (add/remove cycle entries via chat), quick-log (tap calendar day)

**What's remaining (designed, spec at `docs/superpowers/specs/2026-04-01-cycle-tracker-completion-design.md`):**

| Feature | Description |
|---------|-------------|
| **Shared utility** | Extract cycle logic from CycleTracker.jsx into `src/utils/cycles.js` with new `getCyclePhaseForDate(date, cycles)` for cross-feature use |
| **Vitals correlation** | Phase badges on vitals cards + "Color by cycle phase" toggle on Vitals chart (Recharts ReferenceArea bands at 10% opacity) |
| **Journal correlation** | Phase badges on journal cards + phase info in form + mood-phase summary card (avg mood by cycle phase, collapsible) |
| **AI cycle analysis** | New "Cycle Patterns" feature in AIPanel: bar chart (avg vitals by phase) + AI analysis of phase-correlated patterns |
| **Medication awareness** | Rose "Cycle-related" badge on hormonal/cycle-affected med cards + cycle-related meds in AI profile |
| **Dashboard quick-log** | "Log today" button on cycle timeline entry + "Start tracking" CTA when no cycle data |

**Key Technical Decisions:**
- All correlation is computed on-the-fly (no schema changes) — `getCyclePhaseForDate()` derives phase from existing cycle data at render time
- Calendar UI: CSS grid (not a heavy calendar library) to match existing minimal-dependency approach
- Cycle predictions: simple average-based algorithm, NOT a medical-grade fertility predictor. Clear disclaimer required
- Phase colors: Menstrual=rose, Follicular=sage, Ovulatory=amber, Luteal=lavender (consistent across all surfaces)
- Sensitive data: encrypted at rest like all other health data. Included in backup exports
- Search integration: cycle entries searchable (symptoms, dates, notes)

---

### 4. Apple Health Integration

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

---

### 5. DNA / Promethease / Genomind Integration

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

### 6. External Patient-Resource Integrations (EveryCure + Understood.org, extensible framework)

**Goal:** Cross-reference the user's conditions, medications, symptoms, and journal tags against curated external resource libraries from high-quality nonprofits (EveryCure for drug repurposing research, Understood.org for learning/thinking differences, NORD/NAMI/etc. in future), and surface matched resources at relevant points in the app. For users with rare diseases, neurodivergence, or underserved conditions, this can be genuinely life-changing — surfaces research and expert content they may never have found otherwise.

**Why static/curated data:**
- **EveryCure**: no public query API for their 66M drug-disease matrix; 10 publicly-disclosed active repurposing programs ([portfolio](https://everycure.org/portfolio/)); open-source codebase + MEDIC CC0 dataset
- **Understood.org**: no public API; massive expert-vetted content library (articles, podcasts, videos, community stories) covering ADHD, dyslexia, dyscalculia, dysgraphia, executive function, auditory processing, anxiety, etc.
- Both benefit from **thoughtful human curation** mapping resources → conditions/symptoms that AI search can't replicate reliably

**Architecture:**

```
src/constants/resources/
├── everycure.js      # 10 active repurposing programs (drug ↔ condition pairs, research stage, portfolio URLs)
├── understood.js     # Curated ~40 articles tagged by condition/audience
├── (future)          # NORD, NAMI, Crohn's & Colitis Foundation, rare disease networks, etc.
└── index.js          # Unified matchResources(data) utility
```

Each resource entry has:
- `title`, `url`, `source` (org name), `blurb` (1-2 sentences)
- `conditions: [...]` — condition keys it matches (e.g., `['adhd', 'learning_disability']`)
- `symptomTags: [...]` — (e.g., `['focus', 'memory', 'anxiety']`)
- `medications: [...]` — (EveryCure only: drugs the program investigates)
- `audience: 'self' | 'parent' | 'both'`
- `researchStage?: 'active' | 'trial' | 'published'` (EveryCure)

**Matching utility (`matchResources(data)`):**
- Reads user's `data.conditions[]`, `data.medications[]`, `data.journal_entries[].tags`, `data.settings.health_background`
- Normalizes condition names (fuzzy match: "ADHD" = "attention deficit" = "attention_deficit_hyperactivity_disorder")
- Returns ranked list of matched resources with relevance score
- Deduplicated by URL

**UX surfaces:**

| Surface | Behavior |
|---------|----------|
| **Per-condition "Resources & research" expansion** in Conditions.jsx | Each condition card gets an expandable section listing matched EveryCure programs + Understood articles + existing ClinicalTrials.gov link. If EveryCure has an active program, card gets a small 🔬 research badge. |
| **Dashboard Discover card** | Rotating weekly highlight of top 1-3 unseen resource matches. Dismissible per-resource (stored in localStorage `salve:seen-resources`) so nothing repeats. |
| **Sage AI integration** *(phase 2)* | Sage can cite curated resources when answering health questions: "Understood.org has a great guide on classroom accommodations — [link]. Also EveryCure is researching..." Not AI hallucination — pulled from the curated tagged library. |

**Ethical guardrails (non-negotiable, matches existing app standards):**
- External links open with clear "you're leaving Salve" indicator
- Strong disclaimer on every repurposing-related card: "Research-stage, not standard care. Always discuss with your healthcare provider."
- Never auto-suggest stopping/starting medications
- User can dismiss any resource as not relevant
- Resource cards labeled with source attribution (EveryCure, Understood.org, etc.)

**Data curation scope:**
- **EveryCure**: small — 10 active programs, ~15-30 lines of JSON, updated quarterly as EveryCure publishes
- **Understood.org**: medium — ~40 articles across their core topics (ADHD, dyslexia, executive function, anxiety, social skills, classroom accommodations, workplace accommodations, parenting). Curated once, updated annually.
- **Future orgs**: NORD (rare diseases), NAMI (mental health), condition-specific foundations. Each new org = one new JSON file + content curation.

**Implementation phases:**

| Phase | Work | Est. |
|-------|------|------|
| ~~1~~ | ~~Resource framework: `constants/resources/` + `matchResources()` utility~~ | ✅ Done |
| ~~2~~ | ~~EveryCure portfolio data file: 10 active programs with condition/medication tags~~ | ✅ Done |
| ~~3~~ | ~~Understood.org topic library: ~40 curated articles tagged by condition~~ | ✅ Done |
| ~~4~~ | ~~Conditions.jsx per-condition Resources expansion~~ | ✅ Done |
| ~~5~~ | ~~Dashboard Discover card (rotating highlights)~~ | ✅ Done |
| 6 *(later)* | Sage AI integration: teach chat to cite curated resources | 2-3h |

**Key technical decisions:**
- **No API dependencies** — all resource data ships static in the bundle. Zero runtime external calls.
- **Matching at load time** (memo'd from data changes), not on render — cheap.
- **Extensible pattern** — adding NORD/NAMI/etc. is one new file + curation work, no UI changes needed.
- **Condition-name normalization** critical — user types "ADHD", app stores it lowercase as "adhd", resource file tags with "adhd" — all should match without fancy AI.
- **Respect that repurposing is research-stage** — framing throughout is "conversation starter with your doctor", never "try this drug."

---

## Known Bugs & Audit Findings (2026-04-07)

Confirmed issues from full codebase audit. Fix in order of priority.

### Fix Immediately (confirmed crashes / data integrity)

All fixed.

| # | File | Issue | Status |
|---|------|-------|--------|
| ~~1~~ | `Dashboard.jsx` | `ArrowRight` import missing | **Fixed** — already imported |
| ~~2~~ | `profile.js` | Journal slice direction wrong | **Fixed** — uses `slice(-15)` |
| ~~3~~ | `CycleTracker.jsx` | Infinite loop when `avgLength` is 0 | **Fixed** — guarded with `> 0` check |
| ~~4~~ | `App.jsx` | SagePopup stays open after session expiry | **Fixed** — resets `sageOpen` in `SIGNED_OUT` branch |

### Fix Soon (security / data loss)

All fixed.

| # | File | Issue | Status |
|---|------|-------|--------|
| ~~5~~ | `crypto.js` | Hardcoded PBKDF2 salt | **Fixed** — now uses random 16-byte salt per encryption |
| ~~6~~ | `storage.js` | Legacy v2 import drops v3 tables | **Fixed** — iterates TABLE_MAP keys with empty-array defaults |
| ~~7~~ | `api/gemini.js` | Output token cap too high | **Fixed** — capped at 4096 |
| ~~8~~ | `profile.js` | Sanitizer allows newlines/bidi chars | **Fixed** — `san()` strips `\r\n` and Unicode bidi |
| ~~9~~ | `storage.js` | No table names in failed restore error | **Fixed** — includes affected table names |
| ~~10~~ | `AIPanel.jsx` | Cooldown on failed requests | **Fixed** — `setCooldown` in try block only |

### Polish / UX Gaps

| # | File | Issue | Status |
|---|------|-------|--------|
| ~~11~~ | `CycleTracker.jsx` | Dead `ovDate` code | **Fixed** — removed |
| ~~12~~ | `Medications.jsx` | Bulk link failures silent | **Fixed** — shows failed med names |
| 13 | Multiple sections | **No per-section skeleton loading** — sections show blank state during `dataLoading`. `SkeletonList` exists in `ui/` — apply it to Conditions, Labs, Providers, Allergies, Appointments, Todos, etc. | Open |
| ~~14~~ | `Todos.jsx` | Recurring todos don't auto-create | **Fixed** — auto-creates next occurrence on completion |
| ~~15~~ | `AIPanel.jsx` | No typing indicator before first token | **Fixed** — `ChatThinking` shows during `loading` |
| ~~16~~ | `Settings.jsx` | No warning when revoking AI consent | **Fixed** — confirm dialog with explanation |
| ~~17~~ | `Vitals.jsx` | Hourly data makes chart illegible | **Fixed** — daily aggregation for multi-week views |

### Accessibility

| # | File | Issue | Status |
|---|------|-------|--------|
| ~~18~~ | `Field.jsx` | Validation errors not linked to inputs | **Fixed** — `aria-describedby`, `aria-invalid`, `role="alert"` added |
| ~~19~~ | `SagePopup.jsx` | Focus not trapped in modal | **Fixed** — Tab/Shift+Tab trap implemented |

### Performance

| # | File | Issue | Status |
|---|------|-------|--------|
| ~~20~~ | `profile.js` / `AIPanel.jsx` | `buildProfile()` not memoized | **Fixed** — wrapped in `useMemo` keyed on `data` |
| ~~21~~ | `AIPanel.jsx` | Message list re-renders on keystroke | **Fixed** — extracted to `ChatMessageList` `React.memo` component |
| ~~22~~ | `Dashboard.jsx` | `daysUntil()` duplicated inline | **Fixed** — extracted to `utils/dates.js` |

### Performance Deep Audit (2026-04-07)

Major performance overhaul. App was loading in 10-15 seconds and tab switching was equally slow.

| Fix | File(s) | Root Cause | Impact |
|-----|---------|-----------|--------|
| **Remove `key={tab}`** | `App.jsx` | `<div key={tab}>` forced React to destroy and remount the entire section tree on every tab switch. Dashboard (82KB + 368KB Recharts + 30 useMemo hooks) rebuilt from zero on every navigation. | **CRITICAL — single biggest fix** |
| **useCallback CRUD wrappers** | `App.jsx` | `addItemT`, `updateItemT`, `removeItemT`, `onNav` were plain arrow functions recreated every render, causing all children to re-render on every state change. | CRITICAL |
| **Conditional SagePopup** | `App.jsx` | SagePopup was always mounted with full `data` prop, re-rendering on every data change even when closed. Now only renders when `sageOpen` is true. | HIGH |
| **Dashboard search short-circuit** | `Dashboard.jsx` | `allSearchResults` useMemo depended on full `data` object, running `searchEntities()` across 700+ records on every data change even when nobody was searching. Now returns `[]` when query < 2 chars. | HIGH |
| **No-op navigator lock** | `supabase.js` | `db.loadAll()` fired 24 parallel queries, each calling `getSession()` which acquired an exclusive `navigator.locks` lock. Cascading 5-second timeouts stalled load for 60+ seconds. Disabled lock (single-tab PWA). | CRITICAL |
| **Single RPC load** | `db.js` + migration `022` | Replaced 24 parallel HTTP requests with one `load_all_data()` PostgreSQL RPC function. Falls back to parallel queries if RPC unavailable. | CRITICAL |
| **PBKDF2 100k to 10k** | `crypto.js` | 100,000 PBKDF2 iterations blocked main thread for 200-500ms on every cache read/write. JWT tokens don't need password-level protection. Also fixed broken `prewarmKey()` that used a random salt instead of the cached data's actual salt. | HIGH |
| **Chunked base64** | `crypto.js` | `btoa(String.fromCharCode(...combined))` spread 100K+ bytes as individual function arguments, blocking the main thread for seconds. Replaced with 8KB chunked encoding. | CRITICAL |
| **Bundle split** | `vite.config.js` | 693KB single bundle split into 344KB main + parallel vendor chunks (react 135KB, supabase 194KB, icons 50KB). | HIGH |
| **SW precache 95 to 6** | `vite.config.js` | Every deploy invalidated all 95 precached JS chunks, causing a ~2MB download storm that saturated the connection. Now only precaches HTML + CSS; JS uses browser HTTP cache. | HIGH |
| **SW font cache fix** | `vite.config.js` | Google Fonts CacheFirst strategy failed on fresh SW activation. Changed to StaleWhileRevalidate. | MEDIUM |
| **Token seeding** | `token.js` + `App.jsx` | `getAuthToken()` called `getSession()` independently for every API service. Now seeded from `onAuthStateChange`. | MEDIUM |
| **Instant splash screen** | `index.html` | Added inline loading spinner visible before any JS loads/parses. | MEDIUM |

**Key lessons for future development:**
- **NEVER use `key=` on a wrapper div to trigger animations** — it destroys the entire component subtree. Use CSS transitions or animation classes instead.
- **Always wrap callback props in `useCallback`** — especially CRUD functions and navigation handlers passed to many children.
- **Conditionally render modals/popups** — don't mount hidden components that receive expensive props like `data`.
- **Guard expensive useMemo hooks** — if a computation is only needed under certain conditions (e.g., search is active), short-circuit when those conditions aren't met.
- **Avoid `String.fromCharCode(...largeArray)`** — use chunked processing for any array > 10KB.
- **Keep SW precache minimal** — only HTML/CSS. JS chunks should use browser HTTP cache to avoid download storms on every deploy.
