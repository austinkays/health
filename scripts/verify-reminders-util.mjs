/*
 * verify-reminders-util.mjs
 *
 * Standalone Node verifier for src/utils/reminders.js.
 * Run with: node scripts/verify-reminders-util.mjs
 * Exits 0 on success, 1 on any assertion failure.
 */
import { formatTime, getNextDoseIn } from '../src/utils/reminders.js';

let failed = 0;
function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── formatTime ──────────────────────────────────────────────────
assert('formatTime 08:00:00 \u2192 8:00 AM', formatTime('08:00:00'), '8:00 AM');
assert('formatTime 08:00 \u2192 8:00 AM', formatTime('08:00'), '8:00 AM');
assert('formatTime 00:00:00 \u2192 12:00 AM', formatTime('00:00:00'), '12:00 AM');
assert('formatTime 12:00:00 \u2192 12:00 PM', formatTime('12:00:00'), '12:00 PM');
assert('formatTime 13:30:00 \u2192 1:30 PM', formatTime('13:30:00'), '1:30 PM');
assert('formatTime 23:45:00 \u2192 11:45 PM', formatTime('23:45:00'), '11:45 PM');
assert('formatTime empty \u2192 empty', formatTime(''), '');
assert('formatTime null \u2192 empty', formatTime(null), '');

// ── getNextDoseIn ───────────────────────────────────────────────
// Fixed reference time: 2026-04-15T10:30:00 local (month is 0-indexed → 3 = April).
const ref = new Date(2026, 3, 15, 10, 30, 0);

assert(
  'next dose 2h later',
  getNextDoseIn([{ reminder_time: '12:30:00', enabled: true }], ref),
  '2h'
);

assert(
  'next dose 14 min later',
  getNextDoseIn([{ reminder_time: '10:44:00', enabled: true }], ref),
  '14m'
);

assert(
  'next dose 2h 14m later',
  getNextDoseIn([{ reminder_time: '12:44:00', enabled: true }], ref),
  '2h 14m'
);

assert(
  'next dose 30s later is "now"',
  getNextDoseIn([{ reminder_time: '10:30:30', enabled: true }], ref),
  'now'
);

assert(
  'picks soonest of multiple reminders',
  getNextDoseIn([
    { reminder_time: '22:00:00', enabled: true },
    { reminder_time: '14:00:00', enabled: true },
    { reminder_time: '18:00:00', enabled: true },
  ], ref),
  '3h 30m'
);

assert(
  'skips disabled reminders',
  getNextDoseIn([
    { reminder_time: '11:00:00', enabled: false },
    { reminder_time: '15:00:00', enabled: true },
  ], ref),
  '4h 30m'
);

assert(
  'all reminders passed today \u2192 next is tomorrow morning',
  getNextDoseIn([{ reminder_time: '08:00:00', enabled: true }], ref),
  '21h 30m'
);

assert(
  'empty list returns null',
  getNextDoseIn([], ref),
  null
);

assert(
  'all disabled returns null',
  getNextDoseIn([{ reminder_time: '12:00:00', enabled: false }], ref),
  null
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll reminder-util assertions passed');
