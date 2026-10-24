/**
 * Economic library seed — routines (playbooks) and open opportunities.
 *
 * Runs lazily: GET /api/routines seeds the routine library when empty,
 * GET /api/opportunities seeds the opportunity board when empty.
 * All rails and yields are sandbox simulations, clearly labelled.
 */

import { db } from '@/lib/db'
import type { RoutineCategory, RoutineStep } from '@/lib/agent-types'

/* ------------------------------------------------------------------ */
/* Seed routines (16)                                                  */
/* ------------------------------------------------------------------ */

interface RoutineSeed {
  slug: string
  name: string
  publisher: string
  version: string
  description: string
  category: RoutineCategory
  merchant: boolean
  steps: RoutineStep[]
  userScore: number
  userCount: number
  agentScore: number
  agentCount: number
  installs: number
  installed: boolean
  keywords: string[]
  ageDays: number
}

export const ROUTINE_SEEDS: RoutineSeed[] = [
  {
    slug: 'browser-checkout-purchase',
    name: 'Browser checkout purchase',
    publisher: 'PaySwap Core',
    version: '1.4.0',
    description:
      'Drive a real storefront in the browser, reach the merchant checkout and settle through your preferred PaySwap rail with full evidence.',
    category: 'Shopping',
    merchant: false,
    steps: [
      { title: 'Open the store in the browser', kind: 'browser' },
      { title: 'Locate the item and add it to cart', kind: 'browser' },
      { title: 'Reach the merchant checkout', kind: 'browser' },
      { title: 'Understand eligible payment methods', kind: 'action' },
      { title: 'Connect your preferred rail', kind: 'action' },
      { title: 'Route and process the payment', kind: 'payment' },
      { title: 'Confirm receipt and file evidence', kind: 'action' },
    ],
    userScore: 4.7,
    userCount: 412,
    agentScore: 4.8,
    agentCount: 1264,
    installs: 3120,
    installed: true,
    keywords: ['buy', 'purchase', 'browse', 'jumia', 'cart', 'checkout', 'order', 'shop online'],
    ageDays: 40,
  },
  {
    slug: 'momo-transfer',
    name: 'Mobile money transfer',
    publisher: 'PaySwap Core',
    version: '1.2.0',
    description:
      'Resolve the recipient wallet, confirm the amount and settle over a mobile-money rail with a rail-confirmed receipt.',
    category: 'Payments',
    merchant: false,
    steps: [
      { title: 'Resolve recipient wallet', kind: 'action', detail: 'Verify the registered MoMo alias before routing' },
      { title: 'Confirm amount and currency', kind: 'action' },
      { title: 'Select mobile-money rail', kind: 'action' },
      { title: 'Route the payment', kind: 'payment' },
      { title: 'Confirm receipt', kind: 'action' },
    ],
    userScore: 4.6,
    userCount: 380,
    agentScore: 4.7,
    agentCount: 986,
    installs: 2890,
    installed: true,
    keywords: ['pay', 'send', 'momo', 'mobile money', 'transfer', 'ghs', 'cedis', 'kwame'],
    ageDays: 38,
  },
  {
    slug: 'bank-transfer',
    name: 'Bank transfer (GhIPSS)',
    publisher: 'Accra Fintech Guild',
    version: '0.9.2',
    description:
      'Community playbook for bank-rail transfers across Ghanaian banks with beneficiary-name verification and settlement evidence.',
    category: 'Payments',
    merchant: false,
    steps: [
      { title: 'Resolve beneficiary bank account', kind: 'action', detail: 'Name-check against GhIPSS directory' },
      { title: 'Confirm amount and currency', kind: 'action' },
      { title: 'Select the bank rail', kind: 'action' },
      { title: 'Route the payment', kind: 'payment' },
      { title: 'Confirm receipt and file evidence', kind: 'action' },
    ],
    userScore: 4.3,
    userCount: 154,
    agentScore: 4.4,
    agentCount: 402,
    installs: 1120,
    installed: true,
    keywords: ['bank', 'transfer', 'pay', 'send', 'ghana', 'ghs'],
    ageDays: 33,
  },
  {
    slug: 'stablecoin-route',
    name: 'Cross-border stablecoin route',
    publisher: 'NodeOps',
    version: '2.0.1',
    description:
      'Cross-border value over USDC: on-ramp, Base transfer and local off-ramp, with node bids for each leg.',
    category: 'Payments',
    merchant: false,
    steps: [
      { title: 'Confirm corridor and amount', kind: 'action' },
      { title: 'On-ramp to USDC', kind: 'payment' },
      { title: 'Transfer on Base', kind: 'action' },
      { title: 'Off-ramp to the destination rail', kind: 'payment' },
      { title: 'Reconcile both legs', kind: 'action' },
    ],
    userScore: 4.4,
    userCount: 96,
    agentScore: 4.5,
    agentCount: 233,
    installs: 640,
    installed: false,
    keywords: ['usdc', 'stablecoin', 'cross-border', 'dollar', 'international', 'usd'],
    ageDays: 27,
  },
  {
    slug: 'investment-scan',
    name: 'Investment scan',
    publisher: 'PaySwap Core',
    version: '1.1.0',
    description:
      'Scan node yields and treasury products against your risk appetite and horizon, then shortlist the best-fit options.',
    category: 'Investing',
    merchant: false,
    steps: [
      { title: 'Define risk and horizon', kind: 'action' },
      { title: 'Scan node yields and treasury products', kind: 'action' },
      { title: 'Shortlist opportunities', kind: 'action' },
      { title: 'Present options', kind: 'action' },
    ],
    userScore: 4.5,
    userCount: 208,
    agentScore: 4.6,
    agentCount: 517,
    installs: 1740,
    installed: true,
    keywords: ['invest', 'investment', 'opportunities', 'yield', 'returns', 'grow'],
    ageDays: 31,
  },
  {
    slug: 'treasury-bills-subscribe',
    name: 'Treasury bills subscribe',
    publisher: 'Accra Fintech Guild',
    version: '0.6.0',
    description:
      'Subscribe to government of Ghana treasury bills through participating nodes, from tenor choice to allotment.',
    category: 'Investing',
    merchant: false,
    steps: [
      { title: 'Pick tenor and amount', kind: 'action' },
      { title: 'Gather node allotment offers', kind: 'action' },
      { title: 'Fund the subscription', kind: 'payment' },
      { title: 'Confirm allotment and file evidence', kind: 'action' },
    ],
    userScore: 4.2,
    userCount: 87,
    agentScore: 4.3,
    agentCount: 168,
    installs: 520,
    installed: false,
    keywords: ['treasury', 'bills', 't-bill', 'government', 'bonds'],
    ageDays: 24,
  },
  {
    slug: 'microlending-borrow',
    name: 'Microlending borrow',
    publisher: 'PaySwap Core',
    version: '1.0.3',
    description:
      'Assess a credit request, gather offers from lender nodes, compare terms and schedule repayment.',
    category: 'Lending',
    merchant: false,
    steps: [
      { title: 'Assess the credit request', kind: 'action' },
      { title: 'Gather offers from lender nodes', kind: 'action' },
      { title: 'Compare terms', kind: 'action' },
      { title: 'Accept offer and disbursement', kind: 'payment' },
      { title: 'Schedule repayment', kind: 'action' },
    ],
    userScore: 4.1,
    userCount: 143,
    agentScore: 4.2,
    agentCount: 388,
    installs: 980,
    installed: true,
    keywords: ['borrow', 'loan', 'lend', 'credit', 'ghs'],
    ageDays: 29,
  },
  {
    slug: 'peer-lending',
    name: 'Peer-to-peer lending desk',
    publisher: 'Kwame Labs',
    version: '0.4.1',
    description:
      'Experimental peer lending: match borrowers and lenders directly with escrowed disbursement via PaySwap nodes.',
    category: 'Lending',
    merchant: false,
    steps: [
      { title: 'Publish the credit request', kind: 'action' },
      { title: 'Match peer offers', kind: 'action' },
      { title: 'Escrow and disburse', kind: 'payment' },
      { title: 'Track repayments', kind: 'action' },
    ],
    userScore: 3.9,
    userCount: 61,
    agentScore: 4.0,
    agentCount: 97,
    installs: 210,
    installed: false,
    keywords: ['borrow', 'loan', 'peer', 'p2p', 'lend'],
    ageDays: 21,
  },
  {
    slug: 'merchant-run-shop',
    name: 'Run my shop',
    publisher: 'PaySwap Core',
    version: '1.3.0',
    description:
      'Daily merchant loop: dashboard, inventory, order fulfilment and payout sweep to your wallet.',
    category: 'Merchant',
    merchant: true,
    steps: [
      { title: 'Open the shop dashboard', kind: 'browser' },
      { title: 'Review inventory and pending orders', kind: 'action' },
      { title: 'Fulfil new orders', kind: 'action' },
      { title: 'Sweep payouts to wallet', kind: 'payment' },
    ],
    userScore: 4.8,
    userCount: 356,
    agentScore: 4.9,
    agentCount: 1105,
    installs: 2480,
    installed: true,
    keywords: ['run my shop', 'shop', 'store', 'orders', 'inventory', 'sell', 'merchant'],
    ageDays: 36,
  },
  {
    slug: 'merchant-add-stripe',
    name: 'Add Stripe to my shop',
    publisher: 'PaySwap Core',
    version: '1.1.2',
    description:
      'Connect a Stripe account to the storefront, configure checkout and validate with a sandbox payment.',
    category: 'Merchant',
    merchant: true,
    steps: [
      { title: 'Check the shop storefront', kind: 'browser' },
      { title: 'Connect the Stripe account', kind: 'settings' },
      { title: 'Configure checkout', kind: 'action' },
      { title: 'Test a sandbox payment', kind: 'payment' },
    ],
    userScore: 4.6,
    userCount: 274,
    agentScore: 4.7,
    agentCount: 720,
    installs: 1960,
    installed: true,
    keywords: ['stripe', 'add stripe', 'checkout', 'card payments'],
    ageDays: 35,
  },
  {
    slug: 'merchant-accept-momo',
    name: 'Accept mobile money',
    publisher: 'Kwame Labs',
    version: '0.7.0',
    description:
      'Register as a mobile-money vendor, configure collection aliases and validate with a test collection.',
    category: 'Merchant',
    merchant: true,
    steps: [
      { title: 'Register the mobile-money vendor account', kind: 'settings' },
      { title: 'Configure collection', kind: 'action' },
      { title: 'Test a collection', kind: 'payment' },
    ],
    userScore: 4.4,
    userCount: 122,
    agentScore: 4.4,
    agentCount: 260,
    installs: 760,
    installed: false,
    keywords: ['momo', 'accept', 'mobile money', 'collection', 'vendor'],
    ageDays: 22,
  },
  {
    slug: 'bill-pay-utilities',
    name: 'Pay utility bills',
    publisher: 'NodeOps',
    version: '1.0.0',
    description:
      'Fetch the latest utility bill, verify the meter and settle through the cheapest eligible rail.',
    category: 'Bills',
    merchant: false,
    steps: [
      { title: 'Fetch the latest utility bill', kind: 'action' },
      { title: 'Verify meter and account details', kind: 'action' },
      { title: 'Choose the payment rail', kind: 'action' },
      { title: 'Settle the bill', kind: 'payment' },
      { title: 'File the receipt', kind: 'action' },
    ],
    userScore: 4.3,
    userCount: 190,
    agentScore: 4.4,
    agentCount: 455,
    installs: 1310,
    installed: false,
    keywords: ['bill', 'bills', 'electricity', 'water', 'utility', 'prepaid', 'ecg'],
    ageDays: 26,
  },
  {
    slug: 'auto-save-rule',
    name: 'Automatic savings rule',
    publisher: 'PaySwap Core',
    version: '1.0.1',
    description:
      'Create a savings rule that sweeps a fixed amount or round-ups into your PaySwap wallet on a trigger.',
    category: 'Savings',
    merchant: false,
    steps: [
      { title: 'Set the savings target', kind: 'action' },
      { title: 'Choose the sweep trigger', kind: 'action' },
      { title: 'Link the destination wallet', kind: 'settings' },
      { title: 'Move the first sweep', kind: 'payment' },
      { title: 'Confirm the rule', kind: 'action' },
    ],
    userScore: 4.5,
    userCount: 231,
    agentScore: 4.6,
    agentCount: 611,
    installs: 1520,
    installed: false,
    keywords: ['save', 'savings', 'auto-save', 'sweep', 'round up', 'stash'],
    ageDays: 25,
  },
  {
    slug: 'fx-swap',
    name: 'FX swap desk',
    publisher: 'NodeOps',
    version: '1.2.0',
    description:
      'Swap between USD and GHS through competing node quotes, capped by your FX spread policy.',
    category: 'FX',
    merchant: false,
    steps: [
      { title: 'Confirm the pair and amount', kind: 'action' },
      { title: 'Fetch node quotes', kind: 'action' },
      { title: 'Choose the best rate', kind: 'action' },
      { title: 'Execute the swap', kind: 'payment' },
      { title: 'Confirm delivery', kind: 'action' },
    ],
    userScore: 4.4,
    userCount: 118,
    agentScore: 4.5,
    agentCount: 344,
    installs: 690,
    installed: false,
    keywords: ['swap', 'exchange', 'fx', 'usd', 'ghs'],
    ageDays: 23,
  },
  {
    slug: 'invoice-issue',
    name: 'Issue an invoice',
    publisher: 'Accra Fintech Guild',
    version: '0.8.0',
    description:
      'Draft, issue and track a merchant invoice end to end, with reconciliation when settlement lands.',
    category: 'Merchant',
    merchant: true,
    steps: [
      { title: 'Draft the invoice', kind: 'action' },
      { title: 'Add line items and tax', kind: 'action' },
      { title: 'Send to the customer', kind: 'action' },
      { title: 'Track the payment', kind: 'action' },
      { title: 'Reconcile settlement', kind: 'action' },
    ],
    userScore: 4.2,
    userCount: 104,
    agentScore: 4.2,
    agentCount: 238,
    installs: 580,
    installed: false,
    keywords: ['invoice', 'invoicing', 'charge customer', 'receivable', 'statement'],
    ageDays: 20,
  },
  {
    slug: 'split-bill',
    name: 'Split a bill',
    publisher: 'Kwame Labs',
    version: '0.5.0',
    description:
      'Split a shared bill across the group, collect each share and confirm full settlement.',
    category: 'Payments',
    merchant: false,
    steps: [
      { title: 'Capture the group and total', kind: 'action' },
      { title: 'Assign shares', kind: 'action' },
      { title: 'Collect each share', kind: 'payment' },
      { title: 'Confirm full settlement', kind: 'action' },
    ],
    userScore: 4.1,
    userCount: 78,
    agentScore: 4.1,
    agentCount: 152,
    installs: 340,
    installed: false,
    keywords: ['split', 'share the bill', 'group payment', 'divide', 'owe'],
    ageDays: 18,
  },
]

