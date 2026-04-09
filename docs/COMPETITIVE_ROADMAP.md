# Salve Competitive Feature Roadmap

> Built from competitive analysis of Bearable, Medisafe, CareClinic, Wave Health, ChatGPT Health, and market research (April 2026).
> Updated: April 8, 2026 — Phase 1 complete, compliance strategy added.

## Guiding Principles

1. **Speed of daily use wins** — If it takes more than 2-3 minutes to log, people stop. Every feature must be fast.
2. **Free tier stays generous** — Basic tracking is always free. Premium = advanced AI + analytics + themes.
3. **Show, don't ask** — Compute insights from data instead of asking users to rate/assess.
4. **Privacy is a feature** — Encrypted, no data selling, portable. Say it loudly.
5. **Built for chronic illness** — Not a fitness app. Designed for people managing real health complexity.
6. **Stay in the wellness lane** — User-entered data + wearable sync = wellness app (no FDA, lighter HIPAA). Clinical record imports (FHIR) = regulated health app. Know which lane you're in.

---

## Compliance & Regulatory Strategy

### Current state: Wellness App (lighter regulation)
- Users enter their own data manually or sync from wearables (Oura, Apple Health)
- Data stored in Supabase with RLS + encrypted localStorage cache
- AI features send user-consented health profile to Gemini/Anthropic (no BAA in place)
- **Not** pulling clinical records from hospitals/EHRs
- Falls under FTC Act (no deceptive practices) + state privacy laws, NOT full HIPAA

### PHI reality check
Salve already transmits PHI to AI providers when Sage analyzes health data:
- Medication names, dosages, conditions, lab results, symptoms → sent to Gemini/Anthropic APIs
- User explicitly consents via AIConsentGate before any data is shared
- Neither Anthropic nor Google currently offer BAAs for their consumer AI APIs
- **Risk level**: Low for a wellness app with explicit consent. Medium if scaling commercially.

