import { useState } from 'react';
import Card from '../ui/Card';

const TABS = [
  { key: 'privacy', label: 'Privacy' },
  { key: 'terms', label: 'Terms' },
  { key: 'hipaa', label: 'HIPAA Notice' },
];

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="font-playfair text-[15px] font-semibold text-salve-lav m-0 mb-2">{title}</h3>
      <div className="text-[12.5px] text-salve-textMid leading-relaxed space-y-2 font-montserrat">{children}</div>
    </div>
  );
}

function Privacy() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-4">Privacy Policy</h2>
      <p className="text-[13px] text-salve-textFaint mb-4">Last updated: April 2026</p>

      <Section title="What We Collect">
        <p>Salve stores the health information you enter: medications, conditions, vitals, appointments, lab results, journal entries, and related records. We also store your email address for authentication.</p>
        <p>We do not collect analytics, tracking data, or device identifiers beyond what is necessary for authentication.</p>
      </Section>

      <Section title="How Data Is Stored">
        <p>Your data is stored in a Supabase PostgreSQL database with Row Level Security, meaning only your authenticated account can access your records. Data cached on your device is encrypted with AES-GCM using a key derived from your session token.</p>
      </Section>

      <Section title="AI Features">
        <p>When you use AI-powered features (Sage chat, health insights, news), your health profile is sent to Google's Gemini API (free tier) or Anthropic's Claude API (premium tier) for processing. This requires your explicit consent, which you can grant or revoke at any time in Settings.</p>
        <p>Each provider processes data according to their own usage policy. Salve does not store AI conversation data on third-party servers beyond what the provider retains per their policy.</p>
      </Section>

      <Section title="Data Sharing">
        <p>We do not sell, rent, or share your personal health data with third parties for marketing or advertising purposes. Data is only transmitted to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Supabase (database hosting)</li>
          <li>Vercel (application hosting + serverless API proxies)</li>
          <li>Google Gemini and/or Anthropic Claude (AI features, only with your consent)</li>
          <li>Government medical APIs (RxNorm, OpenFDA, NPPES) for drug and provider lookups (no personal data sent)</li>
          <li>Oura API (only if you connect a Ring, OAuth2, tokens stored encrypted locally)</li>
        </ul>
      </Section>

      <Section title="Your Rights (GDPR / CCPA)">
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access</strong>, view all your data at any time within the app</li>
          <li><strong>Portability</strong>, export all data as a JSON backup (optionally encrypted) from Settings</li>
          <li><strong>Rectification</strong>, edit or correct any record in the app</li>
          <li><strong>Erasure</strong>, erase all data OR permanently delete your entire account (including your authentication record) from Settings. Deletion cascades across every table and cannot be reversed.</li>
          <li><strong>Withdraw AI consent</strong>, revoke AI data-sharing consent at any time in Settings</li>
        </ul>
      </Section>

      <Section title="Age Requirement">
        <p>Salve is intended for users 13 years of age or older. If you are under 13, do not create an account. Users between 13 and 18 should have parent or guardian involvement. We do not knowingly collect data from children under 13.</p>
      </Section>
    </Card>
  );
}

function Terms() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-4">Terms of Service</h2>
      <p className="text-[13px] text-salve-textFaint mb-4">Last updated: April 2026</p>

      <Section title="Not Medical Advice">
        <p>Salve is a personal health organization tool. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult qualified healthcare providers for medical decisions. AI-generated insights are informational only.</p>
      </Section>

      <Section title="Your Responsibilities">
        <p>You are responsible for the accuracy of the health information you enter. Salve does not verify the correctness of medications, dosages, conditions, or other health data you provide.</p>
        <p>You agree not to use Salve for emergency medical situations. If you are experiencing a medical emergency, call your local emergency number.</p>
      </Section>

      <Section title="Account and Access">
        <p>You must provide a valid email address to create an account. Accounts may be suspended or terminated for abuse, including but not limited to: automated access, attempts to access other users' data, or use that degrades service for others.</p>
      </Section>

      <Section title="Service Availability">
        <p>Salve is provided "as is" without warranty of any kind. We do not guarantee uninterrupted availability, data accuracy, or fitness for any particular purpose. The service may be modified, suspended, or discontinued at any time.</p>
      </Section>

      <Section title="Limitation of Liability">
        <p>To the maximum extent permitted by law, Salve and its creators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service, including but not limited to health decisions made based on information displayed in the app.</p>
      </Section>
    </Card>
  );
}

function HipaaNotice() {
  return (
    <Card>
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0 mb-4">HIPAA Notice</h2>
      <p className="text-[13px] text-salve-textFaint mb-4">Last updated: April 2026</p>

      <Section title="Salve Is Not a Covered Entity">
        <p>Salve is a personal health management tool for individual consumers. It is not a healthcare provider, health plan, or healthcare clearinghouse. As such, Salve is <strong className="text-salve-amber">not a HIPAA-covered entity</strong> and is not subject to HIPAA regulations.</p>
        <p>This is standard for consumer health apps where you voluntarily enter and manage your own health information.</p>
      </Section>

      <Section title="How We Protect Your Data">
        <p>While HIPAA does not apply, we take data protection seriously:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>All database access is scoped to your authenticated account via Row Level Security</li>
          <li>On-device cached data is AES-GCM encrypted</li>
          <li>API communication is encrypted in transit via HTTPS</li>
          <li>Server-side API keys are never exposed to the client</li>
          <li>Encrypted backup exports are available with user-chosen passphrases</li>
        </ul>
      </Section>

      <Section title="What This Means for You">
        <p>Because Salve is not HIPAA-covered, there are limitations you should understand:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your data does not have the legal protections that apply to records held by your doctor or insurance company</li>
          <li>Breaches of Salve data would not trigger HIPAA breach notification requirements</li>
          <li>You should not rely on Salve as your sole record of medical information</li>
        </ul>
        <p>We recommend keeping copies of important medical records with your healthcare providers and using Salve's export feature for personal backups.</p>
      </Section>
    </Card>
  );
}

export default function Legal() {
  const [activeTab, setActiveTab] = useState('privacy');

  return (
    <div>
      {/* Tab pills */}
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

      <div className="md:max-w-3xl md:mx-auto">
      {activeTab === 'privacy' && <Privacy />}
      {activeTab === 'terms' && <Terms />}
      {activeTab === 'hipaa' && <HipaaNotice />}
      </div>

      <p className="text-[13px] text-salve-textFaint text-center mt-4 mb-2 italic">
        Questions, privacy requests, or bug reports?
        <br />
        Email <a href="mailto:salveapp@proton.me" className="text-salve-lav no-underline hover:underline">salveapp@proton.me</a>
      </p>
    </div>
  );
}
