import { getAuthToken } from './token';
import { HEALTH_TOOLS } from '../constants/tools';

// ── AI Provider + Model Routing ──

const PROVIDER_KEY = 'salve:ai-provider';

export function getAIProvider() {
  try { return localStorage.getItem(PROVIDER_KEY) || 'gemini'; } catch { return 'gemini'; }
}

export function setAIProvider(provider) {
  localStorage.setItem(PROVIDER_KEY, provider);
}

const LITE_FEATURES = new Set(['insight', 'labInterpret', 'vitalsTrend', 'geneticExplanation', 'crossReactivity']);
const PRO_FEATURES = new Set(['connections', 'careGapDetect', 'journalPatterns', 'cyclePatterns', 'appealDraft', 'costOptimization', 'immunizationSchedule']);
const ADMIN_FEATURES = new Set(['houseConsultation']);
const FREE_BLOCKED_FEATURES = new Set(['connections', 'careGapDetect', 'journalPatterns', 'cyclePatterns', 'appealDraft', 'costOptimization', 'immunizationSchedule', 'resources', 'houseConsultation']);

export function isFeatureLocked(feature) {
  // Demo mode unlocks everything — all AI calls return canned responses
  // anyway, so there's nothing to protect and we want demo users to see
  // the full premium experience.
  if (_demoMode) return false;
  // Admin tier unlocks everything including admin-only features.
  if (_adminActive) return false;
  // Premium tier unlocks Pro features but NOT admin-only features.
  if (_premiumActive) return ADMIN_FEATURES.has(feature);
  return FREE_BLOCKED_FEATURES.has(feature);
}

// Returns true when the user has active premium access — either permanent
// premium/admin (trial_expires_at IS NULL) or a trial that hasn't yet expired.
// `settings` is data.settings from useHealthData (the profile row).
// Respects a localStorage dev override at 'salve:tier-override' ('free', 'premium', or 'admin').
export function isPremiumActive(settings) {
  // Demo mode: honor the demo profile's tier directly (Jordan is premium).
  // Skip the localStorage dev override so leftover testing state doesn't
  // leak into the demo experience.
  if (_demoMode) {
    if (!settings || (settings.tier !== 'premium' && settings.tier !== 'admin')) return false;
    if (settings.trial_expires_at == null) return true;
    const ts = new Date(settings.trial_expires_at).getTime();
    return !isNaN(ts) && ts > Date.now();
  }
  try {
    const override = localStorage.getItem('salve:tier-override');
    if (override === 'free') return false;
    if (override === 'premium' || override === 'admin') return true;
  } catch { /* ignore */ }
  if (!settings || (settings.tier !== 'premium' && settings.tier !== 'admin')) return false;
  if (settings.trial_expires_at == null) return true;
  const ts = new Date(settings.trial_expires_at).getTime();
  return !isNaN(ts) && ts > Date.now();
}

// Returns true when the user has admin tier — unlocks House Consultation
// and all premium features.
export function isAdminActive(settings) {
  if (_demoMode) {
    return settings?.tier === 'admin';
  }
  try {
    const override = localStorage.getItem('salve:tier-override');
    if (override === 'free' || override === 'premium') return false;
    if (override === 'admin') return true;
  } catch { /* ignore */ }
  if (!settings || settings.tier !== 'admin') return false;
  if (settings.trial_expires_at == null) return true;
  const ts = new Date(settings.trial_expires_at).getTime();
  return !isNaN(ts) && ts > Date.now();
}

// Returns number of whole days remaining in the trial, or null if no trial
// (permanent premium or already expired).
export function trialDaysRemaining(settings) {
  if (!settings?.trial_expires_at) return null;
  const expiresTs = new Date(settings.trial_expires_at).getTime();
  if (isNaN(expiresTs)) return null;
  const msLeft = expiresTs - Date.now();
  if (msLeft <= 0) return 0;
  return Math.ceil(msLeft / 86_400_000);
}

