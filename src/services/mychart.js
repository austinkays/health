// MyChart / Epic CCDA (Consolidated Clinical Document Architecture) parser
// CCDA is HL7's C-CDA R2 XML standard. Every US hospital on Epic (most of them)
// lets patients download their records as a CCDA file via MyChart → Medical Records
// → Document Center → Visit Records / Request Records. This parser maps the
// standard LOINC-coded sections into Salve's tables.
//
// Typical file sizes: 100KB–5MB (way smaller than Apple Health's 200MB exports),
// so we use DOMParser directly rather than chunked regex. Very tolerant to
// vendor variations — any section it doesn't understand gets skipped silently.

// ── Standard LOINC section codes ─────────────────────────
const SECTION_CODES = {
  problems:      '11450-4', // Problem list
  medications:   '10160-0', // History of medication use
  allergies:     '48765-2', // Allergies and adverse reactions
  immunizations: '11369-6', // History of immunizations
  labs:          '30954-2', // Relevant diagnostic tests / results
  vital_signs:   '8716-3',  // Vital signs
  procedures:    '47519-4', // History of procedures
  encounters:    '46240-8', // Encounters
};

// ── Vital signs LOINC codes → Salve vital type ──────────
const VITAL_CODE_MAP = {
  '8480-6':  'bp_sys',   // Systolic BP
  '8462-4':  'bp_dia',   // Diastolic BP
  '8867-4':  'hr',       // Heart rate
  '8310-5':  'temp',     // Body temperature
  '8331-1':  'temp',     // Oral temperature
  '2708-6':  'spo2',     // Oxygen saturation
  '59408-5': 'spo2',     // SpO2 (alt code)
  '29463-7': 'weight',   // Body weight
  '3141-9':  'weight',   // Measured body weight
  '9279-1':  'resp',     // Respiratory rate
  '2339-0':  'glucose',  // Glucose (blood)
  '2345-7':  'glucose',  // Glucose (serum/plasma)
};

/* ── DOM walking utilities (namespace-agnostic via localName) ─ */

function child(node, localName) {
  if (!node) return null;
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].localName === localName) return node.children[i];
  }
  return null;
}

function children(node, localName) {
  if (!node) return [];
  const out = [];
  for (let i = 0; i < node.children.length; i++) {
    if (node.children[i].localName === localName) out.push(node.children[i]);
  }
  return out;
}

function descendant(node, localName) {
  if (!node) return null;
  if (node.localName === localName) return node;
  for (let i = 0; i < node.children.length; i++) {
    const found = descendant(node.children[i], localName);
    if (found) return found;
  }
  return null;
}

function descendants(node, localName) {
  const out = [];
  if (!node) return out;
  function walk(n) {
    for (let i = 0; i < n.children.length; i++) {
      if (n.children[i].localName === localName) out.push(n.children[i]);
      walk(n.children[i]);
    }
  }
  walk(node);
  return out;
}

function textOf(node) {
  return node ? (node.textContent || '').trim().replace(/\s+/g, ' ') : '';
}

// HL7 v3 date format: YYYYMMDDHHMMSS+ZZZZ → YYYY-MM-DD
function parseHL7Date(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})(\d{2})?(\d{2})?/);
  if (!m) return '';
  return `${m[1]}-${m[2] || '01'}-${m[3] || '01'}`;
}

// Pull the start date from an element's effectiveTime (low child or value attr)
function getStartDate(elem) {
  const eff = child(elem, 'effectiveTime');
  if (!eff) return '';
  const low = child(eff, 'low');
  if (low) return parseHL7Date(low.getAttribute('value'));
  const v = eff.getAttribute('value');
  if (v) return parseHL7Date(v);
  return '';
}

/* ── Section discovery ────────────────────────────────── */

function findSections(root) {
  const map = {};
  const all = descendants(root, 'section');
  for (const sec of all) {
    const codeEl = child(sec, 'code');
    if (!codeEl) continue;
    const code = codeEl.getAttribute('code');
    if (code && !map[code]) map[code] = sec;
  }
  return map;
}

