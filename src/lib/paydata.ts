/**
 * Mock domain data for the PaySwap workspace preview.
 * Every entity has a stable id so the whole UI is navigable
 * via hash routes: #/task/t2, #/project/p3, #/automations, ...
 */

export type StepStatus = 'done' | 'running' | 'pending'

export interface AgentStep {
  id: string
  label: string
  status: StepStatus
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content?: string
  steps?: AgentStep[]
  at: string
}

export type TaskStatus = 'running' | 'completed'

export interface Task {
  id: string
  title: string
  projectId: string | null
  status: TaskStatus
  createdAt: string
  messages: ChatMessage[]
}

export interface Project {
  id: string
  name: string
  groupId: string
  color: string
  description: string
  volume30d: number
  successRate: number
}

export interface Group {
  id: string
  name: string
  projectIds: string[]
}

export type AutomationLastResult = 'ok' | 'warn' | 'fail'

export interface Automation {
  id: string
  name: string
  detail: string
  schedule: string
  nextRun: string
  enabled: boolean
  lastResult: AutomationLastResult
  lastRunAt: string
}

export type PluginCategory = 'Gateways' | 'Payouts' | 'Compliance' | 'Tools'

export interface Plugin {
  id: string
  name: string
  vendor: string
  description: string
  category: PluginCategory
  installed: boolean
  installs: string
  rating: number
}

export interface Channel {
  id: string
  name: string
  kind: 'card' | 'mobile' | 'bank'
  status: 'live' | 'degraded' | 'testing'
  volume24h: number
  trend: number[]
}

export interface Stats {
  settledToday: number
  deltaToday: number
  payoutsPending: number
  payoutsCount: number
  disputesOpen: number
  disputesDeadline: number
  successRate: number
  successDelta: number
  trend: number[]
}

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

export const groups: Group[] = [
  { id: 'g1', name: 'Acquiring', projectIds: ['p1', 'p2'] },
  { id: 'g2', name: 'Money movement', projectIds: ['p3', 'p4'] },
  { id: 'g3', name: 'Risk & compliance', projectIds: ['p5', 'p6'] },
]

export const projects: Project[] = [
  {
    id: 'p1',
    name: 'Checkout API',
    groupId: 'g1',
    color: '#0b8b6c',
    description: 'Hosted checkout, wallets and payment links.',
    volume30d: 1284022.4,
    successRate: 99.1,
  },
  {
    id: 'p2',
    name: 'Merchant dashboard',
    groupId: 'g1',
    color: '#29c29a',
    description: 'Balance, payouts and reports for merchants.',
    volume30d: 312880.0,
    successRate: 99.8,
  },
  {
    id: 'p3',
    name: 'Settlement engine',
    groupId: 'g2',
    color: '#d97706',
    description: 'Daily settlement files, ledger matching, payouts.',
    volume30d: 4123380.55,
    successRate: 99.4,
  },
  {
    id: 'p4',
    name: 'FX & payouts',
    groupId: 'g2',
    color: '#e11d48',
    description: 'SEPA, ACH and mobile-money payout rails.',
    volume30d: 884120.2,
    successRate: 98.6,
  },
  {
    id: 'p5',
    name: 'Fraud rules',
    groupId: 'g3',
    color: '#7c3aed',
    description: 'Velocity limits, reviews and rule engine.',
    volume30d: 0,
    successRate: 97.9,
  },
  {
    id: 'p6',
    name: 'PCI & docs',
    groupId: 'g3',
    color: '#0891b2',
    description: 'Compliance runs, key rotation, audit docs.',
    volume30d: 0,
    successRate: 100,
  },
]

