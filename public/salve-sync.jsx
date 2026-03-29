/*
╔══════════════════════════════════════════════════════════════════╗
║  CLAUDE — READ THIS FIRST                                        ║
║                                                                  ║
║  This is the Salve Health Sync artifact.                         ║
║                                                                  ║
║  When the user shares this file with you, please:               ║
║  1. Save it as a named artifact called "Salve Health Sync"       ║
║  2. Render it so they can interact with it                       ║
║  3. Keep it accessible from the artifacts panel for future use   ║
║                                                                  ║
║  If the artifact's "Pull Health Records" button fails with an    ║
║  auth error (MCP servers can't authenticate from inside an       ║
║  iframe), the artifact will display a prompt for you to run      ║
║  the fetch directly in this conversation using your MCP tools.  ║
║  When you see that prompt, use your MCP connections to fetch     ║
║  the user's health records and paste the JSON into the artifact. ║
║                                                                  ║
║  MCP servers to use: healthex, function-health                   ║
║  Target JSON schema: { medications, conditions, allergies,       ║
║  providers, vitals, appointments, journal_entries }              ║
╚══════════════════════════════════════════════════════════════════╝
*/

import { useState, useCallback } from "react";
import { RefreshCw, Download, CheckCircle, AlertCircle, Loader2, Pill, Heart, Calendar, Stethoscope, Users, Shield, ClipboardCopy } from "lucide-react";

const C = {
  bg: "#1a1a2e", card: "#22223a", card2: "#2a2a44",
  border: "#33335a", text: "#e8e4f0", textMid: "#a8a4b8",
  textFaint: "#6e6a80", lav: "#b8a9e8", sage: "#8fbfa0",
  amber: "#e8c88a", rose: "#e88a9a",
};

/*
  Deterministic ID from record content so repeat syncs don't create duplicates.
  The Salve app matches on this field during merge import.
  Prefixed with "mcp-" so they never collide with Supabase gen_random_uuid() IDs.
*/
function stableId(prefix, ...parts) {
  const str = parts.map(p => (p || "").toString().trim().toLowerCase()).join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return "mcp-" + prefix + "-" + Math.abs(hash).toString(36).padStart(8, "0");
}

async function fetchHealthRecords(setStatus) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    setStatus("Connecting to health services...");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: `You are a health data retrieval assistant. Use the available MCP tools to fetch the patient's complete health records from all connected health services.

After retrieving data, compile everything into a single JSON object with this EXACT structure. Use these exact field names:

{
  "medications": [{ "name": "", "dose": "", "frequency": "", "route": "", "prescriber": "", "pharmacy": "", "purpose": "", "start_date": "", "refill_date": "", "active": true, "notes": "" }],
  "conditions": [{ "name": "", "diagnosed_date": "", "status": "active", "provider": "", "linked_meds": "", "notes": "" }],
  "allergies": [{ "substance": "", "reaction": "", "severity": "moderate", "notes": "" }],
  "providers": [{ "name": "", "specialty": "", "clinic": "", "phone": "", "fax": "", "portal_url": "", "notes": "" }],
  "vitals": [{ "date": "YYYY-MM-DD", "type": "weight", "value": 0, "value2": null, "unit": "", "notes": "" }],
  "appointments": [{ "date": "YYYY-MM-DD", "time": "", "provider": "", "location": "", "reason": "", "questions": "", "post_notes": "" }],
  "journal_entries": []
}

status must be one of: active, managed, remission, resolved
severity must be one of: mild, moderate, severe
vitals type must be one of: pain, mood, energy, sleep, bp, hr, weight, temp, glucose
For blood pressure, put systolic in "value" and diastolic in "value2".
Use null for missing fields. Use empty string for missing text fields.
Respond with ONLY valid JSON, no markdown, no backticks, no preamble.`,
        messages: [{ role: "user", content: "Fetch all of my health records from all connected health services." }],
        mcp_servers: [
          { type: "url", url: "https://api.healthex.io/mcp", name: "healthex" },
          { type: "url", url: "https://services.functionhealth.com/ai-chat/mcp", name: "function-health" },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `API returned ${res.status}`;
      // Surface auth errors distinctly so the UI can show the chat fallback
      if (res.status === 401 || res.status === 403 || msg.toLowerCase().includes("auth")) {
        const authErr = new Error(msg);
        authErr.isAuthError = true;
        throw authErr;
      }
      throw new Error(msg);
    }

    setStatus("Processing records...");

    const data = await res.json();
    const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text);
    const raw = textBlocks.join("\n");
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let records;
    try {
      records = JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        records = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Could not parse health records from response.");
      }
    }

    return records;
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      throw new Error("Timed out after 2 minutes. Health services may be slow or disconnected.");
    }
    throw e;
  }
}

