// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Renderer self-test.
 *
 * This is the only honest way to verify the *packaged* app: it runs the real
 * renderer, inside the real Electron build, against the real `app://assets/`
 * protocol, and reports what it managed to do — how many templates loaded, which
 * fonts were actually available, whether the sticker art decoded, and what the
 * layout engine produced for six representative drafts.
 *
 * It exists because a green unit-test run says nothing about resource paths: the
 * bugs it catches (an `app://` handler pointing at the wrong directory, a font
 * that silently falls back, an image that never decodes) only appear once the
 * files are laid out as an installed app.
 *
 * It is inert during normal use: it only runs when the main process sends a
 * `smoke` command.
 */

import {
  alphaBoundsOf,
  DEFAULT_TEMPLATE_INDEX,
  layoutForTemplate,
  renderPageToCanvas,
  type StickerTemplate,
} from './stickerRenderer'
import { clearLayoutMetricsCache, type Box, type LayoutResult } from '../../src/layout/autoLayout.ts'
import { ASSET_BASE } from './assets'

/** Fonts the sticker text depends on. */
const FONT_FAMILIES = ['YurukaStd', 'SSFangTangTi'] as const
const FONT_PROBE_SIZE = '38px'

/** One draft that is laid out and painted for real. */
export interface SmokeCase {
  name: string
  /** Characters in the original draft. */
  inputLength: number
  pages: number
  estimatedPages: number
  fontSize: number
  templateFontSize: number
  lines: number
  strategy: string
  shrunk: boolean
  overLimit: boolean
  /** The auto-wrapped output still contains the original text (whitespace-insensitive). */
  lossless: boolean
  /** Page *n+1* continues page *n* with nothing skipped or duplicated. */
  contiguous: boolean
  /** No surrogate pair, emoji or combining mark was cut in half. */
  intact: boolean
  /** Page 0's exported pixel size at the requested export scale. */
  exportWidth: number
  exportHeight: number
  /** Logical size of page 0 and the measured width of each rendered line. */
  canvasWidth: number
  canvasHeight: number
  lineWidths: number[]
  /** The first two rendered lines, so a bad wrap is visible in the report. */
  sampleLines: string[]
  /** True when every rendered line fits inside the canvas (no clipped text). */
  withinCanvas: boolean
  /** Same result with a cold and a warm measurement cache (catches cache-key bugs). */
  cacheStable: boolean
  /** How long one layout run took, in milliseconds (the UI renders synchronously). */
  durationMs: number
  /** Ink pixels in page 0 when only the text is drawn (proves the text rendered). */
  textInkPixels: number
  /** Ink pixels in page 0 with the character art drawn too. */
  artInkPixels: number
  notes: string[]
}

/** Everything the renderer can prove about itself. */
export interface SmokeReport {
  ok: boolean
  url: string
  templates: number
  defaultTemplate: string | null
  fontsReady: boolean
  fontChecks: Record<string, boolean>
  image: { src: string; width: number; height: number } | null
  artBox: Box | null
  cases: SmokeCase[]
  errors: string[]
}

/** The six drafts the feature request requires a real layout demonstration for. */
const CASES: Array<{ name: string; text: string }> = [
  { name: 'short', text: '初音未来' },
  {
    name: 'long-cjk',
    text: '今天也在认真练习，希望能把每一句想说的话，都好好地写进这张贴纸里，然后送给你。',
  },
  {
    name: 'mixed',
    text: "Project SEKAI 的贴纸真好看！Let's make a sticker for Miku 2026, okay?",
  },
  { name: 'emoji', text: '今天也要加油 🎧🎤✨ ミク最高！' },
  { name: 'multiline', text: '第一行\n第二行\n第三行' },
  {
    name: 'very-long',
    text: Array.from(
      { length: 14 },
      (_unused, index) => `第${index + 1}句：想把今天的心情全部写下来，一句也不能少。`
    ).join(''),
  },
]

/** Whitespace-insensitive form, so auto-inserted line breaks do not count as a change. */
function squash(text: string): string {
  return text.replace(/\s+/gu, '')
}

/** Where progress reports go while the check is running (set by the listener). */
let progressSink: ((report: SmokeReport) => void) | null = null

/**
 * Publish the report as it stands.
 *
 * Called after every draft, so a slow or stuck case cannot hide the results that
 * were already produced: the main process writes each progress report to the same
 * file the final one goes to.
 */
function publishProgress(report: SmokeReport): void {
  progressSink?.({ ...report, cases: [...report.cases], errors: [...report.errors] })
}

