// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useCallback } from 'react'
import characters from '../characters.json'

const DEFAULT_FONT_KEY = 'yuruka'

/**
 * Hook for managing all text styling properties
 */
export function useTextSettings(character) {
  const [text, setText] = useState(characters[character].defaultText.text || '请输入文本')
  const [fontSize, setFontSize] = useState(characters[character].defaultText.s)
  const [fontKey, setFontKey] = useState(DEFAULT_FONT_KEY)
  const [rotate, setRotate] = useState(characters[character].defaultText.r)
  const [spaceSize, setSpaceSize] = useState(25)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [curve, setCurve] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [textBehind, setTextBehind] = useState(false)

  const resetTextSettings = useCallback(
    (currentCharacter) => {
      const char = characters[currentCharacter]
      setText(char.defaultText.text || '请输入文本')
      setFontSize(char.defaultText.s)
      setRotate(char.defaultText.r)
      setSpaceSize(25)
      setLetterSpacing(0)
      setCurve(false)
      setVertical(false)
      setFontKey(DEFAULT_FONT_KEY)
      setTextBehind(false)
    },
    []
  )

  return {
    text,
    setText,
    fontSize,
    setFontSize,
    fontKey,
    setFontKey,
    rotate,
    setRotate,
    spaceSize,
    setSpaceSize,
    letterSpacing,
    setLetterSpacing,
    curve,
    setCurve,
    vertical,
    setVertical,
    textBehind,
    setTextBehind,
    resetTextSettings,
  }
}
