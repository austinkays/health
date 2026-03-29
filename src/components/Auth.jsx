import { useState, useRef } from 'react';
import { signIn, verifyOtp } from '../services/auth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '', '', '']);
  const inputRefs = useRef([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(email);
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
    if (otp.length !== 8) return;
    setVerifying(true);
    setError('');
    try {
      await verifyOtp(email, otp);
      // Auth state change listener in App.jsx will handle the session
    } catch (err) {
      setError(err.message || 'Invalid code — please try again');
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
    try {
      await signIn(email);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-salve-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Decorative header */}
        <div className="text-center mb-10">
          <div className="text-salve-textFaint text-sm tracking-widest mb-2">✶ · ✶</div>
          <h1 className="font-playfair text-3xl font-semibold text-salve-lav mb-2">
            Salve
          </h1>
          <p className="text-salve-textMid text-sm">
            Your health, your story, your power.
          </p>
        </div>

        {sent ? (
          <div className="bg-salve-card rounded-xl border border-salve-border p-6 text-center">
            <div className="text-2xl mb-3">✉️</div>
            <h2 className="font-playfair text-lg text-salve-text font-semibold mb-2">
              Enter your login code
            </h2>
            <p className="text-salve-textMid text-sm mb-5">
              We sent an 8-digit code to <span className="text-salve-lav">{email}</span>
            </p>

            {/* 6-digit code inputs */}
            <div className="flex justify-center gap-1.5 mb-4" onPaste={handleCodePaste}>
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
                  className="w-10 h-13 text-center text-xl font-medium bg-salve-card2 border border-salve-border rounded-lg text-salve-text focus:outline-none focus:border-salve-lav transition-colors disabled:opacity-50"
                />
              ))}
            </div>

            {error && (
              <p className="text-salve-rose text-sm mb-3">{error}</p>
            )}

            <button
              onClick={() => handleVerify()}
              disabled={verifying || code.some(d => d === '')}
              className="w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 text-sm hover:bg-salve-lavDim transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-3"
            >
              {verifying ? 'Verifying...' : 'Sign in'}
            </button>

            <p className="text-salve-textFaint text-xs mb-3">
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
          <form onSubmit={handleSubmit} className="bg-salve-card rounded-xl border border-salve-border p-6">
            <label className="block text-salve-textMid text-sm mb-2" htmlFor="email">
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
              className="w-full bg-salve-card2 border border-salve-border rounded-lg px-4 py-3 text-salve-text placeholder-salve-textFaint text-sm focus:outline-none focus:border-salve-lav transition-colors mb-4"
            />
            {error && (
              <p className="text-salve-rose text-sm mb-4">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 text-sm hover:bg-salve-lavDim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send login code'}
            </button>
          </form>
        )}

        <p className="text-center text-salve-textFaint text-xs mt-6">
          No password needed — we'll send a code to your email.
        </p>

        {/* Claude sync artifact download */}
        <div className="mt-8 bg-salve-card border border-salve-border rounded-xl p-6 text-center">
          <div className="text-salve-textFaint text-base mb-3">✦</div>
          <p className="text-salve-text text-sm font-medium mb-1">
            Syncing from Claude?
          </p>
          <p className="text-salve-textFaint text-xs leading-relaxed mb-4">
            Download the sync artifact, paste it into Claude, and export your health records — then import the file here in Settings.
          </p>
          <a
            href="/salve-sync.jsx"
            download="salve-sync.jsx"
            className="inline-flex items-center justify-center gap-2 text-xs font-medium px-5 py-2.5 rounded-lg transition-opacity hover:opacity-80"
            style={{
              background: 'linear-gradient(135deg, #b8a9e8 0%, #8fbfa0 100%)',
              color: '#1a1a2e',
            }}
          >
            <span>↓</span>
            Download sync artifact
          </a>
        </div>

      </div>
    </div>
  );
}
