// src/constants/demoData.js
// Curated demo user profile for the "Explore without signing in" mode.
// Realistic but fictional — represents someone juggling common chronic
// conditions (ADHD, IBS, allergies) and trying to manage them holistically.
// All dates are computed relative to today so the demo always feels current.

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Deterministic fake UUID so React keys stay stable across renders
let _demoIdCounter = 0;
function did() {
  _demoIdCounter += 1;
  return `demo-${_demoIdCounter.toString().padStart(8, '0')}-0000-0000-0000-000000000000`;
}

export function buildDemoData() {
  _demoIdCounter = 0;

  const settings = {
    id: 'demo-user',
    name: 'Jordan',
    location: 'Seattle, WA',
    pharmacy: 'Walgreens',
    insurance_plan: 'Regence BlueShield',
    insurance_id: '',
    insurance_group: '',
    insurance_phone: '',
    health_background: 'ADHD (Combined), IBS-D, seasonal allergies, managed anxiety. Looking to understand connections between sleep, mood, and GI flares.',
    ai_mode: 'onDemand',
    tier: 'premium',
    trial_expires_at: null,
  };

  const meds = [
    { id: did(), name: 'Adderall XR', display_name: 'Adderall XR', dose: '20mg', frequency: 'Once daily (morning)', route: 'Oral', prescriber: 'Dr. Priya Patel', pharmacy: 'Walgreens', purpose: 'ADHD', start_date: daysAgo(400), refill_date: daysFromNow(5), notes: 'Take with food to reduce appetite suppression', active: true },
    { id: did(), name: 'Dicyclomine', display_name: 'Bentyl', dose: '10mg', frequency: 'As needed (up to 4x daily)', route: 'Oral', prescriber: 'Dr. Marcus Chen', pharmacy: 'Walgreens', purpose: 'IBS cramping', start_date: daysAgo(180), refill_date: daysFromNow(22), notes: 'Use during flares only', active: true },
    { id: did(), name: 'Cetirizine', display_name: 'Zyrtec', dose: '10mg', frequency: 'Once daily', route: 'Oral', prescriber: 'Dr. Priya Patel', pharmacy: 'Walgreens', purpose: 'Seasonal allergies', start_date: daysAgo(300), refill_date: daysFromNow(15), notes: '', active: true },
    { id: did(), name: 'Magnesium glycinate', display_name: 'Magnesium', dose: '400mg', frequency: 'Nightly', route: 'Oral', prescriber: 'Self-directed', pharmacy: 'Costco', purpose: 'Sleep + leg cramps', start_date: daysAgo(120), refill_date: daysFromNow(30), notes: 'Helps falling asleep', active: true },
    { id: did(), name: 'Vitamin D3', display_name: 'Vitamin D3', dose: '2000 IU', frequency: 'Once daily', route: 'Oral', prescriber: 'Dr. Priya Patel', pharmacy: 'Costco', purpose: 'Low vitamin D (from labs)', start_date: daysAgo(220), refill_date: daysFromNow(45), notes: '', active: true },
  ];

  const conditions = [
    { id: did(), name: 'ADHD - Combined type', diagnosed_date: daysAgo(1460), status: 'active', provider: 'Dr. Priya Patel', linked_meds: 'Adderall XR', notes: 'Diagnosed as adult. Combined inattentive + hyperactive.' },
    { id: did(), name: 'IBS-D', diagnosed_date: daysAgo(680), status: 'managed', provider: 'Dr. Marcus Chen', linked_meds: 'Dicyclomine', notes: 'Triggered by stress and dairy. Low-FODMAP helps.' },
    { id: did(), name: 'Seasonal allergies', diagnosed_date: daysAgo(1800), status: 'managed', provider: 'Dr. Priya Patel', linked_meds: 'Cetirizine', notes: 'Spring + fall flares. Tree + grass pollen primarily.' },
    { id: did(), name: 'Generalized anxiety', diagnosed_date: daysAgo(900), status: 'managed', provider: 'Sarah Rivera, LCSW', linked_meds: '', notes: 'Managed with weekly therapy. No meds currently.' },
  ];

  const allergies = [
    { id: did(), substance: 'Penicillin', reaction: 'Rash, itching', severity: 'moderate', type: 'medication', notes: 'Discovered age 8' },
    { id: did(), substance: 'Shellfish', reaction: 'Hives, throat tightness', severity: 'severe', type: 'food', notes: 'Carry antihistamines. Have not needed EpiPen.' },
    { id: did(), substance: 'Dust mites', reaction: 'Sneezing, congestion', severity: 'mild', type: 'environmental', notes: '' },
  ];

  const providers = [
    { id: did(), name: 'Dr. Priya Patel', specialty: 'Primary Care', clinic: 'Capitol Hill Family Medicine', phone: '(206) 555-0142', fax: '', portal_url: 'https://mychart.example.com', notes: 'Been seeing since 2021', npi: '', address: '1520 E Pine St, Seattle, WA 98122' },
    { id: did(), name: 'Dr. Marcus Chen', specialty: 'Gastroenterology', clinic: 'Puget Sound GI Associates', phone: '(206) 555-0167', fax: '', portal_url: '', notes: '', npi: '', address: '1229 Madison St, Seattle, WA 98104' },
    { id: did(), name: 'Sarah Rivera, LCSW', specialty: 'Therapy / Mental Health', clinic: 'Private Practice', phone: '(206) 555-0199', fax: '', portal_url: '', notes: 'Weekly sessions Thursdays 4pm', npi: '', address: '' },
  ];

  const vitals = [];
  // 14 days of sleep, heart rate, mood, energy
  const sleepValues = [6.5, 7.0, 5.5, 8.0, 6.0, 7.5, 6.8, 5.5, 7.2, 8.5, 6.0, 7.0, 6.5, 5.8];
  const hrValues = [62, 65, 71, 59, 68, 61, 64, 72, 60, 58, 67, 63, 66, 69];
  const moodValues = [7, 8, 5, 8, 6, 7, 7, 5, 7, 8, 6, 7, 7, 6];
  const energyValues = [6, 7, 4, 8, 5, 7, 6, 4, 7, 8, 5, 6, 7, 5];
  for (let i = 0; i < 14; i++) {
    const date = daysAgo(13 - i);
    vitals.push({ id: did(), date, type: 'sleep', value: sleepValues[i], unit: 'hrs', notes: '', source: 'manual' });
    vitals.push({ id: did(), date, type: 'hr', value: hrValues[i], unit: 'bpm', notes: '', source: 'manual' });
    vitals.push({ id: did(), date, type: 'mood', value: moodValues[i], unit: '/10', notes: '', source: 'manual' });
    vitals.push({ id: did(), date, type: 'energy', value: energyValues[i], unit: '/10', notes: '', source: 'manual' });
  }

  const appts = [
    { id: did(), date: daysFromNow(12), time: '10:30 AM', provider: 'Dr. Priya Patel', location: 'Capitol Hill Family Medicine', reason: 'Annual physical + medication review', questions: 'Ask about bumping Adderall IR for evening focus. Discuss vitamin D levels.', post_notes: '', video_call_url: '' },
    { id: did(), date: daysFromNow(3), time: '4:00 PM', provider: 'Sarah Rivera, LCSW', location: '', reason: 'Weekly therapy session', questions: '', post_notes: '', video_call_url: 'https://zoom.us/j/example' },
    { id: did(), date: daysAgo(18), time: '2:15 PM', provider: 'Dr. Marcus Chen', location: 'Puget Sound GI Associates', reason: 'IBS follow-up', questions: '', post_notes: 'Recommended staying on dicyclomine as-needed. Try eliminating gluten for 4 weeks to test sensitivity.', video_call_url: '' },
  ];

  const journal = [
    { id: did(), date: daysAgo(1), title: 'Good focus day', mood: 8, severity: 2, content: 'Adderall felt especially clean today. Got through a big project at work. Slept 8 hours last night — noticing a pattern that sleep > 7hrs makes meds work better.', tags: 'adhd,sleep,productivity' },
    { id: did(), date: daysAgo(3), title: 'IBS flare', mood: 4, severity: 6, content: 'Rough morning. Had pizza last night and paying for it. Taking dicyclomine. Also noticed I was really stressed yesterday — probably contributed.', tags: 'ibs,flare,stress' },
    { id: did(), date: daysAgo(6), title: 'Therapy insight', mood: 7, severity: 3, content: 'Sarah helped me see the connection between perfectionism at work and my IBS flares. Going to try setting earlier stop times this week.', tags: 'anxiety,therapy,insight' },
    { id: did(), date: daysAgo(9), title: 'Afternoon crash', mood: 5, severity: 4, content: 'Meds wore off around 2pm today and I just couldn\'t focus. Ate lunch late (3pm). Need to be better about lunch timing.', tags: 'adhd,meds' },
    { id: did(), date: daysAgo(12), title: 'First good run in weeks', mood: 8, severity: 1, content: 'Did 3 miles without stopping. Allergies are calming down finally. HR stayed in a nice zone.', tags: 'exercise,allergies,mood' },
  ];

  const labs = [
    { id: did(), date: daysAgo(55), name: 'Vitamin D 25-OH', value: '28', unit: 'ng/mL', flag: 'low', range: '30-100', provider: 'Dr. Priya Patel', notes: 'Started supplementation' },
    { id: did(), date: daysAgo(55), name: 'TSH', value: '2.1', unit: 'mIU/L', flag: 'normal', range: '0.4-4.0', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'Ferritin', value: '42', unit: 'ng/mL', flag: 'normal', range: '15-200', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'Hemoglobin A1C', value: '5.3', unit: '%', flag: 'normal', range: '<5.7', provider: 'Dr. Priya Patel', notes: '' },
  ];

  const todos = [
    { id: did(), title: 'Refill Adderall prescription', notes: 'Need to call Walgreens', due_date: daysFromNow(3), priority: 'high', category: 'medication', completed: false, completed_at: null, recurring: 'monthly', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Schedule annual eye exam', notes: 'Last one was over a year ago', due_date: daysFromNow(14), priority: 'medium', category: 'appointment', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Ask Sarah about increasing to twice-weekly', notes: 'For the annual physical coming up', due_date: daysFromNow(12), priority: 'low', category: 'follow_up', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Try one week fully gluten-free', notes: 'Per Dr. Chen recommendation', due_date: daysFromNow(7), priority: 'medium', category: 'custom', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
  ];

  const pharmacies = [
    { id: did(), name: 'Walgreens', address: '1531 Broadway, Seattle, WA 98122', phone: '(206) 555-0100', fax: '', hours: 'Mon-Fri 8am-10pm, Sat-Sun 9am-9pm', website: 'https://walgreens.com', is_preferred: true, notes: '' },
    { id: did(), name: 'Costco', address: '4401 4th Ave S, Seattle, WA 98134', phone: '(206) 555-0155', fax: '', hours: 'Mon-Fri 10am-8:30pm', website: 'https://costco.com', is_preferred: false, notes: 'Member pharmacy — cheaper for supplements' },
  ];

  const activities = [
    { id: did(), date: daysAgo(1), type: 'walk', duration_minutes: 32, distance: 1.8, calories: 145, heart_rate_avg: 110, source: 'manual', notes: 'Lunchtime walk' },
    { id: did(), date: daysAgo(3), type: 'run', duration_minutes: 28, distance: 3.0, calories: 290, heart_rate_avg: 148, source: 'manual', notes: 'Easy run' },
    { id: did(), date: daysAgo(5), type: 'yoga', duration_minutes: 45, distance: 0, calories: 160, heart_rate_avg: 92, source: 'manual', notes: '' },
    { id: did(), date: daysAgo(7), type: 'strength', duration_minutes: 40, distance: 0, calories: 220, heart_rate_avg: 120, source: 'manual', notes: 'Upper body' },
  ];

  // Empty collections — user sees empty states for these
  const immunizations = [];
  const procedures = [];
  const care_gaps = [];
  const anesthesia_flags = [];
  const appeals_and_disputes = [];
  const surgical_planning = [];
  const insurance = [];
  const insurance_claims = [];
  const drug_prices = [];
  const cycles = [];
  const genetic_results = [];

  return {
    meds, conditions, allergies, providers, pharmacies,
    vitals, appts, journal, labs, procedures, immunizations,
    care_gaps, anesthesia_flags, appeals_and_disputes, surgical_planning,
    insurance, insurance_claims, drug_prices,
    todos, cycles, activities, genetic_results,
    settings,
  };
}

// Flag for identifying demo mode anywhere in the app
export const DEMO_USER_ID = 'demo-user';
export const isDemoId = (id) => typeof id === 'string' && id.startsWith('demo-');
