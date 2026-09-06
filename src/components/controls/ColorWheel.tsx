// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '@mui/material/styles'
import {
  hsvToRgb,
  hueRingHitTest,
  hueRingPoint,
  pointToSvTriangle,
  svTrianglePoint,
  triangleVertices,
  type HueRingGeometry,
  type SvTriangleGeometry,
} from './colorWheelMath'

interface ColorWheelProps {
  /** 当前 HSV */
  hsv: { h: number; s: number; v: number }
  /** 拖动时实时回调（pointerup 后不再重复触发） */
  onChange: (hsv: { h: number; s: number; v: number }) => void
  /** 画布 CSS 尺寸（正方形边长），默认 220 */
  size?: number
}

/**
 * 外圈色相环 + 内嵌 SV 三角。
 * Canvas 绘制，pointer capture 拖拽，DPR 感知。
 */
export default function ColorWheel({ hsv, onChange, size = 220 }: ColorWheelProps) {
  const theme = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draggingRef = useRef<'hue' | 'sv' | null>(null)

  // 几何参数（基于 CSS 尺寸计算）
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 4
  const innerR = outerR - 22
  const circumR = innerR - 8
  const ringGeo = useMemo<HueRingGeometry>(() => ({ cx, cy, outerR, innerR }), [cx, cy, outerR, innerR])
  const triGeo = useMemo<SvTriangleGeometry>(() => ({ cx, cy, circumR }), [cx, cy, circumR])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
      canvas.width = size * dpr
      canvas.height = size * dpr
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)

    // 1. 色相环
    for (let deg = 0; deg < 360; deg += 1) {
      const [r, g, b] = hsvToRgb(deg, 1, 1)
      const startRad = ((deg - 90 - 0.7) * Math.PI) / 180
      const endRad = ((deg - 90 + 0.7) * Math.PI) / 180
      ctx.beginPath()
      ctx.arc(cx, cy, outerR, startRad, endRad)
      ctx.arc(cx, cy, innerR, endRad, startRad, true)
      ctx.closePath()
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fill()
    }

    // 2. SV 三角
    const [white, black, pure] = triangleVertices(triGeo)
    // 用纯色填充整个三角，再叠加白→黑渐变
    const [hr, hg, hb] = hsvToRgb(hsv.h, 1, 1)
    ctx.beginPath()
    ctx.moveTo(white.x, white.y)
    ctx.lineTo(black.x, black.y)
    ctx.lineTo(pure.x, pure.y)
    ctx.closePath()
    ctx.fillStyle = `rgb(${hr},${hg},${hb})`
    ctx.fill()

    // 白色到透明（从左下到右上方向的渐变，覆盖白→黑方向）
    const gradW = ctx.createLinearGradient(black.x, black.y, white.x, white.y)
    gradW.addColorStop(0, 'rgba(255,255,255,0)')
    gradW.addColorStop(1, 'rgba(255,255,255,1)')
    ctx.fillStyle = gradW
    ctx.fill()

    // 黑色从底边向顶点渐变
    const gradB = ctx.createLinearGradient(
      (black.x + pure.x) / 2,
      (black.y + pure.y) / 2,
      white.x,
      white.y,
    )
    gradB.addColorStop(0, 'rgba(0,0,0,1)')
    gradB.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradB
    ctx.fill()

    // 3. 指示器
    const accent = theme.palette.text.primary

    // 色相环指示点
    const hp = hueRingPoint(hsv.h, ringGeo)
    ctx.beginPath()
    ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(hp.x, hp.y, 6, 0, Math.PI * 2)
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.stroke()

    // SV 指示点
    const sp = svTrianglePoint(hsv.s, hsv.v, triGeo)
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2)
    ctx.strokeStyle = accent
    ctx.lineWidth = 1
    ctx.stroke()
  }, [cx, cy, outerR, innerR, ringGeo, triGeo, hsv, theme.palette.text.primary, size])

  useEffect(() => {
    const raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      const ringHit = hueRingHitTest(x, y, ringGeo)
      if (ringHit.hit) {
        draggingRef.current = 'hue'
        onChange({ ...hsv, h: ringHit.hue })
      } else {
        // 三角区域命中检测：简单用外接圆判断，越界靠钳制兜底
        const dist = Math.hypot(x - cx, y - cy)
        if (dist <= circumR + 4) {
          draggingRef.current = 'sv'
          const sv = pointToSvTriangle(x, y, triGeo)
          onChange({ ...hsv, s: sv.s, v: sv.v })
        }
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [hsv, onChange, ringGeo, triGeo, cx, cy, circumR],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      if (draggingRef.current === 'hue') {
        const hit = hueRingHitTest(x, y, ringGeo)
        onChange({ ...hsv, h: hit.hue })
      } else {
        const sv = pointToSvTriangle(x, y, triGeo)
        onChange({ ...hsv, s: sv.s, v: sv.v })
      }
    },
    [hsv, onChange, ringGeo, triGeo],
  )

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = null
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <div
      style={{ width: size, height: size, touchAction: 'none', cursor: 'crosshair' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: 'block' }}
      />
    </div>
  )
}
