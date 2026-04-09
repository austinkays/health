// src/constants/demoResponses.js
// Canned AI responses for demo mode. These simulate what Sage would return
// for Jordan's demo profile, so demo users can see what AI features look like
// without burning tokens. Matches the tone + length of real Sage responses.

// ── Dashboard insight (one-shot health tip) ──────────────────────────
// These are realistic for someone with ADHD + IBS who tracks sleep/mood/HR.
export const DEMO_INSIGHTS = [
  '💡 Your sleep is averaging 6.8 hrs the last two weeks, about 45 min below what your journal entries suggest helps your Adderall work best. Protecting sleep is the highest-leverage thing for ADHD meds.',
  '🌱 Interesting pattern: your two lowest mood scores (5/10) both fell on days you flagged IBS symptoms in your journal. Stress → GI → mood is a well-documented loop worth mentioning to Dr. Chen.',
  '✨ Your vitamin D was 28 ng/mL at your last check (below the 30 threshold). Since you started supplementation, keep an eye on energy scores over the next 8 weeks, deficient-to-replete often shows up there first.',
  '☀️ Heart rate averaging 64 resting over the last two weeks, that\'s a healthy zone. Your run 3 days ago kept HR average at 148, which is reasonable aerobic effort for your profile.',
];

// ── Sage chat responses (keyword-matched canned replies) ─────────────
// Returns realistic responses when demo user types a question. Falls through
// to a generic "this is a demo" message for anything unmatched.
const SAGE_KEYWORDS = [
  {
    match: /adderall|adhd|focus|attention/i,
    reply: `Based on Jordan's profile, a few things stand out:

**Sleep matters a lot for you.** Your journal entries link better sleep to cleaner Adderall days, the 8-hour night before your "good focus day" is a clear data point. Protecting sleep tends to have a bigger effect on ADHD meds than most people realize.

**Watch the 2pm crash.** You mentioned meds wearing off early when lunch is late. Timing food around the stimulant's absorption curve can help, a protein-forward lunch at a consistent time often extends the afternoon window.

**Dr. Patel is a good person to raise this with** at your physical in 12 days. Options like splitting the dose or adding a short-acting IR in the afternoon are common adjustments.

*(Demo response, not medical advice. Always discuss with your provider.)*`,
  },
  {
    match: /ibs|stomach|gut|digest|flare|bloat/i,
    reply: `Jordan, your IBS pattern has a few threads worth pulling on:

**Stress → flare link is visible in your data.** Your recent flare followed a high-stress day, you noted it yourself. The gut-brain axis is real, and your therapist has flagged perfectionism as a trigger. That's useful context.

**Dairy / pizza showed up as a trigger.** Dr. Chen's gluten-free trial recommendation is worth the 4 weeks; low-FODMAP has already helped you. Between the two, you'll narrow it down.

**Dicyclomine as-needed is working**, you're not over-relying on it, which is the goal.

*(Demo response, not medical advice. Always discuss with your provider.)*`,
  },
  {
    match: /sleep|insomnia|tired|fatigue/i,
    reply: `Your sleep data tells a story:

**Range: 5.5 to 8.5 hours** over the last two weeks, averaging 6.8. The variability is likely hurting you more than the average, consistent sleep timing matters as much as total hours for ADHD brains.

**Magnesium is helping.** You noted it helps you fall asleep, and you've been on it consistently.

**Try a 10pm phone cutoff** for a week and see if that nudges the average up. Your two best-mood days both followed 8+ hour nights.

*(Demo response, not medical advice.)*`,
  },
  {
    match: /allergy|allergies|pollen|zyrtec|cetirizine/i,
    reply: `Your seasonal allergies are currently managed with daily Zyrtec, which is working, you noted in your journal that things are calming down.

**Worth flagging:** You've got penicillin (rash) and shellfish (severe, hives + throat tightness) on your allergy list. Make sure that shellfish reaction is in your ER-visible medical records. Carrying antihistamines is smart; if you've never been prescribed an EpiPen for the shellfish reaction, it might be worth asking Dr. Patel.

*(Demo response, not medical advice.)*`,
  },
  {
    match: /therapy|anxiety|stress|mood|sarah/i,
    reply: `You're in a good spot with therapy. Weekly sessions with Sarah are clearly doing work, the insight connecting perfectionism to IBS flares is exactly the kind of pattern-recognition therapy is for.

**Your mood scores track with two things in your data:** sleep quantity and GI symptoms. Both are somewhat within your control, which is empowering.

**On the upcoming physical:** If you're considering asking about increasing to twice-weekly therapy, a note from Sarah about clinical benefit can help if insurance pushes back.

*(Demo response, not medical advice.)*`,
  },
  {
    match: /medication|refill|prescription|interact/i,
    reply: `Your active medication list:

• **Adderall XR 20mg**, ADHD, refill due in ~5 days
• **Dicyclomine 10mg**, IBS as-needed
• **Cetirizine 10mg**, allergies, daily
• **Magnesium 400mg**, sleep/cramps
• **Vitamin D3 2000 IU**, low-D correction

**No concerning interactions** between these. Stimulants + magnesium at night is actually a common pairing since magnesium helps counter the wind-down difficulty.

**Action item:** Your Adderall refill is coming up, might be worth calling Walgreens now rather than waiting.

*(Demo response, not medical advice.)*`,
  },
];

