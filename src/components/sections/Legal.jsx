import { useState } from 'react';
import Card from '../ui/Card';

const TABS = [
  { key: 'privacy',  label: 'Privacy' },
  { key: 'terms',    label: 'Terms' },
  { key: 'hipaa',    label: 'HIPAA Notice' },
  { key: 'security', label: 'Security' },
];

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="font-playfair text-[15px] font-semibold text-salve-lav m-0 mb-2">{title}</h3>
      <div className="text-[12.5px] text-salve-textMid leading-relaxed space-y-2.5 font-montserrat">{children}</div>
    </div>
  );
}

function Callout({ children, color = 'lav' }) {
  const styles = {
    lav:   'border-salve-lav/30 bg-salve-lav/5 text-salve-text',
    sage:  'border-salve-sage/30 bg-salve-sage/5 text-salve-text',
    amber: 'border-salve-amber/30 bg-salve-amber/5 text-salve-text',
  };
  return (
    <div className={`border rounded-xl p-3.5 text-[12.5px] leading-relaxed font-montserrat ${styles[color]}`}>
      {children}
    </div>
  );
}

function Privacy() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-1">Privacy Policy</h2>
      <p className="text-[11px] text-salve-textFaint mb-5">Last updated: April 2026</p>

      <Callout color="sage">
        <strong>The short version:</strong> Your health data belongs to you. It's stored in your account and nowhere else. We don't sell it, share it, or use it for advertising — ever. You can export or delete everything at any time.
      </Callout>

      <div className="mt-5">
        <Section title="Who built this">
          <p>Salve was built by one person, for their partner — someone managing multiple chronic conditions across many providers. It started as a personal tool and grew into something worth sharing.</p>
          <p>There is no company behind this, no investors, no monetization strategy built around your data. It's a small, independent app run by a single developer.</p>
        </Section>

        <Section title="What we store">
          <p>Salve stores exactly what you put into it: medications, conditions, vitals, appointments, lab results, journal entries, allergies, providers, and any other health records you add. We also store your email address to authenticate your account.</p>
          <p>We do not collect analytics, usage tracking, crash reports (unless you've enabled Sentry in Settings), device identifiers, location data, or behavioral data of any kind.</p>
        </Section>

        <Section title="Where your data lives">
          <p>Your data is stored in a <strong className="text-salve-text">Supabase</strong> PostgreSQL database hosted in the United States. Every single database table has Row Level Security (RLS) enforced — this is a database-level rule that makes it technically impossible for one user's account to read another user's records, even if there were a bug in the app code.</p>
          <p>When you use the app on a device, a read cache is stored locally on that device. That cache is encrypted with AES-GCM — a military-grade encryption standard — using a key derived from your session token. Even if someone had physical access to your device's local storage, they would see encrypted ciphertext, not your health data.</p>
        </Section>

        <Section title="What gets sent where">
          <p>Here is every external service that receives any data, and exactly what they get:</p>

          <div className="space-y-3 mt-1">
            <div className="border border-salve-border rounded-lg p-3">
              <p className="font-semibold text-salve-text mb-1">Supabase — your health records</p>
              <p>Your encrypted health data lives here. Supabase is the database provider, similar to how your bank stores your account data with a cloud provider. <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">Supabase privacy policy ↗</a></p>
            </div>

            <div className="border border-salve-border rounded-lg p-3">
              <p className="font-semibold text-salve-text mb-1">Vercel — the app itself</p>
              <p>Salve's code runs on Vercel. They serve the app to your browser. API keys (Anthropic, Gemini, Supabase service role) live here as server-side environment variables and are never exposed to your device. <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">Vercel privacy policy ↗</a></p>
            </div>

            <div className="border border-salve-border rounded-lg p-3">
              <p className="font-semibold text-salve-text mb-1">Google Gemini / Anthropic Claude — AI features only, with your consent</p>
              <p>When you use Sage or any AI feature, a summary of your health profile (medications, conditions, recent vitals, etc.) is sent to the AI provider to generate a response. <strong className="text-salve-text">This only happens after you explicitly consent.</strong> You can revoke consent at any time in Settings and no further data will be sent.</p>
              <p className="mt-1">What gets sent is a text summary — not your raw database records. It is sanitized to remove potential injection content before sending. Each provider's data retention is governed by their own policies: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">Google ↗</a> · <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">Anthropic ↗</a></p>
            </div>

            <div className="border border-salve-border rounded-lg p-3">
              <p className="font-semibold text-salve-text mb-1">RxNorm, OpenFDA, NPPES — drug and provider lookups</p>
              <p>When you search for a medication or provider, a drug name or NPI number is sent to free U.S. government APIs (run by NIH and CMS). <strong className="text-salve-text">No personal health data is included in these requests</strong> — only the search term itself. These are public reference databases.</p>
            </div>

            <div className="border border-salve-border rounded-lg p-3">
              <p className="font-semibold text-salve-text mb-1">Oura Ring — only if you connect one</p>
              <p>If you connect an Oura Ring, Salve retrieves temperature, sleep, and readiness data from the Oura API using OAuth2. Your Oura credentials are stored encrypted on your device only — never on Salve's servers. You can disconnect at any time in Settings and all tokens are immediately cleared.</p>
            </div>
          </div>
        </Section>

        <Section title="What we do NOT do">
          <ul className="list-none space-y-1.5">
            {[
              'Sell your data to anyone, ever',
              'Share your data with advertisers or data brokers',
              'Use your health data to train AI models',
              'Read your health records ourselves',
              'Send you marketing emails',
              'Track you across other websites or apps',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-salve-sage mt-0.5 flex-shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Your data, your control">
          <p>You have full control over everything in Salve:</p>
          <ul className="list-none space-y-2 mt-1">
            {[
              { label: 'View', desc: 'Everything you\'ve entered is visible to you in the app' },
              { label: 'Export', desc: 'Download a complete backup of all your data at any time (Settings → Data Management). Optionally encrypted with your own passphrase.' },
              { label: 'Edit', desc: 'Change or correct any record directly in the app' },
              { label: 'Delete records', desc: 'Remove individual entries or erase all data at once from Settings' },
              { label: 'Delete account', desc: 'Permanently delete your account and all associated data — including your auth record — from Settings. This cannot be undone and cascades across every table.' },
              { label: 'Revoke AI consent', desc: 'Stop AI features from accessing your health profile at any time in Settings' },
            ].map(item => (
              <li key={item.label} className="flex items-start gap-2">
                <span className="text-salve-lav font-semibold flex-shrink-0 min-w-[90px]">{item.label}</span>
                <span>{item.desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="If Salve ever shuts down">
          <p>This is something every user of a small independent app should ask. If Salve were ever discontinued, you would receive advance notice, a window to export your data, and clear instructions. Your data would not be sold as part of any acquisition — it would be deleted from Supabase servers.</p>
          <p>This is why the export feature exists and why it's designed to produce a clean, open JSON format you can read in any text editor. Your health data should never be held hostage by any app, including this one.</p>
        </Section>

        <Section title="Age requirement">
          <p>Salve is intended for users 13 and older. If you are under 13, please do not create an account. Users between 13 and 18 should have parent or guardian involvement, especially given the sensitive nature of health data.</p>
        </Section>

        <Section title="Changes to this policy">
          <p>If this policy changes in a meaningful way, the date at the top will update and — if the change affects how your data is used — you'll see a notice in the app. We will not retroactively apply new data practices to existing users without notice.</p>
        </Section>
      </div>
    </Card>
  );
}

function Terms() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-1">Terms of Service</h2>
      <p className="text-[11px] text-salve-textFaint mb-5">Last updated: April 2026</p>

      <Callout color="amber">
        <strong>Important:</strong> Salve is a personal organization tool, not a medical device or clinical service. Nothing in the app should be used to make medical decisions without consulting a qualified healthcare provider.
      </Callout>

      <div className="mt-5">
        <Section title="What Salve is">
          <p>Salve helps you organize, track, and understand your own health information. It is a personal productivity tool in the same way a notes app or calendar is — just built specifically for health.</p>
          <p>It is not a diagnostic tool, a treatment platform, a clinical service, or a substitute for any healthcare provider relationship.</p>
        </Section>

        <Section title="What Salve is not">
          <ul className="list-none space-y-1.5">
            {[
              'Not a substitute for professional medical advice',
              'Not a diagnostic tool — it cannot diagnose conditions',
              'Not an emergency service — call 911 or your local emergency number in any emergency',
              'Not a pharmacy — medication information shown is for reference only',
              'Not a licensed healthcare provider of any kind',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-salve-rose flex-shrink-0 mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="AI-generated content">
          <p>Sage and all AI features in Salve generate responses based on the health information you've entered. These responses are informational and conversational — they are not medical advice, clinical recommendations, or diagnoses.</p>
          <p>Always discuss AI-generated health insights with your actual healthcare providers before making any decisions. AI models can be wrong, can miss context, and do not have access to your complete medical history.</p>
        </Section>

        <Section title="Your responsibilities">
          <p>You are responsible for the accuracy of information you enter. Salve does not verify that medications, dosages, conditions, or other data you provide are correct. Errors in your data will produce errors in AI responses and interaction checks.</p>
          <p>You are responsible for keeping your account credentials secure. Do not share your account with others — each person should have their own account.</p>
        </Section>

        <Section title="Service availability">
          <p>Salve is provided by a single developer and runs on third-party infrastructure (Supabase, Vercel). While every effort is made to keep it reliable, there are no guarantees of uptime, and the service may occasionally be unavailable.</p>
          <p>Features may change over time. We will try to communicate significant changes, but reserve the right to modify or remove features. This is a living app, not a contract.</p>
        </Section>

        <Section title="Accounts">
          <p>You need a valid email address to create an account. Accounts may be suspended or terminated for abuse — including automated access, attempts to access other users' data, or activity that degrades the service for others.</p>
        </Section>

        <Section title="Limitation of liability">
          <p>To the extent permitted by law, Salve and its creator are not liable for health decisions made based on information displayed in the app, data loss due to circumstances outside our control, or service interruptions.</p>
          <p>This is a free tool built in good faith. If something goes wrong, please reach out — but the legal protection here is necessarily limited for an independent project of this kind.</p>
        </Section>
      </div>
    </Card>
  );
}

function HipaaNotice() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-1">HIPAA Notice</h2>
      <p className="text-[11px] text-salve-textFaint mb-5">Last updated: April 2026</p>

      <Callout color="amber">
        <strong>Plain English:</strong> Salve is not covered by HIPAA. This is normal and expected for a consumer health app — the same is true for Apple Health, MyFitnessPal, and most health tracking tools you use. Here's what that means and what we do instead.
      </Callout>

      <div className="mt-5">
        <Section title="Why HIPAA doesn't apply">
          <p>HIPAA (the Health Insurance Portability and Accountability Act) applies to <em>covered entities</em>: healthcare providers, health insurance plans, and healthcare clearinghouses — plus their business associates.</p>
          <p>Salve is none of those things. It is a personal tool you use to organize health information you choose to enter. The same is true for your notes app, your calendar, and your email. When you write down your medication list in a notebook, your notebook isn't HIPAA-covered either.</p>
          <p>This is not a loophole or a risk — it is how consumer health tools work by design. Your doctor's records are HIPAA-protected. Your personal copy of that information, wherever you keep it, is not.</p>
        </Section>

        <Section title="What this means practically">
          <ul className="list-none space-y-2">
            {[
              { label: 'No legal breach notification', desc: 'HIPAA requires covered entities to notify you within 60 days of a data breach. That legal obligation does not apply to Salve. However, we commit to notifying users promptly of any incident affecting their data — not because we\'re legally required to, but because it\'s the right thing to do.' },
              { label: 'No BAAs', desc: 'HIPAA requires covered entities to sign Business Associate Agreements with their vendors. We have no such agreements because they are not applicable.' },
              { label: 'Your rights differ', desc: 'Under HIPAA, you have specific rights to access and correct records held by your doctors. Those specific rights don\'t transfer to Salve — but you have broader practical control here: you can view, edit, export, or delete everything at any time.' },
            ].map(item => (
              <li key={item.label} className="border border-salve-border rounded-lg p-3">
                <p className="font-semibold text-salve-text mb-1">{item.label}</p>
                <p>{item.desc}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="What we do instead">
          <p>Not being HIPAA-covered does not mean being careless. Here is the actual technical protection in place:</p>
          <ul className="list-none space-y-1.5 mt-1">
            {[
              'Row Level Security on every database table — your records are mathematically isolated from other users\' at the database engine level',
              'AES-GCM encryption for all locally cached data — the same encryption standard used by governments and financial institutions',
              'HTTPS for all data in transit — no data travels unencrypted between your device and our servers',
              'Server-side API keys — no secret credentials are ever exposed to your browser or device',
              'Optional encrypted export — you can back up your data with a passphrase only you know',
              'Zero third-party analytics or tracking — we don\'t know how you use the app',
              'Account deletion cascades — deleting your account removes every record from every table',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-salve-sage mt-0.5 flex-shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Our honest recommendation">
          <p>Salve is a companion for managing your health — not a replacement for your official medical records. Your actual records are safest with your healthcare providers and health systems, who are HIPAA-covered and legally accountable for them.</p>
          <p>Use Salve's export feature to keep regular backups of your data. Don't rely on any single app — including this one — as your only copy of important health information.</p>
        </Section>
      </div>
    </Card>
  );
}

function SecurityPage() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-1">Security</h2>
      <p className="text-[11px] text-salve-textFaint mb-5">Last updated: April 2026</p>

      <Callout color="sage">
        These are the specific questions security-conscious users ask. Here are the honest, technical answers — no marketing language.
      </Callout>

      <div className="mt-5">
        <Section title="Is data encrypted in transit and at rest?">
          <p><strong className="text-salve-text">In transit: Yes.</strong> All communication between your device and Salve's servers uses HTTPS/TLS. Data never travels in plaintext over the network — not your health records, not your session tokens, not API calls.</p>
          <p><strong className="text-salve-text">At rest (server): Yes.</strong> Your database records are stored in Supabase (hosted on AWS). Supabase encrypts data at the infrastructure level using AES-256, which is handled by AWS at the storage layer.</p>
          <p><strong className="text-salve-text">At rest (your device): Yes.</strong> The local read cache on your device is encrypted with AES-GCM using a key derived from your session token via PBKDF2 (100,000 iterations, SHA-256). If someone extracted your device's local storage, they would see ciphertext — not your health data.</p>
          <p><strong className="text-salve-text">Encrypted backups: Yes, optionally.</strong> You can download backups encrypted with a passphrase only you know. The same AES-GCM + PBKDF2 scheme is used. Salve never sees your backup passphrase.</p>
        </Section>

        <Section title="What encryption algorithms are used?">
          <ul className="list-none space-y-2">
            {[
              { label: 'AES-GCM (256-bit)', desc: 'Used for local device cache and optional encrypted exports. This is an authenticated encryption mode — it detects tampering in addition to providing confidentiality.' },
              { label: 'PBKDF2 (SHA-256, 100,000 iterations)', desc: 'Used to derive encryption keys from your session token (for cache) or your backup passphrase (for exports). The iteration count makes brute-force attacks computationally expensive.' },
              { label: 'TLS 1.2 / 1.3', desc: 'Used for all network transport. Enforced by Vercel (app) and Supabase (database). No unencrypted HTTP.' },
              { label: 'AES-256 (AWS/Supabase)', desc: 'Server-side storage encryption managed by Supabase\'s infrastructure provider.' },
            ].map(item => (
              <li key={item.label} className="border border-salve-border rounded-lg p-3">
                <p className="font-semibold text-salve-text mb-0.5">{item.label}</p>
                <p>{item.desc}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Who holds the encryption keys?">
          <ul className="list-none space-y-1.5">
            {[
              { label: 'Device cache', desc: 'Your session token is the key material. When you sign out, the token is cleared and the cache is unreadable. Salve\'s servers never see your derived key.' },
              { label: 'Encrypted exports', desc: 'Your passphrase. Salve never transmits or stores it. If you lose the passphrase, the backup cannot be recovered — not even by us.' },
              { label: 'Server-side database', desc: 'Supabase/AWS manages infrastructure-level key management (AWS KMS). This is standard cloud database practice, the same used by companies like Stripe and GitHub.' },
            ].map(item => (
              <li key={item.label} className="flex items-start gap-2">
                <span className="text-salve-lav font-semibold flex-shrink-0 min-w-[120px]">{item.label}</span>
                <span>{item.desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Do you support multi-factor authentication?">
          <p>Salve uses <strong className="text-salve-text">magic link / email OTP authentication</strong> — there are no passwords at all. Each sign-in requires access to your email account, which means your email's security (including any MFA you have on it) protects Salve access.</p>
          <p>Traditional TOTP-based MFA (like Google Authenticator) is not currently supported. This is a known tradeoff: magic link auth eliminates the largest single attack vector (reused/leaked passwords) at the cost of no traditional second factor.</p>
          <p>OTP codes are 8 digits, expire after 10 minutes, and cannot be reused. There is no password database in Salve to breach.</p>
        </Section>

        <Section title="How are passwords stored?">
          <p><strong className="text-salve-text">There are no passwords.</strong> Salve uses Supabase's magic link authentication exclusively. When you sign in, a one-time 8-digit code is emailed to you. It expires in 10 minutes and is single-use.</p>
          <p>This means there is no password hash table, no credential database, and no risk of a credential-stuffing attack against Salve. Even if the database were fully exposed, there are no passwords to extract.</p>
        </Section>

        <Section title="Where is this app hosted?">
          <ul className="list-none space-y-1.5">
            {[
              { label: 'App & API', desc: 'Vercel — a US-based platform used by millions of production apps (including Fortune 500 companies). All API keys live here as server-side environment variables.' },
              { label: 'Database', desc: 'Supabase on AWS us-east-1 (Virginia). Row Level Security is enforced at the PostgreSQL engine level — not just in application code.' },
              { label: 'No physical servers', desc: 'Salve has no self-hosted infrastructure. Both providers handle physical security, hardware maintenance, and infrastructure patching.' },
            ].map(item => (
              <li key={item.label} className="flex items-start gap-2">
                <span className="text-salve-lav font-semibold flex-shrink-0 min-w-[130px]">{item.label}</span>
                <span>{item.desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="How do you protect against SQL injection and XSS?">
          <p><strong className="text-salve-text">SQL injection:</strong> Salve never constructs raw SQL strings. All database access uses the Supabase client library, which uses parameterized queries internally. Additionally, Row Level Security means even a malformed query cannot return another user's records — the database enforces this at the engine level, independent of application code.</p>
          <p><strong className="text-salve-text">XSS (Cross-Site Scripting):</strong> React automatically escapes all output rendered in JSX — user-supplied text becomes inert text nodes, not executable HTML. Additionally, the Content-Security-Policy header is set to <code className="text-[11px] bg-salve-card2 px-1 rounded">script-src 'self'</code>, which blocks inline scripts and only allows code loaded from Salve's own origin. X-Frame-Options DENY prevents clickjacking. X-Content-Type-Options nosniff prevents MIME-type confusion attacks.</p>
          <p><strong className="text-salve-text">AI prompt injection:</strong> Health data sent to AI providers is sanitized before inclusion in prompts — angle brackets and curly braces are stripped, and field lengths are capped — to prevent injected content from hijacking AI responses.</p>
        </Section>

        <Section title="How is data backed up?">
          <p><strong className="text-salve-text">Infrastructure backups:</strong> Supabase performs automated daily database backups on all plans. Point-in-time recovery is available on paid Supabase plans. These backups are encrypted and managed by Supabase.</p>
          <p><strong className="text-salve-text">Your own backups:</strong> You can download a complete export of all your health data at any time from Settings → Data Management. You can optionally encrypt this with a passphrase. We strongly recommend keeping your own periodic backups — do not rely on infrastructure backups you can't directly access.</p>
          <p>The export format is open JSON that you can read in any text editor. Your data is never locked into a proprietary format.</p>
        </Section>

        <Section title="If a breach happens, what is the exact protocol?">
          <Callout color="amber">
            Salve is not covered by HIPAA's 60-day breach notification requirement. But here is the voluntary protocol that would be followed:
          </Callout>
          <ul className="list-none space-y-1.5 mt-2">
            {[
              'Immediately revoke any compromised API keys or tokens',
              'Assess the scope: which records, which users, what time window',
              'Notify affected users by email as soon as the scope is understood — targeting within 72 hours of discovery',
              'Post a public incident report describing what happened, what data was affected, and what was done',
              'Patch the vulnerability before bringing any affected system back online',
              'Contact: salveapp@proton.me is monitored for security reports',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-salve-amber mt-0.5 flex-shrink-0">◆</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">To report a security vulnerability: <a href="mailto:salveapp@proton.me" className="text-salve-lav hover:underline">salveapp@proton.me</a>. Please include as much detail as possible. We take reports seriously and will respond promptly.</p>
        </Section>

        <Section title="What happens if the project shuts down?">
          <p>This deserves a direct answer: if Salve were ever discontinued, the commitment is:</p>
          <ul className="list-none space-y-1.5 mt-1">
            {[
              'Advance notice via email and in-app banner — at minimum 30 days',
              'A final export window so you can download all your data',
              'All user data deleted from Supabase servers after the shutdown date',
              'Your data will not be sold, transferred, or used for any other purpose',
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-salve-sage mt-0.5 flex-shrink-0">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">This is exactly why the export feature exists and produces standard JSON. Your health history should never be held hostage by any app. Keep your own periodic backups.</p>
        </Section>
      </div>
    </Card>
  );
}

export default function Legal() {
  const [activeTab, setActiveTab] = useState('privacy');

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat transition-colors ${
              activeTab === t.key
                ? 'border-salve-lav bg-salve-lav/15 text-salve-lav'
                : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'privacy'  && <Privacy />}
      {activeTab === 'terms'    && <Terms />}
      {activeTab === 'hipaa'    && <HipaaNotice />}
      {activeTab === 'security' && <SecurityPage />}

      <p className="text-[11px] text-salve-textFaint text-center mt-4 mb-2 font-montserrat leading-relaxed">
        Questions or privacy requests?{' '}
        <a href="mailto:salveapp@proton.me" className="text-salve-lav no-underline hover:underline">salveapp@proton.me</a>
      </p>
    </div>
  );
}
