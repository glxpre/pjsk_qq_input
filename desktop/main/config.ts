// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Persistent desktop settings.
 *
 * Persistence (the Electron part) lives at the bottom of this file; the shape and
 * the normalisation are pure so they can be unit-tested without Electron.
 *
 * Privacy: the config deliberately contains no draft text and no history. The
 * optional history file is a separate, opt-in feature (`recordHistory`).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export interface DesktopConfig {
  /** Master switch for QQ integration (shortcuts + live polling). */
  enabled: boolean
  /** Generate the sticker on this shortcut. */
  insertShortcut: string
  /** Capture the selected text in QQ and generate a sticker. */
  captureShortcut: string
  /** Debounce for live mode, in milliseconds. */
  debounceMs: number
  /** Smallest font size the auto-layout may use (logical px at 1x). */
  minFontSize: number
  /** Hard cap on rendered lines per sticker. */
  maxLines: number
  /** Pages the user is asked about before generating. */
  maxPages: number
  /** `true` generates past `maxPages` without asking. */
  allowManyPages: boolean
  /** Grow the canvas so text gets its own band above the art. */
  allowCanvasExtension: boolean
  /** `true` never draws text over the character. */
  avoidArtOverlap: boolean
  /** Index into `src/characters.json`; the last template the user chose. */
  templateIndex: number
  /** Index into the favourite list, or -1 for "use `templateIndex`". */
  favoriteIndex: number
  /** Keep the template stable while editing one draft. */
  lockTemplatePerDraft: boolean
  /** Export scale for the generated PNG (1/2/3). */
  exportScale: number
  /** Opaque white background instead of transparency, for QQ compatibility. */
  whiteBackground: boolean
  /** Show the preview popup when a draft is generated in live mode. */
  showPreviewWindow: boolean
  /** Opt-in: keep a local history of generated stickers. */
  recordHistory: boolean
  /** Don't show the "live mode unavailable" banner again. */
  dismissLiveWarning: boolean
}

export const DEFAULT_CONFIG: DesktopConfig = {
  enabled: true,
  insertShortcut: 'Control+Alt+S',
  /*
   * `Control+Alt+D` was measured as *already taken* on a normal Windows desktop
   * (some other resident program owns it), so the default is the sibling chord
   * that registered cleanly. Conflicts are still detected and worked around:
   * see `SHORTCUT_FALLBACKS` in main.ts.
   */
  captureShortcut: 'Control+Shift+D',
  debounceMs: 500,
  minFontSize: 22,
  maxLines: 3,
  maxPages: 6,
  allowManyPages: false,
  allowCanvasExtension: true,
  avoidArtOverlap: true,
  templateIndex: 98,
  favoriteIndex: -1,
  lockTemplatePerDraft: true,
  exportScale: 2,
  whiteBackground: false,
  showPreviewWindow: true,
  recordHistory: false,
  dismissLiveWarning: false,
}

/**
 * Config file location.
 *
 * `userDataDir` is injected rather than read from Electron so this module stays
 * testable; the Electron entry passes `app.getPath('userData')`.
 */
let userDataDir = ''

export function setUserDataDir(dir: string): void {
  userDataDir = dir
}

function configPath(): string {
  return path.join(userDataDir || '.', 'desktop-config.json')
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/** Coerce an unknown object into a complete, valid config. */
export function normalizeConfig(raw: unknown): DesktopConfig {
  const input = (raw ?? {}) as Partial<DesktopConfig>
  return {
    enabled: asBoolean(input.enabled, DEFAULT_CONFIG.enabled),
    insertShortcut: asString(input.insertShortcut, DEFAULT_CONFIG.insertShortcut),
    captureShortcut: asString(input.captureShortcut, DEFAULT_CONFIG.captureShortcut),
    debounceMs: asNumber(input.debounceMs, DEFAULT_CONFIG.debounceMs, 0, 5000),
    minFontSize: asNumber(input.minFontSize, DEFAULT_CONFIG.minFontSize, 8, 64),
    maxLines: asNumber(input.maxLines, DEFAULT_CONFIG.maxLines, 1, 10),
    maxPages: asNumber(input.maxPages, DEFAULT_CONFIG.maxPages, 1, 60),
    allowManyPages: asBoolean(input.allowManyPages, DEFAULT_CONFIG.allowManyPages),
    allowCanvasExtension: asBoolean(
      input.allowCanvasExtension,
      DEFAULT_CONFIG.allowCanvasExtension
    ),
    avoidArtOverlap: asBoolean(input.avoidArtOverlap, DEFAULT_CONFIG.avoidArtOverlap),
    templateIndex: asNumber(input.templateIndex, DEFAULT_CONFIG.templateIndex, 0, 100000),
    favoriteIndex: asNumber(input.favoriteIndex, DEFAULT_CONFIG.favoriteIndex, -1, 100000),
    lockTemplatePerDraft: asBoolean(input.lockTemplatePerDraft, DEFAULT_CONFIG.lockTemplatePerDraft),
    exportScale: asNumber(input.exportScale, DEFAULT_CONFIG.exportScale, 1, 4),
    whiteBackground: asBoolean(input.whiteBackground, DEFAULT_CONFIG.whiteBackground),
    showPreviewWindow: asBoolean(input.showPreviewWindow, DEFAULT_CONFIG.showPreviewWindow),
    recordHistory: asBoolean(input.recordHistory, DEFAULT_CONFIG.recordHistory),
    dismissLiveWarning: asBoolean(input.dismissLiveWarning, DEFAULT_CONFIG.dismissLiveWarning),
  }
}

export function loadConfig(): DesktopConfig {
  try {
    const file = configPath()
    const text = readFileSync(file, 'utf8')
    return normalizeConfig(JSON.parse(text))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: DesktopConfig): DesktopConfig {
  const normalized = normalizeConfig(config)
  try {
    mkdirSync(path.dirname(configPath()), { recursive: true })
    writeFileSync(configPath(), JSON.stringify(normalized, null, 2), 'utf8')
  } catch {
    // A read-only profile must not take the app down; the in-memory value stays.
  }
  return normalized
}
