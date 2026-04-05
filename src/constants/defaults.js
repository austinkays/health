// Default data shapes for new entries

import { todayISO } from '../utils/dates';

export const EMPTY_MED = {
  name: '', display_name: '', dose: '', frequency: '', route: 'Oral',
  prescriber: '', pharmacy: '', start_date: '', purpose: '',
  refill_date: '', active: true, notes: '', rxcui: '', fda_data: null,
};

export const EMPTY_CONDITION = {
  name: '', diagnosed_date: '', status: 'active',
  provider: '', linked_meds: '', notes: '',
};

export const EMPTY_ALLERGY = {
  substance: '', reaction: '', severity: 'moderate', type: '', notes: '',
};

export const EMPTY_PROVIDER = {
  name: '', specialty: '', clinic: '',
  phone: '', fax: '', portal_url: '', notes: '',
  npi: '', address: '', is_favorite: false,
};

export const EMPTY_VITAL = {
  date: todayISO(),
  type: 'pain', value: '', value2: '', unit: '', notes: '',
};

export const EMPTY_PHARMACY = {
  name: '', address: '', phone: '', fax: '',
  hours: '', website: '', is_preferred: false, notes: '',
};

export const EMPTY_APPOINTMENT = {
  date: '', time: '', provider: '', location: '',
  reason: '', questions: '', post_notes: '', video_call_url: '',
};

export const EMPTY_JOURNAL = {
  date: todayISO(),
  title: '', content: '', severity: '5', tags: '', mood: '',
};

export const DEFAULT_SETTINGS = {
  name: '', location: '', ai_mode: 'onDemand',
  pharmacy: '', insurance_plan: '', insurance_id: '',
  insurance_group: '', insurance_phone: '', health_background: '',
};

// Vital types reference (with normal ranges)
export const VITAL_TYPES = [
  { id: 'pain', label: 'Pain', unit: '/10', min: 0, max: 10, warnHigh: 7 },
  { id: 'mood', label: 'Mood', unit: '/10', min: 0, max: 10, warnLow: 3 },
  { id: 'energy', label: 'Energy', unit: '/10', min: 0, max: 10, warnLow: 3 },
  { id: 'sleep', label: 'Sleep', unit: 'hrs', min: 0, max: 24, normalLow: 6, normalHigh: 9 },
  { id: 'bp', label: 'Blood Pressure', unit: 'mmHg', normalLow: 90, normalHigh: 140, normalLow2: 60, normalHigh2: 90 },
  { id: 'hr', label: 'Heart Rate', unit: 'bpm', normalLow: 60, normalHigh: 100 },
  { id: 'weight', label: 'Weight', unit: 'lbs' },
  { id: 'temp', label: 'Temperature', unit: '°F', normalLow: 97.0, normalHigh: 99.5 },
  { id: 'glucose', label: 'Blood Sugar', unit: 'mg/dL', normalLow: 70, normalHigh: 140 },
  { id: 'spo2', label: 'Blood Oxygen', unit: '%', normalLow: 95, normalHigh: 100 },
  { id: 'resp', label: 'Respiratory Rate', unit: 'rpm', normalLow: 12, normalHigh: 20 },
];

// Mood options for journal entries
export const MOODS = [
  '😀 Great', '😊 Good', '😐 Okay', '😔 Low',
  '😢 Sad', '😠 Frustrated', '😰 Anxious', '😴 Exhausted',
];

export const EMPTY_CLAIM = {
  date: '', provider: '', description: '', billed_amount: '',
  allowed_amount: '', paid_amount: '', patient_responsibility: '',
  status: 'submitted', claim_number: '', insurance_plan: '', notes: '',
};

export const EMPTY_DRUG_PRICE = {
  medication_id: '', rxcui: '', ndc: '', nadac_per_unit: null,
  pricing_unit: 'EA', drug_name: '', effective_date: '',
  as_of_date: '', classification: '',
};

export const EMPTY_CYCLE = {
  date: todayISO(),
  type: 'period', value: '', symptom: '', notes: '',
};

export const FLOW_LEVELS = ['Spotting', 'Light', 'Medium', 'Heavy'];

export const CYCLE_SYMPTOMS = [
  'Cramps', 'Bloating', 'Breast tenderness', 'Headache', 'Fatigue',
  'Acne', 'Mood swing', 'Nausea', 'Backache', 'Insomnia',
];

export const CERVICAL_MUCUS_LEVELS = [
  { value: 'dry', label: 'Dry / None', fertility: 'infertile' },
  { value: 'sticky', label: 'Sticky / Tacky', fertility: 'low' },
  { value: 'creamy', label: 'Creamy / Lotion-like', fertility: 'medium' },
  { value: 'eggwhite', label: 'Clear / Stretchy (egg white)', fertility: 'peak' },
];

export const FERTILITY_MARKERS = ['OPK positive', 'OPK negative', 'Mittelschmerz'];

export const EMPTY_TODO = {
  title: '', notes: '', due_date: '',
  priority: 'medium', category: 'custom',
  completed: false, completed_at: null,
  recurring: 'none', related_id: null,
  related_table: '', source: 'manual', dismissed: false,
};

export const EMPTY_ACTIVITY = {
  date: '', type: '', duration_minutes: '', distance: '',
  calories: '', heart_rate_avg: '', source: 'manual', notes: '',
};

export const WORKOUT_TYPES = [
  'Running', 'Walking', 'Cycling', 'Swimming', 'Hiking',
  'Strength Training', 'Yoga', 'HIIT', 'Elliptical', 'Rowing', 'Other',
];

export const EMPTY_GENETIC_RESULT = {
  source: '', gene: '', variant: '', phenotype: '',
  affected_drugs: [], category: 'pharmacogenomic', notes: '',
};

export const CYCLE_RELATED_KEYWORDS = [
  'birth control', 'contraceptive', 'oral contraceptive',
  'estrogen', 'progestin', 'progesterone', 'levonorgestrel',
  'ethinyl estradiol', 'norethindrone', 'desogestrel',
  'drospirenone', 'etonogestrel', 'medroxyprogesterone',
  'hormonal', 'hrt', 'hormone replacement',
  'iron supplement', 'ferrous', 'iron',
  'spironolactone', 'clomiphene', 'letrozole',
  'gonadotropin', 'lupron', 'leuprolide',
];

export function getCycleRelatedLabel(med) {
  const check = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return CYCLE_RELATED_KEYWORDS.some(kw => lower.includes(kw));
  };

  const moa = med.fda_data?.pharm_class_moa?.join(' ') || '';
  const pe = med.fda_data?.pharm_class_pe?.join(' ') || '';
  const pharmMatch = check(moa) || check(pe);
  const nameMatch = check(med.name);

  if (!pharmMatch && !nameMatch) return null;

  const allText = `${moa} ${pe} ${(med.name || '').toLowerCase()}`;
  if (/contraceptive|birth control/.test(allText)) return 'Birth control';
  if (/estrogen|progestin|progesterone|hrt|hormone replacement/.test(allText)) return 'Hormonal';
  if (/iron|ferrous/.test(allText)) return 'Iron supplement';
  return 'Cycle-related';
}
