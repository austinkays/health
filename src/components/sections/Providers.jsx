import { useState, useCallback } from 'react';
import { Plus, Check, Edit, Trash2, User, Phone, Search, Loader2, MapPin, Star, Clock, Globe, ExternalLink, Info, X } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_PROVIDER } from '../../constants/defaults';
import { searchProviders } from '../../services/providerLookup';
import { searchPlaces, getPlaceDetails } from '../../services/placesLookup';

export default function Providers({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_PROVIDER);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // NPI search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchMode, setSearchMode] = useState('npi'); // 'npi' or 'places'

  // Places search state
  const [placesQuery, setPlacesQuery] = useState('');
  const [placesResults, setPlacesResults] = useState([]);
  const [placesSearching, setPlacesSearching] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(null);

  // Per-provider enrichment (list view)
  const [enrichedProviders, setEnrichedProviders] = useState(new Map());
  const [enrichingProvider, setEnrichingProvider] = useState(null);
  const [expandedProvider, setExpandedProvider] = useState(null);

  const handleNpiSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchProviders(searchQuery, searchState);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handlePlacesSearch = async () => {
    if (!placesQuery.trim()) return;
    setPlacesSearching(true);
    try {
      const results = await searchPlaces(placesQuery);
      setPlacesResults(results);
    } catch {
      setPlacesResults([]);
    } finally {
      setPlacesSearching(false);
    }
  };

  const selectNpiProvider = (p) => {
    setForm(prev => ({
      ...prev,
      name: p.name || prev.name,
      specialty: p.specialty || prev.specialty,
      clinic: [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ') || prev.clinic,
      phone: p.phone || prev.phone,
      fax: p.fax || prev.fax,
    }));
    closeSearch();
  };

  const selectPlacesResult = async (place) => {
    setLoadingDetails(place.place_id);
    try {
      const details = await getPlaceDetails(place.place_id);
      if (details) {
        setForm(prev => ({
          ...prev,
          name: prev.name || details.name,
          clinic: details.name + (details.address ? ', ' + details.address : ''),
          phone: details.phone || prev.phone,
          portal_url: details.website || prev.portal_url,
          notes: prev.notes || [
            details.rating ? `Rating: ${details.rating}/5 (${details.rating_count} reviews)` : null,
            details.hours ? `Hours: ${details.hours[0]}` : null,
            details.maps_url ? `Maps: ${details.maps_url}` : null,
          ].filter(Boolean).join('\n'),
        }));
      } else {
        // Fallback to basic info
        setForm(prev => ({
          ...prev,
          clinic: place.name + (place.address ? ', ' + place.address : ''),
        }));
      }
    } catch {
      setForm(prev => ({
        ...prev,
        clinic: place.name + (place.address ? ', ' + place.address : ''),
      }));
    } finally {
      setLoadingDetails(null);
      closeSearch();
    }
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchResults([]);
    setSearchQuery('');
    setPlacesResults([]);
    setPlacesQuery('');
  };

  // Enrich existing provider via Google Places
  const enrichProvider = useCallback(async (provider) => {
    setEnrichingProvider(provider.id);
    try {
      const query = [provider.name, provider.specialty, provider.clinic].filter(Boolean).join(' ');
      const results = await searchPlaces(query);
      if (results.length > 0) {
        const details = await getPlaceDetails(results[0].place_id);
        if (details) {
          setEnrichedProviders(prev => {
            const next = new Map(prev);
            next.set(provider.id, { ...details, search_results: results.length });
            return next;
          });
          setExpandedProvider(provider.id);
        }
      }
    } catch {
      // Silent failure
    } finally {
      setEnrichingProvider(null);
    }
  }, []);

  const saveP = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('providers', editId, form);
    } else {
      await addItem('providers', form);
    }
    setForm(EMPTY_PROVIDER);
    setEditId(null);
    setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Provider`} onBack={() => { setSubView(null); setForm(EMPTY_PROVIDER); setEditId(null); closeSearch(); }}>
      <Card>
        {/* Search buttons */}
        {!showSearch ? (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setShowSearch(true); setSearchMode('npi'); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-salve-lav/40 text-salve-lav text-xs font-medium bg-transparent cursor-pointer hover:bg-salve-lav/5 transition-colors font-montserrat"
            >
              <Search size={13} /> NPI Registry
            </button>
            <button
              onClick={() => { setShowSearch(true); setSearchMode('places'); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-salve-sage/40 text-salve-sage text-xs font-medium bg-transparent cursor-pointer hover:bg-salve-sage/5 transition-colors font-montserrat"
            >
              <MapPin size={13} /> Google Places
            </button>
          </div>
        ) : searchMode === 'npi' ? (
          <div className="mb-4 p-3.5 rounded-lg border border-salve-lav/30 bg-salve-lav/5">
            <div className="flex items-center gap-2 mb-2.5">
              <Search size={13} className="text-salve-lav" />
              <span className="text-xs font-semibold text-salve-lav uppercase tracking-wider">NPI Provider Search</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleNpiSearch(); }}
                placeholder="Provider name..."
                className="flex-1 py-2 px-3 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 focus:outline-none focus:border-salve-lav"
              />
              <input
                type="text"
                value={searchState}
                onChange={e => setSearchState(e.target.value)}
                placeholder="ST"
                maxLength={2}
                className="w-14 py-2 px-2 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 focus:outline-none focus:border-salve-lav text-center uppercase"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNpiSearch}
                disabled={searching || !searchQuery.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-salve-lav/20 text-salve-lav text-xs font-medium border-none cursor-pointer disabled:opacity-40 font-montserrat"
              >
                {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {searching ? 'Searching...' : 'Search'}
              </button>
              <button onClick={closeSearch} className="px-3 py-2 rounded-lg border border-salve-border text-salve-textMid text-xs bg-transparent cursor-pointer font-montserrat">
                Cancel
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-salve-border">
                {searchResults.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => selectNpiProvider(p)}
                    className="w-full text-left px-3 py-2.5 bg-transparent border-none border-b border-salve-border cursor-pointer hover:bg-salve-card2 transition-colors font-montserrat last:border-b-0"
                  >
                    <div className="text-sm text-salve-text font-medium">{p.name}</div>
                    {p.specialty && <div className="text-xs text-salve-lav">{p.specialty}</div>}
                    {p.city && <div className="text-[11px] text-salve-textFaint">{p.city}, {p.state} {p.zip}</div>}
                    {p.phone && <div className="text-[11px] text-salve-textFaint">{p.phone}</div>}
                  </button>
                ))}
              </div>
            )}

            {!searching && searchResults.length === 0 && searchQuery.trim() && (
              <p className="text-xs text-salve-textFaint italic mt-2 text-center">No results found.</p>
            )}
          </div>
        ) : (
          /* Google Places search */
          <div className="mb-4 p-3.5 rounded-lg border border-salve-sage/30 bg-salve-sage/5">
            <div className="flex items-center gap-2 mb-2.5">
              <MapPin size={13} className="text-salve-sage" />
              <span className="text-xs font-semibold text-salve-sage uppercase tracking-wider">Google Places Search</span>
            </div>
            <input
              type="text"
              value={placesQuery}
              onChange={e => setPlacesQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePlacesSearch(); }}
              placeholder="e.g. Dr. Smith rheumatology Portland OR"
              className="w-full py-2 px-3 mb-2 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 focus:outline-none focus:border-salve-sage"
            />
            <div className="flex gap-2">
              <button
                onClick={handlePlacesSearch}
                disabled={placesSearching || !placesQuery.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-salve-sage/20 text-salve-sage text-xs font-medium border-none cursor-pointer disabled:opacity-40 font-montserrat"
              >
                {placesSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {placesSearching ? 'Searching...' : 'Search'}
              </button>
              <button onClick={closeSearch} className="px-3 py-2 rounded-lg border border-salve-border text-salve-textMid text-xs bg-transparent cursor-pointer font-montserrat">
                Cancel
              </button>
            </div>

            {placesResults.length > 0 && (
              <div className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-salve-border">
                {placesResults.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => selectPlacesResult(p)}
                    disabled={loadingDetails === p.place_id}
                    className="w-full text-left px-3 py-2.5 bg-transparent border-none border-b border-salve-border cursor-pointer hover:bg-salve-card2 transition-colors font-montserrat last:border-b-0 disabled:opacity-50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-salve-text font-medium">{p.name}</span>
                      {loadingDetails === p.place_id && <Loader2 size={12} className="animate-spin text-salve-sage" />}
                    </div>
                    <div className="text-[11px] text-salve-textFaint">{p.address}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.rating && (
                        <span className="text-[11px] text-salve-amber flex items-center gap-0.5">
                          <Star size={10} fill="currentColor" /> {p.rating} ({p.rating_count})
                        </span>
                      )}
                      {p.open_now != null && (
                        <span className={`text-[11px] ${p.open_now ? 'text-salve-sage' : 'text-salve-textFaint'}`}>
                          {p.open_now ? 'Open now' : 'Closed'}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!placesSearching && placesResults.length === 0 && placesQuery.trim() && (
              <p className="text-xs text-salve-textFaint italic mt-2 text-center">No results found.</p>
            )}
          </div>
        )}

        <Field label="Name" value={form.name} onChange={v => sf('name', v)} placeholder="Dr. Name" required />
        <Field label="Specialty" value={form.specialty} onChange={v => sf('specialty', v)} placeholder="e.g. Rheumatology" />
        <Field label="Clinic / Office" value={form.clinic} onChange={v => sf('clinic', v)} placeholder="Clinic name" />
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

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Providers
      </SectionTitle>
      {data.providers.length === 0 ? <EmptyState icon={User} text="No providers added" motif="leaf" /> :
        data.providers.map(p => {
          const enriched = enrichedProviders.get(p.id);
          const isExpanded = expandedProvider === p.id;

          return (
            <Card key={p.id}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-salve-text">{p.name}</div>
                  {p.specialty && <div className="text-[13px] text-salve-lav font-medium">{p.specialty}</div>}
                  {p.clinic && <div className="text-xs text-salve-textMid mt-0.5">{p.clinic}</div>}
                  {p.phone && <div className="text-xs text-salve-textMid mt-1 flex items-center gap-1"><Phone size={12} strokeWidth={1.4} /> {p.phone}</div>}
                  {/* Show rating badge if enriched */}
                  {enriched?.rating && !isExpanded && (
                    <div className="flex items-center gap-1 mt-1">
                      <Star size={11} className="text-salve-amber" fill="currentColor" />
                      <span className="text-[11px] text-salve-amber font-medium">{enriched.rating}/5</span>
                      {enriched.rating_count && <span className="text-[10px] text-salve-textFaint">({enriched.rating_count})</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {/* Places lookup button */}
                  {enrichingProvider === p.id ? (
                    <Loader2 size={14} className="animate-spin text-salve-sage mt-1" />
                  ) : (
                    <button
                      onClick={() => enriched ? setExpandedProvider(isExpanded ? null : p.id) : enrichProvider(p)}
                      className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex hover:text-salve-sage transition-colors"
                      title="Look up on Google Places"
                    >
                      <MapPin size={15} className={enriched ? 'text-salve-sage' : ''} />
                    </button>
                  )}
                  <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={15} /></button>
                  <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={15} /></button>
                </div>
              </div>

              {/* Expanded Google Places info */}
              {enriched && isExpanded && (
                <div className="mt-3 pt-3 border-t border-salve-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-salve-sage" />
                      <span className="text-[10px] font-semibold text-salve-sage uppercase tracking-wider">Google Places</span>
                    </div>
                    <button onClick={() => setExpandedProvider(null)} className="bg-transparent border-none cursor-pointer p-0.5 flex text-salve-textFaint">
                      <X size={12} />
                    </button>
                  </div>
                  {enriched.address && (
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <MapPin size={11} className="text-salve-textFaint mt-0.5 shrink-0" />
                      <span className="text-xs text-salve-textMid">{enriched.address}</span>
                    </div>
                  )}
                  {enriched.phone && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Phone size={11} className="text-salve-textFaint" />
                      <span className="text-xs text-salve-textMid">{enriched.phone}</span>
                    </div>
                  )}
                  {enriched.rating && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Star size={11} className="text-salve-amber" fill="currentColor" />
                      <span className="text-xs text-salve-amber font-medium">{enriched.rating}/5</span>
                      {enriched.rating_count && <span className="text-[11px] text-salve-textFaint">({enriched.rating_count} reviews)</span>}
                    </div>
                  )}
                  {enriched.open_now != null && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Clock size={11} className="text-salve-textFaint" />
                      <span className={`text-xs ${enriched.open_now ? 'text-salve-sage font-medium' : 'text-salve-textFaint'}`}>
                        {enriched.open_now ? 'Open now' : 'Currently closed'}
                      </span>
                    </div>
                  )}
                  {enriched.hours && (
                    <div className="mb-1.5">
                      <span className="text-[10px] text-salve-textFaint font-semibold uppercase tracking-wider">Hours</span>
                      <div className="text-xs text-salve-textMid mt-0.5 space-y-0.5">
                        {enriched.hours.map((h, i) => <div key={i}>{h}</div>)}
                      </div>
                    </div>
                  )}
                  {enriched.website && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Globe size={11} className="text-salve-textFaint" />
                      <a href={enriched.website} target="_blank" rel="noopener noreferrer" className="text-xs text-salve-lav hover:underline truncate">
                        {enriched.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </a>
                    </div>
                  )}
                  {enriched.maps_url && (
                    <a href={enriched.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-salve-sage hover:underline mt-1">
                      <ExternalLink size={10} /> View on Google Maps
                    </a>
                  )}
                  <p className="text-[10px] text-salve-textFaint italic mt-2">Source: Google Places</p>
                </div>
              )}

              <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('providers', id))} onCancel={del.cancel} itemId={p.id} />
            </Card>
          );
        })
      }
    </div>
  );
}
