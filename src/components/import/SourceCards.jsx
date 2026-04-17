import { useState } from 'react';
import { ChevronDown, ChevronUp, Apple, FileText, Heart, Sparkles, ClipboardCopy } from 'lucide-react';
import Card from '../ui/Card';
import AppleHealthImport from '../ui/AppleHealthImport';
import MyChartImport from '../ui/MyChartImport';
import ImportWizard from '../ui/ImportWizard';
import HideableSource from './HideableSource';
import { TINT_BG, TINT_FG, PROJECT_INSTRUCTIONS } from '../../constants/importCategories';

export function AppleCard({ imported, expandedSource, toggleSource, counts, hiddenSources, onHide, data, reloadData, onNav }) {
  return (
    <HideableSource id="apple" label="Apple Health" hiddenSources={hiddenSources} onHide={onHide}>
      <Card>
        <button onClick={() => toggleSource('apple')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${imported ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
              <Apple size={16} className={imported ? 'text-salve-lav' : 'text-salve-textFaint'} />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Apple Health</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${counts.apple_health || 0} records imported` : 'Vitals, workouts, labs from iPhone'}
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
}

export function MyChartCard({ imported, expandedSource, toggleSource, counts, hiddenSources, onHide, data, reloadData }) {
  return (
    <HideableSource id="mychart" label="MyChart" hiddenSources={hiddenSources} onHide={onHide}>
      <Card>
        <button onClick={() => toggleSource('mychart')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${imported ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
              <FileText size={16} className={imported ? 'text-salve-sage' : 'text-salve-textFaint'} />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">MyChart</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${counts.mychart || 0} records imported` : 'Import records from Epic, Cerner, or any patient portal'}
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
}

export function ClaudeSyncCard({ imported, counts, hiddenSources, onHide }) {
  const [claudeExpanded, setClaudeExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const copyText = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {});
  };
  return (
    <HideableSource id="mcp" label="Claude Health Sync" hiddenSources={hiddenSources} onHide={onHide}>
      <Card>
        <button onClick={() => setClaudeExpanded(v => !v)} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
              <Sparkles size={16} className="text-salve-lav" />
            </div>
            <div className="text-left">
              <span className="text-[15px] text-salve-text font-medium block">Claude Health Sync</span>
              <span className="text-[12px] text-salve-textFaint">
                {imported ? `${counts.mcp || 0} records imported` : 'Pull records from MCP providers'}
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
}

export function ParserCard({ parser, Icon, tint, subtitle, imported, expandedSource, toggleSource, counts, hiddenSources, onHide, data, reloadData }) {
  const id = parser.META.id;
  const isOpen = expandedSource === id;
  const count = counts[id] || 0;
  return (
    <HideableSource id={id} label={parser.META.label} hiddenSources={hiddenSources} onHide={onHide}>
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
}

export function FloCard({ expandedSource, toggleSource, hiddenSources, onHide, onNav }) {
  return (
    <HideableSource id="flo" label="Flo" hiddenSources={hiddenSources} onHide={onHide}>
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
}

export function TerraConnectCard({ expandedSource, toggleSource, hiddenSources, onHide, terraLoading, terraError, hasTerraLive, onTerraConnect, demoMode }) {
  return (
    <HideableSource id="terra" label="Connect a device" hiddenSources={hiddenSources} onHide={onHide}>
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
              onClick={onTerraConnect}
              disabled={terraLoading || demoMode}
              className="w-full py-2.5 rounded-lg text-ui-base font-medium font-montserrat bg-salve-sage/15 border border-salve-sage/30 text-salve-sage hover:bg-salve-sage/25 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {terraLoading ? 'Opening picker...' : hasTerraLive ? '+ Connect another device' : 'Connect a device →'}
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
}
