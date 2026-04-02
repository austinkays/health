import { useState, useEffect } from 'react';
import { Plus, Check, Edit, Trash2, ShieldCheck, Sparkles, Loader, ChevronDown, MapPin, User, ExternalLink } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { fmtDate } from '../../utils/dates';
import { fetchImmunizationReview } from '../../services/ai';
import { buildProfile } from '../../services/profile';
import { hasAIConsent } from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { cdcVaccineUrl, providerLookupUrl } from '../../utils/links';
import { mapsUrl } from '../../utils/maps';

const EMPTY = { date: '', name: '', dose: '', site: '', lot_number: '', provider: '', location: '' };

export default function Immunizations({ data, addItem, updateItem, removeItem, highlightId }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [scheduleAI, setScheduleAI] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (highlightId && data.immunizations.some(i => i.id === highlightId)) {
      setExpandedId(highlightId);
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const reviewSchedule = async () => {
    setScheduleLoading(true);
    setScheduleAI(null);
    try {
      const result = await fetchImmunizationReview(buildProfile(data));
      setScheduleAI(result);
    } catch (e) {
      setScheduleAI('Unable to review schedule right now. ' + e.message);
    } finally {
      setScheduleLoading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) await updateItem('immunizations', editId, form);
    else await addItem('immunizations', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Immunization`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Vaccine Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. COVID-19 mRNA, Tdap, Flu" required />
        <Field label="Date Administered" value={form.date} onChange={v => sf('date', v)} type="date" />
        <Field label="Dose / Series" value={form.dose} onChange={v => sf('dose', v)} placeholder="e.g. Dose 1 of 2, Booster" />
        <Field label="Injection Site" value={form.site} onChange={v => sf('site', v)} placeholder="e.g. Left deltoid" />
        <Field label="Lot Number" value={form.lot_number} onChange={v => sf('lot_number', v)} placeholder="From vaccine label" />
        <Field label="Administered By" value={form.provider} onChange={v => sf('provider', v)} placeholder="Provider or pharmacist" />
        <Field label="Location" value={form.location} onChange={v => sf('location', v)} placeholder="Clinic, pharmacy, or hospital" />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Immunizations
      </SectionTitle>

      {hasAIConsent() && (
        <div className="mb-3">
          <Button
            variant="ghost"
            onClick={reviewSchedule}
            disabled={scheduleLoading}
            className="!text-xs w-full !justify-center"
          >
            {scheduleLoading ? <><Loader size={13} className="animate-spin" /> Reviewing schedule...</> : <><Sparkles size={13} /> Review Schedule with Sage</>}
          </Button>
          {scheduleAI && (
            <Card className="!bg-salve-lav/8 !border-salve-lav/20 mt-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-salve-lav flex items-center gap-1"><Sparkles size={11} /> Schedule Review</div>
                <button onClick={() => setScheduleAI(null)} className="bg-transparent border-none cursor-pointer text-salve-textFaint hover:text-salve-text p-0 text-sm leading-none" aria-label="Dismiss schedule review">×</button>
              </div>
              <AIMarkdown>{scheduleAI}</AIMarkdown>
            </Card>
          )}
        </div>
      )}

      {data.immunizations.length === 0 ? <EmptyState icon={ShieldCheck} text="No immunizations recorded yet" motif="leaf" /> :
        data.immunizations.map(imm => {
          const isExpanded = expandedId === imm.id;
          return (
          <Card key={imm.id} id={`record-${imm.id}`} onClick={() => setExpandedId(isExpanded ? null : imm.id)} className={`cursor-pointer transition-all${highlightId === imm.id ? ' highlight-ring' : ''}`}>
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <a href={cdcVaccineUrl(imm.name)} target="_blank" rel="noopener noreferrer" className="text-[15px] font-semibold text-salve-text hover:text-salve-sage transition-colors hover:underline">{imm.name}</a>
                <div className="text-xs text-salve-textFaint">
                  {[imm.dose, imm.date ? fmtDate(imm.date) : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
              <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                {imm.location && (
                  <div className="text-xs text-salve-textFaint flex items-center gap-1">
                    <MapPin size={11} strokeWidth={1.4} className="flex-shrink-0" />
                    <a href={mapsUrl(imm.location)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline">{imm.location}</a>
                  </div>
                )}
                {imm.site && <div className="text-xs text-salve-textFaint">Site: {imm.site}</div>}
                {imm.lot_number && <div className="text-xs text-salve-textFaint">Lot: {imm.lot_number}</div>}
                {imm.provider && (
                  <div className="text-xs text-salve-textMid flex items-center gap-1">
                    <User size={11} strokeWidth={1.4} className="flex-shrink-0" />
                    <a href={providerLookupUrl(imm.provider, data.providers)} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{imm.provider}</a>
                  </div>
                )}
                <div className="flex gap-2.5 mt-2.5">
                  <button onClick={() => { setForm(imm); setEditId(imm.id); setSubView('form'); }} aria-label="Edit immunization" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                  <button onClick={() => del.ask(imm.id, imm.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            </div></div>
          <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('immunizations', id))} onCancel={del.cancel} itemId={imm.id} />
          </Card>
          );
        })
      }
    </div>
  );
}
