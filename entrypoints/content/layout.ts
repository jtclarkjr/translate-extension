import { PANEL_MIN_VISIBLE_HEIGHT, PANEL_WIDTH } from './constants'
import type { PanelPosition, SelectionState } from './types'

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

export function getInitialPanelPosition(rect: DOMRect): PanelPosition {
  return clampPanelPosition({
    left: clamp(rect.left, 8, window.innerWidth - PANEL_WIDTH - 8),
    top: getPanelTop(rect)
  })
}

export function clampPanelPosition(position: PanelPosition): PanelPosition {
  return {
    left: clamp(position.left, 8, Math.max(8, window.innerWidth - PANEL_WIDTH - 8)),
    top: clamp(position.top, 8, Math.max(8, window.innerHeight - PANEL_MIN_VISIBLE_HEIGHT))
  }
}

export function getFallbackRect() {
  return new DOMRect(Math.max(8, window.innerWidth / 2 - 190), 80, 380, 1)
}

export function getSelectionState(maxSelectionChars: number): SelectionState | undefined {
  const selection = window.getSelection()
  const text = selection?.toString().replace(/\s+/g, ' ').trim() || ''

  if (!selection || selection.rangeCount === 0 || text.length < 2) {
    return undefined
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect()

  if (rect.width === 0 && rect.height === 0) {
    return undefined
  }

  return {
    text: text.slice(0, maxSelectionChars),
    rect
  }
}

function getPanelTop(rect: DOMRect) {
  const below = rect.bottom + 10
  const above = rect.top - 330

  return clamp(below > window.innerHeight - 330 ? above : below, 8, window.innerHeight - 120)
}