export function demoSageReply(userMessage) {
  const matched = SAGE_KEYWORDS.find(k => k.match.test(userMessage));
  if (matched) return matched.reply;
  return `Great question. In the full app, I'd search through Jordan's conditions, medications, vitals, journal entries, and recent appointments to give you a specific, personalized answer, with exact numbers, trend context, and action items.

**This is a demo preview.** Sign up to ask questions about your own health profile, I'll have the same level of context when it's you asking.

A few things I could dig into for Jordan specifically:

- Sleep patterns and ADHD medication effectiveness
- IBS flare triggers (stress, food timing)
- Vitamin D trajectory since starting supplementation
- Connections between mood, energy, and GI symptoms

*(Demo response, not medical advice.)*`;
}

// ── Saved news stories (for the AI News feature preview) ─────────────
export const DEMO_NEWS = `**ADHD medication shortage easing in most states**
The Adderall shortage that started in late 2022 has improved meaningfully in 2024-2025, with most major pharmacy chains reporting stable stock. If you've struggled with refills recently, it's worth a direct call to your pharmacy to confirm availability before your refill date. Some patients are having success with extended-release brand variants when generic XR isn't available. [Source: FDA Drug Shortages Database]

**Low-FODMAP diet shows sustained benefit for IBS-D at 12-month follow-up**
A 2024 study in *Gastroenterology* followed IBS-D patients through a structured low-FODMAP elimination + reintroduction protocol and found that symptom improvement held at 12 months when done with dietitian support, versus rebound in self-guided groups. Dr. Chen's recommendation to try targeted eliminations is aligned with current evidence. [Source: Gastroenterology, vol 166]

**Vitamin D replacement timelines: what to expect**
Recent review data suggests that vitamin D levels typically rise ~10 ng/mL per 1000 IU of daily supplementation after 8-12 weeks. Jordan's profile (starting at 28, on 2000 IU) would be expected to be in the 45-50 range by next testing. Labs 8-12 weeks post-start are most informative. [Source: Endocrine Society 2024 guidelines]

*Sources shown for transparency. Always confirm with your healthcare provider.*`;

// ── Appointment prep (for the upcoming annual physical) ──────────────
export const DEMO_APPT_PREP = `Here are targeted questions for your annual physical with Dr. Patel in 12 days, based on what I see in your profile:

**ADHD medication**
- "My Adderall XR feels like it wears off around 2pm, would a short-acting IR bump or splitting the dose make sense?"
- "My sleep averages 6.8 hours, is that hurting the medication? Should I push for 7.5+ before adjusting dose?"

**Vitamin D follow-up**
- "Can we recheck my vitamin D level? Started 2000 IU 55 days ago when it was 28 ng/mL."

**Therapy access**
- "I'd like to increase to twice-weekly therapy. Can you write a note of medical necessity if insurance pushes back?"

**Shellfish allergy**
- "My shellfish reaction includes throat tightness. Should I have an EpiPen on hand?"

**Preventive care check-in**
- "Am I due for anything, bloodwork, screenings, eye exam? Haven't done a full physical in ~2 years."

*(Demo preview, Sage generates this from your actual profile when you sign up.)*`;
