import { useState, useMemo } from 'react';
import { Plus, Check, Edit, Trash2, Building2, Phone, ExternalLink, ChevronDown, MapPin, Star, Pill, Clock } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap, { SectionTitle } from '../ui/FormWrap';
import { EMPTY_PHARMACY } from '../../constants/defaults';
import { mapsUrl } from '../../utils/maps';
import { C } from '../../constants/colors';

export default function Pharmacies({ data, addItem, updateItem, removeItem }) {
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY_PHARMACY);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');
  const del = useConfirmDelete();
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* ── Count meds per pharmacy (by name match) ── */
  const medsByPharmacy = useMemo(() => {
    const map = {};
    (data.pharmacies || []).forEach(p => {
      const name = p.name.trim().toLowerCase();
      map[p.id] = (data.meds || []).filter(m =>
        m.active !== false && m.pharmacy && m.pharmacy.trim().toLowerCase() === name
      );
    });
    return map;
  }, [data.pharmacies, data.meds]);

  /* ── Upcoming refills per pharmacy ── */
  const refillsByPharmacy = useMemo(() => {
    const now = new Date(new Date().toDateString());
    const map = {};
    (data.pharmacies || []).forEach(p => {
      const name = p.name.trim().toLowerCase();
      map[p.id] = (data.meds || []).filter(m => {
        if (m.active === false || !m.refill_date || !m.pharmacy) return false;
        return m.pharmacy.trim().toLowerCase() === name && new Date(m.refill_date) >= now;
      }).sort((a, b) => new Date(a.refill_date) - new Date(b.refill_date));
    });
    return map;
  }, [data.pharmacies, data.meds]);

  const saveP = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateItem('pharmacies', editId, form);
    } else {
      await addItem('pharmacies', form);
    }
    setForm(EMPTY_PHARMACY);
    setEditId(null);
    setSubView(null);
  };

  const togglePreferred = async (pharmacy) => {
    await updateItem('pharmacies', pharmacy.id, { is_preferred: !pharmacy.is_preferred });
  };

  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Pharmacy`} onBack={() => { setSubView(null); setForm(EMPTY_PHARMACY); setEditId(null); }}>
      <Card>
        <Field label="Pharmacy Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. CVS Pharmacy" required />
        <Field label="Address" value={form.address} onChange={v => sf('address', v)} placeholder="123 Main St, City, ST 12345" />
        <Field label="Phone" value={form.phone} onChange={v => sf('phone', v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Fax" value={form.fax} onChange={v => sf('fax', v)} type="tel" placeholder="(555) 555-5556" />
        <Field label="Hours" value={form.hours} onChange={v => sf('hours', v)} placeholder="e.g. Mon-Fri 8am-9pm, Sat 9am-6pm" />
        <Field label="Website" value={form.website} onChange={v => sf('website', v)} placeholder="https://..." />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Specialty compounding, delivery available..." />
        <div className="flex items-center gap-2 mb-4">
          <input type="checkbox" checked={form.is_preferred} onChange={e => sf('is_preferred', e.target.checked)} id="phPreferred" />
          <label htmlFor="phPreferred" className="text-sm text-salve-textMid flex items-center gap-1">
            <Star size={13} className="text-salve-amber" /> Preferred pharmacy
          </label>
        </div>
        <div className="flex gap-2">
          <Button onClick={saveP} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY_PHARMACY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  /* ── Filter ── */
  const filtered = useMemo(() => {
    let list = data.pharmacies || [];
    if (filter === 'preferred') list = list.filter(p => p.is_preferred);
    if (filter === 'has_meds') list = list.filter(p => (medsByPharmacy[p.id] || []).length > 0);
    // Sort preferred first, then by name
    return [...list].sort((a, b) => {
      if (a.is_preferred && !b.is_preferred) return -1;
      if (!a.is_preferred && b.is_preferred) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [data.pharmacies, filter, medsByPharmacy]);

  const fmtRefill = (dateStr) => {
    const d = Math.ceil((new Date(dateStr) - new Date(new Date().toDateString())) / 86400000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d <= 7) return `${d} days`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="mt-2">
      <SectionTitle action={<Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>}>
        Pharmacies
      </SectionTitle>

      <div className="flex gap-1.5 flex-wrap mb-3.5">
        {['all', 'preferred', 'has_meds'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
              filter === f ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            {f === 'all' ? 'All' : f === 'preferred' ? '★ Preferred' : 'With Meds'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} text={filter === 'all' ? 'No pharmacies added' : `No ${filter === 'preferred' ? 'preferred' : ''} pharmacies`} motif="leaf" />
      ) : filtered.map(p => {
        const isExpanded = expandedId === p.id;
        const meds = medsByPharmacy[p.id] || [];
        const refills = refillsByPharmacy[p.id] || [];
        return (
          <Card key={p.id} onClick={() => setExpandedId(isExpanded ? null : p.id)} className="cursor-pointer transition-all">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-salve-text flex items-center gap-1.5">
                  {p.name}
                  {p.is_preferred && (
                    <Star size={12} className="text-salve-amber fill-salve-amber flex-shrink-0" />
                  )}
                </div>
                {!isExpanded && p.address && <div className="text-xs text-salve-textMid mt-0.5 truncate">{p.address}</div>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {meds.length > 0 && (
                    <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-salve-sage/10 border border-salve-sage/20 text-[10px] text-salve-sage font-medium">
                      <Pill size={10} /> {meds.length} med{meds.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {refills.length > 0 && (
                    <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full bg-salve-amber/10 border border-salve-amber/20 text-[10px] text-salve-amber font-medium">
                      <Clock size={10} /> {refills.length} refill{refills.length !== 1 ? 's' : ''} upcoming
                    </span>
                  )}
                </div>
              </div>
              <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
            {isExpanded && (
              <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                {p.address && (
                  <div className="text-xs text-salve-textMid flex items-center gap-1 mb-1">
                    <MapPin size={12} strokeWidth={1.4} className="flex-shrink-0" />
                    <a href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer" className="text-salve-sage hover:underline">{p.address}</a>
                  </div>
                )}
                {p.phone && (
                  <div className="text-xs text-salve-textMid flex items-center gap-1 mb-1">
                    <Phone size={12} strokeWidth={1.4} className="flex-shrink-0" />
                    <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-salve-sage hover:underline">{p.phone}</a>
                  </div>
                )}
                {p.fax && <div className="text-xs text-salve-textFaint mb-1">Fax: {p.fax}</div>}
                {p.hours && (
                  <div className="text-xs text-salve-textMid flex items-center gap-1 mb-1">
                    <Clock size={12} strokeWidth={1.4} className="flex-shrink-0" />
                    <span>{p.hours}</span>
                  </div>
                )}
                {p.website && (
                  <div className="text-xs text-salve-textMid flex items-center gap-1 mb-1">
                    <ExternalLink size={12} strokeWidth={1.4} className="flex-shrink-0" />
                    <a
                      href={p.website.startsWith('http') ? p.website : `https://${p.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-salve-lav hover:underline truncate"
                    >
                      {p.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </a>
                  </div>
                )}
                {p.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{p.notes}</div>}

                {/* ── Medications at this pharmacy ── */}
                {meds.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-salve-border/30">
                    <div className="text-[11px] font-semibold text-salve-sage mb-1.5 flex items-center gap-1">
                      <Pill size={11} /> Medications ({meds.length})
                    </div>
                    {meds.map(m => (
                      <div key={m.id} className="flex items-center justify-between py-1 text-xs">
                        <div className="flex-1 min-w-0">
                          <span className="text-salve-text font-medium">{m.display_name || m.name}</span>
                          {m.dose && <span className="text-salve-textFaint ml-1">{m.dose}</span>}
                        </div>
                        {m.refill_date && (
                          <span className="text-[10px] text-salve-amber font-medium flex-shrink-0 ml-2">
                            Refill {fmtRefill(m.refill_date)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Upcoming refills summary ── */}
                {refills.length > 0 && meds.length === 0 && (
                  <div className="mt-2 text-xs text-salve-amber flex items-center gap-1">
                    <Clock size={11} /> Next refill: {fmtRefill(refills[0].refill_date)} — {refills[0].display_name || refills[0].name}
                  </div>
                )}

                <div className="flex gap-2.5 mt-2.5 flex-wrap">
                  <button
                    onClick={() => togglePreferred(p)}
                    aria-label={p.is_preferred ? 'Remove preferred' : 'Set as preferred'}
                    className="bg-transparent border-none cursor-pointer text-salve-amber text-xs font-montserrat p-0 flex items-center gap-1"
                  >
                    <Star size={12} className={p.is_preferred ? 'fill-salve-amber' : ''} />
                    {p.is_preferred ? 'Preferred' : 'Set preferred'}
                  </button>
                  <button onClick={() => { setForm(p); setEditId(p.id); setSubView('form'); }} aria-label="Edit pharmacy" className="bg-transparent border-none cursor-pointer text-salve-lav text-xs font-montserrat p-0 flex items-center gap-1"><Edit size={12} /> Edit</button>
                  <button onClick={() => del.ask(p.id, p.name)} className="bg-transparent border-none cursor-pointer text-salve-textFaint text-xs font-montserrat p-0 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            )}
            <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('pharmacies', id))} onCancel={del.cancel} itemId={p.id} />
          </Card>
        );
      })}
    </div>
  );
}
