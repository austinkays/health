# Health To-Do's & Reminders — Implementation Plan

## Status: Planning complete, ready for implementation

---

## Phase 0: Context

### 0A. Read CLAUDE.md
- Review the full project spec in `CLAUDE.md` for architecture, conventions, and the To-Do's feature description under "Roadmap — Amber's Top 5 Feature Requests" item #1
- This ensures alignment with existing patterns (CRUD factory, RLS, search config, Dashboard alerts, Quick Access tiles, AI profile, export/import)

---

## Phase 1: Schema & Data Layer (4 files)

### 1A. Database migration — `supabase/migrations/014_todos.sql`
Create the `todos` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → auth.users | RLS scoped |
| `title` | text NOT NULL | Main label |
| `notes` | text DEFAULT '' | Optional detail |
| `due_date` | text DEFAULT '' | Nullable, ISO date |
| `priority` | text DEFAULT 'medium' | CHECK: low/medium/high/urgent |
| `category` | text DEFAULT 'custom' | CHECK: medication/appointment/follow_up/insurance/lab/custom |
| `completed` | boolean DEFAULT false | |
| `completed_at` | timestamptz | Set on completion |
| `recurring` | text DEFAULT 'none' | CHECK: none/daily/weekly/monthly |
| `related_id` | uuid | Nullable polymorphic FK |
| `related_table` | text DEFAULT '' | Which table `related_id` points to |
| `source` | text DEFAULT 'manual' | CHECK: manual/ai_suggested |
| `dismissed` | boolean DEFAULT false | Hide without completing |

Plus: RLS policies (4), `set_user_id` trigger, `update_updated_at` trigger — identical pattern to `supabase/migrations/012_insurance_claims.sql`.

### 1B. CRUD service — `src/services/db.js`
- Add `todos: crud('todos', { orderBy: 'due_date', ascending: true })` to `db` object
- Add `'todos'` to the `tables` array in `eraseAll()`
- Add `db.todos.list()` call in `loadAll()` + `v(N, [])` mapping to result

### 1C. State hook — `src/hooks/useHealthData.js`
- Add `todos: []` to initial state
- Add `todos: 'todos'` to `tableToKey` map
- Add `todos` slot in `loadAll()` destructuring

### 1D. Defaults — `src/constants/defaults.js`
```js
export const EMPTY_TODO = {
  title: '', notes: '', due_date: '',
  priority: 'medium', category: 'custom',
  completed: false, completed_at: null,
  recurring: 'none', related_id: null,
  related_table: '', source: 'manual', dismissed: false,
};
```

---

## Phase 2: Export / Import / Search (2 files)

### 2A. Storage — `src/services/storage.js`
- Add `todos: 'todos'` to `TABLE_MAP`

### 2B. Search — `src/utils/search.jsx`
- Add `todos` entry to `ENTITY_CONFIG`:
  - `label: 'To-Do\'s'`, `icon: CheckSquare`, `color: C.amber`, `tab: 'todos'`
  - `fields: ['title', 'notes', 'category']`
  - `primary: t => t.title`, `secondary: t => [t.priority, t.category, t.due_date].filter(Boolean).join(' · ')`
- Add `'todos'` to `MORE_CATEGORIES` array

---

## Phase 3: Section UI — `src/components/sections/Todos.jsx` (new file)

Full to-do management view, ~300-400 lines, following `src/components/sections/CareGaps.jsx` pattern:

### List view
- **Filter tabs**: All / Active / Overdue / Completed / Dismissed
- **Cards**: each shows title, priority badge (urgent=rose, high=amber, medium=lav, low=sage), category icon, due date countdown ("Due in 3 days" / "Overdue by 2 days"), source badge (ai_suggested → sparkle icon)
- **Quick-complete**: tap checkbox to toggle completed; sets `completed_at` to now; if `recurring !== 'none'`, auto-creates next occurrence
- **Expandable cards**: expand to show notes, related record link, dismiss/edit/delete actions
- **`highlightId`** support: auto-expand + scroll + pulse (existing pattern)
- **Sort**: overdue first, then by priority (urgent > high > medium > low), then by due_date

