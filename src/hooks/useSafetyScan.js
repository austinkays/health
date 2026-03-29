import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchSafetyCheck } from '../services/ai';
import { buildSafetyProfile } from '../services/profile';
import { hasAIConsent } from '../components/ui/AIConsentGate';

const CACHE_KEY = 'salve:safety-cache';

function hashProfile(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(hash, results) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      hash,
      results,
      timestamp: Date.now(),
    }));
  } catch { /* sessionStorage full — ignore */ }
}

export default function useSafetyScan(data, staticInteractions) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const debounceRef = useRef(null);

  // Restore from cache on mount
  useEffect(() => {
    const cached = readCache();
    if (cached && cached.results) {
      const profile = buildSafetyProfile(data, staticInteractions);
      const hash = hashProfile(profile);
      if (cached.hash === hash) {
        setResults(cached.results);
        setLastRun(new Date(cached.timestamp).toISOString());
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runScan = useCallback(async () => {
    if (!hasAIConsent()) return;

    setLoading(true);
    setError(null);

    try {
      const profile = buildSafetyProfile(data, staticInteractions);
      const hash = hashProfile(profile);

      // Check cache first
      const cached = readCache();
      if (cached && cached.hash === hash && cached.results) {
        setResults(cached.results);
        setLastRun(new Date(cached.timestamp).toISOString());
        setLoading(false);
        return;
      }

      const findings = await fetchSafetyCheck(profile);
      const now = new Date().toISOString();
      setResults(findings);
      setLastRun(now);
      writeCache(hash, findings);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [data, staticInteractions]);

  const triggerScan = useCallback(() => {
    if (!hasAIConsent()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runScan();
    }, 2000);
  }, [runScan]);

  return { results, loading, error, lastRun, runScan, triggerScan };
}
