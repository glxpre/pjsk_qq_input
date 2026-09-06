// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useState, useRef } from 'react'
import { Box, Typography, Button, Popover } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import ColorWheel from './ColorWheel'
import { hexToHsv, hsvToHex } from './colorWheelMath'

interface ColorPickerWithResetProps {
  label: string
  value: string
  onChange: (color: string) => void
  defaultColor: string
  disabled?: boolean
}

/**
 * 色轮取色器（Popover 弹出），替代原生 input[type=color]。
 * 所有浏览器/webview 一致可用，不再依赖系统取色面板。
 * Props 接口与旧版完全兼容。
 */
export default function ColorPickerWithReset({
  label,
  value,
  onChange,
  defaultColor,
  disabled = false,
}: ColorPickerWithResetProps) {
  const theme = useTheme()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  // 拖动过程中保持内部 HSV 状态，避免外部 value→HSV 反复转换引入抖动
  const internalHsvRef = useRef(hexToHsv(value))

  const open = Boolean(anchorEl) && !disabled

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return
    internalHsvRef.current = hexToHsv(value)
    setAnchorEl(e.currentTarget)
  }

  const handleClose = () => setAnchorEl(null)

  const handleHsvChange = (hsv: { h: number; s: number; v: number }) => {
    internalHsvRef.current = hsv
    onChange(hsvToHex(hsv.h, hsv.s, hsv.v))
  }

  return (
    <>
      <Typography variant="body2" gutterBottom>
        {label}
      </Typography>
      <Box display="flex" gap={1} alignItems="center">
        <Box
          onClick={handleOpen}
          sx={{
            width: 80,
            height: 32,
            borderRadius: 1,
            border: `1px solid ${theme.palette.text.primary}`,
            backgroundColor: value,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            flexShrink: 0,
          }}
          aria-label={`${label}：${value}`}
        />
        <Button size="small" onClick={() => onChange(defaultColor)} disabled={disabled}>
          重置
        </Button>
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              p: 1.5,
              bgcolor: theme.palette.background.paper,
              borderColor: theme.palette.text.primary,
              borderWidth: 1,
              borderStyle: 'solid',
            },
          },
        }}
      >
        <Box display="flex" flexDirection="column" alignItems="center" gap={1}>
          <ColorWheel hsv={internalHsvRef.current} onChange={handleHsvChange} size={220} />
          <Box display="flex" alignItems="center" gap={1} width="100%">
            <Box
              sx={{
                width: 32,
                height: 20,
                borderRadius: 0.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: value,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
              {value.toUpperCase()}
            </Typography>
          </Box>
        </Box>
      </Popover>
    </>
  )
}
