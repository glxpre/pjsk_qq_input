// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

import { useCallback, useRef, useState } from 'react'
import {
  FanBonusFeature,
  FanBonusTier,
  FAN_BONUS_TIERS,
  FAN_BONUS_VIDEO_BVID,
  tierOfFeature,
} from '../config/fanBonus'
import { isToyBuild } from '../utils/toy'
import {
  loadFanBonusState,
  saveFanBonusState,
} from '../utils/fanBonusStorage'

export type FanBonusQueryStatus = 'idle' | 'checking' | 'done'

export interface FanBonusVideoInfo {
  title: string
  cover: string
}

/** SDK 查询超时（毫秒）；超时按查询失败处理 = 全解锁 */
const QUERY_TIMEOUT_MS = 5000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function getToy(): ToySDK.Toy | null {
  if (!isToyBuild()) return null
  const toy = (window as Window & { toy?: ToySDK.Toy }).toy
  return toy ?? null
}

/**
 * 粉丝福利解锁状态。fail-open 原则：
 * 只有在「toy 构建 + SDK 可用 + 查询 status === 'ok'」且明确知道
 * 用户未完成对应动作时才返回锁定；其余一律视为解锁。
 */
export function useFanBonus() {
  const [relationFollowed, setRelationFollowed] = useState<boolean | null>(null)
  const [videoLiked, setVideoLiked] = useState<boolean | null>(null)
  const [queryStatus, setQueryStatus] = useState<FanBonusQueryStatus>('idle')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [videoInfo, setVideoInfo] = useState<FanBonusVideoInfo | null>(null)
  const [hintOpen, setHintOpen] = useState(false)
  const [hintTier, setHintTier] = useState<FanBonusTier | null>(null)
  // 会话内轻提示去重：同档位只提示一次
  const hintedTiers = useRef<Set<FanBonusTier>>(new Set())

  const query = useCallback(async (): Promise<void> => {
    // Dev-only：?fanbonus=locked 预览锁定 UI（无 SDK 也能看交互）
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('fanbonus') === 'locked') {
      setQueryStatus('done')
      setRelationFollowed(false)
      setVideoLiked(false)
      return
    }

    const toy = getToy()
    if (!toy) return

    setQueryStatus('checking')
    try {
      const [relation, actions] = await Promise.all([
        withTimeout(toy.getAuthorRelation(), QUERY_TIMEOUT_MS).catch(() => null),
        withTimeout(
          toy.getVideoUserActions({ videos: [{ bvid: FAN_BONUS_VIDEO_BVID }] }),
          QUERY_TIMEOUT_MS,
        ).catch(() => null),
      ])

      setRelationFollowed(
        relation && relation.status === 'ok' && relation.data
          ? relation.data.isFollowing
          : null,
      )
      const item = actions && actions.status !== 'unavailable' ? actions.items[0] : undefined
      setVideoLiked(item && item.status === 'ok' ? item.liked === true : null)
    } finally {
      setQueryStatus('done')
    }
  }, [])

  const fetchVideoInfo = useCallback(async (): Promise<void> => {
    const toy = getToy()
    if (!toy) return
    try {
      const resp = await withTimeout(
        toy.getAuthorVideos({ videos: [{ bvid: FAN_BONUS_VIDEO_BVID }] }),
        QUERY_TIMEOUT_MS,
      )
      const data = resp.items[0]?.status === 'ok' ? resp.items[0]?.data : undefined
      if (data) setVideoInfo({ title: data.title, cover: data.cover })
    } catch {
      // 拿不到封面就只展示 BV 号，不影响流程
    }
  }, [])

  const isFeatureLocked = useCallback(
    (feature: FanBonusFeature): boolean => {
      if (relationFollowed === null && videoLiked === null) return false
      const tier = tierOfFeature(feature)
      if (tier === 'like') return videoLiked === false
      return relationFollowed === false
    },
    [relationFollowed, videoLiked],
  )

  const anyLocked =
    relationFollowed === false || videoLiked === false

  const openDialog = useCallback((): void => {
    setDialogOpen(true)
    void fetchVideoInfo()
  }, [fetchVideoInfo])

  const closeDialog = useCallback((): void => {
    setDialogOpen(false)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    await query()
  }, [query])

  /**
   * 导出成功后调用：首次查询解锁状态；
   * 若确实存在锁定项且未自动弹过窗，弹一次粉丝福利弹窗。
   */
  const checkAfterFirstExport = useCallback(async (): Promise<void> => {
    if (queryStatus !== 'idle') return
    await query()
    const persisted = loadFanBonusState()
    if (!persisted.autoPrompted && anyLocked) {
      saveFanBonusState({ autoPrompted: true })
      openDialog()
    }
  }, [queryStatus, query, anyLocked, openDialog])

  const hintLockedFeature = useCallback((feature: FanBonusFeature): void => {
    const tier = tierOfFeature(feature)
    if (hintedTiers.current.has(tier)) return
    hintedTiers.current.add(tier)
    setHintTier(tier)
    setHintOpen(true)
  }, [])

  const dismissHint = useCallback((): void => {
    setHintOpen(false)
  }, [])

  return {
    isFeatureLocked,
    anyLocked,
    checkAfterFirstExport,
    relationFollowed,
    videoLiked,
    queryStatus,
    dialogOpen,
    openDialog,
    closeDialog,
    refresh,
    hintLockedFeature,
    hintOpen,
    hintTier,
    hintMessage: hintTier ? FAN_BONUS_TIERS[hintTier].hint : '',
    dismissHint,
    videoInfo,
  }
}
