'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CONNECTIONS, CONNECTION_FAMILIES } from '@/lib/connections'
import type { ConnectionInstance } from '@/lib/connections'
import { C, SectionLabel, StatusPill } from './bits'
import type { PillTone } from './bits'

interface ConnectionsViewProps {
  environment: 'sandbox' | 'live'
}

type ConnStatus = ConnectionInstance['status']

const STATUS_LABEL: Record<ConnStatus, string> = {
  connected: 'Connected',
  available: 'Available',
  testing: 'Testing',
  degraded: 'Degraded',
}

const STATUS_TONE: Record<ConnStatus, PillTone> = {
  connected: 'green',
  available: 'slate',
  testing: 'amber',
  degraded: 'red',
}

const FAMILY_PREREQS: Record<ConnectionInstance['family'], string[]> = {
  'Cards & PSPs': [
    'Provider account with API access enabled',
    'Sandbox API keys issued by the provider',
    'Webhook endpoint reachable over HTTPS',
  ],
  'Mobile money': [
    'Approved shortcode or paybill from the operator',
    'Callback URLs registered with the operator',
    'Sandbox credentials from the developer portal',
  ],
  Banks: [
    'Licensed payment institution agreement in place',
    'PSU consent scoped for the intended flows',
    'Settlement account verified (IBAN check)',
  ],
  FX: [
    'Multi-currency balance enabled on the profile',
    'Rate and spread agreement accepted',
    'Compliance review cleared for target corridors',
  ],
  Blockchain: [
    'Non-custodial wallet connected by signature',
    'Network and chain ID selected per environment',
    'Gas policy acknowledged by the operator',
  ],
  Data: [
    'Data-sharing agreement signed',
    'Read-only API token issued and vaulted',
  ],
}

const METHOD_NOTE: Record<ConnectionInstance['method'], string> = {
  'Delegated OAuth':
    'Connects via delegated OAuth — the provider asks for consent and PaySwap stores scoped tokens outside model context.',
  'Scoped API keys':
    'Connects with scoped API keys — keys live in the vault and never enter model context.',
  'Interactive session':
    'Connects through an interactive provider session — the agent sees scopes, never credentials.',
  'Wallet signature':
    'Connects by wallet signature — non-custodial, scoped to explicit on-chain permissions.',
}

