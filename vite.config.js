import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  build: {
    sourcemap: true, // Required for Sentry sourcemap upload
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy deps out of the 693KB main bundle
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['lucide-react'],
          'vendor-recharts': ['recharts'],
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
        // Only precache the HTML shell and CSS — NOT the 60+ JS chunks.
        // Each deploy generates new hashes, causing a 95-asset download storm
        // that saturates the connection for 10-30 seconds. Code-split JS chunks
        // are cached on-demand by the browser's HTTP cache instead.
        globPatterns: ['**/*.html', '**/*.css'],
        runtimeCaching: [
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
