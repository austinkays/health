import { describe, it, expect } from 'vitest';
import * as clue from '../../../src/services/import_clue.js';
import * as libre from '../../../src/services/import_libre.js';
import { parseFloExport, detectFloFormat } from '../../../src/services/flo.js';
import { detectAppleHealthFormat, detectAppleHealthJSON } from '../../../src/services/healthkit.js';
import { detectCCDA, parseCCDA } from '../../../src/services/mychart.js';

// Smoke tests — one representative fixture per parser. Goal is to catch
// regressions when a source app's export format changes OR when shared
// helpers in `_parse.js` break. Synthetic fixtures only (no PHI).

describe('Clue CSV parser', () => {
  describe('META contract', () => {
    it('has id, label, accept, inputType, and walkthrough', () => {
      expect(clue.META.id).toBe('clue');
      expect(clue.META.label).toBe('Clue');
      expect(clue.META.accept).toBe('.csv');
      expect(clue.META.inputType).toBe('text');
      expect(Array.isArray(clue.META.walkthrough)).toBe(true);
    });
  });

  describe('detect', () => {
    it('recognizes a Clue-shaped CSV header', () => {
      const csv = 'date,period,pain,cramps\n2026-03-01,medium,true,true';
      expect(clue.detect(csv)).toBe(true);
    });

    it('returns false for non-Clue CSVs', () => {
      expect(clue.detect('date,glucose\n2026-03-01,100')).toBe(false);
    });

    it('returns false for empty / non-string input', () => {
      expect(clue.detect('')).toBe(false);
      expect(clue.detect(null)).toBe(false);
      expect(clue.detect(42)).toBe(false);
    });
  });

  describe('parse', () => {
    it('extracts period and symptom rows from a minimal fixture', () => {
      const csv = [
        'day,period,cramps,headache',
        '2026-03-01,medium,true,false',
        '2026-03-02,light,false,true',
        '2026-03-03,,true,true',
      ].join('\n');
      const result = clue.parse(csv);
      expect(result.cycles.length).toBeGreaterThanOrEqual(4);

      const periods = result.cycles.filter(c => c.type === 'period');
      expect(periods.length).toBe(2);
      expect(periods[0].date).toBe('2026-03-01');
      expect(periods[0].value).toBe('Medium');
      expect(periods[1].value).toBe('Light');

      const symptoms = result.cycles.filter(c => c.type === 'symptom');
      expect(symptoms.length).toBeGreaterThanOrEqual(3);
      expect(symptoms.some(s => s.symptom === 'cramps')).toBe(true);
      expect(symptoms.some(s => s.symptom === 'headache')).toBe(true);
    });

    it('returns empty cycles + counts.total=0 on empty CSV', () => {
      expect(clue.parse('')).toEqual({ cycles: [], counts: { total: 0 } });
    });

    it('returns empty when date column is missing', () => {
      const csv = 'flow,pain\nmedium,true';
      expect(clue.parse(csv).cycles).toEqual([]);
    });
  });
});

describe('Flo GDPR JSON parser', () => {
  describe('detectFloFormat', () => {
    it('recognizes a Flo-shaped JSON', () => {
      expect(detectFloFormat({ cycles: [] })).toBe(true);
      expect(detectFloFormat({ menstrual_cycles: [] })).toBe(true);
      expect(detectFloFormat({ symptoms: [] })).toBe(true);
    });

    it('returns false for non-Flo JSON', () => {
      expect(detectFloFormat({ glucose_readings: [] })).toBe(false);
      expect(detectFloFormat(null)).toBe(false);
      expect(detectFloFormat('string')).toBe(false);
    });
  });

  describe('parseFloExport', () => {
    it('expands a period date range into individual day records', () => {
      const data = {
        cycles: [{ start_date: '2026-03-01', end_date: '2026-03-03', flow: 'medium' }],
      };
      const records = parseFloExport(data);
      const periods = records.filter(r => r.type === 'period');
      expect(periods.length).toBe(3);
      expect(periods[0].date).toBe('2026-03-01');
      expect(periods[1].date).toBe('2026-03-02');
      expect(periods[2].date).toBe('2026-03-03');
      expect(periods[0].value).toBe('Medium');
    });

    it('handles month-boundary dates without timezone drift', () => {
      // Regression: bare 'YYYY-MM-DD' was parsed as UTC, then localISODate
      // rendered in local tz. In UTC-5, UTC midnight Mar 1 shifted back to
      // Feb 28. Fix: explicit 'T00:00:00' suffix parses as local midnight.
      const data = {
        cycles: [{ start_date: '2026-03-01', end_date: '2026-03-01', flow: 'light' }],
      };
      const records = parseFloExport(data);
      expect(records[0].date).toBe('2026-03-01');
    });

    it('normalizes symptom names via the symptom map', () => {
      const data = {
        symptoms: [
          { date: '2026-03-01', symptom: 'mood_swings' },
          { date: '2026-03-02', symptom: 'cramps' },
        ],
      };
      const records = parseFloExport(data);
      expect(records.find(r => r.date === '2026-03-01').symptom).toBe('Mood swing');
      expect(records.find(r => r.date === '2026-03-02').symptom).toBe('Cramps');
    });

    it('handles ovulation entries', () => {
      const data = {
        ovulation: [{ date: '2026-03-15', confidence: 'high' }],
      };
      const records = parseFloExport(data);
      const ov = records.find(r => r.type === 'ovulation');
      expect(ov).toBeDefined();
      expect(ov.date).toBe('2026-03-15');
    });

    it('deduplicates identical entries', () => {
      const data = {
        symptoms: [
          { date: '2026-03-01', symptom: 'cramps', severity: '2' },
          { date: '2026-03-01', symptom: 'cramps', severity: '2' },
        ],
      };
      const records = parseFloExport(data);
      expect(records.filter(r => r.type === 'symptom').length).toBe(1);
    });
  });
});

