/**
 * External info link generators for health data entities.
 * All URLs are constructed from user data — no API keys needed.
 */

/** DailyMed drug label search (NLM/FDA) */
export function dailyMedUrl(name, rxcui) {
  if (rxcui) return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(rxcui)}`;
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(name)}`;
}

/** MedlinePlus health topic search (NIH) */
export function medlinePlusUrl(topic) {
  return `https://medlineplus.gov/search?query=${encodeURIComponent(topic)}`;
}

/** MedlinePlus lab test search */
export function medlinePlusLabUrl(testName) {
  return `https://medlineplus.gov/search?query=${encodeURIComponent(testName + ' test')}`;
}

/** CDC vaccine info search */
export function cdcVaccineUrl(vaccineName) {
  return `https://www.cdc.gov/search/?query=${encodeURIComponent(vaccineName + ' vaccine')}`;
}

/** NPI registry provider view */
export function npiRegistryUrl(npi) {
  return `https://npiregistry.cms.hhs.gov/provider-view/${npi}`;
}

/**
 * Best available provider link. Checks saved providers for NPI first,
 * falls back to Google search for the provider.
 */
export function providerLookupUrl(providerName, savedProviders) {
  if (!providerName?.trim()) return null;
  const nameLC = providerName.trim().toLowerCase();
  const match = (savedProviders || []).find(p => p.name.trim().toLowerCase() === nameLC);
  if (match?.npi) return npiRegistryUrl(match.npi);
  return `https://www.google.com/search?q=${encodeURIComponent(providerName + ' doctor healthcare provider')}`;
}
