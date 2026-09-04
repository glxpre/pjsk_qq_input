// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import {
  Typography,
  Grid,
  Button,
  Box,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Slider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import {
  GitHub,
  InfoOutlined,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardArrowUp,
  KeyboardArrowDown,
  History,
  Undo,
  Redo,
  HelpOutline,
  Explore,
} from '@mui/icons-material'
import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react'
import characters from './characters.json'
import Canvas from './components/Canvas'
import Picker from './components/Picker'
import ThemeWrapper from './components/ThemeWrapper'
import NotificationSnackbar from './components/controls/NotificationSnackbar'
import TextStylePanel from './components/sections/TextStylePanel'
import ExportPanel, { ExportScale } from './components/sections/ExportPanel'
import LoginButton from './components/auth/LoginButton'
import UserMenu from './components/auth/UserMenu'
import { isToyBuild, TOY_GALLERY_BLOCKED_REASON } from './utils/toy'

// Lazy load heavy dialog components
const Info = lazy(() => import('./components/Info'))
const UploadDialog = lazy(() => import('./components/UploadDialog'))
const HistoryPanel = lazy(() => import('./components/sections/HistoryPanel'))
const GalleryPanel = lazy(() => import('./components/sections/GalleryPanel'))
const DuoModePanel = lazy(() => import('./components/sections/DuoModePanel'))
const FanBonusDialog = lazy(() => import('./components/FanBonusDialog'))
const PWAUpdatePrompt =
  import.meta.env.MODE === 'toy'
    ? () => null
    : lazy(() => import('./components/PWAUpdatePrompt'))