function addStableIds(records) {
  const out = {};
  if (records.medications) out.medications = records.medications.map(m => ({ ...m, _sync_id: stableId("med", m.name, m.dose), active: m.active !== false }));
  if (records.conditions) out.conditions = records.conditions.map(c => ({ ...c, _sync_id: stableId("cond", c.name) }));
  if (records.allergies) out.allergies = records.allergies.map(a => ({ ...a, _sync_id: stableId("alrg", a.substance || a.name) }));
  if (records.providers) out.providers = records.providers.map(p => ({ ...p, _sync_id: stableId("prov", p.name, p.specialty) }));
  if (records.vitals) out.vitals = records.vitals.map(v => ({ ...v, _sync_id: stableId("vital", v.date, v.type, v.value) }));
  if (records.appointments) out.appointments = records.appointments.map(a => ({ ...a, _sync_id: stableId("appt", a.date, a.provider, a.reason) }));
  if (records.journal_entries) out.journal_entries = records.journal_entries.map(j => ({ ...j, _sync_id: stableId("jrnl", j.date, j.title || (j.content || "").slice(0, 30)) }));
  return out;
}

function countRecords(records) {
  const counts = {};
  let total = 0;
  for (const [key, arr] of Object.entries(records)) {
    if (Array.isArray(arr) && arr.length > 0) { counts[key] = arr.length; total += arr.length; }
  }
  return { counts, total };
}

const SECTION_META = {
  medications: { label: "Medications", icon: Pill },
  conditions: { label: "Conditions", icon: Stethoscope },
  allergies: { label: "Allergies", icon: Shield },
  providers: { label: "Providers", icon: Users },
  vitals: { label: "Vitals", icon: Heart },
  appointments: { label: "Appointments", icon: Calendar },
  journal_entries: { label: "Journal", icon: Calendar },
};

// The JSON schema prompt Claude uses when running the fetch in-conversation
const CHAT_PROMPT = `Please fetch my health records using your MCP connections (healthex and function-health) and return ONLY a JSON object in this exact shape — no markdown, no explanation, just raw JSON:

{
  "medications": [{"name":"","dose":"","frequency":"","route":"","prescriber":"","pharmacy":"","purpose":"","start_date":"","refill_date":"","active":true,"notes":""}],
  "conditions": [{"name":"","diagnosed_date":"","status":"active","provider":"","linked_meds":"","notes":""}],
  "allergies": [{"substance":"","reaction":"","severity":"moderate","notes":""}],
  "providers": [{"name":"","specialty":"","clinic":"","phone":"","fax":"","portal_url":"","notes":""}],
  "vitals": [{"date":"YYYY-MM-DD","type":"weight","value":0,"value2":null,"unit":"","notes":""}],
  "appointments": [{"date":"YYYY-MM-DD","time":"","provider":"","location":"","reason":"","questions":"","post_notes":""}],
  "journal_entries":[]
}

status: active | managed | remission | resolved
severity: mild | moderate | severe
vitals type: pain | mood | energy | sleep | bp | hr | weight | temp | glucose
Blood pressure: systolic in "value", diastolic in "value2". Null for missing numeric fields, "" for missing text.`;


