'use client'

/**
 * Faithful web port of the original ZCode browser chrome
 * (packages/ui/src/EmbeddedBrowserPaneParts.tsx, Apache-2.0).
 *
 * Layout, icons, test ids and strings match the original BrowserToolbar,
 * BrowserEmptyState and BrowserLoadErrorState. PaySwap additions are limited to:
 *  - the mint "Sandbox" badge rendered through the original `permissionControl` slot,
 *  - optional expand/restore + close controls at the end of the toolbar (dockable shell),
 *  - the DevTools item is disabled when no devtools host is available (web sandbox).
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import {
  Bug,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Globe,
  LoaderIcon,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  MousePointerClick,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import type { BrowserGuestFailure, BrowserState } from '@/lib/zcode/browser/embeddedBrowserHelpers'
import { isDefaultBrowserOpenableUrl } from '@/lib/zcode/browser/embeddedBrowserHelpers'
import { cn } from '@/lib/utils'
import { C } from '@/components/paydesk/bits'

/* Original en-US strings (packages/ui/src/i18n/locales/en-US.ts) */
export const browserStrings = {
  title: 'Browser',
  addressPlaceholder: 'Enter a URL and press Enter',
  back: 'Back',
  forward: 'Forward',
  reload: 'Refresh',
  more: 'More browser actions',
  openExternal: 'Open in default browser',
  devtools: 'Open DevTools',
  responsiveEnter: 'Free-size viewport',
  responsiveExit: 'Exit free-size viewport',
  elementPickerStart: 'Select page element for chat',
  elementPickerCancel: 'Cancel element selection',
  empty: 'Paste or type a URL to open a page.',
  loadErrorTitle: 'This page could not be opened',
  loadErrorRetry: 'Reload',
  invalidUrl: 'Only http, https, file, about, and data URLs are supported',
} as const

