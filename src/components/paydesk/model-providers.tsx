'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, Eye, EyeOff, Info, Loader2, MoreHorizontal,
  Pencil, Plus, RefreshCw, Rocket, Sparkles, Trash2, Unplug, Users,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  addProviderFromTemplate, addProviderModel, createCustomProvider, deleteProvider,
  deleteProviderModel, effectiveSelection, FAMILY_CONFIG, FAMILY_ORDER, loginFamily, logoutFamily,
  modelSelectionGroups, patchProvider, patchProviderModel, PROVIDER_TEMPLATES,
  purchaseCodingPlan, selectModel, setConnectionMode, useModelPlan,
  type ApiFormat, type BillingCycle, type CustomModel, type CustomProvider, type Family,
  type FamilyModelSpec, type Tier,
} from '@/lib/model-plan'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const API_FORMATS: { value: ApiFormat; label: string }[] = [
  { value: 'anthropic', label: 'Anthropic messages (/v1/messages)' },
  { value: 'openai-chat', label: 'Chat completions (/v1/chat/completions)' },
  { value: 'openai-responses', label: 'Responses (/responses)' },
]

const CYCLES: { value: BillingCycle; label: string; unit: string; factor: number; off: number }[] = [
  { value: 'monthly', label: 'Monthly', unit: '/month', factor: 1, off: 0 },
  { value: 'quarterly', label: 'Quarterly', unit: '/quarter', factor: 3, off: 0.1 },
  { value: 'yearly', label: 'Yearly', unit: '/year', factor: 12, off: 0.2 },
]

function cycleSpec(cycle: BillingCycle) {
  return CYCLES.find((c) => c.value === cycle) ?? CYCLES[0]
}

function money(currency: string, value: number): string {
  const formatted = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)
  return `${currency}${formatted}`
}

