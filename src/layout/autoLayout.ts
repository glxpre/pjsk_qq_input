// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Auto-layout engine for QQ companion stickers.
 *
 * Design constraints (desktop feature request):
 *   - the user's original text is never summarised, shortened, rewritten or
 *     silently truncated; `result.originalText` is the input string and every
 *     `page.text` is an exact slice of it;
 *   - fitting is decided from real measurements (`measureText`) plus the real
 *     character bounding box, not from "more than N characters" heuristics;
 *   - short text keeps the template's own size / colour / position / style;
 *   - medium text wraps onto 2-3 lines at a readable size;
 *   - when wrapping cannot fit, the font shrinks toward a configurable minimum
 *     (22px at the 296x256 logical size by default);
 *   - when the minimum size and the line cap still cannot fit, the canvas grows
 *     so the text gets its own band above the character art;
 *   - when even that cannot hold the whole text, it is split across pages at
 *     sentence / punctuation / grapheme boundaries, every page reusing the same
 *     template and carrying a consecutive slice of the original;
 *   - QQ output is horizontal only: a template tilt that does not fit is dropped
 *     rather than clipping glyphs.
 *
 * The module is free of DOM and React types (it needs only a `measureText`
 * surface), so it runs unchanged in the Electron renderer and under
 * `node --test`.
 */

import {
  fallbackGraphemes,
  isNoLineEnd,
  isNoLineStart,
  makeGraphemeSegmenter,
  segmentLine,
  type GraphemeSegmenter,
  type Segment,
} from './segment.ts'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Minimal result of `CanvasRenderingContext2D.measureText`. */
export interface TextMetricsLike {
  width: number
  actualBoundingBoxAscent?: number
  actualBoundingBoxDescent?: number
}

/** Minimal measuring surface the layout engine needs. */
export interface MeasureContext {
  font: string
  measureText(text: string): TextMetricsLike
}

/** Axis-aligned rectangle in logical (1x) canvas pixels. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Font family stacks, mirroring `useCanvasDrawing.FONT_STACKS`. */
export type LayoutFontKey = 'yuruka' | 'fangtang' | 'system'

/** Style overrides the desktop UI may apply on top of the template. */
export interface LayoutStylePrefs {
  /** Force a line colour instead of the template's character colour. */
  color?: string
  /** Force a font family instead of the template default. */
  fontKey?: LayoutFontKey
  /** `false` means never draw the text behind the character art. */
  allowTextBehind?: boolean
  /** Rotation, same unit as the template (`rotate / 10` radians). */
  rotate?: number
}

/** Tunables for the fitting search. */
export interface LayoutSettings {
  /** Font size at which shrinking stops (logical px at 1x). */
  minFontSize: number
  /** Hard cap on rendered lines per page, explicit `\n` included. */
  maxLines: number
  /** Above this page count the caller is asked before generating. */
  maxPages: number
  /** `true` means generate past `maxPages` instead of returning `overLimit`. */
  allowManyPages: boolean
  /** Line height multiplier applied to the font size. */
  lineHeightRatio: number
  /** Padding between the character art box and the text block. */
  gap: number
  /** Padding kept free on every canvas edge. */
  padding: number
  /** `true` allows growing the canvas to add a text band above the art. */
  allowCanvasExtension: boolean
  /** Logical canvas size at 1x. */
  canvasWidth: number
  canvasHeight: number
}

export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  minFontSize: 22,
  maxLines: 3,
  maxPages: 6,
  allowManyPages: false,
  lineHeightRatio: 1.18,
  gap: 4,
  padding: 4,
  allowCanvasExtension: true,
  canvasWidth: 296,
  canvasHeight: 256,
}

/** Template fields the layout reads from `src/characters.json`. */
export interface TemplateAnchor {
  x: number
  y: number
  /** Template rotation unit (`rotate / 10` radians). */
  r: number
  /** Template default font size. */
  s: number
}

/** Fully resolved text style for one page. */
export interface ResolvedTextStyle {
  fontSize: number
  fontKey: LayoutFontKey
  fontStack: string
  /** Line height in logical px, already scaled with `fontSize`. */
  lineHeight: number
  letterSpacing: number
  color: string
  strokeWidth: number
  strokeColor: string
  rotate: number
  textBehind: boolean
  /** `true` when size, position and style are the untouched template ones. */
  templateStyle: boolean
}

/** One rendered page. */
export interface LayoutPage {
  /** 1-based page number. */
  index: number
  totalPages: number
  /** Logical canvas size for this page. */
  width: number
  height: number
  /** Vertical offset applied to the character art (band mode > 0). */
  contentTop: number
  render: {
    lines: string[]
    style: ResolvedTextStyle
    /**
     * Template anchor actually used, in page coordinates: the centre of the
     * first line's em box. Consumers translate here, set `textAlign: 'center'`
     * and draw line `i` at `i * lineHeight` on the y axis, exactly like
     * `useCanvasDrawing` does.
     */
    anchorX: number
    anchorY: number
    /** Baseline of the first line, in page coordinates. */
    baseY: number
    /** Horizontal centre of the text block, in page coordinates. */
    centerX: number
    /** Advance width per line (diagnostics + fallback centring). */
    lineWidths: number[]
    /** Rotated AABB of the text block, in page coordinates. */
    textBlock: { left: number; top: number; right: number; bottom: number }
    /** `true` when the text sits in its own band above the art. */
    bandMode: boolean
  }
  /** The exact slice of the user's text this page carries. */
  text: string
  /** Number of explicit user newlines inside this page's slice. */
  explicitLineBreaks: number
}

/** Which strategy produced the layout. */
export type LayoutStrategy =
  | 'single-line-template'
  | 'wrapped-template'
  | 'wrapped-shrunk'
  | 'band-above'
  | 'split-pages'
  | 'over-limit'
  | 'empty'

/** Diagnostics surfaced in the desktop UI. */
export interface LayoutDiagnostics {
  strategy: LayoutStrategy
  fontSize: number
  templateFontSize: number
  lines: number
  pages: number
  /** The font had to shrink below the template's size. */
  shrunk: boolean
  /** The canvas had to grow to make room. */
  extended: boolean
  estimatedPages: number
  maxLines: number
  minFontSize: number
  /** Human readable notes, shown verbatim in the UI. */
  notes: string[]
}

/** Result of a layout run. */
export interface LayoutResult {
  /** The user's text, untouched. */
  originalText: string
  pages: LayoutPage[]
  diagnostics: LayoutDiagnostics
  /**
   * `true` when the text needs more pages than `maxPages` and
   * `allowManyPages` was `false`. The caller must ask the user whether to
   * generate in batches or go back and edit - nothing is discarded.
   */
  overLimit: boolean
  /** Total pages the full text would need (>= `pages.length` when over limit). */
  estimatedPages: number
}

export interface LayoutInput {
  /** Measuring context; its `font` is set by the engine. */
  ctx: MeasureContext
  anchor: TemplateAnchor
  /** Original text exactly as typed by the user. */
  text: string
  /** Character art bounding box inside the logical canvas, or `null`. */
  artBox: Box | null
  color: string
  strokeWidth: number
  strokeColor: string
  /** Template line spacing; unused directly, kept for API completeness. */
  spaceSize: number | null
  letterSpacing: number
  /** `true` when the template normally draws text behind the art. */
  textBehindTemplate: boolean
  settings?: Partial<LayoutSettings>
  stylePrefs?: LayoutStylePrefs
  /** Override the grapheme segmenter (tests inject a deterministic one). */
  segmenter?: GraphemeSegmenter | null
}

// ---------------------------------------------------------------------------
// Font stacks
// ---------------------------------------------------------------------------

export const LAYOUT_FONT_STACKS: Record<LayoutFontKey, string> = {
  yuruka: 'YurukaStd, SSFangTangTi, sans-serif',
  fangtang: 'SSFangTangTi, sans-serif',
  system:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}