/* ── Per-section extractors ───────────────────────────── */

// Problems section → conditions
function parseProblems(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    // The actual diagnosis lives in a nested observation's <value> element.
    // Walk observations inside the entry and grab the first one with a value.
    const observations = descendants(entry, 'observation');
    for (const obs of observations) {
      const valueEl = child(obs, 'value');
      if (!valueEl) continue;
      const name = valueEl.getAttribute('displayName')
        || textOf(child(valueEl, 'originalText'))
        || textOf(valueEl);
      if (!name || name.length < 2) continue;

      const diagnosed_date = getStartDate(obs);

      // Status: completed / aborted → resolved. Everything else → active.
      let status = 'active';
      const statusEl = child(obs, 'statusCode');
      const sc = statusEl?.getAttribute('code');
      if (sc === 'completed' || sc === 'aborted') status = 'resolved';

      out.push({
        name: name.trim(),
        diagnosed_date,
        status,
        provider: '',
        linked_meds: '',
        notes: '',
      });
      break; // one problem per entry
    }
  }
  return out;
}

// Medications section
function parseMedications(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    const subAdmin = descendant(entry, 'substanceAdministration');
    if (!subAdmin) continue;

    // Drug name: consumable → manufacturedProduct → manufacturedMaterial → code
    const material = descendant(subAdmin, 'manufacturedMaterial');
    const codeEl = material ? child(material, 'code') : null;
    let name = codeEl?.getAttribute('displayName')
      || textOf(child(codeEl || {}, 'originalText'))
      || textOf(descendant(material || subAdmin, 'name'));
    if (!name) continue;
    name = name.trim();

    const start_date = getStartDate(subAdmin);

    // Route
    const routeEl = child(subAdmin, 'routeCode');
    const route = routeEl?.getAttribute('displayName') || '';

    // Dose quantity
    let dose = '';
    const doseEl = child(subAdmin, 'doseQuantity');
    if (doseEl) {
      const v = doseEl.getAttribute('value');
      const u = doseEl.getAttribute('unit');
      if (v) dose = u && u !== '1' ? `${v} ${u}` : v;
    }

    // Frequency from PIVL_TS effectiveTime → period
    let frequency = '';
    const effs = children(subAdmin, 'effectiveTime');
    for (const eff of effs) {
      const xsiType = eff.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') || '';
      if (!xsiType.includes('PIVL')) continue;
      const period = child(eff, 'period');
      if (!period) continue;
      const v = parseFloat(period.getAttribute('value'));
      const u = period.getAttribute('unit');
      if (!v || !u) continue;
      if (u === 'h' && v === 24) frequency = 'Daily';
      else if (u === 'h' && v === 12) frequency = 'Twice daily';
      else if (u === 'h' && v === 8) frequency = 'Three times daily';
      else if (u === 'h' && v === 6) frequency = 'Four times daily';
      else if (u === 'h') frequency = `Every ${v} hours`;
      else if (u === 'd' && v === 1) frequency = 'Daily';
      else if (u === 'd') frequency = `Every ${v} days`;
      else if (u === 'wk') frequency = v === 1 ? 'Weekly' : `Every ${v} weeks`;
      break;
    }

    // Active flag: completed/aborted → not active
    const statusEl = child(subAdmin, 'statusCode');
    const sc = statusEl?.getAttribute('code');
    const active = sc !== 'completed' && sc !== 'aborted';

    out.push({
      name,
      dose,
      frequency,
      route,
      prescriber: '',
      pharmacy: '',
      purpose: '',
      start_date,
      active,
      notes: '',
    });
  }
  return out;
}

