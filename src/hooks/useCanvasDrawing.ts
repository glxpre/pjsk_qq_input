// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useCallback } from 'react'
import { Position, FontKey, DuoConfig, DuoImageSide } from '../types'

export const FONT_STACKS: Record<FontKey, string> = {
  yuruka: 'YurukaStd, SSFangTangTi, sans-serif',
  fangtang: 'SSFangTangTi, sans-serif',
  system:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

/** Logical (CSS) size of the sticker canvas at 1× */
export const CANVAS_WIDTH = 296
export const CANVAS_HEIGHT = 256

/** Magic offset used in vertical line step: fontSize + spaceSize - VERTICAL_LINE_GAP */
const VERTICAL_LINE_GAP = 40

interface TextSettings {
  fontSize: number
  fontKey: FontKey
  spaceSize: number
  letterSpacing: number
  curve: boolean
  vertical: boolean
}

interface Colors {
  textColor: string
}

interface Stroke {
  strokeWidth: number
  strokeColor: string
}

/** Shared text style subset for duo mode */
interface DuoTextSettings {
  fontSize: number
  fontKey: FontKey
  letterSpacing: number
  /** 多行行距 */
  spaceSize: number
  strokeWidth: number
  strokeColor: string
}

/** Logical size of ONE duo slot at 1× (two slots side by side / stacked) */
export const DUO_SLOT_WIDTH = 296
export const DUO_SLOT_HEIGHT = 256

/** Auto split sentinel for DuoConfig.splitIndex */
export const DUO_SPLIT_AUTO = -1

/** Compute the effective split boundary from splitIndex (clamped to text) */
export function resolveDuoSplit(splitIndex: number, text: string): number {
  const total = text.replace(/\n/g, '').length
  if (splitIndex < 0) return Math.floor(total / 2)
  return Math.max(0, Math.min(splitIndex, total))
}

/** Set duo font on a context (font metrics + optional letter spacing) */
function applyDuoFont(ctx: CanvasRenderingContext2D, ts: DuoTextSettings, s: number): void {
  ctx.font = `${ts.fontSize * s}px ${FONT_STACKS[ts.fontKey]}`
  ctx.lineWidth = ts.strokeWidth * s
  // 字距交给字体引擎排版（浏览器不支持 letterSpacing 时静默忽略）
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  spaced.letterSpacing = ts.letterSpacing !== 0 ? `${ts.letterSpacing * s}px` : '0px'
}

/** Draw one whole line with stroke + fill (fill color varies per call) */
function strokeFillLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  color: string
): void {
  ctx.strokeText(line, x, y)
  ctx.fillStyle = color
  ctx.fillText(line, x, y)
}

/**
 * Per-char text drawing for curve / vertical layouts (ported from solo drawText).
 * `colorFor` maps the running char index (newlines excluded) to a fill color,
 * which is how merged mode splits colors when per-char layout is required.
 */
function drawDuoCharText(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: Position,
  rotate: number,
  ts: DuoTextSettings,
  s: number,
  curve: boolean,
  vertical: boolean,
  colorFor: (globalIndex: number) => string
): void {
  if (!text || text.replace(/\n/g, '') === '') return
  const { fontSize, letterSpacing, spaceSize } = ts
  const lines = text.split('\n')

  ctx.save()
  ctx.translate(position.x * s, position.y * s)
  ctx.rotate(rotate / 10)
  ctx.font = `${fontSize * s}px ${FONT_STACKS[ts.fontKey]}`
  ctx.lineWidth = ts.strokeWidth * s
  ctx.textAlign = 'center'
  ctx.strokeStyle = ts.strokeColor
  const angle = (Math.PI * text.replace(/\n/g, '').length) / 7

  let globalIndex = 0
  if (curve) {
    for (const line of lines) {
      for (let i = 0; i < line.length; i++) {
        ctx.rotate(angle / line.length / 2.5)
        ctx.save()
        ctx.translate(0, -1 * fontSize * s * 3.5)
        ctx.fillStyle = colorFor(globalIndex)
        ctx.strokeText(line[i], 0, 0)
        ctx.fillText(line[i], 0, 0)
        ctx.restore()
        globalIndex++
      }
    }
  } else if (vertical) {
    const letterStep = fontSize * s + letterSpacing * s
    const lineStep = fontSize * s + spaceSize * s - 40 * s
    let xOffset = 0
    for (const line of lines) {
      let yOffset = 0
      for (let i = 0; i < line.length; i++) {
        ctx.fillStyle = colorFor(globalIndex)
        ctx.strokeText(line[i], xOffset, yOffset)
        ctx.fillText(line[i], xOffset, yOffset)
        yOffset += letterStep
        globalIndex++
      }
      xOffset += lineStep
    }
  }
  ctx.restore()
}

