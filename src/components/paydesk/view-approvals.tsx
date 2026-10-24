'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ApprovalView, PaySettings } from '@/lib/agent-types'
import { C, Money, SectionLabel, StatusPill } from './bits'
import type { PillTone } from './bits'

interface ApprovalsViewProps {
  approvals: ApprovalView[]
  settings: PaySettings
  onDecide: (id: string, decision: 'approved' | 'denied') => void
  onOpenTask: (taskId: string) => void
}

const DECISION_TONE: Record<Exclude<ApprovalView['status'], 'pending'>, PillTone> = {
  approved: 'green',
  denied: 'red',
  expired: 'amber',
}

function shortTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day} · ${time}`
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ba0b3]">{label}</p>
      <div className="mt-0.5 truncate text-[12.5px] text-[#102642]">{children}</div>
    </div>
  )
}

export function ApprovalsView({ approvals, settings, onDecide, onOpenTask }: ApprovalsViewProps) {
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const pending = approvals.filter((a) => a.status === 'pending')
  const decisions = approvals
    .filter((a) => a.status !== 'pending')
    .slice()
    .sort((a, b) => {
      const ta = a.decidedAt ? Date.parse(a.decidedAt) : 0
      const tb = b.decidedAt ? Date.parse(b.decidedAt) : 0
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
    })
    .slice(0, 8)

  function decide(id: string, decision: 'approved' | 'denied') {
    setDecidingId(id)
    onDecide(id, decision)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-8">
      <header>
        <h1 className="text-lg font-semibold text-[#102642]">Approvals</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-[#5a7189]">
          Human authority over consequential effects. The agent proposes; you decide; the protocol
          records.
        </p>
      </header>

      <section className="rounded-2xl border border-[#dce5e9] bg-white p-4" aria-label="Approval policy">
        <SectionLabel>Policy</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:divide-x sm:divide-[#eef2f5]">
          <div className="sm:pr-4">
            <p className="text-[11px] font-medium text-[#5a7189]">Auto-approve below</p>
            <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-[#102642]">
              ${settings.autoApproveLimit.toLocaleString('en-US')}
            </p>
          </div>
          <div className="sm:px-4">
            <p className="text-[11px] font-medium text-[#5a7189]">Mandate daily cap</p>
            <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-[#102642]">
              ${settings.mandateDailyCap.toLocaleString('en-US')}
            </p>
          </div>
          <div className="sm:pl-4">
            <p className="text-[11px] font-medium text-[#5a7189]">Mandate velocity</p>
            <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums text-[#102642]">
              {settings.mandateVelocity}/day
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-[#eef2f5] pt-3 text-[11.5px] leading-relaxed text-[#8ba0b3]">
          Signed, immutable approval artifacts with scope and epoch. Child delegation can narrow,
          never expand, authority.
        </p>
      </section>

      <section aria-label="Pending approvals" className="space-y-3">
        <div className="flex items-center gap-2">
          <SectionLabel>Pending</SectionLabel>
          <span className="rounded-full bg-[#eef2f5] px-2 py-0.5 text-[11px] font-medium text-[#5a7189]">
            {pending.length}
          </span>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-[#dce5e9] bg-white p-8">
            <p className="text-center text-[13px] text-[#8ba0b3]">
              No pending approvals — the agent only asks when policy requires it.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((a) => (
              <article key={a.id} className="rounded-2xl border border-[#dce5e9] bg-white p-4">
                <p className="text-[14px] font-medium text-[#102642]">{a.summary}</p>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <Money value={a.payload.amount} className="text-xl font-semibold text-[#102642]" />
                  <span className="text-[11px] font-medium text-[#8ba0b3]">{a.payload.currency}</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#eef2f5] pt-3 sm:grid-cols-4">
                  <DetailRow label="Rail">{a.payload.rail}</DetailRow>
                  <DetailRow label="Beneficiary">{a.payload.beneficiary}</DetailRow>
                  <DetailRow label="Mode">
                    <span className="inline-block max-w-full truncate rounded bg-[#eef2f5] px-1.5 py-0.5 font-mono text-[10.5px] text-[#5a7189]">
                      {a.payload.mode}
                    </span>
                  </DetailRow>
                  <DetailRow label="Epoch">
                    <span className="font-mono text-[11px]">{a.payload.epoch}</span>
                  </DetailRow>
                  <div className="col-span-2 min-w-0 sm:col-span-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ba0b3]">Mandate</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-[#8ba0b3]">{a.payload.mandate}</p>
                  </div>
                </div>

                {a.payload.evidence.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[10.5px] leading-relaxed text-[#8ba0b3]">
                    {a.payload.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eef2f5] pt-3">
                  <Button
                    variant="link"
                    className="h-auto p-0 text-[12px] font-medium text-[#0b8b6c]"
                    onClick={() => onOpenTask(a.taskId)}
                  >
                    View task
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-[#f0d2d2] text-[12px] text-[#b91c1c] hover:bg-[#fdeaea] hover:text-[#b91c1c]"
                      disabled={decidingId === a.id}
                      onClick={() => decide(a.id, 'denied')}
                    >
                      Deny
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full text-[12px] text-white"
                      style={{ background: C.green }}
                      disabled={decidingId === a.id}
                      onClick={() => decide(a.id, 'approved')}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Past decisions" className="overflow-hidden rounded-2xl border border-[#dce5e9] bg-white">
        <div className="px-4 pb-1 pt-4">
          <SectionLabel>Decisions</SectionLabel>
        </div>
        {decisions.length === 0 ? (
          <p className="px-4 pb-5 pt-2 text-[13px] text-[#8ba0b3]">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef2f5] px-2 pb-2">
            {decisions.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                <StatusPill tone={DECISION_TONE[a.status]}>{a.status === 'approved' ? 'Approved' : a.status === 'denied' ? 'Denied' : 'Expired'}</StatusPill>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#102642]">{a.summary}</span>
                <Money value={a.payload.amount} className="shrink-0 text-[12px] text-[#102642]" />
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[#8ba0b3]">
                  {shortTime(a.decidedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-[#eef2f5] px-4 py-2.5">
          <Badge variant="outline" className="border-[#dce5e9] text-[10.5px] font-normal text-[#8ba0b3]">
            showing last {decisions.length} of {approvals.filter((x) => x.status !== 'pending').length} decisions
          </Badge>
        </div>
      </section>
    </div>
  )
}
