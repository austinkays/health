import { VITAL_TYPES, getCycleRelatedLabel } from '../constants/defaults';

// Sanitize user-provided text to prevent prompt injection
// Higher limit for FDA data which is system-sourced, not user-authored
function san(text, limit = 500) {
  if (!text) return '';
  return String(text).replace(/[<>{}]/g, '').slice(0, limit);
}

// Condense verbose FDA label text into key clinical points
function condenseFDA(fda) {
  if (!fda) return '';
  let out = '';
  if (fda.boxed_warning?.length) {
    out += ' ⚠ BOXED WARNING: ' + san(fda.boxed_warning[0], 200);
  }
  if (fda.contraindications?.length) {
    out += ' | contraindicated: ' + san(fda.contraindications[0], 150);
  }
  if (fda.drug_interactions?.length) {
    out += ' | interactions: ' + san(fda.drug_interactions[0], 150);
  }
  if (fda.adverse_reactions?.length) {
    // Extract just the first sentence or 120 chars of side effects
    const raw = san(fda.adverse_reactions[0], 200);
    const first = raw.split(/\.\s/)[0];
    out += ' | side effects: ' + (first.length < raw.length ? first + '.' : raw);
  }
  if (fda.pregnancy?.length) {
    const raw = san(fda.pregnancy[0], 100);
    out += ' | pregnancy: ' + raw;
  }
  return out;
}

// Compute trend direction from an array of {date, value} entries
function computeTrend(values) {
  if (values.length < 3) return '';
  const recent = values.slice(-5);
  const older = values.slice(0, Math.max(1, values.length - 5));
  const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
  const avgOlder = older.reduce((s, v) => s + v, 0) / older.length;
  const diff = ((avgRecent - avgOlder) / (avgOlder || 1)) * 100;
  if (Math.abs(diff) < 3) return 'stable';
  return diff > 0 ? 'trending up' : 'trending down';
}

// Summarize vitals by type: min/avg/max/trend + flag outliers
function summarizeVitals(vitals) {
  if (!vitals.length) return '';
  const groups = {};
  vitals.forEach(v => {
    if (!groups[v.type]) groups[v.type] = [];
    groups[v.type].push(v);
  });

  let out = '\n— VITALS SUMMARY —\n';
  for (const [type, entries] of Object.entries(groups)) {
    const t = VITAL_TYPES.find(x => x.id === type);
    const label = t ? t.label : type;
    const unit = t ? t.unit : '';

    if (type === 'bp') {
      const sys = entries.map(e => Number(e.value)).filter(n => !isNaN(n));
      const dia = entries.map(e => Number(e.value2)).filter(n => !isNaN(n));
      if (!sys.length) continue;
      const avgSys = Math.round(sys.reduce((a, b) => a + b, 0) / sys.length);
      const avgDia = Math.round(dia.reduce((a, b) => a + b, 0) / dia.length);
      const trend = computeTrend(sys);
      out += '- ' + label + ': avg ' + avgSys + '/' + avgDia + ' ' + unit;
      out += ', range ' + Math.min(...sys) + '-' + Math.max(...sys) + '/' + Math.min(...dia) + '-' + Math.max(...dia);
      out += ' (' + entries.length + ' readings';
      if (trend) out += ', ' + trend;
      out += ')\n';
      continue;
    }

    const vals = entries.map(e => Number(e.value)).filter(n => !isNaN(n));
    if (!vals.length) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const trend = computeTrend(vals);

    out += '- ' + label + ': avg ' + (Number.isInteger(avg) ? avg : avg.toFixed(1)) + ' ' + unit;
    if (min !== max) out += ', range ' + min + '-' + max;
    out += ' (' + entries.length + ' readings';
    if (trend) out += ', ' + trend;
    out += ')';

    // Flag abnormal values
    if (t) {
      const abnormal = [];
      if (t.warnHigh && max >= t.warnHigh) abnormal.push('high ' + max);
      if (t.warnLow && min <= t.warnLow) abnormal.push('low ' + min);
      if (t.normalHigh && max > t.normalHigh) abnormal.push('above normal ' + max);
      if (t.normalLow && min < t.normalLow) abnormal.push('below normal ' + min);
      if (abnormal.length) out += ' [flags: ' + abnormal.join(', ') + ']';
    }
    out += '\n';
  }

  // Append last 3 readings with notes (recent context)
  const withNotes = vitals.filter(v => v.notes).slice(-5);
  if (withNotes.length) {
    out += 'Recent notes: ';
    out += withNotes.map(v => {
      const t = VITAL_TYPES.find(x => x.id === v.type);
      return (t ? t.label : v.type) + ' ' + v.value + ' on ' + v.date + ' — ' + v.notes;
    }).join('; ');
    out += '\n';
  }

  return out;
}

