/**
 * Apple Health Export Parser
 *
 * Parses the export.xml from Apple Health's "Export All Health Data" feature.
 * Maps Apple HealthKit record types → Salve data tables.
 *
 * Supported flow:
 *   1. User goes to iPhone Health → Profile → Export All Health Data
 *   2. Gets a .zip file containing export.xml
 *   3. Uploads the .zip (or extracted .xml) here
 *   4. We parse and return Salve-normalized data
 */

// ── Apple HealthKit type → Salve vital type mapping ──
const VITAL_MAP = {
  'HKQuantityTypeIdentifierHeartRate': { type: 'hr', unit: 'bpm' },
  'HKQuantityTypeIdentifierRestingHeartRate': { type: 'hr', unit: 'bpm', note: 'resting' },
  'HKQuantityTypeIdentifierWalkingHeartRateAverage': { type: 'hr', unit: 'bpm', note: 'walking avg' },
  'HKQuantityTypeIdentifierBloodPressureSystolic': { type: 'bp_sys' },
  'HKQuantityTypeIdentifierBloodPressureDiastolic': { type: 'bp_dia' },
  'HKQuantityTypeIdentifierBodyMass': { type: 'weight', unit: 'lbs' },
  'HKQuantityTypeIdentifierBodyMassIndex': { type: 'bmi', unit: '' },
  'HKQuantityTypeIdentifierBodyTemperature': { type: 'temp', unit: '°F' },
  'HKQuantityTypeIdentifierBloodGlucose': { type: 'glucose', unit: 'mg/dL' },
  'HKQuantityTypeIdentifierOxygenSaturation': { type: 'spo2', unit: '%' },
  'HKQuantityTypeIdentifierRespiratoryRate': { type: 'resp', unit: '/min' },
  'HKCategoryTypeIdentifierSleepAnalysis': { type: 'sleep', unit: 'hrs' },
  'HKQuantityTypeIdentifierStepCount': { type: 'steps', unit: 'steps' },
  'HKQuantityTypeIdentifierActiveEnergyBurned': { type: 'calories', unit: 'kcal' },
  'HKQuantityTypeIdentifierHeight': { type: 'height' },
  'HKQuantityTypeIdentifierBodyFatPercentage': { type: 'body_fat', unit: '%' },
};

// ── Unit conversions ──
function convertValue(value, unit, targetType) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  // Weight: kg → lbs
  if (targetType === 'weight' && unit === 'kg') return (num * 2.20462).toFixed(1);
  // Temp: °C → °F
  if (targetType === 'temp' && unit === 'degC') return ((num * 9/5) + 32).toFixed(1);
  // SpO2: fraction → percentage
  if (targetType === 'spo2' && num <= 1) return (num * 100).toFixed(0);
  // Body fat: fraction → percentage
  if (targetType === 'body_fat' && num <= 1) return (num * 100).toFixed(1);
  // Height: m → inches for profile
  if (targetType === 'height' && unit === 'm') {
    const inches = num * 39.3701;
    const ft = Math.floor(inches / 12);
    const rem = Math.round(inches % 12);
    return ft + "'" + rem + '"';
  }

  return String(num % 1 === 0 ? num : num.toFixed(1));
}

/**
 * Parse Apple Health export XML string into Salve-normalized data.
 * Returns same shape as normalizeImportData() for seamless import.
 */
