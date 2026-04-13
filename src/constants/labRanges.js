// Common lab reference ranges for display purposes
// Source: standard clinical reference ranges (may vary by lab)
// These are general adult ranges, individual lab reports may differ

export const LAB_RANGES = {
  // Complete Blood Count (CBC)
  'wbc':          { name: 'White Blood Cells',  unit: 'K/uL',   low: 4.5,   high: 11.0 },
  'rbc':          { name: 'Red Blood Cells',    unit: 'M/uL',   low: 4.5,   high: 5.5 },
  'hemoglobin':   { name: 'Hemoglobin',         unit: 'g/dL',   low: 12.0,  high: 17.5 },
  'hgb':          { name: 'Hemoglobin',         unit: 'g/dL',   low: 12.0,  high: 17.5 },
  'hematocrit':   { name: 'Hematocrit',         unit: '%',      low: 36,    high: 51 },
  'hct':          { name: 'Hematocrit',         unit: '%',      low: 36,    high: 51 },
  'platelets':    { name: 'Platelets',          unit: 'K/uL',   low: 150,   high: 400 },
  'plt':          { name: 'Platelets',          unit: 'K/uL',   low: 150,   high: 400 },
  'mcv':          { name: 'MCV',                unit: 'fL',     low: 80,    high: 100 },
  'mch':          { name: 'MCH',                unit: 'pg',     low: 27,    high: 33 },
  'mchc':         { name: 'MCHC',               unit: 'g/dL',   low: 32,    high: 36 },
  'rdw':          { name: 'RDW',                unit: '%',      low: 11.5,  high: 14.5 },
  'mpv':          { name: 'MPV',                unit: 'fL',     low: 7.5,   high: 11.5 },

  // Comprehensive Metabolic Panel (CMP)
  'glucose':      { name: 'Glucose',            unit: 'mg/dL',  low: 70,    high: 100 },
  'bun':          { name: 'BUN',                unit: 'mg/dL',  low: 7,     high: 20 },
  'creatinine':   { name: 'Creatinine',         unit: 'mg/dL',  low: 0.6,   high: 1.2 },
  'egfr':         { name: 'eGFR',               unit: 'mL/min', low: 60,    high: 999 },
  'sodium':       { name: 'Sodium',             unit: 'mEq/L',  low: 136,   high: 145 },
  'potassium':    { name: 'Potassium',          unit: 'mEq/L',  low: 3.5,   high: 5.0 },
  'chloride':     { name: 'Chloride',           unit: 'mEq/L',  low: 98,    high: 106 },
  'co2':          { name: 'CO2 (Bicarbonate)',   unit: 'mEq/L',  low: 23,    high: 29 },
  'bicarbonate':  { name: 'Bicarbonate',        unit: 'mEq/L',  low: 23,    high: 29 },
  'calcium':      { name: 'Calcium',            unit: 'mg/dL',  low: 8.5,   high: 10.5 },
  'protein':      { name: 'Total Protein',      unit: 'g/dL',   low: 6.0,   high: 8.3 },
  'albumin':      { name: 'Albumin',            unit: 'g/dL',   low: 3.5,   high: 5.5 },
  'bilirubin':    { name: 'Bilirubin (Total)',   unit: 'mg/dL',  low: 0.1,   high: 1.2 },
  'alp':          { name: 'Alk Phosphatase',    unit: 'U/L',    low: 44,    high: 147 },
  'alt':          { name: 'ALT (SGPT)',         unit: 'U/L',    low: 7,     high: 56 },
  'ast':          { name: 'AST (SGOT)',         unit: 'U/L',    low: 10,    high: 40 },

  // Lipid Panel
  'cholesterol':       { name: 'Total Cholesterol',  unit: 'mg/dL', low: 0,   high: 200 },
  'total cholesterol': { name: 'Total Cholesterol',  unit: 'mg/dL', low: 0,   high: 200 },
  'ldl':               { name: 'LDL Cholesterol',    unit: 'mg/dL', low: 0,   high: 100 },
  'hdl':               { name: 'HDL Cholesterol',    unit: 'mg/dL', low: 40,  high: 999 },
  'triglycerides':     { name: 'Triglycerides',      unit: 'mg/dL', low: 0,   high: 150 },

  // Thyroid
  'tsh':          { name: 'TSH',                unit: 'mIU/L',  low: 0.4,   high: 4.0 },
  'free t4':      { name: 'Free T4',            unit: 'ng/dL',  low: 0.8,   high: 1.8 },
  't4':           { name: 'T4',                 unit: 'ug/dL',  low: 4.5,   high: 12.0 },
  'free t3':      { name: 'Free T3',            unit: 'pg/mL',  low: 2.3,   high: 4.2 },
  't3':           { name: 'T3',                 unit: 'ng/dL',  low: 80,    high: 200 },

  // Diabetes
  'a1c':          { name: 'Hemoglobin A1C',     unit: '%',      low: 0,     high: 5.7 },
  'hba1c':        { name: 'Hemoglobin A1C',     unit: '%',      low: 0,     high: 5.7 },

  // Iron Studies
  'iron':         { name: 'Iron',               unit: 'ug/dL',  low: 60,    high: 170 },
  'ferritin':     { name: 'Ferritin',           unit: 'ng/mL',  low: 12,    high: 300 },
  'tibc':         { name: 'TIBC',               unit: 'ug/dL',  low: 250,   high: 400 },

  // Vitamins
  'vitamin d':    { name: 'Vitamin D (25-OH)',  unit: 'ng/mL',  low: 30,    high: 100 },
  'vitamin b12':  { name: 'Vitamin B12',        unit: 'pg/mL',  low: 200,   high: 900 },
  'b12':          { name: 'Vitamin B12',        unit: 'pg/mL',  low: 200,   high: 900 },
  'folate':       { name: 'Folate',             unit: 'ng/mL',  low: 2.7,   high: 17.0 },

  // Inflammatory Markers
  'crp':          { name: 'C-Reactive Protein', unit: 'mg/L',   low: 0,     high: 3.0 },
  'esr':          { name: 'Sed Rate (ESR)',     unit: 'mm/hr',  low: 0,     high: 20 },
  'sed rate':     { name: 'Sed Rate (ESR)',     unit: 'mm/hr',  low: 0,     high: 20 },

  // Kidney
  'uric acid':    { name: 'Uric Acid',          unit: 'mg/dL',  low: 3.0,   high: 7.0 },
  'microalbumin': { name: 'Microalbumin',       unit: 'mg/L',   low: 0,     high: 30 },

  // Coagulation
  'inr':          { name: 'INR',                unit: '',       low: 0.8,   high: 1.1 },
  'pt':           { name: 'Prothrombin Time',   unit: 'sec',    low: 11,    high: 13.5 },
  'ptt':          { name: 'PTT',                unit: 'sec',    low: 25,    high: 35 },

  // Hormones
  'cortisol':     { name: 'Cortisol (AM)',      unit: 'ug/dL',  low: 6.2,   high: 19.4 },
  'testosterone': { name: 'Testosterone',       unit: 'ng/dL',  low: 270,   high: 1070 },
  'estradiol':    { name: 'Estradiol',          unit: 'pg/mL',  low: 15,    high: 350 },

  // Magnesium
  'magnesium':    { name: 'Magnesium',          unit: 'mg/dL',  low: 1.7,   high: 2.2 },

  // Phosphorus
  'phosphorus':   { name: 'Phosphorus',         unit: 'mg/dL',  low: 2.5,   high: 4.5 },
};

/**
 * Look up reference range for a lab test name.
 * Fuzzy-matches against known test names.
 * @param {string} testName
 * @returns {{ name, unit, low, high } | null}
 */
export function findLabRange(testName) {
  if (typeof testName !== 'string' || !testName) return null;
  const key = testName.trim().toLowerCase();
  // Direct match
  if (LAB_RANGES[key]) return LAB_RANGES[key];
  // Partial match, check if the test name contains a known key
  for (const [k, v] of Object.entries(LAB_RANGES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}
