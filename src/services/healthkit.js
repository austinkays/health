// Apple Health XML export parser
// Handles large files (50-200MB) via chunked regex extraction
// Aggregates high-frequency data (HR, steps) to daily summaries

/* ── HealthKit type → Salve type mapping ──────────────── */

const HK_TYPE_MAP = {
  HKQuantityTypeIdentifierHeartRate: 'hr',
  HKQuantityTypeIdentifierStepCount: '_steps',      // aggregated into activities, not vitals
  HKQuantityTypeIdentifierActiveEnergyBurned: '_energy', // aggregated into activities, not vitals
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierBodyTemperature: 'temp',
  HKQuantityTypeIdentifierBloodGlucose: 'glucose',
  HKQuantityTypeIdentifierBloodPressureSystolic: 'bp_sys',
  HKQuantityTypeIdentifierBloodPressureDiastolic: 'bp_dia',
  HKQuantityTypeIdentifierOxygenSaturation: 'spo2',
  HKQuantityTypeIdentifierRespiratoryRate: 'resp',
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep',
};

const SLEEP_ASLEEP_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
  'HKCategoryValueSleepAnalysisAsleepUnspecified',
  'HKCategoryValueSleepAnalysisAsleep',
]);

const HK_WORKOUT_MAP = {
  HKWorkoutActivityTypeRunning: 'Running',
  HKWorkoutActivityTypeWalking: 'Walking',
  HKWorkoutActivityTypeCycling: 'Cycling',
  HKWorkoutActivityTypeSwimming: 'Swimming',
  HKWorkoutActivityTypeHiking: 'Hiking',
  HKWorkoutActivityTypeYoga: 'Yoga',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'Strength Training',
  HKWorkoutActivityTypeTraditionalStrengthTraining: 'Strength Training',
  HKWorkoutActivityTypeHighIntensityIntervalTraining: 'HIIT',
  HKWorkoutActivityTypeElliptical: 'Elliptical',
  HKWorkoutActivityTypeRowing: 'Rowing',
  HKWorkoutActivityTypeDance: 'Dance',
  HKWorkoutActivityTypePilates: 'Pilates',
  HKWorkoutActivityTypeCooldown: 'Cooldown',
  HKWorkoutActivityTypeCoreTraining: 'Core Training',
  HKWorkoutActivityTypeMixedCardio: 'Mixed Cardio',
  HKWorkoutActivityTypeStairClimbing: 'Stair Climbing',
};

/* ── Unit conversion helpers ──────────────────────────── */

function convertWeight(value, unit) {
  if (unit === 'kg') return +(value * 2.20462).toFixed(1);
  return +value;
}

function convertTemp(value, unit) {
  if (unit === 'degC') return +(value * 9 / 5 + 32).toFixed(1);
  return +value;
}

function parseDate(dateStr) {
  // Apple Health: "2024-01-15 08:30:00 -0800" or ISO format
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function parseDuration(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start) || isNaN(end)) return 0;
  return (end - start) / 60000; // minutes
}

/* ── Format detection ─────────────────────────────────── */

export function detectAppleHealthFormat(text) {
  if (!text || typeof text !== 'string') return false;
  const sample = text.slice(0, 2000);
  if (sample.includes('<HealthData') || sample.includes('HKQuantityTypeIdentifier')) return 'xml';
  return false;
}

export function detectAppleHealthJSON(data) {
  return data && data._source === 'salve-healthkit-shortcut';
}

/* ── Main XML parser (chunked, regex-based) ───────────── */

