// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Desktop build: main + preload (esbuild, CommonJS) and renderer (Vite).
 *
 * Why not electron-vite: its v2 release imports `splitVendorChunk` from Vite,
 * which Vite 7 removed, so it cannot load this project's Vite at all. The three
 * builds below need very little from a framework — two CommonJS bundles for
 * Electron and one `file://`-safe web bundle — so they are driven directly.
 *
 *   node scripts/build-desktop.mjs            # one-shot build
 *   node scripts/build-desktop.mjs --watch    # rebuild main/preload on change
 *   node scripts/build-desktop.mjs --dev      # start the renderer dev server too
 *
 * Outputs:
 *   desktop-dist/main/main.cjs        Electron main process
 *   desktop-dist/main/preload.cjs     context-isolated bridge
 *   desktop-dist/renderer/index.html  React UI (Vite)
 */

import { build as esbuild } from 'esbuild'
import { build as viteBuild, createServer as viteCreateServer } from 'vite'
import path from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'desktop-dist')

const watch = process.argv.includes('--watch')
const dev = process.argv.includes('--dev')

/** Shared esbuild options for the Electron-side bundles. */
function electronBuild(entry, outfile) {
  return {
    entryPoints: [path.join(root, entry)],
    outfile: path.join(dist, outfile),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    // Electron is provided by the runtime; bundling it would break `require`.
    external: ['electron'],
    // The helper path check and the tray icon use real filesystem paths, so the
    // CommonJS `__dirname` must stay intact.
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
    logLevel: 'info',
  }
}

async function buildElectronSide() {
  await esbuild(electronBuild('desktop/main/main.ts', 'main/main.cjs'))
  // The preload is already CommonJS and uses `require` directly; bundling keeps
  // it as one file next to the main bundle, which is what `webPreferences`
  // expects.
  await esbuild({
    ...electronBuild('desktop/main/preload.cjs', 'main/preload.cjs'),
    sourcemap: false,
  })
}

async function buildRenderer() {
  await viteBuild({ configFile: path.join(root, 'vite.desktop.config.js') })
}

async function main() {
  rmSync(path.join(dist, 'main'), { recursive: true, force: true })

  await buildElectronSide()

  if (watch) {
    // esbuild's rebuild API is the reliable way to re-bundle on change; the
    // renderer keeps its own watcher through the Vite dev server (`--dev`).
    const { watch: fsWatch } = await import('node:fs')
    console.log('watching desktop/main — press Ctrl+C to stop')
    for (const file of ['desktop/main/main.ts', 'desktop/main/preload.cjs']) {
      fsWatch(path.join(root, file), { persistent: true }, () => {
        void buildElectronSide().catch((error) => console.error(error))
      })
    }
    return
  }

  if (dev) {
    const server = await viteCreateServer({
      configFile: path.join(root, 'vite.desktop.config.js'),
    })
    await server.listen()
    const url = `http://localhost:${server.config.server.port ?? 9001}`
    console.log(`renderer dev server: ${url}`)
    console.log(`启动桌面程序：SEKAI_DESKTOP_DEV_SERVER=${url} npx electron .`)
    return
  }

  await buildRenderer()

  for (const required of ['main/main.cjs', 'main/preload.cjs', 'renderer/index.html']) {
    const full = path.join(dist, required)
    if (!existsSync(full)) throw new Error(`build did not produce ${full}`)
  }
  console.log('desktop build complete')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
