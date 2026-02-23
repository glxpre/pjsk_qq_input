// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useCallback } from 'react'

/**
 * Hook for managing text position with helper methods
 */
export function usePosition(initialX = 0, initialY = 0) {
  const [position, setPosition] = useState({ x: initialX, y: initialY })

  const moveX = useCallback((delta) => {
    setPosition((prev) => ({ ...prev, x: prev.x + delta }))
  }, [])

  const moveY = useCallback((delta) => {
    setPosition((prev) => ({ ...prev, y: prev.y + delta }))
  }, [])

  return {
    position,
    setPosition,
    moveX,
    moveY,
  }
}
