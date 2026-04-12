import { useState, useRef, useEffect } from 'react';
import { signIn, verifyOtp, signInWithGoogle } from '../services/auth';
import { supabase } from '../services/supabase';
import { handleSpotlight } from '../utils/fx';

// Closed-beta invite gate. When VITE_BETA_INVITE_REQUIRED is "true", new
// signups must enter a valid invite code. Returning users (already in
// auth.users) skip this — Supabase OTP signin still works for them.
const BETA_INVITE_REQUIRED = import.meta.env.VITE_BETA_INVITE_REQUIRED === 'true';
const PENDING_INVITE_KEY = 'salve:pending-invite';

// OTP codes expire after 10 minutes (600 seconds)
const OTP_TTL = 600;

// Escalating cooldown schedule: [maxAttempts, cooldownSeconds]
const COOLDOWN_SCHEDULE = [[3, 30], [5, 120], [7, 300]];

function getCooldownSeconds(attempts) {
  for (let i = COOLDOWN_SCHEDULE.length - 1; i >= 0; i--) {
    if (attempts >= COOLDOWN_SCHEDULE[i][0]) return COOLDOWN_SCHEDULE[i][1];
  }
  return 0;
}

export default function Auth({ sessionExpired = false, onAuthSuccess, onEnterDemo }) {
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '', '', '']);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_TTL);
  const [attempts, setAttempts] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const inputRefs = useRef([]);

  // Countdown timer, resets when a new code is sent
  useEffect(() => {
    if (!sent) return;
    setOtpSecondsLeft(OTP_TTL);
    const interval = setInterval(() => {
      setOtpSecondsLeft(s => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sent]);

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownUntil) { setCooldownLeft(0); return; }
    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left <= 0) { setCooldownUntil(0); setCooldownLeft(0); return; }
      setCooldownLeft(left);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Beta gate: if an invite code is provided, validate it and allow a
      // fresh signup. If no code is provided, we still let the submit go
      // through but pass shouldCreateUser=false so Supabase only sends an
      // OTP to an already-existing account — a new email with no code will
      // be rejected by Supabase and the user will see a friendly error.
      let shouldCreateUser = true;
      if (BETA_INVITE_REQUIRED) {
        if (inviteCode.trim()) {
          const trimmed = inviteCode.trim().toUpperCase();
          const { data, error: rpcError } = await supabase.rpc('check_beta_invite', {
            code_in: trimmed,
            email_in: email.trim().toLowerCase(),
          });
          if (rpcError || !data) {
            setError('That invite code is invalid or already in use.');
            setLoading(false);
            return;
          }
          // Stash the code so App.jsx can claim it after the user signs in.
          try { localStorage.setItem(PENDING_INVITE_KEY, trimmed); } catch { /* */ }
        } else {
          // No code → only allow existing users through.
          shouldCreateUser = false;
        }
      }
      try {
        await signIn(email, shouldCreateUser);
      } catch (err) {
        // Supabase returns "Signups not allowed for otp" (or similar) when
        // shouldCreateUser=false and the email isn't registered. Translate
        // that into a friendly beta-gate message.
        const msg = (err?.message || '').toLowerCase();
        if (!shouldCreateUser && (msg.includes('signup') || msg.includes('not allowed') || msg.includes('not found'))) {
          setError('Salve is in closed beta. New accounts need an invite code.');
          setLoading(false);
          return;
        }
        throw err;
      }
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send login code');
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(index, value) {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;
    const next = [...code];
    next[index] = value;
    setCode(next);
    // Auto-advance to next input
    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 8 digits entered
    if (value && index === 7 && next.every(d => d !== '')) {
      handleVerify(next.join(''));
    }
  }

  function handleCodeKeyDown(index, e) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCodePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
    if (!pasted) return;
    const next = [...code];
    for (let i = 0; i < 8; i++) {
      next[i] = pasted[i] || '';
    }
    setCode(next);
    // Focus last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, 7);
    inputRefs.current[focusIndex]?.focus();
    // Auto-submit if all 8 digits pasted
    if (pasted.length === 8) {
      handleVerify(pasted);
    }
  }

  async function handleVerify(token) {
    const otp = token || code.join('');
    if (otp.length !== 8 || otpSecondsLeft <= 0) return;
    // Enforce cooldown
    if (cooldownUntil && Date.now() < cooldownUntil) return;
    setVerifying(true);
    setError('');
    try {
      await verifyOtp(email, otp);
      // Auth state change listener in App.jsx will handle the session
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      const cd = getCooldownSeconds(next);
      if (cd > 0) {
        setCooldownUntil(Date.now() + cd * 1000);
        setError('');
      } else {
        setError(err.message || 'Invalid code, please try again');
      }
      setCode(['', '', '', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError('');
    setCode(['', '', '', '', '', '', '', '']);
    setAttempts(0);
    setCooldownUntil(0);
    try {
      await signIn(email);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-salve-bg flex items-center justify-center px-6 relative overflow-hidden">
      <div className="auth-ambient" aria-hidden="true" />
      <div className="w-full max-w-sm md:max-w-md auth-stage relative z-10">

        {/* Decorative header */}
        <div className="text-center mb-10">
          <div className="text-salve-textFaint tracking-widest mb-3 text-display-sub" aria-hidden="true">
            <span className="twinkle">✶</span>
            <span className="mx-2">·</span>
            <span className="twinkle" style={{ animationDelay: '1.2s' }}>✶</span>
          </div>
          <h1 className="font-playfair text-display-2xl font-semibold text-gradient-magic mb-2">
            Salve
          </h1>
          <p className="text-salve-textMid text-display-sub">
            Your health, your story, your power.
          </p>
        </div>

        {/* Session expired notice */}
        {sessionExpired && (
          <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-lg px-4 py-3 mb-4 text-center">
            <p className="text-salve-rose text-sm">Your session expired. Please sign in again.</p>
          </div>
        )}

        {sent ? (
          <div className="bg-salve-card rounded-xl border border-salve-border p-6 md:p-8 text-center">
            <div className="text-2xl md:text-3xl mb-3">✉️</div>
            <h2 className="font-playfair text-lg md:text-xl text-salve-text font-semibold mb-2">
              Enter your login code
            </h2>
            <p className="text-salve-textMid text-sm md:text-base mb-1">
              We sent an 8-digit code to <span className="text-salve-lav">{email}</span>
            </p>
            {/* OTP expiry countdown */}
            <p className={`text-xs md:text-sm mb-4 ${otpSecondsLeft <= 60 ? 'text-salve-rose' : 'text-salve-textFaint'}`}>
              {otpSecondsLeft > 0
                ? `Code expires in ${Math.floor(otpSecondsLeft / 60)}:${String(otpSecondsLeft % 60).padStart(2, '0')}`
                : 'Code expired, please request a new one'
              }
            </p>

            {/* 6-digit code inputs */}
            <div className="flex justify-center gap-1.5 md:gap-2.5 mb-4" onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => inputRefs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleCodeChange(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  disabled={verifying}
                  className="w-10 h-13 md:w-12 md:h-14 text-center text-xl md:text-2xl font-medium bg-salve-card2 border border-salve-border rounded-lg text-salve-text focus:outline-none focus:border-salve-lav transition-colors disabled:opacity-50"
                />
              ))}
            </div>

            {error && (
              <p className="text-salve-rose text-sm mb-3">{error}</p>
            )}

            {cooldownLeft > 0 && (
              <p className="text-salve-rose text-sm mb-3">
                Too many attempts, try again in {cooldownLeft}s
              </p>
            )}

            <button
              onClick={() => handleVerify()}
              disabled={verifying || code.some(d => d === '') || otpSecondsLeft <= 0 || cooldownLeft > 0}
              className="cta-lift w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 md:py-3.5 text-sm md:text-base hover:bg-salve-lavDim disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {verifying ? 'Verifying...' : otpSecondsLeft <= 0 ? 'Code expired' : cooldownLeft > 0 ? `Wait ${cooldownLeft}s` : 'Sign in'}
            </button>

            <p className="text-salve-textFaint text-xs md:text-sm mb-3">
              You can also tap the magic link in the email.
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-salve-lavDim text-sm hover:text-salve-lav transition-colors"
              >
                {loading ? 'Resending...' : 'Resend code'}
              </button>
              <span className="text-salve-textFaint">·</span>
              <button
                onClick={() => { setSent(false); setEmail(''); setCode(['', '', '', '', '', '', '', '']); setError(''); }}
                className="text-salve-lavDim text-sm hover:text-salve-lav transition-colors"
              >
                Different email
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-salve-card rounded-xl border border-salve-border p-6 md:p-8">
            {/* Google Sign In */}
            <button
              onClick={async () => {
                setError('');
                try { await signInWithGoogle(); }
                catch (err) { setError(err.message || 'Google sign-in failed'); }
              }}
              onPointerMove={handleSpotlight}
              className="tile-magic w-full flex items-center justify-center gap-2.5 bg-salve-card2 border border-salve-border rounded-lg py-3 md:py-3.5 text-sm md:text-base font-medium text-salve-text cursor-pointer mb-4"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.98z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-salve-border" />
              <span className="text-salve-textFaint text-xs">or sign in with email</span>
              <div className="flex-1 h-px bg-salve-border" />
            </div>

            {/* Email OTP form */}
            <form onSubmit={handleSubmit}>
              <label className="block text-salve-textMid text-sm md:text-base mb-2" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="amber@example.com"
                required
                autoComplete="email"
                className="w-full bg-salve-card2 border border-salve-border rounded-lg px-4 py-3 md:py-3.5 text-salve-text placeholder-salve-textFaint text-sm md:text-base focus:outline-none focus:border-salve-lav transition-colors mb-4"
              />
              {BETA_INVITE_REQUIRED && (
                <>
                  <label className="block text-salve-textMid text-sm md:text-base mb-2" htmlFor="invite-code">
                    Invite code <span className="text-salve-textFaint text-xs">(new accounts only)</span>
                  </label>
                  <input
                    id="invite-code"
                    type="text"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    placeholder="SALVE-BETA-XXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="w-full bg-salve-card2 border border-salve-border rounded-lg px-4 py-3 md:py-3.5 text-salve-text placeholder-salve-textFaint text-sm md:text-base font-mono focus:outline-none focus:border-salve-lav transition-colors mb-2"
                  />
                  <p className="text-salve-textFaint text-xs md:text-sm mb-4 leading-relaxed">
                    Salve is in closed beta. Already signed up? Leave this blank.
                  </p>
                </>
              )}
              {error && (
                <p className="text-salve-rose text-sm md:text-base mb-4">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className="cta-lift w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 md:py-3.5 text-sm md:text-base hover:bg-salve-lavDim disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send login code'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-salve-textFaint text-xs md:text-sm mt-6">
          No password needed, we'll send a code to your email.
        </p>

        {/* Demo mode, explore without signing up */}
        {onEnterDemo && (
          <div className="mt-8 pt-6 border-t border-salve-border text-center">
            <p className="text-salve-textFaint text-xs md:text-sm mb-3">Not ready to sign up?</p>
            <button
              onClick={onEnterDemo}
              onPointerMove={handleSpotlight}
              className="tile-magic inline-flex items-center gap-2 text-sm md:text-base font-medium text-salve-lav bg-transparent border border-salve-lav/30 cursor-pointer px-5 py-2.5 md:px-6 md:py-3 rounded-lg font-montserrat"
            >
              Explore without signing in <span aria-hidden="true">→</span>
            </button>
            <p className="text-salve-textFaint text-[13px] md:text-xs mt-2.5 leading-relaxed">
              Browse the app with an example user's data.
            </p>
            <p className="text-salve-textFaint text-[13px] md:text-xs leading-relaxed">
              Nothing saves until you sign up.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
