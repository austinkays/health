export const CURRENT_VERSION = '1.3.0-beta.4';

// Only change this when you intentionally want the What's New modal to
// auto-open for everyone again. It can match a version, or be any custom
// announcement identifier when you need to send a message outside a release.
export const CURRENT_WHATS_NEW_ID = '1.3.0-beta.4';

export const CHANGELOG = [
  {
    id: '1.3.0-beta.4',
    version: '1.3.0-beta.4',
    date: '2026-04-17',
    tag: 'Latest update',
    title: 'Live wearable sync',
    thankYou: '',
    summary: 'Salve now reaches out to your wearables instead of waiting for you to sync. Connect once and your data shows up on its own.',
    highlights: [
      'Oura Ring data now lands in Salve automatically — no Sync button needed.',
      'A new Connections tab consolidates every device, app, and import in one place.',
      'A small celebration when a sync brings in something new.',
    ],
    sections: [
      {
        id: 'new',
        label: 'New features',
        accent: 'lav',
        items: [
          'Live Oura Ring sync — sleep, activity, SpO₂, and workouts arrive in the background, even when Salve is closed. Open the app and yesterday is already there.',
          'A dedicated Connections tab in the sidebar — every wearable, app import, and Claude Health Sync is now grouped together. Settings stays focused on your profile and preferences.',
          'Live Fitbit sync — sleep, heart rate, steps, and weight push to Salve automatically for connected Fitbit users.',
        ],
      },
      {
        id: 'improved',
        label: 'Improvements',
        accent: 'sage',
        items: [
          'Syncing a wearable now shows a single celebration toast (e.g. "43 new from Oura ✓") instead of dozens of "Saved" chips.',
          'Connecting Fitbit and Oura now lands you back on the Connections page where you started, instead of jumping to Settings.',
          'Wearable cards show "Last push" timestamp so you can see when data last arrived.',
        ],
      },
      {
        id: 'polish',
        label: 'Polish & fixes',
        accent: 'amber',
        items: [
          'OAuth redirect handling for every wearable cleaned up.',
          'Behind-the-scenes architecture lets new wearables plug in faster.',
        ],
      },
    ],
  },
  {
    id: '1.2.0-beta.3',
    version: '1.2.0-beta.3',
    date: '2026-04-13',
    tag: 'Earlier update',
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
