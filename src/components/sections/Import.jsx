import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Apple, FileText, Heart, Moon, Thermometer, Smile, Gauge, Droplet, Droplets, Bike, Bed, Compass, Watch, Activity, Eye, Dna, X, Smartphone, Sparkles, ClipboardCopy } from 'lucide-react';
import Card from '../ui/Card';
import { SectionTitle } from '../ui/FormWrap';
import UniversalImport from '../ui/UniversalImport';
import AppleHealthImport from '../ui/AppleHealthImport';
import MyChartImport from '../ui/MyChartImport';
import ImportWizard from '../ui/ImportWizard';
import Wearables from '../settings/Wearables';
import * as clueParser from '../../services/import_clue';
import * as naturalCyclesParser from '../../services/import_natural_cycles';
import * as daylioParser from '../../services/import_daylio';
import * as bearableParser from '../../services/import_bearable';
import * as libreParser from '../../services/import_libre';
import * as mysugrParser from '../../services/import_mysugr';
import * as stravaParser from '../../services/import_strava';
import * as sleepCycleParser from '../../services/import_sleep_cycle';
import * as samsungParser from '../../services/import_samsung';
import * as garminParser from '../../services/import_garmin';
import * as fitbitTakeoutParser from '../../services/import_fitbit_takeout';
import * as googleFitParser from '../../services/import_google_fit';
import * as visibleParser from '../../services/import_visible';
import * as prometheaseParser from '../../services/import_promethease';
import * as twentyThreeMeParser from '../../services/import_23andme';
import { startTerraConnect, listTerraConnections, disconnectTerraConnection, providerLabel, TERRA_ENABLED } from '../../services/terra';
import { isOuraConnected } from '../../services/oura';
import { isDexcomConnected, DEXCOM_ENABLED } from '../../services/dexcom';
import { isWithingsConnected, WITHINGS_ENABLED } from '../../services/withings';
import { isFitbitConnected, FITBIT_ENABLED } from '../../services/fitbit';
import { isWhoopConnected, WHOOP_ENABLED } from '../../services/whoop';
import { getHiddenSources, hideSource, unhideAllSources } from '../../utils/hiddenSources';
import { trackEvent, EVENTS } from '../../services/analytics';

