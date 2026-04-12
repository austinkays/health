import { useState, useMemo } from 'react';
import {
  ChevronDown, ChevronRight, Pill, Stethoscope, Shield, AlertOctagon,
  User, Building2, Activity, Calendar, FlaskConical, Syringe, ShieldCheck,
  BadgeDollarSign, AlertTriangle, Scale, PlaneTakeoff, Star, Phone,
  MapPin, ExternalLink, Printer,
} from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { C } from '../../constants/colors';
import { fmtDate, daysUntil } from '../../utils/dates';
import { VITAL_TYPES } from '../../constants/defaults';

/* ── Collapsible Section ─────────────────────────────────── */

function Section({ icon: Icon, title, count, color, defaultOpen = false, onNav, navId, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const Chev = open ? ChevronDown : ChevronRight;

  return (
    <Card className="!p-0 !mb-2">
      <button
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left bg-transparent border-none cursor-pointer"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={`${title} section, ${count} item${count !== 1 ? 's' : ''}`}
      >
        <Icon size={16} color={color} className="shrink-0" />
        <span className="font-playfair text-[15px] font-semibold text-salve-text flex-1">{title}</span>
        {count > 0 && (
          <span
            className="text-[13px] font-semibold px-2 py-0.5 rounded-full"
            style={{ color, background: color + '20' }}
          >
            {count}
          </span>
        )}
        {navId && (
          <button
            className="text-[12px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer px-1 py-0.5 rounded"
            onClick={(e) => { e.stopPropagation(); onNav(navId); }}
            aria-label={`Go to ${title}`}
          >
            View All
          </button>
        )}
        <Chev size={14} className="text-salve-textFaint shrink-0" />
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-salve-border">
          {children}
        </div>
      )}
    </Card>
  );
}

/* ── Compact row (tappable) ──────────────────────────────── */

