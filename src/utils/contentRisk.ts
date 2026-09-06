// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { isToyBuild } from './toy'
import { contentRiskLexicon, matchContentRisk } from 'content-risk-lexicon'

/**
 * Toy 审核用内容风险检查。
 * 'content-risk-lexicon' 由 vite.config.js 的 resolve.alias 按构建模式解析：
 * toy 构建 → 真实词表（src/utils/contentRiskLexicon.ts，不入库），
 * 非 toy 构建 → contentRiskLexiconStub.ts（空实现，恒放行）。
 */

/** 非 toy 构建恒返回不命中；toy 构建按词表匹配。 */
export function contentRiskMatch(text: string): { hit: boolean } {
  if (!isToyBuild()) return { hit: false }
  try {
    return matchContentRisk(text)
  } catch {
    return { hit: false }
  }
}

/** 冷却截止时间戳（模块级，跨调用保持）。 */
let blockUntil = 0

function blockMessage(remaining: number): string {
  return remaining >= 60
    ? '页面性能不足，请 1 分钟后重试'
    : `页面性能不足，请 ${remaining} 秒后重试`
}

/**
 * 检查文本是否命中内容风险词表；命中则启动冷却并返回提示语，
 * 冷却期内重复尝试直接返回剩余时间提示，未命中返回 null。
 */
export function contentRiskBlockMessage(text: string): string | null {
  const now = Date.now()
  if (now < blockUntil) {
    return blockMessage(Math.ceil((blockUntil - now) / 1000))
  }
  if (!contentRiskMatch(text).hit) return null
  const cooldown = contentRiskLexicon?.cooldownSeconds ?? 60
  blockUntil = now + cooldown * 1000
  return blockMessage(cooldown)
}

/** 冷却剩余秒数（0 表示未在冷却中）。 */
export function contentRiskRemainingSeconds(): number {
  return Math.max(0, Math.ceil((blockUntil - Date.now()) / 1000))
}

/** 按剩余秒数生成冷却提示语。 */
export function contentRiskCooldownMessage(remaining: number): string {
  return blockMessage(remaining)
}
