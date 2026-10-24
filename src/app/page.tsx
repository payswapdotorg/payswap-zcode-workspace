'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Menu, PanelLeftClose, PanelLeftOpen, Plus, SquareTerminal, Wallet } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { routeToKey, useHashRoute } from '@/hooks/use-hash-route'
import { streamRun } from '@/lib/agent-client'
import {
  DEFAULT_SETTINGS,
  type ApprovalView,
  type AgentStep,
  type Opportunity,
  type PaymentChoice,
  type PaySettings,
  type Routine,
  type RoutinePublishInput,
  type RoutineRunState,
  type TaskDTO,
  type TaskOrigin,
} from '@/lib/agent-types'
import {
  channels as seedChannels,
  formatMoney,
  groups,
  projects,
  seedPlugins,
  uid,
  type Plugin,
  type Task as PayTask,
} from '@/lib/paydata'
import { C } from '@/components/paydesk/bits'
import { Sidebar } from '@/components/paydesk/sidebar'
import { HomeSections } from '@/components/paydesk/view-home'
import { NewTaskView, TaskView } from '@/components/paydesk/view-task'
import { TerminalPane } from '@/components/paydesk/zcode-terminal'
import { RoutinesView } from '@/components/paydesk/view-routines'
import { OpportunitiesView } from '@/components/paydesk/view-opportunities'
import { PluginsView } from '@/components/paydesk/view-plugins'
import { ProjectView } from '@/components/paydesk/view-project'
import { SettingsView } from '@/components/paydesk/view-settings'
import { ActivityView } from '@/components/paydesk/view-activity'

const PROJECT_BALANCE = 128420.18
/** Goals started outside any project land here so they stay visible in the tree. */
const DIRECT_PROJECT_ID = 'direct-goals'
const DIRECT_PROJECT: import('@/lib/paydata').Project = {
  id: DIRECT_PROJECT_ID,
  name: 'Direct goals',
  groupId: groups[0]?.id ?? 'g1',
  color: '#29c29a',
  description: 'Economic goals started straight from the task page',
  volume30d: 0,
  successRate: 100,
}

interface BrowserState {
  open: boolean
  url: string | null
}

