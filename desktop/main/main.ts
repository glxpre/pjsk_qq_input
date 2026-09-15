// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Electron main process for the PJSK sticker companion.
 *
 * Responsibilities:
 *   - own the single application instance, the tray, and the global shortcuts;
 *   - own the QQ helper child process and expose it to the renderer;
 *   - own the clipboard on the safe paths (writing the sticker, reading a
 *     one-shot captured selection, pasting into the verified QQ editor);
 *   - persist user settings and the last chosen template.
 *
 * It deliberately does **not** read QQ's input box itself. Everything QQ-related
 * goes through the helper, which reports honestly when UI Automation cannot see
 * QQ; the app then offers the shortcut compatibility mode instead of pretending
 * live reading works.
 */

import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, dialog, shell, protocol } from 'electron'
import path from 'node:path'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

import { loadConfig, saveConfig, setUserDataDir, DEFAULT_CONFIG, type DesktopConfig } from './config.js'
import { QqHelper, type HelperStatus } from './qqHelper.js'
import { insertClipboardImage, verifyPaste } from './clipboardBridge.js'
import {
  collectMainFacts,
  shortcutResults,
  writeSmokeReport,
  type MainSmokeFacts,
} from './smoke.js'
import { nativeImage } from 'electron'

/**
 * Self-check mode.
 *
 * `PJSK-Sticker-Companion.exe --smoke-test` starts the real app, asks the real
 * renderer to load its real assets, writes one JSON report and exits. It is the
 * only way to verify an *installed* build — resource paths, the `app://` scheme,
 * bundled fonts and offline art are all invisible to unit tests.
 */
const SMOKE_MODE = process.argv.includes('--smoke-test')
const SMOKE_OUT = (() => {
  const flag = process.argv.find((value) => value.startsWith('--smoke-out='))
  if (flag) return flag.slice('--smoke-out='.length)
  return path.join(app.getPath('temp'), 'pjsk-sticker-smoke.json')
})()

/**
 * Documentation-screenshot mode.
 *
 * `--screenshot-dir=<dir>` fills the draft box with a sample, waits for the
 * preview to be painted, then writes `desktop-app.png` (the window) and
 * `example-sticker.png` (the sticker the app actually produced) into that
 * directory. Used by `scripts/screenshot-desktop.mjs` so the README shows real
 * output instead of a mock-up — the sticker it saves is the exact PNG the app
 * would put on the clipboard.
 */
const SCREENSHOT_DIR = (() => {
  const flag = process.argv.find((value) => value.startsWith('--screenshot-dir='))
  return flag ? flag.slice('--screenshot-dir='.length) : null
})()

/** The draft the screenshot shows, chosen to look like a real chat sticker. */
const SCREENSHOT_DRAFT = '今天也要加油！'

/** Last sticker the renderer pushed for the floating preview, as a PNG data URL. */
let lastPreviewDataUrl: string | null = null

/** Resolves when the renderer answers the `smoke` command. */
let smokeResolve: ((report: unknown) => void) | null = null
/** Main-process facts, kept so progress reports can include them. */
let smokeFacts: MainSmokeFacts | null = null
/** Which shortcuts are live, reported by the self-check and shown in the UI. */
let shortcutStatus: ShortcutStatus = {
  insert: null,
  capture: null,
  preferred: { insert: DEFAULT_CONFIG.insertShortcut, capture: DEFAULT_CONFIG.captureShortcut },
  notes: [],
}

/** Everything the renderer is allowed to ask for. */
interface DesktopState {
  config: DesktopConfig
  helper: HelperStatus
  shortcut: ShortcutStatus
}

/** Which chords are actually live right now, and what had to be substituted. */
export interface ShortcutStatus {
  /** Chord registered for "insert the sticker", or `null` if none could be. */
  insert: string | null
  /** Chord registered for "read the selected text", or `null`. */
  capture: string | null
  /** The chords the user configured. */
  preferred: { insert: string; capture: string }
  /** Human-readable substitutions, shown in the UI instead of failing silently. */
  notes: string[]
}

/**
 * Chords tried, in order, when the configured one is already owned by another
 * program. Windows hands a hotkey to exactly one application and
 * `globalShortcut.register` simply returns false for the loser, so without a
 * fallback the feature would appear broken with no explanation.
 */
