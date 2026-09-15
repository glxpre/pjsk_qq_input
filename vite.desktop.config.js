import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, 'desktop')

/**
 * Desktop renderer build.
 *
 * Separate from the web/toy configs on purpose: this bundle loads from
 * `file://` inside Electron, so it must be fully relative, must bundle the local
 * fonts, and must not register a service worker (the installed app is already
 * offline).
 *
 *   - root  : desktop/renderer
 *   - outDir: desktop-dist/renderer
 *   - base  : './'  (required for file:// loading)
 *
 * Sticker art and `characters.json` are not bundled: they are copied to
 * `desktop-dist/assets/` by `scripts/copy-desktop-assets.mjs` and served by the
 * Electron main process through a custom `app://` protocol, so the renderer's
 * `import.meta.env.BASE_URL` points at them.
 */
export default defineConfig({
  root: path.join(desktopRoot, 'renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  build: {
    outDir: path.resolve(here, 'desktop-dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'chrome120',
    assetsInlineLimit: 0, // never inline a 2 MB font into the JS bundle
    rollupOptions: {
      /*
       * Both documents the main process loads have to be listed explicitly:
       * Vite only emits the HTML files named as inputs, and the focus-safe live
       * preview is a separate document (`preview.html`) rather than a route in
       * the app shell.
       */
      input: {
        index: path.join(desktopRoot, 'renderer/index.html'),
        preview: path.join(desktopRoot, 'renderer/preview.html'),
      },
      output: {
        manualChunks: {
          mui: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
})
