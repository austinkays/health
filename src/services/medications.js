import { supabase } from './supabase';

// ── OpenFDA proxy ──

async function callOpenFDA(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in to look up medications.');

  const res = await fetch('/api/openfda', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `OpenFDA API error ${res.status}`);
  }

  return res.json();
}

// ── RxNorm proxy ──

async function callRxNorm(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in to look up medications.');

  const res = await fetch('/api/rxnorm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `RxNorm API error ${res.status}`);
  }

  return res.json();
}

// ── Public API: OpenFDA ──

/**
 * Get drug labeling info (indications, warnings, dosage, interactions).
 * @param {string} drug - Drug name (brand or generic)
 */
export async function getDrugLabel(drug) {
  return callOpenFDA({ action: 'label', drug });
}

/**
 * Get most-reported adverse reactions for a drug.
 * @param {string} drug - Drug name
 * @param {number} limit - Number of top reactions (default 10)
 */
export async function getAdverseEvents(drug, limit = 10) {
  return callOpenFDA({ action: 'adverse', drug, limit });
}

/**
 * Get drug interaction text from FDA labeling.
 * @param {string} drug - Drug name
 */
export async function getDrugInteractionsFromFDA(drug) {
  return callOpenFDA({ action: 'interactions', drug });
}

// ── Public API: RxNorm ──

/**
 * Look up a drug's RxCUI (standard identifier) by name.
 * @param {string} drug - Drug name
 */
export async function lookupRxCUI(drug) {
  return callRxNorm({ action: 'lookup', drug });
}

/**
 * Get drug properties by RxCUI.
 * @param {string} rxcui - RxNorm concept ID
 */
export async function getDrugInfo(rxcui) {
  return callRxNorm({ action: 'info', rxcui });
}

/**
 * Check interactions for a single drug by RxCUI.
 * @param {string} rxcui - RxNorm concept ID
 */
export async function checkDrugInteractions(rxcui) {
  return callRxNorm({ action: 'interactions', rxcui });
}

/**
 * Check interactions between multiple drugs.
 * @param {string[]} rxcuis - Array of RxCUI strings (at least 2)
 */
export async function checkMultiDrugInteractions(rxcuis) {
  return callRxNorm({ action: 'multi-interactions', drugs: rxcuis });
}
