/**
 * Opportunity board service — economic intents broadcast to PaySwap nodes.
 * Nodes bid on routing / liquidity / fx / payout intents; the broadcaster
 * (agent task or user) awards a bid. Includes a deterministic auto-bid
 * simulation so open opportunities accumulate competing node bids over time.
 */

import { db } from '@/lib/db'
import type { Opportunity, OpportunityBid, OpportunityKind } from '@/lib/agent-types'
import { ensureOpportunitiesSeeded } from '@/server/seed-econ'

/* ------------------------------------------------------------------ */
/* Node pool (deterministic simulation universe)                       */
/* ------------------------------------------------------------------ */

export const NODE_POOL = [
  { node: 'Accra-Node-7', region: 'Accra' },
  { node: 'Kumasi-Liquidity', region: 'Kumasi' },
  { node: 'Tema-FX-2', region: 'Tema' },
  { node: 'Base-USDC-MM', region: 'Global' },
] as const

/* ------------------------------------------------------------------ */
/* Mapping                                                             */
/* ------------------------------------------------------------------ */

type OpportunityRow = {
  id: string
  title: string
  kind: string
  intentSummary: string
  amount: number
  currency: string
  rewardBps: number
  createdByTaskId: string | null
  createdByTaskTitle: string | null
  status: string
  awardedNodeId: string | null
  expiresAt: Date
  createdAt: Date
  bids: {
    id: string
    node: string
    region: string
    feeBps: number
    etaMinutes: number
    nodeRating: number
    createdAt: Date
  }[]
}

function toBid(b: {
  id: string
  node: string
  region: string
  feeBps: number
  etaMinutes: number
  nodeRating: number
  createdAt: Date
}): OpportunityBid {
  return {
    id: b.id,
    node: b.node,
    region: b.region,
    feeBps: b.feeBps,
    etaMinutes: b.etaMinutes,
    nodeRating: b.nodeRating,
    createdAt: b.createdAt.toISOString(),
  }
}

export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as OpportunityKind,
    intentSummary: row.intentSummary,
    amount: row.amount,
    currency: row.currency,
    rewardBps: row.rewardBps,
    createdByTaskId: row.createdByTaskId,
    createdByTaskTitle: row.createdByTaskTitle,
    status: row.status as Opportunity['status'],
    awardedNodeId: row.awardedNodeId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    bids: [...row.bids].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(toBid),
  }
}

/* ------------------------------------------------------------------ */
/* Listing + deterministic auto-bid simulation                         */
/* ------------------------------------------------------------------ */

/** Stable string hash (djb2) used to make the sim deterministic per record. */
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

export async function listOpportunities(): Promise<Opportunity[]> {
  await ensureOpportunitiesSeeded()
  await runAutoBidSimulation()
  const rows = await db.opportunity.findMany({
    orderBy: { createdAt: 'desc' },
    include: { bids: true },
  })
  return rows.map(toOpportunity)
}

/**
 * Auto-bid sim: any open opportunity with fewer than 3 bids and older than
 * 8 seconds picks up 1-2 additional node bids (deterministic, no duplicates).
 */
