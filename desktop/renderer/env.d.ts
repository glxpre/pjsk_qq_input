// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Renderer ambient types.
 *
 * The desktop renderer is built by Vite, so `import.meta.env` is available; only
 * the two fields it actually reads are declared, keeping this file independent of
 * the web app's `src/vite-env.d.ts` (which pulls in PWA and auth env keys the
 * desktop build does not have).
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Vite `base`; `./` for the desktop bundle so assets resolve from `file://`. */
  readonly BASE_URL: string
  readonly MODE: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
