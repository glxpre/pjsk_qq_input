// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import {
  Typography,
  Grid,
  Slider,
  TextField,
  Button,
  ButtonGroup,
  Switch,
  Snackbar,
  Divider,
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Paper,
  IconButton,
  Tooltip,
} from '@mui/material'
import {
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardArrowUp,
  KeyboardArrowDown,
  ContentCopyTwoTone,
  DownloadTwoTone,
  GitHub,
  InfoOutlined,
  CloudUpload,
} from '@mui/icons-material'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FastAverageColor } from 'fast-average-color'
import characters from './characters.json'
import Canvas from './components/Canvas'
import Picker from './components/Picker'
import Info from './components/Info'
import UploadDialog from './components/UploadDialog'
import ThemeWrapper from './components/ThemeWrapper'

const fac = new FastAverageColor()
const { ClipboardItem } = window
const DEFAULT_STROKE_WIDTH = 9
const FONT_STACKS = {
  yuruka: 'YurukaStd, SSFangTangTi, sans-serif',
  fangtang: 'SSFangTangTi, sans-serif',
  system:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}
const DEFAULT_FONT_KEY = 'yuruka'

function desaturateColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  let h,
    s,
    l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    if (max === r / 255) h = (g / 255 - b / 255) / d + (g < b ? 6 : 0)
    else if (max === g / 255) h = (b / 255 - r / 255) / d + 2
    else h = (r / 255 - g / 255) / d + 4
    h /= 6
  }

  s *= 0.15
  l = Math.max(0.12, l * 0.3)

  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const r2 = Math.round(hue2rgb(p, q, h + 1 / 3) * 255)
  const g2 = Math.round(hue2rgb(p, q, h) * 255)
  const b2 = Math.round(hue2rgb(p, q, h - 1 / 3) * 255)

  return `#${r2.toString(16).padStart(2, '0')}${g2.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`
}

