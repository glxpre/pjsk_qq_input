// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * 粉丝福利（fan bonus）解锁配置 —— 仅 toy 构建生效。
 * 点赞/关注状态通过 Toy SDK 实时查询；任何查询失败都会静默放行（fail-open）。
 */

/** 解锁目标视频 BV 号（点赞解锁） */
export const FAN_BONUS_VIDEO_BVID = 'BV1vZPszsEpw'
/** 作者 mid（关注跳转用） */
export const FAN_BONUS_AUTHOR_MID = '3546904856103196'

/** 受粉丝福利管控的单项功能 */
export type FanBonusFeature =
  | 'exportScale'
  | 'fontSize'
  | 'position'
  | 'rotate'
  | 'spaceSize'
  | 'letterSpacing'
  | 'strokeWidth'
  | 'strokeColor'
  | 'curve'
  | 'vertical'
  | 'textBehind'

/** 解锁档位：点赞视频 / 关注 UP 主 */
export type FanBonusTier = 'like' | 'follow'

export interface FanBonusTierConfig {
  label: string
  description: string
  hint: string
  features: FanBonusFeature[]
}

export const FAN_BONUS_TIERS: Record<FanBonusTier, FanBonusTierConfig> = {
  like: {
    label: '给视频点赞',
    description: '点赞解锁高分辨率导出与位置调整',
    hint: '点赞视频解锁高分辨率与位置调整 ✨',
    features: ['exportScale', 'fontSize', 'position'],
  },
  follow: {
    label: '关注 UP 主',
    description: '关注解锁全部文字调节项',
    hint: '关注 UP 主解锁全部文字调节 ✨',
    features: [
      'rotate',
      'spaceSize',
      'letterSpacing',
      'strokeWidth',
      'strokeColor',
      'curve',
      'vertical',
      'textBehind',
    ],
  },
}

/** 各功能在 UI 上展示的中文名（弹窗里列出解锁内容用） */
export const FAN_BONUS_FEATURE_LABELS: Record<FanBonusFeature, string> = {
  exportScale: '高分辨率导出（2×/3×）',
  fontSize: '字号调整',
  position: '位置调整',
  rotate: '旋转角度',
  spaceSize: '行间距',
  letterSpacing: '字间距',
  strokeWidth: '描边宽度',
  strokeColor: '描边颜色',
  curve: '弧形文字',
  vertical: '竖排文字',
  textBehind: '文字置于底层',
}

export function tierOfFeature(feature: FanBonusFeature): FanBonusTier {
  return FAN_BONUS_TIERS.like.features.includes(feature) ? 'like' : 'follow'
}