// Allergies section
function parseAllergies(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    const observations = descendants(entry, 'observation');
    let substance = '';
    let reaction = '';
    let severity = 'moderate';

    for (const obs of observations) {
      // Allergen name: participant → participantRole → playingEntity → code
      if (!substance) {
        const participant = descendant(obs, 'participant');
        if (participant) {
          const pe = descendant(participant, 'playingEntity');
          if (pe) {
            const pcode = child(pe, 'code');
            substance = pcode?.getAttribute('displayName')
              || textOf(child(pcode || {}, 'originalText'))
              || textOf(descendant(pe, 'name'))
              || '';
          }
        }
      }

      // Reaction / severity: nested entryRelationship observations
      const entryRels = children(obs, 'entryRelationship');
      for (const er of entryRels) {
        const inner = descendant(er, 'observation');
        if (!inner) continue;
        const valueEl = child(inner, 'value');
        if (!valueEl) continue;
        const n = valueEl.getAttribute('displayName') || textOf(valueEl);
        if (!n) continue;
        if (/severe|life.?threatening|fatal/i.test(n)) severity = 'severe';
        else if (/\bmild\b/i.test(n)) severity = 'mild';
        else if (/moderate/i.test(n)) severity = 'moderate';
        else reaction = reaction ? `${reaction}, ${n}` : n;
      }
    }

    if (substance) {
      out.push({ substance: substance.trim(), reaction, severity, notes: '' });
    }
  }
  return out;
}

// Immunizations section
function parseImmunizations(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    const subAdmin = descendant(entry, 'substanceAdministration');
    if (!subAdmin) continue;

    const material = descendant(subAdmin, 'manufacturedMaterial');
    const codeEl = material ? child(material, 'code') : null;
    const name = codeEl?.getAttribute('displayName')
      || textOf(child(codeEl || {}, 'originalText'))
      || '';
    if (!name) continue;

    const date = getStartDate(subAdmin);

    let dose = '';
    const doseEl = child(subAdmin, 'doseQuantity');
    if (doseEl) {
      const v = doseEl.getAttribute('value');
      const u = doseEl.getAttribute('unit');
      if (v) dose = u && u !== '1' ? `${v} ${u}` : v;
    }

    const siteEl = child(subAdmin, 'approachSiteCode');
    const site = siteEl?.getAttribute('displayName') || '';

    const lotNode = material ? descendant(material, 'lotNumberText') : null;
    const lot_number = textOf(lotNode);

    out.push({
      date,
      name: name.trim(),
      dose,
      site,
      lot_number,
      provider: '',
      location: '',
    });
  }
  return out;
}

// Labs / results section
function parseLabs(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    // Most lab panels group individual results under an organizer
    const organizer = descendant(entry, 'organizer');
    const container = organizer || entry;
    const comps = children(container, 'component');
    const observations = comps.length
      ? comps.map(c => descendant(c, 'observation')).filter(Boolean)
      : descendants(entry, 'observation');

    for (const obs of observations) {
      const codeEl = child(obs, 'code');
      const test_name = codeEl?.getAttribute('displayName')
        || textOf(child(codeEl || {}, 'originalText'))
        || '';
      if (!test_name) continue;

      const valueEl = child(obs, 'value');
      if (!valueEl) continue;

      // Physical quantity value/unit, otherwise coded displayName, otherwise text
      let result = '';
      let unit = '';
      const v = valueEl.getAttribute('value');
      const u = valueEl.getAttribute('unit');
      if (v != null) {
        result = v;
        unit = u && u !== '1' ? u : '';
      } else {
        result = valueEl.getAttribute('displayName') || textOf(valueEl);
      }
      if (!result) continue;

      // Reference range
      let range = '';
      const refRange = descendant(obs, 'referenceRange');
      if (refRange) {
        const observationRange = descendant(refRange, 'observationRange');
        const textEl = descendant(observationRange || refRange, 'text');
        if (textEl) {
          range = textOf(textEl);
        } else {
          const rValueEl = child(observationRange || refRange, 'value');
          if (rValueEl) {
            const low = child(rValueEl, 'low');
            const high = child(rValueEl, 'high');
            const l = low?.getAttribute('value');
            const h = high?.getAttribute('value');
            if (l && h) range = `${l}-${h}`;
          }
        }
      }

      // Interpretation flag
      let flag = '';
      const interpEl = child(obs, 'interpretationCode');
      const interp = interpEl?.getAttribute('code') || '';
      if (interp === 'H' || interp === 'HH') flag = 'high';
      else if (interp === 'L' || interp === 'LL') flag = 'low';
      else if (interp === 'A' || interp === 'AA') flag = 'abnormal';
      else if (interp === 'N') flag = 'normal';

      const date = getStartDate(obs) || getStartDate(container);

      out.push({
        date,
        test_name: test_name.trim(),
        result: String(result).trim(),
        unit,
        range,
        flag,
        provider: 'MyChart',
        notes: '',
      });
    }
  }
  return out;
}

