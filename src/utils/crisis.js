// Deterministic crisis keyword detection, NO AI dependency, works offline, instant.
// Returns { isCrisis, type } to select appropriate emergency resources.

// Phrase-level patterns grouped by crisis type.
// Each entry is a regex that matches whole-phrase context to reduce false positives.
// e.g. "kill myself" matches but "kill myself laughing" does not (negative lookahead).

const MENTAL_HEALTH_PATTERNS = [
  /\bwant\s+to\s+die\b/i,
  /\bwant\s+to\s+kill\s+my\s*self\b/i,
  /\bkill\s+my\s*self\b(?!\s+(laughing|with))/i,
  /\bend\s+(it\s+all|my\s+life|everything)\b/i,
  /\bsuicid/i,
  /\bno\s+reason\s+to\s+(live|go\s+on|keep\s+going)\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|exist|live|wake\s+up)\b/i,
  /\bwish\s+i\s+(was|were)\s+dead\b/i,
  /\bplanning\s+(to|my)\s+(end|death|suicide)\b/i,
  /\bgoing\s+to\s+kill\s+my\s*self\b/i,
  /\bnobody\s+would\s+(miss|care|notice)\b/i,
  /\bworld\s+.*\bbetter\s+without\s+me\b/i,
  /\bcan'?t\s+(take|do)\s+(it|this)\s+any\s*more\b/i,
  /\bgoodbye\s+(cruel\s+)?world\b/i,
  /\bi('?m|\s+am)\s+a\s+burden\b/i,
];

const SELF_HARM_PATTERNS = [
  /\bcutting\s+my\s*self\b/i,
  /\bhurt\s+my\s*self\b(?!\s+(laughing|at\s+the\s+gym|working|exercising|running|lifting))/i,
  /\bhurting\s+my\s*self\b(?!\s+(laughing|at\s+the\s+gym|working|exercising|running|lifting))/i,
  /\bself[\s-]?harm/i,
  /\bburn(ing)?\s+my\s*self\b(?!\s+(out|cooking))/i,
  /\bhit(ting)?\s+my\s*self\b/i,
  /\bstarving\s+my\s*self\b/i,
];

const MEDICAL_EMERGENCY_PATTERNS = [
  /\boverdos/i,
  /\btook\s+(too\s+many|all(\s+my)?)\s+(pills|meds|medication)/i,
  /\bseizure\b.*\bright\s+now\b/i,
  /\bhaving\s+a\s+seizure\b/i,
  /\bcan'?t\s+breathe\b(?!\s+(when\s+i\s+(run|exercise|laugh)|around\s+(cats|dogs|dust|pollen)))/i,
  /\bchest\s+pain\b(?!\s+(when\s+(i\s+)?(run|exercise|lift|work\s*out)|after\s+(running|exercise|workout)))/i,
  /\bstroke\b.*\bsymptoms?\b/i,
  /\bhaving\s+a\s+(heart\s+attack|stroke)\b/i,
  /\bbleeding\s+(out|heavily|won'?t\s+stop)\b/i,
  /\bunconscious\b/i,
  /\bpoisoned\b/i,
  /\banaphyla/i,
];

const SAFETY_PATTERNS = [
  /\b(being|getting)\s+(hit|beaten|abused)\b/i,
  /\bafraid\s+of\s+(my\s+)?(partner|husband|wife|boyfriend|girlfriend|spouse)\b/i,
  /\b(partner|husband|wife|boyfriend|girlfriend|spouse)\s+(hits?|beats?|hurts?|abuses?|chokes?|threatens?)\s+me\b/i,
  /\bdomestic\s+(violence|abuse)\b/i,
  /\bhe('?s|\s+is)\s+(going\s+to\s+)?(kill|hurt)\s+me\b/i,
  /\bshe('?s|\s+is)\s+(going\s+to\s+)?(kill|hurt)\s+me\b/i,
  /\bthey('?re|\s+are)\s+(going\s+to\s+)?(kill|hurt)\s+me\b/i,
  /\bnot\s+safe\s+(at\s+)?home\b/i,
  // Catches both past and present tense, with or without subject.
  // Matches: "threatened to kill me", "he threatens to kill me",
  // "my partner threatens to hurt me", "threatens to harm me", etc.
  /\bthreaten(s|ed)?\s+to\s+(kill|hurt|harm|beat)\s+me\b/i,
];

/**
 * Detect crisis language in user text.
 * @param {string} text - User input (journal content, chat message, etc.)
 * @returns {{ isCrisis: boolean, type: 'mental'|'medical'|'safety'|null }}
 */
export function detectCrisis(text) {
  if (!text || typeof text !== 'string') return { isCrisis: false, type: null };

  // Normalize smart quotes and collapse whitespace for reliable matching
  const normalized = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ');

  // Check each category in priority order
  for (const re of MENTAL_HEALTH_PATTERNS) {
    if (re.test(normalized)) return { isCrisis: true, type: 'mental' };
  }
  for (const re of SELF_HARM_PATTERNS) {
    if (re.test(normalized)) return { isCrisis: true, type: 'mental' };
  }
  for (const re of MEDICAL_EMERGENCY_PATTERNS) {
    if (re.test(normalized)) return { isCrisis: true, type: 'medical' };
  }
  for (const re of SAFETY_PATTERNS) {
    if (re.test(normalized)) return { isCrisis: true, type: 'safety' };
  }

  return { isCrisis: false, type: null };
}
