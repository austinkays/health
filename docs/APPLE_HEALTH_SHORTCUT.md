# Apple Health iOS Shortcut — Build Spec

A lightweight alternative to the full Apple Health ZIP export. Users tap the Shortcut on their iPhone, pick a date range, and a JSON blob is copied to the clipboard. Paste into **Settings → Apple Health → Paste from iOS Shortcut** inside Salve.

No network calls. No credentials. HealthKit → clipboard → Salve paste field.

---

## JSON Output Contract

The Shortcut must produce JSON that matches what `src/services/healthkit.js → detectAppleHealthJSON()` and `src/components/ui/AppleHealthImport.jsx → processPaste()` expect:

```json
{
  "_source": "salve-healthkit-shortcut",
  "_version": 1,
  "_generated_at": "2026-04-05T14:23:11Z",
  "_range_days": 7,
  "vitals": [
    { "date": "2026-04-04", "type": "hr",     "value": "68",   "value2": "", "unit": "bpm",    "notes": "Resting avg. Min: 52, Max: 118", "source": "apple_health" },
    { "date": "2026-04-04", "type": "sleep",  "value": "7.3",  "value2": "", "unit": "hrs",    "notes": "",                                "source": "apple_health" },
    { "date": "2026-04-04", "type": "weight", "value": "142.1","value2": "", "unit": "lbs",    "notes": "",                                "source": "apple_health" },
    { "date": "2026-04-04", "type": "bp",     "value": "118",  "value2": "76","unit": "mmHg",  "notes": "",                                "source": "apple_health" },
    { "date": "2026-04-04", "type": "temp",   "value": "98.4", "value2": "", "unit": "°F",     "notes": "",                                "source": "apple_health" },
    { "date": "2026-04-04", "type": "glucose","value": "94",   "value2": "", "unit": "mg/dL",  "notes": "",                                "source": "apple_health" },
    { "date": "2026-04-04", "type": "spo2",   "value": "98",   "value2": "", "unit": "%",      "notes": "",                                "source": "apple_health" }
  ],
  "activities": [
    { "date": "2026-04-04", "type": "Daily Activity", "duration_minutes": null, "distance": null, "calories": 412, "heart_rate_avg": null, "source": "apple_health", "notes": "8,432 steps, 412 kcal active energy" },
    { "date": "2026-04-04", "type": "Running",        "duration_minutes": 32.5, "distance": 5.1,  "calories": 380, "heart_rate_avg": 148,  "source": "Apple Health",  "notes": "" }
  ]
}
```

### Field rules (MUST match existing `healthkit.js` output)

**vitals[]:**
- `date`: `YYYY-MM-DD` string, local date of the reading
- `type`: one of `hr`, `sleep`, `weight`, `temp`, `glucose`, `spo2`, `resp`, `bp`
- `value`: string (not number — matches XML parser output)
- `value2`: string, only used for `bp` (diastolic); else `""`
- `unit`: `bpm`, `hrs`, `lbs`, `°F`, `mg/dL`, `%`, `rpm`, `mmHg`
- `notes`: optional context string
- `source`: **must be** `"apple_health"` (lowercase, underscored) — used for dedup and the source badge

**activities[]:**
- `date`: `YYYY-MM-DD`
- `type`: workout name (`"Running"`, `"Walking"`, `"Yoga"`, etc.) or `"Daily Activity"` for the steps/energy summary row
- `duration_minutes`: number or `null`
- `distance`: number (km) or `null`
- `calories`: number or `null`
- `heart_rate_avg`: number or `null`
- `source`: `"apple_health"` for daily summary, `"Apple Health"` (or device name) for workouts
- `notes`: string, `""` for workouts, summary text for daily activity

### Unit conversions

Shortcuts' Health actions return values in the user's Health app preferred unit. The Shortcut must normalize to Salve's expected units:

| Type | HealthKit unit | Salve unit | Conversion |
|------|----------------|-----------|------------|
| Weight | kg | lbs | × 2.20462, round to 0.1 |
| Weight | lb | lbs | none |
| Temp | °C | °F | × 9/5 + 32, round to 0.1 |
| Temp | °F | °F | none |
| Sleep | minutes | hrs | ÷ 60, round to 0.1 |
| HR | count/min | bpm | round to integer |
| Distance | m | km | ÷ 1000, round to 0.01 |
| Distance | mi | km | × 1.60934 |

### Dedup (already handled by Salve)

The paste handler dedupes against existing rows using:
- vitals: `date|type|value`
- activities: `date|type|duration_minutes`

So re-running the Shortcut with overlapping ranges is safe — duplicates are dropped automatically.

---

## Shortcut Build Steps

Open the **Shortcuts** app on iPhone → tap **+** (new) → name it `Salve Health Sync`. Add a HealthKit icon (or Heart).

### 1 — Inputs

**Action: Choose from Menu**
- Prompt: `"How many days?"`
- Items:
  - `Last 7 days`
  - `Last 14 days`
  - `Last 30 days`
  - `Last 90 days`

