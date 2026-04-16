import { useState } from 'react';
import { ChevronDown, User, Brain, Users, Coffee, Heart } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import { SageIntroButton } from '../ui/SageIntro';
import { clearBarometricCache } from '../../services/barometric';
import { getBrowserTimezone } from '../../utils/dates';

// Popular IANA timezones grouped by region. Not exhaustive — the browser lists
// ~400+ but most users only ever need one of these. The current stored value
// is always added below, so custom timezones still render.
const COMMON_TIMEZONES = [
  { label: '── Americas ──', disabled: true },
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  { label: '── Europe ──', disabled: true },
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Athens',
  'Europe/Moscow',
  { label: '── Africa / Middle East ──', disabled: true },
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Riyadh',
  { label: '── Asia ──', disabled: true },
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  { label: '── Oceania ──', disabled: true },
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  { label: '── Other ──', disabled: true },
  'UTC',
];

const CATEGORIES = [
  {
    id: 'personal',
    label: 'Personal',
    icon: User,
    fields: [
      { key: 'name', label: 'Name', placeholder: 'How should we greet you?', topLevel: true },
      { key: 'location', label: 'Location (zip code)', placeholder: 'e.g. 60601 (used for barometric pressure tracking)', topLevel: true },
      { key: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her, he/him, they/them' },
      { key: 'occupation', label: 'Occupation', placeholder: 'e.g. Teacher, Software engineer, Stay-at-home parent' },
      { key: 'employer', label: 'Employer / School', placeholder: 'e.g. Company name or school' },
      { key: 'education', label: 'Education', placeholder: 'e.g. Bachelor\'s degree, High school diploma' },
      { key: 'living_situation', label: 'Living Situation', placeholder: 'e.g. Live with partner, live alone, with family' },
      { key: 'relationship_status', label: 'Relationship Status', placeholder: 'e.g. Married, single, in a relationship' },
      { key: 'children', label: 'Children', placeholder: 'e.g. 2 kids, ages 5 and 8' },
      { key: 'religion', label: 'Religion / Spirituality', placeholder: 'e.g. Catholic, agnostic, spiritual' },
      { key: 'identities', label: 'Identities', placeholder: 'Race, cultural background, sexual orientation, or anything meaningful to you', textarea: true },
      { key: 'health_context', label: 'Health Context', placeholder: 'e.g. chronic fatigue since 2019, pain flares in cold weather, managing multiple conditions', textarea: true },
    ],
  },
  {
    id: 'mental_health',
    label: 'Mental Health History',
    icon: Brain,
    fields: [
      { key: 'previous_therapy', label: 'Previous Therapy', placeholder: 'e.g. Yes, CBT for 2 years (2020-2022)', textarea: true },
      { key: 'psych_diagnoses', label: 'Psychiatric Diagnoses', placeholder: 'e.g. ADHD, generalized anxiety disorder', textarea: true },
      { key: 'psych_hospitalizations', label: 'Psychiatric Hospitalizations', placeholder: 'e.g. None, or details if applicable' },
      { key: 'past_psych_meds', label: 'Past Psychiatric Medications', placeholder: 'e.g. Zoloft 50mg (2019-2020), Adderall 10mg (2021)', textarea: true },
      { key: 'therapy_goals', label: 'What You Hope to Get from Therapy', placeholder: 'e.g. Better coping skills, managing anxiety, processing grief', textarea: true },
    ],
  },
  {
    id: 'family_history',
    label: 'Family History',
    icon: Users,
    fields: [
      { key: 'family_mental_health', label: 'Family Mental Health History', placeholder: 'e.g. Mother, depression, Brother, ADHD', textarea: true },
      { key: 'family_substance_use', label: 'Family Substance Use History', placeholder: 'e.g. Father, alcohol use disorder', textarea: true },
      { key: 'family_medical', label: 'Family Medical History', placeholder: 'e.g. Heart disease (father), diabetes (grandmother)', textarea: true },
    ],
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    icon: Coffee,
    fields: [
      { key: 'alcohol', label: 'Alcohol Use', placeholder: 'e.g. Social drinker, 1-2 drinks/week' },
      { key: 'caffeine', label: 'Caffeine', placeholder: 'e.g. 2 cups of coffee per day' },
      { key: 'tobacco', label: 'Tobacco Use', placeholder: 'e.g. Never, former smoker, vape occasionally' },
      { key: 'recreational_drugs', label: 'Recreational Drug Use', placeholder: 'e.g. None, or as you\'re comfortable sharing' },
    ],
  },
  {
    id: 'strengths',
    label: 'Strengths & Interests',
    icon: Heart,
    fields: [
      { key: 'hobbies', label: 'Hobbies & Interests', placeholder: 'e.g. Reading, hiking, cooking, video games', textarea: true },
      { key: 'strengths', label: 'Strengths', placeholder: 'Things you like about yourself or are good at', textarea: true },
      { key: 'whats_going_well', label: 'What\'s Going Well', placeholder: 'What are you grateful for right now?', textarea: true },
      { key: 'support_system', label: 'Support System', placeholder: 'e.g. Close friends, partner, therapist, support group' },
    ],
  },
];

// Resolve the current value for a field — topLevel fields read from
// data.settings directly, everything else reads from data.settings.about_me.
function resolveValue(field, settings, aboutMe) {
  if (field.topLevel) return settings?.[field.key] || '';
  return aboutMe[field.key] || '';
}

// Timezone picker. Reads/writes settings.timezone through updateSettings so the
// user-set flag (handled inside useHealthData) marks it as manually chosen and
// the auto-detect effect leaves it alone going forward.
function TimezoneRow({ value, onChange }) {
  const browserTz = getBrowserTimezone();
  // Build the select options. De-dup + sort region labels, then append the
  // stored value if it's a custom tz not already in the list.
  const flatList = COMMON_TIMEZONES.filter(o => typeof o === 'string');
  const includesStored = value && flatList.includes(value);
  const options = COMMON_TIMEZONES.map(o => {
    if (typeof o === 'string') return { value: o, label: o };
    return { value: '__sep__' + o.label, label: o.label, disabled: true };
  });
  if (value && !includesStored) {
    options.push({ value: '__sep__custom', label: '── Custom ──', disabled: true });
    options.push({ value, label: value });
  }
  const isAuto = value === browserTz;
  return (
    <div className="mb-4">
      <label className="block text-[13px] font-semibold text-salve-textMid mb-1.5 uppercase tracking-widest">
        Timezone
      </label>
      <select
        value={value || browserTz}
        onChange={e => {
          const v = e.target.value;
          if (v.startsWith('__sep__')) return;
          onChange(v);
        }}
        className="w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-montserrat text-salve-textFaint">
          {isAuto ? 'Matches your browser.' : `Browser detected: ${browserTz}`}
        </span>
        {!isAuto && (
          <button
            type="button"
            onClick={() => onChange(browserTz)}
            className="text-[13px] font-montserrat text-salve-lav hover:underline bg-transparent border-none cursor-pointer p-0"
          >
            Use browser
          </button>
        )}
      </div>
    </div>
  );
}

function CategorySection({ category, settings, aboutMe, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;
  const filledCount = category.fields.filter(f => resolveValue(f, settings, aboutMe).trim()).length;

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-transparent border-none cursor-pointer text-left transition-colors hover:bg-salve-card2/50"
        aria-expanded={open}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-salve-lav/10">
          <Icon size={14} className="text-salve-lav" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-medium text-salve-text font-montserrat">{category.label}</span>
          {filledCount > 0 && (
            <span className="text-[12px] text-salve-sage font-montserrat ml-2">
              {filledCount}/{category.fields.length} filled
            </span>
          )}
        </div>
        <ChevronDown size={14} className={`text-salve-textFaint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-salve-border/50">
          {category.fields.map(field => (
            <Field
              key={field.key}
              label={field.label}
              value={resolveValue(field, settings, aboutMe)}
              onChange={v => onChange(field, v)}
              placeholder={field.placeholder}
              textarea={field.textarea}
              maxLength={field.textarea ? 1000 : 200}
            />
          ))}
          {category.id === 'personal' && (
            <TimezoneRow
              value={settings?.timezone}
              onChange={tz => onChange({ key: 'timezone', topLevel: true }, tz)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

export default function AboutMe({ data, updateSettings, onSageIntro }) {
  const settings = data.settings || {};
  const aboutMe = settings.about_me || {};

  const handleChange = (field, value) => {
    if (field.topLevel) {
      // Top-level profile field (e.g. name) — write to settings directly so
      // it stays canonical and existing consumers (Header greeting, etc.) keep
      // working without a migration.
      if (field.key === 'location') clearBarometricCache();
      updateSettings({ [field.key]: value });
      return;
    }
    const updated = { ...aboutMe, [field.key]: value };
    updateSettings({ about_me: updated });
  };

  const filledTotal = CATEGORIES.reduce((sum, cat) =>
    sum + cat.fields.filter(f => resolveValue(f, settings, aboutMe).trim()).length, 0
  );
  const totalFields = CATEGORIES.reduce((sum, cat) => sum + cat.fields.length, 0);

  return (
    <div className="space-y-3">
      <div className="px-1 mt-1 mb-1">
        <p className="text-sm text-salve-textMid font-montserrat mb-1">
          Help Sage fill out forms for you by sharing a bit about yourself. Everything here is optional, add as much or as little as you like.
        </p>
        <p className="text-[13px] text-salve-textFaint font-montserrat">
          {filledTotal} of {totalFields} fields filled · Saves automatically
        </p>
      </div>

      {onSageIntro && (
        <SageIntroButton onClick={onSageIntro} compact />
      )}

      {CATEGORIES.map(cat => (
        <CategorySection
          key={cat.id}
          category={cat}
          settings={settings}
          aboutMe={aboutMe}
          onChange={handleChange}
        />
      ))}
    </div>
  );
}
