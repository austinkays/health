import { useMemo } from 'react';
import { AlertOctagon, AlertTriangle, FlaskConical, TrendingUp, CheckSquare, Zap, Heart, Calendar } from 'lucide-react';
import { C } from '../../constants/colors';
import { localISODate } from '../../utils/dates';
import { findPgxMatches } from '../../constants/pgx';

export function useAbnormalLabs(labs) {
  return useMemo(() => {
    // Only count recent abnormal labs (last 90 days) so a one-time import of
    // years of historical labs doesn't bury the Dashboard in stale alerts.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffISO = localISODate(cutoff);
    return (labs || []).filter(l =>
      ['abnormal', 'high', 'low'].includes(l.flag) &&
      (!l.date || l.date >= cutoffISO)
    );
  }, [labs]);
}

export function usePriceAlertMeds(activeMeds, drugPrices) {
  return useMemo(() => {
    const prices = drugPrices || [];
    if (prices.length < 2) return [];
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const increased = [];
    for (const med of activeMeds) {
      const medPrices = prices
        .filter(p => p.medication_id === med.id && p.nadac_per_unit)
        .sort((a, b) => new Date(b.fetched_at || b.created_at) - new Date(a.fetched_at || a.created_at));
      if (medPrices.length < 2) continue;
      const latest = medPrices[0];
      const older = medPrices.find(p => new Date(p.fetched_at || p.created_at).getTime() < thirtyDaysAgo);
      if (!older) continue;
      const pct = ((latest.nadac_per_unit - older.nadac_per_unit) / older.nadac_per_unit) * 100;
      if (pct > 15) increased.push(med.display_name || med.name);
    }
    return increased;
  }, [activeMeds, drugPrices]);
}

export function useAlerts({
  anesthesiaCount, interactions, abnormalLabs, priceAlertMeds, urgentGaps,
  data, activeMeds,
}) {
  return useMemo(() => {
    const items = [];
    if (anesthesiaCount > 0) {
      items.push({ id: 'anesthesia', icon: AlertOctagon, color: C.rose, text: `${anesthesiaCount} Anesthesia Flag${anesthesiaCount > 1 ? 's' : ''}, review before procedures`, nav: 'anesthesia' });
    }
    if (interactions.length > 0) {
      items.push({ id: 'interactions', icon: AlertTriangle, color: C.rose, text: `${interactions.length} Drug Interaction${interactions.length > 1 ? 's' : ''} detected`, nav: 'interactions' });
    }
    if (abnormalLabs.length > 0) {
      items.push({ id: 'labs', icon: FlaskConical, color: C.rose, text: `${abnormalLabs.length} Abnormal Lab Result${abnormalLabs.length > 1 ? 's' : ''}`, nav: 'labs' });
    }
    if (priceAlertMeds.length > 0) {
      const names = priceAlertMeds.length <= 2 ? priceAlertMeds.join(' & ') : `${priceAlertMeds.length} medications`;
      items.push({ id: 'prices', icon: TrendingUp, color: C.amber, text: `Price increase detected for ${names}`, nav: 'meds' });
    }
    if (urgentGaps > 0) {
      items.push({ id: 'care_gaps', icon: AlertTriangle, color: C.amber, text: `${urgentGaps} Urgent Care Gap${urgentGaps > 1 ? 's' : ''}`, nav: 'care_gaps' });
    }
    // Overdue or urgent to-dos
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdueTodos = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') < now);
    const urgentTodos = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.priority === 'urgent');
    const todoAlertCount = new Set([...overdueTodos.map(t => t.id), ...urgentTodos.map(t => t.id)]).size;
    if (todoAlertCount > 0) {
      items.push({ id: 'todos', icon: CheckSquare, color: C.amber, text: `${todoAlertCount} To-do${todoAlertCount > 1 ? 's' : ''} need${todoAlertCount === 1 ? 's' : ''} attention`, nav: 'todos' });
    }
    // Drug-gene conflicts
    const pgxConflicts = (data.genetic_results || []).length > 0
      ? activeMeds.filter(m => findPgxMatches(m.display_name || m.name, data.genetic_results).some(p => p.severity === 'danger' || p.severity === 'caution')).length
      : 0;
    if (pgxConflicts > 0) {
      items.push({ id: 'pgx', icon: Zap, color: C.amber, text: `${pgxConflicts} medication${pgxConflicts > 1 ? 's' : ''} with gene interaction${pgxConflicts > 1 ? 's' : ''}`, nav: 'genetics' });
    }
    // Late period alert from cycle data
    const cyclePeriods = (data.cycles || []).filter(c => c.type === 'period').map(c => c.date).sort();
    if (cyclePeriods.length >= 2) {
      const starts = [];
      let prev = null;
      for (const d of cyclePeriods) {
        const dt = new Date(d + 'T00:00:00');
        if (!prev || (dt - prev) > 2 * 86400000) starts.push(d);
        prev = dt;
      }
      if (starts.length >= 2) {
        const lengths = [];
        for (let i = 1; i < starts.length; i++) {
          const diff = Math.round((new Date(starts[i] + 'T00:00:00') - new Date(starts[i - 1] + 'T00:00:00')) / 86400000);
          if (diff >= 18 && diff <= 45) lengths.push(diff);
        }
        const avg = lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 28;
        const lastStart = starts[starts.length - 1];
        const expected = new Date(lastStart + 'T00:00:00');
        expected.setDate(expected.getDate() + avg);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const daysLate = Math.floor((today - expected) / 86400000);
        if (daysLate >= 3) {
          items.push({ id: 'late_period', icon: Heart, color: C.rose, text: `Period is ${daysLate} day${daysLate > 1 ? 's' : ''} late`, nav: 'cycles' });
        }
      }
    }
    // Upcoming appointments within 48hr
    const nowTime = new Date();
    const cutoff = new Date(nowTime.getTime() + 48 * 60 * 60 * 1000);
    const prep = (data.appts || []).filter(a => {
      const d = new Date(a.date + (a.time ? `T${a.time}` : ''));
      return d >= nowTime && d <= cutoff;
    });
    for (const a of prep) {
      const when = new Date(a.date + (a.time ? `T${a.time}` : ''));
      const hrs = Math.round((when - nowTime) / 3600000);
      const timeLabel = hrs < 24 ? `in ${hrs}h` : 'tomorrow';
      items.push({ id: `appt-${a.id}`, icon: Calendar, color: C.rose, text: `Appointment with ${a.provider || 'provider'} ${timeLabel}`, nav: 'appts', highlightId: a.id });
    }
    return items;
  }, [anesthesiaCount, interactions, abnormalLabs, priceAlertMeds, urgentGaps, data.cycles, data.todos, data.genetic_results, data.appts, activeMeds]);
}
