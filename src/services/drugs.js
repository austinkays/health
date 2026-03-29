const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

async function safeFetch(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// RxNorm: search drugs by name
export async function searchDrugs(term) {
  if (!term || term.length < 3) return [];

  const key = `rx:search:${term.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await safeFetch(
    `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=8`
  );

  if (!data?.approximateGroup?.candidate) return [];

  const seen = new Set();
  const results = data.approximateGroup.candidate
    .filter(c => c.rxcui && c.rxcui !== '0')
    .filter(c => { if (seen.has(c.rxcui)) return false; seen.add(c.rxcui); return true; })
    .slice(0, 8)
    .map(c => ({ name: c.name || term, rxcui: c.rxcui }));

  setCache(key, results);
  return results;
}

// RxNorm: get drug properties by rxcui
export async function getDrugInfo(rxcui) {
  if (!rxcui) return null;

  const key = `rx:info:${rxcui}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await safeFetch(
    `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`
  );

  const props = data?.properties;
  if (!props) return null;

  const result = { name: props.name, rxcui: props.rxcui, tty: props.tty, synonym: props.synonym };
  setCache(key, result);
  return result;
}

// RxNorm: get dose form strengths
export async function getDoseFormStrengths(rxcui) {
  if (!rxcui) return [];

  const key = `rx:strengths:${rxcui}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await safeFetch(
    `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=SCD+SBD`
  );

  const groups = data?.relatedGroup?.conceptGroup || [];
  const results = [];
  for (const g of groups) {
    for (const p of g.conceptProperties || []) {
      results.push({ name: p.name, rxcui: p.rxcui });
    }
  }

  const limited = results.slice(0, 10);
  setCache(key, limited);
  return limited;
}

// RxNorm: check interactions between multiple drugs
export async function checkInteractionsAPI(rxcuis) {
  if (!rxcuis || rxcuis.length < 2) return [];

  const sorted = [...rxcuis].sort();
  const key = `rx:interactions:${sorted.join('+')}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await safeFetch(
    `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${sorted.join('+')}`
  );

  const pairs = data?.fullInteractionTypeGroup || [];
  const results = [];

  for (const group of pairs) {
    for (const type of group.fullInteractionType || []) {
      for (const pair of type.interactionPair || []) {
        const concepts = pair.interactionConcept || [];
        if (concepts.length >= 2) {
          results.push({
            medA: concepts[0].minConceptItem?.name || '',
            medB: concepts[1].minConceptItem?.name || '',
            severity: pair.severity?.toLowerCase() === 'high' ? 'danger' : 'caution',
            msg: pair.description || '',
            source: 'rxnorm',
          });
        }
      }
    }
  }

  setCache(key, results);
  return results;
}

// openFDA: search for drug recalls
export async function searchFDARecalls(drugName) {
  if (!drugName) return [];

  const key = `fda:recall:${drugName.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;

  const term = encodeURIComponent(drugName);
  const data = await safeFetch(
    `https://api.fda.gov/drug/enforcement.json?search=openfda.brand_name:"${term}"+openfda.generic_name:"${term}"&limit=5&sort=report_date:desc`
  );

  if (!data?.results) {
    setCache(key, []);
    return [];
  }

  const results = data.results.map(r => ({
    drug: drugName,
    reason: r.reason_for_recall || '',
    date: r.report_date || '',
    classification: r.classification || '',
    status: r.status || '',
  }));

  setCache(key, results);
  return results;
}

// Resolve drug name to rxcui (for interaction checking)
export async function resolveRxcui(drugName) {
  if (!drugName) return null;

  const key = `rx:resolve:${drugName.toLowerCase()}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await safeFetch(
    `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}&search=2`
  );

  const rxcui = data?.idGroup?.rxnormId?.[0] || null;
  setCache(key, rxcui);
  return rxcui;
}
