// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Layout diagnostic.
 *
 * Answers "why did the engine choose this size / this many lines / this many
 * pages?" without launching the app or needing QQ. It uses a synthetic measuring
 * context (CJK = 1em, other scripts = 0.55em) so the numbers are reproducible on
 * any machine, and it prints the per-page slices, the rendered lines, and the
 * measured width of every line against the canvas width.
 *
 *   node tools/diag-layout.ts                       # the six smoke-test drafts
 *   node tools/diag-layout.ts "要排版的文字"          # one draft
 *   node tools/diag-layout.ts --lines 1 "文字"       # override maxLines
 */

import {
  clearLayoutMetricsCache,
  layoutStickerText,
  type LayoutInput,
  type LayoutResult,
  type MeasureContext,
} from '../src/layout/autoLayout.ts'
import { fallbackGraphemes } from '../src/layout/segment.ts'

function glyphAdvance(grapheme: string, size: number): number {
  const code = grapheme.codePointAt(0) ?? 0
  if (
    (code >= 0x3000 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    code >= 0x20000
  ) {
    return size
  }
  return size * 0.55
}

function makeCtx(): MeasureContext {
  let font = '16px sans-serif'
  const sizeOf = (): number => {
    const match = /(\d+(?:\.\d+)?)px/.exec(font)
    return match ? Number(match[1]) : 16
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
      for (const grapheme of fallbackGraphemes(text)) width += glyphAdvance(grapheme, size)
      return { width, actualBoundingBoxAscent: size * 0.82, actualBoundingBoxDescent: size * 0.2 }
    },
  }
}

const ANCHOR = { x: 148, y: 70, r: -2, s: 38 }

const CASES: Array<{ name: string; text: string }> = [
  { name: 'short', text: '初音未来' },
  {
    name: 'long-cjk',
    text: '今天也在认真练习，希望能把每一句想说的话，都好好地写进这张贴纸里，然后送给你。',
  },
  { name: 'mixed', text: "Project SEKAI 的贴纸真好看！Let's make a sticker for Miku 2026, okay?" },
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

/** Read `--flag value` pairs out of argv. */
function flags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]!.startsWith('--')) out[argv[i]!.slice(2)] = argv[i + 1] ?? 'true'
  }
  return out
}

const argv = process.argv.slice(2)
const options = flags(argv)
const positional = argv.filter((value, index) => !value.startsWith('--') && !argv[index - 1]?.startsWith('--'))

const settings: Partial<LayoutInput['settings']> = {
  minFontSize: Number(options.min ?? 22),
  maxLines: Number(options.lines ?? 3),
  maxPages: Number(options.pages ?? 6),
  allowCanvasExtension: options.band !== 'false',
}

/** Character art box: `null`, the usual mid-canvas sprite, or a full-canvas frame. */
const artBox =
  options.art === 'full'
    ? { x: 0, y: 0, width: 296, height: 256 }
    : options.art === 'none'
      ? null
      : { x: 100, y: 20, width: 100, height: 230 }

const drafts = positional.length > 0 ? [{ name: 'stdin', text: positional.join(' ') }] : CASES

for (const draft of drafts) {
  clearLayoutMetricsCache()
  const started = Date.now()
  const result: LayoutResult = layoutStickerText({
    ctx: makeCtx(),
    anchor: { ...ANCHOR },
    text: draft.text,
    artBox,
    color: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    spaceSize: null,
    letterSpacing: 0,
    textBehindTemplate: false,
    settings: settings as LayoutInput['settings'],
    stylePrefs: { fontKey: 'yuruka' },
  })
  const elapsed = Date.now() - started

  const probe = makeCtx()
  console.log(
    `\n=== ${draft.name} === ${draft.text.length} 字 → ${result.pages.length} 张` +
      `（估算 ${result.estimatedPages}） 策略=${result.diagnostics.strategy}` +
      ` 字号=${result.diagnostics.fontSize}px 行数=${result.diagnostics.lines}` +
      `${result.overLimit ? ' 超上限' : ''} 用时=${elapsed}ms`
  )
  for (const page of result.pages) {
    const canvas = `${page.width}x${page.height}`
    console.log(`  [${page.index}] ${canvas} contentTop=${page.contentTop} slice=${page.text.length} 字`)
    for (const line of page.render.lines) {
      probe.font = `${page.render.style.fontSize}px X`
      const width = probe.measureText(line).width
      console.log(
        `       ${width.toFixed(0).padStart(4)}px${width > page.width ? ' ⚠ 超出画布' : ''} | ${line}`
      )
    }
  }
  for (const note of result.diagnostics.notes) console.log(`  · ${note}`)
  const joined = result.pages.map((page) => page.text).join('')
  console.log(
    `  原文完整：${joined.replace(/\s+/gu, '') === draft.text.replace(/\s+/gu, '')}` +
      ` 未放下的字：${draft.text.length - joined.length}`
  )
}
