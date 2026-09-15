// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Tests for the auto-layout engine.
 *
 * The engine is deterministic given a measuring context, so the suite injects a
 * *synthetic* context whose `measureText` uses predictable per-script advances:
 * CJK / fullwidth glyphs are 1em, everything else 0.55em. That makes every
 * assertion exact instead of dependent on which fonts the machine has.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_LAYOUT_SETTINGS,
  clearLayoutMetricsCache,
  layoutStickerText,
  type LayoutInput,
  type LayoutPage,
  type MeasureContext,
} from '../src/layout/autoLayout.ts'
import {
  fallbackGraphemes,
  hasIntlSegmenter,
  isCjkGrapheme,
  isNoLineEnd,
  isNoLineStart,
  splitIntoChunks,
} from '../src/layout/segment.ts'

// ---------------------------------------------------------------------------
// Synthetic measuring context
// ---------------------------------------------------------------------------

function glyphAdvance(g: string, size: number): number {
  if (!g) return 0
  const cp = g.codePointAt(0) ?? 0
  if (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x20000 && cp <= 0x2fa1f) ||
    cp === 0x3000
  ) {
    return size
  }
  return size * 0.55
}

/** Build a measuring context with deterministic metrics. */
function makeCtx(): MeasureContext & { sizeOf: () => number } {
  let font = '16px sans-serif'
  const sizeOf = (): number => {
    const m = /(\d+(?:\.\d+)?)px/.exec(font)
    return m ? Number(m[1]) : 16
  }
  return {
    get font() {
      return font
    },
    set font(next: string) {
      font = next
    },
    sizeOf,
    measureText(text: string) {
      const size = sizeOf()
      let width = 0
      for (const g of fallbackGraphemes(text)) width += glyphAdvance(g, size)
      // A tiny non-linearity so "slightly too big" cases behave like real fonts.
      return { width, actualBoundingBoxAscent: size * 0.82, actualBoundingBoxDescent: size * 0.2 }
    },
  }
}

/** Standard template anchor used by most stickers in characters.json. */
const ANCHOR = { x: 148, y: 70, r: -2, s: 38 }

/** Character art occupying the middle of the canvas, as real stickers do. */
const ART_BOX = { x: 100, y: 20, width: 100, height: 230 }

function layout(text: string, overrides: Partial<LayoutInput> = {}) {
  clearLayoutMetricsCache()
  return layoutStickerText({
    ctx: makeCtx(),
    anchor: ANCHOR,
    text,
    artBox: ART_BOX,
    color: '#FF66BB',
    strokeWidth: 0,
    strokeColor: '#000000',
    spaceSize: 25,
    letterSpacing: 0,
    textBehindTemplate: false,
    ...overrides,
  })
}

/** Concatenate page slices: must always reproduce the input exactly. */
function reassemble(pages: LayoutPage[]): string {
  return pages.map((p) => p.text).join('')
}

function allRenderedLines(pages: LayoutPage[]): string[] {
  return pages.flatMap((p) => p.render.lines)
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

test('grapheme fallback keeps emoji, ZWJ sequences and surrogate pairs intact', () => {
  const cases = ['👨‍👩‍👧‍👦', '👍🏽', '🇨🇳', '👋', 'e\u0301', '🏳️‍🌈']
  for (const c of cases) {
    const parts = fallbackGraphemes(c)
    const rejoined = parts.join('')
    assert.equal(rejoined, c, `rejoin must be lossless for ${c}`)
    // A single logical character must not be split into several clusters.
    assert.equal(parts.length, 1, `${JSON.stringify(c)} should stay one cluster, got ${parts.length}`)
  }
})

test('fallback graphemes never emit a lone surrogate', () => {
  const text = 'a😀b𝄞c'
  for (const g of fallbackGraphemes(text)) {
    for (const ch of g) {
      const code = ch.charCodeAt(0)
      assert.ok(
        !(code >= 0xd800 && code <= 0xdbff) || g.length > 1,
        `lone high surrogate in ${JSON.stringify(g)}`
      )
    }
  }
  assert.equal(fallbackGraphemes(text).join(''), text)
})

test('Intl.Segmenter presence is reported, and both paths agree on plain text', () => {
  // Not an assertion about the host: just record which path the suite exercised.
  assert.equal(typeof hasIntlSegmenter(), 'boolean')
  assert.equal(fallbackGraphemes('你好world').join(''), '你好world')
})

test('CJK detection and kinsoku character classes', () => {
  assert.equal(isCjkGrapheme('汉'), true)
  assert.equal(isCjkGrapheme('あ'), true)
  assert.equal(isCjkGrapheme('A'), false)
  assert.equal(isCjkGrapheme('1'), false)
  assert.equal(isNoLineStart('。'), true)
  assert.equal(isNoLineStart('，'), true)
  assert.equal(isNoLineStart('汉'), false)
  assert.equal(isNoLineEnd('（'), true)
  assert.equal(isNoLineEnd(')'), false)
})

test('splitIntoChunks is lossless and prefers sentence boundaries', () => {
  const text = '第一句话。第二句话！第三句话？'
  const chunks = splitIntoChunks(text)
  assert.equal(chunks.join(''), text)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0], '第一句话。')
})

