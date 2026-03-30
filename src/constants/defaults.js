// Default data shapes for new entries

export const EMPTY_MED = {
  name: '', display_name: '', dose: '', frequency: '', route: 'Oral',
  prescriber: '', pharmacy: '', start_date: '', purpose: '',
  refill_date: '', active: true, notes: '', rxcui: '',
};

export const EMPTY_CONDITION = {
  name: '', diagnosed_date: '', status: 'active',
  provider: '', linked_meds: '', notes: '',
};

export const EMPTY_ALLERGY = {
  substance: '', reaction: '', severity: 'moderate', notes: '',
};

export const EMPTY_PROVIDER = {
  name: '', specialty: '', clinic: '',
  phone: '', fax: '', portal_url: '', notes: '',
  npi: '', address: '',
};

export const EMPTY_VITAL = {
  date: new Date().toISOString().slice(0, 10),
  type: 'pain', value: '', value2: '', unit: '', notes: '',
};

export const EMPTY_APPOINTMENT = {
  date: '', time: '', provider: '', location: '',
  reason: '', questions: '', post_notes: '',
};

export const EMPTY_JOURNAL = {
  date: new Date().toISOString().slice(0, 10),
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
];

// Mood options for journal entries
export const MOODS = [
  '😀 Great', '😊 Good', '😐 Okay', '😔 Low',
  '😢 Sad', '😠 Frustrated', '😰 Anxious', '😴 Exhausted',
];