// Vital signs section
function parseVitalSigns(section) {
  const rawBP = {}; // { date: { sys, dia } }
  const out = [];
  const entries = children(section, 'entry');

  for (const entry of entries) {
    const organizer = descendant(entry, 'organizer');
    const container = organizer || entry;
    const comps = children(container, 'component');
    const observations = comps.length
      ? comps.map(c => descendant(c, 'observation')).filter(Boolean)
      : descendants(entry, 'observation');

    for (const obs of observations) {
      const codeEl = child(obs, 'code');
      const code = codeEl?.getAttribute('code');
      const vType = VITAL_CODE_MAP[code];
      if (!vType) continue;

      const valueEl = child(obs, 'value');
      if (!valueEl) continue;
      const v = parseFloat(valueEl.getAttribute('value'));
      if (!isFinite(v)) continue;
      const unit = valueEl.getAttribute('unit') || '';
      const date = getStartDate(obs) || getStartDate(container);
      if (!date) continue;

      if (vType === 'bp_sys' || vType === 'bp_dia') {
        rawBP[date] = rawBP[date] || {};
        if (vType === 'bp_sys') rawBP[date].sys = v;
        else rawBP[date].dia = v;
        continue;
      }

      // Unit conversions
      let finalValue = v;
      let finalUnit = unit;
      if (vType === 'temp' && /cel|°C|degC/i.test(unit)) {
        finalValue = +(v * 9 / 5 + 32).toFixed(1);
        finalUnit = '°F';
      } else if (vType === 'weight' && /kg/i.test(unit)) {
        finalValue = +(v * 2.20462).toFixed(1);
        finalUnit = 'lbs';
      } else if (vType === 'weight' && /g$/i.test(unit) && !/kg/i.test(unit)) {
        finalValue = +(v / 453.592).toFixed(1);
        finalUnit = 'lbs';
      }

      out.push({
        date,
        type: vType,
        value: String(finalValue),
        value2: '',
        unit: finalUnit,
        notes: '',
        source: 'mychart',
      });
    }
  }

  // Pair up systolic + diastolic into a single bp row
  for (const [date, bp] of Object.entries(rawBP)) {
    if (bp.sys && bp.dia) {
      out.push({
        date,
        type: 'bp',
        value: String(bp.sys),
        value2: String(bp.dia),
        unit: 'mmHg',
        notes: '',
        source: 'mychart',
      });
    }
  }

  return out;
}

// Procedures section
function parseProcedures(section) {
  const out = [];
  const entries = children(section, 'entry');
  for (const entry of entries) {
    const proc = descendant(entry, 'procedure')
      || descendant(entry, 'act')
      || descendant(entry, 'observation');
    if (!proc) continue;
    const codeEl = child(proc, 'code');
    const name = codeEl?.getAttribute('displayName')
      || textOf(child(codeEl || {}, 'originalText'))
      || '';
    if (!name) continue;
    const date = getStartDate(proc);
    out.push({
      date,
      name: name.trim(),
      type: '',
      provider: '',
      location: '',
      reason: '',
      outcome: '',
      notes: '',
    });
  }
  return out;
}