import { useCharacter } from './hooks/useCharacter'
import { useColorScheme } from './hooks/useColorScheme'
import { useTextSettings } from './hooks/useTextSettings'
import { usePosition } from './hooks/usePosition'
import { useStroke } from './hooks/useStroke'
import { useCanvasDrawing, useDuoDrawing } from './hooks/useCanvasDrawing'
import { useExport } from './hooks/useExport'
import { useUIState } from './hooks/useUIState'
import { useHistory } from './hooks/useHistory'
import { useFontLoader } from './hooks/useFontLoader'
import { useUndoRedo } from './hooks/useUndoRedo'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAuth } from './hooks/useAuth'
import { useFanBonus } from './hooks/useFanBonus'
import { useDuoMode } from './hooks/useDuoMode'
import { StickerConfig, StickerMode } from './types'
import FontLoadingOverlay from './components/FontLoadingOverlay'
import ShortcutsHelpDialog from './components/ShortcutsHelpDialog'

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize hooks
  const uiState = useUIState()
  const auth = useAuth()
  const fanBonus = useFanBonus()

  // Character hook needs a callback to update colors when image loads
  const colorScheme = useColorScheme(98) // Initial character
  const updateColorsFromImage = colorScheme.updateColorsFromImage

  // Use useCallback to stabilize the onImageLoad callback
  const handleImageLoad = useCallback(
    (img: HTMLImageElement) => {
      updateColorsFromImage(img)
    },
    [updateColorsFromImage]
  )

  const characterHook = useCharacter(fileInputRef, handleImageLoad)

  // 单人 / 双人模式：两种模式状态完全独立
  const [mode, setMode] = useState<StickerMode>('solo')

  const textSettings = useTextSettings(characterHook.character)
  const position = usePosition(
    characters[characterHook.character].defaultText.x,
    characters[characterHook.character].defaultText.y
  )
  const stroke = useStroke()
  const canvasDrawing = useCanvasDrawing()
  const duoDrawing = useDuoDrawing()
  // 双人模式：图 A（主角色）加载后同步页面主题色
  const duo = useDuoMode({ enabled: mode === 'duo', onImageLoadA: handleImageLoad })

  // 粉丝福利：锁定键盘快捷键中的位置/字号调节（fail-open，未锁定时原样透传）
  // 双人模式下快捷键同样不改动单人状态
  const positionLocked = fanBonus.isFeatureLocked('position')
  const fontSizeLocked = fanBonus.isFeatureLocked('fontSize')
  const positionForShortcuts =
    mode === 'duo' || positionLocked
      ? { ...position, moveX: () => {}, moveY: () => {} }
      : position
  const setFontSizeForShortcuts =
    mode === 'duo' || fontSizeLocked ? () => {} : textSettings.setFontSize

  // Export settings (scale / quality / compress) — default matches previous behaviour
  const [exportScale, setExportScale] = useState<ExportScale>(1)
  const [exportQuality, setExportQuality] = useState(92)
  const [exportCompress, setExportCompress] = useState(true)

  /**
   * Re-draw the sticker onto an offscreen canvas at `scale`× pixel density.
   * Text/stroke are re-rasterized (sharp); character art uses full source pixels
   * but cannot invent detail beyond the asset resolution.
   */
  const renderAtScale = useCallback(
    (scale: number): HTMLCanvasElement | null => {
      const offscreen = document.createElement('canvas')
      const ctx = offscreen.getContext('2d')
      if (!ctx) return null
      if (mode === 'duo') {
        duoDrawing.drawDuo(ctx, duo.config, duo.imgObjs, scale)
        return offscreen
      }
      canvasDrawing.draw(
        ctx,
        characterHook.imgObj,
        characterHook.loaded,
        textSettings.text,
        position.position,
        textSettings.rotate,
        {
          fontSize: textSettings.fontSize,
          fontKey: textSettings.fontKey,
          spaceSize: textSettings.spaceSize,
          letterSpacing: textSettings.letterSpacing,
          curve: textSettings.curve,
          vertical: textSettings.vertical,
        },
        {
          textColor: colorScheme.textColor,
        },
        {
          strokeWidth: stroke.strokeWidth,
          strokeColor: stroke.strokeColor,
        },
        textSettings.textBehind,
        scale
      )
      return offscreen
    },
    [
      canvasDrawing,
      duoDrawing,
      duo.config,
      duo.imgObjs,
      mode,
      characterHook.imgObj,
      characterHook.loaded,
      textSettings,
      position.position,
      colorScheme.textColor,
      stroke,
    ]
  )

  // 双人模式文件名：角色A×角色B_文字
  const duoFileName = useCallback(
    (ext: string): string => {
      const sanitize = (str: string): string => str.replace(/[\s/\\:*?"<>|]/g, '')
      const sideName = (i: 0 | 1): string => {
        const side = duo.config.images[i]
        return side.customImage ? '自定义图片' : sanitize(characters[side.character].name)
      }
      const base = `${sideName(0)}×${sideName(1)}`
      const duoText =
        duo.config.textMode === 'split' ? duo.config.textA + duo.config.textB : duo.config.text
      if (duoText && duoText !== '请输入文本') {
        const sanitizedText = sanitize(duoText).slice(0, 10)
        return `${base}_${sanitizedText}.${ext}`
      }
      return `${base}.${ext}`
    },
    [duo.config]
  )

  const exportHooks = useExport(
    canvasRef,
    characterHook.character,
    characterHook.customImage,
    textSettings.text,
    uiState.setCopyPopupOpen,
    uiState.setDownloadPopupOpen,
    {
      scale: exportScale,
      quality: exportQuality / 100,
      compress: exportCompress,
    },
    renderAtScale,
    mode === 'duo' ? duoFileName : undefined
  )

  const history = useHistory()

  // Undo/Redo hook
  const undoRedo = useUndoRedo()
  const isRestoringState = useRef<boolean>(false)

  // Monitor font loading status
  const { fontsReady, progress: fontProgress } = useFontLoader()

  // Update text settings and position when character changes
  useEffect(() => {
    const char = characters[characterHook.character]
    textSettings.resetTextSettings(characterHook.character)
    position.setPosition({
      x: char.defaultText.x,
      y: char.defaultText.y,
    })
    colorScheme.setTextColor(char.color)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterHook.character])

  // Canvas drawing callback
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (mode === 'duo') {
        duoDrawing.drawDuo(ctx, duo.config, duo.imgObjs)
        return
      }
      canvasDrawing.draw(
        ctx,
        characterHook.imgObj,
        characterHook.loaded,
        textSettings.text,
        position.position,
        textSettings.rotate,
        {
          fontSize: textSettings.fontSize,
          fontKey: textSettings.fontKey,
          spaceSize: textSettings.spaceSize,
          letterSpacing: textSettings.letterSpacing,
          curve: textSettings.curve,
          vertical: textSettings.vertical,
        },
        {
          textColor: colorScheme.textColor,
        },
        {
          strokeWidth: stroke.strokeWidth,
          strokeColor: stroke.strokeColor,
        },
        textSettings.textBehind
      )
    },
    [
      canvasDrawing,
      duoDrawing,
      duo.config,
      duo.imgObjs,
      mode,
      characterHook.imgObj,
      characterHook.loaded,
      textSettings,
      position.position,
      colorScheme.textColor,
      stroke,
    ]
  )

  // Reset all settings
  const resetSettings = () => {
    textSettings.resetTextSettings(characterHook.character)
    position.setPosition({
      x: characters[characterHook.character].defaultText.x,
      y: characters[characterHook.character].defaultText.y,
    })
    stroke.resetStroke()
    colorScheme.setTextColor(characters[characterHook.character].color)
  }

  const handleCharacterSelect = (index: number) => {
    characterHook.setCharacter(index)
  }

  // Get current configuration
  const getCurrentConfig = useCallback((): StickerConfig => {
    return {
      mode,
      character: characterHook.character,
      customImage: characterHook.customImage,
      text: textSettings.text,
      fontSize: textSettings.fontSize,
      fontKey: textSettings.fontKey,
      position: position.position,
      rotate: textSettings.rotate,
      spaceSize: textSettings.spaceSize,
      letterSpacing: textSettings.letterSpacing,
      strokeWidth: stroke.strokeWidth,
      strokeColor: stroke.strokeColor,
      textColor: colorScheme.textColor,
      curve: textSettings.curve,
      vertical: textSettings.vertical,
      textBehind: textSettings.textBehind,
      duo: mode === 'duo' ? duo.config : undefined,
    }
  }, [
    mode,
    duo.config,
    characterHook.character,
    characterHook.customImage,
    textSettings,
    position.position,
    stroke,
    colorScheme.textColor,
  ])

  // Save current sticker to history (with auto-deduplication)
  const saveToHistory = useCallback(
    (uploadedUrl?: string) => {
      if (!canvasRef.current) return

      const config = getCurrentConfig()
      history.addHistory(config, canvasRef.current, uploadedUrl)
    },
    [getCurrentConfig, history]
  )

  // Wrap export functions to auto-save to history (and trigger fan-bonus check on toy)
  const handleDownload = useCallback(async () => {
    await exportHooks.download()
    saveToHistory()
    void fanBonus.checkAfterFirstExport()
  }, [exportHooks, saveToHistory, fanBonus])

  const handleDownloadWebp = useCallback(async () => {
    await exportHooks.downloadWebp()
    saveToHistory()
    void fanBonus.checkAfterFirstExport()
  }, [exportHooks, saveToHistory, fanBonus])

  const handleDownloadJpg = useCallback(async () => {
    await exportHooks.downloadJpg()
    saveToHistory()
    void fanBonus.checkAfterFirstExport()
  }, [exportHooks, saveToHistory, fanBonus])

  const handleCopy = useCallback(async () => {
    await exportHooks.copy()
    saveToHistory()
    void fanBonus.checkAfterFirstExport()
  }, [exportHooks, saveToHistory, fanBonus])

  const handleCopyWithBg = useCallback(async () => {
    await exportHooks.copyWithBg()
    saveToHistory()
    void fanBonus.checkAfterFirstExport()
  }, [exportHooks, saveToHistory, fanBonus])

  // Apply configuration (used by both history and undo/redo)
  const applyConfig = useCallback(
    (config: StickerConfig) => {
      isRestoringState.current = true

      setMode(config.mode ?? 'solo')
      if (config.duo) {
        duo.applyDuoConfig(config.duo)
      }

      characterHook.setCharacter(config.character)
      textSettings.setText(config.text)
      textSettings.setFontSize(config.fontSize)
      textSettings.setFontKey(config.fontKey)
      textSettings.setRotate(config.rotate)
      textSettings.setSpaceSize(config.spaceSize)
      textSettings.setLetterSpacing(config.letterSpacing)
      textSettings.setCurve(config.curve)
      textSettings.setVertical(config.vertical)
      textSettings.setTextBehind(config.textBehind)
      position.setPosition(config.position)
      stroke.setStrokeWidth(config.strokeWidth)
      stroke.setStrokeColor(config.strokeColor)
      colorScheme.setTextColor(config.textColor)

      setTimeout(() => {
        isRestoringState.current = false
      }, 100)
    },
    [characterHook, textSettings, position, stroke, colorScheme, duo]
  )

  // Load configuration from history
  const loadFromHistory = useCallback(
    (id: string) => {
      const config = history.loadHistory(id)
      if (!config) return

      applyConfig(config)
    },
    [history, applyConfig]
  )

  // Push current state to undo/redo stack when any setting changes (with debounce)
  useEffect(() => {
    if (isRestoringState.current) return

    // Debounce: wait 500ms after the last change before recording
    const timeoutId = setTimeout(() => {
      const config = getCurrentConfig()
      undoRedo.pushState(config)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [
    mode,
    characterHook.character,
    duo.config,
    textSettings.text,
    textSettings.fontSize,
    textSettings.fontKey,
    textSettings.rotate,
    textSettings.spaceSize,
    textSettings.letterSpacing,
    textSettings.curve,
    textSettings.vertical,
    textSettings.textBehind,
    position.position,
    stroke.strokeWidth,
    stroke.strokeColor,
    colorScheme.textColor,
    getCurrentConfig,
    undoRedo,
  ])

  // Handle undo
  const handleUndo = useCallback(() => {
    const previousState = undoRedo.undo()
    if (previousState) {
      applyConfig(previousState)
    }
  }, [undoRedo, applyConfig])

  // Handle redo
  const handleRedo = useCallback(() => {
    const nextState = undoRedo.redo()
    if (nextState) {
      applyConfig(nextState)
    }
  }, [undoRedo, applyConfig])

  // Integrate keyboard shortcuts system
  useKeyboardShortcuts({
    // Export operations
    handleCopy,
    handleCopyWithBg,
    handleDownload,
    handleDownloadJpg,
    handleDownloadWebp,

    // Undo/redo
    handleUndo,
    handleRedo,

    // Position (gated by fan bonus)
    position: positionForShortcuts,

    // Style
    fontSize: textSettings.fontSize,
    setFontSize: setFontSizeForShortcuts,
    letterSpacing: textSettings.letterSpacing,
    setLetterSpacing: textSettings.setLetterSpacing,
    spaceSize: textSettings.spaceSize,
    setSpaceSize: textSettings.setSpaceSize,
    rotate: textSettings.rotate,
    setRotate: textSettings.setRotate,

    // Toggles
    curve: textSettings.curve,
    setCurve: textSettings.setCurve,
    vertical: textSettings.vertical,
    setVertical: textSettings.setVertical,
    textBehind: textSettings.textBehind,
    setTextBehind: textSettings.setTextBehind,

    // UI state
    uiState,
  })

  return (
    <ThemeWrapper
      dominantColor={colorScheme.dominantColor}
      backgroundColor={colorScheme.backgroundColor}
    >
      <Box sx={{ minHeight: '100vh', width: '100%', px: { xs: 1.5, sm: 3 }, py: 3 }}>
        <Grid container spacing={3}>
          {/* Header */}
          <Grid item xs={12}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              flexWrap="wrap"
              gap={1}
            >
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  display: { xs: 'none', sm: 'block' },
                  fontSize: { sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: colorScheme.dominantColor,
                }}
              >
                Project Sekai 贴纸生成器
              </Typography>

              {/* Mobile: Undo/Redo buttons */}
              <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 0.5 }}>
                <Tooltip title="撤销">
                  <span>
                    <IconButton
                      color="secondary"
                      onClick={handleUndo}
                      disabled={!undoRedo.canUndo}
                      size="small"
                    >
                      <Undo fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="重做">
                  <span>
                    <IconButton
                      color="secondary"
                      onClick={handleRedo}
                      disabled={!undoRedo.canRedo}
                      size="small"
                    >
                      <Redo fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              {/* Desktop buttons */}
              <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
                <Tooltip title="撤销 (Ctrl+Z)">
                  <span>
                    <IconButton color="secondary" onClick={handleUndo} disabled={!undoRedo.canUndo}>
                      <Undo />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="重做 (Ctrl+Y)">
                  <span>
                    <IconButton color="secondary" onClick={handleRedo} disabled={!undoRedo.canRedo}>
                      <Redo />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="历史记录">
                  <IconButton color="secondary" onClick={() => uiState.setHistoryOpen(true)}>
                    <History />
                  </IconButton>
                </Tooltip>
                <Tooltip title="探索画廊">
                  <IconButton color="secondary" onClick={() => uiState.setGalleryOpen(true)}>
                    <Explore />
                  </IconButton>
                </Tooltip>
                <Tooltip title="快捷键帮助">
                  <IconButton color="secondary" onClick={() => uiState.setShortcutsHelpOpen(true)}>
                    <HelpOutline />
                  </IconButton>
                </Tooltip>
                <Tooltip title="关于">
                  <IconButton color="secondary" onClick={() => uiState.setInfoOpen(true)}>
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

                {/* Auth: Login button or User menu. Toy build has no SEKAI Pass. */}
                {!isToyBuild() &&
                  (auth.isAuthenticated ? (
                    <UserMenu />
                  ) : (
                    <Tooltip title="登录 SEKAI Pass">
                      <span>
                        <LoginButton variant="icon" />
                      </span>
                    </Tooltip>
                  ))}
              </Box>
            </Box>
          </Grid>

          {/* Canvas Section */}
          <Grid item xs={12} md={5}>
            <Paper elevation={3} sx={{ p: 2 }}>
              {/* Canvas - mobile and desktop */}
              <Box display="flex" gap={2} justifyContent="center">
                {/* Left: Canvas and horizontal slider */}
                <Box display="flex" flexDirection="column">
                  {/* Canvas container - solo: fixed 296:256, duo: follows layout aspect */}
                  <Box
                    sx={
                      mode === 'duo'
                        ? (duo.config.layout === 'horizontal'
                            ? {
                                width: '100%',
                                maxWidth: '440px',
                                aspectRatio: '592 / 256',
                              }
                            : {
                                height: { xs: 'min(340px, 55vh)', md: '460px' },
                                aspectRatio: '296 / 512',
                              })
                        : {
                            width: { xs: '237px', md: '296px' },
                            height: { xs: '205px', md: '256px' },
                          }
                    }
                    style={{ position: 'relative', margin: '0 auto' }}
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

                    {/* Font loading overlay */}
                    {!fontsReady && <FontLoadingOverlay progress={fontProgress} />}
                  </Box>

                  {/* Mobile: Horizontal slider (solo only) */}
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    mt={1}
                    sx={{
                      display: { xs: mode === 'solo' ? 'flex' : 'none', md: 'none' },
                      height: '50px',
                      ...(positionLocked
                        ? { cursor: 'default', '& .Mui-disabled': { cursor: 'not-allowed' } }
                        : {}),
                    }}
                    onClick={positionLocked ? () => fanBonus.hintLockedFeature('position') : undefined}
                  >
                    <IconButton
                      size="small"
                      onClick={() => position.moveX(-5)}
                      disabled={positionLocked}
                    >
                      <KeyboardArrowLeft />
                    </IconButton>
                    <Box flex={1} display="flex" alignItems="center">
                      <Slider
                        value={position.position.x}
                        onChange={(_, v) =>
                          position.setPosition({
                            ...position.position,
                            x: Array.isArray(v) ? v[0] : v,
                          })
                        }
                        min={0}
                        max={296}
                        color="secondary"
                        sx={{ width: '100%' }}
                        disabled={positionLocked}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => position.moveX(5)}
                      disabled={positionLocked}
                    >
                      <KeyboardArrowRight />
                    </IconButton>
                  </Box>
                </Box>

                {/* Mobile: Right side vertical slider and Picker (solo only) */}
                <Box
                  display="flex"
                  flexDirection="column"
                  sx={{ display: { xs: mode === 'solo' ? 'flex' : 'none', md: 'none' } }}
                >
                  {/* Vertical slider - height matches Canvas */}
                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    sx={{
                      height: '205px',
                      ...(positionLocked
                        ? { cursor: 'default', '& .Mui-disabled': { cursor: 'not-allowed' } }
                        : {}),
                    }}
                    onClick={positionLocked ? () => fanBonus.hintLockedFeature('position') : undefined}
                  >
                    <IconButton
                      size="small"
                      onClick={() => position.moveY(-5)}
                      disabled={positionLocked}
                    >
                      <KeyboardArrowUp />
                    </IconButton>
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                      <Slider
                        orientation="vertical"
                        value={256 - position.position.y}
                        onChange={(_, v) =>
                          position.setPosition({
                            ...position.position,
                            y: 256 - (Array.isArray(v) ? v[0] : v),
                          })
                        }
                        min={0}
                        max={256}
                        color="secondary"
                        sx={{ height: '100%' }}
                        disabled={positionLocked}
                      />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => position.moveY(5)}
                      disabled={positionLocked}
                    >
                      <KeyboardArrowDown />
                    </IconButton>
                  </Box>

                  {/* Picker button - aligns with horizontal slider */}
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    mt={1}
                    sx={{ height: '50px' }}
                  >
                    <Picker
                      setCharacter={handleCharacterSelect}
                      color={colorScheme.dominantColor}
                      disabled={!!characterHook.customImage}
                      tooltip="请先清除自定义图片"
                    />
                  </Box>
                </Box>
              </Box>

              {/* Desktop: Control buttons and sliders (solo only) */}
              <Box sx={{ display: { xs: 'none', md: mode === 'solo' ? 'block' : 'none' } }}>
                <Box
                  display="flex"
                  gap={1}
                  mb={1}
                  mt={2}
                  sx={
                    positionLocked
                      ? { cursor: 'default', '& .Mui-disabled': { cursor: 'not-allowed' } }
                      : undefined
                  }
                  onClick={positionLocked ? () => fanBonus.hintLockedFeature('position') : undefined}
                >
                  <Box display="flex" gap={0.5} flex={1}>
                    <Button
                      size="small"
                      onClick={() => position.moveX(-5)}
                      fullWidth
                      disabled={positionLocked}
                      startIcon={<KeyboardArrowLeft />}
                    >
                      X-5
                    </Button>
                    <Button
                      size="small"
                      onClick={() => position.moveX(5)}
                      fullWidth
                      disabled={positionLocked}
                      endIcon={<KeyboardArrowRight />}
                    >
                      X+5
                    </Button>
                  </Box>
                  <Box display="flex" gap={0.5} flex={1}>
                    <Button
                      size="small"
                      onClick={() => position.moveY(-5)}
                      fullWidth
                      disabled={positionLocked}
                      startIcon={<KeyboardArrowUp />}
                    >
                      Y-5
                    </Button>
                    <Button
                      size="small"
                      onClick={() => position.moveY(5)}
                      fullWidth
                      disabled={positionLocked}
                      endIcon={<KeyboardArrowDown />}
                    >
                      Y+5
                    </Button>
                  </Box>
                </Box>

                <Typography variant="body2" gutterBottom>
                  水平位置: {position.position.x}
                </Typography>
                <Slider
                  value={position.position.x}
                  onChange={(_, v) =>
                    position.setPosition({ ...position.position, x: Array.isArray(v) ? v[0] : v })
                  }
                  min={0}
                  max={296}
                  color="secondary"
                  disabled={positionLocked}
                />

                <Typography variant="body2" gutterBottom>
                  垂直位置: {position.position.y}
                </Typography>
                <Slider
                  value={position.position.y}
                  onChange={(_, v) =>
                    position.setPosition({ ...position.position, y: Array.isArray(v) ? v[0] : v })
                  }
                  min={0}
                  max={256}
                  color="secondary"
                  disabled={positionLocked}
                />
              </Box>
            </Paper>

            <Box mt={2} sx={{ display: { xs: 'none', md: 'block' } }}>
              <ExportPanel
                onCopy={handleCopy}
                onCopyWithBg={handleCopyWithBg}
                onDownload={handleDownload}
                onDownloadJpg={handleDownloadJpg}
                onDownloadWebp={handleDownloadWebp}
                onUpload={() => uiState.setUploadOpen(true)}
              hideUpload={mode === 'duo'}
                scale={exportScale}
                onScaleChange={setExportScale}
                quality={exportQuality}
                onQualityChange={setExportQuality}
                compress={exportCompress}
                onCompressChange={setExportCompress}
                scaleLocked={fanBonus.isFeatureLocked('exportScale')}
                onScaleLockedHint={() => fanBonus.hintLockedFeature('exportScale')}
              />
            </Box>
          </Grid>

          {/* Controls Section */}
          <Grid item xs={12} md={7}>
            <Paper elevation={3} sx={{ p: 2 }}>
              {/* Mode switch: 单人 / 双人 */}
              <ToggleButtonGroup
                size="small"
                color="secondary"
                value={mode}
                exclusive
                onChange={(_, v: StickerMode | null) => v && setMode(v)}
                sx={{ mb: 2 }}
              >
                <ToggleButton value="solo">单人模式</ToggleButton>
                <ToggleButton value="duo">双人模式</ToggleButton>
              </ToggleButtonGroup>

              {mode === 'solo' ? (
                <>
                  {/* Desktop: display Picker and character name */}
                  <Box
                    display="flex"
                    alignItems="center"
                    gap={1}
                    mb={2}
                    sx={{ display: { xs: 'none', md: 'flex' } }}
                  >
                    <Picker
                      setCharacter={handleCharacterSelect}
                      color={colorScheme.dominantColor}
                      disabled={!!characterHook.customImage}
                      tooltip="请先清除自定义图片"
                    />
                    <Typography
                      variant="subtitle1"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                      }}
                    >
                      {characterHook.customImage
                        ? '自定义图片'
                        : characters[characterHook.character].name}
                    </Typography>
                  </Box>

                  <TextStylePanel
                    character={characterHook.character}
                    text={textSettings.text}
                    setText={textSettings.setText}
                    fontSize={textSettings.fontSize}
                    setFontSize={textSettings.setFontSize}
                    rotate={textSettings.rotate}
                    setRotate={textSettings.setRotate}
                    spaceSize={textSettings.spaceSize}
                    setSpaceSize={textSettings.setSpaceSize}
                    letterSpacing={textSettings.letterSpacing}
                    setLetterSpacing={textSettings.setLetterSpacing}
                    strokeWidth={stroke.strokeWidth}
                    setStrokeWidth={stroke.setStrokeWidth}
                    fontKey={textSettings.fontKey}
                    setFontKey={textSettings.setFontKey}
                    textColor={colorScheme.textColor}
                    setTextColor={colorScheme.setTextColor}
                    strokeColor={stroke.strokeColor}
                    setStrokeColor={stroke.setStrokeColor}
                    curve={textSettings.curve}
                    setCurve={textSettings.setCurve}
                    vertical={textSettings.vertical}
                    setVertical={textSettings.setVertical}
                    textBehind={textSettings.textBehind}
                    setTextBehind={textSettings.setTextBehind}
                    isFeatureLocked={fanBonus.isFeatureLocked}
                    onLockedHint={fanBonus.hintLockedFeature}
                  />

                  <Divider sx={{ my: 2 }} />

                  <Box mt={2}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                      onChange={characterHook.handleUpload}
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
                    {characterHook.customImage && (
                      <Button variant="outlined" size="small" onClick={characterHook.clearUpload}>
                        清除自定义图片
                      </Button>
                    )}
                  </Box>

                  <Box mt={2}>
                    <Button
                      variant="contained"
                      color="secondary"
                      onClick={() => uiState.setResetConfirmOpen(true)}
                      fullWidth
                    >
                      重置所有设置
                    </Button>
                  </Box>
                </>
              ) : (
                <Suspense fallback={null}>
                  <DuoModePanel
                    duo={duo}
                    isFeatureLocked={fanBonus.isFeatureLocked}
                    onLockedHint={fanBonus.hintLockedFeature}
                  />
                </Suspense>
              )}
            </Paper>
          </Grid>

          {/* Export Section */}
          <Grid item xs={12} sx={{ display: { xs: 'block', md: 'none' } }}>
            <ExportPanel
              onCopy={handleCopy}
              onCopyWithBg={handleCopyWithBg}
              onDownload={handleDownload}
              onDownloadJpg={handleDownloadJpg}
              onDownloadWebp={handleDownloadWebp}
              onUpload={() => uiState.setUploadOpen(true)}
              hideUpload={mode === 'duo'}
              scale={exportScale}
              onScaleChange={setExportScale}
              quality={exportQuality}
              onQualityChange={setExportQuality}
              compress={exportCompress}
              onCompressChange={setExportCompress}
              scaleLocked={fanBonus.isFeatureLocked('exportScale')}
              onScaleLockedHint={() => fanBonus.hintLockedFeature('exportScale')}
            />
          </Grid>
        </Grid>

        {/* Mobile bottom button area */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            flexDirection: 'column',
            gap: 1.5,
            mt: 3,
            pb: 2,
          }}
        >
          {/* First row: History and Gallery */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
            <Tooltip title="历史记录">
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<History />}
                onClick={() => uiState.setHistoryOpen(true)}
                sx={{ flex: 1, maxWidth: 160 }}
              >
                历史
              </Button>
            </Tooltip>
            <Tooltip title="探索画廊">
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<Explore />}
                onClick={() => uiState.setGalleryOpen(true)}
                sx={{ flex: 1, maxWidth: 160 }}
              >
                画廊
              </Button>
            </Tooltip>
          </Box>

          {/* Second row: About and GitHub */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
            <Tooltip title="关于">
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<InfoOutlined />}
                onClick={() => uiState.setInfoOpen(true)}
                sx={{ flex: 1, maxWidth: 160 }}
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
                sx={{ flex: 1, maxWidth: 160 }}
              >
                GitHub
              </Button>
            </Tooltip>
          </Box>

          {/* Third row: Auth (Login or User info). Toy build has no SEKAI Pass. */}
          {!isToyBuild() && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, mt: 1.5 }}>
              {auth.isAuthenticated ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {auth.user?.username}
                  </Typography>
                  <UserMenu />
                </Box>
              ) : (
                <LoginButton variant="outlined" size="medium" fullWidth />
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Dialogs - Lazy loaded with Suspense */}
      <Suspense fallback={null}>
        <Info open={uiState.infoOpen} handleClose={() => uiState.setInfoOpen(false)} />
      </Suspense>

      <Suspense fallback={null}>
        <Dialog
          open={uiState.historyOpen}
          onClose={() => uiState.setHistoryOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>历史记录</DialogTitle>
          <DialogContent>
            <HistoryPanel
              historyItems={history.historyItems}
              onLoadHistory={(id) => {
                loadFromHistory(id)
                uiState.setHistoryOpen(false)
              }}
              onDeleteHistory={history.deleteHistory}
              onClearHistory={history.clearHistory}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => uiState.setHistoryOpen(false)}>关闭</Button>
          </DialogActions>
        </Dialog>
      </Suspense>

      <Suspense fallback={null}>
        <Dialog
          open={uiState.galleryOpen}
          onClose={() => uiState.setGalleryOpen(false)}
          maxWidth="lg"
          fullWidth
        >
          <DialogTitle>探索画廊</DialogTitle>
          <DialogContent>
            {/* Toy 平台禁止 UGC，画廊整体停用 */}
            {isToyBuild() ? (
              <Alert severity="warning" sx={{ my: 2 }}>
                🚫 {TOY_GALLERY_BLOCKED_REASON}
              </Alert>
            ) : (
              <GalleryPanel />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => uiState.setGalleryOpen(false)}>关闭</Button>
          </DialogActions>
        </Dialog>
      </Suspense>

      <Suspense fallback={null}>
        <UploadDialog
          open={uiState.uploadOpen}
          onClose={() => uiState.setUploadOpen(false)}
          canvas={canvasRef.current}
          altText={textSettings.text}
          onUploadSuccess={(url) => saveToHistory(url)}
          characterId={characterHook.character}
          customImage={characterHook.customImage}
          exportScale={exportScale}
          renderAtScale={renderAtScale}
        />
      </Suspense>

      {/* Reset Confirmation Dialog */}
      <Dialog open={uiState.resetConfirmOpen} onClose={() => uiState.setResetConfirmOpen(false)}>
        <DialogTitle>确认重置</DialogTitle>
        <DialogContent>
          <Typography>
            确定要重置所有设置吗？此操作将清除当前的文字、样式和位置设置，恢复到默认状态。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => uiState.setResetConfirmOpen(false)}>取消</Button>
          <Button
            onClick={() => {
              if (mode === 'duo') {
                duo.resetDuo()
              } else {
                resetSettings()
              }
              uiState.setResetConfirmOpen(false)
            }}
            color="secondary"
            variant="contained"
          >
            确定重置
          </Button>
        </DialogActions>
      </Dialog>

      {/* Shortcuts Help Dialog */}
      <ShortcutsHelpDialog
        open={uiState.shortcutsHelpOpen}
        onClose={() => uiState.setShortcutsHelpOpen(false)}
      />

      {/* Notifications */}
      <NotificationSnackbar
        open={uiState.copyPopupOpen}
        message="已复制到剪贴板！"
        onClose={() => uiState.setCopyPopupOpen(false)}
      />
      <NotificationSnackbar
        open={uiState.downloadPopupOpen}
        message="下载成功！"
        onClose={() => uiState.setDownloadPopupOpen(false)}
      />

      {/* Fan bonus: locked-feature hint snackbar (toy build only) */}
      <Snackbar
        open={fanBonus.hintOpen && fanBonus.hintMessage !== ''}
        autoHideDuration={4000}
        onClose={fanBonus.dismissHint}
        message={fanBonus.hintMessage}
        action={
          <Button color="secondary" size="small" onClick={() => {
            fanBonus.dismissHint()
            fanBonus.openDialog()
          }}>
            查看福利
          </Button>
        }
      />

      {/* Fan bonus dialog (toy build only; no-ops elsewhere) */}
      <Suspense fallback={null}>
        <FanBonusDialog
          open={fanBonus.dialogOpen}
          handleClose={fanBonus.closeDialog}
          relationFollowed={fanBonus.relationFollowed}
          videoLiked={fanBonus.videoLiked}
          videoInfo={fanBonus.videoInfo}
          onRefresh={() => void fanBonus.refresh()}
          refreshing={fanBonus.queryStatus === 'checking'}
        />
      </Suspense>

      {/* PWA Update Prompt */}
      <Suspense fallback={null}>
        <PWAUpdatePrompt />
      </Suspense>
    </ThemeWrapper>
  )
}

export default App
