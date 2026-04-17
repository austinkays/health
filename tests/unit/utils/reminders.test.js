import { describe, it, expect } from 'vitest';
import { formatTime, getNextDoseIn } from '../../../src/utils/reminders.js';

describe('formatTime', () => {
  it('formats HH:MM:SS 24-hour times to 12-hour', () => {
    expect(formatTime('08:00:00')).toBe('8:00 AM');
    expect(formatTime('00:00:00')).toBe('12:00 AM');
    expect(formatTime('12:00:00')).toBe('12:00 PM');
    expect(formatTime('13:30:00')).toBe('1:30 PM');
    expect(formatTime('23:45:00')).toBe('11:45 PM');
  });

  it('accepts HH:MM without seconds', () => {
    expect(formatTime('08:00')).toBe('8:00 AM');
  });

  it('returns empty string on empty/null input', () => {
    expect(formatTime('')).toBe('');
    expect(formatTime(null)).toBe('');
  });
});

describe('getNextDoseIn', () => {
  // Fixed reference time: 2026-04-15T10:30:00 local (month is 0-indexed → 3 = April)
  const ref = new Date(2026, 3, 15, 10, 30, 0);

  it('formats a dose 2 hours later', () => {
    expect(getNextDoseIn([{ reminder_time: '12:30:00', enabled: true }], ref)).toBe('2h');
  });

  it('formats a dose 14 minutes later', () => {
    expect(getNextDoseIn([{ reminder_time: '10:44:00', enabled: true }], ref)).toBe('14m');
  });

  it('formats a dose 2h 14m later', () => {
    expect(getNextDoseIn([{ reminder_time: '12:44:00', enabled: true }], ref)).toBe('2h 14m');
  });

  it('treats a dose 30 seconds out as "now"', () => {
    expect(getNextDoseIn([{ reminder_time: '10:30:30', enabled: true }], ref)).toBe('now');
  });

  it('picks the soonest of multiple reminders', () => {
    const result = getNextDoseIn([
      { reminder_time: '22:00:00', enabled: true },
      { reminder_time: '14:00:00', enabled: true },
      { reminder_time: '18:00:00', enabled: true },
    ], ref);
    expect(result).toBe('3h 30m');
  });

  it('skips disabled reminders', () => {
    const result = getNextDoseIn([
      { reminder_time: '11:00:00', enabled: false },
      { reminder_time: '15:00:00', enabled: true },
    ], ref);
    expect(result).toBe('4h 30m');
  });

  it('rolls to tomorrow morning when all reminders passed today', () => {
    expect(getNextDoseIn([{ reminder_time: '08:00:00', enabled: true }], ref)).toBe('21h 30m');
  });

  it('returns null for empty list', () => {
    expect(getNextDoseIn([], ref)).toBe(null);
  });

  it('returns null when all reminders are disabled', () => {
    expect(getNextDoseIn([{ reminder_time: '12:00:00', enabled: false }], ref)).toBe(null);
  });
});
