import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate config from vite.config.js so the Sentry + PWA plugins don't
// load during tests (they require env vars and slow things down).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Playwright visual specs live under tests/visual/ and run separately
    exclude: ['**/node_modules/**', 'tests/visual/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/services/**'],
      exclude: ['**/*.test.{js,jsx}', 'src/services/supabase.js'],
    },
  },
});
