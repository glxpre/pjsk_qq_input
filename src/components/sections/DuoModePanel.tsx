// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useRef, useState } from 'react'
import {
  Box,
  Grid,
  Typography,
  TextField,
  Divider,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Tabs,
  Tab,
} from '@mui/material'
import { Upload, RestartAlt } from '@mui/icons-material'
import ResponsiveSlider from '../controls/ResponsiveSlider'
import ColorPickerWithReset from '../controls/ColorPickerWithReset'
import ToggleOption from '../controls/ToggleOption'
import Picker from '../Picker'
import characters from '../../characters.json'
import { DuoLayout, DuoTextMode, FontKey } from '../../types'
import { UseDuoModeReturn } from '../../hooks/useDuoMode'
import { DUO_SLOT_WIDTH, DUO_SLOT_HEIGHT, DUO_SPLIT_AUTO } from '../../hooks/useCanvasDrawing'
import { FanBonusFeature } from '../../config/fanBonus'
import { isToyBuild } from '../../utils/toy'

interface DuoModePanelProps {
  duo: UseDuoModeReturn
  /** 粉丝福利：锁定状态查询（未锁定返回 false） */
  isFeatureLocked?: (feature: FanBonusFeature) => boolean
  /** 粉丝福利：点击锁定项时的轻提示 */
  onLockedHint?: (feature: FanBonusFeature) => void
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Typography variant="subtitle1" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
      {children}
    </Typography>
  )
}

/**
 * Panel with all duo-mode controls: layout, two image sides, merged/split text.
 * 参数分成三个标签页（排列 / 底图 / 文字），原地切换面板内容，
 * 左侧预览区不随页面滚动。
 */
