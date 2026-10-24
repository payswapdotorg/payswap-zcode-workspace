'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AlarmClock, Anchor, Archive, ArrowUpRight, BarChart3, Blocks, Bot, Brain, Cable, Check, Code2, Copy,
  Eye, EyeOff, FileSearch, Globe2, HardDrive, Info, Keyboard, Lock, Package, Palette, Plus, RefreshCw,
  Settings2, ShieldCheck, ShoppingBag, Terminal, Wallet, WandSparkles, X, type LucideIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { ApprovalView, PaySettings } from '@/lib/agent-types'
import { FAMILY_CONFIG, useModelPlan } from '@/lib/model-plan'
import { seedPlugins } from '@/lib/paydata'
import { cn } from '@/lib/utils'
import { C, SectionLabel, StatusPill } from './bits'
import { ModelProvidersSection } from './model-providers'
import { ApprovalsView } from './view-approvals'
import { CheckoutView } from './view-checkout'
import { ConnectionsView } from './view-connections'

type Patch = (patch: Partial<PaySettings>) => void

/* ------------------------------------------------------------------ */
/* Settings navigation (faithful to the original ZCode settings nav)    */
/* ------------------------------------------------------------------ */

type SectionId =
  | 'payments' | 'connections' | 'checkout' | 'approvals' | 'developer' | 'general'
  | 'appearance' | 'providers' | 'browser' | 'devices'
  | 'shortcuts' | 'searchScope' | 'memory' | 'subagents' | 'plugins' | 'mcp' | 'skills'
  | 'commands' | 'automations' | 'hooks' | 'usage' | 'archive'

const SECTION_META: Record<SectionId, { title: string; desc: string }> = {
  payments: {
    title: 'Payments & routing',
    desc: 'Financial authority — policy, approvals and the settlement environment. The agent proposes; PaySwap disposes.',
  },
  connections: {
    title: 'Connections',
    desc: 'Connect rails, gateways and wallets the agent may route through when fulfilling economic goals.',
  },
  checkout: {
    title: 'Checkout & links',
    desc: 'Hosted checkout, payment links and Surface API snippets — the rails-side of a merchant routine.',
  },
  approvals: {
    title: 'Approvals',
    desc: 'Human-in-the-loop gates for sensitive economic actions — the agent asks, you decide.',
  },
  developer: {
    title: 'Developer & API',
    desc: 'Add PaySwap to your own systems — one financial protocol across every surface.',
  },
  general: { title: 'General', desc: 'Workspace behavior and preferences.' },
  appearance: { title: 'Appearance', desc: 'Theme and presentation.' },
  providers: {
    title: 'Model settings',
    desc: 'Manage custom model providers. Once configured, they can be selected during chat.',
  },
  browser: { title: 'Browser Use', desc: 'Sites the agent may control in the browser.' },
  devices: { title: 'Remote devices', desc: 'Devices paired with this workspace.' },
  shortcuts: { title: 'Keyboard Shortcuts', desc: 'Editor and workspace shortcuts.' },
  searchScope: { title: 'Workspace Search Scope', desc: 'Files the workspace search ignores (.zcodeignore).' },
  memory: { title: 'Memory', desc: 'Workspace memory for the agent.' },
  subagents: { title: 'Subagents', desc: 'Specialized agents available to the runtime.' },
  plugins: { title: 'Plugins', desc: 'Installed plugin management.' },
  mcp: { title: 'MCP Servers', desc: 'Model Context Protocol servers exposing tools.' },
  skills: { title: 'Skills', desc: 'Reusable skill packs for the agent.' },
  commands: { title: 'Commands', desc: 'Slash commands in the composer.' },
  automations: { title: 'Routines', desc: 'Reusable playbooks the agent loads from the task tab.' },
  hooks: { title: 'Hooks', desc: 'Lifecycle hooks around agent tasks.' },
  usage: { title: 'Usage', desc: 'Agent usage and quota.' },
  archive: { title: 'Archive management', desc: 'Archived tasks and retention.' },
}

interface NavItem {
  id: SectionId
  label: string
  icon: LucideIcon
  beta?: boolean
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'PaySwap',
    items: [
      { id: 'payments', label: 'Payments & routing', icon: Wallet },
      { id: 'connections', label: 'Connections', icon: Cable },
      { id: 'checkout', label: 'Checkout & links', icon: ShoppingBag },
      { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
      { id: 'developer', label: 'Developer & API', icon: Code2 },
    ],
  },
  {
    label: 'Basics',
    items: [
      { id: 'general', label: 'General', icon: Settings2 },
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'providers', label: 'Model settings', icon: Package },
      { id: 'browser', label: 'Browser Use', icon: Globe2 },
      { id: 'devices', label: 'Remote devices', icon: HardDrive },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
      { id: 'searchScope', label: 'Workspace Search Scope', icon: FileSearch },
    ],
  },
  {
    label: 'Agent capabilities',
    items: [
      { id: 'memory', label: 'Memory', icon: Brain },
      { id: 'subagents', label: 'Subagents', icon: Bot },
      { id: 'plugins', label: 'Plugins', icon: Blocks },
      { id: 'mcp', label: 'MCP Servers', icon: Cable },
      { id: 'skills', label: 'Skills', icon: WandSparkles },
      { id: 'commands', label: 'Commands', icon: Terminal },
      { id: 'automations', label: 'Routines', icon: AlarmClock, beta: true },
      { id: 'hooks', label: 'Hooks', icon: Anchor },
    ],
  },
  {
    label: 'Data and statistics',
    items: [
      { id: 'usage', label: 'Usage', icon: BarChart3 },
      { id: 'archive', label: 'Archive management', icon: Archive },
    ],
  },
]

/* ------------------------------------------------------------------ */
/* Tiny shared building blocks                                         */
/* ------------------------------------------------------------------ */

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <header className="mb-5">
      <h1 className="text-xl font-semibold text-[#102642]">{title}</h1>
      <p className="mt-1 text-sm leading-relaxed text-[#5a7189]">{desc}</p>
    </header>
  )
}

function GroupCard({ title, desc, children }: { title?: string; desc?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#dce5e9] bg-white">
      {title ? (
        <div className="px-4 pb-1 pt-3.5">
          <h3 className="text-[13px] font-semibold text-[#102642]">{title}</h3>
          {desc ? <p className="mt-0.5 text-[12px] leading-relaxed text-[#5a7189]">{desc}</p> : null}
        </div>
      ) : null}
      <div className="divide-y divide-[#dce5e9]">{children}</div>
    </section>
  )
}

