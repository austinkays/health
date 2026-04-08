import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: false, // Use our existing public/manifest.json
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
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
  ],
})
