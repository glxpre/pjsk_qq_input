// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { forwardRef, useRef, useEffect, useImperativeHandle, memo } from 'react'

interface CanvasProps extends React.HTMLAttributes<HTMLCanvasElement> {
  draw: (ctx: CanvasRenderingContext2D) => void
}

const Canvas = memo(forwardRef<HTMLCanvasElement, CanvasProps>(({ draw, ...rest }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (context) {
      draw(context)
    }
  }, [draw])

  return <canvas ref={canvasRef} {...rest} />
}))

Canvas.displayName = 'Canvas'

export default Canvas
