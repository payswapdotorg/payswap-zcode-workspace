'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ApprovalView, LedgerRow } from '@/lib/agent-types'
import { cn } from '@/lib/utils'
import { C, Money, SectionLabel, StatusPill } from './bits'
import type { PillTone } from './bits'

interface ActivityViewProps {
  ledger: LedgerRow[]
  approvals: ApprovalView[]
  onNewTask: (text: string) => void
}

const KIND_TONE: Record<LedgerRow['kind'], PillTone> = {
  obligation: 'slate',
  funding: 'teal',
  conversion: 'amber',
  payout: 'green',
  settlement: 'green',
  fee: 'slate',
}

const STATUS_TONE: Record<LedgerRow['status'], PillTone> = {
  settled: 'green',
  processing: 'amber',
  unknown: 'red',
  proposed: 'slate',
  submitted: 'slate',
}

const LEGEND_KINDS: LedgerRow['kind'][] = ['obligation', 'funding', 'conversion', 'payout', 'settlement', 'fee']
const LEGEND_STATUSES: LedgerRow['status'][] = ['settled', 'processing', 'unknown']

function parseTs(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} · ${time}`
}

export function ActivityView({ ledger, approvals, onNewTask }: ActivityViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const sorted = ledger.slice().sort((a, b) => parseTs(b.createdAt) - parseTs(a.createdAt))
    const map = new Map<string, { label: string; rows: LedgerRow[] }>()
    for (const row of sorted) {
      const key = dayLabel(row.createdAt)
      const group = map.get(key)
      if (group) group.rows.push(row)
      else map.set(key, { label: key, rows: [row] })
    }
    return Array.from(map.values())
  }, [ledger])

  const unknowns = useMemo(() => ledger.filter((r) => r.status === 'unknown'), [ledger])

  const audit = useMemo(
    () =>
      approvals
        .filter((a) => a.status !== 'pending')
        .slice()
        .sort((a, b) => parseTs(b.decidedAt ?? '') - parseTs(a.decidedAt ?? ''))
        .slice(0, 5),
    [approvals],
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-8">
      <header>
        <h1 className="text-lg font-semibold text-[#102642]">Activity</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[#5a7189]">
          One financial protocol across rails — obligations, legs, finality and evidence.
        </p>
      </header>

      <section className="rounded-2xl border border-[#dce5e9] bg-white p-4" aria-label="Ledger legend">
        <SectionLabel>Legend</SectionLabel>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {LEGEND_KINDS.map((kind) => (
            <StatusPill key={`kind-${kind}`} tone={KIND_TONE[kind]}>
              {kind}
            </StatusPill>
          ))}
          <span className="text-[#c3d0da]" aria-hidden="true">
            |
          </span>
          {LEGEND_STATUSES.map((status) => (
            <StatusPill key={`status-${status}`} tone={STATUS_TONE[status]}>
              {status}
            </StatusPill>
          ))}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-[#8ba0b3]">
          UNKNOWN — needs reconciliation is surfaced truthfully. Late provider events never rewrite
          history.
        </p>
      </section>

      <section aria-label="Ledger" className="space-y-4">
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-[#dce5e9] bg-white p-8">
            <p className="text-center text-[13px] text-[#8ba0b3]">No ledger activity in the current window.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <SectionLabel>{group.label}</SectionLabel>
              <ul className="divide-y divide-[#eef2f5] rounded-2xl border border-[#dce5e9] bg-white">
                {group.rows.map((row) => {
                  const expanded = expandedId === row.id
                  return (
                    <li key={row.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill tone={KIND_TONE[row.kind]}>{row.kind}</StatusPill>
                            <span className="truncate text-[12px] text-[#5a7189]">{row.rail}</span>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10.5px] text-[#8ba0b3]">{row.ref}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <span className="text-right">
                            <Money value={row.amount} className="text-[13px] text-[#102642]" />
                            <span className="ml-1 text-[11px] text-[#8ba0b3]">{row.currency}</span>
                          </span>
                          <StatusPill tone={STATUS_TONE[row.status]}>{row.status}</StatusPill>
                          <button
                            type="button"
                            aria-label="Toggle evidence"
                            aria-expanded={expanded}
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#f6f9fa]"
                          >
                            <ChevronDown
                              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>
                      {expanded ? (
                        <ul className="mt-2.5 list-disc space-y-0.5 border-t border-[#eef2f5] pl-4 pt-2.5 font-mono text-[10.5px] leading-relaxed text-[#8ba0b3]">
                          {row.evidence.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <section
        aria-label="Reconciliation"
        className={cn(
          'rounded-2xl border bg-white p-4',
          unknowns.length > 0 ? 'border-[#ecd9b0] bg-[#fdfaf1]' : 'border-[#dce5e9]',
        )}
      >
        <SectionLabel>Reconciliation</SectionLabel>
        {unknowns.length === 0 ? (
          <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-[#5a7189]">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.green }} aria-hidden="true" />
            No unreconciled items in the current window.
          </p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {unknowns.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f0dcb8] bg-[#fdf6e8] px-3 py-2.5"
              >
                <StatusPill tone="amber">unknown</StatusPill>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[#102642]">{row.ref}</span>
                <span className="text-[11.5px] text-[#5a7189]">{row.rail}</span>
                <Money value={row.amount} className="text-[12px] text-[#102642]" />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full border-[#ecd9b0] text-[11.5px]"
                  style={{ color: C.amber }}
                  onClick={() =>
                    onNewTask(`Reconcile ${row.ref} on ${row.rail} — provider events conflict with the ledger`)
                  }
                >
                  Investigate
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Approval audit" className="overflow-hidden rounded-2xl border border-[#dce5e9] bg-white">
        <div className="px-4 pb-1 pt-4">
          <SectionLabel>Approval audit</SectionLabel>
        </div>
        {audit.length === 0 ? (
          <p className="px-4 pb-5 pt-2 text-[13px] text-[#8ba0b3]">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef2f5] px-2 pb-2">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <StatusPill tone={a.status === 'approved' ? 'green' : a.status === 'denied' ? 'red' : 'amber'}>
                  {a.status === 'approved' ? 'Approved' : a.status === 'denied' ? 'Denied' : 'Expired'}
                </StatusPill>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#102642]">{a.summary}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#8ba0b3]">{shortTime(a.decidedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
