// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * 'content-risk-lexicon' 的非 toy 构建占位实现（见 vite.config.js 的 resolve.alias）。
 * toy 构建时该别名指向 src/utils/contentRiskLexicon.ts（真实词表，不入库）。
 * 全部放行，且词表对象为 undefined，保证非 toy 产物不含任何词表内容。
 */

export interface ContentRiskMatchResult {
  hit: false
  type: 'none'
  term: ''
}

export const contentRiskLexicon: undefined = undefined

export function matchContentRisk(_text?: string): ContentRiskMatchResult {
  return { hit: false, type: 'none', term: '' }
}