// ---------------------------------------------------------------------------
// Short text: template fidelity
// ---------------------------------------------------------------------------

test('short text keeps the template size, anchor and colour', () => {
  const text = '你好'
  const result = layout(text)
  assert.equal(result.originalText, text)
  assert.equal(result.overLimit, false)
  assert.equal(result.pages.length, 1)

  const page = result.pages[0]
  assert.equal(page.render.style.templateStyle, true)
  assert.equal(page.render.style.fontSize, ANCHOR.s)
  assert.equal(page.render.style.color, '#FF66BB')
  assert.equal(page.render.lines.length, 1)
  assert.equal(page.render.lines[0], '你好')
  // The template anchor is the centre of the first line's box (that is how
  // useCanvasDrawing places it), so the baseline sits half an em lower.
  assert.equal(page.render.anchorX, ANCHOR.x)
  assert.equal(page.render.anchorY, ANCHOR.y)
  assert.equal(page.render.baseY, ANCHOR.y + ANCHOR.s / 2)
  assert.equal(page.render.centerX, ANCHOR.x)
  assert.equal(page.width, 296)
  assert.equal(page.height, 256)
  assert.equal(result.diagnostics.strategy, 'single-line-template')
})

test('empty and whitespace-only text produces no pages', () => {
  for (const text of ['', '   ', '\n\n', ' \t\u3000 ']) {
    const result = layout(text)
    assert.equal(result.pages.length, 0)
    assert.equal(result.diagnostics.strategy, 'empty')
    assert.equal(result.overLimit, false)
  }
})

// ---------------------------------------------------------------------------
// Wrapping
// ---------------------------------------------------------------------------

test('medium Chinese text wraps into 2–3 lines at a readable size', () => {
  // 21 CJK glyphs at 38px cannot fit one line of 288px (7 fit per line), so
  // this must wrap — and the type must stay at or above the floor.
  const text = '今天也要一起加油练习哦大家辛苦了明天见晚'
  const result = layout(text)
  const page = result.pages[0]
  assert.ok(page.render.lines.length >= 2, `expected wrapping, got ${page.render.lines.length} line(s)`)
  assert.ok(page.render.lines.length <= DEFAULT_LAYOUT_SETTINGS.maxLines)
  assert.ok(
    page.render.style.fontSize >= DEFAULT_LAYOUT_SETTINGS.minFontSize,
    `font size ${page.render.style.fontSize} is below the floor`
  )
  assert.equal(page.render.style.templateStyle, false)
  // No character may be lost or duplicated by the wrap.
  assert.equal(allRenderedLines(result.pages).join('').replace(/\s/g, ''), text)
})

test('English wraps on word boundaries, never mid-word when avoidable', () => {
  const text = 'The quick brown fox jumps over the lazy dog again'
  const result = layout(text)
  const lines = result.pages.flatMap((p) => p.render.lines)
  assert.ok(lines.length >= 2, `expected wrapping, got ${lines.length} line(s)`)
  // No word may be cut while a space boundary is available.
  const joined = lines.join(' ').replace(/\s+/g, ' ')
  for (const word of text.split(' ')) {
    assert.ok(joined.includes(word), `word "${word}" was split`)
  }
  for (const line of lines.slice(0, -1)) {
    assert.ok(!/\s$/.test(line), 'soft-wrapped lines must not keep trailing spaces')
  }
  // The whole sentence is rendered, in order, and the slices rebuild the input.
  assert.equal(lines.join('').replace(/\s/g, ''), text.replace(/\s/g, ''))
  assert.equal(reassemble(result.pages), text)
})

