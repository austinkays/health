// NPPES NPI Registry API service — provider & pharmacy lookup
// https://npiregistry.cms.hhs.gov/api-page

const NPI_BASE = 'https://npiregistry.cms.hhs.gov/api/';
const TIMEOUT_MS = 15000;

function normalizeResult(r) {
  const basic = r.basic || {};
  const addr = r.addresses?.[0] || {};
  const taxonomy = r.taxonomies?.[0] || {};
  const isOrg = r.enumeration_type === 'NPI-2';

  return {
    npi: r.number || '',
    name: isOrg
      ? (basic.organization_name || '')
      : `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
    credential: basic.credential || '',
    specialty: taxonomy.desc || '',
    taxonomy_code: taxonomy.code || '',
    primary_taxonomy: taxonomy.primary || false,
    address: addr.address_1 || '',
    address2: addr.address_2 || '',
    city: addr.city || '',
    state: addr.state || '',
    zip: (addr.postal_code || '').slice(0, 5),
    phone: addr.telephone_number || '',
    fax: addr.fax_number || '',
    type: isOrg ? 'organization' : 'individual',
  };
}

async function npiSearch(params) {
  const searchParams = new URLSearchParams({ version: '2.1', ...params });
  const url = `${NPI_BASE}?${searchParams.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`NPI API error: ${res.status}`);
    const data = await res.json();
    if (data.Errors?.length) return [];
    return (data.results || []).map(normalizeResult);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchProviders({ name, specialty, city, state, zip, limit = 20 }) {
  const params = { enumeration_type: 'NPI-1', limit: String(limit) };
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      params.first_name = parts[0];
      params.last_name = parts.slice(1).join(' ');
    } else {
      params.last_name = parts[0];
    }
  }
  if (specialty) params.taxonomy_description = specialty;
  if (city) params.city = city;
  if (state) params.state = state;
  if (zip) params.postal_code = zip;
  return npiSearch(params);
}

export async function searchPharmacies({ name, city, state, zip, limit = 20 }) {
  const params = {
    enumeration_type: 'NPI-2',
    taxonomy_description: name ? undefined : 'Pharmacy',
    limit: String(limit),
  };
  if (name) params.organization_name = name;
  if (city) params.city = city;
  if (state) params.state = state;
  if (zip) params.postal_code = zip;
  // Clean undefined params
  Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);
  return npiSearch(params);
}

export const COMMON_SPECIALTIES = [
  'Internal Medicine',
  'Family Medicine',
  'Psychiatry',
  'Neurology',
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'General Surgery',
  'Obstetrics & Gynecology',
  'Oncology',
  'Ophthalmology',
  'Orthopedic Surgery',
  'Pain Medicine',
  'Pediatrics',
  'Physical Medicine & Rehabilitation',
  'Pulmonary Disease',
  'Rheumatology',
  'Urology',
  'Nurse Practitioner',
  'Physician Assistant',
  'Pharmacy',
];
