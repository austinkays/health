import { VITAL_TYPES, getCycleRelatedLabel } from '../constants/defaults';

// Sanitize user-provided text to prevent prompt injection
// Higher limit for FDA data which is system-sourced, not user-authored
function san(text, limit = 500) {
  if (!text) return '';
  return String(text)
    .replace(/[<>{}\r\n\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, ' ')
    .slice(0, limit);
}

// Condense verbose FDA label text into key clinical points
function condenseFDA(fda) {
  if (!fda) return '';
  let out = '';
  if (fda.boxed_warning?.length) {
    out += ' ⚠ boxed warning: ' + san(fda.boxed_warning[0], 140);
  }
  if (fda.contraindications?.length) {
    out += ' | contraindications: ' + san(fda.contraindications[0], 100);
  }
  if (fda.drug_interactions?.length) {
    out += ' | interactions: ' + san(fda.drug_interactions[0], 100);
  }
  if (fda.adverse_reactions?.length) {
    // Extract just the first sentence or 100 chars of side effects
    const raw = san(fda.adverse_reactions[0], 120);
    const first = raw.split(/\.\s/)[0];
    out += ' | side effects: ' + (first.length < raw.length ? first + '.' : raw);
  }
  if (fda.pregnancy?.length) {
    const raw = san(fda.pregnancy[0], 80);
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

  let out = '\n,  VITALS SUMMARY , \n';
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
      return (t ? t.label : v.type) + ' ' + v.value + ' on ' + v.date + ', ' + v.notes;
    }).join('; ');
    out += '\n';
  }

  return out;
}

function sortByDateDesc(items, field = 'date') {
  return [...items].sort((a, b) => new Date(b?.[field] || 0) - new Date(a?.[field] || 0));
}

function isWithinDays(date, days) {
  if (!date) return false;
  const ts = new Date(date).getTime();
  if (isNaN(ts)) return false;
  return ts >= Date.now() - days * 86400000;
}

function firstSentence(text, limit = 140) {
  const cleaned = san(text, limit);
  if (!cleaned) return '';
  const sentence = cleaned.split(/\.\s/)[0].trim();
  return sentence && sentence.length < cleaned.length ? sentence + '.' : cleaned;
}

function summarizeJournalEntry(entry, data) {
  let line = '- ' + entry.date;
  if (entry.mood) line += ' ' + entry.mood;
  if (entry.severity) line += ' [' + entry.severity + '/10]';

  const headline = firstSentence(entry.title || entry.content || '', 140);
  if (headline) line += ' ' + headline;

  if ((entry.symptoms || []).length) {
    line += ' | symptoms: ' + entry.symptoms
      .slice(0, 4)
      .map(s => san(s.name, 32) + (s.severity ? ' ' + s.severity + '/10' : ''))
      .join(', ');
  }
  if (entry.triggers) line += ' | triggers: ' + san(entry.triggers, 90);
  if (entry.interventions) line += ' | helped: ' + san(entry.interventions, 90);

  if (entry.adherence && Object.keys(entry.adherence).length) {
    const skipped = Object.entries(entry.adherence)
      .filter(([, value]) => !value)
      .map(([id]) => {
        const med = (data.meds || []).find(m => m.id === id);
        return med ? san(m.display_name || m.name, 32) : null;
      })
      .filter(Boolean);
    if (skipped.length) line += ' | skipped: ' + skipped.slice(0, 3).join(', ');
  }

  return line + '\n';
}