/** Build a CSS font shorthand for a canvas context. */
export function fontShorthand(size: number, key: LayoutFontKey): string {
  return `${size}px ${LAYOUT_FONT_STACKS[key]}`
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

function rectOf(b: Box): Rect {
  return { left: b.x, top: b.y, right: b.x + b.width, bottom: b.y + b.height }
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
}

/** Rotate `rect` around `(cx, cy)` by `radians` and return the AABB. */
function rotatedAabb(rect: Rect, cx: number, cy: number, radians: number): Rect {
  if (radians === 0) return rect
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const pts: Array<[number, number]> = [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.right, rect.bottom],
    [rect.left, rect.bottom],
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of pts) {
    const dx = x - cx
    const dy = y - cy
    const rx = cx + dx * cos - dy * sin
    const ry = cy + dx * sin + dy * cos
    if (rx < minX) minX = rx
    if (rx > maxX) maxX = rx
    if (ry < minY) minY = ry
    if (ry > maxY) maxY = ry
  }
  return { left: minX, top: minY, right: maxX, bottom: maxY }
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

interface FontMetrics {
  /** Distance above the baseline for the tallest glyphs. */
  ascent: number
  /** Distance below the baseline. */
  descent: number
  /** `true` when the runtime reported real `actualBoundingBox*` values. */
  exact: boolean
}

/** Font metrics, cached per (family, size) key. */
const metricsCache = new Map<string, FontMetrics>()

/**
 * Per-context memo of `measureText` results, keyed by `font` + text.
 *
 * The fitting searches are inherently repetitive: each bisection probe re-wraps a
 * prefix that shares almost all of its atoms with the previous probe, at a font
 * size the previous probe already measured. Text measurement dominates the cost
 * of a long draft (a 341-character draft spent ~14 s in `measureText` alone on a
 * real canvas, versus ~1.7 s with synthetic metrics), so memoising it is what
 * keeps the UI responsive while the user is typing.
 *
 * The cache hangs off the context object, so two different canvases can never
 * share results, and `clearLayoutMetricsCache()` drops it along with the rest.
 */
const measureCaches = new WeakMap<
  object,
  { generation: number; cache: Map<string, TextMetricsLike> }
>()
const MEASURE_CACHE_LIMIT = 40_000
/**
 * Bumped by `clearLayoutMetricsCache()`. A WeakMap cannot be enumerated, so
 * invalidation works by generation: the next lookup sees a stale generation and
 * starts a fresh map.
 */
let measureGeneration = 0

/**
 * Wrap a measuring context so repeated measurements are free.
 *
 * Only `font` and `measureText` are part of the engine's contract, and the engine
 * always sets `font` before measuring, so the wrapper tracks the shorthand itself
 * instead of asking the canvas to normalise it on every call.
 */
function withMeasureCache(ctx: MeasureContext): MeasureContext {
  let entry = measureCaches.get(ctx as object)
  if (!entry || entry.generation !== measureGeneration) {
    entry = { generation: measureGeneration, cache: new Map<string, TextMetricsLike>() }
    measureCaches.set(ctx as object, entry)
  }
  const cache = entry.cache
  let font = ctx.font
  return {
    get font() {
      return font
    },
    set font(next: string) {
      font = next
      ctx.font = next
    },
    measureText(text: string) {
      const key = `${font}\u0000${text}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const value = ctx.measureText(text)
      if (cache.size >= MEASURE_CACHE_LIMIT) cache.clear()
      cache.set(key, value)
      return value
    },
  }
}

/** Drop cached metrics - call after web fonts finish loading. */
export function clearLayoutMetricsCache(): void {
  metricsCache.clear()
  measureGeneration += 1
}

function fontMetrics(ctx: MeasureContext, size: number, key: LayoutFontKey): FontMetrics {
  const cacheKey = `${key}|${size}`
  const cached = metricsCache.get(cacheKey)
  if (cached) return cached
  ctx.font = fontShorthand(size, key)
  const probe = ctx.measureText('汉AgjQy（y')
  const ascent = probe.actualBoundingBoxAscent
  const descent = probe.actualBoundingBoxDescent
  const metrics: FontMetrics =
    typeof ascent === 'number' &&
    typeof descent === 'number' &&
    Number.isFinite(ascent) &&
    Number.isFinite(descent)
      ? { ascent, descent, exact: true }
      : { ascent: size * 0.88, descent: size * 0.24, exact: false }
  metricsCache.set(cacheKey, metrics)
  return metrics
}

/**
 * Advance width of `text`.
 *
 * With letter spacing the width is the sum of per-grapheme advances plus the
 * spacing between them - the same model `useCanvasDrawing` uses when it places
 * glyphs one by one.
 */
function measureRun(
  ctx: MeasureContext,
  text: string,
  letterSpacing: number,
  segmenter: GraphemeSegmenter | null
): number {
  if (!text) return 0
  if (letterSpacing === 0) return ctx.measureText(text).width
  const graphemes = segmenter ? segmenter(text) : fallbackGraphemes(text)
  let width = 0
  for (const g of graphemes) width += ctx.measureText(g).width + letterSpacing
  return Math.max(0, width - letterSpacing)
}

// ---------------------------------------------------------------------------
// Line breaking
// ---------------------------------------------------------------------------

interface WrapOptions {
  maxWidth: number
  maxLines: number
  letterSpacing: number
  segmenter: GraphemeSegmenter | null
}

/**
 * `segmentLine` memo, keyed by the exact string.
 *
 * The fitting search measures the same slices over and over (each probe re-wraps
 * the prefix at several font sizes, and the page loop re-probes as the remaining
 * text shrinks), so the atom split is worth caching. The map is bounded because
 * a very long draft would otherwise keep every prefix alive.
 */
const atomCache = new Map<string, Segment[]>()
const ATOM_CACHE_LIMIT = 4096

function atomsFor(line: string, segmenter?: GraphemeSegmenter): Segment[] {
  const cached = atomCache.get(line)
  if (cached) return cached
  const atoms = segmentLine(line, segmenter)
  if (atomCache.size >= ATOM_CACHE_LIMIT) atomCache.clear()
  atomCache.set(line, atoms)
  return atoms
}

/**
 * Kinsoku (禁则) handling: never strand an opening bracket at a line end or a
 * closing mark at a line start.
 */
function applyKinsoku(ctx: MeasureContext, lines: string[], opts: WrapOptions): void {
  const split = (s: string): string[] => (opts.segmenter ? opts.segmenter(s) : fallbackGraphemes(s))
  const width = (s: string): number => measureRun(ctx, s, opts.letterSpacing, opts.segmenter)

  for (let i = 0; i < lines.length - 1; i++) {
    const graphemes = split(lines[i])
    if (graphemes.length < 2) continue
    const last = graphemes[graphemes.length - 1]
    if (!isNoLineEnd(last)) continue
    const moved = last + lines[i + 1]
    if (width(moved) <= opts.maxWidth) {
      lines[i] = graphemes.slice(0, -1).join('')
      lines[i + 1] = moved
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const graphemes = split(lines[i])
    if (graphemes.length === 0) continue
    const first = graphemes[0]
    if (!isNoLineStart(first)) continue
    const candidate = lines[i - 1] + first
    if (width(candidate) <= opts.maxWidth) {
      lines[i - 1] = candidate
      lines[i] = graphemes.slice(1).join('')
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === '') lines.splice(i, 1)
  }
}

/**
 * Greedy wrap of one logical line (no `\n`).
 *
 * Atoms are consumed in order. A word that does not fit moves to the next line
 * rather than being cut, and only a word that cannot fit on a line of its own
 * (a URL, a long compound) is broken - at grapheme boundaries, so emoji and
 * surrogate pairs stay whole.
 */
function wrapLogicalLine(
  ctx: MeasureContext,
  line: string,
  opts: WrapOptions
): { lines: string[]; overflowed: boolean } {
  const atoms = atomsFor(line, opts.segmenter ?? undefined)
  const lines: string[] = []
  let current: Segment[] = []
  let currentWidth = 0
  let overflowed = false

  const widthOf = (text: string): number =>
    measureRun(ctx, text, opts.letterSpacing, opts.segmenter)

  const flush = (): void => {
    // Trailing spaces at a soft break carry no visual meaning.
    lines.push(current.map((s) => s.text).join('').replace(/[ \t\u3000]+$/, ''))
    current = []
    currentWidth = 0
  }

  /** Break a single over-long word across as many lines as it needs. */
  const breakWord = (text: string): void => {
    const graphemes = opts.segmenter ? opts.segmenter(text) : fallbackGraphemes(text)
    for (const grapheme of graphemes) {
      const graphemeWidth = widthOf(grapheme)
      if (current.length > 0 && currentWidth + graphemeWidth > opts.maxWidth) {
        flush()
        if (lines.length >= opts.maxLines) {
          overflowed = true
          return
        }
      }
      current.push({ text: grapheme, isSpace: false, breakBefore: true, isCjk: false })
      currentWidth += graphemeWidth
    }
  }

  for (const atom of atoms) {
    // Leading whitespace at the start of a soft-wrapped line is dropped.
    if (current.length === 0 && atom.isSpace) continue
    const atomWidth = widthOf(atom.text)

    if (current.length > 0 && currentWidth + atomWidth > opts.maxWidth) {
      if (atom.isSpace) {
        // The line is full: the space is absorbed by the break.
        flush()
        if (lines.length >= opts.maxLines) {
          overflowed = true
          break
        }
        continue
      }

      /**
       * An atom that cannot fit on a line of its own has nowhere better to go, so
       * it must be split — and only at grapheme edges. Everything else moves down
       * intact when there is line budget left, and reports an overflow when there
       * is not: the caller then tries a smaller size or a new page, so a word is
       * never cut while a legal break still exists.
       */
      const fitsAlone = atomWidth <= opts.maxWidth

      if (!fitsAlone) {
        // Nowhere to break: this run must be split, and only at grapheme edges.
        flush()
        if (lines.length >= opts.maxLines) {
          overflowed = true
          break
        }
        breakWord(atom.text)
        if (overflowed) break
        continue
      }

      if (lines.length >= opts.maxLines) {
        // The budget is spent: report the overflow rather than cutting a word.
        overflowed = true
        break
      }

      flush()
      current.push(atom)
      currentWidth = atomWidth
    }

    current.push(atom)
    currentWidth += atomWidth
  }

  if (!overflowed && current.length > 0) flush()
  /**
   * Safety net. The greedy pass is lossless by construction; this asserts it
   * before 禁则 runs, because a duplicated or dropped grapheme is a far worse
   * failure than a slightly worse line break. The comparison ignores whitespace:
   * a soft break legitimately drops the space it breaks at.
   *
   * The recovery re-runs the same word-aware packing *without* any of the
   * break-avoidance decisions that could differ, so it stays word-safe instead of
   * degenerating into one grapheme per line.
   */
  const strip = (s: string): string => s.replace(/\s/g, '')
  if (strip(lines.join('')) !== strip(line)) {
    const recovered: string[] = []
    let acc = ''
    const pack = (text: string): void => {
      if (measureRun(ctx, acc + text, opts.letterSpacing, opts.segmenter) > opts.maxWidth) {
        if (acc !== '') recovered.push(acc)
        acc = ''
      }
      acc += text
    }
    for (const atom of atoms) {
      if (atom.isSpace) {
        // Whitespace is optional: it is dropped exactly where a line breaks.
        if (acc !== '') acc += atom.text
        continue
      }
      if (atom.text.length > 0 && measureRun(ctx, atom.text, opts.letterSpacing, opts.segmenter) > opts.maxWidth) {
        // An unbreakable run still has to be cut, at grapheme edges.
        const graphemes = opts.segmenter ? opts.segmenter(atom.text) : fallbackGraphemes(atom.text)
        for (const g of graphemes) pack(g)
        continue
      }
      pack(atom.text)
    }
    if (acc !== '') recovered.push(acc)
    const trimmed = recovered.map((l) => l.replace(/[ \t\u3000]+$/, ''))
    if (trimmed.length > 0 && strip(trimmed.join('')) === strip(line)) {
      lines.length = 0
      lines.push(...trimmed)
      overflowed = trimmed.length > opts.maxLines
      if (overflowed) {
        return { lines: trimmed.slice(0, opts.maxLines), overflowed: true }
      }
    }
  }
  const beforeKinsoku = lines.map((l) => l)
  applyKinsoku(ctx, lines, opts)
  if (strip(lines.join('')) !== strip(beforeKinsoku.join(''))) {
    lines.length = 0
    lines.push(...beforeKinsoku)
  }

  if (lines.length > opts.maxLines) {
    return { lines: lines.slice(0, opts.maxLines), overflowed: true }
  }
  return { lines, overflowed }
}

/**
 * Wrap every logical line of `text`, keeping the user's `\n` as hard breaks.
 *
 * Overflow never truncates silently: the function reports `overflowed` and the
 * caller treats that attempt as "does not fit" and tries a smaller size, more
 * lines, or a new page. The user's text is therefore never lost.
 */
function wrapText(
  ctx: MeasureContext,
  text: string,
  opts: WrapOptions
): { lines: string[]; overflowed: boolean } {
  const out: string[] = []
  let overflowed = false
  for (const logical of text.split('\n')) {
    if (logical === '') {
      if (out.length < opts.maxLines) out.push('')
      else overflowed = true
      continue
    }
    /*
     * `maxLines` is the page total, so the *remaining* room for this logical line
     * is `maxLines - out.length`. Passing the remaining room as the budget is
     * what keeps multi-line input inside the cap; the earlier version also
     * clamped the returned array to the remaining room, which silently dropped
     * lines whenever the first logical line already used the budget.
     */
    const remaining = opts.maxLines - out.length
    if (remaining <= 0) {
      overflowed = true
      break
    }
    const res = wrapLogicalLine(ctx, logical, { ...opts, maxLines: remaining })
    out.push(...res.lines)
    if (res.overflowed) {
      overflowed = true
      break
    }
    if (out.length > opts.maxLines) {
      overflowed = true
      break
    }
  }
  if (out.length > opts.maxLines) {
    return { lines: out.slice(0, opts.maxLines), overflowed: true }
  }
  return { lines: out, overflowed }
}

// ---------------------------------------------------------------------------
// Block geometry
// ---------------------------------------------------------------------------

interface BlockGeometry {
  lineHeight: number
  /** Rotated AABB of the block in page coordinates. */
  page: Rect
  /** Baseline of the first line, page coordinates. */
  baseY: number
  /** Horizontal centre of the block, page coordinates. */
  centerX: number
  /** Anchor point used, page coordinates (first line's box centre). */
  ax: number
  ay: number
  /** Advance width per line. */
  widths: number[]
  lineWidths: number[]
}

interface GeometryOptions {
  fontSize: number
  fontKey: LayoutFontKey
  lineHeight: number
  letterSpacing: number
  rotate: number
  strokeWidth: number
  anchorX: number
  anchorY: number
  segmenter: GraphemeSegmenter | null
}

/**
 * Local (pre-rotation) extents of a wrapped block relative to the anchor point.
 *
 * The template anchor is the centre of the first line's em box, matching how
 * `useCanvasDrawing` draws (`textAlign: center`, baseline at the anchor y).
 * Vertical size uses the font's real ascent/descent rather than a full em per
 * line, so a three-line block is not modelled as three em squares of emptiness.
 */
interface LocalExtents {
  halfWidth: number
  above: number
  below: number
  /** Baseline of the first line, relative to the anchor y. */
  firstBaselineOffset: number
  widths: number[]
}

function localExtents(ctx: MeasureContext, lines: string[], o: GeometryOptions): LocalExtents {
  const metrics = fontMetrics(ctx, o.fontSize, o.fontKey)
  ctx.font = fontShorthand(o.fontSize, o.fontKey)
  const widths = lines.map((l) => measureRun(ctx, l, o.letterSpacing, o.segmenter))
  const widest = widths.reduce((a, b) => Math.max(a, b), 0)
  const halfEm = o.fontSize / 2
  const pad = o.strokeWidth
  const lastBaselineOffset = halfEm + Math.max(0, lines.length - 1) * o.lineHeight
  return {
    halfWidth: widest / 2 + pad,
    above: halfEm + pad,
    below: lastBaselineOffset - halfEm + metrics.descent + pad,
    firstBaselineOffset: halfEm,
    widths,
  }
}

function geometryAt(ctx: MeasureContext, lines: string[], o: GeometryOptions): BlockGeometry {
  const ex = localExtents(ctx, lines, o)
  const raw: Rect = {
    left: o.anchorX - ex.halfWidth,
    right: o.anchorX + ex.halfWidth,
    top: o.anchorY - ex.above,
    bottom: o.anchorY + ex.below,
  }
  return {
    lineHeight: o.lineHeight,
    page: rotatedAabb(raw, o.anchorX, o.anchorY, o.rotate / 10),
    baseY: o.anchorY + ex.firstBaselineOffset,
    centerX: o.anchorX,
    ax: o.anchorX,
    ay: o.anchorY,
    widths: ex.widths,
    lineWidths: ex.widths,
  }
}

/** Measures the block at the origin so the extents are anchor-relative. */
function blockExtents(
  ctx: MeasureContext,
  lines: string[],
  o: GeometryOptions
): { halfWidth: number; halfHeight: number } {
  const probe = geometryAt(ctx, lines, { ...o, anchorX: 0, anchorY: 0 })
  return {
    halfWidth: Math.max(Math.abs(probe.page.left), Math.abs(probe.page.right)),
    halfHeight: Math.max(Math.abs(probe.page.top), Math.abs(probe.page.bottom)),
  }
}

// ---------------------------------------------------------------------------
// Fitting search
// ---------------------------------------------------------------------------

interface TryOptions {
  fontSize: number
  fontKey: LayoutFontKey
  letterSpacing: number
  rotate: number
  strokeWidth: number
  anchor: TemplateAnchor
  segmenter: GraphemeSegmenter | null
  settings: LayoutSettings
  pageWidth: number
  pageHeight: number
  contentTop: number
  /** `null` means the whole page above `contentTop` is a free text band. */
  artBox: Box | null
  /**
   * `false` keeps the anchor verbatim; `'horizontal'` keeps the template's x
   * and slides the block vertically until it fits; `true` lets the block move
   * anywhere, including clear of the character art.
   */
  allowRelocate: boolean | 'horizontal'
  /** `true` tolerates art overlap (the text is drawn behind the art). */
  allowOverlap: boolean
  maxLines: number
  /** `true` uses the anchor verbatim and never relocates. */
  fixedAnchor: boolean
  lineHeight: number
}

interface FitAttempt {
  fontSize: number
  lines: string[]
  overflowed: boolean
  geometry: BlockGeometry
  /** `true` when the anchor used is the template anchor. */
  atTemplateAnchor: boolean
  /** `true` when the chosen position overlaps the character art. */
  coveredArt: boolean
  /**
   * `true` when the block stays inside the page padding.
   *
   * Kept separate from `fits` because the two answer different questions: `padFit`
   * is "is this page geometrically usable", `fits` is "is this page *ideal*", and
   * the page-splitting path needs the former. On a template whose art fills the
   * canvas there is no placement that avoids the character, so demanding `fits`
   * would force the splitter down to one-line pages at template size instead of
   * well-filled ones.
   */
  padFit: boolean
  fits: boolean
}

/** Geometry plus the facts the ranking needs. */
interface Placement {
  geometry: BlockGeometry
  atTemplateAnchor: boolean
  /** Stays inside the page padding. */
  padFit: boolean
  /** Covers the character art. */
  covers: boolean
}

/**
 * Decide where a wrapped block sits.
 *
 * Candidate order:
 *   1. the template anchor, exactly as the sticker shipped;
 *   2. the template's horizontal centre with the block slid vertically (and into
 *      the free band above or below the art) until it fits - this is what lets a
 *      wrapped block keep the template's horizontal placement instead of being
 *      forced to shrink;
 *   3. the free bands around the art at the page centre;
 *   4. the top of the canvas.
 *
 * A candidate that covers the art is only accepted when keeping it is justified:
 * the template draws its text behind the art, or the text is the template's own
 * single line at the template's size. Otherwise the block moves so the character
 * stays visible.
 */
function placeBlock(
  ctx: MeasureContext,
  lines: string[],
  o: TryOptions
): { placement: Placement; coveredArt: boolean } {
  const art = o.artBox ? rectOf(o.artBox) : null
  const templateAnchorY = o.anchor.y + o.contentTop

  /** The geometry options for this attempt at a given anchor. */
  const geoOptions = (anchorX: number, anchorY: number): GeometryOptions => ({
    fontSize: o.fontSize,
    fontKey: o.fontKey,
    lineHeight: o.lineHeight,
    letterSpacing: o.letterSpacing,
    rotate: o.rotate,
    strokeWidth: o.strokeWidth,
    anchorX,
    anchorY,
    segmenter: o.segmenter,
  })

  const ex = blockExtents(ctx, lines, geoOptions(0, 0))

  const place = (x: number, y: number, atTemplate: boolean): Placement => {
    const geometry = geometryAt(ctx, lines, geoOptions(x, y))
    const r = geometry.page
    const padFit =
      r.left >= o.settings.padding &&
      r.right <= o.pageWidth - o.settings.padding &&
      r.top >= o.settings.padding &&
      r.bottom <= o.pageHeight - o.settings.padding
    return {
      geometry,
      atTemplateAnchor: atTemplate,
      padFit,
      covers: art ? rectsOverlap(r, art) : false,
    }
  }

  /** Vertical anchor centres for the free bands around the art. */
  const freeCentres = (): number[] => {
    const out: number[] = []
    if (art) out.push(art.top - o.settings.gap - ex.halfHeight)
    out.push(o.settings.padding + ex.halfHeight)
    if (art) out.push(art.bottom + o.settings.gap + ex.halfHeight)
    return out
  }

  const centreX = o.pageWidth / 2
  const atTemplate = place(o.anchor.x, templateAnchorY, true)

  const overlapIsDesign = o.allowOverlap || (lines.length === 1 && o.fontSize >= o.anchor.s)

  if (o.fixedAnchor || o.allowRelocate === false) {
    return { placement: atTemplate, coveredArt: atTemplate.covers }
  }

  const candidates: Placement[] = [atTemplate]
  if (o.allowRelocate === 'horizontal') {
    /*
     * Keep the template's x and slide the block to the nearest vertical position
     * that respects the page padding. Computing the clamp directly (rather than
     * trying a few fixed nudges) means a wrapped block can always use its full
     * line budget, so text does not have to shrink merely because the template's
     * anchor sits low on the canvas.
     */
    const measured = geometryAt(ctx, lines, geoOptions(o.anchor.x, 0))
    const yMin = o.settings.padding - measured.page.top
    const yMax = o.pageHeight - o.settings.padding - measured.page.bottom
    const clamped = Math.min(Math.max(templateAnchorY, yMin), Math.max(yMin, yMax))
    candidates.push(place(o.anchor.x, clamped, false))
  }
  const freeX = o.allowRelocate === 'horizontal' ? o.anchor.x : centreX
  for (const y of freeCentres()) candidates.push(place(freeX, y, false))
  if (freeX !== centreX) for (const y of freeCentres()) candidates.push(place(centreX, y, false))

  const chosen =
    candidates.find((p) => p.padFit && !p.covers) ??
    (overlapIsDesign ? candidates.find((p) => p.padFit) : undefined) ??
    candidates.find((p) => p.padFit) ??
    atTemplate
  return { placement: chosen, coveredArt: chosen.covers }
}

function tryFit(ctx: MeasureContext, text: string, o: TryOptions): FitAttempt {
  ctx.font = fontShorthand(o.fontSize, o.fontKey)
  const wrapped = wrapText(ctx, text, {
    maxWidth: o.pageWidth - o.settings.padding * 2,
    maxLines: o.maxLines,
    letterSpacing: o.letterSpacing,
    segmenter: o.segmenter,
  })
  if (wrapped.overflowed) {
    return {
      fontSize: o.fontSize,
      lines: wrapped.lines,
      overflowed: true,
      geometry: geometryAt(ctx, wrapped.lines, {
        fontSize: o.fontSize,
        fontKey: o.fontKey,
        lineHeight: o.lineHeight,
        letterSpacing: o.letterSpacing,
        rotate: o.rotate,
        strokeWidth: o.strokeWidth,
        anchorX: o.anchor.x,
        anchorY: o.anchor.y + o.contentTop,
        segmenter: o.segmenter,
      }),
      atTemplateAnchor: true,
      coveredArt: o.artBox !== null,
      padFit: false,
      fits: false,
    }
  }

  const { placement, coveredArt } = placeBlock(ctx, wrapped.lines, o)
  /*
   * Covering the character only counts as a fit when the template's own design
   * calls for it. Once the block has wrapped or moved, text across the character
   * is a failure, which pushes the engine on to a free band, a smaller size, or
   * a taller canvas.
   */
  const wrapIsTemplateLine = o.maxLines === 1 && o.fontSize >= o.anchor.s && !text.includes('\n')
  const overlapAcceptable = o.allowOverlap || (placement.atTemplateAnchor && wrapIsTemplateLine)
  return {
    fontSize: o.fontSize,
    lines: wrapped.lines,
    overflowed: false,
    geometry: placement.geometry,
    atTemplateAnchor: placement.atTemplateAnchor,
    coveredArt,
    padFit: placement.padFit,
    /*
     * `wrapped.overflowed` is false here, so a fit means the whole string was
     * placed - never a silently truncated prefix. Vertical bounds are already
     * enforced by `padFit` against the real page height.
     */
    fits: placement.padFit && (!coveredArt || overlapAcceptable),
  }
}

/**
 * Largest font size in `[minSize, startSize]` at which `text` fits.
 *
 * Font size is the primary axis because it drives both readability and the
 * sticker's resemblance to its template. Line count is secondary and tried from
 * fewest to most, so a two-line wrap at full size beats three tall lines at a
 * smaller size. A couple of linear steps resolve the common "slightly too big"
 * case faster than bisection; the remainder is bisected.
 *
 * `allowFallback` relaxes the result from "fits cleanly" to "at least produced a
 * complete layout", which the multi-page path uses so a page is always produced.
 */
function searchFontSize(
  ctx: MeasureContext,
  text: string,
  base: Omit<TryOptions, 'fontSize' | 'maxLines' | 'lineHeight'>,
  startSize: number,
  minSize: number,
  lineCandidates: number[],
  allowFallback = false
): FitAttempt | null {
  const budgets = [...lineCandidates].sort((a, b) => a - b)
  const attemptWith = (fontSize: number, maxLines: number): FitAttempt =>
    tryFit(ctx, text, {
      ...base,
      fontSize,
      maxLines,
      lineHeight: base.settings.lineHeightRatio * fontSize,
    })

  /** Best complete layout seen, even when it is not a clean fit. */
  let fallback: FitAttempt | null = null
  const firstFitAt = (fontSize: number): FitAttempt | null => {
    for (const maxLines of budgets) {
      const attempt = attemptWith(fontSize, maxLines)
      if (!attempt.overflowed && (!fallback || attempt.lines.length >= fallback.lines.length)) {
        fallback = attempt
      }
      if (attempt.fits) return attempt
    }
    return null
  }

  const atStart = firstFitAt(startSize)
  if (atStart) return atStart
  let best: FitAttempt | null = null
  const linearFloor = Math.max(minSize, startSize - 4)
  let hi = startSize - 1
  for (let size = startSize - 1; size >= linearFloor; size--) {
    const attempt = firstFitAt(size)
    if (attempt) return attempt
    hi = size - 1
  }

  let lo = minSize
  let guard = 0
  while (lo <= hi && guard++ < 40) {
    const mid = Math.floor((lo + hi) / 2)
    const attempt = firstFitAt(mid)
    if (attempt) {
      best = attempt
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best) return best
  const fallbackResult: FitAttempt | null = fallback
  return allowFallback ? fallbackResult : null
}

/**
 * Line budgets to try, widest first.
 *
 * `maxLines` is the ceiling. The floor is 1 for plain text (a shorter wrap is
 * never an error) and the number of explicit newlines for multi-line input, so
 * hard breaks are never silently merged away.
 */
function lineCandidates(maxLines: number, text: string): number[] {
  const explicit = text.split('\n').length
  const floor = Math.max(1, Math.min(explicit, maxLines))
  const out: number[] = []
  for (let n = maxLines; n >= floor; n--) out.push(n)
  return out.length > 0 ? out : [1]
}

// ---------------------------------------------------------------------------
// Page splitting
// ---------------------------------------------------------------------------

interface SplitResult {
  attempt: FitAttempt
  /** Number of UTF-16 units of `text` consumed by this page. */
  usedLength: number
}

/**
 * Choose one page's worth of text.
 *
 * A page is built by *preparing* a candidate prefix: measure it, wrap it, fix up
 * kinsoku, and only then decide whether it fits. Because the rendered lines and
 * the reported prefix length come from the same call, `usedLength` and the
 * rendered content can never disagree - a class of bug where characters silently
 * went missing.
 *
 * A binary search over grapheme counts finds the longest prefix that fits,
 * preferring the page-filling placement ladder (`bases`) at each probe.
 */
function takePage(
  ctx: MeasureContext,
  text: string,
  base: Omit<TryOptions, 'fontSize' | 'maxLines' | 'lineHeight'>,
  settings: LayoutSettings,
  segmenter: GraphemeSegmenter | null,
  continueAfterBand = true
): SplitResult | null {
  const candidates = lineCandidates(settings.maxLines, text)
  const graphemes = segmenter ? segmenter(text) : fallbackGraphemes(text)

  /**
   * Placement ladder for a page.
   *
   * `move` alone is not enough: with a tall character the free bands can be too
   * small for a wrapped block, and the page would then hold a single short line.
   * Keeping the template's horizontal centre and sliding the block vertically -
   * then relaxing to a full move, then to overlap - lets a page use its budget.
   *
   * When `continueAfterBand` is `false` the overlap tier is withheld, so the
   * caller measures the ordinary split rather than "one page that needs the
   * canvas grown".
   */
  const bases: Array<Omit<TryOptions, 'fontSize' | 'maxLines' | 'lineHeight'>> = [
    { ...base, allowRelocate: 'horizontal' },
    { ...base, allowRelocate: true },
    ...(continueAfterBand ? [base] : []),
  ]

  const wrapOptions: WrapOptions = {
    maxWidth: base.pageWidth - settings.padding * 2,
    maxLines: settings.maxLines,
    letterSpacing: base.letterSpacing,
    segmenter,
  }

  /**
   * Kinsoku fix-up that never changes how much text a page carries: a closing
   * mark such as a full stop that landed at the start of a line moves up to the
   * end of the previous line when there is room.
   */
  const pullUpIllegalStarts = (ls: string[]): string[] => {
    const out = ls.map((l) => l)
    for (let i = 1; i < out.length; i++) {
      if (out[i].length < 2) continue
      const first = out[i][0]
      if (!isNoLineStart(first)) continue
      const head = out[i - 1]
      if (head.length === 0) continue
      const candidate = head + first
      if (measureRun(ctx, candidate, base.letterSpacing, segmenter) > wrapOptions.maxWidth) continue
      out[i - 1] = candidate
      out[i] = out[i].slice(1)
    }
    return out.filter((l) => l.length > 0)
  }

  /**
   * Memoised page preparation.
   *
   * The binary search probes overlapping prefixes and the page loops re-probe
   * the same lengths as the remaining text shrinks, so the same measurement work
   * would otherwise be repeated many times. Each entry is pure with respect to
   * the page, so caching is safe.
   */
  const prepCache = new Map<number, { page: SplitResult; fits: boolean } | null>()

  /**
   * Fully prepare the page for `count` graphemes, or `null` when unusable.
   *
   * `strict` additionally requires that no rendered line begins with closing
   * punctuation. It is relaxed only by the final fallback below, because a page
   * that would otherwise be dropped is worse than one imperfect line break.
   */
  const prepare = (
    count: number,
    strict: boolean
  ): { page: SplitResult; fits: boolean } | null => {
    const cacheKey = strict ? count : -count
    const cached = prepCache.get(cacheKey)
    if (cached !== undefined) return cached
    const computed = computePrepare(count, strict)
    prepCache.set(cacheKey, computed)
    return computed
  }

  const computePrepare = (
    count: number,
    strict: boolean
  ): { page: SplitResult; fits: boolean } | null => {
    if (count < 1 || count > graphemes.length) return null
    const slice = graphemes.slice(0, count).join('')
    if (slice.trim() === '') return null
    // Never leave a lone closing mark as a whole page.
    if (count === 1 && isNoLineStart(slice)) return null
    for (let i = 0; i < bases.length; i++) {
      const isLast = i === bases.length - 1
      const attempt = searchFontSize(
        ctx,
        slice,
        bases[i],
        base.anchor.s,
        settings.minFontSize,
        candidates,
        isLast
      )
      if (!attempt) continue
      /*
       * A page that has to be split is accepted as long as it is geometrically
       * sound (`padFit`), even when the text crosses the character: `placeBlock`
       * has already returned the best non-covering placement when one exists, so
       * a covered page means the template simply has no free space. Requiring
       * `fits` here instead would collapse every page of a full-canvas template
       * into a single line at template size, which is both unreadable and
       * wasteful.
       */
      if (!attempt.padFit && !isLast) continue
      ctx.font = fontShorthand(attempt.fontSize, base.fontKey)
      const wrapped = wrapText(ctx, slice, wrapOptions)
      if (wrapped.overflowed || wrapped.lines.length === 0) continue
      const lines = pullUpIllegalStarts(wrapped.lines)
      if (lines.length === 0) continue
      if (strict && lines.some((l) => isNoLineStart(l[0]))) continue
      const rendered = lines.join('').replace(/\s/g, '')
      if (rendered !== slice.replace(/\s/g, '')) continue
      const page: SplitResult = {
        attempt: {
          ...attempt,
          lines,
          geometry: geometryAt(ctx, lines, {
            fontSize: attempt.fontSize,
            fontKey: base.fontKey,
            lineHeight: attempt.geometry.lineHeight,
            letterSpacing: base.letterSpacing,
            rotate: base.rotate,
            strokeWidth: base.strokeWidth,
            anchorX: attempt.geometry.ax,
            anchorY: attempt.geometry.ay,
            segmenter,
          }),
        },
        usedLength: slice.length,
      }
      return { page, fits: attempt.padFit }
    }
    return null
  }

  let lo = 1
  /*
   * The probe ceiling is capped: a page can never hold more than a few hundred
   * graphemes, so measuring a 5000-grapheme prefix would waste work and make the
   * cost grow with the square of the text length. Four times the
   * worst-case-per-page count is a safe, cheap upper bound.
   */
  const maxPerPage = Math.max(64, settings.maxLines * 64)
  const ceiling = Math.min(graphemes.length, maxPerPage)
  let hi = ceiling
  let best: SplitResult | null = null
  let guard = 0
  while (lo <= hi && guard++ < 60) {
    const mid = Math.floor((lo + hi) / 2)
    const prepared = prepare(mid, true)
    if (prepared && prepared.fits) {
      best = prepared.page
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best) return best

  /*
   * Nothing fitted with perfect kinsoku. Search again allowing a line to start
   * with closing punctuation: moving such a mark up needs room that is not always
   * there, and refusing to cut would drop the rest of the text entirely. A page is
   * still an exact prefix, so nothing is lost or duplicated.
   *
   * This is a second *bisection* rather than a scan down from the ceiling. The
   * scan was the single most expensive thing in the engine — on a 341-character
   * draft it probed up to 192 prefixes for every one of eleven pages, which cost
   * about a second of pure JavaScript per long draft. The relaxed answer is
   * almost always next to the strict one, so bisecting finds it in a handful of
   * probes.
   */
  lo = 1
  hi = ceiling
  guard = 0
  while (lo <= hi && guard++ < 60) {
    const mid = Math.floor((lo + hi) / 2)
    const prepared = prepare(mid, false)
    if (prepared && prepared.fits) {
      best = prepared.page
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (best) return best

  /*
   * Even a relaxed page did not report a clean fit, but a page that is merely
   * imperfect still beats dropping text. Probe a bounded ladder of sizes rather
   * than every count, so a pathological draft cannot stall the UI; the caller's
   * guaranteed-progress path covers the case where nothing at all is usable.
   */
  const stride = Math.max(1, Math.floor(ceiling / 24))
  for (let count = ceiling; count >= 1; count -= stride) {
    const prepared = prepare(count, false)
    if (prepared) return prepared.page
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** True when the text contains nothing but whitespace. */
export function isBlankText(text: string): boolean {
  return text.trim() === ''
}

/**
 * Lay out `text` for one or more sticker pages.
 *
 * `text` is never mutated: auto-inserted line breaks live only in
 * `page.render.lines`, while `page.text` always carries the exact original slice
 * it was produced from.
 */
export function layoutStickerText(input: LayoutInput): LayoutResult {
  const settings: LayoutSettings = { ...DEFAULT_LAYOUT_SETTINGS, ...(input.settings ?? {}) }
  const segmenter = input.segmenter !== undefined ? input.segmenter : makeGraphemeSegmenter()
  const text = input.text ?? ''
  const anchor = input.anchor
  const fontKey: LayoutFontKey = input.stylePrefs?.fontKey ?? 'yuruka'
  const rotate = input.stylePrefs?.rotate ?? anchor.r
  const color = input.stylePrefs?.color ?? input.color
  const allowTextBehind = input.stylePrefs?.allowTextBehind ?? true
  /*
   * Every measurement in this run goes through a memo keyed by font + text; the
   * engine re-measures the same runs constantly while bisecting, and on a real
   * canvas that repetition is the dominant cost of a long draft.
   */
  const ctx = withMeasureCache(input.ctx)

  const baseDiagnostics = {
    fontSize: anchor.s,
    templateFontSize: anchor.s,
    lines: 0,
    pages: 0,
    shrunk: false,
    extended: false,
    estimatedPages: 0,
    maxLines: settings.maxLines,
    minFontSize: settings.minFontSize,
  }

  if (isBlankText(text)) {
    return {
      originalText: text,
      pages: [],
      diagnostics: {
        ...baseDiagnostics,
        strategy: 'empty',
        notes: ['输入为空或只有空白，不生成贴纸'],
      },
      overLimit: false,
      estimatedPages: 0,
    }
  }

  const notes: string[] = []
  if (!segmenter) {
    notes.push('运行时缺少 Intl.Segmenter，已使用码点回退切分（emoji / 代理对仍不会被拆开）')
  }
  if (input.textBehindTemplate) {
    notes.push('模板默认把文字画在角色图之后（textBehind）')
  }

  /** Shared options for every attempt at the template's own canvas size. */
  const base: Omit<TryOptions, 'fontSize' | 'maxLines' | 'lineHeight'> = {
    fontKey,
    letterSpacing: input.letterSpacing,
    rotate,
    strokeWidth: input.strokeWidth,
    anchor,
    segmenter,
    settings,
    pageWidth: settings.canvasWidth,
    pageHeight: settings.canvasHeight,
    contentTop: 0,
    artBox: input.artBox,
    allowRelocate: true,
    // Templates that draw their text behind the art *want* the overlap.
    allowOverlap: input.textBehindTemplate && allowTextBehind,
    fixedAnchor: false,
  }

  /** Band mode: a dedicated horizontal text area above the character art. */
  const bandAnchor: TemplateAnchor = {
    x: settings.canvasWidth / 2,
    // Provisional; the band search derives the real position from each candidate
    // block's measured height.
    y: settings.padding,
    r: 0,
    s: anchor.s,
  }

  const style = (
    fontSize: number,
    textBehind: boolean,
    templateStyle: boolean,
    rotation: number
  ): ResolvedTextStyle => ({
    fontSize,
    fontKey,
    fontStack: LAYOUT_FONT_STACKS[fontKey],
    lineHeight: Math.round(settings.lineHeightRatio * fontSize * 100) / 100,
    letterSpacing: input.letterSpacing,
    color,
    strokeWidth: input.strokeWidth,
    strokeColor: input.strokeColor,
    rotate: rotation,
    textBehind,
    templateStyle,
  })

  const makePage = (
    attempt: FitAttempt,
    pageText: string,
    dims: { width: number; height: number; contentTop: number },
    textBehind: boolean,
    templateStyle: boolean,
    bandMode: boolean,
    rotation: number = rotate
  ): LayoutPage => ({
    index: 1,
    totalPages: 1,
    width: dims.width,
    height: dims.height,
    contentTop: dims.contentTop,
    render: {
      lines: attempt.lines,
      style: style(attempt.fontSize, textBehind, templateStyle, rotation),
      anchorX: attempt.geometry.ax,
      anchorY: attempt.geometry.ay,
      baseY: attempt.geometry.baseY,
      centerX: attempt.geometry.centerX,
      lineWidths: attempt.geometry.lineWidths,
      textBlock: {
        left: attempt.geometry.page.left,
        top: attempt.geometry.page.top,
        right: attempt.geometry.page.right,
        bottom: attempt.geometry.page.bottom,
      },
      bandMode,
    },
    text: pageText,
    explicitLineBreaks: Math.max(0, pageText.split('\n').length - 1),
  })

  const fullCanvas = { width: settings.canvasWidth, height: settings.canvasHeight, contentTop: 0 }

  // ---- 1 & 2. Template canvas: wrap, then slide, then move, then shrink ----
  const lineBudget = lineCandidates(settings.maxLines, text)
  /*
   * Rotation used by the band and multi-page paths. It starts as the template's
   * tilt and drops to horizontal whenever the text has to leave the fixed
   * template canvas, so every page of a multi-page sticker keeps one orientation
   * and nothing is ever clipped by a corner-wasting angle.
   */
  let splitBase: Omit<TryOptions, 'fontSize' | 'maxLines' | 'lineHeight'> = base

  /** Horizontal text: the documented fallback for tilted templates. */
  const horizontal = 0
  /*
   * Line budgets to try, widest first.
   *
   * The search itself prefers the fewest lines that fit (it iterates ascending),
   * so the waterfall only has to offer the whole range: budget 1 first gives the
   * short-text fast path, and the wider budgets are there for text that has to
   * wrap. Collapsing this to `[1]` whenever the text happened to fit one line at
   * the template size was a bug — a 49-character sentence "fit" one line only
   * because the first word alone fit, which forced every rung to one line and
   * pushed the layout into a needless page split.
   */
  const stepBudgets = [...lineBudget].sort((a, b) => a - b)

  /*
   * The fitting waterfall, in the order the feature request specifies:
   *
   *   1. the template's own size, position and tilt - the untouched design;
   *   2. the same wrapped onto up to `maxLines` lines;
   *   3. the template's horizontal placement kept, slid vertically to fit;
   *   4. the block allowed to move clear of the character art;
   *   5. the same ladder again with the tilt dropped;
   *   6. and finally shrinking toward `minFontSize` through the same ladder.
   *
   * The first rung that yields a fitting attempt wins, so the engine gives up the
   * tilt first, then the exact position, and only then the size.
   */
  const placements: Array<{ mode: TryOptions['allowRelocate']; label: string }> = [
    { mode: false, label: 'template' },
    { mode: 'horizontal', label: 'horizontal-anchored' },
    { mode: true, label: 'move' },
  ]
  const floors = [anchor.s, settings.minFontSize]
  /*
   * Each rung costs a full font-size search over the whole text, so the cheap and
   * most likely placements are tried across every line budget *before* moving on
   * to the next placement. That keeps the common cases at one or two searches and
   * only pays for the exotic fallbacks when they are actually needed.
   */
  const rungs: Array<{
    rotation: number
    placement: TryOptions['allowRelocate']
    floor: number
    budget: number
  }> = []
  const pushRotation = (rotation: number): void => {
    for (const placement of placements) {
      for (const floor of floors) {
        for (const budget of stepBudgets) {
          rungs.push({ rotation, placement: placement.mode, floor, budget })
        }
      }
    }
  }
  pushRotation(rotate)
  if (rotate !== horizontal) {
    /*
     * The horizontal fallback only applies once the template's own tilt has
     * failed at every rung - a slight tilt must not be dropped merely because
     * straight text would also fit.
     */
    pushRotation(horizontal)
  }

  let chosen: FitAttempt | null = null
  let usedRotation = rotate
  for (const rung of rungs) {
    const attempt = searchFontSize(
      ctx,
      text,
      {
        ...base,
        rotate: rung.rotation,
        allowRelocate: rung.placement,
        // Relocating is only allowed to *help*; the template's own look still
        // wins when it does not cover the character.
        allowOverlap: rung.placement === false ? false : base.allowOverlap,
      },
      anchor.s,
      rung.floor,
      [rung.budget]
    )
    if (attempt) {
      chosen = attempt
      usedRotation = rung.rotation
      break
    }
  }

  /*
   * The band and the multi-page split must not reuse a tilt already shown not to
   * fit; dropping it keeps every generated page consistent.
   */
  if (!chosen || usedRotation !== rotate) {
    splitBase = { ...base, rotate: horizontal }
  }
  if (chosen && usedRotation !== rotate) {
    notes.push(
      `模板原有 ${Math.round((rotate / 10) * (180 / Math.PI))}° 倾斜放不下全文，已回退为横排（不裁切文字）`
    )
  } else if (chosen && rotate !== 0) {
    notes.push(`沿用模板的 ${Math.round((rotate / 10) * (180 / Math.PI))}° 文字倾斜`)
  }

  if (chosen) {
    const keptTemplateSize = chosen.fontSize >= anchor.s
    const singleLine = chosen.lines.length === 1 && !text.includes('\n')
    return {
      originalText: text,
      pages: [
        makePage(
          chosen,
          text,
          fullCanvas,
          input.textBehindTemplate,
          keptTemplateSize && chosen.atTemplateAnchor && singleLine,
          false,
          usedRotation
        ),
      ],
      diagnostics: {
        ...baseDiagnostics,
        strategy:
          keptTemplateSize && singleLine
            ? 'single-line-template'
            : keptTemplateSize
              ? 'wrapped-template'
              : 'wrapped-shrunk',
        fontSize: chosen.fontSize,
        lines: chosen.lines.length,
        pages: 1,
        shrunk: !keptTemplateSize,
        estimatedPages: 1,
        notes: [
          ...notes,
          keptTemplateSize
            ? `字号保持模板的 ${anchor.s}px，自动换成 ${chosen.lines.length} 行`
            : `为容纳全文，字号由 ${anchor.s}px 缩小到 ${chosen.fontSize}px（最小 ${settings.minFontSize}px），共 ${chosen.lines.length} 行`,
          chosen.atTemplateAnchor ? '文字沿用模板位置' : '文字已移至角色图外的空白处，避免遮挡角色',
        ],
      },
      overLimit: false,
      estimatedPages: 1,
    }
  }

  // ---- 3. Grow the canvas: an independent text band above the art ---------
  if (settings.allowCanvasExtension) {
    /*
     * Banded layout, solved by *growing the canvas to fit the text* rather than
     * fitting the text into a fixed canvas. For each candidate (font size, line
     * budget) the band is given exactly as much vertical room as the block
     * measures, so the only real constraint is the canvas width.
     */
    const bandLimit = settings.canvasWidth
    const bandAt = (fontSize: number, maxLines: number): FitAttempt | null => {
      // The measuring context must carry this candidate's font before anything is
      // measured; `wrapText` relies on `ctx.font`.
      ctx.font = fontShorthand(fontSize, fontKey)
      const lineHeight = settings.lineHeightRatio * fontSize
      const options: GeometryOptions = {
        fontSize,
        fontKey,
        lineHeight,
        letterSpacing: input.letterSpacing,
        rotate: 0,
        strokeWidth: input.strokeWidth,
        anchorX: bandAnchor.x,
        anchorY: 0,
        segmenter,
      }
      const layout = (maxWidth: number): { lines: string[]; ok: boolean } => {
        const wrapped = wrapText(ctx, text, {
          maxWidth,
          maxLines,
          letterSpacing: input.letterSpacing,
          segmenter,
        })
        return { lines: wrapped.lines, ok: !wrapped.overflowed }
      }

      let result = layout(bandLimit)
      if (!result.ok) {
        /*
         * The first attempt overflowed. Squeezing the width further is only
         * legitimate when the text contains something unbreakable that is wider
         * than the canvas (a URL, a long compound) - otherwise the "fix" would
         * cram far more text into the band than the font size justifies. In that
         * case report no band and let the split path produce properly filled
         * pages at a readable size.
         */
        const widest = atomsFor(text, segmenter ?? undefined).reduce(
          (max, atom) =>
            atom.isSpace
              ? max
              : Math.max(max, measureRun(ctx, atom.text, input.letterSpacing, segmenter)),
          0
        )
        if (widest <= bandLimit) return null

        // Never narrow below the widest single grapheme: any less and a glyph
        // could not fit on a line of its own.
        const graphemes = segmenter ? segmenter(text) : fallbackGraphemes(text)
        const widestGrapheme = graphemes.reduce(
          (max, g) => Math.max(max, measureRun(ctx, g, input.letterSpacing, segmenter)),
          0
        )
        if (widestGrapheme > bandLimit) return null

        let lo = Math.ceil(widestGrapheme)
        let hi = bandLimit
        let best: string[] | null = null
        let guard = 0
        while (lo <= hi && guard++ < 40) {
          const mid = Math.floor((lo + hi) / 2)
          const probe = layout(mid)
          if (probe.ok) {
            best = probe.lines
            lo = mid + 1
          } else {
            hi = mid - 1
          }
        }
        if (!best) return null
        result = { lines: best, ok: true }
      }

      const ex = blockExtents(ctx, result.lines, options)
      if (ex.halfWidth * 2 > bandLimit) return null
      const anchorY = settings.padding + ex.halfHeight
      return {
        fontSize,
        lines: result.lines,
        overflowed: false,
        geometry: geometryAt(ctx, result.lines, { ...options, anchorY }),
        atTemplateAnchor: true,
        coveredArt: false,
        padFit: true,
        fits: true,
      }
    }

    const bandBudgets = [...lineBudget].sort((a, b) => a - b)
    let bandAttempt: FitAttempt | null = null
    for (const budget of bandBudgets) {
      for (let size = anchor.s; size >= settings.minFontSize; size--) {
        const attempt = bandAt(size, budget)
        if (attempt) {
          bandAttempt = attempt
          break
        }
      }
      if (bandAttempt) break
    }
    if (bandAttempt) {
      const bandHeight = Math.ceil(bandAttempt.geometry.page.bottom + settings.gap)
      const contentTop = bandHeight
      const height = Math.max(
        settings.canvasHeight,
        Math.ceil(
          contentTop + (input.artBox ? input.artBox.height + settings.gap : 0) + settings.padding
        )
      )
      return {
        originalText: text,
        pages: [
          makePage(
            bandAttempt,
            text,
            { width: settings.canvasWidth, height, contentTop },
            false,
            false,
            true,
            0
          ),
        ],
        diagnostics: {
          ...baseDiagnostics,
          strategy: 'band-above',
          fontSize: bandAttempt.fontSize,
          lines: bandAttempt.lines.length,
          pages: 1,
          shrunk: bandAttempt.fontSize < anchor.s,
          extended: true,
          estimatedPages: 1,
          notes: [
            ...notes,
            `原模板样式放不下：画布已扩展到 ${settings.canvasWidth}×${height}，上方为独立文字区，下方保留角色图`,
          ],
        },
        overLimit: false,
        estimatedPages: 1,
      }
    }
  }

  // ---- 4. Split across pages ---------------------------------------------
  /**
   * The single page-producing loop.
   *
   * `renderBudget` limits how many pages are actually built; the walk always
   * continues so the caller learns the true page count for the whole text. Both
   * the preview run and the earlier "how many pages would this need" question
   * use this same loop, so the estimate and the rendered batch can never
   * disagree.
   */
  interface SplitWalk {
    pages: LayoutPage[]
    totalPages: number
    /** Text that could not be placed at all. */
    unplaced: string
    firstFontSize: number
    stalled: boolean
  }
  const walkPages = (renderBudget: number): SplitWalk => {
    const built: LayoutPage[] = []
    let rest = text
    let total = 0
    let firstSize = settings.minFontSize
    let stalled = false
    let step = 0
    while (rest.length > 0 && step++ < 500) {
      const taken = takePage(ctx, rest, splitBase, settings, segmenter)
      let pageText = ''
      let attempt: FitAttempt | null = null
      if (taken && taken.usedLength > 0) {
        pageText = rest.slice(0, taken.usedLength)
        attempt = taken.attempt
      } else {
        /*
         * Guaranteed progress. When no clean cut exists (typically a short tail
         * such as a trailing punctuation mark), place what is left as a final
         * page at the floor size, tolerating art overlap. Refusing here would
         * leave the tail unrendered and misreport a text that actually fits.
         */
        const tail = tryFit(ctx, rest, {
          ...splitBase,
          fontSize: settings.minFontSize,
          maxLines: settings.maxLines,
          lineHeight: settings.lineHeightRatio * settings.minFontSize,
          allowRelocate: true,
          allowOverlap: true,
        })
        if (!tail || tail.overflowed || tail.lines.length === 0) {
          stalled = true
          break
        }
        pageText = rest
        attempt = tail
      }
      total++
      if (built.length === 0) firstSize = attempt.fontSize
      if (built.length < renderBudget) {
        built.push(makePage(attempt, pageText, fullCanvas, false, false, false, splitBase.rotate))
      }
      rest = rest.slice(pageText.length)
    }
    return { pages: built, totalPages: total, unplaced: rest, firstFontSize: firstSize, stalled }
  }

  const walk = walkPages(settings.allowManyPages ? 512 : settings.maxPages)
  const pages = walk.pages
  const estimatedPages = walk.totalPages
  const firstFontSize = walk.firstFontSize
  const rest = walk.unplaced
  if (walk.stalled) {
    notes.push('无法为剩余文字找到可放下的字号；原文已完整保留，请提高最大行数或降低最小字号')
  } else if (rest.length > 0 && !settings.allowManyPages) {
    notes.push('剩余文字在当前设置下无法继续拆分，请提高最大行数或降低最小字号')
  }

  if (pages.length === 0) {
    return {
      originalText: text,
      pages: [],
      diagnostics: {
        ...baseDiagnostics,
        strategy: 'over-limit',
        estimatedPages: Math.max(1, estimatedPages),
        notes: [...notes, '当前设置下无法生成：请提高最大行数、降低最小字号，或返回编辑缩短文本'],
      },
      overLimit: true,
      estimatedPages: Math.max(1, estimatedPages),
    }
  }

  const total = pages.length
  const finalPages = pages.map((p, i) => ({ ...p, index: i + 1, totalPages: total }))
  /*
   * Over limit when the render budget cut the batch short, not merely when
   * something was unplaceable: the walk already knows the true page count, so
   * anything it declined to render is text the user has not been shown yet.
   */
  const overLimit = walk.totalPages > pages.length || rest.length > 0 || walk.stalled

  notes.push(
    `文本超过单张贴纸容量，已按句子 / 标点 / 字素边界拆成 ${total} 张：每张使用同一模板，依次承载原文的连续片段`
  )
  if (overLimit) {
    notes.push(
      `全文约需 ${estimatedPages} 张，超过上限 ${settings.maxPages} 张。剩余 ${Math.max(rest.length, text.length - finalPages.reduce((s, p) => s + p.text.length, 0))} 字未丢弃：请选择分批生成或返回编辑`
    )
  }

  return {
    originalText: text,
    pages: finalPages,
    diagnostics: {
      ...baseDiagnostics,
      strategy: overLimit ? 'over-limit' : 'split-pages',
      fontSize: firstFontSize,
      lines: finalPages[0]?.render.lines.length ?? 0,
      pages: total,
      shrunk: firstFontSize < anchor.s,
      estimatedPages: Math.max(estimatedPages, total),
      notes,
    },
    overLimit,
    estimatedPages: Math.max(estimatedPages, total),
  }
}