export function buildProfile(data) {
  if (!data) return '(No health data available)';
  const s = data.settings || {};
  let p = '';

  if (s.name) p += 'Patient name: ' + san(s.name) + '\n';
  if (s.location) p += 'Location: ' + san(s.location) + '\n';

  // Active medications — condensed FDA data
  p += '\n— ACTIVE MEDICATIONS —\n';
  const active = (data.meds || []).filter(m => m.active !== false);
  if (active.length === 0) p += '(none)\n';
  active.forEach(m => {
    p += '- ' + m.name;
    if (m.display_name && m.display_name !== m.name) p += ' (patient calls it: "' + san(m.display_name) + '")';
    if (m.dose) p += ' ' + m.dose;
    if (m.frequency) p += ', ' + m.frequency;
    if (m.route) p += ' (' + m.route + ')';
    if (m.fda_data?.pharm_class?.length) p += ' [class: ' + m.fda_data.pharm_class.map(c => c.replace(/ \[.*\]$/, '')).join(', ') + ']';
    if (m.fda_data?.pharm_class_moa?.length) p += ' [mechanism: ' + m.fda_data.pharm_class_moa.map(c => c.replace(/ \[.*\]$/, '')).join(', ') + ']';
    if (m.purpose) p += ' — for: ' + m.purpose;
    if (m.prescriber) p += ' [prescribed by ' + m.prescriber + ']';
    p += condenseFDA(m.fda_data);
    // Append price data if available
    const medPrices = (data.drug_prices || []).filter(dp => dp.medication_id === m.id && dp.nadac_per_unit);
    if (medPrices.length) {
      const latest = medPrices.sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at))[0];
      p += ' [NADAC: $' + Number(latest.nadac_per_unit).toFixed(4) + '/' + (latest.pricing_unit || 'unit') + ']';
    }
    p += '\n';
  });

  // Monthly medication cost summary
  const priceEntries = data.drug_prices || [];
  if (priceEntries.length && active.length) {
    let monthlyTotal = 0;
    let counted = 0;
    active.forEach(m => {
      const mp = priceEntries.filter(dp => dp.medication_id === m.id && dp.nadac_per_unit)
        .sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at));
      if (!mp.length) return;
      const perUnit = Number(mp[0].nadac_per_unit);
      let daily = 1;
      const f = (m.frequency || '').toLowerCase();
      if (/qid|4.*day|q6h/i.test(f)) daily = 4;
      else if (/tid|3.*day|q8h/i.test(f)) daily = 3;
      else if (/bid|2.*day|twice|q12h/i.test(f)) daily = 2;
      else if (/week/i.test(f)) daily = 1 / 7;
      else if (/biweek|every.*2.*week/i.test(f)) daily = 1 / 14;
      else if (/month/i.test(f)) daily = 1 / 30;
      monthlyTotal += perUnit * daily * 30;
      counted++;
    });
    if (counted > 0) {
      p += 'Monthly medication costs (wholesale NADAC): ~$' + monthlyTotal.toFixed(2) + ' (' + counted + ' of ' + active.length + ' medications priced)\n';
    }
  }

  // Discontinued medications
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    p += '\n— DISCONTINUED MEDICATIONS —\n';
    disc.forEach(m => {
      p += '- ' + m.name;
      if (m.dose) p += ' ' + m.dose;
      if (m.notes) p += ' — ' + m.notes;
      p += '\n';
    });
  }

  // Conditions
  p += '\n— CONDITIONS & DIAGNOSES —\n';
  const conds = data.conditions || [];
  if (conds.length === 0) p += '(none)\n';
  conds.forEach(c => {
    p += '- ' + c.name + ' (status: ' + c.status + ')';
    if (c.diagnosed_date) p += ', diagnosed ' + c.diagnosed_date;
    if (c.provider) p += ', treated by ' + c.provider;
    if (c.linked_meds) p += ', meds: ' + c.linked_meds;
    if (c.notes) p += ' — ' + c.notes;
    p += '\n';
  });

  // Allergies
  const allergies = data.allergies || [];
  if (allergies.length) {
    p += '\n— ALLERGIES —\n';
    allergies.forEach(a => {
      p += '- ' + a.substance + ' (' + a.severity + ')';
      if (a.type) p += ' [type: ' + a.type + ']';
      if (a.reaction) p += ' — reaction: ' + a.reaction;
      if (a.notes) p += ' — ' + san(a.notes);
      p += '\n';
    });
  }

  // Vitals — aggregated summary instead of individual readings
  const vitals = data.vitals || [];
  if (vitals.length) {
    p += summarizeVitals(vitals.slice(-30));
  }

  // Recent journal entries (last 5)
  const journal = data.journal || [];
  if (journal.length) {
    p += '\n— RECENT JOURNAL ENTRIES (last 15) —\n';
    journal.slice(0, 15).forEach(e => {
      p += '- ' + e.date;
      if (e.mood) p += ' [mood: ' + e.mood + ']';
      if (e.severity) p += ' [severity: ' + e.severity + '/10]';
      p += ': ' + san(e.content || e.title || '');
      if (e.tags) p += ' (tags: ' + san(e.tags) + ')';
      p += '\n';
    });
  }

  // Insurance
  if (s.insurance_plan) {
    p += '\n— INSURANCE —\n';
    p += 'Plan: ' + s.insurance_plan;
    if (s.insurance_id) p += ', ID: ' + s.insurance_id;
    p += '\n';
  }

  // Health background
  if (s.health_background) {
    p += '\n— ADDITIONAL HEALTH BACKGROUND —\n' + san(s.health_background) + '\n';
  }

  // Labs (highlight abnormal results, last 10)
  const labs = data.labs || [];
  if (labs.length) {
    const abnormal = labs.filter(l => l.flag && l.flag !== 'normal');
    const recent = labs.slice(0, 10);
    if (abnormal.length) {
      p += '\n— ABNORMAL LAB RESULTS —\n';
      abnormal.forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        p += ' [' + l.flag + ']';
        if (l.range) p += ' (ref: ' + l.range + ')';
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
    const normal = recent.filter(l => !l.flag || l.flag === 'normal');
    if (normal.length) {
      p += '\n— RECENT LAB RESULTS (normal) —\n';
      normal.slice(0, 10).forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
  }

  // Procedures (last 5)
  const procedures = data.procedures || [];
  if (procedures.length) {
    p += '\n— PROCEDURES —\n';
    procedures.slice(0, 10).forEach(pr => {
      p += '- ' + pr.name;
      if (pr.date) p += ' on ' + pr.date;
      if (pr.provider) p += ' by ' + pr.provider;
      if (pr.outcome) p += ' — outcome: ' + pr.outcome;
      if (pr.notes) p += ' — ' + pr.notes;
      p += '\n';
    });
  }

  // Immunizations
  const immunizations = data.immunizations || [];
  if (immunizations.length) {
    p += '\n— IMMUNIZATIONS —\n';
    immunizations.forEach(i => {
      p += '- ' + i.name;
      if (i.date) p += ' on ' + i.date;
      if (i.dose) p += ' (dose ' + i.dose + ')';
      if (i.provider) p += ' at ' + i.provider;
      if (i.site) p += ' [site: ' + i.site + ']';
      p += '\n';
    });
  }

  // Care gaps
  const careGaps = data.care_gaps || [];
  if (careGaps.length) {
    p += '\n— CARE GAPS (overdue screenings/preventive care) —\n';
    careGaps.forEach(g => {
      p += '- ' + g.item;
      if (g.urgency) p += ' [' + g.urgency + ']';
      if (g.category) p += ' (' + g.category + ')';
      if (g.last_done) p += ' last done ' + g.last_done;
      if (g.notes) p += ' — ' + g.notes;
      p += '\n';
    });
  }

  // Anesthesia flags
  const anesthesiaFlags = data.anesthesia_flags || [];
  if (anesthesiaFlags.length) {
    p += '\n— ANESTHESIA FLAGS (safety-critical) —\n';
    anesthesiaFlags.forEach(f => {
      p += '- ' + f.condition;
      if (f.implication) p += ': ' + f.implication;
      if (f.action_required) p += ' → ' + f.action_required;
      p += '\n';
    });
  }

  // Surgical planning
  const surgical = data.surgical_planning || [];
  if (surgical.length) {
    p += '\n— SURGICAL PLANNING —\n';
    surgical.forEach(sp => {
      const procs = Array.isArray(sp.procedures) ? sp.procedures.join(', ') : '';
      p += '- ' + (procs || 'Surgical plan');
      if (sp.target_date) p += ' scheduled ' + sp.target_date;
      if (sp.surgeon) p += ' with ' + sp.surgeon;
      if (sp.facility) p += ' at ' + sp.facility;
      if (sp.status) p += ' (' + sp.status + ')';
      if (sp.accommodation) p += ' | accommodations: ' + sp.accommodation;
      p += '\n';
    });
  }

  // Appeals & disputes
  const appeals = data.appeals_and_disputes || [];
  if (appeals.length) {
    p += '\n— INSURANCE APPEALS & DISPUTES —\n';
    appeals.forEach(a => {
      p += '- ' + a.subject;
      if (a.status) p += ' (' + a.status + ')';
      if (a.date_filed) p += ' filed ' + a.date_filed;
      if (a.deadline) p += ' deadline ' + a.deadline;
      if (a.notes) p += ' — ' + a.notes;
      p += '\n';
    });
  }

  // Providers
  const providers = data.providers || [];
  if (providers.length) {
    p += '\n— HEALTHCARE PROVIDERS —\n';
    providers.forEach(pr => {
      p += '- ' + pr.name;
      if (pr.specialty) p += ' (' + pr.specialty + ')';
      if (pr.clinic) p += ' at ' + pr.clinic;
      if (pr.notes) p += ' — ' + san(pr.notes);
      p += '\n';
    });
  }

  // Upcoming appointments
  const appts = data.appts || [];
  const upcoming = appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString())).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (upcoming.length) {
    p += '\n— UPCOMING APPOINTMENTS —\n';
    upcoming.slice(0, 10).forEach(a => {
      p += '- ' + a.date;
      if (a.time) p += ' ' + a.time;
      if (a.provider) p += ' with ' + a.provider;
      if (a.location) p += ' at ' + a.location;
      if (a.reason) p += ' — ' + san(a.reason);
      if (a.questions) p += ' [questions: ' + san(a.questions) + ']';
      p += '\n';
    });
  }

  // Past appointments (last 5 with notes)
  const past = appts.filter(a => new Date(a.date) < new Date(new Date().toDateString()) && a.post_notes).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (past.length) {
    p += '\n— RECENT APPOINTMENT NOTES —\n';
    past.slice(0, 5).forEach(a => {
      p += '- ' + a.date;
      if (a.provider) p += ' with ' + a.provider;
      p += ': ' + san(a.post_notes);
      p += '\n';
    });
  }

  // Pharmacies
  const pharmacies = data.pharmacies || [];
  if (pharmacies.length) {
    p += '\n— PHARMACIES —\n';
    pharmacies.forEach(ph => {
      p += '- ' + ph.name;
      if (ph.is_preferred) p += ' (preferred)';
      if (ph.address) p += ' — ' + ph.address;
      if (ph.notes) p += ' — ' + san(ph.notes);
      p += '\n';
    });
  }

  // Insurance claims
  const claims = data.insurance_claims || [];
  if (claims.length) {
    p += '\n— INSURANCE CLAIMS —\n';
    claims.slice(0, 10).forEach(c => {
      p += '- ' + c.date + ': ' + c.description;
      if (c.provider) p += ' (' + c.provider + ')';
      if (c.status) p += ' [' + c.status + ']';
      if (c.billed_amount) p += ' billed $' + c.billed_amount;
      if (c.patient_responsibility) p += ', owed $' + c.patient_responsibility;
      p += '\n';
    });
  }

  // Cycle & fertility data
  const cycles = data.cycles || [];
  if (cycles.length) {
    p += '\n— CYCLE & FERTILITY —\n';
    const periods = cycles.filter(c => c.type === 'period').map(c => c.date).sort();
    if (periods.length) {
      const starts = [];
      let prev = null;
      for (const d of periods) {
        const dt = new Date(d + 'T00:00:00');
        if (!prev || (dt - prev) > 2 * 86400000) starts.push(d);
        prev = dt;
      }
      const lengths = [];
      for (let i = 1; i < starts.length; i++) {
        const diff = Math.round((new Date(starts[i] + 'T00:00:00') - new Date(starts[i - 1] + 'T00:00:00')) / 86400000);
        if (diff >= 18 && diff <= 45) lengths.push(diff);
      }
      const avg = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : null;
      if (avg) p += 'Average cycle length: ' + avg + ' days\n';
      if (starts.length) {
        p += 'Last period start: ' + starts[starts.length - 1] + '\n';
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const dayOfCycle = Math.floor((now - new Date(starts[starts.length - 1] + 'T00:00:00')) / 86400000) + 1;
        if (dayOfCycle > 0) p += 'Current cycle day: ' + dayOfCycle + '\n';
      }
    }
    const symptoms = cycles.filter(c => c.type === 'symptom' && c.symptom);
    if (symptoms.length) {
      const freq = {};
      symptoms.forEach(s => { freq[s.symptom] = (freq[s.symptom] || 0) + 1; });
      const common = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
      p += 'Common cycle symptoms: ' + common.join(', ') + '\n';
    }
    // Cycle-related medications
    const activeMeds = (data.meds || []).filter(m => m.active !== false);
    const cycleMeds = activeMeds.map(m => {
      const label = getCycleRelatedLabel(m);
      return label ? `${san(m.name)} (${label})` : null;
    }).filter(Boolean);
    if (cycleMeds.length) {
      p += 'Cycle-related medications: ' + cycleMeds.join(', ') + '\n';
    }
  }

  return p;
}
