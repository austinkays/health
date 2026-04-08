// Mood-aware reflection prompts for Journal entries.
// Tone principles: never toxic positivity, validate low moods, ground anxious moods,
// give permission to rest for exhaustion. Every prompt should feel safe for a
// chronically ill user on their worst day.

const PROMPTS = {
  positive: [
    'What made you smile today?',
    'What\'s one thing you\'re grateful for right now?',
    'Capture this feeling — what made today good?',
    'What\'s something small that went right?',
    'Who or what brought you joy today?',
    'What would you want to remember about today?',
    'What\'s something kind someone did for you recently?',
  ],
  neutral: [
    'How\'s your body feeling today?',
    'What\'s taking up the most space in your mind?',
    'Is there anything you need right now?',
    'What would make today feel a little better?',
    'What\'s one thing you did for yourself today?',
    'How did you sleep last night?',
    'What does your energy level feel like?',
  ],
  low: [
    'You don\'t have to fix this. Just name it.',
    'What would you tell a friend who felt this way?',
    'You showed up today. That counts.',
    'It\'s okay to not be okay. What\'s weighing on you?',
    'What\'s one small comfort you could reach for?',
    'You don\'t owe anyone an explanation for how you feel.',
    'Is there someone you trust you could talk to?',
  ],
  frustrated: [
    'What\'s frustrating you right now? Let it out.',
    'You\'re allowed to be angry about this.',
    'What do you need that you\'re not getting?',
    'What\'s one thing you can control in this situation?',
    'Sometimes naming the frustration takes away its power.',
    'Is this frustration trying to tell you something important?',
    'What boundary might need to be set?',
  ],
  anxious: [
    'Name three things you can see right now.',
    'What\'s one thing in your control right now?',
    'Take a breath. What do you actually know for sure?',
    'Your feelings are valid, even the scary ones.',
    'What would help you feel a little safer right now?',
    'You\'ve gotten through anxious moments before.',
    'Can you put one worry into words?',
  ],
  exhausted: [
    'What would recharge you, even a little?',
    'Your body is talking to you — what\'s it saying?',
    'Rest is not laziness. What do you need?',
    'You don\'t have to push through everything.',
    'What\'s one thing you could take off your plate today?',
    'It\'s okay to do less. You\'re still enough.',
    'How many spoons do you have left today?',
  ],
  open: [
    'What\'s on your mind?',
    'How does your body feel right now?',
    'Check in with yourself — how are you, really?',
    'What\'s one word that describes how you feel?',
    'What do you want to remember about today?',
    'Is there anything you want to get off your chest?',
    'What\'s been on your mind lately?',
  ],
};

const MOOD_CATEGORY = {
  '😀 Great': 'positive',
  '😊 Good': 'positive',
  '😐 Okay': 'neutral',
  '😔 Low': 'low',
  '😢 Sad': 'low',
  '😠 Frustrated': 'frustrated',
  '😰 Anxious': 'anxious',
  '😴 Exhausted': 'exhausted',
};

const lastIndex = {};

export function getReflectionPrompt(mood) {
  const category = MOOD_CATEGORY[mood] || 'open';
  const pool = PROMPTS[category];
  let next;
  do {
    next = Math.floor(Math.random() * pool.length);
  } while (next === lastIndex[category] && pool.length > 1);
  lastIndex[category] = next;
  return pool[next];
}

export function getMoodCategory(mood) {
  return MOOD_CATEGORY[mood] || 'open';
}

export function isPositiveMood(mood) {
  const cat = MOOD_CATEGORY[mood];
  return cat === 'positive' || cat === 'neutral';
}

/**
 * Data-driven contextual prompt based on recent health state.
 * Checks vitals, adherence, medications, and efficacy tracking. Returns a prompt string or null.
 * Only returns once per day (tracked in localStorage).
 */
export function getContextualPrompt(data) {
  const KEY = 'salve:last-contextual-prompt-date';
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem(KEY) === today) return null;

  const prompts = [];

  // --- Medication efficacy tracking (highest priority) ---
  const trackingRaw = localStorage.getItem('salve:med-tracking');
  let tracking = null;
  try { tracking = trackingRaw ? JSON.parse(trackingRaw) : null; } catch { /* ignore */ }

  // Detect newly started meds and start tracking if not already
  const activeMeds = (data.meds || []).filter(m => m.active !== false);
  if (!tracking) {
    for (const med of activeMeds) {
      if (med.start_date) {
        const daysSince = Math.floor((Date.now() - new Date(med.start_date).getTime()) / 86400000);
        if (daysSince >= 0 && daysSince <= 14) {
          tracking = { medId: med.id, medName: med.display_name || med.name, startDate: med.start_date, day: daysSince + 1 };
          localStorage.setItem('salve:med-tracking', JSON.stringify(tracking));
          break;
        }
      }
    }
  }

  if (tracking) {
    const day = tracking.day || 1;
    const name = tracking.medName;
    const daysSinceStart = Math.floor((Date.now() - new Date(tracking.startDate).getTime()) / 86400000) + 1;

    if (daysSinceStart > 14) {
      // Tracking window complete — clear and don't add prompt
      localStorage.removeItem('salve:med-tracking');
    } else {
      // Update day count
      tracking.day = daysSinceStart;
      localStorage.setItem('salve:med-tracking', JSON.stringify(tracking));

      if (daysSinceStart <= 3) {
        prompts.push(`Day ${daysSinceStart} on ${name}. Any initial side effects or changes?`);
      } else if (daysSinceStart <= 7) {
        prompts.push(`Day ${daysSinceStart} on ${name}. How are your symptoms compared to before starting it?`);
      } else {
        prompts.push(`Day ${daysSinceStart} on ${name}. Rate the overall impact on your daily life so far.`);
      }
    }
  }

  // Check recent sleep
  const recentSleep = (data.vitals || [])
    .filter(v => v.type === 'sleep')
    .sort((a, b) => b.date?.localeCompare(a.date))
    .slice(0, 1)[0];
  if (recentSleep && Number(recentSleep.value) < 5) {
    prompts.push(`Your sleep was ${recentSleep.value} hours last night. How's your energy today?`);
  }

  // Check pain trend (3-day average > 5)
  const recentPain = (data.vitals || [])
    .filter(v => v.type === 'pain')
    .sort((a, b) => b.date?.localeCompare(a.date))
    .slice(0, 3);
  if (recentPain.length >= 2) {
    const avg = recentPain.reduce((s, v) => s + Number(v.value || 0), 0) / recentPain.length;
    if (avg > 5) prompts.push('Your pain has been elevated lately. What\'s been going on?');
  }

  // Check adherence from most recent journal entry
  const recentJournal = (data.journal || [])
    .sort((a, b) => b.date?.localeCompare(a.date))
    .slice(0, 1)[0];
  if (recentJournal?.adherence) {
    const vals = Object.values(recentJournal.adherence);
    const total = vals.length;
    const taken = vals.filter(Boolean).length;
    if (total > 0 && taken / total < 0.5) {
      prompts.push('Looks like some meds were skipped yesterday. Any reason?');
    }
  }

  if (prompts.length === 0) return null;

  // Mark today so we don't repeat
  localStorage.setItem(KEY, today);
  return prompts[0]; // Return highest-priority match
}
