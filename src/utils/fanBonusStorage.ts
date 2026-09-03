// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * 粉丝福利本地持久化 —— 只记「是否已自动弹过窗」，
 * 解锁状态每次实时查询，不落盘。
 */

const STORAGE_KEY = 'sekai-stickers-fan-bonus'

export interface FanBonusPersistedState {
  autoPrompted: boolean
}

export function loadFanBonusState(): FanBonusPersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { autoPrompted: false }
    const parsed = JSON.parse(raw) as Partial<FanBonusPersistedState>
    return { autoPrompted: parsed.autoPrompted === true }
  } catch {
    return { autoPrompted: false }
  }
}

export function saveFanBonusState(state: FanBonusPersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 存储不可用时忽略：最多导致下次再弹一次
  }
}
