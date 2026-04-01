import { useState, useEffect, useCallback } from 'react';

const MESSAGES = [
  'Take a deep breath.',
  'Unclench your jaw.',
  'Drop your shoulders.',
  'Unfurrow your brow.',
  'Relax your tongue from the roof of your mouth.',
  'Soften your eyes.',
  'Straighten your spine.',
  'Loosen your grip.',
  'Unball your fists.',
  'Blink slowly.',
  'Exhale longer than you inhale.',
  'Wiggle your toes.',
  'Roll your shoulders back.',
  'Sigh it out.',
  'Shake out your hands.',
  'Stretch your fingers wide.',
  'Notice where you\'re holding tension.',
  'Feel your feet on the floor.',
  'Roll your neck slowly.',
  'Breathe through your nose.',
  'Soften your face completely.',
  'Press your feet into the ground.',
  'Close your eyes for a moment.',
  'Notice three sounds around you.',
  'Let your hands rest.',
  'Relax the space between your eyebrows.',
  'Soften the corners of your mouth.',
  'Check in with your body.',
  'One thing at a time.',
  'Not every thought needs your attention.',
  'You are right where you need to be.',
  'This moment is enough.',
  'Let that thought pass.',
  'You don\'t have to solve it right now.',
  'Name what you\'re feeling.',
  'Release the urgency.',
  'Nothing needs your reaction right now.',
  'Be here for this breath.',
  'Your thoughts are not facts.',
  'Let go of the last hour.',
  'You\'re doing fine.',
  'Slow down. There\'s time.',
  'Notice without judging.',
  'What can you let go of right now?',
  'You are more than your to-do list.',
  'This will pass.',
  'Choose calm.',
  'Give yourself permission to pause.',
  'You\'ve handled hard things before.',
  'Right now is all there is.',
  'You are capable of amazing things.',
  'You deserve good things.',
  'You bring value just by being you.',
  'You are growing every day.',
  'You are worthy of love and kindness.',
  'Your effort matters.',
  'You are stronger than you think.',
  'You are allowed to take up space.',
  'You are enough exactly as you are.',
  'Good things are coming your way.',
];

function pickRandom(exclude) {
  let next;
  do {
    next = Math.floor(Math.random() * MESSAGES.length);
  } while (next === exclude && MESSAGES.length > 1);
  return next;
}

export default function useWellnessMessage(interval = 4000) {
  const [index, setIndex] = useState(() => pickRandom(-1));

  const cycle = useCallback(() => {
    setIndex(prev => pickRandom(prev));
  }, []);

  useEffect(() => {
    const id = setInterval(cycle, interval);
    return () => clearInterval(id);
  }, [cycle, interval]);

  return { message: MESSAGES[index], key: index };
}