function getModel(feature) {
  const provider = getAIProvider();
  const tier = LITE_FEATURES.has(feature) ? 'lite' : PRO_FEATURES.has(feature) ? 'pro' : 'flash';

  if (provider === 'anthropic') {
    const models = { lite: 'claude-haiku-4-5-20251001', flash: 'claude-sonnet-4-6', pro: 'claude-opus-4-6' };
    return { endpoint: '/api/chat', model: models[tier] };
  }
  const models = { lite: 'gemini-2.0-flash-lite', flash: 'gemini-2.5-flash', pro: 'gemini-2.5-pro-preview-06-05' };
  return { endpoint: '/api/gemini', model: models[tier] };
}

// AI system prompts
export const PROMPTS = {
  insight:
    'You are a compassionate, knowledgeable health companion. Given this patient\'s health profile, share ONE interesting, useful, or empowering health insight they might not know. It could be: a lesser-known fact about one of their conditions, a helpful tip about one of their medications, a connection between two of their health issues, a seasonal or lifestyle consideration, or an encouraging piece of recent medical progress. Keep it warm, concise (3-4 sentences), and specific to THEIR profile. Do not repeat generic advice. Start with a relevant emoji.',

  connections:
    'You are an insightful health analyst. Given this patient\'s complete health profile, look for non-obvious connections, patterns, and insights across their medications, conditions, symptoms, and vitals. Consider: medications that might worsen another condition, overlapping side effects, symptom patterns in their journal, vitals trends that correlate with entries, nutritional or lifestyle factors linking conditions, whether their med regimen is internally consistent. Be specific and reference THEIR actual data. Format with clear sections. Be warm but thorough. End with a note that this is not medical advice.',

  news:
    'You are a health news curator. Today\'s date is {DATE}. Search for RECENT medical news, research breakthroughs, clinical trial results, or treatment developments related to the patient\'s specific conditions. CRITICAL: Focus EXCLUSIVELY on developments from the past 6 months. Do NOT include anything older than 6 months. Provide 4-6 items.\n\nDo NOT include any preamble, introduction, or commentary before the first item. Start IMMEDIATELY with the first ## headline.\n\nFor EACH item, format EXACTLY as:\n\n## [Headline]\n\n[3-5 sentence summary: what happened, what the findings/changes are, why it matters specifically for this patient, and what action they could consider]. Source: [publication name](URL to the actual article)\n\n---\n\nFocus on actionable, hopeful, or clinically significant developments. Be specific about dates, study sizes, and what changed. Each story should be substantive enough to be informative on its own.',

  resources:
    `You are a disability resources specialist. Today's date is {DATE}. Search for programs, benefits, discounts, passes, and assistance available for someone with these conditions in their area. Include: government disability programs, national park/recreation access passes, transit discounts, utility assistance, prescription assistance programs, tax deductions, workplace accommodations under ADA, state-specific programs, nonprofit resources, and anything else helpful.

CRITICAL FORMATTING — you MUST use this exact markdown structure:

## Category Name

### Program Name
Brief 1-2 sentence description of eligibility and benefits.
- **Key detail:** specific amount, date, or requirement
- **How to apply:** method or link
- **Website:** [program-name.gov](https://program-name.gov)

### Next Program Name
...

RULES:
- Every category MUST start with ## (h2)
- Every program/resource MUST start with ### (h3)
- Use **bold** for key labels like amounts, dates, eligibility thresholds
- Use bullet points (- ) for details, NOT periods or bare text
- URLs MUST be markdown links: [Display Text](https://url) — NEVER bare URLs
- Keep each program concise: 1-2 sentence summary + 2-4 bullet details
- Do NOT use horizontal rules (---) between programs
- Do NOT put periods at the start of lines`,

  ask:
    'You are a knowledgeable, compassionate health companion. You have access to this patient\'s complete health profile. Answer their question with their specific health context in mind. Be thorough but warm. Reference their specific medications, conditions, and history where relevant. Always note that your response is informational and not a substitute for professional medical advice.',

  labInterpret:
    'You are a knowledgeable health companion helping a patient understand their lab results. Given their health profile and a specific lab result, explain: what the test measures, what their result means in context of their conditions and medications, whether the result is concerning, and what they might discuss with their provider. Be concise (3-5 sentences), warm, and specific to THEIR profile. Do not be alarmist but be honest.',

  vitalsTrend:
    'You are a health data analyst helping a patient understand their vitals trends. Given their health profile and recent vitals readings, analyze: the overall trend direction (improving, worsening, stable), any concerning patterns, how the trends relate to their conditions and medications, and what they might discuss with their provider. Be specific about the numbers. Keep it warm and concise (4-6 sentences). Start with a relevant emoji.',

  appointmentPrep:
    'You are a thoughtful health companion helping a patient prepare for an upcoming medical appointment. Given their health profile and the appointment details (provider, specialty, reason), generate 4-6 specific, personalized questions they should consider asking. Base the questions on: recent vitals/lab changes, active conditions the provider manages, current medications, recent journal entries mentioning relevant symptoms, and any care gaps. Format as a numbered list. After the questions, add 1-2 sentences of preparation tips (e.g., bring med list, fast if labs needed). Be warm and encouraging.',

  careGapDetect:
    'You are a preventive care specialist. Given this patient\'s health profile (age, conditions, medications, procedures, immunizations, and existing care gaps), suggest 3-6 preventive screenings, tests, or follow-ups that may be overdue or recommended. Base suggestions on standard clinical guidelines (USPSTF, CDC, specialty-specific) appropriate for their conditions. For each suggestion, provide: the screening/test name, why it\'s recommended for this patient, suggested urgency, and a brief category. Format as a structured list. Do not repeat items already in their care gaps list. Be specific and reference THEIR conditions.',

  journalPatterns:
    'You are an insightful health pattern analyst. Given this patient\'s health profile and their journal entries, identify recurring patterns: frequent symptoms, mood trends, severity patterns, common triggers, correlations between entries and their conditions/medications. Look for: symptom clusters, day-of-week patterns, severity escalation, mood-symptom connections, and any entries that correlate with medication changes or appointments. Provide 3-5 specific, actionable insights. Be warm, reference their actual entries, and suggest what to discuss with their provider. Start with a relevant emoji.',

  immunizationSchedule:
    'You are an immunization specialist. Given this patient\'s health profile (conditions, allergies, medications) and their immunization records, analyze: which vaccines they have on record, which boosters may be due or overdue based on standard CDC/ACIP schedules, any vaccines that are especially important given their conditions (e.g., pneumococcal for immunocompromised patients), and any contraindications from their allergies. Provide a clear summary with specific recommendations. Format with sections: Up to Date, May Be Due, Important Considerations. Be specific about timing and reference THEIR conditions.',

  appealDraft:
    'You are a patient advocacy specialist helping draft an insurance appeal letter. Given the patient\'s health profile and the appeal details (subject, insurer, denial reason), draft a professional, compelling appeal letter. Include: patient identification (name only), the denied service/medication, medical necessity justification referencing their specific diagnoses and treatment history, relevant clinical guidelines supporting the request, and a clear ask. Use formal but empathetic language. Format as a complete letter with date, addressee, subject line, body paragraphs, and closing. Note that this is a draft to review with their provider.',

  crossReactivity:
    'You are a pharmacology specialist. A patient is adding a new medication and has known allergies. Analyze whether there is cross-reactivity risk between the medication and their allergies. Consider: drug class relationships (e.g., penicillin–cephalosporin), chemical structure similarities, known cross-sensitivity rates, and severity of the documented allergy. Be specific: state the cross-reactivity risk percentage if known, and clearly recommend whether to proceed with caution, avoid, or if the risk is negligible. Be concise (3-4 sentences). Do not be alarmist but prioritize safety.',

  geneticExplanation:
    'You are a genetic counselor explaining pharmacogenomic test results to a patient in plain, friendly language. Given the gene name, variant, phenotype (metabolizer status), and their current medications, explain: (1) What this gene does in 1 simple sentence — avoid jargon, use analogies like "your body processes this drug faster/slower than most people". (2) What their specific result means for them personally — reference their actual medications if any are affected. (3) One clear, actionable takeaway they can discuss with their doctor. Keep it warm, reassuring, and under 150 words. Use "you/your" language. Do NOT use medical jargon without explaining it. Start with a brief reassuring statement. End with a reminder to discuss with their healthcare provider.',

  costOptimization:
    'You are a medication cost specialist. Given this patient\'s health profile with NADAC wholesale drug prices, analyze their medication costs and provide actionable suggestions. Consider: generic alternatives for brand-name drugs, therapeutic substitutes that may be cheaper, patient assistance programs (PAPs) from manufacturers, pharmacy discount cards (GoodRx, RxSaver, Cost Plus Drugs), 90-day supply savings, mail-order pharmacy options, state prescription assistance programs, and manufacturer savings cards/coupons. For each suggestion, be specific: name the program, estimate potential savings, and note any eligibility requirements. Organize by medication. Be warm and practical. End with total potential monthly savings estimate.',

  houseConsultation:
    `You are a brilliant, sharp-witted medical analyst on a differential diagnosis team — think Dr. House's team. You are direct, insightful, and not afraid to challenge assumptions. Given this patient's complete health profile, provide your independent analysis:

1. **Key observations** — What stands out? What patterns do others miss?
2. **Differential considerations** — What could explain the combination of their conditions, symptoms, and medication effects?
3. **Red flags or concerns** — Anything that warrants attention based on drug interactions, condition progression, or gaps in care?
4. **Unconventional connections** — Any non-obvious links between their conditions, meds, vitals, or lifestyle?
5. **Recommendations** — What would you push for if this were your patient?

Be specific. Reference their actual data. Be bold in your analysis but always ground it in evidence. Keep it under 400 words.`,

  houseRebuttal:
    `You are a brilliant medical analyst on a differential diagnosis team — think Dr. House's team. Your colleague just presented their analysis of this patient. You've seen the same health profile. Now:

1. **Where you AGREE** — Which of their points are spot-on?
2. **Where you DISAGREE or see it differently** — Challenge their reasoning. Offer alternative explanations.
3. **What they MISSED** — Important patterns or connections they overlooked.
4. **Your final take** — What's the most important thing this patient should focus on?

Be direct and specific. This is a professional debate, not a polite summary. Reference the patient's actual data. Keep it under 300 words.`,
};

