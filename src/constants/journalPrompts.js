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