// Accepts either a string OR an ArrayBuffer (for large files)
// monthsBack: only import data from the last N months (default 6)
export function parseAppleHealthExport(input, { onProgress, monthsBack = 6 } = {}) {
  const rawVitals = {};
  const rawBP = {};
  const rawSleep = {};
  const rawSteps = {};    // { '2024-01-15': totalSteps }
  const rawEnergy = {};   // { '2024-01-15': totalKcal }
  const activities = [];
  const labs = [];
  const counts = { records: 0, vitals: 0, sleep: 0, workouts: 0, labs: 0, skipped: 0, tooOld: 0 };

  // Compute cutoff date
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB decoded text chunks
  const OVERLAP = 4096;

  if (typeof input === 'string') {
    processChunkedText(input, input.length, CHUNK_SIZE, OVERLAP, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr, onProgress);
  } else if (input instanceof ArrayBuffer) {
    // ArrayBuffer mode (large ZIP files — decode in chunks, never hold full string)
    const decoder = new TextDecoder('utf-8');
    const totalBytes = input.byteLength;
    const DECODE_CHUNK = 2 * 1024 * 1024; // 2MB decode window
    let carryover = '';

    for (let byteOffset = 0; byteOffset < totalBytes; byteOffset += DECODE_CHUNK) {
      const slice = new Uint8Array(input, byteOffset, Math.min(DECODE_CHUNK, totalBytes - byteOffset));
      const isLast = byteOffset + DECODE_CHUNK >= totalBytes;
      const decoded = decoder.decode(slice, { stream: !isLast });
      const text = carryover + decoded;

      // Process this chunk, but keep the last OVERLAP chars as carryover
      // to handle tags split across chunk boundaries
      if (!isLast && text.length > OVERLAP) {
        const processable = text.slice(0, text.length - OVERLAP);
        carryover = text.slice(text.length - OVERLAP);
        processTextChunk(processable, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr);
      } else {
        processTextChunk(text, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr);
        carryover = '';
      }

      if (onProgress) {
        onProgress(Math.min(95, Math.round((byteOffset + DECODE_CHUNK) / totalBytes * 95)));
      }
    }
  }

  const vitals = aggregateVitals(rawVitals, rawBP, rawSleep);
  counts.vitals = vitals.length;
  counts.sleep = Object.keys(rawSleep).length;

  // Convert daily steps/energy into activity summary records
  for (const [date, steps] of Object.entries(rawSteps)) {
    const energy = rawEnergy[date] || 0;
    activities.push({
      date, type: 'Daily Activity',
      duration_minutes: null,
      distance: null,
      calories: energy ? Math.round(energy) : null,
      heart_rate_avg: null,
      source: 'apple_health',
      notes: `${Math.round(steps).toLocaleString()} steps${energy ? `, ${Math.round(energy)} kcal active energy` : ''}`,
    });
  }
  counts.workouts = activities.length;

  return { vitals, labs, activities, counts };
}

function processChunkedText(text, totalLen, chunkSize, overlap, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr, onProgress) {
  for (let offset = 0; offset < totalLen; offset += chunkSize - overlap) {
    const chunk = text.slice(offset, offset + chunkSize);
    processTextChunk(chunk, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr);
    if (onProgress) {
      onProgress(Math.min(95, Math.round((offset + chunkSize) / totalLen * 95)));
    }
  }
}

function processTextChunk(chunk, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, activities, labs, counts, cutoffStr) {
  // Parse <Record> elements
  const recordRegex = /<Record\s+([^>]+?)\/>/g;
  let match;
  while ((match = recordRegex.exec(chunk)) !== null) {
    counts.records++;
    const attrs = parseAttributes(match[1]);
    const date = parseDate(attrs.startDate);
    if (date && date < cutoffStr) { counts.tooOld++; continue; }
    processRecord(attrs, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, counts);
  }

  // Parse <Workout> elements
  const workoutRegex = /<Workout\s+([^>]+?)(?:\/>|>[\s\S]*?<\/Workout>)/g;
  while ((match = workoutRegex.exec(chunk)) !== null) {
    const attrs = parseAttributes(match[1]);
    const date = parseDate(attrs.startDate);
    if (date && date < cutoffStr) { counts.tooOld++; continue; }
    const activity = processWorkout(attrs);
    if (activity) {
      activities.push(activity);
      counts.workouts++;
    }
  }

  // Parse <ClinicalRecord> with FHIR data (no date filter — labs are always relevant)
  const clinicalRegex = /<ClinicalRecord\s+([^>]+?)\/>/g;
  while ((match = clinicalRegex.exec(chunk)) !== null) {
    const attrs = parseAttributes(match[1]);
    const lab = processClinicalRecord(attrs);
    if (lab) {
      labs.push(lab);
      counts.labs++;
    }
  }
}

/* ── Attribute parser ─────────────────────────────────── */

