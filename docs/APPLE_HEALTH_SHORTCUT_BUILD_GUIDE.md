# Salve Health Sync — iOS Shortcut Build Guide

Step-by-step instructions to build the Apple Health sync shortcut. The shortcut pulls whatever health data exists on the user's iPhone and copies it as JSON to the clipboard. Paste into Salve's Settings → Apple Health → Paste from iOS Shortcut.

**Key principle: every health query is wrapped in a Count → If > 0 guard.** Not every user tracks every type. The shortcut must never crash on missing data — it silently skips any type with zero samples.

---

## Setup

1. Open **Shortcuts** app on iPhone
2. Tap **+** (new shortcut)
3. Name it **Salve Health Sync**
4. Tap the icon → pick a Heart icon, red color

---

## Step 1: Date Range Picker

Add these actions in order:

### 1a. Choose from Menu
- **Prompt:** `How many days?`
- **Options:** `Last 7 days`, `Last 14 days`, `Last 30 days`, `Last 90 days`

### 1b. Inside each menu branch:
- **Action:** Set Variable
- **Variable Name:** `DaysBack`
- **Value:** `7` (or `14`, `30`, `90` for each branch)

### 1c. After the menu (outside all branches):
- **Action:** Get Current Date → set variable `EndDate`
- **Action:** Adjust Date → subtract `DaysBack` days from `EndDate` → set variable `StartDate`

---

## Step 2: Initialize Empty Lists

- **Action:** Set Variable `Vitals` to empty List
- **Action:** Set Variable `Activities` to empty List

---

## Step 3: Day-by-Day Loop

- **Action:** Set Variable `CurrentDate` to `StartDate`
- **Action:** Repeat `DaysBack` times

Everything in Steps 4–13 goes **inside this Repeat loop**. At the end of the loop body:

- **Action:** Adjust Date → add 1 day to `CurrentDate` → save back to `CurrentDate`

---

## Step 4: Heart Rate (inside loop)

```
Find Health Samples Where
  Type: Heart Rate
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples]

If [Count] is greater than 0
  Get Statistics of [Health Samples]
    → Average → round to 0 decimal places → variable HR_Avg
  Get Statistics of [Health Samples]
    → Minimum → variable HR_Min
  Get Statistics of [Health Samples]
    → Maximum → variable HR_Max

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd" (custom format)
    type    → hr
    value   → HR_Avg (as text)
    value2  → (empty string)
    unit    → bpm
    notes   → "[Count] readings. Min: [HR_Min], Max: [HR_Max]"
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

---

## Step 5: Sleep Analysis (inside loop)

```
Find Health Samples Where
  Type: Sleep Analysis
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples]

If [Count] is greater than 0
  Get Statistics of [Health Samples]
    → Total Duration (minutes) → variable SleepMins

  If [SleepMins] is greater than 0
    Calculate: SleepMins / 60 → variable SleepHrs
    Round [SleepHrs] to 1 decimal place

    Dictionary:
      date    → Format Date: CurrentDate as "yyyy-MM-dd"
      type    → sleep
      value   → SleepHrs (as text)
      value2  → (empty string)
      unit    → hrs
      notes   → (empty string)
      source  → apple_health

    Add [Dictionary] to variable Vitals
  End If
End If
```

---

## Step 6: Weight (inside loop)

```
Find Health Samples Where
  Type: Body Mass
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)
  Sort by: Date (newest first)
  Limit: 1

Count [Health Samples]

If [Count] is greater than 0
  Get [Health Sample] → value → variable WeightVal

  # Unit conversion: if your Health app uses kg, convert to lbs
  # Check by looking at the unit — if it contains "kg":
  #   Calculate: WeightVal × 2.20462 → WeightVal
  # Round to 1 decimal place
  # If already in lbs, just round to 1 decimal

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → weight
    value   → WeightVal (as text)
    value2  → (empty string)
    unit    → lbs
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

**Weight unit tip:** Most US iPhones default to lbs. If yours is in kg, add a Calculate action: `value × 2.20462` before building the dictionary. You can check in Health app → Browse → Body Measurements → Weight → Unit.

---

## Step 7: Body Temperature (inside loop)

```
Find Health Samples Where
  Type: Body Temperature
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)
  Sort by: Date (newest first)
  Limit: 1

Count [Health Samples]

If [Count] is greater than 0
  Get [Health Sample] → value → variable TempVal

  # Unit conversion: if in Celsius, convert to Fahrenheit
  #   Calculate: (TempVal × 9 / 5) + 32 → TempVal
  # Round to 1 decimal place

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → temp
    value   → TempVal (as text)
    value2  → (empty string)
    unit    → °F
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

**This is the one that was crashing.** The `If [Count] is greater than 0` guard prevents the error when you have no temperature data.

---

## Step 8: Blood Glucose (inside loop)

```
Find Health Samples Where
  Type: Blood Glucose
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)
  Sort by: Date (newest first)
  Limit: 1

