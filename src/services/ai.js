import { supabase } from './supabase';

// AI system prompts
export const PROMPTS = {
  insight:
    'You are a compassionate, knowledgeable health companion. Given this patient\'s health profile, share ONE interesting, useful, or empowering health insight they might not know. It could be: a lesser-known fact about one of their conditions, a helpful tip about one of their medications, a connection between two of their health issues, a seasonal or lifestyle consideration, or an encouraging piece of recent medical progress. Keep it warm, concise (3-4 sentences), and specific to THEIR profile. Do not repeat generic advice. Start with a relevant emoji.',

  connections:
    'You are an insightful health analyst. Given this patient\'s complete health profile, look for non-obvious connections, patterns, and insights across their medications, conditions, symptoms, and vitals. Consider: medications that might worsen another condition, overlapping side effects, symptom patterns in their journal, vitals trends that correlate with entries, nutritional or lifestyle factors linking conditions, whether their med regimen is internally consistent. Be specific and reference THEIR actual data. Format with clear sections. Be warm but thorough. End with a note that this is not medical advice.',

  news:
    'You are a health news curator. Search for recent medical news, research breakthroughs, or treatment developments related to the patient\'s specific conditions. Provide 3-5 recent items with brief summaries. Focus on actionable or hopeful developments. Be specific about what\'s new. Format clearly with headlines and 1-2 sentence summaries each.',

  resources:
    'You are a disability resources specialist. Search for programs, benefits, discounts, passes, and assistance available for someone with these conditions in their area. Include: government disability programs, national park/recreation access passes, transit discounts, utility assistance, prescription assistance programs, tax deductions, workplace accommodations under ADA, state-specific programs, nonprofit resources, and anything else helpful. Be specific with program names, eligibility, and how to apply. Format clearly.',

  ask:
    'You are a knowledgeable, compassionate health companion. You have access to this patient\'s complete health profile. Answer their question with their specific health context in mind. Be thorough but warm. Reference their specific medications, conditions, and history where relevant. Always note that your response is informational and not a substitute for professional medical advice.',

  safety:
    `You are an expert clinical pharmacist and patient safety analyst. Given this patient's complete health profile, perform a comprehensive safety analysis. Check for ALL of the following:

1. DRUG-DRUG INTERACTIONS — any medication pair that may interact (pharmacokinetic or pharmacodynamic). Go beyond common interactions; consider enzyme inhibition/induction (CYP450), protein binding displacement, additive side effects, and QT prolongation combinations.
2. DRUG-CONDITION CONTRAINDICATIONS — medications that may worsen an existing condition (e.g., NSAIDs with kidney disease, decongestants with hypertension, anticholinergics with glaucoma).
3. DRUG-ALLERGY CROSS-REACTIVITY — check if any medication shares a chemical class or cross-reacts with a documented allergy (e.g., sulfa allergy and sulfasalazine, penicillin allergy and cephalosporins).
4. DUPLICATE THERAPIES — two or more medications from the same pharmacological class that may be redundant or increase side effect risk.
5. MISSING STANDARD-OF-CARE MEDICATIONS — medications commonly co-prescribed for safety with an existing medication or condition that are absent (e.g., folic acid with methotrexate, PPI with chronic NSAID + steroid, calcium/vitamin D with long-term steroids).
6. DOSAGE CONCERNS — any dose that appears unusually high or low for the indication based on standard prescribing references.
7. VITALS CORRELATIONS — if vitals data is present, identify trends that may correlate with medication effects (e.g., rising blood pressure after starting a new medication, declining heart rate with beta-blocker).
8. CARE GAPS — preventive care, monitoring, or follow-up that should be happening given their conditions and medications but isn't documented (e.g., regular blood work for immunosuppressants, eye exams for hydroxychloroquine, bone density screening with long-term steroids).

IMPORTANT: The patient's profile includes a section called "ALREADY DETECTED (static database)" listing interactions already flagged by the app's built-in checker. Do NOT repeat those. Focus on findings the static database missed.

Return ONLY a valid JSON array of findings. No markdown, no explanation, no code fences. Each finding must be an object with exactly these fields:
- "category": one of "drug-drug", "drug-condition", "drug-allergy", "duplicate-therapy", "missing-med", "dosage", "vitals-correlation", "care-gap"
- "severity": one of "danger", "caution", "info"
- "title": a short descriptive title (under 60 chars)
- "detail": 1-3 sentences explaining the concern and what to discuss with their provider
- "involved": array of medication/condition/allergy names involved

If you find no concerns, return an empty array: []

Use "danger" for potentially life-threatening or serious harm risks. Use "caution" for clinically significant concerns that warrant discussion. Use "info" for optimization opportunities and helpful awareness.`,
};

const DISCLAIMER = '\n\n---\n*AI suggestions are not medical advice. Always consult your healthcare providers.*';

async function callAPI(messages, system, maxTokens = 2000, useWebSearch = false) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('You must be signed in to use AI features.');
  }

  const body = { messages, system, max_tokens: maxTokens };
  if (useWebSearch) body.use_web_search = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }

    const data = await res.json();
    if (data.content) {
      const text = data.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n\n');
      return text + DISCLAIMER;
    }
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
    PROMPTS.insight + '\n\n' + profileText
  );
}

export async function fetchConnections(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Analyze my health profile for connections and patterns.' }],
    PROMPTS.connections + '\n\n' + profileText
  );
}

export async function fetchNews(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Find recent health news relevant to my conditions.' }],
    PROMPTS.news + '\n\n' + profileText,
    2000,
    true
  );
}

export async function fetchResources(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Find disability resources and assistance programs for me.' }],
    PROMPTS.resources + '\n\n' + profileText,
    2000,
    true
  );
}

export async function sendChat(messages, profileText) {
  return callAPI(
    messages,
    PROMPTS.ask + '\n\n' + profileText
  );
}

export async function fetchSafetyCheck(profileText) {
  const raw = await callAPI(
    [{ role: 'user', content: 'Run a comprehensive safety analysis on my health profile. Return ONLY the JSON array of findings.' }],
    PROMPTS.safety + '\n\n' + profileText,
    3000
  );

  // Strip the disclaimer appended by callAPI
  const cleaned = raw.replace(/\n\n---\n\*AI suggestions are not medical advice\..*\*$/s, '').trim();

  // Extract JSON array — handle possible code fences or preamble
  let jsonStr = cleaned;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const bracketStart = cleaned.indexOf('[');
    const bracketEnd = cleaned.lastIndexOf(']');
    if (bracketStart !== -1 && bracketEnd > bracketStart) {
      jsonStr = cleaned.slice(bracketStart, bracketEnd + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    // Validate each finding has required fields
    return parsed.filter(f =>
      f.category && f.severity && f.title && f.detail && Array.isArray(f.involved)
    );
  } catch {
    return [];
  }
}