function cyclePrice(currency: string, monthly: number, cycle: BillingCycle): number {
  const spec = cycleSpec(cycle)
  return Math.round(monthly * spec.factor * (1 - spec.off) * 100) / 100
}

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`
  return `${Math.round(tokens / 1000)}K`
}

function tokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return String(n)
}

type LogoTone = 'navy' | 'ink' | 'mint' | 'outline'

const LOGO_TONES: Record<LogoTone, { bg: string; fg: string; border?: string }> = {
  navy: { bg: '#0b2b3d', fg: '#ffffff' },
  ink: { bg: '#102642', fg: '#ffffff' },
  mint: { bg: '#e2f4ed', fg: '#087d62', border: '#bfe5d8' },
  outline: { bg: '#ffffff', fg: '#5a7189', border: '#dce5e9' },
}

function LogoTile({ text, tone = 'outline', size = 20 }: { text: string; tone?: LogoTone; size?: number }) {
  const s = LOGO_TONES[tone]
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] font-semibold"
      style={{
        width: size, height: size, background: s.bg, color: s.fg,
        border: s.border ? `1px solid ${s.border}` : undefined,
        fontSize: Math.max(10, Math.round(size * 0.5)),
      }}
    >
      {text}
    </span>
  )
}

function FamilyLogo({ family }: { family: Family }) {
  return <LogoTile text={family === 'zai' ? 'Z' : 'B'} tone={family === 'zai' ? 'navy' : 'ink'} size={20} />
}

function StartPlanLogo() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-[7px] border border-[#bfe5d8] bg-[#e2f4ed]"
    >
      <Rocket className="size-3 text-[#087d62]" />
    </span>
  )
}

function StatusDot({ state }: { state: 'ready' | 'warn' | 'off' }) {
  const color = state === 'ready' ? '#0b8b6c' : state === 'warn' ? '#f59e0b' : '#8ba0b3'
  const label = state === 'ready' ? 'Ready' : state === 'warn' ? 'Not ready' : 'Disabled'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="ml-auto inline-block size-2 shrink-0 rounded-full max-md:absolute max-md:bottom-0.5 max-md:right-0.5"
      style={{ background: color }}
    />
  )
}

/** Transient "saved / connected" feedback, like ZCode's detail-area save banners. */
function useFlash(timeout = 1800) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flash = (msg: string) => {
    setMessage(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), timeout)
  }
  return { message, flash }
}

function FlashLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="status"
      className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-2.5 py-1 text-[12px] font-medium text-[#087d62]"
    >
      <Check className="size-3.5" aria-hidden="true" />
      {message}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Section shell (split panel like the original ZCode layout)          */
/* ------------------------------------------------------------------ */

interface NavEntry {
  key: string
  label: string
  kind: 'family' | 'start' | 'custom'
  family?: Family
  provider?: CustomProvider
  dot: 'ready' | 'warn' | 'off' | null
}

export function ModelProvidersSection() {
  const plan = useModelPlan()
  const [selectedKey, setSelectedKey] = useState<string>('preset:zai')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const presetItems: NavEntry[] = useMemo(() => {
    const items: NavEntry[] = []
    for (const family of FAMILY_ORDER) {
      // The signed-in family hides the other family's preset entries (ZCode behavior).
      if (plan.activeFamily && plan.activeFamily !== family) continue
      const f = plan.families[family]
      const codingReady = f.connected && f.coding.status === 'purchased'
      items.push({
        key: `preset:${family}`,
        label: FAMILY_CONFIG[family].name,
        kind: 'family',
        family,
        dot: codingReady ? 'ready' : f.connected ? 'warn' : null,
      })
      items.push({
        key: `start:${family}`,
        label: 'Start Plan',
        kind: 'start',
        family,
        dot: f.start.status === 'active' ? 'ready' : null,
      })
    }
    return items
  }, [plan])

  const customItems: NavEntry[] = useMemo(
    () =>
      plan.custom.map((p) => ({
        key: `custom:${p.id}`,
        label: p.name,
        kind: 'custom' as const,
        provider: p,
        dot:
          p.enabled && p.apiKey && p.models.some((m) => m.enabled)
            ? ('ready' as const)
            : p.enabled
              ? ('warn' as const)
              : ('off' as const),
      })),
    [plan.custom],
  )

  // Derived selection: falls back automatically when items appear/disappear.
  const allItems = useMemo(() => [...presetItems, ...customItems], [customItems, presetItems])
  const effectiveKey = allItems.some((i) => i.key === selectedKey)
    ? selectedKey
    : (allItems[0]?.key ?? selectedKey)

  const onRefresh = () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 900)
  }

  const selected = allItems.find((i) => i.key === effectiveKey)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-relaxed text-[#5a7189]">
          Manage custom model providers. Once configured, they can be selected during chat.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="gap-1.5 rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {refreshing ? 'Loading...' : 'Refresh'}
          </Button>
          <Button
            size="sm"
            onClick={() => setTemplatePickerOpen(true)}
            className="gap-1.5 rounded-lg bg-[#0b8b6c] text-[12px] text-white hover:bg-[#0a7a5f]"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add provider
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#dce5e9] bg-white">
        <div className="grid min-h-[36rem] grid-cols-[56px_minmax(0,1fr)] md:grid-cols-[224px_minmax(0,1fr)]">
          {/* Left navigation */}
          <nav
            aria-label="Model provider navigation"
            className="min-w-0 border-r border-[#dce5e9] px-1.5 py-3 md:px-2"
          >
            <div className="flex min-h-0 flex-col gap-4 max-md:items-center max-md:gap-3">
              <NavGroup title="Providers" loading={refreshing}>
                {presetItems.map((item) => (
                  <NavItemButton key={item.key} item={item} selectedKey={effectiveKey} onSelect={setSelectedKey} />
                ))}
              </NavGroup>
              {customItems.length > 0 ? (
                <NavGroup title="Custom providers">
                  {customItems.map((item) => (
                    <NavItemButton key={item.key} item={item} selectedKey={effectiveKey} onSelect={setSelectedKey} />
                  ))}
                </NavGroup>
              ) : null}
            </div>
          </nav>

          {/* Right detail panel */}
          <div className="relative min-w-0 p-4 pb-10 md:p-6 md:pb-12">
            {templatePickerOpen ? (
              <TemplatePicker
                onBack={() => setTemplatePickerOpen(false)}
                onCreated={(id) => {
                  setTemplatePickerOpen(false)
                  setSelectedKey(`custom:${id}`)
                }}
              />
            ) : selected?.kind === 'family' && selected.family ? (
              <FamilyDetail key={selected.family} family={selected.family} onNavigate={setSelectedKey} />
            ) : selected?.kind === 'start' && selected.family ? (
              <StartPlanDetail key={selected.family} family={selected.family} />
            ) : selected?.kind === 'custom' && selected.provider ? (
              <CustomProviderDetail key={selected.provider.id} provider={selected.provider} />
            ) : (
              <div className="flex h-64 items-center justify-center text-[13px] text-[#8ba0b3]">
                Select a provider to configure it.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function NavGroup({ title, loading, children }: { title: string; loading?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 max-md:w-full max-md:items-center">
      <div className="flex h-7 items-center justify-between px-2 py-1 max-md:hidden">
        <h3 className="text-[12px] font-semibold text-[#8ba0b3]">{title}</h3>
        {loading ? <Loader2 className="size-3 animate-spin text-[#8ba0b3]" aria-label="Loading providers" /> : null}
      </div>
      {children}
    </div>
  )
}

function NavItemButton({ item, selectedKey, onSelect }: { item: NavEntry; selectedKey: string; onSelect: (key: string) => void }) {
  const isSelected = item.key === selectedKey
  return (
    <button
      type="button"
      aria-label={item.label}
      aria-current={isSelected ? 'true' : undefined}
      data-state={isSelected ? 'selected' : 'idle'}
      onClick={() => onSelect(item.key)}
      title={item.label}
      className={cn(
        'relative box-border flex h-8 w-full items-center gap-2 rounded-lg border px-2 py-1 text-left text-[13px] font-medium transition-colors',
        'max-md:size-8 max-md:justify-center max-md:px-0',
        isSelected
          ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
          : 'border-transparent text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642]',
      )}
    >
      {item.kind === 'family' && item.family ? (
        <FamilyLogo family={item.family} />
      ) : item.kind === 'start' ? (
        <StartPlanLogo />
      ) : (
        <LogoTile text={item.label.slice(0, 1).toUpperCase()} />
      )}
      <span className="min-w-0 flex-1 truncate max-md:sr-only">{item.label}</span>
      {item.dot ? <StatusDot state={item.dot} /> : <span className="ml-auto max-md:hidden" />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Family detail — Coding Plan (Z.ai / BigModel)                       */
/* ------------------------------------------------------------------ */

function FamilyDetail({ family, onNavigate }: { family: Family; onNavigate: (key: string) => void }) {
  const plan = useModelPlan()
  const f = plan.families[family]
  const cfg = FAMILY_CONFIG[family]
  const [upgradeState, setUpgradeState] = useState<{ open: boolean; audience: 'personal' | 'team' }>({
    open: false,
    audience: 'personal',
  })
  const [connectPending, setConnectPending] = useState(false)

  const openUpgrade = (audience: 'personal' | 'team' = 'personal') =>
    setUpgradeState({ open: true, audience })

  const connect = () => {
    setConnectPending(true)
    setTimeout(() => {
      loginFamily(family)
      setConnectPending(false)
    }, 900)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FamilyLogo family={family} />
          <h2 className="text-lg font-medium text-[#102642]">{cfg.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#5a7189]">Connection mode</span>
          <Select
            value={f.mode}
            onValueChange={(v) => setConnectionMode(family, v === 'team' ? 'team' : 'individual')}
          >
            <SelectTrigger aria-label="Connection mode" className="h-8 w-40 rounded-lg border-[#dce5e9] text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual Plan</SelectItem>
              <SelectItem value="team">Team Plan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {f.mode === 'team' ? (
        <TeamPlanPanel family={family} />
      ) : (
        <>
          <CodingPlanPanel family={family} onConnect={connect} connectPending={connectPending} onUpgrade={() => openUpgrade('personal')} />
          {f.coding.status === 'purchased' ? (
            <PlanModelList family={family} />
          ) : (
            <PurchaseBanners family={family} onUpgrade={(audience) => openUpgrade(audience)} onStartPlan={() => onNavigate(`start:${family}`)} />
          )}
        </>
      )}

      <UpgradeDialog
        family={family}
        open={upgradeState.open}
        onOpenChange={(open) => setUpgradeState((s) => ({ ...s, open }))}
        defaultAudience={upgradeState.audience}
      />
    </div>
  )
}

function CodingPlanPanel({
  family, onConnect, connectPending, onUpgrade,
}: {
  family: Family
  onConnect: () => void
  connectPending: boolean
  onUpgrade: () => void
}) {
  const plan = useModelPlan()
  const f = plan.families[family]
  const cfg = FAMILY_CONFIG[family]
  const coding = f.coding
  const [unlinkPending, setUnlinkPending] = useState(false)

  const unlink = () => {
    setUnlinkPending(true)
    setTimeout(() => {
      logoutFamily(family)
      setUnlinkPending(false)
    }, 600)
  }

  return (
    <section className="rounded-xl border border-[#dce5e9] bg-[#f8fafb] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-[#102642]">
            {coding.teamSeats ? 'Team Plan' : coding.status === 'purchased' && coding.tier ? coding.tier.toUpperCase() : 'Coding Plan'}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#5a7189]">
            {coding.status === 'purchased' ? (
              <>
                <span className="inline-flex items-center gap-1 font-medium text-[#087d62]">
                  <span className="size-1.5 rounded-full bg-[#0b8b6c]" aria-hidden="true" />
                  Subscribed
                </span>
                <span aria-hidden="true">·</span>
                <span>Renews {coding.renewsAt}</span>
              </>
            ) : coding.status === 'notPurchased' ? (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                Not subscribed, enabled after subscription
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[#8ba0b3]" aria-hidden="true" />
                Not connected
              </span>
            )}
            {coding.status === 'purchased' ? (
              <>
                <span aria-hidden="true">·</span>
                <a href={cfg.manageUrl} target="_blank" rel="noreferrer" className="font-medium text-[#0b8b6c] underline underline-offset-2">
                  Manage
                </a>
                <span aria-hidden="true">·</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="font-medium text-[#5a7189] underline underline-offset-2 hover:text-[#102642]"
                      disabled={unlinkPending}
                    >
                      {unlinkPending ? 'Unlinking…' : 'Unlink'}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sm:max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-[#102642]">Unlink {cfg.name} account?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This signs you out of your {cfg.name} account. Coding Plan and Start Plan entitlements for
                        this provider will no longer be available until you connect again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-full border-[#dce5e9] text-[#5a7189]">Cancel</AlertDialogCancel>
                      <AlertDialogAction className="rounded-full bg-[#b91c1c] text-white hover:bg-[#991b1b]" onClick={unlink}>
                        Unlink
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : null}
          </p>
          <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-[#8ba0b3]">
            {coding.status === 'purchased'
              ? `${cfg.name} Coding Plan is active. GLM-5.3 and GLM-5.3-Flash can be selected in chat.`
              : coding.status === 'notPurchased'
                ? 'No active Coding Plan was found for the current API key or account.'
                : 'Connect to view Coding Plan entitlements.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {coding.status === 'disconnected' ? (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={connectPending}
              className="gap-1.5 rounded-full bg-[#0b8b6c] px-4 text-[12.5px] text-white hover:bg-[#0a7a5f]"
            >
              {connectPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {connectPending ? 'Connecting…' : `Connect to ${cfg.name}`}
            </Button>
          ) : coding.status === 'notPurchased' ? (
            <Button
              size="sm"
              onClick={onUpgrade}
              className="gap-1.5 rounded-full bg-[#0b8b6c] px-4 text-[12.5px] text-white hover:bg-[#0a7a5f]"
            >
              <Rocket className="size-3.5" aria-hidden="true" />
              Subscribe
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onUpgrade}
              className="gap-1.5 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-4 text-[12.5px] font-medium text-[#087d62] hover:bg-[#d5eee3]"
            >
              <Rocket className="size-3.5" aria-hidden="true" />
              Upgrade
            </Button>
          )}
        </div>
      </div>

      {coding.status === 'purchased' ? <QuotaCards family={family} /> : null}
    </section>
  )
}

function QuotaCards({ family }: { family: Family }) {
  const plan = useModelPlan()
  const coding = plan.families[family].coding
  const caption = FAMILY_CONFIG[family].models.map((m) => m.id).join(' / ')
  const cards = [
    { label: '5-hour remaining', quota: coding.quotas.fiveHour, resetLabel: `Resets ${coding.quotas.fiveHour.resetAt}` },
    { label: 'Weekly remaining', quota: coding.quotas.weekly, resetLabel: `Resets ${coding.quotas.weekly.resetAt}` },
    { label: 'Tool calls', quota: coding.quotas.toolCalls, resetLabel: `Resets ${coding.quotas.toolCalls.resetAt}` },
    { label: 'ZCode MCP', quota: coding.quotas.mcp, resetLabel: `Resets ${coding.quotas.mcp.resetAt}` },
  ]
  return (
    <div className="mt-4 border-t border-[#dce5e9] pt-4">
      <h4 className="text-[13px] font-semibold text-[#102642]">Quota remaining</h4>
      <div className="mt-2.5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-[#dce5e9] bg-white p-3">
            <p className="text-[11px] text-[#8ba0b3]">{card.label}</p>
            <p className="mt-1 text-xl font-semibold leading-none text-[#102642]">{card.quota.pct}%</p>
            <p className="mt-1 text-[10.5px] text-[#8ba0b3]">{card.resetLabel}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#e2f4ed]">
              <div
                className="h-full rounded-full bg-[#0b8b6c]"
                style={{ width: `${card.quota.pct}%` }}
                role="progressbar"
                aria-valuenow={card.quota.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${card.label}: ${card.quota.pct}%`}
              />
            </div>
            <p className="mt-1.5 truncate text-[10px] text-[#8ba0b3]" title={caption}>{caption}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function TeamPlanPanel({ family }: { family: Family }) {
  const plan = useModelPlan()
  const f = plan.families[family]
  const cfg = FAMILY_CONFIG[family]
  const coding = f.coding
  const [retrying, setRetrying] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const retry = () => {
    setRetrying(true)
    setTimeout(() => setRetrying(false), 1000)
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#dce5e9] bg-[#f8fafb] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-[#102642]">
              {coding.teamSeats ? `Team Plan · ${coding.teamSeats} seats` : 'Team Plan'}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#5a7189]">
              {coding.teamSeats && coding.status === 'purchased' ? (
                <>
                  <span className="inline-flex items-center gap-1 font-medium text-[#087d62]">
                    <span className="size-1.5 rounded-full bg-[#0b8b6c]" aria-hidden="true" />
                    Subscribed
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Renews {coding.renewsAt}</span>
                  <span aria-hidden="true">·</span>
                  <a href={cfg.manageUrl} target="_blank" rel="noreferrer" className="font-medium text-[#0b8b6c] underline underline-offset-2">
                    Manage team plan
                  </a>
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                  Team plan not assigned. Contact your team admin.
                </>
              )}
            </p>
            <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-[#8ba0b3]">
              {coding.teamSeats && coding.status === 'purchased'
                ? 'Add yourself or other members on the team plan management page. Once assigned, the team quota will be available in PaySwap.'
                : 'Assign members to your team plan on the provider management page. Once assigned, the team quota is available here.'}
            </p>
          </div>
          {!coding.teamSeats ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={retry}
                disabled={retrying}
                className="gap-1.5 rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189]"
              >
                {retrying ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                Retry
              </Button>
              <Button
                size="sm"
                onClick={() => setUpgradeOpen(true)}
                className="gap-1.5 rounded-full bg-[#0b8b6c] px-4 text-[12.5px] text-white hover:bg-[#0a7a5f]"
              >
                <Users className="size-3.5" aria-hidden="true" />
                Buy team plan
              </Button>
            </div>
          ) : null}
        </div>
        {coding.teamSeats && coding.status === 'purchased' ? <QuotaCards family={family} /> : null}
      </section>
      {coding.teamSeats && coding.status === 'purchased' ? <PlanModelList family={family} /> : null}
      <UpgradeDialog family={family} open={upgradeOpen} onOpenChange={setUpgradeOpen} defaultAudience="team" />
    </div>
  )
}

/* Purchase choice banners (Start Plan / For Individuals / For Teams) */
function PurchaseBanners({
  family, onUpgrade, onStartPlan,
}: {
  family: Family
  onUpgrade: (audience: 'personal' | 'team') => void
  onStartPlan: () => void
}) {
  const cfg = FAMILY_CONFIG[family]
  const cheapest = cfg.tiers.lite.promo
  const banner =
    'group flex min-h-20 items-center justify-between gap-3 rounded-xl border p-4 text-left transition-transform hover:-translate-y-px'
  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={onStartPlan}
        className={cn(banner, 'border-[#bfe5d8] text-[#102642]')}
        style={{ background: 'linear-gradient(120deg, #e2f4ed 0%, #d1eee1 100%)' }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <StartPlanLogo />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[14.5px] font-semibold">Start Plan</span>
              <span className="rounded-full border border-[#bfe5d8] bg-white px-2 py-px text-[10px] font-medium text-[#087d62]">New User</span>
            </span>
            <span className="mt-0.5 block text-[12px] text-[#5a7189]">Try platform GLM flagship model quota for free.</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block text-xl font-bold leading-none text-[#087d62]">3M</span>
            <span className="text-[10.5px] text-[#5a7189]">tokens per day</span>
          </span>
          <ArrowRight className="size-4 text-[#087d62] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => onUpgrade('personal')}
        className={cn(banner, 'border-[#0b2b3d]/40 text-white')}
        style={{ background: 'linear-gradient(120deg, #0b2b3d 0%, #123a52 100%)' }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-white/10">
            <Sparkles className="size-4 text-[#7be0c3]" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold">For Individuals</span>
            <span className="mt-0.5 block text-[12px] text-white/70">For individual developers with dedicated Coding Plan quota.</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block text-xl font-bold leading-none">{money(cfg.currency, cheapest)}+</span>
            <span className="text-[10.5px] text-white/70">first month</span>
          </span>
          <ArrowRight className="size-4 text-white/80 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>

      <button
        type="button"
        onClick={() => onUpgrade('team')}
        className={cn(banner, 'border-[#0b8b6c]/40 text-white')}
        style={{ background: 'linear-gradient(120deg, #0b8b6c 0%, #29c29a 100%)' }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-white/15">
            <Users className="size-4 text-white" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[14.5px] font-semibold">For Teams</span>
            <span className="mt-0.5 block text-[12px] text-white/80">For team collaboration with seats and centralized billing.</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right">
            <span className="block text-xl font-bold leading-none">{money(cfg.currency, cfg.teamSeatPrice)}+</span>
            <span className="text-[10.5px] text-white/80">/ seat / month</span>
          </span>
          <ArrowRight className="size-4 text-white/90 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Start Plan detail (free plan)                                       */
/* ------------------------------------------------------------------ */

function StartPlanDetail({ family }: { family: Family }) {
  const plan = useModelPlan()
  const f = plan.families[family]
  const cfg = FAMILY_CONFIG[family]
  const [loginPending, setLoginPending] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const login = () => {
    setLoginPending(true)
    setTimeout(() => {
      loginFamily(family)
      setLoginPending(false)
    }, 900)
  }

  const paidActive = f.coding.status === 'purchased'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <StartPlanLogo />
          <h2 className="text-lg font-medium text-[#102642]">Start Plan</h2>
        </div>
        {!f.connected ? (
          <Button
            size="sm"
            onClick={login}
            disabled={loginPending}
            className="gap-1.5 rounded-full bg-[#0b8b6c] px-4 text-[12.5px] text-white hover:bg-[#0a7a5f]"
          >
            {loginPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {loginPending ? 'Signing in…' : 'Log in'}
          </Button>
        ) : f.start.status === 'active' && !paidActive ? (
          <Button
            size="sm"
            onClick={() => setUpgradeOpen(true)}
            className="gap-1.5 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-4 text-[12.5px] font-medium text-[#087d62] hover:bg-[#d5eee3]"
          >
            <Rocket className="size-3.5" aria-hidden="true" />
            Upgrade
          </Button>
        ) : null}
      </div>

      <section className="rounded-xl border border-[#dce5e9] bg-[#f8fafb] p-4">
        <h3 className="text-lg font-semibold text-[#102642]">ZCode Start Plan</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#5a7189]">
          {f.start.status === 'active' ? (
            <>
              <span className="inline-flex items-center gap-1 font-medium text-[#087d62]">
                <span className="size-1.5 rounded-full bg-[#0b8b6c]" aria-hidden="true" />
                Active
              </span>
              <span aria-hidden="true">·</span>
              <span>Expires never · free tier</span>
            </>
          ) : !f.connected ? (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#8ba0b3]" aria-hidden="true" />
              Log in to view and use your Start Plan
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#f59e0b]" aria-hidden="true" />
              No available Start Plan
            </span>
          )}
        </p>
        <p className="mt-1.5 max-w-lg text-[12px] leading-relaxed text-[#8ba0b3]">
          Supports BYOK and BYOA. Base URL, API format, and API Key are maintained by ZCode automatically.
        </p>
      </section>

      {!f.connected || f.start.status !== 'active' ? <TrialHeroCard /> : <TodayBalance family={family} />}

      {f.start.status === 'active' ? <PlanModelList family={family} models={cfg.startModels} /> : null}

      <UpgradeDialog family={family} open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  )
}

function TrialHeroCard() {
  return (
    <section className="space-y-3">
      <h3 className="text-[13px] font-semibold text-[#102642]">Trial plan</h3>
      <div
        className="min-h-20 overflow-hidden rounded-xl border border-[#bfe5d8] p-4"
        style={{ background: 'radial-gradient(circle at 14% 12%, #d8f2e7 0%, #e6f6ef 60%, #f2faf6 100%)' }}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="w-fit shrink-0 rounded-full border border-[#bfe5d8] bg-white px-2 py-0.5 text-[11px] font-medium text-[#5a7189]">
              New User
            </span>
            <span className="text-[14px] font-medium text-[#102642]">ZCode Start Plan</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-2xl font-bold leading-none text-[#102642]">3M</span>
            <span className="text-[13px] font-medium text-[#5a7189]">tokens per day</span>
          </div>
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-[#5a7189]">
            Daily quota · GLM-5.3-Flash 2M · GLM-5.2 512K · GLM-5-Turbo 512K
          </p>
        </div>
      </div>
    </section>
  )
}

function TodayBalance({ family }: { family: Family }) {
  const plan = useModelPlan()
  const start = plan.families[family].start
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[#102642]">Today&apos;s balance</h3>
        <span className="text-[11px] text-[#8ba0b3]">Resets {start.balances[0]?.resetAt ?? '18:00'}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {start.balances.map((b) => {
          const remaining = Math.round((b.totalTokens * b.remainingPct) / 100)
          return (
            <div key={b.name} className="rounded-lg border border-[#dce5e9] bg-white p-3">
              <p className="text-[12px] font-medium text-[#102642]">{b.name}</p>
              <p className="mt-1 text-xl font-semibold leading-none text-[#087d62]">{b.remainingPct}%</p>
              <p className="mt-1 font-mono text-[10.5px] text-[#8ba0b3]">
                {tokenCount(remaining)} / {tokenCount(b.totalTokens)}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#e2f4ed]">
                <div
                  className="h-full rounded-full bg-[#0b8b6c]"
                  style={{ width: `${b.remainingPct}%` }}
                  role="progressbar"
                  aria-valuenow={b.remainingPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${b.name}: ${b.remainingPct}% remaining`}
                />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Plan model list (GLM-5.3 / GLM-5.3-Flash …)                         */
/* ------------------------------------------------------------------ */

function PlanModelList({ family, models }: { family: Family; models?: FamilyModelSpec[] }) {
  const specs = models ?? FAMILY_CONFIG[family].models
  const [disabled, setDisabled] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<FamilyModelSpec | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testedId, setTestedId] = useState<string | null>(null)

  const runTest = (id: string) => {
    setTestingId(id)
    setTestedId(null)
    setTimeout(() => {
      setTestingId(null)
      setTestedId(id)
      setTimeout(() => setTestedId(null), 2200)
    }, 900)
  }

  return (
    <ModelListShell
      count={specs.filter((m) => !disabled[m.id]).length}
      rows={specs.length}
      onAdd={undefined}
    >
      {specs.map((m) => (
        <ModelRow
          key={m.id}
          id={m.id}
          contextWindow={m.context}
          vision={m.vision ?? false}
          enabled={!disabled[m.id]}
          onToggle={(v) => setDisabled((d) => ({ ...d, [m.id]: !v }))}
          testing={testingId === m.id}
          tested={testedId === m.id}
          onTest={() => runTest(m.id)}
          onEdit={() => setEditing(m)}
          builtin
        />
      ))}
      <ModelSettingsDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        model={editing ? { id: editing.id, contextWindow: editing.context, maxOutput: 64000, enabled: true, builtin: true, vision: editing.vision ?? false, reasoning: editing.reasoning ?? [] } : null}
        builtinId={editing?.id}
        onSave={() => setEditing(null)}
      />
    </ModelListShell>
  )
}

function ModelListShell({
  count, rows, onAdd, children,
}: {
  count: number
  rows: number
  onAdd?: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-[#102642]">
          Model list <span className="ml-1 font-normal text-[#8ba0b3]">{count} models</span>
        </h3>
        {onAdd ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onAdd}
            className="gap-1.5 rounded-lg border-[#dce5e9] text-[12px] text-[#5a7189]"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add model
          </Button>
        ) : null}
      </div>
      {rows === 0 ? (
        <div className="flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-[#dce5e9] text-[12px] text-[#8ba0b3]">
          <Info className="size-3.5" aria-hidden="true" />
          No models are configured. Add a model to use it in chat.
        </div>
      ) : (
        <div className="divide-y divide-[#dce5e9] rounded-lg border border-[#dce5e9] bg-white">{children}</div>
      )}
    </section>
  )
}

function ModelRow({
  id, contextWindow, vision, enabled, onToggle, testing, tested, onTest, onEdit, onDelete, builtin,
}: {
  id: string
  contextWindow: number
  vision: boolean
  enabled: boolean
  onToggle: (v: boolean) => void
  testing: boolean
  tested: boolean
  onTest: () => void
  onEdit: () => void
  onDelete?: () => void
  builtin: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="min-w-0 truncate font-mono text-[13px] font-medium text-[#102642]">{id}</span>
      <span
        title={`Context window: ${contextLabel(contextWindow)}`}
        className="shrink-0 rounded-full border border-[#dce5e9] bg-[#f6f9fa] px-1.5 py-px font-mono text-[10px] text-[#5a7189]"
      >
        {contextLabel(contextWindow)}
      </span>
      {vision ? (
        <span className="hidden shrink-0 rounded-full border border-[#dce5e9] px-1.5 py-px text-[10px] text-[#5a7189] sm:inline">
          Vision
        </span>
      ) : null}
      {tested ? (
        <span className="shrink-0 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-1.5 py-px text-[10px] font-medium text-[#087d62]">
          Connected
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          title={enabled ? 'Test model' : 'Enable the provider first'}
          aria-label={`Test ${id}`}
          className="flex size-7 items-center justify-center rounded-md text-[#8ba0b3] transition-colors hover:bg-[#f6f9fa] hover:text-[#5a7189] disabled:cursor-not-allowed"
        >
          {testing ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Unplug className="size-3.5" aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onEdit}
          title="Edit model settings"
          aria-label={`Edit ${id} settings`}
          className="flex size-7 items-center justify-center rounded-md text-[#8ba0b3] transition-colors hover:bg-[#f6f9fa] hover:text-[#5a7189]"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        {!builtin && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            aria-label={`Delete ${id}`}
            className="flex size-7 items-center justify-center rounded-md text-[#8ba0b3] transition-colors hover:bg-[#fdeaea] hover:text-[#b91c1c]"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={enabled ? `Disable ${id}` : `Enable ${id}`}
          className="data-[state=checked]:bg-[#0b8b6c]"
        />
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Add / edit model dialog                                             */
/* ------------------------------------------------------------------ */

const MODALITIES = ['Text', 'Images', 'Video', 'PDF', 'Audio'] as const
const CAPABILITIES = ['Structured output', 'Native web search', 'Mid-conversation system messages'] as const

function ModelSettingsDialog({
  open, onOpenChange, model, builtinId, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: CustomModel | null
  /** when set, the model ID field is read-only (builtin plan models) */
  builtinId?: string
  onSave: (model: CustomModel) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#102642]">{model ? 'Edit model settings' : 'Add model'}</DialogTitle>
          <DialogDescription>Edit the context window for this model.</DialogDescription>
        </DialogHeader>
        {/* Remounts on every dialog open (Radix unmounts closed content), so
            local useState initializers reset the form without effects. */}
        <ModelForm
          key={model?.id ?? 'new-model'}
          model={model}
          builtinId={builtinId}
          onSave={onSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ModelForm({
  model, builtinId, onSave, onCancel,
}: {
  model: CustomModel | null
  builtinId?: string
  onSave: (model: CustomModel) => void
  onCancel: () => void
}) {
  const [id, setId] = useState(model?.id ?? '')
  const [contextWindow, setContextWindow] = useState(model ? String(model.contextWindow) : '')
  const [maxOutput, setMaxOutput] = useState(model ? String(model.maxOutput) : '')
  const [modalities, setModalities] = useState<string[]>(model?.vision ? ['Text', 'Images'] : ['Text'])
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [reasoning, setReasoning] = useState<string[]>(model?.reasoning ?? [])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!id.trim()) return setError('Model ID is required')
    const cw = Number(contextWindow)
    if (!Number.isFinite(cw) || cw <= 0) return setError('Context window must be a positive integer')
    const mo = Number(maxOutput)
    if (!Number.isFinite(mo) || mo <= 0) return setError('Max output tokens must be a positive integer')
    if (!modalities.includes('Text')) return setError('Text input type is required')
    onSave({
      id: id.trim(),
      contextWindow: cw,
      maxOutput: mo,
      enabled: model?.enabled ?? true,
      builtin: model?.builtin ?? false,
      vision: modalities.includes('Images'),
      reasoning: reasoning.filter((r) => r.trim()),
    })
    onCancel()
  }

  return (
    <>
      <div className="space-y-3.5">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[#5a7189]">Model ID</span>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              disabled={Boolean(builtinId)}
              placeholder="Model ID"
              aria-label="Model ID"
              className="h-9 font-mono text-[13px]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[#5a7189]">Context window</span>
              <Input
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                inputMode="numeric"
                placeholder="200000"
                aria-label="Context window"
                className="h-9 font-mono text-[13px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[#5a7189]">Max output tokens</span>
              <Input
                value={maxOutput}
                onChange={(e) => setMaxOutput(e.target.value)}
                inputMode="numeric"
                placeholder="64000"
                aria-label="Max output tokens"
                className="h-9 font-mono text-[13px]"
              />
            </label>
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-[#dce5e9] bg-[#f8fafb] px-3 py-2 text-[12.5px] font-medium text-[#5a7189]">
              Advanced settings
              <ChevronRight className={cn('size-3.5 transition-transform', advancedOpen && 'rotate-90')} aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3.5 pt-3">
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-[#5a7189]">Input types</p>
                <div className="flex flex-wrap gap-1.5">
                  {MODALITIES.map((m) => {
                    const active = modalities.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setModalities((prev) => (active ? prev.filter((x) => x !== m) : [...prev, m]))
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11.5px] transition-colors',
                          active
                            ? 'border-[#bfe5d8] bg-[#e2f4ed] font-medium text-[#087d62]'
                            : 'border-[#dce5e9] bg-white text-[#5a7189] hover:bg-[#f6f9fa]',
                        )}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-[#5a7189]">Model capabilities</p>
                <div className="space-y-1.5">
                  {CAPABILITIES.map((cap) => (
                    <label key={cap} className="flex items-center gap-2 text-[12.5px] text-[#5a7189]">
                      <Checkbox
                        checked={capabilities.includes(cap)}
                        onCheckedChange={(v) =>
                          setCapabilities((prev) => (v ? [...prev, cap] : prev.filter((x) => x !== cap)))
                        }
                        aria-label={cap}
                      />
                      {cap}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-[#5a7189]">Reasoning levels (low to high)</p>
                {reasoning.length === 0 ? (
                  <p className="text-[11.5px] text-[#8ba0b3]">Not set</p>
                ) : (
                  <div className="space-y-1.5">
                    {reasoning.map((level, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={level}
                          onChange={(e) =>
                            setReasoning((prev) => prev.map((r, j) => (j === i ? e.target.value : r)))
                          }
                          aria-label={`Reasoning level ${i + 1}`}
                          className="h-8 flex-1 font-mono text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => setReasoning((prev) => prev.filter((_, j) => j !== i))}
                          aria-label="Delete reasoning level"
                          className="flex size-7 items-center justify-center rounded-md text-[#8ba0b3] hover:bg-[#fdeaea] hover:text-[#b91c1c]"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReasoning((prev) => [...prev, ''])}
                  className="gap-1 rounded-lg border-[#dce5e9] text-[11.5px] text-[#5a7189]"
                >
                  <Plus className="size-3" aria-hidden="true" />
                  Add reasoning level
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {error ? <p className="text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189]"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={save}
          className="rounded-full bg-[#0b8b6c] px-4 text-[12.5px] text-white hover:bg-[#0a7a5f]"
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Custom provider detail                                              */
/* ------------------------------------------------------------------ */

function CustomProviderDetail({ provider }: { provider: CustomProvider }) {
  const [showKey, setShowKey] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(provider.name)
  const [addingModel, setAddingModel] = useState(false)
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testedId, setTestedId] = useState<string | null>(null)
  const { message, flash } = useFlash()

  const save = (patch: Parameters<typeof patchProvider>[1]) => {
    patchProvider(provider.id, patch)
    flash(`${provider.name} saved`)
  }

  const runTest = (id: string) => {
    setTestingId(id)
    setTestedId(null)
    setTimeout(() => {
      setTestingId(null)
      setTestedId(id)
      setTimeout(() => setTestedId(null), 2200)
    }, 900)
  }

  const commitRename = () => {
    setRenaming(false)
    const next = nameDraft.trim()
    if (next && next !== provider.name) save({ name: next })
  }

  return (
    <div className="space-y-5">
      <FlashLine message={message} />

      {/* Header: logo + name + enabled + more */}
      <div className="flex flex-wrap items-center gap-3">
        <LogoTile text={provider.name.slice(0, 1).toUpperCase()} tone="outline" size={24} />
        {renaming ? (
          <Input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setNameDraft(provider.name)
                setRenaming(false)
              }
            }}
            aria-label="Provider name"
            className="h-9 w-56 text-lg font-semibold"
          />
        ) : (
          <h2 className="text-lg font-semibold text-[#102642]">{provider.name}</h2>
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-2">
            <span className="text-[12px] text-[#5a7189]">{provider.enabled ? 'Enabled' : 'Disabled'}</span>
            <Switch
              checked={provider.enabled}
              onCheckedChange={(v) => save({ enabled: v })}
              aria-label={provider.enabled ? 'Disable provider' : 'Enable provider'}
              className="data-[state=checked]:bg-[#0b8b6c]"
            />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                className="flex size-7 items-center justify-center rounded-md text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#5a7189]"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setNameDraft(provider.name)
                  setRenaming(true)
                }}
                className="gap-2 text-[13px]"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="gap-2 text-[13px] text-[#b91c1c] focus:text-[#b91c1c]"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent className="sm:max-w-md">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-[#102642]">Delete {provider.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the custom provider configuration. Related edits on the current settings page
                      will not be restored automatically.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full border-[#dce5e9] text-[#5a7189]">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-full bg-[#b91c1c] text-white hover:bg-[#991b1b]"
                      onClick={() => deleteProvider(provider.id)}
                    >
                      Delete provider
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      {/* Connection */}
      <section className="space-y-3">
        <h3 className="text-[13px] font-semibold text-[#102642]">Connection</h3>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[#5a7189]">Base URL</span>
          <Input
            value={provider.baseUrl}
            onChange={(e) => save({ baseUrl: e.target.value })}
            placeholder="https://api.example.com/v1"
            aria-label="Base URL"
            className="h-9 font-mono text-[12.5px]"
          />
        </label>
        <div className="space-y-1">
          <span className="text-[12px] font-medium text-[#5a7189]">API format</span>
          <Select value={provider.apiFormat} onValueChange={(v) => save({ apiFormat: v as ApiFormat })}>
            <SelectTrigger aria-label="API format" className="h-9 w-full rounded-lg border-[#dce5e9] text-[12.5px] md:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {API_FORMATS.map((fmt) => (
                <SelectItem key={fmt.value} value={fmt.value} className="text-[12.5px]">
                  {fmt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* API key */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-[#102642]">API key</h3>
          {provider.keyUrl ? (
            <a
              href={provider.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] font-medium text-[#0b8b6c] underline underline-offset-2"
            >
              Get API key
            </a>
          ) : null}
        </div>
        <div className="relative">
          <Input
            type={showKey ? 'text' : 'password'}
            value={provider.apiKey}
            onChange={(e) => save({ apiKey: e.target.value })}
            placeholder="Enter API key"
            aria-label="API key"
            className="h-9 pr-10 font-mono text-[12.5px]"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#5a7189]"
          >
            {showKey ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
          </button>
        </div>
        {!provider.apiKey ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-[#b45309]">
            <Info className="size-3.5" aria-hidden="true" />
            Set an API key to enable this provider.
          </p>
        ) : null}
      </section>

      {/* Models */}
      <ModelListShell
        count={provider.models.filter((m) => m.enabled).length}
        rows={provider.models.length}
        onAdd={() => setAddingModel(true)}
      >
        {provider.models.map((m) => (
          <ModelRow
            key={m.id}
            id={m.id}
            contextWindow={m.contextWindow}
            vision={m.vision}
            enabled={m.enabled}
            onToggle={(v) => {
              patchProviderModel(provider.id, m.id, { enabled: v })
              flash(`${provider.name} / ${m.id} saved`)
            }}
            testing={testingId === m.id}
            tested={testedId === m.id}
            onTest={() => runTest(m.id)}
            onEdit={() => setEditingModel(m)}
            onDelete={
              m.builtin
                ? undefined
                : () => {
                    deleteProviderModel(provider.id, m.id)
                    flash(`${provider.name} / ${m.id} deleted`)
                  }
            }
            builtin={m.builtin}
          />
        ))}
      </ModelListShell>

      <ModelSettingsDialog
        open={addingModel}
        onOpenChange={setAddingModel}
        model={null}
        onSave={(m) => {
          addProviderModel(provider.id, m)
          flash(`${provider.name} / ${m.id} saved`)
        }}
      />
      <ModelSettingsDialog
        open={editingModel !== null}
        onOpenChange={(open) => !open && setEditingModel(null)}
        model={editingModel}
        onSave={(m) => {
          patchProviderModel(provider.id, m.id, m)
          flash(`${provider.name} / ${m.id} saved`)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Template picker (Add provider)                                      */
/* ------------------------------------------------------------------ */

function TemplatePicker({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const zhipu = PROVIDER_TEMPLATES.filter((t) => t.group === 'zhipu')
  const other = PROVIDER_TEMPLATES.filter((t) => t.group === 'other')

  const create = (templateId?: string) => {
    const id = templateId ? addProviderFromTemplate(templateId) : createCustomProvider()
    if (id) onCreated(id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          aria-label="Back to provider details"
          className="gap-1.5 rounded-lg px-2 text-[12.5px] text-[#5a7189]"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back
        </Button>
        <h2 className="text-lg font-medium text-[#102642]">Add provider</h2>
      </div>

      <section className="space-y-2.5">
        <h3 className="text-[12px] font-semibold text-[#8ba0b3]">Zhipu</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {zhipu.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => create(t.id)} />
          ))}
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[12px] font-semibold text-[#8ba0b3]">Other</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => create()}
            className="flex min-h-16 items-center gap-3 rounded-xl border border-dashed border-[#bfe5d8] bg-[#f6faf8] p-3 text-left transition-colors hover:border-[#0b8b6c]/50 hover:bg-[#eef8f3]"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-[#dce5e9] bg-white">
              <Plus className="size-4 text-[#5a7189]" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] font-medium text-[#102642]">Create custom provider</span>
            <ChevronRight className="size-4 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
          </button>
          {other.map((t) => (
            <TemplateCard key={t.id} template={t} onClick={() => create(t.id)} />
          ))}
        </div>
      </section>
    </div>
  )
}

function TemplateCard({ template, onClick }: { template: { id: string; name: string; letter: string }; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-[#dce5e9] bg-white p-3 text-left transition-colors hover:border-[#0b8b6c]/40 hover:bg-[#f6faf8]"
    >
      <LogoTile text={template.letter} tone="outline" size={32} />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#102642]">{template.name}</span>
      <ChevronRight className="size-4 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Upgrade dialog — plans, billing cycle, payment                      */
/* ------------------------------------------------------------------ */

const TIERS: Tier[] = ['lite', 'pro', 'max']

function UpgradeDialog({
  family, open, onOpenChange, defaultAudience = 'personal',
}: {
  family: Family
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAudience?: 'personal' | 'team'
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[#102642]">Upgrade Plan</DialogTitle>
          <DialogDescription>
            Find the perfect plan for you and kick-start your AI coding journey.
          </DialogDescription>
        </DialogHeader>
        {/* Mounts fresh each time the dialog opens (Radix unmounts closed
            content), so flow state resets without effects. */}
        <UpgradeFlow family={family} defaultAudience={defaultAudience} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function UpgradeFlow({
  family, defaultAudience, onDone,
}: {
  family: Family
  defaultAudience: 'personal' | 'team'
  onDone: () => void
}) {
  const plan = useModelPlan()
  const cfg = FAMILY_CONFIG[family]
  const current = plan.families[family].coding
  const [audience, setAudience] = useState<'personal' | 'team'>(defaultAudience)
  const [step, setStep] = useState<'plans' | 'payment' | 'processing' | 'success'>('plans')
  const [cycle, setCycle] = useState<BillingCycle>(current.cycle ?? 'monthly')
  const [tier, setTier] = useState<Tier>(current.tier && current.tier !== 'lite' ? current.tier : 'pro')
  const [seats, setSeats] = useState(3)
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spec = cycleSpec(cycle)
  const firstTime = current.status !== 'purchased'
  const personalPrice = cyclePrice(cfg.currency, cfg.tiers[tier].price, cycle)
  const personalDue = firstTime && cycle === 'monthly' ? cfg.tiers[tier].promo : personalPrice
  const teamMonthly = cfg.teamSeatPrice * seats
  const teamDue = Math.round(teamMonthly * spec.factor * (1 - spec.off) * 100) / 100
  const due = audience === 'personal' ? personalDue : teamDue

  const confirmPayment = () => {
    setStep('processing')
    setTimeout(() => {
      if (audience === 'personal') {
        purchaseCodingPlan(family, tier, cycle)
      } else {
        purchaseCodingPlan(family, tier, cycle, seats)
      }
      setStep('success')
    }, 1400)
  }

  return (
    <>
        {step === 'plans' ? (
          <div className="space-y-4">
            {/* Audience */}
            <div className="flex gap-1.5 rounded-full border border-[#dce5e9] bg-[#f8fafb] p-1" role="tablist" aria-label="Purchase audience">
              {(['personal', 'team'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={audience === a}
                  onClick={() => setAudience(a)}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                    audience === a ? 'bg-[#e2f4ed] text-[#087d62]' : 'text-[#5a7189] hover:text-[#102642]',
                  )}
                >
                  {a === 'personal' ? 'For Individuals' : 'For Teams'}
                </button>
              ))}
            </div>

            {/* Billing cycle */}
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-[#5a7189]">Choose billing cycle</p>
              <div className="grid grid-cols-3 gap-2">
                {CYCLES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={cycle === c.value}
                    onClick={() => setCycle(c.value)}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-[12px] font-medium transition-colors',
                      cycle === c.value
                        ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
                        : 'border-[#dce5e9] bg-white text-[#5a7189] hover:bg-[#f6f9fa]',
                    )}
                  >
                    {c.label}
                    {c.off > 0 ? <span className="ml-1 text-[10px] text-[#0b8b6c]">-{Math.round(c.off * 100)}%</span> : null}
                  </button>
                ))}
              </div>
            </div>

            {audience === 'personal' ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Choose a plan">
                {TIERS.map((t) => {
                  const specT = cfg.tiers[t]
                  const isCurrent = current.status === 'purchased' && current.tier === t
                  const selected = tier === t
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTier(t)}
                      className={cn(
                        'flex flex-col rounded-xl border p-3.5 text-left transition-colors',
                        selected
                          ? 'border-[#0b8b6c] bg-[#f2faf7] ring-1 ring-[#0b8b6c]/30'
                          : 'border-[#dce5e9] bg-white hover:border-[#0b8b6c]/40',
                      )}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-[14px] font-semibold text-[#102642]">{t.toUpperCase()}</span>
                        {isCurrent ? (
                          <span className="rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-2 py-px text-[10px] font-semibold text-[#087d62]">Current</span>
                        ) : null}
                      </span>
                      <span className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-xl font-bold text-[#102642]">{money(cfg.currency, cyclePrice(cfg.currency, specT.price, cycle))}</span>
                        <span className="text-[11px] text-[#8ba0b3]">{spec.unit}</span>
                      </span>
                      {firstTime && cycle === 'monthly' ? (
                        <span className="mt-0.5 text-[10.5px] font-medium text-[#087d62]">
                          First month {money(cfg.currency, specT.promo)} · first-time discount
                        </span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap gap-1">
                        {cfg.models.map((m) => (
                          <span key={m.id} className="rounded-full border border-[#dce5e9] bg-[#f6f9fa] px-1.5 py-px font-mono text-[9.5px] text-[#5a7189]">
                            {m.id}
                          </span>
                        ))}
                      </span>
                      <ul className="mt-2.5 space-y-1">
                        {specT.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#5a7189]">
                            <Check className="mt-0.5 size-3 shrink-0 text-[#0b8b6c]" aria-hidden="true" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-[#dce5e9] bg-[#f8fafb] p-4">
                <div>
                  <p className="text-[14px] font-semibold text-[#102642]">Pro · Team plan</p>
                  <p className="mt-0.5 text-[12px] text-[#5a7189]">
                    Shared quota, seat management, and centralized billing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12px] font-medium text-[#5a7189]">Seats</span>
                  <span className="flex items-center rounded-lg border border-[#dce5e9] bg-white">
                    <button
                      type="button"
                      onClick={() => setSeats((s) => Math.max(1, s - 1))}
                      aria-label="Decrease seats"
                      className="flex size-8 items-center justify-center text-[#5a7189] hover:text-[#102642]"
                    >
                      −
                    </button>
                    <input
                      value={seats}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ''))
                        setSeats(Math.min(500, Math.max(1, n || 1)))
                      }}
                      aria-label="Number of seats"
                      className="w-14 border-x border-[#dce5e9] py-1.5 text-center font-mono text-[13px] text-[#102642] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSeats((s) => Math.min(500, s + 1))}
                      aria-label="Increase seats"
                      className="flex size-8 items-center justify-center text-[#5a7189] hover:text-[#102642]"
                    >
                      +
                    </button>
                  </span>
                  <span className="text-[12.5px] text-[#5a7189]">
                    {money(cfg.currency, cfg.teamSeatPrice)} / seat / month
                  </span>
                  <span className="ml-auto text-[13px] font-semibold text-[#102642]">
                    {money(cfg.currency, teamDue)} <span className="text-[11px] font-normal text-[#8ba0b3]">{spec.unit}</span>
                  </span>
                </div>
                <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#8ba0b3]">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Assign members to your team plan on the {cfg.name} team plan management page. Once assigned, the
                  team quota will be available in PaySwap.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {step === 'payment' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#dce5e9] bg-[#f8fafb] p-4">
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex items-center justify-between">
                  <dt className="text-[#5a7189]">Plan</dt>
                  <dd className="font-medium text-[#102642]">
                    {audience === 'personal'
                      ? `${cfg.name} Coding Plan · ${tier.toUpperCase()}`
                      : `${cfg.name} Team Plan · PRO · ${seats} seats`}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#5a7189]">Billing cycle</dt>
                  <dd className="font-medium text-[#102642]">{spec.label}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[#5a7189]">Status</dt>
                  <dd className="font-medium text-[#087d62]">Active</dd>
                </div>
                <div className="flex items-center justify-between border-t border-[#dce5e9] pt-2">
                  <dt className="font-semibold text-[#102642]">Due today</dt>
                  <dd className="text-[15px] font-bold text-[#102642]">{money(cfg.currency, due)}</dd>
                </div>
              </dl>
            </div>
            <div className="rounded-xl border border-[#dce5e9] bg-white p-4">
              <p className="text-[12px] font-semibold text-[#102642]">Renewal policy</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#5a7189]">
                Your subscription renews automatically at {money(cfg.currency, due)}
                {spec.unit} unless cancelled. You can turn off auto-renewal from plan management before the
                next renewal. Final discounts, credits, and payment amount are confirmed in the payment preview.
              </p>
              <label className="mt-3 flex items-start gap-2 text-[12px] text-[#5a7189]">
                <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} aria-label="Agree to renewal policy" />
                I understand and agree to the renewal policy and subscription terms.
              </label>
            </div>
            {error ? <p className="text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}
          </div>
        ) : null}

        {step === 'processing' ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-8 animate-spin text-[#0b8b6c]" aria-hidden="true" />
            <p className="text-[13px] font-medium text-[#102642]">Payment in progress…</p>
            <p className="text-[11.5px] text-[#8ba0b3]">Keep this panel open while the payment channel finishes.</p>
          </div>
        ) : null}

        {step === 'success' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-[#e2f4ed]">
              <Check className="size-6 text-[#087d62]" aria-hidden="true" />
            </span>
            <p className="text-[15px] font-semibold text-[#102642]">Payment successful</p>
            <p className="max-w-sm text-[12px] leading-relaxed text-[#5a7189]">
              Your Coding Plan payment was successful. The provider status will refresh after you close this
              panel.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          {step === 'plans' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onDone}
                className="rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setStep('payment')}
                className="gap-1.5 rounded-full bg-[#0b8b6c] px-5 text-[12.5px] text-white hover:bg-[#0a7a5f]"
              >
                Continue to payment
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {step === 'payment' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('plans')}
                className="rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189]"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => (agreed ? confirmPayment() : setError('Please agree to the renewal policy to continue.'))}
                className="rounded-full bg-[#0b8b6c] px-5 text-[12.5px] text-white hover:bg-[#0a7a5f]"
              >
                Confirm payment
              </Button>
            </>
          ) : null}
          {step === 'success' ? (
            <Button
              size="sm"
              onClick={onDone}
              className="rounded-full bg-[#0b8b6c] px-6 text-[12.5px] text-white hover:bg-[#0a7a5f]"
            >
              Done
            </Button>
          ) : null}
        </DialogFooter>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Composer model picker trigger + menu (used by composer.tsx)         */
/* ------------------------------------------------------------------ */

export function ModelPickerMenu({ onSelect }: { onSelect?: () => void }) {
  const plan = useModelPlan()
  const groups = useMemo(() => modelSelectionGroups(plan), [plan])
  const selection = effectiveSelection(plan)

  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Model selection">
      {groups.map((g) => (
        <div key={g.id}>
          <p className="flex items-center gap-1.5 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#8ba0b3]">
            {g.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[9px] font-semibold',
                g.tone === 'green' ? 'bg-[#e2f4ed] text-[#087d62]' : 'bg-[#eef2f5] text-[#5a7189]',
              )}
            >
              {g.badge}
            </span>
          </p>
          {g.models.map((m) => {
            const active = selection.group === g.id && selection.model === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  selectModel({ group: g.id, model: m })
                  onSelect?.()
                }}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12.5px] transition-colors',
                  active ? 'bg-[#e2f4ed] font-medium text-[#087d62]' : 'text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642]',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{m}</span>
                {active ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      ))}
      {groups.length === 0 ? (
        <p className="px-2 py-2 text-[12px] text-[#8ba0b3]">No model providers connected.</p>
      ) : null}
    </div>
  )
}

/** Current model name for the composer trigger (e.g. "GLM-5.3"). */
export function useCurrentModelName(): string {
  const plan = useModelPlan()
  return effectiveSelection(plan).model || 'GLM-5.3'
}
