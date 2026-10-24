/**
 * Shared contracts for the PaySwap agent runtime, financial protocol and UI.
 * Imported by both the API routes (backend) and the paydesk components.
 */

import type { StepStatus } from '@/lib/paydata'

/* ------------------------------------------------------------------ */
/* Agent steps                                                         */
/* ------------------------------------------------------------------ */

/** Route leg of an Economic Execution Graph (EEG). */
export interface RouteLeg {
  kind: 'funding' | 'conversion' | 'payout' | 'settlement'
  rail: string
  detail: string
  status: 'pending' | 'submitted' | 'processing' | 'settled'
  ref?: string
}

/** A candidate route returned by discover_routes. */
export interface RouteCandidate {
  id: string
  mode: 'PASS_THROUGH_NATIVE' | 'COMPOSED_PAYSWAP' | 'OPTIMIZED_MULTI_PROVIDER'
  label: string
  legs: RouteLeg[]
  fee: number
  fxSpreadBps: number
  etaMinutes: number
  eligible: boolean
  rejectedReason?: string
  totalOut: number
}

export interface QuotePayload {
  routeId: string
  mode: RouteCandidate['mode']
  amount: number
  currency: string
  destinationCurrency: string
  rate: number
  fee: number
  fxSpreadBps: number
  guaranteed: boolean
  expiresAt: string
  source: string
  version: string
}

export interface ApprovalPayload {
  amount: number
  currency: string
  rail: string
  beneficiary: string
  mode: RouteCandidate['mode']
  routeLabel: string
  mandate: string
  epoch: number
  evidence: string[]
}

export interface ApprovalView {
  id: string
  taskId: string
  taskTitle?: string
  stepId?: string | null
  summary: string
  payload: ApprovalPayload
  status: 'pending' | 'approved' | 'denied' | 'expired'
  createdAt: string
  decidedAt?: string | null
}

export interface LedgerRow {
  id: string
  kind: 'obligation' | 'funding' | 'conversion' | 'payout' | 'settlement' | 'fee'
  amount: number
  currency: string
  rail: string
  status: 'proposed' | 'submitted' | 'processing' | 'settled' | 'unknown'
  ref: string
  evidence: string[]
  createdAt: string
}

export interface AgentStep {
  id: string
  label: string
  status: StepStatus | 'error'
  detail?: string
  kind?: 'tool' | 'eeg' | 'quote' | 'approval' | 'ledger'
  payload?: RouteCandidate[] | QuotePayload | ApprovalView | LedgerRow[] | { approvalId: string }
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent'
  content?: string
  steps?: AgentStep[]
  at: string
}

export interface TaskDTO {
  id: string
  title: string
  projectId: string | null
  status: 'running' | 'completed' | 'failed'
  goal?: string | null
  createdAt: string
  messages: ChatMessage[]
  routine?: RoutineRunState | null
  gates?: PaymentGate[]
  origin?: TaskOrigin | null
}

/* ------------------------------------------------------------------ */
/* Routines — economic-goal playbooks loaded by the agent              */
/* ------------------------------------------------------------------ */

export type RoutineCategory =
  | 'Shopping'
  | 'Payments'
  | 'Investing'
  | 'Lending'
  | 'Merchant'
  | 'Bills'
  | 'Savings'
  | 'FX'

export type RoutineStepKind = 'action' | 'payment' | 'browser' | 'approval' | 'settings'

export interface RoutineStep {
  title: string
  detail?: string
  kind: RoutineStepKind
}

export interface RoutineRating {
  userScore: number
  userCount: number
  agentScore: number
  agentCount: number
}

export interface Routine {
  id: string
  slug: string
  name: string
  publisher: string
  version: string
  description: string
  category: RoutineCategory
  merchant: boolean
  steps: RoutineStep[]
  rating: RoutineRating
  installs: number
  status: 'accepted' | 'pending_review' | 'rejected'
  installed: boolean
  builtin: boolean
  keywords: string[]
  updatedAt: string
}

export interface RoutinePublishInput {
  name: string
  description: string
  category: RoutineCategory
  merchant: boolean
  publisher?: string
  steps: RoutineStep[]
}

/* ------------------------------------------------------------------ */
/* Opportunities — intents broadcast to PaySwap nodes for bidding      */
/* ------------------------------------------------------------------ */

export type OpportunityKind = 'routing' | 'liquidity' | 'fx' | 'payout'

export interface OpportunityBid {
  id: string
  node: string
  region: string
  feeBps: number
  etaMinutes: number
  nodeRating: number
  createdAt: string
}

export interface Opportunity {
  id: string
  title: string
  kind: OpportunityKind
  intentSummary: string
  amount: number
  currency: string
  rewardBps: number
  createdByTaskId: string | null
  createdByTaskTitle: string | null
  status: 'open' | 'awarded'
  awardedNodeId: string | null
  expiresAt: string
  createdAt: string
  bids: OpportunityBid[]
}

/* ------------------------------------------------------------------ */
/* Merchant checkout (simulated rails until rails are hooked up)       */
/* ------------------------------------------------------------------ */

export type CheckoutMethodKind = 'momo' | 'card' | 'bank' | 'wallet'

export interface CheckoutMethod {
  id: string
  label: string
  kind: CheckoutMethodKind
  connected: boolean
}

export interface CheckoutSession {
  store: string
  url: string
  item: string
  price: number
  currency: string
  methods: CheckoutMethod[]
}

export type PaymentChoice =
  | { mode: 'merchant_rail'; railLabel: string }
  | { mode: 'connect_and_pay'; railLabel: string }
  | { mode: 'payswap_route'; preferredRailLabel?: string }