export function ConnectionsView({ environment }: ConnectionsViewProps) {
  const [statuses, setStatuses] = useState<Record<string, ConnStatus>>(() =>
    Object.fromEntries(CONNECTIONS.map((c) => [c.id, c.status] as const)),
  )
  const [manageId, setManageId] = useState<string | null>(null)
  const [connectId, setConnectId] = useState<string | null>(null)
  const [rotatedIds, setRotatedIds] = useState<string[]>([])
  const [connectedNotes, setConnectedNotes] = useState<string[]>([])

  const managed = CONNECTIONS.find((c) => c.id === manageId) ?? null
  const connectTarget = CONNECTIONS.find((c) => c.id === connectId) ?? null

  const connect = (id: string) => {
    setStatuses((prev) => ({ ...prev, [id]: 'connected' }))
    setConnectedNotes((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setConnectId(null)
  }

  const disconnect = (id: string) => {
    setStatuses((prev) => ({ ...prev, [id]: 'available' }))
    setRotatedIds((prev) => prev.filter((r) => r !== id))
    setManageId(null)
  }

  const sections = CONNECTION_FAMILIES.map((family) => ({
    family,
    items: CONNECTIONS.filter((c) => c.family === family),
  })).filter((s) => s.items.length > 0)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-[#102642]">Connections</h1>
            <StatusPill tone={environment === 'sandbox' ? 'teal' : 'amber'}>
              {environment === 'sandbox' ? 'Sandbox enforced' : 'Live'}
            </StatusPill>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-[#5a7189]">
            Connected capability instances across rails. Credentials are stored outside model
            context — the agent sees scopes, never secrets.
          </p>
        </div>
      </header>

      {sections.map((section) => (
        <section key={section.family} aria-label={section.family} className="space-y-3">
          <SectionLabel>{section.family}</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {section.items.map((c) => {
              const status = statuses[c.id] ?? c.status
              const connected = status === 'connected'
              return (
                <div key={c.id} className="flex flex-col rounded-2xl border border-[#dce5e9] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#102642]">{c.provider}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8ba0b3]">
                        <span>{c.family}</span>
                        <span aria-hidden="true">·</span>
                        <span>{c.method}</span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#eef2f5] px-1.5 py-0.5 font-mono text-[10px] text-[#5a7189]">
                      {c.environment}
                    </span>
                  </div>

                  <div className="mt-2.5">
                    <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {c.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded border border-[#eef2f5] bg-[#f6f9fa] px-1.5 py-0.5 font-mono text-[10.5px] text-[#5a7189]"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>

                  {c.family === 'Blockchain' && c.provider.startsWith('Base') ? (
                    <p className="mt-2.5 rounded-lg bg-[#f6f9fa] px-2.5 py-1.5 text-[11px] text-[#5a7189]">
                      non-custodial · wallet signature
                    </p>
                  ) : null}

                  {connected ? (
                    <div className="mt-3 space-y-1 text-[11px]">
                      <p className="truncate font-mono text-[#102642]">{c.accountRef}</p>
                      <p className="text-[#8ba0b3]">
                        fee {c.feeBps}bps · ~{c.etaMinutes}m
                      </p>
                    </div>
                  ) : null}

                  <div className="mt-auto pt-3">
                    {connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-[#dce5e9] text-[12px] text-[#102642]"
                        onClick={() => setManageId(c.id)}
                      >
                        Manage
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-full text-[12px] text-white"
                        style={{ background: C.green }}
                        onClick={() => setConnectId(c.id)}
                      >
                        Connect
                      </Button>
                    )}
                    {connectedNotes.includes(c.id) ? (
                      <p className="mt-2 text-[11.5px]" style={{ color: C.greenDeep }}>
                        Sandbox instance connected — capabilities are now evaluable for tasks.
                      </p>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {section.family === 'Blockchain' ? (
              <div className="rounded-2xl border border-[#dce5e9] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#102642]">Ethereum</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8ba0b3]">
                      <span>Blockchain</span>
                      <span aria-hidden="true">·</span>
                      <span>Wallet signature</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#eef2f5] px-1.5 py-0.5 font-mono text-[10px] text-[#5a7189]">
                    {environment}
                  </span>
                </div>
                <div className="mt-2.5">
                  <StatusPill tone="slate">Available</StatusPill>
                </div>
                <p className="mt-2.5 rounded-lg bg-[#f6f9fa] px-2.5 py-1.5 text-[11px] text-[#5a7189]">
                  available — choose network and environment
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ))}

      <div className="rounded-2xl border border-dashed border-[#dce5e9] bg-white p-4">
        <p className="text-[12px] leading-relaxed text-[#5a7189]">
          A catalogue entry is not a connected capability. Eligibility is re-evaluated for every
          task against health, scopes, corridor and policy.
        </p>
      </div>

      {/* Manage dialog (connected instances) */}
      <Dialog
        open={managed !== null}
        onOpenChange={(open) => {
          if (!open) setManageId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          {managed ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#102642]">{managed.provider}</DialogTitle>
                <DialogDescription>
                  {managed.family} · {managed.method} · {STATUS_LABEL[statuses[managed.id] ?? managed.status]}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <SectionLabel>Scopes</SectionLabel>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {managed.scopes.map((scope) => (
                      <Badge
                        key={scope}
                        variant="outline"
                        className="border-[#dce5e9] font-mono text-[10.5px] font-normal text-[#5a7189]"
                      >
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 rounded-xl bg-[#f6f9fa] p-3 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5a7189]">Health</span>
                    <span className="flex items-center gap-1.5 font-medium text-[#087d62]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.green }} aria-hidden="true" />
                      operational
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5a7189]">Environment</span>
                    <span className="font-mono text-[11px] text-[#102642]">{managed.environment}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#5a7189]">Connected</span>
                    <span className="font-mono text-[11px] text-[#102642]">{managed.connectedAt}</span>
                  </div>
                </div>
              </div>

              <DialogFooter className="items-center gap-2 sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="rounded-full border-[#dce5e9]"
                    disabled={rotatedIds.includes(managed.id)}
                    onClick={() => setRotatedIds((prev) => (prev.includes(managed.id) ? prev : [...prev, managed.id]))}
                  >
                    Rotate credentials
                  </Button>
                  {rotatedIds.includes(managed.id) ? (
                    <span className="text-[11px]" style={{ color: C.greenDeep }}>
                      rotated just now
                    </span>
                  ) : null}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="border-[#f0d2d2] text-[#b91c1c] hover:bg-[#fdeaea] hover:text-[#b91c1c]">
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-[#102642]">Disconnect {managed.provider}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Scopes are revoked immediately and the capability leaves the eligible set.
                        Pending obligations on this instance must settle before removal completes.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-[#b91c1c] text-white hover:bg-[#991b1b]"
                        onClick={() => disconnect(managed.id)}
                      >
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Connect dialog (catalogue instances) */}
      <Dialog
        open={connectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConnectId(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          {connectTarget ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#102642]">Connect {connectTarget.provider}</DialogTitle>
                <DialogDescription>
                  {connectTarget.family} · {connectTarget.method}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div>
                  <SectionLabel>Prerequisites</SectionLabel>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px] text-[#5a7189]">
                    {FAMILY_PREREQS[connectTarget.family].map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <p className="rounded-xl bg-[#f6f9fa] p-3 text-[12px] text-[#5a7189]">
                  {METHOD_NOTE[connectTarget.method]}
                </p>
                <p
                  className="rounded-xl border border-[#f0dcb8] bg-[#fdf6e8] p-3 text-[12px]"
                  style={{ color: C.amber }}
                >
                  Connects in sandbox mode — live requires certified provider instances.
                </p>
              </div>

              <DialogFooter>
                <Button
                  className="rounded-full text-white"
                  style={{ background: C.green }}
                  onClick={() => connect(connectTarget.id)}
                >
                  Connect sandbox instance
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
