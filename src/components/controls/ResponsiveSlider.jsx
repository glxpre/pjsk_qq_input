// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { Box, Typography, Slider } from '@mui/material'

/**
 * Reusable slider with mobile/desktop responsive layouts
 */
export default function ResponsiveSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  showValue = true,
}) {
  return (
    <Box sx={{ mt: { xs: 1, md: 2 } }}>
      {/* Desktop: label on top with value */}
      <Typography variant="body2" gutterBottom sx={{ display: { xs: 'none', md: 'block' } }}>
        {label}{showValue && `: ${value}`}
      </Typography>

      {/* Mobile: label and slider on same line */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem', minWidth: '64px' }}>
          {label}
        </Typography>
        <Slider
          value={value}
          onChange={(_, v) => onChange(v)}
          min={min}
          max={max}
          step={step}
          color="secondary"
          valueLabelDisplay="auto"
        />
      </Box>

      {/* Desktop: slider on separate line */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Slider
          value={value}
          onChange={(_, v) => onChange(v)}
          min={min}
          max={max}
          step={step}
          color="secondary"
        />
      </Box>
    </Box>
  )
}
