// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useCallback, useEffect } from 'react'
import characters from '../characters.json'
import {
  Character,
  DuoConfig,
  DuoImageSide,
  DuoLayout,
  DuoTextMode,
  Position,
} from '../types'
import { useImageLoader } from './useCharacter'
import {
  DUO_SLOT_WIDTH,
  DUO_SLOT_HEIGHT,
  FONT_STACKS,
  resolveDuoSplit,
} from './useCanvasDrawing'

const typedCharacters = characters as Character[]

const DEFAULT_STROKE_WIDTH = 9
const DEFAULT_STROKE_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 50
/** 与单人 useTextSettings 的默认行距一致 */
const DEFAULT_SPACE_SIZE = 25

export const DUO_DEFAULT_CHARACTER_A = 309 // 小豆泽心羽 10
export const DUO_DEFAULT_CHARACTER_B = 58 // 白石杏 01

/** slot 中心：横向 A 左 B 右；纵向 A 上 B 下 */
export function duoSlotCenters(layout: DuoLayout): [Position, Position] {
  const slotLen = layout === 'horizontal' ? DUO_SLOT_WIDTH : DUO_SLOT_HEIGHT
  const half = slotLen / 2
  const cross = layout === 'horizontal' ? DUO_SLOT_HEIGHT / 2 : DUO_SLOT_WIDTH / 2
  return layout === 'horizontal'
    ? [
        { x: half, y: cross },
        { x: slotLen + half, y: cross },
      ]
    : [
        { x: cross, y: half },
        { x: cross, y: slotLen + half },
      ]
}

export function createDefaultDuoImageSide(character: number, offsetX: number = 0): DuoImageSide {
  return {
    character,
    customImage: null,
    scale: 1,
    rotate: 0,
    offsetX,
    offsetY: 0,
  }
}

export function createDefaultDuoConfig(): DuoConfig {
  const [centerA, centerB] = duoSlotCenters('horizontal')
  return {
    layout: 'horizontal',
    images: [
      createDefaultDuoImageSide(DUO_DEFAULT_CHARACTER_A, 50),
      createDefaultDuoImageSide(DUO_DEFAULT_CHARACTER_B, -50),
    ],
    textMode: 'merged',
    text: '请输入文本',
    textA: '请输入文本',
    textB: '',
    splitIndex: -1,
    colorA: typedCharacters[DUO_DEFAULT_CHARACTER_A].color,
    colorB: typedCharacters[DUO_DEFAULT_CHARACTER_B].color,
    textPosition: { x: DUO_SLOT_WIDTH, y: DUO_SLOT_HEIGHT / 2 },
    textRotate: 0,
    textPositionA: centerA,
    textPositionB: centerB,
    fontSize: DEFAULT_FONT_SIZE,
    fontKey: 'yuruka',
    letterSpacing: 0,
    spaceSize: DEFAULT_SPACE_SIZE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeColor: DEFAULT_STROKE_COLOR,
    textBehind: false,
    curve: false,
    vertical: false,
    topSide: 0,
  }
}

export interface UseDuoModeOptions {
  /** 双人模式是否激活（false 时不加载图片，避免多余请求） */
  enabled: boolean
  /** 图 A（主角色）加载完成后的回调，用于更新页面主题色 */
  onImageLoadA?: (img: HTMLImageElement) => void
}

export interface UseDuoModeReturn {
  config: DuoConfig
  imgObjs: [HTMLImageElement | null, HTMLImageElement | null]
  loadeds: [boolean, boolean]
  updateDuo: (patch: Partial<DuoConfig>) => void
  setLayout: (layout: DuoLayout) => void
  setTextMode: (mode: DuoTextMode) => void
  setSideCharacter: (index: 0 | 1, character: number) => void
  handleSideUpload: (index: 0 | 1, e: React.ChangeEvent<HTMLInputElement>) => void
  clearSideUpload: (index: 0 | 1) => void
  resetDuo: () => void
  applyDuoConfig: (config: DuoConfig) => void
}

/**
 * Hook for all duo-mode state. The whole config lives in a single state
 * object so history/undo snapshots are one assignment (applyDuoConfig).
 */
