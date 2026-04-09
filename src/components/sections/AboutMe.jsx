import { useState } from 'react';
import { ChevronDown, User, Brain, Users, Coffee, Heart } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import { SageIntroButton } from '../ui/SageIntro';

const CATEGORIES = [
  {
    id: 'personal',
    label: 'Personal',
    icon: User,
    fields: [
      { key: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her, he/him, they/them' },
      { key: 'occupation', label: 'Occupation', placeholder: 'e.g. Teacher, Software engineer, Stay-at-home parent' },
      { key: 'employer', label: 'Employer / School', placeholder: 'e.g. Company name or school' },
      { key: 'education', label: 'Education', placeholder: 'e.g. Bachelor\'s degree, High school diploma' },
      { key: 'living_situation', label: 'Living Situation', placeholder: 'e.g. Live with partner, live alone, with family' },
      { key: 'relationship_status', label: 'Relationship Status', placeholder: 'e.g. Married, single, in a relationship' },
      { key: 'children', label: 'Children', placeholder: 'e.g. 2 kids, ages 5 and 8' },
      { key: 'religion', label: 'Religion / Spirituality', placeholder: 'e.g. Catholic, agnostic, spiritual' },
      { key: 'identities', label: 'Identities', placeholder: 'Race, cultural background, sexual orientation, or anything meaningful to you', textarea: true },
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

function CategorySection({ category, values, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = category.icon;
  const filledCount = category.fields.filter(f => values[f.key]?.trim()).length;

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
          <span className="text-[13px] font-medium text-salve-text font-montserrat">{category.label}</span>
          {filledCount > 0 && (
            <span className="text-[10px] text-salve-sage font-montserrat ml-2">
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
              value={values[field.key] || ''}
              onChange={v => onChange(field.key, v)}
              placeholder={field.placeholder}
              textarea={field.textarea}
              maxLength={field.textarea ? 1000 : 200}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AboutMe({ data, updateSettings, onSageIntro }) {
  const aboutMe = data.settings?.about_me || {};

  const handleChange = (key, value) => {
    const updated = { ...aboutMe, [key]: value };
    updateSettings({ about_me: updated });
  };

  const filledTotal = CATEGORIES.reduce((sum, cat) =>
    sum + cat.fields.filter(f => aboutMe[f.key]?.trim()).length, 0
  );
  const totalFields = CATEGORIES.reduce((sum, cat) => sum + cat.fields.length, 0);

  return (
    <div className="space-y-3">
      <div className="px-1 mt-1 mb-1">
        <p className="text-sm text-salve-textMid font-montserrat mb-1">
          Help Sage fill out forms for you by sharing a bit about yourself. Everything here is optional, add as much or as little as you like.
        </p>
        <p className="text-[11px] text-salve-textFaint font-montserrat">
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
          values={aboutMe}
          onChange={handleChange}
        />
      ))}
    </div>
  );
}
