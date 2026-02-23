// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useCallback } from 'react'
import { b64toBlob } from '../utils/imageConversion'
import characters from '../characters.json'

const { ClipboardItem } = window

/**
 * Hook that handles all export/download/copy operations
 */
export function useExport(canvasRef, character, text, setCopyPopupOpen, setDownloadPopupOpen) {
  const generateFileName = useCallback((ext) => {
    // Remove spaces and illegal characters
    const sanitize = (str) => str.replace(/[\s\/\\:*?"<>|]/g, '')
    const characterName = sanitize(characters[character].name)

    // If text is not default, add it to filename (max 10 characters)
    if (text && text !== '请输入文本') {
      const sanitizedText = sanitize(text).slice(0, 10)
      return `${characterName}_${sanitizedText}.${ext}`
    }
    return `${characterName}.${ext}`
  }, [character, text])

  const download = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = generateFileName('png')
    link.href = canvas.toDataURL('image/png')
    link.click()
    setDownloadPopupOpen(true)
  }, [canvasRef, generateFileName, setDownloadPopupOpen])

  const downloadWebp = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = generateFileName('webp')
    link.href = canvas.toDataURL('image/webp')
    link.click()
    setDownloadPopupOpen(true)
  }, [canvasRef, generateFileName, setDownloadPopupOpen])

  const downloadJpg = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const compositeOperation = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const imageData = canvas.toDataURL('image/jpeg')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.putImageData(data, 0, 0)
    ctx.globalCompositeOperation = compositeOperation
    const link = document.createElement('a')
    link.download = generateFileName('jpg')
    link.href = imageData
    link.click()
    setDownloadPopupOpen(true)
  }, [canvasRef, generateFileName, setDownloadPopupOpen])

  const copy = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': b64toBlob(canvas.toDataURL().split(',')[1]),
      }),
    ])
    setCopyPopupOpen(true)
  }, [canvasRef, setCopyPopupOpen])

  const copyWithBg = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const compositeOperation = ctx.globalCompositeOperation
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const imageData = canvas.toDataURL('image/jpeg')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.putImageData(data, 0, 0)
    ctx.globalCompositeOperation = compositeOperation
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': b64toBlob(imageData.split(',')[1]),
      }),
    ])
    setCopyPopupOpen(true)
  }, [canvasRef, setCopyPopupOpen])

  return {
    download,
    downloadWebp,
    downloadJpg,
    copy,
    copyWithBg,
  }
}
