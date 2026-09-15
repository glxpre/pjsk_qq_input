// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Sticker rendering core.
 *
 * Pure functions shared by the desktop renderer and the sticker-generation
 * tests: measure a character image, resolve the template, lay the text out with
 * `layoutStickerText`, and paint a page onto a canvas.
 *
 * Nothing here touches React or Electron, so the same code runs in the app, in
 * `node --test` (with a stub canvas), and in a future export worker.
 */

import {
  DEFAULT_LAYOUT_SETTINGS,
  layoutStickerText,
  type Box,
  type LayoutFontKey,
  type LayoutPage,
  type LayoutResult,
  type LayoutSettings,
  type MeasureContext,
} from '../../src/layout/autoLayout.ts'

/** One entry of `src/characters.json`. */
export interface StickerTemplate {
  id?: string
  name: string
  character: string
  img: string
  color: string
  defaultText: { x: number; y: number; r: number; s: number; text?: string }
}

/** Logical canvas size of a single sticker at 1x, matching the web app. */
export const CANVAS_WIDTH = 296
export const CANVAS_HEIGHT = 256

/** Default template index, matching `useCharacter` in the web app. */
export const DEFAULT_TEMPLATE_INDEX = 98

/** Style knobs the desktop UI exposes on top of a template. */
export interface StickerStyle {
  fontKey: LayoutFontKey
  /** `null` uses the template's own rotation. */
  rotate: number | null
  strokeWidth: number
  strokeColor: string
  /** `null` uses the template's character colour. */
  color: string | null
}

export const DEFAULT_STICKER_STYLE: StickerStyle = {
  fontKey: 'yuruka',
  rotate: null,
  strokeWidth: 0,
  strokeColor: '#000000',
  color: null,
}

/** Art bounding box in logical canvas pixels. */
export interface DrawRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where a `w x h` image lands when it is centred and scaled to *contain* the
 * logical canvas, which is how `useCanvasDrawing` places sticker art.
 */
export function containRect(
  imgWidth: number,
  imgHeight: number,
  canvasWidth: number = CANVAS_WIDTH,
  canvasHeight: number = CANVAS_HEIGHT
): DrawRect {
  if (imgWidth <= 0 || imgHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  const ratio = Math.min(canvasWidth / imgWidth, canvasHeight / imgHeight)
  const width = imgWidth * ratio
  const height = imgHeight * ratio
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  }
}

/**
 * Alpha bounding box of an image after the contain fit, in logical pixels.
 *
 * Sticker assets are narrow sprites (often 40x256) centred on a 296x256 canvas,
 * so the "art box" the layout must avoid is much smaller than the image. Reading
 * the real alpha bounds is what lets the engine put text beside the character
 * instead of on top of it; when the pixels cannot be read (a tainted canvas, a
 * headless stub) the caller falls back to the full contain rectangle.
 */
