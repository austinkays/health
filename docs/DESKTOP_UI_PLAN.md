# Desktop UI Plan

A roadmap for adapting Salve's mobile-first UI for desktop/tablet viewports without breaking the existing mobile experience.

## Current State

- **Container**: Everything renders inside `max-w-[480px] mx-auto` — locked to a mobile column width regardless of screen size
- **Navigation**: Bottom tab bar with 6 items (Home, Meds, Vitals, Sage, Journal, Settings), fixed to bottom of viewport
- **Header**: Top bar with back button + title + search icon
- **Content**: Single-column stack of cards, sections, and lists

On a desktop monitor the app currently looks like a centered mobile window with wasted space on either side. The opportunity: use responsive breakpoints to unlock a richer desktop layout while keeping the mobile experience untouched.

## Strategy

Tailwind's responsive prefixes (`md:`, `lg:`, `xl:`) make this additive — we add desktop behavior *on top of* existing mobile classes without removing anything. The mobile layout keeps working exactly as it does today.

**Breakpoints we'll target:**
- `< 768px` (default): Mobile — current layout unchanged
- `768px – 1023px` (`md:`): Tablet — wider content, sidebar nav appears
- `≥ 1024px` (`lg:`): Desktop — multi-column layouts, persistent detail panes

## Phase 1: Shell & Navigation (2-3 hours)

### Replace bottom nav with sidebar at `md:` breakpoint

**Files to change:**
- `src/components/layout/BottomNav.jsx` → hide on `md:` and above (`md:hidden`)
- New file: `src/components/layout/SideNav.jsx` → shown only on `md:` and above (`hidden md:flex`)
- `src/App.jsx` → adjust the outer wrapper to accommodate a fixed sidebar

**SideNav design:**
- Fixed left, 220px wide, full viewport height
- Logo/app name at top, 6 nav items vertically, user profile/sign-out at bottom
- Active item highlighted with a left border accent + background tint
- Hover animations for each nav item
- Same tab IDs as BottomNav so `onNav()` keeps working unchanged

**Layout wrapper:**
```jsx
<div className="min-h-screen bg-salve-bg">
  <SideNav /> {/* hidden md:flex fixed left-0 */}
  <div className="md:ml-[220px]">
    <div className="max-w-[480px] mx-auto md:max-w-[720px] lg:max-w-[960px] px-4">
      {/* existing content */}
    </div>
  </div>
  <BottomNav /> {/* md:hidden */}
</div>
```

### Widen the content column

At `md:`, allow the content column to grow from 480px to ~720px. At `lg:`, allow up to ~960px. This alone makes the app feel much more natural on desktop without any per-section changes.

## Phase 2: Header Adaptations (1-2 hours)

**Changes to `Header.jsx`:**
- On `md:`, hide back button (sidebar provides navigation context instead)
- On `md:`, make search input always visible and expanded (not just an icon)
- Keep title + decorative motifs

## Phase 3: Dashboard Multi-Column (3-4 hours)

**Current Dashboard (mobile):** Vertical stack of greeting → search → alerts → insight → timeline → vitals snapshot → hub tiles.

**Desktop Dashboard:** Two-column layout with:

**Left column (wider):**
- Greeting + search
- Alerts + Sage insight
- Timeline / Coming Up

**Right column (narrower):**
- Pinned shortcuts (user-starred sections)
- Vitals snapshot
- Hub tile grid (still 3 columns, just narrower)

Use `md:grid md:grid-cols-[2fr_1fr] md:gap-6` on the content wrapper. Mobile remains single-column.

## Phase 4: List/Detail Pattern (4-6 hours)

This is the biggest desktop win. Many sections (Medications, Conditions, Labs, Providers, etc.) follow the same pattern: a list of records where tapping expands an inline detail panel.

**Desktop pattern:** Split view with list on left (300-400px) and selected record's details persistently on the right.

