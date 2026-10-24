/**
 * PaySwap agent runtime — ROUTINE-DRIVEN.
 *
 * Economic goals are fulfilled by loading ROUTINES (playbooks) and executing
 * them as todo lists, step by step. Merchant checkout rails are simulated:
 * a payment step opens a checkout gate on the task; the surface pays it via
 * POST /api/checkout/pay; when merchant rails do not fit, the run broadcasts
 * an OPPORTUNITY that PaySwap nodes bid on.
 *
 * Streams NDJSON RunEvents; persists routine/gate state to the DB so threads
 * survive reloads. The z-ai-web-dev-sdk LLM supplies conversational text;
 * every LLM call has a deterministic fallback so the run never stalls.
 */

import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import type {
  ApprovalPayload,
  CheckoutMethod,
  CheckoutSession,
  PaymentGate,
  PaymentReceipt,
  PaySettings,
  RunEvent,
  Routine,
  RoutineRunState,
  RoutineStep,
  TaskOrigin,
} from '@/lib/agent-types'
import {
  createApproval,
  needsApproval,
  readSettings,
  waitForApproval,
} from '@/server/finance'
import { bumpAgentRating, getRoutine, listRoutines } from '@/server/routines'
import { getOpportunity } from '@/server/opportunities'

type ZAIClient = Awaited<ReturnType<typeof ZAI.create>> | null
type Emit = (event: RunEvent) => void

const BROWSE_INTENT = /(browse|open)\s+\w+\.(com|gh|io)|jumia|shop online/i
const DEFAULT_STORE_URL = 'https://www.jumia.com.gh'
const GATE_POLL_MS = 1_000
const GATE_POLL_MAX_MS = 10 * 60_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pace = () => sleep(700 + Math.round(Math.random() * 500))

function ref8(): string {
  return Math.random().toString(36).slice(2, 10)
}

function money(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* LLM helper (fallback-safe)                                          */
/* ------------------------------------------------------------------ */

async function llmReply(
  zai: ZAIClient,
  system: string,
  user: string,
  fallback: string,
): Promise<string> {
  if (!zai) return fallback
  try {
    const completion = (await zai.chat.completions.create({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      thinking: { type: 'disabled' },
    })) as { choices?: Array<{ message?: { content?: string } }> }
    const text = (completion.choices?.[0]?.message?.content ?? '').trim()
    return text || fallback
  } catch {
    return fallback
  }
}

const COMMENTARY_SYSTEM =
  'You are the PaySwap agent executing an economic routine step by step. ' +
  'Reply with ONE short plain sentence (at most two), English, no markdown, no emojis, ' +
  'referring to the concrete details you were given (item, store, amount, rail).'

/* ------------------------------------------------------------------ */
/* Goal parsing helpers                                                */
/* ------------------------------------------------------------------ */

/** Word-boundary-ish keyword presence check. */
function keywordHit(goalLower: string, kw: string): boolean {
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(goalLower)
}

function extractUrl(goal: string): string | null {
  const abs = goal.match(/https?:\/\/[^\s]+/i)
  if (abs) return abs[0]
  const bare = goal.match(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|gh|io)(?:\.[a-z]{2})?(?:\/[^\s]*)?\b/i)
  return bare ? `https://${bare[0]}` : null
}

function storeLabel(url: string): string {
  try {
    const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '')
    const label = host.split('.')[0]
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Store'
  } catch {
    return 'Store'
  }
}

function currencyFromWord(goal: string): string {
  const g = goal.toLowerCase()
  if (/\b(usdc|usd|dollars?)\b|\$/.test(g)) return /\busdc\b/.test(g) ? 'USDC' : 'USD'
  if (/\b(ngn|naira)\b|₦/.test(g)) return 'NGN'
  if (/\b(kes|shillings?)\b/.test(g)) return 'KES'
  if (/\beur\b|€/.test(g)) return 'EUR'
  if (/\bgbp\b|£/.test(g)) return 'GBP'
  return 'GHS' // ghs, cedis, ₵ or unspecified
}

