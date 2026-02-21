import { forwardRef, useRef, useEffect, useImperativeHandle, memo } from 'react'

const Canvas = memo(forwardRef(({ draw, ...rest }, ref) => {
  const canvasRef = useRef(null)

  useImperativeHandle(ref, () => canvasRef.current)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    draw(context)
  }, [draw])

  return <canvas ref={canvasRef} {...rest} />
}))

Canvas.displayName = 'Canvas'

export default Canvas
