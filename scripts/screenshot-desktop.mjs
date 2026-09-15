// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Produce the screenshots used by the README.
 *
 * It launches the real app, fills the draft box with a sample and saves two
 * files into `docs/`:
 *
 *   docs/desktop-app.png       the window as a user sees it
 *   docs/example-sticker.png   the sticker the app generated for that draft
 *
 * The sticker is not a mock-up: it is the exact PNG the app hands to the
 * clipboard, taken from the same preview payload the floating preview receives.
 *
 *   node scripts/screenshot-desktop.mjs           # packaged build
 *   node scripts/screenshot-desktop.mjs --dev     # repo electron runtime
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outDir = path.join(root, 'docs')
const packagedExe = path.join(
  root,
  'release',
  'PJSK-Sticker-Companion-win-x64',
  'PJSK-Sticker-Companion.exe'
)
const useDev = process.argv.includes('--dev')
const command = useDev ? require('electron') : packagedExe
const prefix = useDev ? [root] : []

if (!existsSync(command)) {
  console.error(`找不到可执行文件：${command}\n请先运行 npm run desktop:pack，或改用 --dev。`)
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
console.log(`启动：${command}`)
const child = spawn(command, [...prefix, `--screenshot-dir=${outDir}`], { stdio: 'inherit' })

const code = await new Promise((resolve) => child.once('exit', resolve))
if (code !== 0) {
  console.error(`截图进程退出码 ${code}`)
  process.exit(1)
}

const expected = ['desktop-app.png', 'example-sticker.png']
let failed = false
for (const name of expected) {
  const file = path.join(outDir, name)
  if (!existsSync(file) || statSync(file).size < 2000) {
    console.error(`缺少或过小：${file}`)
    failed = true
    continue
  }
  console.log(`${name}  ${Math.round(statSync(file).size / 1024)} KB`)
}
if (failed) process.exit(1)
console.log(`截图已更新：${outDir}`)
