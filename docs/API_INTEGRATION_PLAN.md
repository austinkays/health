# API Integration Plan

Expand Salve's medical data layer by integrating additional free government and open APIs directly into existing features. No new sections—each API enhances something already in the app.

---

## API Audit & Rankings

Each API was evaluated against its actual live documentation (March 2026) on five dimensions:

| Criterion | What It Measures |
|-----------|-----------------|
| **Data Quality** | Freshness, accuracy, update cadence, official disclaimers |
| **API Quality** | Docs clarity, REST design, response format, error handling |
| **Ease of Integration** | Auth requirements, rate limits, complexity to proxy |
| **UX Value for Salve** | How directly it improves an existing user-facing feature |
| **Reliability** | Uptime history, government backing, maintenance signals |

### Overall Rankings (best → worst fit for Salve)

| Rank | API | Score | Verdict |
|------|-----|-------|---------|
| **1** | Clinical Table Search (ICD-10 + LOINC) | ★★★★★ | Best-in-class autocomplete for medical coding. No key, fast, current data (ICD-10-CM 2026, LOINC 2.81). Directly upgrades Conditions, Labs, and Allergies with zero friction. |
| **2** | RxNorm — Expanded | ★★★★★ | Already integrated for autocomplete + interactions. Expanding to dose/strength autofill, brand/generic cross-ref, and drug class tagging is low-effort and high-reward. No key, great docs. |
| **3** | MyHealthfinder (HHS/ODPHP) | ★★★★☆ | Simple REST (v4.0.1), JSON/XML, no key. Evidence-based plain-language screening recs by age/sex. Perfect for CareGaps. Minor dock: limited endpoint surface, sparse filtering. |
| **4** | ClinicalTrials.gov v2 | ★★★★☆ | Excellent modernized API (OpenAPI 3.0 spec). Rich data: conditions, interventions, locations with GeoPoint, phases, status. Daily updates M-F. No key. Adds a genuinely new capability (trial finder). |
| **5** | OpenFDA — NDC Directory | ★★★½☆ | Updated daily, no key, harmonized fields. Useful for package/manufacturer info on linked meds. Data quality caveat: NDC assignment ≠ FDA approval. Solid but niche enhancement. |
| **6** | OpenFDA — Adverse Events (FAERS) | ★★★☆☆ | Powerful FAERS data (2004–2026), but quarterly updates → **3+ month data lag**. FDA explicitly disclaims causal inference. 240 req/min without key, 120k/day with key. Useful for trend visualization, but requires heavy disclaimers in UI. |
| **7** | OpenFDA — Enforcement (Recalls) | ★★½☆☆ | Weekly updates, but FDA **explicitly warns against using it for public alerts** — recall status is not updated after initial classification. Would need a strong "informational only" frame. Risk of misleading users if presented as actionable. |
| **8** | UMLS Terminology Services | ★★★☆☆ | Most powerful vocabulary cross-mapping available. But: requires free API key (NLM account signup), adds onboarding friction, query syntax is complex. Best value is backend-only (AI prompt enrichment, import normalization) — not user-facing. |
| **9** | WHO Global Health Observatory | ★★☆☆☆ | OData format, cryptic indicator codes (e.g., `TB_1`, `BP_03`), no intuitive browsing. Data is global/population-level — not individual health. Low direct UX value. Only useful as AI grounding data, and even then the effort-to-value ratio is poor. |

### Detailed Audit Notes