const IMPORT_CATEGORIES = [
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

const TINT_BG = { rose: 'bg-salve-rose/15', amber: 'bg-salve-amber/15', lav: 'bg-salve-lav/15', sage: 'bg-salve-sage/15' };
const TINT_FG = { rose: 'text-salve-rose', amber: 'text-salve-amber', lav: 'text-salve-lav', sage: 'text-salve-sage' };

// Reads localStorage + data tables to decide which sources are live (OAuth flowing)
// vs. imported (data present from a one-shot file import). Returns Sets keyed by source id.
function computeActiveSources(data, terraConnections) {
  const live = new Set();
  if (isOuraConnected()) live.add('oura');
  if (DEXCOM_ENABLED && isDexcomConnected()) live.add('dexcom');
  if (WITHINGS_ENABLED && isWithingsConnected()) live.add('withings');
  if (FITBIT_ENABLED && isFitbitConnected()) live.add('fitbit');
  if (WHOOP_ENABLED && isWhoopConnected()) live.add('whoop');

  const counts = {};
  const all = [
    ...(data.vitals || []),
    ...(data.activities || []),
    ...(data.cycles || []),
    ...(data.journal_entries || []),
    ...(data.labs || []),
    ...(data.genetic_results || []),
  ];
  for (const r of all) {
    let s = (r.source || '').toLowerCase();
    if (!s || s === 'manual') continue;
    if (s === 'apple health' || s.includes('apple')) s = 'apple_health';
    else if (s === 'mcp-sync') s = 'mcp';
    counts[s] = (counts[s] || 0) + 1;
  }

  const imported = new Set();
  for (const s of Object.keys(counts)) {
    if (live.has(s)) continue; // OAuth already covers it — don't double-render
    imported.add(s);
  }

  const terraLive = (terraConnections || []).filter(c => c.status !== 'disconnected');
  return { live, imported, counts, terraLive };
}

export default function Import({ data, addItem, addItemSilent, reloadData, onNav, demoMode }) {
  const [expandedSource, setExpandedSource] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [hiddenSources, setHiddenSources] = useState(() => getHiddenSources());
  // Bumped whenever an OAuth wearable connects/disconnects so the `active` memo re-evaluates.
  const [connectionTick, setConnectionTick] = useState(0);
  const bumpConnectionTick = () => setConnectionTick(t => t + 1);

  // Source detection + counts for Wearables (Oura/Dexcom/Withings/Fitbit/Whoop) badges
  const wearableSourceCounts = useMemo(() => {
    const counts = { oura: 0, apple_health: 0, manual: 0, mcp: 0 };
    const all = [
      ...(data.vitals || []),
      ...(data.activities || []),
      ...(data.cycles || []),
    ];
    for (const r of all) {
      const s = (r.source || '').toLowerCase();
      if (s === 'oura') counts.oura++;
      else if (s === 'apple_health' || s === 'apple health' || s.includes('apple')) counts.apple_health++;
      else if (s === 'mcp' || s === 'mcp-sync') counts.mcp++;
      else counts.manual++;
    }
    return counts;
  }, [data.vitals, data.activities, data.cycles]);

  // Terra state
  const [terraConnections, setTerraConnections] = useState([]);
  const [terraLoading, setTerraLoading] = useState(false);
  const [terraError, setTerraError] = useState(null);

  // Load Terra connections on mount
  useEffect(() => {
    if (!TERRA_ENABLED) return;
    listTerraConnections().then(setTerraConnections).catch(() => {});
  }, []);

  // What's active right now? Split into live OAuth (ongoing sync) and imported
  // (data landed in our tables from a one-shot file or MCP pull).
  const active = useMemo(
    () => computeActiveSources(data, terraConnections),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.vitals, data.activities, data.cycles, data.journal_entries, data.labs, data.genetic_results, terraConnections, connectionTick],
  );
  const hasAnyConnection = active.live.size > 0 || active.imported.size > 0 || active.terraLive.length > 0;

  const toggleCategory = (catId) => setExpandedCategory(prev => {
    if (prev === catId) return null;
    setExpandedSource(null);
    return catId;
  });
  const toggleSource = (id) => setExpandedSource(prev => prev === id ? null : id);

  const handleHideSource = (id) => {
    hideSource(id);
    setHiddenSources(getHiddenSources());
    if (expandedSource === id) setExpandedSource(null);
  };
  const handleShowAllSources = () => {
    unhideAllSources();
    setHiddenSources([]);
  };

  const handleTerraConnect = async () => {
    setTerraLoading(true);
    setTerraError(null);
    try {
      await startTerraConnect();
    } catch (err) {
      setTerraError(err.message || 'Failed to open device picker');
      setTerraLoading(false);
    }
  };
  const handleTerraDisconnect = async (id) => {
    try {
      await disconnectTerraConnection(id);
      setTerraConnections(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setTerraError(err.message || 'Failed to disconnect');
    }
  };

  const HideableSource = ({ id, label, children }) => {
    if (hiddenSources.includes(id)) return null;
    return (
      <div className="relative">
        {children}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleHideSource(id); }}
          aria-label={`Hide ${label}`}
          title={`Hide ${label}`}
          className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center bg-salve-card2/90 backdrop-blur-sm text-salve-textFaint hover:text-salve-rose hover:bg-salve-rose/15 transition-colors cursor-pointer border-none p-0"
        >
          <X size={11} />
        </button>
      </div>
    );
  };

  const [claudeExpanded, setClaudeExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const copyText = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };

  const PROJECT_INSTRUCTIONS = `This project is for syncing my health records into Salve (a personal health management app).

The knowledge file salve-sync.jsx is the complete source code for a React artifact called "Salve Health Sync". It uses MCP connections to pull my medical records and export them as JSON that I import into Salve.

Whenever I ask you to sync, pull records, start the sync artifact, or anything similar, do this immediately, no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE contents of salve-sync.jsx into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have any health-related MCP connectors enabled (like Healthex for patient portals, or Function Health for lab panels). If I'm missing connectors the artifact needs, help me set them up step by step: tell me to open Claude settings → Connectors, search for the connector, and complete the OAuth sign-in. Don't assume I know where "Connectors" lives, spell out the exact clicks. Once connected, tell me to click "Pull Health Records" in the artifact.

Dependencies available in the Claude artifacts runtime: react and lucide-react. No other imports needed, no external API calls from the file itself.`;

  // ── Card renderers — same shell in either "Your connections" or "Browse sources" ──
  const renderAppleCard = ({ imported }) => (
    <HideableSource id="apple" label="Apple Health">
      <Card>
        <button onClick={() => toggleSource('apple')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${imported ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
              <Apple size={16} className={imported ? 'text-salve-lav' : 'text-salve-textFaint'} />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Apple Health</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${active.counts.apple_health || 0} records imported` : 'Vitals, workouts, labs from iPhone'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {imported && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
            {expandedSource === 'apple' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </div>
        </button>
        {expandedSource === 'apple' && (
          <div className="mt-3 pt-3 border-t border-salve-border/50">
            {imported && (
              <div className="flex justify-end mb-2">
                <button onClick={() => onNav('apple_health')} className="text-[12px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Apple Health data →</button>
              </div>
            )}
            <AppleHealthImport data={data} reloadData={reloadData} />
          </div>
        )}
      </Card>
    </HideableSource>
  );

  const renderMyChartCard = ({ imported }) => (
    <HideableSource id="mychart" label="MyChart">
      <Card>
        <button onClick={() => toggleSource('mychart')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${imported ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
              <FileText size={16} className={imported ? 'text-salve-sage' : 'text-salve-textFaint'} />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">MyChart</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${active.counts.mychart || 0} records imported` : 'Import records from Epic, Cerner, or any patient portal'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {imported && <span className="w-2 h-2 rounded-full bg-salve-sage" />}
            {expandedSource === 'mychart' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </div>
        </button>
        {expandedSource === 'mychart' && (
          <div className="mt-3 pt-3 border-t border-salve-border/50">
            <MyChartImport data={data} reloadData={reloadData} />
          </div>
        )}
      </Card>
    </HideableSource>
  );

  const renderClaudeSyncCard = ({ imported }) => (
    <HideableSource id="mcp" label="Claude Health Sync">
      <Card>
        <button onClick={() => setClaudeExpanded(v => !v)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
              <Sparkles size={16} className="text-salve-lav" />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Claude Health Sync</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${active.counts.mcp || 0} records imported` : 'Pull records from MCP providers'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {imported && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
            {claudeExpanded ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </div>
        </button>
        {claudeExpanded && (
          <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-4">
            <div className="bg-salve-lav/5 border border-salve-lav/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-salve-lav font-montserrat">Recommended · saves tokens</span>
              </div>
              <h4 className="text-[15px] text-salve-text font-medium font-montserrat mb-1">Create a Claude Project</h4>
              <p className="text-[13px] text-salve-textFaint leading-relaxed mb-3">
                A project stores the sync file once, so future syncs are just "sync my records" with no re-uploading.
              </p>
              <ol className="text-[13px] text-salve-textMid space-y-2.5 leading-relaxed list-decimal pl-5 mb-3">
                <li>On Claude.ai, click <strong className="text-salve-text">Projects</strong> → <strong className="text-salve-text">New project</strong>. Name it "Salve Health Sync".</li>
                <li>
                  Paste the project instructions into the description field.
                  <div className="mt-2">
                    <button
                      onClick={() => copyText(PROJECT_INSTRUCTIONS, 'instructions')}
                      className={`w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors border cursor-pointer font-montserrat ${
                        copiedField === 'instructions'
                          ? 'bg-salve-sage/15 border-salve-sage/30 text-salve-sage'
                          : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
                      }`}
                    >
                      <ClipboardCopy size={14} />
                      {copiedField === 'instructions' ? 'Copied!' : 'Copy project instructions'}
                    </button>
                  </div>
                </li>
                <li>
                  Upload <code className="text-salve-textMid text-[12px]">salve-sync.jsx</code> to the project's Files.
                  <div className="mt-2">
                    <a href="/salve-sync.jsx" download="salve-sync.jsx" className="w-full py-2.5 rounded-lg font-medium text-xs no-underline bg-gradient-to-r from-salve-lav/20 via-salve-sage/10 to-salve-lav/20 border border-salve-lav/30 text-salve-lav flex items-center justify-center gap-2 hover:border-salve-lav/50">
                      <Sparkles size={14} className="animate-pulse" />
                      Download salve-sync.jsx
                    </a>
                  </div>
                </li>
                <li>Start a new chat and say <em className="text-salve-textMid">"sync my health records"</em>.</li>
                <li>Pull records, download the JSON, and import it below.</li>
              </ol>
            </div>
            <div className="bg-salve-card2 border border-salve-border rounded-xl p-3">
              <h4 className="text-[13px] text-salve-text font-semibold uppercase tracking-wider font-montserrat mb-2">MCP connectors</h4>
              <p className="text-[12px] text-salve-textFaint leading-relaxed">
                The sync artifact pulls records through MCP connectors like <strong className="text-salve-textMid">Healthex</strong> (patient portals), <strong className="text-salve-textMid">Function Health</strong> (lab panels), and <strong className="text-salve-textMid">Nori Health</strong> (Apple Health + wearables). Claude will detect which connectors you have and walk you through setup.
              </p>
            </div>
          </div>
        )}
      </Card>
    </HideableSource>
  );

  const renderParserCard = ({ parser, Icon, tint, subtitle }, { imported }) => {
    const id = parser.META.id;
    const isOpen = expandedSource === id;
    const count = active.counts[id] || 0;
    return (
      <HideableSource key={id} id={id} label={parser.META.label}>
        <Card>
          <button onClick={() => toggleSource(id)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TINT_BG[tint]}`}>
                <Icon size={16} className={TINT_FG[tint]} />
              </div>
              <div className="text-left">
                <span className="text-[15px] text-salve-text font-medium block">{parser.META.label}</span>
                <span className="text-[12px] text-salve-textFaint">
                  {imported && count > 0 ? `${count} record${count === 1 ? '' : 's'} imported` : subtitle}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {imported && <span className={`w-2 h-2 rounded-full ${TINT_FG[tint]}`.replace('text-', 'bg-')} />}
              {isOpen ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {isOpen && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              <ImportWizard parser={parser} data={data} reloadData={reloadData} />
            </div>
          )}
        </Card>
      </HideableSource>
    );
  };

  const renderFloCard = () => (
    <HideableSource id="flo" label="Flo">
      <Card>
        <button onClick={() => toggleSource('flo')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-rose/15">
              <Heart size={16} className="text-salve-rose" />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Flo</span>
              <span className="text-[12px] text-salve-textFaint">Import cycle data from Flo GDPR export</span>
            </div>
          </div>
          {expandedSource === 'flo' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
        </button>
        {expandedSource === 'flo' && (
          <div className="mt-3 pt-3 border-t border-salve-border/50">
            <p className="text-[13px] text-salve-textMid font-montserrat leading-relaxed mb-2">
              Import your cycle history from Flo. Go to Flo → Profile → Settings → Request My Data, then upload the JSON file in the Cycle Tracker section.
            </p>
            <button
              onClick={() => onNav('cycles')}
              className="text-xs text-salve-rose font-montserrat bg-transparent border border-salve-rose/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-rose/10 transition-colors"
            >
              Go to Cycle Tracker →
            </button>
          </div>
        )}
      </Card>
    </HideableSource>
  );

  const renderTerraConnectCard = () => (
    <HideableSource id="terra" label="Connect a device">
      <Card>
        <button onClick={() => toggleSource('terra')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-sage/15">
              <Heart size={14} className="text-salve-sage" />
            </div>
            <div className="text-left">
              <span className="text-ui-lg text-salve-text font-medium block">Connect a device</span>
              <span className="text-ui-xs text-salve-textFaint">Fitbit, Garmin, Withings, Dexcom CGM, Whoop, Polar, and more</span>
            </div>
          </div>
          {expandedSource === 'terra' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
        </button>
        {expandedSource === 'terra' && (
          <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-3">
            <p className="text-ui-sm text-salve-textMid font-montserrat leading-relaxed">
              Connect a wearable, CGM, scale, or BP cuff. Salve uses Terra to handle the OAuth and pulls fresh data automatically as your device records it.
            </p>
            {terraError && (
              <p className="text-ui-sm text-salve-rose font-montserrat">{terraError}</p>
            )}
            <button
              onClick={handleTerraConnect}
              disabled={terraLoading || demoMode}
              className="w-full py-2.5 rounded-lg text-ui-base font-medium font-montserrat bg-salve-sage/15 border border-salve-sage/30 text-salve-sage hover:bg-salve-sage/25 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {terraLoading ? 'Opening picker...' : active.terraLive.length > 0 ? '+ Connect another device' : 'Connect a device →'}
            </button>
            {demoMode && (
              <p className="text-ui-xs text-salve-textFaint italic font-montserrat text-center">
                Demo mode. Sign up to connect your own devices.
              </p>
            )}
          </div>
        )}
      </Card>
    </HideableSource>
  );

  // Ordered list of imported items to render in Section 1 (top), in priority order.
  const importedInOrder = [
    ...(active.imported.has('apple_health') ? [{ kind: 'apple' }] : []),
    ...(active.imported.has('mychart') ? [{ kind: 'mychart' }] : []),
    ...(active.imported.has('mcp') ? [{ kind: 'mcp' }] : []),
    ...IMPORT_CATEGORIES.flatMap(cat => cat.items)
      .filter(item => active.imported.has(item.parser.META.id))
      .map(item => ({ kind: 'parser', item })),
  ];

  return (
    <div className="mt-2 space-y-4">
      {/* ── Section 1: Your connections ── */}
      <SectionTitle>Your connections</SectionTitle>
      {hasAnyConnection ? (
        <>
          {/* Live OAuth wearables — only the ones currently connected */}
          <Wearables
            data={data}
            addItem={addItem}
            addItemSilent={addItemSilent}
            reloadData={reloadData}
            onNav={onNav}
            demoMode={demoMode}
            expandedSource={expandedSource}
            setExpandedSource={setExpandedSource}
            toggleSource={toggleSource}
            sourceCounts={wearableSourceCounts}
            filter={(id) => active.live.has(id)}
            onConnectionChange={bumpConnectionTick}
            hiddenSources={hiddenSources}
            onHideSource={handleHideSource}
          />

          {/* Live Terra connections — one row per provider */}
          {active.terraLive.length > 0 && (
            <Card>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-sage/15">
                  <Heart size={14} className="text-salve-sage" />
                </div>
                <span className="text-[15px] text-salve-text font-medium">Connected devices (via Terra)</span>
              </div>
              <div className="space-y-1.5 mt-2">
                {active.terraLive.map(conn => (
                  <div key={conn.id} className="flex items-center justify-between bg-salve-card2 border border-salve-border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${conn.status === 'connected' ? 'bg-salve-sage' : 'bg-salve-textFaint'} flex-shrink-0`} />
                      <div className="min-w-0">
                        <div className="text-ui-base text-salve-text font-medium truncate">{providerLabel(conn.provider)}</div>
                        <div className="text-ui-xs text-salve-textFaint">
                          {conn.last_sync_at
                            ? `Last sync: ${new Date(conn.last_sync_at).toLocaleDateString()}`
                            : conn.status === 'connected' ? 'Waiting for first sync...' : 'Disconnected'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleTerraDisconnect(conn.id)}
                      aria-label={`Disconnect ${providerLabel(conn.provider)}`}
                      className="text-ui-xs text-salve-rose bg-transparent border-none cursor-pointer hover:underline font-montserrat flex-shrink-0 ml-2"
                    >
                      Disconnect
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Imported sources (file imports / MCP pulls with data present) */}
          {importedInOrder.map(entry => {
            if (entry.kind === 'apple') return <div key="apple">{renderAppleCard({ imported: true })}</div>;
            if (entry.kind === 'mychart') return <div key="mychart">{renderMyChartCard({ imported: true })}</div>;
            if (entry.kind === 'mcp') return <div key="mcp">{renderClaudeSyncCard({ imported: true })}</div>;
            if (entry.kind === 'parser') return <div key={entry.item.parser.META.id}>{renderParserCard(entry.item, { imported: true })}</div>;
            return null;
          })}
        </>
      ) : (
        <Card>
          <p className="text-[13px] text-salve-textMid font-montserrat leading-relaxed">
            You haven't connected anything yet. Drop a file below or browse sources to get started.
          </p>
        </Card>
      )}

      {/* ── Section 2: Universal Import (auto-detect drop zone) ── */}
      <div>
        <p className="text-ui-base text-salve-textMid font-montserrat mb-3 leading-relaxed">
          Drop any supported file here and Salve will figure out the format automatically.
        </p>
        <UniversalImport
          data={data}
          reloadData={reloadData}
          onManualFallback={() => setExpandedCategory(IMPORT_CATEGORIES[0].id)}
        />
      </div>

      {/* ── Section 3: Browse sources — everything not already in Section 1 ── */}
      <SectionTitle>Browse sources</SectionTitle>

      {/* Live sync — unconnected OAuth providers */}
      <Wearables
        data={data}
        addItem={addItem}
        addItemSilent={addItemSilent}
        reloadData={reloadData}
        onNav={onNav}
        demoMode={demoMode}
        expandedSource={expandedSource}
        setExpandedSource={setExpandedSource}
        toggleSource={toggleSource}
        sourceCounts={wearableSourceCounts}
        filter={(id) => !active.live.has(id)}
        onConnectionChange={bumpConnectionTick}
        hiddenSources={hiddenSources}
        onHideSource={handleHideSource}
      />

      {/* Terra "Connect a device" — always offered so users can add more */}
      {TERRA_ENABLED && renderTerraConnectCard()}

      {/* Medical records (only if not already promoted) */}
      {!active.imported.has('apple_health') && renderAppleCard({ imported: false })}
      {!active.imported.has('mychart') && renderMyChartCard({ imported: false })}
      {!active.imported.has('mcp') && renderClaudeSyncCard({ imported: false })}

      {/* App categories — each item filtered if already in Section 1 */}
      {IMPORT_CATEGORIES.map(cat => {
        const visibleItems = cat.items.filter(i => !hiddenSources.includes(i.parser.META.id) && !active.imported.has(i.parser.META.id));
        const hasFlo = cat.id === 'cycle' && !hiddenSources.includes('flo');
        const visibleCount = visibleItems.length + (hasFlo ? 1 : 0);
        if (visibleCount === 0) return null;
        const isCatOpen = expandedCategory === cat.id;
        return (
          <div key={cat.id}>
            <Card>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0"
                aria-expanded={isCatOpen}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base" aria-hidden="true">{cat.emoji}</span>
                  <span className="text-[15px] text-salve-text font-medium">{cat.label}</span>
                  <span className="text-[11px] text-salve-textFaint bg-salve-card2 rounded-full px-1.5 py-0.5 font-montserrat">{visibleCount}</span>
                </div>
                {isCatOpen ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
              </button>
            </Card>
            {isCatOpen && (
              <div className="space-y-2 mt-2 pl-3 border-l-2 border-salve-border/40">
                {visibleItems.map(item => renderParserCard(item, { imported: false }))}
                {hasFlo && renderFloCard()}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Show hidden sources ── */}
      {hiddenSources.length > 0 && (
        <div className="text-center mt-1">
          <button
            type="button"
            onClick={handleShowAllSources}
            className="text-[12px] text-salve-textFaint hover:text-salve-lav font-montserrat bg-transparent border-none cursor-pointer transition-colors"
          >
            {hiddenSources.length} hidden · Show all
          </button>
        </div>
      )}
    </div>
  );
}
