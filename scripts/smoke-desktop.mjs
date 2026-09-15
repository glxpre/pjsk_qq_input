#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * End-to-end self-check for a built desktop app.
 *
 * What it proves that unit tests cannot:
 *   - the packaged layout works: `resources/app`, `resources/assets`, `resources/helper`;
 *   - the renderer finds `characters.json`, the 788 sticker images and the bundled
 *     fonts through the private `app://` protocol, with no network access;
 *   - the layout engine produces real, lossless output for six representative
 *     drafts and actually paints text and art pixels;
 *   - the configured global shortcuts can be registered on this machine;
 *   - quitting releases the shortcuts and terminates the QQ helper process.
 *
 * Usage:
 *   node scripts/smoke-desktop.mjs                   # the packaged build
 *   node scripts/smoke-desktop.mjs --dev             # the repo's electron runtime
 *   node scripts/smoke-desktop.mjs --exe <path>      # any built exe
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

const argExe = process.argv.includes('--exe')
  ? process.argv[process.argv.indexOf('--exe') + 1]
  : null
const useDev = process.argv.includes('--dev')

/** The command to run, plus the arguments that precede our flags. */
function resolveTarget() {
  if (argExe) return { command: path.resolve(argExe), prefix: [] }
  if (useDev) return { command: require('electron'), prefix: [root] }
  if (!existsSync(packagedExe)) {
    console.error(`找不到便携版：${packagedExe}\n请先运行 npm run desktop:pack，或改用 --dev。`)
    process.exit(2)
  }
  return { command: packagedExe, prefix: [] }
}

/** Count live processes by image name (Windows only; 0 elsewhere). */
function helperProcessCount() {
  if (process.platform !== 'win32') return 0
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-Process -Name QqHelper -ErrorAction SilentlyContinue | Measure-Object).Count',
    ],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  const parsed = Number.parseInt((result.stdout || '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Wait until the process exits or the deadline passes. */
function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return resolve({ code: child.exitCode, timedOut: false })
    }
    const timer = setTimeout(() => resolve({ code: null, timedOut: true }), timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve({ code, timedOut: false })
    })
  })
}

const { command, prefix } = resolveTarget()
const workDir = mkdtempSync(path.join(tmpdir(), 'pjsk-smoke-'))
const reportPath = path.join(workDir, 'report.json')
const logPath = path.join(workDir, 'app.log')

// A watchdog, so a hung app can never hide the report that was already written.
const watchdog = setTimeout(() => {
  console.error('自检脚本超时（180 秒）：应用没有按预期退出')
  process.exit(3)
}, 180_000)

const before = helperProcessCount()
console.log(`运行：${command}`)
const logFd = openSync(logPath, 'a')
const child = spawn(
  command,
  [...prefix, '--enable-logging', '--smoke-test', `--smoke-out=${reportPath}`],
  { stdio: ['ignore', logFd, logFd], windowsHide: true }
)
const { code, timedOut } = await waitForExit(child, 90_000)

// The helper is a child of the app; give Windows a moment to reap it.
await new Promise((resolve) => setTimeout(resolve, 1200))
const after = helperProcessCount()

const failures = []
if (timedOut) {
  child.kill()
  failures.push('自检超时（90 秒）：应用没有退出，可能没有释放资源')
}
if (!existsSync(reportPath)) {
  failures.push(`没有生成自检报告：${reportPath}`)
} else {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  const { main, renderer } = report

  console.log(`\n退出码：${code} 自检结论：${report.ok ? '通过' : '失败'}`)
  console.log(`已打包：${main.packaged} Electron ${main.electron} ${main.platform}`)
  console.log(
    `资源目录：${main.assetsDir}\n  characters.json=${main.charactersJson} 图片=${main.imageCount} 托盘图标=${main.trayCreated}`
  )
  console.log(`辅助程序：${main.helperPath}（存在=${main.helperExists}）`)
  console.log(
    `快捷键：插入=${main.shortcutActive.insert ?? '未注册'} 读取选区=${main.shortcutActive.capture ?? '未注册'}` +
      ` 退出时已释放=${main.shortcutsReleasedOnExit}`
  )
  for (const note of main.shortcutActive.notes ?? []) console.log(`  · ${note}`)
  console.log(`QQ：运行=${main.helper.running} 版本=${main.helper.version || '未知'}`)
  console.log(`实时模式：${report.liveModeNote}`)
  console.log(
    `渲染进程：模板 ${renderer.templates} 个，字体就绪=${renderer.fontsReady}` +
      `，素材 ${renderer.image ? `${renderer.image.width}x${renderer.image.height}` : '未加载'}`
  )
  console.log('\n排版实拍：')
  for (const entry of renderer.cases ?? []) {
    console.log(
      `  ${entry.name.padEnd(10)} ${String(entry.inputLength).padStart(4)} 字 → ` +
        `${entry.pages} 张/${entry.lines} 行 @${entry.fontSize}px（模板 ${entry.templateFontSize}px）` +
        ` 策略=${entry.strategy} 原文完整=${entry.lossless} 连续分页=${entry.contiguous}` +
        ` 字符完整=${entry.intact} 未裁切=${entry.withinCanvas} 缓存稳定=${entry.cacheStable}` +
        ` 用时=${entry.durationMs}ms 文字像素=${entry.textInkPixels}` +
        ` 画布=${entry.canvasWidth}x${entry.canvasHeight} 行宽=[${(entry.lineWidths ?? [])
          .map((value) => value.toFixed(0))
          .join(', ')}]` +
        `${entry.overLimit ? ` 超页数上限（约需 ${entry.estimatedPages} 张）` : ''}`
    )
    for (const line of entry.sampleLines ?? []) console.log(`         | ${line}`)
  }
  if (report.errors?.length) {
    console.log('\n问题：')
    for (const message of report.errors) console.log(`  - ${message}`)
  }
  if (!report.ok) failures.push('自检报告判定为失败')
}

if (after > before) {
  failures.push(`退出后仍有 ${after - before} 个 QqHelper 进程在运行（未完全停止）`)
} else {
  console.log(`\nQQ 辅助进程：退出后剩余 ${after} 个（启动前 ${before} 个）`)
}

// Chromium's own log: CSP violations, failed module loads and renderer crashes
// only show up here, and they are exactly what breaks an installed build.
try {
  closeSync(logFd)
  const log = readFileSync(logPath, 'utf8')
  const interesting = log
    .split(/\r?\n/u)
    .filter((line) => /ERROR:|Uncaught|refused to|violates|access denied|renderer crash/iu.test(line))
  if (interesting.length > 0) {
    console.log('\n应用日志中的错误行：')
    for (const line of interesting.slice(-20)) console.log(`  ${line}`)
  }
} catch {
  /* no log is not a failure */
}

rmSync(workDir, { recursive: true, force: true })
clearTimeout(watchdog)

if (failures.length > 0) {
  console.error('\n自检未通过：')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log('\n自检通过。')
