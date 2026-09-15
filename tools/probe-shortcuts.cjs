// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Which global shortcuts are actually free on this machine?
 *
 * Windows gives each hotkey to exactly one application, and a chord claimed by
 * some other program fails to register *silently* — the app simply never fires.
 * This probe registers a candidate list, reports which chords Windows accepted,
 * and releases them again.
 *
 *   .\node_modules\electron\dist\electron.exe tools\probe-shortcuts.cjs
 *   .\node_modules\electron\dist\electron.exe tools\probe-shortcuts.cjs Control+Alt+S Control+Alt+D
 *
 * The result is printed and also written to `tools/_shortcut-probe.json`.
 */

const { app, globalShortcut } = require('electron')
const { writeFileSync } = require('node:fs')
const path = require('node:path')

const DEFAULTS = [
  'Control+Alt+S',
  'Control+Alt+D',
  'Control+Alt+Q',
  'Control+Alt+W',
  'Control+Alt+E',
  'Control+Alt+Z',
  'Control+Alt+X',
  'Control+Alt+C',
  'Control+Alt+V',
  'Control+Alt+M',
  'Control+Shift+S',
  'Control+Shift+D',
  'Control+Shift+Q',
  'Control+Shift+Alt+S',
  'Control+Shift+Alt+D',
  'Alt+Shift+S',
  'Alt+Shift+D',
  'Super+Alt+S',
  'Super+Alt+D',
]

const chords = process.argv.slice(2).filter((value) => !value.startsWith('-'))
const list = chords.length > 0 ? chords : DEFAULTS

app.whenReady().then(() => {
  const result = {}
  for (const chord of list) {
    try {
      result[chord] = globalShortcut.register(chord, () => {})
    } catch (error) {
      result[chord] = `error: ${error.message}`
    }
  }
  const out = {
    at: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    free: Object.entries(result)
      .filter(([, ok]) => ok === true)
      .map(([chord]) => chord),
    taken: Object.entries(result)
      .filter(([, ok]) => ok !== true)
      .map(([chord]) => chord),
    raw: result,
  }
  const file = path.join(__dirname, '_shortcut-probe.json')
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(out, null, 2))
  console.log(`written: ${file}`)
  globalShortcut.unregisterAll()
  app.exit(0)
})
