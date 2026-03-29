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

// ── Generic CRUD factory ──
function crud(table, { orderBy = 'created_at', ascending = true } = {}) {
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
      const { data, error } = await supabase
        .from(table)
        .insert({ ...item, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return clean(data);
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

  // New comprehensive sections
  labs: crud('labs', { orderBy: 'date', ascending: false }),
  procedures: crud('procedures', { orderBy: 'date', ascending: false }),
  immunizations: crud('immunizations', { orderBy: 'date', ascending: false }),
  care_gaps: crud('care_gaps'),
  anesthesia_flags: crud('anesthesia_flags'),
  appeals_and_disputes: crud('appeals_and_disputes', { orderBy: 'date_filed', ascending: false }),
  surgical_planning: crud('surgical_planning'),
  insurance: crud('insurance'),

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

  // Load all data at once (initial hydration)
  async loadAll() {
    const [
      profile, meds, conditions, allergies, providers,
      vitals, appts, journal,
      labs, procedures, immunizations, care_gaps,
      anesthesia_flags, appeals_and_disputes, surgical_planning, insurance,
    ] = await Promise.all([
      db.profile.get(),
      db.medications.list(),
      db.conditions.list(),
      db.allergies.list(),
      db.providers.list(),
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
    ]);

    return {
      settings: profile,
      meds, conditions, allergies, providers,
      vitals, appts, journal,
      labs, procedures, immunizations, care_gaps,
      anesthesia_flags, appeals_and_disputes, surgical_planning, insurance,
    };
  },

  // Erase all user data
  async eraseAll() {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user.id;
    await Promise.all([
      supabase.from('medications').delete().eq('user_id', uid),
      supabase.from('conditions').delete().eq('user_id', uid),
      supabase.from('allergies').delete().eq('user_id', uid),
      supabase.from('providers').delete().eq('user_id', uid),
      supabase.from('vitals').delete().eq('user_id', uid),
      supabase.from('appointments').delete().eq('user_id', uid),
      supabase.from('journal_entries').delete().eq('user_id', uid),
      supabase.from('ai_conversations').delete().eq('user_id', uid),
      supabase.from('labs').delete().eq('user_id', uid),
      supabase.from('procedures').delete().eq('user_id', uid),
      supabase.from('immunizations').delete().eq('user_id', uid),
      supabase.from('care_gaps').delete().eq('user_id', uid),
      supabase.from('anesthesia_flags').delete().eq('user_id', uid),
      supabase.from('appeals_and_disputes').delete().eq('user_id', uid),
      supabase.from('surgical_planning').delete().eq('user_id', uid),
      supabase.from('insurance').delete().eq('user_id', uid),
      supabase.from('profiles').update({
        name: '', location: '', pharmacy: '',
        insurance_plan: '', insurance_id: '', insurance_group: '', insurance_phone: '',
        health_background: '', ai_health_summary: '', ai_summary_updated_at: null,
        ai_mode: 'onDemand',
      }).eq('id', uid),
    ]);
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
