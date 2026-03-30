// Client service for NPI provider lookup
// All calls go through /api/provider serverless function

import { getAuthToken } from './token';

async function providerAPI(action, params = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not signed in');
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/provider?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Provider API error (${res.status})`);
  }
  return res.json();
}

/**
 * Search NPI registry by provider name
 * @param {string} name - provider name to search
 * @param {string} [state] - optional 2-letter state code
 * @returns {Promise<Array<{npi, name, credential, specialty, address, phone, fax, organization}>>}
 */
export async function searchProviders(name, state) {
  if (!name || name.length < 2) return [];
  const params = { q: name };
  if (state) params.state = state;
  return providerAPI('search', params);
}

/**
 * Lookup a single provider by NPI number
 * @param {string} npiNumber - 10-digit NPI
 * @returns {Promise<object|null>}
 */
export async function lookupNPI(npiNumber) {
  if (!npiNumber) return null;
  const result = await providerAPI('lookup', { npi: npiNumber });
  if (result?.error) return null;
  return result;
}