Count [Health Samples]

If [Count] is greater than 0
  Get [Health Sample] → value → variable GlucoseVal
  Round to 0 decimal places

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → glucose
    value   → GlucoseVal (as text)
    value2  → (empty string)
    unit    → mg/dL
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

---

## Step 9: Blood Oxygen / SpO2 (inside loop)

```
Find Health Samples Where
  Type: Oxygen Saturation
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples]

If [Count] is greater than 0
  Get Statistics of [Health Samples]
    → Average → variable SpO2Val

  # HealthKit returns 0-1 fraction, multiply by 100
  Calculate: SpO2Val × 100 → SpO2Val
  Round to 0 decimal places

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → spo2
    value   → SpO2Val (as text)
    value2  → (empty string)
    unit    → %
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

---

## Step 10: Respiratory Rate (inside loop)

```
Find Health Samples Where
  Type: Respiratory Rate
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples]

If [Count] is greater than 0
  Get Statistics of [Health Samples]
    → Average → variable RespVal
  Round to 1 decimal place

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → resp
    value   → RespVal (as text)
    value2  → (empty string)
    unit    → rpm
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

---

## Step 11: Blood Pressure (inside loop)

```
Find Health Samples Where
  Type: Blood Pressure
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)
  Sort by: Date (newest first)
  Limit: 1

Count [Health Samples]

If [Count] is greater than 0
  # BP samples contain both systolic and diastolic
  # In Shortcuts, the sample value is systolic
  # Diastolic may need to be extracted separately depending on iOS version

  Get [Health Sample] → Systolic → variable BPSys
  Get [Health Sample] → Diastolic → variable BPDia

  Dictionary:
    date    → Format Date: CurrentDate as "yyyy-MM-dd"
    type    → bp
    value   → BPSys (as text)
    value2  → BPDia (as text)
    unit    → mmHg
    notes   → (empty string)
    source  → apple_health

  Add [Dictionary] to variable Vitals
End If
```

**Note:** Blood Pressure in Shortcuts can be tricky. If you can't get separate systolic/diastolic, you can skip this type — most users don't have BP data from Apple Watch anyway.

---

## Step 12: Steps + Active Energy → Daily Activity (inside loop)

```
# Steps
Find Health Samples Where
  Type: Steps
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples] → variable StepCount

If [StepCount] is greater than 0
  Get Statistics of [Health Samples]
    → Sum → variable StepSum
  Round [StepSum] to 0 decimal places
Otherwise
  Set Variable StepSum to 0
End If

# Active Energy
Find Health Samples Where
  Type: Active Energy
  Start Date: is on or after CurrentDate
  End Date: is before (CurrentDate + 1 day)

Count [Health Samples] → variable EnergyCount

If [EnergyCount] is greater than 0
  Get Statistics of [Health Samples]
    → Sum → variable EnergyKcal
  Round [EnergyKcal] to 0 decimal places
Otherwise
  Set Variable EnergyKcal to 0
End If

# Build daily activity entry if we have anything
If [StepSum] is greater than 0 OR [EnergyKcal] is greater than 0

  # Build notes string
  Set Variable ActivityNotes to ""
  If [StepSum] > 0
    Set ActivityNotes to "[StepSum] steps"
  End If
  If [EnergyKcal] > 0 AND [StepSum] > 0
    Set ActivityNotes to "[ActivityNotes], [EnergyKcal] kcal active energy"
  End If
  If [EnergyKcal] > 0 AND [StepSum] = 0
    Set ActivityNotes to "[EnergyKcal] kcal active energy"
  End If

  Dictionary:
    date             → Format Date: CurrentDate as "yyyy-MM-dd"
    type             → Daily Activity
    duration_minutes → (leave empty / null)
    distance         → (leave empty / null)
    calories         → EnergyKcal
    heart_rate_avg   → (leave empty / null)
    source           → apple_health
    notes            → ActivityNotes

  Add [Dictionary] to variable Activities
End If
```

---

## Step 13: End of Day Loop

- **Action:** Adjust Date → add 1 day to `CurrentDate` → save back to `CurrentDate`
- (This is the last action inside the **Repeat** block from Step 3)

**End Repeat**

---

## Step 14: Workouts (OUTSIDE the day loop)

This runs once, after the Repeat block ends.

