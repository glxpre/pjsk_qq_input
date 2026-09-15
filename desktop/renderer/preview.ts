// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Live-mode preview surface.
 *
 * This window is shown with `showInactive()` and created with `focusable: false`,
 * so it can never take keyboard focus away from QQ — the whole point of a
 * companion preview. It only ever receives a sticker as a `data:` URL from the
 * main process, so no privileged APIs are exposed here and the CSP stays as tight
 * as a page can be.
 *
 * Kept as a real module (rather than an inline `<script>`) so the document needs
 * no `'unsafe-inline'` script permission at all.
 */

interface PreviewApi {
  show(dataUrl: string, label: string): void
  clear(label: string): void
}

declare global {
  interface Window {
    sekaiPreview?: PreviewApi
  }
}

const img = document.getElementById('sticker') as HTMLImageElement | null
const status = document.getElementById('status')

window.sekaiPreview = {
  show(dataUrl: string, label: string) {
    if (!img) return
    img.src = dataUrl
    img.classList.remove('hidden')
    if (status) status.textContent = label || ''
  },
  clear(label: string) {
    if (!img) return
    img.removeAttribute('src')
    img.classList.add('hidden')
    if (status) status.textContent = label || '等待输入…'
  },
}

export {}