function Row({
  label, desc, children, wide = false, mono = false, muted = false,
}: {
  label: ReactNode
  desc?: ReactNode
  children: ReactNode
  /** wider control column (280px) for selects, inputs and sliders */
  wide?: boolean
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_192px] items-center gap-3 px-4 py-3', wide && 'sm:grid-cols-[minmax(0,1fr)_280px]')}>
      <div className="min-w-0">
        <p className={cn('text-[13px] font-medium', mono && 'font-mono text-[12px]', muted ? 'text-[#8ba0b3]' : 'text-[#102642]')}>{label}</p>
        {desc ? <p className="mt-1 text-[12px] leading-relaxed text-[#5a7189]">{desc}</p> : null}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-[#dce5e9] bg-[#f6f9fa] px-1.5 py-0.5 font-mono text-[11px] text-[#5a7189]">{children}</kbd>
}

function Toggle({
  checked, onCheckedChange, disabled, ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
  ariaLabel: string
}) {
  return <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={ariaLabel} className="data-[state=checked]:bg-[#0b8b6c]" />
}

/** Row + Switch shorthand. */
function ToggleRow({
  label, desc, checked, onCheckedChange, ariaLabel, mono, muted,
}: {
  label: ReactNode
  desc?: ReactNode
  checked: boolean
  onCheckedChange: (v: boolean) => void
  ariaLabel: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <Row label={label} desc={desc} mono={mono} muted={muted}>
      <Toggle checked={checked} onCheckedChange={onCheckedChange} ariaLabel={ariaLabel} />
    </Row>
  )
}

function Segmented<V extends string>({
  value, onValue, options, ariaLabel,
}: {
  value: V
  onValue: (v: V) => void
  options: { value: V; label: string; disabled?: boolean }[]
  ariaLabel?: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center rounded-lg border border-[#dce5e9] bg-[#f6f9fa] p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            aria-pressed={active}
            onClick={() => onValue(o.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors',
              active ? 'bg-[#e2f4ed] text-[#087d62]' : 'text-[#5a7189] hover:text-[#102642]',
              o.disabled && 'cursor-not-allowed text-[#c3d0da] hover:text-[#c3d0da]',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SelectCell<V extends string>({
  value, onValue, options, disabled, ariaLabel, className,
}: {
  value: V
  onValue: (v: V) => void
  options: { value: V; label: string }[]
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onValue(v as V)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className={cn('h-8 w-full rounded-lg border-[#dce5e9] bg-white text-[12px] text-[#102642]', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-[13px]">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Wide Row + Select shorthand. */
function SelectRow<V extends string>({
  label, desc, value, onValue, options, disabled, ariaLabel, mono, muted,
}: {
  label: ReactNode
  desc?: ReactNode
  value: V
  onValue: (v: V) => void
  options: { value: V; label: string }[]
  disabled?: boolean
  ariaLabel?: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <Row label={label} desc={desc} wide mono={mono} muted={muted}>
      <SelectCell ariaLabel={ariaLabel} value={value} onValue={onValue} disabled={disabled} options={options} />
    </Row>
  )
}

function NumInput({
  value, onValue, prefix, ariaLabel,
}: {
  value: number
  onValue: (n: number) => void
  prefix?: string
  ariaLabel: string
}) {
  return (
    <div className="relative w-full">
      {prefix ? (
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8ba0b3]">{prefix}</span>
      ) : null}
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const n = e.target.value === '' ? 0 : Number(e.target.value)
          onValue(Number.isFinite(n) ? n : 0)
        }}
        className={cn('h-8 w-full rounded-lg border-[#dce5e9] bg-white text-[13px] tabular-nums', prefix && 'pl-7')}
      />
    </div>
  )
}

function QuotaBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#eef2f5]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.green }} />
      </div>
      <span className="font-mono text-[12px] tabular-nums text-[#5a7189]">{pct}%</span>
    </div>
  )
}

function Dot({ tone = 'green' }: { tone?: 'green' | 'muted' | 'amber' }) {
  const bg = tone === 'green' ? C.green : tone === 'amber' ? C.amberDot : '#c3d0da'
  return <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: bg }} />
}

/* ------------------------------------------------------------------ */
/* PaySwap · Payments                                                  */
/* ------------------------------------------------------------------ */

function PaymentsSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  return (
    <>
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-[#8ba0b3]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Connections, checkout and approvals now live here in Settings — the main workspace stays focused on your economic goals.
      </p>

      <GroupCard>
        <Row label="Environment" desc="Sandbox and live are explicit and enforced. No live provider instance is certified, so live is locked.">
          <Segmented ariaLabel="Settlement environment" value={s.environment} onValue={(v) => patch({ environment: v })}
            options={[{ value: 'sandbox', label: 'Sandbox' }, { value: 'live', label: 'Live', disabled: true }]} />
        </Row>
      </GroupCard>

      <GroupCard>
        <SelectRow label="Default settlement currency" ariaLabel="Default settlement currency" value={s.settlementCurrency} onValue={(v) => patch({ settlementCurrency: v })}
          options={[{ value: 'GHS', label: 'GHS' }, { value: 'NGN', label: 'NGN' }, { value: 'KES', label: 'KES' }, { value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }]} />
      </GroupCard>

      <GroupCard title="Execution modes" desc="Every eligible route competes under the same economic model — provider-native stays a baseline candidate.">
        <ToggleRow mono label="PASS_THROUGH_NATIVE" desc="Use a provider's native capability as offered." checked={s.modeNative} onCheckedChange={(v) => patch({ modeNative: v })} ariaLabel="Toggle PASS_THROUGH_NATIVE execution mode" />
        <ToggleRow mono label="COMPOSED_PAYSWAP" desc="Compose capabilities under PaySwap's economic and financial rules." checked={s.modeComposed} onCheckedChange={(v) => patch({ modeComposed: v })} ariaLabel="Toggle COMPOSED_PAYSWAP execution mode" />
        <ToggleRow mono label="OPTIMIZED_MULTI_PROVIDER" desc="Coordinate multiple eligible providers to achieve the goal." checked={s.modeOptimized} onCheckedChange={(v) => patch({ modeOptimized: v })} ariaLabel="Toggle OPTIMIZED_MULTI_PROVIDER execution mode" />
      </GroupCard>

      <GroupCard title="Route policy">
        <SelectRow label="Max route hops" desc="Maximum hops a composed route may take." ariaLabel="Maximum route hops" value={String(s.maxRouteHops)} onValue={(v) => patch({ maxRouteHops: Number(v) })}
          options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]} />
        <Row label="FX spread cap" desc="Reject routes whose FX spread exceeds this cap — rejected routes are shown with reasons, never hidden." wide>
          <div className="flex w-full items-center gap-3">
            <Slider aria-label="FX spread cap in basis points" min={10} max={120} step={5} value={[s.fxSpreadCapBps]}
              onValueChange={(v) => patch({ fxSpreadCapBps: v[0] ?? s.fxSpreadCapBps })}
              className="flex-1 [&_[data-slot=slider-range]]:bg-[#0b8b6c] [&_[data-slot=slider-thumb]]:border-[#0b8b6c]" />
            <span className="w-14 text-right font-mono text-[12px] tabular-nums text-[#102642]">{s.fxSpreadCapBps} bps</span>
          </div>
        </Row>
      </GroupCard>

      <GroupCard title="Approvals">
        <Row label="Auto-approve limit" desc="Payments above this amount require a human approval before execution." wide>
          <NumInput ariaLabel="Auto-approve limit in dollars" prefix="$" value={s.autoApproveLimit} onValue={(n) => patch({ autoApproveLimit: n })} />
        </Row>
        <ToggleRow label="Require settlement proof" desc="Require rail-level settlement proof before reporting finality." checked={s.requireSettlementProof} onCheckedChange={(v) => patch({ requireSettlementProof: v })} ariaLabel="Toggle settlement proof requirement" />
        <ToggleRow label="Re-auth on route change" desc="Re-check authorization whenever destination, amount or route changes." checked={s.reauthOnRouteChange} onCheckedChange={(v) => patch({ reauthOnRouteChange: v })} ariaLabel="Toggle re-authorization on route change" />
      </GroupCard>

      <GroupCard title="Mandate defaults">
        <Row label="Daily spend cap" desc="Daily spend cap delegated to the agent." wide>
          <NumInput ariaLabel="Mandate daily spend cap" value={s.mandateDailyCap} onValue={(n) => patch({ mandateDailyCap: n })} />
        </Row>
        <Row label="Velocity limit" desc="Maximum executions per day." wide>
          <NumInput ariaLabel="Mandate daily velocity limit" value={s.mandateVelocity} onValue={(n) => patch({ mandateVelocity: n })} />
        </Row>
        <SelectRow label="Expiry" desc="Delegated authority expires automatically." ariaLabel="Mandate expiry in days" value={String(s.mandateExpiryDays)} onValue={(v) => patch({ mandateExpiryDays: Number(v) })}
          options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      </GroupCard>

      <GroupCard title="Evidence & reconciliation">
        <SelectRow label="Evidence retention" desc="How long finality evidence is retained." ariaLabel="Evidence retention period" value={String(s.evidenceRetentionDays)} onValue={(v) => patch({ evidenceRetentionDays: Number(v) })}
          options={[{ value: '90', label: '90 days' }, { value: '365', label: '365 days' }, { value: '2555', label: '7 years' }]} />
        <Row label="Surface UNKNOWN states" desc="Always on. Truthful states are an architectural invariant — no generic green success.">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
          <Switch checked disabled aria-label="Surface UNKNOWN states (locked on)" className="data-[state=checked]:bg-[#0b8b6c]" />
        </Row>
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* PaySwap · Developer & API                                           */
/* ------------------------------------------------------------------ */

const API_BASE_URL = 'https://api.payswap.dev/v1'

function randomHex(n: number): string {
  let out = ''
  for (let i = 0; i < n; i += 1) out += '0123456789abcdef'[Math.floor(Math.random() * 16)]
  return out
}

const CAPABILITY_STATS = [
  { label: 'Capability definitions', value: '24' },
  { label: 'Provider implementations', value: '12' },
  { label: 'Connected instances', value: '5' },
  { label: 'Capability observations (30d)', value: '1,204' },
]

function DeveloperSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  const [apiKey, setApiKey] = useState('psbx_test_b7e97f2a')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }

  const rotate = () => {
    setApiKey(`psbx_test_${randomHex(8)}`)
    setRevealed(false)
  }

  const iconBtn = 'h-7 w-7 shrink-0 rounded-lg border-[#dce5e9] text-[#5a7189] hover:text-[#087d62]'
  const checkIcon = <Check className="h-3.5 w-3.5 text-[#087d62]" aria-hidden="true" />
  const copyIcon = <Copy className="h-3.5 w-3.5" aria-hidden="true" />

  return (
    <>
      <GroupCard title="Surface API">
        <Row label="Base URL">
          <code className="min-w-0 truncate font-mono text-[12px] text-[#102642]">{API_BASE_URL}</code>
          <Button variant="outline" size="icon" aria-label="Copy base URL" className={iconBtn} onClick={() => copy('base', API_BASE_URL)}>
            {copied === 'base' ? checkIcon : copyIcon}
          </Button>
        </Row>
        <Row label="Sandbox API key" wide>
          <code className="min-w-0 truncate font-mono text-[12px] text-[#102642]">{revealed ? apiKey : `psbx_test_••••${apiKey.slice(-4)}`}</code>
          <Button variant="outline" size="icon" aria-label={revealed ? 'Hide API key' : 'Reveal API key'} className={iconBtn} onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
          <Button variant="outline" size="icon" aria-label="Copy API key" className={iconBtn} onClick={() => copy('key', apiKey)}>
            {copied === 'key' ? checkIcon : copyIcon}
          </Button>
          <Button variant="outline" size="icon" aria-label="Rotate API key" className={iconBtn} onClick={rotate}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </Row>
      </GroupCard>

      <GroupCard title="Webhooks">
        <Row label="Webhook URL" desc="Receive signed protocol events." wide>
          <Input
            value={s.webhookUrl}
            onChange={(e) => patch({ webhookUrl: e.target.value })}
            placeholder="https://ops.yourcompany.com/payswap/events"
            aria-label="Webhook URL"
            className="h-8 rounded-lg border-[#dce5e9] bg-white text-[12px]"
          />
        </Row>
        <ToggleRow label="Payment lifecycle" checked={s.webhookEventsPayments} onCheckedChange={(v) => patch({ webhookEventsPayments: v })} ariaLabel="Toggle payment lifecycle webhook events" />
        <ToggleRow label="Approval decisions" checked={s.webhookEventsApprovals} onCheckedChange={(v) => patch({ webhookEventsApprovals: v })} ariaLabel="Toggle approval decision webhook events" />
        <ToggleRow label="Settlement finality" checked={s.webhookEventsSettlement} onCheckedChange={(v) => patch({ webhookEventsSettlement: v })} ariaLabel="Toggle settlement finality webhook events" />
      </GroupCard>

      <GroupCard title="Surfaces" desc="Same economic task, authority rules and protocol state on every client.">
        <Row label="Web">
          <StatusPill tone="green">Live</StatusPill>
          <Toggle checked={s.surfaceWeb} onCheckedChange={(v) => patch({ surfaceWeb: v })} ariaLabel="Toggle web surface" />
        </Row>
        <Row label="Desktop">
          <StatusPill tone="green">Live</StatusPill>
          <Toggle checked={s.surfaceDesktop} onCheckedChange={(v) => patch({ surfaceDesktop: v })} ariaLabel="Toggle desktop surface" />
        </Row>
        <Row label="Mobile" muted>
          <StatusPill tone="slate">Planned</StatusPill>
        </Row>
        <Row label="Browser extension" muted>
          <StatusPill tone="slate">Planned</StatusPill>
        </Row>
      </GroupCard>

      <GroupCard
        title="Capability registry"
        desc="CapabilityDefinition → ProviderImplementation → ConnectedCapabilityInstance → CapabilityObservation. A catalogue entry is not a connected capability."
      >
        {CAPABILITY_STATS.map((stat) => (
          <Row key={stat.label} label={stat.label}>
            <span className="font-mono text-[13px] tabular-nums text-[#102642]">{stat.value}</span>
          </Row>
        ))}
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* PaySwap · Connections / Checkout & links / Approvals                */
/* ------------------------------------------------------------------ */

function ConnectionsSection({ s }: { s: PaySettings }) {
  return <ConnectionsView environment={s.environment} />
}

function CheckoutSection({ s }: { s: PaySettings }) {
  return <CheckoutView environment={s.environment} />
}

/** Bridges the standalone approvals surface to the DB-backed API. */
function ApprovalsSection({ s, onNavigate }: { s: PaySettings; onNavigate: (to: string) => void }) {
  const [approvals, setApprovals] = useState<ApprovalView[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals')
      if (!res.ok) return
      const data = (await res.json()) as { approvals: ApprovalView[] }
      setApprovals(data.approvals)
    } catch {
      /* keep the last known state — the next poll reconciles */
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 10_000)
    return () => window.clearInterval(t)
  }, [load])

  const onDecide = async (id: string, decision: 'approved' | 'denied') => {
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) throw new Error(`decision failed (${res.status})`)
    } catch {
      /* the recorded truth is surfaced by the refetch below */
    } finally {
      void load()
    }
  }

  return (
    <ApprovalsView
      approvals={approvals}
      settings={s}
      onDecide={onDecide}
      onOpenTask={(taskId) => onNavigate(`/task/${taskId}`)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Basics · General                                                    */
/* ------------------------------------------------------------------ */

function GeneralSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  return (
    <>
      <GroupCard title="Language & interface">
        <SelectRow label="Language" ariaLabel="Interface language" value={s.locale} onValue={(v) => patch({ locale: v })}
          options={[{ value: 'system', label: 'System' }, { value: 'en-US', label: 'English (US)' }, { value: 'zh-CN', label: '中文 (Chinese)' }]} />
        <SelectRow label="Interface mode" ariaLabel="Interface mode" value={s.interfaceMode} onValue={(v) => patch({ interfaceMode: v })}
          options={[{ value: 'coding', label: 'Coding' }, { value: 'office', label: 'Office' }]} />
      </GroupCard>

      <GroupCard title="Notifications">
        <ToggleRow label="Notifications" checked={s.notifications} onCheckedChange={(v) => patch({ notifications: v })} ariaLabel="Toggle notifications" />
        <ToggleRow label="Notification sound" checked={s.notificationSound} onCheckedChange={(v) => patch({ notificationSound: v })} ariaLabel="Toggle notification sound" />
      </GroupCard>

      <GroupCard title="Message stream">
        <ToggleRow label="Show reasoning in message stream" desc="Display the agent's thinking steps above tool calls." checked={s.showReasoning} onCheckedChange={(v) => patch({ showReasoning: v })} ariaLabel="Toggle reasoning in message stream" />
        <ToggleRow label="Show task lists in stream" checked={s.showTodos} onCheckedChange={(v) => patch({ showTodos: v })} ariaLabel="Toggle task lists in stream" />
        <ToggleRow label="Group explore tool calls" checked={s.groupExplore} onCheckedChange={(v) => patch({ groupExplore: v })} ariaLabel="Toggle grouping of explore tool calls" />
        <ToggleRow label="Group terminal tool calls" checked={s.groupTerminal} onCheckedChange={(v) => patch({ groupTerminal: v })} ariaLabel="Toggle grouping of terminal tool calls" />
        <ToggleRow label="Group change tool calls" checked={s.groupChanges} onCheckedChange={(v) => patch({ groupChanges: v })} ariaLabel="Toggle grouping of change tool calls" />
      </GroupCard>

      <GroupCard title="Agent interaction">
        <SelectRow label="Interaction behavior" desc="When the agent needs input mid-task." ariaLabel="Interaction behavior" value={s.interactionBehavior} onValue={(v) => patch({ interactionBehavior: v })}
          options={[{ value: 'queue', label: 'Queue' }, { value: 'guide', label: 'Guide' }]} />
        <ToggleRow label="Proactive suggestions" checked={s.proactiveSuggestions} onCheckedChange={(v) => patch({ proactiveSuggestions: v })} ariaLabel="Toggle proactive suggestions" />
        <SelectRow label="Tool search mode" desc="Tool search mode for large toolsets." ariaLabel="Tool search mode" value={s.toolSearchMode} onValue={(v) => patch({ toolSearchMode: v })}
          options={[{ value: 'off', label: 'Off' }, { value: 'auto', label: 'Auto' }]} />
      </GroupCard>

      <GroupCard title="Tasks">
        <ToggleRow label="Auto-archive tasks" checked={s.autoArchive} onCheckedChange={(v) => patch({ autoArchive: v })} ariaLabel="Toggle auto-archiving of tasks" />
        <SelectRow label="Archive after" desc="Completed tasks move to the archive after this many days." ariaLabel="Auto-archive delay in days" value={String(s.autoArchiveDays)} onValue={(v) => patch({ autoArchiveDays: Number(v) })} disabled={!s.autoArchive}
          options={[{ value: '3', label: '3 days' }, { value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
      </GroupCard>

      <GroupCard title="Storage">
        <Row label="Data directory" desc="Managed by the desktop app." wide>
          <code className="min-w-0 truncate font-mono text-[12px] text-[#5a7189]">/home/z/.payswap</code>
        </Row>
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Basics · Appearance                                                 */
/* ------------------------------------------------------------------ */

function ThemePreview({ dark, active, onClick }: { dark: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('rounded-lg border p-1.5 text-left transition-colors', active ? 'border-[#bfe5d8] bg-[#e2f4ed]/40' : 'border-[#dce5e9] bg-white hover:border-[#bfe5d8]')}
    >
      <div className={cn('flex h-[120px] overflow-hidden rounded-md border', dark ? 'border-[#24384a]' : 'border-[#dce5e9]')}>
        <div className={cn('w-14 shrink-0 space-y-1.5 border-r p-1.5', dark ? 'border-[#24384a] bg-[#152430]' : 'border-[#dce5e9] bg-[#f8fafb]')}>
          <div className={cn('h-3 rounded-sm', dark ? 'bg-[#12463a]' : 'bg-[#e2f4ed]')} />
          <div className={cn('h-3 rounded-sm', dark ? 'bg-[#1c2c3c]' : 'bg-[#eef2f5]')} />
          <div className={cn('h-3 rounded-sm', dark ? 'bg-[#1c2c3c]' : 'bg-[#eef2f5]')} />
        </div>
        <div className={cn('flex-1 p-2', dark ? 'bg-[#0f1b26]' : 'bg-white')}>
          <div className={cn('space-y-1.5 rounded-md border p-2', dark ? 'border-[#24384a] bg-[#16283a]' : 'border-[#dce5e9] bg-white')}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-8 rounded-full" style={{ background: C.green }} />
              <span className={cn('h-1.5 w-10 rounded-full', dark ? 'bg-[#24384a]' : 'bg-[#eef2f5]')} />
            </div>
            <div className={cn('h-1.5 w-full rounded-full', dark ? 'bg-[#24384a]' : 'bg-[#eef2f5]')} />
            <div className={cn('h-1.5 w-2/3 rounded-full', dark ? 'bg-[#24384a]' : 'bg-[#eef2f5]')} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-1 pt-1.5">
        <span className={cn('text-[11px] font-medium', dark ? 'text-[#5a7189]' : 'text-[#102642]')}>{dark ? 'Dark' : 'PaySwap Light'}</span>
        {active ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="slate">Preview</StatusPill>}
      </div>
    </button>
  )
}

function AppearanceSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  return (
    <>
      <GroupCard>
        <Row label="Theme" desc="System follows your operating system setting." wide>
          <Segmented ariaLabel="Theme mode" value={s.themeMode} onValue={(v) => patch({ themeMode: v })}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
      </GroupCard>

      <GroupCard title="Preview">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <ThemePreview dark={false} active={s.themeMode === 'light'} onClick={() => patch({ themeMode: 'light' })} />
          <ThemePreview dark active={s.themeMode === 'dark'} onClick={() => patch({ themeMode: 'dark' })} />
        </div>
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Basics · Model settings — faithful ZCode UX lives in               */
/* model-providers.tsx (split panel, plans, templates, payments)      */
/* ------------------------------------------------------------------ */

function ProvidersSection() {
  return <ModelProvidersSection />
}

/* ------------------------------------------------------------------ */
/* Basics · Browser Use                                                */
/* ------------------------------------------------------------------ */

type SitePermission = 'ask' | 'allow' | 'block'

const SITES: { id: string; host: string }[] = [
  { id: 's1', host: 'paysandbox.dev' },
  { id: 's2', host: 'api.stripe.com' },
  { id: 's3', host: 'evil.example' },
]

const SITE_PERMISSION_OPTIONS: { value: SitePermission; label: string }[] = [
  { value: 'ask', label: 'Ask every time' },
  { value: 'allow', label: 'Always allow' },
  { value: 'block', label: 'Always block' },
]

function BrowserSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  const [perms, setPerms] = useState<Record<string, SitePermission>>({ s1: 'ask', s2: 'allow', s3: 'block' })
  return (
    <>
      <GroupCard>
        <ToggleRow label="Browser use" desc="Let the agent open and control pages in a browser." checked={s.browserEnabled} onCheckedChange={(v) => patch({ browserEnabled: v })} ariaLabel="Toggle browser use" />
      </GroupCard>

      <GroupCard title="Site permissions" desc="Per-site permission applied before the agent opens a page.">
        {SITES.map((site) => (
          <SelectRow
            key={site.id}
            mono
            label={site.host}
            ariaLabel={`Permission for ${site.host}`}
            value={perms[site.id] ?? 'ask'}
            onValue={(v) => setPerms((prev) => ({ ...prev, [site.id]: v }))}
            disabled={!s.browserEnabled}
            options={SITE_PERMISSION_OPTIONS}
          />
        ))}
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Basics · Remote devices / Shortcuts / Search scope                  */
/* ------------------------------------------------------------------ */

function DevicesSection() {
  return (
    <GroupCard>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Dot />
          <p className="min-w-0 truncate text-[13px]">
            <span className="font-medium text-[#102642]">This machine</span>{' '}
            <span className="text-[12px] text-[#8ba0b3]">— MacBook Pro · Linux</span>
          </p>
        </div>
        <StatusPill tone="green">Connected</StatusPill>
      </div>
      <div className="px-4 py-3">
        <Button variant="outline" size="sm" disabled title="Requires the desktop app" className="rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]">
          Add device
        </Button>
      </div>
    </GroupCard>
  )
}

const SHORTCUTS = [
  { label: 'New task', keys: '⌘N' },
  { label: 'Search tasks', keys: '⌘K' },
  { label: 'Toggle sidebar', keys: '⌘B' },
  { label: 'Focus composer', keys: '⌘/' },
]

function ShortcutsSection() {
  return (
    <GroupCard>
      {SHORTCUTS.map((sc) => (
        <Row key={sc.keys} label={sc.label}>
          <Kbd>{sc.keys}</Kbd>
        </Row>
      ))}
    </GroupCard>
  )
}

function SearchScopeSection() {
  const [patterns, setPatterns] = useState<string[]>(['node_modules', '.git', 'dist', '*.log'])
  const [draft, setDraft] = useState('')

  const add = () => {
    const p = draft.trim()
    if (!p || patterns.includes(p)) return
    setPatterns((prev) => [...prev, p])
    setDraft('')
  }

  return (
    <GroupCard title="Ignored patterns" desc="Globs matched against workspace paths.">
      <div className="space-y-2.5 px-4 pb-3.5 pt-1">
        {patterns.length === 0 ? (
          <p className="text-[12px] text-[#8ba0b3]">No patterns — search covers the whole workspace.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {patterns.map((p) => (
              <li key={p} className="inline-flex items-center gap-1 rounded-full border border-[#dce5e9] bg-[#f6f9fa] py-1 pl-2.5 pr-1.5">
                <span className="font-mono text-[11px] text-[#102642]">{p}</span>
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() => setPatterns((prev) => prev.filter((x) => x !== p))}
                  className="rounded-full p-0.5 text-[#8ba0b3] transition-colors hover:bg-[#eef2f5] hover:text-[#b91c1c]"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="*.tmp"
            aria-label="New ignore pattern"
            className="h-8 flex-1 rounded-lg border-[#dce5e9] bg-white font-mono text-[12px]"
          />
          <Button type="submit" variant="outline" size="sm" className="rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]">Add</Button>
        </form>
      </div>
    </GroupCard>
  )
}

/* ------------------------------------------------------------------ */
/* Agent capabilities · Memory / Subagents                             */
/* ------------------------------------------------------------------ */

function MemorySection({ s, patch }: { s: PaySettings; patch: Patch }) {
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    if (refreshing) return
    setRefreshing(true)
    window.setTimeout(() => setRefreshing(false), 600)
  }
  return (
    <>
      <GroupCard>
        <ToggleRow label="Workspace memory" desc="Save durable facts about your workspace for future tasks." checked={s.memoryEnabled} onCheckedChange={(v) => patch({ memoryEnabled: v })} ariaLabel="Toggle workspace memory" />
      </GroupCard>

      <GroupCard title="Saved workspace memories">
        <div className="flex flex-col items-center gap-2.5 px-4 py-6">
          <p className="max-w-xs text-center text-[12px] text-[#5a7189]">
            {s.memoryEnabled ? 'No memories saved yet — the agent saves facts as it works.' : 'Enable Workspace Memory to view saved memories.'}
          </p>
          <Button variant="outline" size="sm" disabled={refreshing} onClick={refresh} className="gap-1.5 rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]">
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </GroupCard>
    </>
  )
}

interface Subagent {
  id: string
  name: string
  desc: string
  on: boolean
  mode: 'fast' | 'deep'
}

const INITIAL_SUBAGENTS: Subagent[] = [
  { id: 'scout', name: 'Scout', desc: 'read-only workspace exploration', on: true, mode: 'fast' },
  { id: 'builder', name: 'Builder', desc: 'implements payment diffs', on: true, mode: 'deep' },
  { id: 'auditor', name: 'Auditor', desc: 'reviews + policy checks', on: true, mode: 'fast' },
]

const SUBAGENT_DEPTH_OPTIONS: { value: 'fast' | 'deep'; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'deep', label: 'Deep' },
]

function SubagentsSection() {
  const [agents, setAgents] = useState<Subagent[]>(INITIAL_SUBAGENTS)
  const update = (id: string, changes: Partial<Subagent>) => setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...changes } : a)))
  return (
    <GroupCard title="Available subagents">
      {agents.map((a) => (
        <Row key={a.id} label={a.name} desc={a.desc} wide>
          <SelectCell ariaLabel={`${a.name} depth`} value={a.mode} onValue={(v) => update(a.id, { mode: v })} disabled={!a.on} className="w-[96px]" options={SUBAGENT_DEPTH_OPTIONS} />
          <Toggle checked={a.on} onCheckedChange={(v) => update(a.id, { on: v })} ariaLabel={`Toggle ${a.name} subagent`} />
        </Row>
      ))}
    </GroupCard>
  )
}

/* ------------------------------------------------------------------ */
/* Agent capabilities · Plugins / MCP / Skills / Commands               */
/* ------------------------------------------------------------------ */

function PluginsSection({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [removed, setRemoved] = useState<string[]>([])
  const installed = seedPlugins.filter((p) => p.installed)
  return (
    <>
      <GroupCard>
        <Row label="Plugin marketplace" desc="Browse, install and update payment plugins.">
          <Button variant="link" size="sm" className="h-7 gap-1 px-0 text-[12px] text-[#087d62]" onClick={() => onNavigate('/plugins')}>
            Open Plugin Marketplace
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </Row>
      </GroupCard>

      <GroupCard title="Installed plugins">
        {installed.map((p) => {
          const isRemoved = removed.includes(p.id)
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={cn('truncate text-[13px] font-medium text-[#102642]', isRemoved && 'text-[#8ba0b3]')}>{p.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-[#5a7189]">{p.vendor} · {p.installs} installs</p>
              </div>
              {isRemoved ? (
                <span className="shrink-0 text-[12px] text-[#8ba0b3]">Removed</span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="border-[#dce5e9] text-[11px] text-[#5a7189]">{p.category}</Badge>
                  <Badge variant="outline" className="border-[#bfe5d8] bg-[#e2f4ed] text-[11px] text-[#087d62]">Installed</Badge>
                  <Button variant="outline" size="sm" className="h-7 rounded-lg border-[#dce5e9] px-2.5 text-[12px] text-[#5a7189]" onClick={() => setRemoved((prev) => [...prev, p.id])}>
                    Uninstall
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </GroupCard>
    </>
  )
}

function McpSection() {
  const [extraServers, setExtraServers] = useState<number[]>([])
  return (
    <GroupCard title="Connected servers">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Dot />
        <p className="min-w-0 truncate text-[13px]">
          <span className="font-mono text-[12px] text-[#102642]">payswap-rails</span>{' '}
          <span className="text-[12px] text-[#8ba0b3]">— connected · 12 tools</span>
        </p>
      </div>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Dot />
        <p className="min-w-0 truncate text-[13px]">
          <span className="font-mono text-[12px] text-[#102642]">stripe-remote</span>{' '}
          <span className="text-[12px] text-[#8ba0b3]">— connected · 8 tools</span>
        </p>
      </div>
      {extraServers.map((n) => (
        <div key={n} className="flex items-center gap-2.5 px-4 py-3">
          <Dot tone="muted" />
          <p className="min-w-0 truncate text-[13px] text-[#8ba0b3]">new-server — awaiting config</p>
        </div>
      ))}
      <div className="px-4 py-3">
        <Button variant="outline" size="sm" className="gap-1.5 rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]" onClick={() => setExtraServers((prev) => [...prev, prev.length + 1])}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add server
        </Button>
      </div>
    </GroupCard>
  )
}

const SKILL_PACKS = ['reconciliation-pack', 'payout-batch', 'chargeback-evidence', 'corridor-brief']

function SkillsSection() {
  const [skills, setSkills] = useState<Record<string, boolean>>(Object.fromEntries(SKILL_PACKS.map((k) => [k, true])))
  return (
    <GroupCard title="Skill packs">
      {SKILL_PACKS.map((sk) => (
        <ToggleRow key={sk} mono label={sk} checked={skills[sk] ?? true} onCheckedChange={(v) => setSkills((prev) => ({ ...prev, [sk]: v }))} ariaLabel={`Toggle ${sk} skill`} />
      ))}
    </GroupCard>
  )
}

const COMMANDS = [
  { cmd: '/reconcile', desc: 'Match processor reports to the ledger' },
  { cmd: '/payout', desc: 'Draft a payout batch' },
  { cmd: '/corridor', desc: 'Corridor status brief' },
]

function CommandsSection() {
  return (
    <GroupCard title="Available commands">
      {COMMANDS.map((c) => (
        <div key={c.cmd} className="px-4 py-2.5">
          <p className="text-[12px]">
            <span className="font-mono text-[#102642]">{c.cmd}</span> <span className="text-[#8ba0b3]">—</span>{' '}
            <span className="text-[#5a7189]">{c.desc}</span>
          </p>
        </div>
      ))}
    </GroupCard>
  )
}

/* ------------------------------------------------------------------ */
/* Agent capabilities · Automations / Hooks                            */
/* ------------------------------------------------------------------ */

function AutomationsSection({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [workspace, setWorkspace] = useState<'all' | 'acquiring' | 'movement' | 'risk'>('all')
  const [runTimeout, setRunTimeout] = useState<'5' | '15' | '30'>('15')
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-[#bfe5d8] bg-[#e2f4ed]/50 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#087d62]" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-[#102642]">Automations have evolved into routines — reusable playbooks the agent loads from the task tab to fulfill economic goals.</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 rounded-lg border-[#bfe5d8] bg-white text-[12px] text-[#087d62] hover:bg-[#e2f4ed]" onClick={() => onNavigate('/routines')}>
          Open Routines
        </Button>
      </div>

      <GroupCard title="Defaults">
        <SelectRow label="Default workspace" ariaLabel="Default workspace for automations" value={workspace} onValue={setWorkspace}
          options={[{ value: 'all', label: 'All projects' }, { value: 'acquiring', label: 'Acquiring' }, { value: 'movement', label: 'Money movement' }, { value: 'risk', label: 'Risk & compliance' }]} />
        <SelectRow label="Run timeout" ariaLabel="Automation run timeout" value={runTimeout} onValue={setRunTimeout}
          options={[{ value: '5', label: '5 min' }, { value: '15', label: '15 min' }, { value: '30', label: '30 min' }]} />
      </GroupCard>
    </>
  )
}

function HooksSection() {
  const [hooks, setHooks] = useState({ preTask: true, postSettlement: true })
  return (
    <GroupCard title="Lifecycle hooks">
      <ToggleRow mono label="pre-task" desc="verify sandbox environment" checked={hooks.preTask} onCheckedChange={(v) => setHooks((prev) => ({ ...prev, preTask: v }))} ariaLabel="Toggle pre-task hook" />
      <ToggleRow mono label="post-settlement" desc="append evidence to the ledger" checked={hooks.postSettlement} onCheckedChange={(v) => setHooks((prev) => ({ ...prev, postSettlement: v }))} ariaLabel="Toggle post-settlement hook" />
    </GroupCard>
  )
}

/* ------------------------------------------------------------------ */
/* Data and statistics · Usage / Archive                               */
/* ------------------------------------------------------------------ */

const USAGE_DAYS = [
  { d: 'Mon', h: 40 },
  { d: 'Tue', h: 52 },
  { d: 'Wed', h: 46 },
  { d: 'Thu', h: 66 },
  { d: 'Fri', h: 58 },
  { d: 'Sat', h: 76 },
  { d: 'Sun', h: 54 },
]

function UsageSection({ onOpenProviders }: { onOpenProviders: () => void }) {
  const plan = useModelPlan()
  const family = plan.activeFamily ?? 'zai'
  const f = plan.families[family]
  const cfg = FAMILY_CONFIG[family]
  const coding = f.coding
  const startAvg =
    f.start.status === 'active' && f.start.balances.length > 0
      ? Math.round(f.start.balances.reduce((t, b) => t + b.remainingPct, 0) / f.start.balances.length)
      : null
  return (
    <>
      <GroupCard title="Agent compute · last 7 days">
        <div className="px-4 pb-4 pt-3">
          <div className="flex h-24 items-end gap-1.5">
            {USAGE_DAYS.map((u) => (
              <div key={u.d} className="flex h-full flex-1 items-end">
                <div
                  role="img"
                  aria-label={`${u.d}: ${u.h}% of daily peak`}
                  title={`${u.d} · ${u.h}% of daily peak`}
                  className="w-full rounded-t-[3px] bg-[#0b8b6c]/85 transition-colors hover:bg-[#0b8b6c]"
                  style={{ height: `${u.h}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {USAGE_DAYS.map((u) => (
              <span key={u.d} className="flex-1 text-center text-[10px] text-[#8ba0b3]">{u.d}</span>
            ))}
          </div>
        </div>
      </GroupCard>

      <GroupCard title="Quota">
        {coding.status === 'purchased' ? (
          <Row
            label={`${cfg.name} Coding Plan${coding.tier ? ` · ${coding.tier.toUpperCase()}` : ''}`}
            desc={`Renews ${coding.renewsAt} · 5-hour window resets ${coding.quotas.fiveHour.resetAt} · GLM-5.3 / GLM-5.3-Flash`}
            wide
          >
            <QuotaBar pct={coding.quotas.fiveHour.pct} />
          </Row>
        ) : (
          <Row
            label="Coding Plan not connected"
            desc="Connect a Z.ai or BigModel Coding Plan provider in Model settings."
            wide
            muted
          >
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenProviders}
              className="rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]"
            >
              Open Model settings
            </Button>
          </Row>
        )}
        {f.start.status === 'active' && startAvg !== null ? (
          <Row
            label="Start Plan · Free"
            desc={`Today's balance resets ${f.start.balances[0]?.resetAt ?? '18:00'} · GLM-5.3-Flash / GLM-5.2 / GLM-5-Turbo`}
            wide
          >
            <QuotaBar pct={startAvg} />
          </Row>
        ) : null}
      </GroupCard>
    </>
  )
}

function ArchiveSection({ s, patch }: { s: PaySettings; patch: Patch }) {
  const [cleared, setCleared] = useState(false)
  return (
    <>
      <GroupCard title="Retention">
        <ToggleRow label="Auto-archive tasks" checked={s.autoArchive} onCheckedChange={(v) => patch({ autoArchive: v })} ariaLabel="Toggle auto-archiving of tasks" />
        <SelectRow label="Archive after" desc="Completed tasks move to the archive after this many days." ariaLabel="Auto-archive delay in days" value={String(s.autoArchiveDays)} onValue={(v) => patch({ autoArchiveDays: Number(v) })} disabled={!s.autoArchive}
          options={[{ value: '3', label: '3 days' }, { value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }]} />
      </GroupCard>

      <GroupCard title="Archived tasks">
        <Row label="Delete all archived" desc={cleared ? 'Archive is empty' : '12 archived tasks · evidence retained per policy'} wide>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={cleared} className="rounded-lg text-[12px]">Delete all archived</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="sm:max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#102642]">Delete all archived tasks?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes 12 archived tasks and their evidence. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full border-[#dce5e9] text-[#5a7189]">Cancel</AlertDialogCancel>
                <AlertDialogAction className="rounded-full bg-[#b91c1c] text-white hover:bg-[#991b1b]" onClick={() => setCleared(true)}>
                  Delete all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Row>
      </GroupCard>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* SettingsView                                                        */
/* ------------------------------------------------------------------ */

interface SettingsViewProps {
  settings: PaySettings
  onPatch: (patch: Partial<PaySettings>) => void
  onNavigate: (to: string) => void
}

export function SettingsView({ settings, onPatch, onNavigate }: SettingsViewProps) {
  const [active, setActive] = useState<SectionId>('payments')
  const meta = SECTION_META[active]

  return (
    <div className="flex h-full min-h-0">
      {/* Left nav (desktop) */}
      <nav aria-label="Settings sections" className="hidden w-56 shrink-0 flex-col gap-5 overflow-y-auto px-5 py-6 [scrollbar-width:thin] lg:flex">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <SectionLabel className="mb-1.5 px-2.5">{group.label}</SectionLabel>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = item.id === active
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActive(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                      isActive ? 'bg-[#e2f4ed] font-medium text-[#087d62]' : 'text-[#5a7189] hover:bg-[#eef2f5]',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                    {item.beta ? (
                      <span className="ml-auto shrink-0 rounded-full bg-[#fdf1df] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[#b45309]">Beta</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Content column */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {/* Mobile section pills */}
        <div className="sticky top-0 z-10 border-b border-[#eef2f5] bg-[#f6f9fa]/95 backdrop-blur lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5">
            {NAV_GROUPS.flatMap((g) => g.items).map((item) => {
              const isActive = item.id === active
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  aria-pressed={isActive}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] transition-colors',
                    isActive ? 'border-[#bfe5d8] bg-[#e2f4ed] font-medium text-[#087d62]' : 'border-[#dce5e9] bg-white text-[#5a7189]',
                  )}
                >
                  {item.label}
                  {item.beta ? <span className="rounded-full bg-[#fdf1df] px-1 text-[9px] font-semibold uppercase text-[#b45309]">Beta</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-5 lg:px-8">
          <SectionHeader title={meta.title} desc={meta.desc} />
          <div className="space-y-3">
            {active === 'payments' && <PaymentsSection s={settings} patch={onPatch} />}
            {active === 'connections' && <ConnectionsSection s={settings} />}
            {active === 'checkout' && <CheckoutSection s={settings} />}
            {active === 'approvals' && <ApprovalsSection s={settings} onNavigate={onNavigate} />}
            {active === 'developer' && <DeveloperSection s={settings} patch={onPatch} />}
            {active === 'general' && <GeneralSection s={settings} patch={onPatch} />}
            {active === 'appearance' && <AppearanceSection s={settings} patch={onPatch} />}
            {active === 'providers' && <ProvidersSection />}
            {active === 'browser' && <BrowserSection s={settings} patch={onPatch} />}
            {active === 'devices' && <DevicesSection />}
            {active === 'shortcuts' && <ShortcutsSection />}
            {active === 'searchScope' && <SearchScopeSection />}
            {active === 'memory' && <MemorySection s={settings} patch={onPatch} />}
            {active === 'subagents' && <SubagentsSection />}
            {active === 'plugins' && <PluginsSection onNavigate={onNavigate} />}
            {active === 'mcp' && <McpSection />}
            {active === 'skills' && <SkillsSection />}
            {active === 'commands' && <CommandsSection />}
            {active === 'automations' && <AutomationsSection onNavigate={onNavigate} />}
            {active === 'hooks' && <HooksSection />}
            {active === 'usage' && <UsageSection onOpenProviders={() => setActive('providers')} />}
            {active === 'archive' && <ArchiveSection s={settings} patch={onPatch} />}
          </div>
        </div>
      </div>
    </div>
  )
}