const DISCLAIMER = '\n\n---\n*Sage\'s suggestions are not medical advice. Always consult your healthcare providers.*';

// Canned AI responses for demo mode — keeps "Explore without signing in"
// from burning real tokens on the shared demo profile.
async function demoResponseFor(feature, messages) {
  // Small artificial delay so UI loading states still render naturally
  await new Promise(r => setTimeout(r, 450 + Math.random() * 400));
  const { DEMO_INSIGHTS, DEMO_NEWS, DEMO_APPT_PREP, demoSageReply } =
    await import('../constants/demoResponses');
  switch (feature) {
    case 'insight':
      return DEMO_INSIGHTS[Math.floor(Math.random() * DEMO_INSIGHTS.length)] + DISCLAIMER;
    case 'news':
      return DEMO_NEWS + DISCLAIMER;
    case 'appointmentPrep':
      return DEMO_APPT_PREP + DISCLAIMER;
    case 'chat': {
      const lastUser = [...(messages || [])].reverse().find(m => m?.role === 'user');
      const question = typeof lastUser?.content === 'string'
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? (lastUser.content.find(c => c.type === 'text')?.text || '')
          : '';
      return demoSageReply(question) + DISCLAIMER;
    }
    default:
      return `**Demo preview**

In the full app, I'd analyze your real profile for this feature — ${feature}. Sign up to see Sage work with your own data.

_(No tokens burned on demo responses.)_${DISCLAIMER}`;
  }
}

