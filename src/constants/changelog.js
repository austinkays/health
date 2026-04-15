export const CURRENT_VERSION = '1.2.0-beta.3';

// Only change this when you intentionally want the What's New modal to
// auto-open for everyone again. It can match a version, or be any custom
// announcement identifier when you need to send a message outside a release.
export const CURRENT_WHATS_NEW_ID = '1.2.0-beta.3';

export const CHANGELOG = [
  {
    id: '1.2.0-beta.3',
    version: '1.2.0-beta.3',
    date: '2026-04-13',
    tag: 'Latest update',
    title: 'Live Tracking & Quality of Life',
    thankYou: '',
    summary: 'Salve should feel faster, more live, and easier to move through day to day.',
    highlights: [
      'Live Oura heart rate now shows as an intraday chart.',
      'New data can appear instantly through realtime sync.',
      'Every section has its own URL, so navigation and sharing feel more natural.',
    ],
    sections: [
      {
        id: 'new',
        label: 'New features',
        accent: 'lav',
        items: [
          'Live heart rate from Oura Ring with a 5-minute intraday chart.',
          'Visible app import for ME/CFS pacing and symptom tracking.',
          'A proper 404 state for unknown URLs.',
        ],
      },
      {
        id: 'improved',
        label: 'Improvements',
        accent: 'sage',
        items: [
          'Real-time data sync, so vitals and related tracking can update instantly.',
          'Every section now has its own URL for bookmarking and sharing.',
          'Browser back and forward buttons work naturally through the app.',
          'Rich link previews when sharing on Reddit, Discord, and Twitter.',
        ],
      },
      {
        id: 'polish',
        label: 'Polish & fixes',
        accent: 'amber',
        items: [
          'Database performance improvements for larger datasets.',
          'A calmer release-notes layout with cleaner grouping and less clutter.',
        ],
      },
    ],
  },
  {
    id: '1.1.0-beta.2',
    version: '1.1.0-beta.2',
    date: '2026-04-09',
    tag: 'Earlier update',
    title: 'Personalized News & Feedback',
    thankYou: '',
    summary: 'This update made discovery feel more personal and gave users better ways to react to what Salve shows them.',
    highlights: [
      'A personalized health news feed from NIH and FDA sources.',
      'Thumbs up and thumbs down ratings on insights and news.',
      'Mood tracking surfaced more clearly on the dashboard.',
    ],
    sections: [
      {
        id: 'new',
        label: 'New features',
        accent: 'lav',
        items: [
          'Personalized health news tailored to the conditions you track.',
          'Thumbs up and thumbs down feedback on insights and stories.',
          'Mood tracking on the dashboard.',
        ],
      },
      {
        id: 'improved',
        label: 'Improvements',
        accent: 'sage',
        items: [
          'Faster page loads and improved caching.',
        ],
      },
    ],
  },
  {
    id: '1.0.0-beta.1',
    version: '1.0.0-beta.1',
    date: '2026-04-07',
    tag: 'Beta launch',
    title: 'Welcome to Salve Beta',
    thankYou: '',
    summary: 'The beta launch brought the core Salve experience together across tracking, AI, imports, and theming.',
    highlights: [
      'Desktop sidebar and split-view layouts.',
      'Apple Health and Oura Ring sync.',
      'Sage chat, cycle tracking, and offline support.',
    ],
    sections: [
      {
        id: 'new',
        label: 'New features',
        accent: 'lav',
        items: [
          'Desktop sidebar with split-view layouts.',
          'Health trends for sleep, heart rate, and SpO₂.',
          'Apple Health and Oura Ring sync.',
          'Chat with Sage to manage your records.',
          'Cycle tracking with fertility predictions.',
        ],
      },
      {
        id: 'experience',
        label: 'Experience',
        accent: 'sage',
        items: [
          '16 themes, including 9 animated styles.',
          'Offline support with encrypted cache.',
        ],
      },
    ],
  },
];

export const CURRENT_WHATS_NEW = CHANGELOG.find(entry => entry.id === CURRENT_WHATS_NEW_ID) || CHANGELOG[0];
