/**
 * External info link generators for health data entities.
 * All URLs are constructed from user data, no API keys needed.
 */

/** DailyMed drug label, direct link when setid available, name search fallback */
export function dailyMedUrl(name, rxcui, setid) {
  if (setid) return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setid)}`;
  // Strip dosage/form/route noise for cleaner search
  // e.g. "Sertraline Hydrochloride 50 MG Oral Tablet" → "Sertraline Hydrochloride"
  const cleaned = (name || '')
    .replace(/\(.*?\)/g, '')  // remove parenthetical notes like "(compounded)"
    .replace(/\s+\d+(\.\d+)?\s*(mg|ml|mcg|%|units?|unt|meq|gm?|iu)\b.*/i, '')  // strip dosage + everything after
    .replace(/\s+(oral|tablet|capsule|cream|solution|injection|patch|spray|powder|gel|ointment|suspension|chewable|extended|release|delayed|er|dr|sr|cr|xl|xr)\b.*/i, '')  // strip dosage forms
    .trim();
  // Guard against empty or purely numeric result
  const query = (cleaned && !/^\d+$/.test(cleaned)) ? cleaned : (name || '');
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(query)}`;
}

/** MedlinePlus health topic search (NIH) */
export function medlinePlusUrl(topic) {
  return `https://medlineplus.gov/search?query=${encodeURIComponent(topic)}`;
}

/** MedlinePlus lab test search, cleans verbose Apple Health/FHIR names */
export function medlinePlusLabUrl(testName) {
  const safe = typeof testName === 'string' ? testName : '';
  let clean = safe
    .replace(/\s*\[.*?\]\s*/g, '')          // strip bracketed codes [LOINC], [Mass/Vol], etc.
    .replace(/\s*\(.*?\)\s*/g, '')          // strip parentheticals (serum), (blood), etc.
    .replace(/\b(in|of|by|per)\s+(serum|plasma|blood|urine|whole blood|body fluid)\b/gi, '') // strip specimen type phrases
    .replace(/\b(mass|moles|volume|substance|catalytic activity|number|arbitrary)\s*\/\s*(volume|area|time)\b/gi, '') // strip LOINC quantity types
    .replace(/\s{2,}/g, ' ')               // collapse whitespace
    .trim();
  // If cleaning left nothing useful, fall back to original
  if (clean.length < 3) clean = safe.trim();
  return `https://medlineplus.gov/search?query=${encodeURIComponent((clean || 'lab') + ' test')}`;
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
 * falls back to Google search with specific query (specialty + clinic).
 */
export function providerLookupUrl(providerName, savedProviders) {
  if (!providerName?.trim()) return null;
  const nameLC = providerName.trim().toLowerCase();
  const match = (savedProviders || []).find(p => p.name.trim().toLowerCase() === nameLC);
  if (match?.npi) return npiRegistryUrl(match.npi);
  // Build specific search query from known provider details
  const parts = [providerName];
  if (match?.specialty) parts.push(match.specialty);
  if (match?.clinic) parts.push(match.clinic);
  if (!match?.clinic && !match?.specialty) parts.push('doctor');
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`;
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

/** Cost Plus Drugs price search (Mark Cuban venture, generics only) */
export function costPlusDrugsUrl(drugName) {
  if (!drugName?.trim()) return null;
  // Slug: lowercase, strip dosage forms/strengths, spaces→hyphens
  const slug = drugName.trim().toLowerCase()
    .replace(/\s+\d+(\.\d+)?\s*(mg|ml|mcg|%|units?)\b.*$/i, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `https://costplusdrugs.com/medications/${slug}/`;
}

/** Amazon Pharmacy search */
export function amazonPharmacyUrl(drugName) {
  if (!drugName?.trim()) return null;
  return `https://pharmacy.amazon.com/search?query=${encodeURIComponent(drugName.trim())}`;
}

/** Blink Health price search */
export function blinkHealthUrl(drugName) {
  if (!drugName?.trim()) return null;
  return `https://www.blinkhealth.com/search?query=${encodeURIComponent(drugName.trim())}`;
}
