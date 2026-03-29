import { getDrugInfo } from './drugLookup';
import { searchPlaces, getPlaceDetails } from './placesLookup';
import { searchProviders } from './providerLookup';
import { db } from './db';

/**
 * Scan all data for records with missing fields that APIs can fill.
 * Returns a summary of what can be enriched.
 */
export function scanForGaps(data) {
  const gaps = { meds: [], providers: [], pharmacy: false };

  // Medications: missing purpose, or name exists but no enrichment data available
  for (const m of data.meds) {
    if (!m.name) continue;
    const missing = [];
    if (!m.purpose) missing.push('purpose');
    if (!m.pharmacy) missing.push('pharmacy');
    if (!m.dose) missing.push('dose');
    if (missing.length > 0) {
      gaps.meds.push({ id: m.id, name: m.name, missing });
    }
  }

  // Providers: missing phone, clinic/address, specialty
  for (const p of data.providers) {
    if (!p.name) continue;
    const missing = [];
    if (!p.phone) missing.push('phone');
    if (!p.clinic) missing.push('clinic/address');
    if (!p.specialty) missing.push('specialty');
    if (!p.portal_url) missing.push('website');
    if (missing.length > 0) {
      gaps.providers.push({ id: p.id, name: p.name, missing });
    }
  }

  // Pharmacy in settings: has name but might be incomplete
  const pharmacy = data.settings?.pharmacy;
  if (pharmacy && pharmacy.length > 2) {
    // If pharmacy string doesn't contain typical address markers
    const hasAddress = /\d{5}/.test(pharmacy) || /\d+\s+\w+\s+(st|ave|blvd|rd|dr|ln|ct|way|pkwy)/i.test(pharmacy);
    const hasPhone = /\(\d{3}\)|\d{3}[-.]?\d{3}[-.]?\d{4}/.test(pharmacy);
    if (!hasAddress || !hasPhone) {
      gaps.pharmacy = true;
    }
  }

  const total = gaps.meds.length + gaps.providers.length + (gaps.pharmacy ? 1 : 0);
  return { gaps, total };
}

/**
 * Enrich medications by filling missing fields from OpenFDA.
 * Returns { enriched: number, updates: [{id, changes}] }
 */