const SHORTCUT_FALLBACKS: Record<'insert' | 'capture', string[]> = {
  insert: ['Control+Shift+Alt+S', 'Alt+Shift+S', 'Control+Shift+S', 'Control+Alt+Q'],
  capture: ['Control+Shift+Alt+D', 'Alt+Shift+D', 'Control+Shift+Q', 'Control+Alt+W'],
}

/**
 * Renderer root. The desktop build emits `desktop-dist/main/main.cjs` and
 * `desktop-dist/renderer/index.html`, so they are siblings.
 */
const DIST_DIR = path.join(__dirname, '..')

/**
 * Where the sticker assets live.
 *
 * Two layouts have to work:
 *   - development / `desktop-dist`: `<dist>/assets`;
 *   - a packaged build: `<install>/resources/assets`, which is where
 *     electron-builder's `extraResources` and `scripts/package-portable.mjs`
 *     both put the 788 sticker images (they stay outside `app/` so they are not
 *     re-packed into the asar).
 *
 * The directory is probed for `characters.json` rather than assumed, because a
 * wrong guess silently disables both the art and the tray icon.
 */
function resolveAssetsDir(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'assets'),
    path.join(DIST_DIR, 'assets'),
    path.join(DIST_DIR, '..', 'desktop-dist', 'assets'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, 'characters.json'))) return candidate
  }
  return candidates[1]
}

const ASSETS_DIR = resolveAssetsDir()

/**
 * `app://` protocol for the bundled assets.
 *
 * `file://` cannot be fetched by the renderer (Chromium blocks it), which would
 * break `characters.json` and every sticker image. Serving `desktop-dist/assets`
 * over a private scheme keeps the renderer's normal `fetch`/`<img>` code paths
 * working and pins them to the packaged files, so an installed copy needs no
 * network at all.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])

/** Minimal content types for the files the renderer asks for. */
const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8',
}

function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    // `app://assets/img/miku/miku_01.webp`: `standard: true` parsing puts the
    // first segment in `host`, so only the path is joined onto the asset root —
    // joining the host too would look for `<assets>/assets/...` and 404.
    if (url.host !== 'assets') return new Response('not found', { status: 404 })
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const normalized = path.resolve(path.join(ASSETS_DIR, relative))

    // Refuse to escape the assets directory.
    if (normalized !== path.resolve(ASSETS_DIR) && !normalized.startsWith(path.resolve(ASSETS_DIR) + path.sep)) {
      return new Response('forbidden', { status: 403 })
    }

    try {
      const body = await readFile(normalized)
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': MIME_TYPES[path.extname(normalized).toLowerCase()] ?? 'application/octet-stream',
          // The page itself loads from `file://`, so every asset request is
          // cross-origin and `fetch()` needs this to succeed.
          'access-control-allow-origin': '*',
          'cache-control': 'no-cache',
        },
      })
    } catch (error) {
      return new Response(`not found: ${(error as Error).message}`, { status: 404 })
    }
  })
}

let mainWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** Whether the tray icon could be created (reported by the self-check). */
let trayCreated = false
let helper: QqHelper | null = null
let config: DesktopConfig = { ...DEFAULT_CONFIG }
let quitting = false

