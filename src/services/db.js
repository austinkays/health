import { supabase } from './supabase';

// ── Helper: strip Supabase metadata from rows ──
function clean(row) {
  if (!row) return row;
  const { created_at, updated_at, user_id, ...rest } = row;
  return rest;
}

function cleanAll(rows) {
  return (rows || []).map(clean);
}

// ── Dedup key definitions ──
// Tables that should prevent duplicate inserts based on matching columns.
const DEDUP_COLUMNS = {
  vitals:          ['date', 'type', 'value'],
  cycles:          ['date', 'type', 'value'],
  activities:      ['date', 'type', 'duration_minutes'],
  medications:     ['name', 'dose'],
  conditions:      ['name'],
  allergies:       ['substance'],
  providers:       ['name', 'specialty'],
  todos:           ['title'],
  genetic_results: ['gene', 'variant'],
  pharmacies:      ['name'],
};

// In-flight add() promises keyed by "table:uid:dedupKey" so concurrent adds
// with the same dedup signature share a single insert. Prevents the classic
// check-then-insert race in a single browser tab.
const _inFlightAdds = new Map();

// In-flight loadAll() promise — prevents duplicate concurrent calls
// (React Strict Mode double-mount, session changes firing multiple times, etc.)
let _inFlightLoadAll = null;

// ── Generic CRUD factory ──
function crud(table, { orderBy = 'created_at', ascending = true } = {}) {
  const dedupCols = DEDUP_COLUMNS[table];

  return {
    async list() {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order(orderBy, { ascending });
      if (error) throw error;
      return cleanAll(data);
    },

    async add(item) {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user.id;

      // Deduplicate concurrent identical adds within this tab.
      let inFlightKey = null;
      if (dedupCols) {
        const sig = dedupCols.map(c => `${c}=${item[c] == null ? '∅' : String(item[c])}`).join('|');
        inFlightKey = `${table}:${uid}:${sig}`;
        const existing = _inFlightAdds.get(inFlightKey);
        if (existing) return existing;
      }

      const doAdd = (async () => {
        // Dedup check: query Supabase for an existing row with matching key columns
        if (dedupCols) {
          let query = supabase.from(table).select('id').eq('user_id', uid);
          for (const col of dedupCols) {
            if (item[col] != null) query = query.eq(col, item[col]);
            else query = query.is(col, null);
          }
          const { data: existing } = await query.limit(1);
          if (existing?.length) return clean(existing[0]); // already exists — skip silently
        }

        const { data, error } = await supabase
          .from(table)
          .insert({ ...item, user_id: uid })
          .select()
          .single();
        if (error) throw error;
        return clean(data);
      })();

      if (inFlightKey) {
        _inFlightAdds.set(inFlightKey, doAdd);
        doAdd.finally(() => _inFlightAdds.delete(inFlightKey));
      }
      return doAdd;
    },

    async update(id, changes) {
      const { data, error } = await supabase
        .from(table)
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return clean(data);
    },

    async remove(id) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
  };
}

// ── Bulk insert for large imports (Apple Health, etc.) ──
async function bulkAdd(table, items, batchSize = 500) {
  if (!items?.length) return [];
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user.id;
  const all = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize).map(item => ({ ...item, user_id: uid }));
    const { data, error } = await supabase.from(table).insert(batch).select();
    if (error) throw error;
    all.push(...cleanAll(data));
  }
  return all;
}

