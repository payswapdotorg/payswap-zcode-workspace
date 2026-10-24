'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Globe, ListFilter, Paperclip, Sparkles, X } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ModelPickerMenu, useCurrentModelName } from './model-providers'
import {
  WEB_ELEMENT_CONTEXT_ADD_TO_CHAT_EVENT,
  WEB_ELEMENT_CONTEXT_REMOVE_FROM_CHAT_EVENT,
  buildPromptWithWebElementContexts,
  createWebElementContextId,
  dispatchWebElementContextRemoveFromChat,
  isWebElementContextAddToChatEvent,
  isWebElementContextPayload,
  isWebElementContextRemoveFromChatEvent,
  type WebElementContextComposerAttachment,
} from '@/lib/zcode/browser/webElementContext'

const CURRENCIES = ['USD', 'GHS', 'NGN', 'KES', 'EUR', 'GBP', 'USDC']

export interface ContextChip {
  id: string
  label: string
}

interface GoalConstraints {
  amount: string
  currency: string
  destinationCurrency: string
  deadline: string
  proof: boolean
}

const EMPTY_CONSTRAINTS: GoalConstraints = {
  amount: '',
  currency: 'USD',
  destinationCurrency: 'same',
  deadline: '',
  proof: false,
}

function constraintsActive(c: GoalConstraints): boolean {
  return Boolean(c.amount.trim() || c.deadline.trim() || c.proof || c.destinationCurrency !== 'same')
}

function constraintChips(c: GoalConstraints): ContextChip[] {
  const chips: ContextChip[] = []
  if (c.amount.trim()) {
    chips.push({
      id: 'c-amount',
      label: c.destinationCurrency !== 'same' ? `${c.amount} ${c.currency} → ${c.destinationCurrency}` : `${c.amount} ${c.currency}`,
    })
  }
  if (c.deadline.trim()) chips.push({ id: 'c-deadline', label: `by ${c.deadline}` })
  if (c.proof) chips.push({ id: 'c-proof', label: 'settlement proof required' })
  return chips
}

function constraintBlock(c: GoalConstraints): string {
  if (!constraintsActive(c)) return ''
  const lines = ['\n\nConstraints:']
  if (c.amount.trim()) {
    lines.push(
      c.destinationCurrency !== 'same'
        ? `- Amount: ${c.amount} ${c.currency} → deliver ${c.destinationCurrency}`
        : `- Amount: ${c.amount} ${c.currency}`,
    )
  }
  if (c.deadline.trim()) lines.push(`- Deadline: ${c.deadline}`)
  if (c.proof) lines.push('- Proof: rail-level settlement finality required')
  return lines.join('\n')
}

interface ComposerProps {
  onSend: (text: string) => void
  onChipRemove?: (id: string) => void
  chips?: ContextChip[]
  initialText?: string
  placeholder?: string
  autoFocus?: boolean
  onToggleBrowser?: () => void
  browserActive?: boolean
}