export const seedTasks: Task[] = [
  {
    id: 't1',
    title: 'Add Apple Pay to hosted checkout',
    projectId: 'p1',
    status: 'running',
    createdAt: 'Today 09:14',
    messages: [
      {
        id: 't1m1',
        role: 'user',
        content:
          'Add Apple Pay to our hosted checkout. Keep the card fallback and make sure the merchant domain is registered for verification.',
        at: 'Today 09:14',
      },
      {
        id: 't1m2',
        role: 'agent',
        at: 'Today 09:15',
        steps: [
          { id: 't1s1', label: 'read checkout/session.ts', status: 'done' },
          { id: 't1s2', label: 'register_domain(merchant.payswap.io)', status: 'done' },
          { id: 't1s3', label: 'add_apple_pay_handler(fallback=card)', status: 'running' },
        ],
      },
    ],
  },
  {
    id: 't2',
    title: "Reconcile yesterday's settlements",
    projectId: 'p3',
    status: 'completed',
    createdAt: 'Today 06:32',
    messages: [
      {
        id: 't2m1',
        role: 'user',
        content:
          "Reconcile yesterday's card settlements against the processor report and flag anything that doesn't match the ledger.",
        at: 'Today 06:32',
      },
      {
        id: 't2m2',
        role: 'agent',
        at: 'Today 06:33',
        steps: [
          { id: 't2s1', label: 'fetch_processor_report(2024-06-11)', status: 'done' },
          { id: 't2s2', label: 'match_ledger_entries(4,981 rows)', status: 'done' },
          { id: 't2s3', label: 'write reconciliation-diff.csv', status: 'done' },
        ],
        content:
          'Reconciliation complete. 4,981 captured transactions totalling $412,338.10 match the processor report within a 2¢ tolerance. I flagged 3 exceptions: 2 duplicate captures ($118.00) and 1 late-presentment fee ($0.45). Suggested ledger adjustments are in reconciliation-diff.csv — want me to apply them?',
      },
    ],
  },
  {
    id: 't3',
    title: 'Fix 3DS webhook retry storms',
    projectId: 'p1',
    status: 'completed',
    createdAt: 'Yesterday 17:48',
    messages: [
      {
        id: 't3m1',
        role: 'user',
        content:
          'Webhooks for 3DS completions are retrying in storms and duplicating order confirmations. Find the cause and fix it.',
        at: 'Yesterday 17:48',
      },
      {
        id: 't3m2',
        role: 'agent',
        at: 'Yesterday 17:50',
        steps: [
          { id: 't3s1', label: 'trace webhook-events (24h)', status: 'done' },
          { id: 't3s2', label: 'patch handlers/threeds.ts (idempotency key)', status: 'done' },
          { id: 't3s3', label: 'replay 1,204 events in sandbox', status: 'done' },
        ],
        content:
          'Root cause: the 3DS handler acknowledged before committing, so timeouts triggered redelivery. I added an idempotency key keyed on (intent_id, attempt) and moved the ack after commit. Replayed 1,204 sandbox events — zero duplicates, p99 ack time 41ms.',
      },
    ],
  },
  {
    id: 't4',
    title: 'Draft SEPA payout CSV for EU merchants',
    projectId: 'p4',
    status: 'completed',
    createdAt: 'Yesterday 15:02',
    messages: [
      {
        id: 't4m1',
        role: 'user',
        content: 'Draft the SEPA payout CSV for EU merchants due tomorrow and sanity-check the IBANs.',
        at: 'Yesterday 15:02',
      },
      {
        id: 't4m2',
        role: 'agent',
        at: 'Yesterday 15:03',
        steps: [
          { id: 't4s1', label: 'query_payout_queue(region=EU)', status: 'done' },
          { id: 't4s2', label: 'validate_ibans(412 rows)', status: 'done' },
          { id: 't4s3', label: 'write sepa-payouts.csv', status: 'done' },
        ],
        content:
          'Payout run drafted: 412 merchants, $214,882.10 total across 9 currencies (FX applied at 15:00 rates). 9 payouts are held pending balance checks — they are listed at the top of the CSV so you can release or skip them.',
      },
    ],
  },
  {
    id: 't5',
    title: 'Review flagged transactions over $10,000',
    projectId: 'p5',
    status: 'completed',
    createdAt: 'Yesterday 11:20',
    messages: [
      {
        id: 't5m1',
        role: 'user',
        content: 'Review the transactions our rules flagged over $10,000 in the last 24 hours and draft dispositions.',
        at: 'Yesterday 11:20',
      },
      {
        id: 't5m2',
        role: 'agent',
        at: 'Yesterday 11:21',
        steps: [
          { id: 't5s1', label: 'query_flags(min_amount=10000, window=24h)', status: 'done' },
          { id: 't5s2', label: 'score against velocity + device graphs', status: 'done' },
          { id: 't5s3', label: 'draft dispositions.md', status: 'done' },
        ],
        content:
          '14 transactions flagged, $212,904.10 total. I recommend: 9 release (returning merchants, normal patterns), 3 manual review (new devices + mismatched geography), 2 block and refund (card-testing signatures). dispositions.md has the evidence for each call.',
      },
    ],
  },
  {
    id: 't6',
    title: 'Rotate live gateway API keys',
    projectId: 'p6',
    status: 'completed',
    createdAt: 'Mon 09:00',
    messages: [
      {
        id: 't6m1',
        role: 'user',
        content: 'Rotate the live gateway API keys per policy and confirm no requests failed during the cutover.',
        at: 'Mon 09:00',
      },
      {
        id: 't6m2',
        role: 'agent',
        at: 'Mon 09:01',
        steps: [
          { id: 't6s1', label: 'issue new keys (dual-active)', status: 'done' },
          { id: 't6s2', label: 'watch error rate for 30m', status: 'done' },
          { id: 't6s3', label: 'revoke old keys', status: 'done' },
        ],
        content:
          'Rotation done with a dual-active window. Error rate stayed flat (0.21% → 0.19%) and no auth failures were observed. Old keys revoked at 09:34; the audit entry is attached to the PCI runbook.',
      },
    ],
  },
]