async function runAutoBidSimulation(): Promise<void> {
  const cutoff = Date.now() - 8_000
  const open = await db.opportunity.findMany({
    where: { status: 'open' },
    include: { bids: true },
  })
  for (const opp of open) {
    if (opp.bids.length >= 3) continue
    if (opp.createdAt.getTime() > cutoff) continue
    const h = hash(`${opp.id}:${opp.bids.length}`)
    const add = 1 + (h % 2) // 1 or 2 bids per pass
    const taken = new Set(opp.bids.map((b) => b.node))
    for (let i = 0; i < add && opp.bids.length + i < 3; i++) {
      const start = (h + i * 3) % NODE_POOL.length
      let pick: (typeof NODE_POOL)[number] | null = null
      for (let k = 0; k < NODE_POOL.length; k++) {
        const cand = NODE_POOL[(start + k) % NODE_POOL.length]
        if (!taken.has(cand.node)) {
          pick = cand
          break
        }
      }
      if (!pick) break
      taken.add(pick.node)
      const seed = hash(`${opp.id}:${pick.node}`)
      const feeBps = 8 + (seed % 28) // 8-35
      const etaMinutes = 2 + ((seed >>> 3) % 44) // 2-45
      const nodeRating = Math.round((4.1 + ((seed >>> 7) % 9) * 0.1) * 10) / 10 // 4.1-4.9
      await db.opportunityBid.create({
        data: {
          opportunityId: opp.id,
          node: pick.node,
          region: pick.region,
          feeBps,
          etaMinutes,
          nodeRating,
        },
      })
    }
  }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export interface CreateOpportunityInput {
  title: string
  kind: OpportunityKind
  intentSummary: string
  amount: number
  currency: string
  rewardBps: number
  createdByTaskId?: string | null
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  let createdByTaskTitle: string | null = null
  if (input.createdByTaskId) {
    const task = await db.task.findUnique({ where: { id: input.createdByTaskId } })
    createdByTaskTitle = task?.title ?? null
  }
  const row = await db.opportunity.create({
    data: {
      title: input.title,
      kind: input.kind,
      intentSummary: input.intentSummary,
      amount: input.amount,
      currency: input.currency,
      rewardBps: input.rewardBps,
      createdByTaskId: input.createdByTaskId ?? null,
      createdByTaskTitle,
      status: 'open',
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
    include: { bids: true },
  })
  return toOpportunity(row)
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const row = await db.opportunity.findUnique({ where: { id }, include: { bids: true } })
  return row ? toOpportunity(row) : null
}

/** Append a bid; returns the updated opportunity or null if not found. */
export async function addBid(
  id: string,
  bid: { node: string; region: string; feeBps: number; etaMinutes: number; nodeRating: number },
): Promise<Opportunity | null> {
  const opp = await db.opportunity.findUnique({ where: { id } })
  if (!opp) return null
  await db.opportunityBid.create({
    data: { opportunityId: id, ...bid },
  })
  return getOpportunity(id)
}

/**
 * Bid on behalf of the viewer's own node ("your-node" — region Local,
 * feeBps 10, eta 5, rating 4.8). Optional node name override.
 */
export async function addYourBid(id: string, node?: string): Promise<Opportunity | null> {
  return addBid(id, {
    node: node?.trim() || 'your-node',
    region: 'Local',
    feeBps: 10,
    etaMinutes: 5,
    nodeRating: 4.8,
  })
}

/** Award: the given bid's node, else the lowest-fee bid. */
export async function awardOpportunity(id: string, bidId?: string): Promise<Opportunity | null> {
  const opp = await db.opportunity.findUnique({ where: { id }, include: { bids: true } })
  if (!opp) return null
  let winner = bidId ? opp.bids.find((b) => b.id === bidId) : undefined
  if (!winner && opp.bids.length > 0) {
    winner = [...opp.bids].sort((a, b) => a.feeBps - b.feeBps)[0]
  }
  const updated = await db.opportunity.update({
    where: { id },
    data: { status: 'awarded', awardedNodeId: winner?.node ?? null },
    include: { bids: true },
  })
  return toOpportunity(updated)
}

/**
 * Immediately inject `count` node bids (no duplicates) and award the
 * lowest-fee one. Used by the payswap_route checkout path.
 */
export async function fillBidsAndAward(id: string, count = 3): Promise<Opportunity | null> {
  const opp = await db.opportunity.findUnique({ where: { id }, include: { bids: true } })
  if (!opp) return null
  const taken = new Set(opp.bids.map((b) => b.node))
  const h = hash(id)
  let added = opp.bids.length
  for (let i = 0; i < NODE_POOL.length && added < count; i++) {
    const pick = NODE_POOL[(h + i) % NODE_POOL.length]
    if (taken.has(pick.node)) continue
    taken.add(pick.node)
    const seed = hash(`${id}:${pick.node}`)
    await db.opportunityBid.create({
      data: {
        opportunityId: id,
        node: pick.node,
        region: pick.region,
        feeBps: 8 + (seed % 28),
        etaMinutes: 2 + ((seed >>> 3) % 44),
        nodeRating: Math.round((4.1 + ((seed >>> 7) % 9) * 0.1) * 10) / 10,
      },
    })
    added++
  }
  return awardOpportunity(id)
}
