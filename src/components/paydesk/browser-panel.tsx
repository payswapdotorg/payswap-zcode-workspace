'use client'

/**
 * PaySwap browser pane — the dockable shell around the ported original ZCode browser.
 *
 * The chrome, navigation engine and guest surface come from
 * `@/components/zcode-browser` (web port of the original ZCode browser, Apache-2.0).
 * This shell only wires the PaySwap internals:
 *  - jumia.com(.gh) URLs resolve to the sandbox storefront internal page;
 *  - every other http(s) URL browses the real web through the guest proxy.
 */

import { useCallback, useMemo } from 'react'
import type { PaymentChoice, PaymentGate, TaskOrigin } from '@/lib/agent-types'
import {
  ZcodeBrowser,
  type ZcodeBrowserInternalPage,
} from '@/components/zcode-browser/zcode-browser'
import { cn } from '@/lib/utils'
import {
  STORE_INTERNAL_PREFIX,
  SandboxStore,
  isStoreInternalUrl,
  resolveJumiaInternalUrl,
  storeDisplayUrl,
  storePathOf,
} from './sandbox-store'

export interface BrowserPanelProps {
  url: string | null
  gate: PaymentGate | null
  onPay: (gateId: string, choice: PaymentChoice) => void
  onClose?: () => void
  onGoal: (text: string, origin: TaskOrigin) => void
  variant: 'side' | 'overlay'
  /** Docked to the full window — shows the restore control instead of expand. */
  solo?: boolean
  onToggleSolo?: () => void
}

export function BrowserPanel({
  url,
  gate,
  onPay,
  onClose,
  onGoal,
  variant,
  solo = false,
  onToggleSolo,
}: BrowserPanelProps) {
  const resolveEntry = useCallback(
    (raw: string) => resolveJumiaInternalUrl(raw) ?? raw,
    [],
  )

  const internalPage = useMemo<ZcodeBrowserInternalPage>(
    () => ({
      matches: isStoreInternalUrl,
      render: (entry, navigate) => (
        <SandboxStore
          path={storePathOf(entry)}
          gate={gate}
          onPay={onPay}
          onGoal={onGoal}
          onNavigate={(path) =>
            navigate(path === '/' ? STORE_INTERNAL_PREFIX : `${STORE_INTERNAL_PREFIX}${path}`)
          }
        />
      ),
    }),
    [gate, onPay, onGoal],
  )

  const getInternalDisplayUrl = useCallback(
    (entry: string) => (isStoreInternalUrl(entry) ? storeDisplayUrl(storePathOf(entry), gate) : null),
    [gate],
  )

  return (
    <div
      className={cn(
        'min-h-0 flex-col bg-white',
        variant === 'side' ? 'flex h-full w-full' : 'fixed inset-0 z-50 flex',
      )}
      role="region"
      aria-label="Sandbox browser"
      data-testid="browser-pane"
    >
      <ZcodeBrowser
        url={url}
        resolveEntry={resolveEntry}
        internalPage={internalPage}
        getInternalDisplayUrl={getInternalDisplayUrl}
        solo={solo}
        onToggleSolo={variant === 'side' ? onToggleSolo : undefined}
        onClose={variant === 'overlay' || solo ? onClose ?? onToggleSolo : undefined}
      />
    </div>
  )
}
