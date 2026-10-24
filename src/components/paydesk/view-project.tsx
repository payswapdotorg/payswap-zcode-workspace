'use client'

import {
  ChevronRight,
  CreditCard,
  FileText,
  Plus,
  Smartphone,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { Automation, Channel, Group, Project, Task } from '@/lib/paydata'
import { C, Money, SectionLabel, StatCard, StatusPill } from './bits'

interface ProjectViewProps {
  project: Project
  group: Group | null
  tasks: Task[]
  channels: Channel[]
  automations: Automation[]
  onOpenTask: (id: string) => void
  onNewTask: (projectId: string) => void
}

const channelIcon = { card: CreditCard, mobile: Smartphone, bank: FileText } as const

export function ProjectView({ project, group, tasks, channels, automations, onOpenTask, onNewTask }: ProjectViewProps) {
  const running = tasks.filter((t) => t.status === 'running').length
  const projectAutomations = automations.filter((a) => a.enabled).length

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-3 w-3 rounded-[4px]" style={{ background: project.color }} aria-hidden="true" />
            <h1 className="text-xl font-semibold text-[#102642]">{project.name}</h1>
            {group && (
              <Badge variant="outline" className="border-[#dce5e9] text-[11px] font-normal text-[#5a7189]">
                {group.name}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-[#5a7189]">{project.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onNewTask(project.id)}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium text-white"
          style={{ background: C.green }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New task in project
        </button>
      </header>

      <section aria-label="Project stats" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Volume · 30 days" value={<Money value={project.volume30d} />} deltaTone="green" delta="+8.2%" footer="vs prev. period" />
        <StatCard label="Payment success rate" value={`${project.successRate}%`} deltaTone="green" delta="+0.2 pts" />
        <StatCard
          label="Agent activity"
          value={`${running} running`}
          deltaTone="amber"
          delta={`${projectAutomations} automations`}
          footer={`${tasks.length} tasks total`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5" aria-label="Project details">
        {/* Tasks */}
        <div className="rounded-2xl border border-[#dce5e9] bg-white lg:col-span-3">
          <div className="px-4 pb-1 pt-4">
            <SectionLabel>Tasks</SectionLabel>
          </div>
          {tasks.length === 0 ? (
            <p className="px-4 pb-5 pt-2 text-[13px] text-[#8ba0b3]">
              No tasks yet — start one with “New task in project”.
            </p>
          ) : (
            <ul className="divide-y divide-[#eef2f5] px-2 pb-2">
              {tasks.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-[#f6f9fa]"
                  >
                    {task.status === 'running' ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute h-2 w-2 animate-ping rounded-full opacity-50" style={{ background: C.amberDot }} />
                        <span className="h-2 w-2 rounded-full" style={{ background: C.amberDot }} />
                      </span>
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: C.green }} />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#102642]">{task.title}</span>
                    <span className="shrink-0 text-[11px] text-[#8ba0b3]">{task.createdAt}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c3d0da]" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Channels */}
        <div className="rounded-2xl border border-[#dce5e9] bg-white lg:col-span-2">
          <div className="px-4 pb-1 pt-4">
            <SectionLabel>Channels · last 24h</SectionLabel>
          </div>
          <ul className="divide-y divide-[#eef2f5] px-2 pb-2">
            {channels.map((ch) => {
              const Icon = channelIcon[ch.kind]
              const tone = ch.status === 'live' ? 'green' : ch.status === 'degraded' ? 'red' : 'amber'
              return (
                <li key={ch.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f6f9fa]">
                    <Icon className="h-4 w-4 text-[#5a7189]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#102642]">{ch.name}</span>
                    <Money value={ch.volume24h} className="text-[11px] text-[#8ba0b3]" />
                  </span>
                  <StatusPill tone={tone}>{ch.status}</StatusPill>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
    </div>
  )
}
