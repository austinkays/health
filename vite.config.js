import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  build: {
    sourcemap: true, // Required for Sentry sourcemap upload
    // pdfjs-dist worker is ~1.2 MB and is already lazy-loaded in FormHelper
    // (only downloaded when user selects a PDF in Scribe). Raise the limit
    // above that so it doesn't cause noise in CI / Vercel build output.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy deps out of the 693KB main bundle
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['lucide-react'],
          'vendor-recharts': ['recharts'],
          // Sentry SDK (~150 kB) — eagerly initialised but rarely changes,
          // so give it its own long-lived cache chunk.
          'vendor-sentry': ['@sentry/react'],
          // Markdown renderer — pulled in by AIMarkdown which SagePopup uses.
          // Isolated here so it can be cached independently of the main bundle.
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' mode: new SW waits until the user taps the in-app
      // "Update available" banner, then we call updateServiceWorker(true)
      // which sends SKIP_WAITING, activates the new SW, and reloads.
      // Previously used 'autoUpdate' + skipWaiting which silently swapped
      // the SW in the background but never reloaded the current tab —
      // meaning users could stay on stale JS indefinitely.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: false, // Use our existing public/manifest.json
      workbox: {
        // skipWaiting is NOT set — we want the new SW to wait so the
        // app can show the update banner. updateServiceWorker(true)
        // posts SKIP_WAITING on click.
        clientsClaim: true,
        importScripts: ['/push-handler.js'],
        // Only precache CSS — NOT JS chunks or HTML.
        // JS: each deploy generates new content hashes causing a download storm.
        // HTML: precaching index.html causes the SW to serve stale HTML that
        //   references non-existent JS chunk filenames after a deploy. This is
        //   the root cause of the "stuck on loading" bug — the old HTML tries
        //   to load e.g. index-Xy774ywJ.js, Vercel 404s it as text/html, and
        //   the browser refuses the non-JS MIME type.
        // Instead, HTML is served NetworkFirst via runtimeCaching below (fresh
        // from Vercel when online, cached fallback when offline).
        globPatterns: ['**/*.css'],
        // Navigation requests (HTML pages) go network-first so users always
        // get the latest index.html with correct chunk references after a deploy.
        navigateFallback: null, // disable the default precache-based fallback
        runtimeCaching: [
          // HTML navigation: always try network first so deploys take effect
          // immediately. Falls back to cache when offline.
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-pages',
              networkTimeoutSeconds: 5,
            },
          },
          // Google Fonts: network with cache fallback (CacheFirst breaks
          // when the SW activates with an empty cache and network fails).
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          // Supabase API and /api/* go straight to network — no SW caching.
          // The app has its own encrypted localStorage cache; SW interception
          // only added latency (NetworkFirst 10s timeout) with no benefit.
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    // Upload sourcemaps to Sentry on production builds.
    // Requires SENTRY_AUTH_TOKEN env var (set in Vercel, not in .env.local).
    // Sourcemaps are uploaded then deleted from the bundle so they're never
    // served to users — errors in Sentry resolve to original file/line.
    sentryVitePlugin({
      org: 'salve-ay',
      project: 'javascript-react',
      // Only upload during CI/Vercel builds (SENTRY_AUTH_TOKEN present)
      // Local dev builds silently skip when the token is missing
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      // Silence the plugin when no auth token is available (local dev)
      silent: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
})
