// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** SEKAI Pass issuer，用于 OIDC discovery（见 .env.example） */
  readonly VITE_OAUTH_ISSUER: string
  readonly VITE_OAUTH_CLIENT_ID: string
  readonly VITE_OAUTH_REDIRECT_URI: string
  readonly VITE_OAUTH_SCOPE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * 内容风险词表的类型声明（实际由 vite resolve.alias 按构建模式解析：
 * toy → src/utils/contentRiskLexicon.ts（不入库），非 toy → contentRiskLexiconStub.ts）。
 * 在这里声明类型，使 TS 不依赖那个不入库的文件也能通过类型检查。
 */
declare module 'content-risk-lexicon' {
  export interface ContentRiskMatchResult {
    hit: boolean
    type: 'exact' | 'combo' | 'soft' | 'none'
    term: string
  }
  export const contentRiskLexicon:
    | { version: string; cooldownSeconds: number }
    | undefined
  export function matchContentRisk(text: string): ContentRiskMatchResult
}
