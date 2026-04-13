# Live Wearable Tracking Pipeline

> Roadmap for adding real-time and near-real-time wearable data to Salve.
> Current state: all integrations are either file imports or manual-sync OAuth connections.
> Goal: data appears in the UI within seconds of being recorded on the device.

---

## Current State (as of April 2026)

| Source | Type | Latency | Notes |
|--------|------|---------|-------|
| Oura Ring | OAuth2 + auto-poll (5min on OuraRing.jsx) | ~5 min (daily summaries only) | Only pulls daily_readiness, daily_sleep, heartrate, daily_spo2, daily_stress |
| Dexcom CGM | OAuth2, manual sync | User-triggered | 5-min EGV data available but not auto-polled |
| Withings | OAuth2, manual sync | User-triggered | Weight, BP, HR, temp, SpO2, sleep |
| Fitbit | OAuth2, manual sync | User-triggered | Legacy API, sunsetting Sept 2026 |
| Whoop | OAuth2, manual sync | User-triggered | HRV, recovery, sleep, workouts |
| Terra | Webhook (passive) | Provider-dependent | Data arrives when provider syncs (hours) |
| Apple Health | File import only | Manual | No web API; requires native app for live |
| 12 app parsers | File import only | Manual | Clue, Daylio, Bearable, Libre, etc. |

---

## Phase 1: Supabase Realtime Subscriptions (instant UI updates)

**Effort:** Low (1-2 hours)
**Impact:** Any data written to Supabase by ANY source instantly appears in the UI

### What to build

Wire Supabase Realtime `postgres_changes` subscriptions on key tables so the UI updates without manual refresh:

```
Tables to subscribe:
- vitals (INSERT) → auto-append to vitals list + update charts
- activities (INSERT) → auto-append to activities list
- cycles (INSERT) → update calendar
```

### Implementation

1. **New hook: `useRealtimeSync.js`**
   - Subscribe to `postgres_changes` on `vitals`, `activities`, `cycles` filtered by `user_id`
   - On INSERT event → merge new row into `useHealthData` state (avoid duplicate if already present)
   - On UPDATE event → patch existing row in state
   - On DELETE event → remove from state
   - Cleanup subscriptions on unmount
   - Only activate when authenticated (not in demo mode)

2. **Wire into App.jsx**
   - Call `useRealtimeSync(data, setData)` after `useHealthData` initializes
   - Pass setter functions for optimistic state updates

3. **Visual indicator**
   - Small pulse dot (reuse `.pulse-dot` CSS class) on sections that received live data
   - Toast notification: "New heart rate data from Oura" (subtle, auto-dismiss)

### Why this matters first
Terra webhooks, Oura auto-sync, and any future polling all write to Supabase. This single change makes ALL of them feel "live" in the UI without touching any integration code.

---

## Phase 2: Oura Intraday Heart Rate Polling

**Effort:** Low-Medium (2-3 hours)
**Impact:** Near-real-time heart rate from Oura Ring

### What to build

Oura's V2 API `heartrate` endpoint returns **5-minute interval HR data** for the current day, not just daily summaries. We're leaving this data on the table.

### Implementation

1. **Extend `services/oura.js`**
   - New function: `fetchOuraIntradayHR(date)` → GET `/v2/usercollection/heartrate?start_datetime=...&end_datetime=...`
   - Returns array of `{ bpm, source, timestamp }` entries at 5-min intervals

2. **New polling service: `services/livePoll.js`**
   - Generic interval-based poller with backoff
   - `startLivePoll(provider, fetchFn, intervalMs, onData)` → returns cleanup function
   - Respects `document.visibilityState` (pause when tab hidden, resume on focus)
   - Rate-limit aware (backs off on 429)

3. **Wire into OuraRing.jsx**
   - Poll `fetchOuraIntradayHR` every 5 minutes while the page is open
   - Display as intraday HR line chart (Recharts) with time-of-day x-axis
   - Each new data point inserts a vitals row with `time: 'HH:00'` (hourly bucketed) or stores raw 5-min data in a separate client-side buffer for the chart
   - Decision: store raw 5-min data in Supabase (many rows) vs. display-only buffer (memory only, lost on refresh)?
     → **Recommendation:** hourly buckets to Supabase (consistent with Apple Health pattern), raw 5-min in memory for live chart only

