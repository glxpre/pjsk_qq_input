// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Copy the assets the desktop app needs into `desktop-dist/`.
 *
 *   assets/img/**        every sticker webp, mirrored from `public/img`
 *   assets/characters.json  the template list
 *   assets/icon.png      app / tray icon
 *   helper/QqHelper.exe  the compiled Windows helper (when present)
 *
 * The Electron main process serves `desktop-dist/assets` through a custom
 * `app://` protocol, because `file://` fetch of JSON is blocked by Chromium and
 * relative asset URLs inside a `file://` document are fragile.
 *
 * Sticker art is large (788 webp files), so the copy is skipped when the target
 * is already newer than the source directory.
 */

import { cp, mkdir, stat, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dist = path.join(root, 'desktop-dist')
const assets = path.join(dist, 'assets')

/** Recursively newest mtime under `dir`, or 0 when it does not exist. */
async function newestMtime(dir) {
  if (!existsSync(dir)) return 0
  const entries = await import('node:fs/promises').then((fs) =>
    fs.readdir(dir, { withFileTypes: true })
  )
  let newest = 0
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, await newestMtime(full))
    else {
      const info = await stat(full)
      newest = Math.max(newest, info.mtimeMs)
    }
  }
  return newest
}

async function main() {
  await mkdir(assets, { recursive: true })

  const imgSource = path.join(root, 'public/img')
  const imgTarget = path.join(assets, 'img')
  if (!existsSync(imgSource)) throw new Error(`missing sticker art: ${imgSource}`)

  const sourceTime = await newestMtime(imgSource)
  const targetTime = existsSync(imgTarget) ? await newestMtime(imgTarget) : 0
  if (targetTime >= sourceTime && existsSync(path.join(imgTarget, 'miku', 'miku_01.webp'))) {
    console.log('assets/img is up to date, skipping copy')
  } else {
    await rm(imgTarget, { recursive: true, force: true })
    await cp(imgSource, imgTarget, { recursive: true })
    console.log('copied assets/img')
  }

  await copyFile(path.join(root, 'src/characters.json'), path.join(assets, 'characters.json'))
  console.log('copied assets/characters.json')

  const iconCandidates = [
    path.join(root, 'public/android-chrome-256x256.png'),
    path.join(root, 'public/android-chrome-192x192.png'),
  ]
  const icon = iconCandidates.find((candidate) => existsSync(candidate))
  if (icon) {
    await copyFile(icon, path.join(assets, 'icon.png'))
    await copyFile(icon, path.join(assets, 'tray.png'))
    console.log('copied assets/icon.png and assets/tray.png')
  }

  const helperSource = path.join(root, 'desktop/helper/bin/QqHelper.exe')
  const helperTarget = path.join(dist, 'helper')
  if (existsSync(helperSource)) {
    await mkdir(helperTarget, { recursive: true })
    await copyFile(helperSource, path.join(helperTarget, 'QqHelper.exe'))
    console.log('copied helper/QqHelper.exe')
  } else {
    console.warn(
      'helper/QqHelper.exe not found — run "npm run desktop:helper" first, or QQ integration will be unavailable in the packaged app'
    )
  }

  console.log(`desktop assets ready in ${assets}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
