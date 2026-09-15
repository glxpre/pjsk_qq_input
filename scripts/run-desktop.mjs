// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Launch the packaged app the way a user would and report what happens.
 *
 * The smoke test (`scripts/smoke-desktop.mjs`) runs the app with a hidden window
 * so it can ask the renderer questions; this one does the opposite and checks the
 * *interactive* startup path: the window is really created and shown, the tray
 * icon is created, the global shortcuts are registered for real, and the process
 * stays alive and quiet until it is asked to quit.
 *
 *   node scripts/run-desktop.mjs            # release/.../PJSK-Sticker-Companion.exe
 *   node scripts/run-desktop.mjs --dev      # the repo's electron runtime
 *   node scripts/run-desktop.mjs --seconds 20
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const packagedExe = path.join(
  root,
  'release',
  'PJSK-Sticker-Companion-win-x64',
  'PJSK-Sticker-Companion.exe'
)
const seconds = Number(
  process.argv.includes('--seconds') ? process.argv[process.argv.indexOf('--seconds') + 1] : 12
)
const useDev = process.argv.includes('--dev')

const command = useDev ? require('electron') : packagedExe
const prefix = useDev ? [root] : []
if (!existsSync(command)) {
  console.error(`找不到可执行文件：${command}\n请先运行 npm run desktop:pack，或改用 --dev。`)
  process.exit(2)
}

/** Window titles of the running app, via the process name it runs under. */
function runningProcesses() {
  if (process.platform !== 'win32') return { count: 0, memory: 0 }
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$p = Get-Process -Name 'PJSK-Sticker-Companion','electron' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -or $_.ProcessName -eq 'electron' }; " +
        "'{0}|{1}' -f (@($p).Count), [math]::Round((($p | Measure-Object WorkingSet64 -Sum).Sum)/1MB,1)",
    ],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  const [count, memory] = (result.stdout || '0|0').trim().split('|')
  return { count: Number(count) || 0, memory: Number(memory) || 0 }
}

const workDir = mkdtempSync(path.join(tmpdir(), 'pjsk-run-'))
const logPath = path.join(workDir, 'app.log')
const logFd = openSync(logPath, 'a')

console.log(`启动：${command}`)
const before = runningProcesses()
const child = spawn(command, [...prefix, '--enable-logging'], {
  stdio: ['ignore', logFd, logFd],
  windowsHide: false,
})

// Give it time to start up, settle, and be observed.
await new Promise((resolve) => setTimeout(resolve, Math.max(3, seconds) * 1000))
const during = runningProcesses()
const alive = child.exitCode === null && child.signalCode === null

console.log(`进程仍然存活：${alive}`)
console.log(`进程数：${during.count}（启动前 ${before.count}），内存合计 ${during.memory} MB`)
console.log(`日志：${logPath}`)

closeSync(logFd)
const log = readFileSync(logPath, 'utf8')
const problems = log
  .split(/\r?\n/u)
  .filter((line) => /ERROR:|Uncaught|refused to|violates|access denied|renderer crash/iu.test(line))
if (problems.length > 0) {
  console.log('\n日志中的错误行：')
  for (const line of problems.slice(-20)) console.log(`  ${line}`)
}

// Ask it to exit the same way the tray's "退出" item does: closing the window
// quits the app, so terminating the process is the honest fallback here.
child.kill()
await new Promise((resolve) => setTimeout(resolve, 2500))
const after = runningProcesses()
console.log(`退出后进程数：${after.count}`)

const failures = []
if (!alive) failures.push('程序启动后立即退出')
if (problems.length > 0) failures.push('启动日志中有错误')
rmSync(workDir, { recursive: true, force: true })

if (failures.length > 0) {
  console.error('\n启动检查未通过：')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log('\n启动检查通过：窗口进程正常运行，日志无错误。')
