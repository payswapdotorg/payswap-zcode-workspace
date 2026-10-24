'use client'

import { useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------ */
/* Model provider domain — mirrors the original ZCode model settings   */
/* (Z.ai / BigModel families, Start Plan free tier, Coding Plan        */
/* subscriptions with GLM-5.3 / GLM-5.3-Flash, custom providers).      */
/* ------------------------------------------------------------------ */

export type Family = 'zai' | 'bigmodel'
export type Tier = 'lite' | 'pro' | 'max'
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
export type ApiFormat = 'anthropic' | 'openai-chat' | 'openai-responses'
export type ConnectionMode = 'individual' | 'team'

export interface PlanQuota {
  /** remaining percent */
  pct: number
  /** human reset time, e.g. "21:00" or "Mar 21" */
  resetAt: string
}

export interface CodingPlanState {
  status: 'disconnected' | 'notPurchased' | 'purchased'
  tier: Tier | null
  cycle: BillingCycle
  /** human renewal date, e.g. "Mar 15" */
  renewsAt: string
  teamSeats: number | null
  quotas: { fiveHour: PlanQuota; weekly: PlanQuota; toolCalls: PlanQuota; mcp: PlanQuota }
}

export interface StartPlanBalance {
  name: string
  totalTokens: number
  remainingPct: number
  resetAt: string
}

export interface StartPlanState {
  status: 'disconnected' | 'active' | 'noPlan'
  balances: StartPlanBalance[]
}

export interface FamilyState {
  /** OAuth signed in to this family */
  connected: boolean
  coding: CodingPlanState
  start: StartPlanState
  mode: ConnectionMode
}

export interface CustomModel {
  id: string
  contextWindow: number
  maxOutput: number
  enabled: boolean
  /** builtin = shipped with the template, cannot be deleted */
  builtin: boolean
  vision: boolean
  reasoning: string[]
}

export interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiFormat: ApiFormat
  apiKey: string
  keyUrl?: string
  enabled: boolean
  models: CustomModel[]
}

export interface ModelSelection {
  /** group id: 'zai' | 'zai-start' | 'bigmodel' | 'bigmodel-start' | custom provider id */
  group: string
  model: string
}

export interface ModelPlanState {
  /** the family the app is OAuth-logged-in to (hides the other family, like ZCode) */
  activeFamily: Family | null
  families: Record<Family, FamilyState>
  custom: CustomProvider[]
  selection: ModelSelection
}

/* ------------------------------------------------------------------ */
/* Family catalogue                                                    */
/* ------------------------------------------------------------------ */

export interface FamilyModelSpec {
  id: string
  context: number
  vision?: boolean
  reasoning?: string[]
}

export interface TierSpec {
  /** monthly base price */
  price: number
  /** first-month promo price for new subscriptions */
  promo: number
  bullets: string[]
}

export interface FamilyConfig {
  name: string
  currency: string
  baseUrl: string
  startBaseUrl: string
  manageUrl: string
  registerUrl: string
  models: FamilyModelSpec[]
  startModels: FamilyModelSpec[]
  tiers: Record<Tier, TierSpec>
  teamSeatPrice: number
}

export const CODING_PLAN_MODELS: FamilyModelSpec[] = [
  { id: 'GLM-5.3', context: 200_000, vision: true, reasoning: ['low', 'high', 'max'] },
  { id: 'GLM-5.3-Flash', context: 128_000, vision: true, reasoning: ['low', 'high'] },
]

const START_PLAN_MODELS: FamilyModelSpec[] = [
  { id: 'GLM-5.3-Flash', context: 128_000, vision: true, reasoning: ['low', 'high'] },
  { id: 'GLM-5.2', context: 128_000, vision: true, reasoning: ['low', 'high', 'max'] },
  { id: 'GLM-5-Turbo', context: 128_000 },
]

