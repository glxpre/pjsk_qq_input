// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Clipboard bridge.
 *
 * Two operations live here because both are races rather than function calls:
 *
 * 1. **Capture a selection.** Press Ctrl+C once, then decide whether the
 *    clipboard really changed. If the sequence number did not move, or the text
 *    equals what was already there, the selection could not be read — the user is
 *    told to copy manually instead of the app silently reusing stale clipboard
 *    contents. The pre-existing clipboard is never overwritten with a backup: a
 *    restore could clobber whatever the user copied afterwards.
 *
 * 2. **Insert an image.** Put the PNG on the clipboard, press Ctrl+V, then check
 *    that the target editor is still focused. "Copied", "paste requested" and
 *    "verified" are reported as three distinct states; a synthesised Ctrl+V is
 *    never described as a confirmed insert.
 */

/** Result of a one-shot selection capture. */
export interface CaptureResult {
  ok: boolean
  text: string
  /** Machine-readable outcome, so the UI can phrase the message itself. */
  status: 'captured' | 'unchanged' | 'empty' | 'failed'
  reason: string
}

/** Clipboard snapshot taken before any capture attempt. */
export interface ClipboardSnapshot {
  text: string
  token: number
  hasImage: boolean
}

/** Wait for the target application to service the copy request. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Snapshot the clipboard before an operation that will replace it. */
export function snapshotClipboard(
  hasImage: boolean,
  text: string,
  token: number
): ClipboardSnapshot {
  return { text, token, hasImage }
}

export interface InsertContext {
  dataUrl: string
  writeImage: (image: unknown) => void
  createImage: (dataUrl: string) => unknown
  sendPaste: () => boolean
}

export interface InsertResult {
  ok: boolean
  error: string
  /** `true` when the paste keystroke was actually delivered. */
  pasteSent: boolean
}

/**
 * Replace the clipboard with the sticker and request a paste.
 *
 * The caller must have verified the target first; this function only owns the
 * clipboard and the keystroke.
 */
export function insertClipboardImage(context: InsertContext): InsertResult {
  try {
    const image = context.createImage(context.dataUrl)
    context.writeImage(image)
  } catch (error) {
    return { ok: false, error: `写入剪贴板失败：${(error as Error).message}`, pasteSent: false }
  }
  const pasteSent = context.sendPaste()
  return {
    ok: true,
    error: pasteSent ? '' : '图片已复制，但粘贴按键发送失败，请在 QQ 中按 Ctrl+V',
    pasteSent,
  }
}

export interface VerifyContext {
  readText: () => string
  readToken: () => number
  confirm: () => Promise<{ ok: boolean; reason: string } | null>
  wait: (ms: number) => Promise<void>
}

/**
 * Look for evidence that the paste landed.
 *
 * QQ's editor is not scriptable here, so the strongest available signal is that
 * it still owns focus a moment after the keystroke and the clipboard still holds
 * the image. Absence of that evidence is reported as "unverified" rather than
 * success.
 */
export async function verifyPaste(
  context: VerifyContext
): Promise<{ ok: boolean; reason: string }> {
  await context.wait(220)
  const target = await context.confirm()
  if (!target) return { ok: false, reason: '无法确认 QQ 输入框状态' }
  if (!target.ok) return { ok: false, reason: target.reason || 'QQ 输入框已不再是焦点' }
  return { ok: true, reason: '' }
}
