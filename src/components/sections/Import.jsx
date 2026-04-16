import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Apple, FileText, Heart, Moon, Thermometer, Smile, Gauge, Droplet, Droplets, Bike, Bed, Compass, Watch, Activity, Eye, Dna, X, Smartphone, Upload } from 'lucide-react';
import Card from '../ui/Card';
import { SectionTitle } from '../ui/FormWrap';
import UniversalImport from '../ui/UniversalImport';
import AppleHealthImport from '../ui/AppleHealthImport';
import MyChartImport from '../ui/MyChartImport';
import ImportWizard from '../ui/ImportWizard';
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

export default function Import({ data, reloadData, onNav, demoMode }) {
  const [expandedSource, setExpandedSource] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [hiddenSources, setHiddenSources] = useState(() => getHiddenSources());

  // Terra state
  const [terraConnections, setTerraConnections] = useState([]);
  const [terraLoading, setTerraLoading] = useState(false);
  const [terraError, setTerraError] = useState(null);

  // Load Terra connections on mount
  useEffect(() => {
    if (!TERRA_ENABLED) return;
    listTerraConnections().then(setTerraConnections).catch(() => {});
  }, []);

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

  // Counts for Apple Health status
  const sourceCounts = { apple_health: (data.vitals?.filter(v => v.source === 'apple_health').length || 0) + (data.activities?.filter(a => a.source === 'apple_health').length || 0) };
  const hasAppleHealth = sourceCounts.apple_health > 0;

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

  return (
    <div className="mt-2 space-y-4">
      {/* ── Universal Import (auto-detect drop zone) ── */}
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

      {/* ── Medical Records ── */}
      <SectionTitle>Medical Records</SectionTitle>

      <HideableSource id="apple" label="Apple Health">
        <Card>
          <button onClick={() => toggleSource('apple')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasAppleHealth ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
                <Apple size={16} className={hasAppleHealth ? 'text-salve-lav' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-[15px] text-salve-text font-medium block">Apple Health</span>
                <span className="text-[12px] text-salve-textFaint">
                  {hasAppleHealth ? `${sourceCounts.apple_health} records imported` : 'Vitals, workouts, labs from iPhone'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {hasAppleHealth && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
              {expandedSource === 'apple' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {expandedSource === 'apple' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              {hasAppleHealth && (
                <div className="flex justify-end mb-2">
                  <button onClick={() => onNav('apple_health')} className="text-[12px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Apple Health data →</button>
                </div>
              )}
              <AppleHealthImport data={data} reloadData={reloadData} />
            </div>
          )}
        </Card>
      </HideableSource>

      <HideableSource id="mychart" label="MyChart">
        <Card>
          <button onClick={() => toggleSource('mychart')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-sage/15">
                <FileText size={16} className="text-salve-sage" />
              </div>
              <div className="text-left">
                <span className="text-[15px] text-salve-text font-medium block">MyChart</span>
                <span className="text-[12px] text-salve-textFaint">Import records from Epic, Cerner, or any patient portal</span>
              </div>
            </div>
            {expandedSource === 'mychart' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'mychart' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              <MyChartImport data={data} reloadData={reloadData} />
            </div>
          )}
        </Card>
      </HideableSource>

      {/* ── App Imports by Category ── */}
      <SectionTitle>App Exports</SectionTitle>

      {IMPORT_CATEGORIES.map(cat => {
        const visibleItems = cat.items.filter(i => !hiddenSources.includes(i.parser.META.id));
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
                {visibleItems.map(({ parser, Icon, tint, subtitle }) => {
                  const id = parser.META.id;
                  const isOpen = expandedSource === id;
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
                              <span className="text-[12px] text-salve-textFaint">{subtitle}</span>
                            </div>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
                        </button>
                        {isOpen && (
                          <div className="mt-3 pt-3 border-t border-salve-border/50">
                            <ImportWizard parser={parser} data={data} reloadData={reloadData} />
                          </div>
                        )}
                      </Card>
                    </HideableSource>
                  );
                })}
                {hasFlo && (
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
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Connected Devices (Terra) ── */}
      {TERRA_ENABLED && (
        <>
          <SectionTitle>Connected Devices</SectionTitle>
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
                  {terraConnections.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-ui-xs text-salve-textFaint font-montserrat uppercase tracking-wider">Connected</div>
                      {terraConnections.map(conn => (
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
                  )}
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
                    {terraLoading ? 'Opening picker...' : terraConnections.length > 0 ? '+ Connect another device' : 'Connect a device →'}
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
        </>
      )}

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
