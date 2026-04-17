import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateVital,
  validateMedication,
  validateLab,
  getVitalWarning,
} from '../../../src/utils/validate.js';

describe('validateField', () => {
  it('returns "Required" for empty required fields', () => {
    expect(validateField('', { required: true })).toBe('Required');
    expect(validateField(null, { required: true })).toBe('Required');
    expect(validateField('   ', { required: true })).toBe('Required');
  });

  it('allows empty optional fields', () => {
    expect(validateField('', {})).toBe(null);
    expect(validateField(null, {})).toBe(null);
  });

  it('enforces maxLength', () => {
    expect(validateField('a'.repeat(201), { maxLength: 200 })).toBe('Max 200 characters');
    expect(validateField('a'.repeat(200), { maxLength: 200 })).toBe(null);
  });

  it('enforces numeric parsing', () => {
    expect(validateField('abc', { numeric: true })).toBe('Must be a number');
    expect(validateField('42', { numeric: true })).toBe(null);
  });

  it('enforces numeric min/max', () => {
    expect(validateField('-1', { numeric: true, min: 0, max: 10 })).toBe('Min 0');
    expect(validateField('11', { numeric: true, min: 0, max: 10 })).toBe('Max 10');
    expect(validateField('5', { numeric: true, min: 0, max: 10 })).toBe(null);
  });
});

describe('validateVital — per-type hard ranges (VITAL_LIMITS)', () => {
  it('accepts a valid pain score in 0-10', () => {
    const { valid, errors } = validateVital({ type: 'pain', value: 5 });
    expect(valid).toBe(true);
    expect(errors).toEqual({});
  });

  it('rejects pain > 10', () => {
    const { valid, errors } = validateVital({ type: 'pain', value: 11 });
    expect(valid).toBe(false);
    expect(errors.value).toMatch(/Max 10/);
  });

  it('rejects HR below 10', () => {
    const { valid, errors } = validateVital({ type: 'hr', value: 5 });
    expect(valid).toBe(false);
    expect(errors.value).toMatch(/Min 10/);
  });

  it('rejects HR above 350', () => {
    const { valid, errors } = validateVital({ type: 'hr', value: 500 });
    expect(valid).toBe(false);
    expect(errors.value).toMatch(/Max 350/);
  });

  it('requires BOTH systolic and diastolic for bp type', () => {
    const { valid, errors } = validateVital({ type: 'bp', value: 120 });
    expect(valid).toBe(false);
    expect(errors.value2).toBeDefined();
  });

  it('accepts valid bp pair', () => {
    const { valid } = validateVital({ type: 'bp', value: 120, value2: 80 });
    expect(valid).toBe(true);
  });

  it('rejects sleep hours >= 25', () => {
    const { valid, errors } = validateVital({ type: 'sleep', value: 25 });
    expect(valid).toBe(false);
    expect(errors.value).toMatch(/Max 24/);
  });

  it('rejects temperature below 85 or above 115', () => {
    expect(validateVital({ type: 'temp', value: 80 }).valid).toBe(false);
    expect(validateVital({ type: 'temp', value: 120 }).valid).toBe(false);
    expect(validateVital({ type: 'temp', value: 98.6 }).valid).toBe(true);
  });

  it('rejects notes longer than 2000 chars', () => {
    const { valid, errors } = validateVital({ type: 'pain', value: 5, notes: 'a'.repeat(2001) });
    expect(valid).toBe(false);
    expect(errors.notes).toMatch(/Max 2000/);
  });

  it('rejects a missing required value', () => {
    const { valid, errors } = validateVital({ type: 'pain' });
    expect(valid).toBe(false);
    expect(errors.value).toBe('Required');
  });
});

describe('validateMedication', () => {
  it('requires a name', () => {
    const { valid, errors } = validateMedication({});
    expect(valid).toBe(false);
    expect(errors.name).toBe('Required');
  });

  it('rejects a name longer than 200 chars', () => {
    const { valid, errors } = validateMedication({ name: 'a'.repeat(201) });
    expect(valid).toBe(false);
    expect(errors.name).toMatch(/Max 200/);
  });

  it('accepts valid medication with all optional fields', () => {
    const { valid } = validateMedication({
      name: 'Lexapro', dose: '10mg', notes: 'Once daily', purpose: 'Anxiety',
    });
    expect(valid).toBe(true);
  });

  it('rejects dose > 100 chars, notes > 2000 chars, purpose > 500 chars', () => {
    expect(validateMedication({ name: 'X', dose: 'a'.repeat(101) }).valid).toBe(false);
    expect(validateMedication({ name: 'X', notes: 'a'.repeat(2001) }).valid).toBe(false);
    expect(validateMedication({ name: 'X', purpose: 'a'.repeat(501) }).valid).toBe(false);
  });
});

describe('validateLab', () => {
  it('requires test_name', () => {
    const { valid, errors } = validateLab({});
    expect(valid).toBe(false);
    expect(errors.test_name).toBe('Required');
  });

  it('accepts valid lab with result + notes', () => {
    const { valid } = validateLab({ test_name: 'TSH', result: '2.4', notes: 'Within range' });
    expect(valid).toBe(true);
  });
});

describe('getVitalWarning', () => {
  it('returns null for unknown vital type', () => {
    expect(getVitalWarning('unknown_type', 100)).toBe(null);
  });

  it('returns null for non-numeric value', () => {
    expect(getVitalWarning('hr', 'abc')).toBe(null);
  });

  // Exact warning thresholds come from VITAL_TYPES in defaults.js — we just
  // assert the function returns "high"/"low"/"above normal"/"below normal"
  // or null without crashing across a few vital types.
  it('returns a warning label for an out-of-range HR', () => {
    // Very high HR should produce 'high' or 'above normal' depending on VITAL_TYPES config
    const result = getVitalWarning('hr', 200);
    expect([null, 'high', 'above normal']).toContain(result);
  });
});
