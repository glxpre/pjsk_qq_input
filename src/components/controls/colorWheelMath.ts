// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 The 25-ji-code-de Team

/**
 * 色轮取色器的纯数学函数：HSV↔RGB 转换、色相环命中、SV 三角坐标映射。
 * 无 React / DOM 依赖，便于单独验证。
 */

export interface Hsv {
  /** 色相 0-360 */
  h: number
  /** 饱和度 0-1 */
  s: number
  /** 明度 0-1 */
  v: number
}

export interface Point {
  x: number
  y: number
}

/** HSV → RGB（h 0-360，s/v 0-1，返回 0-255 整数分量） */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** RGB → HSV（r/g/b 0-255） */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rr = r / 255
  const gg = g / 255
  const bb = b / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6)
    else if (max === gg) h = 60 * ((bb - rr) / d + 2)
    else h = 60 * ((rr - gg) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** 解析 #rgb / #rrggbb（不合法返回 null） */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

export function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex)
  if (!rgb) return { h: 0, s: 0, v: 0 }
  return rgbToHsv(rgb[0], rgb[1], rgb[2])
}

export interface HueRingGeometry {
  /** 圆心（画布坐标） */
  cx: number
  cy: number
  /** 环外半径 */
  outerR: number
  /** 环内半径 */
  innerR: number
}

/** 色相环命中检测：命中返回 { hit: true, hue }，未命中 hit 为 false */
export function hueRingHitTest(
  x: number,
  y: number,
  geo: HueRingGeometry,
): { hit: boolean; hue: number } {
  const dx = x - geo.cx
  const dy = y - geo.cy
  const dist = Math.hypot(dx, dy)
  if (dist < geo.innerR || dist > geo.outerR) return { hit: false, hue: 0 }
  // 0° 在正上方，顺时针增长（视觉上和钟面一致）
  let hue = (Math.atan2(dx, -dy) * 180) / Math.PI
  if (hue < 0) hue += 360
  return { hit: true, hue }
}

/** 色相环上某色相的指示点位置 */
export function hueRingPoint(hue: number, geo: HueRingGeometry): Point {
  const rad = (hue * Math.PI) / 180
  const midR = (geo.outerR + geo.innerR) / 2
  // 与 hitTest 相同的约定：0° 正上方，顺时针
  return {
    x: geo.cx + midR * Math.sin(rad),
    y: geo.cy - midR * Math.cos(rad),
  }
}

/**
 * SV 三角几何：顶点在上 = 白(S=0,V=1)，左下 = 黑(S=0,V=0)，右下 = 纯色(S=1,V=1)。
 * tri 传入三角外接信息：外接圆圆心与半径。
 */
export interface SvTriangleGeometry {
  cx: number
  cy: number
  /** 外接圆半径（三角顶点到圆心距离） */
  circumR: number
}

/** 三角三个顶点：白（上）、黑（左下）、纯色（右下） */
export function triangleVertices(geo: SvTriangleGeometry): [Point, Point, Point] {
  // 等边三角形：顶点在正上方，另外两个顶点在 ±120°
  const angles = [-90, 150, 30].map((a) => (a * Math.PI) / 180)
  return angles.map((a) => ({
    x: geo.cx + geo.circumR * Math.cos(a),
    y: geo.cy + geo.circumR * Math.sin(a),
  })) as [Point, Point, Point]
}

/** SV → 三角内像素坐标 */
export function svTrianglePoint(s: number, v: number, geo: SvTriangleGeometry): Point {
  const [white, black, pure] = triangleVertices(geo)
  // 重心坐标：P = w*white + b*black + p*pure，w+b+p=1
  // V 从黑(0)到白-纯色边(1)：w+p = v；S 沿白→纯色边从 0 到 1：p = s*v
  const p = s * v
  const w = v - p
  const b = 1 - w - p
  return {
    x: w * white.x + b * black.x + p * pure.x,
    y: w * white.y + b * black.y + p * pure.y,
  }
}

/** 三角内像素 → SV，越界点钳制到最近的三角形边上 */
export function pointToSvTriangle(x: number, y: number, geo: SvTriangleGeometry): { s: number; v: number } {
  const [white, black, pure] = triangleVertices(geo)
  // 解重心坐标：P = w*W + b*B + p*P0，w+b+p=1
  const den = (black.y - pure.y) * (white.x - pure.x) + (pure.x - black.x) * (white.y - pure.y)
  if (den === 0) return { s: 0, v: 0 }
  const w = ((black.y - pure.y) * (x - pure.x) + (pure.x - black.x) * (y - pure.y)) / den
  const b = ((pure.y - white.y) * (x - pure.x) + (white.x - pure.x) * (y - pure.y)) / den
  const p = 1 - w - b
  // 钳制到合法重心坐标（w,b,p ≥ 0）：先归一化，再把负分量归零重新归一化
  let cw = w
  let cb = b
  let cp = p
  const min = Math.min(cw, cb, cp)
  if (min < 0) {
    cw -= min
    cb -= min
    cp -= min
  }
  const sum = cw + cb + cp
  cw /= sum
  cb /= sum
  cp /= sum
  // 逆映射：v = w + p，s = p / v（v=0 时 s 任意，取 0）
  const v = cw + cp
  const s = v === 0 ? 0 : cp / v
  return { s, v }
}
