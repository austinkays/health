// Anthropic tool definitions for AI-powered data control via chat
// These tools let the AI modify health data through natural language commands.

export const HEALTH_TOOLS = [
  {
    name: 'add_medication',
    description: 'Add a new medication to the patient\'s medication list.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Official medication name (e.g. "Lexapro", "Metformin 500mg")' },
        display_name: { type: 'string', description: 'Optional casual/friendly name the patient uses (e.g. "my morning pill")' },
        dose: { type: 'string', description: 'Dosage (e.g. "10mg", "500mg")' },
        frequency: { type: 'string', description: 'How often taken (e.g. "once daily", "twice daily", "as needed")' },
        route: { type: 'string', description: 'How administered (e.g. "Oral", "Topical", "Injection")' },
        prescriber: { type: 'string', description: 'Prescribing provider name' },
        pharmacy: { type: 'string', description: 'Pharmacy name' },
        purpose: { type: 'string', description: 'What the medication is for' },
        start_date: { type: 'string', description: 'Date started (YYYY-MM-DD)' },
        refill_date: { type: 'string', description: 'Next refill date (YYYY-MM-DD)' },
        active: { type: 'boolean', description: 'Whether currently taking this medication (default true)' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_medication',
    description: 'Update an existing medication. Use list_records or search_records first to find the medication ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The medication record ID (UUID)' },
        name: { type: 'string' },
        display_name: { type: 'string' },
        dose: { type: 'string' },
        frequency: { type: 'string' },
        route: { type: 'string' },
        prescriber: { type: 'string' },
        pharmacy: { type: 'string' },
        purpose: { type: 'string' },
        start_date: { type: 'string' },
        refill_date: { type: 'string' },
        active: { type: 'boolean' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_medication',
    description: 'Remove a medication from the patient\'s list. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The medication record ID (UUID)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_condition',
    description: 'Add a new condition or diagnosis.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Condition name (e.g. "Type 2 Diabetes", "GERD")' },
        diagnosed_date: { type: 'string', description: 'Date diagnosed (YYYY-MM-DD)' },
        status: { type: 'string', enum: ['active', 'managed', 'remission', 'resolved'], description: 'Current status' },
        provider: { type: 'string', description: 'Diagnosing provider name' },
        linked_meds: { type: 'string', description: 'Comma-separated related medication names' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_condition',
    description: 'Update an existing condition. Use list_records or search_records first to find the condition ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The condition record ID (UUID)' },
        name: { type: 'string' },
        diagnosed_date: { type: 'string' },
        status: { type: 'string', enum: ['active', 'managed', 'remission', 'resolved'] },
        provider: { type: 'string' },
        linked_meds: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_condition',
    description: 'Remove a condition. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The condition record ID (UUID)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_allergy',
    description: 'Add a new allergy.',
    input_schema: {
      type: 'object',
      properties: {
        substance: { type: 'string', description: 'Allergen (e.g. "Penicillin", "Peanuts", "Latex")' },
        reaction: { type: 'string', description: 'Reaction description (e.g. "Hives", "Anaphylaxis")' },
        severity: { type: 'string', enum: ['mild', 'moderate', 'severe'], description: 'Severity level' },
        type: { type: 'string', enum: ['medication', 'food', 'environmental', 'latex', 'dye', 'insect', 'other'], description: 'Allergy category' },
        notes: { type: 'string' },
      },
      required: ['substance'],
    },
  },
  {
    name: 'remove_allergy',
    description: 'Remove an allergy. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The allergy record ID (UUID)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_appointment',
    description: 'Add a new appointment.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Appointment date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Appointment time (e.g. "2:30 PM", "14:30")' },
        provider: { type: 'string', description: 'Provider name' },
        location: { type: 'string', description: 'Clinic/office address' },
        reason: { type: 'string', description: 'Reason for visit' },
        questions: { type: 'string', description: 'Questions to ask at the appointment' },
        video_call_url: { type: 'string', description: 'Telehealth video call URL' },
      },
      required: ['date'],
    },
  },
  {
    name: 'update_appointment',
    description: 'Update an existing appointment. Use list_records or search_records first to find the appointment ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The appointment record ID (UUID)' },
        date: { type: 'string' },
        time: { type: 'string' },
        provider: { type: 'string' },
        location: { type: 'string' },
        reason: { type: 'string' },
        questions: { type: 'string' },
        post_notes: { type: 'string', description: 'Post-visit notes' },
        video_call_url: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_appointment',
    description: 'Remove an appointment. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The appointment record ID (UUID)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_provider',
    description: 'Add a new healthcare provider.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Provider full name' },
        specialty: { type: 'string', description: 'Medical specialty (e.g. "Cardiology", "Primary Care")' },
        clinic: { type: 'string', description: 'Clinic or practice name' },
        phone: { type: 'string', description: 'Phone number' },
        fax: { type: 'string', description: 'Fax number' },
        portal_url: { type: 'string', description: 'Patient portal URL' },
        npi: { type: 'string', description: 'NPI number' },
        address: { type: 'string', description: 'Office address' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_provider',
    description: 'Update an existing provider. Use list_records or search_records first to find the provider ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The provider record ID (UUID)' },
        name: { type: 'string' },
        specialty: { type: 'string' },
        clinic: { type: 'string' },
        phone: { type: 'string' },
        fax: { type: 'string' },
        portal_url: { type: 'string' },
        npi: { type: 'string' },
        address: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_provider',
    description: 'Remove a provider. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The provider record ID (UUID)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_vital',
    description: 'Log a new vital sign reading.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date of reading (YYYY-MM-DD). Defaults to today.' },
        type: { type: 'string', enum: ['pain', 'mood', 'energy', 'sleep', 'bp', 'hr', 'weight', 'temp', 'glucose'], description: 'Vital type' },
        value: { type: 'string', description: 'Primary value (e.g. "120" for systolic BP, "7" for pain)' },
        value2: { type: 'string', description: 'Secondary value (e.g. "80" for diastolic BP)' },
        unit: { type: 'string', description: 'Unit (e.g. "mmHg", "bpm", "lbs")' },
        notes: { type: 'string' },
      },
      required: ['type', 'value'],
    },
  },
  {
    name: 'add_journal_entry',
    description: 'Add a new journal entry.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Entry date (YYYY-MM-DD). Defaults to today.' },
        title: { type: 'string', description: 'Entry title' },
        content: { type: 'string', description: 'Entry content/body text' },
        mood: { type: 'string', description: 'Current mood (e.g. "😊 Good", "😔 Low")' },
        severity: { type: 'string', description: 'Symptom severity 1-10' },
        tags: { type: 'string', description: 'Comma-separated tags' },
      },
      required: ['content'],
    },
  },  {
    name: 'add_cycle_entry',
    description: 'Log a cycle/period tracking entry. Types: period (with flow level), symptom (with symptom name), ovulation, fertility_marker.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Entry date (YYYY-MM-DD). Defaults to today.' },
        type: { type: 'string', enum: ['period', 'symptom', 'ovulation', 'fertility_marker'], description: 'Type of cycle entry' },
        value: { type: 'string', description: 'For period: flow level (Light/Medium/Heavy/Spotting). For symptom: severity (Mild/Moderate/Severe). For fertility_marker: marker type (BBT, OPK positive, etc.)' },
        symptom: { type: 'string', description: 'For symptom type: symptom name (Cramps, Bloating, Headache, Fatigue, Breast tenderness, Acne, Mood swing, Nausea, Backache, Insomnia)' },
        notes: { type: 'string', description: 'Optional notes' },
      },
      required: ['type'],
    },
  },
  {
    name: 'remove_cycle_entry',
    description: 'Remove a cycle tracking entry by ID. Requires confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The record ID to remove' },
      },
      required: ['id'],
    },
  },  {
    name: 'add_todo',
    description: 'Add a new health to-do or task for the patient.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Additional notes or details' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority level' },
        category: { type: 'string', enum: ['custom', 'medication', 'appointment', 'follow_up', 'insurance', 'lab', 'research'], description: 'Task category' },
        recurring: { type: 'string', enum: ['none', 'daily', 'weekly', 'monthly'], description: 'Recurrence pattern' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_todo',
    description: 'Update an existing to-do item. Use list_records or search_records to find the ID first.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The to-do ID to update' },
        title: { type: 'string', description: 'New title' },
        notes: { type: 'string', description: 'New notes' },
        due_date: { type: 'string', description: 'New due date (YYYY-MM-DD)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        category: { type: 'string', enum: ['custom', 'medication', 'appointment', 'follow_up', 'insurance', 'lab', 'research'] },
        completed: { type: 'boolean', description: 'Mark as completed (true) or reopen (false)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'remove_todo',
    description: 'Remove a to-do item by ID. ALWAYS confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The to-do ID to remove' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_activity',
    description: 'Log a workout or physical activity.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Activity date (YYYY-MM-DD)' },
        type: { type: 'string', description: 'Activity type (e.g., Running, Walking, Yoga, Cycling, Swimming, Strength Training)' },
        duration_minutes: { type: 'number', description: 'Duration in minutes' },
        distance: { type: 'number', description: 'Distance in km (optional)' },
        calories: { type: 'number', description: 'Calories burned (optional)' },
        heart_rate_avg: { type: 'number', description: 'Average heart rate during activity (optional)' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['type'],
    },
  },
  {
    name: 'add_genetic_result',
    description: 'Add a pharmacogenomic test result (gene variant and metabolizer status).',
    input_schema: {
      type: 'object',
      properties: {
        gene: { type: 'string', description: 'Gene name (e.g., CYP2D6, CYP2C19, VKORC1)' },
        variant: { type: 'string', description: 'Variant or allele (e.g., *1/*4, rs3892097)' },
        phenotype: { type: 'string', enum: ['poor metabolizer', 'intermediate metabolizer', 'normal metabolizer', 'rapid metabolizer', 'ultrarapid metabolizer'], description: 'Metabolizer phenotype' },
        source: { type: 'string', description: 'Test provider (e.g., Genomind, GeneSight, 23andMe)' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['gene', 'phenotype'],
    },
  },
  {
    name: 'update_settings',
    description: 'Update the patient\'s profile settings.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Patient name' },
        location: { type: 'string', description: 'Location/city' },
        pharmacy: { type: 'string', description: 'Default pharmacy' },
        insurance_plan: { type: 'string', description: 'Insurance plan name' },
        insurance_id: { type: 'string', description: 'Insurance member ID' },
        insurance_group: { type: 'string', description: 'Insurance group number' },
        insurance_phone: { type: 'string', description: 'Insurance phone number' },
        health_background: { type: 'string', description: 'Health background notes' },
      },
      required: [],
    },
  },
  {
    name: 'search_records',
    description: 'Search across all health records for matching entries. Use this to find records by name or description before updating or removing them.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text to match against record fields' },
        table: { type: 'string', enum: ['meds', 'conditions', 'providers', 'allergies', 'pharmacies', 'appts', 'journal', 'labs', 'procedures', 'immunizations', 'care_gaps', 'anesthesia_flags', 'appeals_and_disputes', 'surgical_planning', 'insurance', 'insurance_claims', 'drug_prices', 'todos', 'vitals', 'cycles', 'activities', 'genetic_results'], description: 'Optional: limit search to a specific table' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_records',
    description: 'List all records from a specific table. Returns ID and key fields for each record. Use this to find record IDs for update/remove operations.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', enum: ['meds', 'conditions', 'providers', 'allergies', 'pharmacies', 'appts', 'journal', 'labs', 'procedures', 'immunizations', 'care_gaps', 'anesthesia_flags', 'appeals_and_disputes', 'surgical_planning', 'insurance', 'insurance_claims', 'drug_prices', 'todos', 'vitals', 'cycles', 'activities', 'genetic_results'], description: 'Table to list records from' },
      },
      required: ['table'],
    },
  },
];

