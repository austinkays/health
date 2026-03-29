import { INTERACTIONS } from '../constants/interactions';
import { resolveRxcui, checkInteractionsAPI } from '../services/drugs';

export function checkInteractions(meds) {
  const warnings = [];
  const activeMeds = meds.filter(m => m.active !== false);
  const names = activeMeds.map(m => m.name.toLowerCase().trim());

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const rule of INTERACTIONS) {
        if (rule.dupCheck && names[i] === names[j]) continue;

        const aI = rule.a.some(x => names[i].includes(x));
        const aJ = rule.a.some(x => names[j].includes(x));
        const bI = rule.b.some(x => names[i].includes(x));
        const bJ = rule.b.some(x => names[j].includes(x));

        if ((aI && bJ) || (aJ && bI)) {
          const key = [names[i], names[j]].sort().join('+') + rule.msg;
          if (!warnings.find(w => w.key === key)) {
            warnings.push({
              key,
              medA: activeMeds[i].name,
              medB: activeMeds[j].name,
              severity: rule.severity,
              msg: rule.msg,
              source: 'local',
            });
          }
        }
      }
    }
  }

  return warnings.sort(
    (a, b) =>
      ({ danger: 0, caution: 1, info: 2 })[a.severity] -
      ({ danger: 0, caution: 1, info: 2 })[b.severity]
  );
}

const SEV_ORDER = { danger: 0, caution: 1, info: 2 };

export async function checkInteractionsEnhanced(meds) {
  const localWarnings = checkInteractions(meds);
  const activeMeds = meds.filter(m => m.active !== false);

  if (activeMeds.length < 2) return localWarnings;

  try {
    // Resolve drug names to RxCUI IDs
    const rxcuiResults = await Promise.all(
      activeMeds.map(m => resolveRxcui(m.name))
    );
    const rxcuis = rxcuiResults.filter(Boolean);

    if (rxcuis.length < 2) return localWarnings;

    const apiWarnings = await checkInteractionsAPI(rxcuis);

    // Merge: deduplicate by normalized drug pair
    const merged = [...localWarnings];
    const localKeys = new Set(merged.map(w =>
      [w.medA.toLowerCase(), w.medB.toLowerCase()].sort().join('+')
    ));

    for (const w of apiWarnings) {
      const pairKey = [w.medA.toLowerCase(), w.medB.toLowerCase()].sort().join('+');
      const existing = merged.find(m =>
        [m.medA.toLowerCase(), m.medB.toLowerCase()].sort().join('+') === pairKey
      );
      if (existing) {
        existing.source = 'both';
        // Upgrade severity if API says higher
        if ((SEV_ORDER[w.severity] || 2) < (SEV_ORDER[existing.severity] || 2)) {
          existing.severity = w.severity;
        }
      } else {
        merged.push({ ...w, key: pairKey + w.msg });
      }
    }

    return merged.sort((a, b) => (SEV_ORDER[a.severity] || 2) - (SEV_ORDER[b.severity] || 2));
  } catch {
    return localWarnings;
  }
}
