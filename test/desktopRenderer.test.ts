// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Tests for the desktop sticker renderer.
 *
 * Two things are checked here that the layout-engine suite cannot cover:
 *   1. the bridge between a real template (`characters.json` shape) and the
 *      engine — anchor, colour, art box and the resulting pages;
 *   2. the painting contract: an export happens only when fonts and art are
 *      ready, the canvas is sized from the page (including grown canvases), and
 *      the text lands at `anchorX/anchorY` with one line per `lineHeight`.
 *
 * The canvas is a recording stub, so every assertion is about the calls the
 * renderer makes rather than about rasterised pixels.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  alphaBoundsOf,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  containRect,
  layoutForTemplate,
  paintPage,
  type Canvas2DLike,
  type StickerTemplate,
} from '../desktop/renderer/stickerRenderer.ts'
import { fallbackGraphemes } from '../src/layout/segment.ts'

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

/** Deterministic metrics: CJK is 1em, everything else 0.55em. */
function makeMeasure() {
  let font = '16px sans-serif'
  const sizeOf = (): number => {
    const m = /(\d+(?:\.\d+)?)px/.exec(font)
    return m ? Number(m[1]) : 16
  }
  const advance = (g: string, size: number): number => {
    const cp = g.codePointAt(0) ?? 0
    const wide =
      (cp >= 0x1100 && cp <= 0x11ff) ||
      (cp >= 0x2e80 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7af) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xff00 && cp <= 0xffef) ||
      (cp >= 0x20000 && cp <= 0x2fa1f) ||
      cp === 0x3000
    return wide ? size : size * 0.55
  }
  return {
    get font() {
      return font
    },
    set font(next: string) {
      font = next
    },
    measureText(text: string) {
      const size = sizeOf()
      let width = 0
      for (const g of fallbackGraphemes(text)) width += advance(g, size)
      return { width, actualBoundingBoxAscent: size * 0.82, actualBoundingBoxDescent: size * 0.2 }
    },
  }
}

interface Call {
  op: string
  args: unknown[]
  /** Paint state captured at the moment of the call. */
  style?: Record<string, unknown>
}

/** A 2D context that records every drawing call. */
function makeRecordingContext(): { ctx: Canvas2DLike; calls: Call[]; canvas: { width: number; height: number } } {
  const calls: Call[] = []
  const canvas = { width: 0, height: 0 }
  const record =
    (op: string, snapshot?: () => Record<string, unknown>) =>
    (...args: unknown[]): void => {
      const call: Call = { op, args }
      if (snapshot) call.style = snapshot()
      calls.push(call)
    }
  const ctx = {
    canvas,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'left' as CanvasTextAlign,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    measureText: (text: string) => makeMeasure().measureText(text),
    clearRect: record('clearRect'),
    fillRect: record('fillRect', () => ({ fillStyle: ctx.fillStyle })),
    fillText: record('fillText', () => ({ fillStyle: ctx.fillStyle, font: ctx.font })),
    strokeText: record('strokeText'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    drawImage: record('drawImage'),
  } as unknown as Canvas2DLike
  return { ctx, calls, canvas }
}

/** The shape `src/characters.json` uses for every sticker. */
const TEMPLATE: StickerTemplate = {
  id: '60',
  name: '凤笑梦 11',
  character: 'emu',
  img: 'emu/emu_11.webp',
  color: '#FF66BB',
  defaultText: { x: 148, y: 70, r: -2, s: 38 },
}

/** A narrow sprite like the real assets (40x256). */
const NARROW_ART = { width: 40, height: 256 }

function alphaFor(width: number, height: number, inside: (x: number, y: number) => boolean) {
  return (w: number, h: number): Uint8ClampedArray | null => {
    if (w !== width || h !== height) return null
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        data[(y * w + x) * 4 + 3] = inside(x, y) ? 255 : 0
      }
    }
    return data
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

test('containRect centres the art and preserves its aspect ratio', () => {
  const rect = containRect(40, 256)
  assert.equal(rect.height, 256)
  assert.equal(rect.width, 40)
  assert.equal(rect.x, (CANVAS_WIDTH - 40) / 2)
  assert.equal(rect.y, 0)
})

test('containRect scales a wide image down to the canvas width', () => {
  const rect = containRect(800, 400)
  assert.equal(rect.width, CANVAS_WIDTH)
  assert.equal(rect.height, (400 * CANVAS_WIDTH) / 800)
  assert.equal(rect.x, 0)
  assert.ok(rect.y > 0)
})

test('containRect handles a degenerate image without dividing by zero', () => {
  assert.deepEqual(containRect(0, 100), { x: 0, y: 0, width: 0, height: 0 })
  assert.deepEqual(containRect(100, 0), { x: 0, y: 0, width: 0, height: 0 })
})

test('alphaBoundsOf finds the real sprite bounds, not the padded canvas', () => {
  // Art occupies the middle third of the source pixels.
  const bounds = alphaBoundsOf(
    NARROW_ART,
    alphaFor(NARROW_ART.width, NARROW_ART.height, (_x, y) => y > 80 && y < 176)
  )
  assert.ok(bounds, 'expected bounds')
  const expected = containRect(NARROW_ART.width, NARROW_ART.height)
  // y 81..175 in source pixels maps through the contain fit.
  assert.ok(Math.abs(bounds!.y - (expected.y + 81)) < 2, `y was ${bounds!.y}`)
  assert.ok(Math.abs(bounds!.height - 95) < 3, `height was ${bounds!.height}`)
  assert.ok(Math.abs(bounds!.width - expected.width) < 1)
})

test('alphaBoundsOf returns null when the pixels cannot be read', () => {
  assert.equal(alphaBoundsOf(NARROW_ART, () => null), null)
  assert.equal(alphaBoundsOf(NARROW_ART, () => new Uint8ClampedArray(4)), null)
})

test('a fully transparent image yields no art box', () => {
  assert.equal(
    alphaBoundsOf(NARROW_ART, alphaFor(NARROW_ART.width, NARROW_ART.height, () => false)),
    null
  )
})

// ---------------------------------------------------------------------------
// Template bridge
// ---------------------------------------------------------------------------

test('a short draft keeps the template style and needs no splitting', () => {
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '你好',
    artBox: null,
  })
  assert.equal(result.pages.length, 1)
  assert.equal(result.diagnostics.strategy, 'single-line-template')
  const style = result.pages[0].render.style
  assert.equal(style.fontSize, TEMPLATE.defaultText.s)
  assert.equal(style.color, TEMPLATE.color, 'template colour is used by default')
  assert.equal(style.templateStyle, true)
  assert.equal(result.pages[0].render.anchorX, TEMPLATE.defaultText.x)
  assert.equal(result.pages[0].render.anchorY, TEMPLATE.defaultText.y)
})

