#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Build a portable distribution *without* electron-builder's code-signing step.
 *
 * Why this exists: `electron-builder --win` downloads a `winCodeSign` archive and
 * extracts it. That archive contains macOS `.dylib` **symlinks**, and creating a
 * symlink on Windows needs either Administrator rights or Developer Mode. On a
 * machine with neither, the extraction fails and packaging aborts even though
 * nothing about this app needs those files.
 *
 * This script assembles the same layout by hand:
 *
 *   release/PJSK-Sticker-Companion-win-x64/
 *     PJSK-Sticker-Companion.exe   copied from the installed Electron runtime
 *     resources/app/               main, preload, renderer
 *     resources/assets/img/        sticker art
 *     resources/helper/            QqHelper.exe
 *
 * The result runs directly with no installer, no admin rights and no network.
 * For a signed NSIS installer, run `npm run desktop:dist` as Administrator or
 * with Developer Mode enabled.
 */

import { cp, mkdir, rm, copyFile, readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'desktop-dist')
const outDir = path.join(root, 'release', 'PJSK-Sticker-Companion-win-x64')

/** Locate the Electron runtime downloaded by the `electron` package. */
function electronRoot() {
  try {
    // The `electron` package's main export is the absolute path to electron.exe.
    return path.dirname(require('electron'))
  } catch (error) {
    throw new Error(
      `找不到 Electron 运行时（${error.message}）。请先运行 npm install；` +
        '若下载被网络拦截，可设置 ELECTRON_MIRROR 后重试。'
    )
  }
}

async function main() {
  if (!existsSync(path.join(dist, 'main', 'main.cjs'))) {
    throw new Error('desktop-dist 未构建，请先运行 npm run desktop:build')
  }
  const electron = electronRoot()
  if (!existsSync(path.join(electron, 'electron.exe'))) {
    throw new Error(`Electron 运行时缺少 electron.exe：${electron}`)
  }

  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  // 1. The Electron runtime, minus the starter app it ships with.
  for (const entry of await readdir(electron, { withFileTypes: true })) {
    if (entry.name === 'resources') continue
    await cp(path.join(electron, entry.name), path.join(outDir, entry.name), { recursive: true })
  }
  const electronResources = path.join(electron, 'resources')
  if (existsSync(electronResources)) {
    await mkdir(path.join(outDir, 'resources'), { recursive: true })
    for (const entry of await readdir(electronResources, { withFileTypes: true })) {
      if (entry.name === 'default_app.asar') continue
      await cp(
        path.join(electronResources, entry.name),
        path.join(outDir, 'resources', entry.name),
        { recursive: true }
      )
    }
  }

  /*
   * 2. The app itself, laid out where the main process looks for it.
   *
   * `resolveHelperPath()` and the `app://` handler search
   * `process.resourcesPath`, i.e. `<install>/resources`, so the assets and the
   * helper go there rather than inside `app/`.
   */
  const appDir = path.join(outDir, 'resources', 'app')
  await mkdir(appDir, { recursive: true })
  for (const part of ['main', 'renderer']) {
    await cp(path.join(dist, part), path.join(appDir, part), { recursive: true })
  }
  /*
   * A *purpose-built* manifest, not a copy of the repository one.
   *
   * Electron resolves the entry point from this file, and the repository
   * `package.json` points at `desktop-dist/main/main.cjs` — a path that does not
   * exist inside `resources/app`. It is also `"type": "module"`, which would make
   * Electron treat the bundled `main.cjs` as ESM. Both are fixed here.
   */
  const repoManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  await writeFile(
    path.join(appDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'pjsk-sticker-companion',
        productName: 'PJSK-Sticker-Companion',
        version: repoManifest.version ?? '1.0.0',
        description: repoManifest.description ?? 'PJSK sticker companion for QQ',
        license: repoManifest.license ?? 'AGPL-3.0-only',
        author: repoManifest.author ?? 'The 25-ji-code-de Team',
        main: 'main/main.cjs',
        type: 'commonjs',
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  await cp(path.join(dist, 'assets'), path.join(outDir, 'resources', 'assets'), { recursive: true })
  if (existsSync(path.join(dist, 'helper'))) {
    await cp(path.join(dist, 'helper'), path.join(outDir, 'resources', 'helper'), {
      recursive: true,
    })
  }

  // 3. A launcher named after the product, so the process name reads correctly.
  const exe = path.join(outDir, 'PJSK-Sticker-Companion.exe')
  await copyFile(path.join(outDir, 'electron.exe'), exe)

  const size = (await stat(exe)).size
  console.log(`便携版目录：${outDir}`)
  console.log(`启动文件：${exe} (${Math.round(size / 1024 / 1024)} MB)`)
  console.log('直接双击即可运行，无需安装、无需管理员权限、无需联网。')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