export function useDuoMode({ enabled, onImageLoadA }: UseDuoModeOptions): UseDuoModeReturn {
  const [config, setConfig] = useState<DuoConfig>(createDefaultDuoConfig)

  const imgA = useImageLoader(
    config.images[0].character,
    config.images[0].customImage,
    onImageLoadA,
    enabled
  )
  const imgB = useImageLoader(
    config.images[1].character,
    config.images[1].customImage,
    undefined,
    enabled
  )

  const updateDuo = useCallback((patch: Partial<DuoConfig>): void => {
    setConfig((prev) => ({ ...prev, ...patch }))
  }, [])

  // 字号自动调整（移植自单人 useTextSettings）：
  // 文字超出演示区（宽 90% / 高 85%）时自动缩小，仅下调不放大。
  // merged 按整块画布算；split 每段落在一个 slot（296×256）内
  const {
    textMode: duoTextMode,
    text: duoMergedText,
    textA: duoTextA,
    textB: duoTextB,
    fontKey: duoFontKey,
    letterSpacing: duoLetterSpacing,
    spaceSize: duoSpaceSize,
    layout: duoLayout,
    fontSize: duoFontSize,
  } = config
  useEffect(() => {
    const isSplit = duoTextMode === 'split'
    const duoText = isSplit ? duoTextA + duoTextB : duoMergedText
    if (!duoText || duoText.replace(/\n/g, '') === '') return

    const W = isSplit
      ? DUO_SLOT_WIDTH
      : duoLayout === 'horizontal'
        ? DUO_SLOT_WIDTH * 2
        : DUO_SLOT_WIDTH
    const H = isSplit
      ? DUO_SLOT_HEIGHT
      : duoLayout === 'horizontal'
        ? DUO_SLOT_HEIGHT
        : DUO_SLOT_HEIGHT * 2
    const lines = duoText.split('\n')
    const maxLines = lines.length

    const tempCanvas = document.createElement('canvas')
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return

    let adjusted = duoFontSize
    for (let attempt = 0; attempt < 10; attempt++) {
      ctx.font = `${adjusted}px ${FONT_STACKS[duoFontKey]}`

      let exceedsWidth = false
      for (const line of lines) {
        let lineWidth: number
        if (duoLetterSpacing === 0) {
          lineWidth = ctx.measureText(line).width
        } else {
          lineWidth = 0
          for (let j = 0; j < line.length; j++) {
            lineWidth += ctx.measureText(line[j]).width + duoLetterSpacing
          }
          lineWidth -= duoLetterSpacing
        }
        if (lineWidth > W * 0.9) {
          exceedsWidth = true
          break
        }
      }

      const totalHeight = (maxLines - 1) * duoSpaceSize + adjusted
      const exceedsHeight = totalHeight > H * 0.85

      if (!exceedsWidth && !exceedsHeight) break
      adjusted = Math.max(10, adjusted - 2)
      if (adjusted === 10) break
    }

    if (adjusted < duoFontSize) {
      setConfig((prev) => (prev.fontSize === adjusted ? prev : { ...prev, fontSize: adjusted }))
    }
  }, [
    duoTextMode,
    duoMergedText,
    duoTextA,
    duoTextB,
    duoFontKey,
    duoLetterSpacing,
    duoSpaceSize,
    duoLayout,
    duoFontSize,
  ])

  const setLayout = useCallback((layout: DuoLayout): void => {
    // 切换方向时把文字位置重置为新布局的默认锚点，避免文字悬在画布外
    const [centerA, centerB] = duoSlotCenters(layout)
    setConfig((prev) => ({
      ...prev,
      layout,
      textPosition: { x: DUO_SLOT_WIDTH, y: DUO_SLOT_HEIGHT / 2 },
      textPositionA: centerA,
      textPositionB: centerB,
    }))
  }, [])

  const setTextMode = useCallback((textMode: DuoTextMode): void => {
    setConfig((prev) => {
      if (textMode === 'split') {
        // 首次切到拆开模式：用合并文字按拆分点预填两段输入框
        const atDefaults = prev.textA === '请输入文本' && prev.textB === ''
        if (atDefaults && prev.text !== '请输入文本') {
          const split = resolveDuoSplit(prev.splitIndex, prev.text)
          let seen = 0
          let splitAt = prev.text.length
          for (let i = 0; i < prev.text.length; i++) {
            if (prev.text[i] !== '\n') {
              if (seen === split) {
                splitAt = i
                break
              }
              seen++
            }
          }
          return {
            ...prev,
            textMode,
            textA: prev.text.slice(0, splitAt),
            textB: prev.text.slice(splitAt),
          }
        }
      }
      return { ...prev, textMode }
    })
  }, [])

  const setSideCharacter = useCallback((index: 0 | 1, character: number): void => {
    setConfig((prev) => {
      const images: [DuoImageSide, DuoImageSide] = [...prev.images]
      images[index] = { ...images[index], character, customImage: null }
      // 选角色时把该侧文字颜色重置为角色主题色
      const color = typedCharacters[character].color
      return index === 0 ? { ...prev, images, colorA: color } : { ...prev, images, colorB: color }
    })
  }, [])

  const handleSideUpload = useCallback(
    (index: 0 | 1, e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        const result = ev.target && ev.target.result
        if (typeof result === 'string') {
          setConfig((prev) => {
            const images: [DuoImageSide, DuoImageSide] = [...prev.images]
            images[index] = { ...images[index], customImage: result }
            return { ...prev, images }
          })
        }
      }
      reader.readAsDataURL(file)
      // 允许重复选择同一文件
      e.target.value = ''
    },
    []
  )

  const clearSideUpload = useCallback((index: 0 | 1): void => {
    setConfig((prev) => {
      const images: [DuoImageSide, DuoImageSide] = [...prev.images]
      images[index] = { ...images[index], customImage: null }
      return { ...prev, images }
    })
  }, [])

  const resetDuo = useCallback((): void => {
    setConfig(createDefaultDuoConfig())
  }, [])

  const applyDuoConfig = useCallback((incoming: DuoConfig): void => {
    // 旧快照可能缺少后加的字段（textA/textB/curve/vertical/topSide 等），用默认值兜底
    setConfig({ ...createDefaultDuoConfig(), ...incoming })
  }, [])

  return {
    config,
    imgObjs: [imgA.imgObj, imgB.imgObj],
    loadeds: [imgA.loaded, imgB.loaded],
    updateDuo,
    setLayout,
    setTextMode,
    setSideCharacter,
    handleSideUpload,
    clearSideUpload,
    resetDuo,
    applyDuoConfig,
  }
}