export function parseAppleHealthXML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML file. Make sure this is an Apple Health export.');
  }

  const records = doc.querySelectorAll('Record');
  const correlations = doc.querySelectorAll('Correlation');

  if (records.length === 0 && correlations.length === 0) {
    throw new Error('No health records found in this file.');
  }

  // Collect raw data
  const vitals = [];
  const bpReadings = {}; // keyed by date+time to pair systolic/diastolic
  let latestHeight = null;
  const sleepSessions = {};
  const medications = [];
  const immunizations = [];
  const labResults = [];

  // ── Process correlations (blood pressure pairs) ──
  correlations.forEach(corr => {
    if (corr.getAttribute('type') === 'HKCorrelationTypeIdentifierBloodPressure') {
      const date = extractDate(corr.getAttribute('startDate'));
      const childRecords = corr.querySelectorAll('Record');
      let sys = '', dia = '';
      childRecords.forEach(r => {
        const type = r.getAttribute('type');
        const val = r.getAttribute('value');
        if (type === 'HKQuantityTypeIdentifierBloodPressureSystolic') sys = String(Math.round(parseFloat(val)));
        if (type === 'HKQuantityTypeIdentifierBloodPressureDiastolic') dia = String(Math.round(parseFloat(val)));
      });
      if (sys && dia) {
        vitals.push({
          date,
          type: 'bp',
          value: sys,
          value2: dia,
          unit: 'mmHg',
          notes: 'Apple Health',
        });
      }
    }
  });

  // ── Process individual records ──
  records.forEach(record => {
    const type = record.getAttribute('type');
    const value = record.getAttribute('value');
    const unit = record.getAttribute('unit');
    const startDate = record.getAttribute('startDate');
    const endDate = record.getAttribute('endDate');
    const sourceName = record.getAttribute('sourceName') || '';
    const date = extractDate(startDate);

    // Medications (iOS 16+ Clinical Records or CDA)
    if (type === 'HKClinicalTypeIdentifierMedicationRecord') {
      const name = extractClinicalData(record, 'medicationName') || 'Unknown medication';
      medications.push({
        name,
        notes: 'Imported from Apple Health' + (sourceName ? ' (' + sourceName + ')' : ''),
        active: true,
      });
      return;
    }

    // Immunizations from clinical records
    if (type === 'HKClinicalTypeIdentifierImmunizationRecord') {
      const name = extractClinicalData(record, 'immunizationName') || 'Unknown immunization';
      immunizations.push({
        date,
        name,
        provider: sourceName,
      });
      return;
    }

    // Lab results from clinical records
    if (type === 'HKClinicalTypeIdentifierLabResultRecord') {
      const testName = extractClinicalData(record, 'testName') || 'Unknown test';
      const result = extractClinicalData(record, 'value') || value || '';
      labResults.push({
        date,
        test_name: testName,
        result,
        notes: 'Apple Health' + (sourceName ? ' (' + sourceName + ')' : ''),
      });
      return;
    }

    const mapping = VITAL_MAP[type];
    if (!mapping) return;

    // Height — just capture the latest for profile
    if (mapping.type === 'height') {
      latestHeight = convertValue(value, unit, 'height');
      return;
    }

    // Sleep — aggregate sessions by date into total hours
    if (mapping.type === 'sleep') {
      // Apple records sleep as category with startDate/endDate
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const hours = (end - start) / (1000 * 60 * 60);
        // Only count "asleep" categories (not InBed)
        const catValue = value || '';
        const isAsleep = catValue.includes('Asleep') || catValue === 'HKCategoryValueSleepAnalysisAsleep' ||
                         catValue.includes('Core') || catValue.includes('Deep') || catValue.includes('REM');
        if (isAsleep && hours > 0 && hours < 24) {
          const sleepDate = extractDate(endDate); // attribute to wake-up date
          if (!sleepSessions[sleepDate]) sleepSessions[sleepDate] = 0;
          sleepSessions[sleepDate] += hours;
        }
      }
      return;
    }

    // BP from individual records (not correlated) — pair them
    if (mapping.type === 'bp_sys' || mapping.type === 'bp_dia') {
      const key = date + '_' + (startDate || '').slice(11, 16);
      if (!bpReadings[key]) bpReadings[key] = { date };
      if (mapping.type === 'bp_sys') bpReadings[key].sys = String(Math.round(parseFloat(value)));
      if (mapping.type === 'bp_dia') bpReadings[key].dia = String(Math.round(parseFloat(value)));
      return;
    }

    // Standard vital
    const converted = convertValue(value, unit, mapping.type);
    const notePrefix = mapping.note ? mapping.note + ' — ' : '';
    vitals.push({
      date,
      type: mapping.type,
      value: converted,
      value2: '',
      unit: mapping.unit || unit || '',
      notes: notePrefix + 'Apple Health' + (sourceName ? ' (' + sourceName + ')' : ''),
    });
  });

  // ── Pair remaining BP readings ──
  for (const bp of Object.values(bpReadings)) {
    if (bp.sys && bp.dia) {
      vitals.push({
        date: bp.date,
        type: 'bp',
        value: bp.sys,
        value2: bp.dia,
        unit: 'mmHg',
        notes: 'Apple Health',
      });
    }
  }

  // ── Convert sleep sessions to vitals ──
  for (const [date, hours] of Object.entries(sleepSessions)) {
    vitals.push({
      date,
      type: 'sleep',
      value: hours.toFixed(1),
      value2: '',
      unit: 'hrs',
      notes: 'Apple Health (total sleep)',
    });
  }

  // ── Deduplicate: keep one reading per type per date ──
  // For most vitals, daily granularity is sufficient and saves tokens
  const deduped = deduplicateByDay(vitals);

  // Sort by date
  deduped.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Build result
  const result = {
    settings: latestHeight ? { height: latestHeight } : null,
    meds: deduplicateByName(medications),
    conditions: [],
    allergies: [],
    providers: [],
    vitals: deduped,
    appts: [],
    journal: [],
    labs: labResults,
    procedures: [],
    immunizations: deduplicateByName(immunizations, 'name'),
    care_gaps: [],
    anesthesia_flags: [],
    appeals_and_disputes: [],
    surgical_planning: [],
    insurance: [],
  };

  return result;
}

