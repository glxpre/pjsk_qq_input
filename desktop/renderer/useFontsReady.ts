// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Font readiness for the desktop renderer.
 *
 * The sticker text must never be measured or exported with a fallback font, so
 * the UI stays in a "loading" state until both bundled families report ready.
 * `document.fonts.load` is given an explicit size because the canvas engine
 * measures at the template's own size (28-40px), not at 12px.
 */

import { useEffect, useState } from 'react'

const FAMILIES = ['YurukaStd', 'SSFangTangTi'] as const
const PROBE_SIZE = '38px'

export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const fontSet = document.fonts
    if (!fontSet) {
      setReady(true)
      return
    }
    void Promise.all(
      FAMILIES.map((family) =>
        fontSet.load(`${PROBE_SIZE} ${family}`).catch(() => undefined)
      )
    )
      .then(() => fontSet.ready)
      .then(() => {
        if (!alive) return
        // `load` resolves even when a family is missing, so confirm with `check`
        // and keep waiting on a real (slow) network-free load rather than
        // silently exporting fallback glyphs.
        const allPresent = FAMILIES.every((family) => fontSet.check(`${PROBE_SIZE} ${family}`))
        setReady(allPresent)
        if (!allPresent) {
          // Retry once after the browser has had a chance to finish decoding.
          window.setTimeout(() => {
            if (!alive) return
            setReady(FAMILIES.every((family) => fontSet.check(`${PROBE_SIZE} ${family}`)))
          }, 800)
        }
      })
      .catch(() => {
        if (alive) setReady(false)
      })
    return () => {
      alive = false
    }
  }, [])

  return ready
}