4. **Dashboard integration**
   - "Live HR" chip on Recent Vitals card showing most recent reading with `.pulse-dot`
   - Only visible when Oura is connected and data is < 10 min old

### API rate limit considerations
- Oura rate limit: 5000 requests/day per user
- At 5-min intervals: 288 calls/day (well within limit)
- Proxy through `api/wearable.js?provider=oura&action=data` (existing path)

---

## Phase 3: Dexcom Real-Time Glucose Polling

**Effort:** Medium (3-4 hours)
**Impact:** Live glucose curve for CGM users (high-value for chronic illness audience)

### What to build

Dexcom CGMs produce a new glucose reading every 5 minutes. The API exposes these via the `egvs` endpoint. Currently we only sync on user tap.

### Implementation

1. **Extend `services/dexcom.js`**
   - New function: `fetchLatestEgvs(minutes)` → GET `/v3/users/self/egvs?startDate=...&endDate=now`
   - Returns recent estimated glucose values with timestamps

2. **Wire into `livePoll.js`**
   - Poll every 5 minutes while connected
   - Each new EGV writes a vitals row (glucose) to Supabase
   - Supabase Realtime (Phase 1) pushes it to the UI instantly

3. **Live glucose display**
   - New component or card on Dashboard/Vitals: current glucose value with trend arrow (↑↓→)
   - Dexcom provides `trend` field (rising/falling/flat) — display as directional arrow
   - Color-code: green (70-180 mg/dL), amber (55-70 or 180-250), rose (<55 or >250)
   - Intraday chart showing last 3 hours of glucose readings

4. **Alerts**
   - Optional toast/banner for out-of-range readings
   - User-configurable thresholds in Settings

### Nightscout bridge (alternative)
Many CGM users already run Nightscout (open-source glucose server). Alternative to direct Dexcom polling:
- Read from user's Nightscout URL via REST API
- No Dexcom OAuth needed
- Works with Libre sensors too (via xDrip+/Nightscout)
- User provides their Nightscout URL in Settings

---

## Phase 4: Web Bluetooth (Direct BLE Sensor Connection)

**Effort:** Medium (4-6 hours)
**Impact:** True real-time streaming from BLE heart rate monitors, pulse oximeters

### What to build

The Web Bluetooth API allows Chrome/Edge PWAs to connect directly to Bluetooth Low Energy devices and stream data in real time — no server, no API key, no rate limits.

### Supported BLE profiles

| Profile | UUID | Devices | Data |
|---------|------|---------|------|
| Heart Rate | `0x180D` | Polar H10, Garmin HRM-Pro, most chest straps | BPM, RR intervals, contact status |
| Blood Pressure | `0x1810` | Omron Evolv, A&D UA-651BLE | Systolic, diastolic, pulse |
| Weight Scale | `0x181D` | Some smart scales | Weight, BMI |
| Pulse Oximeter | `0x1822` | Contec CMS50D-BT, some fingertip oximeters | SpO2, pulse rate |
| Glucose | `0x1808` | Some glucometers (rare) | Glucose readings |

### Implementation

1. **New service: `services/bluetooth.js`**
   ```
   requestHeartRateMonitor() → navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })
   startHeartRateStream(device, onReading) → subscribe to HR characteristic notifications
   stopStream()
   isWebBluetoothSupported() → boolean
   ```

2. **Live HR component: `components/ui/LiveHRMonitor.jsx`**
   - "Connect HR Monitor" button (only shown when `isWebBluetoothSupported()`)
   - Pairing dialog (browser-native)
   - Once paired: live BPM display with beat animation
   - Rolling 5-min mini chart
   - Write hourly averages to Supabase vitals table
   - Green pulse-dot while streaming

3. **Integration points**
   - Vitals section: "Pair Bluetooth Device" in action bar
   - OuraRing.jsx: option to supplement Oura with chest-strap HR during workouts
   - Settings: paired device management (name, last connected)