function parseAmount(goal: string): { price: number; currency: string } {
  const m = goal.match(/(?:ghs|cedis|usd|usdc|dollars?|ngn|kes|eur|gbp|[$₵₦€£])?\s*(\d[\d,]*(?:\.\d+)?)\s*(ghs|cedis|usd|usdc|dollars?|ngn|kes|eur|gbp)?/i)
  const price = m ? Math.round(Number(m[1].replace(/,/g, '')) * 100) / 100 : 10
  return { price: Number.isFinite(price) && price > 0 ? price : 10, currency: currencyFromWord(goal) }
}

/* ------------------------------------------------------------------ */
/* Checkout session synthesis (simulated merchant rails)               */
/* ------------------------------------------------------------------ */

function checkoutMethods(): CheckoutMethod[] {
  return [
    { id: 'momo-mtn', label: 'MTN MoMo', kind: 'momo', connected: true },
    { id: 'momo-vodafone', label: 'Vodafone Cash', kind: 'momo', connected: false },
    { id: 'momo-airteltigo', label: 'AirtelTigo', kind: 'momo', connected: false },
    { id: 'card-visa', label: 'Visa', kind: 'card', connected: true },
    { id: 'card-mastercard', label: 'Mastercard', kind: 'card', connected: false },
    { id: 'bank-transfer', label: 'Bank transfer', kind: 'bank', connected: false },
    { id: 'wallet-jumiapay', label: 'JumiaPay', kind: 'wallet', connected: false },
  ]
}

