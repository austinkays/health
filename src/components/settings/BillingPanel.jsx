import { useState } from 'react';
import { Crown } from 'lucide-react';
import Card from '../ui/Card';
import { supabase } from '../../services/supabase';
import { openCustomerPortal, BILLING_ENABLED } from '../../services/billing';

export default function BillingPanel({
  s,
  userTier,
  trialDays,
  isOnTrial,
  trialExpired,
  handleUpgrade,
  checkoutLoading,
  checkoutError,
  selectedPlan,
  setSelectedPlan,
  reloadData,
  onNav,
}) {
  const [betaCode, setBetaCode] = useState('');
  const [betaStatus, setBetaStatus] = useState(null); // null | 'loading' | 'success' | 'error'

  const handleRedeemBeta = async () => {
    if (!betaCode.trim()) return;
    setBetaStatus('loading');
    try {
      const { data: ok, error } = await supabase.rpc('claim_beta_invite', { code_in: betaCode.trim().toUpperCase() });
      if (error || !ok) { setBetaStatus('error'); return; }
      setBetaStatus('success');
      setBetaCode('');
      if (reloadData) await reloadData();
    } catch { setBetaStatus('error'); }
  };

  const [portalLoading, setPortalLoading] = useState(false);
  const handleManageSub = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch {
      setPortalLoading(false);
    }
  };

  const [tierOverride, setTierOverride] = useState(() => {
    try { return localStorage.getItem('salve:tier-override') || ''; } catch { return ''; }
  });
  const applyOverride = (val) => {
    try {
      if (val) localStorage.setItem('salve:tier-override', val);
      else localStorage.removeItem('salve:tier-override');
    } catch { /* ignore */ }
    setTierOverride(val);
    window.location.reload();
  };

  return (
    <Card>
      <div className="flex items-center gap-2.5 mb-2">
        <Crown size={16} className={userTier === 'admin' ? 'text-salve-amber' : userTier === 'premium' ? 'text-salve-amber' : 'text-salve-textFaint'} />
        <div>
          <span className="text-sm text-salve-text font-medium font-montserrat">
            {userTier === 'admin' ? 'Admin Tier' : userTier === 'premium' ? (isOnTrial ? 'Free Trial' : 'Premium') : 'Free Plan'}
          </span>
          <span className={`text-[12px] ml-2 px-1.5 py-0.5 rounded-full font-medium ${userTier === 'admin' ? 'bg-salve-amber/15 text-salve-amber' : userTier === 'premium' ? 'bg-salve-amber/15 text-salve-amber' : 'bg-salve-card2 text-salve-textFaint'}`}>
            {userTier === 'admin' ? 'Active' : userTier === 'premium' ? (isOnTrial ? `${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Active') : 'Current'}
          </span>
        </div>
      </div>
      {userTier === 'admin' && (
        <>
          <p className="text-[13px] text-salve-textMid font-montserrat leading-relaxed mt-1.5">
            All features unlocked. House Consultation uses both Claude and Gemini simultaneously for dual-AI differential analysis.
          </p>
          <button
            onClick={() => onNav('admin')}
            className="mt-2 text-[13px] text-salve-lav/80 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
          >
            Feedback inbox →
          </button>
        </>
      )}
      {isOnTrial && (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-salve-textMid font-montserrat leading-relaxed">
            You're on a free Premium trial with full access to every feature.
          </p>
          {BILLING_ENABLED && (
            <>
              <button
                onClick={handleUpgrade}
                disabled={checkoutLoading}
                className="w-full py-2 rounded-xl text-[14px] font-medium font-montserrat bg-salve-lav/15 border border-salve-lav/30 text-salve-lav hover:bg-salve-lav/25 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {checkoutLoading ? 'Opening checkout…' : 'Upgrade to keep access after trial →'}
              </button>
              {checkoutError && <p className="text-[13px] text-salve-rose font-montserrat">{checkoutError}</p>}
            </>
          )}
        </div>
      )}
      {trialExpired && (
        <div className="space-y-2 mt-2">
          <p className="text-[13px] text-salve-rose font-montserrat leading-relaxed">
            Your trial ended. You're now on the free plan.
          </p>
          {BILLING_ENABLED ? (
            <>
              <p className="text-[13px] text-salve-textMid font-montserrat leading-relaxed">
                Upgrading keeps advanced insights, experimental themes, and unlimited access.
              </p>
              <button
                onClick={handleUpgrade}
                disabled={checkoutLoading}
                className="w-full py-2 rounded-xl text-[14px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-60 cursor-pointer border-0"
              >
                {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Premium →'}
              </button>
              {checkoutError && <p className="text-[13px] text-salve-rose font-montserrat">{checkoutError}</p>}
            </>
          ) : null}
        </div>
      )}
      {/* Beta code redemption — visible to free users and trial-expired users */}
      {(userTier === 'free' || trialExpired) && (
        <div className="mt-3 p-3 rounded-xl border border-salve-lav/20 bg-salve-lav/5">
          <p className="text-[13px] text-salve-text font-medium font-montserrat mb-1.5">Have a beta code?</p>
          <p className="text-[12px] text-salve-textFaint font-montserrat mb-2">Redeem it for 2 weeks of full Premium access.</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={betaCode}
              onChange={e => { setBetaCode(e.target.value.toUpperCase()); setBetaStatus(null); }}
              placeholder="Enter code"
              className="flex-1 px-3 py-1.5 rounded-lg text-[13px] font-montserrat bg-salve-card border border-salve-border text-salve-text placeholder:text-salve-textFaint/50 focus:outline-none focus:border-salve-lav/50 focus:ring-1 focus:ring-salve-lav/20"
              disabled={betaStatus === 'loading' || betaStatus === 'success'}
            />
            <button
              onClick={handleRedeemBeta}
              disabled={!betaCode.trim() || betaStatus === 'loading' || betaStatus === 'success'}
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-50 cursor-pointer border-0"
            >
              {betaStatus === 'loading' ? 'Checking...' : betaStatus === 'success' ? '✓ Activated' : 'Redeem'}
            </button>
          </div>
          {betaStatus === 'error' && (
            <p className="text-[12px] text-salve-rose font-montserrat mt-1.5">Invalid or already claimed code. Double check and try again.</p>
          )}
          {betaStatus === 'success' && (
            <p className="text-[12px] text-salve-sage font-montserrat mt-1.5">Premium activated for 14 days. Enjoy!</p>
          )}
        </div>
      )}
      {userTier === 'free' && !trialExpired && (
        <div className="mt-2 space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px] font-montserrat">
            <div className="text-salve-textFaint font-medium col-span-2 border-b border-salve-border/50 pb-1 mb-0.5">Free vs Premium</div>
            <span className="text-salve-textMid">Sage AI assistant</span>
            <span className="text-salve-sage text-right">✓ Included</span>
            <span className="text-salve-textMid">Smarter AI models</span>
            <span className="text-salve-lav text-right">Premium</span>
            <span className="text-salve-textMid">Connections & patterns</span>
            <span className="text-salve-lav text-right">Premium</span>
            <span className="text-salve-textMid">Care gaps & cost savings</span>
            <span className="text-salve-lav text-right">Premium</span>
            <span className="text-salve-textMid">Experimental themes</span>
            <span className="text-salve-lav text-right">Premium</span>
            <span className="text-salve-textMid">Daily AI limit</span>
            <span className="text-salve-textFaint text-right">10 / day → Unlimited</span>
          </div>
          {BILLING_ENABLED ? (
            <>
              <button
                onClick={handleUpgrade}
                disabled={checkoutLoading}
                className="w-full py-2 rounded-xl text-[14px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-60 cursor-pointer border-0"
              >
                {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Premium →'}
              </button>
              {checkoutError && <p className="text-[13px] text-salve-rose font-montserrat">{checkoutError}</p>}
            </>
          ) : null}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedPlan('monthly')}
              className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-medium font-montserrat border transition-colors cursor-pointer ${selectedPlan === 'monthly' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border bg-salve-card text-salve-textMid'}`}
            >
              <div className="font-semibold">$7.99/mo</div>
              <div className="text-[10px] opacity-70 mt-0.5">Monthly</div>
            </button>
            <button
              onClick={() => setSelectedPlan('annual')}
              className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-medium font-montserrat border transition-colors cursor-pointer relative ${selectedPlan === 'annual' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border bg-salve-card text-salve-textMid'}`}
            >
              <div className="font-semibold">$72/yr</div>
              <div className="text-[10px] opacity-70 mt-0.5">Save 25%</div>
            </button>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={checkoutLoading}
            className="w-full py-2 rounded-xl text-[12px] font-medium font-montserrat bg-salve-lav text-white hover:bg-salve-lav/80 transition-colors disabled:opacity-60 cursor-pointer border-0"
          >
            {checkoutLoading ? 'Opening checkout…' : 'Upgrade to Premium →'}
          </button>
          {checkoutError && <p className="text-[11px] text-salve-rose font-montserrat">{checkoutError}</p>}
        </div>
      )}
      {userTier === 'premium' && !isOnTrial && BILLING_ENABLED && (
        <button
          onClick={handleManageSub}
          disabled={portalLoading}
          className="mt-2 text-[11px] text-salve-textFaint font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-textMid transition-colors p-0 disabled:opacity-60"
        >
          {portalLoading ? 'Opening…' : 'Manage subscription →'}
        </button>
      )}
      {/* Dev-mode tier override, lets you preview the free/expired state without waiting */}
      {import.meta.env.DEV && (
        <div className="mt-3 pt-3 border-t border-salve-border">
          <p className="text-[12px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-1.5">Dev: tier override</p>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => applyOverride('')}
              className={`text-[12px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === '' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
            >
              Actual ({s?.tier === 'premium' && isOnTrial ? 'trial' : s?.tier || 'free'})
            </button>
            <button
              onClick={() => applyOverride('free')}
              className={`text-[12px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'free' ? 'border-salve-rose/50 bg-salve-rose/10 text-salve-rose' : 'border-salve-border text-salve-textFaint'}`}
            >
              Force free
            </button>
            <button
              onClick={() => applyOverride('premium')}
              className={`text-[12px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'premium' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
            >
              Force premium
            </button>
            <button
              onClick={() => applyOverride('admin')}
              className={`text-[12px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'admin' ? 'border-salve-amber/50 bg-salve-amber/10 text-salve-amber' : 'border-salve-border text-salve-textFaint'}`}
            >
              Force admin
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
