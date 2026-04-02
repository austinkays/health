// Tool execution engine for AI-powered data control
// Maps tool calls from Anthropic to useHealthData CRUD operations.

import { TOOL_TABLE_MAP, RECORD_SUMMARIES } from '../constants/tools';
import { searchEntities, ENTITY_CONFIG } from '../utils/search.jsx';

// Sanitize string input: strip angle brackets / braces, cap length
function san(text, limit = 500) {
  if (text == null) return text;
  return String(text).replace(/[<>{}]/g, '').slice(0, limit);
}

// Strip system-managed fields from tool input before passing to CRUD
const STRIP_ON_ADD = new Set(['id', 'user_id', 'created_at', 'updated_at', 'sync_id']);
const STRIP_ON_UPDATE = new Set(['user_id', 'created_at', 'updated_at', 'sync_id']);

function sanitizeInput(input, operation) {
  const result = {};
  const stripSet = operation === 'add' ? STRIP_ON_ADD : STRIP_ON_UPDATE;
  for (const [key, value] of Object.entries(input)) {
    if (stripSet.has(key)) continue;
    result[key] = typeof value === 'string' ? san(value) : value;
  }
  return result;
}

// State key → db table name (inverse of useHealthData's tableToKey)
const STATE_KEY_TO_TABLE = {
  meds: 'medications', conditions: 'conditions', allergies: 'allergies',
  providers: 'providers', pharmacies: 'pharmacies', vitals: 'vitals',
  appts: 'appointments', journal: 'journal', labs: 'labs',
  procedures: 'procedures', immunizations: 'immunizations', care_gaps: 'care_gaps',
  anesthesia_flags: 'anesthesia_flags', appeals_and_disputes: 'appeals_and_disputes',
  surgical_planning: 'surgical_planning', insurance: 'insurance',
  insurance_claims: 'insurance_claims', drug_prices: 'drug_prices',
  cycles: 'cycles', activities: 'activities', genetic_results: 'genetic_results',
};

// DB table name → state key
const TABLE_TO_STATE_KEY = {
  medications: 'meds', conditions: 'conditions', allergies: 'allergies',
  providers: 'providers', pharmacies: 'pharmacies', vitals: 'vitals',
  appointments: 'appts', journal: 'journal', labs: 'labs',
  procedures: 'procedures', immunizations: 'immunizations', care_gaps: 'care_gaps',
  anesthesia_flags: 'anesthesia_flags', appeals_and_disputes: 'appeals_and_disputes',
  surgical_planning: 'surgical_planning', insurance: 'insurance',
  insurance_claims: 'insurance_claims', drug_prices: 'drug_prices',
  cycles: 'cycles', activities: 'activities', genetic_results: 'genetic_results',
};

// Summarize a list of records for the AI (key fields + IDs, trimmed)
function summarizeRecords(records, tableName) {
  if (!records?.length) return 'No records found.';
  const summaryFn = RECORD_SUMMARIES[tableName];
  return records.map(r => {
    const label = summaryFn ? summaryFn(r) : (r.name || r.title || r.subject || r.substance || r.item || r.test_name || 'record');
    return `- ${label} (id: ${r.id})`;
  }).join('\n');
}

/**
 * Create a tool executor bound to current data state and CRUD functions.
 * @param {Object} deps - { data, addItem, updateItem, removeItem, updateSettings }
 * @returns {Function} executeTool(toolCall) → { tool_use_id, content, is_error? }
 */