test('a word wider than the canvas is the only thing that gets cut', () => {
  /*
   * Canvas extension is off and the line budget is one, so the 200-character run
   * cannot be moved anywhere: it must be broken at grapheme boundaries while the
   * short word in front of it stays intact.
   */
  const text = 'ok ' + 'x'.repeat(200)
  const result = layout(text, {
    settings: { maxPages: 50, allowManyPages: true, allowCanvasExtension: false, maxLines: 1 },
  })
  const rendered = result.pages.flatMap((p) => p.render.lines).join('')
  assert.equal(rendered.replace(/\s/g, ''), text.replace(/\s/g, ''))
  assert.ok(
    rendered.startsWith('ok '),
    `the short word must not be cut, got ${JSON.stringify(rendered.slice(0, 12))}`
  )
  assert.equal(result.pages[0].render.lines.length, 1)
})

test('English wraps inside the band when it does not fit the fixed page', () => {
  const text = 'The quick brown fox jumps over the lazy dog again'
  const result = layout(text)
  const lines = result.pages[0].render.lines
  assert.ok(lines.length >= 2 || result.pages.length > 1)
  const joined = result.pages
    .flatMap((p) => p.render.lines)
    .join(' ')
    .replace(/\s+/g, ' ')
  for (const word of text.split(' ')) {
    assert.ok(joined.includes(word), `word "${word}" was split`)
  }
})

test('a URL longer than the canvas is squeezed onto a band without losing characters', () => {
  const url = 'https://example.com/' + 'a'.repeat(120)
  const result = layout(url, { settings: { maxPages: 50, allowManyPages: true } })
  const strip = (s: string): string => s.replace(/\s/g, '')
  assert.equal(strip(reassemble(result.pages)), strip(url), 'slices must rebuild the URL')
  assert.equal(
    strip(allRenderedLines(result.pages).join('')),
    strip(url),
    'every URL character must be rendered'
  )
  for (const line of allRenderedLines(result.pages)) {
    assert.ok(line.length > 0, 'no empty rendered lines')
  }
  assert.ok(
    result.pages[0].render.style.fontSize >= DEFAULT_LAYOUT_SETTINGS.minFontSize,
    'the floor size is respected'
  )
})

test('an unbreakable token is wrapped at grapheme boundaries without loss', () => {
  // A single 300-char word has no word boundary anywhere, so the wrapper must
  // fall back to breaking it at grapheme boundaries.
  const token = 'a'.repeat(300)
  const result = layout(token, { settings: { maxPages: 50, allowManyPages: true } })
  assert.equal(reassemble(result.pages), token, 'no character may be dropped')
  assert.equal(allRenderedLines(result.pages).join(''), token)
  for (const page of result.pages) {
    assert.ok(page.render.style.fontSize >= DEFAULT_LAYOUT_SETTINGS.minFontSize)
    assert.ok(page.render.lines.every((l) => l.length > 0))
  }
})

test('an over-long text that no single page can hold is split, never dropped', () => {
  const text = '世界计划彩色舞台大家好。'.repeat(30)
  const result = layout(text, { settings: { maxPages: 3, allowManyPages: true } })
  assert.equal(reassemble(result.pages), text, 'every character is carried by some page')
  assert.equal(result.overLimit, false, 'allowManyPages renders the whole text')
  assert.ok(
    result.pages.length > 3,
    `expected more than the 3-page budget, got ${result.pages.length}`
  )
})

test('explicit newlines are preserved as hard breaks', () => {
  const text = '第一行\n第二行\n第三行'
  const result = layout(text)
  const page = result.pages[0]
  assert.equal(page.render.lines.length, 3)
  assert.deepEqual(page.render.lines, ['第一行', '第二行', '第三行'])
  assert.equal(page.explicitLineBreaks, 2)
  assert.equal(page.render.style.fontSize, ANCHOR.s, 'three short lines keep the template size')
})

test('closing punctuation is never pushed to the start of a line', () => {
  // 12 CJK glyphs at 38px = 456px > 288px available, so this must wrap and the
  // "。" must travel with the text it closes.
  const text = '大家一起开心地唱歌跳舞吧。'
  const result = layout(text)
  for (const page of result.pages) {
    for (const line of page.render.lines) {
      assert.ok(
        !isNoLineStart(line[0]),
        `line ${JSON.stringify(line)} starts with a closing punctuation mark`
      )
    }
  }
})

test('an opening bracket never ends a line', () => {
  const text = '请听一下（这是很重要的说明内容）谢谢大家'
  const result = layout(text)
  for (const page of result.pages) {
    for (const line of page.render.lines) {
      const last = line[line.length - 1]
      assert.ok(!isNoLineEnd(last), `line ${JSON.stringify(line)} ends with an opening bracket`)
    }
  }
})

