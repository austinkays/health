import { Sparkles, Link, Newspaper, HelpCircle, BadgeDollarSign, Heart, FileText, Stethoscope } from 'lucide-react';
import { C } from '../../constants/colors';

// Feature ID → ai.js feature name for lock checking
export const FEATURE_TO_AI = {
  connections: 'connections',
  resources: 'resources',
  costs: 'costOptimization',
  cycle_patterns: 'cyclePatterns',
  monthly_summary: 'monthlySummary',
  house: 'houseConsultation',
};

// Per-feature benefit descriptions for styled premium gate cards
export const PREMIUM_BENEFITS = {
  connections:     { title: 'Health Connections', desc: 'Discover hidden patterns across your medications, conditions, vitals, and journal entries — all analyzed together.', accent: 'sage' },
  monthly_summary: { title: 'Monthly Summary',    desc: 'A clinical-grade overview of your month you can hand directly to your specialist. Tracks trends, flags concerns, and highlights wins.', accent: 'sage' },
  house:           { title: 'House Consultation', desc: 'Claude and Gemini debate your health data together in a differential-diagnosis style consultation.', accent: 'amber' },
};

export const FEATURES = [
  { id: 'insight',         label: 'Health Insight',      desc: 'A fresh, personalized health tip',   icon: Sparkles,        color: C.lav },
  { id: 'connections',     label: 'Health Connections',  desc: 'Patterns across your health data',   icon: Link,            color: C.sage,  premium: true },
  { id: 'news',            label: 'Health News',         desc: 'Recent news for your conditions',    icon: Newspaper,       color: C.amber },
  { id: 'resources',       label: 'Resources',           desc: 'Benefits, programs & assistance',    icon: HelpCircle,      color: C.rose },
  { id: 'costs',           label: 'Cost Savings',        desc: 'Ways to save on medications',        icon: BadgeDollarSign, color: C.sage },
  { id: 'cycle_patterns',  label: 'Cycle Patterns',      desc: 'Phase-correlated health trends',     icon: Heart,           color: C.rose },
  { id: 'monthly_summary', label: 'Monthly Summary',     desc: 'Clinical overview for your provider', icon: FileText,       color: C.sage,  premium: true },
  { id: 'house',           label: 'House Consultation',  desc: 'Claude & Gemini debate your health', icon: Stethoscope,     color: C.amber, admin: true },
];

export const INSIGHTS_SAVE_KEY = 'salve:saved-insights';
export const NEWS_SAVE_KEY = 'salve:saved-news';

export const TOOL_LABELS = {
  add_medication: 'Add medication', update_medication: 'Update medication', remove_medication: 'Remove medication',
  add_condition: 'Add condition', update_condition: 'Update condition', remove_condition: 'Remove condition',
  add_allergy: 'Add allergy', remove_allergy: 'Remove allergy',
  add_appointment: 'Add appointment', update_appointment: 'Update appointment', remove_appointment: 'Remove appointment',
  add_provider: 'Add provider', update_provider: 'Update provider', remove_provider: 'Remove provider',
  add_vital: 'Log vital', add_journal_entry: 'Add journal entry', update_settings: 'Update profile',
  add_todo: 'Add to-do', update_todo: 'Update to-do', remove_todo: 'Remove to-do',
  add_activity: 'Log activity',
  add_genetic_result: 'Add genetic result',
  search_records: 'Search records', list_records: 'List records',
};