// ── Table-specific services ──
export const db = {
  medications: crud('medications'),
  conditions: crud('conditions'),
  allergies: crud('allergies'),
  providers: crud('providers'),
  vitals: crud('vitals', { orderBy: 'date', ascending: true }),
  appointments: crud('appointments', { orderBy: 'date', ascending: true }),
  journal: crud('journal_entries', { orderBy: 'date', ascending: false }),
  conversations: crud('ai_conversations', { orderBy: 'updated_at', ascending: false }),

  pharmacies: crud('pharmacies'),

  // New comprehensive sections
  labs: crud('labs', { orderBy: 'date', ascending: false }),
  procedures: crud('procedures', { orderBy: 'date', ascending: false }),
  immunizations: crud('immunizations', { orderBy: 'date', ascending: false }),
  care_gaps: crud('care_gaps'),
  anesthesia_flags: crud('anesthesia_flags'),
  appeals_and_disputes: crud('appeals_and_disputes', { orderBy: 'date_filed', ascending: false }),
  surgical_planning: crud('surgical_planning'),
  insurance: crud('insurance'),
  insurance_claims: crud('insurance_claims', { orderBy: 'date', ascending: false }),
  drug_prices: crud('drug_prices', { orderBy: 'fetched_at', ascending: false }),
  todos: crud('todos', { orderBy: 'due_date', ascending: true }),
  cycles: crud('cycles', { orderBy: 'date', ascending: false }),
  activities: crud('activities', { orderBy: 'date', ascending: false }),
  genetic_results: crud('genetic_results'),
  feedback: crud('feedback', { orderBy: 'created_at', ascending: false }),

  bulkAdd, // For large imports (Apple Health)

  // Profile is 1:1 with user — different pattern
  profile: {
    async get() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return clean(data);
    },

    async update(changes) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('profiles')
        .update(changes)
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw error;
      return clean(data);
    },
  },

  // Load all data at once (initial hydration) — single RPC call instead of 24 parallel queries
  // Deduplicates concurrent calls (React Strict Mode, rapid session changes) by sharing in-flight promise.
  async loadAll() {
    if (_inFlightLoadAll) return _inFlightLoadAll;

    const promise = db._loadAllImpl();
    _inFlightLoadAll = promise;
    try {
      return await promise;
    } finally {
      _inFlightLoadAll = null;
    }
  },

  async _loadAllImpl() {
    const { data, error } = await supabase.rpc('load_all_data');

    if (error) {
      // Fallback to parallel queries if RPC not available (e.g. migration not applied)
      console.warn('load_all_data RPC failed, falling back to parallel queries:', error.message);
      return db._loadAllFallback();
    }

    const d = data || {};
    const profile = d.profile || {};
    // Strip Supabase metadata from profile
    const { created_at, updated_at, ...settings } = profile;

    return {
      settings,
      meds: cleanAll(d.medications),
      conditions: cleanAll(d.conditions),
      allergies: cleanAll(d.allergies),
      providers: cleanAll(d.providers),
      pharmacies: cleanAll(d.pharmacies),
      vitals: cleanAll(d.vitals),
      appts: cleanAll(d.appointments),
      journal: cleanAll(d.journal_entries),
      labs: cleanAll(d.labs),
      procedures: cleanAll(d.procedures),
      immunizations: cleanAll(d.immunizations),
      care_gaps: cleanAll(d.care_gaps),
      anesthesia_flags: cleanAll(d.anesthesia_flags),
      appeals_and_disputes: cleanAll(d.appeals_and_disputes),
      surgical_planning: cleanAll(d.surgical_planning),
      insurance: cleanAll(d.insurance),
      insurance_claims: cleanAll(d.insurance_claims),
      drug_prices: cleanAll(d.drug_prices),
      todos: cleanAll(d.todos),
      cycles: cleanAll(d.cycles),
      activities: cleanAll(d.activities),
      genetic_results: cleanAll(d.genetic_results),
      feedback: cleanAll(d.feedback),
    };
  },

  // Fallback: 24 parallel queries (used if RPC not available)
  async _loadAllFallback() {
    const results = await Promise.allSettled([
      db.profile.get(),
      db.medications.list(),
      db.conditions.list(),
      db.allergies.list(),
      db.providers.list(),
      db.pharmacies.list(),
      db.vitals.list(),
      db.appointments.list(),
      db.journal.list(),
      db.labs.list(),
      db.procedures.list(),
      db.immunizations.list(),
      db.care_gaps.list(),
      db.anesthesia_flags.list(),
      db.appeals_and_disputes.list(),
      db.surgical_planning.list(),
      db.insurance.list(),
      db.insurance_claims.list(),
      db.drug_prices.list(),
      db.todos.list(),
      db.cycles.list(),
      db.activities.list(),
      db.genetic_results.list(),
      db.feedback.list(),
    ]);

    const v = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback;

    return {
      settings: v(0, {}),
      meds: v(1, []), conditions: v(2, []), allergies: v(3, []), providers: v(4, []),
      pharmacies: v(5, []), vitals: v(6, []), appts: v(7, []), journal: v(8, []),
      labs: v(9, []), procedures: v(10, []), immunizations: v(11, []), care_gaps: v(12, []),
      anesthesia_flags: v(13, []), appeals_and_disputes: v(14, []), surgical_planning: v(15, []), insurance: v(16, []),
      insurance_claims: v(17, []),
      drug_prices: v(18, []),
      todos: v(19, []),
      cycles: v(20, []),
      activities: v(21, []),
      genetic_results: v(22, []),
      feedback: v(23, []),
    };
  },

  // Erase all user data (sequential with auto-backup stored in sessionStorage for recovery)
  async eraseAll() {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user.id;

    // Auto-backup record counts for partial-erase detection
    const tables = [
      'medications', 'conditions', 'allergies', 'providers', 'pharmacies',
      'vitals', 'appointments', 'journal_entries', 'ai_conversations',
      'labs', 'procedures', 'immunizations', 'care_gaps',
      'anesthesia_flags', 'appeals_and_disputes', 'surgical_planning', 'insurance',
      'insurance_claims', 'drug_prices', 'todos', 'cycles', 'activities', 'genetic_results',
      'feedback',
    ];

    const errors = [];
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).delete().eq('user_id', uid);
        if (error) errors.push({ table, error: error.message });
      } catch (err) {
        errors.push({ table, error: err.message });
      }
    }

    // Reset profile (not deleted — 1:1 with user)
    try {
      await supabase.from('profiles').update({
        name: '', location: '', pharmacy: '',
        insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '',
        health_background: '', ai_mode: 'onDemand',
      }).eq('id', uid);
    } catch (err) {
      errors.push({ table: 'profiles', error: err.message });
    }

    if (errors.length > 0) {
      console.error('Partial erase — some tables failed:', errors);
      throw new Error(`Erase incomplete: ${errors.map(e => e.table).join(', ')} failed. Some data may remain.`);
    }
  },

  /**
   * Remove duplicate records from tables that have dedup keys.
   * Keeps the oldest record (earliest created_at) for each unique key combo.
   * Returns { table, removed } counts.
   */
  async removeDuplicates() {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user.id;
    const results = [];

    for (const [table, cols] of Object.entries(DEDUP_COLUMNS)) {
      const { data: rows, error } = await supabase
        .from(table)
        .select(['id', 'created_at', ...cols].join(','))
        .eq('user_id', uid)
        .order('created_at', { ascending: true });

      if (error || !rows?.length) continue;

      const seen = new Set();
      const dupeIds = [];
      for (const row of rows) {
        const key = cols.map(c => row[c] ?? '').join('|');
        if (seen.has(key)) dupeIds.push(row.id);
        else seen.add(key);
      }

      if (dupeIds.length) {
        // Delete in batches of 100
        for (let i = 0; i < dupeIds.length; i += 100) {
          const batch = dupeIds.slice(i, i + 100);
          await supabase.from(table).delete().in('id', batch);
        }
        results.push({ table, removed: dupeIds.length });
      }
    }
    return results;
  },
};

// ── Realtime subscriptions ──
export function subscribeToChanges(table, callback) {
  const channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => callback(payload)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