export const FAMILY_CONFIG: Record<Family, FamilyConfig> = {
  zai: {
    name: 'Z.ai',
    currency: 'US$',
    baseUrl: 'https://api.z.ai/api/anthropic',
    startBaseUrl: 'https://zcode.z.ai/api/v1/zcode-plan/anthropic',
    manageUrl: 'https://z.ai/manage-apikey/subscription',
    registerUrl: 'https://z.ai/manage-apikey/subscription',
    models: CODING_PLAN_MODELS,
    startModels: START_PLAN_MODELS,
    tiers: {
      lite: {
        price: 6,
        promo: 3,
        bullets: ['Base usage included', 'Small repo iteration', 'Latest models over time', '20+ coding tools'],
      },
      pro: {
        price: 30,
        promo: 15,
        bullets: ['5x Lite usage', 'Mid-sized repo development', 'Priority model access', 'Curated MCP tools'],
      },
      max: {
        price: 60,
        promo: 30,
        bullets: ['20x Lite usage', 'Mid-to-large repo work', 'First model access', 'Peak-time priority'],
      },
    },
    teamSeatPrice: 85,
  },
  bigmodel: {
    name: 'BigModel',
    currency: '¥',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    startBaseUrl: 'https://zcode.z.ai/api/v1/zcode-plan/anthropic',
    manageUrl: 'https://bigmodel.cn/coding-plan/personal/overview',
    registerUrl: 'https://open.bigmodel.cn/login',
    models: CODING_PLAN_MODELS,
    startModels: START_PLAN_MODELS,
    tiers: {
      lite: {
        price: 18,
        promo: 9,
        bullets: ['Base usage allowance', 'Light iteration for small repos', 'Latest models rolled out over time', '20+ coding tools'],
      },
      pro: {
        price: 98,
        promo: 49,
        bullets: ['5x Lite usage allowance', 'Daily development for mid-sized repos', 'Priority access to latest models', 'Curated MCP tools'],
      },
      max: {
        price: 188,
        promo: 94,
        bullets: ['20x Lite usage allowance', 'Deep work on mid-to-large repos', 'First access to latest models', 'Peak-time resource priority'],
      },
    },
    teamSeatPrice: 598,
  },
}

export const FAMILY_ORDER: Family[] = ['zai', 'bigmodel']

/* ------------------------------------------------------------------ */
/* Provider templates (Add provider picker)                            */
/* ------------------------------------------------------------------ */

