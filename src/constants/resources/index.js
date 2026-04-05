// External patient-resource matching framework
// Resources are { id, title, url, source, blurb, conditions[], symptomTags[],
//   medications[], audience, researchStage? }
// Content modules register resources by pushing into RESOURCES.

import EVERYCURE_PROGRAMS from './everycure.js';
import UNDERSTOOD_ARTICLES from './understood.js';

export const RESOURCES = [];

/**
 * Register one or more resources into the global registry.
 * @param  {...object} items
 */
export function registerResources(...items) {
  for (const r of items) RESOURCES.push(r);
}

// Auto-register bundled resource modules
registerResources(...EVERYCURE_PROGRAMS);
registerResources(...UNDERSTOOD_ARTICLES);

// ---------------------------------------------------------------------------
// Condition-name normalizer (fuzzy match common aliases)
// ---------------------------------------------------------------------------

const ALIASES = {
  'adhd':                     'attention deficit hyperactivity disorder',
  'add':                      'attention deficit hyperactivity disorder',
  'attention deficit':        'attention deficit hyperactivity disorder',
  'ra':                       'rheumatoid arthritis',
  'ms':                       'multiple sclerosis',
  'copd':                     'chronic obstructive pulmonary disease',
  'ibs':                      'irritable bowel syndrome',
  'gerd':                     'gastroesophageal reflux disease',
  'acid reflux':              'gastroesophageal reflux disease',
  'ckd':                      'chronic kidney disease',
  'chf':                      'congestive heart failure',
  'heart failure':            'congestive heart failure',
  'mi':                       'myocardial infarction',
  'heart attack':             'myocardial infarction',
  'tbi':                      'traumatic brain injury',
  'ptsd':                     'post-traumatic stress disorder',
  'ocd':                      'obsessive compulsive disorder',
  'gad':                      'generalized anxiety disorder',
  'anxiety':                  'generalized anxiety disorder',
  'mdd':                      'major depressive disorder',
  'depression':               'major depressive disorder',
  'bipolar':                  'bipolar disorder',
  't1d':                      'type 1 diabetes',
  't2d':                      'type 2 diabetes',
  'type 1 diabetes mellitus': 'type 1 diabetes',
  'type 2 diabetes mellitus': 'type 2 diabetes',
  'diabetes':                 'type 2 diabetes',
  'htn':                      'hypertension',
  'high blood pressure':      'hypertension',
  'osa':                      'obstructive sleep apnea',
  'sleep apnea':              'obstructive sleep apnea',
  'eds':                      'ehlers-danlos syndrome',
  'sle':                      'systemic lupus erythematosus',
  'lupus':                    'systemic lupus erythematosus',
  'uc':                       'ulcerative colitis',
  'cd':                       'crohn\'s disease',
  'crohns':                   'crohn\'s disease',
  'als':                      'amyotrophic lateral sclerosis',
  'cf':                       'cystic fibrosis',
  'pcos':                     'polycystic ovary syndrome',
  'endo':                     'endometriosis',
  'fibro':                    'fibromyalgia',
  'migraine':                 'migraine',
  'migraines':                'migraine',
};

/**
 * Normalize a condition name to a canonical lowercase form.
 * Resolves common abbreviations and aliases.
 * @param {string} name
 * @returns {string} canonical lowercase condition name
 */
export function normalizeCondition(name) {
  if (!name) return '';
  const key = name.trim().toLowerCase();
  return ALIASES[key] || key;
}

// ---------------------------------------------------------------------------
// matchResources — rank resources against a user's health data
// ---------------------------------------------------------------------------

/**
 * Match registered resources against the user's health profile.
 *
 * Reads:
 *   data.conditions        — [{ name, status }]
 *   data.medications       — [{ name, active }]
 *   data.journal_entries   — [{ tags }]  (comma-separated string)
 *   data.settings          — { health_background }
 *
 * Returns a ranked, URL-deduplicated array of { resource, score }.
 *
 * @param {{ conditions?, medications?, journal_entries?, settings? }} data
 * @returns {{ resource: object, score: number }[]}
 */
export function matchResources(data = {}) {
  const { conditions = [], medications = [], journal_entries = [], settings = {} } = data;

  // Build lookup sets from user data
  const userConditions = new Set(
    conditions.map(c => normalizeCondition(c.name)),
  );
  const userMeds = new Set(
    medications
      .filter(m => m.active !== false)
      .map(m => m.name?.trim().toLowerCase())
      .filter(Boolean),
  );
  const userTags = new Set(
    journal_entries
      .flatMap(j => (j.tags || '').split(','))
      .map(t => t.trim().toLowerCase())
      .filter(Boolean),
  );
  const bgTokens = new Set(
    (settings.health_background || '')
      .toLowerCase()
      .split(/[\s,;]+/)
      .filter(t => t.length > 2),
  );

  const scored = [];

  for (const resource of RESOURCES) {
    let score = 0;

    // Condition matches (highest weight)
    for (const rc of resource.conditions || []) {
      const norm = normalizeCondition(rc);
      if (userConditions.has(norm)) score += 3;
      // Partial match against health_background freetext
      else if ([...bgTokens].some(t => norm.includes(t) || t.includes(norm))) score += 1;
    }

    // Medication matches
    for (const rm of resource.medications || []) {
      if (userMeds.has(rm.toLowerCase())) score += 2;
    }

    // Symptom/tag matches
    for (const rt of resource.symptomTags || []) {
      const tag = rt.toLowerCase();
      if (userTags.has(tag)) score += 1;
      else if ([...bgTokens].some(t => tag.includes(t) || t.includes(tag))) score += 0.5;
    }

    if (score > 0) scored.push({ resource, score });
  }

  // Sort descending by score, deduplicate by URL
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const results = [];
  for (const entry of scored) {
    const url = entry.resource.url;
    if (seen.has(url)) continue;
    seen.add(url);
    results.push(entry);
  }

  return results;
}