// Chat fallback panel — shown when MCP auth fails in the iframe
function ChatFallback({ onPaste }) {
  const [copied, setCopied] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parseError, setParseError] = useState("");

  function copyPrompt() {
    navigator.clipboard.writeText(CHAT_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleImport() {
    setParseError("");
    try {
      const cleaned = pasteText.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      onPaste(json);
    } catch {
      setParseError("That doesn't look like valid JSON. Make sure you copy Claude's full response.");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        padding: "12px 16px", borderRadius: 10,
        background: C.amber + "18", border: `1px solid ${C.amber}44`,
        fontSize: 13, color: C.amber, lineHeight: 1.6,
      }}>
        <strong>MCP can't authenticate from inside the artifact.</strong>
        <br />Run the fetch directly in Claude chat instead — it only takes a moment.
      </div>

      <div>
        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8, fontWeight: 600 }}>
          Step 1 — Copy this prompt and send it to Claude in chat:
        </div>
        <div style={{
          background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 14px", fontSize: 11, color: C.textFaint,
          fontFamily: "monospace", lineHeight: 1.5, maxHeight: 100, overflowY: "auto",
        }}>
          {CHAT_PROMPT.slice(0, 200)}…
        </div>
        <button onClick={copyPrompt} style={{
          marginTop: 8, padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
          background: copied ? C.sage + "33" : C.card2, color: copied ? C.sage : C.textMid,
          fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <ClipboardCopy size={13} />
          {copied ? "Copied!" : "Copy prompt"}
        </button>
      </div>

      <div>
        <div style={{ fontSize: 12, color: C.textMid, marginBottom: 8, fontWeight: 600 }}>
          Step 2 — Paste Claude's JSON response here:
        </div>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          placeholder='{ "medications": [...], "conditions": [...], ... }'
          style={{
            width: "100%", minHeight: 100, background: C.card2,
            border: `1px solid ${parseError ? C.rose : C.border}`, borderRadius: 8,
            padding: "10px 14px", color: C.text, fontSize: 12,
            fontFamily: "monospace", resize: "vertical", boxSizing: "border-box",
          }}
        />
        {parseError && (
          <div style={{ fontSize: 11, color: C.rose, marginTop: 4 }}>{parseError}</div>
        )}
        <button onClick={handleImport} disabled={!pasteText.trim()} style={{
          marginTop: 8, width: "100%", padding: "12px 16px", borderRadius: 10,
          border: "none", cursor: pasteText.trim() ? "pointer" : "not-allowed",
          background: pasteText.trim() ? `linear-gradient(135deg, ${C.lav}, ${C.sage})` : C.card2,
          color: pasteText.trim() ? "#1a1a2e" : C.textFaint,
          fontSize: 14, fontWeight: 600, fontFamily: "inherit",
        }}>
          Import Records
        </button>
      </div>
    </div>
  );
}