export interface ProviderTemplate {
  id: string
  name: string
  group: 'zhipu' | 'other'
  baseUrl: string
  apiFormat: ApiFormat
  keyUrl?: string
  models: { id: string; context: number; vision?: boolean }[]
  /** fallback logo letter */
  letter: string
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'zai-api',
    name: 'Z.ai Coding Plan',
    group: 'zhipu',
    baseUrl: 'https://api.z.ai/api/anthropic',
    apiFormat: 'anthropic',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    models: [
      { id: 'GLM-5.3', context: 200_000, vision: true },
      { id: 'GLM-5.3-Flash', context: 128_000, vision: true },
    ],
    letter: 'Z',
  },
  {
    id: 'bigmodel-api',
    name: 'BigModel Coding Plan',
    group: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    apiFormat: 'anthropic',
    keyUrl: 'https://bigmodel.cn/coding-plan/personal/overview',
    models: [
      { id: 'GLM-5.3', context: 200_000, vision: true },
      { id: 'GLM-5.3-Flash', context: 128_000, vision: true },
    ],
    letter: 'B',
  },
  {
    id: 'zai-standard-api',
    name: 'Z.ai API',
    group: 'zhipu',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiFormat: 'openai-chat',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    models: [
      { id: 'GLM-5.3', context: 200_000, vision: true },
      { id: 'GLM-5.3-Flash', context: 128_000, vision: true },
      { id: 'GLM-5V-Turbo', context: 128_000, vision: true },
      { id: 'GLM-5.2', context: 128_000, vision: true },
      { id: 'GLM-5', context: 128_000 },
      { id: 'GLM-4.7', context: 128_000 },
    ],
    letter: 'Z',
  },
  {
    id: 'bigmodel-standard-api',
    name: 'BigModel API',
    group: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiFormat: 'openai-chat',
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    models: [
      { id: 'GLM-5.3', context: 200_000, vision: true },
      { id: 'GLM-5.3-Flash', context: 128_000, vision: true },
      { id: 'GLM-5V-Turbo', context: 128_000, vision: true },
      { id: 'GLM-5.2', context: 128_000, vision: true },
      { id: 'GLM-5', context: 128_000 },
      { id: 'GLM-4.7', context: 128_000 },
    ],
    letter: 'B',
  },
  {
    id: 'moonshot-kimi',
    name: 'Kimi',
    group: 'other',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'kimi-k3', context: 256_000 },
      { id: 'kimi-k2.7-code', context: 128_000 },
      { id: 'kimi-k2.6', context: 128_000 },
    ],
    letter: 'K',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    group: 'other',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'MiniMax-M3', context: 200_000 },
      { id: 'MiniMax-M2.7', context: 128_000 },
      { id: 'MiniMax-M2.5', context: 128_000 },
    ],
    letter: 'M',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    group: 'other',
    baseUrl: 'https://api.deepseek.com/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'deepseek-flash', context: 128_000 },
      { id: 'deepseek-v4-pro', context: 128_000 },
    ],
    letter: 'D',
  },
  {
    id: 'qwen-alibaba-model-studio-cn',
    name: 'Alibaba Cloud (China)',
    group: 'other',
    baseUrl: 'https://dashscope.aliyuncs.com/apps/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'qwen3.8-max', context: 256_000 },
      { id: 'qwen3.8-plus', context: 128_000 },
    ],
    letter: 'A',
  },
  {
    id: 'qwen-alibaba-model-studio-intl',
    name: 'Alibaba Cloud (Global)',
    group: 'other',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiFormat: 'openai-chat',
    models: [
      { id: 'qwen3.8-max', context: 256_000 },
      { id: 'qwen3.8-plus', context: 128_000 },
    ],
    letter: 'A',
  },
  {
    id: 'xiaomi-mimo',
    name: 'Xiaomi MiMo API',
    group: 'other',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'mimo-v2.6-pro', context: 128_000 },
      { id: 'mimo-v2.6-flash', context: 128_000 },
    ],
    letter: 'M',
  },
  {
    id: 'xiaomi-mimo-token-plan',
    name: 'Xiaomi MiMo Token Plan',
    group: 'other',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    apiFormat: 'anthropic',
    models: [
      { id: 'mimo-v2.6-pro', context: 128_000 },
      { id: 'mimo-v2.6-flash', context: 128_000 },
    ],
    letter: 'M',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    group: 'other',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai-responses',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-6-astra', context: 400_000 },
      { id: 'gpt-5.6-sol', context: 200_000 },
      { id: 'gpt-5.6-terra', context: 200_000 },
      { id: 'gpt-5.4-mini', context: 128_000 },
    ],
    letter: 'O',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    group: 'other',
    baseUrl: 'https://api.anthropic.com/v1',
    apiFormat: 'anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-fable-5-1', context: 200_000 },
      { id: 'claude-opus-5', context: 200_000 },
      { id: 'claude-sonnet-5', context: 200_000 },
      { id: 'claude-haiku-4-5-20251001', context: 200_000 },
    ],
    letter: 'A',
  },
  {
    id: 'xai',
    name: 'xAI',
    group: 'other',
    baseUrl: 'https://api.x.ai/v1',
    apiFormat: 'openai-responses',
    models: [
      { id: 'grok-4.6', context: 256_000 },
      { id: 'grok-4.3', context: 128_000 },
    ],
    letter: 'X',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    group: 'other',
    baseUrl: 'https://openrouter.ai/api',
    apiFormat: 'anthropic',
    keyUrl: 'https://openrouter.ai/keys',
    models: [
      { id: 'z-ai/glm-5.3', context: 200_000, vision: true },
      { id: 'z-ai/glm-5.3-flash', context: 128_000, vision: true },
      { id: 'anthropic/claude-sonnet-5', context: 200_000 },
      { id: 'openai/gpt-5.6', context: 200_000 },
    ],
    letter: 'O',
  },
  {
    id: 'opencode-go-chat',
    name: 'OpenCode Go (Chat)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiFormat: 'openai-chat',
    models: [{ id: 'qwen3-coder', context: 256_000 }],
    letter: 'G',
  },
  {
    id: 'opencode-go-messages',
    name: 'OpenCode Go (Anthropic)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiFormat: 'anthropic',
    models: [{ id: 'qwen3-coder', context: 256_000 }],
    letter: 'G',
  },
  {
    id: 'opencode-go-responses',
    name: 'OpenCode Go (Responses)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiFormat: 'openai-responses',
    models: [{ id: 'qwen3-coder', context: 256_000 }],
    letter: 'G',
  },
  {
    id: 'opencode-zen-responses',
    name: 'OpenCode Zen (Responses)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiFormat: 'openai-responses',
    models: [{ id: 'claude-sonnet-5', context: 200_000 }],
    letter: 'Z',
  },
  {
    id: 'opencode-zen-messages',
    name: 'OpenCode Zen (Anthropic)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiFormat: 'anthropic',
    models: [{ id: 'claude-sonnet-5', context: 200_000 }],
    letter: 'Z',
  },
  {
    id: 'opencode-zen-chat',
    name: 'OpenCode Zen (Chat)',
    group: 'other',
    baseUrl: 'https://opencode.ai/zen/v1',
    apiFormat: 'openai-chat',
    models: [{ id: 'gpt-5.6', context: 200_000 }],
    letter: 'Z',
  },
]

