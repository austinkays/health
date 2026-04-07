import { VITAL_TYPES } from '../constants/defaults.js';

/* ── Generic field validator ─────────────────────────────── */

/**
 * Validate a single field value against rules.
 * @param {*} value
 * @param {{ required?: boolean, maxLength?: number, min?: number, max?: number, numeric?: boolean }} rules
 * @returns {string|null} Error message or null if valid
 */
export function validateField(value, rules = {}) {
  const str = (value == null ? '' : String(value)).trim();

  if (rules.required && !str) return 'Required';
  if (!str) return null; // remaining rules only apply to non-empty values

  if (rules.maxLength && str.length > rules.maxLength)
    return `Max ${rules.maxLength} characters`;

  if (rules.numeric) {
    const n = Number(value);
    if (isNaN(n)) return 'Must be a number';
    if (rules.min != null && n < rules.min) return `Min ${rules.min}`;
    if (rules.max != null && n > rules.max) return `Max ${rules.max}`;
  }

  return null;
}

/* ── Per-type hard limits for vitals (reject impossibles) ── */

const VITAL_LIMITS = {
  pain:    { min: 0, max: 10 },
  mood:    { min: 0, max: 10 },
  energy:  { min: 0, max: 10 },
  sleep:   { min: 0, max: 24 },
  bp:      { min: 20, max: 300 },
  hr:      { min: 10, max: 350 },
  weight:  { min: 0.1, max: 1500 },
  temp:    { min: 85, max: 115 },
  glucose: { min: 1, max: 1000 },
  spo2:    { min: 0, max: 100 },
  resp:    { min: 1, max: 80 },
  steps:   { min: 0, max: 200000 },
  active_energy: { min: 0, max: 20000 },
};

/* ── Vital validation ─────────────────────────────────────── */

export function validateVital(form) {
  const errors = {};
  const limits = VITAL_LIMITS[form.type] || {};

  const valErr = validateField(form.value, {
    required: true,
    numeric: true,
    min: limits.min,
    max: limits.max,
  });
  if (valErr) errors.value = valErr;

  if (form.type === 'bp') {
    const val2Err = validateField(form.value2, {
      required: true,
      numeric: true,
      min: 10,
      max: 250,
    });
    if (val2Err) errors.value2 = val2Err;
  }

  const notesErr = validateField(form.notes, { maxLength: 2000 });
  if (notesErr) errors.notes = notesErr;

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ── Medication validation ─────────────────────────────────── */

export function validateMedication(form) {
  const errors = {};

  const nameErr = validateField(form.name, { required: true, maxLength: 200 });
  if (nameErr) errors.name = nameErr;

  const doseErr = validateField(form.dose, { maxLength: 100 });
  if (doseErr) errors.dose = doseErr;

  const notesErr = validateField(form.notes, { maxLength: 2000 });
  if (notesErr) errors.notes = notesErr;

  const purposeErr = validateField(form.purpose, { maxLength: 500 });
  if (purposeErr) errors.purpose = purposeErr;

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ── Lab validation ────────────────────────────────────────── */

export function validateLab(form) {
  const errors = {};

  const nameErr = validateField(form.test_name, { required: true, maxLength: 200 });
  if (nameErr) errors.test_name = nameErr;

  const resultErr = validateField(form.result, { maxLength: 100 });
  if (resultErr) errors.result = resultErr;

  const notesErr = validateField(form.notes, { maxLength: 2000 });
  if (notesErr) errors.notes = notesErr;

  return { valid: Object.keys(errors).length === 0, errors };
}

/* ── Helper: get warn label for vitals (out-of-normal-range) */

export function getVitalWarning(type, value) {
  const vt = VITAL_TYPES.find(v => v.id === type);
  if (!vt) return null;
  const n = Number(value);
  if (isNaN(n)) return null;
  if (vt.warnHigh != null && n >= vt.warnHigh) return 'high';
  if (vt.warnLow != null && n <= vt.warnLow) return 'low';
  if (vt.normalHigh != null && n > vt.normalHigh) return 'above normal';
  if (vt.normalLow != null && n < vt.normalLow) return 'below normal';
  return null;
}
