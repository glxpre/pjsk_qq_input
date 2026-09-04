// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import {
  Grid,
  Button,
  Typography,
  Paper,
  Box,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  Slider,
  Divider,
} from '@mui/material'
import { ContentCopyTwoTone, DownloadTwoTone, CloudUpload } from '@mui/icons-material'

export type ExportScale = 1 | 2 | 3
/** 简单模式的背景选择 */
export type ExportBackground = 'transparent' | 'white'

interface ExportPanelProps {
  onCopy: () => void
  onCopyWithBg: () => void
  onDownload: () => void
  onDownloadJpg: () => void
  onDownloadWebp: () => void
  onUpload: () => void
  scale: ExportScale
  onScaleChange: (scale: ExportScale) => void
  quality: number
  onQualityChange: (quality: number) => void
  compress: boolean
  onCompressChange: (compress: boolean) => void
  /** 高级选项开关：关闭时只展示面向新手的极简导出 */
  advanced: boolean
  onAdvancedChange: (advanced: boolean) => void
  /** 简单模式：背景 透明 / 白色（默认透明） */
  background: ExportBackground
  onBackgroundChange: (background: ExportBackground) => void
  /** 简单模式：透明背景下是否导出为 WebP（默认关闭 → PNG） */
  useWebp: boolean
  onUseWebpChange: (useWebp: boolean) => void
  /** 双人模式下隐藏「上传分享」（画廊上传仅支持单人配置） */
  hideUpload?: boolean
  /** 粉丝福利：高分辨率导出（2×/3×）是否锁定 */
  scaleLocked?: boolean
  /** 粉丝福利：点击锁定项时的轻提示 */
  onScaleLockedHint?: () => void
}

/**
 * Panel that groups all export buttons and export settings.
 * 「高级选项」关闭时只提供 背景 + 复制/保存/上传 三个按钮；
 * 打开后展示全部六个按钮与 导出尺寸 / 压缩设置。
 */
export default function ExportPanel({
  onCopy,
  onCopyWithBg,
  onDownload,
  onDownloadJpg,
  onDownloadWebp,
  onUpload,
  scale,
  onScaleChange,
  quality,
  onQualityChange,
  compress,
  onCompressChange,
  advanced,
  onAdvancedChange,
  background,
  onBackgroundChange,
  useWebp,
  onUseWebpChange,
  hideUpload = false,
  scaleLocked = false,
  onScaleLockedHint,
}: ExportPanelProps) {
  // 简单模式按钮的最终行为由 背景 / WebP 开关决定
  const simpleCopy = background === 'white' ? onCopyWithBg : onCopy
  const simpleSave =
    background === 'white' ? onDownloadJpg : useWebp ? onDownloadWebp : onDownload

  const compressSection = (withHint: boolean) => (
    <>
      <FormControlLabel
        control={
          <Switch
            checked={compress}
            onChange={(_, checked) => onCompressChange(checked)}
            color="secondary"
          />
        }
        label="压缩（JPG / WEBP）"
      />
      <Box sx={{ mt: 0.5, opacity: compress ? 1 : 0.45, pointerEvents: compress ? 'auto' : 'none' }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          压缩质量：{quality}%
        </Typography>
        <Slider
          value={quality}
          onChange={(_, v) => onQualityChange(Array.isArray(v) ? v[0] : v)}
          min={10}
          max={100}
          step={1}
          color="secondary"
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `${v}%`}
        />
        {withHint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            仅影响 JPG / WEBP；PNG 始终无损。关闭压缩时有损格式使用最高质量。
          </Typography>
        )}
      </Box>
    </>
  )

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">导出选项</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={advanced}
              onChange={(_, checked) => onAdvancedChange(checked)}
              color="secondary"
            />
          }
          label="高级选项"
        />
      </Box>

      {!advanced ? (
        <>
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              背景
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="secondary"
              value={background}
              onChange={(_, value: ExportBackground | null) => {
                if (value != null) onBackgroundChange(value)
              }}
              fullWidth
            >
              <ToggleButton value="transparent">透明</ToggleButton>
              <ToggleButton value="white">白色</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {background === 'transparent' && (
            <FormControlLabel
              sx={{ display: 'flex', mb: 0.5 }}
              control={
                <Switch
                  checked={useWebp}
                  onChange={(_, checked) => onUseWebpChange(checked)}
                  color="secondary"
                />
              }
              label="使用新一代图片文件格式（WebP）"
            />
          )}

          {(background === 'white' || useWebp) &&
            compressSection(false)}

          <Grid container spacing={1} sx={{ mt: 0.5 }}>
            <Grid item xs={hideUpload ? 6 : 4}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<ContentCopyTwoTone />}
                onClick={simpleCopy}
                fullWidth
              >
                复制图片
              </Button>
            </Grid>
            <Grid item xs={hideUpload ? 6 : 4}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<DownloadTwoTone />}
                onClick={simpleSave}
                fullWidth
              >
                保存图片
              </Button>
            </Grid>
            {!hideUpload && (
              <Grid item xs={4}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CloudUpload />}
                  onClick={onUpload}
                  fullWidth
                >
                  上传分享
                </Button>
              </Grid>
            )}
          </Grid>
        </>
      ) : (
        <>
          <Grid container spacing={1}>
            <Grid item xs={6} sm={4} md={6}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<ContentCopyTwoTone />}
                onClick={onCopy}
                fullWidth
              >
                复制 PNG
              </Button>
            </Grid>
            <Grid item xs={6} sm={4} md={6}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<ContentCopyTwoTone />}
                onClick={onCopyWithBg}
                fullWidth
              >
                复制 JPG
              </Button>
            </Grid>
            <Grid item xs={6} sm={4} md={6}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<DownloadTwoTone />}
                onClick={onDownload}
                fullWidth
              >
                保存 PNG
              </Button>
            </Grid>
            <Grid item xs={6} sm={4} md={6}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<DownloadTwoTone />}
                onClick={onDownloadJpg}
                fullWidth
              >
                保存 JPG
              </Button>
            </Grid>
            <Grid item xs={6} sm={4} md={6}>
              <Button
                variant="contained"
                color="secondary"
                startIcon={<DownloadTwoTone />}
                onClick={onDownloadWebp}
                fullWidth
              >
                保存 WEBP
              </Button>
            </Grid>
            {!hideUpload && (
              <Grid item xs={6} sm={4} md={6}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CloudUpload />}
                  onClick={onUpload}
                  fullWidth
                >
                  上传分享
                </Button>
              </Grid>
            )}
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle1" gutterBottom>
            导出设置
          </Typography>

          <Box
            sx={{ mb: 1.5, ...(scaleLocked ? { cursor: 'default', '& .Mui-disabled': { cursor: 'not-allowed' } } : {}) }}
            onClick={scaleLocked ? onScaleLockedHint : undefined}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              导出尺寸
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="secondary"
              value={scale}
              onChange={(_, value: ExportScale | null) => {
                if (value != null) onScaleChange(value)
              }}
              fullWidth
            >
              <ToggleButton value={1}>1×</ToggleButton>
              <ToggleButton value={2} disabled={scaleLocked}>
                2×
              </ToggleButton>
              <ToggleButton value={3} disabled={scaleLocked}>
                3×
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              按倍率重新绘制导出（文字/描边更清晰）；角色底图仍受素材分辨率限制
            </Typography>
          </Box>

          {compressSection(true)}
        </>
      )}
    </Paper>
  )
}