export function templateById(id: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.id === id)
}

/* ------------------------------------------------------------------ */
/* Default state                                                       */
/* ------------------------------------------------------------------ */

function startBalances(): StartPlanBalance[] {
  return [
    { name: 'GLM-5.3-Flash', totalTokens: 2_000_000, remainingPct: 71, resetAt: '18:00' },
    { name: 'GLM-5.2', totalTokens: 512_000, remainingPct: 54, resetAt: '18:00' },
    { name: 'GLM-5-Turbo', totalTokens: 512_000, remainingPct: 88, resetAt: '18:00' },
  ]
}

function quotasFor(tier: Tier): CodingPlanState['quotas'] {
  const table: Record<Tier, CodingPlanState['quotas']> = {
    lite: {
      fiveHour: { pct: 62, resetAt: '21:00' },
      weekly: { pct: 48, resetAt: 'Mar 21' },
      toolCalls: { pct: 35, resetAt: 'Apr 1' },
      mcp: { pct: 80, resetAt: '24:00' },
    },
    pro: {
      fiveHour: { pct: 73, resetAt: '21:00' },
      weekly: { pct: 65, resetAt: 'Mar 21' },
      toolCalls: { pct: 60, resetAt: 'Apr 1' },
      mcp: { pct: 90, resetAt: '24:00' },
    },
    max: {
      fiveHour: { pct: 86, resetAt: '21:00' },
      weekly: { pct: 81, resetAt: 'Mar 21' },
      toolCalls: { pct: 85, resetAt: 'Apr 1' },
      mcp: { pct: 96, resetAt: '24:00' },
    },
  }
  return table[tier]
}

function providerFromTemplate(template: ProviderTemplate, apiKey: string): CustomProvider {
  return {
    id: `${template.id}-${Math.random().toString(36).slice(2, 8)}`,
    name: template.name,
    baseUrl: template.baseUrl,
    apiFormat: template.apiFormat,
    apiKey,
    keyUrl: template.keyUrl,
    enabled: true,
    models: template.models.map((m) => ({
      id: m.id,
      contextWindow: m.context,
      maxOutput: 64_000,
      enabled: true,
      builtin: true,
      vision: m.vision ?? false,
      reasoning: [],
    })),
  }
}

function defaultCustomProviders(): CustomProvider[] {
  return [
    providerFromTemplate(templateById('openai')!, 'sk-proj-9fJ3kQ2mVb7xLpR4dXwA6TgH'),
    providerFromTemplate(templateById('anthropic')!, 'sk-ant-api04-7bK2mX9qLw5eR8tY3uIoP'),
  ]
}