export default function Page() {
  const { route, navigate } = useHashRoute()
  const { toast } = useToast()

  const [mobileNav, setMobileNav] = useState(false)
  const [tasks, setTasks] = useState<TaskDTO[]>([])
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState<PaySettings>(DEFAULT_SETTINGS)
  const [approvals, setApprovals] = useState<ApprovalView[]>([])
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>(seedPlugins)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Record<string, Routine[]>>({})
  const [browser, setBrowser] = useState<Record<string, BrowserState>>({})
  const [seed, setSeed] = useState<{ text: string; projectId: string | null; key: number; browser: boolean }>({
    text: '',
    projectId: null,
    key: 0,
    browser: false,
  })
  // Dockable workspace panes: terminal side pane / full-window states, browser
  // full-window state, and a hideable sidebar so any view can occupy the window.
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalSolo, setTerminalSolo] = useState(false)
  const [browserSolo, setBrowserSolo] = useState(false)
  const [sidebarHidden, setSidebarHidden] = useState(false)

  const runningRef = useRef<Set<string>>(new Set())
  const [runningTick, setRunningTick] = useState(0)
  const scrollRef = useRef<HTMLElement>(null)
  const routeKey = routeToKey(route)

  /* ---------------------------------------------------------------- */
  /* Data bootstrap                                                    */
  /* ---------------------------------------------------------------- */

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks')
      if (!res.ok) throw new Error(`tasks ${res.status}`)
      const data = (await res.json()) as { tasks: TaskDTO[] }
      setTasks(data.tasks)
      // A task waiting on a merchant checkout reopens the simulated browser so the
      // gate stays reachable after a reload.
      setBrowser((prev) => {
        const next = { ...prev }
        for (const t of data.tasks) {
          const openGate = (t.gates ?? []).find((g) => g.status === 'open' || g.status === 'processing')
          if (openGate && !next[t.id]?.open) next[t.id] = { open: true, url: openGate.checkout.url }
        }
        return next
      })
    } catch (err) {
      console.error('Failed to load tasks', err)
    } finally {
      setLoaded(true)
    }
  }, [])

  const refreshApprovals = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals')
      if (!res.ok) return
      const data = (await res.json()) as { approvals: ApprovalView[] }
      setApprovals(data.approvals)
    } catch {
      // non-fatal
    }
  }, [])

  const refreshRoutines = useCallback(async () => {
    try {
      const res = await fetch('/api/routines')
      if (!res.ok) return
      const data = (await res.json()) as { routines: Routine[] }
      setRoutines(data.routines)
    } catch {
      // non-fatal
    }
  }, [])

  const refreshOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/opportunities')
      if (!res.ok) return
      const data = (await res.json()) as { opportunities: Opportunity[] }
      setOpportunities(data.opportunities)
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    void refreshTasks()
    void refreshApprovals()
    void refreshRoutines()
    void refreshOpportunities()
    void fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settings?: PaySettings } | null) => {
        if (d?.settings) setSettings((prev) => ({ ...prev, ...d.settings }))
      })
      .catch(() => {})
  }, [refreshTasks, refreshApprovals, refreshRoutines, refreshOpportunities])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [routeKey])

  // Keep pending approvals + node bids fresh.
  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshApprovals()
      void refreshOpportunities()
    }, 8_000)
    return () => window.clearInterval(id)
  }, [refreshApprovals, refreshOpportunities])

  // Reconcile server-side run state when no client stream is attached.
  const hasRunningTask = tasks.some((t) => t.status === 'running')
  useEffect(() => {
    const id = window.setInterval(() => {
      if (runningRef.current.size > 0) return
      if (!hasRunningTask) return
      void refreshTasks()
      void refreshApprovals()
    }, 5_000)
    return () => window.clearInterval(id)
  }, [refreshTasks, refreshApprovals, hasRunningTask])

  const handleNavigate = (to: string) => {
    navigate(to)
    setMobileNav(false)
    setBrowserSolo(false)
  }

  /* ---------------------------------------------------------------- */
  /* Agent runtime — routine loading, todos, gates (real backend)      */
  /* ---------------------------------------------------------------- */

  const patchTask = (taskId: string, fn: (t: TaskDTO) => TaskDTO) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? fn(t) : t)))
  }

  const upsertRoutine = (taskId: string, routine: RoutineRunState) => {
    patchTask(taskId, (t) => ({ ...t, routine }))
  }

  const runAgent = useCallback(
    async (taskId: string, message?: string, routineId?: string) => {
      runningRef.current.add(taskId)
      setRunningTick((n) => n + 1)
      patchTask(taskId, (t) => ({ ...t, status: 'running' }))
      let agentMessageAdded = false

      const ensureAgentMessage = () => {
        if (agentMessageAdded) return
        agentMessageAdded = true
        patchTask(taskId, (t) => ({
          ...t,
          messages: [
            ...t.messages,
            { id: `run-${taskId}`, role: 'agent' as const, content: '', steps: [], at: new Date().toISOString() },
          ],
        }))
      }

      try {
        await streamRun({
          taskId,
          message,
          routineId,
          onEvent: (event) => {
            if (event.type === 'step') {
              ensureAgentMessage()
              patchTask(taskId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === `run-${taskId}`
                    ? {
                        ...m,
                        steps: (() => {
                          const steps = [...(m.steps ?? [])]
                          const i = steps.findIndex((s) => s.id === event.step.id)
                          if (i >= 0) steps[i] = event.step
                          else steps.push(event.step)
                          return steps as AgentStep[]
                        })(),
                      }
                    : m,
                ),
              }))
            } else if (event.type === 'message') {
              ensureAgentMessage()
              patchTask(taskId, (t) => ({
                ...t,
                messages: t.messages.map((m) =>
                  m.id === `run-${taskId}`
                    ? { ...m, content: m.content ? `${m.content}\n\n${event.content}` : event.content }
                    : m,
                ),
              }))
            } else if (event.type === 'routine') {
              upsertRoutine(taskId, event.routine)
            } else if (event.type === 'routine_step') {
              patchTask(taskId, (t) => {
                if (!t.routine) return t
                const steps = t.routine.steps.map((s, i) =>
                  i === event.stepIndex ? { ...s, status: event.status, detail: event.detail ?? s.detail } : s,
                )
                return { ...t, routine: { ...t.routine, steps } }
              })
            } else if (event.type === 'candidates') {
              setCandidates((prev) => ({ ...prev, [taskId]: event.candidates }))
            } else if (event.type === 'open_browser') {
              setBrowser((prev) => ({ ...prev, [taskId]: { open: true, url: event.url } }))
            } else if (event.type === 'checkout') {
              patchTask(taskId, (t) => {
                const gates = [...(t.gates ?? [])]
                const i = gates.findIndex((g) => g.gateId === event.gate.gateId)
                if (i >= 0) gates[i] = event.gate
                else gates.push(event.gate)
                return { ...t, gates }
              })
            } else if (event.type === 'payment_receipt') {
              patchTask(taskId, (t) => ({
                ...t,
                gates: (t.gates ?? []).map((g) =>
                  g.gateId === event.gateId ? { ...g, status: 'settled', receipt: event.receipt } : g,
                ),
              }))
            } else if (event.type === 'opportunity') {
              void refreshOpportunities()
              toast({
                title: 'Opportunity broadcast to PaySwap nodes',
                description: `${event.opportunity.title} — nodes are bidding now.`,
              })
            } else if (event.type === 'approval') {
              setApprovals((prev) => {
                const i = prev.findIndex((a) => a.id === event.approval.id)
                const next = [...prev]
                if (i >= 0) next[i] = event.approval
                else next.unshift(event.approval)
                return next
              })
            } else if (event.type === 'approval_resolved') {
              setApprovals((prev) =>
                prev.map((a) => (a.id === event.approvalId ? { ...a, status: event.decision } : a)),
              )
            } else if (event.type === 'done') {
              patchTask(taskId, (t) => ({ ...t, status: event.status === 'completed' ? 'completed' : 'failed' }))
              void refreshTasks()
              void refreshApprovals()
              void refreshRoutines()
            } else if (event.type === 'error') {
              toast({ title: 'Agent run error', description: event.message })
            }
          },
        })
      } catch (err) {
        toast({
          title: 'Could not reach the agent runtime',
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        runningRef.current.delete(taskId)
        setRunningTick((n) => n + 1)
      }
    },
    [refreshApprovals, refreshOpportunities, refreshRoutines, refreshTasks, toast],
  )

  const startTask = (text: string, projectId: string | null, origin?: TaskOrigin) => {
    void (async () => {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, projectId, origin }),
        })
        if (!res.ok) throw new Error(`task create failed (${res.status})`)
        const data = (await res.json()) as { task: TaskDTO }
        setTasks((prev) => [data.task, ...prev])
        setSeed({ text: '', projectId: null, key: Date.now(), browser: false })
        setCandidates((prev) => {
          const next = { ...prev }
          delete next[data.task.id]
          return next
        })
        if (origin) setBrowser((prev) => ({ ...prev, [data.task.id]: { open: true, url: origin.url } }))
        navigate(`/task/${data.task.id}`)
        toast({ title: 'Goal received', description: 'The agent is loading a routine to fulfill it.' })
        void runAgent(data.task.id)
      } catch (err) {
        toast({
          title: 'Could not start the task',
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    })()
  }

  const followUp = (taskId: string, text: string) => {
    patchTask(taskId, (t) => ({
      ...t,
      status: 'running',
      messages: [...t.messages, { id: uid('m'), role: 'user', content: text, at: new Date().toISOString() }],
    }))
    void runAgent(taskId, text)
  }

  /* ---------------------------------------------------------------- */
  /* Routine choice + payment gates                                    */
  /* ---------------------------------------------------------------- */

  const selectRoutine = (taskId: string, routineId: string) => {
    setCandidates((prev) => {
      const next = { ...prev }
      delete next[taskId]
      return next
    })
    void runAgent(taskId, undefined, routineId)
  }

  const agentDecideRoutine = (taskId: string) => {
    const list = candidates[taskId] ?? []
    // The runtime orders candidates by goal relevance (keyword fit, then rating),
    // so the agent's pick is the first match — e.g. a lending routine for "borrow".
    const best = list[0]
    if (!best) return
    toast({ title: 'Agent chose a routine', description: `${best.name} — best fit for this goal.` })
    selectRoutine(taskId, best.id)
  }

  const payGate = (taskId: string, gateId: string, choice: PaymentChoice) => {
    patchTask(taskId, (t) => ({
      ...t,
      gates: (t.gates ?? []).map((g) => (g.gateId === gateId ? { ...g, status: 'processing' } : g)),
    }))
    void fetch('/api/checkout/pay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, gateId, choice }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`payment failed (${res.status})`)
        const data = (await res.json()) as { receipt: { ref: string; railLabel: string } }
        toast({ title: 'Payment settled', description: `${data.receipt.ref} · ${data.receipt.railLabel}` })
        void refreshTasks()
        void refreshOpportunities()
      })
      .catch((err: unknown) => {
        patchTask(taskId, (t) => ({
          ...t,
          gates: (t.gates ?? []).map((g) => (g.gateId === gateId ? { ...g, status: 'open' } : g)),
        }))
        toast({
          title: 'Payment could not settle',
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      })
  }

  /* ---------------------------------------------------------------- */
  /* Approvals                                                         */
  /* ---------------------------------------------------------------- */

  const decideApproval = (id: string, decision: 'approved' | 'denied') => {
    setDecidingId(id)
    void fetch(`/api/approvals/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`decision failed (${res.status})`)
        setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: decision } : a)))
        toast({
          title: decision === 'approved' ? 'Approval granted' : 'Approval denied',
          description:
            decision === 'approved'
              ? 'The agent will proceed immediately; the mandate is recorded in the audit trail.'
              : 'The run will stop safely — nothing was executed.',
        })
      })
      .catch((err: unknown) => {
        toast({
          title: 'Could not record the decision',
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      })
      .finally(() => setDecidingId(null))
  }

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  const patchSettings = (patch: Partial<PaySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    void fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: patch }),
    }).catch(() => {})
  }

  /* ---------------------------------------------------------------- */
  /* Routines + opportunities + plugins actions                        */
  /* ---------------------------------------------------------------- */

  const patchRoutine = async (id: string, body: { installed?: boolean; userScore?: number }, okMsg: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/routines/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`routine update failed (${res.status})`)
      const data = (await res.json()) as { routine: Routine }
      setRoutines((prev) => prev.map((r) => (r.id === id ? data.routine : r)))
      toast({ title: okMsg })
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusyId(null)
    }
  }

  const installRoutine = (id: string) => void patchRoutine(id, { installed: true }, 'Routine installed')
  const uninstallRoutine = (id: string) => void patchRoutine(id, { installed: false }, 'Routine uninstalled')
  const rateRoutine = (id: string, score: number) =>
    void patchRoutine(id, { userScore: score }, 'Rating recorded — thanks for the signal')

  const publishRoutine = (input: RoutinePublishInput) => {
    void (async () => {
      setBusyId('publish')
      try {
        const res = await fetch('/api/routines', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
        if (!res.ok) throw new Error(`publish failed (${res.status})`)
        await refreshRoutines()
        toast({
          title: 'Submitted for review',
          description: `${input.name} is now pending PaySwap acceptance.`,
        })
      } catch (err) {
        toast({ title: 'Could not publish', description: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        setBusyId(null)
      }
    })()
  }

  const bidOpportunity = (id: string) => {
    void (async () => {
      setBusyId(id)
      try {
        const res = await fetch(`/api/opportunities/${id}/bid`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error(`bid failed (${res.status})`)
        const data = (await res.json()) as { opportunity: Opportunity }
        setOpportunities((prev) => prev.map((o) => (o.id === id ? data.opportunity : o)))
        toast({ title: 'Bid placed', description: 'your-node joined the bidding.' })
      } catch (err) {
        toast({ title: 'Bid failed', description: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        setBusyId(null)
      }
    })()
  }

  const awardOpportunity = (id: string, bidId?: string) => {
    void (async () => {
      setBusyId(id)
      try {
        const res = await fetch(`/api/opportunities/${id}/award`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bidId }),
        })
        if (!res.ok) throw new Error(`award failed (${res.status})`)
        const data = (await res.json()) as { opportunity: Opportunity }
        setOpportunities((prev) => prev.map((o) => (o.id === id ? data.opportunity : o)))
        toast({ title: 'Opportunity awarded', description: `Route won by ${data.opportunity.awardedNodeId}.` })
      } catch (err) {
        toast({ title: 'Award failed', description: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        setBusyId(null)
      }
    })()
  }

  const togglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        toast({
          title: p.installed ? 'Plugin uninstalled' : 'Plugin installed',
          description: p.installed
            ? `${p.name} tool calls are no longer available to the agent.`
            : `${p.name} is now available as a tool call.`,
        })
        return { ...p, installed: !p.installed }
      }),
    )
  }

  /* ---------------------------------------------------------------- */
  /* Derived view props                                                */
  /* ---------------------------------------------------------------- */

  const isRunning = (id: string) => runningRef.current.has(id) || tasks.find((t) => t.id === id)?.status === 'running'
  void runningTick

  const currentTask = route.name === 'task' ? tasks.find((t) => t.id === route.id) : undefined
  const currentProject =
    route.name === 'project'
      ? projects.find((p) => p.id === route.id)
      : currentTask?.projectId
        ? projects.find((p) => p.id === currentTask.projectId)
        : undefined
  const pendingCount = approvals.filter((a) => a.status === 'pending').length

  const breadcrumb = (() => {
    switch (route.name) {
      case 'home':
        return [{ label: 'New task' }]
      case 'new':
        return [{ label: 'New task' }]
      case 'routines':
      case 'automations':
        return [{ label: 'Routines' }]
      case 'opportunities':
        return [{ label: 'Opportunities' }]
      case 'plugins':
        return [{ label: 'Plugin Marketplace' }]
      case 'connections':
      case 'checkout':
      case 'approvals':
      case 'settings':
        return [{ label: 'Settings' }]
      case 'activity':
        return [{ label: 'Activity' }]
      case 'project':
        return [{ label: 'Workspace', to: '/' }, { label: currentProject?.name ?? 'Project' }]
      case 'task':
        return [
          { label: 'Workspace', to: '/' },
          ...(currentProject ? [{ label: currentProject.name, to: `/project/${currentProject.id}` }] : []),
          { label: currentTask?.title ?? 'Task' },
        ]
      default:
        return [{ label: 'New task' }]
    }
  })()

  /* Paydata Task shim for views that expect the legacy shape. */
  const toPayTasks = (list: TaskDTO[]): PayTask[] =>
    list.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId ?? DIRECT_PROJECT_ID,
      status: t.status === 'running' ? 'running' : 'completed',
      createdAt: new Date(t.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      messages: [],
    }))

  const sidebarProjects = [...projects, DIRECT_PROJECT]
  const sidebarGroups = groups.map((g, i) =>
    i === 0 ? { ...g, projectIds: [...g.projectIds, DIRECT_PROJECT_ID] } : g,
  )

  const browserFor = (taskId: string): BrowserState => browser[taskId] ?? { open: false, url: null }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f6f9fa] text-[#102642]">
      {!sidebarHidden && (
        <Sidebar
          route={route}
          onNavigate={handleNavigate}
          groups={sidebarGroups}
          projects={sidebarProjects}
          tasks={toPayTasks(tasks)}
          routineCount={routines.filter((r) => r.installed).length}
          pluginCount={plugins.filter((p) => p.installed).length}
          pendingActivity={pendingCount}
          mobileOpen={mobileNav}
          onCloseMobile={() => setMobileNav(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#dce5e9] bg-white/85 px-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[#5a7189] hover:bg-[#f6f9fa] md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="sidebar-collapse"
            onClick={() => setSidebarHidden((v) => !v)}
            aria-label={sidebarHidden ? 'Show workspace sidebar' : 'Hide sidebar — view occupies full window'}
            aria-pressed={sidebarHidden}
            title={sidebarHidden ? 'Show sidebar' : 'Occupy full window'}
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642] md:inline-flex"
          >
            {sidebarHidden ? (
              <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            data-testid="terminal-toggle"
            aria-pressed={terminalOpen}
            onClick={() => {
              setTerminalOpen((v) => !v)
              setTerminalSolo(false)
            }}
            aria-label={terminalOpen ? 'Close terminal' : 'Open terminal'}
            title={terminalOpen ? 'Close terminal' : 'Open terminal'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#5a7189] hover:bg-[#f6f9fa] hover:text-[#102642]"
          >
            <SquareTerminal className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
            {breadcrumb.map((crumb, i) => {
              const isLast = i === breadcrumb.length - 1
              return (
                <span
                  key={`${crumb.label}-${i}`}
                  className={`flex min-w-0 items-center gap-1 ${isLast ? '' : 'hidden sm:flex'}`}
                >
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c3d0da]" aria-hidden="true" />}
                  {crumb.to ? (
                    <button
                      type="button"
                      onClick={() => handleNavigate(crumb.to!)}
                      className="shrink-0 text-[#5a7189] hover:text-[#087d62]"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="min-w-0 truncate font-medium text-[#102642]">{crumb.label}</span>
                  )}
                </span>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex"
              style={{
                background: settings.environment === 'sandbox' ? '#e0f5f0' : '#fdf1df',
                color: settings.environment === 'sandbox' ? '#0c7d64' : '#b45309',
              }}
            >
              {settings.environment} enforced
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[#dce5e9] bg-white px-3 py-1.5 text-[12px] text-[#5a7189] lg:inline-flex">
              <Wallet className="h-3.5 w-3.5 text-[#087d62]" aria-hidden="true" />
              <span className="font-mono tabular-nums text-[#102642]">{formatMoney(PROJECT_BALANCE)}</span>
              <span className="hidden text-[#8ba0b3] xl:inline">float balance</span>
            </span>
            <button
              type="button"
              onClick={() => handleNavigate('/new')}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white"
              style={{ background: C.green }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">New task</span>
            </button>
          </div>
        </header>

        {/* Views — dock row so terminal can share or occupy the full window */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {route.name === 'task' ? (
            <main ref={scrollRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
              {currentTask ? (
                <TaskView
                  key={currentTask.id}
                  task={currentTask}
                  project={currentProject ?? null}
                  running={isRunning(currentTask.id)}
                  approvals={approvals}
                  decidingId={decidingId}
                  candidates={candidates[currentTask.id] ?? null}
                  browserOpen={browserFor(currentTask.id).open}
                  browserUrl={browserFor(currentTask.id).url}
                  browserSolo={browserSolo}
                  onBrowserSolo={() => setBrowserSolo((v) => !v)}
                  onSend={(text) => followUp(currentTask.id, text)}
                  onDecideApproval={decideApproval}
                  onOpenProject={(id) => handleNavigate(`/project/${id}`)}
                  onOpenTask={(taskId) => handleNavigate(`/task/${taskId}`)}
                  onSelectRoutine={(routineId) => selectRoutine(currentTask.id, routineId)}
                  onAgentDecide={() => agentDecideRoutine(currentTask.id)}
                  onPayGate={(gateId, choice) => payGate(currentTask.id, gateId, choice)}
                  onCloseBrowser={() => {
                    setBrowser((prev) => ({ ...prev, [currentTask.id]: { open: false, url: null } }))
                    setBrowserSolo(false)
                  }}
                  onGoalFromBrowser={(text, origin) => startTask(text, null, origin)}
                />
              ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-[#5a7189]">
                  {loaded ? 'This task no longer exists.' : 'Loading workspace…'}
                </p>
                {loaded && (
                  <button
                    type="button"
                    onClick={() => handleNavigate('/')}
                    className="rounded-full px-4 py-2 text-[13px] font-medium text-white"
                    style={{ background: C.green }}
                  >
                    Back to overview
                  </button>
                )}
              </div>
            )}
          </main>
        ) : (
          <main ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {/* The app opens on the New task page — home widgets merged below the composer */}
            {(route.name === 'home' || route.name === 'new') && (
              <div className="h-full min-h-0">
                <NewTaskView
                  key={seed.key}
                  initialText={seed.text}
                  project={seed.projectId ? (projects.find((p) => p.id === seed.projectId) ?? null) : null}
                  onSend={(text) => startTask(text, seed.projectId)}
                  browserOpen={seed.browser}
                  onToggleBrowser={() => setSeed((prev) => ({ ...prev, browser: !prev.browser }))}
                  onGoalFromBrowser={(text, origin) => startTask(text, null, origin)}
                  browserSolo={browserSolo}
                  onBrowserSolo={() => setBrowserSolo((v) => !v)}
                >
                  <HomeSections
                    tasks={tasks}
                    routines={routines}
                    opportunities={opportunities}
                    onOpenTask={(id) => handleNavigate(`/task/${id}`)}
                    onOpenRoutines={() => handleNavigate('/routines')}
                    onOpenOpportunities={() => handleNavigate('/opportunities')}
                  />
                </NewTaskView>
              </div>
            )}
            {(route.name === 'routines' || route.name === 'automations') && (
              <RoutinesView
                routines={routines}
                busyId={busyId}
                onInstall={installRoutine}
                onUninstall={uninstallRoutine}
                onRate={rateRoutine}
                onPublish={publishRoutine}
                onUseInNewTask={(r) => {
                  setSeed({ text: `Use the "${r.name}" routine`, projectId: null, key: Date.now(), browser: false })
                  handleNavigate('/new')
                }}
              />
            )}
            {route.name === 'opportunities' && (
              <OpportunitiesView
                opportunities={opportunities}
                busyId={busyId}
                onBid={bidOpportunity}
                onAward={(id, bidId) => awardOpportunity(id, bidId)}
                onOpenTask={(taskId) => handleNavigate(`/task/${taskId}`)}
              />
            )}
            {route.name === 'plugins' && <PluginsView plugins={plugins} onToggle={togglePlugin} />}
            {(route.name === 'connections' || route.name === 'checkout' || route.name === 'approvals' || route.name === 'settings') && (
              <SettingsView settings={settings} onPatch={patchSettings} onNavigate={handleNavigate} />
            )}
            {route.name === 'activity' && (
              <ActivityViewContainer onNewTask={(text) => {
                setSeed({ text, projectId: null, key: Date.now(), browser: false })
                handleNavigate('/new')
              }} />
            )}
            {route.name === 'project' &&
              (currentProject ? (
                <ProjectView
                  project={currentProject}
                  group={groups.find((g) => g.id === currentProject.groupId) ?? null}
                  tasks={toPayTasks(tasks).filter((t) => t.projectId === currentProject.id)}
                  channels={seedChannels}
                  automations={[]}
                  onOpenTask={(id) => handleNavigate(`/task/${id}`)}
                  onNewTask={(projectId) => {
                    setSeed({ text: '', projectId, key: Date.now(), browser: false })
                    handleNavigate('/new')
                  }}
                />
              ) : (
                <div className="p-8 text-center text-sm text-[#5a7189]">Project not found.</div>
              ))}
          </main>
        )}

          {/* Docked terminal — shares the window with the active view */}
          {terminalOpen && !terminalSolo && (
            <aside
              className="hidden h-full w-[440px] shrink-0 border-l border-[#dce5e9] bg-white lg:flex"
              aria-label="Terminal"
            >
              <TerminalPane
                solo={false}
                onToggleSolo={() => setTerminalSolo(true)}
                onClose={() => {
                  setTerminalOpen(false)
                  setTerminalSolo(false)
                }}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Terminal occupying the full window */}
      {terminalOpen && terminalSolo && (
        <div className="fixed inset-0 z-[60] bg-white" role="dialog" aria-label="Terminal full window">
          <TerminalPane
            solo
            onToggleSolo={() => setTerminalSolo(false)}
            onClose={() => {
              setTerminalOpen(false)
              setTerminalSolo(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Loads activity data for the Activity view. */
function ActivityViewContainer({ onNewTask }: { onNewTask: (text: string) => void }) {
  const [data, setData] = useState<{
    ledger: import('@/lib/agent-types').LedgerRow[]
    approvals: import('@/lib/agent-types').ApprovalView[]
  } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void fetch('/api/activity')
      .then((r) => {
        if (!r.ok) throw new Error(`activity ${r.status}`)
        return r.json() as Promise<{
          ledger: import('@/lib/agent-types').LedgerRow[]
          approvals: import('@/lib/agent-types').ApprovalView[]
        }>
      })
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
  }, [])

  if (error) return <div className="p-8 text-center text-sm text-[#b45309]">{error}</div>
  if (!data)
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[#8ba0b3]" aria-live="polite">
        Loading protocol records…
      </div>
    )
  return <ActivityView ledger={data.ledger} approvals={data.approvals} onNewTask={onNewTask} />
}