export function BrowserToolbar({
  addressValue,
  browserState,
  permissionControl,
  onAddressChange,
  onAddressBlur,
  onGoBack,
  onGoForward,
  onOpenExternal,
  onReload,
  onToggleResponsiveMode,
  pickerActive = false,
  pickerDisabled = true,
  onTogglePicker,
  onSubmit,
  isResponsiveMode,
  /* PaySwap dockable-shell controls */
  solo = false,
  onToggleSolo,
  onClose,
}: {
  addressValue: string
  browserState: BrowserState
  /** Slot left of the address input (original site-settings entry; PaySwap: Sandbox badge). */
  permissionControl?: ReactNode
  onAddressChange: (value: string) => void
  /** Reset the draft so the bar shows the live URL again (original did-navigate behavior). */
  onAddressBlur?: () => void
  onGoBack: () => void
  onGoForward: () => void
  onOpenExternal: () => void
  onReload: () => void
  onToggleResponsiveMode: () => void
  /** Element picker (original CDP-driven control) — enabled once the guest is live. */
  pickerActive?: boolean
  pickerDisabled?: boolean
  onTogglePicker?: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  isResponsiveMode: boolean
  solo?: boolean
  onToggleSolo?: () => void
  onClose?: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-12 shrink-0 items-center gap-2 border-b border-[#dce5e9] px-3"
      data-testid="browser-toolbar"
    >
      <BrowserIconButton
        icon={<ChevronLeft className="h-4 w-4" />}
        title={browserStrings.back}
        disabled={!browserState.canGoBack}
        dataTestId="browser-back-button"
        onClick={onGoBack}
      />
      <BrowserIconButton
        icon={<ChevronRight className="h-4 w-4" />}
        title={browserStrings.forward}
        disabled={!browserState.canGoForward}
        dataTestId="browser-forward-button"
        onClick={onGoForward}
      />
      <BrowserIconButton
        icon={
          <RefreshCw className={cn('h-4 w-4', browserState.isLoading && 'animate-spin')} />
        }
        title={browserStrings.reload}
        disabled={!browserState.isReady}
        dataTestId="browser-refresh-button"
        onClick={onReload}
      />
      <div className="group/browser-address relative min-w-0 flex-1" data-testid="browser-address-bar">
        <Input
          type="text"
          value={addressValue}
          data-testid="browser-address-input"
          className="h-8 rounded-full px-14 text-center text-[13px] focus:px-3 focus:text-left"
          onChange={(event) => onAddressChange(event.target.value)}
          onBlur={onAddressBlur}
          placeholder={browserStrings.addressPlaceholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={browserStrings.addressPlaceholder}
        />
        {/* Original: hide the slot while editing the URL, keep it mounted. */}
        <div className="pointer-events-none absolute top-1/2 left-1.5 flex -translate-y-1/2 items-center group-has-[input:focus]/browser-address:hidden">
          <div className="pointer-events-auto">{permissionControl}</div>
        </div>
      </div>
      <BrowserIconButton
        icon={<MonitorSmartphone className="h-4 w-4" />}
        title={isResponsiveMode ? browserStrings.responsiveExit : browserStrings.responsiveEnter}
        disabled={false}
        dataTestId="browser-responsive-button"
        onClick={onToggleResponsiveMode}
        active={isResponsiveMode}
        pressed={isResponsiveMode}
      />
      {/* Element picker drives CDP on the guest (original UnifiedBrowserView contract). */}
      <BrowserIconButton
        icon={<MousePointerClick className="h-4 w-4" />}
        title={pickerActive ? browserStrings.elementPickerCancel : browserStrings.elementPickerStart}
        disabled={pickerDisabled || !onTogglePicker}
        dataTestId="browser-element-picker-button"
        onClick={() => onTogglePicker?.()}
        active={pickerActive}
        pressed={pickerActive}
      />
      <BrowserToolbarMoreMenu
        canOpenExternal={
          browserState.isReady && isDefaultBrowserOpenableUrl(browserState.currentUrl)
        }
        canOpenDevTools={false /* DevTools need the Electron host; disabled in the web sandbox */}
        open={moreOpen}
        onOpenChange={setMoreOpen}
        onOpenExternal={onOpenExternal}
      />
      {onToggleSolo && (
        <BrowserIconButton
          icon={solo ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          title={solo ? 'Restore browser into workspace' : 'Expand browser to full window'}
          disabled={false}
          dataTestId="browser-solo-button"
          onClick={onToggleSolo}
        />
      )}
      {onClose && (
        <BrowserIconButton
          icon={<X className="h-4 w-4" />}
          title="Close browser pane"
          disabled={false}
          dataTestId="browser-close-button"
          onClick={onClose}
        />
      )}
    </form>
  )
}

function BrowserToolbarMoreMenu({
  canOpenDevTools,
  canOpenExternal,
  onOpenExternal,
  open,
  onOpenChange,
}: {
  canOpenDevTools: boolean
  canOpenExternal: boolean
  onOpenExternal: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={browserStrings.more}
          aria-expanded={open}
          data-testid="browser-more-button"
          className="h-8 w-8 shrink-0 text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642]"
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          data-testid="browser-open-external-item"
          disabled={!canOpenExternal}
          onSelect={onOpenExternal}
        >
          <ExternalLink className="size-4" />
          <span>{browserStrings.openExternal}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          data-testid="browser-devtools-button"
          disabled={!canOpenDevTools}
          title={canOpenDevTools ? undefined : 'DevTools are available in the desktop app'}
        >
          <Bug className="size-4" />
          <span>{browserStrings.devtools}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SandboxBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
      style={{ background: C.mint, color: C.greenDeep }}
      title="Pages opened here run on PaySwap sandbox rails"
    >
      Sandbox
    </span>
  )
}

export function BrowserEmptyState({
  browserState,
  isGuestStarting = !browserState.isReady,
}: {
  browserState: BrowserState
  isGuestStarting?: boolean
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white px-6">
      <div className="flex max-w-sm flex-col items-center pb-10 text-center">
        {isGuestStarting ? (
          <LoaderIcon className="mb-6 size-16 animate-spin text-[#102642] opacity-30" />
        ) : (
          <Globe className="mb-6 size-16 text-[#102642] opacity-30" />
        )}
        <h3 className="text-[13px] font-medium text-[#102642]">{browserStrings.title}</h3>
        <p className="mt-2 text-[13px] text-[#5a7189]">{browserStrings.empty}</p>
      </div>
    </div>
  )
}

export function BrowserLoadErrorState({
  errorMessage,
  onRetry,
}: {
  errorMessage: string
  onRetry: () => void
}) {
  return (
    <div
      data-testid="browser-load-error"
      className="absolute inset-0 z-10 flex items-center justify-center bg-white px-6"
    >
      <div className="flex max-w-sm flex-col items-center pb-10 text-center">
        <TriangleAlert className="mb-6 size-16 text-[#b45309] opacity-60" />
        <h3 className="text-[13px] font-medium text-[#102642]">{browserStrings.loadErrorTitle}</h3>
        <p className="mt-2 font-mono text-[12px] break-all text-[#8ba0b3]">{errorMessage}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 rounded-full border-[#dce5e9] text-[#102642] hover:bg-[#f6f9fa]"
          onClick={onRetry}
        >
          <RefreshCw className="size-4" />
          {browserStrings.loadErrorRetry}
        </Button>
      </div>
    </div>
  )
}

export function BrowserGuestFailureState({
  guestFailure,
  onRetry,
}: {
  guestFailure: BrowserGuestFailure
  onRetry: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white px-6">
      <div className="flex max-w-sm flex-col items-center pb-10 text-center">
        <TriangleAlert className="mb-6 size-16 text-[#b45309] opacity-60" />
        <h3 className="text-[13px] font-medium text-[#102642]">The built-in browser failed to start</h3>
        <p className="mt-2 text-[13px] text-[#5a7189]">
          The browser process exited before it could display the page. You can retry after checking
          the system environment.
        </p>
        <p className="mt-2 font-mono text-[12px] text-[#8ba0b3]">
          Renderer: {guestFailure.reason} (exit code {guestFailure.exitCode})
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 rounded-full border-[#dce5e9] text-[#102642] hover:bg-[#f6f9fa]"
          onClick={onRetry}
        >
          <RefreshCw className="size-4" />
          Retry browser
        </Button>
      </div>
    </div>
  )
}

function BrowserIconButton({
  dataTestId,
  disabled,
  icon,
  onClick,
  title,
  active = false,
  pressed,
}: {
  dataTestId: string
  disabled: boolean
  icon: ReactNode
  onClick: () => void
  title: string
  active?: boolean
  pressed?: boolean
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      aria-label={title}
      aria-pressed={pressed}
      title={title}
      data-testid={dataTestId}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 w-8 shrink-0',
        active
          ? 'bg-[#e2f4ed] text-[#087d62] hover:bg-[#e2f4ed] hover:text-[#087d62]'
          : 'text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642]',
      )}
    >
      {icon}
    </Button>
  )
}