export function buildProfile(data) {
  if (!data) return '(No health data available)';
  const s = data.settings || {};
  let p = '';

  if (s.name) p += 'Patient name: ' + san(s.name) + '\n';
  if (s.location) p += 'Location: ' + san(s.location) + '\n';

  // Sage Memory — persistent facts/preferences extracted from past conversations
  if (s.sage_memory) p += '\n══ SAGE MEMORY ══\nThese are facts and preferences you learned from past conversations with this user. Reference them naturally when relevant:\n' + san(s.sage_memory, 4000) + '\n';

  // About Me, personal context for form filling and AI
  const about = s.about_me || {};
  const aboutEntries = Object.entries(about).filter(([, v]) => v && String(v).trim());
  if (aboutEntries.length > 0) {
    p += '\n,  ABOUT ME , \n';
    const labels = {
      pronouns: 'Pronouns', occupation: 'Occupation', employer: 'Employer/School',
      education: 'Education', living_situation: 'Living Situation',
      relationship_status: 'Relationship Status', children: 'Children',
      religion: 'Religion/Spirituality', identities: 'Identities',
      previous_therapy: 'Previous Therapy', psych_diagnoses: 'Psychiatric Diagnoses',
      psych_hospitalizations: 'Psychiatric Hospitalizations',
      past_psych_meds: 'Past Psychiatric Medications', therapy_goals: 'Therapy Goals',
      family_mental_health: 'Family Mental Health History',
      family_substance_use: 'Family Substance Use History',
      family_medical: 'Family Medical History',
      alcohol: 'Alcohol Use', caffeine: 'Caffeine', tobacco: 'Tobacco Use',
      recreational_drugs: 'Recreational Drug Use',
      hobbies: 'Hobbies & Interests', strengths: 'Strengths',
      whats_going_well: 'What\'s Going Well', support_system: 'Support System',
      health_context: 'Health Context',
    };
    for (const [k, v] of aboutEntries) {
      p += (labels[k] || k) + ': ' + san(String(v), 240) + '\n';
    }
  }

  // Conditions first so core diagnoses are never crowded out by verbose med context
  p += '\n,  CONDITIONS & DIAGNOSES , \n';
  const conds = data.conditions || [];
  if (conds.length === 0) p += '(none)\n';
  sortByDateDesc(conds, 'diagnosed_date').forEach(c => {
    p += '- ' + c.name + ' (' + (c.status || 'active') + ')';
    if (c.diagnosed_date) p += ', diagnosed ' + c.diagnosed_date;
    if (c.provider) p += ', treated by ' + c.provider;
    if (c.linked_meds) p += ', meds: ' + san(c.linked_meds, 120);
    if (c.notes) p += ', ' + san(c.notes, 140);
    p += '\n';
  });

  // Allergies near the top for safety-critical drug context
  const allergies = data.allergies || [];
  if (allergies.length) {
    p += '\n,  ALLERGIES , \n';
    allergies.forEach(a => {
      p += '- ' + a.substance + ' (' + a.severity + ')';
      if (a.type) p += ' [type: ' + a.type + ']';
      if (a.reaction) p += ', reaction: ' + san(a.reaction, 80);
      if (a.notes) p += ', ' + san(a.notes, 100);
      p += '\n';
    });
  }

  // Surface anesthesia flags early in a compact form instead of burying them later
  const anesthesiaFlags = data.anesthesia_flags || [];
  if (anesthesiaFlags.length) {
    p += '\n,  ANESTHESIA FLAGS , \n';
    anesthesiaFlags.forEach(f => {
      p += '- ' + f.condition;
      if (f.implication) p += ': ' + san(f.implication, 120);
      if (f.action_required) p += ' -> ' + san(f.action_required, 100);
      p += '\n';
    });
  }

  // Active medications, condensed FDA data
  p += '\n,  ACTIVE MEDICATIONS , \n';
  const active = (data.meds || []).filter(m => m.active !== false);
  if (active.length === 0) p += '(none)\n';
  active.forEach(m => {
    p += '- ' + m.name;
    if (m.category && m.category !== 'medication') p += ' [' + m.category + ']';
    if (m.display_name && m.display_name !== m.name) p += ' (patient calls it: "' + san(m.display_name) + '")';
    if (m.dose) p += ' ' + m.dose;
    if (m.frequency) p += ', ' + m.frequency;
    if (m.route) p += ' (' + m.route + ')';
    if (m.fda_data?.pharm_class?.length) p += ' [class: ' + m.fda_data.pharm_class.map(c => c.replace(/ \[.*\]$/, '')).join(', ') + ']';
    if (m.fda_data?.pharm_class_moa?.length) p += ' [mechanism: ' + m.fda_data.pharm_class_moa.map(c => c.replace(/ \[.*\]$/, '')).join(', ') + ']';
    if (m.purpose) p += ', for: ' + m.purpose;
    if (m.prescriber) p += ' [prescribed by ' + m.prescriber + ']';
    p += condenseFDA(m.fda_data);
    p += '\n';
  });

  // Discontinued medications
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    p += '\n,  DISCONTINUED MEDICATIONS , \n';
    disc.forEach(m => {
      p += '- ' + m.name;
      if (m.dose) p += ' ' + m.dose;
      if (m.notes) p += ', ' + m.notes;
      p += '\n';
    });
  }

  // Vitals, aggregated summary instead of individual readings
  const vitals = data.vitals || [];
  if (vitals.length) {
    p += summarizeVitals(vitals.slice(-30));
  }

  // Labs earlier so abnormal results are available before long journal history
  const labs = data.labs || [];
  if (labs.length) {
    const abnormal = sortByDateDesc(labs.filter(l => l.flag && l.flag !== 'normal'));
    const recentNormal = sortByDateDesc(labs.filter(l => !l.flag || l.flag === 'normal')).slice(0, 5);
    if (abnormal.length) {
      p += '\n,  ABNORMAL LAB RESULTS , \n';
      abnormal.slice(0, 12).forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        p += ' [' + l.flag + ']';
        if (l.range) p += ' (ref: ' + san(l.range, 40) + ')';
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
    if (recentNormal.length) {
      p += '\n,  RECENT LAB RESULTS , \n';
      recentNormal.forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
  }

  // Recent journal entries condensed to preserve patterns without spending the whole budget here
  const journal = data.journal || [];
  if (journal.length) {
    p += '\n,  RECENT JOURNAL ENTRIES (last 15) , \n';
    sortByDateDesc(journal).slice(0, 15).forEach(e => {
      p += summarizeJournalEntry(e, data);
    });
    // Symptom frequency summary (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const recentSymptoms = {};
    journal.filter(e => e.date >= thirtyDaysAgo).forEach(e => {
      (e.symptoms || []).forEach(s => {
        if (!s.name) return;
        const key = s.name.toLowerCase();
        if (!recentSymptoms[key]) recentSymptoms[key] = { name: s.name, count: 0, totalSev: 0 };
        recentSymptoms[key].count++;
        recentSymptoms[key].totalSev += Number(s.severity) || 0;
      });
    });
    const freqList = Object.values(recentSymptoms).sort((a, b) => b.count - a.count);
    if (freqList.length) {
      p += 'Top symptoms (30d): ' + freqList.slice(0, 8).map(s => `${s.name} ×${s.count} (avg ${(s.totalSev / s.count).toFixed(1)}/10)`).join(', ') + '\n';
    }
  }

  // Insurance
  if (s.insurance_plan) {
    p += '\n,  INSURANCE , \n';
    p += 'Plan: ' + s.insurance_plan;
    if (s.insurance_id) p += ', ID: ' + s.insurance_id;
    p += '\n';
  }

  // Health background
  if (s.health_background) {
    p += '\n,  ADDITIONAL HEALTH BACKGROUND , \n' + san(s.health_background, 300) + '\n';
  }

  // Procedures: keep clinically relevant recent history, not every old procedure
  const procedures = data.procedures || [];
  if (procedures.length) {
    p += '\n,  PROCEDURES , \n';
    sortByDateDesc(procedures)
      .filter(pr => isWithinDays(pr.date, 730) || pr.outcome || pr.notes)
      .slice(0, 5)
      .forEach(pr => {
      p += '- ' + pr.name;
      if (pr.date) p += ' on ' + pr.date;
      if (pr.provider) p += ' by ' + pr.provider;
      if (pr.outcome) p += ', outcome: ' + san(pr.outcome, 100);
      if (pr.notes) p += ', ' + san(pr.notes, 100);
      p += '\n';
    });
  }

  // Immunizations: recent history only in the general profile
  const immunizations = data.immunizations || [];
  if (immunizations.length) {
    p += '\n,  IMMUNIZATIONS , \n';
    sortByDateDesc(immunizations)
      .filter(i => !i.date || isWithinDays(i.date, 365 * 3))
      .slice(0, 8)
      .forEach(i => {
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
    p += '\n,  CARE GAPS (overdue screenings/preventive care) , \n';
    careGaps.forEach(g => {
      p += '- ' + g.item;
      if (g.urgency) p += ' [' + g.urgency + ']';
      if (g.category) p += ' (' + g.category + ')';
      if (g.last_done) p += ' last done ' + g.last_done;
      if (g.notes) p += ', ' + g.notes;
      p += '\n';
    });
  }

  // Providers
  const providers = data.providers || [];
  if (providers.length) {
    p += '\n,  HEALTHCARE PROVIDERS , \n';
    providers.forEach(pr => {
      p += '- ' + pr.name;
      if (pr.specialty) p += ' (' + pr.specialty + ')';
      if (pr.clinic) p += ' at ' + pr.clinic;
      if (pr.notes) p += ', ' + san(pr.notes);
      p += '\n';
    });
  }

  // Upcoming appointments
  const appts = data.appts || [];
  const upcoming = appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString())).sort((a, b) => new Date(a.date) - new Date(b.date));
  if (upcoming.length) {
    p += '\n,  UPCOMING APPOINTMENTS , \n';
    upcoming.slice(0, 8).forEach(a => {
      p += '- ' + a.date;
      if (a.time) p += ' ' + a.time;
      if (a.provider) p += ' with ' + a.provider;
      if (a.location) p += ' at ' + a.location;
      if (a.reason) p += ', ' + san(a.reason);
      if (a.questions) p += ' [questions: ' + san(a.questions, 120) + ']';
      p += '\n';
    });
  }

  // Past appointments: keep only a compact outcome line from recent visits
  const past = appts.filter(a => new Date(a.date) < new Date(new Date().toDateString()) && a.post_notes).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (past.length) {
    p += '\n,  RECENT APPOINTMENT OUTCOMES , \n';
    past.slice(0, 3).forEach(a => {
      p += '- ' + a.date;
      if (a.provider) p += ' with ' + a.provider;
      p += ': ' + firstSentence(a.post_notes, 140);
      p += '\n';
    });
  }

  // Cycle & fertility data
  const cycles = data.cycles || [];
  if (cycles.length) {
    p += '\n,  CYCLE & FERTILITY , \n';
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

  // Pharmacogenomics
  const genetics = data.genetic_results || [];
  if (genetics.length) {
    p += '\n\u2014 PHARMACOGENOMICS \u2014\n';
    genetics.forEach(g => {
      p += '- ' + san(g.gene) + ': ' + san(g.phenotype);
      if (g.variant) p += ' (' + san(g.variant) + ')';
      const drugs = g.affected_drugs || [];
      if (drugs.length) p += ' \u2014 affects: ' + drugs.slice(0, 10).join(', ');
      p += '\n';
    });
    // Flag conflicts with current meds
    const activeMedNames = (data.meds || []).filter(m => m.active !== false).map(m => (m.display_name || m.name || '').toLowerCase());
    const conflicts = [];
    genetics.forEach(g => {
      (g.affected_drugs || []).forEach(d => {
        if (activeMedNames.some(mn => mn.includes(d) || d.includes(mn))) {
          conflicts.push(`${d} (${g.gene} ${g.phenotype})`);
        }
      });
    });
    if (conflicts.length) {
      p += 'DRUG-GENE CONFLICTS WITH CURRENT MEDS: ' + conflicts.join('; ') + '\n';
    }
  }

  // Recent activities / workouts (exclude passive tracking like "Daily Activity")
  const PASSIVE_TYPES = new Set(['Daily Activity', 'daily_activity']);
  const activities = (data.activities || []).filter(a => {
    if (!a.date) return false;
    if (PASSIVE_TYPES.has(a.type)) return false;
    // Skip very short activities (<5 min) that are just minor movements
    if (a.duration_minutes && Number(a.duration_minutes) < 5) return false;
    const d = new Date(a.date + 'T00:00:00');
    return d >= new Date(Date.now() - 30 * 86400000);
  });
  if (activities.length) {
    p += '\n,  RECENT WORKOUTS (30 days) , \n';
    p += `Total workouts: ${activities.length}\n`;
    const types = {};
    activities.forEach(a => { types[a.type] = (types[a.type] || 0) + 1; });
    const topTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5);
    p += 'Most common: ' + topTypes.map(([t, c]) => `${t} (${c}x)`).join(', ') + '\n';
    const withDur = activities.filter(a => a.duration_minutes);
    const avgDur = withDur.length ? withDur.reduce((s, a) => s + Number(a.duration_minutes), 0) / withDur.length : 0;
    if (avgDur) p += `Avg duration: ${Math.round(avgDur)} min\n`;
    const totalCal = activities.reduce((s, a) => s + (Number(a.calories) || 0), 0);
    if (totalCal > 0) p += `Total calories burned: ${Math.round(totalCal)}\n`;
  }

  // Active to-dos
  const todos = (data.todos || []).filter(t => !t.completed && (t.priority === 'high' || t.priority === 'urgent'));
  if (todos.length) {
    p += '\n,  HIGH-PRIORITY TO-DO ITEMS , \n';
    todos.forEach(t => {
      p += '- ' + san(t.title);
      if (t.priority && t.priority !== 'low') p += ' [' + t.priority + ']';
      if (t.due_date) p += ' due ' + t.due_date;
      if (t.category && t.category !== 'custom') p += ' (' + t.category + ')';
      if (t.notes) p += ', ' + san(t.notes, 200);
      p += '\n';
    });
  }

  return p;
}
