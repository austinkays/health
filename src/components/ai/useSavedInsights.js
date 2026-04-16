import { useState, useCallback } from 'react';
import { INSIGHTS_SAVE_KEY } from './constants';
import { stripDisclaimer } from './helpers';

export default function useSavedInsights() {
  const [saved, setSaved] = useState(() => {
    try { return JSON.parse(localStorage.getItem(INSIGHTS_SAVE_KEY) || '[]'); } catch { return []; }
  });
  const save = useCallback((type, label, text) => {
    setSaved(prev => {
      const next = [...prev, { type, label, text: stripDisclaimer(text), savedAt: new Date().toISOString() }];
      localStorage.setItem(INSIGHTS_SAVE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const remove = useCallback((index) => {
    setSaved(prev => {
      const next = prev.filter((_, i) => i !== index);
      localStorage.setItem(INSIGHTS_SAVE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const isSaved = useCallback((type, text) =>
    saved.some(s => s.type === type && s.text === stripDisclaimer(text)), [saved]);
  return { saved, save, remove, isSaved };
}
