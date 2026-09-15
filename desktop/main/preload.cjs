// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Preload bridge.
 *
 * The renderer runs with `contextIsolation` on and no Node integration, so this
 * file is the entire API surface it can reach. Every method maps to one
 * `ipcRenderer.invoke` channel; nothing exposes `ipcRenderer` itself.
 *
 * Written as CommonJS (`preload.cjs`) because Electron loads preload scripts
 * before the ESM loader is available in every supported version.
 */

const { contextBridge, ipcRenderer } = require('electron')

/** Channels the main process may push to the renderer. */
const EVENTS = ['desktop:state', 'desktop:command', 'desktop:hasSticker']

contextBridge.exposeInMainWorld('sekaiDesktop', {
  // ---- state -------------------------------------------------------------
  getState: () => ipcRenderer.invoke('desktop:getState'),
  setConfig: (patch) => ipcRenderer.invoke('desktop:setConfig', patch),
  refreshHelper: () => ipcRenderer.invoke('desktop:refreshHelper'),

  // ---- export ------------------------------------------------------------
  copyImage: (dataUrl) => ipcRenderer.invoke('desktop:copyImage', dataUrl),
  saveImage: (dataUrl, defaultName) =>
    ipcRenderer.invoke('desktop:saveImage', { dataUrl, defaultName }),
  showInFolder: (filePath) => ipcRenderer.invoke('desktop:showInFolder', filePath),
  openLogs: () => ipcRenderer.invoke('desktop:openLogs'),

  // ---- QQ integration ----------------------------------------------------
  readClipboard: () => ipcRenderer.invoke('desktop:readClipboard'),
  captureSelection: () => ipcRenderer.invoke('desktop:captureSelection'),
  insertImage: (dataUrl, expectedWindow) =>
    ipcRenderer.invoke('desktop:insertImage', { dataUrl, expectedWindow }),
  readLiveDraft: () => ipcRenderer.invoke('desktop:readLiveDraft'),

  // ---- focus-safe preview window -----------------------------------------
  preview: (dataUrl, label, visible) =>
    ipcRenderer.invoke('desktop:preview', { dataUrl, label, visible }),
  hidePreview: () => ipcRenderer.invoke('desktop:hidePreview'),

  // ---- lifecycle ---------------------------------------------------------
  quit: () => ipcRenderer.invoke('desktop:quit'),
  minimizeToTray: () => ipcRenderer.invoke('desktop:minimizeToTray'),

  // ---- events ------------------------------------------------------------
  /**
   * Subscribe to a pushed event. Returns an unsubscribe function so React
   * effects can clean up without leaking listeners across hot reloads.
   */
  on: (channel, listener) => {
    if (!EVENTS.includes(channel)) return () => {}
    const wrapped = (_event, payload) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },

  /** Reply to a main-process question (currently only `desktop:hasSticker`). */
  reply: (channel, payload) => {
    ipcRenderer.send(`desktop:reply:${channel}`, payload)
  },

  /** Answer the `--smoke-test` self-check (see desktop/renderer/smoke.ts). */
  reportSmoke: (report) => ipcRenderer.invoke('desktop:smokeReport', report),
})