async function enrichMedications(meds, onProgress) {
  const updates = [];
  const toEnrich = meds.filter(m => m.name && (!m.purpose || !m.dose));

  // Process in chunks of 5
  for (let i = 0; i < toEnrich.length; i += 5) {
    const chunk = toEnrich.slice(i, i + 5);
    const results = await Promise.all(
      chunk.map(async (m) => {
        try {
          const info = await getDrugInfo(m.name);
          if (!info) return null;

          const changes = {};
          if (!m.purpose && info.purpose) {
            // Truncate to a reasonable length for the field
            changes.purpose = info.purpose.length > 200
              ? info.purpose.slice(0, 200).replace(/\s\S*$/, '...')
              : info.purpose;
          }
          if (Object.keys(changes).length > 0) {
            return { id: m.id, changes };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    for (const r of results) {
      if (r) updates.push(r);
    }
    if (onProgress) onProgress(Math.min(i + 5, toEnrich.length), toEnrich.length);
  }

  return { enriched: updates.length, updates };
}

/**
 * Enrich providers by filling missing fields from Google Places + NPI.
 * Returns { enriched: number, updates: [{id, changes}] }
 */
async function enrichProviders(providers, onProgress) {
  const updates = [];
  const toEnrich = providers.filter(p => p.name && (!p.phone || !p.clinic || !p.specialty || !p.portal_url));

  for (let i = 0; i < toEnrich.length; i++) {
    const p = toEnrich[i];
    try {
      const changes = {};

      // Try Google Places first (better for address, phone, website)
      const query = [p.name, p.specialty, p.clinic].filter(Boolean).join(' ');
      const placesResults = await searchPlaces(query);

      if (placesResults.length > 0) {
        const details = await getPlaceDetails(placesResults[0].place_id);
        if (details) {
          if (!p.phone && details.phone) changes.phone = details.phone;
          if (!p.clinic && details.address) changes.clinic = `${details.name}, ${details.address}`;
          if (!p.portal_url && details.website) changes.portal_url = details.website;

          // Build notes with hours and rating if not already in notes
          const extraNotes = [];
          if (details.rating) extraNotes.push(`Rating: ${details.rating}/5 (${details.rating_count} reviews)`);
          if (details.hours?.length > 0) extraNotes.push(`Hours: ${details.hours[0]}`);
          if (details.maps_url) extraNotes.push(`Maps: ${details.maps_url}`);

          if (extraNotes.length > 0 && (!p.notes || p.notes.length < 10)) {
            changes.notes = [p.notes, ...extraNotes].filter(Boolean).join('\n');
          }
        }
      }

      // Try NPI for specialty if still missing
      if (!p.specialty && !changes.specialty) {
        const npiResults = await searchProviders(p.name);
        if (npiResults.length > 0) {
          const match = npiResults[0];
          if (!p.specialty && match.specialty) changes.specialty = match.specialty;
          if (!p.phone && !changes.phone && match.phone) changes.phone = match.phone;
          if (!p.clinic && !changes.clinic && match.address) {
            changes.clinic = [match.address, match.city, match.state, match.zip].filter(Boolean).join(', ');
          }
        }
      }

      if (Object.keys(changes).length > 0) {
        updates.push({ id: p.id, changes });
      }
    } catch {
      // Skip this provider on error
    }
    if (onProgress) onProgress(i + 1, toEnrich.length);
  }

  return { enriched: updates.length, updates };
}

/**
 * Enrich pharmacy setting by looking up details via Google Places.
 * Returns { enriched: boolean, value: string } or null.
 */
async function enrichPharmacy(pharmacyName) {
  if (!pharmacyName || pharmacyName.length < 3) return null;

  try {
    const results = await searchPlaces(pharmacyName + ' pharmacy');
    if (results.length === 0) return null;

    const details = await getPlaceDetails(results[0].place_id);
    if (!details) return null;

    const parts = [details.name, details.address];
    if (details.phone) parts.push(details.phone);

    return { enriched: true, value: parts.join(' — ') };
  } catch {
    return null;
  }
}

/**
 * Run full enrichment on all data with missing fields.
 * Saves changes directly to Supabase via db service.
 * Returns stats about what was enriched.
 */
export async function enrichData(data, onProgress) {
  const stats = { meds: 0, providers: 0, pharmacy: false, errors: [] };
  let step = 0;
  const totalSteps = 3;

  const report = (label) => {
    step++;
    if (onProgress) onProgress(step, totalSteps, label);
  };

  // 1. Enrich medications
  report('Looking up medication details...');
  try {
    const medResult = await enrichMedications(data.meds);
    for (const { id, changes } of medResult.updates) {
      try {
        await db.medications.update(id, changes);
      } catch (e) {
        stats.errors.push(`Med update failed: ${e.message}`);
      }
    }
    stats.meds = medResult.enriched;
  } catch (e) {
    stats.errors.push(`Medication enrichment failed: ${e.message}`);
  }

  // 2. Enrich providers
  report('Looking up provider details...');
  try {
    const provResult = await enrichProviders(data.providers);
    for (const { id, changes } of provResult.updates) {
      try {
        await db.providers.update(id, changes);
      } catch (e) {
        stats.errors.push(`Provider update failed: ${e.message}`);
      }
    }
    stats.providers = provResult.enriched;
  } catch (e) {
    stats.errors.push(`Provider enrichment failed: ${e.message}`);
  }

  // 3. Enrich pharmacy setting
  report('Looking up pharmacy details...');
  try {
    const pharmacyResult = await enrichPharmacy(data.settings?.pharmacy);
    if (pharmacyResult?.enriched) {
      stats.pharmacy = true;
    }
  } catch {
    // Non-critical, skip
  }

  return stats;
}
