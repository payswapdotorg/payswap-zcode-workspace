/**
 * Ported from the original ZCode browser (packages/shared/src/browser-use/command-metadata.ts
 * + packages/ui/src/browser-use/browserViewportZoom.ts), Apache-2.0.
 *
 * Free-size viewport limits, zoom options and Fit scale resolution are kept
 * byte-compatible with the original so the PaySwap browser behaves identically.
 */

export const BROWSER_VIEWPORT_LIMITS = {
  minWidth: 320,
  maxWidth: 3840,
  minHeight: 320,
  maxHeight: 2160,
} as const;

export const BROWSER_VIEWPORT_ZOOM_OPTIONS = [
  'fit',
  '50',
  '75',
  '100',
  '125',
  '150',
  '200',
] as const;

export type BrowserViewportZoom = (typeof BROWSER_VIEWPORT_ZOOM_OPTIONS)[number];

export const DEFAULT_BROWSER_VIEWPORT_ZOOM: BrowserViewportZoom = 'fit';

export interface BrowserViewportSize {
  width: number
  height: number
}

/** Fixed logical viewport the original uses for agent-created pages. */
export const DEFAULT_AGENT_BROWSER_VIEWPORT: BrowserViewportSize = {
  width: 1280,
  height: 720,
}

/** Fit canvas padding, kept identical to the original ResponsiveBrowserViewport `p-4`. */
export const RESPONSIVE_BROWSER_CANVAS_PADDING_PX = 16;

export function resolveBrowserViewportScale({
  canvasSize,
  desktopZoomFactor = 1,
  viewportSize,
  zoom,
}: {
  canvasSize: BrowserViewportSize | null
  desktopZoomFactor?: number
  viewportSize: BrowserViewportSize
  zoom: BrowserViewportZoom
}): number {
  if (zoom !== 'fit') {
    return Number(zoom) / 100
  }
  if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) {
    return 1
  }

  const safeDesktopZoomFactor =
    Number.isFinite(desktopZoomFactor) && desktopZoomFactor > 0 ? desktopZoomFactor : 1
  const availableWidth =
    Math.max(0, canvasSize.width - RESPONSIVE_BROWSER_CANVAS_PADDING_PX * 2) *
    safeDesktopZoomFactor
  const availableHeight =
    Math.max(0, canvasSize.height - RESPONSIVE_BROWSER_CANVAS_PADDING_PX * 2) *
    safeDesktopZoomFactor;
  if (availableWidth === 0 || availableHeight === 0) {
    return 1
  }

  return Math.min(1, availableWidth / viewportSize.width, availableHeight / viewportSize.height)
}
