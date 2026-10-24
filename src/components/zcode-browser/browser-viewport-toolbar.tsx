'use client'

/**
 * Faithful web port of the original ZCode free-size viewport toolbar
 * (packages/ui/src/browser-use/BrowserViewportToolbar.tsx, Apache-2.0).
 *
 * Width/height inputs commit on Enter/blur, validate against BROWSER_VIEWPORT_LIMITS,
 * show the shared range error, and the zoom select offers Fit + the original zoom steps.
 */

import { useState, type KeyboardEvent } from 'react'
import {
  BROWSER_VIEWPORT_LIMITS,
  BROWSER_VIEWPORT_ZOOM_OPTIONS,
  type BrowserViewportSize,
  type BrowserViewportZoom,
} from '@/lib/zcode/browser/browser-viewport'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ViewportDimension = 'height' | 'width'

function isValidViewportDimension(dimension: ViewportDimension, value: number): boolean {
  if (!Number.isInteger(value)) return false
  if (dimension === 'width') {
    return value >= BROWSER_VIEWPORT_LIMITS.minWidth && value <= BROWSER_VIEWPORT_LIMITS.maxWidth
  }
  return value >= BROWSER_VIEWPORT_LIMITS.minHeight && value <= BROWSER_VIEWPORT_LIMITS.maxHeight
}

function getViewportDimensionLimits(dimension: ViewportDimension): { max: number; min: number } {
  return dimension === 'width'
    ? { max: BROWSER_VIEWPORT_LIMITS.maxWidth, min: BROWSER_VIEWPORT_LIMITS.minWidth }
    : { max: BROWSER_VIEWPORT_LIMITS.maxHeight, min: BROWSER_VIEWPORT_LIMITS.minHeight }
}

export function BrowserViewportToolbar({
  onViewportSizeChange,
  onZoomChange,
  viewportSize,
  zoom,
}: {
  /** Kept for parity with the original signature (gates tooltips there). */
  isVisible?: boolean
  onViewportSizeChange: (viewportSize: BrowserViewportSize) => void
  onZoomChange: (zoom: BrowserViewportZoom) => void
  viewportSize: BrowserViewportSize
  zoom: BrowserViewportZoom
}) {
  const [widthDraft, setWidthDraft] = useState(String(viewportSize.width))
  const [heightDraft, setHeightDraft] = useState(String(viewportSize.height))
  const [invalidDrafts, setInvalidDrafts] = useState<Record<ViewportDimension, boolean>>({
    height: false,
    width: false,
  })

  const setDraftInvalid = (dimension: ViewportDimension, invalid: boolean) => {
    setInvalidDrafts((previous) =>
      previous[dimension] === invalid ? previous : { ...previous, [dimension]: invalid },
    )
  }

  const resetDraft = (dimension: ViewportDimension) => {
    setDraftInvalid(dimension, false)
    if (dimension === 'width') {
      setWidthDraft(String(viewportSize.width))
      return
    }
    setHeightDraft(String(viewportSize.height))
  }

  const commitDraft = (dimension: ViewportDimension) => {
    const draft = dimension === 'width' ? widthDraft : heightDraft
    const value = Number(draft.trim())
    if (!isValidViewportDimension(dimension, value)) {
      setDraftInvalid(dimension, true)
      return
    }
    setDraftInvalid(dimension, false)
    if (viewportSize[dimension] === value) {
      resetDraft(dimension)
      return
    }
    onViewportSizeChange({ ...viewportSize, [dimension]: value })
  }

  const handleDraftChange = (dimension: ViewportDimension, value: string) => {
    if (dimension === 'width') {
      setWidthDraft(value)
    } else {
      setHeightDraft(value)
    }
    if (invalidDrafts[dimension]) {
      setDraftInvalid(dimension, !isValidViewportDimension(dimension, Number(value.trim())))
    }
  }

  const getRangeError = (dimension: ViewportDimension) => {
    const limits = getViewportDimensionLimits(dimension)
    return `Enter an integer between ${limits.min} and ${limits.max}`
  }

  const handleDimensionKeyDown = (
    dimension: ViewportDimension,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft(dimension)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      resetDraft(dimension)
      event.currentTarget.blur()
    }
  }

  const dimensionInputClass =
    'h-7 w-14 shrink-0 rounded-md border border-transparent bg-transparent px-1 text-center font-sans text-[13px] font-medium tabular-nums hover:border-transparent hover:bg-[#f6f9fa] focus-visible:border-[#bfe5d8] focus-visible:bg-white aria-invalid:hover:border-red-400 aria-invalid:focus-visible:border-red-400'

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-center gap-1 overflow-x-auto border-b border-[#dce5e9] bg-white px-2"
      data-testid="browser-responsive-toolbar"
    >
      <input
        type="text"
        aria-invalid={invalidDrafts.width || undefined}
        aria-label="Browser viewport width"
        className={dimensionInputClass}
        data-testid="browser-responsive-width-input"
        inputMode="numeric"
        max={BROWSER_VIEWPORT_LIMITS.maxWidth}
        min={BROWSER_VIEWPORT_LIMITS.minWidth}
        onBlur={() => commitDraft('width')}
        onChange={(event) => handleDraftChange('width', event.target.value)}
        onKeyDown={(event) => handleDimensionKeyDown('width', event)}
        spellCheck={false}
        value={widthDraft}
      />
      {invalidDrafts.width ? (
        <span className="sr-only" role="alert">
          {getRangeError('width')}
        </span>
      ) : null}
      <span aria-hidden="true" className="shrink-0 text-[13px] text-[#5a7189]">
        ×
      </span>
      <input
        type="text"
        aria-invalid={invalidDrafts.height || undefined}
        aria-label="Browser viewport height"
        className={dimensionInputClass}
        data-testid="browser-responsive-height-input"
        inputMode="numeric"
        max={BROWSER_VIEWPORT_LIMITS.maxHeight}
        min={BROWSER_VIEWPORT_LIMITS.minHeight}
        onBlur={() => commitDraft('height')}
        onChange={(event) => handleDraftChange('height', event.target.value)}
        onKeyDown={(event) => handleDimensionKeyDown('height', event)}
        spellCheck={false}
        value={heightDraft}
      />
      {invalidDrafts.height ? (
        <span className="sr-only" role="alert">
          {getRangeError('height')}
        </span>
      ) : null}
      <Select value={zoom} onValueChange={(value) => onZoomChange(value as BrowserViewportZoom)}>
        <SelectTrigger
          aria-label="Browser preview zoom"
          className="min-w-24 h-7 shrink-0 rounded-md border-transparent bg-transparent font-medium tabular-nums text-[12.5px] text-[#102642] hover:bg-[#f6f9fa]"
          data-testid="browser-responsive-zoom-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {BROWSER_VIEWPORT_ZOOM_OPTIONS.map((option) => (
            <SelectItem
              data-testid={`browser-responsive-zoom-option-${option}`}
              key={option}
              value={option}
            >
              {option === 'fit' ? 'Fit to window' : `${option}%`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