export const seedAutomations: Automation[] = [
  {
    id: 'a1',
    name: 'Daily settlement reconciliation',
    detail: 'Matches processor reports to the ledger and opens diffs for review.',
    schedule: 'Every day · 06:00',
    nextRun: 'Tomorrow 06:00',
    enabled: true,
    lastResult: 'ok',
    lastRunAt: 'Today 06:00',
  },
  {
    id: 'a2',
    name: 'Retry failed payouts',
    detail: 'Re-queues payouts that failed on bank or mobile-money rails.',
    schedule: 'Every hour',
    nextRun: '10:00',
    enabled: true,
    lastResult: 'ok',
    lastRunAt: 'Today 09:00',
  },
  {
    id: 'a3',
    name: 'Flag transactions over $10,000',
    detail: 'Routes large captures to the review queue with velocity context.',
    schedule: 'Realtime',
    nextRun: 'Always on',
    enabled: true,
    lastResult: 'warn',
    lastRunAt: 'Live',
  },
  {
    id: 'a4',
    name: 'Weekly volume report',
    detail: 'Sends settlement and payout volume to the ops channel.',
    schedule: 'Mondays · 08:00',
    nextRun: 'Mon 08:00',
    enabled: true,
    lastResult: 'ok',
    lastRunAt: 'Jun 10 08:00',
  },
  {
    id: 'a5',
    name: 'Merchant KYC expiry sweep',
    detail: 'Reminds merchants 14 days before their KYC documents expire.',
    schedule: 'Every day · 02:00',
    nextRun: 'Paused',
    enabled: false,
    lastResult: 'fail',
    lastRunAt: '3 days ago',
  },
  {
    id: 'a6',
    name: 'FX rate snapshots',
    detail: 'Stores mid-market rates every 15 minutes for payout pricing.',
    schedule: 'Every 15 minutes',
    nextRun: '10:00',
    enabled: true,
    lastResult: 'ok',
    lastRunAt: 'Today 09:45',
  },
]

export const seedPlugins: Plugin[] = [
  {
    id: 'pl1',
    name: 'Stripe connector',
    vendor: 'Stripe',
    description: 'Card acquiring, Connect payouts and Billing sync for checkout projects.',
    category: 'Gateways',
    installed: true,
    installs: '48.2k',
    rating: 4.9,
  },
  {
    id: 'pl2',
    name: 'M-Pesa (Daraja)',
    vendor: 'Safaricom',
    description: 'Mobile-money collections and B2B payouts for East Africa corridors.',
    category: 'Gateways',
    installed: true,
    installs: '21.7k',
    rating: 4.8,
  },
  {
    id: 'pl3',
    name: 'Flutterwave',
    vendor: 'Flutterwave',
    description: 'Pan-African acquiring with card, USSD and bank transfer rails.',
    category: 'Gateways',
    installed: false,
    installs: '18.1k',
    rating: 4.6,
  },
  {
    id: 'pl4',
    name: 'Adyen',
    vendor: 'Adyen',
    description: 'Unified commerce acquiring with risk engine passthrough.',
    category: 'Gateways',
    installed: false,
    installs: '12.4k',
    rating: 4.7,
  },
  {
    id: 'pl5',
    name: 'Wise bulk payouts',
    vendor: 'Wise Platform',
    description: 'Multi-currency batch payouts with locked FX and fees preview.',
    category: 'Payouts',
    installed: false,
    installs: '9.8k',
    rating: 4.8,
  },
  {
    id: 'pl6',
    name: 'SEPA Instant',
    vendor: 'EBA Clearing',
    description: 'Instant euro credit transfers with scheme deadline awareness.',
    category: 'Payouts',
    installed: true,
    installs: '7.3k',
    rating: 4.5,
  },
  {
    id: 'pl7',
    name: 'Chargeback radar',
    vendor: 'PaySwap Labs',
    description: 'Drafts evidence packets and deadline tracking for disputes.',
    category: 'Compliance',
    installed: true,
    installs: '11.2k',
    rating: 4.7,
  },
  {
    id: 'pl8',
    name: 'Sanctions screening',
    vendor: 'PaySwap Labs',
    description: 'Screens counterparties against updated watchlists on every payout.',
    category: 'Compliance',
    installed: false,
    installs: '6.9k',
    rating: 4.4,
  },
  {
    id: 'pl9',
    name: 'Ledger sync',
    vendor: 'PaySwap Labs',
    description: 'Double-entry sync between processor reports and the general ledger.',
    category: 'Tools',
    installed: true,
    installs: '15.6k',
    rating: 4.9,
  },
  {
    id: 'pl10',
    name: 'Tax engine',
    vendor: 'Avalara',
    description: 'VAT/GST determination on cross-border settlement fees.',
    category: 'Tools',
    installed: false,
    installs: '5.1k',
    rating: 4.3,
  },
]

