'use client'

/**
 * Home widgets that live BELOW the New task composer on the unified landing
 * page: workspace stats, continue-where-you-left-off, routines ready to load
 * and open network opportunities. The hero + goal composer + quick-action
 * chips come from NewTaskView (view-task.tsx) — the app opens on that page.
 */

import { ArrowRight, Bot, ChevronRight } from 'lucide-react'
import type { Opportunity, Routine, TaskDTO } from '@/lib/agent-types'
import { C, SectionLabel, StatusPill, type PillTone } from './bits'

export interface HomeSectionsProps {
  tasks: TaskDTO[]
  routines: Routine[]
  opportunities: Opportunity[]
  onOpenTask: (id: string) => void
  onOpenRoutines: () => void
  onOpenOpportunities: () => void
}

const KIND_TONE: Record<Opportunity['kind'], PillTone> = {
  routing: 'slate',
  liquidity: 'teal',
  fx: 'amber',
  payout: 'green',
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function HomeSections({
  tasks,
  routines,
  opportunities,
  onOpenTask,
  onOpenRoutines,
  onOpenOpportunities,
}: HomeSectionsProps) {
  const recent = [...tasks]
    .sort((a, b) => {
      const ar = a.status === 'running' ? 0 : 1
      const br = b.status === 'running' ? 0 : 1
      if (ar !== br) return ar - br
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, 4)

  const topRoutines = [...routines]
    .sort((a, b) => b.rating.agentScore - a.rating.agentScore)
    .slice(0, 3)

  const openOpps = opportunities.filter((o) => o.status === 'open').slice(0, 2)

  const installedRoutines = routines.filter((r) => r.installed).length
  const openOpportunityCount = opportunities.filter((o) => o.status === 'open').length

  return (
    <div className="space-y-10 pb-10">
      {/* Quiet stat strip */}
      <section aria-label="Workspace stats" className="flex items-start justify-center divide-x divide-[#dce5e9]">
        <QuietStat value={tasks.length} label="Tasks run" />
        <QuietStat value={installedRoutines} label="Routines installed" />
        <QuietStat value={openOpportunityCount} label="Open opportunities" />
      </section>

      {/* Continue where you left off */}
      {recent.length > 0 && (
        <section aria-label="Continue where you left off">
          <SectionLabel>Continue where you left off</SectionLabel>
          <div className="mt-2 rounded-2xl border border-[#dce5e9] bg-white">
            <ul className="divide-y divide-[#eef2f5] px-2 py-1 [scrollbar-width:thin]">
              {recent.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-[#f6f9fa]"
                  >
                    {task.status === 'running' ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span
                          className="absolute h-2 w-2 animate-ping rounded-full opacity-50"
                          style={{ background: C.amberDot }}
                        />
                        <span className="h-2 w-2 rounded-full" style={{ background: C.amberDot }} />
                      </span>
                    ) : task.status === 'failed' ? (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: C.red }} />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: C.green }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#102642]">
                      {task.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#8ba0b3]">{relTime(task.createdAt)}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c3d0da]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Routines ready to load */}
      {topRoutines.length > 0 && (
        <section aria-label="Routines ready to load">
          <SectionLabel>Routines ready to load</SectionLabel>
          <div className="mt-2 rounded-2xl border border-[#dce5e9] bg-white">
            <ul className="divide-y divide-[#eef2f5] px-2 py-1 [scrollbar-width:thin]">
              {topRoutines.map((routine) => (
                <li key={routine.id}>
                  <button
                    type="button"
                    onClick={onOpenRoutines}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#f6f9fa]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#102642]">
                        {routine.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#8ba0b3]">
                        {routine.publisher}
                      </span>
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium"
                      style={{ color: C.greenDeep }}
                      title={`Agent rating ${routine.rating.agentScore.toFixed(1)} across ${routine.rating.agentCount} agent runs`}
                    >
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-mono tabular-nums">{routine.rating.agentScore.toFixed(1)}</span>
                    </span>
                    {routine.installed ? (
                      <StatusPill tone="green">Installed</StatusPill>
                    ) : (
                      <StatusPill tone="slate">Install</StatusPill>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[#eef2f5] px-3 py-2">
              <button
                type="button"
                onClick={onOpenRoutines}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#087d62] hover:underline"
              >
                Explore all routines
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Opportunities on the network */}
      {openOpps.length > 0 && (
        <section aria-label="Opportunities on the network">
          <SectionLabel>Opportunities on the network</SectionLabel>
          <div className="mt-2 rounded-2xl border border-[#dce5e9] bg-white">
            <ul className="divide-y divide-[#eef2f5] px-2 py-1 [scrollbar-width:thin]">
              {openOpps.map((opp) => (
                <li key={opp.id}>
                  <button
                    type="button"
                    onClick={onOpenOpportunities}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#f6f9fa]"
                  >
                    <StatusPill tone={KIND_TONE[opp.kind]}>{opp.kind}</StatusPill>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#102642]">
                      {opp.title}
                    </span>
                    <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-[#102642]">
                      {opp.currency} {opp.amount.toLocaleString('en-US')}
                    </span>
                    <span
                      className="hidden shrink-0 font-mono text-[11px] tabular-nums sm:block"
                      style={{ color: C.greenDeep }}
                    >
                      +{opp.rewardBps} bps
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-[#eef2f5] px-3 py-2">
              <button
                type="button"
                onClick={onOpenOpportunities}
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#087d62] hover:underline"
              >
                See all opportunities
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function QuietStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-6 text-center">
      <p className="font-mono text-lg font-semibold tabular-nums text-[#102642]">{value}</p>
      <p className="mt-0.5 text-[11px] text-[#8ba0b3]">{label}</p>
    </div>
  )
}