### Add/Edit form (subView)
- Fields: title (required), notes (textarea), due_date (date input), priority (select: low/medium/high/urgent), category (select: medication/appointment/follow_up/insurance/lab/custom), recurring (select: none/daily/weekly/monthly)
- Optional: related record picker (select a table → shows records from that table)

### Recurring logic (client-side)
On completion of a recurring to-do:
1. Mark current as completed
2. Calculate next due date (due_date + interval, or today + interval if no due_date)
3. `addItem('todos', { ...original, completed: false, completed_at: null, due_date: nextDate })`

---

## Phase 4: App Wiring (1 file)

### `src/App.jsx`
- Add lazy import: `const Todos = lazyWithRetry(() => import('./components/sections/Todos'))`
- Add switch case: `case 'todos': return <Todos {...shared} />`

---

## Phase 5: Dashboard Integration (1 file)

### `src/components/sections/Dashboard.jsx`

**5A. Quick Access tile**
- Add to `ALL_LINKS`: `{ id: 'todos', label: "To-Do's", icon: CheckSquare, color: C.amber }`

**5B. Alerts integration**
In the `alerts` useMemo:
```js
const overdueTodos = (data.todos || []).filter(t =>
  !t.completed && !t.dismissed && t.due_date && new Date(t.due_date) < today
);
const urgentTodos = (data.todos || []).filter(t =>
  !t.completed && !t.dismissed && t.priority === 'urgent'
);
```
- Add alert item: `"X overdue to-do's"` (rose) if `overdueTodos.length > 0`
- Add alert item: `"X urgent to-do's"` (amber) if `urgentTodos.length > 0` (dedup with overdue)
- Update `getContextLine()` to include todo counts

**5C. Timeline integration**
- Due-today and upcoming todos (next 7d) merge into unified timeline alongside appointments and refills
- `_type: 'todo'`, `_sortDate: t.due_date`, `dotColor: C.amber`

---

## Phase 6: AI Profile (1 file)

### `src/services/profile.js`
Add a `— TO-DO ITEMS —` section to `buildProfile()`:
- List overdue items (urgent flag)
- List upcoming items due within 7 days
- Include category and priority
- Used by AI to suggest relevant to-do's and correlate with health context

---

## File Change Summary

| File | Action | Complexity |
|------|--------|-----------|
| `supabase/migrations/014_todos.sql` | **Create** | Low |
| `src/constants/defaults.js` | Edit (add `EMPTY_TODO`) | Low |
| `src/services/db.js` | Edit (3 spots: crud, loadAll, eraseAll) | Low |
| `src/hooks/useHealthData.js` | Edit (3 spots: state, tableToKey, loadAll) | Low |
| `src/services/storage.js` | Edit (add to TABLE_MAP) | Low |
| `src/utils/search.jsx` | Edit (ENTITY_CONFIG + MORE_CATEGORIES) | Low |
| `src/components/sections/Todos.jsx` | **Create** (~350 lines) | Medium |
| `src/App.jsx` | Edit (lazy import + switch case) | Low |
| `src/components/sections/Dashboard.jsx` | Edit (ALL_LINKS + alerts + timeline) | Medium |
| `src/services/profile.js` | Edit (add todos section) | Low |

**10 files total** (2 new, 8 edits). No changes to BottomNav — To-Do's is accessible via Quick Access tiles and Search.

---

## Implementation Order

1. **Phase 0** (context) — read CLAUDE.md for full spec alignment
2. **Phase 1** (data layer) — must come first; all other phases depend on it
3. **Phase 2** (export/search) — independent, small edits
4. **Phase 4** (App routing) — needed before Phase 3 can be tested
5. **Phase 3** (Todos.jsx) — the main section UI
6. **Phase 5** (Dashboard) — integrate after section works
7. **Phase 6** (AI profile) — final, lowest risk
