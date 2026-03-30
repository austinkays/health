import { INTERACTIONS } from '../constants/interactions';

export function checkInteractions(meds) {
  if (!meds?.length) return [];
  const warnings = [];
  const activeMeds = meds.filter(m => m?.active !== false && m?.name);
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
