# Migration Plan: Salve

Artifact (single-file JSX) -> Standalone Vite + React + Tailwind on Vercel

## Source

The v3 artifact file (`salve-v3.jsx`) should be placed at the project root as `SOURCE.jsx` before starting. Claude Code will reference it throughout the migration to extract logic, styles, and data.

---

## Phase 1: Project Scaffold

**Goal:** Empty app runs locally with Tailwind configured and custom theme applied.

1. `npm create vite@latest . -- --template react`
2. Install deps:
   ```
   npm install recharts lucide-react
   npm install -D tailwindcss @tailwindcss/vite postcss autoprefixer
   ```
3. Create `tailwind.config.js` with the full `salve` color palette from CLAUDE.md
4. Set up `src/index.css` with Tailwind directives and Google Fonts import
5. Create `index.html` with viewport meta for mobile, favicon link, and font preconnect
6. Verify: `npm run dev` shows a blank page with correct background color (#1a1a2e)

**Deliverable:** Running dev server, Tailwind compiling, custom colors available as `bg-salve-bg`, `text-salve-lav`, etc.

---

## Phase 2: Storage + Constants

**Goal:** Data layer works independently before any UI exists.

### 2a: Constants
Extract from SOURCE.jsx:
- `src/constants/colors.js` - Export the C object (still useful for any remaining programmatic color refs)
- `src/constants/interactions.js` - The full INTERACTIONS array (drug interaction pairs with severity, description, recommendation)
- `src/constants/defaults.js` - Empty state shapes for core, tracking, settings

### 2b: Storage Service
Create `src/services/storage.js`:
```js
// Keys
const SK = {
  core: "hc:core",
  tracking: "hc:tracking", 
  settings: "hc:settings",
  lastRefresh: "hc:lastRefresh",
};

// load(key) -> parsed object or default
// save(key, value) -> void
// clearAll() -> removes all hc: keys
```

Replace every `window.storage.get/set/delete` call with localStorage equivalents. The interface stays the same (key-value with JSON serialization) but drops the async requirement. Keep the functions async-compatible (return Promises) so the component code doesn't need refactoring.

### 2c: Utilities
- `src/utils/uid.js` - The `uid()` function
- `src/utils/dates.js` - Date formatting helpers used across sections
- `src/utils/interactions.js` - `checkInteractions(meds)` function

**Verification:** Write a quick test in the browser console: `storage.save('hc:core', {...})` then `storage.load('hc:core')` returns the data.

---

## Phase 3: API Proxy

**Goal:** AI features work through a Vercel serverless function.

Create `api/chat.js`:
```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { messages, system, max_tokens = 1000 } = req.body;
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      system,
      messages,
    }),
  });
  
  const data = await response.json();
  res.status(response.status).json(data);
}
```

Create `src/services/ai.js`:
- `fetchInsight(profile)` - One-shot dashboard health insight
- `sendChat(messages, profile)` - Multi-turn conversation with health context
- Both call `/api/chat` and extract text from `data.content`
- Include AbortController with 120s timeout
- Error handling with user-friendly messages

Create `src/services/profile.js`:
- `buildProfile(data)` - Assembles the full health context string from meds, conditions, vitals, etc. Used as the system prompt context for AI features.

Create `vercel.json` with the function timeout config.

**Verification:** Deploy to Vercel, hit `/api/chat` with a test payload, confirm response comes back.

---

## Phase 4: Shared UI Components

**Goal:** All reusable primitives exist with Tailwind styling before section work begins.

Port these from SOURCE.jsx, converting inline styles to Tailwind:

| Component | Source pattern | Notes |
|-----------|---------------|-------|
| `Card.jsx` | The `Card` component | Rounded card with optional title, border, padding |
| `Button.jsx` | The `Btn` component | Variants: primary (lav), sage, amber, danger (rose), ghost |
| `Field.jsx` | The `Field` component | Label + input/textarea/select with consistent styling |
| `Badge.jsx` | Inline badge patterns | Small colored pills for status/category |
| `ConfirmBar.jsx` | The `ConfirmBar` component | Red confirm / gray cancel bar for delete ops |
| `EmptyState.jsx` | Inline empty state blocks | Icon + message + optional CTA |
| `LoadingSpinner.jsx` | The spinner pattern | Animated spin with lavender color |
| `Motif.jsx` | The `Motif` component | Decorative SVG sparkles/moon/leaf/herb |

**Key Tailwind conversion notes:**
- `style={{ background: C.card }}` -> `bg-salve-card`
- `style={{ color: C.lav }}` -> `text-salve-lav`
- `style={{ borderRadius: 12 }}` -> `rounded-xl`
- `style={{ padding: "16px 20px" }}` -> `px-5 py-4`
- `style={{ fontSize: 13 }}` -> `text-[13px]` (use arbitrary values for non-standard sizes)
- `style={{ fontFamily: "'Playfair Display', serif" }}` -> `font-playfair` (add to Tailwind config)

---

## Phase 5: Layout + Hooks

**Goal:** App shell with navigation works, data flows through hooks.

### 5a: Layout
- `Header.jsx` - App title, decorative motifs, back button logic
- `BottomNav.jsx` - 6-tab bottom bar with active state highlighting
- `App.jsx` - State for active tab/subview, renders Header + current section + BottomNav

### 5b: Hooks
- `useHealthData.js` - Central data hook:
  - Loads all four storage keys on mount
  - Exposes `data` object and CRUD functions: `addMed`, `updateMed`, `deleteMed`, etc.
  - Each mutation saves the affected storage key immediately
  - Returns `loading` boolean for initial load state
- `useConfirmDelete.js` - Tracks which item ID is pending deletion, provides `requestDelete(id)`, `confirmDelete()`, `cancelDelete()`
- `useAI.js` - Manages AI state: `insight`, `chatMessages`, `loading`, `error`, `fetchInsight()`, `sendMessage(text)`

**Verification:** App renders with header and bottom nav. Switching tabs shows placeholder content. Console confirms storage loads on mount.

---

## Phase 6: Port Sections (one at a time)

Port in this order (simplest to most complex):

### 6a: Settings
- Name input, health background textarea, AI mode toggle
- Erase All Data with inline confirmation (no window.confirm)
- Good first section to verify the full data flow: hook -> UI -> save -> reload

### 6b: Allergies
- Simple list + add form (name, severity, reaction notes)
- Tests CRUD + delete confirmation pattern

### 6c: Providers
- Provider list with name, specialty, phone, notes
- Similar CRUD pattern

### 6d: Conditions
- Condition list with name, diagnosed date, status, notes

### 6e: Medications
- Most complex list: name, dose, frequency, time, prescriber, purpose, notes, active/inactive toggle
- Drug interaction check runs on med list changes

### 6f: Vitals
- Data entry for weight, blood pressure, heart rate, temperature, blood sugar, pain level, sleep, mood, energy
- Recharts area chart for trends over time
- Date picker for entries

### 6g: Appointments
- Upcoming/past split view
- Date, provider, type, location, notes, status

### 6h: Journal
- Free-text entries with date, mood tag, optional symptom tags
- Entry list with expand/collapse

### 6i: Interactions (standalone view)
- Reads from meds list, shows flagged interaction pairs
- Links to medication details
- Static interaction database lookup

### 6j: Dashboard
- Greeting with name and time-of-day
- Quick stats: med count, upcoming appointments, recent vitals
- Interaction alert banner (if any flagged)
- AI insight card (auto-loads or on-demand based on settings)
- Quick access grid

### 6k: AI Panel
- Multi-turn chat interface
- Health profile injected as system prompt context
- Message history persists in component state (not localStorage)
- Medical disclaimer banner

**For each section:** port the JSX, convert all inline styles to Tailwind, wire to hooks, test CRUD operations, verify visual match against the artifact.

---

## Phase 7: PWA + Polish

1. Create `public/manifest.json` for Add to Home Screen
2. Add appropriate meta tags (theme-color, apple-mobile-web-app-capable)
3. Responsive check at 375px and 480px
4. Loading state for initial data hydration
5. Error boundaries around AI features
6. `console.error` cleanup, remove any leftover development logging
7. Final Lighthouse check for performance

---

## Phase 8: Deploy

1. Push to GitHub
2. Connect repo to Vercel
3. Set `ANTHROPIC_API_KEY` environment variable in Vercel dashboard
4. Deploy, verify all features on production URL
5. Share URL with Amber

---

## Risk Notes

- **localStorage limit is ~5-10MB** depending on browser. Health data for a single user will never approach this. If it ever does, the migration path is IndexedDB via Dexie.
- **No data export yet.** Consider adding a JSON export button in Settings as a Phase 7 addition. localStorage has no backup, and clearing browser data nukes everything.
- **AI costs are on Austin's API key.** Sonnet is cheap but unbounded usage could add up. Consider adding a simple daily request counter in localStorage that resets daily and soft-caps at ~50 requests/day.
- **No auth means the URL is "public."** Security through obscurity only. If Amber bookmarks it and nobody else has the URL, it's fine. The API proxy has no auth either, so if someone finds the URL they could make API calls on Austin's key. Consider adding a simple shared secret header check to the proxy if this concerns you.