Inside each branch, set a **Variable** called `DaysBack` to `7`, `14`, `30`, or `90`.

**Action: Get Current Date** → store as `EndDate`
**Action: Adjust Date** → `EndDate` minus `DaysBack` days → store as `StartDate`

### 2 — Build the vitals array

Create an empty **List** variable called `Vitals`. Then, for each day in the range, pull one daily summary per vital type.

**Action: Repeat with Each** → over a day range. The easiest way to generate a day range is:

- **Set Variable** `CurrentDate` to `StartDate`
- **Repeat** `DaysBack` times:
  - (body of loop — see below)
  - **Adjust Date** `CurrentDate` by +1 day → `CurrentDate`

Inside the loop body, for each vital type:

#### 2a — Heart Rate (daily average)

- **Find Health Samples Where** — type `Heart Rate`, start date is `CurrentDate`, end date is `CurrentDate + 1 day`
- **Get Statistics** from samples → Average → store as `HR_Avg`
- **Get Statistics** from samples → Minimum → `HR_Min`
- **Get Statistics** from samples → Maximum → `HR_Max`
- **Count** samples → `HR_Count`
- **If** `HR_Count > 0`:
  - **Round** `HR_Avg` to 0 places
  - **Dictionary**:
    ```
    date    → Format Date: CurrentDate as yyyy-MM-dd
    type    → hr
    value   → HR_Avg (as text)
    value2  → (empty)
    unit    → bpm
    notes   → "HR_Count readings. Min: HR_Min, Max: HR_Max"
    source  → apple_health
    ```
  - **Add to Variable** `Vitals`

#### 2b — Resting Heart Rate (if available, overrides HR)

- **Find Health Samples Where** — type `Resting Heart Rate`, date = `CurrentDate`
- **Get Statistics** → Latest
- If found, build dict with `type: "hr"`, `notes: "Resting rate"`, append to `Vitals` (the dedup on `date|type|value` will pick the appropriate one)

#### 2c — Sleep Analysis

- **Find Health Samples Where** — type `Sleep Analysis`, category is `Asleep` (Core, Deep, REM, Unspecified — Shortcuts exposes "Asleep" as a combined filter)
- **Get Statistics** → Total Duration → minutes → `SleepMins`
- If `SleepMins > 0`:
  - `SleepHrs = SleepMins / 60`, round to 0.1
  - Dict: `{ date, type: "sleep", value: SleepHrs, unit: "hrs", source: "apple_health" }` → append

#### 2d — Steps (→ activities, not vitals)

- **Find Health Samples Where** — type `Steps`, date = `CurrentDate`
- **Get Statistics** → Sum → `StepSum`
- Save for activities step below.

#### 2e — Active Energy

- **Find Health Samples Where** — type `Active Energy`, date = `CurrentDate`
- **Get Statistics** → Sum (kcal) → `EnergyKcal`

#### 2f — Body Mass (latest that day)

- **Find Health Samples Where** — type `Weight`, date = `CurrentDate`, sort by date descending, limit 1
- If found, value → `WeightLbs` (convert from kg if unit is kg: `kg × 2.20462`)
- Append: `{ date, type: "weight", value: WeightLbs, unit: "lbs", source: "apple_health" }`

#### 2g — Body Temperature

- **Find Health Samples Where** — type `Body Temperature`, date = `CurrentDate`, latest
- Convert C → F if needed: `(C × 9/5) + 32`
- Append: `{ date, type: "temp", value: TempF (rounded to 0.1), unit: "°F" }`

#### 2h — Blood Glucose

- **Find Health Samples Where** — type `Blood Glucose`, date = `CurrentDate`, latest
- Append: `{ date, type: "glucose", value, unit: "mg/dL" }`

#### 2i — Oxygen Saturation

- **Find Health Samples Where** — type `Oxygen Saturation`, date = `CurrentDate`, statistic = Average
- Value is 0–1 fraction; multiply by 100, round to integer
- Append: `{ date, type: "spo2", value, unit: "%" }`

#### 2j — Respiratory Rate

- Similar to SpO2. Append: `{ date, type: "resp", value, unit: "rpm" }`

#### 2k — Blood Pressure (paired)

- **Find Health Samples Where** — type `Blood Pressure`, date = `CurrentDate`, latest reading
- Each BP sample contains both systolic + diastolic
- Append: `{ date, type: "bp", value: Systolic, value2: Diastolic, unit: "mmHg" }`

#### 2l — Daily Activity Summary (→ Activities)

- If `StepSum > 0` or `EnergyKcal > 0`:
  - `notes = "{StepSum} steps{, {EnergyKcal} kcal active energy if energy > 0}"`
  - Dict: `{ date, type: "Daily Activity", duration_minutes: null, distance: null, calories: Round(EnergyKcal), heart_rate_avg: null, source: "apple_health", notes }`
  - Append to `Activities` list

### 3 — Workouts (separate, not per-day loop)

**Outside the day loop** (workouts are queried once over the full range):

