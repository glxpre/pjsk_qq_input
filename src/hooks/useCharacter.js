// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useEffect, useCallback } from 'react'
import characters from '../characters.json'

/**
 * Hook for managing character selection and image loading
 */
export function useCharacter(fileInputRef, onImageLoad) {
  const [character, setCharacter] = useState(49)
  const [customImage, setCustomImage] = useState(null)
  const [imgObj, setImgObj] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setImgObj(null)

    const img = new Image()
    img.src = customImage ?? '/img/' + characters[character].img
    img.onload = () => {
      setImgObj(img)
      setLoaded(true)
      if (onImageLoad) {
        onImageLoad(img)
      }
    }
  }, [character, customImage, onImageLoad])

  const handleUpload = useCallback((e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target && ev.target.result
      if (typeof result === 'string') {
        setLoaded(false)
        setCustomImage(result)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }, [fileInputRef])

  const clearUpload = useCallback(() => {
    setLoaded(false)
    setCustomImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [fileInputRef])

  return {
    character,
    setCharacter,
    customImage,
    imgObj,
    loaded,
    handleUpload,
    clearUpload,
  }
}
