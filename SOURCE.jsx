import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Pill, Heart, Calendar, Stethoscope, BookOpen, AlertTriangle, Settings as SettingsIcon, ChevronLeft, Trash2, Edit, Shield, Clock, User, Phone, FileText, Activity, X, Check, Info, AlertCircle, Zap, Droplets, Thermometer, Brain, Moon, Sparkles, Home, Search, Send, Wand2, Globe, MessageCircle, RefreshCw, Loader2, Compass } from "lucide-react";

/* ═══════════════════════════════════════════
   GLOBAL STYLES (injected once)
═══════════════════════════════════════════ */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600&display=swap');
  @keyframes hc-spin { to { transform: rotate(360deg) } }
`;
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const s = document.createElement("style");
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════
   STORAGE — batched into fewer keys
═══════════════════════════════════════════ */
const SK = {
  core: "hc:core",       // meds, conditions, allergies, providers
  tracking: "hc:tracking", // vitals, appts, journal
  settings: "hc:settings",
  lastRefresh: "hc:lastRefresh",
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function load(k) {
  try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function save(k, v) {
  try { await window.storage.set(k, JSON.stringify(v)); }
  catch (e) { console.error("Save:", e); }
}

/* ═══════════════════════════════════════════
   INTERACTION DATABASE
═══════════════════════════════════════════ */
const INTERACTIONS = [
  { a:["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta","fluvoxamine","luvox"], b:["tramadol","ultram","sumatriptan","imitrex","rizatriptan","maxalt","linezolid","zyvox","methylene blue","dextromethorphan","st john's wort"], severity:"danger", msg:"Serotonin syndrome risk — can be life-threatening" },
  { a:["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta"], b:["sertraline","zoloft","fluoxetine","prozac","citalopram","celexa","escitalopram","lexapro","paroxetine","paxil","venlafaxine","effexor","duloxetine","cymbalta"], severity:"danger", msg:"Duplicate SSRI/SNRI — serotonin syndrome risk", dupCheck:true },
  { a:["warfarin","coumadin","eliquis","apixaban","xarelto","rivaroxaban"], b:["aspirin","ibuprofen","advil","motrin","naproxen","aleve","meloxicam","mobic","diclofenac","celecoxib","celebrex"], severity:"danger", msg:"Major bleeding risk — anticoagulant + NSAID" },
  { a:["methotrexate","azathioprine","imuran","mycophenolate","cellcept","cyclosporine","tacrolimus"], b:["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","celecoxib"], severity:"danger", msg:"Kidney toxicity risk — immunosuppressant + NSAID" },
  { a:["methotrexate"], b:["trimethoprim","bactrim","sulfamethoxazole"], severity:"danger", msg:"Methotrexate toxicity — potentially fatal interaction" },
  { a:["prednisone","prednisolone","methylprednisolone","dexamethasone","hydrocortisone"], b:["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","aspirin"], severity:"caution", msg:"Increased GI bleeding risk — corticosteroid + NSAID" },
  { a:["prednisone","prednisolone","methylprednisolone","dexamethasone"], b:["metformin","glipizide","glyburide","insulin"], severity:"caution", msg:"Steroids raise blood sugar — may need diabetes med adjustment" },
  { a:["gabapentin","neurontin","pregabalin","lyrica"], b:["oxycodone","hydrocodone","morphine","fentanyl","tramadol","codeine"], severity:"caution", msg:"Increased sedation and respiratory depression risk" },
  { a:["benzodiazepine","alprazolam","xanax","lorazepam","ativan","clonazepam","klonopin","diazepam","valium"], b:["oxycodone","hydrocodone","morphine","fentanyl","tramadol","codeine","gabapentin","pregabalin"], severity:"danger", msg:"Severe respiratory depression risk — benzo + opioid/gabapentinoid" },
  { a:["lithium"], b:["ibuprofen","advil","motrin","naproxen","aleve","meloxicam","diclofenac","lisinopril","losartan","hydrochlorothiazide"], severity:"danger", msg:"Can increase lithium to toxic levels" },
  { a:["methotrexate","azathioprine","imuran","mycophenolate","cellcept","adalimumab","humira","etanercept","enbrel","infliximab","remicade","rituximab","tofacitinib","baricitinib"], b:["adalimumab","humira","etanercept","enbrel","infliximab","remicade","rituximab","tofacitinib","baricitinib"], severity:"caution", msg:"Compounded immunosuppression — increased infection risk" },
  { a:["fluoxetine","prozac","paroxetine","paxil","bupropion","wellbutrin"], b:["tamoxifen"], severity:"caution", msg:"May reduce tamoxifen effectiveness" },
  { a:["ssri","snri","sertraline","fluoxetine","paroxetine","citalopram","escitalopram","venlafaxine","duloxetine"], b:["aspirin","ibuprofen","naproxen","warfarin"], severity:"info", msg:"SSRIs/SNRIs may increase bleeding tendency with these meds" },
  { a:["levothyroxine","synthroid"], b:["calcium","iron","antacid","omeprazole","prilosec","pantoprazole","protonix","sucralfate"], severity:"info", msg:"These can reduce thyroid med absorption — take 4hrs apart" },
  { a:["hydroxychloroquine","plaquenil"], b:["metformin"], severity:"info", msg:"Plaquenil may increase metformin effects — monitor blood sugar" },
];

function checkInteractions(meds) {
  const warnings = [];
  const names = meds.filter(m => m.active !== false).map(m => m.name.toLowerCase().trim());
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      for (const rule of INTERACTIONS) {
        if (rule.dupCheck && names[i] === names[j]) continue;
        const aI = rule.a.some(x => names[i].includes(x));
        const aJ = rule.a.some(x => names[j].includes(x));
        const bI = rule.b.some(x => names[i].includes(x));
        const bJ = rule.b.some(x => names[j].includes(x));
        if ((aI && bJ) || (aJ && bI)) {
          const key = [names[i], names[j]].sort().join("+") + rule.msg;
          if (!warnings.find(w => w.key === key)) {
            warnings.push({ key, medA: meds[i].name, medB: meds[j].name, severity: rule.severity, msg: rule.msg });
          }
        }
      }
    }
  }
  return warnings.sort((a, b) => ({ danger: 0, caution: 1, info: 2 }[a.severity] - { danger: 0, caution: 1, info: 2 }[b.severity]));
}

/* ═══════════════════════════════════════════
   DATE HELPERS
═══════════════════════════════════════════ */
function fmtDate(d) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function daysUntil(d) {
  const diff = Math.ceil((new Date(d) - new Date(new Date().toDateString())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return Math.abs(diff) + "d ago";
  return "In " + diff + "d";
}

/* ═══════════════════════════════════════════
   AI LAYER
═══════════════════════════════════════════ */
const VT = [
  {id:"pain",label:"Pain",unit:"/10"},{id:"mood",label:"Mood",unit:"/10"},{id:"energy",label:"Energy",unit:"/10"},
  {id:"sleep",label:"Sleep",unit:"hrs"},{id:"bp",label:"Blood Pressure",unit:"mmHg"},{id:"hr",label:"Heart Rate",unit:"bpm"},
  {id:"weight",label:"Weight",unit:"lbs"},{id:"temp",label:"Temperature",unit:"\u00B0F"},{id:"glucose",label:"Blood Sugar",unit:"mg/dL"},
];

function buildProfile(data) {
  const s = data.settings;
  let p = "";
  if (s.name) p += "Patient name: " + s.name + "\n";
  if (s.location) p += "Location: " + s.location + "\n";
  p += "\n— ACTIVE MEDICATIONS —\n";
  data.meds.filter(m => m.active !== false).forEach(m => {
    p += "- " + m.name + (m.dose ? " " + m.dose : "") + (m.frequency ? ", " + m.frequency : "") + (m.route ? " (" + m.route + ")" : "") + (m.purpose ? " — for: " + m.purpose : "") + (m.prescriber ? " [prescribed by " + m.prescriber + "]" : "") + "\n";
  });
  const disc = data.meds.filter(m => m.active === false);
  if (disc.length) { p += "\n— DISCONTINUED MEDICATIONS —\n"; disc.forEach(m => { p += "- " + m.name + (m.dose ? " " + m.dose : "") + (m.notes ? " — " + m.notes : "") + "\n"; }); }
  p += "\n— CONDITIONS & DIAGNOSES —\n";
  data.conditions.forEach(c => { p += "- " + c.name + " (status: " + c.status + ")" + (c.dateDiagnosed ? ", diagnosed " + c.dateDiagnosed : "") + (c.provider ? ", treated by " + c.provider : "") + (c.linkedMeds ? ", meds: " + c.linkedMeds : "") + (c.notes ? " — " + c.notes : "") + "\n"; });
  if (data.allergies.length) { p += "\n— ALLERGIES —\n"; data.allergies.forEach(a => { p += "- " + a.substance + " (" + a.severity + ")" + (a.reaction ? " — reaction: " + a.reaction : "") + "\n"; }); }
  if (data.vitals.length) {
    p += "\n— RECENT VITALS (last 10) —\n";
    data.vitals.slice(-10).forEach(v => { const t = VT.find(x => x.id === v.type); p += "- " + (t ? t.label : v.type) + ": " + (v.type === "bp" ? v.value + "/" + v.value2 : v.value) + (t ? " " + t.unit : "") + " on " + v.date + (v.notes ? " — " + v.notes : "") + "\n"; });
  }
  if (data.journal.length) {
    p += "\n— RECENT JOURNAL ENTRIES (last 5) —\n";
    data.journal.slice(0, 5).forEach(e => { p += "- " + e.date + (e.mood ? " [mood: " + e.mood + "]" : "") + (e.severity ? " [severity: " + e.severity + "/10]" : "") + ": " + (e.content || e.title || "") + (e.tags ? " (tags: " + e.tags + ")" : "") + "\n"; });
  }
  if (s.insurancePlan) p += "\n— INSURANCE —\nPlan: " + s.insurancePlan + (s.insuranceId ? ", ID: " + s.insuranceId : "") + "\n";
  if (s.healthBackground) p += "\n— ADDITIONAL HEALTH BACKGROUND —\n" + s.healthBackground + "\n";
  return p;
}

async function askClaude(systemPrompt, userMsg, useWebSearch = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const body = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    };
    if (useWebSearch) { body.tools = [{ type: "web_search_20250305", name: "web_search" }]; }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.content) {
      return d.content.filter(b => b.type === "text").map(b => b.text).join("\n\n");
    }
    throw new Error(d.error?.message || "API call failed");
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out. Try again.");
    throw e;
  } finally { clearTimeout(timeout); }
}

/* ═══════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════ */
const C = {
  bg: "#FAF8F5", card: "#FFFFFF", cardHover: "#F7F4F0",
  border: "#EAE5DD", borderLight: "#F0EBE3",
  sage: "#A9C2A4", sageDark: "#7DA377", sageDeep: "#5C8356",
  sageLight: "#E8F0E6", sagePale: "#F2F7F1",
  lav: "#C6B8D9", lavDark: "#9B87B5", lavLight: "#EDE7F4", lavPale: "#F5F1FA",
  text: "#4A4A4A", textMid: "#6B6B6B", textLight: "#9A9590", textFaint: "#B8B0A8",
  danger: "#D16B6B", dangerBg: "#FDF0F0",
  caution: "#D4A843", cautionBg: "#FDF6E8",
  infoBg: "#E8F0E6", white: "#FFFFFF",
};
const shadow = "0 1px 8px rgba(0,0,0,0.04), 0 0 1px rgba(0,0,0,0.06)";

/* ═══════════════════════════════════════════
   DECORATIVE MOTIFS
═══════════════════════════════════════════ */
const Motif = ({ type = "star", size = 14, color = C.lav, style = {} }) => {
  const m = { star: "\u2726", sparkle: "\u2727", moon: "\u263D", leaf: "\uD83C\uDF3F", dot: "\u00B7" };
  return <span style={{ fontSize: size, color, opacity: 0.7, userSelect: "none", ...style }}>{m[type]}</span>;
};

const Divider = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "22px 0 18px", color: C.textFaint }}>
    <Motif type="sparkle" size={10} color={C.textFaint} />
    <div style={{ height: 1, width: 40, background: C.borderLight }} />
    <Motif type="moon" size={12} color={C.lav} />
    <div style={{ height: 1, width: 40, background: C.borderLight }} />
    <Motif type="sparkle" size={10} color={C.textFaint} />
  </div>
);

/* ═══════════════════════════════════════════
   TABS & NAV
═══════════════════════════════════════════ */
const TABS = [
  { id: "dash", label: "Home", icon: Home },
  { id: "meds", label: "Meds", icon: Pill },
  { id: "vitals", label: "Vitals", icon: Heart },
  { id: "appts", label: "Visits", icon: Calendar },
  { id: "ai", label: "Insight", icon: Sparkles },
  { id: "conditions", label: "Conditions", icon: Stethoscope },
  { id: "providers", label: "Providers", icon: User },
  { id: "allergies", label: "Allergies", icon: Shield },
  { id: "journal", label: "Journal", icon: BookOpen },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const NAV_IDS = ["dash","meds","vitals","ai","journal","settings"];
const DEFAULT_SETTINGS = { name: "", location: "", aiMode: "onDemand", pharmacy: "", insurancePlan: "", insuranceId: "", insuranceGroup: "", insurancePhone: "", healthBackground: "" };

/* ═══════════════════════════════════════════
   CONFIRM DELETE HOOK
═══════════════════════════════════════════ */
function useConfirmDelete() {
  const [pending, setPending] = useState(null);
  const ask = (id, label) => setPending({ id, label });
  const cancel = () => setPending(null);
  const confirm = (onDelete) => { if (pending) { onDelete(pending.id); setPending(null); } };
  return { pending, ask, cancel, confirm };
}

const ConfirmBar = ({ pending, onConfirm, onCancel }) => {
  if (!pending) return null;
  return (
    <div style={{ background: C.dangerBg, border: "1px solid #E8BFBF", borderRadius: 12, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 13, color: C.danger, flex: 1 }}>Delete {pending.label || "this item"}?</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onConfirm} style={{ background: C.danger, color: C.white, border: "none", borderRadius: 50, padding: "5px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Montserrat'" }}>Delete</button>
        <button onClick={onCancel} style={{ background: "transparent", color: C.textMid, border: "1px solid " + C.border, borderRadius: 50, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontFamily: "'Montserrat'" }}>Cancel</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════
   MAIN APP
═══════════════════════════════════════════ */
export default function HealthCompanion() {
  injectCSS();

  const [tab, setTab] = useState("dash");
  const [data, setData] = useState({ meds:[], vitals:[], appts:[], conditions:[], providers:[], allergies:[], journal:[], settings: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [refreshResult, setRefreshResult] = useState(null);

  // Load from batched storage
  useEffect(() => {
    (async () => {
      const [core, tracking, settings, lr] = await Promise.all([
        load(SK.core), load(SK.tracking), load(SK.settings), load(SK.lastRefresh)
      ]);
      const d = {
        meds: core?.meds || [],
        conditions: core?.conditions || [],
        providers: core?.providers || [],
        allergies: core?.allergies || [],
        vitals: tracking?.vitals || [],
        appts: tracking?.appts || [],
        journal: tracking?.journal || [],
        settings: settings || DEFAULT_SETTINGS,
      };
      setData(d);
      setLastRefresh(lr || null);
      setLoading(false);
    })();
  }, []);

  // Save helpers — batch writes
  const saveCore = useCallback((next) => {
    save(SK.core, { meds: next.meds, conditions: next.conditions, providers: next.providers, allergies: next.allergies });
  }, []);
  const saveTracking = useCallback((next) => {
    save(SK.tracking, { vitals: next.vitals, appts: next.appts, journal: next.journal });
  }, []);

  const update = useCallback((key, val) => {
    setData(prev => {
      const next = { ...prev, [key]: val };
      if (["meds","conditions","providers","allergies"].includes(key)) saveCore(next);
      else if (["vitals","appts","journal"].includes(key)) saveTracking(next);
      else if (key === "settings") save(SK.settings, val);
      return next;
    });
  }, [saveCore, saveTracking]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    setRefreshResult(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: "You are a health data retrieval assistant. Use the available MCP tools to fetch the patient's complete health records. After retrieving data, compile everything into a single JSON object. Respond with ONLY valid JSON, no markdown, no backticks, no preamble. The JSON must have this exact structure:\n{\n  \"medications\": [{\"name\": \"\", \"dose\": \"\", \"frequency\": \"\", \"prescriber\": \"\", \"active\": true, \"purpose\": \"\"}],\n  \"conditions\": [{\"name\": \"\", \"status\": \"active|managed|remission|resolved\", \"dateDiagnosed\": \"\", \"provider\": \"\"}],\n  \"allergies\": [{\"substance\": \"\", \"reaction\": \"\", \"severity\": \"mild|moderate|severe\"}],\n  \"vitals\": [{\"type\": \"bp|hr|weight|temp|glucose\", \"value\": \"\", \"value2\": \"\", \"date\": \"\", \"notes\": \"\"}],\n  \"visits\": [{\"date\": \"\", \"provider\": \"\", \"reason\": \"\", \"postNotes\": \"\"}]\n}\nFill in whatever data is available. Use empty arrays for categories with no data.",
          messages: [{ role: "user", content: "Please fetch all of my health records from connected health services. Get my medications, conditions/diagnoses, allergies, recent vitals/labs, and recent visit history. Return everything as the structured JSON." }],
          // MCP servers — these must be connected on the user's Claude account
          // If they fail, the error handler below will show a helpful message
          mcp_servers: [
            { type: "url", url: "https://api.healthex.io/mcp", name: "healthex" },
            { type: "url", url: "https://services.functionhealth.com/ai-chat/mcp", name: "function-health" }
          ]
        }),
      });
      clearTimeout(timeout);
      const d = await res.json();
      if (!d.content) throw new Error(d.error?.message || "API call failed — check MCP connections in Settings");

      const textBlocks = d.content.filter(b => b.type === "text").map(b => b.text);
      const toolResults = d.content.filter(b => b.type === "mcp_tool_result").map(b => {
        try { return b.content?.[0]?.text || ""; } catch { return ""; }
      });
      const allText = [...textBlocks, ...toolResults].join("\n");
      const jsonMatch = allText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse health records from response. Your MCP health services may not be connected yet.");

      const records = JSON.parse(jsonMatch[0].replace(/```json|```/g, "").trim());
      let counts = { meds: 0, conditions: 0, allergies: 0, vitals: 0, visits: 0 };

      setData(prev => {
        const next = { ...prev };
        if (records.medications?.length) {
          counts.meds = records.medications.length;
          next.meds = mergeRecords(prev.meds, records.medications.map(m => ({
            name: m.name || "", dose: m.dose || "", frequency: m.frequency || "",
            prescriber: m.prescriber || "", active: m.active !== false,
            purpose: m.purpose || "", route: "Oral", pharmacy: "", startDate: "",
            refillDate: "", notes: ""
          })), "name");
        }
        if (records.conditions?.length) {
          counts.conditions = records.conditions.length;
          next.conditions = mergeRecords(prev.conditions, records.conditions.map(c => ({
            name: c.name || "", status: c.status || "active",
            dateDiagnosed: c.dateDiagnosed || "", provider: c.provider || "",
            linkedMeds: "", notes: ""
          })), "name");
        }
        if (records.allergies?.length) {
          counts.allergies = records.allergies.length;
          next.allergies = mergeRecords(prev.allergies, records.allergies.map(a => ({
            substance: a.substance || "", reaction: a.reaction || "",
            severity: a.severity || "moderate", notes: ""
          })), "substance");
        }
        if (records.vitals?.length) {
          counts.vitals = records.vitals.length;
          const newVitals = records.vitals.map(v => ({
            id: uid(), type: v.type || "hr", value: String(v.value || ""),
            value2: String(v.value2 || ""), date: v.date || new Date().toISOString().slice(0,10),
            notes: v.notes || "", _source: "mcp"
          }));
          const existingKeys = new Set(prev.vitals.map(v => v.type + "|" + v.date));
          const unique = newVitals.filter(v => !existingKeys.has(v.type + "|" + v.date));
          next.vitals = [...prev.vitals, ...unique].sort((a,b) => new Date(a.date) - new Date(b.date));
        }
        if (records.visits?.length) {
          counts.visits = records.visits.length;
          next.appts = mergeRecords(prev.appts, records.visits.map(v => ({
            date: v.date || "", time: "", provider: v.provider || "",
            location: "", reason: v.reason || "", questions: "",
            postNotes: v.postNotes || ""
          })), "date");
        }
        saveCore(next);
        saveTracking(next);
        return next;
      });

      const ts = new Date().toISOString();
      setLastRefresh(ts);
      save(SK.lastRefresh, ts);
      const total = counts.meds + counts.conditions + counts.allergies + counts.vitals + counts.visits;
      setRefreshResult(total > 0
        ? "Imported " + total + " records (" + [counts.meds && counts.meds + " meds", counts.conditions && counts.conditions + " conditions", counts.allergies && counts.allergies + " allergies", counts.vitals && counts.vitals + " vitals", counts.visits && counts.visits + " visits"].filter(Boolean).join(", ") + ")"
        : "Connected successfully but no records found."
      );
      setTimeout(() => setRefreshResult(null), 8000);
    } catch (e) {
      if (e.name === "AbortError") {
        setRefreshError("Timed out after 2 minutes. Your health services may be slow or disconnected.");
      } else {
        setRefreshError(e.message || "Failed to fetch records.");
      }
    }
    setRefreshing(false);
  }, [saveCore, saveTracking]);

  const interactions = useMemo(() => checkInteractions(data.meds), [data.meds]);
  const navTo = (t, sv) => { setTab(t); setSubView(sv || null); };
  const name = data.settings.name || "there";

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ fontSize: 36, color: C.lav }}>{"\u263D"}</div>
      <div style={{ fontSize: 14, color: C.textMid, fontStyle: "italic", letterSpacing: 0.5 }}>Gathering your remedies...</div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Montserrat', 'Lato', sans-serif", color: C.text, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>

      {/* HEADER */}
      <div style={{ padding: "28px 24px 20px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 8, right: 20, opacity: 0.1, fontSize: 72, color: C.sage, userSelect: "none", pointerEvents: "none" }}>{"\u2615"}</div>
        <div style={{ position: "absolute", top: 48, right: 56, opacity: 0.07, fontSize: 18, color: C.lav, userSelect: "none", pointerEvents: "none" }}>{"\u2726"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tab !== "dash" && (
            <button onClick={() => { setTab("dash"); setSubView(null); }} style={{ background: "none", border: "none", color: C.textMid, cursor: "pointer", padding: 4, display: "flex" }}>
              <ChevronLeft size={20} />
            </button>
          )}
          <div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: tab === "dash" ? 24 : 20, fontWeight: 600, margin: 0, color: C.text }}>
              {tab === "dash" ? <>Hello, {name} <Motif type="sparkle" size={16} color={C.sage} style={{ marginLeft: 4 }} /></> : TABS.find(t => t.id === tab)?.label}
            </h1>
            {tab === "dash" && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textLight, fontWeight: 300, fontStyle: "italic" }}>Your health, your story, your power.</p>}
          </div>
        </div>
      </div>

      {/* DANGER BANNER */}
      {interactions.filter(w => w.severity === "danger").length > 0 && tab === "dash" && (
        <div onClick={() => navTo("meds")} style={{ margin: "0 16px 8px", background: C.dangerBg, border: "1px solid #E8BFBF", borderRadius: 14, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <AlertTriangle size={16} style={{ color: C.danger, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.danger, fontWeight: 500 }}>{interactions.filter(w => w.severity === "danger").length} critical interaction{interactions.filter(w => w.severity === "danger").length > 1 ? "s" : ""} found</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.danger, opacity: 0.6 }}>Review {"\u2192"}</span>
        </div>
      )}

      {/* CONTENT */}
      <div style={{ padding: "0 16px 16px" }}>
        {tab === "dash" && <Dashboard data={data} interactions={interactions} navTo={navTo} doRefresh={doRefresh} refreshing={refreshing} refreshError={refreshError} refreshResult={refreshResult} lastRefresh={lastRefresh} />}
        {tab === "meds" && <MedsView data={data} update={update} interactions={interactions} subView={subView} setSubView={setSubView} />}
        {tab === "vitals" && <VitalsView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "appts" && <ApptsView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "ai" && <AIPanel data={data} />}
        {tab === "conditions" && <CondsView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "providers" && <ProvsView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "allergies" && <AllergyView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "journal" && <JournalView data={data} update={update} subView={subView} setSubView={setSubView} />}
        {tab === "settings" && <SettingsView data={data} update={update} />}
      </div>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.white, borderTop: "1px solid " + C.borderLight, display: "flex", justifyContent: "space-around", padding: "8px 0 12px", zIndex: 50 }}>
        {TABS.filter(t => NAV_IDS.includes(t.id)).map(t => {
          const Ic = t.icon; const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => navTo(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 10px", color: on ? C.sageDeep : C.textFaint, transition: "color .2s" }}>
              <Ic size={20} strokeWidth={on ? 2 : 1.4} />
              <span style={{ fontSize: 10, fontWeight: on ? 600 : 400, letterSpacing: 0.2 }}>{t.label}</span>
              {on && <div style={{ width: 4, height: 4, borderRadius: 4, background: C.sage, marginTop: -1 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════ */
const Card = ({ children, style, onClick }) => (
  <div onClick={onClick} style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: 18, marginBottom: 10, cursor: onClick ? "pointer" : "default", boxShadow: shadow, transition: "box-shadow .25s", ...style }}>{children}</div>
);

const Badge = ({ label, color = C.sageDark, bg = C.sageLight }) => (
  <span style={{ background: bg, color, fontSize: 11, fontWeight: 600, padding: "3px 12px", borderRadius: 50, display: "inline-block", letterSpacing: 0.2 }}>{label}</span>
);

const Btn = ({ children, onClick, variant = "primary", style, disabled }) => {
  const v = { primary: { background: C.sage, color: C.white, border: "none" }, secondary: { background: "transparent", color: C.sageDark, border: "1.5px solid " + C.sage }, danger: { background: C.danger, color: C.white, border: "none" }, ghost: { background: "transparent", color: C.textMid, border: "none" }, lavender: { background: C.lavLight, color: C.lavDark, border: "none" } };
  return <button disabled={disabled} onClick={onClick} style={{ padding: "10px 22px", borderRadius: 50, fontSize: 13, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "'Montserrat', sans-serif", display: "inline-flex", alignItems: "center", gap: 6, transition: "all .2s", letterSpacing: 0.2, ...v[variant], ...style }}>{children}</button>;
};

const Field = ({ label, value, onChange, type = "text", placeholder, options, textarea, required }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMid, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label} {required && <span style={{ color: C.danger }}>*</span>}</label>
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid " + C.border, fontSize: 14, fontFamily: "'Montserrat', sans-serif", background: C.white, color: C.text, appearance: "auto", boxSizing: "border-box" }}>
        <option value="">Select...</option>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    ) : textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid " + C.border, fontSize: 14, fontFamily: "'Montserrat', sans-serif", resize: "vertical", color: C.text, boxSizing: "border-box", lineHeight: 1.5 }} />
    ) : (
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1px solid " + C.border, fontSize: 14, fontFamily: "'Montserrat', sans-serif", color: C.text, boxSizing: "border-box" }} />
    )}
  </div>
);

const Empty = ({ icon: Ic, text, motif = "moon" }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: C.textLight }}>
    <Motif type={motif} size={28} color={C.lav} style={{ display: "block", marginBottom: 8 }} />
    <Ic size={32} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.35 }} />
    <div style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.5 }}>{text}</div>
  </div>
);

const SevBadge = ({ severity }) => {
  const m = { danger: { bg: C.dangerBg, color: C.danger, l: "\u2726 Critical" }, caution: { bg: C.cautionBg, color: C.caution, l: "\u2727 Caution" }, info: { bg: C.infoBg, color: C.sageDark, l: "\u00B7 Info" } };
  const s = m[severity] || m.info;
  return <Badge label={s.l} color={s.color} bg={s.bg} />;
};

const SecTitle = ({ children, action }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 12px" }}>
    <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>{children}</h2>
    {action}
  </div>
);

const FormWrap = ({ title, onBack, children }) => (
  <div style={{ marginTop: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMid, display: "flex", padding: 4 }}><ChevronLeft size={20} /></button>
      <h3 style={{ fontFamily: "'Playfair Display', serif", margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h3>
    </div>
    {children}
  </div>
);

const iBtn = { background: "none", border: "none", cursor: "pointer", color: C.textFaint, padding: 4, display: "flex" };
const tBtn = { background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 12, fontFamily: "'Montserrat'", padding: 0 };

function mergeRecords(existing, fetched, keyField) {
  const merged = [...existing];
  for (const item of fetched) {
    const key = item[keyField]?.toLowerCase?.()?.trim?.();
    if (!key) continue;
    const existingIdx = merged.findIndex(e => e[keyField]?.toLowerCase?.()?.trim?.() === key);
    if (existingIdx >= 0) {
      const old = merged[existingIdx];
      merged[existingIdx] = { ...item, id: old.id, notes: old.notes || item.notes || "", ...(old.questions ? { questions: old.questions } : {}), ...(old.postNotes && !item.postNotes ? { postNotes: old.postNotes } : {}) };
    } else {
      merged.push({ ...item, id: uid(), _source: "mcp" });
    }
  }
  return merged;
}

/* ═══════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════ */
function Dashboard({ data, interactions, navTo, doRefresh, refreshing, refreshError, refreshResult, lastRefresh }) {
  const actMeds = data.meds.filter(m => m.active !== false);
  const upcoming = data.appts.filter(a => new Date(a.date) >= new Date(new Date().toDateString())).sort((a,b) => new Date(a.date) - new Date(b.date));
  const refill = actMeds.filter(m => m.refillDate).sort((a,b) => new Date(a.refillDate) - new Date(b.refillDate))[0];
  const actConds = data.conditions.filter(c => c.status === "active");
  const lastJ = data.journal[0];
  const aiMode = data.settings.aiMode || "onDemand";
  const hasData = data.meds.length > 0 || data.conditions.length > 0 || data.allergies.length > 0 || data.vitals.length > 0;

  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const loadInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const profile = buildProfile(dataRef.current);
      const text = await askClaude(
        "You are a compassionate, knowledgeable health companion. Given this patient's health profile, share ONE interesting, useful, or empowering health insight they might not know. It could be: a lesser-known fact about one of their conditions, a helpful tip about one of their medications, a connection between two of their health issues, a seasonal or lifestyle consideration, or an encouraging piece of recent medical progress. Keep it warm, concise (3-4 sentences), and specific to THEIR profile. Do not repeat generic advice. Start with a relevant emoji.",
        "Here is my health profile:\n\n" + profile + "\n\nGive me today's personalized health insight."
      );
      setInsight(text);
    } catch (e) { setInsight("Could not load insight right now. Tap to try again."); }
    setInsightLoading(false);
  }, []);

  useEffect(() => {
    if (aiMode === "alwaysOn" && hasData && !insight) { loadInsight(); }
  }, [aiMode, hasData, insight, loadInsight]);

  useEffect(() => {
    if (!refreshing) { setElapsed(0); return; }
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [refreshing]);

  const fmtRefresh = lastRefresh ? new Date(lastRefresh).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (<>
    {/* Refresh Records */}
    <Card onClick={refreshing ? undefined : doRefresh} style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 12, padding: 14, cursor: refreshing ? "default" : "pointer", background: refreshing ? C.sagePale : "linear-gradient(135deg, " + C.sagePale + " 0%, " + C.lavPale + " 100%)", border: "1px solid " + C.borderLight }}>
      <div style={{ width: 38, height: 38, borderRadius: 50, background: C.sageLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {refreshing
          ? <Loader2 size={20} style={{ color: C.sageDark, animation: "hc-spin 1s linear infinite" }} />
          : <RefreshCw size={20} style={{ color: C.sageDark }} />
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {refreshing ? (elapsed < 15 ? "Connecting to health services..." : elapsed < 45 ? "Fetching your records..." : elapsed < 90 ? "Still working — lots of data..." : "Almost there — hang tight...") : "Refresh Health Records"}
        </div>
        <div style={{ fontSize: 11, color: C.textMid, marginTop: 1 }}>
          {refreshing ? (elapsed + "s elapsed") : fmtRefresh ? "Last updated: " + fmtRefresh : "Pull your latest medical data"}
        </div>
      </div>
    </Card>

    {refreshError && (
      <div style={{ margin: "0 0 8px", background: C.dangerBg, border: "1px solid #E8BFBF", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: C.danger, lineHeight: 1.5 }}>
        <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
        {refreshError}
      </div>
    )}
    {refreshResult && (
      <div style={{ margin: "0 0 8px", background: C.sageLight, border: "1px solid " + C.sage, borderRadius: 12, padding: "10px 14px", fontSize: 12, color: C.sageDeep, lineHeight: 1.5 }}>
        <Check size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
        {refreshResult}
      </div>
    )}

    {/* Stats */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
      <Card onClick={() => navTo("meds")} style={{ textAlign: "center", padding: "20px 16px" }}>
        <Pill size={20} strokeWidth={1.4} style={{ color: C.sage, marginBottom: 6 }} />
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: C.sageDark }}>{actMeds.length}</div>
        <div style={{ fontSize: 11, color: C.textLight, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>Active Meds</div>
      </Card>
      <Card onClick={() => navTo("conditions")} style={{ textAlign: "center", padding: "20px 16px" }}>
        <Stethoscope size={20} strokeWidth={1.4} style={{ color: C.lavDark, marginBottom: 6 }} />
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: C.lavDark }}>{actConds.length}</div>
        <div style={{ fontSize: 11, color: C.textLight, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 2 }}>Conditions</div>
      </Card>
    </div>

    {/* AI Insight Card */}
    {aiMode !== "off" && hasData && (<>
      <SecTitle action={<button onClick={loadInsight} style={{...tBtn, display:"flex", alignItems:"center", gap:4}}><RefreshCw size={12}/> Refresh</button>}>
        {"\u2728"} Daily Insight
      </SecTitle>
      <Card style={{ background: "linear-gradient(135deg, " + C.lavPale + " 0%, " + C.sagePale + " 100%)", border: "1px solid " + C.lavLight }}>
        {insightLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", color: C.textMid }}>
            <Loader2 size={18} style={{ animation: "hc-spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, fontStyle: "italic" }}>Reading your health profile...</span>
          </div>
        ) : insight ? (
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>{insight}</div>
        ) : aiMode === "onDemand" ? (
          <div onClick={loadInsight} style={{ cursor: "pointer", textAlign: "center", padding: "6px 0" }}>
            <Sparkles size={20} strokeWidth={1.3} style={{ color: C.lavDark, marginBottom: 4 }} />
            <div style={{ fontSize: 13, color: C.lavDark, fontWeight: 500 }}>Tap for today's personalized insight</div>
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>Based on your medications, conditions & journal</div>
          </div>
        ) : null}
      </Card>
    </>)}

    {/* AI Features Link */}
    {aiMode !== "off" && (
      <Card onClick={() => navTo("ai")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, cursor: "pointer" }}>
        <div style={{ width: 36, height: 36, borderRadius: 50, background: C.lavLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Wand2 size={18} style={{ color: C.lavDark }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>AI Health Companion</div>
          <div style={{ fontSize: 12, color: C.textMid }}>Connections, news, resources & more</div>
        </div>
        <span style={{ fontSize: 14, color: C.textFaint }}>{"\u2192"}</span>
      </Card>
    )}

    {interactions.length > 0 && (<>
      <SecTitle>Interactions</SecTitle>
      {interactions.slice(0,3).map((w,i) => (
        <Card key={i} onClick={() => navTo("meds")} style={{ borderLeft: "3px solid " + (w.severity === "danger" ? C.danger : w.severity === "caution" ? C.caution : C.sage) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{w.medA} + {w.medB}</span>
            <SevBadge severity={w.severity} />
          </div>
          <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{w.msg}</div>
        </Card>
      ))}
    </>)}

    <Divider />

    {upcoming.length > 0 && (<>
      <SecTitle action={<span style={{ fontSize: 12, color: C.sage, cursor: "pointer" }} onClick={() => navTo("appts")}>View all {"\u2192"}</span>}>Upcoming Visits</SecTitle>
      {upcoming.slice(0,2).map(a => (
        <Card key={a.id} onClick={() => navTo("appts")}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{a.reason || a.provider || "Appointment"}</div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{a.provider}{a.location ? " \u00B7 " + a.location : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.sageDark }}>{daysUntil(a.date)}</div>
              <div style={{ fontSize: 11, color: C.textLight }}>{fmtDate(a.date)}</div>
            </div>
          </div>
        </Card>
      ))}
    </>)}

    {refill && (<>
      <SecTitle>Next Refill</SecTitle>
      <Card onClick={() => navTo("meds")} style={{ borderLeft: "3px solid " + C.caution }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><div style={{ fontSize: 14, fontWeight: 500 }}>{refill.name}</div><div style={{ fontSize: 12, color: C.textMid }}>{refill.dose}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 600, color: C.caution }}>{daysUntil(refill.refillDate)}</div><div style={{ fontSize: 11, color: C.textLight }}>{fmtDate(refill.refillDate)}</div></div>
        </div>
      </Card>
    </>)}

    {lastJ && (<>
      <SecTitle>Latest Journal</SecTitle>
      <Card onClick={() => navTo("journal")} style={{ background: C.lavPale, border: "1px solid " + C.lavLight }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 14, fontWeight: 500 }}>{lastJ.title || fmtDate(lastJ.date)}</span>
          {lastJ.mood && <span style={{ fontSize: 16 }}>{lastJ.mood.split(" ")[0]}</span>}
        </div>
        <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{(lastJ.content || "").slice(0,100)}{(lastJ.content || "").length > 100 ? "..." : ""}</div>
      </Card>
    </>)}

    <Divider />

    <SecTitle>Quick Access</SecTitle>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {[
        { id: "appts", icon: Calendar, label: "Visits", m: "moon" },
        { id: "providers", icon: User, label: "Providers", m: "leaf" },
        { id: "allergies", icon: Shield, label: "Allergies", m: "star" },
        { id: "conditions", icon: Stethoscope, label: "Diagnoses", m: "sparkle" },
      ].map(t => (
        <Card key={t.id} onClick={() => navTo(t.id)} style={{ textAlign: "center", padding: "16px 8px" }}>
          <Motif type={t.m} size={12} color={C.lav} style={{ display: "block", marginBottom: 4 }} />
          <t.icon size={20} strokeWidth={1.3} style={{ color: C.sageDark, marginBottom: 4 }} />
          <div style={{ fontSize: 11, color: C.textMid, fontWeight: 500 }}>{t.label}</div>
        </Card>
      ))}
    </div>

    <div style={{ textAlign: "center", padding: "28px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Motif type="sparkle" size={8} color={C.textFaint} /><span style={{ fontSize: 11, color: C.textFaint, letterSpacing: 0.5 }}>Personal health reference</span><Motif type="sparkle" size={8} color={C.textFaint} />
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════
   MEDICATIONS
═══════════════════════════════════════════ */
const MF = ["Once daily","Twice daily (BID)","Three times daily (TID)","Four times daily (QID)","Every morning","Every evening/bedtime (QHS)","As needed (PRN)","Weekly","Biweekly","Monthly","Other"];
const MR = ["Oral","Topical","Injection (SC)","Injection (IM)","IV","Inhaled","Sublingual","Transdermal patch","Rectal","Ophthalmic","Otic","Nasal","Other"];
const EM = { name:"",dose:"",frequency:"",route:"Oral",prescriber:"",pharmacy:"",startDate:"",purpose:"",refillDate:"",active:true,notes:"" };

function MedsView({ data, update, interactions, subView, setSubView }) {
  const [form, setForm] = useState(EM);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("active");
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p => ({...p,[k]:v}));

  const saveMed = () => { if(!form.name.trim()) return; const m={...form,id:editId||uid()}; update("meds", editId ? data.meds.map(x=>x.id===editId?m:x) : [...data.meds,m]); setForm(EM); setEditId(null); setSubView(null); };

  if (subView === "form") return (
    <FormWrap title={(editId?"Edit":"Add")+" Medication"} onBack={() => {setSubView(null);setForm(EM);setEditId(null);}}>
      <Card>
        <Field label="Medication Name" value={form.name} onChange={v=>sf("name",v)} placeholder="e.g. Sertraline" required />
        <Field label="Dose" value={form.dose} onChange={v=>sf("dose",v)} placeholder="e.g. 50mg" />
        <Field label="Frequency" value={form.frequency} onChange={v=>sf("frequency",v)} options={MF} />
        <Field label="Route" value={form.route} onChange={v=>sf("route",v)} options={MR} />
        <Field label="Prescriber" value={form.prescriber} onChange={v=>sf("prescriber",v)} placeholder="Dr. Name" />
        <Field label="Pharmacy" value={form.pharmacy} onChange={v=>sf("pharmacy",v)} placeholder="Pharmacy name" />
        <Field label="Purpose / Condition" value={form.purpose} onChange={v=>sf("purpose",v)} placeholder="What is this for?" />
        <Field label="Start Date" value={form.startDate} onChange={v=>sf("startDate",v)} type="date" />
        <Field label="Next Refill" value={form.refillDate} onChange={v=>sf("refillDate",v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v=>sf("notes",v)} textarea placeholder="Side effects, instructions..." />
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
          <input type="checkbox" checked={form.active!==false} onChange={e=>sf("active",e.target.checked)} id="mA" />
          <label htmlFor="mA" style={{ fontSize:14,color:C.textMid }}>Currently taking</label>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          <Btn onClick={saveMed} disabled={!form.name.trim()}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={() => {setSubView(null);setForm(EM);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  const fl = data.meds.filter(m => filter==="all"?true:filter==="active"?m.active!==false:m.active===false);

  return (<div style={{ marginTop:8 }}>
    {interactions.length > 0 && (<>
      <SecTitle>Interaction Warnings</SecTitle>
      {interactions.map((w,i) => (
        <Card key={i} style={{ borderLeft:"3px solid "+(w.severity==="danger"?C.danger:w.severity==="caution"?C.caution:C.sage), padding:14 }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
            <span style={{ fontSize:13,fontWeight:600 }}>{w.medA} + {w.medB}</span>
            <SevBadge severity={w.severity} />
          </div>
          <div style={{ fontSize:12,color:C.textMid,lineHeight:1.5 }}>{w.msg}</div>
        </Card>
      ))}
      <div style={{ fontSize:11,color:C.textFaint,fontStyle:"italic",textAlign:"center",margin:"4px 0 8px" }}>{"\u2727"} Always verify with your pharmacist {"\u2727"}</div>
    </>)}

    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Add</Btn>}>My Medications</SecTitle>

    <div style={{ display:"flex",gap:6,marginBottom:14 }}>
      {["active","inactive","all"].map(f => (
        <button key={f} onClick={()=>setFilter(f)} style={{ padding:"6px 16px",borderRadius:50,fontSize:12,fontWeight:500,border:"1px solid "+(filter===f?C.sage:C.border),background:filter===f?C.sageLight:"transparent",color:filter===f?C.sageDeep:C.textLight,cursor:"pointer",fontFamily:"'Montserrat'",textTransform:"capitalize" }}>{f}</button>
      ))}
    </div>

    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("meds", data.meds.filter(x=>x.id!==id)))} onCancel={del.cancel} />

    {fl.length === 0 ? <Empty icon={Pill} text="No medications yet" motif="leaf" /> :
      fl.map(m => (
        <Card key={m.id}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"start" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15,fontWeight:600,marginBottom:3 }}>{m.name}</div>
              <div style={{ fontSize:13,color:C.textMid }}>{[m.dose,m.frequency,m.route].filter(Boolean).join(" \u00B7 ")}</div>
              {m.purpose && <div style={{ fontSize:12,color:C.textLight,marginTop:3 }}>For: {m.purpose}</div>}
              {m.prescriber && <div style={{ fontSize:12,color:C.textLight }}>Rx: {m.prescriber}</div>}
              {m.refillDate && <div style={{ fontSize:12,color:C.caution,marginTop:4,fontWeight:500 }}>Refill: {fmtDate(m.refillDate)} ({daysUntil(m.refillDate)})</div>}
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={()=>{setForm(m);setEditId(m.id);setSubView("form");}} style={iBtn}><Edit size={15}/></button>
              <button onClick={()=>del.ask(m.id, m.name)} style={iBtn}><Trash2 size={15}/></button>
            </div>
          </div>
          {m.active===false && <Badge label="Discontinued" color={C.textLight} bg={C.cardHover} />}
        </Card>
      ))
    }
  </div>);
}

/* ═══════════════════════════════════════════
   VITALS
═══════════════════════════════════════════ */
const EV = { date: new Date().toISOString().slice(0,10), type:"pain", value:"", value2:"", notes:"" };

function VitalsView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EV);
  const [ct, setCt] = useState("pain");
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));

  const saveV = () => { if(!form.value) return; update("vitals",[...data.vitals,{...form,id:uid()}].sort((a,b)=>new Date(a.date)-new Date(b.date))); setForm({...EV,date:new Date().toISOString().slice(0,10)}); setSubView(null); };

  const cd = data.vitals.filter(v=>v.type===ct).map(v=>({ date:fmtDate(v.date), value:Number(v.value), ...(v.value2?{value2:Number(v.value2)}:{}) }));
  const vi = VT.find(t=>t.id===ct);

  if (subView==="form") return (
    <FormWrap title="Log Vital" onBack={()=>setSubView(null)}>
      <Card>
        <Field label="Date" value={form.date} onChange={v=>sf("date",v)} type="date" />
        <Field label="Type" value={form.type} onChange={v=>{sf("type",v);sf("value","");sf("value2","");}} options={VT.map(t=>({value:t.id,label:t.label+" ("+t.unit+")"}))} />
        {form.type==="bp" ? (
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1}}><Field label="Systolic" value={form.value} onChange={v=>sf("value",v)} type="number" placeholder="120" /></div>
            <div style={{flex:1}}><Field label="Diastolic" value={form.value2} onChange={v=>sf("value2",v)} type="number" placeholder="80" /></div>
          </div>
        ) : <Field label="Value" value={form.value} onChange={v=>sf("value",v)} type="number" placeholder={vi?.unit||""} />}
        <Field label="Notes" value={form.notes} onChange={v=>sf("notes",v)} textarea placeholder="Context, how you feel..." />
        <Btn onClick={saveV} disabled={!form.value}><Check size={15}/> Save</Btn>
      </Card>
    </FormWrap>
  );

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Log</Btn>}>Vitals</SecTitle>

    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
      {VT.map(t => (
        <button key={t.id} onClick={()=>setCt(t.id)} style={{ padding:"5px 14px",borderRadius:50,fontSize:11,fontWeight:500,border:"1px solid "+(ct===t.id?C.lav:C.border),background:ct===t.id?C.lavPale:"transparent",color:ct===t.id?C.lavDark:C.textLight,cursor:"pointer",fontFamily:"'Montserrat'" }}>{t.label}</button>
      ))}
    </div>

    {cd.length > 1 ? (
      <Card style={{padding:"14px 10px"}}>
        <div style={{fontFamily:"'Playfair Display', serif",fontSize:14,fontWeight:500,marginBottom:10,paddingLeft:6}}>{vi?.label} <span style={{fontWeight:400,color:C.textLight,fontSize:12}}>over time</span></div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={cd}>
            <defs>
              <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.sage} stopOpacity={0.25}/><stop offset="95%" stopColor={C.sage} stopOpacity={0}/></linearGradient>
              <linearGradient id="lf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.lav} stopOpacity={0.25}/><stop offset="95%" stopColor={C.lav} stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
            <XAxis dataKey="date" tick={{fontSize:10,fill:C.textLight}} />
            <YAxis tick={{fontSize:10,fill:C.textLight}} />
            <Tooltip contentStyle={{fontFamily:"'Montserrat'",fontSize:12,borderRadius:10,border:"1px solid "+C.border}} />
            <Area type="monotone" dataKey="value" stroke={C.sage} fill="url(#sf)" strokeWidth={2.5} dot={{r:3,fill:C.sage}} />
            {ct==="bp" && <Area type="monotone" dataKey="value2" stroke={C.lav} fill="url(#lf)" strokeWidth={2} dot={{r:3,fill:C.lav}} />}
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    ) : (
      <Card style={{textAlign:"center",color:C.textLight,fontSize:13,padding:24}}>
        <Motif type="sparkle" size={20} color={C.lav} style={{display:"block",marginBottom:8}} />
        {cd.length===0?"No entries yet":"Log one more to see the trend"}
      </Card>
    )}

    <SecTitle>Recent Entries</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("vitals", data.vitals.filter(x=>x.id!==id)))} onCancel={del.cancel} />
    {data.vitals.length===0 ? <Empty icon={Heart} text="No vitals logged yet" motif="sparkle" /> :
      data.vitals.slice().reverse().slice(0,15).map(v => {
        const t = VT.find(x=>x.id===v.type);
        return (
          <Card key={v.id} style={{padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div><span style={{fontSize:13,fontWeight:500}}>{t?.label}: </span><span style={{fontSize:14,color:C.sageDark,fontWeight:600}}>{v.type==="bp"?v.value+"/"+v.value2:v.value} {t?.unit}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:C.textFaint}}>{fmtDate(v.date)}</span>
                <button onClick={()=>del.ask(v.id, (t?.label || "entry"))} style={iBtn}><Trash2 size={14}/></button>
              </div>
            </div>
            {v.notes && <div style={{fontSize:12,color:C.textMid,marginTop:4}}>{v.notes}</div>}
          </Card>
        );
      })
    }
  </div>);
}

/* ═══════════════════════════════════════════
   APPOINTMENTS
═══════════════════════════════════════════ */
const EA = {date:"",time:"",provider:"",location:"",reason:"",questions:"",postNotes:""};

function ApptsView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EA);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));

  const saveA = () => { if(!form.date) return; const a={...form,id:editId||uid()}; update("appts",(editId?data.appts.map(x=>x.id===editId?a:x):[...data.appts,a]).sort((a,b)=>new Date(a.date)-new Date(b.date))); setForm(EA);setEditId(null);setSubView(null); };

  if (subView==="form") return (
    <FormWrap title={(editId?"Edit":"New")+" Appointment"} onBack={()=>{setSubView(null);setForm(EA);setEditId(null);}}>
      <Card>
        <Field label="Date" value={form.date} onChange={v=>sf("date",v)} type="date" required />
        <Field label="Time" value={form.time} onChange={v=>sf("time",v)} type="time" />
        <Field label="Provider" value={form.provider} onChange={v=>sf("provider",v)} placeholder="Dr. Name" />
        <Field label="Location" value={form.location} onChange={v=>sf("location",v)} placeholder="Clinic, hospital..." />
        <Field label="Reason" value={form.reason} onChange={v=>sf("reason",v)} placeholder="Follow-up, labs..." />
        <Field label="Questions to Ask" value={form.questions} onChange={v=>sf("questions",v)} textarea placeholder="Things to bring up..." />
        <Field label="Post-Visit Notes" value={form.postNotes} onChange={v=>sf("postNotes",v)} textarea placeholder="What happened..." />
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={saveA} disabled={!form.date}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={()=>{setSubView(null);setForm(EA);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  const up = data.appts.filter(a=>new Date(a.date)>=new Date(new Date().toDateString()));
  const past = data.appts.filter(a=>new Date(a.date)<new Date(new Date().toDateString())).reverse();

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Add</Btn>}>Appointments</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("appts", data.appts.filter(x=>x.id!==id)))} onCancel={del.cancel} />

    {data.appts.length===0 ? <Empty icon={Calendar} text="No appointments yet" motif="moon" /> : (<>
      {up.length>0 && <div style={{fontSize:11,fontWeight:600,color:C.sageDark,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}><Motif type="leaf" size={12} color={C.sage} style={{marginRight:4}}/> Upcoming</div>}
      {up.map(a => (
        <Card key={a.id} style={{borderLeft:"3px solid "+C.sage}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:500}}>{a.reason||"Appointment"}</div>
              <div style={{fontSize:12,color:C.textMid,marginTop:2}}>{a.provider}{a.location?" \u00B7 "+a.location:""}</div>
              {a.questions && <div style={{fontSize:12,color:C.sageDark,marginTop:6,padding:"6px 10px",background:C.sagePale,borderRadius:8}}>{"\uD83D\uDCDD"} {a.questions.slice(0,80)}{a.questions.length>80?"...":""}</div>}
            </div>
            <div style={{textAlign:"right",flexShrink:0,marginLeft:12}}>
              <div style={{fontSize:13,fontWeight:600,color:C.sageDark}}>{daysUntil(a.date)}</div>
              <div style={{fontSize:11,color:C.textLight}}>{fmtDate(a.date)}</div>
              {a.time && <div style={{fontSize:11,color:C.textLight}}>{a.time}</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <button onClick={()=>{setForm(a);setEditId(a.id);setSubView("form");}} style={tBtn}>Edit</button>
            <button onClick={()=>del.ask(a.id, a.reason || "appointment")} style={tBtn}>Delete</button>
          </div>
        </Card>
      ))}
      {past.length>0 && <><Divider /><div style={{fontSize:11,fontWeight:600,color:C.textLight,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Past</div></>}
      {past.slice(0,10).map(a => (
        <Card key={a.id} style={{opacity:0.75}}>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <div><div style={{fontSize:14,fontWeight:500}}>{a.reason||"Appointment"}</div><div style={{fontSize:12,color:C.textMid}}>{a.provider} · {fmtDate(a.date)}</div></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setForm(a);setEditId(a.id);setSubView("form");}} style={iBtn}><Edit size={14}/></button>
              <button onClick={()=>del.ask(a.id, a.reason || "appointment")} style={iBtn}><Trash2 size={14}/></button>
            </div>
          </div>
          {a.postNotes && <div style={{fontSize:12,color:C.textMid,marginTop:6,borderTop:"1px solid "+C.borderLight,paddingTop:6}}>{a.postNotes}</div>}
        </Card>
      ))}
    </>)}
  </div>);
}

/* ═══════════════════════════════════════════
   CONDITIONS
═══════════════════════════════════════════ */
const EC = {name:"",dateDiagnosed:"",status:"active",provider:"",notes:"",linkedMeds:""};

function CondsView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EC);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));
  const saveC = () => { if(!form.name.trim()) return; const c={...form,id:editId||uid()}; update("conditions",editId?data.conditions.map(x=>x.id===editId?c:x):[...data.conditions,c]); setForm(EC);setEditId(null);setSubView(null); };
  const ss = {active:{c:C.danger,bg:C.dangerBg},managed:{c:C.sageDark,bg:C.sageLight},remission:{c:C.lavDark,bg:C.lavLight},resolved:{c:C.textLight,bg:C.cardHover}};

  if (subView==="form") return (
    <FormWrap title={(editId?"Edit":"Add")+" Condition"} onBack={()=>{setSubView(null);setForm(EC);setEditId(null);}}>
      <Card>
        <Field label="Condition / Diagnosis" value={form.name} onChange={v=>sf("name",v)} placeholder="e.g. Fibromyalgia" required />
        <Field label="Date Diagnosed" value={form.dateDiagnosed} onChange={v=>sf("dateDiagnosed",v)} type="date" />
        <Field label="Status" value={form.status} onChange={v=>sf("status",v)} options={[{value:"active",label:"Active"},{value:"managed",label:"Managed"},{value:"remission",label:"In Remission"},{value:"resolved",label:"Resolved"}]} />
        <Field label="Treating Provider" value={form.provider} onChange={v=>sf("provider",v)} placeholder="Dr. Name" />
        <Field label="Related Medications" value={form.linkedMeds} onChange={v=>sf("linkedMeds",v)} placeholder="Meds for this condition" />
        <Field label="Notes" value={form.notes} onChange={v=>sf("notes",v)} textarea placeholder="History, triggers..." />
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={saveC} disabled={!form.name.trim()}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={()=>{setSubView(null);setForm(EC);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Add</Btn>}>Conditions & Diagnoses</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("conditions", data.conditions.filter(x=>x.id!==id)))} onCancel={del.cancel} />
    {data.conditions.length===0 ? <Empty icon={Stethoscope} text="No conditions recorded" motif="star" /> :
    data.conditions.map(c => { const st=ss[c.status]||ss.active; return (
      <Card key={c.id}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:15,fontWeight:600}}>{c.name}</span><Badge label={c.status} color={st.c} bg={st.bg} /></div>
            {c.dateDiagnosed && <div style={{fontSize:12,color:C.textMid}}>Diagnosed: {fmtDate(c.dateDiagnosed)}</div>}
            {c.provider && <div style={{fontSize:12,color:C.textMid}}>Provider: {c.provider}</div>}
            {c.linkedMeds && <div style={{fontSize:12,color:C.sageDark,marginTop:3}}>Meds: {c.linkedMeds}</div>}
            {c.notes && <div style={{fontSize:12,color:C.textLight,marginTop:4,lineHeight:1.5}}>{c.notes}</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setForm(c);setEditId(c.id);setSubView("form");}} style={iBtn}><Edit size={15}/></button>
            <button onClick={()=>del.ask(c.id, c.name)} style={iBtn}><Trash2 size={15}/></button>
          </div>
        </div>
      </Card>
    );})
    }
  </div>);
}

/* ═══════════════════════════════════════════
   PROVIDERS
═══════════════════════════════════════════ */
const EP = {name:"",specialty:"",clinic:"",phone:"",fax:"",portal:"",notes:""};

function ProvsView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EP);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));
  const saveP = () => { if(!form.name.trim()) return; const p={...form,id:editId||uid()}; update("providers",editId?data.providers.map(x=>x.id===editId?p:x):[...data.providers,p]); setForm(EP);setEditId(null);setSubView(null); };

  if (subView==="form") return (
    <FormWrap title={(editId?"Edit":"Add")+" Provider"} onBack={()=>{setSubView(null);setForm(EP);setEditId(null);}}>
      <Card>
        <Field label="Name" value={form.name} onChange={v=>sf("name",v)} placeholder="Dr. Name" required />
        <Field label="Specialty" value={form.specialty} onChange={v=>sf("specialty",v)} placeholder="e.g. Rheumatology" />
        <Field label="Clinic / Office" value={form.clinic} onChange={v=>sf("clinic",v)} placeholder="Clinic name" />
        <Field label="Phone" value={form.phone} onChange={v=>sf("phone",v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Fax" value={form.fax} onChange={v=>sf("fax",v)} type="tel" />
        <Field label="Patient Portal" value={form.portal} onChange={v=>sf("portal",v)} placeholder="https://..." />
        <Field label="Notes" value={form.notes} onChange={v=>sf("notes",v)} textarea placeholder="Office hours, best contact..." />
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={saveP} disabled={!form.name.trim()}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={()=>{setSubView(null);setForm(EP);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Add</Btn>}>Providers</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("providers", data.providers.filter(x=>x.id!==id)))} onCancel={del.cancel} />
    {data.providers.length===0 ? <Empty icon={User} text="No providers added" motif="leaf" /> :
    data.providers.map(p => (
      <Card key={p.id}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:600}}>{p.name}</div>
            {p.specialty && <div style={{fontSize:13,color:C.lavDark,fontWeight:500}}>{p.specialty}</div>}
            {p.clinic && <div style={{fontSize:12,color:C.textMid,marginTop:2}}>{p.clinic}</div>}
            {p.phone && <div style={{fontSize:12,color:C.textMid,marginTop:4,display:"flex",alignItems:"center",gap:4}}><Phone size={12} strokeWidth={1.4}/> {p.phone}</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setForm(p);setEditId(p.id);setSubView("form");}} style={iBtn}><Edit size={15}/></button>
            <button onClick={()=>del.ask(p.id, p.name)} style={iBtn}><Trash2 size={15}/></button>
          </div>
        </div>
      </Card>
    ))
    }
  </div>);
}

/* ═══════════════════════════════════════════
   ALLERGIES
═══════════════════════════════════════════ */
const EAL = {substance:"",reaction:"",severity:"moderate",notes:""};

function AllergyView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EAL);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));
  const saveAl = () => { if(!form.substance.trim()) return; const a={...form,id:editId||uid()}; update("allergies",editId?data.allergies.map(x=>x.id===editId?a:x):[...data.allergies,a]); setForm(EAL);setEditId(null);setSubView(null); };
  const sv = {mild:{c:C.sageDark,bg:C.sageLight},moderate:{c:C.caution,bg:C.cautionBg},severe:{c:C.danger,bg:C.dangerBg}};

  if (subView==="form") return (
    <FormWrap title={(editId?"Edit":"Add")+" Allergy"} onBack={()=>{setSubView(null);setForm(EAL);setEditId(null);}}>
      <Card>
        <Field label="Substance" value={form.substance} onChange={v=>sf("substance",v)} placeholder="e.g. Penicillin, Latex" required />
        <Field label="Reaction" value={form.reaction} onChange={v=>sf("reaction",v)} placeholder="e.g. Hives, anaphylaxis" />
        <Field label="Severity" value={form.severity} onChange={v=>sf("severity",v)} options={[{value:"mild",label:"Mild"},{value:"moderate",label:"Moderate"},{value:"severe",label:"Severe — Anaphylaxis"}]} />
        <Field label="Notes" value={form.notes} onChange={v=>sf("notes",v)} textarea placeholder="Cross-sensitivities..." />
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={saveAl} disabled={!form.substance.trim()}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={()=>{setSubView(null);setForm(EAL);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="secondary" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Add</Btn>}>Allergies & Sensitivities</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("allergies", data.allergies.filter(x=>x.id!==id)))} onCancel={del.cancel} />
    {data.allergies.length===0 ? <Empty icon={Shield} text="No allergies recorded" motif="star" /> :
    data.allergies.map(a => { const s=sv[a.severity]||sv.moderate; return (
      <Card key={a.id} style={{borderLeft:"3px solid "+s.c}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start"}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:15,fontWeight:600}}>{a.substance}</span><Badge label={a.severity} color={s.c} bg={s.bg} /></div>
            {a.reaction && <div style={{fontSize:12,color:C.textMid}}>Reaction: {a.reaction}</div>}
            {a.notes && <div style={{fontSize:12,color:C.textLight,marginTop:3}}>{a.notes}</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{setForm(a);setEditId(a.id);setSubView("form");}} style={iBtn}><Edit size={15}/></button>
            <button onClick={()=>del.ask(a.id, a.substance)} style={iBtn}><Trash2 size={15}/></button>
          </div>
        </div>
      </Card>
    );})
    }
  </div>);
}

/* ═══════════════════════════════════════════
   JOURNAL
═══════════════════════════════════════════ */
const EJ = {date:new Date().toISOString().slice(0,10),title:"",content:"",severity:"5",tags:"",mood:""};
const MOODS = ["\uD83C\uDF1F Great","\uD83D\uDE0A Good","\uD83D\uDE10 Okay","\uD83D\uDE14 Low","\uD83D\uDE22 Sad","\uD83D\uDE21 Frustrated","\uD83D\uDE30 Anxious","\uD83D\uDE34 Exhausted"];

function JournalView({ data, update, subView, setSubView }) {
  const [form, setForm] = useState(EJ);
  const [editId, setEditId] = useState(null);
  const del = useConfirmDelete();
  const sf = (k,v) => setForm(p=>({...p,[k]:v}));
  const saveJ = () => { if(!form.content.trim()&&!form.title.trim()) return; const e={...form,id:editId||uid()}; update("journal",(editId?data.journal.map(x=>x.id===editId?e:x):[...data.journal,e]).sort((a,b)=>new Date(b.date)-new Date(a.date))); setForm({...EJ,date:new Date().toISOString().slice(0,10)});setEditId(null);setSubView(null); };

  if (subView==="form") return (
    <FormWrap title={(editId?"Edit":"New")+" Entry"} onBack={()=>{setSubView(null);setForm(EJ);setEditId(null);}}>
      <Card>
        <Field label="Date" value={form.date} onChange={v=>sf("date",v)} type="date" />
        <Field label="Title (optional)" value={form.title} onChange={v=>sf("title",v)} placeholder="Quick label for today" />
        <Field label="Mood" value={form.mood} onChange={v=>sf("mood",v)} options={MOODS} />
        <Field label="Symptom Severity" value={form.severity} onChange={v=>sf("severity",v)} options={[...Array(10)].map((_,i)=>({value:String(i+1),label:(i+1)+"/10"+(i===0?" (minimal)":i===9?" (worst)":"")}))} />
        <Field label="What's going on?" value={form.content} onChange={v=>sf("content",v)} textarea placeholder="Symptoms, triggers, what helped..." />
        <Field label="Tags" value={form.tags} onChange={v=>sf("tags",v)} placeholder="flare, fatigue, headache..." />
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={saveJ} disabled={!form.content.trim()&&!form.title.trim()}><Check size={15}/> Save</Btn>
          <Btn variant="ghost" onClick={()=>{setSubView(null);setForm(EJ);setEditId(null);}}>Cancel</Btn>
        </div>
      </Card>
    </FormWrap>
  );

  return (<div style={{marginTop:8}}>
    <SecTitle action={<Btn variant="lavender" onClick={()=>setSubView("form")} style={{padding:"7px 16px",fontSize:12}}><Plus size={14}/> Write</Btn>}>Symptom Journal</SecTitle>
    <ConfirmBar pending={del.pending} onConfirm={() => del.confirm(id => update("journal", data.journal.filter(x=>x.id!==id)))} onCancel={del.cancel} />
    {data.journal.length===0 ? <Empty icon={BookOpen} text="Your journal is empty — start tracking patterns" motif="moon" /> :
    data.journal.map(e => (
      <Card key={e.id} style={{background:C.lavPale,border:"1px solid "+C.lavLight}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:6}}>
          <div>
            <span style={{fontFamily:"'Playfair Display', serif",fontSize:14,fontWeight:500}}>{e.title||fmtDate(e.date)}</span>
            {e.title && <span style={{fontSize:11,color:C.textFaint,marginLeft:8}}>{fmtDate(e.date)}</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {e.mood && <span style={{fontSize:16}}>{e.mood.split(" ")[0]}</span>}
            {e.severity && <Badge label={e.severity+"/10"} color={Number(e.severity)>=7?C.danger:Number(e.severity)>=4?C.caution:C.sageDark} bg={Number(e.severity)>=7?C.dangerBg:Number(e.severity)>=4?C.cautionBg:C.sageLight} />}
          </div>
        </div>
        <div style={{fontSize:13,color:C.textMid,lineHeight:1.6}}>{e.content}</div>
        {e.tags && <div style={{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"}}>
          {e.tags.split(",").map((t,i) => <span key={i} style={{background:C.white,color:C.textMid,fontSize:11,padding:"3px 10px",borderRadius:50,border:"1px solid "+C.borderLight}}>{t.trim()}</span>)}
        </div>}
        <div style={{display:"flex",gap:10,marginTop:8}}>
          <button onClick={()=>{setForm(e);setEditId(e.id);setSubView("form");}} style={tBtn}>Edit</button>
          <button onClick={()=>del.ask(e.id, e.title || "entry")} style={tBtn}>Delete</button>
        </div>
      </Card>
    ))
    }
  </div>);
}

/* ═══════════════════════════════════════════
   AI PANEL
═══════════════════════════════════════════ */
function AIPanel({ data }) {
  const [activeFeature, setActiveFeature] = useState(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [askInput, setAskInput] = useState("");
  const aiMode = data.settings.aiMode || "onDemand";
  const hasData = data.meds.length > 0 || data.conditions.length > 0 || data.allergies.length > 0 || data.vitals.length > 0;
  const dataRef = useRef(data);
  dataRef.current = data;
  const location = data.settings.location || "";

  const runFeature = async (feature, customInput) => {
    setActiveFeature(feature);
    setResult("");
    setLoading(true);
    const profile = buildProfile(dataRef.current);
    try {
      let text = "";
      switch (feature) {
        case "connections":
          text = await askClaude(
            "You are an insightful health analyst. Given this patient's complete health profile, look for non-obvious connections, patterns, and insights across their medications, conditions, symptoms, and vitals. Consider: medications that might worsen another condition, overlapping side effects, symptom patterns in their journal, vitals trends that correlate with entries, nutritional or lifestyle factors linking conditions, whether their med regimen is internally consistent. Be specific and reference THEIR actual data. Format with clear sections. Be warm but thorough. End with a note that this is not medical advice.",
            "Here is my complete health profile:\n\n" + profile + "\n\nWhat connections, patterns, or insights do you see across my health data?"
          );
          break;
        case "news":
          text = await askClaude(
            "You are a health news curator. Search for recent medical news, research breakthroughs, or treatment developments related to the patient's specific conditions. Provide 3-5 recent items with brief summaries. Focus on actionable or hopeful developments. Be specific about what's new. Format clearly with headlines and 1-2 sentence summaries each.",
            "My conditions are: " + (dataRef.current.conditions.map(c => c.name).filter(Boolean).join(", ") || "See profile below") + "\n\nFull profile:\n" + profile + "\n\nFind recent health news and research relevant to my conditions.",
            true
          );
          break;
        case "resources":
          text = await askClaude(
            "You are a disability resources specialist. Search for programs, benefits, discounts, passes, and assistance available for someone with these conditions in their area. Include: government disability programs, national park/recreation access passes, transit discounts, utility assistance, prescription assistance programs, tax deductions, workplace accommodations under ADA, state-specific programs, nonprofit resources, and anything else helpful. Be specific with program names, eligibility, and how to apply. Format clearly.",
            "I live in: " + (location || "the United States (no specific location provided)") + "\n\nMy conditions: " + dataRef.current.conditions.map(c => c.name + " (" + c.status + ")").join(", ") + "\n\nFull profile:\n" + profile + "\n\nWhat disability resources, passes, discounts, and assistance programs might I qualify for?",
            true
          );
          break;
        case "ask":
          if (!customInput?.trim()) { setLoading(false); return; }
          text = await askClaude(
            "You are a knowledgeable, compassionate health companion. You have access to this patient's complete health profile. Answer their question with their specific health context in mind. Be thorough but warm. Reference their specific medications, conditions, and history where relevant. Always note that your response is informational and not a substitute for professional medical advice.",
            "My health profile:\n\n" + profile + "\n\nMy question: " + customInput
          );
          break;
        case "insight":
          text = await askClaude(
            "You are a compassionate, knowledgeable health companion. Given this patient's health profile, share ONE interesting, useful, or empowering health insight they might not know. It could be: a lesser-known fact about one of their conditions, a helpful tip about one of their medications, a connection between two of their health issues, a seasonal or lifestyle consideration, or an encouraging piece of recent medical progress. Keep it warm, concise (3-4 sentences), and specific to THEIR profile. Start with a relevant emoji.",
            "Here is my health profile:\n\n" + profile + "\n\nGive me a personalized health insight."
          );
          break;
      }
      setResult(text);
    } catch (e) {
      setResult("Something went wrong: " + (e.message || "Please try again."));
    }
    setLoading(false);
  };

  if (aiMode === "off") return (
    <div style={{ marginTop: 8 }}>
      <Empty icon={Sparkles} text="AI features are turned off. Enable them in Settings." motif="moon" />
    </div>
  );

  if (!hasData) return (
    <div style={{ marginTop: 8 }}>
      <Empty icon={Sparkles} text="Add some medications or conditions first so I can give you personalized insights." motif="sparkle" />
    </div>
  );

  const features = [
    { id: "insight", icon: Sparkles, label: "Daily Insight", desc: "A personalized health tip or fact", color: C.lavDark, bg: C.lavPale },
    { id: "connections", icon: Wand2, label: "What's Connected?", desc: "Patterns across your health data", color: C.sageDark, bg: C.sagePale },
    { id: "news", icon: Globe, label: "Health News", desc: "Latest research on your conditions", color: C.caution, bg: C.cautionBg },
    { id: "resources", icon: Compass, label: "Disability Resources", desc: "Programs, passes & benefits for you", color: C.lavDark, bg: C.lavLight },
    { id: "ask", icon: MessageCircle, label: "Ask About Me", desc: "Ask anything with your full health context", color: C.sageDark, bg: C.sageLight },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      {!activeFeature && (<>
        <div style={{ textAlign: "center", marginBottom: 20, marginTop: 8 }}>
          <Motif type="moon" size={24} color={C.lav} style={{ display: "block", marginBottom: 6 }} />
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 500, color: C.text }}>Your AI Health Companion</div>
          <div style={{ fontSize: 12, color: C.textLight, marginTop: 4, fontStyle: "italic" }}>Powered by your health profile ({data.meds.filter(m=>m.active!==false).length} meds, {data.conditions.length} conditions)</div>
        </div>
        {features.map(f => (
          <Card key={f.id} onClick={() => f.id === "ask" ? setActiveFeature("ask") : runFeature(f.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, cursor: "pointer" }}>
            <div style={{ width: 40, height: 40, borderRadius: 50, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <f.icon size={20} strokeWidth={1.5} style={{ color: f.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{f.label}</div>
              <div style={{ fontSize: 12, color: C.textMid, marginTop: 1 }}>{f.desc}</div>
            </div>
            <span style={{ color: C.textFaint }}>{"\u2192"}</span>
          </Card>
        ))}
        <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: C.textFaint, fontStyle: "italic" }}>
          {"\u2727"} Each feature sends your health profile to Claude for analysis {"\u2727"}
        </div>
      </>)}

      {/* Ask About Me Input */}
      {activeFeature === "ask" && !loading && !result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setActiveFeature(null); setResult(""); setAskInput(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMid, display: "flex", padding: 4 }}><ChevronLeft size={20} /></button>
            <h3 style={{ fontFamily: "'Playfair Display', serif", margin: 0, fontSize: 17, fontWeight: 600 }}>Ask About Me</h3>
          </div>
          <Card style={{ background: C.lavPale, border: "1px solid " + C.lavLight }}>
            <div style={{ fontSize: 13, color: C.textMid, marginBottom: 12, lineHeight: 1.5 }}>
              Ask any health question. Claude will answer with your full medication list, conditions, vitals, and journal history as context.
            </div>
            <textarea value={askInput} onChange={e => setAskInput(e.target.value)} placeholder="e.g. Could my fatigue be related to any of my medications? What should I ask my rheumatologist about next?" rows={4} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid " + C.border, fontSize: 14, fontFamily: "'Montserrat', sans-serif", resize: "vertical", color: C.text, boxSizing: "border-box", lineHeight: 1.5, marginBottom: 12 }} />
            <Btn onClick={() => runFeature("ask", askInput)} disabled={!askInput.trim()}>
              <Send size={15} /> Ask Claude
            </Btn>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setActiveFeature(null); setResult(""); setLoading(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMid, display: "flex", padding: 4 }}><ChevronLeft size={20} /></button>
            <h3 style={{ fontFamily: "'Playfair Display', serif", margin: 0, fontSize: 17, fontWeight: 600 }}>
              {features.find(f => f.id === activeFeature)?.label || "Thinking..."}
            </h3>
          </div>
          <Card style={{ textAlign: "center", padding: "40px 20px" }}>
            <Loader2 size={28} style={{ color: C.lav, animation: "hc-spin 1s linear infinite", marginBottom: 12 }} />
            <div style={{ fontSize: 14, color: C.textMid, fontStyle: "italic" }}>
              {activeFeature === "connections" ? "Analyzing your health data for patterns..." :
               activeFeature === "news" ? "Searching for news about your conditions..." :
               activeFeature === "resources" ? "Finding programs and benefits for you..." :
               activeFeature === "ask" ? "Thinking about your question..." :
               "Generating your insight..."}
            </div>
          </Card>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <button onClick={() => { setActiveFeature(null); setResult(""); setAskInput(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMid, display: "flex", padding: 4 }}><ChevronLeft size={20} /></button>
            <h3 style={{ fontFamily: "'Playfair Display', serif", margin: 0, fontSize: 17, fontWeight: 600 }}>
              {features.find(f => f.id === activeFeature)?.label || "Result"}
            </h3>
          </div>
          <Card style={{ background: C.lavPale, border: "1px solid " + C.lavLight }}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{result}</div>
          </Card>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Btn variant="secondary" onClick={() => runFeature(activeFeature, activeFeature === "ask" ? askInput : undefined)} style={{ fontSize: 12, padding: "7px 16px" }}>
              <RefreshCw size={13} /> Regenerate
            </Btn>
            <Btn variant="ghost" onClick={() => { setActiveFeature(null); setResult(""); setAskInput(""); }} style={{ fontSize: 12, padding: "7px 16px" }}>
              Back to features
            </Btn>
          </div>
          <div style={{ textAlign: "center", padding: "16px 0", fontSize: 11, color: C.textFaint, fontStyle: "italic" }}>
            This is informational only and not a substitute for professional medical advice.
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════ */
function SettingsView({ data, update }) {
  const s = data.settings;
  const set = (k,v) => update("settings",{...s,[k]:v});
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);

  return (<div style={{marginTop:8}}>
    <SecTitle>Profile</SecTitle>
    <Card>
      <Field label="Your Name" value={s.name} onChange={v=>set("name",v)} placeholder="How should we greet you?" />
      <Field label="Location" value={s.location} onChange={v=>set("location",v)} placeholder="City, State" />
    </Card>

    <SecTitle>AI Companion</SecTitle>
    <Card>
      <Field label="AI Mode" value={s.aiMode} onChange={v=>set("aiMode",v)} options={[{value:"alwaysOn",label:"\u2728 Always On"},{value:"onDemand",label:"\u263D On Demand"},{value:"off",label:"\u2727 Off — tracker only"}]} />
      <div style={{fontSize:12,color:C.textLight,fontStyle:"italic",lineHeight:1.5,marginTop:4}}>AI features use your health profile for personalized insights.</div>
    </Card>

    <SecTitle>Pharmacy</SecTitle>
    <Card><Field label="Preferred Pharmacy" value={s.pharmacy} onChange={v=>set("pharmacy",v)} placeholder="Name & location" /></Card>

    <SecTitle>Insurance</SecTitle>
    <Card>
      <Field label="Plan" value={s.insurancePlan} onChange={v=>set("insurancePlan",v)} placeholder="e.g. Kaiser HMO" />
      <Field label="Member ID" value={s.insuranceId} onChange={v=>set("insuranceId",v)} placeholder="Member ID" />
      <Field label="Group #" value={s.insuranceGroup} onChange={v=>set("insuranceGroup",v)} placeholder="Group number" />
      <Field label="Member Services" value={s.insurancePhone} onChange={v=>set("insurancePhone",v)} type="tel" placeholder="Phone" />
    </Card>

    <SecTitle>Health Background</SecTitle>
    <Card>
      <div style={{fontSize:12,color:C.textMid,marginBottom:10,lineHeight:1.5,fontStyle:"italic"}}>
        Paste anything Claude knows about your health from conversations. This gets included when AI features analyze your profile.
      </div>
      <Field label="Background & Context" value={s.healthBackground} onChange={v=>set("healthBackground",v)} textarea placeholder="e.g. I've had chronic fatigue since 2019, my pain flares are worst in cold weather..." />
    </Card>

    <SecTitle>Data</SecTitle>
    <Card>
      <div style={{fontSize:13,color:C.textMid,marginBottom:14,lineHeight:1.5}}>All data is stored in persistent storage tied to your Claude account.</div>
      {showEraseConfirm ? (
        <div style={{ background: C.dangerBg, border: "1px solid #E8BFBF", borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, color: C.danger, fontWeight: 500, marginBottom: 10 }}>Permanently erase ALL health data? This cannot be undone.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="danger" onClick={() => {
              Object.values(SK).forEach(k => { try { window.storage.delete(k); } catch {} });
              setShowEraseConfirm(false);
              window.location.reload();
            }} style={{ fontSize: 12 }}><Trash2 size={14}/> Yes, Erase Everything</Btn>
            <Btn variant="ghost" onClick={() => setShowEraseConfirm(false)} style={{ fontSize: 12 }}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <Btn variant="danger" onClick={() => setShowEraseConfirm(true)} style={{fontSize:12}}><Trash2 size={14}/> Erase All Data</Btn>
      )}
    </Card>

    <div style={{textAlign:"center",padding:"32px 0 8px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:6}}>
        <Motif type="sparkle" size={10} color={C.textFaint} /><Motif type="moon" size={14} color={C.lav} /><Motif type="sparkle" size={10} color={C.textFaint} />
      </div>
      <div style={{fontSize:11,color:C.textFaint,fontStyle:"italic",lineHeight:1.5}}>Personal health reference tool<br/>Always consult your healthcare providers</div>
    </div>
  </div>);
}
