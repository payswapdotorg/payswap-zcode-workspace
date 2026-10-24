'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  Check,
  ChevronRight,
  Copy,
  FileWarning,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  ApprovalView,
  LedgerRow,
  PaymentChoice,
  QuotePayload,
  Routine,
  RouteCandidate,
  TaskDTO,
  TaskOrigin,
} from '@/lib/agent-types'
import type { AgentStep } from '@/lib/agent-types'
import type { Project } from '@/lib/paydata'
import { C } from './bits'
import { AgentStepRow, BrandMark, Money, StatusPill } from './bits'
import { Composer, type ContextChip } from './composer'
import { BrowserPanel } from './browser-panel'
import { PayGateCard, RoutinePickerDialog, RoutineTodosCard } from './routine-blocks'

/* ------------------------------------------------------------------ */
/* Step payload renderers                                              */
/* ------------------------------------------------------------------ */

const LEG_KIND_LABEL: Record<string, string> = {
  funding: 'Fund',
  conversion: 'Convert',
  payout: 'Deliver',
  settlement: 'Settle',
}

function RouteCard({ routes }: { routes: RouteCandidate[] }) {
  return (
    <div className="space-y-2">
      {routes.map((route) => (
        <div
          key={route.id}
          className={
            route.eligible
              ? 'rounded-xl border border-[#dce5e9] bg-white p-3'
              : 'rounded-xl border border-dashed border-[#dce5e9] bg-[#f6f9fa]/70 p-3 opacity-75'
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={route.eligible ? 'green' : 'slate'}>
              {route.mode === 'PASS_THROUGH_NATIVE'
                ? 'Native'
                : route.mode === 'COMPOSED_PAYSWAP'
                  ? 'Composed'
                  : 'Multi-provider'}
            </StatusPill>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#102642]">{route.label}</span>
            {route.eligible ? (
              <span className="text-right text-[12px]">
                <Money value={route.totalOut} className="font-semibold text-[#087d62]" />
                <span className="ml-1 text-[10px] text-[#8ba0b3]">out</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#b45309]">
                <Ban className="h-3 w-3" aria-hidden="true" />
                {route.rejectedReason ?? 'not eligible'}
              </span>
            )}
          </div>
          {route.eligible && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {route.legs.map((leg, i) => (
                  <span key={`${leg.rail}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-[#c3d0da]" aria-hidden="true" />}
                    <span
                      className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                      style={{
                        background:
                          leg.kind === 'conversion' ? '#fdf1df' : leg.kind === 'funding' ? '#eef2f5' : '#e2f4ed',
                        color: leg.kind === 'conversion' ? '#b45309' : leg.kind === 'funding' ? '#5a7189' : '#087d62',
                      }}
                      title={leg.detail}
                    >
                      {LEG_KIND_LABEL[leg.kind] ?? leg.kind} · {leg.rail}
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#8ba0b3]">
                fee <Money value={route.fee} className="text-[#5a7189]" /> · FX spread {route.fxSpreadBps}bps · ETA ~
                {route.etaMinutes}m · {route.legs.length} hop{route.legs.length === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function QuoteCard({ quote }: { quote: QuotePayload }) {
  return (
    <div className="rounded-xl border border-[#dce5e9] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={quote.guaranteed ? 'green' : 'amber'}>
          {quote.guaranteed ? 'Guaranteed quote' : 'Indicative quote'}
        </StatusPill>
        <span className="text-[13px] font-semibold text-[#102642]">
          1 {quote.currency} = {quote.rate} {quote.destinationCurrency}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[#8ba0b3]">
        fee <Money value={quote.fee} className="text-[#5a7189]" /> {quote.currency} · spread {quote.fxSpreadBps}bps ·
        source {quote.source} · {quote.version} · expires {new Date(quote.expiresAt).toLocaleTimeString()}
      </p>
    </div>
  )
}

function LedgerMini({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dce5e9] bg-white">
      <ul className="divide-y divide-[#eef2f5]">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2 px-3 py-2">
            <StatusPill
              tone={row.status === 'settled' ? 'green' : row.status === 'unknown' ? 'red' : 'amber'}
            >
              {row.kind}
            </StatusPill>
            <span className="min-w-0 flex-1 truncate text-[12px] text-[#5a7189]">{row.rail}</span>
            <Money value={row.amount} className="shrink-0 text-[12.5px] font-medium text-[#102642]" />
            <span className="shrink-0 text-[10px] text-[#8ba0b3]">{row.currency}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApprovalCard({
  step,
  approval,
  deciding,
  onDecide,
  onOpenTask,
}: {
  step: AgentStep
  approval?: ApprovalView
  deciding: boolean
  onDecide: (id: string, decision: 'approved' | 'denied') => void
  onOpenTask: (taskId: string) => void
}) {
  const approvalId = (step.payload as { approvalId?: string } | undefined)?.approvalId
  const done = step.status === 'done' || step.status === 'error'
  const approved = step.status === 'done'
  return (
    <div
      className={
        approved
          ? 'rounded-xl border border-[#bfe5d8] bg-[#e2f4ed]/50 p-3'
          : step.status === 'error'
            ? 'rounded-xl border border-[#f3d4d4] bg-[#fdeaea]/60 p-3'
            : 'rounded-xl border border-[#e9d9b8] bg-[#fdf1df]/60 p-3'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck
          className="h-4 w-4 shrink-0"
          style={{ color: approved ? C.greenDeep : step.status === 'error' ? C.red : C.amber }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-[13px] font-medium text-[#102642]">
          {approval?.summary ?? step.label}
        </span>
        {approval && (
          <span className="text-[15px] font-semibold tabular-nums text-[#102642]">
            {approval.payload.amount.toLocaleString()} {approval.payload.currency}
          </span>
        )}
      </div>
      {approval && (
        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[11.5px] sm:grid-cols-2">
          <p className="truncate text-[#5a7189]">
            <span className="text-[#8ba0b3]">Rail:</span> {approval.payload.rail}
          </p>
          <p className="truncate text-[#5a7189]">
            <span className="text-[#8ba0b3]">Beneficiary:</span> {approval.payload.beneficiary}
          </p>
          <p className="truncate text-[#5a7189]">
            <span className="text-[#8ba0b3]">Mode:</span>{' '}
            <span className="font-mono text-[10.5px]">{approval.payload.mode}</span>
          </p>
          <p className="truncate text-[#5a7189]">
            <span className="text-[#8ba0b3]">Mandate:</span> {approval.payload.mandate}
          </p>
        </div>
      )}
      {!done && approval && (
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            size="sm"
            disabled={deciding}
            onClick={() => onDecide(approval.id, 'approved')}
            className="h-8 rounded-full px-4 text-[12.5px] font-medium text-white hover:opacity-90"
            style={{ background: C.green }}
          >
            {deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={deciding}
            onClick={() => onDecide(approval.id, 'denied')}
            className="h-8 rounded-full border-[#f3d4d4] px-4 text-[12.5px] text-[#b91c1c] hover:bg-[#fdeaea]"
          >
            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
            Deny
          </Button>
          <button
            type="button"
            onClick={() => onOpenTask(approval.taskId)}
            className="ml-auto text-[11.5px] text-[#5a7189] underline-offset-2 hover:text-[#087d62] hover:underline"
          >
            Open task
          </button>
        </div>
      )}
      {done && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: approved ? C.greenDeep : C.red }}>
          {approved ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />}
          {step.detail}
        </p>
      )}
      {approvalId && !approval && (
        <p className="mt-1.5 font-mono text-[10.5px] text-[#8ba0b3]">approval {approvalId} · decisions also appear under Approvals</p>
      )}
    </div>
  )
}

function StepBlock({
  step,
  approval,
  deciding,
  onDecide,
  onOpenTask,
}: {
  step: AgentStep
  approval?: ApprovalView
  deciding: boolean
  onDecide: (id: string, decision: 'approved' | 'denied') => void
  onOpenTask: (taskId: string) => void
}) {
  // AgentStepRow renders its own <li>, so composite steps return row + payload
  // as sibling <li> elements (fragments keep keys without nesting lists).
  if (step.kind === 'eeg' && Array.isArray(step.payload)) {
    return (
      <Fragment key={step.id}>
        <AgentStepRow label={step.label} status={step.status === 'error' ? 'done' : step.status} />
        <li className="pl-1">
          <RouteCard routes={step.payload as RouteCandidate[]} />
        </li>
      </Fragment>
    )
  }
  if (step.kind === 'quote' && step.payload && 'rate' in (step.payload as QuotePayload)) {
    return (
      <Fragment key={step.id}>
        <AgentStepRow label={step.label} status={step.status === 'error' ? 'done' : step.status} />
        <li className="pl-1">
          <QuoteCard quote={step.payload as QuotePayload} />
        </li>
      </Fragment>
    )
  }
  if (step.kind === 'ledger' && Array.isArray(step.payload)) {
    return (
      <Fragment key={step.id}>
        <AgentStepRow label={step.label} status={step.status === 'error' ? 'done' : step.status} />
        {step.status !== 'error' && (
          <li className="pl-1">
            <LedgerMini rows={step.payload as LedgerRow[]} />
          </li>
        )}
        {step.detail && step.status === 'done' && (
          <li>
            <p className="pl-1 text-[11px] leading-relaxed text-[#087d62]">{step.detail}</p>
          </li>
        )}
        {step.status === 'error' && step.detail && (
          <li>
            <p className="pl-1 text-[11px] leading-relaxed text-[#b45309]">{step.detail}</p>
          </li>
        )}
      </Fragment>
    )
  }
  if (step.kind === 'approval') {
    return (
      <li key={step.id}>
        <ApprovalCard
          step={step}
          approval={approval}
          deciding={deciding}
          onDecide={onDecide}
          onOpenTask={onOpenTask}
        />
      </li>
    )
  }
  return (
    <Fragment key={step.id}>
      <AgentStepRow label={step.label} status={step.status === 'error' ? 'done' : step.status} />
      {step.detail && (
        <li>
          <p
            className="truncate pl-7 text-[11px]"
            style={{ color: step.status === 'error' ? '#b45309' : '#8ba0b3' }}
            title={step.detail}
          >
            {step.detail}
          </p>
        </li>
      )}
    </Fragment>
  )
}

/* ------------------------------------------------------------------ */
/* Task view                                                           */
/* ------------------------------------------------------------------ */

export interface TaskViewProps {
  task: TaskDTO
  project: Project | null
  running: boolean
  approvals: ApprovalView[]
  decidingId: string | null
  candidates: Routine[] | null
  browserOpen: boolean
  browserUrl: string | null
  browserSolo?: boolean
  onBrowserSolo?: () => void
  onSend: (text: string) => void
  onDecideApproval: (id: string, decision: 'approved' | 'denied') => void
  onOpenProject: (id: string) => void
  onOpenTask: (id: string) => void
  onSelectRoutine: (routineId: string) => void
  onAgentDecide: () => void
  onPayGate: (gateId: string, choice: PaymentChoice) => void
  onCloseBrowser: () => void
  onGoalFromBrowser: (text: string, origin: TaskOrigin) => void
}

function lifecycleStage(task: TaskDTO): string {
  const steps = task.messages.flatMap((m) => m.steps ?? [])
  const gates = task.gates ?? []
  if (gates.some((g) => g.status === 'processing')) return 'Processing payment on sandbox rails'
  if (gates.some((g) => g.status === 'open')) return 'Merchant checkout open — choose how to pay'
  if (task.routine) {
    const done = task.routine.steps.filter((s) => s.status === 'done').length
    return `Executing routine · ${done}/${task.routine.steps.length} steps done`
  }
  if (steps.some((s) => s.kind === 'ledger' && s.status === 'done')) return 'Settled · evidence recorded'
  if (steps.some((s) => s.kind === 'approval' && s.status === 'running')) return 'Waiting for your approval'
  if (steps.some((s) => s.kind === 'eeg')) return 'Routes evaluated · preparing execution'
  if (steps.length > 0) return 'Discovering capabilities and routes'
  return 'Compiling goal into typed intents'
}

export function TaskView({
  task,
  project,
  running,
  approvals,
  decidingId,
  candidates,
  browserOpen,
  browserUrl,
  browserSolo = false,
  onBrowserSolo,
  onSend,
  onDecideApproval,
  onOpenProject,
  onOpenTask,
  onSelectRoutine,
  onAgentDecide,
  onPayGate,
  onCloseBrowser,
  onGoalFromBrowser,
}: TaskViewProps) {
  const threadRef = useRef<HTMLDivElement>(null)
  const messageCount = task.messages.length
  const lastStepCount = task.messages.reduce((n, m) => n + (m.steps?.length ?? 0), 0)
  const gates = task.gates ?? []
  const progressKey = [
    task.routine?.steps.map((s) => s.status).join(','),
    gates.map((g) => `${g.gateId}:${g.status}`).join(','),
  ].join('|')

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messageCount, lastStepCount, progressKey])

  const chips: ContextChip[] = []
  if (project) chips.push({ id: 'ctx-project', label: project.name })

  const approvalByStepId = new Map(approvals.filter((a) => a.stepId).map((a) => [a.stepId as string, a]))
  const approvalById = new Map(approvals.map((a) => [a.id, a]))
  const approvalFor = (step: AgentStep): ApprovalView | undefined => {
    const p = step.payload as { approvalId?: string } | undefined
    return (p?.approvalId && approvalById.get(p.approvalId)) || approvalByStepId.get(step.id)
  }

  // The latest gate drives the simulated browser (open/processing first, else the last one).
  const activeGate =
    gates.find((g) => g.status === 'open' || g.status === 'processing') ?? gates[gates.length - 1] ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* Chat column */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* Thread */}
        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 sm:px-6">
            <header className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-[#102642]">{task.title}</h1>
                {task.status === 'running' || running ? (
                  <StatusPill tone="amber">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute h-1.5 w-1.5 animate-ping rounded-full opacity-60" style={{ background: C.amberDot }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.amberDot }} />
                    </span>
                    Running
                  </StatusPill>
                ) : task.status === 'failed' ? (
                  <StatusPill tone="red">Failed</StatusPill>
                ) : (
                  <StatusPill tone="green">Completed</StatusPill>
                )}
                <span className="hidden text-[11px] text-[#8ba0b3] sm:inline">· {lifecycleStage(task)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8ba0b3]">
                {project ? (
                  <button
                    type="button"
                    onClick={() => onOpenProject(project.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e9] bg-white px-2 py-0.5 font-medium text-[#5a7189] hover:border-[#bfe5d8] hover:text-[#087d62]"
                  >
                    <span className="h-1.5 w-1.5 rounded-[3px]" style={{ background: project.color }} aria-hidden="true" />
                    {project.name}
                    <ChevronRight className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : (
                  <span>Unfiled</span>
                )}
                <span>· sandbox run · every consequential step is policy-gated</span>
                {task.origin?.type === 'browser' && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{ background: C.mint, color: C.greenDeep }}
                  >
                    <Globe className="h-3 w-3" aria-hidden="true" />
                    from browser · {safeHost(task.origin.url)}
                  </span>
                )}
              </div>
            </header>

            <div className="space-y-5">
              {task.messages.map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">You</p>
                    <div className="whitespace-pre-wrap rounded-2xl border border-[#dce5e9] bg-white p-4 text-[14px] leading-relaxed text-[#102642]">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <BrandMark size={22} className="rounded-md" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">
                        PaySwap Agent
                      </span>
                      <span className="text-[11px] text-[#c3d0da]">{fmtTime(msg.at)}</span>
                    </div>
                    {msg.steps && msg.steps.length > 0 && (
                      <ul className="mb-2 space-y-2 rounded-2xl border border-[#dce5e9] bg-white/70 p-3">
                        {msg.steps.map((step) => (
                          <StepBlock
                            key={step.id}
                            step={step}
                            approval={approvalFor(step)}
                            deciding={Boolean(decidingId)}
                            onDecide={onDecideApproval}
                            onOpenTask={onOpenTask}
                          />
                        ))}
                      </ul>
                    )}
                    {msg.content ? (
                      <div className="rounded-2xl border border-[#dce5e9] bg-white p-4 text-[14px] leading-relaxed text-[#102642]">
                        <Markdownish text={msg.content} />
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 rounded-full border-[#dce5e9] px-3 text-[12px] text-[#5a7189]"
                            onClick={() => {
                              void navigator.clipboard?.writeText(msg.content ?? '').catch(() => {})
                            }}
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            Copy
                          </Button>
                        </div>
                      </div>
                    ) : running ? (
                      <p className="flex items-center gap-2 text-[13px] text-[#8ba0b3]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Agent is working through the plan…
                      </p>
                    ) : null}
                  </div>
                ),
              )}
              {running && !task.messages.some((m) => m.role === 'agent') && (
                <p className="flex items-center gap-2 text-[13px] text-[#8ba0b3]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Agent is picking up the task…
                </p>
              )}

              {/* Pinned live-execution blocks: routine todos + payment gates */}
              {(task.routine || gates.length > 0) && (
                <section className="space-y-3" aria-label="Live routine execution">
                  {task.routine && <RoutineTodosCard routine={task.routine} />}
                  {gates.map((gate) => (
                    <PayGateCard
                      key={gate.gateId}
                      gate={gate}
                      deciding={gate.status === 'processing'}
                      onPay={onPayGate}
                    />
                  ))}
                </section>
              )}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-[#dce5e9] bg-[#f6f9fa]/90 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <Composer onSend={onSend} chips={chips} placeholder="Send a follow-up to the agent…" />
          </div>
        </div>
      </div>

      {/* Simulated browser — side panel on desktop (dockable to full window), full-screen overlay below lg */}
      {browserOpen && (
        <aside
          aria-label="Simulated browser"
          data-testid="browser-pane"
          className={
            browserSolo
              ? 'fixed inset-0 z-50 bg-white'
              : 'hidden h-full w-[520px] shrink-0 border-l border-[#dce5e9] lg:flex'
          }
        >
          <BrowserPanel
            variant="side"
            url={browserUrl}
            gate={activeGate}
            onPay={onPayGate}
            onGoal={onGoalFromBrowser}
            solo={browserSolo}
            onToggleSolo={onBrowserSolo}
          />
        </aside>
      )}
      {browserOpen && (
        <div role="dialog" aria-label="Simulated browser" className="fixed inset-0 z-50 lg:hidden">
          <BrowserPanel
            variant="overlay"
            url={browserUrl}
            gate={activeGate}
            onPay={onPayGate}
            onClose={onCloseBrowser}
            onGoal={onGoalFromBrowser}
          />
        </div>
      )}

      {/* Routine choice — non-dismissable while the agent awaits a decision */}
      {candidates && candidates.length > 0 && (
        <RoutinePickerDialog
          key={candidates.map((c) => c.id).join('|')}
          candidates={candidates}
          onSelectRoutine={onSelectRoutine}
          onAgentDecide={onAgentDecide}
        />
      )}
    </div>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

/** Minimal markdown rendering: headings, bold, inline code, bullets, paragraphs. */
function Markdownish({ text }: { text: string }) {
  const blocks = text.split('\n\n')
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        if (lines.every((l) => l.trim().startsWith('- ') || l.trim() === '')) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines
                .filter((l) => l.trim().startsWith('- '))
                .map((l, j) => (
                  <li key={j}>{inline(l.trim().slice(2))}</li>
                ))}
            </ul>
          )
        }
        if (/^#{1,6}\s/.test(lines[0].trim())) {
          return (
            <p key={i} className="text-[15px] font-semibold text-[#102642]">
              {inline(lines[0].trim().replace(/^#{1,6}\s/, ''))}
            </p>
          )
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>
      })}
    </div>
  )
}

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) parts.push(<strong key={m.index} className="font-semibold">{tok.slice(2, -2)}</strong>)
    else parts.push(<code key={m.index} className="rounded bg-[#f0f4f6] px-1 py-0.5 font-mono text-[12px] text-[#0b5d4a]">{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/* ------------------------------------------------------------------ */
/* New task landing                                                    */
/* ------------------------------------------------------------------ */

export interface NewTaskViewProps {
  initialText: string
  project: Project | null
  onSend: (text: string) => void
  browserOpen: boolean
  onToggleBrowser: () => void
  onGoalFromBrowser: (text: string, origin: TaskOrigin) => void
  browserSolo?: boolean
  onBrowserSolo?: () => void
  /** Home widgets rendered below the quick-action chips (unified landing page). */
  children?: React.ReactNode
}

const GOAL_CHIPS = [
  { label: 'browse jumia.com', text: 'browse jumia.com and buy wireless headphones for GHS 249' },
  { label: 'pay kwame 10 ghs', text: 'pay kwame 10 ghs' },
  { label: 'invest 100 ghs', text: 'invest 100 ghs in a money market fund' },
  { label: 'borrow 10 ghs', text: 'borrow 10 ghs until payday' },
]

const MERCHANT_CHIPS = [
  { label: 'run my shop', text: 'run my shop: summarize today sales and reconcile momo settlements' },
  { label: 'add stripe', text: 'add stripe to my shop checkout' },
  { label: 'accept momo', text: 'accept momo payments on my store' },
]

function ChipRow({ chips, onSend }: { chips: typeof GOAL_CHIPS; onSend: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onSend(chip.text)}
          aria-label={`Start goal: ${chip.text}`}
          className="rounded-full border border-[#dce5e9] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#5a7189] transition-colors hover:border-[#bfe5d8] hover:bg-[#e2f4ed]/40 hover:text-[#087d62]"
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

export function NewTaskView({
  initialText,
  project,
  onSend,
  browserOpen,
  onToggleBrowser,
  onGoalFromBrowser,
  browserSolo = false,
  onBrowserSolo,
  children,
}: NewTaskViewProps) {
  const chips: ContextChip[] = project ? [{ id: 'ctx-project', label: project.name }] : []
  const [chipList, setChipList] = useState<ContextChip[]>(chips)

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* Left — hero + composer (+ home widgets when unified with the landing page) */}
      <div className="min-w-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="flex min-h-full w-full max-w-2xl flex-col px-4 py-8 sm:px-6">
          <div className="my-auto flex flex-col">
            <div className="mb-6 flex flex-col items-center text-center">
              <BrandMark size={52} className="rounded-2xl" />
              <h1 className="mt-4 text-xl font-semibold text-[#102642] sm:text-2xl">
                What economic goal are we achieving?
              </h1>
              <p className="mt-1.5 max-w-md text-sm text-[#5a7189]">
                State the outcome — the agent loads a routine, works it as a todo list, opens merchant checkouts
                and swaps payment rails when they do not fit.
              </p>
            </div>

            <Composer
              key={initialText}
              onSend={onSend}
              initialText={initialText}
              chips={chipList}
              onChipRemove={(id) => setChipList((list) => list.filter((c) => c.id !== id))}
              autoFocus
              onToggleBrowser={onToggleBrowser}
              browserActive={browserOpen}
            />

            <div className="mt-6 space-y-3">
              <ChipRow chips={GOAL_CHIPS} onSend={onSend} />
              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ba0b3]">Merchant</p>
                <ChipRow chips={MERCHANT_CHIPS} onSend={onSend} />
              </div>
            </div>
          </div>

          {children && <div className="mt-12">{children}</div>}
        </div>
      </div>

      {/* Right — simulated browser (side on desktop, dockable to full window, overlay below lg) */}
      {browserOpen && (
        <aside
          aria-label="Simulated browser"
          data-testid="browser-pane"
          className={
            browserSolo
              ? 'fixed inset-0 z-50 bg-white'
              : 'hidden h-full w-[520px] shrink-0 border-l border-[#dce5e9] lg:flex'
          }
        >
          <BrowserPanel
            variant="side"
            url={null}
            gate={null}
            onPay={() => {}}
            onGoal={onGoalFromBrowser}
            solo={browserSolo}
            onToggleSolo={onBrowserSolo}
          />
        </aside>
      )}
      {browserOpen && (
        <div role="dialog" aria-label="Simulated browser" className="fixed inset-0 z-50 lg:hidden">
          <BrowserPanel
            variant="overlay"
            url={null}
            gate={null}
            onPay={() => {}}
            onClose={onToggleBrowser}
            onGoal={onGoalFromBrowser}
          />
        </div>
      )}
    </div>
  )
}
