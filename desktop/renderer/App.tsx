// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Desktop UI.
 *
 * Layout: a left column with the draft box and settings, and a right column with
 * the sticker preview and the QQ actions.
 *
 * The component keeps the user's draft in `text` **exactly as typed** and never
 * writes the auto-wrapped result back into it: line breaks produced by the layout
 * engine live only inside `layout.pages[*].render.lines`. That is the whole point
 * of the "原文必须保留" requirement, so the draft box is the single source of
 * truth for content and the engine is a pure function of it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'

import {
  alphaBoundsOf,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_TEMPLATE_INDEX,
  layoutForTemplate,
  renderPageToCanvas,
  type StickerTemplate,
} from './stickerRenderer'
import { useFontsReady } from './useFontsReady'
import { ASSET_BASE } from './assets'
import type { LayoutResult } from '../../src/layout/autoLayout.ts'
import type { DesktopConfig } from '../main/config'
import type { HelperStatus } from '../main/qqHelper'
import type { ShortcutStatus } from '../main/main'

/** The slice of main-process state the UI renders. */
interface DesktopState {
  config: DesktopConfig
  helper: HelperStatus
  shortcut: ShortcutStatus
}

/** Types for the preload bridge (kept next to the consumer, not in a .d.ts). */
declare global {
  interface Window {
    sekaiDesktop?: {
      getState(): Promise<DesktopState>
      setConfig(patch: Partial<DesktopConfig>): Promise<DesktopConfig>
      refreshHelper(): Promise<HelperStatus>
      copyImage(dataUrl: string): Promise<{ ok: boolean; error?: string }>
      saveImage(
        dataUrl: string,
        defaultName: string
      ): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>
      showInFolder(filePath: string): Promise<void>
      readClipboard(): Promise<{ text: string; hasImage: boolean; token: number }>
      captureSelection(): Promise<{
        ok: boolean
        text: string
        status: 'captured' | 'unchanged' | 'empty' | 'failed'
        reason: string
      }>
      insertImage(
        dataUrl: string,
        expectedWindow: number | null
      ): Promise<{
        ok: boolean
        stage: string
        verified?: boolean
        pasteSent?: boolean
        note?: string
        error?: string
      }>
      readLiveDraft(): Promise<{
        available: boolean
        text: string
        reason: string
        window?: number | null
      }>
      preview(
        dataUrl: string | null,
        label: string,
        visible: boolean
      ): Promise<{ ok: boolean }>
      hidePreview(): Promise<{ ok: boolean }>
      quit(): Promise<void>
      minimizeToTray(): Promise<{ ok: boolean }>
      on(channel: string, listener: (payload: unknown) => void): () => void
      reply(channel: string, payload: unknown): void
      reportSmoke?(report: unknown): Promise<void>
    }
  }
}