function extractSources(data) {
  const seen = new Set();
  const sources = [];
  for (const block of data.content || []) {
    // Extract from web_search_tool_result blocks
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) {
        if (r.type === 'web_search_result' && r.url && !seen.has(r.url)) {
          seen.add(r.url);
          sources.push({ url: r.url, title: r.title || new URL(r.url).hostname, page_age: r.page_age || null });
        }
      }
    }
    // Extract from inline citations on text blocks
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.url && !seen.has(c.url)) {
          seen.add(c.url);
          sources.push({ url: c.url, title: c.title || new URL(c.url).hostname });
        }
      }
    }
  }
  return sources;
}

// Demo mode — when true, all AI calls return canned responses instead of
// hitting the real provider. Set via setDemoMode() from App.jsx when the user
// enters the public preview from the Auth screen.
let _demoMode = false;
export function setDemoMode(v) { _demoMode = !!v; }
export function isDemoMode() { return _demoMode; }

// Premium tier flag — mirrored from profile.tier + trial status via App.jsx.
// Pro features unlock for any premium user regardless of which AI provider
// they've chosen, since both Claude Opus and Gemini 2.5 Pro can serve them.
let _premiumActive = false;
export function setPremiumActive(v) { _premiumActive = !!v; }

// Admin tier flag — unlocks House Consultation and all features.
let _adminActive = false;
export function setAdminActive(v) { _adminActive = !!v; }