/** Live status, refreshed on a timer and on demand. */
let helperStatus: HelperStatus = {
  available: false,
  running: false,
  version: '',
  windowCount: 0,
  elementCount: 0,
  liveReadSupported: false,
  // Deliberately not a verdict: the helper has not answered yet, and saying
  // "unavailable" before asking would be a claim the app cannot support.
  reason: '正在检测 QQ…',
  draft: null,
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function rendererUrl(): { url?: string; file?: string } {
  const devServer = process.env.SEKAI_DESKTOP_DEV_SERVER
  if (devServer) return { url: devServer }
  return { file: path.join(DIST_DIR, 'renderer/index.html') }
}

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: '#1f1c1d',
    title: 'PJSK 贴纸伴侣',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const target = rendererUrl()
  if (target.url) mainWindow.loadURL(target.url)
  else mainWindow.loadFile(target.file!)

  // In self-check mode the window stays hidden: the renderer still loads and
  // runs, but nothing flashes on screen. Screenshot mode needs it visible.
  mainWindow.once('ready-to-show', () => {
    if (!SMOKE_MODE || SCREENSHOT_DIR) mainWindow?.show()
  })
  /*
   * Push the state once the renderer is actually listening.
   *
   * The helper is started in parallel with the window, so its first status can
   * land either before or after the renderer subscribes. Re-pushing on load closes
   * that race: without it the UI could keep showing "QQ 未运行" for the whole
   * session, because the periodic poll only pushes on a *change*.
   */
  mainWindow.webContents.on('did-finish-load', () => pushState())
  // Closing the window quits the app; minimise-to-tray is a separate action so
  // the behaviour is never surprising.
  mainWindow.on('close', () => {
    if (quitting) return
    quitting = true
    app.quit()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// Live preview window
// ---------------------------------------------------------------------------

/**
 * Floating preview for live mode.
 *
 * `focusable: false` plus `showInactive()` is what keeps QQ's input focus: the
 * window can be seen and updated but never activated, so the user keeps typing
 * without the caret jumping out of QQ.
 */
function createPreviewWindow(): BrowserWindow {
  if (previewWindow && !previewWindow.isDestroyed()) return previewWindow
  previewWindow = new BrowserWindow({
    width: 340,
    height: 300,
    show: false,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    resizable: true,
    alwaysOnTop: true,
    backgroundColor: '#18161700',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  void previewWindow.loadFile(path.join(DIST_DIR, 'renderer/preview.html'))
  previewWindow.on('closed', () => {
    previewWindow = null
  })
  return previewWindow
}

/** Show or update the preview without activating it. */
function pushPreview(dataUrl: string | null, label: string): void {
  // Remembered so screenshot mode can save the exact PNG the app produced.
  if (dataUrl) lastPreviewDataUrl = dataUrl
  const target = createPreviewWindow()
  const send = (): void => {
    if (!target || target.isDestroyed()) return
    if (dataUrl) target.webContents.send('preview:show', dataUrl, label)
    else target.webContents.send('preview:clear', label)
    if (!target.isVisible()) target.showInactive()
  }
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', send)
  else send()
}

function hidePreview(): void {
  if (previewWindow && !previewWindow.isDestroyed()) previewWindow.hide()
}

function createTray(): void {
  const iconPath = path.join(ASSETS_DIR, 'tray.png')
  const fallback = path.join(ASSETS_DIR, 'icon.png')
  if (!existsSync(iconPath) && !existsSync(fallback)) return
  try {
    tray = new Tray(existsSync(iconPath) ? iconPath : fallback)
    trayCreated = true
  } catch {
    return
  }
  refreshTray()
  tray.on('double-click', () => createMainWindow())
}

function refreshTray(): void {
  if (!tray) return
  const mode = helperStatus.liveReadSupported ? '实时模式可用' : '快捷键模式（实时不可用）'
  const chord = shortcutStatus.capture || config.captureShortcut
  const insert = shortcutStatus.insert || config.insertShortcut
  tray.setToolTip(
    `PJSK 贴纸伴侣 — ${config.enabled ? '已启用' : '已暂停'}\n${mode}\n` +
      `插入 ${insert} · 读取选区 ${chord}`
  )
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => createMainWindow() },
      { type: 'separator' },
      {
        label: config.enabled ? '暂停联动' : '启用联动',
        click: () => {
          const next = !config.enabled
          config = saveConfig({ ...config, enabled: next })
          pushState()
          syncShortcuts()
          // Pausing must stop the interaction immediately: cancel the preview and
          // tell the renderer to drop any in-flight task.
          if (!next) {
            hidePreview()
            mainWindow?.webContents.send('desktop:command', { type: 'pause' })
          }
        },
      },
      { label: helperStatus.liveReadSupported ? 'QQ 实时读取：可用' : 'QQ 实时读取：不可用', enabled: false },
      { label: `QQ ${helperStatus.version || '未检测到'}`, enabled: false },
      ...shortcutStatus.notes.map((note) => ({ label: note, enabled: false })),
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
  )
}

// ---------------------------------------------------------------------------
// State plumbing
// ---------------------------------------------------------------------------

function pushState(): void {
  const state: DesktopState = { config, helper: helperStatus, shortcut: shortcutStatus }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:state', state)
  refreshTray()
}

function currentState(): DesktopState {
  return { config, helper: helperStatus, shortcut: shortcutStatus }
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------

/**
 * Register the configured shortcuts.
 *
 * `globalShortcut.register` returns false when another application already owns
 * the combination, which is reported to the UI rather than silently ignored.
 */
/**
 * Register the configured shortcuts, substituting a free chord on conflict.
 *
 * `globalShortcut.register` returns false when another application already owns
 * the combination. Rather than leaving the user with a hotkey that does nothing,
 * a small ladder of alternatives is tried and the substitution is reported to the
 * UI and the tray, so the behaviour is visible instead of mysterious.
 */
function syncShortcuts(): void {
  globalShortcut.unregisterAll()
  shortcutStatus = {
    insert: null,
    capture: null,
    preferred: { insert: config.insertShortcut, capture: config.captureShortcut },
    notes: [],
  }
  if (!config.enabled) return

  const taken = new Set<string>()

  const attempt = (
    role: 'insert' | 'capture',
    preferred: string,
    handler: () => void
  ): string | null => {
    const candidates: string[] = []
    for (const chord of [preferred, ...SHORTCUT_FALLBACKS[role]]) {
      if (chord && !candidates.includes(chord) && !taken.has(chord)) candidates.push(chord)
    }
    for (const chord of candidates) {
      let ok = false
      try {
        ok = globalShortcut.register(chord, handler)
      } catch {
        ok = false
      }
      if (!ok) continue
      taken.add(chord)
      if (chord !== preferred) {
        shortcutStatus.notes.push(`${preferred} 已被其他程序占用，本次运行改用 ${chord}`)
      }
      return chord
    }
    shortcutStatus.notes.push(`${preferred} 及其备选组合都不可用，请在设置里换一个组合`)
    return null
  }

  shortcutStatus.insert = attempt('insert', config.insertShortcut, () => {
    void runInsertShortcut()
  })
  shortcutStatus.capture = attempt('capture', config.captureShortcut, () => {
    void runCaptureShortcut()
  })

  pushState()
}

/** Insert shortcut: paste the current sticker into QQ, or ask for a capture. */
async function runInsertShortcut(): Promise<void> {
  if (!config.enabled || !mainWindow || mainWindow.isDestroyed()) return
  const hasSticker = await askRenderer<boolean>('desktop:hasSticker')
  if (hasSticker) {
    mainWindow.webContents.send('desktop:command', { type: 'insert' })
    return
  }
  await runCaptureShortcut()
}

/**
 * Capture shortcut.
 *
 * The capture itself lives in the renderer's IPC handler so the clipboard token
 * the renderer already holds is the one compared against; here we only ask the
 * window to run it. That keeps a single owner for the "did the clipboard really
 * change?" decision.
 */
async function runCaptureShortcut(): Promise<void> {
  if (!config.enabled || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('desktop:command', { type: 'capture' })
}

/** Round-trip a request to the renderer. */
function askRenderer<T>(channel: string): Promise<T | null> {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(null)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1500)
    ipcMain.once(`desktop:reply:${channel}`, (_event, payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
    mainWindow!.webContents.send(channel)
  })
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc(): void {
  ipcMain.handle('desktop:getState', () => currentState())

  /**
   * Live mode: read the QQ draft.
   *
   * Returns `{available: false}` when this QQ build does not expose its editor
   * through UI Automation; the UI then keeps the shortcut mode enabled instead
   * of pretending a draft was read.
   */
  ipcMain.handle('desktop:readLiveDraft', async () => {
    const status = helper ? await helper.status() : helperStatus
    helperStatus = status
    if (!status.liveReadSupported) {
      return {
        available: false,
        text: '',
        reason: status.reason || '当前 QQ 版本不支持通过 UI Automation 读取输入框',
      }
    }
    const focused = helper ? await helper.focusEditBox() : null
    if (!focused?.focused) {
      return { available: false, text: '', reason: focused?.reason || 'QQ 聊天输入框没有焦点' }
    }
    const draft = helper ? await helper.readDraft() : null
    if (!draft?.available) {
      return { available: false, text: '', reason: draft?.reason || '输入框内容不可读' }
    }
    // Remember which window the draft came from, so a later insert can prove it
    // is still looking at the same chat.
    const foreground = helper ? await helper.windowAt() : null
    return {
      available: true,
      text: draft.text ?? '',
      reason: '',
      window: foreground?.hwnd ?? null,
    }
  })

  /** Show or update the focus-safe preview window. */
  ipcMain.handle(
    'desktop:preview',
    (_event, payload: { dataUrl: string | null; label: string; visible: boolean }) => {
      if (!payload.visible || !config.showPreviewWindow) {
        hidePreview()
        return { ok: true }
      }
      pushPreview(payload.dataUrl, payload.label)
      return { ok: true }
    }
  )

  ipcMain.handle('desktop:hidePreview', () => {
    hidePreview()
    return { ok: true }
  })

  ipcMain.handle('desktop:setConfig', (_event, patch: Partial<DesktopConfig>) => {
    config = saveConfig({ ...config, ...patch })
    syncShortcuts()
    pushState()
    return config
  })

  ipcMain.handle('desktop:refreshHelper', async () => {
    if (!helper) return helperStatus
    helperStatus = await helper.status()
    pushState()
    return helperStatus
  })

  ipcMain.handle('desktop:openLogs', async () => {
    const logs = app.getPath('logs')
    await shell.openPath(logs)
  })

  ipcMain.handle('desktop:showInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  /** Write a PNG (data URL) to the clipboard. */
  ipcMain.handle('desktop:copyImage', (_event, dataUrl: string) => {
    try {
      const image = nativeImage.createFromDataURL(dataUrl)
      if (image.isEmpty()) return { ok: false, error: '生成的图片为空' }
      clipboard.writeImage(image)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  /** Save a PNG (data URL) through the native dialog. */
  ipcMain.handle(
    'desktop:saveImage',
    async (_event, payload: { dataUrl: string; defaultName: string }) => {
      const result = await dialog.showSaveDialog({
        title: '保存贴纸',
        defaultPath: payload.defaultName,
        filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }
      const image = nativeImage.createFromDataURL(payload.dataUrl)
      const fs = await import('node:fs/promises')
      await fs.writeFile(result.filePath, image.toPNG())
      return { ok: true, filePath: result.filePath }
    }
  )

  /**
   * Clipboard text plus a change token.
   *
   * The token lets the UI tell "the user's selection was captured" apart from
   * "this is the text that was already on the clipboard" — the race the feature
   * request calls out. `hasImage` is reported so the UI can warn before an
   * insert replaces a copied image.
   */
  ipcMain.handle('desktop:readClipboard', () => ({
    text: clipboard.readText(),
    hasImage: !clipboard.readImage().isEmpty(),
    token: clipboardToken(),
  }))

  /**
   * Capture the current selection in the foreground application with a single
   * Ctrl+C, then report whether the clipboard actually changed.
   *
   * Electron's renderer can read the clipboard through `navigator.clipboard`,
   * but only the main process can synthesise the keystroke, so both halves live
   * behind this one handler and the token comparison happens here.
   */
  ipcMain.handle('desktop:captureSelection', async () => {
    const before = clipboard.readText()
    const beforeToken = clipboardToken()
    const sent = sendCtrlC()
    if (!sent) {
      return {
        ok: false,
        text: '',
        status: 'failed',
        reason: '无法发送复制按键；请在 QQ 中手动选中文本并按 Ctrl+C，再粘贴到本程序',
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 140))
    const afterToken = clipboardToken()
    const text = clipboard.readText()
    if (afterToken === beforeToken) {
      return {
        ok: false,
        text: '',
        status: 'unchanged',
        reason: '剪贴板没有变化，未能读取到选中的文字；请手动复制后粘贴到本程序',
      }
    }
    if (text.trim() === '') {
      return {
        ok: false,
        text: '',
        status: 'empty',
        reason: '复制到的是空内容（可能是图片或没有选中文字）；请手动复制文字后粘贴',
      }
    }
    if (text === before) {
      return {
        ok: false,
        text: '',
        status: 'unchanged',
        reason: '读取到的文字与复制前相同，无法确认这是你的选区；请手动复制后粘贴',
      }
    }
    return { ok: true, text, status: 'captured', reason: '' }
  })

  /**
   * Verify that the QQ chat editor is still the paste target, then put the image
   * on the clipboard and press Ctrl+V.
   *
   * Three outcomes are reported separately because they mean different things:
   * `copied` always succeeds, `pasteSent` only means the keystroke was
   * delivered, and `verified` means QQ's editor was still focused afterwards.
   */
  ipcMain.handle(
    'desktop:insertImage',
    async (_event, payload: { dataUrl: string; expectedWindow: number | null }) => {
      const status = helper ? await helper.status() : helperStatus
      helperStatus = status
      if (!status.running) {
        return { ok: false, stage: 'target', error: 'QQ 没有运行' }
      }
      const target = helper ? await helper.confirmTarget(payload.expectedWindow) : null
      if (!target || !target.ok) {
        return {
          ok: false,
          stage: 'target',
          error: target?.reason || '无法确认 QQ 聊天输入框仍是当前目标，已取消插入',
        }
      }
      const write = insertClipboardImage({
        dataUrl: payload.dataUrl,
        createImage: (url) => nativeImage.createFromDataURL(url),
        writeImage: (image) => clipboard.writeImage(image as Electron.NativeImage),
        sendPaste: () => sendCtrlV(),
      })
      if (!write.ok) return { ok: false, stage: 'clipboard', error: write.error }
      const verification = await verifyPaste({
        readText: () => clipboard.readText(),
        readToken: () => clipboardToken(),
        confirm: () => helper!.confirmTarget(payload.expectedWindow),
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      })
      return {
        ok: true,
        stage: 'pasteSent',
        pasteSent: write.pasteSent,
        verified: verification.ok,
        note: verification.ok
          ? '图片已粘贴到 QQ 输入框；请按 QQ 自己的发送设置手动发送'
          : '已发送粘贴请求，未能在 QQ 中确认结果；如输入框没有出现图片，请手动按 Ctrl+V',
      }
    }
  )

  ipcMain.handle('desktop:quit', () => {
    quitting = true
    app.quit()
  })

  ipcMain.handle('desktop:minimizeToTray', () => {
    mainWindow?.hide()
    return { ok: true }
  })

  /** Answer to the `--smoke-test` command; see `runSmokeTest()`. */
  ipcMain.handle('desktop:smokeReport', (_event, report: Record<string, unknown>) => {
    if (report?.partial) {
      // Progress, not the verdict: written to the same file so a stalled check
      // still leaves behind everything it managed to verify.
      writeSmokeReport(SMOKE_OUT, {
        ok: false,
        partial: true,
        errors: ['渲染进程自检尚未完成（这是进度报告）'],
        main: smokeFacts ?? {},
        renderer: report,
      })
      return { ok: true }
    }
    smokeResolve?.(report)
    smokeResolve = null
    return { ok: true }
  })
}

/**
 * Produce the screenshots the README uses, then exit.
 *
 * Both files are real: the window capture is what a user sees, and the sticker is
 * the PNG the app generated (it is taken from the preview payload the renderer
 * already pushed, so it is byte-identical to what "复制图片" would put on the
 * clipboard).
 */
async function runScreenshot(): Promise<void> {
  const dir = SCREENSHOT_DIR!
  mkdirSync(dir, { recursive: true })
  // Let the fonts finish loading and the first paint happen.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  mainWindow?.webContents.send('desktop:command', { type: 'setDraft', text: SCREENSHOT_DRAFT })
  // Layout is debounced by ~180 ms and the preview render follows it.
  await new Promise((resolve) => setTimeout(resolve, 2500))

  const appShot = path.join(dir, 'desktop-app.png')
  const image = await mainWindow!.webContents.capturePage()
  writeFileSync(appShot, image.toPNG())
  console.log(`窗口截图：${appShot} (${image.getSize().width}x${image.getSize().height})`)

  const stickerShot = path.join(dir, 'example-sticker.png')
  if (lastPreviewDataUrl?.startsWith('data:image/png;base64,')) {
    writeFileSync(stickerShot, Buffer.from(lastPreviewDataUrl.split(',')[1]!, 'base64'))
    console.log(`贴纸样例：${stickerShot}`)
  } else {
    console.error('渲染进程没有推送预览图，无法保存贴纸样例')
  }

  app.exit(0)
}

// ---------------------------------------------------------------------------
// Self-check
// ---------------------------------------------------------------------------
/**
 * Run the `--smoke-test` sequence and exit with a status code.
 *
 * Everything here is observable from outside: the report is a file, the exit code
 * is the verdict, and the launcher (`scripts/smoke-desktop.mjs`) additionally
 * checks that the helper process is gone afterwards — the feature request's
 * "on exit, release everything" requirement is only provable from outside.
 */
async function runSmokeTest(): Promise<void> {
  const errors: string[] = []
  const helperPath = resolveHelperPath()

  // 1. The helper: is it next to the app, and does it answer?
  const status = helper ? await helper.status() : helperStatus
  helperStatus = status

  // 2. Everything the main process can see, collected before the renderer is
  //    asked anything so progress reports can carry it too.
  const facts: MainSmokeFacts = collectMainFacts({
    electronApp: app,
    assetsDir: ASSETS_DIR,
    helperPath,
    distDir: DIST_DIR,
    shortcutRegistered: shortcutResults(shortcutStatus),
    shortcutActive: {
      insert: shortcutStatus.insert,
      capture: shortcutStatus.capture,
      notes: shortcutStatus.notes,
    },
    trayCreated,
    helper: {
      available: status.available,
      running: status.running,
      version: status.version,
      windowCount: status.windowCount,
      elementCount: status.elementCount,
      liveReadSupported: status.liveReadSupported,
      reason: status.reason,
    },
  })
  smokeFacts = facts

  // 3. The renderer: assets, fonts, layout, painting.
  const rendererReport = await new Promise<Record<string, unknown>>((resolve) => {
    const timer = setTimeout(
      () => resolve({ ok: false, errors: ['渲染进程自检超时（60 秒）'] }),
      60000
    )
    smokeResolve = (report) => {
      clearTimeout(timer)
      resolve((report ?? {}) as Record<string, unknown>)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop:command', { type: 'smoke' })
    } else {
      clearTimeout(timer)
      resolve({ ok: false, errors: ['主窗口不存在'] })
    }
  })

  // 4. Release everything the app owns, then prove it was released.
  globalShortcut.unregisterAll()
  const activeChords = [shortcutStatus.insert, shortcutStatus.capture].filter(
    (chord): chord is string => !!chord
  )
  const released = activeChords.every((chord) => !globalShortcut.isRegistered(chord))
  if (!released) errors.push('快捷键没有随退出释放')

  if (!facts.charactersJson) errors.push(`缺少 characters.json：${facts.assetsDir}`)
  if (facts.imageCount === 0) errors.push('没有找到贴纸素材图片')
  if (!facts.helperExists) errors.push(`缺少辅助程序：${helperPath}`)
  if (!facts.rendererIndex) errors.push('缺少 renderer/index.html')
  if (!facts.trayCreated) errors.push('托盘图标创建失败（托盘菜单将不可用）')
  // A substituted chord is a note, not a failure: the feature still works.
  if (!shortcutStatus.insert) errors.push('插入快捷键完全没有注册成功')
  if (!shortcutStatus.capture) errors.push('读取选区快捷键完全没有注册成功')
  if (!facts.helper.running) errors.push(`QQ 辅助进程未运行：${facts.helper.reason}`)

  const rendererErrors = Array.isArray(rendererReport.errors)
    ? (rendererReport.errors as unknown[]).map(String)
    : []
  errors.push(...rendererErrors)

  const report = {
    ok: errors.length === 0 && rendererReport.ok !== false,
    mode: SMOKE_MODE ? 'smoke-test' : 'normal',
    finishedAt: new Date().toISOString(),
    errors,
    main: { ...facts, shortcutsReleasedOnExit: released },
    renderer: rendererReport,
    /**
     * Not an error: on this machine QQ does not expose its editor through UI
     * Automation, so the app is expected to fall back to the shortcut mode. The
     * field is reported so nobody mistakes "live mode" for verified.
     */
    liveModeNote: status.liveReadSupported
      ? 'QQ 实时读取可用'
      : `QQ 实时读取不可用（${status.reason}）→ 快捷键兼容模式`,
  }

  writeSmokeReport(SMOKE_OUT, report)
  smokeFacts = null
  helper?.stop()
  console.log(JSON.stringify(report, null, 2))
  console.log(`自检报告：${SMOKE_OUT}`)
  app.exit(report.ok ? 0 : 1)
}

/**
 * Clipboard change counter.
 *
 * Electron does not surface the Win32 clipboard sequence number, so we watch the
 * payload instead: any change of text/image/format signature bumps the token.
 * Comparing tokens is what stops the capture path from mistaking stale clipboard
 * contents for the user's selection.
 */
let clipboardTokenValue = 0
let clipboardSignature = ''
function clipboardToken(): number {
  const image = clipboard.readImage()
  const signature = [clipboard.readText().length, image.isEmpty() ? 0 : image.getSize().width, image.isEmpty() ? 0 : image.getSize().height].join(':')
  if (signature !== clipboardSignature) {
    clipboardSignature = signature
    clipboardTokenValue += 1
  }
  return clipboardTokenValue
}

// ---------------------------------------------------------------------------
// Keystroke synthesis (Windows only, and only Ctrl+C / Ctrl+V)
// ---------------------------------------------------------------------------

/**
 * Press Ctrl+C in whatever has focus.
 *
 * `SendInput` is used rather than a global keyboard hook: the app never observes
 * or reconstructs typing, it only replays a single well-known chord at the
 * user's explicit request. This is what keeps IME composition, deletion, paste
 * and caret edits entirely QQ's business.
 */
function sendCtrlC(): boolean {
  return sendCtrlKey(0x43) // 'C'
}

function sendCtrlV(): boolean {
  return sendCtrlKey(0x56) // 'V'
}

function sendCtrlKey(virtualKey: number): boolean {
  if (process.platform !== 'win32') return false
  try {
    const script = `
$sig = @'
[DllImport("user32.dll", SetLastError=true)]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
'@
$t = Add-Type -MemberDefinition $sig -Name Kb -Namespace Win -PassThru
$VK_CONTROL = 0x11
$KEYUP = 0x0002
$t::keybd_event($VK_CONTROL, 0, 0, [System.UIntPtr]::Zero)
$t::keybd_event(${virtualKey}, 0, 0, [System.UIntPtr]::Zero)
Start-Sleep -Milliseconds 30
$t::keybd_event(${virtualKey}, 0, $KEYUP, [System.UIntPtr]::Zero)
$t::keybd_event($VK_CONTROL, 0, $KEYUP, [System.UIntPtr]::Zero)
`
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { stdio: 'ignore', timeout: 4000, windowsHide: true }
    )
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // A second launch just reveals the window owned by the first instance.
  app.quit()
} else {
  app.on('second-instance', () => createMainWindow())

  app.whenReady().then(async () => {
    // The config path needs Electron's userData directory, so it is wired up
    // here rather than at module load.
    setUserDataDir(app.getPath('userData'))
    config = loadConfig()

    registerAppProtocol()
    registerIpc()
    createMainWindow()
    createTray()

    helper = new QqHelper({
      helperPath: resolveHelperPath(),
      onStatus: (status) => {
        helperStatus = status
        pushState()
      },
    })
    await helper.start()
    /*
     * Ask once up front. `start()` only spawns the process, so without this the
     * UI would keep saying "detecting QQ" until the first poll four seconds later
     * — which reads as "QQ is not running" to anyone watching the window appear.
     */
    helperStatus = await helper.status()
    syncShortcuts()

    if (SMOKE_MODE || SCREENSHOT_DIR) {
      // Wait for the renderer to finish loading before asking it anything; a load
      // failure is itself reported rather than swallowed.
      const window = mainWindow
      const loaded = new Promise<void>((resolve) => {
        if (!window || window.isDestroyed()) return resolve()
        if (!window.webContents.isLoading()) return resolve()
        window.webContents.once('did-finish-load', () => resolve())
        window.webContents.once('did-fail-load', () => resolve())
      })
      await loaded
      if (SCREENSHOT_DIR) {
        await runScreenshot()
        return
      }
      await runSmokeTest()
      return
    }

    // Poll QQ at a low rate: the helper reports "running / live read available",
    // which changes when QQ is opened or closed.
    setInterval(() => {
      void helper?.status().then((status) => {
        const changed =
          status.running !== helperStatus.running ||
          status.liveReadSupported !== helperStatus.liveReadSupported ||
          status.version !== helperStatus.version
        helperStatus = status
        if (changed) pushState()
      })
    }, 4000)
  })

  app.on('window-all-closed', () => {
    quitting = true
    app.quit()
  })

  app.on('before-quit', () => {
    quitting = true
    globalShortcut.unregisterAll()
    helper?.stop()
  })
}

/** The helper sits next to the app in production, in the repo during dev. */
function resolveHelperPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'helper', 'QqHelper.exe'),
    path.join(DIST_DIR, 'helper', 'QqHelper.exe'),
    path.join(DIST_DIR, '../desktop/helper/bin/QqHelper.exe'),
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return candidates[1]
}
