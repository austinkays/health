import { Moon, Thermometer, Bike, Bed, Smartphone, Compass, Watch, Activity, Smile, Gauge, Eye, Droplet, Droplets, Dna } from 'lucide-react';
import * as clueParser from '../services/import_clue';
import * as naturalCyclesParser from '../services/import_natural_cycles';
import * as daylioParser from '../services/import_daylio';
import * as bearableParser from '../services/import_bearable';
import * as libreParser from '../services/import_libre';
import * as mysugrParser from '../services/import_mysugr';
import * as stravaParser from '../services/import_strava';
import * as sleepCycleParser from '../services/import_sleep_cycle';
import * as samsungParser from '../services/import_samsung';
import * as garminParser from '../services/import_garmin';
import * as fitbitTakeoutParser from '../services/import_fitbit_takeout';
import * as googleFitParser from '../services/import_google_fit';
import * as visibleParser from '../services/import_visible';
import * as prometheaseParser from '../services/import_promethease';
import * as twentyThreeMeParser from '../services/import_23andme';

export const IMPORT_CATEGORIES = [
  { id: 'cycle', emoji: '🌸', label: 'Cycle & Fertility', items: [
    { parser: clueParser,          Icon: Moon,        tint: 'rose', subtitle: 'Period, symptoms, and ovulation (CSV)' },
    { parser: naturalCyclesParser, Icon: Thermometer, tint: 'rose', subtitle: 'BBT and period tracking (CSV)' },
  ]},
  { id: 'fitness', emoji: '💪', label: 'Fitness & Activity', items: [
    { parser: stravaParser,        Icon: Bike,        tint: 'sage', subtitle: 'Workouts from your Strava archive (CSV or ZIP)' },
    { parser: sleepCycleParser,    Icon: Bed,         tint: 'lav',  subtitle: 'Sleep sessions and quality (CSV)' },
    { parser: samsungParser,       Icon: Smartphone,  tint: 'sage', subtitle: 'Steps, HR, sleep, weight, BP, glucose (ZIP)' },
    { parser: garminParser,        Icon: Compass,     tint: 'sage', subtitle: 'Workouts, wellness, and sleep (ZIP)' },
    { parser: fitbitTakeoutParser, Icon: Watch,       tint: 'sage', subtitle: 'Offline alternative to the Fitbit OAuth sync (ZIP)' },
    { parser: googleFitParser,     Icon: Activity,    tint: 'sage', subtitle: 'Steps, HR, and weight from Google Takeout (ZIP)' },
  ]},
  { id: 'mood', emoji: '😊', label: 'Mood & Symptoms', items: [
    { parser: daylioParser,        Icon: Smile,       tint: 'amber', subtitle: 'Mood and micro-journal (CSV)' },
    { parser: bearableParser,      Icon: Gauge,       tint: 'lav',  subtitle: 'Mood, energy, sleep, and symptoms (CSV)' },
    { parser: visibleParser,       Icon: Eye,         tint: 'lav',  subtitle: 'HR, HRV, stability scores, and symptoms (CSV)' },
  ]},
  { id: 'glucose', emoji: '🩸', label: 'Blood Sugar', items: [
    { parser: libreParser,         Icon: Droplet,     tint: 'rose', subtitle: 'CGM glucose history from LibreView (CSV)' },
    { parser: mysugrParser,        Icon: Droplets,    tint: 'rose', subtitle: 'Diabetes logbook (CSV)' },
  ]},
  { id: 'genetics', emoji: '🔬', label: 'Genetics', items: [
    { parser: prometheaseParser,   Icon: Dna,         tint: 'lav',  subtitle: 'Pharmacogenomic SNP analysis (JSON)' },
    { parser: twentyThreeMeParser, Icon: Dna,         tint: 'lav',  subtitle: 'Raw DNA data — PGx variants only (TXT)' },
  ]},
];

export const TINT_BG = { rose: 'bg-salve-rose/15', amber: 'bg-salve-amber/15', lav: 'bg-salve-lav/15', sage: 'bg-salve-sage/15' };
export const TINT_FG = { rose: 'text-salve-rose', amber: 'text-salve-amber', lav: 'text-salve-lav', sage: 'text-salve-sage' };

export const PROJECT_INSTRUCTIONS = `This project is for syncing my health records into Salve (a personal health management app).

The knowledge file salve-sync.jsx is the complete source code for a React artifact called "Salve Health Sync". It uses MCP connections to pull my medical records and export them as JSON that I import into Salve.

Whenever I ask you to sync, pull records, start the sync artifact, or anything similar, do this immediately, no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE contents of salve-sync.jsx into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have any health-related MCP connectors enabled (like Healthex for patient portals, or Function Health for lab panels). If I'm missing connectors the artifact needs, help me set them up step by step: tell me to open Claude settings → Connectors, search for the connector, and complete the OAuth sign-in. Don't assume I know where "Connectors" lives, spell out the exact clicks. Once connected, tell me to click "Pull Health Records" in the artifact.

Dependencies available in the Claude artifacts runtime: react and lucide-react. No other imports needed, no external API calls from the file itself.`;
