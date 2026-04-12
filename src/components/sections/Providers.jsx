import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Plus, Check, Edit, Trash2, User, Phone, ExternalLink, ChevronDown, Search, Loader, MapPin, Pill, Stethoscope, Star } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { EMPTY_PROVIDER } from '../../constants/defaults';
import { searchProviders } from '../../services/npi';
import { mapsUrl } from '../../utils/maps';
import { dailyMedUrl } from '../../utils/links';
import SplitView, { useIsDesktop } from '../layout/SplitView';

export default function Providers({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (highlightId && data.providers.some(p => p.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [npiResults, setNpiResults] = useState([]);
  const [npiLoading, setNpiLoading] = useState(false);
  const [npiError, setNpiError] = useState(null);
  const [showNpi, setShowNpi] = useState(false);
  const npiRef = useRef(null);
  const npiTimerRef = useRef(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* ── Cross-reference: meds prescribed by + conditions treated by each provider ── */
  const medsPerProvider = useMemo(() => {
    const map = {};
    (data.providers || []).forEach(p => {
      const name = p.name.trim().toLowerCase();
      map[p.id] = (data.meds || []).filter(m =>
        m.active !== false && m.prescriber && m.prescriber.trim().toLowerCase() === name
      );
    });
    return map;
  }, [data.providers, data.meds]);

  const conditionsPerProvider = useMemo(() => {
    const map = {};
    (data.providers || []).forEach(p => {
      const name = p.name.trim().toLowerCase();
      map[p.id] = (data.conditions || []).filter(c =>
        c.provider && c.provider.trim().toLowerCase() === name
      );
    });
    return map;
  }, [data.providers, data.conditions]);

  /* ── NPI search (debounced) ── */
  const handleNameSearch = useCallback(() => {
    const name = form.name?.trim();
    if (!name || name.length < 3) return;
    setNpiLoading(true);
    setNpiError(null);
    setShowNpi(true);
    searchProviders(name)
      .then(results => setNpiResults(results))
      .catch(() => { setNpiResults([]); setNpiError('Search unavailable'); })
      .finally(() => setNpiLoading(false));
  }, [form.name]);

  const selectNpiResult = useCallback((result) => {
    setForm(p => ({
      ...p,
      name: result.name,
      specialty: result.specialty || p.specialty,
      clinic: result.organization || p.clinic,
      phone: result.phone || p.phone,
      fax: result.fax || p.fax,
      npi: result.npi,
      address: result.address || p.address,
    }));
    setNpiResults([]);
    setShowNpi(false);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (npiRef.current && !npiRef.current.contains(e.target)) setShowNpi(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const saveP = async () => {
    if (!form.name.trim()) return;
    const { id, ...payload } = form;
    if (editId) {
      await updateItem('providers', editId, payload);
    } else {
      await addItem('providers', payload);
    }
    setForm(EMPTY_PROVIDER);
    setEditId(null);
    setSubView(null);
  };

  const toggleFavorite = async (p) => {
    await updateItem('providers', p.id, { is_favorite: !p.is_favorite });
  };

  /* ── Sort: favorites first, then alphabetical ── */
  const sortedProviders = useMemo(() =>
    [...data.providers].sort((a, b) => {
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [data.providers]
  );

  const renderProviderDetail = (p) => {
    const prescribedMeds = medsPerProvider[p.id] || [];
    const treatedConditions = conditionsPerProvider[p.id] || [];
    return (
      <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
        {/* Desktop: show provider name + specialty as title in detail pane */}
        {isDesktop && (
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-salve-text font-playfair m-0 flex items-center gap-1.5">
              {p.name}
              {p.is_favorite && <Star size={14} className="text-salve-amber fill-salve-amber flex-shrink-0" />}
            </h3>
            {p.specialty && <div className="text-sm text-salve-lav font-medium mt-0.5">{p.specialty}</div>}
          </div>
        )}
        {p.clinic && <div className="text-xs text-salve-textMid mb-0.5">{p.clinic}</div>}
        {p.address && (
          <div className="text-xs text-salve-textMid mt-0.5 flex items-center gap-1">
            <MapPin size={12} strokeWidth={1.4} className="flex-shrink-0" />
            <a href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline">{p.address}</a>
          </div>
        )}
        {!p.address && p.clinic && (
          <div className="text-xs text-salve-textFaint mt-0.5 flex items-center gap-1">
            <MapPin size={11} strokeWidth={1.4} />
            <a href={mapsUrl(p.clinic)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline text-[13px]">View on Maps</a>
          </div>
        )}
        {p.phone && <div className="text-xs text-salve-textMid mt-1 flex items-center gap-1"><Phone size={12} strokeWidth={1.4} /> <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-salve-sage hover:underline">{p.phone}</a></div>}
        {p.fax && <div className="text-xs text-salve-textFaint mt-0.5">Fax: {p.fax}</div>}
        {p.portal_url && <div className="text-xs text-salve-textMid mt-1 flex items-center gap-1"><ExternalLink size={12} strokeWidth={1.4} aria-hidden="true" /> <a href={p.portal_url.startsWith('http') ? p.portal_url : `https://${p.portal_url}`} target="_blank" rel="noopener noreferrer" aria-label={`Patient portal for ${p.name} (opens in new tab)`} className="text-salve-lav hover:underline truncate">Patient Portal</a></div>}
        {p.npi && (
          <div className="text-[12px] text-salve-textFaint mt-1 flex items-center gap-1">
            <ExternalLink size={10} strokeWidth={1.4} aria-hidden="true" />
            <span>NPI:</span>
            <a
              href={`https://npiregistry.cms.hhs.gov/provider-view/${p.npi}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`NPI ${p.npi}, view in CMS registry (opens in new tab)`}
              className="text-salve-sage hover:underline"
            >
              {p.npi}
            </a>
            <span className="text-salve-textFaint/60">· CMS Registry</span>
          </div>
        )}
        {p.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{p.notes}</div>}
        {/* ── Prescribed medications ── */}
        {prescribedMeds.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-salve-border/30">
            <div className="text-[13px] font-semibold text-salve-sage mb-1 flex items-center gap-1"><Pill size={11} /> Prescribed Medications ({prescribedMeds.length})</div>
            {prescribedMeds.map(m => (
              <div key={m.id} className="text-xs text-salve-textMid py-0.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-salve-sage flex-shrink-0" />
                <a href={dailyMedUrl(m.fda_data?.brand_name || m.fda_data?.generic_name || m.display_name || m.name, m.rxcui, m.fda_data?.spl_set_id)} target="_blank" rel="noopener noreferrer" className="font-medium text-salve-text hover:text-salve-sage hover:underline transition-colors">{m.display_name || m.name}</a>
                {m.dose && <span className="text-salve-textFaint">{m.dose}</span>}
              </div>
            ))}
          </div>
        )}
        {/* ── Treated conditions ── */}
        {treatedConditions.length > 0 && (
          <div className="mt-2 pt-2 border-t border-salve-border/30">
            <div className="text-[13px] font-semibold text-salve-lav mb-1 flex items-center gap-1"><Stethoscope size={11} /> Conditions ({treatedConditions.length})</div>
            {treatedConditions.map(c => (
              <div key={c.id} className="text-xs text-salve-textMid py-0.5 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-salve-lav flex-shrink-0" />
                <span className="font-medium text-salve-text">{c.name}</span>
                <span className="text-[12px] text-salve-textFaint capitalize">{c.status}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2.5 mt-2.5">
          <button onClick={() => toggleFavorite(p)} aria-label={p.is_favorite ? 'Remove from favorites' : 'Add to favorites'} className="bg-transparent border-none cursor-pointer text-salve-amber text-xs font-montserrat p-0 flex items-center gap-1"><Star size={12} className={p.is_favorite ? 'fill-salve-amber' : ''} /> {p.is_favorite ? 'Unfavorite' : 'Favorite'}</button>
          <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} aria-label="Edit provider" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
          <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
        </div>
      </div>
    );
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Provider`} onBack={() => { setSubView(null); setForm(EMPTY_PROVIDER); setEditId(null); }}>
      <Card>
        <div className="relative" ref={npiRef}>
          <Field label="Name" value={form.name} onChange={v => sf('name', v)} placeholder="Dr. Name" required />
          <button
            onClick={handleNameSearch}
            disabled={npiLoading || !form.name?.trim() || form.name.trim().length < 3}
            className="absolute right-3 top-7 bg-transparent border border-salve-sage/40 rounded-lg px-2 py-1 cursor-pointer text-salve-sage text-[12px] font-montserrat flex items-center gap-1 hover:bg-salve-sage/10 disabled:opacity-40 disabled:cursor-default transition-colors"
          >
            {npiLoading ? <Loader size={10} className="animate-spin" /> : <Search size={10} />}
            NPI Lookup
          </button>
          {showNpi && (npiResults.length > 0 || npiLoading || npiError) && (
            <div className="absolute z-20 left-0 right-0 top-full -mt-3 bg-salve-card2 border border-salve-border rounded-lg shadow-lg max-h-56 overflow-y-auto" role="listbox" aria-label="Provider suggestions">
              {npiLoading && <div className="px-3 py-2 text-xs text-salve-textFaint flex items-center gap-1.5"><Loader size={11} className="animate-spin" /> Searching NPI Registry...</div>}
              {npiError && !npiLoading && <div className="px-3 py-2 text-xs text-salve-rose" role="alert">{npiError}</div>}
              {npiResults.map((r, i) => (
                <button
                  key={`${r.npi}-${i}`}
                  onClick={() => selectNpiResult(r)}
                  role="option"
                  className="w-full text-left px-3 py-2.5 text-sm text-salve-text hover:bg-salve-lav/10 cursor-pointer bg-transparent border-none font-montserrat border-b border-salve-border/30 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-[15px]">{r.name}</div>
                  {r.specialty && <div className="text-[13px] text-salve-lav">{r.specialty}</div>}
                  {r.address && <div className="text-[13px] text-salve-textFaint truncate">{r.address}</div>}
                  <div className="text-[12px] text-salve-textFaint mt-0.5">NPI: {r.npi}{r.phone ? ` · ${r.phone}` : ''}</div>
                </button>
              ))}
              {!npiLoading && npiResults.length === 0 && showNpi && <div className="px-3 py-2 text-xs text-salve-textFaint">No results found</div>}
            </div>
          )}
          {form.npi && <div className="text-[12px] text-salve-textFaint -mt-3 mb-3">NPI: {form.npi} · Verified in CMS registry</div>}
        </div>
        <Field label="Specialty" value={form.specialty} onChange={v => sf('specialty', v)} placeholder="e.g. Rheumatology" />
        <Field label="Clinic / Office" value={form.clinic} onChange={v => sf('clinic', v)} placeholder="Clinic name" />
        <Field label="Address" value={form.address} onChange={v => sf('address', v)} placeholder="123 Medical Dr, City, ST 12345" />
        <Field label="Phone" value={form.phone} onChange={v => sf('phone', v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Fax" value={form.fax} onChange={v => sf('fax', v)} type="tel" />
        <Field label="Patient Portal" value={form.portal_url} onChange={v => sf('portal_url', v)} placeholder="https://..." />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Office hours, best contact..." />
        <div className="flex gap-2">
          <Button onClick={saveP} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_PROVIDER); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const listContent = (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>
      {data.providers.length === 0 ? (
        <EmptyState
          icon={User}
          text="No providers added"
          hint="Add your doctors, therapists, and specialists. NPI lookup pre-fills clinic info, and cross-linking shows which meds and conditions each one manages."
          motif="leaf"
          actionLabel="Add your first provider"
          onAction={() => setSubView('form')}
        />
      ) :
        sortedProviders.map(p => {
          const isExpanded = expandedId === p.id;
          const prescribedMeds = medsPerProvider[p.id] || [];
          const treatedConditions = conditionsPerProvider[p.id] || [];
          return (
          <Card key={p.id} id={`record-${p.id}`} onClick={() => setExpandedId(isExpanded ? null : p.id)} className={`cursor-pointer transition-all${highlightId === p.id ? ' highlight-ring' : ''}${isDesktop && expandedId === p.id ? ' ring-2 ring-salve-lav/30' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-salve-text flex items-center gap-1.5">
                  {p.name}
                  {p.is_favorite && <Star size={12} className="text-salve-amber fill-salve-amber flex-shrink-0" />}
                </div>
                {p.specialty && <div className="text-[15px] text-salve-lav font-medium">{p.specialty}</div>}
                {p.clinic && !isExpanded && <div className="text-xs text-salve-textMid mt-0.5 truncate">{p.clinic}</div>}
                {!isExpanded && (prescribedMeds.length > 0 || treatedConditions.length > 0) && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {prescribedMeds.length > 0 && (
                      <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[12px] text-salve-sage font-medium">
                        <Pill size={10} /> {prescribedMeds.length} med{prescribedMeds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {treatedConditions.length > 0 && (
                      <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-salve-lav/10 border border-salve-lav/20 text-[12px] text-salve-lav font-medium">
                        <Stethoscope size={10} /> {treatedConditions.length} condition{treatedConditions.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            {/* Mobile: inline expand. Desktop: detail goes to side pane */}
            {!isDesktop && (
              <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                {isExpanded && renderProviderDetail(p)}
              </div></div>
            )}
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('providers', id))} onCancel={del.cancel} itemId={p.id} />
          </Card>
          );
        })
      }
    </div>
  );

  const selectedProvider = isDesktop ? sortedProviders.find(p => p.id === expandedId) : null;

  return (
    <SplitView
      list={listContent}
      detail={selectedProvider ? (
        <Card className="!mb-0">
          {renderProviderDetail(selectedProvider)}
        </Card>
      ) : null}
      emptyMessage="Select a provider to view details"
      detailKey={expandedId}
    />
  );
}
