/**
 * Routine library service — publish, install, rate and list routines.
 * A routine is the playbook the agent loads to fulfill an economic intent.
 * Third-party publishes are gated by review status; ratings come from both
 * users and agent runs (agentScore is a rolling average).
 */

import { db } from '@/lib/db'
import type { Routine, RoutineCategory, RoutinePublishInput, RoutineRating, RoutineStep } from '@/lib/agent-types'
import { ensureRoutinesSeeded } from '@/server/seed-econ'

type RoutineRow = {
  id: string
  slug: string
  name: string
  publisher: string
  version: string
  description: string
  category: string
  merchant: boolean
  stepsJson: string
  userScore: number
  userCount: number
  agentScore: number
  agentCount: number
  installs: number
  status: string
  installed: boolean
  builtin: boolean
  keywordsJson: string
  updatedAt: Date
}

export function toRoutine(row: RoutineRow): Routine {
  let steps: RoutineStep[] = []
  let keywords: string[] = []
  try {
    steps = JSON.parse(row.stepsJson) as RoutineStep[]
  } catch {
    steps = []
  }
  try {
    keywords = JSON.parse(row.keywordsJson) as string[]
  } catch {
    keywords = []
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    publisher: row.publisher,
    version: row.version,
    description: row.description,
    category: row.category as RoutineCategory,
    merchant: row.merchant,
    steps,
    rating: {
      userScore: row.userScore,
      userCount: row.userCount,
      agentScore: row.agentScore,
      agentCount: row.agentCount,
    },
    installs: row.installs,
    status: row.status as Routine['status'],
    installed: row.installed,
    builtin: row.builtin,
    keywords,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listRoutines(): Promise<Routine[]> {
  await ensureRoutinesSeeded()
  const rows = await db.routine.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map(toRoutine)
}

export async function getRoutine(id: string): Promise<Routine | null> {
  const row = await db.routine.findUnique({ where: { id } })
  return row ? toRoutine(row) : null
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || `routine-${Date.now().toString(36)}`
}

/** Publish a third-party routine. Enters review as pending_review, uninstalled. */
export async function publishRoutine(input: RoutinePublishInput): Promise<Routine> {
  const name = input.name.trim()
  if (!name) throw new Error('name is required')
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    throw new Error('at least one step is required')
  }
  let slug = slugify(name)
  const clash = await db.routine.findUnique({ where: { slug } })
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`

  const row = await db.routine.create({
    data: {
      slug,
      name,
      publisher: input.publisher?.trim() || 'You',
      version: '0.1.0',
      description: input.description?.trim() ?? '',
      category: input.category,
      merchant: Boolean(input.merchant),
      stepsJson: JSON.stringify(input.steps),
      userScore: 0,
      userCount: 0,
      agentScore: 0,
      agentCount: 0,
      installs: 0,
      status: 'pending_review',
      installed: false,
      builtin: false,
      keywordsJson: JSON.stringify(deriveKeywords(input)),
    },
  })
  return toRoutine(row)
}

/** Cheap keyword derivation for published routines (title words + step nouns). */
function deriveKeywords(input: RoutinePublishInput): string[] {
  const words = `${input.name}`.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []
  const stop = new Set(['the', 'a', 'an', 'my', 'and', 'to', 'of', 'for', 'with'])
  const set = new Set(words.filter((w) => w.length > 2 && !stop.has(w)))
  for (const step of input.steps) {
    const stepWords = step.title.toLowerCase().match(/[a-z][a-z0-9-]+/g) ?? []
    if (stepWords[0] && stepWords[0].length > 2) set.add(stepWords[0])
  }
  return [...set].slice(0, 10)
}

export interface RoutinePatch {
  installed?: boolean
  userScore?: number
}

/** Install/uninstall and user rating (1-5, rolling average). */
export async function patchRoutine(id: string, patch: RoutinePatch): Promise<Routine | null> {
  const row = await db.routine.findUnique({ where: { id } })
  if (!row) return null

  const data: {
    installed?: boolean
    installs?: number
    userScore?: number
    userCount?: number
  } = {}

  if (typeof patch.installed === 'boolean') {
    data.installed = patch.installed
    // First-time installs tick the install counter.
    if (patch.installed && !row.installed) data.installs = row.installs + 1
  }

  const v = patch.userScore
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5) {
    const rating: RoutineRating = {
      userScore: row.userScore,
      userCount: row.userCount,
      agentScore: row.agentScore,
      agentCount: row.agentCount,
    }
    const nextCount = rating.userCount + 1
    data.userCount = nextCount
    data.userScore = Math.round(((rating.userScore * rating.userCount + v) / nextCount) * 100) / 100
  }

  const updated = await db.routine.update({ where: { id }, data })
  return toRoutine(updated)
}

/**
 * Rolling agent rating after a successful run. The sample sits in 4.3-4.9
 * (deterministic per routine) and pulls the average toward that band.
 */
export async function bumpAgentRating(id: string): Promise<void> {
  const row = await db.routine.findUnique({ where: { id } }).catch(() => null)
  if (!row) return
  let sample = 4.3
  for (let i = 0; i < id.length; i++) sample += (id.charCodeAt(i) % 7) * 0.01
  sample = Math.min(4.9, Math.max(4.3, sample))
  const nextCount = row.agentCount + 1
  const nextScore = (row.agentScore * row.agentCount + sample) / nextCount
  await db.routine
    .update({
      where: { id },
      data: {
        agentCount: nextCount,
        agentScore: Math.round(nextScore * 100) / 100,
      },
    })
    .catch(() => {})
}
