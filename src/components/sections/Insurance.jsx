import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Check, Edit, Trash2, BadgeDollarSign, ChevronDown, Phone, Receipt, Camera, Loader2 } from 'lucide-react';
import useConfirmDelete from '../../hooks/useConfirmDelete';
import useWellnessMessage from '../../hooks/useWellnessMessage';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import ConfirmBar from '../ui/ConfirmBar';
import EmptyState from '../ui/EmptyState';
import FormWrap from '../ui/FormWrap';
import { hasAIConsent } from '../ui/AIConsentGate';
import { fmtDate } from '../../utils/dates';
import { C } from '../../constants/colors';
import { extractInsuranceCard } from '../../services/ai';

const EMPTY = { name: '', type: '', member_id: '', group: '', phone: '', notes: '' };
const TYPES = ['', 'Medicaid', 'Medicare', 'Private', 'Hospital charity care'];
const CLAIM_EMPTY = {
  date: '', provider: '', description: '', billed_amount: '',
  allowed_amount: '', paid_amount: '', patient_responsibility: '',
  status: 'submitted', claim_number: '', insurance_plan: '', notes: '',
};
const CLAIM_STATUSES = ['submitted', 'processing', 'paid', 'denied', 'appealed'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const typeStyle = (t) => {
  if (t === 'Medicaid' || t === 'Medicare') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  if (t === 'Private') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  if (t === 'Hospital charity care') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

const claimStatusStyle = (s) => {
  if (s === 'paid') return { color: C.sage, bg: 'rgba(143,191,160,0.15)' };
  if (s === 'denied') return { color: C.rose, bg: 'rgba(232,138,154,0.15)' };
  if (s === 'appealed') return { color: C.amber, bg: 'rgba(196,166,115,0.15)' };
  if (s === 'processing') return { color: C.lav, bg: 'rgba(184,169,232,0.15)' };
  return { color: C.textFaint, bg: 'rgba(110,106,128,0.1)' };
};

const fmtMoney = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : `$${n.toFixed(2)}`;
};

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const [header, data] = dataUrl.split(',');
      const mediaType = header.match(/data:(.+);/)?.[1] || 'image/png';
      resolve({ data, mediaType, preview: dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Insurance({ data, addItem, updateItem, removeItem, highlightId }) {
  const [tab, setTab] = useState('plans');
  const [subView, setSubView] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [claimForm, setClaimForm] = useState(CLAIM_EMPTY);
  const [editId, setEditId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanPreview, setScanPreview] = useState(null);
  const fileInputRef = useRef(null);
  const del = useConfirmDelete();
  const wellness = useWellnessMessage(10000);
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const scf = (k, v) => setClaimForm(p => ({ ...p, [k]: v }));

  const claims = data.insurance_claims || [];

  useEffect(() => {
    if (highlightId) {
      if (data.insurance.some(i => i.id === highlightId)) {
        setTab('plans');
        setExpandedId(highlightId);
      } else if (claims.some(c => c.id === highlightId)) {
        setTab('claims');
        setExpandedId(highlightId);
      }
      setTimeout(() => document.getElementById(`record-${highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [highlightId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let billed = 0, paid = 0, oop = 0;
    claims.forEach(c => {
      if (c.billed_amount) billed += parseFloat(c.billed_amount) || 0;
      if (c.paid_amount) paid += parseFloat(c.paid_amount) || 0;
      if (c.patient_responsibility) oop += parseFloat(c.patient_responsibility) || 0;
    });
    return { billed, paid, oop };
  }, [claims]);

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) await updateItem('insurance', editId, form);
    else await addItem('insurance', form);
    setForm(EMPTY); setEditId(null); setSubView(null);
  };

  const saveClaim = async () => {
    if (!claimForm.description.trim()) return;
    if (editId) await updateItem('insurance_claims', editId, claimForm);
    else await addItem('insurance_claims', claimForm);
    setClaimForm(CLAIM_EMPTY); setEditId(null); setSubView(null);
  };

  // ── Photo scan ──
  const handleCardPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setScanError('Please select an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setScanError('Image is too large. Please use a photo under 5MB.');
      return;
    }
    setScanError('');
    setScanning(true);

    try {
      const imageData = await readFileAsBase64(file);
      setScanPreview(imageData.preview);
      const extracted = await extractInsuranceCard(imageData);
      // Pre-fill the form with extracted data (only non-empty fields)
      setForm({
        name: extracted.name || '',
        type: TYPES.includes(extracted.type) ? extracted.type : '',
        member_id: extracted.member_id || '',
        group: extracted.group || '',
        phone: extracted.phone || '',
        notes: extracted.notes || '',
      });
      setEditId(null);
      setSubView('form');
    } catch (err) {
      setScanError(err.message || 'Could not read the card. Please try again.');
    } finally {
      setScanning(false);
      setScanPreview(null);
    }
  };

  // ── Scan card view ──
  if (subView === 'scanCard') return (
    <FormWrap title="Scan Insurance Card" onBack={() => { setSubView(null); setScanError(''); setScanPreview(null); setScanning(false); }}>
      <Card>
        {!hasAIConsent() ? (
          <div className="text-center py-4">
            <p className="text-sm text-salve-textMid mb-2">Scanning requires AI features to be enabled.</p>
            <p className="text-xs text-salve-textFaint">Go to the AI section and enable Sage first, then come back here.</p>
          </div>
        ) : scanning ? (
          <div className="text-center py-8">
            {scanPreview && (
              <div className="mb-4 mx-auto max-w-[200px] rounded-lg overflow-hidden border border-salve-border/50 opacity-60">
                <img src={scanPreview} alt="Card being scanned" className="w-full" />
              </div>
            )}
            <Loader2 size={24} className="animate-spin text-salve-lav mx-auto mb-3" />
            <p className="text-sm text-salve-textMid mb-1">Reading your insurance card...</p>
            <p className="text-xs text-salve-textFaint italic">{wellness}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-salve-textMid mb-4">
              Take a photo or upload a picture of your insurance card. Sage will read it and fill in your plan details.
            </p>

            <div className="space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 px-4 rounded-xl border-2 border-dashed border-salve-lav/30 bg-salve-lav/5 hover:bg-salve-lav/10 hover:border-salve-lav/50 transition-colors cursor-pointer flex flex-col items-center gap-2"
              >
                <Camera size={28} className="text-salve-lav" />
                <span className="text-sm font-medium text-salve-text">Take Photo or Choose Image</span>
                <span className="text-xs text-salve-textFaint">JPG, PNG, or HEIC</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCardPhoto(file);
                  e.target.value = '';
                }}
              />
            </div>

            {scanError && (
              <p className="text-xs text-salve-rose mt-3" role="alert">{scanError}</p>
            )}

            <p className="text-[11px] text-salve-textFaint mt-4 leading-relaxed">
              Your card photo is sent to Sage (AI) to extract the text. The image is not stored.
            </p>
          </>
        )}
      </Card>
    </FormWrap>
  );

  // ── Plan form ──
  if (subView === 'form') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Insurance`} onBack={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Plan Name" value={form.name} onChange={v => sf('name', v)} placeholder="e.g. CareOregon OHP, OHSU Charity Care" required />
        <Field label="Type" value={form.type} onChange={v => sf('type', v)} options={TYPES} />
        <Field label="Member ID" value={form.member_id} onChange={v => sf('member_id', v)} placeholder="Your member number" />
        <Field label="Group Number" value={form.group} onChange={v => sf('group', v)} placeholder="Group / plan code" />
        <Field label="Phone" value={form.phone} onChange={v => sf('phone', v)} placeholder="Member services number" />
        <Field label="Notes" value={form.notes} onChange={v => sf('notes', v)} textarea placeholder="Coverage details, deductible, prior auth contacts..." />
        <div className="flex gap-2">
          <Button onClick={save} disabled={!form.name.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setForm(EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  // ── Claim form ──
  if (subView === 'claimForm') return (
    <FormWrap title={`${editId ? 'Edit' : 'Add'} Claim`} onBack={() => { setSubView(null); setClaimForm(CLAIM_EMPTY); setEditId(null); }}>
      <Card>
        <Field label="Description" value={claimForm.description} onChange={v => scf('description', v)} placeholder="e.g. Office visit, Lab work" required />
        <Field label="Date of Service" value={claimForm.date} onChange={v => scf('date', v)} type="date" />
        <Field label="Provider" value={claimForm.provider} onChange={v => scf('provider', v)} placeholder="Provider or facility name" />
        <Field label="Insurance Plan" value={claimForm.insurance_plan} onChange={v => scf('insurance_plan', v)}
          options={['', ...data.insurance.map(i => i.name)]} />
        <Field label="Status" value={claimForm.status} onChange={v => scf('status', v)} options={CLAIM_STATUSES} />
        <Field label="Claim Number" value={claimForm.claim_number} onChange={v => scf('claim_number', v)} placeholder="Claim or reference #" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Billed" value={claimForm.billed_amount} onChange={v => scf('billed_amount', v)} type="number" placeholder="0.00" />
          <Field label="Allowed" value={claimForm.allowed_amount} onChange={v => scf('allowed_amount', v)} type="number" placeholder="0.00" />
          <Field label="Ins. Paid" value={claimForm.paid_amount} onChange={v => scf('paid_amount', v)} type="number" placeholder="0.00" />
          <Field label="Your Cost" value={claimForm.patient_responsibility} onChange={v => scf('patient_responsibility', v)} type="number" placeholder="0.00" />
        </div>
        <Field label="Notes" value={claimForm.notes} onChange={v => scf('notes', v)} textarea placeholder="EOB details, appeal notes..." />
        <div className="flex gap-2">
          <Button onClick={saveClaim} disabled={!claimForm.description.trim()}><Check size={15} /> Save</Button>
          <Button variant="ghost" onClick={() => { setSubView(null); setClaimForm(CLAIM_EMPTY); setEditId(null); }}>Cancel</Button>
        </div>
      </Card>
    </FormWrap>
  );

  return (
    <div className="mt-2">
      {/* ── Tabs ── */}
      <div className="flex gap-1.5 mb-3.5">
        {['plans', 'claims'].map(t => (
          <button key={t} onClick={() => { setTab(t); setExpandedId(null); }}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat capitalize ${
              tab === t ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >{t}</button>
        ))}
      </div>

      {/* ── Plans Tab ── */}
      {tab === 'plans' && <>
        <div className="flex justify-end gap-2 mb-3">
          <Button variant="secondary" onClick={() => setSubView('scanCard')} className="!py-1.5 !px-4 !text-xs"><Camera size={14} /> Scan Card</Button>
          <Button variant="secondary" onClick={() => setSubView('form')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
        </div>

        {data.insurance.length === 0 ? <EmptyState icon={BadgeDollarSign} text="No insurance plans recorded" motif="leaf" /> :
          <div className="md:grid md:grid-cols-2 md:gap-4">{data.insurance.map(ins => {
            const ts = ins.type ? typeStyle(ins.type) : null;
            const isExpanded = expandedId === ins.id;
            const planClaims = claims.filter(c => c.insurance_plan === ins.name).length;
            return (
              <Card key={ins.id} id={`record-${ins.id}`} onClick={() => setExpandedId(isExpanded ? null : ins.id)} className={`cursor-pointer transition-all${highlightId === ins.id ? ' highlight-ring' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[15px] font-semibold text-salve-text">{ins.name}</span>
                      {ts && <Badge label={ins.type} color={ts.color} bg={ts.bg} />}
                      {planClaims > 0 && <Badge label={`${planClaims} claim${planClaims > 1 ? 's' : ''}`} color={C.textFaint} bg="rgba(110,106,128,0.1)" />}
                    </div>
                    {!isExpanded && ins.member_id && <div className="text-xs text-salve-textMid truncate">ID: {ins.member_id}</div>}
                  </div>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {ins.member_id && <div className="text-xs text-salve-textMid">Member ID: {ins.member_id}</div>}
                    {ins.group && <div className="text-xs text-salve-textFaint">Group: {ins.group}</div>}
                    {ins.phone && (
                      <div className="text-xs text-salve-textMid mt-0.5 flex items-center gap-1">
                        <Phone size={12} strokeWidth={1.4} className="flex-shrink-0" />
                        <a href={`tel:${ins.phone.replace(/[^\d+]/g, '')}`} className="text-salve-sage hover:underline">{ins.phone}</a>
                      </div>
                    )}
                    {ins.notes && <div className="text-xs text-salve-textFaint mt-1 leading-relaxed">{ins.notes}</div>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setForm(ins); setEditId(ins.id); setSubView('form'); }} aria-label="Edit insurance plan" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
                      <button onClick={() => del.ask(ins.id, ins.name)} aria-label="Delete insurance plan" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
                    </div>
                  </div>
                </div></div>
                <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('insurance', id))} onCancel={del.cancel} itemId={ins.id} />
              </Card>
            );
          })}</div>
        }
      </>}

      {/* ── Claims Tab ── */}
      {tab === 'claims' && <>
        <div className="flex justify-end mb-3">
          <Button variant="secondary" onClick={() => setSubView('claimForm')} className="!py-1.5 !px-4 !text-xs"><Plus size={14} /> Add</Button>
        </div>

        {/* Totals banner */}
        {claims.length > 0 && (
          <Card className="mb-3">
            <div className="flex justify-between text-xs">
              <div className="text-center">
                <div className="text-salve-textFaint mb-0.5">Billed</div>
                <div className="font-semibold text-salve-text">${totals.billed.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-salve-textFaint mb-0.5">Ins. Paid</div>
                <div className="font-semibold" style={{ color: C.sage }}>${totals.paid.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-salve-textFaint mb-0.5">Your Cost</div>
                <div className="font-semibold" style={{ color: C.amber }}>${totals.oop.toFixed(2)}</div>
              </div>
            </div>
          </Card>
        )}

        {claims.length === 0 ? <EmptyState icon={Receipt} text="No claims tracked yet" motif="leaf" /> :
          <div className="md:grid md:grid-cols-2 md:gap-3">{claims.map(cl => {
            const ss = claimStatusStyle(cl.status);
            const isExpanded = expandedId === cl.id;
            return (
              <Card key={cl.id} id={`record-${cl.id}`} onClick={() => setExpandedId(isExpanded ? null : cl.id)} className={`cursor-pointer transition-all${highlightId === cl.id ? ' highlight-ring' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[15px] font-semibold text-salve-text">{cl.description}</span>
                      <Badge label={cl.status} color={ss.color} bg={ss.bg} />
                    </div>
                    <div className="text-xs text-salve-textFaint">
                      {cl.date && fmtDate(cl.date)}{cl.provider && ` · ${cl.provider}`}
                    </div>
                    {!isExpanded && cl.patient_responsibility && (
                      <div className="text-xs mt-0.5" style={{ color: C.amber }}>Your cost: {fmtMoney(cl.patient_responsibility)}</div>
                    )}
                  </div>
                  <ChevronDown size={14} className={`text-salve-textFaint transition-transform ml-2 mt-1 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
                <div className={`expand-section ${isExpanded ? 'open' : ''}`}><div>
                  <div className="mt-2.5 pt-2.5 border-t border-salve-border/50" onClick={e => e.stopPropagation()}>
                    {cl.claim_number && <div className="text-xs text-salve-textFaint">Claim #: {cl.claim_number}</div>}
                    {cl.insurance_plan && <div className="text-xs text-salve-textFaint">Plan: {cl.insurance_plan}</div>}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5 text-xs">
                      {cl.billed_amount && <div className="text-salve-textMid">Billed: <span className="text-salve-text">{fmtMoney(cl.billed_amount)}</span></div>}
                      {cl.allowed_amount && <div className="text-salve-textMid">Allowed: <span className="text-salve-text">{fmtMoney(cl.allowed_amount)}</span></div>}
                      {cl.paid_amount && <div className="text-salve-textMid">Ins. Paid: <span style={{ color: C.sage }}>{fmtMoney(cl.paid_amount)}</span></div>}
                      {cl.patient_responsibility && <div className="text-salve-textMid">Your Cost: <span style={{ color: C.amber }}>{fmtMoney(cl.patient_responsibility)}</span></div>}
                    </div>
                    {cl.notes && <div className="text-xs text-salve-textFaint mt-1.5 leading-relaxed">{cl.notes}</div>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setClaimForm(cl); setEditId(cl.id); setSubView('claimForm'); }} aria-label="Edit claim" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-salve-lav/10 text-salve-lav text-xs font-semibold font-montserrat border border-salve-lav/20 cursor-pointer hover:bg-salve-lav/20 transition-colors"><Edit size={13} /> Edit</button>
                      <button onClick={() => del.ask(cl.id, cl.description)} aria-label="Delete claim" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-salve-textFaint text-xs font-medium font-montserrat border border-salve-border cursor-pointer hover:bg-salve-rose/10 hover:text-salve-rose hover:border-salve-rose/25 transition-colors"><Trash2 size={13} /> Delete</button>
                    </div>
                  </div>
                </div></div>
                <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => removeItem('insurance_claims', id))} onCancel={del.cancel} itemId={cl.id} />
              </Card>
            );
          })}</div>
        }
      </>}
    </div>
  );
}
