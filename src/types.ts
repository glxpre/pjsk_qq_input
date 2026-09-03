// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * Common type definitions for the application
 */

export interface Position {
  x: number
  y: number
}

export interface Character {
  img: string
  name: string
  color: string
  defaultText: {
    x: number
    y: number
    r: number
    s: number
    text?: string
  }
}

export type FontKey = 'yuruka' | 'fangtang' | 'system'

export interface TextSettings {
  text: string
  setText: (text: string) => void
  fontSize: number
  setFontSize: (size: number) => void
  fontKey: FontKey
  setFontKey: (key: FontKey) => void
  rotate: number
  setRotate: (rotate: number) => void
  spaceSize: number
  setSpaceSize: (size: number) => void
  letterSpacing: number
  setLetterSpacing: (spacing: number) => void
  curve: boolean
  setCurve: (curve: boolean) => void
  vertical: boolean
  setVertical: (vertical: boolean) => void
  textBehind: boolean
  setTextBehind: (behind: boolean) => void
  resetTextSettings: (character: number) => void
}

export interface StrokeSettings {
  strokeWidth: number
  setStrokeWidth: (width: number) => void
  strokeColor: string
  setStrokeColor: (color: string) => void
  resetStroke: () => void
}

export interface PositionHook {
  position: Position
  setPosition: (position: Position) => void
  moveX: (delta: number) => void
  moveY: (delta: number) => void
}

export interface ColorScheme {
  dominantColor: string
  backgroundColor: string
  textColor: string
  setTextColor: (color: string) => void
  updateColorsFromImage: (imgObj: HTMLImageElement) => void
}

export interface UIState {
  infoOpen: boolean
  setInfoOpen: (open: boolean) => void
  uploadOpen: boolean
  setUploadOpen: (open: boolean) => void
  copyPopupOpen: boolean
  setCopyPopupOpen: (open: boolean) => void
  showCopySuccess: () => void
  downloadPopupOpen: boolean
  setDownloadPopupOpen: (open: boolean) => void
  showDownloadSuccess: () => void
  historyOpen: boolean
  setHistoryOpen: (open: boolean) => void
  resetConfirmOpen: boolean
  setResetConfirmOpen: (open: boolean) => void
  shortcutsHelpOpen: boolean
  setShortcutsHelpOpen: (open: boolean) => void
  galleryOpen: boolean
  setGalleryOpen: (open: boolean) => void
}

export interface CharacterHook {
  character: number
  setCharacter: (character: number) => void
  customImage: string | null
  imgObj: HTMLImageElement | null
  loaded: boolean
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  clearUpload: () => void
}

export interface ExportHooks {
  download: () => Promise<void>
  downloadWebp: () => Promise<void>
  downloadJpg: () => Promise<void>
  copy: () => Promise<void>
  copyWithBg: () => Promise<void>
}

export type StickerMode = 'solo' | 'duo'

/** 双人模式排列方向 */
export type DuoLayout = 'horizontal' | 'vertical'

/** 双人模式文字形式：合并（一条双色）/ 拆开（两段分别定位） */
export type DuoTextMode = 'merged' | 'split'

/** 双人模式单侧底图：角色来源 + 变换 */
export interface DuoImageSide {
  character: number
  customImage: string | null
  /** 0.5–1.5，默认 1 */
  scale: number
  /** -180–180 度，默认 0 */
  rotate: number
  /** 相对 slot 中心的偏移（逻辑像素），默认 0 */
  offsetX: number
  offsetY: number
}

/** 双人模式完整配置快照（用于撤销/重做与历史记录） */
export interface DuoConfig {
  layout: DuoLayout
  images: [DuoImageSide, DuoImageSide]
  textMode: DuoTextMode
  text: string
  /** split 模式专用的两段文字（merged 模式不用） */
  textA: string
  textB: string
  /** -1 = 自动（floor(总字数/2)），0..N 手动；同时决定双色边界与拆分边界 */
  splitIndex: number
  colorA: string
  colorB: string
  /** merged 模式文字锚点 */
  textPosition: Position
  /** 与单人 rotate 同一约定（绘制时 /10） */
  textRotate: number
  /** split 模式：前半段 / 后半段各自的位置 */
  textPositionA: Position
  textPositionB: Position
  // 共享样式
  fontSize: number
  fontKey: FontKey
  letterSpacing: number
  /** 多行行距 */
  spaceSize: number
  strokeWidth: number
  strokeColor: string
  textBehind: boolean
  curve: boolean
  vertical: boolean
  /** 图层顺序：哪张底图在上层（默认 0 = A 在上；旧快照缺省视为 0） */
  topSide?: 0 | 1
}

/**
 * Configuration snapshot for history
 */
