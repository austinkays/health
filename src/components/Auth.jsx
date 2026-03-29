import { useState } from 'react';
import { signIn, verifyOtp } from '../services/auth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setVerifying(true);
    setError('');
    try {
      await verifyOtp(email, otp);
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    setError('');
    try {
      await signIn(email);
      setOtp('');
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
          <div className="bg-salve-card rounded-xl border border-salve-border p-6">
            <div className="text-center">
              <div className="text-2xl mb-3">✉️</div>
              <h2 className="font-playfair text-lg text-salve-text font-semibold mb-2">
                Check your email
              </h2>
              <p className="text-salve-textMid text-sm mb-4">
                We sent a login code to <span className="text-salve-lav">{email}</span>.
                Enter the 6-digit code below, or tap the magic link.
              </p>
            </div>

            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-salve-card2 border border-salve-border rounded-lg px-4 py-3 text-salve-text placeholder-salve-textFaint text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:border-salve-lav transition-colors mb-4"
              />
              {error && (
                <p className="text-salve-rose text-sm mb-4 text-center">{error}</p>
              )}
              <button
                type="submit"
                disabled={verifying || otp.length < 6}
                className="w-full bg-salve-lav text-salve-bg font-medium rounded-lg py-3 text-sm hover:bg-salve-lavDim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? 'Verifying...' : 'Sign in'}
              </button>
            </form>

            <div className="flex items-center justify-between mt-4">
              <button
                onClick={handleResend}
                disabled={loading}
                className="text-salve-lavDim text-sm hover:text-salve-lav transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Resend code'}
              </button>
              <button
                onClick={() => { setSent(false); setEmail(''); setOtp(''); setError(''); }}
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
          No password needed — just your email.
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