### Browser support reality
- Chrome (desktop + Android): Full support
- Edge: Full support
- Safari: No support (and unlikely soon)
- Firefox: No support
- iOS: No Web Bluetooth at all (WebKit limitation)

This means it's Android + desktop Chrome/Edge only. Still valuable for users with chest-strap HR monitors during workouts, but NOT a replacement for Apple Watch.

### Fallback for unsupported browsers
- Hide all BLE UI when `!isWebBluetoothSupported()`
- No degraded experience — just doesn't appear

---

## Phase 5: Companion iOS App (Future — Apple Watch)

**Effort:** High (separate project)
**Impact:** The only way to get live Apple Watch data

### Architecture

```
Apple Watch → HealthKit → Companion iOS App → Supabase REST → Realtime → PWA
```

### Minimal viable iOS app (Swift)
- ~500 lines of Swift
- Reads HealthKit in background (HR, steps, workouts, sleep stages)
- Batches and pushes to Supabase via REST every 5-15 minutes
- Uses Supabase auth (same account as PWA)
- No UI beyond initial HealthKit permission screen + Supabase login

### Requirements
- Apple Developer account ($99/year)
- App Store review (health category — may require additional review)
- Separate repo and build pipeline
- Must handle: background refresh limits, battery optimization, HealthKit authorization changes

### Decision point
This is a separate product. Consider whether the audience size justifies the effort. Alternative: iOS Shortcuts bridge (already specced in `docs/APPLE_HEALTH_SHORTCUT.md`) gives manual sync without App Store overhead.

---

## Phase 6: Unified Live Dashboard

**Effort:** Medium (after phases 1-4)
**Impact:** Single view showing all real-time data streams

### What to build

A dedicated "Live" view (or Dashboard mode) that aggregates all connected real-time streams:

```
┌─────────────────────────────────────────┐
│  ♥ 72 bpm          SpO2 98%            │  ← from BLE or Oura
│  ████████████████   ████████████████    │  ← rolling 5-min charts
│                                         │
│  Glucose 142 mg/dL →                    │  ← from Dexcom
│  ████████████████████████████████████   │  ← 3-hour glucose chart
│                                         │
│  Steps today: 4,231    Sleep: 7.2h      │  ← from any connected source
│  Active cal: 189       Readiness: 82    │  ← from Oura/Whoop
└─────────────────────────────────────────┘
```

### Data flow
1. Supabase Realtime (Phase 1) handles all persistent data
2. Web Bluetooth streams (Phase 4) are memory-only until hourly flush
3. All sources tagged with `source` field for attribution badges
4. Stale data (> 10 min old) dims automatically

---

## Implementation Order & Dependencies

```
Phase 1 (Realtime subscriptions) ──→ unlocks instant UI for ALL future phases
  │
  ├── Phase 2 (Oura intraday HR) ──→ first "live" experience
  │
  ├── Phase 3 (Dexcom glucose) ──→ high-value for CGM users
  │
  └── Phase 4 (Web Bluetooth) ──→ true real-time for BLE devices
                                     │
Phase 5 (iOS companion) ────────────→ Apple Watch (separate project)
                                     │
Phase 6 (Unified Live Dashboard) ←───┘ aggregates all streams
```

Phases 2-4 are independent and can be built in any order after Phase 1.

---

## API Rate Limit Budget

| Provider | Limit | At 5-min poll | Daily budget | Headroom |
|----------|-------|---------------|-------------|----------|
| Oura | 5,000/day | 288 calls | 5.8% | Plenty |
| Dexcom | 300/hr (sandbox) | 12/hr | 4% | Plenty |
| Whoop | Unknown (undocumented) | 288/day | TBD | Test carefully |
| Withings | 300/user/hr | 12/hr | 4% | Plenty |
| Web Bluetooth | No limit (local) | N/A | N/A | Unlimited |

---

## Environment Variables (new)

None needed for Phases 1-4 — all use existing OAuth credentials and Supabase connection.

Phase 5 (iOS app) would need its own Supabase URL + anon key bundled in the app.