test('a style override changes the colour but not the original text', () => {
  const text = '测试颜色覆盖'
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text,
    artBox: null,
    style: { color: '#123456' },
  })
  assert.equal(result.pages[0].render.style.color, '#123456')
  assert.equal(result.originalText, text)
  assert.equal(result.pages[0].text, text)
})

test('the desktop settings are passed through to the layout engine', () => {
  const text = '甲'.repeat(60)
  const tight = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text,
    artBox: null,
    settings: { minFontSize: 30, maxLines: 2, allowCanvasExtension: false },
  })
  for (const page of tight.pages) {
    assert.ok(page.render.lines.length <= 2, 'maxLines is honoured')
    assert.ok(page.render.style.fontSize >= 30, 'minFontSize is honoured')
  }
})

test('a real sprite box keeps wrapped text clear of the character', () => {
  // The sprite fills the canvas height, so there is no free band beside it: the
  // engine must either grow the canvas or place the block off the art — never
  // leave text sitting on the character.
  const artBox = { x: 128, y: 0, width: 40, height: 256 }
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '今天也要一起加油练习哦大家辛苦了明天见晚',
    artBox,
  })
  for (const page of result.pages) {
    if (page.render.bandMode) {
      assert.ok(
        page.render.textBlock.bottom <= page.contentTop + 1,
        'band mode puts the text above the art'
      )
      continue
    }
    const block = page.render.textBlock
    const overlaps =
      block.right > artBox.x &&
      block.left < artBox.x + artBox.width &&
      block.bottom > artBox.y &&
      block.top < artBox.y + artBox.height
    assert.equal(overlaps, false, `text block ${JSON.stringify(block)} covers the sprite`)
  }
  assert.equal(result.pages.map((p) => p.text).join(''), '今天也要一起加油练习哦大家辛苦了明天见晚')
})

test('a long draft is never short of pages and never loses characters', () => {
  const text = '今晚8点开始Project SEKAI的直播活动欢迎大家来参加，记得带好耳机！'.repeat(6)
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text,
    artBox: { x: 128, y: 0, width: 40, height: 256 },
    settings: { maxPages: 40, allowManyPages: true },
  })
  assert.equal(result.pages.map((p) => p.text).join(''), text)
  for (const page of result.pages) {
    assert.equal(page.render.lines.join('').replace(/\s/g, ''), page.text.replace(/\s/g, ''))
  }
})

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

test('paintPage sizes the canvas from the page and clears it first', () => {
  const { ctx, calls, canvas } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '你好',
    artBox: null,
  })
  paintPage(ctx, NARROW_ART, result.pages[0], 2)
  assert.equal(canvas.width, CANVAS_WIDTH * 2)
  assert.equal(canvas.height, CANVAS_HEIGHT * 2)
  const first = calls.find((c) => c.op === 'clearRect' || c.op === 'fillRect')
  assert.equal(first?.op, 'clearRect')
  assert.deepEqual(first?.args, [0, 0, CANVAS_WIDTH * 2, CANVAS_HEIGHT * 2])
})

