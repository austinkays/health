// Curated wellness quotes with attribution.
// To add more: just append to the array. The daily picker uses day-of-year
// modulo, so the rotation automatically extends when the list grows.

const QUOTES = [
  // Self-compassion & patience
  { q: 'Almost everything will work again if you unplug it for a few minutes, including you.', a: 'Anne Lamott' },
  { q: 'Rest is not idleness, and to lie sometimes on the grass under trees on a summer\'s day is by no means a waste of time.', a: 'John Lubbock' },
  { q: 'Talk to yourself like you would to someone you love.', a: 'Brené Brown' },
  { q: 'You yourself, as much as anybody in the entire universe, deserve your love and affection.', a: 'Sharon Salzberg' },
  { q: 'Be patient with yourself. Self-growth is tender; it\'s holy ground.', a: 'Stephen Covey' },
  { q: 'It is not the mountain we conquer, but ourselves.', a: 'Edmund Hillary' },
  { q: 'Caring for myself is not self-indulgence, it is self-preservation.', a: 'Audre Lorde' },

  // Resilience & chronic illness
  { q: 'You are not your illness. You have an individual story to tell.', a: 'Julian Seifter' },
  { q: 'The human body is the best picture of the human soul.', a: 'Ludwig Wittgenstein' },
  { q: 'Healing is a matter of time, but it is sometimes also a matter of opportunity.', a: 'Hippocrates' },
  { q: 'The wound is the place where the Light enters you.', a: 'Rumi' },
  { q: 'You have been assigned this mountain to show others it can be moved.', a: 'Mel Robbins' },
  { q: 'Strength does not come from physical capacity. It comes from an indomitable will.', a: 'Mahatma Gandhi' },
  { q: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', a: 'Ralph Waldo Emerson' },
  { q: 'In the middle of difficulty lies opportunity.', a: 'Albert Einstein' },

  // Mindfulness & presence
  { q: 'The present moment is filled with joy and happiness. If you are attentive, you will see it.', a: 'Thich Nhat Hanh' },
  { q: 'Almost everything will work again if you unplug it for a few minutes.', a: 'Anne Lamott' },
  { q: 'Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.', a: 'Thich Nhat Hanh' },
  { q: 'Within you, there is a stillness and a sanctuary to which you can retreat at any time.', a: 'Hermann Hesse' },
  { q: 'The greatest weapon against stress is our ability to choose one thought over another.', a: 'William James' },
  { q: 'Do not anticipate trouble, or worry about what may never happen. Keep in the sunlight.', a: 'Benjamin Franklin' },

  // Progress & growth
  { q: 'It does not matter how slowly you go, as long as you do not stop.', a: 'Confucius' },
  { q: 'The only impossible journey is the one you never begin.', a: 'Tony Robbins' },
  { q: 'A journey of a thousand miles begins with a single step.', a: 'Lao Tzu' },
  { q: 'What we achieve inwardly will change outer reality.', a: 'Plutarch' },
  { q: 'The secret of health for both mind and body is not to mourn for the past, nor to worry about the future, but to live the present moment wisely.', a: 'Siddhartha Gautama' },
  { q: 'Start where you are. Use what you have. Do what you can.', a: 'Arthur Ashe' },
  { q: 'You don\'t have to see the whole staircase, just take the first step.', a: 'Martin Luther King Jr.' },

  // Wellness & health
  { q: 'Health is a state of complete harmony of the body, mind, and spirit.', a: 'B.K.S. Iyengar' },
  { q: 'To keep the body in good health is a duty, otherwise we shall not be able to keep the mind strong and clear.', a: 'Siddhartha Gautama' },
  { q: 'The greatest wealth is health.', a: 'Virgil' },
  { q: 'Happiness is the highest form of health.', a: 'Dalai Lama' },
  { q: 'Sleep is the best meditation.', a: 'Dalai Lama' },
  { q: 'Take care of your body. It\'s the only place you have to live.', a: 'Jim Rohn' },
  { q: 'An ounce of prevention is worth a pound of cure.', a: 'Benjamin Franklin' },
  { q: 'Let food be thy medicine and medicine be thy food.', a: 'Hippocrates' },

  // Kindness & connection
  { q: 'No act of kindness, no matter how small, is ever wasted.', a: 'Aesop' },
  { q: 'Be kind, for everyone you meet is fighting a hard battle.', a: 'Ian Maclaren' },
  { q: 'We rise by lifting others.', a: 'Robert Ingersoll' },
  { q: 'The most important thing in illness is never to lose heart.', a: 'Nikolai Lenin' },
  { q: 'Knowing is not enough; we must apply. Willing is not enough; we must do.', a: 'Johann Wolfgang von Goethe' },
];

/**
 * Returns the quote of the day. Deterministic per calendar day —
 * every user sees the same quote on the same date, and it stays
 * stable across reloads/navigation within that day.
 *
 * @returns {{ q: string, a: string }}
 */
export function getDailyQuote() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}
