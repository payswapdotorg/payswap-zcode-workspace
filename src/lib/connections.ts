/**
 * Connected capability instances (capability fabric analogue) — client-safe.
 * The sandbox financial engine (src/server/finance.ts) imports this too, so
 * route discovery and the UI always describe the same capability instances.
 */

export interface ConnectionInstance {
  id: string
  provider: string
  family: 'Cards & PSPs' | 'Mobile money' | 'Banks' | 'FX' | 'Blockchain' | 'Data'
  method: 'Delegated OAuth' | 'Scoped API keys' | 'Interactive session' | 'Wallet signature'
  environment: 'sandbox' | 'live'
  status: 'connected' | 'available' | 'degraded' | 'testing'
  capabilities: string[]
  scopes: string[]
  accountRef: string
  connectedAt: string
  feeBps: number
  etaMinutes: number
}

export const CONNECTIONS: ConnectionInstance[] = [
  {
    id: 'cn-stripe',
    provider: 'Stripe',
    family: 'Cards & PSPs',
    method: 'Delegated OAuth',
    environment: 'sandbox',
    status: 'connected',
    capabilities: ['accept_cards', 'hosted_checkout', 'payouts'],
    scopes: ['charges:write', 'payouts:read', 'refunds:write'],
    accountRef: 'acct_demo_123',
    connectedAt: '2025-06-02',
    feeBps: 290,
    etaMinutes: 15,
  },
  {
    id: 'cn-mpesa',
    provider: 'M-Pesa (Daraja)',
    family: 'Mobile money',
    method: 'Scoped API keys',
    environment: 'sandbox',
    status: 'connected',
    capabilities: ['collect_mobile', 'payout_mobile'],
    scopes: ['b2c:write', 'c2b:read'],
    accountRef: 'shortcode 4123890',
    connectedAt: '2025-05-18',
    feeBps: 180,
    etaMinutes: 2,
  },
  {
    id: 'cn-sepa',
    provider: 'SEPA Instant (EBA)',
    family: 'Banks',
    method: 'Scoped API keys',
    environment: 'sandbox',
    status: 'connected',
    capabilities: ['payout_bank', 'collect_bank'],
    scopes: ['credit-transfers:write'],
    accountRef: 'PSB-EU-001',
    connectedAt: '2025-04-30',
    feeBps: 40,
    etaMinutes: 10,
  },
  {
    id: 'cn-wise',
    provider: 'Wise Platform',
    family: 'FX',
    method: 'Delegated OAuth',
    environment: 'sandbox',
    status: 'connected',
    capabilities: ['fx_convert', 'fx_quote'],
    scopes: ['quotes:read', 'transfers:write'],
    accountRef: 'wise_profile_8841',
    connectedAt: '2025-06-10',
    feeBps: 33,
    etaMinutes: 20,
  },
  {
    id: 'cn-railgun',
    provider: 'Base (USDC)',
    family: 'Blockchain',
    method: 'Wallet signature',
    environment: 'sandbox',
    status: 'connected',
    capabilities: ['onchain_transfer', 'onchain_swap'],
    scopes: ['sign:scoped', 'simulate:read'],
    accountRef: '0x7f3…c21a (non-custodial)',
    connectedAt: '2025-06-21',
    feeBps: 12,
    etaMinutes: 3,
  },
  {
    id: 'cn-adyen',
    provider: 'Adyen',
    family: 'Cards & PSPs',
    method: 'Scoped API keys',
    environment: 'sandbox',
    status: 'available',
    capabilities: ['accept_cards', 'risk_passthrough'],
    scopes: [],
    accountRef: '—',
    connectedAt: '',
    feeBps: 250,
    etaMinutes: 15,
  },
  {
    id: 'cn-mtn',
    provider: 'MTN MoMo',
    family: 'Mobile money',
    method: 'Scoped API keys',
    environment: 'sandbox',
    status: 'available',
    capabilities: ['collect_mobile', 'payout_mobile'],
    scopes: [],
    accountRef: '—',
    connectedAt: '',
    feeBps: 200,
    etaMinutes: 3,
  },
]

export const CONNECTION_FAMILIES: ConnectionInstance['family'][] = [
  'Cards & PSPs',
  'Mobile money',
  'Banks',
  'FX',
  'Blockchain',
  'Data',
]
