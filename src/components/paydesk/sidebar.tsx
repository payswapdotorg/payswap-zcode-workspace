'use client'

import { useState } from 'react'
import {
  Activity,
  Blocks,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Plus,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Route } from '@/hooks/use-hash-route'
import type { Group, Project, Task as PayTask } from '@/lib/paydata'
import { Avatar, BrandMark, C, SectionLabel } from './bits'
import { useCurrentModelName } from './model-providers'

export interface SidebarProps {
  route: Route
  onNavigate: (to: string) => void
  groups: Group[]
  projects: Project[]
  tasks: PayTask[]
  routineCount: number
  pluginCount: number
  pendingActivity: number
  mobileOpen: boolean
  onCloseMobile: () => void
}

function taskDot(task: PayTask) {
  if (task.status === 'running') {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute h-2 w-2 animate-ping rounded-full opacity-50" style={{ background: C.amberDot }} />
        <span className="h-2 w-2 rounded-full" style={{ background: C.amberDot }} />
      </span>
    )
  }
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: C.green }} />
}

function SidebarBody({
  route,
  onNavigate,
  groups,
  projects,
  tasks,
  routineCount,
  pluginCount,
  pendingActivity,
  onCloseMobile,
}: Omit<SidebarProps, 'mobileOpen'>) {
  const modelName = useCurrentModelName()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    g1: true,
    g2: true,
    g3: true,
  })
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({})

  const activeProjectId =
    route.name === 'project'
      ? route.id
      : route.name === 'task'
        ? (tasks.find((t) => t.id === route.id)?.projectId ?? null)
        : null

  const isNavActive = (name: Route['name']) => route.name === name

  const tasksFor = (projectId: string) => tasks.filter((t) => t.projectId === projectId)

  return (
    <div className="flex h-full w-72 flex-col border-r border-[#dce5e9] bg-[#f8fafb]">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <BrandMark size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-[#102642]">ZCode</p>
          <p className="truncate text-[11px] text-[#8ba0b3]">PaySwap workspace</p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5a7189] hover:bg-[#eef2f5] md:hidden"
        >
          <X className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
      </div>

      {/* New task */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => onNavigate('/new')}
          aria-label="New task"
          className={cn(
            'flex min-h-11 w-full items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
            route.name === 'new' || route.name === 'home'
              ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
              : 'border-[#dce5e9] bg-white text-[#087d62] hover:border-[#bfe5d8] hover:bg-[#e2f4ed]/60',
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New task
        </button>
      </div>

      {/* Workspace nav */}
      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]" aria-label="Workspace">
        <SectionLabel className="px-2">Workspace</SectionLabel>
        <div className="mt-1.5 space-y-0.5">
          <NavItem
            icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
            label="Routines"
            active={isNavActive('routines')}
            onClick={() => onNavigate('/routines')}
            badge={routineCount}
          />
          <NavItem
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            label="Opportunities"
            active={isNavActive('opportunities')}
            onClick={() => onNavigate('/opportunities')}
          />
          <NavItem
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            label="Activity"
            active={isNavActive('activity')}
            onClick={() => onNavigate('/activity')}
            badge={pendingActivity > 0 ? pendingActivity : undefined}
            badgeTone="amber"
          />
          <NavItem
            icon={<Blocks className="h-4 w-4" aria-hidden="true" />}
            label="Plugin Marketplace"
            active={isNavActive('plugins')}
            onClick={() => onNavigate('/plugins')}
            badge={pluginCount}
          />
        </div>

        {/* Groups & projects tree */}
        <SectionLabel className="mt-5 px-2">Groups &amp; projects</SectionLabel>
        <div className="mt-1.5 space-y-1">
          {groups.map((group) => {
            const groupOpen = openGroups[group.id] ?? true
            const groupProjects = group.projectIds
              .map((id) => projects.find((p) => p.id === id))
              .filter((p): p is Project => Boolean(p))
            const groupTaskCount = groupProjects.reduce((n, p) => n + tasksFor(p.id).length, 0)
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setOpenGroups((s) => ({ ...s, [group.id]: !groupOpen }))}
                  aria-expanded={groupOpen}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-[#102642] hover:bg-[#eef2f5]"
                >
                  {groupOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
                  )}
                  <span className="truncate">{group.name}</span>
                  <span className="ml-auto rounded-full bg-[#eef2f5] px-1.5 text-[10px] font-medium text-[#5a7189]">
                    {groupTaskCount}
                  </span>
                </button>

                {groupOpen && (
                  <div className="ml-3 border-l border-[#dce5e9] pl-1.5">
                    {groupProjects.map((project) => {
                      const open = openProjects[project.id] ?? activeProjectId === project.id
                      const pTasks = tasksFor(project.id)
                      const isActiveProject = activeProjectId === project.id
                      return (
                        <div key={project.id}>
                          <div
                            className={cn(
                              'group flex items-center gap-1.5 rounded-lg pr-1',
                              isActiveProject ? 'bg-[#e2f4ed]' : 'hover:bg-[#eef2f5]',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => onNavigate(`/project/${project.id}`)}
                              aria-current={isActiveProject ? 'page' : undefined}
                              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-[#102642]"
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-[3px]"
                                style={{ background: project.color }}
                                aria-hidden="true"
                              />
                              <span className="truncate">{project.name}</span>
                              {pTasks.length > 0 && (
                                <span className="ml-auto text-[10px] text-[#8ba0b3]">{pTasks.length}</span>
                              )}
                            </button>
                            {pTasks.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenProjects((s) => ({ ...s, [project.id]: !(open ?? false) }))
                                }
                                aria-label={`${open ? 'Collapse' : 'Expand'} tasks in ${project.name}`}
                                aria-expanded={Boolean(open)}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8ba0b3] hover:bg-[#e2f4ed] hover:text-[#087d62]"
                              >
                                {open ? (
                                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            )}
                          </div>
                          {open && pTasks.length > 0 && (
                            <div className="ml-4 border-l border-[#dce5e9] pb-1 pl-1.5">
                              {pTasks.map((task) => {
                                const active = route.name === 'task' && route.id === task.id
                                return (
                                  <button
                                    key={task.id}
                                    type="button"
                                    onClick={() => onNavigate(`/task/${task.id}`)}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs',
                                      active
                                        ? 'bg-[#e2f4ed] font-medium text-[#087d62]'
                                        : 'text-[#5a7189] hover:bg-[#eef2f5] hover:text-[#102642]',
                                    )}
                                  >
                                    {taskDot(task)}
                                    <span className="truncate">{task.title}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* Settings + account */}
      <div className="border-t border-[#dce5e9] px-3 py-3">
        <NavItem
          icon={<Settings className="h-4 w-4" aria-hidden="true" />}
          label="Settings"
          active={isNavActive('settings')}
          onClick={() => onNavigate('/settings')}
        />
        <button
          type="button"
          onClick={() => onNavigate('/settings')}
          aria-label={`Account · model ${modelName}. Open settings`}
          className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[#eef2f5]"
        >
          <Avatar initials="PO" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[#102642]">PaySwap Ops</span>
            <span className="block truncate font-mono text-[11px] tabular-nums text-[#8ba0b3]">{modelName}</span>
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  badge,
  badgeTone = 'slate',
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: number
  badgeTone?: 'slate' | 'amber'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition-colors',
        active
          ? 'bg-[#e2f4ed] font-medium text-[#087d62]'
          : 'text-[#5a7189] hover:bg-[#eef2f5] hover:text-[#102642]',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {typeof badge === 'number' && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[10px] font-medium',
            badgeTone === 'amber'
              ? 'bg-[#fdf1df] text-[#b45309]'
              : active
                ? 'bg-white/70 text-[#087d62]'
                : 'bg-[#eef2f5] text-[#5a7189]',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

export function Sidebar(props: SidebarProps) {
  const body = <SidebarBody {...props} onCloseMobile={props.onCloseMobile} />
  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:block md:shrink-0">{body}</aside>

      {/* Mobile drawer */}
      {props.mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Workspace navigation">
          <div className="absolute inset-0 bg-[#0b2b3d]/40" onClick={props.onCloseMobile} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 animate-in slide-in-from-left duration-200">{body}</div>
        </div>
      )}
    </>
  )
}