function buildCheckout(origin: TaskOrigin | null, goal: string): CheckoutSession {
  if (origin) {
    return {
      store: storeLabel(origin.url),
      url: origin.url,
      item: origin.item,
      price: origin.price,
      currency: origin.currency,
      methods: checkoutMethods(),
    }
  }
  const { price, currency } = parseAmount(goal)
  return {
    store: 'PaySwap Checkout',
    url: 'payswap.local/checkout',
    item: goal.slice(0, 80),
    price,
    currency,
    methods: checkoutMethods(),
  }
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

export async function runAgent(opts: {
  taskId: string
  message?: string
  routineId?: string
  emit: Emit
  signal?: AbortSignal
}): Promise<void> {
  const { taskId, emit } = opts
  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) {
    emit({ type: 'error', taskId, message: 'Task not found.' })
    return
  }

  // Follow-up message with an existing task: treat it as the new goal.
  const goal = (opts.message ?? '').trim() || task.goal || task.title
  if (opts.message) {
    await db.message.create({ data: { taskId, role: 'user', content: opts.message.trim() } })
    await db.task
      .update({ where: { id: taskId }, data: { goal: goal.slice(0, 200) } })
      .catch(() => {})
  }
  await db.task.update({ where: { id: taskId }, data: { status: 'running' } })

  const agentMessage = await db.message.create({
    data: { taskId, role: 'agent', content: '', steps: '[]' },
  })
  const contentParts: string[] = []
  const persistContent = (part?: string) => {
    if (part) contentParts.push(part)
    void db.message
      .update({ where: { id: agentMessage.id }, data: { content: contentParts.join('\n\n') } })
      .catch(() => {})
  }

  try {
    const settings: PaySettings = await readSettings()
    let zai: ZAIClient = null
    try {
      zai = await ZAI.create()
    } catch {
      zai = null // deterministic fallbacks carry the run
    }

    let routineId = opts.routineId ?? null

    /* ---------------- Phase A: match a routine ---------------------- */
    if (!routineId) {
      const routines = await listRoutines()
      const goalLower = goal.toLowerCase()

      const browse = BROWSE_INTENT.test(goal)
      if (browse) {
        const url = extractUrl(goal) ?? DEFAULT_STORE_URL
        emit({
          type: 'open_browser',
          taskId,
          url,
          reason: 'Browse intent detected — opening the storefront before matching a purchase routine.',
        })
      }

      const scored = routines
        .map((r) => ({ r, hits: r.keywords.filter((kw) => keywordHit(goalLower, kw)).length }))
        .filter((s) => s.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.r.rating.agentScore - a.r.rating.agentScore)

      if (scored.length === 0) {
        const fallback =
          'No routine in the library matches that goal yet. Open the Routines tab to browse, install or publish one, then run the goal again.'
        const content = await llmReply(
          zai,
          'You are the PaySwap agent. The user goal did not match any routine in the library. Reply with one or two short plain sentences: say no routine matched and suggest the Routines tab to browse or publish one. No markdown, no emojis.',
          `User goal: ${goal}`,
          fallback,
        )
        emit({ type: 'message', taskId, content })
        persistContent(content)
        await db.task.update({ where: { id: taskId }, data: { status: 'completed' } })
        emit({
          type: 'done',
          taskId,
          messageId: agentMessage.id,
          content,
          status: 'completed',
        })
        return
      }

      if (scored.length >= 2) {
        const candidates: Routine[] = scored.slice(0, 3).map((s) => s.r)
        persistContent(
          `Matched ${scored.length} routines for "${goal.slice(0, 80)}" — presenting candidates. Pick one to run it.`,
        )
        // Candidates path: the stream ends WITHOUT a done event; the task
        // stays running and the surface re-calls with the chosen routineId.
        emit({ type: 'candidates', taskId, candidates })
        return
      }

      routineId = scored[0].r.id
    }

    /* ---------------- Phase B: execute the routine ------------------ */
    const routine = await getRoutine(routineId)
    if (!routine) {
      const content = 'That routine could not be found in the library.'
      emit({ type: 'error', taskId, message: content })
      await db.task.update({ where: { id: taskId }, data: { status: 'failed' } })
      emit({ type: 'done', taskId, messageId: agentMessage.id, content, status: 'failed' })
      return
    }

    const origin = parseJson<TaskOrigin>(task.originJson)
    const runState: RoutineRunState = {
      routineId: routine.id,
      name: routine.name,
      publisher: routine.publisher,
      version: routine.version,
      steps: routine.steps.map((s: RoutineStep) => ({
        title: s.title,
        kind: s.kind,
        status: 'pending' as const,
        detail: s.detail,
      })),
    }
    const persistRoutine = () =>
      db.task
        .update({ where: { id: taskId }, data: { routineJson: JSON.stringify(runState) } })
        .catch(() => {})
    await persistRoutine()
    emit({ type: 'routine', taskId, routine: runState })

    let lastReceipt: PaymentReceipt | null = null
    let browserEmitted = false

    for (let i = 0; i < runState.steps.length; i++) {
      if (opts.signal?.aborted) return
      if (i > 0) await pace()

      const step = runState.steps[i]
      step.status = 'active'
      await persistRoutine()
      emit({ type: 'routine_step', taskId, stepIndex: i, status: 'active' })

      /* --- conversational commentary (LLM with deterministic fallback) --- */
      const detailCtx = [
        `Routine: ${routine.name} (${routine.publisher} v${routine.version})`,
        `Goal: ${goal}`,
        origin ? `Browser origin: ${origin.item} at ${origin.url} for ${money(origin.price)} ${origin.currency}` : 'No browser origin.',
        `Step ${i + 1}/${runState.steps.length}: "${step.title}" (kind ${step.kind})${step.detail ? ` — ${step.detail}` : ''}`,
      ].join('\n')
      const fallbackFor = (kind: RoutineStep['kind'], title: string): string => {
        if (kind === 'browser')
          return origin
            ? `Opening ${origin.url} and locating ${origin.item}.`
            : 'Opening the storefront in the browser to continue the flow.'
        if (kind === 'settings')
          return `Configuring "${title}" under Settings, PaySwap, Connections.`
        if (kind === 'payment') return 'Opening the checkout gate so the payment can be reviewed and settled.'
        return `Working on "${title}" against the goal.`
      }
      const commentary = await llmReply(zai, COMMENTARY_SYSTEM, detailCtx, fallbackFor(step.kind, step.title))
      emit({ type: 'message', taskId, content: commentary })
      persistContent(commentary)

      /* --- step execution by kind --------------------------------- */
      if (step.kind === 'browser') {
        if (origin) {
          step.detail = `Opened ${origin.url} — ${origin.item} located`
          step.status = 'done'
          await persistRoutine()
          emit({ type: 'routine_step', taskId, stepIndex: i, status: 'done', detail: step.detail })
          continue
        }
        if (!browserEmitted) {
          browserEmitted = true
          const url = extractUrl(goal) ?? DEFAULT_STORE_URL
          emit({ type: 'open_browser', taskId, url, reason: `Routine step: ${step.title}` })
        }
        step.detail = 'Store page opened in the browser'
        step.status = 'done'
        await persistRoutine()
        emit({ type: 'routine_step', taskId, stepIndex: i, status: 'done', detail: step.detail })
        continue
      }

      if (step.kind === 'settings') {
        step.detail = 'Settings → PaySwap → Connections'
        step.status = 'done'
        await persistRoutine()
        emit({ type: 'routine_step', taskId, stepIndex: i, status: 'done', detail: step.detail })
        continue
      }

      if (step.kind === 'payment') {
        const checkout = buildCheckout(origin, goal)

        // Approval gate BEFORE the checkout gate when policy requires it.
        if (needsApproval(checkout.price, settings)) {
          const payload: ApprovalPayload = {
            amount: checkout.price,
            currency: checkout.currency,
            rail: 'checkout gate',
            beneficiary: checkout.store,
            mode: 'COMPOSED_PAYSWAP',
            routeLabel: `${checkout.store} checkout`,
            mandate: `mandate: daily cap ${money(settings.mandateDailyCap)} ${checkout.currency} · velocity ${settings.mandateVelocity}/day · epoch ${Date.now().toString(36)}`,
            epoch: 1,
            evidence: [
              `policy decision: amount above auto-approve limit (${money(settings.autoApproveLimit)} ${checkout.currency})`,
              `routine: ${routine.name}`,
            ],
          }
          const approval = await createApproval({
            taskId,
            stepId: `ap_${i}_${ref8()}`,
            summary: `Approve ${money(checkout.price)} ${checkout.currency} at ${checkout.store} (${routine.name})`,
            payload,
          })
          emit({ type: 'approval', taskId, approval, stepId: approval.stepId ?? `ap_${i}` })
          const decision = await waitForApproval(approval.id)
          emit({
            type: 'approval_resolved',
            taskId,
            approvalId: approval.id,
            decision,
            stepId: approval.stepId ?? `ap_${i}`,
          })
          if (decision !== 'approved') {
            const content =
              decision === 'denied'
                ? `Payment of ${money(checkout.price)} ${checkout.currency} was denied — the routine stops here and nothing was executed.`
                : 'The approval window expired, so the checkout gate was never opened. Run the routine again to retry.'
            step.status = 'done'
            step.detail = decision === 'denied' ? 'Denied by user' : 'Approval expired'
            await persistRoutine()
            await db.task.update({ where: { id: taskId }, data: { status: 'failed' } })
            emit({ type: 'message', taskId, content })
            persistContent(content)
            emit({ type: 'done', taskId, messageId: agentMessage.id, content, status: 'failed' })
            return
          }
        }

        // Open the checkout gate and wait for the surface to settle it.
        const gate: PaymentGate = {
          gateId: `gate_${ref8()}`,
          stepIndex: i,
          checkout,
          status: 'open',
        }
        const existingGates = parseJson<PaymentGate[]>(
          (await db.task.findUnique({ where: { id: taskId }, select: { gatesJson: true } }))?.gatesJson,
        )
        const gates = [...(existingGates ?? []), gate]
        await db.task
          .update({ where: { id: taskId }, data: { gatesJson: JSON.stringify(gates) } })
          .catch(() => {})
        emit({ type: 'checkout', taskId, gate, stepIndex: i })

        const settled = await pollGate(taskId, gate.gateId, opts.signal)
        if (!settled) {
          const content = `The checkout gate at ${checkout.store} is still open after the wait window — nothing was charged. Settle it from the checkout panel, or run the routine again.`
          step.status = 'done'
          step.detail = 'Checkout gate left open (timeout)'
          await persistRoutine()
          await db.task.update({ where: { id: taskId }, data: { status: 'failed' } })
          emit({ type: 'message', taskId, content })
          persistContent(content)
          emit({ type: 'done', taskId, messageId: agentMessage.id, content, status: 'failed' })
          return
        }

        lastReceipt = settled.receipt
        step.detail = `Settled via ${settled.receipt.railLabel} · ${settled.receipt.ref}`
        step.status = 'done'
        await persistRoutine()
        emit({ type: 'routine_step', taskId, stepIndex: i, status: 'done', detail: step.detail })

        emit({ type: 'payment_receipt', taskId, gateId: gate.gateId, receipt: settled.receipt })
        if (settled.receipt.opportunityId) {
          const opportunity = await getOpportunity(settled.receipt.opportunityId)
          if (opportunity) emit({ type: 'opportunity', taskId, opportunity })
        }
        continue
      }

      // 'action' and 'approval' steps: commentary carries them; file detail.
      step.detail = origin
        ? `Checked against ${origin.item} (${storeLabel(origin.url)})`
        : 'Completed for this goal'
      step.status = 'done'
      await persistRoutine()
      emit({ type: 'routine_step', taskId, stepIndex: i, status: 'done', detail: step.detail })
    }

    /* ---------------- Completion ------------------------------------ */
    const receiptLine = lastReceipt
      ? ` Payment settled via ${lastReceipt.railLabel} — ref ${lastReceipt.ref}, fee ${money(lastReceipt.fee)} ${lastReceipt.currency}, ETA ${lastReceipt.etaMinutes}m. Evidence is filed in Activity.`
      : ''
    const fallback = `Routine "${routine.name}" completed (${runState.steps.length} steps).${receiptLine}`
    const content = await llmReply(
      zai,
      'You are the PaySwap agent closing out a completed routine. Reply with one or two short plain sentences summarizing the outcome, mentioning the routine name and — if given — the receipt reference and rail. No markdown, no emojis.',
      [
        `Routine: ${routine.name} by ${routine.publisher}`,
        `Goal: ${goal}`,
        lastReceipt
          ? `Receipt: ref ${lastReceipt.ref}, rail ${lastReceipt.railLabel}, ${money(lastReceipt.amount)} ${lastReceipt.currency}, fee ${money(lastReceipt.fee)} ${lastReceipt.currency}${lastReceipt.awardedNode ? `, node ${lastReceipt.awardedNode}` : ''}`
          : 'No payment in this routine.',
      ].join('\n'),
      fallback,
    )
    emit({ type: 'message', taskId, content })
    persistContent(content)
    await db.task.update({ where: { id: taskId }, data: { status: 'completed' } })
    emit({ type: 'done', taskId, messageId: agentMessage.id, content, status: 'completed' })
    void bumpAgentRating(routine.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent runtime failure.'
    await db.task.update({ where: { id: taskId }, data: { status: 'failed' } }).catch(() => {})
    emit({ type: 'error', taskId, message })
    emit({
      type: 'done',
      taskId,
      messageId: agentMessage.id,
      content: `The run failed before completion: ${message}. Nothing was executed unless a settled checkout gate above says otherwise.`,
      status: 'failed',
    })
  }
}

/* ------------------------------------------------------------------ */
/* Gate polling                                                        */
/* ------------------------------------------------------------------ */

async function pollGate(
  taskId: string,
  gateId: string,
  signal?: AbortSignal,
): Promise<{ receipt: PaymentReceipt } | null> {
  const deadline = Date.now() + GATE_POLL_MAX_MS
  while (Date.now() < deadline) {
    if (signal?.aborted) return null
    const row = await db.task.findUnique({ where: { id: taskId }, select: { gatesJson: true } })
    const gates = parseJson<PaymentGate[]>(row?.gatesJson) ?? []
    const gate = gates.find((g) => g.gateId === gateId)
    if (gate?.status === 'settled' && gate.receipt) return { receipt: gate.receipt }
    if (gate?.status === 'failed') return null
    await sleep(GATE_POLL_MS)
  }
  return null
}