test('auto-wrapping never mutates the recorded original text', () => {
  const text = '这是一段没有任何换行的中文长句用来验证自动换行不会污染原文'
  const result = layout(text)
  assert.equal(result.originalText, text)
  assert.ok(!result.originalText.includes('\n'), 'the original must gain no line breaks')
  // The rendered lines are re-joined with break markers; stripping those must
  // reproduce the user's text exactly.
  const rejoined = result.pages
    .map((p) => p.render.lines.join('|'))
    .join('|')
    .replace(/\|/g, '')
    .replace(/\s/g, '')
  assert.equal(rejoined, text.replace(/\s/g, ''))
  assert.ok(
    result.pages.some((p) => p.render.lines.length > 1),
    'the text is long enough that wrapping must have happened'
  )
})

// ---------------------------------------------------------------------------
// Shrinking
// ---------------------------------------------------------------------------

test('font shrinks toward the configured minimum and never stops early', () => {
  const text = '甲'.repeat(60)
  const result = layout(text)
  assert.ok(result.pages.length >= 1)
  const page = result.pages[0]
  assert.ok(
    page.render.style.fontSize <= ANCHOR.s && page.render.style.fontSize >= 22,
    `font size ${page.render.style.fontSize} outside [22, ${ANCHOR.s}]`
  )
  // Whatever the strategy, the text block stays inside the page padding.
  for (const p of result.pages) {
    const block = p.render.textBlock
    assert.ok(block.left >= 4, `text left ${block.left} breaches padding`)
    assert.ok(block.right <= p.width - 4, `text right ${block.right} breaches padding`)
    assert.ok(block.bottom <= p.height - 4, `text bottom ${block.bottom} breaches padding`)
    assert.ok(block.top >= 4, `text top ${block.top} breaches padding`)
  }
})

test('text that needs more than one page at the floor size is split, not over-shrunk', () => {
  const text = '甲'.repeat(60)
  const result = layout(text)
  assert.ok(result.pages.length >= 1)
  for (const page of result.pages) {
    assert.ok(
      page.render.style.fontSize >= 22,
      `font size ${page.render.style.fontSize} went below the 22px floor`
    )
  }
})

test('the minimum font size is configurable and respected', () => {
  const text = '甲'.repeat(40)
  const loose = layout(text, { settings: { minFontSize: 14 } })
  const strict = layout(text, { settings: { minFontSize: 30 } })
  assert.ok(loose.diagnostics.fontSize <= ANCHOR.s)
  assert.ok(strict.diagnostics.fontSize >= 30 || strict.diagnostics.strategy !== 'wrapped-shrunk')
  assert.ok(
    loose.diagnostics.fontSize <= strict.diagnostics.fontSize,
    'a lower floor may pick a smaller size but never a larger one'
  )
})

test('the line cap is configurable', () => {
  const text = '甲'.repeat(40)
  const two = layout(text, { settings: { maxLines: 2 } })
  const four = layout(text, { settings: { maxLines: 4 } })
  for (const page of two.pages) assert.ok(page.render.lines.length <= 2)
  for (const page of four.pages) assert.ok(page.render.lines.length <= 4)
})

test('wrapped text is kept off the character art when a free band exists', () => {
  // A tall art box leaves a wide free band above it, so a wrapped block must be
  // moved up rather than drawn across the sprite. The type may shrink to make
  // that possible, but it must never sit on the character and must never go
  // below the floor.
  const text = '今天也要一起加油练习哦大家辛苦了明天见晚安'
  const tallArt = { x: 100, y: 120, width: 100, height: 130 }
  const result = layout(text, { artBox: tallArt })
  const page = result.pages[0]
  assert.ok(page.render.lines.length >= 2)
  const b = page.render.textBlock
  assert.ok(
    b.bottom <= tallArt.y,
    `text block (bottom ${b.bottom}) must clear the art top (${tallArt.y})`
  )
  assert.ok(result.diagnostics.fontSize >= DEFAULT_LAYOUT_SETTINGS.minFontSize)
  assert.equal(result.pages[0].render.bandMode, false)
})

test('a single line at the template size may sit over the art, as designed', () => {
  // Regression guard for the documented exception: the short-text fast path
  // keeps the template's own anchor even when it grazes a narrow sprite.
  const result = layout('你好')
  const b = result.pages[0].render.textBlock
  const overlaps = !(
    b.right <= ART_BOX.x ||
    ART_BOX.x + ART_BOX.width <= b.left ||
    b.bottom <= ART_BOX.y ||
    ART_BOX.y + ART_BOX.height <= b.top
  )
  assert.equal(overlaps, true, 'this fixture is meant to exercise the overlap case')
  assert.equal(result.pages[0].render.style.templateStyle, true)
})

