'use client'

import { useState } from 'react'
import {
  ArrowRight,
  Bot,
  Circle,
  CircleCheck,
  CreditCard,
  Landmark,
  ListTodo,
  Loader2,
  ShoppingBag,
  Smartphone,
  Star,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type {
  CheckoutMethod,
  CheckoutMethodKind,
  PaymentChoice,
  PaymentGate,
  PaymentReceipt,
  Routine,
  RoutineRunState,
  RoutineRunStep,
} from '@/lib/agent-types'
import { cn } from '@/lib/utils'
import { C } from './bits'

/* ------------------------------------------------------------------ */
/* Shared formatting                                                   */
/* ------------------------------------------------------------------ */

/** Mono-friendly money label, e.g. "GHS 1,250.00". */
export function fmtMoney(amount: number, currency: string): string {
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${currency} ${n}`
}

const METHOD_ICON: Record<CheckoutMethodKind, typeof Smartphone> = {
  momo: Smartphone,
  card: CreditCard,
  bank: Landmark,
  wallet: Wallet,
}

/* ------------------------------------------------------------------ */
/* Routine todo block — faithful to the original ZCode todo tool UI    */
/* ------------------------------------------------------------------ */

function TodoStatusIcon({ status }: { status: RoutineRunStep['status'] }) {
  if (status === 'done') return <CircleCheck className="size-3.5 shrink-0" style={{ color: C.greenDeep }} aria-hidden="true" />
  if (status === 'active') return <ArrowRight className="size-3.5 shrink-0 text-[#102642]" aria-hidden="true" />
  return <Circle className="size-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
}

const TODO_TEXT: Record<RoutineRunStep['status'], string> = {
  pending: 'text-[#8ba0b3]',
  active: 'text-[#102642]',
  done: 'text-[#8ba0b3] line-through',
}

export function RoutineTodosCard({ routine }: { routine: RoutineRunState }) {
  const [open, setOpen] = useState(true)
  const doneCount = routine.steps.filter((s) => s.status === 'done').length
  return (
    <section
      aria-label={`Routine ${routine.name}`}
      className="overflow-hidden rounded-2xl border border-[#dce5e9] bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Toggle routine todo list"
        className="flex w-full min-w-0 items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <ListTodo className="size-4 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
        <span className="shrink-0 text-[13px] text-[#8ba0b3]">Routine</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#8ba0b3]">{routine.name}</span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[#8ba0b3]">
          {doneCount}/{routine.steps.length}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="border-t border-[#eef2f5] px-3.5 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-1.5 pb-2 text-[11px] text-[#8ba0b3]">
            <span className="font-medium text-[#5a7189]">{routine.publisher}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">v{routine.version}</span>
            <span
              className="ml-auto inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
              style={{ background: C.mint, color: C.greenDeep }}
            >
              Loaded routine
            </span>
          </div>
          <div className="space-y-1 rounded-xl bg-[#f6f9fa] px-3 py-2">
            {routine.steps.map((step, i) => (
              <div key={`${step.title}-${i}`} className="flex min-w-0 items-center gap-2 py-1 text-[13px]">
                <TodoStatusIcon status={step.status} />
                <span className={cn('min-w-0 break-words', TODO_TEXT[step.status])}>{step.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('size-4 shrink-0 text-[#8ba0b3] transition-transform duration-200', open && 'rotate-180')}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Routine picker — shown while the agent awaits a routine choice      */
/* ------------------------------------------------------------------ */

export function RoutinePickerDialog({
  candidates,
  onSelectRoutine,
  onAgentDecide,
}: {
  candidates: Routine[]
  onSelectRoutine: (routineId: string) => void
  onAgentDecide: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  return (
    <Dialog open onOpenChange={(next) => { if (!next) return }}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
        className="max-w-lg gap-0 overflow-hidden rounded-2xl border-[#dce5e9] p-0"
      >
        <div className="px-5 pb-1 pt-5">
          <DialogTitle className="text-[15px] font-semibold text-[#102642]">
            Multiple routines claim this goal
          </DialogTitle>
          <DialogDescription className="mt-1 text-[12.5px] leading-relaxed text-[#5a7189]">
            Pick the playbook the agent should load, or let it decide from fit and ratings.
          </DialogDescription>
        </div>
        <div role="radiogroup" aria-label="Routine candidates" className="max-h-[46vh] space-y-2 overflow-y-auto px-5 py-3.5">
          {candidates.map((r) => {
            const selected = selectedId === r.id
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  'block w-full rounded-xl border p-3 text-left transition-colors',
                  selected
                    ? 'border-[#bfe5d8] bg-[#e2f4ed]/60'
                    : 'border-[#dce5e9] bg-white hover:border-[#bfe5d8] hover:bg-[#f6f9fa]',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#102642]">{r.name}</span>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                    style={{ background: C.mint, color: C.greenDeep }}
                  >
                    {r.category}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] text-[#8ba0b3]">v{r.version}</span>
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-[#5a7189]">
                  {r.publisher} · {r.installs.toLocaleString()} installs
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8ba0b3]">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 text-[#b45309]" aria-hidden="true" />
                    {r.rating.userScore.toFixed(1)} ({r.rating.userCount})
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bot className="h-3 w-3 text-[#087d62]" aria-hidden="true" />
                    agent {r.rating.agentScore.toFixed(1)} ({r.rating.agentCount})
                  </span>
                </div>
                {r.steps.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-[#5a7189]">
                    {r.steps.slice(0, 2).map((s, i) => (
                      <li key={`${r.id}-step-${i}`} className="flex min-w-0 items-center gap-1.5">
                        <Circle className="size-2 shrink-0 text-[#c3d0da]" aria-hidden="true" />
                        <span className="min-w-0 truncate">{s.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-[#eef2f5] px-5 py-3.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onAgentDecide}
            className="h-9 rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189] hover:bg-[#f6f9fa]"
          >
            Let the agent decide
          </Button>
          <Button
            type="button"
            disabled={!selectedId}
            onClick={() => selectedId && onSelectRoutine(selectedId)}
            className="h-9 rounded-full px-4 text-[12.5px] font-medium text-white hover:opacity-90"
            style={{ background: C.green }}
          >
            Use selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Checkout method rows (shared by PayGateCard and BrowserPanel)       */
/* ------------------------------------------------------------------ */

function MethodRow({
  method,
  connected,
  justConnected,
  disabled,
  onConnect,
  onPay,
}: {
  method: CheckoutMethod
  connected: boolean
  justConnected: boolean
  disabled: boolean
  onConnect?: () => void
  onPay?: () => void
}) {
  const Icon = METHOD_ICON[method.kind]
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f6f9fa]">
        <Icon className="h-4 w-4 text-[#5a7189]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#102642]">{method.label}</p>
        <p className="text-[10.5px] capitalize text-[#8ba0b3]">{method.kind}</p>
      </div>
      {connected ? (
        <>
          <span
            className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium"
            style={{ background: C.mint, color: C.greenDeep }}
          >
            Connected
          </span>
          {onPay && (
            <button
              type="button"
              onClick={onPay}
              disabled={disabled}
              aria-label={`Pay with ${method.label}`}
              className="shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium text-[#087d62] hover:bg-[#e2f4ed] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Pay
            </button>
          )}
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onConnect}
          disabled={disabled || !onConnect}
          aria-label={`Connect ${method.label}`}
          className="h-7 shrink-0 rounded-full border-[#dce5e9] px-3 text-[12px] text-[#5a7189] hover:bg-[#f6f9fa]"
        >
          Connect
        </Button>
      )}
      {justConnected && connected && (
        <span className="sr-only">(connected for this session — paying will include a connect step)</span>
      )}
    </div>
  )
}

/**
 * Eligible payment methods + the PaySwap route button.
 * Connect state is local to this component (sandbox simulation).
 */
export function CheckoutMethodsPanel({
  methods,
  disabled,
  onPayChoice,
}: {
  methods: CheckoutMethod[]
  disabled: boolean
  onPayChoice: (choice: PaymentChoice) => void
}) {
  const [justConnected, setJustConnected] = useState<string[]>([])
  const isConnected = (m: CheckoutMethod) => m.connected || justConnected.includes(m.id)
  const connect = (id: string) => setJustConnected((list) => (list.includes(id) ? list : [...list, id]))

  const firstConnectedRail = methods.find(
    (m) => isConnected(m) && (m.kind === 'momo' || m.kind === 'card'),
  )

  return (
    <div>
      <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">
        Eligible payment methods
      </p>
      <div className="divide-y divide-[#eef2f5]">
        {methods.map((m) => {
          const connected = isConnected(m)
          const newlyConnected = justConnected.includes(m.id)
          return (
            <MethodRow
              key={m.id}
              method={m}
              connected={connected}
              justConnected={newlyConnected}
              disabled={disabled}
              onConnect={m.connected ? undefined : () => connect(m.id)}
              onPay={
                connected
                  ? () =>
                      onPayChoice(
                        newlyConnected
                          ? { mode: 'connect_and_pay', railLabel: m.label }
                          : { mode: 'merchant_rail', railLabel: m.label },
                      )
                  : undefined
              }
            />
          )
        })}
      </div>
      <div className="mt-2.5 border-t border-[#eef2f5] pt-3">
        {disabled && (
          <p className="flex items-center gap-1.5 pb-2 text-[11.5px] text-[#b45309]" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Processing on sandbox rails…
          </p>
        )}
        <button
          type="button"
          onClick={() =>
            onPayChoice({
              mode: 'payswap_route',
              preferredRailLabel: firstConnectedRail?.label,
            })
          }
          disabled={disabled}
          aria-label="Pay with PaySwap through node routes"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full px-4 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: C.green }}
        >
          Pay with PaySwap — find a route through nodes
        </button>
        <p className="pt-1.5 text-[10.5px] leading-relaxed text-[#8ba0b3]">
          Broadcasts the intent to PaySwap nodes — bids are collected and the cheapest eligible route wins.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Payment gate card + receipt                                         */
/* ------------------------------------------------------------------ */

export function ReceiptCard({ receipt }: { receipt: PaymentReceipt }) {
  return (
    <div className="rounded-xl border border-[#bfe5d8] bg-[#e2f4ed]/50 p-3.5" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <CircleCheck className="size-4.5 shrink-0 text-[#087d62]" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[#102642]">Payment settled</span>
        <span className="ml-auto shrink-0 font-mono text-[11.5px] text-[#5a7189]">{receipt.ref}</span>
      </div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
        <div className="min-w-0">
          <dt className="text-[#8ba0b3]">Rail</dt>
          <dd className="truncate font-medium text-[#102642]">{receipt.railLabel}</dd>
        </div>
        <div className="min-w-0 text-right sm:text-left">
          <dt className="text-[#8ba0b3]">Fee</dt>
          <dd className="font-mono tabular-nums text-[#102642]">
            {fmtMoney(receipt.fee, receipt.currency)} · {receipt.feeBps}bps
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[#8ba0b3]">ETA</dt>
          <dd className="font-medium text-[#102642]">~{receipt.etaMinutes} min</dd>
        </div>
        <div className="min-w-0 text-right sm:text-left">
          <dt className="text-[#8ba0b3]">Amount</dt>
          <dd className="font-mono font-semibold tabular-nums text-[#102642]">
            {fmtMoney(receipt.amount, receipt.currency)}
          </dd>
        </div>
      </dl>
      {receipt.awardedNode && (
        <div className="mt-2.5 rounded-lg bg-white/70 px-2.5 py-2">
          <p className="text-[12px] font-medium text-[#102642]">
            Route won by {receipt.awardedNode} · opportunity{' '}
            <span className="font-mono text-[11px]">{receipt.opportunityId}</span> awarded
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#5a7189]">
            Broadcast to PaySwap nodes — bids were collected and the best route won.
          </p>
        </div>
      )}
      <p className="mt-2.5 text-[11px] text-[#8ba0b3]">Filed to Activity with full evidence.</p>
    </div>
  )
}

export function PayGateCard({
  gate,
  deciding,
  onPay,
}: {
  gate: PaymentGate
  deciding: boolean
  onPay: (gateId: string, choice: PaymentChoice) => void
}) {
  return (
    <section
      aria-label={`Payment gate for ${gate.checkout.store}`}
      className="rounded-2xl border border-[#dce5e9] bg-white"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5">
        <ShoppingBag className="size-4 shrink-0 text-[#5a7189]" aria-hidden="true" />
        <span className="min-w-0 truncate text-[13px] font-semibold text-[#102642]">
          Payment · {gate.checkout.store}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[13px] font-semibold tabular-nums text-[#102642]">
          {fmtMoney(gate.checkout.price, gate.checkout.currency)}
        </span>
      </div>
      <p className="px-4 pt-0.5 text-[12px] text-[#8ba0b3]">
        {gate.checkout.item} · <span className="font-mono text-[11px]">{gate.checkout.url}</span>
      </p>
      <div className="px-4 pb-4 pt-2">
        {gate.status === 'settled' && gate.receipt ? (
          <ReceiptCard receipt={gate.receipt} />
        ) : (
          <>
            {gate.status === 'failed' && (
              <p className="pb-2 text-[11.5px] text-[#b91c1c]" role="alert">
                The payment attempt failed on the sandbox rail — retry below or let the agent re-route.
              </p>
            )}
            <CheckoutMethodsPanel
              methods={gate.checkout.methods}
              disabled={gate.status === 'processing' || deciding}
              onPayChoice={(choice) => onPay(gate.gateId, choice)}
            />
          </>
        )}
      </div>
    </section>
  )
}
