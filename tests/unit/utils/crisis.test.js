import { describe, it, expect } from 'vitest';
import { detectCrisis } from '../../../src/utils/crisis.js';

describe('detectCrisis — empty / invalid input', () => {
  it('returns no-crisis for empty / null / non-string inputs', () => {
    expect(detectCrisis('')).toEqual({ isCrisis: false, type: null });
    expect(detectCrisis(null)).toEqual({ isCrisis: false, type: null });
    expect(detectCrisis(undefined)).toEqual({ isCrisis: false, type: null });
    expect(detectCrisis(42)).toEqual({ isCrisis: false, type: null });
  });
});

describe('detectCrisis — mental health (suicidal ideation)', () => {
  it.each([
    'I want to die',
    'I want to kill myself',
    'just want to end it all',
    'planning my suicide',
    "don't want to be alive anymore",
    'wish I were dead',
    "I'm a burden",
    'nobody would miss me',
    'the world would be better without me',
    "can't take this anymore",
    'better off dead',
  ])('flags "%s" as mental-health crisis', (text) => {
    const result = detectCrisis(text);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('mental');
  });

  it('flags self-harm language as mental-health type', () => {
    expect(detectCrisis('been cutting myself again').type).toBe('mental');
    expect(detectCrisis('thinking about self-harm').type).toBe('mental');
  });

  it('does NOT flag benign phrases that share keywords', () => {
    expect(detectCrisis("I was dying laughing at that").isCrisis).toBe(false);
    expect(detectCrisis("killed my workout today").isCrisis).toBe(false);
    expect(detectCrisis("I hurt myself at the gym").isCrisis).toBe(false);
    expect(detectCrisis("hurt myself running yesterday").isCrisis).toBe(false);
    expect(detectCrisis("burning myself out at work").isCrisis).toBe(false);
    expect(detectCrisis("burned myself cooking").isCrisis).toBe(false);
  });
});

describe('detectCrisis — medical emergency', () => {
  it.each([
    'I think I overdosed',
    'took too many pills',
    'having a seizure right now',
    'having a heart attack',
    'anaphylactic reaction',
    'poisoned by something I ate',
  ])('flags "%s" as medical emergency', (text) => {
    const result = detectCrisis(text);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('medical');
  });

  it('does NOT flag exercise-related chest pain as a medical emergency', () => {
    expect(detectCrisis('chest pain when I run').isCrisis).toBe(false);
    expect(detectCrisis('chest pain after running').isCrisis).toBe(false);
  });

  it('does NOT flag exercise-induced shortness of breath', () => {
    expect(detectCrisis("can't breathe when I exercise").isCrisis).toBe(false);
    expect(detectCrisis("can't breathe around cats").isCrisis).toBe(false);
  });
});

describe('detectCrisis — safety / domestic violence', () => {
  it.each([
    "my partner hits me",
    "afraid of my husband",
    "he threatened to kill me",
    "not safe at home",
    "domestic abuse",
  ])('flags "%s" as safety crisis', (text) => {
    const result = detectCrisis(text);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('safety');
  });

  it.each([
    'he threatens to kill me',
    'she threatens to hurt me',
    'my partner threatens to harm me',
    'threatens to beat me',
  ])('catches present-tense threats: "%s"', (text) => {
    const result = detectCrisis(text);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('safety');
  });
});

describe('detectCrisis — case + punctuation robustness', () => {
  it('is case-insensitive', () => {
    expect(detectCrisis('I WANT TO DIE').isCrisis).toBe(true);
    expect(detectCrisis('I Want to DIE').isCrisis).toBe(true);
  });

  it('normalizes smart quotes in contractions', () => {
    // "don\u2019t" (curly apostrophe) should still match "don't want to be alive"
    expect(detectCrisis('I don\u2019t want to be alive').isCrisis).toBe(true);
  });

  it('normalizes collapsed whitespace', () => {
    expect(detectCrisis('I\n\nwant   to   die\tnow').isCrisis).toBe(true);
  });

  it('does not false-positive on plain daily-life text', () => {
    expect(detectCrisis('Had a great day at work, energy level 7/10').isCrisis).toBe(false);
    expect(detectCrisis('Feeling better after meds kicked in').isCrisis).toBe(false);
  });
});
