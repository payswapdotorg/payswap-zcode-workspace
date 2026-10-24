'use client'

import { useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Bot,
  Circle,
  Clock,
  Download,
  Loader2,
  Play,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type {
  Routine,
  RoutineCategory,
  RoutinePublishInput,
  RoutineStep,
  RoutineStepKind,
} from '@/lib/agent-types'
import { C, SectionLabel } from './bits'

export interface RoutinesViewProps {
  routines: Routine[]
  loading?: boolean
  busyId: string | null
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onRate: (id: string, score: number) => void
  onPublish: (input: RoutinePublishInput) => void
  onUseInNewTask: (routine: Routine) => void
}

const CATEGORIES: RoutineCategory[] = [
  'Shopping',
  'Payments',
  'Investing',
  'Lending',
  'Merchant',
  'Bills',
  'Savings',
  'FX',
]

const STEP_KINDS: RoutineStepKind[] = ['action', 'browser', 'payment', 'approval', 'settings']

type TabKey = 'library' | 'installed' | 'pending'

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: Routine['status'] }) {
  if (status === 'accepted') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: C.mint, color: C.greenDeep }}
      >
        <BadgeCheck className="h-3 w-3" aria-hidden="true" />
        PaySwap accepted
      </span>
    )
  }
  if (status === 'pending_review') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
        style={{ background: '#fdf1df', color: C.amber }}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        Pending review
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: '#fdeaea', color: C.red }}
    >
      Rejected
    </span>
  )
}

function KindPill({ kind }: { kind: RoutineStepKind }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#eef2f5] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#5a7189]">
      {kind}
    </span>
  )
}

function ScoreBar({ label, score, count }: { label: string; score: number; count: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-[#5a7189]">{label}</span>
        <span className="font-mono tabular-nums text-[#102642]">
          {score.toFixed(1)} · {count} ratings
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef2f5]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, (score / 5) * 100))}%`, background: C.greenDeep }}
        />
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/* Routine card                                                        */
/* ------------------------------------------------------------------ */

interface RoutineCardProps {
  routine: Routine
  busyId: string | null
  tab: TabKey
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onUseInNewTask: (routine: Routine) => void
  onOpenDetails: (id: string) => void
}

function RoutineCard({ routine: r, busyId, tab, onInstall, onUninstall, onUseInNewTask, onOpenDetails }: RoutineCardProps) {
  const busy = busyId === r.id
  return (
    <article className="flex flex-col rounded-2xl border border-[#dce5e9] bg-white p-4 transition-colors hover:border-[#bfe5d8]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate text-[15px] font-medium text-[#102642]">{r.name}</h3>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-1 truncate text-[11.5px] text-[#8ba0b3]">
        {r.publisher} · v{r.version} · {r.category}
        {r.merchant ? ' · Merchant' : ''}
      </p>
      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#5a7189]">{r.description}</p>

      <ul className="mt-3 space-y-1.5">
        {r.steps.slice(0, 3).map((s, i) => (
          <li key={`${i}-${s.title}`} className="flex items-center gap-2 text-[12px] text-[#5a7189]">
            <Circle className="h-3 w-3 shrink-0 text-[#c3d0da]" aria-hidden="true" />
            <span className="truncate">{s.title}</span>
          </li>
        ))}
        {r.steps.length > 3 ? (
          <li className="pl-5 text-[11px] text-[#8ba0b3]">+{r.steps.length - 3} more steps</li>
        ) : null}
      </ul>

      {tab === 'installed' ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#8ba0b3]">
          <Circle className="h-1.5 w-1.5 fill-[#087d62] text-[#087d62]" aria-hidden="true" />
          Loaded automatically when a goal matches
        </p>
      ) : null}

      {tab === 'pending' && r.status === 'pending_review' ? (
        <p
          className="mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11.5px] leading-snug"
          style={{ background: '#fdf1df', color: C.amber }}
        >
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Awaiting PaySwap acceptance — ratings open after review
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#eef2f5] pt-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-[#102642]">
            <Star className="h-3.5 w-3.5 fill-[#087d62] text-[#087d62]" aria-hidden="true" />
            {r.rating.userScore.toFixed(1)}
            <span className="text-[#8ba0b3]">({r.rating.userCount})</span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-default items-center gap-1 font-mono text-[12px] tabular-nums text-[#102642]">
                <Bot className="h-3.5 w-3.5 text-[#5a7189]" aria-hidden="true" />
                {r.rating.agentScore.toFixed(1)}
              </span>
            </TooltipTrigger>
            <TooltipContent>Agents rate how well this routine achieves its stated goal</TooltipContent>
          </Tooltip>
          <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-[#8ba0b3]">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {r.installs.toLocaleString('en-US')}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#5a7189] hover:bg-[#eef2f5] hover:text-[#087d62]"
            aria-label={`Use ${r.name} in new task`}
            onClick={() => onUseInNewTask(r)}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            className="h-9 rounded-full px-3 text-[12.5px] text-[#5a7189] hover:bg-[#eef2f5] hover:text-[#102642]"
            onClick={() => onOpenDetails(r.id)}
          >
            Details
          </Button>
          {r.installed ? (
            <Button
              variant="outline"
              className="h-9 rounded-full border-[#dce5e9] px-4 text-[12.5px] text-[#5a7189] hover:border-[#f3cccc] hover:bg-[#fdf3f3] hover:text-[#b91c1c]"
              disabled={busy}
              onClick={() => onUninstall(r.id)}
            >
              Uninstall
            </Button>
          ) : (
            <Button
              className="h-9 rounded-full px-4 text-[12.5px] font-medium text-white"
              style={{ background: C.green }}
              disabled={busy}
              onClick={() => onInstall(r.id)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Install
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Details dialog                                                      */
/* ------------------------------------------------------------------ */

function RateStars({ routine, busy, onRate }: { routine: Routine; busy: boolean; onRate: (id: string, score: number) => void }) {
  const [hover, setHover] = useState(0)
  if (routine.status === 'pending_review') {
    return (
      <p className="text-[12px] leading-snug" style={{ color: C.amber }}>
        This routine is awaiting PaySwap review — ratings open once it is accepted.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={busy}
          aria-label={`Rate ${routine.name} ${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onRate(routine.id, n)}
          className="rounded-lg p-1 transition-colors hover:bg-[#eef2f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#bfe5d8] disabled:opacity-50"
        >
          <Star
            className={`h-5 w-5 transition-colors ${hover >= n ? 'fill-[#087d62] text-[#087d62]' : 'text-[#c3d0da]'}`}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  )
}