function parseAttributes(attrStr) {
  const attrs = {};
  const regex = /(\w+)="([^"]*?)"/g;
  let m;
  while ((m = regex.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/* ── Record processing ────────────────────────────────── */

function processRecord(attrs, rawVitals, rawBP, rawSleep, rawSteps, rawEnergy, counts) {
  const type = HK_TYPE_MAP[attrs.type];
  if (!type) { counts.skipped++; return; }
  const date = parseDate(attrs.startDate);
  if (!date) return;
  const value = parseFloat(attrs.value);

  // Steps and energy → aggregate for activities, not vitals
  if (type === '_steps') {
    rawSteps[date] = (rawSteps[date] || 0) + (isNaN(value) ? 0 : value);
    return;
  }
  if (type === '_energy') {
    rawEnergy[date] = (rawEnergy[date] || 0) + (isNaN(value) ? 0 : value);
    return;
  }

  if (type === 'sleep') {
    // Sleep: accumulate asleep minutes per night
    if (SLEEP_ASLEEP_VALUES.has(attrs.value)) {
      const mins = parseDuration(attrs.startDate, attrs.endDate);
      if (mins > 0) rawSleep[date] = (rawSleep[date] || 0) + mins;
    }
    return;
  }

  if (type === 'bp_sys' || type === 'bp_dia') {
    // BP: pair systolic/diastolic by approximate timestamp
    const ts = attrs.startDate?.slice(0, 16) || date; // match by minute
    if (!rawBP[ts]) rawBP[ts] = {};
    rawBP[ts][type === 'bp_sys' ? 'sys' : 'dia'] = value;
    rawBP[ts].date = date;
    return;
  }

  // Apply unit conversions
  let finalValue = value;
  if (type === 'weight') finalValue = convertWeight(value, attrs.unit);
  if (type === 'temp') finalValue = convertTemp(value, attrs.unit);

  const key = `${type}|${date}`;
  if (!rawVitals[key]) rawVitals[key] = [];
  rawVitals[key].push(finalValue);
}

/* ── Aggregation ──────────────────────────────────────── */

function aggregateVitals(rawVitals, rawBP, rawSleep) {
  const vitals = [];

  // Aggregate by type+date
  for (const [key, values] of Object.entries(rawVitals)) {
    const [type, date] = key.split('|');

    if (type === 'hr') {
      // Heart rate: daily average, with min/max in notes
      const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      const min = Math.min(...values);
      const max = Math.max(...values);
      vitals.push({
        date, type: 'hr', value: String(avg), value2: '', unit: 'bpm',
        notes: `${values.length} readings. Min: ${min}, Max: ${max}`,
        source: 'apple_health',
      });
    } else {
      // Weight, temp, glucose, etc: last reading of the day
      const last = values[values.length - 1];
      const unitMap = { weight: 'lbs', temp: '°F', glucose: 'mg/dL', spo2: '%', resp: 'rpm' };
      vitals.push({
        date, type, value: String(last), value2: '', unit: unitMap[type] || '', notes: '',
        source: 'apple_health',
      });
    }
  }

  // Blood pressure pairs
  for (const [, bp] of Object.entries(rawBP)) {
    if (bp.sys && bp.dia && bp.date) {
      vitals.push({
        date: bp.date, type: 'bp', value: String(Math.round(bp.sys)),
        value2: String(Math.round(bp.dia)), unit: 'mmHg', notes: '',
        source: 'apple_health',
      });
    }
  }

  // Sleep
  for (const [date, minutes] of Object.entries(rawSleep)) {
    const hours = +(minutes / 60).toFixed(1);
    vitals.push({
      date, type: 'sleep', value: String(hours), value2: '', unit: 'hrs', notes: '',
      source: 'apple_health',
    });
  }

  return vitals;
}

/* ── Workout processing ───────────────────────────────── */

function processWorkout(attrs) {
  const date = parseDate(attrs.startDate);
  if (!date) return null;

  const type = HK_WORKOUT_MAP[attrs.workoutActivityType] || attrs.workoutActivityType?.replace('HKWorkoutActivityType', '') || 'Other';
  const duration = attrs.duration ? +parseFloat(attrs.duration).toFixed(1) : null;
  const distance = attrs.totalDistance ? +parseFloat(attrs.totalDistance).toFixed(2) : null;
  const calories = attrs.totalEnergyBurned ? Math.round(parseFloat(attrs.totalEnergyBurned)) : null;

  return {
    date, type,
    duration_minutes: duration,
    distance, // km
    calories,
    heart_rate_avg: null,
    source: attrs.sourceName || 'Apple Health',
    notes: '',
  };
}

/* ── FHIR R4 clinical record parsing ──────────────────── */

function processClinicalRecord(attrs) {
  if (attrs.type !== 'HKClinicalTypeIdentifierLabResultRecord') return null;

  try {
    const fhir = JSON.parse(attrs.fhirResource || '{}');
    if (fhir.resourceType !== 'Observation') return null;

    const testName = fhir.code?.coding?.[0]?.display || fhir.code?.text || '';
    if (!testName) return null;

    const result = fhir.valueQuantity?.value ?? fhir.valueString ?? '';
    const unit = fhir.valueQuantity?.unit || fhir.valueQuantity?.code || '';
    const range = fhir.referenceRange?.[0]
      ? `${fhir.referenceRange[0].low?.value ?? ''}-${fhir.referenceRange[0].high?.value ?? ''}`
      : '';

    // Map FHIR interpretation to Salve flag
    const interp = fhir.interpretation?.[0]?.coding?.[0]?.code || '';
    let flag = '';
    if (interp === 'H' || interp === 'HH') flag = 'high';
    else if (interp === 'L' || interp === 'LL') flag = 'low';
    else if (interp === 'A') flag = 'abnormal';
    else if (interp === 'N') flag = 'normal';

    const date = parseDate(fhir.effectiveDateTime || fhir.issued || attrs.startDate);

    return {
      date: date || '',
      test_name: testName,
      result: String(result),
      unit,
      range: range.replace('-', ' - '),
      flag,
      provider: fhir.performer?.[0]?.display || 'Apple Health',
      notes: '',
    };
  } catch {
    return null;
  }
}

/* ── Standalone FHIR JSON → Lab record parser ─────────── */
// For parsing individual .json files from the clinical-records folder

export function parseFhirToLab(fhir) {
  if (!fhir) return null;

  // Handle Bundle (contains multiple entries)
  if (fhir.resourceType === 'Bundle' && Array.isArray(fhir.entry)) {
    const labs = fhir.entry
      .map(e => parseFhirToLab(e.resource))
      .filter(Boolean);
    return labs.length === 1 ? labs[0] : labs.length > 0 ? labs : null;
  }

  // Handle DiagnosticReport (may reference contained Observations)
  if (fhir.resourceType === 'DiagnosticReport') {
    if (Array.isArray(fhir.contained)) {
      const labs = fhir.contained.map(c => parseFhirToLab(c)).filter(Boolean);
      return labs.length === 1 ? labs[0] : labs.length > 0 ? labs : null;
    }
    return null;
  }

  if (fhir.resourceType !== 'Observation') return null;

  const testName = fhir.code?.coding?.[0]?.display || fhir.code?.text || '';
  if (!testName) return null;

  const result = fhir.valueQuantity?.value ?? fhir.valueString ?? '';
  const unit = fhir.valueQuantity?.unit || fhir.valueQuantity?.code || '';
  const range = fhir.referenceRange?.[0]
    ? `${fhir.referenceRange[0].low?.value ?? ''} - ${fhir.referenceRange[0].high?.value ?? ''}`
    : '';

  const interp = fhir.interpretation?.[0]?.coding?.[0]?.code || '';
  let flag = '';
  if (interp === 'H' || interp === 'HH') flag = 'high';
  else if (interp === 'L' || interp === 'LL') flag = 'low';
  else if (interp === 'A') flag = 'abnormal';
  else if (interp === 'N') flag = 'normal';

  const date = parseDate(fhir.effectiveDateTime || fhir.issued || '');

  return {
    date: date || '',
    test_name: testName,
    result: String(result),
    unit,
    range,
    flag,
    provider: fhir.performer?.[0]?.display || 'Apple Health',
    notes: '',
  };
}

/* ── Deduplication ────────────────────────────────────── */

export function deduplicateAgainst(newRecords, existing, keyFn) {
  const existingKeys = new Set(existing.map(keyFn));
  return newRecords.filter(r => !existingKeys.has(keyFn(r)));
}

export const DEDUP_KEYS = {
  vitals: r => `${r.date}|${r.type}|${r.value}`,
  labs: r => `${r.date}|${r.test_name}|${r.result}`,
  activities: r => `${r.date}|${r.type}|${r.duration_minutes}`,
};
