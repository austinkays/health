# Price Discovery & Trend Analysis — Implementation Plan

## Overview

Add medication and supplement price discovery to Salve, giving users visibility into drug costs and pricing trends. This plan is tailored to the existing architecture: Vite + React, Supabase backend, Vercel serverless proxies, and the established RxNorm/OpenFDA integration pipeline.

---

## What Gemini Got Right vs. What Needs Revision

| Gemini Suggestion | Verdict | Reasoning |
|---|---|---|
| Use CMS NADAC via SODA API | **Keep** | Free, reliable, weekly-updated wholesale drug pricing — perfect primary data source |
| Use RxNorm to map names → NDCs | **Revise** | We already have RxNorm integration (`api/drug.js`). Extend it rather than building a new pipeline. Need to add NDC lookup since we currently only store RxCUI, not NDC |
| Supplement scraping with Playwright | **Drop** | Way too complex for this app. No local server assumption. Users can manually track supplement costs if needed — supplements are out of scope for v1 |
| Rainforest/BlueCart APIs for retail | **Drop** | Paid APIs, fragile, and supplements aren't the core use case |
| React Native / SQLite | **Irrelevant** | This is a Vite + React web app with Supabase + encrypted localStorage cache. No native code |
| Vercel Cron for weekly price pulls | **Revise** | Good idea, but Salve is single-user-scale. Fetch on-demand per medication, cache in Supabase. Cron adds infra complexity for minimal benefit at this scale |
| Cost Plus Drugs deep links | **Keep** | Free, no API needed, predictable URL structure — easy win |
| Price Per Unit calculation | **Keep** | Essential for meaningful comparisons |
| NIH DSLD for supplements | **Defer** | Good idea for a future supplement feature, but out of scope for v1 |
| Store price history in Postgres | **Keep** | Fits perfectly — we already have Supabase with per-user RLS |

---

## Architecture

### Principle: Extend, Don't Rebuild

Salve already has a working drug data pipeline:

```
User types med name
  → drugAutocomplete() → /api/drug → RxNorm approximateTerm
  → selectAcResult() stores {name, rxcui}
  → background drugDetails() → /api/drug → OpenFDA label
  → fda_data JSONB stored on medication record
```

Price discovery plugs into this same flow. When a medication has an `rxcui`, we can:
1. Map RxCUI → NDC(s) via RxNorm
2. Query NADAC pricing via NDC
3. Store price snapshots in a new `drug_prices` table
4. Display pricing inline on medication cards

### Data Flow

```
Medication with rxcui
  ↓
/api/drug?action=price&rxcui=36437
  ↓
api/drug.js:
  1. RxNorm: GET /REST/rxcui/{rxcui}/ndcs.json → [NDC list]
  2. NADAC SODA: GET data.medicaid.gov/resource/...?ndc={ndc} → pricing rows
  3. Return: { ndc, nadac_per_unit, pricing_unit, effective_date, as_of_date }
  ↓
Client stores snapshot in drug_prices table + displays on med card
  ↓
Over time, snapshots accumulate → trend sparkline
```

---

## Phase 1: NADAC Price Lookup (Core Feature)

### 1.1 — Extend `api/drug.js` with `price` action

Add a fourth action to the existing serverless function (no new endpoint needed):

**`/api/drug?action=price&rxcui={rxcui}`**

Steps:
1. **RxCUI → NDC mapping:** Call `https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/ndcs.json` to get the list of NDCs for this drug
2. **NDC → NADAC price:** Query the CMS NADAC dataset via SODA API: `https://data.medicaid.gov/resource/4grx-u5ej.json?ndc={ndc}&$order=as_of_date DESC&$limit=1`
3. **Multi-NDC strategy:** A single RxCUI can map to many NDCs (different manufacturers/package sizes). Query the top few NDCs and return the lowest `nadac_per_unit` as the "best available" price
4. **Cache:** Same 30-minute in-memory cache pattern already used for autocomplete/details/interactions. Cache key: `price:{rxcui}`

**Response shape:**
```json
{
  "rxcui": "36437",
  "ndc": "00049496066",
  "nadac_per_unit": 0.04,
  "pricing_unit": "EA",
  "effective_date": "2026-03-25",
  "as_of_date": "2026-03-27",
  "drug_name": "SERTRALINE HCL 50 MG TABLET",
  "all_prices": [
    { "ndc": "00049496066", "nadac_per_unit": 0.04, "drug_name": "..." },
    { "ndc": "68180035209", "nadac_per_unit": 0.05, "drug_name": "..." }
  ]
}
```

**Rate limit:** Falls under the existing 40 req/min per user bucket.

**External API timeout:** Use existing `fetchWithTimeout()` (15s) for both RxNorm and SODA calls.

### 1.2 — New Supabase table: `drug_prices`

