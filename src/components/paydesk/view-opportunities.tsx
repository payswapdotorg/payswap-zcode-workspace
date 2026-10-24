'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Coins,
  Loader2,
  Radar,
  Route,
  Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Opportunity, OpportunityBid, OpportunityKind } from '@/lib/agent-types'
import { C, StatusPill } from './bits'

export interface OpportunitiesViewProps {
  opportunities: Opportunity[]
  loading?: boolean
  busyId: string | null
  onBid: (id: string) => void
  onAward: (id: string, bidId?: string) => void
  onOpenTask: (taskId: string) => void
}

const KIND_META: Record<OpportunityKind, { label: string; Icon: typeof Route }> = {
  routing: { label: 'Route', Icon: Route },
  liquidity: { label: 'Liquidity', Icon: Coins },
  fx: { label: 'FX', Icon: ArrowLeftRight },
  payout: { label: 'Payout', Icon: Banknote },
}

const ghs = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'GHS' })

function rewardOf(amount: number, rewardBps: number): number {
  return (amount * rewardBps) / 10000
}

/**
 * Module-level ticker store: timestamps tick every 30s while subscribers are
 * attached. getSnapshot is stable between ticks, so React never render-loops.
 * Returns 0 until first mount, keeping SSR and hydration markup identical.
 */
const ticker = {
  listeners: new Set<() => void>(),
  timer: null as ReturnType<typeof setInterval> | null,
  now: 0,
  subscribe(onStoreChange: () => void) {
    ticker.listeners.add(onStoreChange)
    if (ticker.timer === null) {
      ticker.now = Date.now()
      ticker.timer = setInterval(() => {
        ticker.now = Date.now()
        for (const notify of ticker.listeners) notify()
      }, 30000)
    }
    return () => {
      ticker.listeners.delete(onStoreChange)
      if (ticker.listeners.size === 0 && ticker.timer !== null) {
        clearInterval(ticker.timer)
        ticker.timer = null
      }
    }
  },
  getSnapshot() {
    return ticker.now
  },
}

function useNow(): number {
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, () => 0)
}

function countdown(expiresAt: string, now: number): { text: string; urgent: boolean } {
  const diff = new Date(expiresAt).getTime() - now
  if (diff <= 0) return { text: 'expired', urgent: true }
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return { text: `in ${minutes}m`, urgent: true }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { text: `in ${hours}h`, urgent: false }
  return { text: `in ${Math.floor(hours / 24)}d`, urgent: false }
}

function KindPill({ kind }: { kind: OpportunityKind }) {
  const { label, Icon } = KIND_META[kind]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: C.mintBorder, background: C.mint, color: C.greenDeep }}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  )
}

function BidRow({ bid, best }: { bid: OpportunityBid; best: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[#102642]">
          {bid.node}
          <span className="font-normal text-[#8ba0b3]"> · {bid.region}</span>
        </p>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[#8ba0b3]">
          {bid.feeBps} bps · ~{bid.etaMinutes} min
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] tabular-nums text-[#102642]">
        <Star className="h-3 w-3 fill-[#087d62] text-[#087d62]" aria-hidden="true" />
        {bid.nodeRating.toFixed(1)}
      </span>
      {best ? (
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: C.mint, color: C.greenDeep }}
        >
          Best
        </span>
      ) : null}
    </li>
  )
}