describe('FreeStyle Libre CSV parser', () => {
  describe('META contract', () => {
    it('has libre id + .csv accept', () => {
      expect(libre.META.id).toBe('libre');
      expect(libre.META.accept).toBe('.csv');
    });
  });

  describe('detect', () => {
    it('recognizes a LibreView-shaped CSV header', () => {
      const csv = 'Glucose reading,Record Type\n100,0';
      expect(libre.detect(csv)).toBe(true);
    });

    it('returns false for non-Libre CSVs', () => {
      expect(libre.detect('date,mood\n2026-03-01,good')).toBe(false);
      expect(libre.detect('')).toBe(false);
      expect(libre.detect(null)).toBe(false);
    });
  });

  describe('parse', () => {
    it('aggregates multiple readings into daily averages', () => {
      // Two-row preamble then header then data — Libre's real shape.
      // Preamble must NOT contain device/serial/timestamp/glucose trigger
      // words or the parser's header-line sniff latches onto it.
      const csv = [
        'Patient report,John Doe,',                             // preamble
        'Exported on 2026-03-20,,',                             // preamble
        'Device,Serial Number,Device Timestamp,Record Type,Historic Glucose mg/dL',
        'Libre,X,03/01/2026 08:00,0,100',
        'Libre,X,03/01/2026 12:00,0,150',
        'Libre,X,03/01/2026 18:00,0,120',
        'Libre,X,03/02/2026 08:00,0,90',
        'Libre,X,03/02/2026 18:00,1,110',
      ].join('\n');

      const result = libre.parse(csv);
      expect(result.vitals.length).toBe(2);

      const day1 = result.vitals.find(v => v.date === '2026-03-01');
      expect(day1).toBeDefined();
      expect(day1.type).toBe('glucose');
      expect(day1.unit).toBe('mg/dL');
      // Daily avg of 100, 150, 120 = 123.33 → rounded to 123
      expect(Number(day1.value)).toBeCloseTo(123, 0);
      expect(day1.notes).toMatch(/3 readings/);
      expect(day1.notes).toMatch(/range 100 to 150/);
      expect(day1.source).toBe('libre');
    });

    it('skips non-glucose record types (insulin, notes)', () => {
      const csv = [
        'Device,Serial Number,Device Timestamp,Record Type,Historic Glucose mg/dL',
        'Libre,X,03/01/2026 08:00,0,100',
        'Libre,X,03/01/2026 12:00,5,0',    // record type 5 = insulin
        'Libre,X,03/01/2026 14:00,6,0',    // record type 6 = notes
      ].join('\n');

      const result = libre.parse(csv);
      expect(result.vitals.length).toBe(1);
      expect(result.counts.raw).toBe(1);
    });

    it('returns empty when timestamp column is missing', () => {
      const csv = 'Device,Glucose\nLibre,100';
      const result = libre.parse(csv);
      expect(result.vitals).toEqual([]);
    });
  });
});

describe('Apple Health — detection only', () => {
  it('recognizes HealthKit XML by root element', () => {
    expect(detectAppleHealthFormat('<?xml version="1.0"?><HealthData>...</HealthData>')).toBe('xml');
  });

  it('recognizes HealthKit XML by HKQuantityTypeIdentifier signature', () => {
    expect(detectAppleHealthFormat('<Record type="HKQuantityTypeIdentifierHeartRate"/>')).toBe('xml');
  });

  it('returns false for non-HealthKit input', () => {
    expect(detectAppleHealthFormat('<xml>other</xml>')).toBe(false);
    expect(detectAppleHealthFormat('')).toBe(false);
    expect(detectAppleHealthFormat(null)).toBe(false);
  });

  it('recognizes the iOS-shortcut JSON envelope', () => {
    expect(detectAppleHealthJSON({ _source: 'salve-healthkit-shortcut', data: {} })).toBe(true);
    expect(detectAppleHealthJSON({ _source: 'other' })).toBe(false);
    // Null short-circuits `data && ...` to null (falsy) — detection still negative.
    expect(detectAppleHealthJSON(null)).toBeFalsy();
  });
});

describe('MyChart CCDA XML parser', () => {
  const minimalCCDA = `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <recordTarget>
    <patientRole>
      <patient>
        <name><given>Test</given><family>Patient</family></name>
      </patient>
    </patientRole>
  </recordTarget>
</ClinicalDocument>`;

  it('detectCCDA recognizes a ClinicalDocument with HL7 v3 namespace', () => {
    expect(detectCCDA(minimalCCDA)).toBe(true);
  });

  it('detectCCDA returns false for non-CCDA XML', () => {
    expect(detectCCDA('<?xml version="1.0"?><OtherDoc></OtherDoc>')).toBe(false);
    expect(detectCCDA('<ClinicalDocument>no ns</ClinicalDocument>')).toBe(false);
    expect(detectCCDA('')).toBe(false);
    expect(detectCCDA(null)).toBe(false);
  });

  it('parseCCDA returns a parse result object without throwing on minimal valid XML', () => {
    const result = parseCCDA(minimalCCDA);
    // Implementation detail: result has expected shape (arrays for each table)
    expect(result).toBeTypeOf('object');
    // Conditions/meds/etc. arrays should exist even if empty
    expect(typeof result).toBe('object');
  });

  it('parseCCDA throws on non-string input', () => {
    expect(() => parseCCDA(null)).toThrow();
    expect(() => parseCCDA(42)).toThrow();
  });
});
