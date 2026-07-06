import { COLORS } from './colors.js'

export const CHART_PALETTE = Object.freeze([
  COLORS.blue, COLORS.deepOrange, COLORS.darkGreen, COLORS.purple,
  COLORS.cyan, COLORS.darkOrange, COLORS.maroon, COLORS.olive,
])

export const MAX_CHART_POINTS = 120

export function chartHexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
