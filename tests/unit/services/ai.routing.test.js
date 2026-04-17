import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAIProvider,
  setAIProvider,
  getModel,
  isFeatureLocked,
  getConversationCap,
  isPremiumActive,
  isAdminActive,
  trialDaysRemaining,
  setDemoMode,
  setPremiumActive,
  setAdminActive,
} from '../../../src/services/ai.js';

// Module-private tier flags — reset between tests via the setters.
function resetTierFlags() {
  setDemoMode(false);
  setPremiumActive(false);
  setAdminActive(false);
}

beforeEach(() => {
  resetTierFlags();
  localStorage.clear();
});

afterEach(() => {
  resetTierFlags();
  localStorage.clear();
});

describe('getAIProvider / setAIProvider', () => {
  it('defaults to gemini (free tier)', () => {
    expect(getAIProvider()).toBe('gemini');
  });

  it('persists to localStorage', () => {
    setAIProvider('anthropic');
    expect(getAIProvider()).toBe('anthropic');
  });

  it('persists across "reloads" (different getAIProvider calls)', () => {
    setAIProvider('anthropic');
    setAIProvider('gemini');
    expect(getAIProvider()).toBe('gemini');
  });
});

describe('getModel — Gemini routing', () => {
  beforeEach(() => setAIProvider('gemini'));

  it('routes lite features to Flash-Lite', () => {
    expect(getModel('insight')).toEqual({ endpoint: '/api/gemini', model: 'gemini-2.5-flash-lite' });
    expect(getModel('labInterpret').model).toBe('gemini-2.5-flash-lite');
    expect(getModel('vitalsTrend').model).toBe('gemini-2.5-flash-lite');
    expect(getModel('geneticExplanation').model).toBe('gemini-2.5-flash-lite');
    expect(getModel('crossReactivity').model).toBe('gemini-2.5-flash-lite');
  });

  it('routes pro features to Pro', () => {
    expect(getModel('connections').model).toBe('gemini-2.5-pro');
    expect(getModel('careGapDetect').model).toBe('gemini-2.5-pro');
    expect(getModel('journalPatterns').model).toBe('gemini-2.5-pro');
    expect(getModel('appealDraft').model).toBe('gemini-2.5-pro');
    expect(getModel('costOptimization').model).toBe('gemini-2.5-pro');
  });

  it('routes everything else to Flash (default tier)', () => {
    expect(getModel('ask').model).toBe('gemini-2.5-flash');
    expect(getModel('resources').model).toBe('gemini-2.5-flash');
    expect(getModel('appointmentPrep').model).toBe('gemini-2.5-flash');
  });

  it('routes chat to lite during the beta cost-control window', () => {
    // BETA_LITE_FEATURES forces chat down to lite tier
    expect(getModel('chat').model).toBe('gemini-2.5-flash-lite');
  });
});

describe('getModel — Anthropic routing', () => {
  beforeEach(() => setAIProvider('anthropic'));

  it('routes lite features to Haiku', () => {
    expect(getModel('insight')).toEqual({ endpoint: '/api/chat', model: 'claude-haiku-4-5-20251001' });
  });

  it('routes pro features to Opus', () => {
    expect(getModel('connections').model).toBe('claude-opus-4-6');
  });

  it('routes default features to Sonnet', () => {
    expect(getModel('ask').model).toBe('claude-sonnet-4-6');
  });

  it('routes chat to Haiku during beta cost-control', () => {
    expect(getModel('chat').model).toBe('claude-haiku-4-5-20251001');
  });

  it('always uses /api/chat endpoint', () => {
    expect(getModel('insight').endpoint).toBe('/api/chat');
    expect(getModel('connections').endpoint).toBe('/api/chat');
    expect(getModel('ask').endpoint).toBe('/api/chat');
  });
});

