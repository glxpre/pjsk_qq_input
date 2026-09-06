// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useEffect, useRef, useState } from 'react'
import {
  contentRiskBlockMessage,
  contentRiskCooldownMessage,
  contentRiskMatch,
  contentRiskRemainingSeconds,
} from '../utils/contentRisk'

export interface ContentRiskLock {
  /** 是否在冷却锁定中（锁定期间应禁用全部调节项） */
  locked: boolean
  /** 当前提示语（含剩余时间），未锁定时为空串 */
  message: string
}

/**
 * Toy 审核用内容风险锁定：监听文本变化（打字即预览更新时），
 * 命中词表立刻锁定并进入冷却，倒计时结束自动解锁。
 * 解锁后会对当前文本复检，冷却期内改文本不会重置或延长冷却。
 * 非 toy 构建恒不锁定（词表模块为空 stub）。
 */
export function useContentRiskLock(texts: string[]): ContentRiskLock {
  const [locked, setLocked] = useState(false)
  const [message, setMessage] = useState('')

  // 文本变化时检测；锁定期间跳过（避免重复延长），解锁后自动复检
  useEffect(() => {
    if (locked) return
    for (const text of texts) {
      if (!text || text === '请输入文本') continue
      const msg = contentRiskBlockMessage(text)
      if (msg) {
        setLocked(true)
        setMessage(msg)
        return
      }
    }
  }, [texts, locked])

  // 冷却倒计时，每秒刷新提示语
  useEffect(() => {
    if (!locked) return
    const tick = () => {
      const remaining = contentRiskRemainingSeconds()
      if (remaining <= 0) {
        setLocked(false)
        setMessage('')
      } else {
        setMessage(contentRiskCooldownMessage(remaining))
      }
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [locked])

  return { locked, message }
}

/**
 * Toy 审核用「不上屏」文本：命中词表时返回最近一次安全的文本（绘制层用），
 * 未命中原样返回；非 toy 构建恒为原样返回。
 * 若首帧即为命中文本（如恢复历史），兜底返回空串 —— 危险文本绝不渲染。
 */
export function useSafeText(text: string): string {
  const lastSafe = useRef<string | null>(null)
  if (!contentRiskMatch(text).hit) {
    lastSafe.current = text
    return text
  }
  return lastSafe.current ?? ''
}