export function alphaBoundsOf(
  image: { width: number; height: number },
  readPixels: (w: number, h: number) => Uint8ClampedArray | null,
  canvasWidth: number = CANVAS_WIDTH,
  canvasHeight: number = CANVAS_HEIGHT
): Box | null {
  const rect = containRect(image.width, image.height, canvasWidth, canvasHeight)
  const data = readPixels(image.width, image.height)
  if (!data || data.length < image.width * image.height * 4) return null

  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y++) {
    const row = y * image.width * 4
    for (let x = 0; x < image.width; x++) {
      if (data[row + x * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX || maxY < minY) return null

  // Map the source-pixel bounds through the same contain fit.
  const sx = rect.width / image.width
  const sy = rect.height / image.height
  return {
    x: rect.x + minX * sx,
    y: rect.y + minY * sy,
    width: (maxX - minX + 1) * sx,
    height: (maxY - minY + 1) * sy,
  }
}

/** Input for one layout run. */
export interface LayoutRequest {
  measure: MeasureContext
  template: StickerTemplate
  text: string
  artBox: Box | null
  style?: Partial<StickerStyle>
  settings?: Partial<LayoutSettings>
}

/** Lay out one sticker (or several, when the text is split). */
export function layoutForTemplate(request: LayoutRequest): LayoutResult {
  const style: StickerStyle = { ...DEFAULT_STICKER_STYLE, ...(request.style ?? {}) }
  const template = request.template
  return layoutStickerText({
    ctx: request.measure,
    anchor: {
      x: template.defaultText.x,
      y: template.defaultText.y,
      r: template.defaultText.r,
      s: template.defaultText.s,
    },
    text: request.text,
    artBox: request.artBox,
    color: style.color ?? template.color,
    strokeWidth: style.strokeWidth,
    strokeColor: style.strokeColor,
    spaceSize: null,
    letterSpacing: 0,
    textBehindTemplate: false,
    settings: { ...DEFAULT_LAYOUT_SETTINGS, ...(request.settings ?? {}) },
    stylePrefs: {
      fontKey: style.fontKey,
      ...(style.rotate === null ? {} : { rotate: style.rotate }),
    },
  })
}

/** A 2D context plus the canvas it belongs to. */
export interface Canvas2DLike {
  canvas: { width: number; height: number }
  font: string
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  textAlign: CanvasTextAlign
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: ImageSmoothingQuality
  measureText(text: string): TextMetrics
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  rect(x: number, y: number, w: number, h: number): void
  stroke(): void
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void
}

/** Image-like object the renderer can draw. */
export interface DrawableImage {
  width: number
  height: number
}

export interface PaintOptions {
  /** Background fill; `null` keeps the canvas transparent (PNG). */
  background: string | null
  /** Draw the character art at all. */
  drawArt: boolean
  /** Optional outline around the art, in logical pixels. */
  artOutline?: { width: number; color: string } | null
}

/**
 * Paint one layout page at `scale`.
 *
 * This mirrors `useCanvasDrawing` exactly so a sticker produced here and one
 * produced by the web editor are pixel-comparable:
 *   - the canvas is `page.width x page.height` logical pixels times `scale`;
 *   - the art uses the contain fit plus `page.contentTop` (the band mode offset);
 *   - text uses `anchorX/anchorY`, `textAlign: center`, and one line per
 *     `style.lineHeight`.
 */
export function paintPage(
  ctx: Canvas2DLike,
  image: DrawableImage | null,
  page: LayoutPage,
  scale: number = 1,
  options: Partial<PaintOptions> = {}
): void {
  const opts: PaintOptions = {
    background: null,
    drawArt: true,
    artOutline: null,
    ...options,
  }
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const width = Math.round(page.width * s)
  const height = Math.round(page.height * s)

  if (ctx.canvas.width !== width) ctx.canvas.width = width
  if (ctx.canvas.height !== height) ctx.canvas.height = height
  ctx.clearRect(0, 0, width, height)

  if (opts.background) {
    ctx.save()
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (opts.drawArt && image && image.width > 0 && image.height > 0) {
    const rect = containRect(image.width, image.height, page.width, page.height)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (opts.artOutline && opts.artOutline.width > 0) {
      ctx.lineWidth = opts.artOutline.width * s
      ctx.strokeStyle = opts.artOutline.color
      ctx.beginPath()
      ctx.rect(
        rect.x * s,
        (rect.y + page.contentTop) * s,
        rect.width * s,
        rect.height * s
      )
      ctx.closePath()
      ctx.stroke()
    }
    ctx.drawImage(
      image as unknown as CanvasImageSource,
      rect.x * s,
      (rect.y + page.contentTop) * s,
      rect.width * s,
      rect.height * s
    )
    ctx.restore()
  }

  const style = page.render.style
  ctx.save()
  ctx.font = `${style.fontSize * s}px ${style.fontStack}`
  ctx.lineWidth = style.strokeWidth * s
  ctx.strokeStyle = style.strokeColor
  ctx.fillStyle = style.color
  ctx.textAlign = 'center'
  ctx.translate(page.render.anchorX * s, page.render.anchorY * s)
  ctx.rotate(style.rotate / 10)
  const step = style.lineHeight * s
  for (let i = 0; i < page.render.lines.length; i++) {
    const line = page.render.lines[i]
    if (!line) continue
    const y = i * step
    if (style.strokeWidth > 0) ctx.strokeText(line, 0, y)
    ctx.fillText(line, 0, y)
  }
  ctx.restore()
}

/** Render one page to a fresh canvas (renderer-only helper). */
export function renderPageToCanvas(
  image: DrawableImage | null,
  page: LayoutPage,
  scale: number,
  options: Partial<PaintOptions> = {}
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(page.width * scale))
  canvas.height = Math.max(1, Math.round(page.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  paintPage(ctx as unknown as Canvas2DLike, image, page, scale, options)
  return canvas
}

// ---------------------------------------------------------------------------
// Focus-safe live previews
// ---------------------------------------------------------------------------

/** Handle for a floating preview that must not steal focus from QQ. */
export interface PreviewHandle {
  /** The `<img>` element showing the sticker. */
  img: HTMLImageElement
  /** Replace the shown image and re-fit the window. */
  update(dataUrl: string, width: number, height: number): void
  /** Tear the preview down. */
  close(): void
}

/**
 * Open a floating preview window that never takes keyboard focus.
 *
 * The feature request is explicit that the preview must not steal QQ's input
 * focus, so this uses `showInactive()` (Windows: SW_SHOWNOACTIVATE) and a
 * non-activating, non-focusable window. While the preview owns the "screen", the
 * user keeps typing in QQ, and the page script keeps receiving input.
 */
export function openPreviewWindow(title = '贴纸预览'): PreviewHandle | null {
  const popup = window.open('', 'sekai-sticker-preview', 'width=320,height=300,resizable=yes')
  if (!popup) return null

  popup.document.title = title
  const style = popup.document.createElement('style')
  style.textContent = `
    html, body { margin: 0; height: 100%; background: rgba(24, 22, 23, 0.94); }
    body { display: flex; align-items: center; justify-content: center; }
    img { max-width: 96vw; max-height: 96vh; image-rendering: auto; }
  `
  popup.document.head.appendChild(style)
  const img = popup.document.createElement('img')
  popup.document.body.appendChild(img)

  // A non-focusable window cannot be raised into the foreground, which is the
  // whole point: the user must keep typing in QQ.
  try {
    ;(popup as unknown as { focus?: () => void }).focus = () => {}
  } catch {
    /* some engines make focus read-only; showInactive in main is the real guard */
  }

  return {
    img,
    update(dataUrl: string, width: number, height: number) {
      img.src = dataUrl
      // Grow the popup to the sticker's aspect so nothing is squashed.
      const maxW = 420
      const maxH = 420
      const ratio = Math.min(maxW / width, maxH / height, 1)
      const w = Math.max(180, Math.round(width * ratio))
      const h = Math.max(160, Math.round(height * ratio) + 24)
      try {
        popup.resizeTo(w, h)
      } catch {
        /* ignore: not all engines allow resizeTo */
      }
    },
    close() {
      try {
        popup.close()
      } catch {
        /* already gone */
      }
    },
  }
}