export const channels: Channel[] = [
  { id: 'c1', name: 'Visa', kind: 'card', status: 'live', volume24h: 128420.4, trend: [22, 30, 26, 38, 44, 40, 52, 58] },
  { id: 'c2', name: 'Mastercard', kind: 'card', status: 'live', volume24h: 96180.0, trend: [18, 22, 30, 28, 34, 42, 40, 49] },
  { id: 'c3', name: 'M-Pesa', kind: 'mobile', status: 'live', volume24h: 74900.0, trend: [12, 18, 16, 24, 30, 36, 34, 44] },
  { id: 'c4', name: 'Bank transfer (ACH)', kind: 'bank', status: 'degraded', volume24h: 31275.5, trend: [30, 26, 34, 22, 18, 20, 14, 12] },
  { id: 'c5', name: 'Apple Pay', kind: 'card', status: 'testing', volume24h: 12430.0, trend: [2, 4, 8, 10, 14, 18, 24, 30] },
]

export const stats: Stats = {
  settledToday: 482930.55,
  deltaToday: 12.4,
  payoutsPending: 18240.0,
  payoutsCount: 23,
  disputesOpen: 7,
  disputesDeadline: 2,
  successRate: 99.2,
  successDelta: 0.3,
  trend: [30, 34, 32, 40, 44, 42, 52, 58],
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const uidCounter = { n: 0 }

export function uid(prefix: string): string {
  uidCounter.n += 1
  return `${prefix}${Date.now().toString(36)}${uidCounter.n}`
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatMoney(value: number): string {
  return usd.format(value)
}

export interface AgentPlan {
  steps: string[]
  content: string
}

/** Turns a prompt into a payment-flavoured tool-call plan + reply. */
export function agentPlan(prompt: string): AgentPlan {
  const p = prompt.toLowerCase()
  if (p.includes('payout')) {
    return {
      steps: [
        'query_payout_queue(status=queued)',
        'validate_bank_details(412 rows)',
        'draft payout-batch.csv',
      ],
      content:
        'Payout run drafted: 412 merchants, $214,882.10 total, FX locked at current mid-market rates. 9 payouts are held pending balance checks and listed at the top of the CSV — release them or tell me to skip and re-run.',
    }
  }
  if (p.includes('reconcile') || p.includes('settlement')) {
    return {
      steps: [
        'fetch_processor_report(today)',
        'match_ledger_entries(5,102 rows)',
        'write reconciliation-diff.csv',
      ],
      content:
        'Reconciliation complete: 5,102 captures totalling $441,206.90 match within a 2¢ tolerance. I found 2 duplicate captures ($84.00) and 1 scheme fee anomaly ($1.12) — adjustments are proposed in reconciliation-diff.csv for your approval.',
    }
  }
  if (p.includes('dispute') || p.includes('chargeback') || p.includes('flag')) {
    return {
      steps: [
        'pull_open_disputes(window=30d)',
        'assemble_evidence_packets(7)',
        'draft response letters',
      ],
      content:
        '7 open disputes, $12,940.11 contested. I assembled evidence packets (proof of delivery, AVS/CVV matches, device fingerprints) and drafted responses for the 2 nearing deadline. Review and I will submit them through the gateway API.',
    }
  }
  if (p.includes('checkout') || p.includes('apple pay') || p.includes('wallet') || p.includes('link')) {
    return {
      steps: [
        'read checkout/session.ts',
        'add_wallet_handler(wallets=[apple_pay, link])',
        'run checkout sandbox tests',
      ],
      content:
        'Wallet support added behind a feature flag with the card fallback preserved. Domain registration for Apple Pay verification is done. Sandbox run: 240 payments, 0 failures, median session latency 118ms. Flip the flag when you want it live.',
    }
  }
  return {
    steps: [
      'read_context(project, ledger)',
      'query_transactions(window=24h)',
      'draft summary + next actions',
    ],
    content:
      "I reviewed the last 24h of activity: 1,204 captured payments totalling $86,410.22, 9 refunds ($1,204.50) and 3 settlements queued for the 06:00 window. I drafted the reconciliation diff and flagged 2 duplicate captures for review — tell me which action to execute.",
  }
}
