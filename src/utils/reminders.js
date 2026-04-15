// src/utils/reminders.js
//
// Pure helpers for medication reminder display. No React, no DOM, no imports.
// Consumed by src/components/sections/Medications.jsx for the card-surface
// reminder row and the Schedule block inside the expanded detail pane.

/**
 * Format a time string from the medication_reminders table (stored as
 * Postgres `time`, which serializes to "HH:MM:SS" or "HH:MM") into a
 * human-readable 12-hour clock string like "8:00 AM".
 *
 * @param {string | null | undefined} hhmmss
 * @returns {string}
 */
export function formatTime(hhmmss) {
  if (!hhmmss) return '';
  const [h, m] = String(hhmmss).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Compute a human-readable countdown to the next enabled reminder time,
 * considering wrap-around to tomorrow if all of today's times have passed.
 *
 * @param {Array<{reminder_time: string, enabled: boolean}>} reminders
 * @param {Date} [now]  Reference "now" — defaults to new Date(). Injectable for tests.
 * @returns {string | null}
 *          "now" if within 60 seconds, "14m" if under 1h, "2h" if whole hours,
 *          "2h 14m" otherwise. Returns null if no enabled reminder exists.
 */
export function getNextDoseIn(reminders, now = new Date()) {
  if (!Array.isArray(reminders) || reminders.length === 0) return null;
  const enabled = reminders.filter(r => r && r.enabled && r.reminder_time);
  if (enabled.length === 0) return null;

  const nowMs = now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;

  // Compute each reminder's next occurrence in ms-since-epoch.
  let soonest = Infinity;
  for (const r of enabled) {
    const [h, m, s = 0] = String(r.reminder_time).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    let target = startOfToday + h * 3_600_000 + m * 60_000 + s * 1000;
    // If today's target already passed (with a 1-minute grace window so "just
    // fired" reminders don't immediately jump to tomorrow), roll to tomorrow.
    if (target < nowMs - 60_000) target += DAY;
    if (target < soonest) soonest = target;
  }
  if (!Number.isFinite(soonest)) return null;

  const diff = soonest - nowMs;
  if (diff <= 60_000) return 'now';
  const minutes = Math.round(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