/**
 * Walk the original once, consuming each page's characters in order.
 *
 * Pagination is allowed to drop the whitespace it broke a line at, and nothing
 * else: every visible character of page *n+1* must come directly after the last
 * visible character of page *n* in the original. This is what proves the pages
 * are consecutive slices of the user's text rather than re-wrapped or reordered
 * fragments. Returns the new cursor, or `null` when the page does not continue
 * the original.
 */
function consumePage(page: string, original: string[], cursor: number): number | null {
  let index = cursor
  for (const char of page) {
    if (/\s/u.test(char)) continue
    while (index < original.length && /\s/u.test(original[index]!)) index++
    if (original[index] !== char) return null
    index++
  }
  return index
}

/** True when no code point was left half-encoded. */
function isIntact(text: string): boolean {
  if (text.includes('\uFFFD')) return false
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false
    }
  }
  return true
}

/** Count pixels the paint pass actually touched. */
function inkPixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx || canvas.width === 0 || canvas.height === 0) return 0
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let count = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count++
  }
  return count
}

/** Load an image and resolve to its natural size. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`图片加载失败：${src}`))
    image.src = src
  })
}

/** Run every check and produce the report the main process prints. */
export async function runRendererSmoke(): Promise<SmokeReport> {  const errors: string[] = []
  const report: SmokeReport = {
    ok: false,
    url: location.href,
    templates: 0,
    defaultTemplate: null,
    fontsReady: false,
    fontChecks: {},
    image: null,
    artBox: null,
    cases: [],
    errors,
  }

  // ---- assets -------------------------------------------------------------
  let templates: StickerTemplate[] = []
  try {
    const response = await fetch(`${ASSET_BASE}characters.json`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    templates = (await response.json()) as StickerTemplate[]
    report.templates = templates.length
  } catch (error) {
    errors.push(`characters.json: ${(error as Error).message}`)
  }
  if (templates.length === 0) return report

  const template =
    templates[Math.min(DEFAULT_TEMPLATE_INDEX, templates.length - 1)] ?? templates[0]!
  report.defaultTemplate = template.name

  // ---- fonts --------------------------------------------------------------
  try {
    await Promise.all(
      FONT_FAMILIES.map((family) =>
        document.fonts.load(`${FONT_PROBE_SIZE} ${family}`).catch(() => undefined)
      )
    )
    await document.fonts.ready
  } catch (error) {
    errors.push(`字体加载：${(error as Error).message}`)
  }
  for (const family of FONT_FAMILIES) {
    report.fontChecks[family] = document.fonts.check(`${FONT_PROBE_SIZE} ${family}`)
  }
  report.fontsReady = FONT_FAMILIES.every((family) => report.fontChecks[family])
  if (!report.fontsReady) errors.push('字体未就绪，导出会使用回退字形')

  // ---- art + alpha bounds -------------------------------------------------
  let image: HTMLImageElement | null = null
  try {
    image = await loadImage(`${ASSET_BASE}img/${template.img}`)
    report.image = { src: template.img, width: image.naturalWidth, height: image.naturalHeight }
    const probe = document.createElement('canvas')
    probe.width = image.naturalWidth
    probe.height = image.naturalHeight
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.drawImage(image, 0, 0)
      report.artBox = alphaBoundsOf(image, (w, h) => ctx.getImageData(0, 0, w, h).data)
    }
  } catch (error) {
    errors.push(`贴纸素材：${(error as Error).message}`)
  }

  // ---- layout + paint -----------------------------------------------------
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) {
    errors.push('无法创建 2D 上下文')
    return report
  }

  for (const entry of CASES) {
    /** One layout run; repeated with a cold cache to prove cache-key stability. */
    const runLayout = (): LayoutResult => {
      const result = layoutForTemplate({
        measure,
        template,
        text: entry.text,
        artBox: report.artBox,
        style: { fontKey: 'yuruka' },
        settings: { minFontSize: 22, maxLines: 3, maxPages: 6 },
      })
      return result
    }

    clearLayoutMetricsCache()
    const startedAt = performance.now()
    const result = runLayout()
    const durationMs = Math.round(performance.now() - startedAt)
    // A second run on the warm measurement cache must agree; if it does not, the
    // cache is keyed too loosely and results depend on what was measured before.
    const warmed = runLayout()
    const cacheStable =
      JSON.stringify(result.pages.map((page) => page.render.lines)) ===
      JSON.stringify(warmed.pages.map((page) => page.render.lines))

    const joined = squash(result.pages.map((page) => page.text).join(''))
    const original = squash(entry.text)
    // Truncating after the page budget is allowed (and reported), dropping or
    // rewriting characters inside what *was* produced is not.
    const lossless = result.overLimit
      ? original.startsWith(joined)
      : joined === original

    let contiguous = true
    const originalChars = Array.from(entry.text)
    let cursor = 0
    for (const page of result.pages) {
      const next = consumePage(page.text, originalChars, cursor)
      if (next === null) {
        contiguous = false
        break
      }
      cursor = next
    }

    const rendered = result.pages.map((page) => page.render.lines.join(''))
    const intact = rendered.every(isIntact) && isIntact(entry.text)

    const page0 = result.pages[0]
    let exportWidth = 0
    let exportHeight = 0
    let textInk = 0
    let artInk = 0
    const lineWidths: number[] = []
    if (page0) {
      const exported = renderPageToCanvas(image, page0, 2, { background: null, drawArt: true })
      exportWidth = exported.width
      exportHeight = exported.height
      artInk = inkPixels(exported)
      textInk = inkPixels(
        renderPageToCanvas(image, page0, 1, { background: null, drawArt: false })
      )
      // Measure each rendered line the same way the engine did, so a line that
      // overflows the canvas (i.e. visibly clipped text) shows up as a number.
      measure.font = `${page0.render.style.fontSize}px ${page0.render.style.fontStack}`
      for (const line of page0.render.lines) lineWidths.push(measure.measureText(line).width)
    }
    const widest = lineWidths.length > 0 ? Math.max(...lineWidths) : 0
    const withinCanvas = !page0 || widest <= page0.width + 0.5

    report.cases.push({
      name: entry.name,
      inputLength: entry.text.length,
      pages: result.pages.length,
      estimatedPages: result.estimatedPages,
      fontSize: result.diagnostics.fontSize,
      templateFontSize: result.diagnostics.templateFontSize,
      lines: result.diagnostics.lines,
      strategy: result.diagnostics.strategy,
      shrunk: result.diagnostics.shrunk,
      overLimit: result.overLimit,
      lossless,
      contiguous,
      intact,
      exportWidth,
      exportHeight,
      canvasWidth: page0?.width ?? 0,
      canvasHeight: page0?.height ?? 0,
      lineWidths,
      sampleLines: page0?.render.lines.slice(0, 2) ?? [],
      withinCanvas,
      cacheStable,
      durationMs,
      textInkPixels: textInk,
      artInkPixels: artInk,
      notes: result.diagnostics.notes,
    })

    if (!lossless) errors.push(`${entry.name}：排版结果与原文不一致`)
    if (!contiguous) errors.push(`${entry.name}：分页不是原文的连续切片`)
    if (!intact) errors.push(`${entry.name}：出现了被截断的字符`)
    if (!cacheStable) errors.push(`${entry.name}：测量缓存导致两次排版结果不同`)
    if (!withinCanvas) {
      errors.push(
        `${entry.name}：第 1 张有 ${widest.toFixed(0)}px 宽的一行超出 ${page0?.width}px 画布（文字会被裁切）`
      )
    }
    if (textInk === 0) errors.push(`${entry.name}：没有绘制出任何文字像素`)
    if (image && artInk === 0) errors.push(`${entry.name}：没有绘制出角色素材`)

    // Publish progress after every draft: if a later one is slow or hangs, the
    // report still says exactly how far the renderer got.
    publishProgress(report)
  }

  report.ok = errors.length === 0
  return report
}

/**
 * Answer `smoke` commands from the main process.
 *
 * Installed unconditionally (the listener is a no-op during normal use) so the
 * self-test does not need a different renderer bundle from the shipped one.
 */
export function installSmokeListener(): void {
  const api = window.sekaiDesktop
  if (!api?.on || !api.reportSmoke) return
  api.on('desktop:command', (payload) => {
    if ((payload as { type?: string })?.type !== 'smoke') return
    const send = api.reportSmoke!
    progressSink = (partial) => void send({ ...partial, partial: true })
    void runRendererSmoke()
      .then((report) => send(report))
      .catch((error: Error) =>
        send({
          ok: false,
          url: location.href,
          templates: 0,
          defaultTemplate: null,
          fontsReady: false,
          fontChecks: {},
          image: null,
          artBox: null,
          cases: [],
          errors: [String(error?.stack || error)],
        })
      )
      .finally(() => {
        progressSink = null
      })
  })
}