function App() {
  const [infoOpen, setInfoOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [copyPopupOpen, setCopyPopupOpen] = useState(false)
  const [downloadPopupOpen, setDownloadPopupOpen] = useState(false)
  const [dominantColor, setDominantColor] = useState('#cf93d9')
  const [backgroundColor, setBackgroundColor] = useState('#212121')

  const [character, setCharacter] = useState(49)
  const [text, setText] = useState(characters[character].defaultText.text || '请输入文本')
  const [position, setPosition] = useState({
    x: characters[character].defaultText.x,
    y: characters[character].defaultText.y,
  })
  const [fontSize, setFontSize] = useState(characters[character].defaultText.s)
  const [spaceSize, setSpaceSize] = useState(25)
  const [rotate, setRotate] = useState(characters[character].defaultText.r)
  const [curve, setCurve] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [textColor, setTextColor] = useState(characters[character].color)
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH)
  const [strokeColor, setStrokeColor] = useState('#ffffff')
  const [loaded, setLoaded] = useState(false)
  const [customImage, setCustomImage] = useState(null)
  const [fontKey, setFontKey] = useState(DEFAULT_FONT_KEY)
  const [textBehind, setTextBehind] = useState(false)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [imgObj, setImgObj] = useState(null)

  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setText(characters[character].defaultText.text || '请输入文本')
    setPosition({
      x: characters[character].defaultText.x,
      y: characters[character].defaultText.y,
    })
    setRotate(characters[character].defaultText.r)
    setFontSize(characters[character].defaultText.s)
    setSpaceSize(25)
    setCurve(false)
    setVertical(false)
    setTextColor(characters[character].color)
    setStrokeColor('#ffffff')
    setStrokeWidth(DEFAULT_STROKE_WIDTH)
    setLoaded(false)
    setImgObj(null)

    const img = new Image()
    img.src = customImage ?? '/img/' + characters[character].img
    img.onload = () => {
      const color = fac.getColor(img, { algorithm: 'sqrt' })
      setDominantColor(color.hex)
      setBackgroundColor(desaturateColor(color.hex))
      setImgObj(img)
      setLoaded(true)
    }
  }, [character, customImage])

  const angle = useMemo(() => (Math.PI * text.length) / 7, [text])

  const drawText = useCallback(
    (ctx) => {
      ctx.font = `${fontSize}px ${FONT_STACKS[fontKey]}`
      ctx.lineWidth = strokeWidth
      ctx.save()

      ctx.translate(position.x, position.y)
      ctx.rotate(rotate / 10)
      ctx.textAlign = 'center'
      ctx.strokeStyle = strokeColor
      ctx.fillStyle = textColor
      const lines = text.split('\n')

      if (curve) {
        for (let line of lines) {
          for (let i = 0; i < line.length; i++) {
            ctx.rotate(angle / line.length / 2.5)
            ctx.save()
            ctx.translate(0, -1 * fontSize * 3.5)
            ctx.strokeText(line[i], 0, 0)
            ctx.fillText(line[i], 0, 0)
            ctx.restore()
          }
        }
      } else if (vertical) {
        const letterStep = fontSize + letterSpacing
        const lineStep = fontSize + spaceSize - 40
        let xOffset = 0
        for (const line of lines) {
          let yOffset = 0
          for (let i = 0; i < line.length; i++) {
            ctx.strokeText(line[i], xOffset, yOffset)
            ctx.fillText(line[i], xOffset, yOffset)
            yOffset += letterStep
          }
          xOffset += lineStep
        }
      } else {
        // Horizontal text with character spacing support
        if (letterSpacing === 0) {
          for (let i = 0, k = 0; i < lines.length; i++) {
            ctx.strokeText(lines[i], 0, k)
            ctx.fillText(lines[i], 0, k)
            k += spaceSize
          }
        } else {
          ctx.textAlign = 'left'
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const lineY = i * spaceSize
            const metrics = ctx.measureText(line)
            let charX = -metrics.width / 2
            for (let j = 0; j < line.length; j++) {
              ctx.strokeText(line[j], charX, lineY)
              ctx.fillText(line[j], charX, lineY)
              const charMetrics = ctx.measureText(line[j])
              charX += charMetrics.width + letterSpacing
            }
          }
          ctx.textAlign = 'center'
        }
      }
      ctx.restore()
    },
    [
      fontSize,
      fontKey,
      strokeWidth,
      position,
      rotate,
      strokeColor,
      textColor,
      text,
      curve,
      vertical,
      angle,
      spaceSize,
      letterSpacing,
    ]
  )

  const draw = useCallback(
    (ctx) => {
      const w = 296
      const h = 256
      if (ctx.canvas.width !== w) ctx.canvas.width = w
      if (ctx.canvas.height !== h) ctx.canvas.height = h

      ctx.clearRect(0, 0, w, h)

      if (loaded && imgObj && document.fonts.check('12px YurukaStd')) {
        const img = imgObj

        const hRatio = w / img.width
        const vRatio = h / img.height
        const ratio = Math.min(hRatio, vRatio)
        const centerShift_x = (w - img.width * ratio) / 2
        const centerShift_y = (h - img.height * ratio) / 2

        if (textBehind) {
          drawText(ctx)
        }

        ctx.drawImage(
          img,
          0,
          0,
          img.width,
          img.height,
          centerShift_x,
          centerShift_y,
          img.width * ratio,
          img.height * ratio
        )

        if (!textBehind) {
          drawText(ctx)
        }
      } else {
        ctx.fillStyle = '#212121'
        ctx.fillRect(0, 0, w, h)
        ctx.font = '20px sans-serif'
        ctx.fillStyle = 'white'
        ctx.textAlign = 'center'
        ctx.fillText('Pick a character to start ↘️', w / 2, h - 10)
      }
    },
    [loaded, imgObj, textBehind, drawText]
  )

  // 生成文件名：角色名_文本（如果不是默认文本）
  const generateFileName = useCallback((ext) => {
    // 去除空格和非法字符
    const sanitize = (str) => str.replace(/[\s\/\\:*?"<>|]/g, '')
    const characterName = sanitize(characters[character].name)

    // 如果文本不是默认值，添加到文件名中（最多10个字符）
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
  }, [character, generateFileName])

  const downloadWebp = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = generateFileName('webp')
    link.href = canvas.toDataURL('image/webp')
    link.click()
    setDownloadPopupOpen(true)
  }, [character, generateFileName])

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
  }, [character, generateFileName])

  function b64toBlob(b64Data, contentType = 'image/png', sliceSize = 512) {
    const byteCharacters = atob(b64Data)
    const byteArrays = []
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize)
      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      byteArrays.push(byteArray)
    }
    return new Blob(byteArrays, { type: contentType })
  }

  const copy = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': b64toBlob(canvas.toDataURL().split(',')[1]),
      }),
    ])
    setCopyPopupOpen(true)
  }, [])

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
  }, [])

  const handleUpload = (e) => {
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
  }

  const clearUpload = () => {
    setLoaded(false)
    setCustomImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resetSettings = () => {
    setText(characters[character].defaultText.text || '请输入文本')
    setPosition({
      x: characters[character].defaultText.x,
      y: characters[character].defaultText.y,
    })
    setRotate(characters[character].defaultText.r)
    setFontSize(characters[character].defaultText.s)
    setSpaceSize(25)
    setCurve(false)
    setVertical(false)
    setTextColor(characters[character].color)
    setStrokeColor('#ffffff')
    setStrokeWidth(DEFAULT_STROKE_WIDTH)
    setFontKey(DEFAULT_FONT_KEY)
    setTextBehind(false)
    setLetterSpacing(0)
  }

  const handleCharacterSelect = (index) => {
    setCharacter(index)
  }

  return (
    <ThemeWrapper dominantColor={dominantColor} backgroundColor={backgroundColor}>
      <Box sx={{ minHeight: '100vh', width: '100%', px: { xs: 1.5, sm: 3 }, py: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap">
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  fontSize: { sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: dominantColor,
                }}
              >
                <Box component="span" sx={{ fontFamily: 'YurukaStd' }}>Project Sekai</Box> 贴纸生成器
              </Typography>
              {/* 桌面端按钮 */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Tooltip title="关于">
                  <IconButton color="secondary" onClick={() => setInfoOpen(true)}>
                    <InfoOutlined />
                  </IconButton>
                </Tooltip>
                <Tooltip title="GitHub">
                  <IconButton
                    color="secondary"
                    href="https://github.com/25-ji-code-de/stickers-maker"
                    target="_blank"
                  >
                    <GitHub />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper elevation={3} sx={{ p: 2 }}>
              {/* Canvas - 移动端和桌面端共用 */}
              <Box display="flex" gap={2} justifyContent="center">
                {/* 左侧：Canvas 和水平滑条 */}
                <Box display="flex" flexDirection="column">
                  {/* Canvas 容器 - 响应式尺寸，保持 296:256 比例 */}
                  <Box
                    sx={{
                      width: { xs: '237px', md: '296px' },
                      height: { xs: '205px', md: '256px' },
                    }}
                  >
                    <Canvas
                      ref={canvasRef}
                      draw={draw}
                      style={{
                        border: '1px solid #444',
                        display: 'block',
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  </Box>

                  {/* 移动端：水平滑条 */}
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    mt={1}
                    sx={{ display: { xs: 'flex', md: 'none' }, height: '50px' }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => setPosition((p) => ({ ...p, x: p.x - 5 }))}
                    >
                      <KeyboardArrowLeft />
                    </IconButton>
                    <Box flex={1} display="flex" alignItems="center">
                      <Slider
                        value={position.x}
                        onChange={(_, v) => setPosition((p) => ({ ...p, x: v }))}
                        min={0}
                        max={296}
                        color="secondary"
                        sx={{ width: '100%' }}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setPosition((p) => ({ ...p, x: p.x + 5 }))}
                    >
                      <KeyboardArrowRight />
                    </IconButton>
                  </Box>
                </Box>

                {/* 移动端：右侧垂直滑条和 Picker */}
                <Box display="flex" flexDirection="column" sx={{ display: { xs: 'flex', md: 'none' } }}>
                  {/* 垂直滑条 - 高度与 Canvas 匹配 */}
                  <Box display="flex" flexDirection="column" alignItems="center" sx={{ height: '205px' }}>
                    <IconButton
                      size="small"
                      onClick={() => setPosition((p) => ({ ...p, y: p.y - 5 }))}
                    >
                      <KeyboardArrowUp />
                    </IconButton>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                      <Slider
                        orientation="vertical"
                        value={256 - position.y}
                        onChange={(_, v) => setPosition((p) => ({ ...p, y: 256 - v }))}
                        min={0}
                        max={256}
                        color="secondary"
                        sx={{ height: '100%' }}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setPosition((p) => ({ ...p, y: p.y + 5 }))}
                    >
                      <KeyboardArrowDown />
                    </IconButton>
                  </Box>

                  {/* Picker 按钮 - 与水平滑条对齐 */}
                  <Box display="flex" alignItems="center" justifyContent="center" mt={1} sx={{ height: '50px' }}>
                    <Picker setCharacter={handleCharacterSelect} color={dominantColor} />
                  </Box>
                </Box>
              </Box>

              {/* 桌面端：控制按钮和滑条 */}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Box display="flex" gap={1} mb={1} mt={2}>
                  <ButtonGroup size="small" fullWidth>
                    <Button
                      onClick={() => setPosition((p) => ({ ...p, x: p.x - 5 }))}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      X-5
                    </Button>
                    <Button
                      onClick={() => setPosition((p) => ({ ...p, x: p.x + 5 }))}
                      endIcon={<KeyboardArrowRight />}
                    >
                      X+5
                    </Button>
                  </ButtonGroup>
                  <ButtonGroup size="small" fullWidth>
                    <Button
                      onClick={() => setPosition((p) => ({ ...p, y: p.y - 5 }))}
                      startIcon={<KeyboardArrowUp />}
                    >
                      Y-5
                    </Button>
                    <Button
                      onClick={() => setPosition((p) => ({ ...p, y: p.y + 5 }))}
                      endIcon={<KeyboardArrowDown />}
                    >
                      Y+5
                    </Button>
                  </ButtonGroup>
                </Box>

                <Typography variant="body2" gutterBottom>
                  水平位置: {position.x}
                </Typography>
                <Slider
                  value={position.x}
                  onChange={(_, v) => setPosition((p) => ({ ...p, x: v }))}
                  min={0}
                  max={296}
                  color="secondary"
                />

                <Typography variant="body2" gutterBottom>
                  垂直位置: {position.y}
                </Typography>
                <Slider
                  value={position.y}
                  onChange={(_, v) => setPosition((p) => ({ ...p, y: v }))}
                  min={0}
                  max={256}
                  color="secondary"
                />
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper elevation={3} sx={{ p: 2 }}>
              {/* 桌面端显示 Picker 和角色名 */}
              <Box display="flex" alignItems="center" gap={1} mb={2} sx={{ display: { xs: 'none', md: 'flex' } }}>
                <Picker setCharacter={handleCharacterSelect} color={dominantColor} />
                <Typography
                  variant="subtitle1"
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}
                >
                  {characters[character].name}
                </Typography>
              </Box>

              <TextField
                fullWidth
                multiline
                rows={2}
                label="文字内容"
                value={text}
                onChange={(e) => setText(e.target.value)}
                color="secondary"
                sx={{ mb: 2 }}
              />

              {/* 字体大小 */}
              <Box sx={{ mt: { xs: 1, md: 2 } }}>
                {/* 桌面端：label在上，显示数值 */}
                <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
                  字体大小: {fontSize}
                </Typography>

                {/* 移动端：label和slider在同一行 */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
                    字体大小
                  </Typography>
                  <Slider
                    value={fontSize}
                    onChange={(_, v) => setFontSize(v)}
                    min={10}
                    max={100}
                    color="secondary"
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* 桌面端：slider独立一行 */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Slider
                    value={fontSize}
                    onChange={(_, v) => setFontSize(v)}
                    min={10}
                    max={100}
                    color="secondary"
                  />
                </Box>
              </Box>

              {/* 旋转角度 */}
              <Box sx={{ mt: { xs: 1, md: 2 } }}>
                {/* 桌面端：label在上，显示数值 */}
                <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
                  旋转角度: {rotate}
                </Typography>

                {/* 移动端：label和slider在同一行 */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
                    旋转角度
                  </Typography>
                  <Slider
                    value={rotate}
                    onChange={(_, v) => setRotate(v)}
                    min={-10}
                    max={10}
                    step={0.2}
                    color="secondary"
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* 桌面端：slider独立一行 */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Slider
                    value={rotate}
                    onChange={(_, v) => setRotate(v)}
                    min={-10}
                    max={10}
                    step={0.2}
                    color="secondary"
                  />
                </Box>
              </Box>

              {/* 行间距 */}
              <Box sx={{ mt: { xs: 1, md: 2 } }}>
                {/* 桌面端：label在上，显示数值 */}
                <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
                  行间距: {spaceSize}
                </Typography>

                {/* 移动端：label和slider在同一行 */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
                    行间距
                  </Typography>
                  <Slider
                    value={spaceSize}
                    onChange={(_, v) => setSpaceSize(v)}
                    min={18}
                    max={100}
                    color="secondary"
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* 桌面端：slider独立一行 */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Slider
                    value={spaceSize}
                    onChange={(_, v) => setSpaceSize(v)}
                    min={18}
                    max={100}
                    color="secondary"
                  />
                </Box>
              </Box>

              {/* 字间距 */}
              <Box sx={{ mt: { xs: 1, md: 2 } }}>
                {/* 桌面端：label在上，显示数值 */}
                <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
                  字间距: {letterSpacing}
                </Typography>

                {/* 移动端：label和slider在同一行 */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
                    字间距
                  </Typography>
                  <Slider
                    value={letterSpacing}
                    onChange={(_, v) => setLetterSpacing(v)}
                    min={-10}
                    max={30}
                    color="secondary"
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* 桌面端：slider独立一行 */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Slider
                    value={letterSpacing}
                    onChange={(_, v) => setLetterSpacing(v)}
                    min={-10}
                    max={30}
                    color="secondary"
                  />
                </Box>
              </Box>

              {/* 描边宽度 */}
              <Box sx={{ mt: { xs: 1, md: 2 } }}>
                {/* 桌面端：label在上，显示数值 */}
                <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
                  描边宽度: {strokeWidth}
                </Typography>

                {/* 移动端：label和slider在同一行 */}
                <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
                    描边宽度
                  </Typography>
                  <Slider
                    value={strokeWidth}
                    onChange={(_, v) => setStrokeWidth(v)}
                    min={0}
                    max={30}
                    color="secondary"
                    valueLabelDisplay="auto"
                  />
                </Box>

                {/* 桌面端：slider独立一行 */}
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Slider
                    value={strokeWidth}
                    onChange={(_, v) => setStrokeWidth(v)}
                    min={0}
                    max={30}
                    color="secondary"
                  />
                </Box>
              </Box>

              <Grid container spacing={2} mt={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel color="secondary">字体</InputLabel>
                    <Select
                      value={fontKey}
                      onChange={(e) => setFontKey(e.target.value)}
                      label="字体"
                      color="secondary"
                    >
                      <MenuItem value="yuruka">YurukaStd</MenuItem>
                      <MenuItem value="fangtang">尚首方糖体</MenuItem>
                      <MenuItem value="system">系统默认</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" gutterBottom>
                    文字颜色
                  </Typography>
                  <Box display="flex" gap={1} alignItems="center">
                    <TextField
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      size="small"
                      color="secondary"
                      sx={{ width: '80px' }}
                    />
                    <Button size="small" onClick={() => setTextColor(characters[character].color)}>
                      重置
                    </Button>
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" gutterBottom>
                    描边颜色
                  </Typography>
                  <Box display="flex" gap={1} alignItems="center">
                    <TextField
                      type="color"
                      value={strokeColor}
                      onChange={(e) => setStrokeColor(e.target.value)}
                      size="small"
                      color="secondary"
                      sx={{ width: '80px' }}
                    />
                    <Button size="small" onClick={() => setStrokeColor('#ffffff')}>
                      重置
                    </Button>
                  </Box>
                </Grid>
              </Grid>

              <Box mt={2}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={curve}
                      onChange={(e) => setCurve(e.target.checked)}
                      color="secondary"
                    />
                  }
                  label="弧形文字"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={vertical}
                      onChange={(e) => setVertical(e.target.checked)}
                      color="secondary"
                    />
                  }
                  label="竖排文字"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={textBehind}
                      onChange={(e) => setTextBehind(e.target.checked)}
                      color="secondary"
                    />
                  }
                  label="文字置于底层"
                />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Box mt={2}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ mr: 1 }}
                >
                  上传自定义图片
                </Button>
                {customImage && (
                  <Button variant="outlined" size="small" onClick={clearUpload}>
                    清除自定义图片
                  </Button>
                )}
              </Box>

              <Box mt={2}>
                <Button variant="contained" color="secondary" onClick={resetSettings} fullWidth>
                  重置所有设置
                </Button>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper elevation={3} sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                导出选项
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<ContentCopyTwoTone />}
                    onClick={copy}
                    fullWidth
                  >
                    复制 PNG
                  </Button>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<ContentCopyTwoTone />}
                    onClick={copyWithBg}
                    fullWidth
                  >
                    复制 JPG
                  </Button>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<DownloadTwoTone />}
                    onClick={download}
                    fullWidth
                  >
                    保存 PNG
                  </Button>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<DownloadTwoTone />}
                    onClick={downloadJpg}
                    fullWidth
                  >
                    保存 JPG
                  </Button>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<DownloadTwoTone />}
                    onClick={downloadWebp}
                    fullWidth
                  >
                    保存 WEBP
                  </Button>
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<CloudUpload />}
                    onClick={() => setUploadOpen(true)}
                    fullWidth
                  >
                    上传分享
                  </Button>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>

        {/* 移动端底部按钮区域 */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            justifyContent: 'center',
            gap: 2,
            mt: 3,
            pb: 2,
          }}
        >
          <Tooltip title="关于">
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<InfoOutlined />}
              onClick={() => setInfoOpen(true)}
            >
              关于
            </Button>
          </Tooltip>
          <Tooltip title="GitHub">
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<GitHub />}
              href="https://github.com/25-ji-code-de/stickers-maker"
              target="_blank"
            >
              GitHub
            </Button>
          </Tooltip>
        </Box>
      </Box>

      <Info open={infoOpen} handleClose={() => setInfoOpen(false)} />
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        canvas={canvasRef.current}
        altText={text}
      />
      <Snackbar
        open={copyPopupOpen}
        autoHideDuration={3000}
        onClose={() => setCopyPopupOpen(false)}
        message="已复制到剪贴板！"
      />
      <Snackbar
        open={downloadPopupOpen}
        autoHideDuration={3000}
        onClose={() => setDownloadPopupOpen(false)}
        message="下载成功！"
      />
    </ThemeWrapper>
  )
}

export default App