- **Find All Workouts Where** — start date between `StartDate` and `EndDate`
- **Repeat with Each** workout:
  - `date` = Format Date: workout.startDate as `yyyy-MM-dd`
  - `type` = map `workoutActivityType` to friendly name (see mapping table below). Shortcuts gives e.g. "Running", "Walking" as strings already.
  - `duration_minutes` = workout.duration in minutes, round to 0.1
  - `distance` = workout.totalDistance in km (convert from m or mi if needed)
  - `calories` = workout.totalEnergyBurned (kcal), round to integer
  - `heart_rate_avg` = **Find Health Samples Where** type `Heart Rate`, start ≥ workout.startDate, end ≤ workout.endDate → Average → rounded; else `null`
  - Dict with those fields + `source: workout.source`, `notes: ""`
  - Add to `Activities`

**Workout type mapping** (Shortcuts usually gives these directly, but normalize):

| Shortcuts string | Salve type |
|------------------|-----------|
| Running, Run | `Running` |
| Walking, Walk | `Walking` |
| Cycling, Bike | `Cycling` |
| Swimming | `Swimming` |
| Hiking | `Hiking` |
| Yoga | `Yoga` |
| Functional Strength Training, Traditional Strength Training | `Strength Training` |
| High Intensity Interval Training | `HIIT` |
| Elliptical | `Elliptical` |
| Rowing | `Rowing` |
| Dance | `Dance` |
| Pilates | `Pilates` |
| Cooldown | `Cooldown` |
| Core Training | `Core Training` |
| Mixed Cardio | `Mixed Cardio` |
| Stair Climbing, Stair Stepper | `Stair Climbing` |
| _other_ | strip `HKWorkoutActivityType` prefix, else `Other` |

### 4 — Assemble envelope

- **Dictionary**:
  ```
  _source       → salve-healthkit-shortcut
  _version      → 1
  _generated_at → Format Date: Current Date as ISO 8601
  _range_days   → DaysBack
  vitals        → Vitals (the list)
  activities    → Activities (the list)
  ```
- **Get Contents of Dictionary** → converts to JSON text

### 5 — Deliver

- **Copy to Clipboard** → the JSON text
- **Show Notification** → `"Salve: copied {Vitals count} vitals + {Activities count} activities. Paste into Settings → Apple Health."`

(Optional: also **Quick Look** the JSON so the user can sanity-check.)

---

## Testing Procedure

1. **Build in Shortcuts app** following steps above.
2. **Run on iPhone** → pick "Last 7 days" → grant HealthKit permissions on first run.
3. **Inspect clipboard** — paste into Notes, confirm JSON is valid (no trailing commas, all brackets closed).
4. **Open Salve** → Settings → Apple Health → Paste from iOS Shortcut → paste → verify preview shows reasonable counts.
5. **Import** → verify data appears in Vitals chart + Activities list + Dashboard.
6. **Re-run Shortcut** with same range → Salve should show "0 new, N duplicates skipped" (dedup working).
7. **Edge cases to test:**
   - Day with no data at all (should skip, not add empty records)
   - Day with only some vitals (e.g., no weight) — no `weight` row for that day
   - BP reading — confirm systolic and diastolic both appear in one row
   - Workout with no HR samples in window — `heart_rate_avg: null`
   - Weight in kg vs lbs (change Health app unit, re-export, confirm lbs output)

---

## Distribution

iOS Shortcuts can't be committed to this repo as a binary. Distribution options:

### Option A — iCloud share link (recommended)

1. In Shortcuts app, tap Share → Copy iCloud Link
2. Host that link in Salve's Settings → Apple Health section:
   ```jsx
   <a href="https://www.icloud.com/shortcuts/XXXXXXXXXX">Install Salve Health Shortcut</a>
   ```
3. When Apple updates the Shortcut spec, re-share and update the link.

**Trade-off:** iCloud links require Apple ID sign-in and one-time security approval (Settings → Shortcuts → Allow Untrusted Shortcuts — Apple removed this toggle in iOS 15+; iCloud-shared shortcuts now install with just a confirmation prompt if signed in).

### Option B — Shortcut gallery submission

Submit to Apple's public Shortcuts gallery. More visibility but requires Apple review.

### Option C — User builds it themselves

Link to this doc from Settings. Advanced users only.

---

## Maintenance Notes

- **HealthKit sample types:** Apple adds new types each iOS release. Check annually for new relevant types (e.g., `irregular_heart_rhythm`, `vo2_max`, `heart_rate_variability`).
- **Shortcut schema versioning:** If the contract changes, bump `_version` and gate parsing in `detectAppleHealthJSON()` on version.
- **Size limits:** Clipboard can handle several MB easily. A 90-day sync produces ~200-500 records → well under 100KB JSON.

---

## Why this over direct HealthKit API?

PWAs have no HealthKit access. A native iOS app would bypass this entirely, but that's a massive investment (App Store, native codebase, separate release cycle). The Shortcut is a zero-backend, zero-native-code bridge that gets 95% of the value for a one-time build cost.
