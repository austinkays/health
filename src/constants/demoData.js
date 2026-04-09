// src/constants/demoData.js
// Curated demo user profile for the "Explore without signing in" mode.
// Realistic but fictional, represents someone juggling common chronic
// conditions (ADHD, IBS, allergies) and trying to manage them holistically.
// All dates are computed relative to today so the demo always feels current.

// Use LOCAL calendar date, not UTC. Without this, users west of UTC in the
// evening see "today" roll over to tomorrow's UTC date and the demo ends up
// with future-dated entries. (Apr 4 PT evening = Apr 5 UTC.)
function toLocalISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISODate(d);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}

// Pre-baked news articles for demo mode. The real Discover endpoint requires
// auth, so demo users would otherwise see an empty News page. These match
// Jordan's profile (ADHD, IBS, allergies, vitamin D, sleep).
export const DEMO_NEWS = [
  {
    id: 'demo-news-1',
    title: 'ADHD and Sleep: Why Insomnia Is So Common — And What Helps',
    blurb: 'Up to 75% of adults with ADHD report sleep difficulties. New research from the NIH explores how delayed circadian rhythms interact with stimulant medication timing, and outlines three evidence-based bedtime routines that have shown measurable improvement in clinical trials.',
    url: 'https://newsinhealth.nih.gov/2024/03/sleep-adhd',
    source: 'NIH News in Health',
    sourceShort: 'NIH',
    date: daysAgo(3),
    type: 'rss',
    matchedConditions: ['ADHD'],
  },
  {
    id: 'demo-news-2',
    title: 'The Gut-Brain Axis: How IBS Symptoms Track With Stress and Mood',
    blurb: 'A growing body of research confirms what many patients already know — IBS flares often follow periods of high stress. This article reviews the gut-brain signaling pathways involved and discusses why integrative approaches combining low-FODMAP diet, stress management, and targeted probiotics outperform single-treatment strategies.',
    url: 'https://newsinhealth.nih.gov/2024/02/gut-brain-axis-ibs',
    source: 'NIH News in Health',
    sourceShort: 'NIH',
    date: daysAgo(8),
    type: 'rss',
    matchedConditions: ['IBS'],
  },
  {
    id: 'demo-news-3',
    title: 'Vitamin D Deficiency Linked to Mood and Energy in Adults',
    blurb: 'New findings suggest vitamin D plays a larger role in mood regulation than previously thought. Adults with serum levels below 30 ng/mL reported significantly more fatigue and low mood in a 12-week observational study. Supplementation showed measurable improvement in those who corrected to the 40-60 ng/mL range.',
    url: 'https://newsinhealth.nih.gov/2024/01/vitamin-d-mood',
    source: 'NIH News in Health',
    sourceShort: 'NIH',
    date: daysAgo(12),
    type: 'rss',
    matchedConditions: ['Vitamin D'],
  },
  {
    id: 'demo-news-4',
    title: 'Seasonal Allergies: Why This Year Is Worse, and What Actually Works',
    blurb: 'Pollen seasons are arriving earlier and lasting longer due to climate trends. Allergists explain the difference between first-line antihistamines and newer steroid nasal sprays, when to escalate to immunotherapy, and why combining oral and nasal medications often works better than either alone.',
    url: 'https://newsinhealth.nih.gov/2024/04/seasonal-allergies',
    source: 'NIH News in Health',
    sourceShort: 'NIH',
    date: daysAgo(18),
    type: 'rss',
    matchedConditions: ['Allergies'],
  },
  {
    id: 'demo-news-5',
    title: 'FDA Updates Stimulant Prescribing Guidance for Adult ADHD',
    blurb: 'The FDA has issued updated prescribing guidance for adult ADHD stimulants, addressing recent shortages and clarifying recommended monitoring intervals for cardiovascular health. The new guidance also discusses long-acting vs short-acting formulation choices for adults with sleep-onset issues.',
    url: 'https://www.fda.gov/drugs/drug-safety-and-availability/adult-adhd-stimulants-2024',
    source: 'FDA Drug Safety',
    sourceShort: 'FDA',
    date: daysAgo(22),
    type: 'rss',
    matchedConditions: ['ADHD'],
  },
];

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
    {
      id: did(), name: 'Adderall XR', display_name: 'Adderall XR', dose: '20mg',
      frequency: 'Once daily (morning)', route: 'Oral', prescriber: 'Dr. Priya Patel',
      pharmacy: 'Walgreens', purpose: 'ADHD', start_date: daysAgo(400),
      refill_date: daysFromNow(5), notes: 'Take with food to reduce appetite suppression',
      active: true, rxcui: '849418',
      fda_data: {
        brand_name: 'Adderall XR',
        generic_name: 'Amphetamine / Dextroamphetamine (mixed salts)',
        manufacturer: 'Takeda Pharmaceuticals',
        pharm_class: ['Central Nervous System Stimulant [EPC]'],
        pharm_class_moa: ['Norepinephrine Reuptake Inhibitors [MoA]', 'Dopamine Uptake Inhibitors [MoA]'],
        boxed_warning: ['WARNING: ABUSE, MISUSE, AND ADDICTION\n\nCNS stimulants, including Adderall XR, have a high potential for abuse and misuse, which can lead to the development of a substance use disorder, including addiction. Assess each patient\'s risk for abuse, misuse, and addiction prior to prescribing. Monitor patients for signs and symptoms of abuse, misuse, and addiction during treatment.'],
        indications: ['Adderall XR is a central nervous system stimulant prescription medicine used for the treatment of Attention Deficit Hyperactivity Disorder (ADHD) in adults and children 6 years and older.'],
        spl_set_id: 'fc5f15cd-3a7e-4d8e-a0c1-8c7b7f0b4e2a',
      },
    },
    {
      id: did(), name: 'Dicyclomine', display_name: 'Bentyl', dose: '10mg',
      frequency: 'As needed (up to 4x daily)', route: 'Oral', prescriber: 'Dr. Marcus Chen',
      pharmacy: 'Walgreens', purpose: 'IBS cramping', start_date: daysAgo(180),
      refill_date: daysFromNow(22), notes: 'Use during flares only', active: true,
      rxcui: '3443',
      fda_data: {
        brand_name: 'Bentyl',
        generic_name: 'Dicyclomine hydrochloride',
        pharm_class: ['Anticholinergic [EPC]'],
        indications: ['Bentyl is indicated for the treatment of functional bowel/irritable bowel syndrome.'],
      },
    },
    {
      id: did(), name: 'Cetirizine', display_name: 'Zyrtec', dose: '10mg',
      frequency: 'Once daily', route: 'Oral', prescriber: 'Dr. Priya Patel',
      pharmacy: 'Walgreens', purpose: 'Seasonal allergies', start_date: daysAgo(300),
      refill_date: daysFromNow(15), notes: '', active: true, rxcui: '20610',
      fda_data: {
        brand_name: 'Zyrtec',
        generic_name: 'Cetirizine hydrochloride',
        pharm_class: ['Histamine H1 Receptor Antagonists [MoA]'],
        indications: ['For the temporary relief of symptoms due to hay fever or other upper respiratory allergies: runny nose, sneezing, itchy/watery eyes, itching of the nose or throat.'],
      },
    },
    {
      id: did(), name: 'Magnesium glycinate', display_name: 'Magnesium', dose: '400mg',
      frequency: 'Nightly', route: 'Oral', prescriber: 'Self-directed', pharmacy: 'Costco',
      purpose: 'Sleep + leg cramps', start_date: daysAgo(120), refill_date: daysFromNow(30),
      notes: 'Helps falling asleep', active: true,
    },
    {
      id: did(), name: 'Vitamin D3', display_name: 'Vitamin D3', dose: '2000 IU',
      frequency: 'Once daily', route: 'Oral', prescriber: 'Dr. Priya Patel',
      pharmacy: 'Costco', purpose: 'Low vitamin D (from labs)', start_date: daysAgo(220),
      refill_date: daysFromNow(45), notes: '', active: true, rxcui: '316675',
      fda_data: {
        brand_name: 'Vitamin D3',
        generic_name: 'Cholecalciferol',
        pharm_class: ['Vitamin D Analog [EPC]'],
        indications: ['Dietary supplement for vitamin D insufficiency or deficiency.'],
      },
    },
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
  // 35 days of multi-source vitals designed for strong correlations (high confidence).
  // Patterns baked in:
  //   Sleep < 6 hrs → mood drops 2-3 pts, energy drops 2-3, pain jumps 2-3
  //   Exercise days → mood +1.5, energy +1.5 vs rest days
  //   Sleep trend: improving over the 35 days (avg ~6.2 → ~7.5)
  //   HR lower on well-rested days, higher on poor sleep
  //   SpO2 stable 95-98%, resp rate 14-18

  // Base patterns: sleep improves over time, with realistic variance
  const sleepBase = [
    5.5, 6.0, 5.0, 7.0, 6.5, 5.5, 6.0, 7.5, 6.0, 5.0,  // days 34-25: rough patch
    6.5, 7.0, 5.5, 6.0, 7.0, 6.5, 7.5, 5.5, 7.0, 8.0,  // days 24-15: stabilizing
    6.0, 7.5, 7.0, 8.0, 6.5, 7.0, 8.5, 7.0, 5.5, 7.5,  // days 14-5:  improving
    7.0, 8.0, 7.5, 6.5, 8.0,                              // days 4-0:  strong finish
  ];
  // Exercise on specific days (indices into the 35-day array)
  const exerciseDays = new Set([1, 3, 5, 8, 11, 14, 16, 19, 21, 24, 26, 28, 30, 32, 34]);

  for (let i = 0; i < 35; i++) {
    const date = daysAgo(34 - i);
    const sleep = sleepBase[i];
    const isExDay = exerciseDays.has(i);

    // Mood/energy keyed to sleep quality + exercise boost
    const sleepBonus = sleep >= 7 ? 2 : sleep >= 6 ? 0 : -2;
    const exBonus = isExDay ? 1.5 : 0;
    const mood = Math.min(10, Math.max(1, Math.round(5.5 + sleepBonus + exBonus + (Math.sin(i * 0.7) * 0.8))));
    const energy = Math.min(10, Math.max(1, Math.round(5 + sleepBonus + exBonus + (Math.cos(i * 0.5) * 0.7))));
    const pain = Math.min(10, Math.max(0, Math.round(3 - sleepBonus + (sleep < 6 ? 2 : 0) + (Math.sin(i * 1.1) * 0.5))));

    // HR: lower when well-rested, higher on poor sleep
    const hrBase = sleep >= 7 ? 58 : sleep >= 6 ? 64 : 72;
    const hr = hrBase + Math.round(Math.sin(i * 0.9) * 4);

    // SpO2 and respiratory rate (wearable data)
    const spo2 = 96 + Math.round(Math.sin(i * 0.6) * 1.5);
    const resp = 15 + Math.round(Math.sin(i * 0.8) * 1.5 * 10) / 10;

    // Weight: slight downtrend over 35 days (fitness journey)
    const weight = 155 - (i * 0.08) + Math.sin(i * 0.4) * 0.8;

    // Steps from Apple Watch
    const steps = isExDay ? 9000 + Math.round(Math.random() * 4000) : 4000 + Math.round(Math.random() * 3000);

    vitals.push({ id: did(), date, type: 'sleep', value: sleep, unit: 'hrs', notes: '', source: 'oura' });
    vitals.push({ id: did(), date, type: 'hr', value: hr, unit: 'bpm', notes: '', source: 'apple_health' });
    vitals.push({ id: did(), date, type: 'energy', value: energy, unit: '/10', notes: '', source: 'manual' });
    vitals.push({ id: did(), date, type: 'pain', value: pain, unit: '/10', notes: '', source: 'manual' });
    vitals.push({ id: did(), date, type: 'spo2', value: spo2, unit: '%', notes: '', source: 'apple_health' });
    vitals.push({ id: did(), date, type: 'resp', value: Math.round(resp * 10) / 10, unit: 'rpm', notes: '', source: 'apple_health' });
    // Weight every 3-4 days
    if (i % 3 === 0) {
      vitals.push({ id: did(), date, type: 'weight', value: Math.round(weight * 10) / 10, unit: 'lbs', notes: '', source: 'apple_health' });
    }
    // Steps daily
    vitals.push({ id: did(), date, type: 'steps', value: steps, unit: 'steps', notes: '', source: 'apple_health' });
  }

  const appts = [
    { id: did(), date: daysFromNow(12), time: '10:30 AM', provider: 'Dr. Priya Patel', location: 'Capitol Hill Family Medicine', reason: 'Annual physical + medication review', questions: 'Ask about bumping Adderall IR for evening focus. Discuss vitamin D levels.', post_notes: '', video_call_url: '' },
    { id: did(), date: daysFromNow(3), time: '4:00 PM', provider: 'Sarah Rivera, LCSW', location: '', reason: 'Weekly therapy session', questions: '', post_notes: '', video_call_url: 'https://zoom.us/j/example' },
    { id: did(), date: daysAgo(18), time: '2:15 PM', provider: 'Dr. Marcus Chen', location: 'Puget Sound GI Associates', reason: 'IBS follow-up', questions: '', post_notes: 'Recommended staying on dicyclomine as-needed. Try eliminating gluten for 4 weeks to test sensitivity.', video_call_url: '' },
  ];

  const journal = [
    { id: did(), date: daysAgo(0), title: 'Feeling optimistic', mood: '😊 Good', severity: 2, content: 'Slept well, good energy all day. Starting to see a real pattern, when I get 7+ hours everything just works better.', tags: 'sleep,mood,progress', symptoms: [], triggers: '', interventions: 'Consistent bedtime', gratitude: 'Making real progress with sleep habits', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(1), title: 'Good focus day', mood: '😀 Great', severity: 2, content: 'Adderall felt especially clean today. Got through a big project at work. Slept 8 hours last night, noticing a pattern that sleep > 7hrs makes meds work better.', tags: 'adhd,sleep,productivity', symptoms: [], triggers: '', interventions: 'Good sleep, morning walk', gratitude: 'Finished the big project', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(3), title: 'IBS flare', mood: '😔 Low', severity: 6, content: 'Rough morning. Had pizza last night and paying for it. Taking dicyclomine. Also noticed I was really stressed yesterday, probably contributed.', tags: 'ibs,flare,stress', symptoms: [{ name: 'Stomach cramps', severity: '4' }, { name: 'Headache', severity: '3' }], triggers: 'Pizza, stress at work', interventions: 'Dicyclomine, heating pad', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(5), title: 'Brain fog after bad sleep', mood: '😐 Okay', severity: 5, content: 'Only got 5 hours last night. Adderall barely made a dent. Everything felt like wading through mud.', tags: 'adhd,sleep,fatigue', symptoms: [{ name: 'Brain fog', severity: '4' }, { name: 'Fatigue', severity: '3' }, { name: 'Headache', severity: '2' }], triggers: 'Poor sleep, stayed up late', interventions: 'Extra coffee, short nap', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(6), title: 'Therapy insight', mood: '😊 Good', severity: 3, content: 'Sarah helped me see the connection between perfectionism at work and my IBS flares. Going to try setting earlier stop times this week.', tags: 'anxiety,therapy,insight', symptoms: [], triggers: '', interventions: 'Therapy, journaling', gratitude: 'Having a good therapist', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(7), title: 'Bad sleep + headache', mood: '😔 Low', severity: 6, content: 'Woke up at 3am and couldn\'t fall back asleep. Pounding headache all morning. Skipped the gym.', tags: 'sleep,headache,fatigue', symptoms: [{ name: 'Headache', severity: '4' }, { name: 'Fatigue', severity: '4' }], triggers: 'Insomnia, screen time before bed', interventions: 'Ibuprofen, dark room', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(9), title: 'Afternoon crash', mood: '😐 Okay', severity: 4, content: 'Meds wore off around 2pm today and I just couldn\'t focus. Ate lunch late (3pm). Need to be better about lunch timing.', tags: 'adhd,meds', symptoms: [{ name: 'Brain fog', severity: '3' }], triggers: 'Late lunch', interventions: '', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(10), title: 'Tough day', mood: '😰 Anxious', severity: 5, content: 'Anxiety was really high today. Work deadline looming. IBS acting up again. Sleep was terrible last night.', tags: 'anxiety,ibs,stress', symptoms: [{ name: 'Stomach cramps', severity: '3' }, { name: 'Headache', severity: '2' }], triggers: 'Work deadline, poor sleep', interventions: 'Breathing exercises', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(12), title: 'First good run in weeks', mood: '😀 Great', severity: 1, content: 'Did 3 miles without stopping. Allergies are calming down finally. HR stayed in a nice zone.', tags: 'exercise,allergies,mood', symptoms: [], triggers: '', interventions: 'Running', gratitude: 'Feeling strong again', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(14), title: 'Oura says I\'m recovering', mood: '😊 Good', severity: 2, content: 'Oura readiness score was 87 today, highest in weeks. Resting HR is trending down. The magnesium + consistent bedtime routine seems to be paying off.', tags: 'sleep,oura,recovery', symptoms: [], triggers: '', interventions: 'Magnesium, 10pm bedtime', gratitude: 'Seeing data confirm my habits are working', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(16), title: 'Allergy day', mood: '😐 Okay', severity: 4, content: 'Pollen count must be insane today. Even with Zyrtec I was sneezing all morning. Eyes watery. At least the IBS was calm.', tags: 'allergies,sneezing', symptoms: [{ name: 'Sneezing', severity: '3' }, { name: 'Watery eyes', severity: '2' }], triggers: 'High pollen count', interventions: 'Zyrtec, stayed indoors', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(19), title: 'Great weekend hike', mood: '😀 Great', severity: 1, content: 'Did the Rattlesnake Ridge trail, 4 miles round trip. Heart rate data from Apple Watch looked great. Mood was sky high all afternoon.', tags: 'exercise,outdoors,mood', symptoms: [], triggers: '', interventions: 'Hiking, nature', gratitude: 'Living in the PNW with trails everywhere', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(22), title: 'Work stress → IBS', mood: '😔 Low', severity: 6, content: 'Big presentation at work. Stress was through the roof and my gut let me know. Classic stress-gut connection. Took dicyclomine.', tags: 'ibs,stress,work', symptoms: [{ name: 'Stomach cramps', severity: '5' }, { name: 'Nausea', severity: '2' }], triggers: 'Work presentation', interventions: 'Dicyclomine, warm tea, early bedtime', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(25), title: 'Terrible sleep spiral', mood: '😢 Sad', severity: 7, content: 'Third bad night in a row. Only got 5 hours. Everything hurts, brain is mush. Called in sick. Need to break this cycle.', tags: 'sleep,fatigue,pain', symptoms: [{ name: 'Fatigue', severity: '5' }, { name: 'Brain fog', severity: '4' }, { name: 'Headache', severity: '3' }], triggers: 'Insomnia, anxiety loop', interventions: 'Called in sick, no screens after 8pm', gratitude: '', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(28), title: 'Started tracking with Salve', mood: '😊 Good', severity: 2, content: 'Set up Salve today and imported all my Apple Health + Oura data. Excited to see patterns between sleep, ADHD symptoms, and IBS. Already seeing some interesting correlations.', tags: 'tracking,setup', symptoms: [], triggers: '', interventions: '', gratitude: 'Having a tool that connects everything', linked_conditions: [], linked_meds: [] },
    { id: did(), date: daysAgo(31), title: 'Yoga helped a lot', mood: '😊 Good', severity: 2, content: 'Did a 45 min yoga session at home. Anxiety dropped noticeably. Apple Watch showed HR recovery was really fast.', tags: 'exercise,yoga,anxiety', symptoms: [], triggers: '', interventions: 'Yoga', gratitude: 'Finding exercise that helps anxiety specifically', linked_conditions: [], linked_meds: [] },
  ];

  const labs = [
    // Recent panel (2 months ago)
    { id: did(), date: daysAgo(55), name: 'Vitamin D 25-OH', value: '28', unit: 'ng/mL', flag: 'low', range: '30-100', provider: 'Dr. Priya Patel', notes: 'Started supplementation' },
    { id: did(), date: daysAgo(55), name: 'TSH', value: '2.1', unit: 'mIU/L', flag: 'normal', range: '0.4-4.0', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'Ferritin', value: '42', unit: 'ng/mL', flag: 'normal', range: '15-200', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'Hemoglobin A1C', value: '5.3', unit: '%', flag: 'normal', range: '<5.7', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'Total Cholesterol', value: '195', unit: 'mg/dL', flag: 'normal', range: '<200', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'LDL Cholesterol', value: '118', unit: 'mg/dL', flag: 'normal', range: '<130', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'HDL Cholesterol', value: '52', unit: 'mg/dL', flag: 'normal', range: '>40', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'CBC - WBC', value: '6.2', unit: 'K/uL', flag: 'normal', range: '4.5-11.0', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'CBC - Hemoglobin', value: '14.1', unit: 'g/dL', flag: 'normal', range: '12.0-16.0', provider: 'Dr. Priya Patel', notes: '' },
    { id: did(), date: daysAgo(55), name: 'B12', value: '380', unit: 'pg/mL', flag: 'normal', range: '200-900', provider: 'Dr. Priya Patel', notes: '' },
    // Follow-up vitamin D (improving)
    { id: did(), date: daysAgo(10), name: 'Vitamin D 25-OH', value: '38', unit: 'ng/mL', flag: 'normal', range: '30-100', provider: 'Dr. Priya Patel', notes: 'Improved with 2000 IU daily supplementation' },
  ];

  const todos = [
    { id: did(), title: 'Refill Adderall prescription', notes: 'Need to call Walgreens', due_date: daysFromNow(3), priority: 'high', category: 'medication', completed: false, completed_at: null, recurring: 'monthly', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Schedule annual eye exam', notes: 'Last one was over a year ago', due_date: daysFromNow(14), priority: 'medium', category: 'appointment', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Ask Sarah about increasing to twice-weekly', notes: 'For the annual physical coming up', due_date: daysFromNow(12), priority: 'low', category: 'follow_up', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
    { id: did(), title: 'Try one week fully gluten-free', notes: 'Per Dr. Chen recommendation', due_date: daysFromNow(7), priority: 'medium', category: 'custom', completed: false, completed_at: null, recurring: 'none', related_id: null, related_table: null, source: 'manual', dismissed: false },
  ];

  const pharmacies = [
    { id: did(), name: 'Walgreens', address: '1531 Broadway, Seattle, WA 98122', phone: '(206) 555-0100', fax: '', hours: 'Mon-Fri 8am-10pm, Sat-Sun 9am-9pm', website: 'https://walgreens.com', is_preferred: true, notes: '' },
    { id: did(), name: 'Costco', address: '4401 4th Ave S, Seattle, WA 98134', phone: '(206) 555-0155', fax: '', hours: 'Mon-Fri 10am-8:30pm', website: 'https://costco.com', is_preferred: false, notes: 'Member pharmacy, cheaper for supplements' },
  ];

  const activities = [
    // Recent week
    { id: did(), date: daysAgo(0), type: 'Walking', duration_minutes: 35, distance: 2.0, calories: 155, heart_rate_avg: 108, source: 'apple_health', notes: 'Morning walk' },
    { id: did(), date: daysAgo(1), type: 'Walking', duration_minutes: 32, distance: 1.8, calories: 145, heart_rate_avg: 110, source: 'apple_health', notes: 'Lunchtime walk' },
    { id: did(), date: daysAgo(3), type: 'Running', duration_minutes: 28, distance: 3.0, calories: 290, heart_rate_avg: 148, source: 'apple_health', notes: 'Easy run' },
    { id: did(), date: daysAgo(4), type: 'Walking', duration_minutes: 25, distance: 1.5, calories: 120, heart_rate_avg: 105, source: 'apple_health', notes: '' },
    { id: did(), date: daysAgo(6), type: 'Yoga', duration_minutes: 45, distance: null, calories: 160, heart_rate_avg: 92, source: 'manual', notes: 'Evening wind-down' },
    // Week 2
    { id: did(), date: daysAgo(8), type: 'Strength Training', duration_minutes: 40, distance: null, calories: 220, heart_rate_avg: 120, source: 'apple_health', notes: 'Upper body' },
    { id: did(), date: daysAgo(9), type: 'Running', duration_minutes: 35, distance: 3.6, calories: 340, heart_rate_avg: 152, source: 'apple_health', notes: '' },
    { id: did(), date: daysAgo(11), type: 'Walking', duration_minutes: 40, distance: 2.3, calories: 170, heart_rate_avg: 106, source: 'apple_health', notes: '' },
    { id: did(), date: daysAgo(12), type: 'Running', duration_minutes: 30, distance: 3.1, calories: 300, heart_rate_avg: 146, source: 'apple_health', notes: 'Felt great' },
    { id: did(), date: daysAgo(14), type: 'Cycling', duration_minutes: 50, distance: 12.5, calories: 380, heart_rate_avg: 132, source: 'apple_health', notes: 'Burke-Gilman trail' },
    // Week 3
    { id: did(), date: daysAgo(16), type: 'Strength Training', duration_minutes: 35, distance: null, calories: 200, heart_rate_avg: 118, source: 'apple_health', notes: 'Lower body' },
    { id: did(), date: daysAgo(19), type: 'Hiking', duration_minutes: 120, distance: 6.4, calories: 560, heart_rate_avg: 128, source: 'apple_health', notes: 'Rattlesnake Ridge' },
    { id: did(), date: daysAgo(21), type: 'Running', duration_minutes: 32, distance: 3.4, calories: 320, heart_rate_avg: 150, source: 'apple_health', notes: '' },
    // Week 4
    { id: did(), date: daysAgo(24), type: 'Yoga', duration_minutes: 45, distance: null, calories: 155, heart_rate_avg: 88, source: 'manual', notes: '' },
    { id: did(), date: daysAgo(26), type: 'Walking', duration_minutes: 28, distance: 1.6, calories: 130, heart_rate_avg: 104, source: 'apple_health', notes: '' },
    { id: did(), date: daysAgo(28), type: 'Running', duration_minutes: 25, distance: 2.6, calories: 260, heart_rate_avg: 144, source: 'apple_health', notes: '' },
    { id: did(), date: daysAgo(30), type: 'Strength Training', duration_minutes: 38, distance: null, calories: 210, heart_rate_avg: 122, source: 'apple_health', notes: 'Full body' },
    { id: did(), date: daysAgo(31), type: 'Yoga', duration_minutes: 45, distance: null, calories: 150, heart_rate_avg: 86, source: 'manual', notes: '' },
    { id: did(), date: daysAgo(32), type: 'Running', duration_minutes: 30, distance: 3.0, calories: 295, heart_rate_avg: 148, source: 'apple_health', notes: '' },
  ];

  const immunizations = [
    { id: did(), name: 'COVID-19 Booster (Pfizer)', date: daysAgo(120), provider: 'Dr. Priya Patel', lot_number: '', notes: 'No significant side effects' },
    { id: did(), name: 'Influenza (Flu)', date: daysAgo(180), provider: 'Walgreens', lot_number: '', notes: 'Arm sore for 2 days' },
    { id: did(), name: 'Tdap (Tetanus, Diphtheria, Pertussis)', date: daysAgo(900), provider: 'Dr. Priya Patel', lot_number: '', notes: '10-year booster' },
  ];

  const procedures = [];
  const care_gaps = [];
  const anesthesia_flags = [];
  const appeals_and_disputes = [];
  const surgical_planning = [];
  const insurance = [
    { id: did(), plan_name: 'Regence BlueShield', plan_type: 'PPO', member_id: 'RBS-555-1234', group_number: 'GRP-9876', phone: '1-800-555-0199', notes: 'Through employer, renews January' },
  ];
  const insurance_claims = [];
  const drug_prices = [];
  // Cycle tracking, imported from Flo GDPR export, shows predicted period
  // in the Dashboard timeline and enables cycle-phase badges across Vitals
  // and Journal.
  const cycles = [
    // Last period (5 days, starting ~20 days ago)
    { id: did(), date: daysAgo(20), type: 'period', value: 'medium', symptom: '', notes: '' },
    { id: did(), date: daysAgo(19), type: 'period', value: 'heavy', symptom: '', notes: '' },
    { id: did(), date: daysAgo(18), type: 'period', value: 'medium', symptom: '', notes: '' },
    { id: did(), date: daysAgo(17), type: 'period', value: 'light', symptom: '', notes: '' },
    { id: did(), date: daysAgo(16), type: 'period', value: 'spotting', symptom: '', notes: '' },
    // Previous period (~48 days ago, ~28 day cycle)
    { id: did(), date: daysAgo(48), type: 'period', value: 'medium', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(47), type: 'period', value: 'heavy', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(46), type: 'period', value: 'medium', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(45), type: 'period', value: 'light', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(44), type: 'period', value: 'spotting', symptom: '', notes: 'imported from Flo' },
    // Third period (~76 days ago, consistent 28-day cycle)
    { id: did(), date: daysAgo(76), type: 'period', value: 'medium', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(75), type: 'period', value: 'heavy', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(74), type: 'period', value: 'medium', symptom: '', notes: 'imported from Flo' },
    { id: did(), date: daysAgo(73), type: 'period', value: 'light', symptom: '', notes: 'imported from Flo' },
    // BBT from Oura (around ovulation, ~6-8 days ago)
    { id: did(), date: daysAgo(10), type: 'bbt', value: '97.6', symptom: '', notes: 'Oura' },
    { id: did(), date: daysAgo(9), type: 'bbt', value: '97.5', symptom: '', notes: 'Oura' },
    { id: did(), date: daysAgo(8), type: 'bbt', value: '97.7', symptom: '', notes: 'Oura' },
    { id: did(), date: daysAgo(7), type: 'bbt', value: '98.1', symptom: '', notes: 'Oura, shift detected' },
    { id: did(), date: daysAgo(6), type: 'bbt', value: '98.2', symptom: '', notes: 'Oura' },
    { id: did(), date: daysAgo(5), type: 'bbt', value: '98.0', symptom: '', notes: 'Oura' },
    // Cervical mucus + symptoms
    { id: did(), date: daysAgo(9), type: 'cervical_mucus', value: 'eggwhite', symptom: '', notes: 'Peak fertility' },
    { id: did(), date: daysAgo(10), type: 'cervical_mucus', value: 'creamy', symptom: '', notes: '' },
    { id: did(), date: daysAgo(6), type: 'symptom', value: '', symptom: 'cramps', notes: '' },
    { id: did(), date: daysAgo(10), type: 'symptom', value: '', symptom: 'bloating', notes: '' },
    { id: did(), date: daysAgo(8), type: 'symptom', value: '', symptom: 'breast tenderness', notes: '' },
  ];
  const genetic_results = [
    { id: did(), source: '23andMe + Promethease', gene: 'CYP2D6', variant: '*1/*4', phenotype: 'Intermediate Metabolizer', affected_drugs: ['codeine', 'tramadol', 'amitriptyline', 'fluoxetine'], category: 'pharmacogenomic', notes: 'May need dose adjustments for CYP2D6 substrates' },
    { id: did(), source: '23andMe + Promethease', gene: 'CYP2C19', variant: '*1/*1', phenotype: 'Normal Metabolizer', affected_drugs: ['omeprazole', 'clopidogrel', 'escitalopram'], category: 'pharmacogenomic', notes: 'Standard dosing expected' },
    { id: did(), source: '23andMe + Promethease', gene: 'MTHFR', variant: 'C677T heterozygous', phenotype: 'Intermediate Activity', affected_drugs: ['methotrexate'], category: 'pharmacogenomic', notes: 'May benefit from methylfolate supplementation' },
    { id: did(), source: '23andMe + Promethease', gene: 'COMT', variant: 'Val/Met', phenotype: 'Intermediate Activity', affected_drugs: [], category: 'pharmacogenomic', notes: 'Moderate dopamine clearance, relevant to ADHD' },
  ];

  const feedback = [];
  const medication_reminders = [];

  return {
    meds, conditions, allergies, providers, pharmacies,
    vitals, appts, journal, labs, procedures, immunizations,
    care_gaps, anesthesia_flags, appeals_and_disputes, surgical_planning,
    insurance, insurance_claims, drug_prices,
    todos, cycles, activities, genetic_results,
    feedback, medication_reminders,
    settings,
  };
}

// Flag for identifying demo mode anywhere in the app
export const DEMO_USER_ID = 'demo-user';
export const isDemoId = (id) => typeof id === 'string' && id.startsWith('demo-');