interface DetailsDialogProps {
  routine: Routine | null
  busyId: string | null
  onClose: () => void
  onRate: (id: string, score: number) => void
}

function DetailsDialog({ routine, busyId, onClose, onRate }: DetailsDialogProps) {
  return (
    <Dialog open={routine !== null} onOpenChange={(open) => !open && onClose()}>
      {routine ? (
        <DialogContent className="max-h-[85vh] overflow-y-auto [scrollbar-width:thin] sm:max-w-lg">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2 pr-6">
              <DialogTitle className="text-[#102642]">{routine.name}</DialogTitle>
              <StatusBadge status={routine.status} />
            </div>
            <DialogDescription>
              {routine.publisher} · v{routine.version} · {routine.category}
              {routine.merchant ? ' · Merchant' : ''} · updated {formatDate(routine.updatedAt)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <section className="space-y-2">
              <SectionLabel>Steps</SectionLabel>
              <ol className="space-y-2.5">
                {routine.steps.map((s, i) => (
                  <li key={`${i}-${s.title}`} className="flex items-start gap-2.5">
                    <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-[#8ba0b3]">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-[#102642]">{s.title}</p>
                      {s.detail ? <p className="mt-0.5 text-[12px] text-[#8ba0b3]">{s.detail}</p> : null}
                    </div>
                    <KindPill kind={s.kind} />
                  </li>
                ))}
              </ol>
            </section>

            <section className="space-y-2.5">
              <SectionLabel>Ratings</SectionLabel>
              <ScoreBar label="Users" score={routine.rating.userScore} count={routine.rating.userCount} />
              <ScoreBar label="Agents" score={routine.rating.agentScore} count={routine.rating.agentCount} />
              <p className="text-[11.5px] text-[#8ba0b3]">
                Agents rate how well this routine achieves its stated goal.
              </p>
            </section>

            {routine.keywords.length > 0 ? (
              <section className="space-y-2">
                <SectionLabel>Keywords</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {routine.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-[#eef2f5] px-2 py-0.5 text-[11px] text-[#5a7189]"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <SectionLabel>Registry</SectionLabel>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                <dt className="text-[#8ba0b3]">Publisher</dt>
                <dd className="text-right text-[#102642]">{routine.publisher}</dd>
                <dt className="text-[#8ba0b3]">Version</dt>
                <dd className="text-right font-mono tabular-nums text-[#102642]">v{routine.version}</dd>
                <dt className="text-[#8ba0b3]">Installs</dt>
                <dd className="text-right font-mono tabular-nums text-[#102642]">
                  {routine.installs.toLocaleString('en-US')}
                </dd>
                <dt className="text-[#8ba0b3]">Updated</dt>
                <dd className="text-right text-[#102642]">{formatDate(routine.updatedAt)}</dd>
              </dl>
            </section>

            <section className="space-y-2 border-t border-[#eef2f5] pt-4">
              <SectionLabel>Rate this routine</SectionLabel>
              <RateStars routine={routine} busy={busyId === routine.id} onRate={onRate} />
            </section>
          </div>

          <DialogFooter>
            <Button variant="outline" className="rounded-full border-[#dce5e9]" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Publish dialog                                                      */
/* ------------------------------------------------------------------ */

interface DraftStep {
  key: number
  title: string
  kind: RoutineStepKind
}

function PublishForm({ onSubmit, onCancel }: { onSubmit: (input: RoutinePublishInput) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<RoutineCategory>('Payments')
  const [merchant, setMerchant] = useState(false)
  const [publisher, setPublisher] = useState('You')
  const [steps, setSteps] = useState<DraftStep[]>([{ key: 0, title: '', kind: 'action' }])
  const [attempted, setAttempted] = useState(false)
  const nextKey = useRef(1)

  const trimmedSteps = steps.map((s) => s.title.trim())
  const nameOk = name.trim().length > 0
  const stepsOk = trimmedSteps.some((t) => t.length > 0)
  const valid = nameOk && stepsOk

  const updateStep = (key: number, patch: Partial<Omit<DraftStep, 'key'>>) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }
  const addStep = () => {
    setSteps((prev) => [...prev, { key: nextKey.current++, title: '', kind: 'action' }])
  }
  const removeStep = (key: number) => {
    setSteps((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev))
  }

  const submit = () => {
    setAttempted(true)
    if (!valid) return
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      category,
      merchant,
      publisher: publisher.trim() || 'You',
      steps: steps
        .filter((s) => s.title.trim().length > 0)
        .map<RoutineStep>((s) => ({ title: s.title.trim(), kind: s.kind })),
    })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="routine-name" className="text-[#102642]">Name</Label>
        <Input
          id="routine-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekly supplier payout sweep"
          autoFocus
        />
        {attempted && !nameOk ? (
          <p className="text-[11.5px]" style={{ color: C.red }}>Give the routine a name.</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="routine-description" className="text-[#102642]">Description</Label>
        <Textarea
          id="routine-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What economic goal does this playbook fulfill?"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[#102642]">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as RoutineCategory)}>
            <SelectTrigger className="w-full" aria-label="Routine category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="routine-publisher" className="text-[#102642]">Publisher</Label>
          <Input
            id="routine-publisher"
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="You"
          />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[#dce5e9] px-3 py-2.5">
        <div>
          <p className="text-[13px] text-[#102642]">Merchant routine</p>
          <p className="text-[11.5px] text-[#8ba0b3]">Only offered to merchant workspaces</p>
        </div>
        <Switch
          checked={merchant}
          onCheckedChange={setMerchant}
          aria-label="Merchant routine"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[#102642]">Steps</Label>
          <span className="text-[11px] text-[#8ba0b3]">{steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-[#8ba0b3]">
                {i + 1}
              </span>
              <Input
                value={s.title}
                onChange={(e) => updateStep(s.key, { title: e.target.value })}
                placeholder="Step title"
                aria-label={`Step ${i + 1} title`}
                className="h-9 flex-1"
              />
              <Select
                value={s.kind}
                onValueChange={(v) => updateStep(s.key, { kind: v as RoutineStepKind })}
              >
                <SelectTrigger
                  className="h-9 w-[112px] shrink-0 text-[12px]"
                  aria-label={`Step ${i + 1} kind`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-[#8ba0b3] hover:text-[#b91c1c]"
                aria-label={`Remove step ${i + 1}`}
                disabled={steps.length === 1}
                onClick={() => removeStep(s.key)}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        {attempted && !stepsOk ? (
          <p className="text-[11.5px]" style={{ color: C.red }}>Add at least one step with a title.</p>
        ) : (
          <p className="text-[11.5px] text-[#8ba0b3]">At least one step with a title is required to publish.</p>
        )}
        <Button
          variant="outline"
          className="h-9 w-full rounded-xl border-[#dce5e9] text-[12.5px] text-[#5a7189] hover:border-[#bfe5d8] hover:text-[#087d62]"
          onClick={addStep}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add step
        </Button>
      </div>

      <DialogFooter>
        <Button variant="outline" className="rounded-full border-[#dce5e9]" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="rounded-full text-white"
          style={{ background: C.green }}
          disabled={!valid}
          onClick={submit}
        >
          Submit for review
        </Button>
      </DialogFooter>
    </div>
  )
}

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPublish: (input: RoutinePublishInput) => void
}

function PublishDialog({ open, onOpenChange, onPublish }: PublishDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[85vh] overflow-y-auto [scrollbar-width:thin] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[#102642]">Publish a routine</DialogTitle>
            <DialogDescription>
              Submitted playbooks enter pending review — PaySwap accepts them before they can be installed or rated.
            </DialogDescription>
          </DialogHeader>
          <PublishForm
            onSubmit={(input) => {
              onPublish(input)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Main view                                                           */
/* ------------------------------------------------------------------ */

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-[#dce5e9] bg-white p-8 text-center text-sm text-[#5a7189]">
      {children}
    </p>
  )
}

export function RoutinesView({
  routines,
  loading = false,
  busyId = null,
  onInstall,
  onUninstall,
  onRate,
  onPublish,
  onUseInNewTask,
}: RoutinesViewProps) {
  const [tab, setTab] = useState<TabKey>('library')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<RoutineCategory | 'All'>('All')
  const [merchantOnly, setMerchantOnly] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return routines.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.publisher.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      const matchesCategory = category === 'All' || r.category === category
      const matchesMerchant = !merchantOnly || r.merchant
      return matchesQuery && matchesCategory && matchesMerchant
    })
  }, [routines, query, category, merchantOnly])

  const installedCount = useMemo(() => routines.filter((r) => r.installed).length, [routines])
  const pendingCount = useMemo(() => routines.filter((r) => r.status === 'pending_review').length, [routines])

  const detailsRoutine = detailsId ? routines.find((r) => r.id === detailsId) ?? null : null

  const renderGrid = (list: Routine[], activeTab: TabKey) => {
    if (list.length === 0) {
      if (activeTab === 'installed') {
        return <EmptyState>Nothing installed yet — install a routine from the Library.</EmptyState>
      }
      if (activeTab === 'pending') {
        return <EmptyState>No routines awaiting review.</EmptyState>
      }
      return <EmptyState>No routines match — try a different search or category.</EmptyState>
    }
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((r) => (
          <RoutineCard
            key={r.id}
            routine={r}
            busyId={busyId}
            tab={activeTab}
            onInstall={onInstall}
            onUninstall={onUninstall}
            onUseInNewTask={onUseInNewTask}
            onOpenDetails={setDetailsId}
          />
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <p className="animate-pulse text-sm text-[#8ba0b3]">Loading routines…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold text-[#102642]">Routines</h1>
        <p className="mt-1 text-sm text-[#5a7189]">
          Playbooks your agent loads to fulfill economic goals — explore, install, publish, rate.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba0b3]" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routines…"
            aria-label="Search routines by name, publisher or description"
            className="rounded-full border-[#dce5e9] pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as RoutineCategory | 'All')}>
          <SelectTrigger
            className="h-9 w-[164px] rounded-full border-[#dce5e9] text-[12.5px]"
            aria-label="Filter by category"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#5a7189]">
          <Switch
            checked={merchantOnly}
            onCheckedChange={setMerchantOnly}
            aria-label="Show merchant routines only"
          />
          Merchant
        </label>
        <Button
          className="ml-auto gap-1.5 rounded-full text-white"
          style={{ background: C.green }}
          onClick={() => setPublishOpen(true)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Publish a routine
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="h-9 rounded-full border border-[#dce5e9] bg-white p-1">
          <TabsTrigger
            value="library"
            className="rounded-full px-3.5 text-[12.5px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
          >
            Library
          </TabsTrigger>
          <TabsTrigger
            value="installed"
            className="rounded-full px-3.5 text-[12.5px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
          >
            Installed ({installedCount})
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="rounded-full px-3.5 text-[12.5px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
          >
            Pending review ({pendingCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-4">
          {renderGrid(filtered.filter((r) => r.status === 'accepted'), 'library')}
        </TabsContent>
        <TabsContent value="installed" className="mt-4">
          {renderGrid(filtered.filter((r) => r.installed), 'installed')}
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          {renderGrid(filtered.filter((r) => r.status === 'pending_review'), 'pending')}
        </TabsContent>
      </Tabs>

      <DetailsDialog
        routine={detailsRoutine}
        busyId={busyId}
        onClose={() => setDetailsId(null)}
        onRate={onRate}
      />
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} onPublish={onPublish} />
    </div>
  )
}
