import { round } from '../services/_parse';

/* ── Reverse converters (imperial → metric for display) ── */

export function lbsToKg(lbs) { return lbs / 2.20462; }
export function fToC(f) { return (f - 32) * 5 / 9; }
export function miToKm(mi) { return mi * 1.60934; }
export function kmToMi(km) { return km / 1.60934; }
export function mgDlToMmol(mgDl) { return mgDl / 18.0182; }

/* ── Metric overrides for vital types that change with unit system ── */

const METRIC_OVERRIDES = {
  weight:  { unit: 'kg',    convert: lbsToKg,     normalLow: undefined, normalHigh: undefined },
  temp:    { unit: '°C',    convert: fToC,         normalLow: 36.1,     normalHigh: 37.5 },
  glucose: { unit: 'mmol/L', convert: mgDlToMmol,  normalLow: 3.9,      normalHigh: 7.8 },
};

/**
 * Get the display unit string for a vital type under the given unit system.
 * Returns the original unit unchanged for types that don't vary (pain, mood, hr, etc.).
 */
export function getDisplayUnit(vitalType, unitSystem) {
  if (unitSystem === 'metric' && METRIC_OVERRIDES[vitalType?.id || vitalType]) {
    return METRIC_OVERRIDES[vitalType?.id || vitalType].unit;
  }
  return typeof vitalType === 'object' ? vitalType.unit : null;
}

/**
 * Convert a stored value to the user's preferred display unit.
 * Data is always stored in imperial (lbs, °F, mg/dL, km for distance).
 * Returns { value, unit } for display.
 */
export function convertVitalForDisplay(value, vitalTypeId, unitSystem) {
  if (value == null || value === '') return { value, unit: null };
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return { value, unit: null };

  if (unitSystem === 'metric' && METRIC_OVERRIDES[vitalTypeId]) {
    const o = METRIC_OVERRIDES[vitalTypeId];
    return { value: round(o.convert(num), 1), unit: o.unit };
  }
  return { value: num, unit: null }; // null unit = use default from VITAL_TYPES
}

/**
 * Get normal range values for a vital type under the given unit system.
 * Returns { normalLow, normalHigh } or undefined for types without ranges.
 */
export function getDisplayNormalRange(vitalTypeObj, unitSystem) {
  if (!vitalTypeObj) return {};
  if (unitSystem === 'metric' && METRIC_OVERRIDES[vitalTypeObj.id]) {
    const o = METRIC_OVERRIDES[vitalTypeObj.id];
    return {
      normalLow: o.normalLow,
      normalHigh: o.normalHigh,
      normalLow2: vitalTypeObj.normalLow2 != null ? round(o.convert(vitalTypeObj.normalLow2), 1) : undefined,
      normalHigh2: vitalTypeObj.normalHigh2 != null ? round(o.convert(vitalTypeObj.normalHigh2), 1) : undefined,
    };
  }
  return {
    normalLow: vitalTypeObj.normalLow,
    normalHigh: vitalTypeObj.normalHigh,
    normalLow2: vitalTypeObj.normalLow2,
    normalHigh2: vitalTypeObj.normalHigh2,
  };
}

/**
 * Convert distance for display. Stored data is in km (from imports).
 * Imperial users see miles; metric users see km as-is.
 */
export function convertDistanceForDisplay(km, unitSystem) {
  if (km == null || km === '' || km === 0) return { value: null, unit: 'km' };
  const num = typeof km === 'string' ? parseFloat(km) : km;
  if (!isFinite(num)) return { value: null, unit: 'km' };

  if (unitSystem === 'imperial') {
    return { value: round(kmToMi(num), 1), unit: 'mi' };
  }
  return { value: round(num, 1), unit: 'km' };
}

/**
 * Convert a user-entered distance back to km for storage.
 */
export function convertDistanceForStorage(value, unitSystem) {
  if (value == null || value === '') return value;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return value;
  if (unitSystem === 'imperial') {
    return round(miToKm(num), 2);
  }
  return num;
}

/**
 * Convert a user-entered vital value back to imperial for storage.
 */
export function convertVitalForStorage(value, vitalTypeId, unitSystem) {
  if (value == null || value === '') return value;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return value;

  if (unitSystem === 'metric' && vitalTypeId === 'weight') {
    return round(num * 2.20462, 1); // kg → lbs
  }
  if (unitSystem === 'metric' && vitalTypeId === 'temp') {
    return round((num * 9 / 5) + 32, 1); // °C → °F
  }
  if (unitSystem === 'metric' && vitalTypeId === 'glucose') {
    return round(num * 18.0182, 0); // mmol/L → mg/dL
  }
  return num;
}
