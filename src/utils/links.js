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

/** Google Calendar "Add to Calendar" URL (no API key needed) */
export function googleCalendarUrl({ title, date, time, location, details }) {
  if (!date) return null;
  // Build yyyyMMdd or yyyyMMddTHHmmss format
  const d = date.replace(/-/g, '');
  let dates;
  if (time) {
    const t = time.replace(/:/g, '');
    dates = `${d}T${t}00/${d}T${t.slice(0, 2)}${String(Math.min(59, parseInt(t.slice(2), 10) + 30)).padStart(2, '0')}00`;
  } else {
    // All-day event
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const nd = next.toISOString().slice(0, 10).replace(/-/g, '');
    dates = `${d}/${nd}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Appointment',
    dates,
  });
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/event?${params.toString()}`;
}

/** GoodRx drug price comparison search */
export function goodRxUrl(drugName) {
  if (!drugName?.trim()) return null;
  return `https://www.goodrx.com/search?search=${encodeURIComponent(drugName.trim())}`;
}

/** ClinicalTrials.gov condition search (optionally near a city) */
export function clinicalTrialsUrl(condition, city) {
  if (!condition?.trim()) return null;
  const params = new URLSearchParams({ cond: condition.trim() });
  if (city?.trim()) {
    params.set('locStr', city.trim());
    params.set('distance', '50');
  }
  return `https://clinicaltrials.gov/search?${params.toString()}`;
}
