import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp, Heart } from 'lucide-react';
import Card from '../ui/Card';
import { SectionTitle } from '../ui/FormWrap';
import UniversalImport from '../ui/UniversalImport';
import Wearables from '../settings/Wearables';
import { startTerraConnect, listTerraConnections, disconnectTerraConnection, providerLabel, TERRA_ENABLED } from '../../services/terra';
import { getHiddenSources, hideSource, unhideAllSources } from '../../utils/hiddenSources';
import { computeActiveSources } from '../../utils/activeSources';
import { IMPORT_CATEGORIES } from '../../constants/importCategories';
import { AppleCard, MyChartCard, ClaudeSyncCard, ParserCard, FloCard, TerraConnectCard } from '../import/SourceCards';

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

  // Common props for card components
  const cardProps = {
    expandedSource,
    toggleSource,
    counts: active.counts,
    hiddenSources,
    onHide: handleHideSource,
  };

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
            if (entry.kind === 'apple') return <div key="apple"><AppleCard {...cardProps} imported data={data} reloadData={reloadData} onNav={onNav} /></div>;
            if (entry.kind === 'mychart') return <div key="mychart"><MyChartCard {...cardProps} imported data={data} reloadData={reloadData} /></div>;
            if (entry.kind === 'mcp') return <div key="mcp"><ClaudeSyncCard {...cardProps} imported /></div>;
            if (entry.kind === 'parser') return <div key={entry.item.parser.META.id}><ParserCard {...cardProps} imported {...entry.item} data={data} reloadData={reloadData} /></div>;
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
      {TERRA_ENABLED && (
        <TerraConnectCard
          {...cardProps}
          terraLoading={terraLoading}
          terraError={terraError}
          hasTerraLive={active.terraLive.length > 0}
          onTerraConnect={handleTerraConnect}
          demoMode={demoMode}
        />
      )}

      {/* Medical records (only if not already promoted) */}
      {!active.imported.has('apple_health') && <AppleCard {...cardProps} imported={false} data={data} reloadData={reloadData} onNav={onNav} />}
      {!active.imported.has('mychart') && <MyChartCard {...cardProps} imported={false} data={data} reloadData={reloadData} />}
      {!active.imported.has('mcp') && <ClaudeSyncCard {...cardProps} imported={false} />}

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
                {visibleItems.map(item => (
                  <ParserCard key={item.parser.META.id} {...cardProps} imported={false} {...item} data={data} reloadData={reloadData} />
                ))}
                {hasFlo && <FloCard {...cardProps} onNav={onNav} />}
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