```sql
-- supabase/migrations/011_drug_prices.sql
CREATE TABLE public.drug_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  medication_id uuid REFERENCES public.medications(id) ON DELETE CASCADE NOT NULL,
  rxcui text NOT NULL,
  ndc text,
  nadac_per_unit numeric,
  pricing_unit text DEFAULT 'EA',
  drug_name text,
  effective_date date,
  as_of_date date,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.drug_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own drug prices"
  ON public.drug_prices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for efficient lookups and trend queries
CREATE INDEX idx_drug_prices_med ON public.drug_prices(medication_id, fetched_at DESC);
CREATE INDEX idx_drug_prices_user ON public.drug_prices(user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.drug_prices;
```

### 1.3 — Extend `src/services/drugs.js`

Add one new function following the existing pattern:

```javascript
export async function drugPrice(rxcui) {
  // Same auth + fetch pattern as drugAutocomplete/drugDetails/drugInteractions
  // GET /api/drug?action=price&rxcui={rxcui}
}
```

### 1.4 — Extend `src/services/db.js`

Add `drug_prices` to the CRUD factory. Only needs `list` (filtered by medication_id) and `add` (insert snapshot). No user-facing edit/delete needed.

### 1.5 — Add to `src/constants/defaults.js`

Add `EMPTY_DRUG_PRICE` shape and include `drug_prices: []` in default state.

---

## Phase 2: UI Integration

### 2.1 — Medication Card Pricing Display

In `Medications.jsx`, add pricing info to the expanded medication card (below the existing FDA summary section):

**When no price data exists:**
- Show a "Check Price" button (sage outline, dollar-sign icon) — only visible if the med has an `rxcui`
- Clicking fetches from `/api/drug?action=price`, stores snapshot in `drug_prices`, displays result

**When price data exists:**
- Show inline: `"~$X.XX/unit (NADAC) · Updated Mar 25"` in `textMid` color
- If the med has dose info, calculate estimated monthly cost: `nadac_per_unit × units_per_day × 30`
- Show a "Refresh" icon button to re-fetch (respects the 30-min server cache)

**Styling (consistent with existing design system):**
- Price text in `sage` when low/stable, `amber` when trending up, `rose` when significantly increased
- Use existing Card/Badge components
- Dollar amounts in Montserrat 500 weight

### 2.2 — Price Trend Sparkline

When a medication has 4+ price snapshots in `drug_prices`:
- Render a tiny Recharts `<Sparkline>` (we already have Recharts as a dependency)
- 90-day window, dots at each snapshot
- Color: `sage` for downtrend/flat, `amber` for uptrend
- Tooltip on hover showing date + price
- Placed inline on the expanded medication card, below the price display

### 2.3 — Cost Links Section

Add outbound links below the price display on expanded cards:

| Link | URL Pattern | Notes |
|---|---|---|
| **GoodRx** | Already exists via `goodRxUrl()` in `links.js` | Currently shown as button — keep as-is |
| **Cost Plus Drugs** | `https://costplusdrugs.com/medications/{slug}/` | New. Slug = lowercase generic name, spaces→hyphens. Not all drugs available — link is best-effort |
| **Amazon Pharmacy** | `https://pharmacy.amazon.com/search?query={name}` | New. Free search link, no API needed |

Add `costPlusDrugsUrl(genericName)` and `amazonPharmacyUrl(name)` to `src/utils/links.js`.

### 2.4 — Bulk Price Check

Following the pattern of "Link All" and "Enrich All" in Medications.jsx:

- **"Price Check All"** button appears when 2+ active meds have `rxcui` but no recent price snapshot (last 7 days)
- Sequentially fetches prices for each, shows progress ("Checking 2 of 5...")
- Stores all snapshots in `drug_prices`
- Summary: "Checked 5 medications. Monthly estimate: ~$XX.XX"

### 2.5 — Dashboard Integration

On the Dashboard unified timeline / alerts area:

- If any medication's latest NADAC price increased >15% vs. 30 days prior, show an amber alert: "Price increase detected for {med name}"
- Optional: show total estimated monthly medication cost as a subtle stat on Dashboard (only if user has checked prices for 2+ meds)

---

## Phase 3: Trend Analysis

### 3.1 — Price History View

New sub-view within Medications (not a new top-level section — keep navigation clean):

- Accessible via "Price History" button on expanded med card (when 2+ snapshots exist)
- Full Recharts line chart showing NADAC per-unit price over time
- X-axis: dates, Y-axis: price
- Reference line at the "first recorded price" for visual trend
- Below chart: table of all snapshots with date + price + % change from previous

### 3.2 — Trend Calculation

Simple percentage change, computed client-side from `drug_prices` records:

```
trend = ((latest_price - price_N_days_ago) / price_N_days_ago) × 100
```

Periods: 30-day, 90-day (selectable in price history view).

No server-side computation needed — the `drug_prices` table is small per-user and queries are fast with the `medication_id + fetched_at` index.

### 3.3 — AI Price Context

Extend `src/services/profile.js` (the AI context builder) to optionally include medication cost data:

- When building the health profile for AI prompts, include a brief cost summary: `"Monthly medication costs: ~$XX (based on NADAC pricing)"`
- This enables the AI to factor in cost when making suggestions (e.g., "There may be a lower-cost generic alternative...")