/**
 * Merged (CP) text: the WHOLE line is laid out by the font engine once
 * (textAlign center → natural kerning/spacing, no overlap), then drawn twice —
 * chars left of the split boundary clip to colorA, right to colorB.
 * Curve / vertical use per-char drawing instead (their layout is per-char anyway).
 */
function drawDuoMergedText(
  ctx: CanvasRenderingContext2D,
  config: DuoConfig,
  ts: DuoTextSettings,
  s: number,
  split: number
): void {
  const lines = config.text.split('\n')

  // 弧形 / 竖排：逐字绘制本身就是按字符排版，直接按全局序号上色
  if (config.curve || config.vertical) {
    drawDuoCharText(
      ctx,
      config.text,
      config.textPosition,
      config.textRotate,
      ts,
      s,
      config.curve,
      config.vertical,
      (idx) => (idx < split ? config.colorA : config.colorB)
    )
    return
  }

  // Locate the line containing the split boundary and the char index within it
  let seen = 0
  let boundaryLine = lines.length
  let boundaryChar = 0
  for (let li = 0; li < lines.length; li++) {
    const len = lines[li].length
    if (seen + len > split) {
      boundaryLine = li
      boundaryChar = split - seen
      break
    }
    seen += len
  }

  ctx.save()
  ctx.translate(config.textPosition.x * s, config.textPosition.y * s)
  ctx.rotate(config.textRotate / 10)
  ctx.textAlign = 'center'
  ctx.strokeStyle = ts.strokeColor
  applyDuoFont(ctx, ts, s)

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line) continue
    const y = li * ts.spaceSize
    if (li < boundaryLine) {
      strokeFillLine(ctx, line, 0, y, config.colorA)
    } else if (li > boundaryLine) {
      strokeFillLine(ctx, line, 0, y, config.colorB)
    } else {
      // Boundary line: draw the whole line once per color, clipped at the boundary
      const w = ctx.measureText(line).width
      const bx = -w / 2 + ctx.measureText(line.slice(0, boundaryChar)).width
      const pad = ts.fontSize
      ctx.save()
      ctx.beginPath()
      ctx.rect(-w / 2 - pad, y - pad, bx - (-w / 2 - pad), pad * 2)
      ctx.clip()
      strokeFillLine(ctx, line, 0, y, config.colorA)
      ctx.restore()
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx, y - pad, w / 2 + pad - bx, pad * 2)
      ctx.clip()
      strokeFillLine(ctx, line, 0, y, config.colorB)
      ctx.restore()
    }
  }
  ctx.restore()
}

/**
 * Split text: textA / textB are drawn as whole lines (natural font layout)
 * over their own images.
 */
function drawDuoSplitText(
  ctx: CanvasRenderingContext2D,
  config: DuoConfig,
  ts: DuoTextSettings,
  s: number
): void {
  const parts: Array<[string, Position, string]> = [
    [config.textA, config.textPositionA, config.colorA],
    [config.textB, config.textPositionB, config.colorB],
  ]

  for (const [part, position, color] of parts) {
    if (!part || part.replace(/\n/g, '') === '') continue
    // 弧形 / 竖排：逐字绘制
    if (config.curve || config.vertical) {
      drawDuoCharText(ctx, part, position, config.textRotate, ts, s, config.curve, config.vertical, () => color)
      continue
    }
    const lines = part.split('\n')
    ctx.save()
    ctx.translate(position.x * s, position.y * s)
    ctx.rotate(config.textRotate / 10)
    ctx.textAlign = 'center'
    ctx.strokeStyle = ts.strokeColor
    applyDuoFont(ctx, ts, s)
    for (let li = 0; li < lines.length; li++) {
      if (!lines[li]) continue
      strokeFillLine(ctx, lines[li], 0, li * ts.spaceSize, color)
    }
    ctx.restore()
  }
}

/**
 * Hook that encapsulates all canvas drawing logic for duo mode.
 * Layout: horizontal → 592×256, vertical → 296×512 (slot = one full solo canvas).
 */
