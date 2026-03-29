import { supabase } from './supabase';
import { buildFullDataDump } from './profile';

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

  healthSummary:
    'You are a medical records analyst creating a comprehensive health background narrative for a patient\'s personal health app. Given their complete health data across all categories, write a thorough health background that:\n\n1. **Overview**: Summarize the patient\'s overall health picture — key conditions, treatment approach, and care team.\n2. **Conditions & Treatment Plan**: Cross-reference each condition with its linked medications. Identify which meds treat which conditions. Note any conditions that appear untreated or medications without a clear linked condition.\n3. **Medication Analysis**: Summarize the full medication regimen — note polypharmacy considerations, refill timing, and any medications that may interact or have overlapping side effects.\n4. **Surgical History & Planning**: Summarize past procedures and any upcoming surgical plans with their constraints and outstanding items.\n5. **Safety Alerts**: Highlight anesthesia flags, severe allergies, known drug interactions, and any critical safety information that any provider should know immediately.\n6. **Lab Trends**: Summarize recent lab results, note any flagged values, and identify trends (improving, worsening, or stable).\n7. **Care Gaps & Upcoming Needs**: List overdue screenings, outstanding labs, upcoming appointments, and preventive care needs.\n8. **Patterns & Observations**: Analyze vitals trends and journal entries for symptom patterns — correlations between pain/mood/energy/sleep, flare triggers, and quality-of-life trends.\n9. **Insurance & Access**: Note insurance coverage and any active appeals or disputes that affect care access.\n\nBe specific and clinical. Reference actual data values, dates, and names. Write in third person. Keep it structured with clear headers. Aim for 500-800 words. Do NOT include disclaimers — this is stored as a personal health reference, not live medical advice.',
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

export async function generateHealthSummary(data) {
  const fullDump = buildFullDataDump(data);
  const result = await callAPI(
    [{ role: 'user', content: 'Analyze all of my health data and create a comprehensive health background narrative.' }],
    PROMPTS.healthSummary + '\n\n' + fullDump,
    4000
  );
  // Strip the standard disclaimer — this is stored data, not a live response
  return result.replace(/\n\n---\n\*AI suggestions are not medical advice\. Always consult your healthcare providers\.\*$/, '');
}
