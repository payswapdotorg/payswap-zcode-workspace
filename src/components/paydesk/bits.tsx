'use client'

import { Check, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/paydata'

/* PaySwap palette (mirrors .theme-zai-light in packages/ui) */
export const C = {
  ink: '#102642',
  sub: '#5a7189',
  subtle: '#8ba0b3',
  border: '#dce5e9',
  panel: '#ffffff',
  canvas: '#f6f9fa',
  sidebar: '#f8fafb',
  mint: '#e2f4ed',
  mintBorder: '#bfe5d8',
  green: '#0b8b6c',
  greenDeep: '#087d62',
  navy: '#0b2b3d',
  teal: '#29c29a',
  amber: '#b45309',
  amberDot: '#f59e0b',
  red: '#b91c1c',
} as const

export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[10px]', className)}
      style={{ width: size, height: size, background: C.navy }}
      aria-hidden="true"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M13 6h5v5" stroke={C.teal} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 6l-6.5 6.5" stroke={C.teal} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M11 18H6v-5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 18l6.5-6.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export type PillTone = 'green' | 'amber' | 'red' | 'teal' | 'slate'

const pillStyles: Record<PillTone, { bg: string; fg: string }> = {
  green: { bg: '#e2f4ed', fg: '#087d62' },
  amber: { bg: '#fdf1df', fg: '#b45309' },
  red: { bg: '#fdeaea', fg: '#b91c1c' },
  teal: { bg: '#e0f5f0', fg: '#0c7d64' },
  slate: { bg: '#eef2f5', fg: '#5a7189' },
}

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone
  children: React.ReactNode
  className?: string
}) {
  const s = pillStyles[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
        className,
      )}
      style={{ background: s.bg, color: s.fg }}
    >
      {children}
    </span>
  )
}

export function Sparkline({
  points,
  stroke = C.green,
  className,
}: {
  points: number[]
  stroke?: string
  className?: string
}) {
  const w = 100
  const h = 30
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const pts = points
    .map((p, i) => `${(i / (points.length - 1)) * (w - 6) + 3},${h - 4 - ((p - min) / range) * (h - 10)}`)
    .join(' ')
  const last = pts.split(' ').pop()?.split(',') ?? ['0', '0']
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('h-8 w-24', className)}
      aria-hidden="true"
    >
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={stroke} />
    </svg>
  )
}

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{formatMoney(value)}</span>
}

export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'green',
  trend,
  footer,
}: {
  label: string
  value: React.ReactNode
  delta?: string
  deltaTone?: 'green' | 'red' | 'amber'
  trend?: number[]
  footer?: string
}) {
  const DeltaIcon = deltaTone === 'green' ? TrendingUp : TrendingDown
  const deltaColor = deltaTone === 'green' ? C.greenDeep : deltaTone === 'amber' ? C.amber : C.red
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#dce5e9] bg-white p-4">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[#5a7189]">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold text-[#102642]">{value}</p>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          {delta ? (
            <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: deltaColor }}>
              <DeltaIcon className="h-3 w-3" aria-hidden="true" />
              {delta}
            </span>
          ) : null}
          {footer ? <span className="truncate text-[#8ba0b3]">{footer}</span> : null}
        </div>
      </div>
      {trend ? <Sparkline points={trend} stroke={deltaTone === 'red' ? '#dc2626' : C.green} className="h-10 w-16 shrink-0" /> : null}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8ba0b3]',
        className,
      )}
    >
      {children}
    </p>
  )
}

export function AgentStepRow({ label, status }: { label: string; status: 'done' | 'running' | 'pending' }) {
  if (status === 'done') {
    return (
      <li className="flex items-center gap-2.5 text-[13px] text-[#087d62]">
        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full" style={{ background: '#e2f4ed' }}>
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
        </span>
        <span className="truncate font-mono text-xs">{label}</span>
      </li>
    )
  }
  if (status === 'running') {
    return (
      <li className="flex items-center gap-2.5 text-[13px] text-[#102642]">
        <span className="relative flex h-4.5 w-4.5 shrink-0 items-center justify-center">
          <span className="absolute h-2 w-2 animate-ping rounded-full opacity-60" style={{ background: C.amberDot }} />
          <span className="h-2 w-2 rounded-full" style={{ background: C.amberDot }} />
        </span>
        <span className="truncate font-mono text-xs">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-[#8ba0b3]">running</span>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2.5 text-[13px] text-[#8ba0b3]">
      <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center">
        <span className="h-2 w-2 rounded-full border border-[#c3d0da]" />
      </span>
      <span className="truncate font-mono text-xs">{label}</span>
    </li>
  )
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
        className,
      )}
      style={{ background: C.mint, color: C.greenDeep }}
    >
      {initials}
    </span>
  )
}
