// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Where the shared sticker data lives at runtime.
 *
 * Inside Electron the main process serves the assets through a private `app://`
 * scheme (see `desktop/main/main.ts`), because Chromium refuses `fetch()` on
 * `file://` URLs — which is exactly how `characters.json` is loaded. In a plain
 * browser (used for UI review without Electron) the same relative paths resolve
 * against the dev server instead.
 *
 * The choice is data-driven rather than build-time: `window.sekaiDesktop` is
 * installed by the preload script, so its presence is the reliable "am I inside
 * the companion app?" signal, and one bundle works in both places.
 */

/** True when running inside Electron with the preload bridge attached. */
export const HAS_BRIDGE =
  typeof window !== 'undefined' && !!(window as { sekaiDesktop?: unknown }).sekaiDesktop

/** Base URL every sticker asset is resolved against. */
export const ASSET_BASE = HAS_BRIDGE ? 'app://assets/' : `${import.meta.env.BASE_URL}assets/`