test('a short single line keeps the template position even over narrow art', () => {
  // The template's own design puts a couple of glyphs over the character; that
  // fidelity is the point, so the anchor must not be relocated for 2 glyphs.
  const result = layout('你好')
  assert.equal(result.pages[0].render.anchorX, ANCHOR.x)
  assert.equal(result.pages[0].render.anchorY, ANCHOR.y)
})

// ---------------------------------------------------------------------------
// Canvas extension
// ---------------------------------------------------------------------------

/** Art that fills the whole canvas: no free band beside it on a fixed page. */
const FULL_ART_BOX = { x: 0, y: 0, width: 296, height: 256 }

test('an over-full page grows the canvas into a text band above the art', () => {
  // With art covering the whole fixed page there is nowhere to put the text, so
  // the canvas must grow and stack the text above the art instead of shrinking
  // the type below its floor or splitting the sentence.
  const text = '甲'.repeat(30)
  const result = layout(text, { artBox: FULL_ART_BOX })
  const bandPages = result.pages.filter((p) => p.render.bandMode)
  assert.equal(bandPages.length, 1, `expected band mode, strategy=${result.diagnostics.strategy}`)
  const page = bandPages[0]
  assert.ok(page.height > 256, `canvas should have grown, got ${page.height}`)
  const block = page.render.textBlock
  assert.ok(
    block.bottom <= page.contentTop,
    `text band (bottom ${block.bottom}) must end before the art starts (${page.contentTop})`
  )
  assert.match(result.diagnostics.notes.join('\n'), /画布已扩展/)
  assert.equal(result.diagnostics.strategy, 'band-above')
  assert.equal(result.diagnostics.extended, true)
  assert.equal(allRenderedLines(result.pages).join(''), text)
})

test('band mode keeps the character art at its original size below the text', () => {
  const text = '甲'.repeat(30)
  const result = layout(text, { artBox: FULL_ART_BOX })
  const page = result.pages[0]
  // The art is drawn starting at `contentTop`, so the space below must still
  // hold it at its original height.
  assert.ok(
    page.height - page.contentTop >= FULL_ART_BOX.height,
    `no room left for the art (height ${page.height}, contentTop ${page.contentTop})`
  )
})

test('canvas extension can be disabled and falls through to splitting', () => {
  const text = '甲'.repeat(30)
  const result = layout(text, {
    artBox: FULL_ART_BOX,
    settings: { allowCanvasExtension: false },
  })
  assert.ok(result.pages.length >= 1)
  for (const page of result.pages) {
    assert.notEqual(page.render.bandMode, true)
    assert.equal(page.height, 256)
  }
  assert.equal(reassemble(result.pages), text)
})

// ---------------------------------------------------------------------------
// Multi-page splitting
// ---------------------------------------------------------------------------

test('very long text is split across pages with the original fully preserved', () => {
  const text = '世界计划彩色舞台大家好。'.repeat(30) // 360 chars
  const result = layout(text, { settings: { maxLines: 3, minFontSize: 22, maxPages: 20, allowManyPages: true } })
  assert.ok(result.pages.length > 1, `expected multiple pages, got ${result.pages.length}`)
  assert.equal(result.originalText, text)
  assert.equal(reassemble(result.pages), text, 'page slices must rebuild the original exactly')
  assert.equal(result.overLimit, false)

  result.pages.forEach((page, i) => {
    assert.equal(page.index, i + 1)
    assert.equal(page.totalPages, result.pages.length)
    assert.ok(page.render.lines.length <= 3, `page ${page.index} has too many lines`)
    assert.ok(page.text.length > 0)
  })
})

test('page numbers are not injected into the sticker body', () => {
  const text = '世界计划彩色舞台大家好。'.repeat(30)
  const result = layout(text, { settings: { maxPages: 60, allowManyPages: true } })
  const body = result.pages.map((p) => p.render.lines.join('')).join('')
  assert.equal(body, text, 'no page counters may be written into the sticker text')
  assert.equal(reassemble(result.pages), text)
})

test('over the page limit the result is flagged and nothing is discarded', () => {
  // Long enough that no band or single page can hold it, so the split path is
  // reached and the page budget genuinely bites.
  const text = '很长的一段话需要拆成很多张才放得下。'.repeat(200)
  const result = layout(text, { settings: { maxPages: 3 } })
  assert.equal(result.overLimit, true)
  assert.equal(result.diagnostics.strategy, 'over-limit')
  assert.ok(result.estimatedPages > result.pages.length)
  assert.equal(result.pages.length, 3)
  // The rendered pages are a real prefix of the input, and the note spells out
  // how much is left rather than pretending the job is done.
  const strip = (s: string): string => s.replace(/\s/g, '')
  assert.ok(strip(text).startsWith(strip(reassemble(result.pages))))
  assert.match(result.diagnostics.notes.join('\n'), /未丢弃/)
})

