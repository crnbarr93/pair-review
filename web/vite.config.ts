import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Inject nonce="__NONCE__" onto the Vite-emitted <script> tag in the built HTML.
 * Hono's render-index.ts replaces __NONCE__ with the per-request CSP nonce at serve time.
 * Vite 8 rewrites the <script> tag during build (moves it to <head>, drops unknown attrs),
 * so we must inject the placeholder as a post-process step on the built HTML.
 */
function noncePlugin(): Plugin {
  return {
    name: 'inject-nonce-placeholder',
    // Run on the build output only (not on transformIndexHtml which runs during dev too)
    closeBundle() {
      // Handled by transformIndexHtml with enforce: 'post'
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // Inject nonce="__NONCE__" on the module script tag(s) Vite emits
        return html.replace(
          /<script type="module" crossorigin/g,
          '<script type="module" crossorigin nonce="__NONCE__"'
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), noncePlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // IMPORTANT: do NOT disable asset hashing — Vite's hashed names are part of CSP hygiene
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.REVIEW_SERVER_PORT || '50351'}`,
        changeOrigin: true,
      },
    },
  },
});
