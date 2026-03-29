import { useState } from 'react';
import { signIn } from '../services/auth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
              Check your email
            </h2>
            <p className="text-salve-textMid text-sm mb-4">
              We sent a magic link to <span className="text-salve-lav">{email}</span>.
              Click the link to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-salve-lavDim text-sm hover:text-salve-lav transition-colors"
            >
              Use a different email
            </button>
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
              {loading ? 'Sending...' : 'Send magic link'}
            </button>
          </form>
        )}

        <p className="text-center text-salve-textFaint text-xs mt-6">
          No password needed — just your email.
        </p>
      </div>
    </div>
  );
}
