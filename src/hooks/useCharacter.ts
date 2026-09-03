// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useEffect, useCallback, useRef, RefObject } from 'react'
import characters from '../characters.json'
import { Character, CharacterHook } from '../types'
import { publicAsset } from '../utils/publicAsset'

const typedCharacters = characters as Character[]

/**
 * Reusable character-image loader.
 * Resolves `customImage ?? public asset` into an HTMLImageElement.
 * Pass `enabled = false` to skip loading entirely (e.g. duo images while
 * the app is in solo mode) — avoids wasted network requests.
 */
export function useImageLoader(
  character: number,
  customImage: string | null,
  onImageLoad?: (img: HTMLImageElement) => void,
  enabled: boolean = true
): { imgObj: HTMLImageElement | null; loaded: boolean } {
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState<boolean>(false)
  // Keep the latest callback without re-triggering the load effect
  const onImageLoadRef = useRef(onImageLoad)
  onImageLoadRef.current = onImageLoad

  useEffect(() => {
    if (!enabled) {
      setLoaded(false)
      setImgObj(null)
      return
    }

    setLoaded(false)
    setImgObj(null)

    const img = new Image()
    img.src = customImage ?? publicAsset(`img/${typedCharacters[character].img}`)
    img.onload = () => {
      setImgObj(img)
      setLoaded(true)
      if (onImageLoadRef.current) {
        onImageLoadRef.current(img)
      }
    }
  }, [character, customImage, enabled])

  return {
    imgObj,
    loaded,
  }
}

/**
 * Hook for managing character selection and image loading
 */
export function useCharacter(
  fileInputRef: RefObject<HTMLInputElement>,
  onImageLoad?: (img: HTMLImageElement) => void
): CharacterHook {
  const [character, setCharacter] = useState<number>(49)
  const [customImage, setCustomImage] = useState<string | null>(null)

  const { imgObj, loaded } = useImageLoader(character, customImage, onImageLoad)

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev: ProgressEvent<FileReader>) => {
        const result = ev.target && ev.target.result
        if (typeof result === 'string') {
          setCustomImage(result)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
      reader.readAsDataURL(file)
    },
    [fileInputRef]
  )

  const clearUpload = useCallback((): void => {
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
