// Understood.org curated resource library
// Source: https://www.understood.org (accessed April 2026)
// Understood is a nonprofit focused on learning and thinking differences
// including ADHD, dyslexia, dyscalculia, dysgraphia, executive function,
// auditory processing, anxiety, and more.

const UNDERSTOOD_ARTICLES = [

  // ── ADHD ───────────────────────────────────────────────────────────────

  {
    id: 'uo-what-is-adhd',
    title: 'What Is ADHD?',
    url: 'https://www.understood.org/en/articles/what-is-adhd',
    source: 'Understood.org',
    blurb:
      'A comprehensive overview of ADHD: what it is, common signs and symptoms, how it\'s diagnosed, and treatment options for kids and adults.',
    conditions: ['adhd', 'attention deficit hyperactivity disorder'],
    symptomTags: ['focus', 'attention', 'hyperactivity', 'impulsivity', 'distraction'],
    audience: 'both',
  },
  {
    id: 'uo-adhd-women',
    title: 'ADHD in Women',
    url: 'https://www.understood.org/en/topics/adhd-women',
    source: 'Understood.org',
    blurb:
      'Many women are diagnosed with ADHD late, missing out on years of treatment and support. Learn about ADHD and executive function challenges in women.',
    conditions: ['adhd', 'attention deficit hyperactivity disorder'],
    symptomTags: ['focus', 'attention', 'executive function', 'mood'],
    audience: 'self',
  },
  {
    id: 'uo-adhd-medication',
    title: 'ADHD Medication: What You Need to Know',
    url: 'https://www.understood.org/en/articles/adhd-medication',
    source: 'Understood.org',
    blurb:
      'An overview of stimulant and non-stimulant ADHD medications, how they work, common side effects, and what to discuss with your doctor.',
    conditions: ['adhd', 'attention deficit hyperactivity disorder'],
    symptomTags: ['focus', 'attention', 'medication'],
    audience: 'both',
  },
  {
    id: 'uo-adhd-vs-autism',
    title: 'The Difference Between ADHD and Autism',
    url: 'https://www.understood.org/en/articles/the-difference-between-adhd-and-autism',
    source: 'Understood.org',
    blurb:
      'ADHD and autism can look similar and can co-occur. Learn the key differences in symptoms, diagnosis, and treatment to help distinguish between the two.',
    conditions: ['adhd', 'autism', 'autism spectrum disorder'],
    symptomTags: ['attention', 'social skills', 'behavior', 'focus'],
    audience: 'both',
  },

  // ── DYSLEXIA ───────────────────────────────────────────────────────────

  {
    id: 'uo-what-is-dyslexia',
    title: 'What Is Dyslexia?',
    url: 'https://www.understood.org/en/articles/what-is-dyslexia',
    source: 'Understood.org',
    blurb:
      'Dyslexia is a lifelong language processing disorder affecting reading, spelling, and writing. Learn about causes, symptoms in kids and adults, diagnosis, and treatment.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'spelling', 'writing', 'language'],
    audience: 'both',
  },
  {
    id: 'uo-dyslexia-myths',
    title: '7 Common Myths About Dyslexia',
    url: 'https://www.understood.org/en/articles/common-myths-about-dyslexia-reading-issues',
    source: 'Understood.org',
    blurb:
      'Debunks widespread misconceptions about dyslexia — including that it\'s a vision problem, that kids will outgrow it, or that letter reversal is the main sign.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'spelling'],
    audience: 'both',
  },
  {
    id: 'uo-dyslexia-signs-by-age',
    title: 'Signs of Dyslexia at Different Ages',
    url: 'https://www.understood.org/en/articles/checklist-signs-of-dyslexia-at-different-ages',
    source: 'Understood.org',
    blurb:
      'A checklist of dyslexia signs from preschool through adulthood. Early recognition can lead to earlier intervention and better outcomes.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'spelling', 'language', 'writing'],
    audience: 'both',
  },
  {
    id: 'uo-teach-dyslexia-reading',
    title: 'How to Teach Kids With Dyslexia to Read',
    url: 'https://www.understood.org/en/articles/how-do-you-teach-a-child-with-dyslexia-to-read',
    source: 'Understood.org',
    blurb:
      'Learn about structured literacy and multisensory reading instruction approaches like Orton-Gillingham that are effective for teaching children with dyslexia.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'language'],
    audience: 'parent',
  },
  {
    id: 'uo-orton-gillingham',
    title: 'Orton-Gillingham: What You Need to Know',
    url: 'https://www.understood.org/en/articles/orton-gillingham-what-you-need-to-know',
    source: 'Understood.org',
    blurb:
      'Orton-Gillingham is a widely used, structured approach to teaching reading for people with dyslexia. Learn how it works and what to expect.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'language'],
    audience: 'both',
  },
  {
    id: 'uo-dyslexia-workplace',
    title: 'Workplace Supports: Trouble With Reading and Writing',
    url: 'https://www.understood.org/en/articles/reading-writing-workplace-job-supports',
    source: 'Understood.org',
    blurb:
      'Practical workplace accommodations and strategies for adults who struggle with reading and writing due to dyslexia or other learning differences.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'writing', 'workplace'],
    audience: 'self',
  },

  // ── DYSCALCULIA ────────────────────────────────────────────────────────

  {
    id: 'uo-what-is-dyscalculia',
    title: 'What Is Dyscalculia?',
    url: 'https://www.understood.org/en/articles/what-is-dyscalculia',
    source: 'Understood.org',
    blurb:
      'Dyscalculia is a learning disability in math that makes it hard to work with and make sense of numbers. Learn about signs, causes, and ways to help.',
    conditions: ['dyscalculia', 'learning disability'],
    symptomTags: ['math', 'numbers', 'learning'],
    audience: 'both',
  },
  {
    id: 'uo-dyscalculia-myths',
    title: '7 Common Myths About Dyscalculia',
    url: 'https://www.understood.org/en/articles/7-common-myths-about-dyscalculia',
    source: 'Understood.org',
    blurb:
      'Separates fact from fiction about dyscalculia — including myths that it\'s rare, that kids are just lazy, or that it only affects basic arithmetic.',
    conditions: ['dyscalculia', 'learning disability'],
    symptomTags: ['math', 'numbers'],
    audience: 'both',
  },

  // ── DYSGRAPHIA ─────────────────────────────────────────────────────────

  {
    id: 'uo-what-is-dysgraphia',
    title: 'What Is Dysgraphia?',
    url: 'https://www.understood.org/en/articles/understanding-dysgraphia',
    source: 'Understood.org',
    blurb:
      'Dysgraphia is a challenge with writing that impacts handwriting, typing, and spelling. Learn about symptoms, causes, and strategies for improvement.',
    conditions: ['dysgraphia', 'learning disability'],
    symptomTags: ['writing', 'handwriting', 'spelling', 'motor skills'],
    audience: 'both',
  },
  {
    id: 'uo-dysgraphia-myths',
    title: '5 Common Myths About Dysgraphia',
    url: 'https://www.understood.org/en/articles/5-common-myths-about-dysgraphia',
    source: 'Understood.org',
    blurb:
      'Debunks misconceptions about dysgraphia including the myth that messy handwriting is the only sign, or that kids just need more handwriting practice.',
    conditions: ['dysgraphia', 'learning disability'],
    symptomTags: ['writing', 'handwriting'],
    audience: 'both',
  },
  {
    id: 'uo-dysgraphia-treatment',
    title: 'Treatment for Kids With Dysgraphia',
    url: 'https://www.understood.org/en/articles/treatment-options-for-dysgraphia',
    source: 'Understood.org',
    blurb:
      'Explores effective teaching strategies, assistive technology, and therapeutic approaches for children who struggle with dysgraphia.',
    conditions: ['dysgraphia', 'learning disability'],
    symptomTags: ['writing', 'handwriting', 'motor skills'],
    audience: 'parent',
  },
  {
    id: 'uo-written-expression-disorder',
    title: 'What Is Written Expression Disorder?',
    url: 'https://www.understood.org/en/articles/what-is-written-expression-disorder',
    source: 'Understood.org',
    blurb:
      'Written expression disorder makes it hard to express thoughts and ideas in writing and affects grammar and punctuation. Learn how it differs from dysgraphia.',
    conditions: ['written expression disorder', 'learning disability'],
    symptomTags: ['writing', 'grammar', 'language'],
    audience: 'both',
  },

  // ── EXECUTIVE FUNCTION ─────────────────────────────────────────────────

  {
    id: 'uo-what-is-executive-function',
    title: 'What Is Executive Function?',
    url: 'https://www.understood.org/en/articles/what-is-executive-function',
    source: 'Understood.org',
    blurb:
      'Executive function is the brain\'s management system — controlling working memory, focus, planning, and emotional regulation. Learn about signs and treatment.',
    conditions: ['adhd', 'executive function disorder', 'learning disability'],
    symptomTags: ['focus', 'planning', 'organization', 'memory', 'executive function'],
    audience: 'both',
  },
  {
    id: 'uo-3-areas-executive-function',
    title: 'The 3 Areas of Executive Function',
    url: 'https://www.understood.org/en/articles/types-of-executive-function-skills',
    source: 'Understood.org',
    blurb:
      'Breaks down executive function into its three core areas: working memory, cognitive flexibility, and inhibitory control, with real-life examples of each.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['memory', 'focus', 'self-control', 'flexible thinking', 'executive function'],
    audience: 'both',
  },
  {
    id: 'uo-working-memory',
    title: 'What Is Working Memory?',
    url: 'https://www.understood.org/en/articles/working-memory-what-it-is-and-how-it-works',
    source: 'Understood.org',
    blurb:
      'Working memory is a key executive function skill that lets us hold information in mind and work with it. Learn why it matters and how struggles with it can affect learning.',
    conditions: ['adhd', 'learning disability'],
    symptomTags: ['memory', 'focus', 'attention', 'learning'],
    audience: 'both',
  },
  {
    id: 'uo-working-memory-boosters',
    title: '8 Working Memory Boosters',
    url: 'https://www.understood.org/en/articles/8-working-memory-boosters',
    source: 'Understood.org',
    blurb:
      'Practical, family-friendly strategies and games you can use at home to help build and strengthen working memory skills.',
    conditions: ['adhd', 'learning disability'],
    symptomTags: ['memory', 'focus', 'learning'],
    audience: 'parent',
  },
  {
    id: 'uo-executive-function-at-work',
    title: 'Executive Function Challenges at Work',
    url: 'https://www.understood.org/en/articles/executive-function-at-work',
    source: 'Understood.org',
    blurb:
      'Executive function challenges are common and real — they make it hard to start tasks, stay organized, and finish work on time. Practical strategies for the workplace.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['organization', 'planning', 'focus', 'workplace', 'executive function'],
    audience: 'self',
  },
  {
    id: 'uo-exec-function-kids',
    title: 'Understanding Executive Function Challenges in Your Child',
    url: 'https://www.understood.org/en/articles/understanding-executive-functioning-issues-in-your-child',
    source: 'Understood.org',
    blurb:
      'When kids struggle with executive function skills it can have a big impact on focus, planning, and daily life. Learn the signs and how to help.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['focus', 'planning', 'organization', 'executive function'],
    audience: 'parent',
  },
  {
    id: 'uo-flexible-thinking',
    title: 'Flexible Thinking: What You Need to Know',
    url: 'https://www.understood.org/en/articles/flexible-thinking-what-you-need-to-know',
    source: 'Understood.org',
    blurb:
      'Cognitive flexibility or "flexible thinking" is a core executive function skill. Learn what it is, why it matters, and what happens when kids and adults struggle with it.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['flexible thinking', 'executive function', 'problem solving'],
    audience: 'both',
  },
  {
    id: 'uo-processing-speed',
    title: 'Processing Speed: What You Need to Know',
    url: 'https://www.understood.org/en/articles/processing-speed-what-you-need-to-know',
    source: 'Understood.org',
    blurb:
      'Slow processing speed affects how fast someone can take in and use information. It\'s not about intelligence — it\'s about pace. Learn the signs and how to help.',
    conditions: ['adhd', 'learning disability'],
    symptomTags: ['processing speed', 'focus', 'learning'],
    audience: 'both',
  },

  // ── AUDITORY PROCESSING ────────────────────────────────────────────────

  {
    id: 'uo-what-is-apd',
    title: 'What Is Auditory Processing Disorder?',
    url: 'https://www.understood.org/en/articles/understanding-auditory-processing-disorder',
    source: 'Understood.org',
    blurb:
      'Auditory processing disorder (APD) makes it hard to process what people are saying. It isn\'t related to hearing problems or intelligence. Learn about signs and support.',
    conditions: ['auditory processing disorder'],
    symptomTags: ['listening', 'language', 'comprehension', 'hearing'],
    audience: 'both',
  },
  {
    id: 'uo-apd-vs-adhd',
    title: 'The Difference Between Auditory Processing Disorder and ADHD',
    url: 'https://www.understood.org/en/articles/the-difference-between-auditory-processing-disorder-and-adhd',
    source: 'Understood.org',
    blurb:
      'APD and ADHD can look similar but are very different conditions. This comparison chart shows how they overlap and differ in symptoms, diagnosis, and treatment.',
    conditions: ['auditory processing disorder', 'adhd'],
    symptomTags: ['listening', 'attention', 'focus', 'comprehension'],
    audience: 'both',
  },
  {
    id: 'uo-apd-classroom',
    title: 'Classroom Accommodations for Auditory Processing Disorder',
    url: 'https://www.understood.org/en/articles/classroom-accommodations-for-auditory-processing-disorder',
    source: 'Understood.org',
    blurb:
      'Practical classroom accommodations teachers can use to support students with APD, from seating arrangements to visual aids and modified instruction.',
    conditions: ['auditory processing disorder'],
    symptomTags: ['listening', 'comprehension', 'classroom'],
    audience: 'parent',
  },

  // ── ANXIETY & EMOTIONS ─────────────────────────────────────────────────

  {
    id: 'uo-anxiety-learning-differences',
    title: 'Stress and Anxiety in Learning Differences',
    url: 'https://www.understood.org/en/topics/stress-and-anxiety',
    source: 'Understood.org',
    blurb:
      'People with learning and thinking differences often experience heightened stress and anxiety. Explore strategies and resources for managing anxiety at school and in life.',
    conditions: ['anxiety', 'generalized anxiety disorder', 'adhd', 'learning disability'],
    symptomTags: ['anxiety', 'stress', 'worry', 'overwhelm'],
    audience: 'both',
  },
  {
    id: 'uo-cbt',
    title: 'FAQs About Cognitive Behavioral Therapy',
    url: 'https://www.understood.org/en/articles/faqs-about-cognitive-behavioral-therapy',
    source: 'Understood.org',
    blurb:
      'Cognitive behavioral therapy (CBT) helps people deal with thoughts and feelings and manage behavior. Learn how it works and when it can help with anxiety, ADHD, and more.',
    conditions: ['anxiety', 'generalized anxiety disorder', 'adhd', 'depression'],
    symptomTags: ['anxiety', 'emotions', 'behavior', 'therapy'],
    audience: 'both',
  },
  {
    id: 'uo-managing-emotions',
    title: 'Managing Emotions With Learning Differences',
    url: 'https://www.understood.org/en/topics/managing-emotions',
    source: 'Understood.org',
    blurb:
      'ADHD and learning differences can make managing emotions harder. Explore tips and strategies for dealing with anger, sadness, frustration, and emotional overwhelm.',
    conditions: ['adhd', 'learning disability'],
    symptomTags: ['emotions', 'frustration', 'anger', 'mood'],
    audience: 'both',
  },
  {
    id: 'uo-self-control',
    title: 'Self-Control: What It Means for Kids',
    url: 'https://www.understood.org/en/articles/self-control-what-it-means-for-kids',
    source: 'Understood.org',
    blurb:
      'Self-control is an executive function skill that helps kids manage impulses and emotions. Learn why some kids struggle with it and strategies that can help.',
    conditions: ['adhd'],
    symptomTags: ['self-control', 'impulsivity', 'emotions', 'behavior'],
    audience: 'parent',
  },

  // ── SOCIAL SKILLS ──────────────────────────────────────────────────────

  {
    id: 'uo-social-skills',
    title: 'Social Skills and Learning Differences',
    url: 'https://www.understood.org/en/topics/social-skills',
    source: 'Understood.org',
    blurb:
      'Learn why people with ADHD and learning differences may struggle with social skills, and get practical advice for social conversations and making friends.',
    conditions: ['adhd', 'autism', 'learning disability'],
    symptomTags: ['social skills', 'friendships', 'communication'],
    audience: 'both',
  },
  {
    id: 'uo-confidence-self-esteem',
    title: 'Building Confidence and Self-Esteem',
    url: 'https://www.understood.org/en/topics/confidence-and-self-esteem',
    source: 'Understood.org',
    blurb:
      'Find strategies to build confidence and self-esteem for people with ADHD, dyslexia, and other learning differences. Help identify strengths and develop a growth mindset.',
    conditions: ['adhd', 'dyslexia', 'learning disability'],
    symptomTags: ['self-esteem', 'confidence', 'emotions', 'motivation'],
    audience: 'both',
  },

  // ── CLASSROOM ACCOMMODATIONS ───────────────────────────────────────────

  {
    id: 'uo-accommodations-dyslexia',
    title: 'Classroom Accommodations for Dyslexia',
    url: 'https://www.understood.org/en/articles/classroom-accommodations-for-dyslexia',
    source: 'Understood.org',
    blurb:
      'Practical classroom accommodations for students with dyslexia including audiobooks, speech-to-text tools, extended time, and modified test formats.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'writing', 'classroom', 'accommodations'],
    audience: 'parent',
  },
  {
    id: 'uo-accommodations-executive-function',
    title: 'Classroom Accommodations for Executive Function Challenges',
    url: 'https://www.understood.org/en/articles/classroom-accommodations-executive-function-challenges',
    source: 'Understood.org',
    blurb:
      'Accommodations for students who struggle with planning, time management, and organization — including structured routines, step-by-step directions, and visual schedules.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['organization', 'planning', 'classroom', 'accommodations', 'executive function'],
    audience: 'parent',
  },
  {
    id: 'uo-iep-vs-504',
    title: 'The Difference Between IEPs and 504 Plans',
    url: 'https://www.understood.org/en/articles/the-difference-between-ieps-and-504-plans',
    source: 'Understood.org',
    blurb:
      'Side-by-side comparison of IEPs and 504 plans: eligibility, legal protections, what\'s included, and how each supports students with disabilities at school.',
    conditions: ['adhd', 'dyslexia', 'learning disability', 'autism'],
    symptomTags: ['school', 'accommodations', 'special education'],
    audience: 'parent',
  },
  {
    id: 'uo-what-is-iep',
    title: 'What Is an IEP?',
    url: 'https://www.understood.org/en/articles/what-is-an-iep',
    source: 'Understood.org',
    blurb:
      'An Individualized Education Program (IEP) is a formal plan detailing the special education services a school will provide. Learn who qualifies and what to expect.',
    conditions: ['adhd', 'dyslexia', 'learning disability', 'autism'],
    symptomTags: ['school', 'accommodations', 'special education'],
    audience: 'parent',
  },
  {
    id: 'uo-understanding-evaluations',
    title: 'Understanding Evaluations',
    url: 'https://www.understood.org/en/articles/understanding-evaluations',
    source: 'Understood.org',
    blurb:
      'A guide to the evaluation process for learning and thinking differences — what to expect, how to request one, and what the results mean for your child\'s support.',
    conditions: ['adhd', 'dyslexia', 'dyscalculia', 'learning disability'],
    symptomTags: ['evaluation', 'diagnosis', 'testing'],
    audience: 'parent',
  },

  // ── WORKPLACE ACCOMMODATIONS ───────────────────────────────────────────

  {
    id: 'uo-workplace-accommodations',
    title: 'Workplace Accommodations Fact Sheet',
    url: 'https://www.understood.org/en/articles/workplace-accommodations-fact-sheet',
    source: 'Understood.org',
    blurb:
      'A fact sheet on workplace accommodations for adults with learning and thinking differences, including what the ADA covers and how to request accommodations.',
    conditions: ['adhd', 'dyslexia', 'learning disability'],
    symptomTags: ['workplace', 'accommodations', 'employment'],
    audience: 'self',
  },
  {
    id: 'uo-struggling-at-work',
    title: 'Struggling at Work With Learning Differences',
    url: 'https://www.understood.org/en/topics/struggling-at-work',
    source: 'Understood.org',
    blurb:
      'Feeling overwhelmed or anxious at work is common with ADHD and learning differences. Find out why you might be struggling and get tips to make work easier.',
    conditions: ['adhd', 'dyslexia', 'learning disability'],
    symptomTags: ['workplace', 'stress', 'focus', 'organization'],
    audience: 'self',
  },
  {
    id: 'uo-workplace-supports-topic',
    title: 'Workplace Supports for Learning Differences',
    url: 'https://www.understood.org/en/topics/workplace-supports',
    source: 'Understood.org',
    blurb:
      'Find workplace supports you can set up on your own or that may involve talking to your employer. Get tips on thriving at work with learning and thinking differences.',
    conditions: ['adhd', 'dyslexia', 'learning disability'],
    symptomTags: ['workplace', 'accommodations', 'employment', 'organization'],
    audience: 'self',
  },

  // ── PARENTING STRATEGIES ───────────────────────────────────────────────

  {
    id: 'uo-parenting-strategies',
    title: 'Parenting Kids With Learning Differences',
    url: 'https://www.understood.org/en/topics/parenting',
    source: 'Understood.org',
    blurb:
      'Get expert-vetted parenting tips to help kids with ADHD and learning disabilities follow directions, improve behavior, and build confidence.',
    conditions: ['adhd', 'dyslexia', 'learning disability'],
    symptomTags: ['behavior', 'parenting', 'discipline', 'routines'],
    audience: 'parent',
  },
  {
    id: 'uo-staying-organized',
    title: 'Staying Organized With Learning Differences',
    url: 'https://www.understood.org/en/topics/staying-organized',
    source: 'Understood.org',
    blurb:
      'Tips and strategies to help kids and adults stay organized. Learn how executive function challenges and ADHD cause trouble with organization and time management.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['organization', 'time management', 'planning', 'executive function'],
    audience: 'both',
  },
  {
    id: 'uo-following-instructions',
    title: 'Why Kids Have Trouble Following Directions',
    url: 'https://www.understood.org/en/topics/following-instructions',
    source: 'Understood.org',
    blurb:
      'Learn how ADHD and executive function play a role when kids struggle to follow directions, and get strategies for creating routines and improving compliance.',
    conditions: ['adhd', 'executive function disorder'],
    symptomTags: ['following directions', 'behavior', 'executive function', 'routines'],
    audience: 'parent',
  },
  {
    id: 'uo-tantrums-meltdowns',
    title: 'Tantrums and Meltdowns',
    url: 'https://www.understood.org/en/topics/tantrums-meltdowns',
    source: 'Understood.org',
    blurb:
      'Tantrums and meltdowns can be stressful and hard to understand. Learn why they happen, how to respond calmly, and what strategies can help prevent them.',
    conditions: ['adhd', 'autism', 'learning disability'],
    symptomTags: ['emotions', 'behavior', 'frustration', 'meltdowns'],
    audience: 'parent',
  },

  // ── ASSISTIVE TECHNOLOGY ───────────────────────────────────────────────

  {
    id: 'uo-text-to-speech',
    title: 'Text-to-Speech Technology: What It Is and How It Works',
    url: 'https://www.understood.org/en/articles/text-to-speech-technology-what-it-is-and-how-it-works',
    source: 'Understood.org',
    blurb:
      'Text-to-speech (TTS) tools read digital text aloud. Learn how this assistive technology can help people with dyslexia, learning differences, and reading challenges.',
    conditions: ['dyslexia', 'learning disability'],
    symptomTags: ['reading', 'assistive technology', 'accessibility'],
    audience: 'both',
  },
  {
    id: 'uo-assistive-technology',
    title: 'Assistive Technology for Learning Differences',
    url: 'https://www.understood.org/en/topics/assistive-technology',
    source: 'Understood.org',
    blurb:
      'An overview of assistive technology tools that can help people who learn and think differently — from speech-to-text to graphic organizers and reading pens.',
    conditions: ['dyslexia', 'dysgraphia', 'learning disability', 'adhd'],
    symptomTags: ['assistive technology', 'reading', 'writing', 'accessibility'],
    audience: 'both',
  },

  // ── GENERAL / CROSS-CUTTING ────────────────────────────────────────────

  {
    id: 'uo-learning-thinking-differences',
    title: 'Learning and Thinking Differences: A Guide',
    url: 'https://www.understood.org/en/topics/learning-thinking-differences',
    source: 'Understood.org',
    blurb:
      'A comprehensive guide to learning and thinking differences like ADHD and dyslexia. With the right support, people can thrive — get facts, stories, and resources.',
    conditions: ['adhd', 'dyslexia', 'dyscalculia', 'dysgraphia', 'learning disability'],
    symptomTags: ['learning', 'neurodiversity'],
    audience: 'both',
  },

  // ── DISTRACTION & FOCUS ────────────────────────────────────────────────

  {
    id: 'uo-distraction',
    title: 'Why People Get Distracted',
    url: 'https://www.understood.org/en/topics/distraction',
    source: 'Understood.org',
    blurb:
      'Learn why people get distracted and the connection to ADHD and learning differences. Find strategies to improve focus, working memory, and executive function.',
    conditions: ['adhd'],
    symptomTags: ['distraction', 'focus', 'attention', 'executive function'],
    audience: 'both',
  },
  {
    id: 'uo-avoiding-procrastinating',
    title: 'How to Stop Procrastinating With ADHD',
    url: 'https://www.understood.org/en/topics/avoiding-and-procrastinating',
    source: 'Understood.org',
    blurb:
      'Tips on overcoming procrastination and avoidance for people with ADHD and learning differences, including strategies for school refusal and task initiation.',
    conditions: ['adhd', 'learning disability'],
    symptomTags: ['procrastination', 'avoidance', 'motivation', 'executive function'],
    audience: 'both',
  },
];

export default UNDERSTOOD_ARTICLES;
