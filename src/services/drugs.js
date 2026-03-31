// Client service for drug information (RxNorm + OpenFDA)
// All calls go through /api/drug serverless function

import { getAuthToken } from './token';

async function drugAPI(action, params = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/drug?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Drug API error (${res.status})`);
  }
  return res.json();
}

/**
 * Autocomplete drug names via RxNorm
 * @param {string} query - partial drug name (min 2 chars)
 * @returns {Promise<Array<{name: string, rxcui: string}>>}
 */
export async function drugAutocomplete(query) {
  if (!query || query.length < 2) return [];
  return drugAPI('autocomplete', { q: query });
}

/**
 * Get drug label details from OpenFDA
 * @param {string} query - rxcui number or drug name
 * @returns {Promise<object|null>} drug label info
 */
export async function drugDetails(query, name) {
  if (!query) return null;
  const result = await drugAPI('details', { q: query, ...(name && { name }) });
  if (result?.error) return null;
  return result;
}

/**
 * Check interactions between multiple drugs via RxNorm
 * @param {string[]} rxcuis - array of RxCUI identifiers
 * @returns {Promise<Array<{drugA, drugB, severity, description, source}>>}
 */
export async function drugInteractions(rxcuis) {
  if (!rxcuis || rxcuis.length < 2) return [];
  return drugAPI('interactions', { rxcuis: rxcuis.join(',') });
}

/**
 * Look up NADAC wholesale price for a drug via RxCUI → NDC → CMS DKAN
 * @param {string} rxcui - RxCUI identifier
 * @returns {Promise<{rxcui, ndc, nadac_per_unit, pricing_unit, effective_date, as_of_date, drug_name, classification, all_prices[]}>}
 */
export async function drugPrice(rxcui) {
  if (!rxcui) return null;
  return drugAPI('price', { rxcui });
}
