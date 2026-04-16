import { GREETING_ICONS, ALERT_DISMISS_KEY, SEEN_RESOURCES_KEY, DISMISSED_TIPS_KEY } from './constants';

export function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return { text: 'Good evening',   icon: GREETING_ICONS.moon,    motif: 'moon' };
  if (h < 12) return { text: 'Good morning',   icon: GREETING_ICONS.sunrise, motif: 'leaf' };
  if (h < 17) return { text: 'Good afternoon', icon: GREETING_ICONS.sun,     motif: 'sparkle' };
  if (h < 21) return { text: 'Good evening',   icon: GREETING_ICONS.sunset,  motif: 'star' };
  return         { text: 'Good evening',   icon: GREETING_ICONS.moon,    motif: 'moon' };
}

export function getContextLine(data, interactions, urgentGaps, anesthesiaCount, abnormalLabCount, alertsHidden) {
  // Priority: critical alerts → upcoming events → rotating encouragement
  if (!alertsHidden) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const overdueTodoCount = (data.todos || []).filter(t => !t.completed && !t.dismissed && t.due_date && new Date(t.due_date + 'T00:00:00') < now).length;
    const totalAlerts = (interactions?.length || 0) + urgentGaps + (anesthesiaCount > 0 ? 1 : 0) + abnormalLabCount + (overdueTodoCount > 0 ? 1 : 0);
    if (totalAlerts > 0) return `${totalAlerts} item${totalAlerts > 1 ? 's' : ''} need${totalAlerts === 1 ? 's' : ''} your attention`;
  }

  const soon = data.appts.filter(a => {
    const d = Math.ceil((new Date(a.date) - new Date(new Date().toDateString())) / 86400000);
    return d >= 0 && d <= 7;
  });
  if (soon.length > 0) return `${soon.length} appointment${soon.length > 1 ? 's' : ''} this week`;

  const refills = data.meds.filter(m => m.active !== false && m.refill_date).filter(m => {
    const d = Math.ceil((new Date(m.refill_date) - new Date(new Date().toDateString())) / 86400000);
    return d >= 0 && d <= 7;
  });
  if (refills.length > 0) return `${refills.length} refill${refills.length > 1 ? 's' : ''} coming up soon`;

  // Rotate encouragement so it doesn't feel static
  const encouragements = [
    'All caught up, take care of yourself today',
    'Everything looks good, you\'re on top of it',
    'No action items right now, enjoy the calm',
    'You\'re all set, make today a good one',
    'Nothing urgent, a great day to focus on you',
  ];
  const h = new Date().getHours();
  return encouragements[h % encouragements.length];
}

export function getDismissedTips() {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_TIPS_KEY) || '[]');
    // Migrate from old format (array of strings → array of record objects)
    if (raw.length > 0 && typeof raw[0] === 'string') {
      return raw.map(id => ({ id, permanent: true }));
    }
    return raw;
  } catch { return []; }
}

export function getSeenResources() {
  try {
    return JSON.parse(localStorage.getItem(SEEN_RESOURCES_KEY) || '[]');
  } catch { return []; }
}

export function getAlertDismissal() {
  try {
    const raw = localStorage.getItem(ALERT_DISMISS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.until === 'forever') return data;
    if (typeof data.until === 'number' && Date.now() < data.until) return data;
    localStorage.removeItem(ALERT_DISMISS_KEY);
    return null;
  } catch {
    return null;
  }
}