test('a grown canvas is painted at its own height, not the template height', () => {
  const { ctx, canvas } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '甲'.repeat(30),
    artBox: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  })
  const page = result.pages[0]
  assert.ok(page.height > CANVAS_HEIGHT, `expected a grown canvas, got ${page.height}`)
  paintPage(ctx, NARROW_ART, page, 1)
  assert.equal(canvas.height, page.height)
})

test('text is painted with the template font, colour and anchor', () => {
  const { ctx, calls } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '你好',
    artBox: null,
  })
  const page = result.pages[0]
  paintPage(ctx, NARROW_ART, page, 1)

  assert.match(ctx.font, new RegExp(`^${page.render.style.fontSize}px `))
  assert.equal(ctx.fillStyle, page.render.style.color)
  assert.equal(ctx.textAlign, 'center')
  const translate = calls.find((c) => c.op === 'translate')
  assert.deepEqual(translate?.args, [page.render.anchorX, page.render.anchorY])
  const rotate = calls.find((c) => c.op === 'rotate')
  assert.deepEqual(rotate?.args, [page.render.style.rotate / 10])
})

test('each rendered line is painted at its own line height', () => {
  const { ctx, calls } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '今天也要一起加油练习哦大家辛苦了明天见晚',
    artBox: null,
  })
  const page = result.pages[0]
  paintPage(ctx, NARROW_ART, page, 1)
  const drawn = calls.filter((c) => c.op === 'fillText')
  assert.equal(drawn.length, page.render.lines.length)
  drawn.forEach((call, index) => {
    assert.equal(call.args[0], page.render.lines[index])
    assert.equal(call.args[1], 0)
    assert.ok(
      Math.abs((call.args[2] as number) - index * page.render.style.lineHeight) < 1e-6,
      `line ${index} was painted at y=${call.args[2]}`
    )
  })
})

test('a stroke template also strokes every line', () => {
  const { ctx, calls } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '描边测试',
    artBox: null,
    style: { strokeWidth: 3, strokeColor: '#000000' },
  })
  const page = result.pages[0]
  paintPage(ctx, NARROW_ART, page, 1)
  assert.equal(ctx.lineWidth, 3)
  assert.equal(ctx.strokeStyle, '#000000')
  assert.equal(calls.filter((c) => c.op === 'strokeText').length, page.render.lines.length)
})

test('the white-background option paints an opaque base and leaves PNG alpha alone by default', () => {
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '背景测试',
    artBox: null,
  })
  const withBackground = makeRecordingContext()
  paintPage(withBackground.ctx, NARROW_ART, result.pages[0], 1, { background: '#ffffff' })
  const fill = withBackground.calls.find((c) => c.op === 'fillRect')
  assert.equal(fill?.args[2], CANVAS_WIDTH)
  assert.equal(fill?.style?.fillStyle, '#ffffff')

  const transparent = makeRecordingContext()
  paintPage(transparent.ctx, NARROW_ART, result.pages[0], 1)
  assert.equal(transparent.calls.some((c) => c.op === 'fillRect'), false)
})

test('the band offset moves the art, never the text', () => {
  const { ctx, calls } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '甲'.repeat(30),
    artBox: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  })
  const page = result.pages[0]
  paintPage(ctx, NARROW_ART, page, 1)
  const draw = calls.find((c) => c.op === 'drawImage')
  assert.ok(draw, 'the art must be drawn')
  const artY = draw!.args[2] as number
  assert.ok(
    Math.abs(artY - page.contentTop) < 1,
    `art should start at contentTop (${page.contentTop}), got ${artY}`
  )
  const textBlock = page.render.textBlock
  assert.ok(
    textBlock.bottom <= page.contentTop + 1,
    'the text band must end before the art starts'
  )
})

test('a missing image still renders the text, so nothing is silently blank', () => {
  const { ctx, calls } = makeRecordingContext()
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text: '没有底图',
    artBox: null,
  })
  paintPage(ctx, null, result.pages[0], 1)
  assert.equal(calls.some((c) => c.op === 'drawImage'), false)
  assert.equal(calls.filter((c) => c.op === 'fillText').length, 1)
})

test('every page of a multi-page sticker renders its own slice', () => {
  const text = '世界计划彩色舞台大家好。'.repeat(30)
  const result = layoutForTemplate({
    measure: makeMeasure(),
    template: TEMPLATE,
    text,
    artBox: null,
    settings: { maxPages: 60, allowManyPages: true },
  })
  assert.ok(result.pages.length > 1)
  for (const page of result.pages) {
    const { ctx, calls } = makeRecordingContext()
    paintPage(ctx, NARROW_ART, page, 1)
    const painted = calls
      .filter((c) => c.op === 'fillText')
      .map((c) => c.args[0] as string)
      .join('')
    assert.equal(painted, page.text, `page ${page.index} painted something else`)
  }
})
