// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Grapheme- and word-aware text segmentation used by the auto-layout engine.
 *
 * Everything here is pure string work: no DOM, no canvas, no React. It runs
 * identically in the browser renderer, in Electron, and under `node --test`.
 *
 * The rules implemented here exist so that auto-wrapping can never corrupt the
 * user's original text:
 *   - emoji / ZWJ sequences / surrogate pairs / combining marks stay intact
 *     (`Intl.Segmenter` granuality `grapheme`, with a code-point fallback);
 *   - wrapping prefers word boundaries for space-delimited scripts and
 *     grapheme boundaries for CJK;
 *   - a line never starts with closing punctuation and never ends with opening
 *     punctuation (basic 禁则处理).
 */

/** A contiguous run of graphemes that must not be split (an "atom"). */
export interface Segment {
  /** Original text of the atom, exactly as the user typed it. */
  text: string
  /** True when the atom is whitespace only. */
  isSpace: boolean
  /** True when a line break is legal *before* this atom. */
  breakBefore: boolean
  /** True when the atom is CJK-ish (breakable at grapheme level). */
  isCjk: boolean
}

/** Characters that may not begin a line (行首禁则). */
const NO_LINE_START = new Set([
  '，', '。', '、', '；', '：', '？', '！', '）', '】', '》', '」', '』', '〉', '］', '｝',
  '”', '’', '…', '—', '～', '·', 'ー', '々', '〃', 'ゝ', 'ゞ', 'ヽ', 'ヾ',
  ',', '.', ';', ':', '?', '!', ')', ']', '}', '>', '"', "'", '%', '‰', '°', '℃',
])

/** Characters that may not end a line (行尾禁则). */
const NO_LINE_END = new Set([
  '（', '【', '《', '「', '『', '〈', '［', '｛', '‘', '“', '￥', '$', '€', '£', '№',
  '(', '[', '{', '<', '#', '@',
])

/** True when a line must not begin with this grapheme. */
export function isNoLineStart(grapheme: string): boolean {
  return NO_LINE_START.has(grapheme)
}

/** True when a line must not end with this grapheme. */
export function isNoLineEnd(grapheme: string): boolean {
  return NO_LINE_END.has(grapheme)
}

/** Matches whitespace, including ideographic space. */
const SPACE_RE = /^[\s\u3000]+$/

/** Supplementary CJK / kana / Hangul blocks that are wide and freely breakable. */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x2e80, 0x2eff], // CJK Radicals Supplement
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0x3040, 0x30ff], // Hiragana + Katakana
  [0x3130, 0x318f], // Hangul Compatibility Jamo
  [0x31c0, 0x31ef], // CJK Strokes
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7af], // Hangul Syllables
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
  [0x20000, 0x2fa1f], // CJK Extensions B–F + Compatibility Supplement
  [0x30000, 0x3134f], // CJK Extension G
]

/**
 * True when the grapheme is a wide CJK-style glyph that can be broken at a
 * grapheme boundary without looking wrong.
 */
export function isCjkGrapheme(grapheme: string): boolean {
  if (!grapheme) return false
  const cp = grapheme.codePointAt(0)
  if (cp === undefined) return false
  for (const [lo, hi] of CJK_RANGES) {
    if (cp >= lo && cp <= hi) return true
  }
  return false
}

/**
 * Segment a single logical line (no `\n`) into atoms.
 *
 * Space-delimited runs collapse into word atoms (so English breaks at spaces),
 * whitespace becomes its own atom (so it can be dropped at a line break), and
 * each CJK-style grapheme becomes its own atom — that is the break opportunity
 * Chinese and Japanese need, and the reason a CJK run must never be emitted as
 * one unbreakable blob.
 */
export function segmentLine(line: string, segmenter?: GraphemeSegmenter): Segment[] {
  const graphemes = segmenter ? segmenter(line) : fallbackGraphemes(line)
  const out: Segment[] = []

  let word = ''

  const flushWord = (): void => {
    if (!word) return
    out.push({ text: word, isSpace: false, breakBefore: true, isCjk: false })
    word = ''
  }

  for (const g of graphemes) {
    if (SPACE_RE.test(g)) {
      flushWord()
      out.push({ text: g, isSpace: true, breakBefore: true, isCjk: false })
      continue
    }
    if (isCjkGrapheme(g)) {
      flushWord()
      out.push({ text: g, isSpace: false, breakBefore: true, isCjk: true })
      continue
    }
    word += g
  }
  flushWord()

  // A break is only legal where nothing is being split: mark the first atom as
  // a legal break point, and every atom that follows whitespace or a CJK atom.
  for (let i = 0; i < out.length; i++) {
    if (i === 0) {
      out[i].breakBefore = true
      continue
    }
    const prev = out[i - 1]
    out[i].breakBefore = prev.isSpace || prev.isCjk || out[i].isSpace
  }
  return out
}

/** Function that splits a string into grapheme clusters. */
export type GraphemeSegmenter = (text: string) => string[]

/** Grapheme-extending code points beyond combining marks (skin tones, etc.). */
const EXTENDER_CP: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x0900, 0x0903],
  [0x093a, 0x094f],
  [0x0951, 0x0957],
  [0x0e31, 0x0e31],
  [0x0e34, 0x0e3a],
  [0x0e47, 0x0e4e],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x200c, 0x200d], // ZWNJ / ZWJ
  [0x20d0, 0x20f0],
  [0x1f3fb, 0x1f3ff], // emoji skin-tone modifiers
  [0xfe00, 0xfe0f], // variation selectors
  [0xfe20, 0xfe2f],
  [0xe0100, 0xe01ef], // variation selectors supplement
]