### If/when moving to clinical data (FHIR):
- Requires BAA with hosting provider (Vercel doesn't offer BAAs — would need AWS/GCP/Azure)
- Supabase Pro offers HIPAA compliance + BAA
- Need audit logging for all PHI access
- Must implement breach notification procedures
- Encryption at rest + in transit (already done)
- **Recommendation**: Don't cross this bridge until commercially viable. The wellness lane is where 99% of user value lives.

### If/when going commercial:
- Vercel Pro plan required ($20/mo — commercial use)
- Anthropic/Google enterprise API tiers with BAAs
- Consider on-device AI (Apple Intelligence, local LLMs) to avoid transmitting PHI entirely
- Privacy policy update needed (currently in Legal.jsx)

---

## Phase 1: Correlation Engine ✅ COMPLETE
**Shipped: April 8, 2026**

Client-side health pattern detection engine. Analyzes relationships between sleep, pain, mood, exercise, medications, cycle phases, and symptoms. Natural-language insight cards on Dashboard + full Insights section.

**What shipped:**
- `src/utils/correlations.js` — 830-line pure math engine (pearson, categorical splits, before/after, trends)
- 6 analysis passes: sleep impact, exercise impact, medication before/after, cycle phase, 14-day trends, symptom frequency
- Dashboard "Patterns" card with top 3 insights
- Full Insights section with filters, mini bar charts, trend arrows
- AI narration for premium users (Sage rewrites insights in warm, actionable tone)
- Demo data tuned to showcase clear patterns for Jordan

---

## Phase 2: Push Notifications & Medication Reminders
**Priority: HIGH — Table stakes for a medication tracking app**
**Timeline: 1-2 sessions**

### What to build:
- **PWA push notification system**
  - Service worker push subscription registration
  - Vercel serverless cron or Supabase Edge Function for scheduling
  - `notification_preferences` table (user_id, type, schedule, enabled)
  
- **Medication reminders**
  - Per-medication reminder times (morning/noon/evening/bedtime + custom)
  - "Did you take X?" notification → quick confirm without opening app
  - Missed dose tracking
  
- **Other notifications**
  - Appointment reminders (day before + morning of)
  - Refill alerts (configurable days before refill_date)
  - Journal prompt ("How are you feeling today?")
  - Todo due date reminders
  - Weekly health summary notification

### Why this matters:
- Medisafe just paywalled reminders to 2 meds free (Jan 2026). Users are fleeing.
- Salve tracks medications with way more depth but has zero reminder capability.
- Users managing 5+ daily meds NEED reminders — it's not optional.

---

## Phase 3: Doctor-Ready Health Reports
**Priority: HIGH — Clear value prop for doctor visits**
**Timeline: 1 session**

### What to build:
- **Automated health report** (PDF or styled HTML)
  - Configurable period: weekly, biweekly, monthly
  - Sections: medication adherence, symptom trends, vitals with charts, mood patterns, sleep, notable journal entries, lab results, correlation insights
  - Generated client-side (no PHI sent to external PDF service)

- **Pre-appointment summary**
  - Data since last visit with a specific provider
  - Symptom changes, medication changes, new labs, prepared questions

- **Export options**
  - Download as PDF
  - Copy to clipboard (for patient portals)

### Why this matters:
- Wave Health's entire premium tier is weekly PDF reports
- Salve's reports can include medication intelligence (FDA data, interactions, PGx) that no other app generates

---

## Phase 4: Onboarding Wizard
**Priority: MEDIUM — Retention multiplier**
**Timeline: 1 session**

### What to build:
- **Progressive setup wizard** (first launch)
  - "What brings you here?" (managing meds / tracking symptoms / chronic illness / general wellness)
  - Quick profile, add medications (with RxNorm), add conditions
  - "You're all set!" with personalized next steps

- **Contextual feature discovery**
  - After adding first medication: "Sage can check interactions"
  - After first journal entry: "Salve will start finding patterns"
  - After 7 days: "Your first insights are ready"

### Why this matters:
- 50% better retention with progressive onboarding
- Ensures users add enough data for Salve to be useful within 5 minutes

---

## Phase 5: Terra API — Universal Wearable Support
**Priority: MEDIUM — Biggest hardware unlock**
**Timeline: 1-2 sessions**

### What to build:
- **Terra API integration** (single API → 40+ wearable brands)
  - Fitbit, Garmin, Whoop, Withings, Samsung, Dexcom, Apple Watch, and more
  - One OAuth flow, standardized JSON payloads
  - Auto-sync: vitals (HR, SpO2, sleep, steps, glucose), workouts, body measurements

- **Data normalization layer**
  - Map Terra's standardized payloads to Salve's vitals/activities tables
  - Dedup against existing manual entries and Oura data
  - Source badges on vitals cards (already exists for Oura/Apple Health)

### Why it's a separate phase from Oura:
- Oura integration is already built (direct V2 API, OAuth2 flow)
- Terra replaces the need to build individual integrations for every other wearable
- One integration = 40+ devices vs. building them one at a time

### Pricing:
- Terra API is usage-based, reasonable for small apps
- Free tier available for development/testing

### Technical approach:
- Vercel serverless proxy (same pattern as `api/oura.js`)
- Terra webhook for real-time data push (vs. polling)
- User connects wearables in Settings → Terra widget handles OAuth

---

## Phase 6: Community & Social Proof
**Priority: MEDIUM — Growth multiplier**
**Timeline: 2 sessions**

### What to build:
- **Shareable health milestones** (not health data)
  - "95% medication adherence for 30 days" — shareable card
  - "Headache frequency dropped 40% this month" — shareable milestone
  - Privacy-safe: shares achievements, never raw data

- **Condition-specific curated content**
  - Extending EveryCure/Understood.org framework
  - "Living with ADHD" tips when user has ADHD

- **Public roadmap / changelog**
  - Shows what's been built + what's coming
  - Feature voting (builds investment)

### Why this matters:
- Bearable's Reddit community IS their marketing
- A single post in r/ChronicIllness can drive thousands of signups

---

## Phase 7: FHIR Health Record Import (Compliance Gate)
**Priority: LOW — Only pursue if going commercial**
**Timeline: 3+ sessions + compliance work**

### What to build:
- **FHIR R4 aggregator integration** (Flexpa, 1upHealth, or Particle Health)
  - Patient authenticates with their hospital portal
  - Import: medications, conditions, allergies, labs, immunizations, procedures
  - One-time import or periodic sync

### Prerequisites (BEFORE building):
- [ ] BAA with Supabase (Pro plan)
- [ ] BAA with hosting provider (may need to move serverless functions off Vercel to AWS/GCP)
- [ ] BAA with FHIR aggregator
- [ ] Audit logging implementation
- [ ] Breach notification procedure documented
- [ ] Privacy policy updated for clinical data handling
- [ ] Legal review of HIPAA obligations

### Why this is gated:
- Pulling clinical records from Epic/Cerner crosses from "wellness app" to "regulated health app"
- Requires BAAs with every vendor in the data chain
- Vercel doesn't offer BAAs — may need infrastructure changes
- The compliance cost is real ($5-20K+ for legal review, infrastructure changes)
- **Only worth it if Salve has paying users who need this**

### The alternative (cheaper, still powerful):
- Users can manually enter or import data from MyChart/portal downloads
- Apple Health Records (FHIR via HealthKit) — available once native app exists
- This keeps Salve in the wellness lane while still consolidating records

---

## Phase 8: Native Mobile App
**Priority: LOW — Distribution play**
**Timeline: Ongoing**

### Options:
- **Capacitor wrapper** — wraps existing React app as native iOS/Android. Fast path.
  - Unlocks: direct HealthKit API, Health Connect API, reliable push notifications, App Store presence
- **React Native rewrite** — better performance, native feel. Major effort.
- **PWA improvements** — continue improving (already installable)

### Why native eventually matters:
- Direct HealthKit/Health Connect API access (no XML import workaround)
- App Store presence drives discovery and trust
- Push notifications are more reliable in native apps
- But: feature set matters more than wrapper. Revisit after Phases 1-5.

---

## Implementation Priority Summary

| Phase | Feature | Impact | Effort | Status |
|-------|---------|--------|--------|--------|
| **1** | Correlation Engine | ★★★★★ | Medium | **✅ DONE** |
| **2** | Push Notifications & Reminders | ★★★★ | Medium | **NEXT** |
| **3** | Doctor-Ready Reports | ★★★★ | Low | SOON |
| **4** | Onboarding Wizard | ★★★ | Low | SOON |
| **5** | Terra API (40+ wearables) | ★★★ | Medium | LATER |
| **6** | Community & Social | ★★★ | Medium | LATER |
| **7** | FHIR Health Records | ★★ | Very High | GATED (compliance) |
| **8** | Native App | ★★ | Very High | FUTURE |

---

## Competitive Positioning Statement

> **Salve is the only health companion that combines AI-powered data control, pharmacogenomics, medication intelligence, and automated health pattern detection — all in a privacy-first, patient-owned platform.**

No other app lets you say "Add my new prescription" to an AI that knows your full health context, checks it against your genetics, flags interactions with your current meds, and then tracks how it affects your symptoms over time. That's Salve.

### Regulatory positioning:
Salve is a **wellness and diary app** — not a diagnostic tool, not a clinical system. Users own and control their data. AI features provide information, not medical advice. This keeps Salve in the lighter-regulation lane while still delivering more health intelligence than any competitor.
