import {
  Moon, Sunrise, Sun, Sunset, ClipboardList, Stethoscope, ShieldAlert, FlaskConical, Syringe,
  ShieldCheck, Dna, User, Calendar, Building2, BadgeDollarSign, Scale, TrendingUp, Activity,
  Heart, AlertTriangle, AlertOctagon, CheckSquare, PlaneTakeoff, Apple, Watch, Pill, BookOpen,
  PenLine, UserCircle, Sparkles, Newspaper, Shield, Zap, Upload, Leaf, Compass,
} from 'lucide-react';
import { OuraIcon } from '../ui/OuraIcon';

/* Vital direction: which way is "good" for color-coded trend signal */
export const VITAL_POLARITY = {
  sleep: 'up', hr: 'down', bp: 'down', steps: 'up',
  energy: 'up', pain: 'down', mood: 'up',
  spo2: 'up', resp: null,
  weight: null, temp: null, glucose: null,
};

/* Rotating placeholder phrases for the mobile centerpiece search */
export const SEARCH_PLACEHOLDERS = [
  'Search medications, providers, labs\u2026',
  'Find a doctor or specialist\u2026',
  'Look up lab results\u2026',
  'Check conditions & allergies\u2026',
];

/* localStorage keys owned by Dashboard */
export const ALERT_DISMISS_KEY = 'salve:alerts-dismissed';
export const SEEN_RESOURCES_KEY = 'salve:seen-resources';
export const DISMISSED_TIPS_KEY = 'salve:dismissed-tips';
export const BARO_ALERT_DISMISS_KEY = 'salve:baro-alert-dismissed';

// dismissBehavior:
//   'auto'     , hidden by data check (no dismiss needed); snoozes 7d if dismissed before data exists
//   'snooze'   , first X snoozes for snoozeDays, second X is permanent
//   'permanent', one X and it's gone for good (optional integrations user may not want)
export const STARTER_TIPS = [
  {
    id: 'add-meds',
    icon: Pill,
    color: 'lav',
    title: 'Add your medications',
    body: 'Start by adding your current meds to get drug interaction checks, refill tracking, and AI-powered insights.',
    action: 'meds',
    actionLabel: 'Add medications',
    dismissBehavior: 'auto',
    snoozeDays: 7,
  },
  {
    id: 'chat-sage',
    icon: Leaf,
    color: 'sage',
    title: 'Meet Sage, your health companion',
    body: 'Tap the leaf icon to chat with Sage. Ask health questions, add records by voice, or get personalized insights.',
    action: 'ai',
    actionLabel: 'Open Sage',
    dismissBehavior: 'snooze',
    snoozeDays: 3,
  },
  {
    id: 'connect-oura',
    icon: Watch,
    color: 'amber',
    title: 'Connect a wearable',
    body: 'Link your Oura Ring to automatically sync sleep, heart rate, temperature, and readiness data.',
    action: 'settings',
    actionLabel: 'Connect in Settings',
    dismissBehavior: 'permanent',
  },
  {
    id: 'import-data',
    icon: Upload,
    color: 'lav',
    title: 'Import existing health data',
    body: 'Bring in data from Apple Health exports, Flo period tracker, or a previous Salve backup file.',
    action: 'settings',
    actionLabel: 'Import in Settings',
    dismissBehavior: 'snooze',
    snoozeDays: 7,
  },
  {
    id: 'claude-sync',
    icon: Sparkles,
    color: 'sage',
    title: 'Sync from Claude AI',
    body: 'Use the Salve Sync artifact in Claude.ai to push health data directly into your account. Grab it from Settings → Claude Sync.',
    action: 'settings',
    actionLabel: 'Get artifact',
    dismissBehavior: 'permanent',
  },
  {
    id: 'add-providers',
    icon: User,
    color: 'lav',
    title: 'Add your care team',
    body: 'Add doctors and providers to cross-reference medications, auto-fill appointments, and look up NPI registry info.',
    action: 'providers',
    actionLabel: 'Add providers',
    dismissBehavior: 'auto',
    snoozeDays: 7,
  },
  {
    id: 'explore-news',
    icon: Newspaper,
    color: 'lav',
    title: 'Your personalized news feed',
    body: 'Health articles from NIH and FDA, matched to your conditions. The more you use Sage, the more personalized your feed becomes.',
    action: 'news',
    actionLabel: 'Browse news',
    dismissBehavior: 'snooze',
    snoozeDays: 14,
  },
  {
    id: 'install-app',
    icon: Compass,
    color: 'sage',
    title: 'Install Salve on your phone',
    body: 'Add to your home screen for faster access, offline support, and a full-screen app experience. Instructions in Settings.',
    action: 'settings',
    actionLabel: 'See how',
    dismissBehavior: 'snooze',
    snoozeDays: 14,
  },
  {
    id: 'try-a-theme',
    icon: Sparkles,
    color: 'lav',
    title: 'Make it feel like yours',
    body: "Salve has 16 themes, from soft pastels to dark cozy to animated cherry blossoms. Tap Settings, then Appearance to try one on.",
    action: 'settings',
    actionLabel: 'Pick a theme',
    dismissBehavior: 'snooze',
    snoozeDays: 7,
  },
  // feedback is not a card, it renders as a persistent footer line in the section
];

