// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useCallback } from 'react'

/**
 * Hook for managing UI state (modals and notifications)
 */
export function useUIState() {
  const [infoOpen, setInfoOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [copyPopupOpen, setCopyPopupOpen] = useState(false)
  const [downloadPopupOpen, setDownloadPopupOpen] = useState(false)

  const showCopySuccess = useCallback(() => {
    setCopyPopupOpen(true)
  }, [])

  const showDownloadSuccess = useCallback(() => {
    setDownloadPopupOpen(true)
  }, [])

  return {
    infoOpen,
    setInfoOpen,
    uploadOpen,
    setUploadOpen,
    copyPopupOpen,
    setCopyPopupOpen,
    showCopySuccess,
    downloadPopupOpen,
    setDownloadPopupOpen,
    showDownloadSuccess,
  }
}
