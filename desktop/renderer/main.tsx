// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Desktop renderer entry.
 *
 * Reuses the project's local fonts and the shared sticker renderer; nothing here
 * depends on the web app's auth, gallery or PWA code.
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'

import App from './App'
import { installSmokeListener } from './smoke'
import './index.css'

// Inert during normal use: it only reacts to the `--smoke-test` command, which
// lets the packaged build verify its own assets, fonts and rendering.
installSmokeListener()

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e4c2c8' },
    background: { default: '#1f1c1d', paper: '#2a2627' },
  },
  typography: {
    fontFamily:
      "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif",
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 容器')

createRoot(container).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
