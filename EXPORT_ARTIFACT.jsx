/**
 * EXPORT ARTIFACT — Paste this into Claude as an artifact to export Amber's health data.
 *
 * Instructions for Amber:
 * 1. Open your existing health companion conversation in Claude
 * 2. Ask Claude to create a new artifact with this code
 * 3. The artifact will read your stored health data and show a summary
 * 4. Click "Copy to Clipboard" to copy the JSON
 * 5. Go to your new Salve app → Settings → Import Health Data
 * 6. Paste the JSON and click Import
 */

import { useState, useEffect } from 'react';

const SK = {
  core: 'hc:core',
  tracking: 'hc:tracking',
  settings: 'hc:settings',
};

async function loadKey(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}

export default function ExportData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [core, tracking, settings] = await Promise.all([
          loadKey(SK.core),
          loadKey(SK.tracking),
          loadKey(SK.settings),
        ]);

        setData({
          format: 'salve-v1',
          exportedAt: new Date().toISOString(),
          core: core || { meds: [], conditions: [], allergies: [], providers: [] },
          tracking: tracking || { vitals: [], appts: [], journal: [] },
          settings: settings || {},
        });
      } catch (e) {
        setError('Failed to read stored data: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = JSON.stringify(data, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  const C = {
    bg: '#FAF8F5', card: '#FFFFFF', border: '#EAE5DD',
    sage: '#A9C2A4', sageDark: '#5C8356', lav: '#C6B8D9', lavDark: '#9B87B5',
    text: '#4A4A4A', textMid: '#6B6B6B', textLight: '#9A9590',
  };

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: C.text }}>
        <p>Loading your health data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#D16B6B' }}>
        <p>{error}</p>
      </div>
    );
  }

  const counts = {
    meds: data.core.meds?.length || 0,
    conditions: data.core.conditions?.length || 0,
    allergies: data.core.allergies?.length || 0,
    providers: data.core.providers?.length || 0,
    vitals: data.tracking.vitals?.length || 0,
    appointments: data.tracking.appts?.length || 0,
    journal: data.tracking.journal?.length || 0,
  };

  const total = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div style={{ padding: 24, fontFamily: "'Montserrat', system-ui, sans-serif", color: C.text, maxWidth: 500 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ color: C.textLight, fontSize: 12, letterSpacing: 4, marginBottom: 8 }}>✶ · ✶</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: C.lavDark, margin: 0 }}>
          Export Health Data
        </h1>
        <p style={{ color: C.textMid, fontSize: 14, marginTop: 6 }}>
          {total} items found across your health records
        </p>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: C.text }}>Data Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['Medications', counts.meds],
            ['Conditions', counts.conditions],
            ['Allergies', counts.allergies],
            ['Providers', counts.providers],
            ['Vitals', counts.vitals],
            ['Appointments', counts.appointments],
            ['Journal Entries', counts.journal],
          ].map(([label, count]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span style={{ color: C.textMid }}>{label}</span>
              <span style={{ fontWeight: 500, color: count > 0 ? C.sageDark : C.textLight }}>{count}</span>
            </div>
          ))}
        </div>
        {data.settings?.name && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.textMid }}>
            Profile: <strong style={{ color: C.text }}>{data.settings.name}</strong>
            {data.settings.location ? ` · ${data.settings.location}` : ''}
          </div>
        )}
      </div>

      <button
        onClick={handleCopy}
        style={{
          width: '100%',
          padding: '14px 20px',
          borderRadius: 10,
          border: 'none',
          background: copied ? C.sage : C.lavDark,
          color: 'white',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {copied ? '✓ Copied to Clipboard!' : 'Copy to Clipboard'}
      </button>

      <p style={{ textAlign: 'center', fontSize: 12, color: C.textLight, marginTop: 16 }}>
        Paste this in your new Salve app → Settings → Import Health Data
      </p>
    </div>
  );
}