export default function DuoModePanel({ duo, isFeatureLocked, onLockedHint }: DuoModePanelProps) {
  const { config } = duo
  const fileInputARef = useRef<HTMLInputElement>(null)
  const fileInputBRef = useRef<HTMLInputElement>(null)

  // 默认打开「底图」页
  const [tab, setTab] = useState(1)

  const locked = (feature: FanBonusFeature): boolean =>
    isFeatureLocked ? isFeatureLocked(feature) : false
  const hint = (feature: FanBonusFeature): void => onLockedHint?.(feature)

  // 锁定控件外层容器：disabled 控件不冒泡 click，靠外层 onClick 触发轻提示
  const lockedBoxSx = {
    cursor: 'default',
    '& .Mui-disabled': { cursor: 'not-allowed' },
  } as const

  const totalChars = config.text.replace(/\n/g, '').length
  const isHorizontal = config.layout === 'horizontal'
  const canvasW = isHorizontal ? DUO_SLOT_WIDTH * 2 : DUO_SLOT_WIDTH
  const canvasH = isHorizontal ? DUO_SLOT_HEIGHT : DUO_SLOT_HEIGHT * 2

  const setDuoImage = (index: 0 | 1, patch: Partial<typeof config.images[0]>) => {
    const images: [typeof config.images[0], typeof config.images[1]] = [...config.images]
    images[index] = { ...images[index], ...patch }
    duo.updateDuo({ images })
  }

  const renderImageSide = (index: 0 | 1) => {
    const side = config.images[index]
    const fileInputRef = index === 0 ? fileInputARef : fileInputBRef
    const isSideA = index === 0

    return (
      <Grid item xs={12} sm={6} key={index}>
        <Typography variant="subtitle2">
          底图 {isSideA ? 'A（主角色）' : 'B'}：{side.customImage ? '自定义图片' : characters[side.character].name}
        </Typography>
        <Box display="flex" alignItems="center" gap={1} mt={0.5} mb={1}>
          <Picker
            setCharacter={(c) => duo.setSideCharacter(index, c)}
            color={characters[side.character].color}
          />
          {!isToyBuild() && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                onChange={(e) => duo.handleSideUpload(index, e)}
                style={{ display: 'none' }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<Upload />}
                onClick={() => fileInputRef.current?.click()}
              >
                上传
              </Button>
            </>
          )}
          {side.customImage && (
            <Button variant="outlined" size="small" onClick={() => duo.clearSideUpload(index)}>
              清除
            </Button>
          )}
        </Box>

        <ResponsiveSlider
          label="缩放"
          value={side.scale}
          onChange={(v) => setDuoImage(index, { scale: v })}
          min={0.5}
          max={1.5}
          step={0.05}
        />
        <ResponsiveSlider
          label="旋转"
          value={side.rotate}
          onChange={(v) => setDuoImage(index, { rotate: v })}
          min={-180}
          max={180}
        />
        <Box onClick={locked('position') ? () => hint('position') : undefined} sx={lockedBoxSx}>
          <ResponsiveSlider
            label="X 偏移"
            value={side.offsetX}
            onChange={(v) => setDuoImage(index, { offsetX: v })}
            min={-120}
            max={120}
            disabled={locked('position')}
          />
          <ResponsiveSlider
            label="Y 偏移"
            value={side.offsetY}
            onChange={(v) => setDuoImage(index, { offsetY: v })}
            min={-120}
            max={120}
            disabled={locked('position')}
          />
        </Box>
      </Grid>
    )
  }

  return (
    <Box>
      {/* 标签页：原地切换面板内容，左侧预览区不动 */}
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="fullWidth" sx={{ mb: 1 }}>
        <Tab label="排列" />
        <Tab label="底图" />
        <Tab label="文字" />
      </Tabs>

      {tab === 0 && (
      <Box>
        {/* 排列布局 */}
        <SectionTitle>排列布局</SectionTitle>
        <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
          <ToggleButtonGroup
            size="small"
            color="secondary"
            value={config.layout}
            exclusive
            onChange={(_, v: DuoLayout | null) => v && duo.setLayout(v)}
          >
            <ToggleButton value="horizontal">左右排列</ToggleButton>
            <ToggleButton value="vertical">上下排列</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>
      )}

      {tab === 1 && (
      <Box>
        {/* 底图 */}
        <SectionTitle>底图</SectionTitle>
        <Grid container spacing={2}>
          {([0, 1] as const).map((i) => renderImageSide(i))}
        </Grid>

        {/* 图层顺序：重叠时谁在上面 */}
        <Typography variant="body2" sx={{ mt: 2, mb: 0.5 }}>
          图层顺序（重叠时谁在上面）
        </Typography>
        <ToggleButtonGroup
          size="small"
          color="secondary"
          exclusive
          value={config.topSide ?? 0}
          onChange={(_, v: 0 | 1 | null) => v !== null && duo.updateDuo({ topSide: v })}
        >
          <ToggleButton value={0}>A 在上</ToggleButton>
          <ToggleButton value={1}>B 在上</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      )}

      {tab === 2 && (
      <Box>
        {/* 文字 */}
        <SectionTitle>文字</SectionTitle>
        <ToggleButtonGroup
          size="small"
          color="secondary"
          value={config.textMode}
          exclusive
          onChange={(_, v: DuoTextMode | null) => v && duo.setTextMode(v)}
          sx={{ mb: 1 }}
        >
          <ToggleButton value="merged">合并（双色拼合）</ToggleButton>
          <ToggleButton value="split">拆开（分到两图）</ToggleButton>
        </ToggleButtonGroup>

        {config.textMode === 'merged' ? (
          <>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="文字内容"
              value={config.text}
              onChange={(e) => duo.updateDuo({ text: e.target.value })}
              color="secondary"
              sx={{ mb: 1 }}
            />
            <ResponsiveSlider
              label={`拆分位置（${DUO_SPLIT_AUTO} 为自动平分）`}
              value={Math.min(config.splitIndex, totalChars)}
              onChange={(v) => duo.updateDuo({ splitIndex: v })}
              min={DUO_SPLIT_AUTO}
              max={Math.max(totalChars, 1)}
            />
          </>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="前半文字（图 A 上）"
                value={config.textA}
                onChange={(e) => duo.updateDuo({ textA: e.target.value })}
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="后半文字（图 B 上）"
                value={config.textB}
                onChange={(e) => duo.updateDuo({ textB: e.target.value })}
                color="secondary"
              />
            </Grid>
          </Grid>
        )}

        <Grid container spacing={2} mt={0.5}>
          <Grid item xs={6}>
            <ColorPickerWithReset
              label="前半颜色"
              value={config.colorA}
              onChange={(v) => duo.updateDuo({ colorA: v })}
              defaultColor={characters[config.images[0].character].color}
            />
          </Grid>
          <Grid item xs={6}>
            <ColorPickerWithReset
              label="后半颜色"
              value={config.colorB}
              onChange={(v) => duo.updateDuo({ colorB: v })}
              defaultColor={characters[config.images[1].character].color}
            />
          </Grid>
        </Grid>

        {config.textMode === 'merged' ? (
          <>
            <Box onClick={locked('position') ? () => hint('position') : undefined} sx={lockedBoxSx}>
              <ResponsiveSlider
                label="文字 X 位置"
                value={config.textPosition.x}
                onChange={(v) => duo.updateDuo({ textPosition: { ...config.textPosition, x: v } })}
                min={0}
                max={canvasW}
                disabled={locked('position')}
              />
              <ResponsiveSlider
                label="文字 Y 位置"
                value={config.textPosition.y}
                onChange={(v) => duo.updateDuo({ textPosition: { ...config.textPosition, y: v } })}
                min={0}
                max={canvasH}
                disabled={locked('position')}
              />
            </Box>
            <Box onClick={locked('rotate') ? () => hint('rotate') : undefined} sx={lockedBoxSx}>
              <ResponsiveSlider
                label="文字旋转"
                value={config.textRotate}
                onChange={(v) => duo.updateDuo({ textRotate: v })}
                min={-10}
                max={10}
                step={0.2}
                disabled={locked('rotate')}
              />
            </Box>
          </>
        ) : (
          <Box onClick={locked('position') ? () => hint('position') : undefined} sx={lockedBoxSx}>
            <Typography variant="body2" sx={{ mt: 1 }}>
              前半段位置（图 A 上）
            </Typography>
            <ResponsiveSlider
              label="前半 X"
              value={config.textPositionA.x}
              onChange={(v) => duo.updateDuo({ textPositionA: { ...config.textPositionA, x: v } })}
              min={0}
              max={canvasW}
              disabled={locked('position')}
            />
            <ResponsiveSlider
              label="前半 Y"
              value={config.textPositionA.y}
              onChange={(v) => duo.updateDuo({ textPositionA: { ...config.textPositionA, y: v } })}
              min={0}
              max={canvasH}
              disabled={locked('position')}
            />
            <Typography variant="body2" sx={{ mt: 1 }}>
              后半段位置（图 B 上）
            </Typography>
            <ResponsiveSlider
              label="后半 X"
              value={config.textPositionB.x}
              onChange={(v) => duo.updateDuo({ textPositionB: { ...config.textPositionB, x: v } })}
              min={0}
              max={canvasW}
              disabled={locked('position')}
            />
            <ResponsiveSlider
              label="后半 Y"
              value={config.textPositionB.y}
              onChange={(v) => duo.updateDuo({ textPositionB: { ...config.textPositionB, y: v } })}
              min={0}
              max={canvasH}
              disabled={locked('position')}
            />
          </Box>
        )}

        {/* 共享样式 */}
        <Divider sx={{ my: 2 }} />
        <Box onClick={locked('fontSize') ? () => hint('fontSize') : undefined} sx={lockedBoxSx}>
          <ResponsiveSlider
            label="字体大小"
            value={config.fontSize}
            onChange={(v) => duo.updateDuo({ fontSize: v })}
            min={10}
            max={100}
            disabled={locked('fontSize')}
          />
        </Box>
        <Box onClick={locked('spaceSize') ? () => hint('spaceSize') : undefined} sx={lockedBoxSx}>
          <ResponsiveSlider
            label="行间距"
            value={config.spaceSize}
            onChange={(v) => duo.updateDuo({ spaceSize: v })}
            min={18}
            max={100}
            disabled={locked('spaceSize')}
          />
        </Box>
        <Box
          onClick={locked('letterSpacing') ? () => hint('letterSpacing') : undefined}
          sx={lockedBoxSx}
        >
          <ResponsiveSlider
            label="字间距"
            value={config.letterSpacing}
            onChange={(v) => duo.updateDuo({ letterSpacing: v })}
            min={-10}
            max={30}
            disabled={locked('letterSpacing')}
          />
        </Box>
        <Box onClick={locked('strokeWidth') ? () => hint('strokeWidth') : undefined} sx={lockedBoxSx}>
          <ResponsiveSlider
            label="描边宽度"
            value={config.strokeWidth}
            onChange={(v) => duo.updateDuo({ strokeWidth: v })}
            min={0}
            max={30}
            disabled={locked('strokeWidth')}
          />
        </Box>

        <FormControl fullWidth size="small" sx={{ mt: 2 }}>
          <InputLabel color="secondary">字体</InputLabel>
          <Select
            value={config.fontKey}
            onChange={(e) => duo.updateDuo({ fontKey: e.target.value as FontKey })}
            label="字体"
            color="secondary"
          >
            <MenuItem value="yuruka">YurukaStd</MenuItem>
            <MenuItem value="fangtang">尚首方糖体</MenuItem>
            <MenuItem value="system">系统默认</MenuItem>
          </Select>
        </FormControl>

        <Grid container spacing={2} mt={1}>
          <Grid item xs={6}>
            <Box
              onClick={locked('strokeColor') ? () => hint('strokeColor') : undefined}
              sx={lockedBoxSx}
            >
              <ColorPickerWithReset
                label="描边颜色"
                value={config.strokeColor}
                onChange={(v) => duo.updateDuo({ strokeColor: v })}
                defaultColor="#ffffff"
                disabled={locked('strokeColor')}
              />
            </Box>
          </Grid>
        </Grid>

        <Box mt={1}>
          <Box
            onClick={locked('curve') ? () => hint('curve') : undefined}
            sx={lockedBoxSx}
            component="span"
            mr={2}
          >
            <ToggleOption
              label="弧形文字"
              checked={config.curve}
              onChange={(v) => duo.updateDuo({ curve: v })}
              disabled={locked('curve')}
            />
          </Box>
          <Box
            onClick={locked('vertical') ? () => hint('vertical') : undefined}
            sx={lockedBoxSx}
            component="span"
            mr={2}
          >
            <ToggleOption
              label="竖排文字"
              checked={config.vertical}
              onChange={(v) => duo.updateDuo({ vertical: v })}
              disabled={locked('vertical')}
            />
          </Box>
          <Box
            onClick={locked('textBehind') ? () => hint('textBehind') : undefined}
            sx={lockedBoxSx}
            component="span"
          >
            <ToggleOption
              label="文字置于底层"
              checked={config.textBehind}
              onChange={(v) => duo.updateDuo({ textBehind: v })}
              disabled={locked('textBehind')}
            />
          </Box>
        </Box>
      </Box>
      )}

      {/* 重置按钮：任何标签页下都可见 */}
      <Box mt={2} mb={1}>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<RestartAlt />}
          onClick={duo.resetDuo}
          fullWidth
        >
          重置双人设置
        </Button>
      </Box>
    </Box>
  )
}
