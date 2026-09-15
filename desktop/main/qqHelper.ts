// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * QQ helper bridge.
 *
 * Owns the long-lived `QqHelper.exe` child process and speaks newline-delimited
 * JSON with it. The helper is optional: when it is missing or crashes, the app
 * keeps working and reports `available: false` so the UI can offer the shortcut
 * compatibility mode instead of pretending live reading works.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'

/** One element of QQ's draft editor, as reported by the helper. */
export interface HelperDraft {
  className: string
  controlType: string
  name: string
  value: string | null
  hasFocus: boolean
}

/** Aggregate status the UI renders. */
export interface HelperStatus {
  available: boolean
  running: boolean
  version: string
  windowCount: number
  elementCount: number
  liveReadSupported: boolean
  reason: string
  draft: HelperDraft | null
}

/** Foreground-window description. */
export interface HelperWindow {
  hwnd: number
  pid: number
  class: string
  title: string
  isQq: boolean
  focusClass: string
  visible: boolean
  minimized: boolean
}

/** Result of re-checking that QQ's editor is still the paste target. */
export interface HelperTargetCheck {
  ok: boolean
  isQq: boolean
  sameWindow: boolean
  editorFocused: boolean
  reason: string
}

export interface HelperOptions {
  helperPath: string
  onStatus?: (status: HelperStatus) => void
  /** Called when the process exits; used to report the failure in the UI. */
  onExit?: (code: number | null) => void
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const REQUEST_TIMEOUT_MS = 6000

const EMPTY_STATUS: HelperStatus = {
  available: false,
  running: false,
  version: '',
  windowCount: 0,
  elementCount: 0,
  liveReadSupported: false,
  reason: '辅助进程不可用',
  draft: null,
}

export class QqHelper {
  private readonly options: HelperOptions
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private starting = false

  constructor(options: HelperOptions) {
    this.options = options
  }

  /** `true` when the executable is on disk. */
  get present(): boolean {
    return existsSync(this.options.helperPath)
  }

  async start(): Promise<void> {
    if (this.child || this.starting) return
    if (!this.present) {
      this.emit({
        ...EMPTY_STATUS,
        reason: `未找到辅助程序：${this.options.helperPath}（请先运行 desktop/helper/build-helper.ps1）`,
      })
      return
    }
    this.starting = true
    try {
      this.child = spawn(this.options.helperPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams

      this.child.stdout.setEncoding('utf8')
      this.child.stdout.on('data', (chunk: string) => this.onData(chunk))
      this.child.stderr.setEncoding('utf8')
      this.child.stderr.on('data', () => {
        /* the helper only writes diagnostics to stderr; ignore */
      })
      this.child.on('exit', (code) => {
        this.child = null
        this.starting = false
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer)
          pending.reject(new Error('辅助进程已退出'))
        }
        this.pending.clear()
        this.emit({ ...EMPTY_STATUS, available: true, reason: '辅助进程已退出' })
        this.options.onExit?.(code)
      })
      this.child.on('error', (error) => {
        this.starting = false
        this.emit({ ...EMPTY_STATUS, available: true, reason: `无法启动辅助进程：${error.message}` })
      })
    } catch (error) {
      this.starting = false
      this.emit({
        ...EMPTY_STATUS,
        reason: `无法启动辅助进程：${(error as Error).message}`,
      })
    }
  }

  stop(): void {
    if (!this.child) return
    try {
      this.child.stdin.write('{"id":0,"op":"quit"}\n')
    } catch {
      /* the pipe may already be gone */
    }
    try {
      this.child.kill()
    } catch {
      /* already dead */
    }
    this.child = null
  }

  /** Full QQ status. Never throws: failures come back as an unavailable report. */
  async status(): Promise<HelperStatus> {
    const result = await this.request<Omit<HelperStatus, 'available'>>('status')
    if (!result) return { ...EMPTY_STATUS, reason: this.failureReason() }
    const status: HelperStatus = { available: true, ...result }
    this.emit(status)
    return status
  }

  /** Foreground window, QQ or not. */
  async windowAt(): Promise<HelperWindow | null> {
    return this.request<HelperWindow>('windowAt')
  }

  /**
   * Read QQ's chat draft.
   *
   * `available: false` means live reading is not supported for this QQ build, and
   * the caller must fall back to the shortcut mode. This never fabricates a
   * draft from keystrokes.
   */
  async readDraft(): Promise<{ available: boolean; text: string; reason: string } | null> {
    return this.request<{ available: boolean; text: string; reason: string }>('readDraft')
  }

  /** Is QQ's chat editor the focused control? */
  async focusEditBox(): Promise<{ focused: boolean; className: string; reason?: string } | null> {
    return this.request<{ focused: boolean; className: string; reason?: string }>('focusEditBox')
  }

  /**
   * Re-verify the paste target right before inserting: QQ must still be in front,
   * the same window must still be active, and its editor must still be focused.
   */
  async confirmTarget(expectedWindow?: number | null): Promise<HelperTargetCheck | null> {
    return this.request<HelperTargetCheck>('confirmTarget', {
      hwnd: expectedWindow ?? 0,
    })
  }

  // -------------------------------------------------------------------------

  private failureReason(): string {
    if (!this.present) return `未找到辅助程序：${this.options.helperPath}`
    if (!this.child) return '辅助进程未运行'
    return '辅助进程无响应'
  }

  private emit(status: HelperStatus): void {
    this.options.onStatus?.(status)
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) this.onLine(line)
      index = this.buffer.indexOf('\n')
    }
  }

  private onLine(line: string): void {
    let message: { id?: number; ok?: boolean; result?: unknown; error?: string; event?: string }
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.event) return
    const id = message.id
    if (typeof id !== 'number') return
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error || '辅助进程返回了错误'))
  }

  private request<T>(op: string, extra: Record<string, unknown> = {}): Promise<T | null> {
    if (!this.child) {
      void this.start()
      return Promise.resolve(null)
    }
    const id = this.nextId++
    const payload = JSON.stringify({ id, op, ...extra })
    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve(null)
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject: () => resolve(null),
        timer,
      })
      try {
        this.child!.stdin.write(`${payload}\n`)
      } catch {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve(null)
      }
    })
  }
}
