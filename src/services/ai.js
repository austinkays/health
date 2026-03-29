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

  labInterpret:
    'You are a knowledgeable health companion helping a patient understand their lab results. Given their health profile and a specific lab result, explain: what the test measures, what their result means in context of their conditions and medications, whether the result is concerning, and what they might discuss with their provider. Be concise (3-5 sentences), warm, and specific to THEIR profile. Do not be alarmist but be honest.',
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

export async function fetchLabInterpretation(lab, profileText) {
  const labDesc = `Test: ${lab.test_name}, Result: ${lab.result}${lab.unit ? ' ' + lab.unit : ''}${lab.range ? ', Ref range: ' + lab.range : ''}, Flag: ${lab.flag || 'none'}${lab.date ? ', Date: ' + lab.date : ''}`;
  return callAPI(
    [{ role: 'user', content: `Explain this lab result in context of my health: ${labDesc}` }],
    PROMPTS.labInterpret + '\n\n' + profileText,
    1000
  );
}
