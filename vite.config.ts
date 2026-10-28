import { defineConfig } from 'vite';

// Minimal config. Vite serves src/ with HMR in dev and bundles to dist/ on build.
// `base: './'` keeps asset paths relative so the build works both on the web
// and inside a Capacitor WebView (which loads files from the local filesystem).
export default defineConfig({
  base: './',
  server: {
    host: true, // expose on the LAN so you can test on a real phone
  },
  build: {
    target: 'es2022',
  },
});
