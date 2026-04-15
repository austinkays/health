/*
 * verify-condense-fda.mjs
 *
 * Standalone Node verifier for FDA text helpers and condenseFDA output.
 * Run with: node scripts/verify-condense-fda.mjs
 * Exits 0 on success, 1 on any assertion failure.
 *
 * Requires the profile.js import chain to use explicit .js extensions
 * (see the Part 0 prereq changes that ship with this commit).
 */
import { firstSentence, fdaBullet, condenseFDA } from '../src/services/profile.js';

let failed = 0;
function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}
function assertContains(label, haystack, needle) {
  if (String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 missing substring: ${JSON.stringify(needle)}`);
    failed++;
  }
}
function assertExcludes(label, haystack, needle) {
  if (!String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 unexpectedly found: ${JSON.stringify(needle)}`);
    failed++;
  }
}

// firstSentence sanity (existing helper, imported) — checks import wiring
assert('firstSentence empty string', firstSentence('', 100), '');
assert('firstSentence stops at first period', firstSentence('First. Second.', 100), 'First.');

// fdaBullet (new helper, Task 1 target) — actual behavioral assertions
assert('fdaBullet empty', fdaBullet('', 100), '');
assert('fdaBullet null', fdaBullet(null, 100), '');

assert(
  'fdaBullet strips "1 INDICATIONS AND USAGE" prefix',
  fdaBullet('1 INDICATIONS AND USAGE ADDERALL XR is indicated for ADHD.', 200),
  'ADDERALL XR is indicated for ADHD.'
);

assert(
  'fdaBullet strips "2 DOSAGE AND ADMINISTRATION" prefix',
  fdaBullet('2 DOSAGE AND ADMINISTRATION Initiate with 25mg/day.', 200),
  'Initiate with 25mg/day.'
);

assert(
  'fdaBullet strips "ADVERSE REACTIONS:" unnumbered prefix',
  fdaBullet('ADVERSE REACTIONS: Most common are headache and nausea.', 200),
  'Most common are headache and nausea.'
);

assert(
  'fdaBullet does NOT strip short all-caps "MRI" from normal prose',
  fdaBullet('MRI showed lesions in the temporal lobe.', 200),
  'MRI showed lesions in the temporal lobe.'
);

assert(
  'fdaBullet does NOT strip short all-caps "HIV" from normal prose',
  fdaBullet('HIV positive patients should consult their provider.', 200),
  'HIV positive patients should consult their provider.'
);

// A 300-char all-A input has no period and no whitespace, so firstSentence
// falls through to the length-cap branch which replaces the last char with '…'.
// Result length === limit, final char === '…'.
assert(
  'fdaBullet truncates with ellipsis when longer than limit',
  fdaBullet('A'.repeat(300), 50).endsWith('\u2026'),
  true
);

assert(
  'fdaBullet respects limit param',
  fdaBullet('A'.repeat(300), 50).length,
  50
);

// condenseFDA (existing helper, import sanity) — Task 3 adds new-field
// assertions later. For Task 1 we confirm the import works and existing
// behavior is intact (boxed warning + contraindications still rendered).
const existingFda = {
  boxed_warning: ['Risk of respiratory depression'],
  contraindications: ['Do not use with MAO inhibitors'],
};
const existingOut = condenseFDA(existingFda);
assertContains('condenseFDA still outputs boxed warning', existingOut, 'boxed warning');
assertContains('condenseFDA still outputs contraindications', existingOut, 'contraindications');

// ── Task 3: condenseFDA expansion ─────────────────────────────
// Use a rich FDA fixture with all fields we care about to verify
// the new indications / dosage / precautions branches, fdaBullet
// header stripping, and that dropped-field hygiene (no overdosage /
// storage) is enforced.
function assertContainsRich(label, haystack, needle) {
  if (String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 missing substring: ${JSON.stringify(needle)}`);
    failed++;
  }
}
function assertExcludesRich(label, haystack, needle) {
  if (!String(haystack).includes(needle)) {
    console.log(`\u2713 ${label}`);
  } else {
    console.error(`\u2717 ${label} \u2014 unexpectedly found: ${JSON.stringify(needle)}`);
    failed++;
  }
}

const richFda = {
  boxed_warning: ['Risk of respiratory depression with opioid use'],
  indications: ['1 INDICATIONS AND USAGE TRAMADOL is indicated for the management of moderate to moderately severe pain in adults.'],
  dosage: ['2 DOSAGE AND ADMINISTRATION Initiate treatment with 25 mg/day in the morning and titrate upward.'],
  contraindications: ['Do not use with MAO inhibitors'],
  precautions: ['5 WARNINGS AND PRECAUTIONS Serotonin syndrome may occur with concomitant serotonergic drug use.'],
  drug_interactions: ['Increased risk with SSRIs'],
  adverse_reactions: ['Most common adverse reactions are dizziness, nausea, constipation, headache, and somnolence.'],
  pregnancy: ['May cause neonatal opioid withdrawal syndrome.'],
  overdosage: ['Symptoms include respiratory depression'],
  storage: ['Store at room temperature'],
};
const richOut = condenseFDA(richFda);

// New branches must be present
assertContainsRich('condenseFDA adds "used for" for indications field', richOut, 'used for:');
assertContainsRich('condenseFDA adds "dosing" for dosage field', richOut, 'dosing:');
assertContainsRich('condenseFDA adds "precautions" for precautions field', richOut, 'precautions:');

// Header stripping must apply via fdaBullet
assertContainsRich(
  'condenseFDA strips "1 INDICATIONS AND USAGE" prefix from indications output',
  richOut,
  'TRAMADOL is indicated'
);
assertExcludesRich('condenseFDA output does not contain "1 INDICATIONS AND USAGE"', richOut, '1 INDICATIONS AND USAGE');
assertExcludesRich('condenseFDA output does not contain "2 DOSAGE AND ADMINISTRATION"', richOut, '2 DOSAGE AND ADMINISTRATION');
assertExcludesRich('condenseFDA output does not contain "5 WARNINGS AND PRECAUTIONS"', richOut, '5 WARNINGS AND PRECAUTIONS');

// Dropped fields — never fed to Sage
assertExcludesRich('condenseFDA does NOT include overdosage field', richOut, 'overdosage:');
assertExcludesRich('condenseFDA does NOT include storage field', richOut, 'storage:');

// Existing branches still present and untouched
assertContainsRich('condenseFDA still includes boxed warning', richOut, 'boxed warning:');
assertContainsRich('condenseFDA still includes contraindications', richOut, 'contraindications:');
assertContainsRich('condenseFDA still includes interactions', richOut, 'interactions:');
assertContainsRich('condenseFDA still includes side effects', richOut, 'side effects:');
assertContainsRich('condenseFDA still includes pregnancy', richOut, 'pregnancy:');

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll FDA helper assertions passed');
