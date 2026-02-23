// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useCallback } from 'react'
import characters from '../characters.json'
import { Character } from '../types'

const DEFAULT_FONT_KEY = 'yuruka'

// Type assertion for characters.json
const typedCharacters = characters as Character[]

/**
 * Hook for managing all text styling properties
 */
export function useTextSettings(character: number) {
  const [text, setText] = useState(typedCharacters[character].defaultText.text || '请输入文本')
  const [fontSize, setFontSize] = useState(typedCharacters[character].defaultText.s)
  const [fontKey, setFontKey] = useState(DEFAULT_FONT_KEY)
  const [rotate, setRotate] = useState(typedCharacters[character].defaultText.r)
  const [spaceSize, setSpaceSize] = useState(25)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [curve, setCurve] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [textBehind, setTextBehind] = useState(false)

  const resetTextSettings = useCallback(
    (currentCharacter: number) => {
      const char = typedCharacters[currentCharacter]
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