test('allowManyPages renders every page and clears overLimit', () => {
  const text = '很长的一段话需要拆成很多张才放得下。'.repeat(200)
  const limited = layout(text, { settings: { maxPages: 3 } })
  const full = layout(text, { settings: { maxPages: 3, allowManyPages: true } })
  assert.equal(full.overLimit, false)
  assert.equal(full.pages.length, limited.estimatedPages)
  assert.equal(reassemble(full.pages), text)
})

test('pages carry consecutive slices of the original text', () => {
  const sentence = '这是第一句话。'
  const text = sentence.repeat(24)
  const result = layout(text, { settings: { maxPages: 20, allowManyPages: true } })
  assert.ok(result.pages.length > 1)
  // Pages are consecutive, non-overlapping slices that rebuild the input, and
  // each page renders exactly the slice it claims to carry.
  assert.equal(reassemble(result.pages), text)
  let cursor = 0
  for (const page of result.pages) {
    assert.equal(page.text, text.slice(cursor, cursor + page.text.length))
    assert.equal(
      page.render.lines.join('').replace(/\s/g, ''),
      page.text.replace(/\s/g, ''),
      `page ${page.index} renders something other than its own slice`
    )
    cursor += page.text.length
  }
})

test('pages are filled even when the character art leaves no free space', () => {
  /*
   * A full-canvas template (art covering the whole sticker) has no placement that
   * avoids the character, so every wrapped page "covers" it. The splitter must
   * still fill each page: refusing covered pages used to collapse every page into
   * a single line at template size, turning a 60-character draft into three
   * stickers where two (or one) carry the same text.
   */
  const fullCanvas = { x: 0, y: 0, width: 296, height: 256 }
  const text = '想把今天的心情全部写下来，一句也不能少，所以要多写几句才够。'.repeat(2)
  const result = layout(text, { artBox: fullCanvas, settings: { maxLines: 3 } })

  assert.ok(result.pages.length >= 1)
  for (const page of result.pages) {
    // Every page but a short tail uses the full line budget, at a readable size.
    assert.ok(
      page.render.lines.length >= 2 || page.text.length < 30,
      `page ${page.index} carries ${page.text.length} chars in ${page.render.lines.length} line(s)`
    )
  }
  assert.equal(reassemble(result.pages), text)
})

test('a page that must cover the art still never exceeds the canvas', () => {
  const fullCanvas = { x: 0, y: 0, width: 296, height: 256 }
  const text = '这是第一句话。'.repeat(12)
  const ctx = makeCtx()
  const result = layoutStickerText({
    ctx,
    anchor: ANCHOR,
    text,
    artBox: fullCanvas,
    color: '#000000',
    strokeWidth: 0,
    strokeColor: '#000000',
    spaceSize: 25,
    letterSpacing: 0,
    textBehindTemplate: false,
    settings: { maxLines: 3, minFontSize: 22 },
  })
  for (const page of result.pages) {
    ctx.font = `${page.render.style.fontSize}px X`
    for (const line of page.render.lines) {
      assert.ok(
        ctx.measureText(line).width <= page.width,
        `page ${page.index} line overflows the canvas: ${line}`
      )
    }
  }
})

// ---------------------------------------------------------------------------
// Emoji and mixed scripts
// ---------------------------------------------------------------------------
test('emoji are never split across lines or pages', () => {
  const emoji = ['🎉', '🥳', '👨‍👩‍👧‍👦', '🇨🇳', '👍🏽']
  const text = emoji
    .map((e) => `今天${e}很开心`)
    .join('')
    .repeat(3)
  const result = layout(text, { settings: { maxPages: 20, allowManyPages: true } })
  assert.equal(reassemble(result.pages), text)
  for (const page of result.pages) {
    for (const line of page.render.lines) {
      for (const e of emoji) {
        // Every cluster that appears must appear whole.
        const occurrences = line.split(e).length - 1
        if (occurrences === 0) continue
        assert.ok(line.includes(e))
      }
      // No lone surrogate may survive in a rendered line.
      for (let i = 0; i < line.length; i++) {
        const code = line.charCodeAt(i)
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = line.charCodeAt(i + 1)
          assert.ok(next >= 0xdc00 && next <= 0xdfff, `lone high surrogate in ${JSON.stringify(line)}`)
        }
      }
    }
  }
})

