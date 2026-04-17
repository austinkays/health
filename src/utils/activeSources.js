import { isOuraConnected } from '../services/oura';
import { isDexcomConnected, DEXCOM_ENABLED } from '../services/dexcom';
import { isWithingsConnected, WITHINGS_ENABLED } from '../services/withings';
import { isFitbitConnected, FITBIT_ENABLED } from '../services/fitbit';
import { isWhoopConnected, WHOOP_ENABLED } from '../services/whoop';

// Reads localStorage + data tables to decide which sources are live (OAuth flowing)
// vs. imported (data present from a one-shot file import). Returns Sets keyed by source id.
export function computeActiveSources(data, terraConnections) {
  const live = new Set();
  if (isOuraConnected()) live.add('oura');
  if (DEXCOM_ENABLED && isDexcomConnected()) live.add('dexcom');
  if (WITHINGS_ENABLED && isWithingsConnected()) live.add('withings');
  if (FITBIT_ENABLED && isFitbitConnected()) live.add('fitbit');
  if (WHOOP_ENABLED && isWhoopConnected()) live.add('whoop');

  const counts = {};
  const all = [
    ...(data.vitals || []),
    ...(data.activities || []),
    ...(data.cycles || []),
    ...(data.journal_entries || []),
    ...(data.labs || []),
    ...(data.genetic_results || []),
  ];
  for (const r of all) {
    let s = (r.source || '').toLowerCase();
    if (!s || s === 'manual') continue;
    if (s === 'apple health' || s.includes('apple')) s = 'apple_health';
    else if (s === 'mcp-sync') s = 'mcp';
    counts[s] = (counts[s] || 0) + 1;
  }

  const imported = new Set();
  for (const s of Object.keys(counts)) {
    if (live.has(s)) continue; // OAuth already covers it — don't double-render
    imported.add(s);
  }

  const terraLive = (terraConnections || []).filter(c => c.status !== 'disconnected');
  return { live, imported, counts, terraLive };
}