export function Composer({
  onSend,
  chips = [],
  onChipRemove,
  initialText = '',
  placeholder = 'Describe an economic goal — pay, collect, convert, reconcile…',
  autoFocus = false,
  onToggleBrowser,
  browserActive = false,
}: ComposerProps) {
  const [text, setText] = useState(initialText)
  const modelName = useCurrentModelName()
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [constraints, setConstraints] = useState<GoalConstraints>(EMPTY_CONSTRAINTS)
  const [constraintsOpen, setConstraintsOpen] = useState(false)
  const [webElementContexts, setWebElementContexts] = useState<WebElementContextComposerAttachment[]>([])
  const ref = useRef<HTMLTextAreaElement>(null)

  /* Original ZCode contract: the browser element picker dispatches window events —
     every mounted composer tracks the same web-element attachment set. */
  useEffect(() => {
    const add = (event: Event) => {
      if (!isWebElementContextAddToChatEvent(event)) return
      if (!isWebElementContextPayload(event.detail)) return
      setWebElementContexts((list) => [
        ...list,
        { ...event.detail, id: createWebElementContextId() },
      ])
    }
    const remove = (event: Event) => {
      if (!isWebElementContextRemoveFromChatEvent(event)) return
      setWebElementContexts((list) => list.filter((item) => item.id !== event.detail.id))
    }
    window.addEventListener(WEB_ELEMENT_CONTEXT_ADD_TO_CHAT_EVENT, add)
    window.addEventListener(WEB_ELEMENT_CONTEXT_REMOVE_FROM_CHAT_EVENT, remove)
    return () => {
      window.removeEventListener(WEB_ELEMENT_CONTEXT_ADD_TO_CHAT_EVENT, add)
      window.removeEventListener(WEB_ELEMENT_CONTEXT_REMOVE_FROM_CHAT_EVENT, remove)
    }
  }, [])

  const removeWebElementContext = (id: string) => {
    setWebElementContexts((list) => {
      const target = list.find((item) => item.id === id)
      if (target) {
        dispatchWebElementContextRemoveFromChat({
          id,
          workspacePath: target.workspacePath,
          ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
        })
      }
      return list.filter((item) => item.id !== id)
    })
  }

  const send = () => {
    const value = buildPromptWithWebElementContexts(
      (text.trim() + constraintBlock(constraints)).trim(),
      webElementContexts,
    )
    if (!value) return
    setText('')
    setConstraints(EMPTY_CONSTRAINTS)
    setWebElementContexts([])
    if (ref.current) ref.current.style.height = 'auto'
    onSend(value)
  }

  const activeChips = [...chips, ...constraintChips(constraints)]

  return (
    <div className="rounded-2xl border border-[#dce5e9] bg-white shadow-[0_1px_2px_rgba(16,38,66,0.04),0_8px_24px_rgba(16,38,66,0.05)] focus-within:border-[#bfe5d8]">
      {(activeChips.length > 0 || webElementContexts.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attached context">
          {webElementContexts.map((context) => (
            <span
              key={context.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#bfe5d8] bg-[#e2f4ed] py-0.5 pl-2.5 pr-1 text-[11px] font-medium text-[#087d62]"
              title={`${context.pageUrl} · ${context.tagName}`}
            >
              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {context.tagName}
                {context.accessibleName ? `: ${context.accessibleName}` : ''}
              </span>
              <button
                type="button"
                onClick={() => removeWebElementContext(context.id)}
                aria-label={`Remove element ${context.tagName}`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-[#5a9184] hover:bg-white/70 hover:text-[#087d62]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          {activeChips.map((chip) => {
            const isConstraint = chip.id.startsWith('c-')
            return (
              <span
                key={chip.id}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-[11px] font-medium',
                  isConstraint
                    ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
                    : 'border-[#dce5e9] bg-[#f6f9fa] text-[#5a7189]',
                )}
              >
                {chip.label}
                {isConstraint ? (
                  <button
                    type="button"
                    aria-label={`Remove constraint ${chip.label}`}
                    onClick={() =>
                      setConstraints((c) => ({
                        ...c,
                        amount: chip.id === 'c-amount' ? '' : c.amount,
                        deadline: chip.id === 'c-deadline' ? '' : c.deadline,
                        proof: chip.id === 'c-proof' ? false : c.proof,
                      }))
                    }
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[#5a9184] hover:bg-white/70 hover:text-[#087d62]"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChipRemove?.(chip.id)}
                    aria-label={`Remove context ${chip.label}`}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#eef2f5] hover:text-[#102642]"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}
      <textarea
        ref={ref}
        rows={2}
        value={text}
        autoFocus={autoFocus}
        aria-label="Task prompt"
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 160)}px`
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        className="max-h-40 w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[14px] leading-relaxed text-[#102642] outline-none placeholder:text-[#8ba0b3]"
      />
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <DropdownMenu open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Model: ${modelName}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dce5e9] px-2.5 py-1 text-[11px] font-medium text-[#5a7189] hover:bg-[#f6f9fa]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#087d62]" aria-hidden="true" />
              <span className="font-mono">{modelName}</span>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 p-1.5">
            <ModelPickerMenu onSelect={() => setModelMenuOpen(false)} />
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Simulated browser toggle */}
        {onToggleBrowser && (
          <button
            type="button"
            onClick={onToggleBrowser}
            aria-pressed={browserActive}
            aria-label="Browse the web yourself"
            title="Browse the web yourself"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
              browserActive
                ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
                : 'border-[#dce5e9] text-[#5a7189] hover:bg-[#f6f9fa]',
            )}
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Browse</span>
          </button>
        )}

        {/* Structured goal constraints (capability 1) */}
        <Popover open={constraintsOpen} onOpenChange={setConstraintsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add goal constraints"
              aria-expanded={constraintsOpen}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                constraintsActive(constraints)
                  ? 'border-[#bfe5d8] bg-[#e2f4ed] text-[#087d62]'
                  : 'border-[#dce5e9] text-[#5a7189] hover:bg-[#f6f9fa]',
              )}
            >
              <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Constraints</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">
              Economic goal details
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-1 space-y-1">
                <span className="text-[11px] font-medium text-[#5a7189]">Amount</span>
                <Input
                  value={constraints.amount}
                  onChange={(e) => setConstraints((c) => ({ ...c, amount: e.target.value }))}
                  placeholder="500"
                  inputMode="decimal"
                  className="h-8 text-[13px]"
                />
              </label>
              <label className="col-span-1 space-y-1">
                <span className="text-[11px] font-medium text-[#5a7189]">Currency</span>
                <select
                  aria-label="Currency"
                  value={constraints.currency}
                  onChange={(e) => setConstraints((c) => ({ ...c, currency: e.target.value }))}
                  className="h-8 w-full rounded-md border border-[#dce5e9] bg-white px-2 text-[13px] text-[#102642] outline-none focus:border-[#bfe5d8]"
                >
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 space-y-1">
                <span className="text-[11px] font-medium text-[#5a7189]">Deliver as</span>
                <select
                  aria-label="Destination currency"
                  value={constraints.destinationCurrency}
                  onChange={(e) => setConstraints((c) => ({ ...c, destinationCurrency: e.target.value }))}
                  className="h-8 w-full rounded-md border border-[#dce5e9] bg-white px-2 text-[13px] text-[#102642] outline-none focus:border-[#bfe5d8]"
                >
                  <option value="same">Same currency</option>
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 space-y-1">
                <span className="text-[11px] font-medium text-[#5a7189]">Deadline</span>
                <Input
                  value={constraints.deadline}
                  onChange={(e) => setConstraints((c) => ({ ...c, deadline: e.target.value }))}
                  placeholder="Friday 17:00"
                  className="h-8 text-[13px]"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f6f9fa] px-2.5 py-2">
              <span className="text-[12px] font-medium text-[#102642]">Require settlement proof</span>
              <Switch
                checked={constraints.proof}
                onCheckedChange={(checked) => setConstraints((c) => ({ ...c, proof: checked }))}
                aria-label="Require settlement proof"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-[#8ba0b3]">
              Constraints compile into typed intents — the agent evaluates routes against them and
              shows why rejected routes were rejected.
            </p>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label="Attach files (disabled in preview)"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[#8ba0b3] hover:bg-[#f6f9fa] hover:text-[#5a7189]"
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="ml-auto hidden text-[11px] text-[#8ba0b3] sm:block">↵ to send</span>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          aria-label="Send prompt"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl text-white transition-opacity',
            text.trim() ? 'opacity-100' : 'opacity-40',
          )}
          style={{ background: 'linear-gradient(90deg, #0e8066 0%, #07966e 100%)' }}
        >
          <ArrowUp className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