Add to `ai.js` prompt templates for a new AI feature:

- **"Cost optimization"** — AI analyzes the user's medication list and suggests: generic alternatives, therapeutic substitutes, patient assistance programs, manufacturer coupons
- Uses existing `AIConsentGate` and `AIPanel` patterns

---

## Phase 4: Enhanced External Links (Quick Wins)

These require zero backend work — just new URL builders in `links.js`:

| Link | Target | When to Show |
|---|---|---|
| Cost Plus Drugs | `costplusdrugs.com/medications/{slug}/` | On expanded med card, for generic meds |
| Amazon Pharmacy | `pharmacy.amazon.com/search?query={name}` | On expanded med card |
| Blink Health | `blinkhealth.com/search?query={name}` | On expanded med card |
| RxSaver | `rxsaver.com/drugs/{name}` | On expanded med card |
| NeedyMeds | `needymeds.org/generic-drug/{name}` | Patient assistance — show when price is high |
| Medicare Plan Finder | `medicare.gov/plan-compare` | Show in Settings if user has Medicare insurance |

Group these under a "Compare Prices" expandable section on the med card to avoid clutter.

---

## Implementation Order

### Sprint 1: Core Price Lookup
1. Supabase migration `011_drug_prices.sql`
2. Extend `api/drug.js` with `price` action (RxCUI→NDC→NADAC)
3. Extend `src/services/drugs.js` with `drugPrice()`
4. Extend `src/services/db.js` with `drug_prices` CRUD
5. Add price display to medication expanded card
6. Add "Check Price" button for individual meds

### Sprint 2: Bulk & Links
7. "Price Check All" bulk action
8. Add `costPlusDrugsUrl()`, `amazonPharmacyUrl()` to `links.js`
9. "Compare Prices" link section on expanded med card
10. Estimated monthly cost calculation

### Sprint 3: Trends & History
11. Price trend sparkline on med cards (4+ snapshots)
12. Price history sub-view with full chart
13. Dashboard price alert (>15% increase)
14. Trend color coding (sage/amber/rose)

### Sprint 4: AI Integration
15. Add cost data to AI profile context
16. "Cost optimization" AI feature
17. NeedyMeds / patient assistance links for high-cost meds

---

## API Cost Analysis

| API | Cost | Rate Limits | Notes |
|---|---|---|---|
| **RxNorm NDC lookup** | Free | No published limit (be respectful) | Already using RxNorm for autocomplete/interactions |
| **CMS NADAC (SODA)** | Free | 1000 req/hour unauthenticated, higher with app token | App token is free to register |
| **OpenFDA** | Free | Already integrated | No change |
| **GoodRx** | Free (link only) | N/A | URL construction, no API |
| **Cost Plus Drugs** | Free (link only) | N/A | URL construction, no API |
| **Supabase** | Free tier | 500MB DB, 50K rows | `drug_prices` rows are tiny (~200 bytes each) |

**Total incremental cost: $0**

---

## What's Explicitly Out of Scope

1. **Supplement pricing** — No standardized data source. Supplements can be tracked as medications with manual price notes if users want
2. **Real-time retail pharmacy prices** — Would require paid APIs or fragile scraping. NADAC + comparison links is the right tradeoff
3. **Insurance copay estimation** — Requires PBM integration (Express Scripts, CVS Caremark) which is not publicly available
4. **Pharmacy inventory/availability** — No free API exists for this
5. **Automated price alerts/notifications** — No push notification infrastructure. Dashboard alerts on next visit are sufficient
6. **Cron-based background price updates** — Adds infra complexity. On-demand fetch + 7-day staleness check is simpler and sufficient for single-user scale
7. **Local scraping workers** — Assumes hardware the user may not have. The app is a web app, not a local server setup

---

## Schema Impact Summary

| Change | Type |
|---|---|
| New table: `drug_prices` | Migration 011 |
| New fields on `medications`: none | No schema change — pricing lives in its own table |
| New CRUD in `db.js` | `drugPrices.list()`, `drugPrices.add()` |
| New action in `api/drug.js` | `price` (alongside existing `autocomplete`, `details`, `interactions`) |
| New function in `drugs.js` | `drugPrice(rxcui)` |
| New URLs in `links.js` | `costPlusDrugsUrl()`, `amazonPharmacyUrl()`, optionally `blinkHealthUrl()`, `rxSaverUrl()` |
| New UI in `Medications.jsx` | Price display, sparkline, compare links, bulk price check |
| Dashboard change | Price increase alert card |

---

## Security Considerations

- **NADAC data is public** — no PHI exposure risk in querying it
- **Price snapshots are per-user with RLS** — same isolation as all other tables
- **No pharmacy account credentials** — all links are outbound search URLs, not authenticated sessions
- **API proxy pattern preserved** — client never calls NADAC/RxNorm directly, always through authenticated `/api/drug` proxy
- **Rate limiting covers new action** — falls under existing 40 req/min per user bucket
- **Cache key isolation** — price cache keys include rxcui only (not user-specific), which is fine since NADAC prices are public data
