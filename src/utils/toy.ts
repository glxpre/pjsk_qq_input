// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Bilibili Toy helpers for the `--mode toy` upload package.
 * Official SDK 1.6.0 is loaded as `window.toy` from toy-sdk.js.
 */

type ToyApi = {
  isSupport?: (ability: string) => Promise<boolean>
  saveImageToAlbum?: (req: {
    base64Data?: string
    hintMsg?: string
  }) => Promise<unknown>
}

/** Official hard cap is the base64 string length (5MB). */
const TOY_IMAGE_BASE64_MAX = 4_500_000

/**
 * Toy 平台不允许 UGC（用户生成内容）展示与分享，
 * 画廊的查看与提交入口在 Toy 构建中整体停用。
 */
export const TOY_GALLERY_BLOCKED_REASON = 'B站禁止UGC，画廊功能在 Toy 版中不可用'

export function isToyBuild(): boolean {
  return import.meta.env.MODE === 'toy'
}

export async function saveToyImageToAlbum(
  dataUrl: string,
  hintMsg = '贴纸已保存到相册',
): Promise<boolean> {
  if (!isToyBuild()) return false
  const toy = (window as Window & { toy?: ToyApi }).toy
  if (!toy?.saveImageToAlbum) return false
  if (dataUrl.length > TOY_IMAGE_BASE64_MAX) return false
  try {
    if (toy.isSupport && !(await toy.isSupport('saveImageToAlbum'))) {
      return false
    }
    await toy.saveImageToAlbum({ base64Data: dataUrl, hintMsg })
    return true
  } catch {
    return false
  }
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}
