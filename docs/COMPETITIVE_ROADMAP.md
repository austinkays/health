# Salve Competitive Feature Roadmap

> Built from competitive analysis of Bearable, Medisafe, CareClinic, Wave Health, ChatGPT Health, and market research (April 2026).

## Guiding Principles

1. **Speed of daily use wins** — If it takes more than 2-3 minutes to log, people stop. Every feature must be fast.
2. **Free tier stays generous** — Basic tracking is always free. Premium = advanced AI + analytics + themes.
3. **Show, don't ask** — Compute insights from data instead of asking users to rate/assess.
4. **Privacy is a feature** — Encrypted, no data selling, portable. Say it loudly.
5. **Built for chronic illness** — Not a fitness app. Designed for people managing real health complexity.

---

## Phase 1: Correlation Engine (Bearable's Killer Feature)
**Priority: CRITICAL — This is the #1 feature users want across all health apps**
**Timeline: 1-2 sessions**

The data already exists in Salve (vitals, journal mood/symptoms, medications, sleep, cycle phases, activities). The missing piece is automated cross-metric correlation analysis.

### What to build:
- **Correlation computation** (`src/utils/correlations.js`)
  - Pearson/Spearman correlation between all tracked metrics
  - Time-lagged correlations (sleep last night → pain today)
  - Medication start/stop impact analysis (symptoms before vs after starting a med)
  - Cycle phase correlation (mood/symptoms by menstrual phase — partially exists)
  - Minimum data thresholds (need 7+ days of overlap to show a correlation)
  
- **Insights Dashboard card** — "Patterns Salve noticed"
  - Top 3-5 strongest correlations as natural language cards
  - "Your headaches are 60% more frequent on days you sleep under 6 hours"
  - "Pain severity drops by 2 points on days you exercise"
  - "Your energy is highest during the follicular phase"
  - Color-coded: sage (positive/helpful), amber (neutral/interesting), rose (warning/concerning)
  - Tap to see the data behind the insight (mini chart)

- **Per-section correlation badges**
  - Vitals chart: "Correlated with: sleep duration, stress level"
  - Medication card: "Since starting Lexapro (14 days): mood improved 1.2 points avg"
  - Journal: already has mood-by-cycle-phase chart — extend to other correlations

### Technical approach:
- Runs client-side (all data already loaded in useHealthData)
- Memoized computation, recalculates when data changes
- No server calls needed — this is pure math on existing data
- Results cached in localStorage with data hash for invalidation
- Premium tier: AI narration of correlations (Sage explains what the patterns mean)

### Why this matters:
- Bearable's entire premium value prop is correlation insights
- Users in r/ChronicIllness consistently say "I want to know what affects what"
- Salve has MORE data types to correlate than Bearable (meds, labs, PGx, cycle, insurance)
- This is the feature that turns Salve from "tracker" into "health intelligence platform"

---

## Phase 2: Push Notifications & Medication Reminders
**Priority: HIGH — Table stakes for a medication tracking app**
**Timeline: 1-2 sessions**

### What to build:
- **PWA push notification system**
  - Service worker push subscription registration
  - Vercel serverless cron (or Supabase Edge Function) to schedule notifications
  - Supabase table: `notification_preferences` (user_id, type, schedule, enabled)
  
- **Medication reminders**
  - Per-medication reminder times (morning/noon/evening/bedtime + custom)
  - Smart defaults based on medication frequency
  - "Did you take X?" tap notification → quick confirm without opening app
  - Missed dose tracking (if not confirmed within window)
  
- **Other notification types**
  - Appointment reminders (day before + morning of)
  - Refill alerts (configurable days before refill_date)
  - Journal prompt ("How are you feeling today?" — configurable time)
  - Todo due date reminders
  - Weekly health summary notification

### Why this matters:
- Medisafe's ENTIRE value prop is reminders. They just paywalled it (2 meds free).
- Salve tracks medications with way more depth but has zero reminder capability
- Users managing 5+ daily meds NEED reminders — it's not optional

### Technical considerations:
- PWA push requires HTTPS (Vercel provides this)
- Web Push API + service worker for delivery
- Server-side scheduling via Supabase pg_cron or Vercel cron
- Fallback: in-app notification badge for browsers that block push

---

## Phase 3: Doctor-Ready Health Reports
**Priority: HIGH — Clear value prop for doctor visits**
**Timeline: 1 session**

### What to build:
- **Automated periodic health report** (PDF or styled HTML)
  - Configurable period: weekly, biweekly, monthly
  - Sections: medication adherence summary, symptom trends, vital signs with charts, mood patterns, sleep quality trends, notable journal entries, lab results, active conditions status
  - Clean, clinical-looking format optimized for printing/sharing
  - Generated client-side (no PHI sent to external PDF service)

- **Pre-appointment summary**
  - Pulls data since last visit with that provider
  - Auto-includes: symptom changes, medication changes, new lab results, questions prepared
  - "Share with Dr. Smith" button generates a focused report

- **Export options**
  - Download as PDF
  - Copy to clipboard (formatted text for patient portals)
  - Email to self (draft, user sends manually)