export interface PaymentReceipt {
  ref: string
  mode: PaymentChoice['mode']
  railLabel: string
  amount: number
  currency: string
  fee: number
  feeBps: number
  etaMinutes: number
  settledAt: string
  opportunityId?: string
  awardedNode?: string
}

/* ------------------------------------------------------------------ */
/* Routine execution state attached to a task                          */
/* ------------------------------------------------------------------ */

export interface RoutineRunStep {
  title: string
  kind: RoutineStepKind
  status: 'pending' | 'active' | 'done'
  detail?: string
}

export interface RoutineRunState {
  routineId: string
  name: string
  publisher: string
  version: string
  steps: RoutineRunStep[]
}

export interface PaymentGate {
  gateId: string
  stepIndex: number
  checkout: CheckoutSession
  status: 'open' | 'processing' | 'settled' | 'failed'
  receipt?: PaymentReceipt
  opportunityId?: string
}

export interface TaskOrigin {
  type: 'browser'
  url: string
  item: string
  price: number
  currency: string
}

/* ------------------------------------------------------------------ */
/* Run event stream (NDJSON)                                           */
/* ------------------------------------------------------------------ */

export type RunEvent =
  | { type: 'step'; taskId: string; step: AgentStep }
  | { type: 'approval'; taskId: string; approval: ApprovalView; stepId: string }
  | { type: 'approval_resolved'; taskId: string; approvalId: string; decision: 'approved' | 'denied' | 'expired'; stepId: string }
  | { type: 'done'; taskId: string; messageId: string; content: string; status: 'completed' | 'failed' }
  | { type: 'error'; taskId: string; message: string }
  | { type: 'message'; taskId: string; content: string }
  | { type: 'routine'; taskId: string; routine: RoutineRunState }
  | { type: 'routine_step'; taskId: string; stepIndex: number; status: 'active' | 'done'; detail?: string }
  | { type: 'candidates'; taskId: string; candidates: Routine[] }
  | { type: 'open_browser'; taskId: string; url: string; reason: string }
  | { type: 'checkout'; taskId: string; gate: PaymentGate; stepIndex: number }
  | { type: 'payment_receipt'; taskId: string; gateId: string; receipt: PaymentReceipt }
  | { type: 'opportunity'; taskId: string; opportunity: Opportunity }

/* ------------------------------------------------------------------ */
/* Workspace + PaySwap settings (persisted via /api/settings)          */
/* ------------------------------------------------------------------ */

export interface PaySettings {
  // PaySwap · Payments
  environment: 'sandbox' | 'live'
  modeNative: boolean
  modeComposed: boolean
  modeOptimized: boolean
  maxRouteHops: number
  fxSpreadCapBps: number
  autoApproveLimit: number
  requireSettlementProof: boolean
  reauthOnRouteChange: boolean
  mandateDailyCap: number
  mandateVelocity: number
  mandateExpiryDays: number
  evidenceRetentionDays: number
  settlementCurrency: string
  // PaySwap · Developer & API
  webhookUrl: string
  webhookEventsPayments: boolean
  webhookEventsApprovals: boolean
  webhookEventsSettlement: boolean
  surfaceWeb: boolean
  surfaceDesktop: boolean
  surfaceMobile: boolean
  surfaceExtension: boolean
  // General (ZCode)
  locale: 'system' | 'en-US' | 'zh-CN'
  interfaceMode: 'coding' | 'office'
  notifications: boolean
  notificationSound: boolean
  showReasoning: boolean
  showTodos: boolean
  groupExplore: boolean
  groupTerminal: boolean
  groupChanges: boolean
  interactionBehavior: 'queue' | 'guide'
  autoArchive: boolean
  autoArchiveDays: number
  proactiveSuggestions: boolean
  toolSearchMode: 'off' | 'auto'
  // Appearance
  themeMode: 'system' | 'light' | 'dark'
  terminalInheritProfile: boolean
  // Capabilities
  memoryEnabled: boolean
  browserEnabled: boolean
  computerUseEnabled: boolean
  proactiveAutomations: boolean
}

export const DEFAULT_SETTINGS: PaySettings = {
  environment: 'sandbox',
  modeNative: true,
  modeComposed: true,
  modeOptimized: true,
  maxRouteHops: 3,
  fxSpreadCapBps: 60,
  autoApproveLimit: 250,
  requireSettlementProof: true,
  reauthOnRouteChange: true,
  mandateDailyCap: 50000,
  mandateVelocity: 200,
  mandateExpiryDays: 30,
  evidenceRetentionDays: 2555,
  settlementCurrency: 'GHS',
  webhookUrl: '',
  webhookEventsPayments: true,
  webhookEventsApprovals: true,
  webhookEventsSettlement: true,
  surfaceWeb: true,
  surfaceDesktop: true,
  surfaceMobile: false,
  surfaceExtension: false,
  locale: 'en-US',
  interfaceMode: 'coding',
  notifications: true,
  notificationSound: false,
  showReasoning: true,
  showTodos: true,
  groupExplore: true,
  groupTerminal: true,
  groupChanges: true,
  interactionBehavior: 'queue',
  autoArchive: true,
  autoArchiveDays: 14,
  proactiveSuggestions: true,
  toolSearchMode: 'off',
  themeMode: 'light',
  terminalInheritProfile: true,
  memoryEnabled: true,
  browserEnabled: true,
  computerUseEnabled: false,
  proactiveAutomations: true,
}

/* ------------------------------------------------------------------ */
/* Lab simulation                                                      */
/* ------------------------------------------------------------------ */

export interface LabResult {
  corridor: string
  amount: number
  currency: string
  runs: Array<{
    mode: RouteCandidate['mode']
    label: string
    totalCost: number
    etaMinutes: number
    successRate: number
    canary: boolean
  }>
  winner: RouteCandidate['mode']
  note: string
}