async function callAPI(messages, system, maxTokens = 2000, useWebSearch = false, feature = 'chat') {
  if (_demoMode) return demoResponseFor(feature, messages);

  const token = await getAuthToken();

  if (!token) {
    throw new Error('You must be signed in to use AI features.');
  }

  // Block premium-only features on free tier (client-side fast-fail)
  if (isFeatureLocked(feature)) {
    throw new Error('Premium feature. Upgrade to Claude for advanced analysis.');
  }

  const { endpoint, model } = getModel(feature);
  const body = { messages, system, max_tokens: maxTokens, model };
  if (useWebSearch) body.use_web_search = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = typeof err.error === 'string' ? err.error : err.error?.message || `API error ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    if (data.content) {
      const text = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n\n');
      if (!text.trim()) throw new Error('AI returned an empty response. Please try again.');
      if (useWebSearch) {
        const sources = extractSources(data);
        return { text: text + DISCLAIMER, sources };
      }
      return text + DISCLAIMER;
    }
    if (data.error) throw new Error(data.error.message || 'AI service error');
    throw new Error('Unexpected API response');
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out. Try again.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchInsight(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Based on my health profile, give me today\'s insight.' }],
    PROMPTS.insight + '\n\n' + profileText,
    2000, false, 'insight'
  );
}

export async function fetchConnections(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Analyze my health profile for connections and patterns.' }],
    PROMPTS.connections + '\n\n' + profileText,
    2000, false, 'connections'
  );
}

export async function fetchNews(profileText) {
  const today = new Date().toISOString().split('T')[0];
  const isFree = getAIProvider() !== 'anthropic';
  const countInstruction = isFree ? '\n\nIMPORTANT: Provide exactly 3 items. Be concise.' : '';
  return callAPI(
    [{ role: 'user', content: `Find the most recent health news relevant to my conditions. Today is ${today}. Only include news from the past 6 months.` }],
    PROMPTS.news.replace('{DATE}', today) + countInstruction + '\n\n' + profileText,
    isFree ? 2000 : 3000, true, 'news'
  );
}

export async function fetchResources(profileText) {
  const today = new Date().toISOString().split('T')[0];
  return callAPI(
    [{ role: 'user', content: `Find disability resources and assistance programs for me. Today is ${today}.` }],
    PROMPTS.resources.replace('{DATE}', today) + '\n\n' + profileText,
    3000, true, 'resources'
  );
}

export async function sendChat(messages, profileText) {
  return callAPI(
    messages,
    PROMPTS.ask + '\n\n' + profileText,
    2000, false, 'chat'
  );
}

export async function fetchLabInterpretation(lab, profileText) {
  const labDesc = `Test: ${lab.test_name}, Result: ${lab.result}${lab.unit ? ' ' + lab.unit : ''}${lab.range ? ', Ref range: ' + lab.range : ''}, Flag: ${lab.flag || 'none'}${lab.date ? ', Date: ' + lab.date : ''}`;
  return callAPI(
    [{ role: 'user', content: `Explain this lab result in context of my health: ${labDesc}` }],
    PROMPTS.labInterpret + '\n\n' + profileText,
    1000, false, 'labInterpret'
  );
}

export async function fetchVitalsTrend(vitalsData, profileText) {
  const desc = vitalsData.map(v => `${v.type}: ${v.type === 'bp' ? `${v.value}/${v.value2}` : v.value} ${v.unit || ''} on ${v.date}${v.notes ? ' (' + v.notes + ')' : ''}`).join('\n');
  return callAPI(
    [{ role: 'user', content: `Analyze these vitals trends:\n${desc}` }],
    PROMPTS.vitalsTrend + '\n\n' + profileText,
    1200, false, 'vitalsTrend'
  );
}

export async function fetchAppointmentPrep(appointment, profileText) {
  const desc = `Appointment: ${appointment.reason || 'General visit'} with ${appointment.provider || 'provider'} on ${appointment.date}${appointment.location ? ' at ' + appointment.location : ''}${appointment.questions ? '. Existing questions: ' + appointment.questions : ''}`;
  return callAPI(
    [{ role: 'user', content: `Help me prepare for this appointment: ${desc}` }],
    PROMPTS.appointmentPrep + '\n\n' + profileText,
    1200, false, 'appointmentPrep'
  );
}

export async function fetchCareGapSuggestions(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Based on my health profile, what preventive screenings or follow-ups might I be missing?' }],
    PROMPTS.careGapDetect + '\n\n' + profileText,
    1500, false, 'careGapDetect'
  );
}

export async function fetchJournalPatterns(entries, profileText) {
  const desc = entries.map(e => `${e.date}${e.mood ? ' [' + e.mood + ']' : ''}${e.severity ? ' [' + e.severity + '/10]' : ''}: ${e.content || e.title || ''}${e.tags ? ' (tags: ' + e.tags + ')' : ''}`).join('\n');
  return callAPI(
    [{ role: 'user', content: `Analyze patterns in my journal entries:\n${desc}` }],
    PROMPTS.journalPatterns + '\n\n' + profileText,
    1500, false, 'journalPatterns'
  );
}

export async function fetchImmunizationReview(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Review my immunization records and tell me if any vaccines are due or recommended for my conditions.' }],
    PROMPTS.immunizationSchedule + '\n\n' + profileText,
    1500, false, 'immunizationSchedule'
  );
}

export async function fetchAppealDraft(appeal, profileText) {
  const desc = `Appeal subject: ${appeal.subject}${appeal.against ? ', Against: ' + appeal.against : ''}${appeal.status ? ', Status: ' + appeal.status : ''}${appeal.notes ? ', Details: ' + appeal.notes : ''}`;
  return callAPI(
    [{ role: 'user', content: `Draft an appeal letter for: ${desc}` }],
    PROMPTS.appealDraft + '\n\n' + profileText,
    2000, false, 'appealDraft'
  );
}

export async function fetchCostOptimization(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Analyze my medication costs and suggest ways to save money. Include generic alternatives, patient assistance programs, and discount options.' }],
    PROMPTS.costOptimization + '\n\n' + profileText,
    2000, true, 'costOptimization'
  );
}

/* ── House Consultation: dual-provider debate ──────────── */

// Call a specific provider endpoint directly, bypassing getModel routing
async function callProvider(endpoint, model, messages, system, maxTokens = 2000) {
  const token = await getAuthToken();
  if (!token) throw new Error('You must be signed in.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, system, max_tokens: maxTokens, model }),
      signal: controller.signal,
    });
    if (res.status === 429) throw new Error('Rate limited. Please wait a moment.');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.error === 'string' ? err.error : err.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n\n');
    if (!text.trim()) throw new Error('Empty response');
    return text;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHouseConsultation(profileText) {
  if (_demoMode) return demoResponseFor('houseConsultation');

  if (!_adminActive) throw new Error('Admin feature. House Consultation requires admin tier.');

  const userMsg = [{ role: 'user', content: 'Analyze my complete health profile. Give me your honest, thorough differential analysis.' }];

  // Round 1: Both AIs analyze independently, in parallel
  const [claudeR1, geminiR1] = await Promise.all([
    callProvider('/api/chat', 'claude-opus-4-6', userMsg, PROMPTS.houseConsultation + '\n\nYou are "Claude" on this team.\n\n' + profileText, 2000),
    callProvider('/api/gemini', 'gemini-2.5-pro-preview-06-05', userMsg, PROMPTS.houseConsultation + '\n\nYou are "Gemini" on this team.\n\n' + profileText, 2000),
  ]);

  // Round 2: Each sees the other's analysis and responds
  const claudeRebuttalMsg = [{ role: 'user', content: `Your colleague Gemini's analysis:\n\n${geminiR1}\n\nNow give your rebuttal and final take.` }];
  const geminiRebuttalMsg = [{ role: 'user', content: `Your colleague Claude's analysis:\n\n${claudeR1}\n\nNow give your rebuttal and final take.` }];

  const [claudeR2, geminiR2] = await Promise.all([
    callProvider('/api/chat', 'claude-opus-4-6', claudeRebuttalMsg, PROMPTS.houseRebuttal + '\n\nYou are "Claude." Your colleague is "Gemini."\n\n' + profileText, 1500),
    callProvider('/api/gemini', 'gemini-2.5-pro-preview-06-05', geminiRebuttalMsg, PROMPTS.houseRebuttal + '\n\nYou are "Gemini." Your colleague is "Claude."\n\n' + profileText, 1500),
  ]);

  return {
    rounds: [
      { claude: claudeR1, gemini: geminiR1 },
      { claude: claudeR2, gemini: geminiR2 },
    ],
  };
}