// Providers from document <author> / <performer> / <documentationOf>
function parseProviders(root) {
  const out = [];
  const seen = new Set();

  const extract = (elem) => {
    const assigned = descendant(elem, 'assignedPerson') || descendant(elem, 'assignedEntity');
    if (!assigned) return;
    const nameEl = descendant(assigned, 'name');
    const name = textOf(nameEl);
    if (!name) return;

    const org = descendant(elem, 'representedOrganization');
    const clinic = org ? textOf(descendant(org, 'name')) : '';

    const key = `${name.toLowerCase()}|${clinic.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Phone
    const telecom = descendant(elem, 'telecom');
    const tel = telecom?.getAttribute('value') || '';
    const phone = tel.replace(/^tel:/i, '').replace(/^fax:/i, '');

    out.push({
      name,
      specialty: '',
      clinic,
      phone,
      fax: '',
      portal_url: '',
      notes: 'Imported from MyChart',
    });
  };

  for (const author of descendants(root, 'author').slice(0, 10)) extract(author);
  for (const perf of descendants(root, 'performer').slice(0, 20)) extract(perf);

  return out;
}

/* ── Public API ──────────────────────────────────────── */

export function detectCCDA(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 4000);
  if (!head.includes('ClinicalDocument')) return false;
  // Namespace is urn:hl7-org:v3 but some vendors use HL7 shortforms
  return head.includes('urn:hl7-org:v3') || head.includes('hl7-org');
}

export function parseCCDA(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('CCDA parser expected an XML string');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    const msg = (parserError.textContent || 'Invalid XML').slice(0, 200);
    throw new Error(`Could not parse XML: ${msg}`);
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'ClinicalDocument') {
    throw new Error('This does not look like a MyChart / CCDA export. The root element should be <ClinicalDocument>.');
  }

  const sections = findSections(root);

  const conditions    = sections[SECTION_CODES.problems]      ? parseProblems(sections[SECTION_CODES.problems])           : [];
  const medications   = sections[SECTION_CODES.medications]   ? parseMedications(sections[SECTION_CODES.medications])     : [];
  const allergies     = sections[SECTION_CODES.allergies]     ? parseAllergies(sections[SECTION_CODES.allergies])         : [];
  const immunizations = sections[SECTION_CODES.immunizations] ? parseImmunizations(sections[SECTION_CODES.immunizations]) : [];
  const labs          = sections[SECTION_CODES.labs]          ? parseLabs(sections[SECTION_CODES.labs])                   : [];
  const vitals        = sections[SECTION_CODES.vital_signs]   ? parseVitalSigns(sections[SECTION_CODES.vital_signs])      : [];
  const procedures    = sections[SECTION_CODES.procedures]    ? parseProcedures(sections[SECTION_CODES.procedures])       : [];
  const providers     = parseProviders(root);

  return {
    conditions,
    medications,
    allergies,
    immunizations,
    labs,
    vitals,
    procedures,
    providers,
    counts: {
      conditions: conditions.length,
      medications: medications.length,
      allergies: allergies.length,
      immunizations: immunizations.length,
      labs: labs.length,
      vitals: vitals.length,
      procedures: procedures.length,
      providers: providers.length,
    },
  };
}

/* ── Dedup keys (case-insensitive, trim) ─────────────── */

const norm = (s) => (s || '').toString().toLowerCase().trim();

export const MYCHART_DEDUP_KEYS = {
  conditions:    r => norm(r.name),
  medications:   r => `${norm(r.name)}|${norm(r.dose)}`,
  allergies:     r => norm(r.substance),
  immunizations: r => `${r.date}|${norm(r.name)}`,
  labs:          r => `${r.date}|${norm(r.test_name)}|${norm(r.result)}`,
  vitals:        r => `${r.date}|${r.type}|${r.value}`,
  procedures:    r => `${r.date}|${norm(r.name)}`,
  providers:     r => `${norm(r.name)}|${norm(r.clinic)}`,
};

export function deduplicateAgainst(newRecords, existing, keyFn) {
  const existingKeys = new Set((existing || []).map(keyFn));
  return newRecords.filter(r => !existingKeys.has(keyFn(r)));
}
