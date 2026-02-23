// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Common type definitions for the application
 */

export interface Position {
  x: number
  y: number
}

export interface Character {
  img: string
  name: string
  color: string
  defaultText: {
    x: number
    y: number
    r: number
    s: number
    text?: string
  }
}

export type FontKey = 'yuruka' | 'fangtang' | 'system'