**Implementation:**
- Create a new `SplitView.jsx` layout primitive
- Sections opt in by wrapping their content in `<SplitView list={...} detail={...}>`
- List is a narrow scrollable column; detail pane shows the currently selected record
- Mobile behavior: tap a record → full-screen detail view (existing behavior, just using existing state)
- Desktop behavior: tap a record → detail appears in right pane, list stays visible

**Sections to adapt (in priority order):**
1. Medications (most-used section)
2. Conditions
3. Labs
4. Providers
5. Appointments
6. Journal
7. Todos

Each adaptation: roughly 20-30 minutes once `SplitView` is built.

## Phase 5: Hub Page Enhancements (1-2 hours)

Hub pages currently show a list of sections with stats. On desktop:
- Show stats and a mini preview (recent items) inline per section card
- Maybe 2-column grid of hub cards instead of single column

## Phase 6: Data-Dense Section Polish (2-3 hours)

A few sections benefit from wider layouts:

- **Vitals**: Chart could stretch wider, show more history. Filter pills could move to a sidebar.
- **Labs**: Show results in a table format on desktop instead of cards
- **Calendar/Cycles**: Calendar grid can be larger with more info per day cell
- **Insurance Claims**: Table layout on desktop, cards on mobile

## Phase 7: Keyboard Shortcuts (1-2 hours)

Desktop users expect keyboard navigation:
- `Cmd/Ctrl + K` → open search
- `Cmd/Ctrl + /` → focus search
- `Esc` → close modals / cancel editing
- `J/K` or arrow keys → move through list views
- `1-6` → switch between primary nav sections

Implement via a single `useGlobalKeybinds` hook mounted in App.jsx.

## Design Considerations

### Typography scaling
Current font sizes are sized for mobile (11-13px body). On desktop, bump body text to 14px via responsive classes (`text-[13px] md:text-sm`).

### Hover states
Mobile has minimal hover states (devices don't hover). Desktop benefits from:
- Card hover lift + glow (already exists, good)
- Button hover color shifts
- Row hover backgrounds in lists
- Tooltip on truncated text

### Spacing
Current spacing is tight for mobile. On desktop, breathing room:
- `gap-2 md:gap-4` for grids
- `p-3 md:p-4` for cards
- `mb-3 md:mb-5` for sections

### Max reading width
Even on big screens, content like journal entries shouldn't stretch edge-to-edge. Use `max-w-prose` for text-heavy content.

## Testing Strategy

1. **Before any changes**: Take screenshots of all sections at 375px width (mobile baseline).
2. **After each phase**: Verify mobile at 375px + 480px still looks identical.
3. **Test breakpoints**: 375, 480, 768, 1024, 1440px.
4. **No regressions**: If a desktop change would require changing mobile behavior, use responsive classes to keep mobile unchanged.

## Rollout Plan

All changes should be feature-flag-free and progressive — each phase ships independently and improves the experience at that breakpoint.

1. **Phase 1** (Shell): Ship alone. App becomes usable on desktop.
2. **Phase 2** (Header): Ship alone.
3. **Phase 3** (Dashboard): Ship alone.
4. **Phase 4** (List/Detail): Ship SplitView + Medications first, then one section at a time.
5. **Phase 5-7**: Ship as polish after core is working.

## Open Questions

- Should we keep the 480px "mobile column" max-width available as a user preference, even on desktop? (Some users may prefer the compact view even with real estate available.)
- Should the SideNav collapse to icon-only at `md:` and expand at `lg:`? Or always full-width?
- How should modals/bottom sheets (currently slide up from bottom on mobile) behave on desktop? Center modal vs slide-over panel?

## Estimated Total Effort

- **Phase 1**: 2-3 hours
- **Phase 2**: 1-2 hours
- **Phase 3**: 3-4 hours
- **Phase 4**: 4-6 hours (+ 20-30 min per section adapted)
- **Phase 5**: 1-2 hours
- **Phase 6**: 2-3 hours
- **Phase 7**: 1-2 hours

**Total**: ~15-22 hours to get a polished desktop experience across all sections.

**Minimum viable desktop** (Phases 1-3 only): ~6-9 hours. That alone would make the app genuinely usable on desktop.
