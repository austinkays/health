// RxNorm API service — drug name standardization, generics, interactions
// https://lhncbc.nlm.nih.gov/RxNav/APIs/

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 15000;

async function rxFetch(path) {
  const url = `${RXNORM_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`RxNorm API error: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function findDrug(name) {
  try {
    const encoded = encodeURIComponent(name);
    const data = await rxFetch(`/drugs.json?name=${encoded}`);
    const group = data?.drugGroup;
    if (!group?.conceptGroup) return null;

    for (const cg of group.conceptGroup) {
      if (cg.conceptProperties?.length) {
        const drug = cg.conceptProperties[0];
        return { rxcui: drug.rxcui, name: drug.name, tty: drug.tty };
      }
    }
    return null;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

export async function suggestDrugs(term) {
  if (!term || term.length < 2) return [];
  try {
    const encoded = encodeURIComponent(term);
    const data = await rxFetch(`/spellingsuggestions.json?name=${encoded}`);
    return data?.suggestionGroup?.suggestionList?.suggestion || [];
  } catch {
    return [];
  }
}

export async function getGenericEquivalents(rxcui) {
  try {
    const data = await rxFetch(`/rxcui/${rxcui}/related.json?tty=SBD+SCD+GPCK+BPCK`);
    const groups = data?.relatedGroup?.conceptGroup || [];
    const results = [];
    for (const g of groups) {
      for (const p of g.conceptProperties || []) {
        results.push({ rxcui: p.rxcui, name: p.name, tty: p.tty });
      }
    }
    return results;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

export async function checkInteractions(rxcuiList) {
  if (!rxcuiList || rxcuiList.length < 2) return [];
  try {
    const cuiStr = rxcuiList.join('+');
    const data = await rxFetch(`/interaction/list.json?rxcuis=${cuiStr}`);
    const pairs = data?.fullInteractionTypeGroup || [];
    const results = [];

    for (const group of pairs) {
      for (const type of group.fullInteractionType || []) {
        for (const pair of type.interactionPair || []) {
          const concepts = pair.interactionConcept || [];
          results.push({
            drug1: concepts[0]?.minConceptItem?.name || '',
            drug2: concepts[1]?.minConceptItem?.name || '',
            severity: pair.severity || 'N/A',
            description: pair.description || '',
          });
        }
      }
    }
    return results;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

export async function checkInteractionsByNames(drugNames) {
  const rxcuis = [];
  for (const name of drugNames) {
    const drug = await findDrug(name);
    if (drug?.rxcui) rxcuis.push(drug.rxcui);
  }
  if (rxcuis.length < 2) return [];
  return checkInteractions(rxcuis);
}