function defaultState(): ModelPlanState {
  return {
    activeFamily: 'zai',
    families: {
      zai: {
        connected: true,
        coding: {
          status: 'purchased',
          tier: 'lite',
          cycle: 'monthly',
          renewsAt: 'Mar 15',
          teamSeats: null,
          quotas: quotasFor('lite'),
        },
        start: { status: 'active', balances: startBalances() },
        mode: 'individual',
      },
      bigmodel: {
        connected: false,
        coding: {
          status: 'disconnected',
          tier: null,
          cycle: 'monthly',
          renewsAt: '',
          teamSeats: null,
          quotas: quotasFor('lite'),
        },
        start: { status: 'disconnected', balances: [] },
        mode: 'individual',
      },
    },
    custom: defaultCustomProviders(),
    selection: { group: 'zai', model: 'GLM-5.3' },
  }
}

export const DEFAULT_MODEL_PLAN: ModelPlanState = defaultState()

/* ------------------------------------------------------------------ */
/* Store (pub/sub + localStorage persistence, SSR-safe)                */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'payswap-model-plan-v1'
const listeners = new Set<() => void>()
let state: ModelPlanState = DEFAULT_MODEL_PLAN
let hydrated = false

function persist(next: ModelPlanState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — keep in-memory state */
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelPlanState>
      state = {
        ...DEFAULT_MODEL_PLAN,
        ...parsed,
        families: {
          zai: { ...DEFAULT_MODEL_PLAN.families.zai, ...parsed.families?.zai },
          bigmodel: { ...DEFAULT_MODEL_PLAN.families.bigmodel, ...parsed.families?.bigmodel },
        },
      }
    }
  } catch {
    /* corrupted storage — fall back to defaults */
  }
}

function setModelPlan(updater: (s: ModelPlanState) => ModelPlanState) {
  ensureHydrated()
  state = updater(state)
  persist(state)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getClientSnapshot(): ModelPlanState {
  ensureHydrated()
  return state
}

function getServerSnapshot(): ModelPlanState {
  return DEFAULT_MODEL_PLAN
}

export function useModelPlan(): ModelPlanState {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

function futureDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** OAuth sign-in for a family — activates the free Start Plan like ZCode. */
export function loginFamily(family: Family) {
  setModelPlan((s) => ({
    ...s,
    activeFamily: family,
    families: {
      ...s.families,
      [family]: {
        ...s.families[family],
        connected: true,
        mode: 'individual',
        coding:
          s.families[family].coding.status === 'disconnected'
            ? { ...s.families[family].coding, status: 'notPurchased' }
            : s.families[family].coding,
        start:
          s.families[family].start.status === 'disconnected'
            ? { status: 'active', balances: startBalances() }
            : s.families[family].start,
      },
    },
  }))
}

/** Unlink — logs the app out of the family OAuth account. */
export function logoutFamily(family: Family) {
  setModelPlan((s) => ({
    ...s,
    activeFamily: s.activeFamily === family ? null : s.activeFamily,
    families: {
      ...s.families,
      [family]: {
        connected: false,
        mode: 'individual',
        coding: { ...s.families[family].coding, status: 'disconnected', teamSeats: null },
        start: { status: 'disconnected', balances: [] },
      },
    },
  }))
}

/** Subscribe to / upgrade a Coding Plan (simulated payment completes instantly). */
export function purchaseCodingPlan(family: Family, tier: Tier, cycle: BillingCycle, seats?: number) {
  const isTeam = typeof seats === 'number' && seats > 0
  setModelPlan((s) => ({
    ...s,
    families: {
      ...s.families,
      [family]: {
        ...s.families[family],
        connected: true,
        mode: isTeam ? 'team' : 'individual',
        coding: {
          status: 'purchased',
          tier,
          cycle,
          renewsAt: futureDate(cycle === 'monthly' ? 30 : cycle === 'quarterly' ? 90 : 365),
          teamSeats: isTeam ? seats ?? 1 : null,
          quotas: quotasFor(tier),
        },
      },
    },
  }))
}

export function setConnectionMode(family: Family, mode: ConnectionMode) {
  setModelPlan((s) => ({
    ...s,
    families: {
      ...s.families,
      [family]: { ...s.families[family], mode },
    },
  }))
}

export function addProviderFromTemplate(templateId: string): string | null {
  const template = templateById(templateId)
  if (!template) return null
  const provider = providerFromTemplate(template, '')
  setModelPlan((s) => ({ ...s, custom: [...s.custom, provider] }))
  return provider.id
}

export function createCustomProvider(): string {
  const provider: CustomProvider = {
    id: `custom-${Math.random().toString(36).slice(2, 8)}`,
    name: 'New provider',
    baseUrl: '',
    apiFormat: 'anthropic',
    apiKey: '',
    enabled: false,
    models: [],
  }
  setModelPlan((s) => ({ ...s, custom: [...s.custom, provider] }))
  return provider.id
}

export function patchProvider(id: string, patch: Partial<Omit<CustomProvider, 'id' | 'models'>>) {
  setModelPlan((s) => ({
    ...s,
    custom: s.custom.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  }))
}

export function deleteProvider(id: string) {
  setModelPlan((s) => ({
    ...s,
    custom: s.custom.filter((p) => p.id !== id),
    selection: s.selection.group === id ? { group: 'zai', model: 'GLM-5.3' } : s.selection,
  }))
}

export function addProviderModel(providerId: string, model: Omit<CustomModel, 'builtin'>) {
  setModelPlan((s) => ({
    ...s,
    custom: s.custom.map((p) =>
      p.id === providerId ? { ...p, models: [...p.models, { ...model, builtin: false }] } : p,
    ),
  }))
}

export function patchProviderModel(providerId: string, modelId: string, patch: Partial<CustomModel>) {
  setModelPlan((s) => ({
    ...s,
    custom: s.custom.map((p) =>
      p.id === providerId
        ? { ...p, models: p.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m)) }
        : p,
    ),
  }))
}

