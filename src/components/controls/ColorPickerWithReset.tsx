// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { Box, Typography, TextField, Button } from '@mui/material'

/**
 * Color input with reset button
 */
export default function ColorPickerWithReset({ label, value, onChange, defaultColor }) {
  return (
    <>
      <Typography variant="body2" gutterBottom>
        {label}
      </Typography>
      <Box display="flex" gap={1} alignItems="center">
        <TextField
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          size="small"
          color="secondary"
          sx={{ width: '80px' }}
        />
        <Button size="small" onClick={() => onChange(defaultColor)}>
          重置
        </Button>
      </Box>
    </>
  )
}