export function useDuoDrawing() {
  /**
   * Draw one character image inside its slot with contain-fit base + transform.
   */
  const drawDuoImage = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      side: DuoImageSide,
      img: HTMLImageElement,
      slot: { x0: number; y0: number; w: number; h: number },
      s: number
    ): void => {
      const ratio = Math.min(slot.w / img.width, slot.h / img.height)
      const drawW = img.width * ratio
      const drawH = img.height * ratio
      const cx = slot.x0 + slot.w / 2 + side.offsetX
      const cy = slot.y0 + slot.h / 2 + side.offsetY

      ctx.save()
      ctx.translate(cx * s, cy * s)
      ctx.rotate((side.rotate * Math.PI) / 180)
      ctx.scale(side.scale, side.scale)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
      ctx.restore()
    },
    []
  )

  /**
   * Draw duo text according to textMode:
   * - merged: one whole run laid out by the font, clipped into two colors at the split
   * - split: two whole-run halves (before/after split) positioned over each image
   */
  const drawDuoText = useCallback(
    (ctx: CanvasRenderingContext2D, config: DuoConfig, s: number): void => {
      const { textMode, splitIndex } = config
      // merged 用整段 text；split 用两段独立输入
      const text = textMode === 'split' ? config.textA + config.textB : config.text
      if (!text || text.replace(/\n/g, '') === '') return
      const textSettings: DuoTextSettings = {
        fontSize: config.fontSize,
        fontKey: config.fontKey,
        letterSpacing: config.letterSpacing,
        spaceSize: config.spaceSize,
        strokeWidth: config.strokeWidth,
        strokeColor: config.strokeColor,
      }

      if (textMode === 'merged') {
        const split = resolveDuoSplit(splitIndex, text)
        drawDuoMergedText(ctx, config, textSettings, s, split)
      } else {
        drawDuoSplitText(ctx, config, textSettings, s)
      }
    },
    []
  )

  /**
   * Full duo-mode draw (preview + hi-DPI export share this).
   */
  const drawDuo = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      config: DuoConfig,
      images: [HTMLImageElement | null, HTMLImageElement | null],
      scale: number = 1
    ): void => {
      const s = Number.isFinite(scale) && scale > 0 ? scale : 1
      const horizontal = config.layout === 'horizontal'
      const w = Math.round((horizontal ? DUO_SLOT_WIDTH * 2 : DUO_SLOT_WIDTH) * s)
      const h = Math.round((horizontal ? DUO_SLOT_HEIGHT : DUO_SLOT_HEIGHT * 2) * s)
      if (ctx.canvas.width !== w) ctx.canvas.width = w
      if (ctx.canvas.height !== h) ctx.canvas.height = h

      ctx.clearRect(0, 0, w, h)

      if (!document.fonts.check('12px YurukaStd')) {
        // 字体未就绪 - 显示渐变背景（与单人空态一致）
        const gradient = ctx.createLinearGradient(0, 0, w, h)
        gradient.addColorStop(0, '#2a2a2a')
        gradient.addColorStop(1, '#1a1a1a')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
        return
      }

      // Slots: two full solo-sized halves (spacing is done via per-side X/Y offset)
      const slots = [0, 1].map((i) =>
        horizontal
          ? { x0: i * DUO_SLOT_WIDTH, y0: 0, w: DUO_SLOT_WIDTH, h: DUO_SLOT_HEIGHT }
          : { x0: 0, y0: i * DUO_SLOT_HEIGHT, w: DUO_SLOT_WIDTH, h: DUO_SLOT_HEIGHT }
      )

      const drawText = () => drawDuoText(ctx, config, s)
      if (config.textBehind) drawText()

      // 图层顺序：topSide 在上层（后绘制）；默认 A 在上
      const drawOrder: Array<0 | 1> = config.topSide === 1 ? [0, 1] : [1, 0]
      for (const i of drawOrder) {
        const img = images[i]
        if (img) drawDuoImage(ctx, config.images[i], img, slots[i], s)
      }

      if (!config.textBehind) drawText()
    },
    [drawDuoImage, drawDuoText]
  )

  return { drawDuo }
}

/**
 * Hook that encapsulates all canvas drawing logic.
 * Pass `scale` > 1 for high-DPI export: layout is multiplied so text/strokes
 * are re-rasterized at higher resolution instead of upscaling a bitmap.
 */
