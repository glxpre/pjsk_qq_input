// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Tests for the desktop main-process logic that is pure enough to check without
 * Electron: settings normalisation and persistence, and the clipboard race
 * handling.
 *
 * The clipboard tests are the ones that matter most: the feature request calls
 * out, explicitly, that the app must not mistake stale clipboard contents for
 * the user's selection, must not restore a backup over something the user copied
 * afterwards, and must not describe a synthesised Ctrl+V as a confirmed insert.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  DEFAULT_CONFIG,
  loadConfig,
  normalizeConfig,
  saveConfig,
  setUserDataDir,
} from '../desktop/main/config.ts'
import {
  insertClipboardImage,
  snapshotClipboard,
  verifyPaste,
} from '../desktop/main/clipboardBridge.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('defaults are complete and safe', () => {
  assert.equal(DEFAULT_CONFIG.enabled, true, 'integration is on by default once launched')
  assert.equal(DEFAULT_CONFIG.recordHistory, false, 'history is opt-in')
  assert.equal(DEFAULT_CONFIG.whiteBackground, false, 'PNG stays transparent by default')
  assert.equal(DEFAULT_CONFIG.minFontSize, 22)
  assert.equal(DEFAULT_CONFIG.maxLines, 3)
  assert.equal(DEFAULT_CONFIG.debounceMs, 500)
  assert.match(DEFAULT_CONFIG.insertShortcut, /Control\+Alt\+S/)
})

test('normalizeConfig fills every field from an empty object', () => {
  assert.deepEqual(normalizeConfig({}), DEFAULT_CONFIG)
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG)
  assert.deepEqual(normalizeConfig(undefined), DEFAULT_CONFIG)
})

test('normalizeConfig clamps out-of-range numbers instead of trusting them', () => {
  const config = normalizeConfig({
    debounceMs: -100,
    minFontSize: 999,
    maxLines: 0,
    maxPages: -3,
    exportScale: 99,
    templateIndex: -5,
  })
  assert.equal(config.debounceMs, 0)
  assert.equal(config.minFontSize, 64)
  assert.equal(config.maxLines, 1)
  assert.equal(config.maxPages, 1)
  assert.equal(config.exportScale, 4)
  assert.equal(config.templateIndex, 0)
})

test('normalizeConfig ignores wrong types rather than coercing them', () => {
  const config = normalizeConfig({
    enabled: 'yes',
    insertShortcut: 42,
    whiteBackground: 'true',
    debounceMs: '500',
  } as unknown as Partial<typeof DEFAULT_CONFIG>)
  assert.equal(config.enabled, DEFAULT_CONFIG.enabled)
  assert.equal(config.insertShortcut, DEFAULT_CONFIG.insertShortcut)
  assert.equal(config.whiteBackground, DEFAULT_CONFIG.whiteBackground)
  assert.equal(config.debounceMs, DEFAULT_CONFIG.debounceMs)
})

test('an unknown future field does not break loading', () => {
  const config = normalizeConfig({ somethingNew: 1, enabled: false } as never)
  assert.equal(config.enabled, false)
  assert.equal(config.maxLines, DEFAULT_CONFIG.maxLines)
})

test('a missing config file loads defaults', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sekai-cfg-'))
  setUserDataDir(dir)
  assert.deepEqual(loadConfig(), DEFAULT_CONFIG)
})

test('a corrupt config file loads defaults instead of throwing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sekai-cfg-'))
  setUserDataDir(dir)
  writeFileSync(path.join(dir, 'desktop-config.json'), '{ this is not json', 'utf8')
  assert.deepEqual(loadConfig(), DEFAULT_CONFIG)
})

test('saving and loading round-trips, and the file is human-readable JSON', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sekai-cfg-'))
  setUserDataDir(dir)
  const saved = saveConfig({ ...DEFAULT_CONFIG, templateIndex: 7, minFontSize: 26 })
  assert.equal(saved.templateIndex, 7)
  const file = path.join(dir, 'desktop-config.json')
  assert.ok(existsSync(file))
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(onDisk.templateIndex, 7)
  assert.equal(onDisk.minFontSize, 26)
  assert.equal(loadConfig().templateIndex, 7)
})

test('the saved config never contains draft text or history', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sekai-cfg-'))
  setUserDataDir(dir)
  saveConfig({ ...DEFAULT_CONFIG, templateIndex: 3 })
  const text = readFileSync(path.join(dir, 'desktop-config.json'), 'utf8')
  for (const forbidden of ['draft', 'history', 'lastText', 'clipboard']) {
    assert.equal(text.includes(forbidden), false, `config must not persist "${forbidden}"`)
  }
})

// ---------------------------------------------------------------------------
// Clipboard race handling
// ---------------------------------------------------------------------------

test('snapshotClipboard records the pre-capture state', () => {
  const snapshot = snapshotClipboard(true, 'old text', 4)
  assert.deepEqual(snapshot, { text: 'old text', token: 4, hasImage: true })
})

test('insertClipboardImage writes the image then sends exactly one paste', () => {
  const written: unknown[] = []
  let pastes = 0
  const result = insertClipboardImage({
    dataUrl: 'data:image/png;base64,AAAA',
    createImage: () => ({ tag: 'image' }),
    writeImage: (image) => written.push(image),
    sendPaste: () => {
      pastes += 1
      return true
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.pasteSent, true)
  assert.deepEqual(written, [{ tag: 'image' }])
  assert.equal(pastes, 1)
})

test('a paste that could not be delivered is reported as copied-only', () => {
  const result = insertClipboardImage({
    dataUrl: 'data:image/png;base64,AAAA',
    createImage: () => ({}),
    writeImage: () => {},
    sendPaste: () => false,
  })
  assert.equal(result.ok, true, 'the copy itself succeeded')
  assert.equal(result.pasteSent, false)
  assert.match(result.error, /Ctrl\+V/)
})

test('a clipboard write failure is reported and no paste is attempted', () => {
  let pastes = 0
  const result = insertClipboardImage({
    dataUrl: 'bad',
    createImage: () => {
      throw new Error('decode failed')
    },
    writeImage: () => {},
    sendPaste: () => {
      pastes += 1
      return true
    },
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /decode failed/)
  assert.equal(pastes, 0)
})

test('verifyPaste only reports success when the target still owns focus', async () => {
  const focused = await verifyPaste({
    readText: () => '',
    readToken: () => 1,
    confirm: async () => ({ ok: true, reason: '' }),
    wait: async () => {},
  })
  assert.equal(focused.ok, true)

  const moved = await verifyPaste({
    readText: () => '',
    readToken: () => 1,
    confirm: async () => ({ ok: false, reason: 'QQ 输入框已不再是焦点' }),
    wait: async () => {},
  })
  assert.equal(moved.ok, false)
  assert.match(moved.reason, /焦点/)

  const unknown = await verifyPaste({
    readText: () => '',
    readToken: () => 1,
    confirm: async () => null,
    wait: async () => {},
  })
  assert.equal(unknown.ok, false, 'a helper that cannot answer is not evidence of success')
})

test('verifyPaste waits before checking, so QQ has time to render the paste', async () => {
  const waits: number[] = []
  await verifyPaste({
    readText: () => '',
    readToken: () => 1,
    confirm: async () => ({ ok: true, reason: '' }),
    wait: async (ms) => {
      waits.push(ms)
    },
  })
  assert.equal(waits.length, 1)
  assert.ok(waits[0] >= 100, `expected a real settle delay, got ${waits[0]}ms`)
})
