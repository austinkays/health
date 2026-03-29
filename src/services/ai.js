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

export async function fetchVitalsTrend(vitalsData, profileText) {
  const desc = vitalsData.map(v => `${v.type}: ${v.type === 'bp' ? `${v.value}/${v.value2}` : v.value} ${v.unit || ''} on ${v.date}${v.notes ? ' (' + v.notes + ')' : ''}`).join('\n');
  return callAPI(
    [{ role: 'user', content: `Analyze these vitals trends:\n${desc}` }],
    PROMPTS.vitalsTrend + '\n\n' + profileText,
    1200
  );
}

export async function fetchAppointmentPrep(appointment, profileText) {
  const desc = `Appointment: ${appointment.reason || 'General visit'} with ${appointment.provider || 'provider'} on ${appointment.date}${appointment.location ? ' at ' + appointment.location : ''}${appointment.questions ? '. Existing questions: ' + appointment.questions : ''}`;
  return callAPI(
    [{ role: 'user', content: `Help me prepare for this appointment: ${desc}` }],
    PROMPTS.appointmentPrep + '\n\n' + profileText,
    1200
  );
}

export async function fetchCareGapSuggestions(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Based on my health profile, what preventive screenings or follow-ups might I be missing?' }],
    PROMPTS.careGapDetect + '\n\n' + profileText,
    1500
  );
}

export async function fetchJournalPatterns(entries, profileText) {
  const desc = entries.map(e => `${e.date}${e.mood ? ' [' + e.mood + ']' : ''}${e.severity ? ' [' + e.severity + '/10]' : ''}: ${e.content || e.title || ''}${e.tags ? ' (tags: ' + e.tags + ')' : ''}`).join('\n');
  return callAPI(
    [{ role: 'user', content: `Analyze patterns in my journal entries:\n${desc}` }],
    PROMPTS.journalPatterns + '\n\n' + profileText,
    1500
  );
}

export async function fetchImmunizationReview(profileText) {
  return callAPI(
    [{ role: 'user', content: 'Review my immunization records and tell me if any vaccines are due or recommended for my conditions.' }],
    PROMPTS.immunizationSchedule + '\n\n' + profileText,
    1500
  );
}

export async function fetchAppealDraft(appeal, profileText) {
  const desc = `Appeal subject: ${appeal.subject}${appeal.against ? ', Against: ' + appeal.against : ''}${appeal.status ? ', Status: ' + appeal.status : ''}${appeal.notes ? ', Details: ' + appeal.notes : ''}`;
  return callAPI(
    [{ role: 'user', content: `Draft an appeal letter for: ${desc}` }],
    PROMPTS.appealDraft + '\n\n' + profileText,
    2000
  );
}

export async function fetchCrossReactivity(medName, allergies, profileText) {
  const allergyDesc = allergies.map(a => `${a.substance} (${a.severity}${a.reaction ? ', reaction: ' + a.reaction : ''})`).join(', ');
  return callAPI(
    [{ role: 'user', content: `I'm adding the medication "${medName}". My allergies: ${allergyDesc}. Is there a cross-reactivity risk?` }],
    PROMPTS.crossReactivity + '\n\n' + profileText,
    800
  );
}
