import { useState, useMemo, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, Calendar, Sparkles, Loader, MapPin, Phone, CalendarPlus, Video } from 'lucide-react';
import { mapsUrl } from '../../utils/maps';
import { providerLookupUrl, googleCalendarUrl } from '../../utils/links';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import Motif, { Divider } from '../ui/Motif';
import FormWrap from '../ui/FormWrap';
import { EMPTY_APPOINTMENT } from '../../constants/defaults';
import { fmtDate, daysUntil } from '../../utils/dates';
import { C } from '../../constants/colors';
import { fetchAppointmentPrep } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';

export default function Appointments({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_APPOINTMENT);
  const [editId, setEditId] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [prepLoading, setPrepLoading] = useState(null);
  const [prepResult, setPrepResult] = useState({});
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId) {
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]);

  /* ── Provider options from saved providers ── */
  const providerOptions = useMemo(() => [
    ...(data.providers || []).map(p => ({
      value: p.name,
      label: `${p.name}${p.specialty ? ` · ${p.specialty}` : ''}`,
    })),
    { value: '__custom', label: '+ Type a custom name' },
  ], [data.providers]);

  /* ── Location autofill options from provider addresses ── */
  const locationOptions = useMemo(() => {
    const locs = new Set();
    (data.providers || []).forEach(p => {
      if (p.address) locs.add(p.address);
      if (p.clinic) locs.add(p.clinic);
    });
    if (locs.size === 0) return null;
    return [
      ...[...locs].map(l => ({ value: l, label: l })),
      { value: '__custom', label: '+ Type a custom location' },
    ];
  }, [data.providers]);

  /* ── Provider info lookup for appointments ── */
  const providerInfo = useMemo(() => {
    const map = {};
    (data.providers || []).forEach(p => {
      map[p.name.trim().toLowerCase()] = p;
    });
    return map;
  }, [data.providers]);

  const prepareVisit = async (appt) => {
    setPrepLoading(appt.id);
    try {
      const result = await fetchAppointmentPrep(appt, buildProfile(data));
      setPrepResult(p => ({ ...p, [appt.id]: result }));
    } catch (e) {
      setPrepResult(p => ({ ...p, [appt.id]: 'Unable to prepare suggestions right now. ' + e.message }));
    } finally {
      setPrepLoading(null);
    }
  };

  const saveA = async () => {
    if (!form.date) {
      setSaveError('Please choose a date for the appointment.');
      return;
    }
    setSaveError(null);
    // Strip any non-DB fields that can sneak in when the form was seeded
    // from an existing row (Edit flow). Sending `id` / `created_at` /
    // `updated_at` / `user_id` inside an insert payload works for some
    // tables but trips PostgREST on others, and it has no business
    // being in the form state anyway.
    const { id: _id, created_at: _ca, updated_at: _ua, user_id: _uid, ...payload } = form;
    try {
      if (editId) {
        await updateItem('appointments', editId, payload);
      } else {
        await addItem('appointments', payload);
      }
      setForm(EMPTY_APPOINTMENT);
      setEditId(null);
      setSubView(null);
    } catch (err) {
      console.error('[Appointments] Save failed:', err);
      setSaveError(err?.message || 'Save failed. Please try again.');
    }
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'New'} Appointment`} onBack={() => { setSubView(null); setForm(EMPTY_APPOINTMENT); setEditId(null); setSaveError(null); }}>
      <Card>
        <Field label="Date" value={form.date} onChange={v => sf('date', v)} type="date" required />
        <Field label="Time" value={form.time} onChange={v => sf('time', v)} type="time" />
        <Field label="Provider" value={form.provider} onChange={v => {
          sf('provider', v);
          // Auto-fill location from provider's address if available
          if (v && v !== '__custom') {
            const prov = providerInfo[v.trim().toLowerCase()];
            if (prov?.address && !form.location) sf('location', prov.address);
          }
        }} options={providerOptions} />
        {form.provider === '__custom' && (
          <Field label="Custom Provider" value="" onChange={v => sf('provider', v)} placeholder="Dr. Name" />
        )}
        {locationOptions ? (
          <>
            <Field label="Location" value={form.location} onChange={v => sf('location', v)} options={locationOptions} />
            {form.location === '__custom' && (
              <Field label="Custom Location" value="" onChange={v => sf('location', v)} placeholder="Clinic, hospital..." />
            )}
          </>
        ) : (
          <Field label="Location" value={form.location} onChange={v => sf('location', v)} placeholder="Clinic, hospital..." />
        )}
        <Field label="Reason" value={form.reason} onChange={v => sf('reason', v)} placeholder="Follow-up, labs..." />
        <Field label="Video Call Link" value={form.video_call_url} onChange={v => sf('video_call_url', v)} placeholder="https://zoom.us/j/... or Teams link" />
        <Field label="Questions to Ask" value={form.questions} onChange={v => sf('questions', v)} textarea placeholder="Things to bring up..." />
        <Field label="Post-Visit Notes" value={form.post_notes} onChange={v => sf('post_notes', v)} textarea placeholder="What happened..." />
        {saveError && (
          <div className="text-xs text-salve-rose font-montserrat bg-salve-rose/10 border border-salve-rose/20 rounded-lg p-2.5 mb-2">
            {saveError}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={saveA}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_APPOINTMENT); setEditId(null); setSaveError(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  const up = data.appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString()));
  const past = data.appts.filter(a => new Date(a.date) < new Date(new Date().toDateString())).reverse();

  return (
    <div className="mt-2">
      <div className="flex justify-end mb-3">
        <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
      </div>

      {data.appts.length === 0 ? (
        <EmptyState
          icon={Calendar}
          text="No appointments yet"
          hint="Log upcoming visits to get AI-drafted questions, auto-filled provider locations, and calendar links."
          motif="moon"
          actionLabel="Add your first appointment"
          onAction={() => setSubView('form')}
        />
      ) : (
        <>
          {up.length > 0 && (
            <div className="text-[13px] font-semibold text-salve-sage uppercase tracking-widest mb-2">
              <Motif type="leaf" size={12} color={C.sage} style={{ marginRight: 4 }} /> Upcoming
            </div>
          )}
          <div className="md:grid md:grid-cols-2 md:gap-4">{up.map(a => (
            <Card key={a.id} id={`record-${a.id}`} style={{ borderLeft: `3px solid ${C.sage}` }} className={highlightId === a.id ? 'highlight-ring' : ''}>
              <div className="flex justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-salve-text">{a.reason || 'Appointment'}</div>
                  <div className="text-xs text-salve-textMid mt-0.5">{a.provider ? <a href={providerLookupUrl(a.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{a.provider}</a> : ''}{a.location ? <>{a.provider ? ' · ' : ''}<a href={mapsUrl(a.location)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline inline-flex items-center gap-0.5"><MapPin size={10} strokeWidth={1.5} />{a.location}</a></> : ''}</div>
                  {/* ── Provider phone quick-link ── */}
                  {a.provider && providerInfo[a.provider.trim().toLowerCase()]?.phone && /\d{3,}/.test(providerInfo[a.provider.trim().toLowerCase()].phone) && (
                    <div className="text-[13px] text-salve-textFaint mt-0.5 flex items-center gap-1">
                      <Phone size={10} strokeWidth={1.4} />
                      <a href={`tel:${providerInfo[a.provider.trim().toLowerCase()].phone.replace(/[^\d+]/g, '')}`} className="text-salve-sage hover:underline">
                        {providerInfo[a.provider.trim().toLowerCase()].phone}
                      </a>
                    </div>
                  )}
                  {a.video_call_url && (
                    <div className="text-[13px] text-salve-textFaint mt-0.5 flex items-center gap-1">
                      <Video size={10} strokeWidth={1.4} />
                      <a href={a.video_call_url.startsWith('http') ? a.video_call_url : `https://${a.video_call_url}`} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">Join Video Call</a>
                    </div>
                  )}
                  {a.questions && <div className="text-xs text-salve-sage mt-1.5 p-1.5 bg-salve-sage/10 rounded-lg">✧ {a.questions.slice(0, 80)}{a.questions.length > 80 ? '...' : ''}</div>}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="text-[15px] font-semibold text-salve-sage">{daysUntil(a.date)}</div>
                  <div className="text-[13px] text-salve-textFaint">{fmtDate(a.date)}</div>
                  {a.time && <div className="text-[13px] text-salve-textFaint">{a.time}</div>}
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} aria-label="Edit appointment" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
                <button onClick={() => del.ask(a.id, a.reason || 'appointment')} aria-label="Delete appointment" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
                {(() => { const calUrl = googleCalendarUrl({ title: a.reason || 'Appointment', date: a.date, time: a.time, location: a.location, details: a.questions ? `Questions: ${a.questions}` : '' }); return calUrl ? <a href={calUrl} target="_blank" rel="noopener noreferrer" className="text-salve-sage text-xs font-montserrat flex items-center gap-1 no-underline hover:underline"><CalendarPlus size={11} /> Add to Calendar</a> : null; })()}
                {hasAIConsent() && (
                  <button
                    onClick={() => prepareVisit(a)}
                    disabled={prepLoading === a.id}
                    aria-label="Prepare for visit with Sage"
                    className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"
                  >
                    {prepLoading === a.id ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {prepLoading === a.id ? 'Preparing...' : 'Prepare'}
                  </button>
                )}
              </div>
              {prepResult[a.id] && (
                <div className="mt-2 p-2.5 rounded-lg bg-salve-lav/8 border border-salve-lav/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[13px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Sage Visit Prep</div>
                    <button onClick={() => setPrepResult(p => { const n = {...p}; delete n[a.id]; return n; })} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss visit prep">×</button>
                  </div>
                  <AIMarkdown compact>{prepResult[a.id]}</AIMarkdown>
                </div>
              )}
              <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appointments', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          ))}</div>
          {past.length > 0 && <><Divider /><div className="text-[13px] font-semibold text-salve-textFaint uppercase tracking-widest mb-2">Past</div></>}
          <div className="md:grid md:grid-cols-2 md:gap-4">{past.slice(0, 10).map(a => (
            <Card key={a.id} id={`record-${a.id}`} className={`opacity-75${highlightId === a.id ? ' highlight-ring' : ''}`}>
              <div className="flex justify-between">
                <div>
                  <div className="text-sm font-medium text-salve-text">{a.reason || 'Appointment'}</div>
                  <div className="text-xs text-salve-textMid">{a.provider ? <a href={providerLookupUrl(a.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{a.provider}</a> : ''}{a.provider ? ' · ' : ''}{fmtDate(a.date)}{a.location ? <>{' · '}<a href={mapsUrl(a.location)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline inline-flex items-center gap-0.5"><MapPin size={10} strokeWidth={1.5} />{a.location}</a></> : ''}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm(a); setEditId(a.id); setSubView('form'); }} aria-label="Edit appointment" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Edit size={14} /></button>
                  <button onClick={() => del.ask(a.id, a.reason || 'appointment')} aria-label="Delete appointment" className="bg-transparent border-none cursor-pointer text-salve-textFaint p-1 flex"><Trash2 size={14} /></button>
                </div>
              </div>
              {a.post_notes && <div className="text-xs text-salve-textMid mt-1.5 border-t border-salve-border pt-1.5">{a.post_notes}</div>}
            <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('appointments', id))} onCancel={del.cancel} itemId={a.id} />
          </Card>
          ))}</div>
        </>
      )}
    </div>
  );
}