export async function fetchCrossReactivity(medName, allergies, profileText) {
  const allergyDesc = allergies.map(a => `${a.substance} (${a.severity}${a.reaction ? ', reaction: ' + a.reaction : ''})`).join(', ');
  return callAPI(
    [{ role: 'user', content: `I'm adding the medication "${medName}". My allergies: ${allergyDesc}. Is there a cross-reactivity risk?` }],
    PROMPTS.crossReactivity + '\n\n' + profileText,
    800, false, 'crossReactivity'
  );
}

export async function fetchCyclePatterns(cycleProfileText) {
  return callAPI(
    [{ role: 'user', content: 'Analyze my cycle-correlated health patterns from the data below.' }],
    `You are a health data analyst examining cycle-correlated patterns. Analyze the provided vitals and journal data tagged by menstrual cycle phase.

Your analysis should cover:
1. Phase-correlated symptom patterns — cite specific averages (e.g., "Pain averages 6.2 during luteal vs 2.1 during follicular")
2. Mood and energy trends by phase
3. Medication timing insights if hormonal or cycle-related medications are detected
4. Data gaps — suggest specific tracking improvements
5. Actionable recommendations

Use markdown formatting. Be specific with numbers. If data is insufficient for a category, say so briefly and move on.

IMPORTANT: You are not a doctor. Include the disclaimer: "This analysis is based on self-reported data patterns. Always discuss cycle-related health concerns with your healthcare provider."

Patient cycle data:
${cycleProfileText}`,
    2000, false, 'cyclePatterns'
  );
}