function Row({ children, onClick }) {
  return (
    <div
      className={`flex items-center gap-2 py-2 border-b border-salve-border/40 last:border-b-0 ${onClick ? 'cursor-pointer hover:bg-salve-card2/40 -mx-1 px-1 rounded' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
    >
      {children}
    </div>
  );
}

/* ── Mini Badge helper ───────────────────────────────────── */

function MiniBadge({ label, color }) {
  return (
    <span
      className="text-[12px] font-semibold px-1.5 py-px rounded-full whitespace-nowrap"
      style={{ color, background: color + '18' }}
    >
      {label}
    </span>
  );
}

/* ── Status color maps ───────────────────────────────────── */

const STATUS = {
  active:    { c: C.rose,  label: '⚠ Active' },
  managed:   { c: C.sage,  label: '✓ Managed' },
  remission: { c: C.lav,   label: '✦ Remission' },
  resolved:  { c: C.textFaint, label: '· Resolved' },
};

const SEVERITY = {
  mild:     { c: C.sage,  label: '· Mild' },
  moderate: { c: C.amber, label: '◆ Moderate' },
  severe:   { c: C.rose,  label: '⚠ Severe' },
};

const LAB_FLAG = {
  normal:        { c: C.sage,  label: '✓ Normal' },
  abnormal:      { c: C.rose,  label: '⚠ Abnormal' },
  high:          { c: C.rose,  label: '↑ High' },
  low:           { c: C.amber, label: '↓ Low' },
  'mild-abnormal': { c: C.amber, label: '◆ Borderline' },
};

const APPEAL_STATUS = {
  pending:  { c: C.amber, label: '◆ Pending' },
  approved: { c: C.sage,  label: '✓ Approved' },
  denied:   { c: C.rose,  label: '⚠ Denied' },
  appealed: { c: C.lav,   label: '✦ Appealed' },
};

/* ── Vital label lookup ──────────────────────────────────── */

const VITAL_LABEL = Object.fromEntries(VITAL_TYPES.map(v => [v.id, { label: v.label, unit: v.unit }]));

/* ── Main Component ──────────────────────────────────────── */

export default function HealthSummary({ data, onNav }) {
  /* ── Derived data ──────────────────────────── */
  const activeMeds = useMemo(() => (data.meds || []).filter(m => m.active !== false), [data.meds]);
  const inactiveMeds = useMemo(() => (data.meds || []).filter(m => m.active === false), [data.meds]);

  const activeConditions = useMemo(
    () => (data.conditions || []).filter(c => c.status !== 'resolved'),
    [data.conditions]
  );
  const resolvedConditions = useMemo(
    () => (data.conditions || []).filter(c => c.status === 'resolved'),
    [data.conditions]
  );

  const allergies = data.allergies || [];
  const anesthesia = data.anesthesia_flags || [];
  const providers = data.providers || [];
  const pharmacies = data.pharmacies || [];
  const immunizations = data.immunizations || [];
  const careGaps = data.care_gaps || [];
  const appeals = data.appeals_and_disputes || [];
  const surgical = data.surgical_planning || [];
  const procedures = data.procedures || [];
  const insurance = data.insurance || [];
  const s = data.settings || {};

  const upcomingAppts = useMemo(() => {
    const now = new Date(new Date().toDateString());
    return (data.appts || [])
      .filter(a => new Date(a.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5);
  }, [data.appts]);

  const latestVitals = useMemo(() => {
    const latest = {};
    (data.vitals || []).forEach(v => {
      if (!latest[v.type] || new Date(v.date) > new Date(latest[v.type].date)) {
        latest[v.type] = v;
      }
    });
    return Object.values(latest).sort((a, b) => {
      const order = VITAL_TYPES.map(t => t.id);
      return order.indexOf(a.type) - order.indexOf(b.type);
    });
  }, [data.vitals]);

  const recentLabs = useMemo(() => {
    const labs = (data.labs || []).slice();
    // Sort: abnormal first, then by date desc
    labs.sort((a, b) => {
      const aAbn = ['abnormal', 'high', 'low'].includes(a.flag) ? 0 : 1;
      const bAbn = ['abnormal', 'high', 'low'].includes(b.flag) ? 0 : 1;
      if (aAbn !== bAbn) return aAbn - bAbn;
      return new Date(b.date) - new Date(a.date);
    });
    return labs.slice(0, 8);
  }, [data.labs]);

  /* ── Helpers ────────────────────────────────── */
  const hasData = (arr) => arr && arr.length > 0;
  const shouldExpand = (arr, threshold = 4) => !arr || arr.length <= threshold;

  function vitalDisplay(v) {
    const info = VITAL_LABEL[v.type] || { label: v.type, unit: '' };
    if (v.type === 'bp' && v.value2) return `${v.value}/${v.value2} ${info.unit}`;
    return `${v.value} ${v.unit || info.unit}`;
  }

  return (
    <div className="mt-2">
      {/* ── Print button (desktop only) ── */}
      <div className="hidden md:flex justify-end mb-3">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-salve-card2 border border-salve-border text-salve-textMid text-sm font-montserrat cursor-pointer hover:bg-salve-border transition-colors"
        >
          <Printer size={14} />
          Print Summary
        </button>
      </div>

      {/* ── Profile Header ─────────────────────── */}
      <Card className="!mb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: C.lav + '20' }}>
            <User size={20} color={C.lav} />
          </div>
          <div className="flex-1 min-w-0">
            {s.name && <p className="font-playfair text-lg font-semibold text-salve-text m-0">{s.name}</p>}
            {s.location && (
              <p className="text-salve-textMid text-xs mt-0.5 mb-0 flex items-center gap-1">
                <MapPin size={11} /> {s.location}
              </p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
              {s.insurance_plan && (
                <span className="text-salve-textMid text-[13px]">
                  <span className="text-salve-textFaint">Insurance:</span> {s.insurance_plan}
                </span>
              )}
              {s.insurance_id && (
                <span className="text-salve-textMid text-[13px]">
                  <span className="text-salve-textFaint">ID:</span> {s.insurance_id}
                </span>
              )}
            </div>
            {s.health_background && (
              <p className="text-salve-textFaint text-[13px] mt-2 mb-0 line-clamp-2">{s.health_background}</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Section grid ── */}
      <div className="md:grid md:grid-cols-2 md:gap-4">
      {/* ── Safety-critical: Allergies (always shown) ── */}
      <Section
        icon={Shield} title="Allergies" count={allergies.length}
        color={C.amber} defaultOpen navId="allergies" onNav={onNav}
      >
        {allergies.length === 0 ? (
          <p className="text-salve-textFaint text-xs py-2 m-0">None recorded</p>
        ) : (
          allergies.map(a => (
            <Row key={a.id} onClick={() => onNav('allergies')}>
              <span className="text-salve-text text-sm flex-1 truncate">{a.substance}</span>
              {a.reaction && <span className="text-salve-textFaint text-[13px] truncate max-w-[100px]">{a.reaction}</span>}
              {a.severity && SEVERITY[a.severity] && (
                <MiniBadge label={SEVERITY[a.severity].label} color={SEVERITY[a.severity].c} />
              )}
            </Row>
          ))
        )}
      </Section>

      {/* ── Safety-critical: Anesthesia Flags ──── */}
      {hasData(anesthesia) && (
        <Section
          icon={AlertOctagon} title="Anesthesia Flags" count={anesthesia.length}
          color={C.rose} defaultOpen navId="anesthesia" onNav={onNav}
        >
          {anesthesia.map(a => (
            <Row key={a.id} onClick={() => onNav('anesthesia')}>
              <span className="text-salve-text text-sm flex-1 truncate">{a.substance || a.flag_type || a.name}</span>
              {a.severity && SEVERITY[a.severity] && (
                <MiniBadge label={SEVERITY[a.severity].label} color={SEVERITY[a.severity].c} />
              )}
            </Row>
          ))}
        </Section>
      )}

      {/* ── Active Medications ─────────────────── */}
      <Section
        icon={Pill} title="Active Medications" count={activeMeds.length}
        color={C.sage} defaultOpen={shouldExpand(activeMeds)} navId="meds" onNav={onNav}
      >
        {activeMeds.length === 0 ? (
          <p className="text-salve-textFaint text-xs py-2 m-0">No active medications</p>
        ) : (
          activeMeds.map(m => (
            <Row key={m.id} onClick={() => onNav('meds')}>
              <div className="flex-1 min-w-0">
                <span className="text-salve-text text-sm truncate block">
                  {m.display_name || m.name}
                </span>
                <span className="text-salve-textFaint text-[13px] truncate block">
                  {[m.dose, m.frequency].filter(Boolean).join(' · ')}
                  {m.pharmacy && ` · ${m.pharmacy}`}
                </span>
              </div>
              {m.fda_data?.drug_class && (
                <MiniBadge label={m.fda_data.drug_class} color={C.sage} />
              )}
              {m.refill_date && (
                <span className="text-salve-textFaint text-[12px] whitespace-nowrap">
                  {daysUntil(m.refill_date)}
                </span>
              )}
            </Row>
          ))
        )}
        {inactiveMeds.length > 0 && (
          <p className="text-salve-textFaint text-[13px] mt-2 mb-0">
            + {inactiveMeds.length} inactive medication{inactiveMeds.length !== 1 ? 's' : ''}
          </p>
        )}
      </Section>

      {/* ── Active Conditions ──────────────────── */}
      <Section
        icon={Stethoscope} title="Conditions" count={activeConditions.length + resolvedConditions.length}
        color={C.lav} defaultOpen={shouldExpand(activeConditions)} navId="conditions" onNav={onNav}
      >
        {activeConditions.length === 0 && resolvedConditions.length === 0 ? (
          <p className="text-salve-textFaint text-xs py-2 m-0">No conditions recorded</p>
        ) : (
          <>
            {activeConditions.map(c => (
              <Row key={c.id} onClick={() => onNav('conditions')}>
                <span className="text-salve-text text-sm flex-1 truncate">{c.name}</span>
                {c.provider && <span className="text-salve-textFaint text-[12px] truncate max-w-[80px]">{c.provider}</span>}
                {STATUS[c.status] && (
                  <MiniBadge label={STATUS[c.status].label} color={STATUS[c.status].c} />
                )}
              </Row>
            ))}
            {resolvedConditions.length > 0 && (
              <p className="text-salve-textFaint text-[13px] mt-2 mb-0">
                + {resolvedConditions.length} resolved condition{resolvedConditions.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </Section>

      {/* ── Providers ──────────────────────────── */}
      {hasData(providers) && (
        <Section
          icon={User} title="Providers" count={providers.length}
          color={C.sage} defaultOpen={shouldExpand(providers)} navId="providers" onNav={onNav}
        >
          {providers.map(p => (
            <Row key={p.id} onClick={() => onNav('providers')}>
              <div className="flex-1 min-w-0">
                <span className="text-salve-text text-sm truncate block">{p.name}</span>
                {(p.specialty || p.clinic) && (
                  <span className="text-salve-textFaint text-[13px] truncate block">
                    {[p.specialty, p.clinic].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              {p.phone && (
                <a
                  href={`tel:${p.phone}`}
                  className="text-salve-lavDim shrink-0"
                  onClick={e => e.stopPropagation()}
                  aria-label={`Call ${p.name}`}
                >
                  <Phone size={13} />
                </a>
              )}
            </Row>
          ))}
        </Section>
      )}

      {/* ── Pharmacies ─────────────────────────── */}
      {hasData(pharmacies) && (
        <Section
          icon={Building2} title="Pharmacies" count={pharmacies.length}
          color={C.sage} defaultOpen={shouldExpand(pharmacies)} navId="pharmacies" onNav={onNav}
        >
          {pharmacies.map(p => (
            <Row key={p.id} onClick={() => onNav('pharmacies')}>
              <span className="text-salve-text text-sm flex-1 truncate">
                {p.is_preferred && <Star size={11} className="inline mr-1 text-salve-amber" fill={C.amber} />}
                {p.name}
              </span>
              {p.phone && (
                <a
                  href={`tel:${p.phone}`}
                  className="text-salve-lavDim shrink-0"
                  onClick={e => e.stopPropagation()}
                  aria-label={`Call ${p.name}`}
                >
                  <Phone size={13} />
                </a>
              )}
            </Row>
          ))}
        </Section>
      )}

      {/* ── Latest Vitals ──────────────────────── */}
      {hasData(latestVitals) && (
        <Section
          icon={Activity} title="Latest Vitals" count={latestVitals.length}
          color={C.lav} defaultOpen={shouldExpand(latestVitals)} navId="vitals" onNav={onNav}
        >
          {latestVitals.map(v => {
            const info = VITAL_LABEL[v.type] || { label: v.type };
            return (
              <Row key={v.type} onClick={() => onNav('vitals')}>
                <span className="text-salve-textMid text-[13px] w-20 shrink-0">{info.label}</span>
                <span className="text-salve-text text-sm font-medium flex-1">{vitalDisplay(v)}</span>
                <span className="text-salve-textFaint text-[12px] whitespace-nowrap">{fmtDate(v.date)}</span>
              </Row>
            );
          })}
        </Section>
      )}

      {/* ── Upcoming Appointments ──────────────── */}
      {hasData(upcomingAppts) && (
        <Section
          icon={Calendar} title="Upcoming Appointments" count={upcomingAppts.length}
          color={C.rose} defaultOpen={shouldExpand(upcomingAppts)} navId="appts" onNav={onNav}
        >
          {upcomingAppts.map(a => (
            <Row key={a.id} onClick={() => onNav('appts')}>
              <div className="flex-1 min-w-0">
                <span className="text-salve-text text-sm truncate block">
                  {a.provider || a.reason || 'Appointment'}
                </span>
                <span className="text-salve-textFaint text-[13px] truncate block">
                  {[a.reason && a.provider ? a.reason : null, a.location].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-salve-textMid text-[13px] block">{fmtDate(a.date)}</span>
                {a.time && <span className="text-salve-textFaint text-[12px] block">{a.time}</span>}
              </div>
            </Row>
          ))}
        </Section>
      )}

      {/* ── Labs ───────────────────────────────── */}
      {hasData(recentLabs) && (
        <Section
          icon={FlaskConical} title="Recent Labs" count={recentLabs.length}
          color={C.lav} defaultOpen={shouldExpand(recentLabs)} navId="labs" onNav={onNav}
        >
          {recentLabs.map(l => {
            const flag = LAB_FLAG[l.flag];
            return (
              <Row key={l.id} onClick={() => onNav('labs')}>
                <span className="text-salve-text text-sm flex-1 truncate">{l.test_name}</span>
                <span className="text-salve-textMid text-[13px] whitespace-nowrap">
                  {l.result}{l.unit ? ` ${l.unit}` : ''}
                </span>
                {flag && <MiniBadge label={flag.label} color={flag.c} />}
              </Row>
            );
          })}
        </Section>
      )}

      {/* ── Immunizations ──────────────────────── */}
      {hasData(immunizations) && (
        <Section
          icon={ShieldCheck} title="Immunizations" count={immunizations.length}
          color={C.sage} defaultOpen={false} navId="immunizations" onNav={onNav}
        >
          {immunizations.map(i => (
            <Row key={i.id} onClick={() => onNav('immunizations')}>
              <span className="text-salve-text text-sm flex-1 truncate">{i.vaccine || i.name}</span>
              {i.provider && <span className="text-salve-textFaint text-[12px] truncate max-w-[80px]">{i.provider}</span>}
              <span className="text-salve-textFaint text-[12px] whitespace-nowrap">{fmtDate(i.date)}</span>
            </Row>
          ))}
        </Section>
      )}

      {/* ── Insurance ──────────────────────────── */}
      {(s.insurance_plan || hasData(insurance)) && (
        <Section
          icon={BadgeDollarSign} title="Insurance" count={insurance.length || (s.insurance_plan ? 1 : 0)}
          color={C.sage} defaultOpen={shouldExpand(insurance)} navId="insurance" onNav={onNav}
        >
          {s.insurance_plan && (
            <div className="py-2 border-b border-salve-border/40 last:border-b-0">
              <p className="text-salve-text text-sm m-0">{s.insurance_plan}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {s.insurance_id && <span className="text-salve-textFaint text-[13px]">ID: {s.insurance_id}</span>}
                {s.insurance_group && <span className="text-salve-textFaint text-[13px]">Group: {s.insurance_group}</span>}
                {s.insurance_phone && (
                  <a href={`tel:${s.insurance_phone}`} className="text-salve-lavDim text-[13px]">
                    {s.insurance_phone}
                  </a>
                )}
              </div>
            </div>
          )}
          {insurance.map(ins => (
            <Row key={ins.id} onClick={() => onNav('insurance')}>
              <span className="text-salve-text text-sm flex-1 truncate">{ins.plan_name || ins.name || 'Plan'}</span>
              {ins.policy_id && <span className="text-salve-textFaint text-[12px]">ID: {ins.policy_id}</span>}
            </Row>
          ))}
        </Section>
      )}

      {/* ── Care Gaps ──────────────────────────── */}
      {hasData(careGaps) && (
        <Section
          icon={AlertTriangle} title="Care Gaps" count={careGaps.length}
          color={C.amber} defaultOpen={shouldExpand(careGaps)} navId="care_gaps" onNav={onNav}
        >
          {careGaps.map(g => {
            const urgency = g.urgency === 'urgent' ? { c: C.rose, label: '⚠ Urgent' }
              : g.urgency === 'routine' ? { c: C.sage, label: '· Routine' }
              : { c: C.amber, label: '◆ ' + (g.urgency || 'Open') };
            return (
              <Row key={g.id} onClick={() => onNav('care_gaps')}>
                <span className="text-salve-text text-sm flex-1 truncate">{g.category || g.name}</span>
                {g.status && <span className="text-salve-textFaint text-[12px] truncate">{g.status}</span>}
                <MiniBadge label={urgency.label} color={urgency.c} />
              </Row>
            );
          })}
        </Section>
      )}

      {/* ── Appeals ────────────────────────────── */}
      {hasData(appeals) && (
        <Section
          icon={Scale} title="Appeals & Disputes" count={appeals.length}
          color={C.amber} defaultOpen={shouldExpand(appeals)} navId="appeals" onNav={onNav}
        >
          {appeals.map(a => {
            const st = APPEAL_STATUS[a.status] || { c: C.textFaint, label: a.status || ', ' };
            return (
              <Row key={a.id} onClick={() => onNav('appeals')}>
                <span className="text-salve-text text-sm flex-1 truncate">{a.type || a.name || 'Appeal'}</span>
                {a.date && <span className="text-salve-textFaint text-[12px] whitespace-nowrap">{fmtDate(a.date)}</span>}
                <MiniBadge label={st.label} color={st.c} />
              </Row>
            );
          })}
        </Section>
      )}

      {/* ── Surgical Planning ──────────────────── */}
      {hasData(surgical) && (
        <Section
          icon={PlaneTakeoff} title="Surgical Planning" count={surgical.length}
          color={C.lav} defaultOpen={shouldExpand(surgical)} navId="surgical" onNav={onNav}
        >
          {surgical.map(sp => (
            <Row key={sp.id} onClick={() => onNav('surgical')}>
              <div className="flex-1 min-w-0">
                <span className="text-salve-text text-sm truncate block">{sp.procedure || sp.name}</span>
                {sp.surgeon && <span className="text-salve-textFaint text-[13px] truncate block">{sp.surgeon}</span>}
              </div>
              {sp.date && <span className="text-salve-textFaint text-[12px] whitespace-nowrap">{fmtDate(sp.date)}</span>}
            </Row>
          ))}
        </Section>
      )}

      {/* ── Procedures ─────────────────────────── */}
      {hasData(procedures) && (
        <Section
          icon={Syringe} title="Procedures" count={procedures.length}
          color={C.sage} defaultOpen={false} navId="procedures" onNav={onNav}
        >
          {procedures.map(p => (
            <Row key={p.id} onClick={() => onNav('procedures')}>
              <span className="text-salve-text text-sm flex-1 truncate">{p.name}</span>
              {p.outcome && <MiniBadge label={p.outcome} color={p.outcome === 'successful' ? C.sage : C.textMid} />}
              {p.date && <span className="text-salve-textFaint text-[12px] whitespace-nowrap">{fmtDate(p.date)}</span>}
            </Row>
          ))}
        </Section>
      )}

      </div>
      {/* ── Footer ─────────────────────────────── */}
      <p className="text-center text-salve-textFaint text-[13px] mt-4 mb-2">
        Tap any row to view details · Tap "View All" to manage
      </p>
    </div>
  );
}