export function createToolExecutor({ data, addItem, updateItem, removeItem, updateSettings }) {

  return async function executeTool(toolCall) {
    const { id: tool_use_id, name, input } = toolCall;
    const mapping = TOOL_TABLE_MAP[name];

    if (!mapping) {
      return { tool_use_id, content: `Unknown tool: ${name}`, is_error: true };
    }

    try {
      const { table, operation } = mapping;

      // ── Search (read-only) ──
      if (operation === 'search') {
        const query = input.query;
        if (!query) return { tool_use_id, content: 'query is required', is_error: true };

        let results = searchEntities(data, query);
        // Filter by table if specified
        if (input.table) {
          results = results.filter(r => r.entityKey === input.table);
        }
        if (!results.length) {
          return { tool_use_id, content: `No records found matching "${query}".` };
        }
        const summary = results.slice(0, 20).map(r => {
          const config = ENTITY_CONFIG[r.entityKey];
          const label = config ? config.primary(r.item) : 'record';
          return `- [${config?.label || r.entityKey}] ${label} (id: ${r.item.id})`;
        }).join('\n');
        return { tool_use_id, content: `Found ${results.length} result(s):\n${summary}` };
      }

      // ── List (read-only) ──
      if (operation === 'list') {
        const stateKey = input.table;
        if (!stateKey || !data[stateKey]) {
          return { tool_use_id, content: `Unknown table: ${input.table}`, is_error: true };
        }
        const tableName = STATE_KEY_TO_TABLE[stateKey] || stateKey;
        const records = data[stateKey];
        if (!records.length) {
          return { tool_use_id, content: `No records in ${stateKey}.` };
        }
        return { tool_use_id, content: `${records.length} record(s) in ${stateKey}:\n${summarizeRecords(records, tableName)}` };
      }

      // ── Add ──
      if (operation === 'add') {
        const cleaned = sanitizeInput(input, 'add');
        // Add default date for vitals/journal if not provided
        if (table === 'vitals' && !cleaned.date) {
          cleaned.date = new Date().toISOString().slice(0, 10);
        }
        if (table === 'journal' && !cleaned.date) {
          cleaned.date = new Date().toISOString().slice(0, 10);
        }
        const saved = await addItem(table, cleaned);
        const summaryFn = RECORD_SUMMARIES[table];
        const label = summaryFn ? summaryFn(saved) : (saved.name || saved.substance || 'record');
        return { tool_use_id, content: `Added: ${label} (id: ${saved.id})` };
      }

      // ── Update ──
      if (operation === 'update') {
        if (table === 'profile') {
          const cleaned = sanitizeInput(input, 'update');
          await updateSettings(cleaned);
          return { tool_use_id, content: `Updated profile settings: ${Object.keys(cleaned).join(', ')}` };
        }

        const { id, ...changes } = input;
        if (!id) return { tool_use_id, content: 'id is required for update', is_error: true };

        // Verify record exists
        const stateKey = TABLE_TO_STATE_KEY[table];
        const records = data[stateKey] || [];
        const existing = records.find(r => r.id === id);
        if (!existing) {
          return { tool_use_id, content: `Record not found with id: ${id}. Use search_records or list_records to find the correct ID.`, is_error: true };
        }

        const cleaned = sanitizeInput(changes, 'update');
        await updateItem(table, id, cleaned);
        const summaryFn = RECORD_SUMMARIES[table];
        const label = summaryFn ? summaryFn({ ...existing, ...cleaned }) : 'record';
        return { tool_use_id, content: `Updated: ${label} (id: ${id})` };
      }

      // ── Remove ──
      if (operation === 'remove') {
        const { id } = input;
        if (!id) return { tool_use_id, content: 'id is required for remove', is_error: true };

        // Verify record exists
        const stateKey = TABLE_TO_STATE_KEY[table];
        const records = data[stateKey] || [];
        const existing = records.find(r => r.id === id);
        if (!existing) {
          return { tool_use_id, content: `Record not found with id: ${id}. Use search_records or list_records to find the correct ID.`, is_error: true };
        }

        await removeItem(table, id);
        const summaryFn = RECORD_SUMMARIES[table];
        const label = summaryFn ? summaryFn(existing) : 'record';
        return { tool_use_id, content: `Removed: ${label}` };
      }

      return { tool_use_id, content: `Unsupported operation: ${operation}`, is_error: true };
    } catch (err) {
      return { tool_use_id, content: `Error: ${err.message}`, is_error: true };
    }
  };
}