export async function fetchGeneticExplanation(gene, variant, phenotype, affectedDrugs, currentMedNames) {
  const medContext = currentMedNames.length > 0
    ? `The patient currently takes: ${currentMedNames.join(', ')}. Some of these may be affected.`
    : 'The patient has no current medications that match the affected drug list.';
  const drugList = affectedDrugs.length > 0 ? `Affected drugs for this gene/phenotype: ${affectedDrugs.join(', ')}.` : '';

  return callAPI(
    [{ role: 'user', content: `Explain my ${gene} result: variant ${variant || 'unknown'}, phenotype: ${phenotype}. ${drugList} ${medContext}` }],
    PROMPTS.geneticExplanation,
    800, false, 'geneticExplanation'
  );
}

/* ── Tool-use agentic loop ──────────────────────────────── */

const TOOLS_ADDENDUM = `

You also have tools to modify the user's health data directly. When they ask to add, update, or remove records, use the appropriate tool.

RULES FOR TOOL USE:
- For REMOVE (delete) operations: ALWAYS describe what will be deleted and ask "Should I proceed?" BEFORE calling the remove tool. Only call the tool AFTER the user says yes.
- For ADD operations: You may call the tool directly if the user's intent is clear. Summarize what you added.
- For UPDATE operations: Describe the change, then call the tool.
- Use search_records or list_records to find record IDs when needed. NEVER fabricate IDs — always look them up first.
- When the user references a record by description (e.g. "my blood pressure medication"), use search_records to find the exact record before modifying it.
- Before adding a record, check the profile to avoid creating duplicates.
- You can chain multiple tool calls in one response if the user requests multiple changes.`;

