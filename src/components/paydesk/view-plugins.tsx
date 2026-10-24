'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, Check, CreditCard, Search, ShieldCheck, Star, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Plugin, PluginCategory } from '@/lib/paydata'
import { C, SectionLabel } from './bits'

interface PluginsViewProps {
  plugins: Plugin[]
  onToggle: (id: string) => void
}

const CATEGORIES: (PluginCategory | 'All')[] = ['All', 'Gateways', 'Payouts', 'Compliance', 'Tools']

function CategoryIcon({ category }: { category: PluginCategory }) {
  const props = { className: 'h-4.5 w-4.5', style: { color: C.greenDeep }, 'aria-hidden': true } as const
  switch (category) {
    case 'Gateways':
      return <CreditCard {...props} />
    case 'Payouts':
      return <ArrowUpRight {...props} />
    case 'Compliance':
      return <ShieldCheck {...props} />
    case 'Tools':
      return <Zap {...props} />
  }
}

export function PluginsView({ plugins, onToggle }: PluginsViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plugins.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.vendor.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [plugins, query, category])

  const installedCount = plugins.filter((p) => p.installed).length

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#102642]">Plugin Marketplace</h1>
          <p className="mt-1 text-sm text-[#5a7189]">
            Connect gateways, payout rails and compliance tools — installed plugins become tool calls the agent can use.
          </p>
          <div className="mt-2">
            <SectionLabel>{installedCount} installed · {plugins.length} listed</SectionLabel>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8ba0b3]" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plugins…"
            aria-label="Search plugins"
            className="rounded-full border-[#dce5e9] pl-9"
          />
        </div>
      </header>

      <Tabs value={category} onValueChange={(v) => setCategory(v as (typeof CATEGORIES)[number])}>
        <TabsList className="h-9 rounded-full border border-[#dce5e9] bg-white p-1">
          {CATEGORIES.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="rounded-full px-3.5 text-[12px] data-[state=active]:bg-[#e2f4ed] data-[state=active]:text-[#087d62]"
            >
              {cat}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#dce5e9] bg-white p-8 text-center text-sm text-[#5a7189]">
          No plugins match “{query}”. Try a different search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-2xl border border-[#dce5e9] bg-white p-4 transition-colors hover:border-[#bfe5d8]"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: C.mint }}>
                  <CategoryIcon category={p.category} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#102642]">{p.name}</p>
                  <p className="truncate text-[11px] text-[#8ba0b3]">{p.vendor}</p>
                </div>
                <Badge variant="outline" className="shrink-0 border-[#dce5e9] text-[10px] text-[#5a7189]">
                  {p.category}
                </Badge>
              </div>
              <p className="mt-2.5 line-clamp-2 flex-1 text-[12.5px] leading-relaxed text-[#5a7189]">{p.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[11px] text-[#8ba0b3]">
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-[#f59e0b] text-[#f59e0b]" aria-hidden="true" />
                    {p.rating.toFixed(1)}
                  </span>
                  · {p.installs} installs
                </span>
                {p.installed ? (
                  <button
                    type="button"
                    onClick={() => onToggle(p.id)}
                    aria-label={`Uninstall ${p.name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] px-3 py-1.5 text-[12px] font-medium text-[#087d62] hover:bg-[#d3eede]"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Installed
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggle(p.id)}
                    aria-label={`Install ${p.name}`}
                    className="rounded-full px-3.5 py-1.5 text-[12px] font-medium text-white"
                    style={{ background: C.green }}
                  >
                    Install
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