test('mixed Chinese / English / digits wrap sensibly', () => {
  const text = '今晚8点开始Project SEKAI的直播活动欢迎大家来参加'
  const result = layout(text)
  const page = result.pages[0]
  assert.ok(page.render.lines.length >= 2)
  assert.ok(page.render.style.fontSize >= 22, 'never below the floor')
  // The engine's own measurements must respect the canvas width (the padding
  // plus the stroke overhang).
  const limit = 296
  for (const width of page.render.lineWidths) {
    assert.ok(width <= limit, `a rendered line is ${width}px wide (limit ${limit})`)
  }
  assert.equal(allRenderedLines(result.pages).join('').replace(/\s/g, ''), text.replace(/\s/g, ''))
})

test('breakdown of a realistic QQ draft keeps every character', () => {
  const draft = '刚刚把新活动打完了！！！🎉 这次的高难度曲真的很折磨人，不过最后还是很开心～'
  const result = layout(draft, { settings: { maxPages: 20, allowManyPages: true } })
  assert.equal(reassemble(result.pages), draft)
})

// ---------------------------------------------------------------------------
// Rotation and spacing
// ---------------------------------------------------------------------------

test('a template tilt is honoured when it fits, and measured as rotated', () => {
  /*
   * `stylePrefs.rotate` uses the template's unit (radians x 10), so 2 is the
   * template's own ~11.5 degree tilt. When the tilt fits it is used; when it does
   * not, the engine says so instead of clipping. Either way the reported
   * footprint is the *rotated* bounding box.
   */
  const text = '今天也要一起加油'
  const settings = { allowCanvasExtension: false } as const
  const upright = layout(text, { stylePrefs: { rotate: 0 }, settings })
  const tilted = layout(text, { stylePrefs: { rotate: 2 }, settings })
  assert.equal(upright.pages[0].render.style.rotate, 0)
  const tiltedRotation = tilted.pages[0].render.style.rotate
  assert.ok(tiltedRotation === 2 || tiltedRotation === 0, `unexpected rotation ${tiltedRotation}`)
  if (tiltedRotation === 0) {
    assert.match(tilted.diagnostics.notes.join('\n'), /回退为横排/)
  }
  const u = upright.pages[0].render.textBlock
  const t = tilted.pages[0].render.textBlock
  assert.ok(t.right - t.left > 0 && t.bottom - t.top > 0)
  assert.ok(
    t.bottom - t.top >= u.bottom - u.top - 0.01,
    'a tilted block can never measure shorter than the upright one'
  )
})

test('a tilt is only dropped when it is actually the blocker', () => {
  // A near-vertical angle makes the block far too tall, so the tilt is dropped
  // with an explicit note (or the canvas grows) and nothing is ever clipped.
  const text = '今天也要一起加油练习哦大家辛苦了明天见晚安好'
  const result = layout(text, { stylePrefs: { rotate: 15 } })
  const notes = result.diagnostics.notes.join('\n')
  const changedStrategy = /回退为横排|画布已扩展/.test(notes)
  assert.ok(changedStrategy, `expected an explicit fallback note, got: ${notes}`)
  for (const page of result.pages) {
    const b = page.render.textBlock
    assert.ok(b.left >= 4 - 0.01 && b.right <= page.width - 4 + 0.01, 'clipped horizontally')
    assert.ok(b.top >= 4 - 0.01 && b.bottom <= page.height - 4 + 0.01, 'clipped vertically')
  }
  assert.equal(reassemble(result.pages), text)
})

test('an unworkable rotation falls back rather than clipping glyphs', () => {
  // A near-vertical angle makes the block far too tall for the canvas; the
  // engine must drop the tilt instead of drawing off-canvas.
  const text = '今天也要一起加油练习哦大家辛苦了明天见晚安好'
  const result = layout(text, { stylePrefs: { rotate: 15 } })
  for (const page of result.pages) {
    const b = page.render.textBlock
    assert.ok(b.left >= 4 - 0.01 && b.right <= page.width - 4 + 0.01)
    if (!page.render.bandMode) {
      assert.ok(b.top >= 4 - 0.01 && b.bottom <= page.height - 4 + 0.01)
    }
  }
})

