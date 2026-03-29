// Default data shapes for new entries

export const EMPTY_MED = {
  name: '', dose: '', frequency: '', route: 'Oral',
  prescriber: '', pharmacy: '', start_date: '', purpose: '',
  refill_date: '', active: true, notes: '',
  time_of_day: '', quantity: '', days_supply: '', manufacturer: '', prior_auth: '',
};

export const EMPTY_CONDITION = {
  name: '', diagnosed_date: '', status: 'active',
  provider: '', linked_meds: '', notes: '',
  icd10: '', severity: '', facility: '',
};

export const EMPTY_ALLERGY = {
  substance: '', reaction: '', severity: 'moderate', notes: '',
  type: '', onset_date: '', confirmed_by: '',
};

export const EMPTY_PROVIDER = {
  name: '', specialty: '', clinic: '',
  phone: '', fax: '', portal_url: '', notes: '',
  address: '', city: '', state: '', zip: '', email: '', npi: '', accepted_insurance: '',
};

export const EMPTY_VITAL = {
  date: new Date().toISOString().slice(0, 10),
  type: 'pain', value: '', value2: '', unit: '', notes: '',
};

export const EMPTY_APPOINTMENT = {
  date: '', time: '', provider: '', location: '',
  reason: '', questions: '', post_notes: '',
  visit_type: '', telehealth_url: '', linked_condition: '',
};

export const EMPTY_JOURNAL = {
  date: new Date().toISOString().slice(0, 10),
  title: '', content: '', severity: '5', tags: '', mood: '',
};

export const DEFAULT_SETTINGS = {
  name: '', location: '', ai_mode: 'onDemand',
  pharmacy: '', insurance_plan: '', insurance_id: '',
  insurance_group: '', insurance_phone: '', health_background: '',
  dob: '', sex: '', height: '', blood_type: '',
  emergency_name: '', emergency_phone: '', emergency_relationship: '',
  primary_provider: '',
};

// Vital types reference
export const VITAL_TYPES = [
  { id: 'pain', label: 'Pain', unit: '/10' },
  { id: 'mood', label: 'Mood', unit: '/10' },
  { id: 'energy', label: 'Energy', unit: '/10' },
  { id: 'sleep', label: 'Sleep', unit: 'hrs' },
  { id: 'bp', label: 'Blood Pressure', unit: 'mmHg' },
  { id: 'hr', label: 'Heart Rate', unit: 'bpm' },
  { id: 'weight', label: 'Weight', unit: 'lbs' },
  { id: 'temp', label: 'Temperature', unit: '°F' },
  { id: 'glucose', label: 'Blood Sugar', unit: 'mg/dL' },
];

// Mood options for journal entries
export const MOODS = [
  '😀 Great', '😊 Good', '😐 Okay', '😔 Low',
  '😢 Sad', '😠 Frustrated', '😰 Anxious', '😴 Exhausted',
];