// Icon + label lookup for starred section tiles
export const STARRED_META = {
  summary:       { label: 'Summary',      icon: ClipboardList },
  conditions:    { label: 'Conditions',   icon: Stethoscope },
  allergies:     { label: 'Allergies',    icon: ShieldAlert },
  labs:          { label: 'Labs',         icon: FlaskConical },
  procedures:    { label: 'Procedures',   icon: Syringe },
  immunizations: { label: 'Vaccines',     icon: ShieldCheck },
  genetics:      { label: 'Genetics',     icon: Dna },
  providers:     { label: 'Providers',    icon: User },
  appts:         { label: 'Visits',       icon: Calendar },
  pharmacies:    { label: 'Pharmacies',   icon: Building2 },
  insurance:     { label: 'Insurance',    icon: BadgeDollarSign },
  appeals:       { label: 'Appeals',      icon: Scale },
  vitals:        { label: 'Vitals',       icon: TrendingUp },
  sleep:         { label: 'Sleep',        icon: Moon },
  activities:    { label: 'Activities',   icon: Activity },
  cycles:        { label: 'Cycles',       icon: Heart },
  interactions:  { label: 'Interactions', icon: AlertTriangle },
  care_gaps:     { label: 'Care Gaps',    icon: AlertTriangle },
  anesthesia:    { label: 'Anesthesia',   icon: AlertOctagon },
  todos:         { label: "To-Do's",      icon: CheckSquare },
  surgical:      { label: 'Surgery',      icon: PlaneTakeoff },
  oura:          { label: 'Oura',         icon: OuraIcon },
  fitbit:        { label: 'Fitbit',      icon: Watch },
  apple_health:  { label: 'Apple Health', icon: Apple },
  meds:          { label: 'Meds',         icon: Pill },
  journal:       { label: 'Journal',      icon: BookOpen },
  formhelper:    { label: 'Form Scribe', icon: PenLine },
  aboutme:       { label: 'About Me',   icon: UserCircle },
  insights:      { label: 'Insights',   icon: Sparkles },
  news:          { label: 'News',       icon: Newspaper },
};

// Hub tiles, always 6 (or 5 when no devices). Tappable → category page.
export const HUB_TILES = [
  { id: 'records',  navId: 'hub_records',  label: 'Records',   icon: ClipboardList },
  { id: 'care',     navId: 'hub_care',     label: 'Care Team', icon: User },
  { id: 'tracking', navId: 'hub_tracking', label: 'Tracking',  icon: Activity },
  { id: 'safety',   navId: 'hub_safety',   label: 'Safety',    icon: Shield },
  { id: 'plans',    navId: 'hub_plans',    label: 'Plans',     icon: CheckSquare },
  { id: 'devices',  navId: 'hub_devices',  label: 'Devices',   icon: Zap, conditional: true },
];

export const CONDITIONAL_TILES = new Set(['oura', 'apple_health']);

// Greeting icon + motif tokens used by getTimeGreeting (kept out of helpers
// so the icon imports don't bloat the pure-helper module).
export const GREETING_ICONS = { moon: Moon, sunrise: Sunrise, sun: Sun, sunset: Sunset };