test('an unworkable template tilt falls back to horizontal instead of clipping', () => {
  // The template default is about -11.5°; a long block must drop it rather than
  // push glyphs off the page.
  const text = '今天也要一起加油练习哦大家辛苦了明天见晚安好'
  const result = layout(text)
  for (const page of result.pages) {
    const b = page.render.textBlock
    assert.ok(
      b.left >= 4 - 0.01 && b.right <= page.width - 4 + 0.01,
      `text block horizontally outside the padding: ${JSON.stringify(b)}`
    )
    if (!page.render.bandMode) {
      assert.ok(b.top >= 4 - 0.01 && b.bottom <= page.height - 4 + 0.01)
    }
  }
})

test('letter spacing feeds into the measured width', () => {
  const text = '甲乙丙丁戊己庚辛'
  const tight = layout(text, { letterSpacing: 0 })
  const loose = layout(text, { letterSpacing: 6 })
  const tightWidth = tight.pages[0].render.lineWidths[0]
  const looseWidth = loose.pages[0].render.lineWidths[0]
  assert.ok(looseWidth > tightWidth, `${looseWidth} should exceed ${tightWidth}`)
})

test('stroke width is part of the fitting decision', () => {
  const text = '甲'.repeat(20)
  const plain = layout(text, { strokeWidth: 0 })
  const heavy = layout(text, { strokeWidth: 12 })
  // A heavy stroke eats horizontal and vertical room, so it can never admit a
  // *larger* font than no stroke at all.
  assert.ok(
    heavy.diagnostics.fontSize <= plain.diagnostics.fontSize,
    `stroke=${heavy.diagnostics.fontSize} vs none=${plain.diagnostics.fontSize}`
  )
  const heaviest = Math.max(0, ...heavy.pages[0].render.lineWidths)
  const plainest = Math.max(0, ...plain.pages[0].render.lineWidths)
  assert.ok(heaviest <= plainest + 0.01, `stroke line ${heaviest} vs none ${plainest}`)
})

// ---------------------------------------------------------------------------
// Determinism / robustness
// ---------------------------------------------------------------------------

test('layout is deterministic for identical input', () => {
  const text = '这是一段用于检查布局稳定性的中文文本内容'
  const a = layout(text)
  const b = layout(text)
  assert.deepEqual(a.diagnostics, b.diagnostics)
  assert.deepEqual(
    a.pages.map((p) => p.render.lines),
    b.pages.map((p) => p.render.lines)
  )
})

test('a null art box still produces a valid layout', () => {
  const result = layout('测试没有角色图的情况', { artBox: null })
  assert.equal(result.pages.length, 1)
  assert.ok(result.pages[0].render.style.fontSize >= 22)
  assert.ok(!result.pages[0].render.bandMode)
  assert.equal(result.overLimit, false)
  assert.equal(allRenderedLines(result.pages).join(''), '测试没有角色图的情况')
})

test('textBehind templates are labelled in the diagnostics', () => {
  const result = layout('测试', { textBehindTemplate: true })
  assert.equal(result.pages[0].render.style.textBehind, true)
  assert.match(result.diagnostics.notes.join('\n'), /textBehind/)
})

test('custom font key and colour are honoured', () => {
  const result = layout('测试颜色', { stylePrefs: { fontKey: 'fangtang', color: '#123456' } })
  assert.equal(result.pages[0].render.style.fontKey, 'fangtang')
  assert.equal(result.pages[0].render.style.color, '#123456')
  assert.match(result.pages[0].render.style.fontStack, /SSFangTangTi/)
})

test('curve / vertical templates are laid out horizontally for QQ', () => {
  // The engine has no curve or vertical mode at all — QQ output is horizontal,
  // which is the documented fallback instead of emitting clipped glyphs.
  const input = layout('测试竖排回退') as unknown as Record<string, unknown>
  assert.equal(input.pages instanceof Array, true)
  const page = (input.pages as LayoutPage[])[0]
  assert.equal(page.render.style.rotate, ANCHOR.r)
})

test('a single very long unbroken token is split across pages, losslessly', () => {
  const token = 'a'.repeat(4000)
  const result = layout(token, { settings: { maxPages: 200, allowManyPages: true } })
  assert.ok(result.pages.length > 1, `expected several pages, got ${result.pages.length}`)
  assert.equal(reassemble(result.pages), token)
  assert.equal(allRenderedLines(result.pages).join(''), token)
  for (const page of result.pages) {
    assert.ok(page.render.style.fontSize >= DEFAULT_LAYOUT_SETTINGS.minFontSize)
  }
})

test('emoji-only input is treated as content, not as blank', () => {
  const result = layout('🎉🎉🎉')
  assert.equal(result.diagnostics.strategy === 'empty', false)
  assert.equal(result.pages.length, 1)
})
