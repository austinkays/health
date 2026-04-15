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
        // JS: runtime-cached below with CacheFirst (see static-assets rule).
        // HTML: precaching index.html is dangerous because deploying new chunk
        //   hashes leaves the precached HTML pointing at filenames that no longer
        //   exist on the CDN (Vercel returns text/html for those 404s and browsers
        //   refuse to execute HTML as a JS module). Runtime StaleWhileRevalidate
        //   (below) is safe: old HTML + SW-cached old JS loads fine, and
        //   lazyWithRetry() handles the edge case where an old chunk was evicted.
        globPatterns: ['**/*.css'],
        navigateFallback: null, // disable the default precache-based fallback
        runtimeCaching: [
          // HTML navigation: serve cached version immediately, revalidate in background.
          // StaleWhileRevalidate paints the app shell instantly on PWA reopen instead
          // of waiting for a network round-trip (typically 100–500 ms saved on a warm
          // connection, up to 5 s on a slow one).
          // Old JS chunks referenced by stale HTML stay available in 'static-assets'
          // cache; lazyWithRetry() handles the rare case where they've been evicted.
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'html-pages',
            },
          },
          // Content-hashed JS/CSS chunks — CacheFirst because the URL never
          // changes (new deploys produce new hashes → new filenames). Storing them
          // in the SW cache is far more persistent than the browser HTTP cache,
          // which iOS Safari evicts aggressively. Old entries expire naturally;
          // new filenames are fetched once and cached on first use.
          {
            urlPattern: /\/assets\/.*\.(js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
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