/**
 * Extract a .zip file and find export.xml inside.
 * Returns the XML string.
 */
export async function extractZipXML(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  // Look for export.xml (may be in root or apple_health_export/ folder)
  let xmlFile = zip.file('export.xml') ||
                zip.file('apple_health_export/export.xml') ||
                zip.file(/export\.xml$/i)[0];

  if (!xmlFile) {
    // Try to find any XML file
    const xmlFiles = zip.file(/\.xml$/i);
    if (xmlFiles.length > 0) {
      // Pick the largest one (likely the main export)
      let largest = xmlFiles[0];
      for (const f of xmlFiles) {
        if (f._data?.uncompressedSize > largest._data?.uncompressedSize) largest = f;
      }
      xmlFile = largest;
    }
  }

  if (!xmlFile) {
    throw new Error('No export.xml found in ZIP file. Make sure this is an Apple Health export.');
  }

  return await xmlFile.async('string');
}

// ── Helpers ──

function extractDate(dateStr) {
  if (!dateStr) return '';
  // Apple format: "2024-01-15 08:30:00 -0700"
  return dateStr.slice(0, 10);
}

function extractClinicalData(record, field) {
  // Clinical records may have metadata elements
  const meta = record.querySelectorAll('MetadataEntry');
  for (const m of meta) {
    if (m.getAttribute('key')?.toLowerCase().includes(field.toLowerCase())) {
      return m.getAttribute('value');
    }
  }
  return null;
}

function deduplicateByDay(vitals) {
  const seen = new Map(); // key: "type|date"
  const result = [];
  // Process in reverse so we keep the LATEST reading per day
  for (let i = vitals.length - 1; i >= 0; i--) {
    const v = vitals[i];
    const key = v.type + '|' + v.date;
    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(v);
    }
  }
  return result.reverse();
}

function deduplicateByName(items, field = 'name') {
  const seen = new Set();
  return items.filter(item => {
    const key = (item[field] || '').toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Detect if a file is an Apple Health export.
 * Works on both ZIP files and raw XML.
 */
export function isAppleHealthFile(file) {
  const name = (file.name || '').toLowerCase();
  return name === 'export.xml' ||
         name.includes('apple_health') ||
         name === 'export.zip' ||
         (name.endsWith('.zip') && name.includes('health'));
}

/**
 * Get import preview stats from parsed Apple Health data.
 */
export function getAppleHealthPreview(parsed) {
  const preview = {};
  const keys = ['vitals', 'meds', 'immunizations', 'labs'];
  for (const key of keys) {
    if (parsed[key]?.length > 0) preview[key] = parsed[key].length;
  }
  if (parsed.settings?.height) preview['profile (height)'] = 1;
  return preview;
}