```
Find All Workouts Where
  Start Date: is on or after StartDate
  End Date: is before EndDate

Count [Workouts]

If [Count] is greater than 0
  Repeat with Each [Workout]:

    # Extract fields
    Format Date: [Workout].Start Date as "yyyy-MM-dd" → variable WDate
    Get [Workout].Workout Type → variable WType
    Get [Workout].Duration → convert to minutes → variable WDuration
    Round [WDuration] to 1 decimal place
    Get [Workout].Total Energy Burned → variable WCalories
    Round [WCalories] to 0 decimal places
    Get [Workout].Total Distance → convert to km → variable WDistance
    Round [WDistance] to 2 decimal places

    # Optional: get average HR during workout
    Find Health Samples Where
      Type: Heart Rate
      Start Date: is on or after [Workout].Start Date
      End Date: is before [Workout].End Date
    Count → variable WHRCount
    If [WHRCount] > 0
      Get Statistics → Average → round to 0 → variable WHR
    Otherwise
      Set Variable WHR to ""
    End If

    Dictionary:
      date             → WDate
      type             → WType
      duration_minutes → WDuration
      distance         → WDistance
      calories         → WCalories
      heart_rate_avg   → WHR (or empty if no HR data)
      source           → apple_health
      notes            → (empty string)

    Add [Dictionary] to variable Activities

  End Repeat
End If
```

**Workout type names:** Shortcuts usually gives readable names like "Running", "Walking", "Yoga" etc. Salve accepts these as-is. If you see raw names like "HKWorkoutActivityTypeRunning", use a Replace Text action to strip the prefix.

---

## Step 15: Assemble the JSON Envelope

After both the day loop and the workout query:

```
Dictionary:
  _source       → salve-healthkit-shortcut
  _version      → 1
  _generated_at → Format Date: Current Date as ISO 8601
  _range_days   → DaysBack
  vitals        → Vitals (the list variable)
  activities    → Activities (the list variable)
```

**Important:** When adding `vitals` and `activities` to this dictionary, make sure you're adding the *List variable*, not a text representation. In Shortcuts, tap the value field → select the variable → it should show as a blue token, not typed text.

---

## Step 16: Copy to Clipboard + Notify

```
Get Dictionary Value for All Keys → this converts the dictionary to JSON text

Copy [JSON text] to Clipboard

Show Notification:
  Title: "Salve Health Sync"
  Body: "Copied [Vitals count] vitals + [Activities count] activities. Open Salve → Settings → Apple Health → Paste."
```

Optional: add a **Quick Look** action before the notification so you can inspect the JSON output while debugging.

---

## Testing

1. **Run the shortcut** → pick "Last 7 days"
2. **First run:** iOS will ask for HealthKit permissions for each data type. Tap Allow for all.
3. **Check clipboard:** Open Notes, paste, verify it's valid JSON
4. **Open Salve** → Settings → Apple Health → Paste from iOS Shortcut → Paste → verify the preview shows reasonable numbers
5. **Import** → check Vitals and Activities sections
6. **Run again** with same range → Salve should show "0 new" (dedup working)

### Edge cases to verify:
- A day with zero data → no entries for that day (not empty entries)
- Only some vitals available (e.g., HR + Sleep but no weight/temp) → those types skipped cleanly
- Workout with no HR samples → `heart_rate_avg` is empty/null, not an error
- Re-running with overlapping dates → duplicates are skipped by Salve automatically

---

## Troubleshooting

**"An error occurred" on a specific health type:**
You're missing the Count → If > 0 guard for that type. Every single "Find Health Samples" must be followed by Count → If Count > 0 before you try to use the results.

**Empty clipboard after running:**
The Dictionary → JSON conversion step might be missing. Make sure you have "Get Dictionary Value" or "Get Contents of Dictionary" before "Copy to Clipboard".

**Salve says "Invalid format":**
The JSON structure doesn't match. Check:
- `_source` must be exactly `salve-healthkit-shortcut`
- `vitals` and `activities` must be arrays (list variables), not text
- All `value` fields must be strings (text), not numbers
- All `date` fields must be `yyyy-MM-dd` format

**Shortcut runs very slowly (>30 seconds):**
90 days × 10 health types = 900 queries. Normal for large ranges. Consider capping at 30 days for regular use, 90 days only for initial sync.

---

## Distribution

Once the shortcut works:

1. In Shortcuts app → tap your shortcut → tap Share → **Copy iCloud Link**
2. Add that link to Salve's Settings → Apple Health section
3. Users tap the link → Shortcuts app opens → they tap "Add Shortcut" → done

The iCloud link is permanent and always serves the latest version of your shortcut.