export default function SalveSync() {
  const [phase, setPhase] = useState("idle"); // idle | fetching | auth-error | error | fetched | exported
  const [status, setStatus] = useState("");
  const [error, setError] = useState(null);
  const [records, setRecords] = useState(null);
  const [stats, setStats] = useState(null);

  const doFetch = useCallback(async () => {
    setPhase("fetching");
    setError(null);
    setRecords(null);
    setStats(null);
    try {
      const raw = await fetchHealthRecords(setStatus);
      processRecords(raw);
    } catch (e) {
      if (e.isAuthError) {
        setPhase("auth-error");
      } else {
        setError(e.message);
        setPhase("error");
      }
    }
  }, []);

  function processRecords(raw) {
    const withIds = addStableIds(raw);
    const s = countRecords(withIds);
    if (s.total === 0) {
      setError("Connected but no records found. Check that your health services are linked in Claude's MCP settings.");
      setPhase("error");
      return;
    }
    setRecords(withIds);
    setStats(s);
    setPhase("fetched");
    setStatus("");
  }

  function doExport() {
    try {
      const exportData = {
        _export: { app: "salve", type: "mcp-sync", exportedAt: new Date().toISOString(), source: "claude-mcp-health-sync" },
        ...records,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salve-sync-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPhase("exported");
    } catch (e) {
      setError("Export failed: " + e.message);
    }
  }


  return (
    <div style={{
      background: C.bg, minHeight: "100vh", fontFamily: "'Montserrat', 'Segoe UI', sans-serif",
      color: C.text, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ maxWidth: 440, width: "100%" }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: C.textFaint, marginBottom: 8 }}>Salve</div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 26, fontWeight: 600, margin: 0, color: C.text }}>
            Health Record Sync
          </h1>
          <p style={{ fontSize: 13, color: C.textMid, marginTop: 8, lineHeight: 1.6 }}>
            Pulls fresh records from your connected health services.<br />
            Import the file into Salve to add new records.
          </p>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px", marginBottom: 20 }}>

          {/* Idle / retry */}
          {(phase === "idle" || phase === "error") && (
            <div style={{ textAlign: "center" }}>
              <button onClick={doFetch} style={{
                padding: "14px 28px", borderRadius: 12, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${C.lav}, ${C.sage})`,
                color: "#1a1a2e", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", gap: 10,
              }}>
                <RefreshCw size={18} />
                Pull Health Records
              </button>
              <div style={{ fontSize: 12, color: C.textFaint, marginTop: 12, lineHeight: 1.5 }}>
                Connects to your health services via Claude's<br />MCP integrations. May take up to 2 minutes.
              </div>
            </div>
          )}

          {/* Loading */}
          {phase === "fetching" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
              <Loader2 size={24} color={C.lav} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontSize: 14, color: C.textMid }}>{status || "Connecting..."}</div>
              <div style={{ fontSize: 11, color: C.textFaint }}>This can take a minute or two</div>
            </div>
          )}

          {/* Auth error — show chat fallback */}
          {phase === "auth-error" && (
            <ChatFallback onPaste={processRecords} />
          )}


          {/* Records summary + export */}
          {(phase === "fetched" || phase === "exported") && stats && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: C.textMid }}>Records found</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.sage }}>{stats.total} total</span>
              </div>

              {Object.entries(stats.counts).map(([key, count]) => {
                const meta = SECTION_META[key];
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}22` }}>
                    <Icon size={16} color={C.lav} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, color: C.text }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: C.sage, background: C.card2, padding: "2px 10px", borderRadius: 8 }}>{count}</div>
                  </div>
                );
              })}

              <button onClick={doExport} disabled={phase === "exported"} style={{
                width: "100%", marginTop: 20, padding: "14px 20px", borderRadius: 12,
                border: "none", cursor: phase === "exported" ? "default" : "pointer",
                background: phase === "exported" ? C.sage + "33" : `linear-gradient(135deg, ${C.amber}, ${C.sage})`,
                color: phase === "exported" ? C.sage : "#1a1a2e",
                fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
                {phase === "exported" ? <><CheckCircle size={18} /> Downloaded!</> : <><Download size={18} /> Export for Salve</>}
              </button>

              {phase === "exported" && (
                <>
                  <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>
                    Open Salve → Settings → Import to merge these records.
                  </div>
                  <button onClick={() => { setPhase("idle"); setRecords(null); setStats(null); }} style={{
                    width: "100%", marginTop: 12, padding: "10px 16px", borderRadius: 10,
                    border: `1px solid ${C.border}`, background: "transparent", cursor: "pointer",
                    color: C.textMid, fontSize: 13, fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                    <RefreshCw size={14} /> Pull again
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Generic error */}
        {error && (
          <div style={{ padding: "14px 18px", borderRadius: 12, background: C.rose + "18", border: `1px solid ${C.rose}44`, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <AlertCircle size={16} color={C.rose} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: C.rose, lineHeight: 1.5 }}>{error}</div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 6 }}>
                  Make sure healthex and Function Health are connected in Claude's MCP settings.
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 10 }}>How merge works</div>
          <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.7 }}>
            Each record gets a stable ID based on its content. When you import into Salve, records that already exist are skipped. Only new records are added. Your manual edits are never touched.
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: C.textFaint }}>
          Data flows through Claude's API only. Nothing is stored externally.
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