/** Sticker templates, loaded at runtime so the art stays outside the bundle. */
function useTemplates(): StickerTemplate[] | null {
  const [templates, setTemplates] = useState<StickerTemplate[] | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`${ASSET_BASE}characters.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((data: StickerTemplate[]) => {
        if (alive) setTemplates(data)
      })
      .catch((error: Error) => {
        if (alive) setTemplates([])
        console.error('characters.json 加载失败', error)
      })
    return () => {
      alive = false
    }
  }, [])
  return templates
}

/** Short human label for a template. */
function templateLabel(template: StickerTemplate): string {
  return template.name
}

/** A visible, non-transparent preview backdrop so white art stays readable. */
const PREVIEW_BACKDROP = '#3a3536'

/** Wait this long after the last keystroke before re-running the layout engine. */
const LAYOUT_DEBOUNCE_MS = 180

export default function App() {
  const fontsReady = useFontsReady()
  const templates = useTemplates()
  const [config, setConfig] = useState<DesktopConfig | null>(null)
  const [helper, setHelper] = useState<HelperStatus | null>(null)
  const [shortcut, setShortcut] = useState<ShortcutStatus | null>(null)
  const [layout, setLayout] = useState<LayoutResult | null>(null)
  const [text, setText] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [status, setStatus] = useState<{ kind: 'info' | 'error' | 'success'; message: string } | null>(
    null
  )
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState(0)
  /** Window handle the current live draft came from, used to re-verify inserts. */
  const [draftWindow, setDraftWindow] = useState<number | null>(null)
  /** Mirror of `draftWindow` for the pause listener, which must not capture a stale value. */
  const draftWindowRef = useRef<number | null>(null)
  useEffect(() => {
    draftWindowRef.current = draftWindow
  }, [draftWindow])
  /** Monotonic id of the newest generate request, so stale ones are dropped. */
  const requestIdRef = useRef(0)

  const hasDesktop = typeof window !== 'undefined' && !!window.sekaiDesktop
  const imageRef = useRef<HTMLImageElement | null>(null)
  const artBoxRef = useRef<ReturnType<typeof alphaBoundsOf>>(null)
  const [imageVersion, setImageVersion] = useState(0)

  const templateIndex = config?.templateIndex ?? DEFAULT_TEMPLATE_INDEX
  const template =
    templates && templates.length > 0
      ? templates[Math.min(Math.max(templateIndex, 0), templates.length - 1)]
      : null

  // ---- bridge plumbing -----------------------------------------------------

  useEffect(() => {
    if (!hasDesktop) return
    let alive = true
    void window.sekaiDesktop!.getState().then((state) => {
      if (!alive) return
      setConfig(state.config)
      setHelper(state.helper)
      setShortcut(state.shortcut)
    })
    const offState = window.sekaiDesktop!.on('desktop:state', (payload) => {
      const state = payload as DesktopState
      setConfig(state.config)
      setHelper(state.helper)
      setShortcut(state.shortcut)
    })
    return () => {
      alive = false
      offState()
    }
  }, [hasDesktop])

  const patchConfig = useCallback(
    async (patch: Partial<DesktopConfig>) => {
      if (!hasDesktop) {
        setConfig((current) => (current ? { ...current, ...patch } : current))
        return
      }
      const next = await window.sekaiDesktop!.setConfig(patch)
      setConfig(next)
    },
    [hasDesktop]
  )

  // ---- image loading -------------------------------------------------------

  useEffect(() => {
    if (!template) return
    const image = new Image()
    image.src = `${ASSET_BASE}img/${template.img}`
    image.onload = () => {
      imageRef.current = image
      // Real alpha bounds: the sticker sprites are narrow, so the layout engine
      // gets to use the empty space beside the character instead of only above
      // and below a full-canvas box.
      const probe = document.createElement('canvas')
      probe.width = image.width
      probe.height = image.height
      const ctx = probe.getContext('2d', { willReadFrequently: true })
      let bounds = null
      if (ctx) {
        ctx.drawImage(image, 0, 0)
        try {
          bounds = alphaBoundsOf(image, (w, h) => ctx.getImageData(0, 0, w, h).data)
        } catch {
          bounds = null
        }
      }
      artBoxRef.current = bounds
      setImageVersion((v) => v + 1)
    }
    image.onerror = () => {
      imageRef.current = null
      artBoxRef.current = null
      setImageVersion((v) => v + 1)
      setStatus({ kind: 'error', message: `贴纸素材加载失败：${template.img}` })
    }
  }, [template])

  // ---- layout --------------------------------------------------------------

  /**
   * Layout, debounced.
   *
   * The engine is fast (a 341-character draft takes ~0.5 s on the real canvas,
   * and every shorter draft is tens of milliseconds) but it runs synchronously,
   * so recomputing it inside render would make typing lag on a long draft. A short
   * debounce keeps the caret responsive and still updates the preview a moment
   * after the last keystroke.
   */
  useEffect(() => {
    void imageVersion
    if (!template || !fontsReady || text.trim() === '') {
      setLayout(null)
      return
    }
    const timer = window.setTimeout(() => {
      const measureCanvas = document.createElement('canvas')
      const ctx = measureCanvas.getContext('2d')
      if (!ctx) return
      setLayout(
        layoutForTemplate({
          measure: ctx,
          template,
          text,
          artBox: config?.avoidArtOverlap === false ? null : artBoxRef.current,
          style: { fontKey: 'yuruka' },
          settings: {
            minFontSize: config?.minFontSize ?? 22,
            maxLines: config?.maxLines ?? 3,
            maxPages: config?.maxPages ?? 6,
            allowManyPages: config?.allowManyPages ?? false,
            allowCanvasExtension: config?.allowCanvasExtension ?? true,
          },
        })
      )
    }, LAYOUT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [template, text, fontsReady, imageVersion, config])

  // Keep the page cursor valid when the text or settings change.
  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, (layout?.pages.length ?? 1) - 1)))
  }, [layout])

  const page = layout?.pages[pageIndex] ?? null

  // ---- rendering -----------------------------------------------------------

  const dataUrlFor = useCallback(
    (which: number): string | null => {
      if (!layout) return null
      const target = layout.pages[which]
      if (!target) return null
      const canvas = renderPageToCanvas(imageRef.current, target, config?.exportScale ?? 2, {
        background: config?.whiteBackground ? '#ffffff' : null,
      })
      return canvas.toDataURL('image/png')
    },
    [layout, config]
  )

  const previewUrl = useMemo(() => {
    if (!page) return null
    const canvas = renderPageToCanvas(imageRef.current, page, 2, {
      background: PREVIEW_BACKDROP,
    })
    return canvas.toDataURL('image/png')
  }, [page])

  const fileName = useCallback(
    (index: number): string => {
      const base = template ? templateLabel(template).replace(/[\\/:*?"<>|\s]/g, '') : 'sticker'
      const suffix = layout && layout.pages.length > 1 ? `_${index + 1}` : ''
      return `${base}${suffix}.png`
    },
    [template, layout]
  )

  // ---- live mode ------------------------------------------------------------

  /**
   * Poll QQ's draft while the chat editor has focus.
   *
   * Three rules from the feature request are enforced here:
   *   - only the newest text is ever shown: each poll bumps `requestIdRef`, and a
   *     result whose id is no longer current is discarded, so a slow generate can
   *     never overwrite a newer one;
   *   - empty / whitespace-only drafts generate nothing and clear the preview;
   *   - losing focus (switching chat or application) or pausing cancels the old
   *     task and clears the stale preview.
   *
   * Polling is used because this QQ build has no accessibility events to
   * subscribe to; when UIA events become available the same effect can switch to
   * a push model without changing anything downstream.
   */
  useEffect(() => {
    if (!hasDesktop || !config?.enabled || !helper?.liveReadSupported) return
    let stopped = false
    let timer: number | undefined

    const tick = async (): Promise<void> => {
      if (stopped) return
      try {
        const draft = await window.sekaiDesktop!.readLiveDraft()
        if (stopped) return
        if (!draft.available) {
          // Lost focus or the editor is unreadable: drop the stale preview.
          requestIdRef.current += 1
          await window.sekaiDesktop!.hidePreview()
          return
        }
        const text = draft.text.trim() === '' ? '' : draft.text
        setDraftWindow(draft.window ?? null)
        if (text === '') {
          requestIdRef.current += 1
          setText('')
          await window.sekaiDesktop!.hidePreview()
          return
        }
        const id = ++requestIdRef.current
        setText(text)
        setPageIndex(0)
        if (id !== requestIdRef.current) return
        // The preview is pushed by the effect below; this keeps one owner for it.
      } catch {
        /* a failed poll is not fatal: try again on the next tick */
      } finally {
        if (!stopped) timer = window.setTimeout(() => void tick(), config.debounceMs)
      }
    }

    void tick()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [hasDesktop, config?.enabled, config?.debounceMs, helper?.liveReadSupported])

  // ---- preview window -------------------------------------------------------

  /**
   * Mirror the sticker into the focus-safe preview window.
   *
   * The preview is only pushed for the *newest* render, and it is hidden whenever
   * there is nothing to show or integration is paused.
   */
  useEffect(() => {
    if (!hasDesktop) return
    const active = !!config?.enabled && !!previewUrl && !!page
    const label = page
      ? `第 ${page.index}/${layout?.pages.length ?? 1} 张 · ${text.length} 字`
      : ''
    void window.sekaiDesktop!.preview(previewUrl, label, active)
  }, [hasDesktop, config?.enabled, previewUrl, page, layout, text.length])

  // Hide the preview when integration is paused or the window is closing.
  useEffect(() => {
    if (!hasDesktop) return
    const off = window.sekaiDesktop!.on('desktop:command', (payload) => {
      const command = payload as { type: string }
      if (command.type !== 'pause') return
      void window.sekaiDesktop!.hidePreview()
      /*
       * Drop a draft that came from live mode: once the integration is paused,
       * showing it as if it were current would be a stale preview. Text the user
       * typed into the box by hand is theirs and is deliberately left alone.
       */
      if (draftWindowRef.current !== null) {
        setText('')
        setLayout(null)
        setDraftWindow(null)
      }
    })
    return off
  }, [hasDesktop])

  // ---- actions -------------------------------------------------------------

  const report = useCallback((kind: 'info' | 'error' | 'success', message: string) => {
    setStatus({ kind, message })
  }, [])

  const handleCopy = useCallback(async () => {
    const dataUrl = dataUrlFor(pageIndex)
    if (!dataUrl) return
    if (!hasDesktop) {
      // Browser fallback keeps the page usable for review without Electron.
      try {
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        report('success', '图片已复制到剪贴板')
      } catch (error) {
        report('error', `复制失败：${(error as Error).message}`)
      }
      return
    }
    const result = await window.sekaiDesktop!.copyImage(dataUrl)
    if (result.ok) report('success', `第 ${pageIndex + 1} 张已复制到剪贴板`)
    else report('error', result.error || '复制失败')
  }, [dataUrlFor, pageIndex, hasDesktop, report])

  const handleCopyAll = useCallback(async () => {
    if (!layout || layout.pages.length === 0) return
    // Copying several pages is inherently sequential: the clipboard holds one
    // image at a time, so the last one wins and the user is told that plainly.
    for (let i = 0; i < layout.pages.length; i++) {
      const dataUrl = dataUrlFor(i)
      if (!dataUrl) continue
      if (hasDesktop) await window.sekaiDesktop!.copyImage(dataUrl)
    }
    report('info', `已依次复制 ${layout.pages.length} 张，剪贴板中保留最后一张`)
  }, [layout, dataUrlFor, hasDesktop, report])

  const handleSave = useCallback(async () => {
    const dataUrl = dataUrlFor(pageIndex)
    if (!dataUrl) return
    if (!hasDesktop) {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName(pageIndex)
      link.click()
      return
    }
    const result = await window.sekaiDesktop!.saveImage(dataUrl, fileName(pageIndex))
    if (result.ok) report('success', `已保存：${result.filePath}`)
    else if (!result.canceled) report('error', result.error || '保存失败')
  }, [dataUrlFor, pageIndex, hasDesktop, fileName, report])

  const handleSaveAll = useCallback(async () => {
    if (!layout) return
    if (!hasDesktop) return
    let saved = 0
    for (let i = 0; i < layout.pages.length; i++) {
      const dataUrl = dataUrlFor(i)
      if (!dataUrl) continue
      const result = await window.sekaiDesktop!.saveImage(dataUrl, fileName(i))
      if (result.ok) saved += 1
      else if (result.canceled) break
    }
    if (saved > 0) report('success', `已保存 ${saved} 张 PNG`)
  }, [layout, dataUrlFor, hasDesktop, fileName, report])

  const handleInsert = useCallback(async () => {
    if (!layout || !hasDesktop) return
    const dataUrl = dataUrlFor(pageIndex)
    if (!dataUrl) return
    setBusy(true)
    try {
      const foreground = await window.sekaiDesktop!.insertImage(dataUrl, draftWindow)
      if (!foreground.ok) {
        // Never insert into the wrong window: fall back to a plain copy.
        await window.sekaiDesktop!.copyImage(dataUrl)
        report('error', `${foreground.error || '目标校验失败'}；图片已改为复制，请手动在 QQ 中粘贴`)
        return
      }
      report(foreground.verified ? 'success' : 'info', foreground.note || '已发送粘贴请求')
    } finally {
      setBusy(false)
    }
  }, [layout, dataUrlFor, pageIndex, hasDesktop, report, draftWindow])

  const handleCapture = useCallback(async () => {
    if (!hasDesktop) return
    setBusy(true)
    try {
      const result = await window.sekaiDesktop!.captureSelection()
      if (!result.ok) {
        report('error', result.reason)
        return
      }
      setText(result.text)
      setPageIndex(0)
      report('success', `已从选区读取 ${result.text.length} 字`)
    } finally {
      setBusy(false)
    }
  }, [hasDesktop, report])

  // Shortcut commands pushed from the main process.
  useEffect(() => {
    if (!hasDesktop) return
    const off = window.sekaiDesktop!.on('desktop:command', (payload) => {
      const command = payload as { type: string; text?: string }
      if (command.type === 'capture') void handleCapture()
      if (command.type === 'insert') void handleInsert()
      /*
       * `setDraft` exists for the documentation screenshots
       * (`npm run desktop:screenshot`): it fills the box with a sample so the
       * README shows the real UI rather than a mock-up.
       */
      if (command.type === 'setDraft' && typeof command.text === 'string') {
        setText(command.text)
        setPageIndex(0)
        setStatus(null)
      }
    })
    return off
  }, [hasDesktop, handleCapture, handleInsert])

  // Tell the main process whether the insert shortcut has anything to insert.
  useEffect(() => {
    if (!hasDesktop) return
    const off = window.sekaiDesktop!.on('desktop:hasSticker', () => {
      window.sekaiDesktop!.reply('desktop:hasSticker', !!page)
    })
    return off
  }, [hasDesktop, page])

  // ---- render --------------------------------------------------------------

  const notes = layout?.diagnostics.notes ?? []
  const liveMode = !!helper?.liveReadSupported
  /** The helper has not answered yet, so no verdict about QQ is shown. */
  const helperChecking = !helper || helper.reason.startsWith('正在检测')

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {/* ---------------- left: draft + settings ---------------- */}
      <Box
        sx={{
          width: 420,
          minWidth: 380,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            PJSK 贴纸伴侣
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Chip
              size="small"
              color={config?.enabled ? 'success' : 'default'}
              label={config?.enabled ? '联动已启用' : '联动已暂停'}
              onClick={() => void patchConfig({ enabled: !config?.enabled })}
            />
            <Chip
              size="small"
              color={helper?.running ? 'primary' : 'default'}
              label={
                helper?.running
                  ? `QQ ${helper.version || '已运行'}`
                  : helperChecking
                    ? '正在检测 QQ…'
                    : 'QQ 未运行'
              }
            />
            <Chip
              size="small"
              color={liveMode ? 'success' : helperChecking ? 'default' : 'warning'}
              label={
                liveMode ? '实时读取可用' : helperChecking ? '实时读取：检测中' : '实时读取不可用'
              }
            />
            <Chip
              size="small"
              color={fontsReady ? 'success' : 'warning'}
              label={fontsReady ? '字体就绪' : '字体加载中'}
            />
          </Stack>
        </Box>

        <Tabs value={tab} onChange={(_e, value) => setTab(value)} sx={{ px: 1 }}>
          <Tab label="文本与排版" />
          <Tab label="模板" />
          <Tab label="设置" />
        </Tabs>
        <Divider />

        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {tab === 0 && (
            <Stack spacing={2}>
              <TextField
                label="贴纸文字（原文，不会被改动）"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setPageIndex(0)
                }}
                multiline
                minRows={5}
                maxRows={14}
                fullWidth
                placeholder="在 QQ 里选中文字后按快捷键，或直接在这里输入"
                helperText={`${text.length} 字${
                  layout ? ` · 自动排版 ${layout.diagnostics.lines} 行` : ''
                }`}
              />

              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <Tooltip
                  title={
                    liveMode
                      ? '读取 QQ 输入框里已提交的草稿'
                      : '当前 QQ 版本没有开放 UI Automation，实时读取不可用；请用左侧选区读取'
                  }
                >
                  <span>
                    <Button
                      variant="outlined"
                      disabled={!liveMode || busy}
                      onClick={() => {
                        void window.sekaiDesktop
                          ?.readLiveDraft()
                          .then((draft) => {
                            if (!draft.available) {
                              report('error', draft.reason)
                              return
                            }
                            setText(draft.text)
                            setDraftWindow(draft.window ?? null)
                            setPageIndex(0)
                          })
                      }}
                    >
                      读取 QQ 草稿（实时）
                    </Button>
                  </span>
                </Tooltip>
                <Button variant="outlined" onClick={() => void handleCapture()} disabled={busy}>
                  读取 QQ 选中文字
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setText('')
                    setDraftWindow(null)
                    setStatus(null)
                    void window.sekaiDesktop?.hidePreview()
                  }}
                >
                  清空
                </Button>
              </Stack>

              {layout && (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    排版结果
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    策略：{layout.diagnostics.strategy} · 字号：
                    {layout.diagnostics.fontSize}px / 模板 {layout.diagnostics.templateFontSize}px
                    {layout.diagnostics.shrunk ? '（已缩小）' : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    共 {layout.pages.length} 张
                    {layout.overLimit
                      ? ` · 全文约需 ${layout.estimatedPages} 张，超过上限（剩余文字未丢弃）`
                      : ''}
                  </Typography>
                  {notes.length > 0 && (
                    <Box component="ul" sx={{ pl: 2.5, mt: 1, mb: 0 }}>
                      {notes.map((note, index) => (
                        <li key={index}>
                          <Typography variant="caption" color="text.secondary">
                            {note}
                          </Typography>
                        </li>
                      ))}
                    </Box>
                  )}
                </Paper>
              )}
            </Stack>
          )}

          {tab === 1 && (
            <Stack spacing={2}>
              <FormControl fullWidth size="small" disabled={!templates || templates.length === 0}>
                <InputLabel>角色 / 贴纸模板</InputLabel>
                <Select
                  label="角色 / 贴纸模板"
                  value={templateIndex}
                  onChange={(event) => void patchConfig({ templateIndex: Number(event.target.value) })}
                >
                  {(templates ?? []).map((entry, index) => (
                    <MenuItem key={`${entry.img}-${index}`} value={index}>
                      {entry.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary">
                {templates === null
                  ? '正在加载模板…'
                  : templates.length === 0
                    ? '模板加载失败：请确认 desktop-dist/assets/characters.json 存在'
                    : `共 ${templates.length} 个模板，来自 characters.json；选择会被记住。`}
              </Typography>
            </Stack>
          )}

          {tab === 2 && config && (
            <Stack spacing={2}>
              {/*
                Committed on blur rather than on every keystroke: a half-typed
                chord should not be persisted, and re-registering hotkeys while
                the user is still typing is how conflicts get reported wrongly.
              */}
              <TextField
                label="生成/插入快捷键"
                key={`insert-${config.insertShortcut}`}
                defaultValue={config.insertShortcut}
                onBlur={(event) => {
                  if (event.target.value !== config.insertShortcut) {
                    void patchConfig({ insertShortcut: event.target.value })
                  }
                }}
                size="small"
                helperText={`Electron 加速键格式，例如 Control+Alt+S；当前生效：${
                  shortcut?.insert ?? '未注册'
                }`}
              />
              <TextField
                label="读取选区快捷键"
                key={`capture-${config.captureShortcut}`}
                defaultValue={config.captureShortcut}
                onBlur={(event) => {
                  if (event.target.value !== config.captureShortcut) {
                    void patchConfig({ captureShortcut: event.target.value })
                  }
                }}
                size="small"
                helperText={`在 QQ 里选中文字后按它，只复制一次并读取结果；当前生效：${
                  shortcut?.capture ?? '未注册'
                }`}
              />
              <Box>
                <Typography variant="body2" gutterBottom>
                  防抖 {config.debounceMs} ms
                </Typography>
                <Slider
                  value={config.debounceMs}
                  min={0}
                  max={2000}
                  step={50}
                  onChange={(_e, value) => void patchConfig({ debounceMs: value as number })}
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  最小字号 {config.minFontSize}px
                </Typography>
                <Slider
                  value={config.minFontSize}
                  min={10}
                  max={48}
                  step={1}
                  onChange={(_e, value) => void patchConfig({ minFontSize: value as number })}
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  每张最多 {config.maxLines} 行
                </Typography>
                <Slider
                  value={config.maxLines}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(_e, value) => void patchConfig({ maxLines: value as number })}
                />
              </Box>
              <Box>
                <Typography variant="body2" gutterBottom>
                  导出倍数 {config.exportScale}x
                </Typography>
                <Slider
                  value={config.exportScale}
                  min={1}
                  max={4}
                  step={1}
                  onChange={(_e, value) => void patchConfig({ exportScale: value as number })}
                />
              </Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.whiteBackground}
                    onChange={(e) => void patchConfig({ whiteBackground: e.target.checked })}
                  />
                }
                label="白色背景（QQ 显示异常时使用）"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.allowCanvasExtension}
                    onChange={(e) => void patchConfig({ allowCanvasExtension: e.target.checked })}
                  />
                }
                label="空间不足时扩展画布（文字在上、角色在下）"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.avoidArtOverlap}
                    onChange={(e) => void patchConfig({ avoidArtOverlap: e.target.checked })}
                  />
                }
                label="尽量不遮挡角色"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={config.recordHistory}
                    onChange={(e) => void patchConfig({ recordHistory: e.target.checked })}
                  />
                }
                label="保存生成历史（默认关闭，不记录草稿）"
              />
              <Divider />
              <Stack direction="row" spacing={1}>
                <Button onClick={() => void window.sekaiDesktop?.refreshHelper()}>重新检测 QQ</Button>
                <Button onClick={() => void window.sekaiDesktop?.minimizeToTray()}>最小化到托盘</Button>
                <Button color="error" onClick={() => void window.sekaiDesktop?.quit()}>
                  退出
                </Button>
              </Stack>
            </Stack>
          )}
        </Box>
      </Box>

      {/* ---------------- right: preview + actions ---------------- */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ p: 2, pb: 1 }}>
          {!liveMode && !helperChecking && !config?.dismissLiveWarning && (
            <Alert
              severity="warning"
              sx={{ mb: 1 }}
              onClose={() => void patchConfig({ dismissLiveWarning: true })}
            >
              <AlertTitle>实时读取不可用，已启用快捷键兼容模式</AlertTitle>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                原因：{helper?.reason || '当前 QQ 版本没有通过 UI Automation 暴露聊天输入框。'}
              </Typography>
              <Typography variant="body2">
                请在 QQ 中选中要转换的文字，然后按 {config?.captureShortcut || 'Control+Shift+D'}{' '}
                读取选区。程序不会持续模拟 Ctrl+A / Ctrl+C，也不会读取整个剪贴板历史。
              </Typography>
            </Alert>
          )}
          {status && (
            <Alert severity={status.kind} sx={{ mb: 1 }} onClose={() => setStatus(null)}>
              {status.message}
            </Alert>
          )}
          {/*
            A hotkey owned by another program fails silently at the OS level, so
            the substitution the app made is stated plainly instead of leaving
            the user with a shortcut that does nothing.
          */}
          {(shortcut?.notes.length ?? 0) > 0 && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {shortcut!.notes.map((note) => (
                <div key={note}>{note}</div>
              ))}
            </Alert>
          )}
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            p: 2,
          }}
        >
          {!text.trim() && (
            <Typography color="text.secondary">输入文字或读取 QQ 选区后在此预览</Typography>
          )}
          {text.trim() && !fontsReady && (
            <Typography color="text.secondary">正在加载本地字体…</Typography>
          )}
          {previewUrl && <img className="sticker-canvas" src={previewUrl} alt="贴纸预览" />}
        </Box>

        {layout && layout.pages.length > 1 && (
          <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1, flexWrap: 'wrap', rowGap: 1 }}>
            {layout.pages.map((entry, index) => (
              <Tooltip key={entry.index} title={entry.text.slice(0, 40)}>
                <Chip
                  size="small"
                  color={index === pageIndex ? 'primary' : 'default'}
                  label={`第 ${entry.index}/${layout.pages.length} 张`}
                  onClick={() => setPageIndex(index)}
                />
              </Tooltip>
            ))}
          </Stack>
        )}

        <Divider />
        <Stack direction="row" spacing={1} sx={{ p: 2, flexWrap: 'wrap', rowGap: 1 }}>
          <Button variant="contained" onClick={() => void handleInsert()} disabled={!page || busy}>
            插入到 QQ
          </Button>
          <Button variant="outlined" onClick={() => void handleCopy()} disabled={!page}>
            复制图片
          </Button>
          <Button variant="outlined" onClick={() => void handleSave()} disabled={!page}>
            保存 PNG
          </Button>
          {layout && layout.pages.length > 1 && (
            <>
              <Button variant="text" onClick={() => void handleCopyAll()}>
                复制全部
              </Button>
              <Button variant="text" onClick={() => void handleSaveAll()}>
                批量保存
              </Button>
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {WIDTH_NOTE}
          </Typography>
        </Stack>
      </Box>
    </Box>
  )
}

const WIDTH_NOTE = `画布 ${CANVAS_WIDTH}×${CANVAS_HEIGHT}（逻辑像素）`