describe('isFeatureLocked — tier gates', () => {
  it('FREE: blocks connections, careGapDetect, appealDraft, immunizationSchedule, houseConsultation, monthlySummary, toolUse', () => {
    // no tier setters called → free user
    expect(isFeatureLocked('connections')).toBe(true);
    expect(isFeatureLocked('careGapDetect')).toBe(true);
    expect(isFeatureLocked('appealDraft')).toBe(true);
    expect(isFeatureLocked('immunizationSchedule')).toBe(true);
    expect(isFeatureLocked('houseConsultation')).toBe(true);
    expect(isFeatureLocked('monthlySummary')).toBe(true);
    expect(isFeatureLocked('toolUse')).toBe(true);
  });

  it('FREE: allows lite + default features', () => {
    expect(isFeatureLocked('insight')).toBe(false);
    expect(isFeatureLocked('ask')).toBe(false);
    expect(isFeatureLocked('labInterpret')).toBe(false);
    expect(isFeatureLocked('resources')).toBe(false);
    expect(isFeatureLocked('vitalsTrend')).toBe(false);
  });

  it('PREMIUM: unlocks Pro features but keeps admin-only features locked', () => {
    setPremiumActive(true);
    expect(isFeatureLocked('connections')).toBe(false);
    expect(isFeatureLocked('careGapDetect')).toBe(false);
    expect(isFeatureLocked('toolUse')).toBe(false);
    // Admin-only stays locked
    expect(isFeatureLocked('houseConsultation')).toBe(true);
  });

  it('ADMIN: unlocks everything including houseConsultation', () => {
    setAdminActive(true);
    expect(isFeatureLocked('houseConsultation')).toBe(false);
    expect(isFeatureLocked('connections')).toBe(false);
    expect(isFeatureLocked('toolUse')).toBe(false);
  });

  it('DEMO: unlocks everything (canned responses, nothing to gate)', () => {
    setDemoMode(true);
    expect(isFeatureLocked('houseConsultation')).toBe(false);
    expect(isFeatureLocked('connections')).toBe(false);
    expect(isFeatureLocked('toolUse')).toBe(false);
  });
});

describe('getConversationCap', () => {
  it('FREE: returns 5', () => {
    expect(getConversationCap()).toBe(5);
  });

  it('PREMIUM: returns Infinity', () => {
    setPremiumActive(true);
    expect(getConversationCap()).toBe(Infinity);
  });

  it('ADMIN: returns Infinity', () => {
    setAdminActive(true);
    expect(getConversationCap()).toBe(Infinity);
  });

  it('DEMO: returns Infinity', () => {
    setDemoMode(true);
    expect(getConversationCap()).toBe(Infinity);
  });
});

describe('isPremiumActive — settings-based tier check', () => {
  it('returns false for null / free-tier settings', () => {
    expect(isPremiumActive(null)).toBe(false);
    expect(isPremiumActive({ tier: 'free' })).toBe(false);
    expect(isPremiumActive({})).toBe(false);
  });

  it('returns true for permanent premium (trial_expires_at = null)', () => {
    expect(isPremiumActive({ tier: 'premium', trial_expires_at: null })).toBe(true);
    expect(isPremiumActive({ tier: 'admin', trial_expires_at: null })).toBe(true);
  });

  it('returns true for active trial (expires in the future)', () => {
    const future = new Date(Date.now() + 7 * 86400_000).toISOString();
    expect(isPremiumActive({ tier: 'premium', trial_expires_at: future })).toBe(true);
  });

  it('returns false for expired trial', () => {
    const past = new Date(Date.now() - 7 * 86400_000).toISOString();
    expect(isPremiumActive({ tier: 'premium', trial_expires_at: past })).toBe(false);
  });

  it('returns false for malformed trial_expires_at (NaN-guarded)', () => {
    expect(isPremiumActive({ tier: 'premium', trial_expires_at: 'not-a-date' })).toBe(false);
  });
});

describe('isAdminActive — settings-based tier check', () => {
  it('returns false for non-admin settings', () => {
    expect(isAdminActive(null)).toBe(false);
    expect(isAdminActive({ tier: 'premium' })).toBe(false);
    expect(isAdminActive({ tier: 'free' })).toBe(false);
  });

  it('returns true for permanent admin (trial_expires_at = null)', () => {
    expect(isAdminActive({ tier: 'admin', trial_expires_at: null })).toBe(true);
  });

  it('returns true for active admin trial, false for expired', () => {
    const future = new Date(Date.now() + 7 * 86400_000).toISOString();
    const past = new Date(Date.now() - 7 * 86400_000).toISOString();
    expect(isAdminActive({ tier: 'admin', trial_expires_at: future })).toBe(true);
    expect(isAdminActive({ tier: 'admin', trial_expires_at: past })).toBe(false);
  });
});

describe('trialDaysRemaining', () => {
  it('returns null for permanent accounts (no trial_expires_at)', () => {
    expect(trialDaysRemaining(null)).toBe(null);
    expect(trialDaysRemaining({})).toBe(null);
    expect(trialDaysRemaining({ trial_expires_at: null })).toBe(null);
  });

  it('returns null for malformed dates', () => {
    expect(trialDaysRemaining({ trial_expires_at: 'invalid' })).toBe(null);
  });

  it('returns 0 for expired trials', () => {
    const past = new Date(Date.now() - 7 * 86400_000).toISOString();
    expect(trialDaysRemaining({ trial_expires_at: past })).toBe(0);
  });

  it('ceilings whole days remaining', () => {
    const fiveDaysOut = new Date(Date.now() + 4.2 * 86400_000).toISOString();
    expect(trialDaysRemaining({ trial_expires_at: fiveDaysOut })).toBe(5);
  });
});