function OpportunityCard({
  opp: o,
  busyId,
  awarded,
  now,
  onBid,
  onAward,
  onOpenTask,
}: {
  opp: Opportunity
  busyId: string | null
  awarded: boolean
  now: number
  onBid: (id: string) => void
  onAward: (id: string, bidId?: string) => void
  onOpenTask: (taskId: string) => void
}) {
  const busy = busyId === o.id
  const bestBidId = useMemo(() => {
    if (o.bids.length === 0) return null
    let best = o.bids[0]
    for (const b of o.bids) {
      if (b.feeBps < best.feeBps) best = b
    }
    return best.id
  }, [o.bids])

  const winningBid = awarded
    ? o.bids.find((b) => b.id === o.awardedNodeId) ?? o.bids.find((b) => b.id === bestBidId) ?? null
    : null

  const cd = now > 0 ? countdown(o.expiresAt, now) : null

  return (
    <article className="flex flex-col rounded-2xl border border-[#dce5e9] bg-white p-4 transition-colors hover:border-[#bfe5d8]">
      <div className="flex flex-wrap items-center gap-2">
        <KindPill kind={o.kind} />
        <StatusPill tone={awarded ? 'slate' : 'green'}>{awarded ? 'Awarded' : 'Open'}</StatusPill>
      </div>

      <h3 className="mt-2 text-[14.5px] font-medium text-[#102642]">{o.title}</h3>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#5a7189]">{o.intentSummary}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] tabular-nums text-[#8ba0b3]">
        <span>
          {o.amount.toLocaleString('en-US')} {o.currency}
        </span>
        <span>reward {o.rewardBps} bps</span>
        <span>{o.bids.length} bid{o.bids.length === 1 ? '' : 's'}</span>
        {cd ? (
          <span className={cd.urgent ? 'font-medium text-[#b45309]' : undefined}>expires {cd.text}</span>
        ) : null}
      </div>

      {o.createdByTaskId ? (
        <button
          type="button"
          onClick={() => onOpenTask(o.createdByTaskId as string)}
          className="mt-2 self-start rounded px-1 py-0.5 text-[12px] text-[#0b8b6c] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bfe5d8]"
        >
          From task: {o.createdByTaskTitle ?? o.createdByTaskId}
        </button>
      ) : null}

      {awarded ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5" style={{ background: C.mint }}>
          <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: C.greenDeep }} aria-hidden="true" />
          <span className="text-[12.5px] font-medium" style={{ color: C.greenDeep }}>
            {winningBid ? winningBid.node : 'Node awarded'}
          </span>
          {winningBid ? (
            <span className="font-mono text-[11.5px] tabular-nums text-[#5a7189]">
              {winningBid.feeBps} bps · ~{winningBid.etaMinutes} min
            </span>
          ) : null}
          {o.createdByTaskId ? (
            <button
              type="button"
              onClick={() => onOpenTask(o.createdByTaskId as string)}
              className="ml-auto rounded px-1 py-0.5 text-[12px] font-medium text-[#087d62] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bfe5d8]"
            >
              View task
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {o.bids.length > 0 ? (
            <ul className="mt-3 max-h-40 divide-y divide-[#eef2f5] overflow-y-auto border-t border-[#eef2f5] pt-2 [scrollbar-width:thin]">
              {o.bids.map((b) => (
                <BidRow key={b.id} bid={b} best={b.id === bestBidId} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 border-t border-[#eef2f5] pt-3 text-[12px] text-[#8ba0b3]">
              No bids yet — nodes are still filtering this intent.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-9 rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189] hover:border-[#bfe5d8] hover:text-[#087d62]"
              disabled={busy}
              onClick={() => onBid(o.id)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Bid as your-node
            </Button>
            {o.bids.length > 0 ? (
              <Button
                className="h-9 rounded-full px-4 text-[12.5px] font-medium text-white"
                style={{ background: C.green }}
                disabled={busy}
                onClick={() => onAward(o.id)}
              >
                Award best bid
              </Button>
            ) : null}
          </div>
        </>
      )}
    </article>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[#dce5e9] bg-white p-10 text-center">
      <Radar className="h-6 w-6 text-[#8ba0b3]" aria-hidden="true" />
      <p className="max-w-sm text-sm leading-relaxed text-[#5a7189]">{children}</p>
    </div>
  )
}

export function OpportunitiesView({
  opportunities,
  loading = false,
  busyId = null,
  onBid,
  onAward,
  onOpenTask,
}: OpportunitiesViewProps) {
  const [tab, setTab] = useState<'open' | 'awarded'>('open')
  const now = useNow()

  const open = useMemo(() => opportunities.filter((o) => o.status === 'open'), [opportunities])
  const awarded = useMemo(() => opportunities.filter((o) => o.status === 'awarded'), [opportunities])
  const totalReward = useMemo(
    () => open.reduce((sum, o) => sum + rewardOf(o.amount, o.rewardBps), 0),
    [open],
  )

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <p className="animate-pulse text-sm text-[#8ba0b3]">Loading opportunities…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold text-[#102642]">Opportunities</h1>
        <p className="mt-1 text-sm text-[#5a7189]">
          Economic intents broadcast to every PaySwap node — filter through them and bid for the ones you want.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e9] bg-white px-3 py-1.5 text-[12px] text-[#5a7189]">
          Open
          <span className="font-mono font-medium tabular-nums text-[#102642]">{open.length}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e9] bg-white px-3 py-1.5 text-[12px] text-[#5a7189]">
          Awarded
          <span className="font-mono font-medium tabular-nums text-[#102642]">{awarded.length}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e9] bg-white px-3 py-1.5 text-[12px] text-[#5a7189]">
          Total reward value
          <span className="font-mono font-medium tabular-nums text-[#102642]">{ghs.format(totalReward)}</span>
        </span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'open' | 'awarded')}>
        <TabsList className="h-9 rounded-full border border-[#dce5e9] bg-white p-1">
          <TabsTrigger
            value="open"
            className="rounded-full px-3.5 text-[12.5px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
          >
            Open ({open.length})
          </TabsTrigger>
          <TabsTrigger
            value="awarded"
            className="rounded-full px-3.5 text-[12.5px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
          >
            Awarded ({awarded.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          {open.length === 0 ? (
            <EmptyState>
              No open opportunities right now — they appear when users&rsquo; intents need the network.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {open.map((o) => (
                <OpportunityCard
                  key={o.id}
                  opp={o}
                  busyId={busyId}
                  awarded={false}
                  now={now}
                  onBid={onBid}
                  onAward={onAward}
                  onOpenTask={onOpenTask}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="awarded" className="mt-4">
          {awarded.length === 0 ? (
            <EmptyState>
              Nothing awarded yet — when a bid is accepted the winning node and its task appear here.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {awarded.map((o) => (
                <OpportunityCard
                  key={o.id}
                  opp={o}
                  busyId={busyId}
                  awarded
                  now={now}
                  onBid={onBid}
                  onAward={onAward}
                  onOpenTask={onOpenTask}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
