import { supabase } from './supabase';

async function callNPI(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('You must be signed in to search providers.');

  const res = await fetch('/api/npi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `NPI API error ${res.status}`);
  }

  return res.json();
}

/**
 * Search providers by name.
 * @param {string} name - Provider or organization name
 * @param {object} [opts] - Optional filters: { city, state, specialty }
 */
export async function searchByName(name, opts = {}) {
  return callNPI({ name, ...opts });
}

/**
 * Search providers by first and last name.
 * @param {string} firstName
 * @param {string} lastName
 * @param {object} [opts] - Optional filters: { city, state, specialty }
 */
export async function searchByFullName(firstName, lastName, opts = {}) {
  return callNPI({ first_name: firstName, last_name: lastName, ...opts });
}

/**
 * Look up a provider by NPI number.
 * @param {string} npi - 10-digit NPI number
 */
export async function lookupByNPI(npi) {
  return callNPI({ npi });
}

/**
 * Search providers by specialty and location.
 * @param {string} specialty - Taxonomy description (e.g. "Cardiology", "Family Medicine")
 * @param {object} [location] - Optional: { city, state, zip }
 */
export async function searchBySpecialty(specialty, location = {}) {
  return callNPI({ specialty, ...location });
}
