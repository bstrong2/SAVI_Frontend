import { describe, it, expect } from 'vitest'
import { chartHexToRgba, CHART_PALETTE, MAX_CHART_POINTS } from './chart.js'

describe('chartHexToRgba', () => {
  // Test that a hex color and alpha value convert to the equivalent rgba() string.
  it('converts a hex color plus alpha to an rgba() string', () => {
    expect(chartHexToRgba('#007ACC', 0.5)).toBe('rgba(0, 122, 204, 0.5)')
  })

  // Test the boundary hex values (#000000, #ffffff) alongside boundary alpha values (0, 1).
  it('handles pure black and white', () => {
    expect(chartHexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
    expect(chartHexToRgba('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)')
  })
})

describe('chart constants', () => {
  // Test that the chart palette is non-empty and every entry is a valid 6-digit hex color.
  it('exposes a non-empty palette of hex colors', () => {
    expect(CHART_PALETTE.length).toBeGreaterThan(0)
    for (const color of CHART_PALETTE)
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  // Test that the max chart points constant is set to a positive value.
  it('caps the number of chart points to a positive limit', () => {
    expect(MAX_CHART_POINTS).toBeGreaterThan(0)
  })
})