### Why this matters:
- Wave Health's entire premium tier is weekly PDF reports
- Users consistently say "I want to show my doctor what's been happening"
- Salve already has the data — just needs a report generator
- Differentiator: Salve's reports include medication intelligence (FDA data, interactions, PGx) that no other app can generate

---

## Phase 4: Structured Onboarding & Setup Wizard
**Priority: MEDIUM — Retention multiplier**
**Timeline: 1 session**

### What to build:
- **Progressive setup wizard** (first launch experience)
  - Step 1: "What brings you here?" (managing medications / tracking symptoms / chronic illness / general wellness)
  - Step 2: Quick profile (name, location — already exists but guide user to it)
  - Step 3: Add your medications (streamlined add flow with RxNorm autocomplete)
  - Step 4: Add your conditions (quick search + add)
  - Step 5: "You're all set!" with personalized next steps based on what they added

- **Contextual feature discovery**
  - After adding first medication: "Did you know Sage can check interactions?"
  - After first journal entry: "Salve will start finding patterns in your entries"
  - After 7 days of data: "Your first weekly insights are ready"
  
- **Empty state improvements**
  - Each section's empty state guides toward the NEXT valuable action
  - Not just "No data yet" but "Add your first medication to start tracking interactions"

### Why this matters:
- Apps with progressive onboarding see 50% better retention
- New users currently land on a beautiful but potentially overwhelming dashboard
- The setup wizard ensures users add enough data for Salve to be useful within 5 minutes
- Reduces "I downloaded it but never set it up" abandonment

---

## Phase 5: Community & Social Proof
**Priority: MEDIUM — Growth multiplier**
**Timeline: 2 sessions**

### What to build:
- **Shareable health insights** (not health data)
  - "I've maintained 95% medication adherence for 30 days" — shareable card
  - "My headache frequency dropped 40% this month" — shareable milestone
  - Privacy-safe: shares achievements, never raw health data
  - Optimized for Twitter/Reddit/Instagram stories
  
- **Condition-specific tips/content**
  - Curated content per condition (extending the existing EveryCure/Understood.org framework)
  - "Living with ADHD" tips that surface when user has ADHD as a condition
  - Community-sourced tips (moderated, future phase)
  
- **Public roadmap / changelog**
  - Simple page showing what's been built and what's coming
  - Users can vote on features (builds investment in the product)
  - Demonstrates active development (users check this — abandoned apps lose trust)

### Why this matters:
- Bearable's Reddit community IS their marketing strategy
- Chronic illness communities (r/ChronicIllness, r/fibromyalgia, r/ADHD) are extremely active and share tools aggressively
- A single Reddit post in the right community can drive thousands of signups
- Shareable milestones turn users into advocates

---

## Phase 6: Wearable & EHR Ecosystem
**Priority: MEDIUM-LOW — Expands data richness**
**Timeline: 2-3 sessions**

### What to build:
- **Expanded wearable support**
  - Garmin Connect API integration (large user base in health-conscious users)
  - Whoop API (growing in chronic illness community)
  - Withings API (body composition, BP monitors)
  - Oura is already built — extend to more data types
  
- **FHIR R4 health record import**
  - Many hospitals now offer FHIR-based patient data export
  - Import medications, conditions, allergies, labs, immunizations from EHR
  - One-time import or periodic sync
  - Positions Salve as "your personal health record" that consolidates everything MyChart fragments

### Why this matters:
- ChatGPT Health's differentiator is EHR integration — Salve should match this
- More data = better correlations = more valuable insights
- Users with multiple providers NEED a single place for all their records
- FHIR is an open standard — no proprietary API needed

---

## Phase 7: Native Mobile App
**Priority: LOW (for now) — Distribution play**
**Timeline: Ongoing**

### Options:
- **Capacitor wrapper** — wraps existing React app as native iOS/Android. Fast path.
- **React Native rewrite** — better performance, native feel. Major effort.
- **PWA improvements** — continue improving the PWA experience (already installable)

### Why this matters (but not yet):
- App Store presence drives discovery and trust
- Push notifications are more reliable in native apps
- But: PWA works well for existing users, and the feature set matters more than the wrapper right now
- Revisit after Phases 1-4 are solid

---

## Implementation Priority Summary

| Phase | Feature | Impact | Effort | Priority |
|-------|---------|--------|--------|----------|
| **1** | Correlation Engine | 🔥🔥🔥🔥🔥 | Medium | **NOW** |
| **2** | Push Notifications & Reminders | 🔥🔥🔥🔥 | Medium | **NEXT** |
| **3** | Doctor-Ready Reports | 🔥🔥🔥🔥 | Low | **SOON** |
| **4** | Onboarding Wizard | 🔥🔥🔥 | Low | **SOON** |
| **5** | Community & Social | 🔥🔥🔥 | Medium | **LATER** |
| **6** | Wearable & EHR | 🔥🔥 | High | **LATER** |
| **7** | Native App | 🔥🔥 | Very High | **FUTURE** |

---

## Competitive Positioning Statement

> **Salve is the only health companion that combines AI-powered data control, pharmacogenomics, medication intelligence, and automated health pattern detection — all in a privacy-first, patient-owned platform.**

No other app lets you say "Add my new prescription" to an AI that knows your full health context, checks it against your genetics, flags interactions with your current meds, and then tracks how it affects your symptoms over time. That's Salve.