export function deleteProviderModel(providerId: string, modelId: string) {
  setModelPlan((s) => ({
    ...s,
    custom: s.custom.map((p) =>
      p.id === providerId ? { ...p, models: p.models.filter((m) => m.id !== modelId) } : p,
    ),
  }))
}

export function selectModel(selection: ModelSelection) {
  setModelPlan((s) => ({ ...s, selection }))
}

/* ------------------------------------------------------------------ */
/* Composer model groups (mirrors ZCode's ModelConfigSelect)           */
/* ------------------------------------------------------------------ */

export interface ModelGroup {
  id: string
  label: string
  badge: string
  tone: 'green' | 'slate'
  models: string[]
}

export function modelSelectionGroups(s: ModelPlanState): ModelGroup[] {
  const groups: ModelGroup[] = []
  for (const family of FAMILY_ORDER) {
    const f = s.families[family]
    const cfg = FAMILY_CONFIG[family]
    if (!f.connected) continue
    if (f.coding.status === 'purchased') {
      groups.push({
        id: family,
        label: cfg.name,
        badge: f.coding.teamSeats ? 'Team' : 'Individual',
        tone: 'green',
        models: cfg.models.map((m) => m.id),
      })
    }
    if (f.start.status === 'active') {
      groups.push({
        id: `${family}-start`,
        label: 'Start Plan',
        badge: 'Free',
        tone: 'green',
        models: cfg.startModels.map((m) => m.id),
      })
    }
  }
  for (const p of s.custom) {
    if (!p.enabled || p.models.length === 0) continue
    groups.push({
      id: p.id,
      label: p.name,
      badge: 'API',
      tone: 'slate',
      models: p.models.filter((m) => m.enabled).map((m) => m.id),
    })
  }
  return groups
}

/** Resolve the effective selection, falling back when the saved one vanished. */
export function effectiveSelection(s: ModelPlanState): ModelSelection {
  const groups = modelSelectionGroups(s)
  const found = groups.find((g) => g.id === s.selection.group)
  if (found && found.models.includes(s.selection.model)) return s.selection
  const first = groups[0]
  if (found && found.models[0]) return { group: found.id, model: found.models[0] }
  if (first) return { group: first.id, model: first.models[0] ?? '' }
  return { group: '', model: '' }
}