/* ------------------------------------------------------------------ */
/* Seed opportunities (3 open, with 1-2 bids each)                     */
/* ------------------------------------------------------------------ */

export const NODE_POOL = [
  { node: 'Accra-Node-7', region: 'Accra' },
  { node: 'Kumasi-Liquidity', region: 'Kumasi' },
  { node: 'Tema-FX-2', region: 'Tema' },
  { node: 'Base-USDC-MM', region: 'Global' },
] as const

interface BidSeed {
  node: string
  region: string
  feeBps: number
  etaMinutes: number
  nodeRating: number
}

interface OpportunitySeed {
  title: string
  kind: 'routing' | 'liquidity' | 'fx' | 'payout'
  intentSummary: string
  amount: number
  currency: string
  rewardBps: number
  bids: BidSeed[]
  ageMinutes: number
}

export const OPPORTUNITY_SEEDS: OpportunitySeed[] = [
  {
    title: 'Route 2,400 GHS card settlement to MoMo wallet',
    kind: 'routing',
    intentSummary: 'Merchant card settlement needs same-day delivery to a mobile-money wallet; native payout ETA too slow.',
    amount: 2400,
    currency: 'GHS',
    rewardBps: 18,
    ageMinutes: 34,
    bids: [
      { node: 'Accra-Node-7', region: 'Accra', feeBps: 14, etaMinutes: 8, nodeRating: 4.7 },
      { node: 'Tema-FX-2', region: 'Tema', feeBps: 22, etaMinutes: 15, nodeRating: 4.3 },
    ],
  },
  {
    title: 'Swap 5,000 GHS to USD for import invoice',
    kind: 'fx',
    intentSummary: 'Importer needs GHS to USD inside an hour; correspondent spread above policy cap so nodes bid the conversion.',
    amount: 5000,
    currency: 'GHS',
    rewardBps: 30,
    ageMinutes: 12,
    bids: [
      { node: 'Tema-FX-2', region: 'Tema', feeBps: 12, etaMinutes: 6, nodeRating: 4.5 },
      { node: 'Base-USDC-MM', region: 'Global', feeBps: 9, etaMinutes: 25, nodeRating: 4.6 },
    ],
  },
  {
    title: 'Bridge 1,200 GHS weekend float for merchant payouts',
    kind: 'liquidity',
    intentSummary: 'Shop owner needs weekend float to clear pending payouts before Monday bank settlement.',
    amount: 1200,
    currency: 'GHS',
    rewardBps: 12,
    ageMinutes: 51,
    bids: [
      { node: 'Kumasi-Liquidity', region: 'Kumasi', feeBps: 28, etaMinutes: 45, nodeRating: 4.2 },
      { node: 'Accra-Node-7', region: 'Accra', feeBps: 18, etaMinutes: 20, nodeRating: 4.4 },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Lazy seed runners                                                   */
/* ------------------------------------------------------------------ */

export async function ensureRoutinesSeeded(): Promise<void> {
  const count = await db.routine.count()
  if (count > 0) return
  for (const r of ROUTINE_SEEDS) {
    await db.routine.create({
      data: {
        slug: r.slug,
        name: r.name,
        publisher: r.publisher,
        version: r.version,
        description: r.description,
        category: r.category,
        merchant: r.merchant,
        stepsJson: JSON.stringify(r.steps),
        userScore: r.userScore,
        userCount: r.userCount,
        agentScore: r.agentScore,
        agentCount: r.agentCount,
        installs: r.installs,
        status: 'accepted',
        installed: r.installed,
        builtin: true,
        keywordsJson: JSON.stringify(r.keywords),
        createdAt: new Date(Date.now() - r.ageDays * 86_400_000),
        updatedAt: new Date(Date.now() - r.ageDays * 86_400_000),
      },
    })
  }
}

export async function ensureOpportunitiesSeeded(): Promise<void> {
  const count = await db.opportunity.count()
  if (count > 0) return
  for (const o of OPPORTUNITY_SEEDS) {
    const createdAt = new Date(Date.now() - o.ageMinutes * 60_000)
    await db.opportunity.create({
      data: {
        title: o.title,
        kind: o.kind,
        intentSummary: o.intentSummary,
        amount: o.amount,
        currency: o.currency,
        rewardBps: o.rewardBps,
        createdByTaskId: null,
        createdByTaskTitle: null,
        status: 'open',
        expiresAt: new Date(createdAt.getTime() + 7 * 86_400_000),
        createdAt,
        bids: {
          create: o.bids.map((b) => ({
            node: b.node,
            region: b.region,
            feeBps: b.feeBps,
            etaMinutes: b.etaMinutes,
            nodeRating: b.nodeRating,
          })),
        },
      },
    })
  }
}