export interface StickerConfig {
  /** 旧记录无此字段，视为 'solo' */
  mode?: StickerMode
  character: number
  customImage: string | null
  text: string
  fontSize: number
  fontKey: FontKey
  position: Position
  rotate: number
  spaceSize: number
  letterSpacing: number
  strokeWidth: number
  strokeColor: string
  textColor: string
  curve: boolean
  vertical: boolean
  textBehind: boolean
  /** mode === 'duo' 时的双人配置 */
  duo?: DuoConfig
}

/**
 * History item stored in localStorage
 */
export interface HistoryItem {
  id: string
  timestamp: number
  thumbnail: string // base64 image data URL
  config: StickerConfig
  uploadedUrl?: string
}

/**
 * Hook for managing history
 */
export interface HistoryHook {
  historyItems: HistoryItem[]
  addHistory: (config: StickerConfig, canvas: HTMLCanvasElement, uploadedUrl?: string) => void
  loadHistory: (id: string) => StickerConfig | null
  deleteHistory: (id: string) => void
  clearHistory: () => void
}

/**
 * Keyboard shortcut item
 */
export interface ShortcutItem {
  keys: string[]
  description: string
}

/**
 * Keyboard shortcut category
 */
export interface ShortcutCategory {
  name: string
  shortcuts: ShortcutItem[]
}

/**
 * Configuration for keyboard shortcuts hook
 */
export interface KeyboardShortcutsConfig {
  // Export operations
  handleCopy: () => void
  handleCopyWithBg: () => void
  handleDownload: () => void
  handleDownloadJpg: () => void
  handleDownloadWebp: () => void

  // Undo/redo
  handleUndo: () => void
  handleRedo: () => void

  // Position
  position: PositionHook

  // Style
  fontSize: number
  setFontSize: (size: number) => void
  letterSpacing: number
  setLetterSpacing: (spacing: number) => void
  spaceSize: number
  setSpaceSize: (size: number) => void
  rotate: number
  setRotate: (rotate: number) => void

  // Toggles
  curve: boolean
  setCurve: (curve: boolean) => void
  vertical: boolean
  setVertical: (vertical: boolean) => void
  textBehind: boolean
  setTextBehind: (behind: boolean) => void

  // UI state
  uiState: UIState
}

/**
 * Return type for keyboard shortcuts hook
 */
export interface UseKeyboardShortcutsReturn {
  isInputFocused: boolean
  shortcutsEnabled: boolean
}

/**
 * History sorting type
 */
export type HistorySortType = 'newest' | 'oldest' | 'uploaded-first'

/**
 * Time range filter for history
 */
export type TimeRangeFilter = 'all' | 'today' | 'week' | 'month' | 'earlier'

/**
 * Upload status filter for history
 */
export type UploadStatusFilter = 'all' | 'uploaded' | 'not-uploaded'

/**
 * Complete filter state for history
 */
export interface HistoryFilters {
  searchText: string
  sortType: HistorySortType
  uploadStatus: UploadStatusFilter
  timeRange: TimeRangeFilter
}

/**
 * Gallery item from manifest
 */
export interface GalleryItem {
  id: string
  url: string
  title: string
  author?: string
  characterId?: number
  tags: string[]
  uploadDate: string
  description?: string
  featured?: boolean
}

/**
 * Gallery manifest structure
 */
export interface GalleryManifest {
  version: string
  lastUpdated: string
  items: GalleryItem[]
}

/**
 * Gallery sorting type
 */
export type GallerySortType = 'newest' | 'oldest' | 'featured-first'

/**
 * Complete filter state for gallery
 */
export interface GalleryFilters {
  searchText: string
  sortType: GallerySortType
  character: string | 'all' // Character base name (without number suffix)
  timeRange: TimeRangeFilter
  selectedTags: string[]
}

/**
 * SEKAI Pass user information
 */
export interface AuthUser {
  id: string
  username: string
  email: string | null
  avatar: string | null
}

/**
 * OAuth token response
 */
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

/**
 * OIDC user info response
 */
export interface OIDCUserInfo {
  sub: string
  name?: string
  preferred_username?: string
  email?: string
  email_verified?: boolean
  picture?: string
}

/**
 * OIDC configuration from .well-known/openid-configuration
 */
export interface OIDCConfig {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  response_types_supported: string[]
  subject_types_supported: string[]
  id_token_signing_alg_values_supported: string[]
  scopes_supported: string[]
  token_endpoint_auth_methods_supported: string[]
  code_challenge_methods_supported: string[]
}

/**
 * Stored auth state in localStorage
 */
export interface AuthState {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresAt: number
  user: AuthUser
}

/**
 * Hook for managing authentication
 */
export interface AuthHook {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}
