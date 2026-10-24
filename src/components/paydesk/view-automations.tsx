'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Plus,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { Automation } from '@/lib/paydata'
import { C, StatusPill } from './bits'

interface AutomationsViewProps {
  automations: Automation[]
  onToggle: (id: string) => void
  onCreate: (data: { name: string; schedule: string; action: string }) => void
}

const SCHEDULES = ['Every 15 minutes', 'Every hour', 'Every day · 06:00', 'Mondays · 08:00', 'Realtime']
const ACTIONS = [
  'Reconcile settlements',
  'Retry failed payouts',
  'Flag large transactions',
  'Send volume report',
  'Export payout CSV',
]

function actionIcon(a: Automation) {
  const name = a.name.toLowerCase()
  if (name.includes('flag')) return AlertTriangle
  if (name.includes('retry')) return RefreshCw
  if (name.includes('report') || name.includes('export')) return FileText
  return CalendarClock
}

export function AutomationsView({ automations, onToggle, onCreate }: AutomationsViewProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState(SCHEDULES[2])
  const [action, setAction] = useState(ACTIONS[0])

  const active = automations.filter((a) => a.enabled).length
  const paused = automations.length - active

  const create = () => {
    if (!name.trim()) return
    onCreate({ name: name.trim(), schedule, action })
    setName('')
    setOpen(false)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#102642]">Automations</h1>
          <p className="mt-1 text-sm text-[#5a7189]">
            Scheduled payment operations the agent runs for you — every result lands in Activity.
          </p>
          <div className="mt-2 flex gap-1.5">
            <StatusPill tone="green">{active} active</StatusPill>
            <StatusPill tone="slate">{paused} paused</StatusPill>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5 rounded-full text-white" style={{ background: C.green }}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New automation
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-[#102642]">New automation</DialogTitle>
              <DialogDescription>
                Runs on sandbox data first. Live execution requires an explicit approval.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="auto-name" className="text-[#102642]">Name</Label>
                <Input
                  id="auto-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Daily refund sweep"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#102642]">Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick an action" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#102642]">Schedule</Label>
                <Select value={schedule} onValueChange={setSchedule}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick a schedule" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-full border-[#dce5e9]" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="rounded-full text-white"
                style={{ background: C.green }}
                disabled={!name.trim()}
                onClick={create}
              >
                Create automation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <section aria-label="Automation list" className="overflow-hidden rounded-2xl border border-[#dce5e9] bg-white">
        <ul className="divide-y divide-[#eef2f5]">
          {automations.map((a) => {
            const Icon = actionIcon(a)
            const lastTone = a.lastResult === 'ok' ? 'green' : a.lastResult === 'warn' ? 'amber' : 'red'
            const lastLabel =
              a.lastResult === 'ok' ? `Last run ok · ${a.lastRunAt}` : a.lastResult === 'warn' ? `Needs review · ${a.lastRunAt}` : `Failed · ${a.lastRunAt}`
            return (
              <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: C.mint }}>
                  <Icon className="h-4 w-4" style={{ color: C.greenDeep }} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#102642]">{a.name}</p>
                  <p className="mt-0.5 text-[12px] text-[#5a7189]">{a.detail}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#8ba0b3]">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="h-3 w-3" aria-hidden="true" />
                      {a.schedule}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>next: {a.nextRun}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusPill tone={lastTone}>{lastLabel}</StatusPill>
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={() => onToggle(a.id)}
                    aria-label={`${a.enabled ? 'Disable' : 'Enable'} ${a.name}`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