async function callAPIWithTools(messages, system, tools, onToolCall, maxTokens = 2000, maxLoops = 10) {
  if (_demoMode) {
    const text = await demoResponseFor('chat', messages);
    return { text, messages };
  }
  const token = await getAuthToken();
  if (!token) throw new Error('You must be signed in to use AI features.');

  const { endpoint, model } = getModel('chat');
  let currentMessages = [...messages];
  let loopCount = 0;
  let finalText = '';

  while (loopCount < maxLoops) {
    loopCount++;

    const body = {
      messages: currentMessages,
      system,
      max_tokens: maxTokens,
      tools,
      model,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let data;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429) throw new Error('Too many requests. Please wait a moment and try again.');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err.error === 'string' ? err.error : err.error?.message || `API error ${res.status}`;
        throw new Error(msg);
      }
      data = await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timed out. Try again.');
      throw e;
    } finally {
      clearTimeout(timeout);
    }

    if (data.error) throw new Error(data.error.message || 'AI service error');
    if (!data.content) throw new Error('Unexpected API response');

    // Extract text and tool_use blocks
    const textBlocks = data.content.filter(b => b.type === 'text');
    const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
    const textPart = textBlocks.map(b => b.text).join('\n\n');

    if (textPart) finalText += (finalText ? '\n\n' : '') + textPart;

    // If no tool calls or stop_reason is end_turn, we're done
    if (data.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      break;
    }

    // Execute tool calls via callback
    const toolResults = await onToolCall(toolUseBlocks);

    // Build the conversation continuation
    // Append the full assistant message (with tool_use blocks)
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: data.content },
      {
        role: 'user',
        content: toolResults.map(r => ({
          type: 'tool_result',
          tool_use_id: r.tool_use_id,
          content: typeof r.content === 'string' ? r.content : JSON.stringify(r.content),
          ...(r.is_error && { is_error: true }),
        })),
      },
    ];
  }

  if (loopCount >= maxLoops && !finalText) {
    finalText = 'I reached the maximum number of actions for this turn. Please continue with a follow-up message.';
  }

  if (!finalText.trim()) throw new Error('AI returned an empty response. Please try again.');

  return {
    text: finalText + DISCLAIMER,
    messages: currentMessages,
  };
}

export async function sendChatWithTools(messages, profileText, onToolCall) {
  return callAPIWithTools(
    messages,
    PROMPTS.ask + TOOLS_ADDENDUM + '\n\n' + profileText,
    HEALTH_TOOLS,
    onToolCall,
    2000,
  );
}
