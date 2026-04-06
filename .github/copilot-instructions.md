# Copilot Instructions — Salve (Health Companion App)

**Source of truth:** the full architecture, directory structure, database schema,
design system, roadmap, and conventions live in [`CLAUDE.md`](../CLAUDE.md) at the
repo root. When you need deep context about a file, table, theme, or feature,
open that document first — it is kept up-to-date. Use `@workspace` chat to have
Copilot read it directly.

The rules below are a condensed summary of the non-negotiables that apply to
every change. Claude Code and VS Code Copilot should both enforce these.

## ⚠️ Pre-launch action items (remind the user!)

The `## Pre-Launch Action Items` section near the top of `CLAUDE.md` contains
a checklist of outside-the-codebase tasks the user must complete before sharing
publicly (Sentry DSN, AI spend caps, RLS verification, etc.). At the start of
each session, glance at it. If you see the user working on launch-adjacent
topics (payments, Reddit, sharing, monitoring, errors, "ready to publish"),
proactively surface the unchecked items — don't wait to be asked.

## Project snapshot

- Vite + React 18 + Tailwind v3, Supabase (PostgreSQL + RLS), Vercel serverless
  API proxies (`api/chat.js`, `api/gemini.js`, `api/drug.js`, `api/provider.js`,
  `api/oura.js`), PWA via `vite-plugin-pwa`.
- **Mobile-first, max-width 480px, phone-optimized.** Desktop is additive: 260px sidebar, wider content columns (820px md / 1060px lg / 1280px xl), 15-16px base font.
- Code-split sections via `lazyWithRetry()` + `Suspense`.
- Encrypted localStorage cache (AES-GCM + PBKDF2 from session token).
- Tiered AI: Gemini (free) + Anthropic Claude (premium) via smart per-feature
  model routing. Feature gating via `isFeatureLocked()`.

## Non-negotiable rules

### Theming
- **Never hardcode hex colors in components.** Use Tailwind `salve-*` classes
  (`bg-salve-card`, `text-salve-lav/20`) or the `C` proxy from
  `src/constants/colors.js` for Recharts/dynamic styles. All colors flow
  through CSS variables set by the active theme.
- `style={{ color: '#xxx' }}` will break theming. Don't do it.
- 15 themes defined in `src/constants/themes.js` (6 core + 9 experimental).
  Each has 16 color keys + 4 ambiance RGB triplets + 3-stop `gradient` array.
- Per-theme CSS effects live in `src/index.css` scoped by `html.theme-{id}`
  selectors. Effects use `body::before` / `body::after` / `html::before` at
  `z-index: 0` with content at z-index 1.
- Default theme is `lilac`.

### Security
- Row Level Security on every Supabase table, scoped to `auth.uid()`.
- Never log or cache secrets. `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `OURA_CLIENT_SECRET` are server-only.
- All user-provided text embedded in AI prompts goes through `san(text, limit)`
  in `src/services/profile.js` (strips `<>{}`, enforces char limits).
- CSP is strict — no `unsafe-inline` or `unsafe-eval` in `script-src`.
- Delete operations ALWAYS require inline confirmation via `ConfirmBar`.
  Never `window.confirm()`.
- AI features are consent-gated via `<AIConsentGate>` / `hasAIConsent()`.

### AI / Sage
- Every AI response surface shows the medical disclaimer:
  "AI suggestions are not medical advice. Always consult your healthcare
  providers." The disclaimer is appended in `src/services/ai.js`.
- Destructive tool-use calls (remove_*) require user confirmation before
  execution via `ToolExecutionCard`.
- Rate limiting is persistent via Supabase `check_rate_limit()` SQL function,
  enforced in `api/_rateLimit.js`.

### Data
- All CRUD flows through `src/services/db.js`. Never write directly to Supabase
  from components.
- Every table has `user_id`, `created_at`, `updated_at` (auto-trigger), and RLS.
- Offline writes queue in `hc:pending` and flush via `setupOfflineSync()`.
- Exports/imports support encrypted + plain JSON. `importRestore()` takes an
  in-memory backup before erasing data.

### Accessibility (WCAG 2.1 Level A)
- Icon-only buttons MUST have `aria-label`.
- Severity/urgency/status badges include an icon prefix (✓/◆/⚠/✦/·/↗) so info
  is not color-only (WCAG 1.4.1).
- Form fields use `Field.jsx` which associates label via `useId()`.
- Semantic HTML: `<nav>` for BottomNav, `<header>` for Header, `<main>` for
  content, `<section aria-label>` for Dashboard cards.
- Charts have `role="img"` + descriptive `aria-label` + `sr-only` data table.

### UX conventions
- Dashboard follows **"Calm Intelligence"** — show actionable info only, not
  data counts.
- Header is clean (no background decor). Sage leaf button on the left (opens
  `SagePopup`), Search magnifier on the right.
- Section headers show title ONLY in `Header.jsx` — no duplicate
  `SectionTitle` below.
- Back button uses `navHistory` stack (returns to previous section, not always
  Home).
- Staggered Dashboard entrance animations via `dash-stagger-*` CSS classes.

## Tooling preferences

- Use `Read` over `cat`, `Glob` over `find`, `Grep` over shell `grep`, `Edit`
  over `sed`.
- Commit format: short imperative subject, blank line, detailed body explaining
  the *why*. No AI-tool attribution lines in commit messages.
- Never skip git hooks (`--no-verify`). If a hook fails, fix the root cause.
- Never force-push to `main` or feature branches.
- Run `npm run build` to verify before committing CSS/JS changes.

## When making changes

1. Read CLAUDE.md's directory structure section to locate the right file.
2. Read the existing file before editing — match its conventions.
3. For theme/visual changes, test on Lilac (default) + 1-2 experimental themes.
4. Don't add docstrings, types, or comments to code you didn't change.
5. Don't create speculative abstractions or "helpers for one-time use".
6. Keep changes scoped to what was asked. Three similar lines of code is
   better than a premature abstraction.