// Tools that require user confirmation before execution
export const DESTRUCTIVE_TOOLS = new Set([
  'remove_medication',
  'remove_condition',
  'remove_allergy',
  'remove_appointment',
  'remove_provider',
  'remove_cycle_entry',
  'remove_todo',
]);

// Map tool name → { table (db service name), operation }
export const TOOL_TABLE_MAP = {
  add_medication:      { table: 'medications', operation: 'add' },
  update_medication:   { table: 'medications', operation: 'update' },
  remove_medication:   { table: 'medications', operation: 'remove' },
  add_condition:       { table: 'conditions', operation: 'add' },
  update_condition:    { table: 'conditions', operation: 'update' },
  remove_condition:    { table: 'conditions', operation: 'remove' },
  add_allergy:         { table: 'allergies', operation: 'add' },
  remove_allergy:      { table: 'allergies', operation: 'remove' },
  add_appointment:     { table: 'appointments', operation: 'add' },
  update_appointment:  { table: 'appointments', operation: 'update' },
  remove_appointment:  { table: 'appointments', operation: 'remove' },
  add_provider:        { table: 'providers', operation: 'add' },
  update_provider:     { table: 'providers', operation: 'update' },
  remove_provider:     { table: 'providers', operation: 'remove' },
  add_vital:           { table: 'vitals', operation: 'add' },
  add_journal_entry:   { table: 'journal', operation: 'add' },
  add_cycle_entry:     { table: 'cycles', operation: 'add' },
  remove_cycle_entry:  { table: 'cycles', operation: 'remove' },
  add_todo:            { table: 'todos', operation: 'add' },
  update_todo:         { table: 'todos', operation: 'update' },
  remove_todo:         { table: 'todos', operation: 'remove' },
  add_activity:        { table: 'activities', operation: 'add' },
  add_genetic_result:  { table: 'genetic_results', operation: 'add' },
  update_settings:     { table: 'profile', operation: 'update' },
  search_records:      { table: null, operation: 'search' },
  list_records:        { table: null, operation: 'list' },
};

// Summary field extractors: given a record, return a human-readable label
export const RECORD_SUMMARIES = {
  medications:   r => r.display_name || r.name || 'medication',
  conditions:    r => r.name || 'condition',
  allergies:     r => r.substance || 'allergy',
  appointments:  r => [r.reason, r.provider, r.date].filter(Boolean).join(' — ') || 'appointment',
  providers:     r => r.name || 'provider',
  vitals:        r => `${r.type}: ${r.value}${r.unit ? ' ' + r.unit : ''}`,
  journal:       r => r.title || 'journal entry',
  cycles:        r => `${r.type}: ${r.value || r.symptom || ''}`.trim() + (r.date ? ` (${r.date})` : ''),
  todos:         r => r.title || 'to-do',
  activities:    r => `${r.type || 'Activity'}${r.duration_minutes ? ` (${r.duration_minutes} min)` : ''}`,
  genetic_results: r => `${r.gene}: ${r.phenotype}`,
};
