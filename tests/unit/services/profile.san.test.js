import { describe, it, expect } from 'vitest';
import { san } from '../../../src/services/profile.js';

// san() is a prompt-injection safety boundary — all user-authored text
// flowing into AI prompts gets cleaned through this function first.

describe('san — empty / falsy input', () => {
  it('returns empty string on null / undefined / empty', () => {
    expect(san(null)).toBe('');
    expect(san(undefined)).toBe('');
    expect(san('')).toBe('');
    expect(san(0)).toBe('');
  });
});

describe('san — dangerous character stripping', () => {
  it('replaces angle brackets with spaces', () => {
    expect(san('hello <script>alert(1)</script>')).toBe('hello  script alert(1) /script ');
  });

  it('replaces curly braces with spaces', () => {
    // Each { or } becomes a single space, so {{ → 2 spaces
    expect(san('template {{ injected }} here')).toBe('template    injected    here');
  });

  it('replaces newlines and carriage returns with spaces', () => {
    expect(san('line one\nline two\r\nline three')).toBe('line one line two  line three');
  });

  it('strips Unicode bidi override characters (LRE / RLE / PDF / LRO / RLO)', () => {
    // \u202A = LRE, \u202B = RLE, \u202C = PDF, \u202D = LRO, \u202E = RLO
    const input = 'normal\u202ehidden\u202c text';
    const out = san(input);
    expect(out).not.toMatch(/[\u202A-\u202E]/);
  });

  it('strips Unicode isolate controls (LRI / RLI / FSI / PDI)', () => {
    // \u2066-\u2069 are bidirectional isolate control chars
    const input = 'visible\u2066trojan\u2069 text';
    const out = san(input);
    expect(out).not.toMatch(/[\u2066-\u2069]/);
  });

  it('strips LRM and RLM marks', () => {
    // \u200E = LRM, \u200F = RLM
    const input = 'normal\u200emark\u200f';
    const out = san(input);
    expect(out).not.toMatch(/[\u200E\u200F]/);
  });
});

describe('san — length cap', () => {
  it('truncates to the default 500-char limit', () => {
    const input = 'a'.repeat(1000);
    const out = san(input);
    expect(out.length).toBe(500);
  });

  it('respects a custom limit (e.g. 1000 for FDA data)', () => {
    const input = 'a'.repeat(2000);
    expect(san(input, 1000).length).toBe(1000);
    expect(san(input, 100).length).toBe(100);
  });

  it('does not pad shorter strings', () => {
    expect(san('short text').length).toBe(10);
  });
});

describe('san — non-string inputs', () => {
  it('stringifies numbers', () => {
    expect(san(42)).toBe('42');
    expect(san(3.14)).toBe('3.14');
  });

  it('stringifies booleans', () => {
    expect(san(true)).toBe('true');
    // Note: `san(false)` returns '' because the initial !text guard matches
    expect(san(false)).toBe('');
  });
});

describe('san — preserves safe prose', () => {
  it('leaves normal punctuation + accents alone', () => {
    const input = "I've been feeling 7/10 today. Slept ~6.5hrs. Café coffee helps.";
    expect(san(input)).toBe(input);
  });

  it('leaves emoji alone', () => {
    expect(san('Feeling 😊 today')).toBe('Feeling 😊 today');
  });
});