/** True for combining marks, ZWJ, variation selectors and skin-tone modifiers. */
function isExtender(codePoint: number): boolean {
  for (const [lo, hi] of EXTENDER_CP) {
    if (codePoint >= lo && codePoint <= hi) return true
  }
  return false
}

/** Matches a regional indicator symbol (flag half), by code point. */
const RI_LO = 0x1f1e6
const RI_HI = 0x1f1ff

/** True when the code point is a regional indicator symbol (a flag half). */
function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= RI_LO && codePoint <= RI_HI
}

/** Zero-width joiner: glues emoji into a single cluster. */
const ZWJ = '\u200d'

/**
 * Fallback grapheme splitter.
 *
 * Combines surrogate pairs, variation selectors, skin-tone modifiers, ZWJ
 * sequences, regional-indicator flag pairs and combining marks. It is less
 * complete than `Intl.Segmenter` but a cluster is never split across two
 * entries, which is what keeps emoji intact when wrapping.
 */
export function fallbackGraphemes(text: string): string[] {
  const out: string[] = []
  // `Array.from` iterates by code point, so surrogate pairs stay whole.
  const cps = Array.from(text)
  let i = 0

  /** Consume any trailing extending code points (marks, ZWJ, skin tones). */
  const takeExtenders = (): string => {
    let ext = ''
    while (i < cps.length) {
      const cp = cps[i].codePointAt(0)
      if (cp === undefined || !isExtender(cp)) break
      ext += cps[i]
      i++
    }
    return ext
  }

  /** Index of the next non-extending code point at or after `from`. */
  const skipExtenders = (from: number): number => {
    let j = from
    while (j < cps.length) {
      const cp = cps[j].codePointAt(0)
      if (cp === undefined || !isExtender(cp)) break
      j++
    }
    return j
  }

  while (i < cps.length) {
    let cluster = cps[i]
    i++
    cluster += takeExtenders()

    // Regional indicators pair up into flag clusters. Windows inserts a
    // variation selector between the halves (🇨 + FE0F + 🇳), so look past
    // any extenders before deciding this is a flag.
    const firstCp = cluster.codePointAt(0)
    if (firstCp !== undefined && isRegionalIndicator(firstCp)) {
      const j = skipExtenders(i)
      const nextCp = j < cps.length ? cps[j].codePointAt(0) : undefined
      if (nextCp !== undefined && isRegionalIndicator(nextCp)) {
        cluster += cps.slice(i, j).join('') + cps[j]
        i = j + 1
        cluster += takeExtenders()
        out.push(cluster)
        continue
      }
    }

    // A trailing ZWJ (absorbed above) glues the next base character on — that
    // is how 👨‍👩‍👧‍👦 stays a single cluster. It repeats while each new base is
    // itself followed by another ZWJ.
    while (cluster.endsWith(ZWJ) && i < cps.length) {
      let next = cps[i]
      i++
      next += takeExtenders()
      if (!next.endsWith(ZWJ) && i < cps.length) {
        // The next base carried no modifier of its own, so nothing else to do.
        cluster += next
        break
      }
      cluster += next
    }

    out.push(cluster)
  }
  return out
}

/** Cached `Intl.Segmenter` grapheme splitter (or `null` when unavailable). */
export function makeGraphemeSegmenter(): GraphemeSegmenter | null {
  type SegmenterCtor = new (
    locale?: string,
    options?: { granularity?: string }
  ) => { segment: (input: string) => Iterable<{ segment: string }> }
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
  if (typeof Ctor !== 'function') return null
  try {
    const seg = new Ctor('zh-CN', { granularity: 'grapheme' })
    return (text: string) => {
      const out: string[] = []
      for (const part of seg.segment(text)) out.push(part.segment)
      return out
    }
  } catch {
    return null
  }
}

/** True when the runtime has a real `Intl.Segmenter`. */
export function hasIntlSegmenter(): boolean {
  return makeGraphemeSegmenter() !== null
}

/**
 * Split `text` into content-aware chunks used when a sticker page overflows:
 * sentence enders first, then clause punctuation, then whitespace, then
 * grapheme boundaries. The concatenation of the result always equals `text`.
 */
export function splitIntoChunks(text: string, segmenter?: GraphemeSegmenter): string[] {
  const graphemes = segmenter ? segmenter(text) : fallbackGraphemes(text)
  const chunks: string[] = []
  let current = ''
  for (const g of graphemes) {
    current += g
    // Keep the punctuation attached to the sentence it closes.
    if ('。！？!?…\n'.includes(g) && g.length === 1) {
      chunks.push(current)
      current = ''
    } else if (current.length >= 24 && '，；、,;：:'.includes(g)) {
      chunks.push(current)
      current = ''
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [text]
}

/**
 * Join a list of lines back with `\n`. Used only to produce a *display* string;
 * the caller keeps the untouched original text separately so auto-wrapping can
 * never overwrite what the user typed.
 */
export function linesToDisplayText(lines: string[]): string {
  return lines.join('\n')
}