export function useCanvasDrawing() {
  const drawText = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      text: string,
      position: Position,
      rotate: number,
      textSettings: TextSettings,
      colors: Colors,
      stroke: Stroke,
      angle: number,
      /** Scale factor applied to the fixed vertical line-gap constant */
      scale: number = 1
    ): void => {
      const { fontSize, fontKey, spaceSize, letterSpacing, curve, vertical } = textSettings
      const { textColor } = colors
      const { strokeWidth, strokeColor } = stroke

      ctx.font = `${fontSize}px ${FONT_STACKS[fontKey]}`
      ctx.lineWidth = strokeWidth
      ctx.save()

      ctx.translate(position.x, position.y)
      ctx.rotate(rotate / 10)
      ctx.textAlign = 'center'
      ctx.strokeStyle = strokeColor
      ctx.fillStyle = textColor
      const lines = text.split('\n')

      if (curve) {
        for (const line of lines) {
          for (let i = 0; i < line.length; i++) {
            ctx.rotate(angle / line.length / 2.5)
            ctx.save()
            ctx.translate(0, -1 * fontSize * 3.5)
            ctx.strokeText(line[i], 0, 0)
            ctx.fillText(line[i], 0, 0)
            ctx.restore()
          }
        }
      } else if (vertical) {
        const letterStep = fontSize + letterSpacing
        const lineStep = fontSize + spaceSize - VERTICAL_LINE_GAP * scale
        let xOffset = 0
        for (const line of lines) {
          let yOffset = 0
          for (let i = 0; i < line.length; i++) {
            ctx.strokeText(line[i], xOffset, yOffset)
            ctx.fillText(line[i], xOffset, yOffset)
            yOffset += letterStep
          }
          xOffset += lineStep
        }
      } else {
        if (letterSpacing === 0) {
          for (let i = 0, k = 0; i < lines.length; i++) {
            ctx.strokeText(lines[i], 0, k)
            ctx.fillText(lines[i], 0, k)
            k += spaceSize
          }
        } else {
          ctx.textAlign = 'left'
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const lineY = i * spaceSize
            const metrics = ctx.measureText(line)
            let charX = -metrics.width / 2
            for (let j = 0; j < line.length; j++) {
              ctx.strokeText(line[j], charX, lineY)
              ctx.fillText(line[j], charX, lineY)
              const charMetrics = ctx.measureText(line[j])
              charX += charMetrics.width + letterSpacing
            }
          }
          ctx.textAlign = 'center'
        }
      }
      ctx.restore()
    },
    []
  )

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      imgObj: HTMLImageElement | null,
      loaded: boolean,
      text: string,
      position: Position,
      rotate: number,
      textSettings: TextSettings,
      colors: Colors,
      stroke: Stroke,
      textBehind: boolean,
      /**
       * Pixel scale for export (1 = preview size).
       * Text / stroke / positions are re-drawn at this density — not bitmap-upscaled.
       */
      scale: number = 1
    ): void => {
      const s = Number.isFinite(scale) && scale > 0 ? scale : 1
      const w = Math.round(CANVAS_WIDTH * s)
      const h = Math.round(CANVAS_HEIGHT * s)
      if (ctx.canvas.width !== w) ctx.canvas.width = w
      if (ctx.canvas.height !== h) ctx.canvas.height = h

      ctx.clearRect(0, 0, w, h)

      if (loaded && imgObj && document.fonts.check('12px YurukaStd')) {
        const img = imgObj

        const hRatio = w / img.width
        const vRatio = h / img.height
        const ratio = Math.min(hRatio, vRatio)
        const centerShift_x = (w - img.width * ratio) / 2
        const centerShift_y = (h - img.height * ratio) / 2

        const angle = (Math.PI * text.length) / 7

        // Scale layout so geometry matches 1× preview, at higher pixel density
        const scaledPosition = { x: position.x * s, y: position.y * s }
        const scaledTextSettings: TextSettings = {
          ...textSettings,
          fontSize: textSettings.fontSize * s,
          spaceSize: textSettings.spaceSize * s,
          letterSpacing: textSettings.letterSpacing * s,
        }
        const scaledStroke: Stroke = {
          strokeWidth: stroke.strokeWidth * s,
          strokeColor: stroke.strokeColor,
        }

        if (textBehind) {
          drawText(
            ctx,
            text,
            scaledPosition,
            rotate,
            scaledTextSettings,
            colors,
            scaledStroke,
            angle,
            s
          )
        }

        // drawImage uses full source pixels; if the asset is low-res it still
        // cannot invent detail, but text below is re-rasterized sharply.
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          centerShift_x,
          centerShift_y,
          img.width * ratio,
          img.height * ratio
        )

        if (!textBehind) {
          drawText(
            ctx,
            text,
            scaledPosition,
            rotate,
            scaledTextSettings,
            colors,
            scaledStroke,
            angle,
            s
          )
        }
      } else {
        // 空状态 - 显示渐变背景
        const gradient = ctx.createLinearGradient(0, 0, w, h)
        gradient.addColorStop(0, '#2a2a2a')
        gradient.addColorStop(1, '#1a1a1a')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
      }
    },
    [drawText]
  )

  return {
    draw,
    drawText,
  }
}