#### Clinical Table Search — ★★★★★
- **Base URL:** `https://clinicaltables.nlm.nih.gov/api/{table}/v3/search`
- **Tables useful for Salve:** `icd10cm` (ICD-10-CM 2026), `loinc_items` (LOINC 2.81)
- **Auth:** None. No key, no signup.
- **Rate limits:** Undocumented — no published limits. In practice, NLM services are generous.
- **Response format:** JSON array `[totalCount, codes, extraFields, displayStrings]` — lightweight and fast
- **Params:** `terms` (autocomplete query), `maxList` (up to 500), `df`/`sf`/`cf`/`ef` for field selection, `count`/`offset` for pagination (up to 7,500 total)
- **LOINC bonus:** Returns `units`, `datatype`, `CONSUMER_NAME`, reference range data — can replace/supplement static `labRanges.js`
- **LOINC caveat:** LOINC codes are copyrighted by Regenstrief Institute; must agree to [LOINC Terms of Use](http://loinc.org/terms-of-use). Some individual terms have additional external copyrights (`EXTERNAL_COPYRIGHT_NOTICE` field).
- **ICD-10 search fields:** Code + long description. Returns matching codes with descriptions.
- **Why #1:** Directly solves the medical coding gap in Conditions and Labs. Reuses the exact autocomplete pattern already built for drug search. Near-zero integration risk.

#### RxNorm Expanded — ★★★★★
- **Base URL:** `https://rxnav.nlm.nih.gov/REST/`
- **Key new endpoints:** `/rxcui/{id}/allrelated` (brands, generics, ingredients, dose forms), `/rxcui/{id}/properties` (concept details), plus RxClass at `https://rxnav.nlm.nih.gov/REST/rxclass/`
- **Auth:** None.
- **Rate limits:** NLM asks for "reasonable use" — no hard published cap, but they may throttle heavy abuse.
- **Response format:** Well-structured JSON with `rxclassMinConceptList`, `relatedGroup`, etc.
- **Why #2:** Extends an already-working integration. The `allrelated` endpoint alone gives brand/generic cross-refs, ingredient breakdown, and dose form — all high-value UI data with minimal new code.

#### MyHealthfinder — ★★★★☆
- **Base URL:** `https://odphp.health.gov/myhealthfinder.json` (v4.0.1)
- **Endpoints:** `myhealthfinder.json` (personalized recs), `topicsearch.json` (search topics), `itemlist.json` (list all items)
- **Auth:** None. No key needed. Apache 2.0 license.
- **Filtering:** By age, sex, pregnancy status, tobacco use, sexually active, and specific topic IDs
- **Response format:** JSON or XML, includes plain-language HTML content suitable for direct rendering
- **Languages:** English and Spanish
- **Why #3:** Perfect CareGaps integration — gives real evidence-based screening recs (from USPSTF/CDC) instead of relying solely on AI inference. Plain-language content is ready to display. Only reason it's not ★★★★★ is limited filtering granularity and smaller endpoint surface.

#### ClinicalTrials.gov v2 — ★★★★☆
- **Base URL:** `https://clinicaltrials.gov/api/v2/studies`
- **Auth:** None. No key.
- **Key features:** OpenAPI 3.0 spec, field-level selection via `fields` param, location filtering with GeoPoint, status filters (RECRUITING, COMPLETED, etc.), condition/intervention search
- **Response format:** Modern JSON with nested objects (protocolSection, resultsSection, etc.)
- **Update cadence:** Daily, Monday–Friday
- **Rate limits:** Not explicitly published; standard government API courtesy expected
- **Why #4:** Genuinely new capability — no existing feature does this. Excellent API quality. Docked slightly because it's a net-new feature (new proxy, new UI) rather than enhancing existing flow, and trial data requires careful UX (users shouldn't self-select trials without provider guidance).

#### OpenFDA NDC — ★★★½☆
- **Base URL:** `https://api.fda.gov/drug/ndc.json`
- **Auth:** Optional. 240 req/min without key, 120k/day with key.
- **Update cadence:** Daily (last: 2026-03-27 at time of audit)
- **Data:** Package description, manufacturer, marketing status, route, dosage form, active ingredients, DEA schedule
- **Caveat:** "The NDC directory contains ONLY information about drugs for human use submitted to FDA for NDC assignment." — not all drugs, and NDC assignment ≠ FDA approval.
- **Why #5:** Useful supplementary data for the Medications card, but most of this info is already available from the FDA label data (fda_data JSONB). Incremental value, not transformative.

#### OpenFDA Adverse Events — ★★★☆☆
- **Base URL:** `https://api.fda.gov/drug/event.json`
- **Auth:** Optional. 240 req/min / 1k per day without key; 240 req/min / 120k per day with key.
- **Data range:** 2004 to 2026-01-27 (at time of audit)
- **Update cadence:** Quarterly — **expect 3+ month data lag**
- **Critical disclaimers from FDA:**
  - "FAERS data does have limitations. There is no certainty that the reported event was actually due to the product."
  - "FDA does not require that a causal relationship between a product and event be proven."
  - Reports are voluntary and may be incomplete, biased toward serious events.
- **Why #6:** Interesting for power users who want to see "what others have reported," but the disclaimers are severe. Must frame as "reported events, not proven side effects." The 3-month lag means recent signals won't appear. Good-to-have, not need-to-have.

#### OpenFDA Enforcement / Recalls — ★★½☆☆
- **Base URL:** `https://api.fda.gov/drug/enforcement.json`
- **Auth:** Optional (same limits as above).
- **Update cadence:** Weekly (data through 2026-03-18 at audit)
- **Critical FDA warning:** "Do not rely on openFDA to make decisions regarding medical care. We may limit access." Also: recall classification status is **not updated** after the initial designation — a resolved recall may still appear as active.
- **Why #7 (dropped in ranking):** The stale-status problem is a real UX risk. Showing a user a "recall alert" that was already resolved months ago would cause unnecessary anxiety. FDA themselves say not to use this for public alerting. If implemented at all, needs a strong "informational archive" frame, not real-time alerts.

#### UMLS — ★★★☆☆
- **Base URL:** `https://uts-ws.nlm.nih.gov/rest/`
- **Auth:** Required — free API key via NLM/UMLS account signup
- **Endpoints:** `/search/current` (term search), `/content/current/CUI/{cui}` (concept lookup), `/crosswalk/current/source/{vocab}/{id}` (vocabulary mapping), semantic network relations
- **Rate limits:** Not explicitly published; authentication controls access
- **Complexity:** High — understanding CUI, AUI, source vocabularies, relation types requires medical informatics knowledge
- **Why #8:** Immensely powerful for backend enrichment — vocabulary cross-mapping is exactly what makes AI analysis smarter. But adding an API key requirement complicates setup, and the value is entirely invisible to users (it improves AI accuracy, not UI). Phase 3 material.

#### WHO GHO — ★★☆☆☆
- **Base URL:** `https://ghoapi.azureedge.net/api/`
- **Auth:** None.
- **Format:** OData JSON — verbose, paginated, with cryptic indicator codes
- **Data type:** Population-level statistics (mortality rates, vaccination coverage percentages, disease burden per country) — **not individual health data**
- **Indicator discovery:** Must browse `/api/Indicator?$filter=contains(IndicatorName,'keyword')` to find relevant codes, then query `/api/{IndicatorCode}` for time-series data by country.
- **Why #9 (last):** The data is population-level, not personal health. The indicator code system is opaque. The effort to map relevant indicators to Salve's features (Immunizations coverage, AI grounding) is high relative to the marginal value. An AI could already cite WHO stats via web search. Only consider if all higher-ranked APIs are done.

---

## Current State

| API | Proxy | Used By |
|-----|-------|---------|
| RxNorm (autocomplete + interactions) | `api/drug.js` | Medications, Interactions |
| OpenFDA (drug labels) | `api/drug.js` | Medications (FDA enrichment) |
| NPPES NPI Registry | `api/provider.js` | Providers |

All three are behind auth-gated Vercel serverless functions with rate limiting and in-memory caching.

---

## New APIs & Where They Fit

### 1. NDC Directory API (NLM)

**What it does:** Looks up the 10-digit National Drug Code on any commercial US drug package — includes packaging, manufacturer, product type, route, and marketing status.

**Endpoint:** `https://api.fda.gov/drug/ndc.json` (no key needed)

**Integrate into:** Medications

| Enhancement | Details |
|-------------|---------|
| NDC lookup on linked meds | When a med has an `rxcui`, map it to one or more NDC codes and display package info (brand, manufacturer, packaging form) in the expanded med card alongside the existing FDA summary |
| Pill identifier helper | Show NDC-sourced details (imprint, color, shape if available) so users can verify they have the right pill |
| Refill helper | Store the NDC in the med record so it can be shown at pharmacy pickup or used in future barcode/scan features |

**Implementation:**
- Add `ndc` action to existing `api/drug.js` (keeps it one proxy)
- Add `drugNDC(rxcui)` to `src/services/drugs.js`
- Add optional `ndc` column to `medications` table (migration `008_ndc_column.sql`)
- UI: new "Package Info" accordion row in expanded Medications card

---

### 2. RxNorm API — Expanded (NLM/NIH)

**What it does beyond current use:** Current integration uses `approximateTerm` (autocomplete) and `interaction/list` (interactions). The full RxNorm API also provides dose forms, strengths, ingredient breakdowns, related brands/generics, and therapeutic classes.

**Endpoint:** `https://rxnav.nlm.nih.gov/REST/` (no key needed)

**Integrate into:** Medications, Interactions, AI prompts

| Enhancement | Details |
|-------------|---------|
| Dose/strength autofill | After RxCUI link, fetch available strengths (`/rxcui/{id}/allrelated`) and auto-suggest the `dose` field value |
| Generic ↔ Brand cross-reference | On the med card, show "Also known as: [brand/generic list]" pulled from `/rxcui/{id}/allrelated` |
| Ingredient-level interaction check | Use `/rxcui/{id}/allrelated` to resolve multi-ingredient combos, then check interactions at the ingredient level (catches combo-drug interactions that per-name checks miss) |
| Therapeutic class tagging | Pull drug classes from RxClass (`/rxclass/class/byRxcui`) and store in `fda_data` or a new field — display as badges, feed into AI profile for smarter analysis |

**Implementation:**
- Add `related` and `rxclass` actions to `api/drug.js`
- Add `drugRelated(rxcui)` and `drugClass(rxcui)` to `src/services/drugs.js`
- Update Medications card UI: brand/generic line, class badges
- Update Interactions checker: resolve ingredients before interaction call
- Feed class data into `profile.js` for richer AI context

---

### 3. OpenFDA — Expanded (Adverse Events + Recalls)

**What it does beyond current use:** Current integration pulls drug label data. OpenFDA also exposes adverse event reports (FAERS) and product recalls/enforcement actions.

**Endpoints:**
- `https://api.fda.gov/drug/event.json` — FAERS adverse events (quarterly updates, 3+ month lag)
- `https://api.fda.gov/drug/enforcement.json` — Recall/enforcement data (weekly updates)
- Rate limits: 240 req/min, 1k/day without key; 240 req/min, 120k/day with free API key

**Integrate into:** Medications, Dashboard alerts

> **⚠️ Audit Warning — Adverse Events:** FAERS data has a **3+ month lag** (quarterly release). FDA explicitly states: "There is no certainty that the reported event was actually due to the product." All side-effect displays must include disclaimers. Frame as "reported events" not "side effects."
>
> **⚠️ Audit Warning — Recalls:** FDA warns: **do not use enforcement data for public alerting.** Recall classification status is never updated after initial entry — resolved recalls still appear active. If implemented, must be framed as a "historical archive" only, never as real-time safety alerts. **Demoted to Phase 3.**

| Enhancement | Details |
|-------------|---------|
| Adverse event trends (Phase 2) | For each linked med, query FAERS `/drug/event.json?search=patient.drug.openfda.rxcui:"{rxcui}"&count=patient.reaction.reactionmeddrapt.exact` to show top reported reactions with counts. Must include "These are reported events, not proven side effects" disclaimer prominently. |
| Recall archive (Phase 3, if at all) | Query `/drug/enforcement.json?search=openfda.rxcui:"{rxcui}"&sort=report_date:desc` — display as informational history only. Never frame as "your med has been recalled" — say "historical enforcement records." Consider skipping entirely. |

**Implementation:**
- Add `adverse_events` action to existing `api/drug.js` (keeps it one proxy)
- Add `drugAdverseEvents(rxcui)` to `src/services/drugs.js`
- Medications card: new "Reported Events" collapsible with bar chart of top reactions + prominent disclaimer
- Consider obtaining a free OpenFDA API key for 120k/day quota (store as `OPENFDA_API_KEY` env var)
- Recalls: defer to Phase 3 or skip — if implemented, display only as "Enforcement History" with "status may be outdated" notice

---

### 4. ClinicalTrials.gov API (v2)

**What it does:** Search active and completed clinical trials worldwide. The v2 REST API supports filtering by condition, intervention, location (with GeoPoint), and recruitment status.

**Endpoint:** `https://clinicaltrials.gov/api/v2/studies` (no key needed, OpenAPI 3.0 spec)

> **Audit Highlight:** Modernized v2 API is well-designed — field-level selection, rich nested response format (`protocolSection`, `statusModule`, `contactsLocationsModule` with lat/lon). Status enums: `RECRUITING`, `COMPLETED`, `ACTIVE_NOT_RECRUITING`, etc. Daily updates Mon–Fri. **Add disclaimer: "Discuss any clinical trials with your healthcare provider before considering enrollment."**

**Integrate into:** Conditions, AIPanel, CareGaps

| Enhancement | Details |
|-------------|---------|
| "Find Clinical Trials" per condition | On each Condition's expanded card, add a "Clinical Trials" button that searches ClinicalTrials.gov for the condition name → shows recruiting studies with title, phase, location, and link |
| Location-aware results | Use the user's `location` from their profile to filter trials by proximity |
| AI-powered trial matching | Feed active conditions + medications into AIPanel's "Health Connections" or a new "Research" card — AI summarizes which trials may be relevant and why |
| Care gap integration | In CareGaps, when AI suggests screenings or newer treatments, link to relevant trials |

**Implementation:**
- New serverless function `api/trials.js` (same auth + rate-limit pattern)
- New client service `src/services/trials.js` with `searchTrials(condition, location?)` and `trialDetails(nctId)`
- Conditions card: "Clinical Trials" expandable section
- AIPanel: optional "Research" floating card (similar to News card)
- Add to `vercel.json` functions config with 30s maxDuration

---

### 5. WHO Global Health Observatory (GHO)

**What it does:** Global health statistics — mortality, disease prevalence, nutrition, immunization coverage, etc. across countries.

**Endpoint:** `https://ghoapi.azureedge.net/api/` (no key needed)

> **⚠️ Audit Finding:** OData format with cryptic indicator codes (e.g., `TB_1`, `BP_03`). No intuitive endpoint for browsing relevant indicators. Data is population-level, not individual health. The AI assistant can already cite WHO statistics via web search, making a dedicated integration redundant. **Recommended: Skip unless all higher-priority APIs are complete.**

**Integrate into:** AIPanel (grounding data, low priority), Immunizations (coverage context, low priority)

| Enhancement | Details |
|-------------|---------|
| Contextual health stats in AI | When AI generates health insights or news, it can reference real WHO statistics (e.g., "Flu vaccination coverage in the US was X% in 2025") to ground its suggestions |
| Immunization coverage context | In Immunizations, show global/national vaccination coverage rates alongside the user's own records as context |
| Condition prevalence | In Conditions, optionally show WHO prevalence data for the user's diagnosed conditions |

**Implementation:**
- Add WHO data fetching to `api/chat.js` as an optional tool the AI can call (similar to how web search is passed as a tool), or create a lightweight `api/who.js` proxy
- New helper `src/services/who.js` with `getIndicator(code, country?)` for direct UI use
- Immunizations section: small "Coverage" badge or info line
- Feed selective WHO data points into `profile.js` system prompt for AI grounding

---

### 6. Clinical Table Search Service (NIH)

**What it does:** Autocomplete API for medical coding — ICD-10 (diagnoses), LOINC (lab tests), SNOMED CT, and RxNorm. Perfect for standardizing free-text entries.

**Endpoints:**
- ICD-10: `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search` (ICD-10-CM 2026)
- LOINC: `https://clinicaltables.nlm.nih.gov/api/loinc_items/v3/search` (LOINC 2.81)
- No key needed. Pagination up to 7,500 results. Max 500 per request.

> **Audit Highlight:** This is the #1 ranked API. The autocomplete response format (`[total, codes, extras, displayStrings]`) is lightweight and maps perfectly to Salve's existing drug autocomplete dropdown pattern. LOINC returns `units`, `CONSUMER_NAME`, and reference range data — can dynamically replace/supplement the static `labRanges.js`.
>
> **⚠️ LOINC Copyright:** Codes are copyrighted by Regenstrief Institute. Must agree to [LOINC Terms of Use](http://loinc.org/terms-of-use). Some terms have additional external copyrights — use `ef=EXTERNAL_COPYRIGHT_NOTICE` to check.

**Integrate into:** Conditions, Labs, Allergies

| Enhancement | Details |
|-------------|---------|
| ICD-10 autocomplete for Conditions | When typing a condition name, suggest standardized ICD-10 codes — store the code alongside the name for export interoperability |
| LOINC autocomplete for Labs | When typing a lab test name, suggest LOINC standard codes — auto-fill reference ranges from LOINC where available, supplementing the static `labRanges.js` |
| Standardized allergy coding | Autocomplete allergy substance names from SNOMED CT or RxNorm for consistency |

**Implementation:**
- New serverless function `api/coding.js` (auth + rate-limit, 30 req/min)
- Client service `src/services/coding.js` with `searchICD10(query)`, `searchLOINC(query)`, `searchSNOMED(query)`
- Add optional `icd10_code` column to `conditions` table (migration)
- Add optional `loinc_code` column to `labs` table (migration)
- Conditions form: autocomplete dropdown (same pattern as drug autocomplete in Medications)
- Labs form: autocomplete dropdown for test name, auto-fill unit and reference range from LOINC data
- Allergies form: autocomplete for substance field

---

### 7. UMLS Terminology Services (UTS)

**What it does:** Links medical vocabularies together — maps between ICD-10, SNOMED CT, LOINC, RxNorm, CPT, and dozens more. Requires a free UMLS API key (NLM account).

**Endpoint:** `https://uts-ws.nlm.nih.gov/rest/` (free API key required — pass as `apiKey` query param)

> **Audit Finding:** Since 2022, authentication simplified from ticket-granting system to a simple API key query parameter. Endpoints: `/search/current`, `/content/current/CUI/{cui}`, `/crosswalk/current/source/{vocab}/{id}`. The value is entirely backend — improves AI accuracy and import normalization, but users never see it directly. High complexity (CUI, AUI, source vocab understanding required). **Recommended for Phase 3 or later.**

**Integrate into:** AI context, Import/Export, cross-feature linking

| Enhancement | Details |
|-------------|---------|
| Unified medical concept resolution | When the AI analyzes a user's profile, use UMLS to normalize all conditions, meds, and allergies to a single concept (CUI) — makes cross-referencing way more accurate |
| Import normalization | When importing data from other systems, use UMLS to map incoming codes to Salve's internal representation |
| Smart cross-linking | Automatically link conditions to related meds and vice versa using UMLS relationship data (e.g., link "Type 2 Diabetes" to "Metformin") |
| Allergy ↔ Drug class mapping | Use UMLS to resolve drug classes for allergy cross-reactivity (supports the existing AI medication cross-reactivity feature with real data) |

**Implementation:**
- New env var `UMLS_API_KEY` (Vercel env vars, server-only)
- New serverless function `api/umls.js` (auth + API key + rate-limit)
- Client service `src/services/umls.js` with `lookupConcept(term)`, `crossMap(code, fromVocab, toVocab)`, `getRelated(cui)`
- Used primarily server-side in AI prompt construction and import normalization
- Optional "Learn More" concept link on Conditions cards
- Add to `vercel.json` functions config

---

### 8. MyHealthfinder API (HHS/ODPHP)

**What it does:** Evidence-based, plain-language health recommendations from the US government — preventive care, screenings, lifestyle advice. Available in English and Spanish.

**Endpoint:** `https://odphp.health.gov/myhealthfinder.json` (v4.0.1, no key needed, Apache 2.0 license)

> **Audit Highlight:** Three clean endpoints: `myhealthfinder.json` (personalized recs), `topicsearch.json` (search), `itemlist.json` (list all). Filters by age, sex, pregnancy, tobacco use, sexual activity. Returns plain-language HTML content ready for rendering. English + Spanish. Perfect complement to AI-generated care gap suggestions — adds evidence-based government authority.

**Integrate into:** CareGaps, Dashboard, Settings

| Enhancement | Details |
|-------------|---------|
| Age/sex-based screening recommendations | Using the user's health_background (age, sex if provided), pull personalized preventive care recs from MyHealthfinder → feed directly into CareGaps as system-suggested items |
| Dashboard health tips | Rotate MyHealthfinder tips in the Dashboard insight area (complement AI insight with evidence-based government recs) |
| Localized content | If the user's device/browser locale is Spanish, serve Spanish-language health recommendations |
| Seasonal reminders | Pull timely recommendations (flu season, sun safety) and surface them as Dashboard alerts |

**Implementation:**
- Add to existing `api/chat.js` or create lightweight `api/healthfinder.js`
- Client service `src/services/healthfinder.js` with `getRecommendations(age?, sex?)` and `getTopicById(id)`
- CareGaps: new "Recommended Screenings" section populated from API (distinct from AI-suggested gaps)
- Dashboard: optional "Health Tip" card below AI insight
- Profile fields may need `date_of_birth` and `sex` additions for personalization (migration)

---

## Implementation Priority (Audit-Adjusted)

Priority is now ranked by the audit scores — APIs that scored highest on UX value × ease of integration go first. OpenFDA Recalls dropped from Phase 2 to Phase 3 (consider) due to the stale-status risk; WHO GHO moved to "Consider/Skip" tier.

### Phase 1 — High-value, low-effort (★★★★–★★★★★)

| # | Rank | API | Target Feature | Effort | Audit Notes |
|---|------|-----|---------------|--------|-------------|
| 1 | ★★★★★ | Clinical Table Search | Conditions (ICD-10), Labs (LOINC) autocomplete | Medium | Best-in-class autocomplete. ICD-10-CM 2026, LOINC 2.81. No key. Reuses existing autocomplete pattern. LOINC copyright notice required. |
| 2 | ★★★★★ | RxNorm expanded | Medications (dose autofill, brand/generic, drug class) | Low | Extend existing proxy. `allrelated` + RxClass endpoints. No key. |
| 3 | ★★★★☆ | MyHealthfinder | CareGaps (screening recs), Dashboard (health tips) | Low | v4.0.1, JSON/XML, no key. Plain-language recs by age/sex. Apache 2.0. EN/ES. |

### Phase 2 — New data surfaces (★★★–★★★★)

| # | Rank | API | Target Feature | Effort | Audit Notes |
|---|------|-----|---------------|--------|-------------|
| 4 | ★★★★☆ | ClinicalTrials.gov v2 | Conditions (trial finder), AIPanel (research) | Medium | Excellent OpenAPI 3.0 spec. GeoPoint location filtering. Daily updates. No key. Add medical disclaimer: "Discuss trials with your provider." |
| 5 | ★★★½☆ | OpenFDA NDC | Medications (package info) | Low | Daily updates. Mostly supplementary to existing FDA label data. |
| 6 | ★★★☆☆ | OpenFDA Adverse Events | Medications (reported side effects trend) | Medium | 3+ month data lag (quarterly). Heavy disclaimers required. Frame as "reported events, not proven side effects." Consider optional API key for higher daily quota. |

### Phase 3 — Deep intelligence layer (★★★☆☆)

| # | Rank | API | Target Feature | Effort | Audit Notes |
|---|------|-----|---------------|--------|-------------|
| 7 | ★★★☆☆ | UMLS | AI context enrichment, import normalization | High | Requires free NLM API key. Value is backend-only (invisible to user). Powerful for vocabulary cross-mapping but complex integration. |
| 8 | ★★½☆☆ | OpenFDA Recalls | Dashboard (informational archive only) | Low | **Demoted from Phase 2.** FDA warns against public alerting use. Recall status not updated post-classification. If implemented, frame as "historical recall archive" — never as real-time safety alerts. |

### Consider / Skip (★★☆☆☆)

| # | Rank | API | Reasoning |
|---|------|-----|-----------|
| 9 | ★★☆☆☆ | WHO GHO | Population-level stats with cryptic codes. AI can already cite WHO via web search. Effort-to-value ratio is poor for a personal health app. **Skip unless all above are done.** |

---

## Shared Implementation Patterns

All new integrations should follow the existing patterns established by `api/drug.js` and `api/provider.js`:

1. **Vercel serverless proxy** — never call external APIs from the client
2. **Auth verification** — verify Supabase Bearer token server-side
3. **Rate limiting** — in-memory sliding window, per-user
4. **In-memory cache** — TTL-based, size-bounded (500 entries max)
5. **`fetchWithTimeout()`** — 15s AbortController for external calls
6. **CORS restriction** — allowlisted origins only
7. **Client service module** — thin async wrapper in `src/services/`
8. **Graceful degradation** — API failures never block core UI; show cached or empty state

### Database Migrations Needed

| Migration | Columns |
|-----------|---------|
| `008_medical_coding.sql` | `conditions.icd10_code`, `labs.loinc_code`, `medications.ndc`, `medications.drug_class` |
| `009_profile_demographics.sql` | `profiles.date_of_birth`, `profiles.sex` (optional, for MyHealthfinder personalization) |

### New Vercel Functions

| Function | APIs Proxied | maxDuration |
|----------|-------------|-------------|
| `api/coding.js` | Clinical Table Search | 30s |
| `api/trials.js` | ClinicalTrials.gov v2 | 30s |
| `api/umls.js` | UMLS Terminology Services | 30s |

Existing `api/drug.js` gains new actions: `ndc`, `related`, `rxclass`, `adverse_events`, `recalls`

### Environment Variables

| Variable | Where | Required |
|----------|-------|----------|
| `OPENFDA_API_KEY` | Vercel env vars only | Phase 2 (optional, increases daily quota from 1k to 120k) |
| `UMLS_API_KEY` | Vercel env vars only | Phase 3 only |

All other APIs are free and keyless.
