// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Main-process half of the `--smoke-test` self-check.
 *
 * Collects the facts only the main process can see — where the resources ended
 * up, whether the helper binary is next to the app, whether the global shortcuts
 * could actually be registered, how the helper answered — and prints one JSON
 * document together with the renderer's half of the report.
 *
 * Run it as `PJSK-Sticker-Companion.exe --smoke-test --smoke-out=report.json`,
 * or through `npm run desktop:smoke`.
 */

import type { App } from 'electron'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Facts gathered outside the renderer. */
export interface MainSmokeFacts {
  packaged: boolean
  appVersion: string
  electron: string
  chrome: string
  node: string
  platform: string
  arch: string
  resourcesPath: string
  userData: string
  assetsDir: string
  assetsDirExists: boolean
  charactersJson: boolean
  imageCount: number
  trayIcon: boolean
  /** `new Tray(icon)` succeeded — false means Windows refused the notification icon. */
  trayCreated: boolean
  helperPath: string
  helperExists: boolean
  rendererIndex: boolean
  previewHtml: boolean
  /** `globalShortcut.register` results — `false` means another app owns the chord. */
  shortcutRegistered: Record<string, boolean>
  /** The chord each role actually ended up with, plus any substitution note. */
  shortcutActive: { insert: string | null; capture: string | null; notes: string[] }
  helper: {
    available: boolean
    running: boolean
    version: string
    windowCount: number
    elementCount: number
    liveReadSupported: boolean
    reason: string
  }
}

/** Count files under `<assets>/img` without pulling in a glob dependency. */
function countImages(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countImages(path.join(dir, entry.name))
    else if (/\.(webp|png|jpg|jpeg)$/i.test(entry.name)) total += 1
  }
  return total
}

/**
 * Describe the live shortcut registration.
 *
 * A hotkey silently claimed by another program is the most likely reason the app
 * "does nothing" on a user's machine, so both the chord that ended up registered
 * and any substitution are reported.
 */
export function shortcutResults(status: {
  insert: string | null
  capture: string | null
  preferred: { insert: string; capture: string }
  notes: string[]
}): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  result[status.preferred.insert] = status.insert === status.preferred.insert
  result[status.preferred.capture] = status.capture === status.preferred.capture
  return result
}

/** Assemble the report. */
export function collectMainFacts(input: {
  electronApp: App
  assetsDir: string
  helperPath: string
  distDir: string
  shortcutRegistered: Record<string, boolean>
  shortcutActive: MainSmokeFacts['shortcutActive']
  helper: MainSmokeFacts['helper']
  trayCreated: boolean
}): MainSmokeFacts {
  return {
    packaged: input.electronApp.isPackaged,
    appVersion: input.electronApp.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    platform: `${process.platform}-${process.arch}`,
    arch: process.arch,
    resourcesPath: process.resourcesPath ?? '',
    userData: input.electronApp.getPath('userData'),
    assetsDir: input.assetsDir,
    assetsDirExists: existsSync(input.assetsDir),
    charactersJson: existsSync(path.join(input.assetsDir, 'characters.json')),
    imageCount: countImages(path.join(input.assetsDir, 'img')),
    trayIcon: existsSync(path.join(input.assetsDir, 'tray.png')),
    trayCreated: input.trayCreated,
    helperPath: input.helperPath,
    helperExists: existsSync(input.helperPath),
    rendererIndex: existsSync(path.join(input.distDir, 'renderer', 'index.html')),
    previewHtml: existsSync(path.join(input.distDir, 'renderer', 'preview.html')),
    shortcutRegistered: input.shortcutRegistered,
    shortcutActive: input.shortcutActive,
    helper: input.helper,
  }
}

/** Write the combined report where the caller can read it. */
export function writeSmokeReport(file: string, payload: unknown): void {
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
