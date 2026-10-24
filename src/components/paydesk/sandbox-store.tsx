'use client'

/**
 * PaySwap sandbox storefront — the internal page rendered inside the ported ZCode
 * browser when a jumia.com(.gh) URL is opened. Extracted verbatim from the previous
 * simulated browser so the purchase golden path keeps working; the difference is that
 * the page is now driven by the browser's navigation state (path + payment gate)
 * instead of owning its own chrome.
 */

import { useState } from 'react'
import {
  ArrowLeft,
  ArrowUp,
  BatteryCharging,
  CookingPot,
  CreditCard,
  Footprints,
  Headphones,
  Lamp,
  Landmark,
  Minus,
  Plus,
  Search,
  Shirt,
  ShoppingBag,
  Smartphone,
  Star,
  Trophy,
  Wallet,
  Watch,
  X,
} from 'lucide-react'
import type {
  CheckoutMethod,
  CheckoutMethodKind,
  PaymentChoice,
  PaymentGate,
  TaskOrigin,
} from '@/lib/agent-types'
import { cn } from '@/lib/utils'
import { C } from './bits'
import { CheckoutMethodsPanel, ReceiptCard, fmtMoney } from './routine-blocks'

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

interface Product {
  id: string
  name: string
  price: number
  rating: number
  desc: string
  icon: typeof Headphones
  grad: string
  iconColor: string
}

const PRODUCTS: Product[] = [
  { id: 'headphones', name: 'Wireless headphones', price: 249, rating: 4.6, desc: 'Over-ear, 30h battery, USB-C fast charge.', icon: Headphones, grad: 'linear-gradient(135deg,#0b2b3d 0%,#155a63 100%)', iconColor: '#29c29a' },
  { id: 'smartwatch', name: 'Smartwatch', price: 420, rating: 4.4, desc: 'AMOLED display, GPS, heart-rate tracking.', icon: Watch, grad: 'linear-gradient(135deg,#d9f0e4 0%,#bfe5d8 100%)', iconColor: '#087d62' },
  { id: 'dress', name: 'Ankara dress', price: 180, rating: 4.8, desc: 'Hand-tailored wax print, sizes 6-16.', icon: Shirt, grad: 'linear-gradient(135deg,#f6e7cf 0%,#f0d9ae 100%)', iconColor: '#b45309' },
  { id: 'blender', name: 'Blender', price: 310, rating: 4.2, desc: '1200W motor, 1.8L jar, 3 speeds.', icon: CookingPot, grad: 'linear-gradient(135deg,#eef2f5 0%,#dde7ed 100%)', iconColor: '#5a7189' },
  { id: 'ball', name: 'Soccer ball', price: 95, rating: 4.5, desc: 'FIFA-standard size 5, machine-stitched.', icon: Trophy, grad: 'linear-gradient(135deg,#e2f4ed 0%,#cdeadd 100%)', iconColor: '#0b2b3d' },
  { id: 'powerbank', name: 'Power bank', price: 140, rating: 4.3, desc: '20,000mAh, dual USB-A + USB-C output.', icon: BatteryCharging, grad: 'linear-gradient(135deg,#f6e7cf 0%,#efd9ae 100%)', iconColor: '#b45309' },
  { id: 'lamp', name: 'Desk lamp', price: 210, rating: 4.1, desc: 'Dimmable LED arm, warm to cool white.', icon: Lamp, grad: 'linear-gradient(135deg,#e6edf2 0%,#d3e0e8 100%)', iconColor: '#0b2b3d' },
  { id: 'sneakers', name: 'Sneakers', price: 385, rating: 4.7, desc: 'Everyday runner, breathable knit upper.', icon: Footprints, grad: 'linear-gradient(135deg,#0b2b3d 0%,#29c29a 100%)', iconColor: '#e2f4ed' },
]

const DELIVERY_FEE = 15

const STATIC_METHODS: CheckoutMethod[] = [
  { id: 'static-momo', label: 'MTN Mobile Money', kind: 'momo', connected: false },
  { id: 'static-card', label: 'Visa card', kind: 'card', connected: false },
  { id: 'static-bank', label: 'Bank transfer', kind: 'bank', connected: false },
  { id: 'static-wallet', label: 'PaySwap wallet', kind: 'wallet', connected: false },
]

const METHOD_ICON: Record<CheckoutMethodKind, typeof Smartphone> = {
  momo: Smartphone,
  card: CreditCard,
  bank: Landmark,
  wallet: Wallet,
}

export type StorePage = 'storefront' | 'product' | 'cart' | 'checkout' | 'receipt'

interface CartLine {
  id: string
  name: string
  price: number
  qty: number
}

/* ------------------------------------------------------------------ */
/* Internal URL scheme                                                 */
/* ------------------------------------------------------------------ */

/** Internal page id used by the browser history for the sandbox storefront. */
export const STORE_INTERNAL_PREFIX = 'psbx://jumia'
export const STORE_DISPLAY_ORIGIN = 'https://www.jumia.com.gh'

const STORE_HOSTS = new Set(['jumia.com.gh', 'www.jumia.com.gh', 'jumia.com', 'www.jumia.com'])

/** Map a real URL to the internal storefront id, or null when it is not the store. */
export function resolveJumiaInternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (!STORE_HOSTS.has(parsed.hostname.toLowerCase())) return null
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/+$/, '') || '/'
    return `${STORE_INTERNAL_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
  } catch {
    return null
  }
}

export function isStoreInternalUrl(entry: string): boolean {
  return entry === STORE_INTERNAL_PREFIX || entry.startsWith(`${STORE_INTERNAL_PREFIX}/`)
}

/** Raw path carried by an internal entry ('' for the root). */
export function storePathOf(entry: string): string {
  if (!isStoreInternalUrl(entry)) return '/'
  const rest = entry.slice(STORE_INTERNAL_PREFIX.length)
  return rest || '/'
}

/** Effective page for a raw path given the live payment gate (agent checkout takeover). */
export function resolveStorePage(path: string, gate: PaymentGate | null): StorePage {
  const receipt = gate?.status === 'settled' ? gate.receipt : undefined
  if (receipt) return 'receipt'
  if (gate?.status === 'open' || gate?.status === 'processing') return 'checkout'
  if (path === '/cart') return 'cart'
  if (path === '/checkout') return 'checkout'
  if (path.startsWith('/order/')) return receipt ? 'receipt' : 'storefront'
  if (path.startsWith('/product/')) {
    const id = path.slice('/product/'.length).split(/[?#]/)[0]
    return PRODUCTS.some((p) => p.id === id) ? 'product' : 'storefront'
  }
  return 'storefront'
}

/** The real-world URL the chrome shows for the current internal page. */
export function storeDisplayUrl(path: string, gate: PaymentGate | null): string {
  const page = resolveStorePage(path, gate)
  const suffix =
    page === 'storefront'
      ? '/'
      : page === 'product'
        ? path.startsWith('/product/')
          ? path
          : '/'
        : page === 'cart'
          ? '/cart'
          : page === 'checkout'
            ? '/checkout'
            : `/order/${gate?.status === 'settled' && gate.receipt ? gate.receipt.ref : 'confirmed'}`
  return `${STORE_DISPLAY_ORIGIN}${suffix}`
}

/* ------------------------------------------------------------------ */
/* Sandbox store page                                                  */
/* ------------------------------------------------------------------ */

export interface SandboxStoreProps {
  /** Raw path of the current internal entry (e.g. '/', '/product/headphones'). */
  path: string
  gate: PaymentGate | null
  onPay: (gateId: string, choice: PaymentChoice) => void
  onGoal: (text: string, origin: TaskOrigin) => void
  /** User-driven navigation inside the store (pushes a browser history entry). */
  onNavigate: (path: string) => void
}

export function SandboxStore({ path, gate, onPay, onGoal, onNavigate }: SandboxStoreProps) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [qty, setQty] = useState(1)
  const [goalText, setGoalText] = useState('')

  const effectivePage = resolveStorePage(path, gate)
  const productId = path.startsWith('/product/')
    ? path.slice('/product/'.length).split(/[?#]/)[0]
    : null
  const product = PRODUCTS.find((p) => p.id === productId) ?? null

  const receipt = gate?.status === 'settled' ? gate.receipt : undefined
  const gateLive = gate?.status === 'open' || gate?.status === 'processing'
  const processing = gate?.status === 'processing'

  const activeItem =
    effectivePage === 'product' && product
      ? { name: product.name, price: product.price }
      : cart.length > 0
        ? { name: cart[0].name, price: cart[0].price }
        : gate
          ? { name: gate.checkout.item, price: gate.checkout.price }
          : null

  const addToCart = (p: Product, quantity: number) => {
    setCart((lines) => {
      const existing = lines.find((l) => l.id === p.id)
      if (existing) return lines.map((l) => (l.id === p.id ? { ...l, qty: l.qty + quantity } : l))
      return [...lines, { id: p.id, name: p.name, price: p.price, qty: quantity }]
    })
    setQty(1)
    onNavigate('/cart')
  }

  const sendGoal = () => {
    const text = goalText.trim()
    if (!text) return
    const origin: TaskOrigin = {
      type: 'browser',
      url: storeDisplayUrl(path, gate),
      item: activeItem?.name ?? 'Jumia purchase',
      price: activeItem?.price ?? 0,
      currency: 'GHS',
    }
    setGoalText('')
    onGoal(text, origin)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {effectivePage === 'storefront' && (
          <StorefrontPage
            onOpen={(p) => onNavigate(`/product/${p.id}`)}
            onCart={() => onNavigate('/cart')}
            cartCount={cart.reduce((n, l) => n + l.qty, 0)}
          />
        )}
        {effectivePage === 'product' && product && (
          <ProductPage
            product={product}
            qty={qty}
            onQty={setQty}
            onAdd={() => addToCart(product, qty)}
            onBack={() => onNavigate('/')}
          />
        )}
        {effectivePage === 'cart' && (
          <CartPage
            cart={cart}
            onQty={(id, next) =>
              setCart((lines) => lines.map((l) => (l.id === id ? { ...l, qty: Math.max(1, next) } : l)))
            }
            onRemove={(id) => setCart((lines) => lines.filter((l) => l.id !== id))}
            onCheckout={() => onNavigate('/checkout')}
            onKeepShopping={() => onNavigate('/')}
          />
        )}
        {effectivePage === 'checkout' && (
          <CheckoutPage
            cart={cart}
            gate={gate}
            processing={Boolean(processing)}
            onPay={onPay}
            onEditCart={() => onNavigate('/cart')}
          />
        )}
        {effectivePage === 'receipt' &&
          (receipt ? (
            <div className="mx-auto max-w-md px-4 py-6">
              <ReceiptCard receipt={receipt} />
              <button
                type="button"
                onClick={() => onNavigate('/')}
                className="mt-4 w-full rounded-full border border-[#dce5e9] px-4 py-2 text-[12.5px] font-medium text-[#5a7189] hover:bg-[#f6f9fa]"
              >
                Back to storefront
              </button>
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-[13px] text-[#8ba0b3]">
              The receipt appears here once the agent settles the payment.
            </div>
          ))}
      </div>

      {/* Floating goal composer — browser-origin goals flow back to the agent */}
      <div className="shrink-0 border-t border-[#dce5e9] bg-white px-3 pb-[max(env(safe-area-inset-bottom),0.6rem)] pt-2.5">
        {(effectivePage === 'checkout' || gateLive) && activeItem && (
          <button
            type="button"
            onClick={() =>
              setGoalText(`buy ${activeItem.name} for ${fmtMoney(activeItem.price, 'GHS')} on jumia`)
            }
            className="mb-2 inline-flex items-center gap-1 rounded-full border border-[#bfe5d8] bg-[#e2f4ed]/60 px-2.5 py-1 text-[11.5px] font-medium text-[#087d62] hover:bg-[#e2f4ed]"
          >
            buy this
          </button>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-[#dce5e9] bg-white p-2 shadow-[0_1px_2px_rgba(16,38,66,0.04)] focus-within:border-[#bfe5d8]">
          <textarea
            rows={1}
            value={goalText}
            aria-label="Describe your economic goal"
            placeholder="Describe your economic goal…"
            onChange={(e) => setGoalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendGoal()
              }
            }}
            className="max-h-24 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] leading-relaxed text-[#102642] outline-none placeholder:text-[#8ba0b3]"
          />
          <button
            type="button"
            onClick={sendGoal}
            disabled={!goalText.trim()}
            aria-label="Send goal to agent"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white transition-opacity',
              goalText.trim() ? 'opacity-100' : 'opacity-40',
            )}
            style={{ background: C.green }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

function StorefrontPage({
  onOpen,
  onCart,
  cartCount,
}: {
  onOpen: (p: Product) => void
  onCart: () => void
  cartCount: number
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="text-[17px] font-bold tracking-tight text-[#0b2b3d]">Jumia</span>
        <span aria-hidden="true" className="h-4 w-px bg-[#dce5e9]" />
        <span className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full border border-[#dce5e9] bg-[#f6f9fa] px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#8ba0b3]" aria-hidden="true" />
          <span className="truncate text-[12px] text-[#8ba0b3]">Search products, brands…</span>
        </span>
        <button
          type="button"
          onClick={onCart}
          aria-label={`Open cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dce5e9] text-[#5a7189] hover:bg-[#f6f9fa]"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          {cartCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9.5px] font-semibold text-white"
              style={{ background: C.green }}
            >
              {cartCount}
            </span>
          )}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5" role="list" aria-label="Products">
        {PRODUCTS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="listitem"
            onClick={() => onOpen(p)}
            aria-label={`View ${p.name}, ${fmtMoney(p.price, 'GHS')}`}
            className="overflow-hidden rounded-xl border border-[#dce5e9] bg-white text-left transition-colors hover:border-[#bfe5d8]"
          >
            <span className="flex h-24 items-center justify-center" style={{ background: p.grad }}>
              <p.icon className="h-9 w-9" style={{ color: p.iconColor }} aria-hidden="true" />
            </span>
            <span className="block px-2.5 pb-2.5 pt-2">
              <span className="block truncate text-[12.5px] font-medium text-[#102642]">{p.name}</span>
              <span className="mt-0.5 block font-mono text-[12px] font-semibold tabular-nums text-[#087d62]">
                {fmtMoney(p.price, 'GHS')}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="pt-3 text-center text-[10.5px] text-[#8ba0b3]">
        Simulated storefront on sandbox rails — purchases route through the agent.
      </p>
    </div>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn('h-3 w-3', i <= Math.round(value) ? 'text-[#b45309]' : 'text-[#c3d0da]')}
          aria-hidden="true"
          fill={i <= Math.round(value) ? 'currentColor' : 'none'}
        />
      ))}
      <span className="ml-1 font-mono text-[11px] text-[#8ba0b3]">{value.toFixed(1)}</span>
    </span>
  )
}

function ProductPage({
  product,
  qty,
  onQty,
  onAdd,
  onBack,
}: {
  product: Product
  qty: number
  onQty: (n: number) => void
  onAdd: () => void
  onBack: () => void
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#5a7189] hover:text-[#087d62]"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to storefront
      </button>
      <div className="mt-3 flex h-44 items-center justify-center rounded-2xl" style={{ background: product.grad }}>
        <product.icon className="h-16 w-16" style={{ color: product.iconColor }} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-[15px] font-semibold text-[#102642]">{product.name}</h2>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Stars value={product.rating} />
        <span className="font-mono text-[15px] font-semibold tabular-nums text-[#087d62]">
          {fmtMoney(product.price, 'GHS')}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5a7189]">{product.desc}</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-[#dce5e9] p-0.5">
          <button
            type="button"
            onClick={() => onQty(Math.max(1, qty - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#5a7189] hover:bg-[#f6f9fa] disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="w-6 text-center font-mono text-[12.5px] tabular-nums text-[#102642]" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => onQty(Math.min(9, qty + 1))}
            disabled={qty >= 9}
            aria-label="Increase quantity"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#5a7189] hover:bg-[#f6f9fa] disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: C.green }}
          aria-label={`Add ${product.name} to cart`}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Add to cart
        </button>
      </div>
    </div>
  )
}

function CartPage({
  cart,
  onQty,
  onRemove,
  onCheckout,
  onKeepShopping,
}: {
  cart: CartLine[]
  onQty: (id: string, next: number) => void
  onRemove: (id: string) => void
  onCheckout: () => void
  onKeepShopping: () => void
}) {
  const subtotal = cart.reduce((n, l) => n + l.price * l.qty, 0)
  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <h2 className="text-[15px] font-semibold text-[#102642]">Cart</h2>
      {cart.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-[13px] text-[#8ba0b3]">Your cart is empty.</p>
          <button
            type="button"
            onClick={onKeepShopping}
            className="mt-3 rounded-full border border-[#dce5e9] px-4 py-2 text-[12.5px] font-medium text-[#5a7189] hover:bg-[#f6f9fa]"
          >
            Continue shopping
          </button>
        </div>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[#eef2f5] rounded-xl border border-[#dce5e9] bg-white">
            {cart.map((l) => (
              <li key={l.id} className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#102642]">{l.name}</p>
                  <p className="font-mono text-[11px] text-[#8ba0b3]">
                    qty {l.qty} · {fmtMoney(l.price, 'GHS')}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-[#102642]">
                  {fmtMoney(l.price * l.qty, 'GHS')}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => onQty(l.id, l.qty - 1)} disabled={l.qty <= 1} aria-label={`Decrease quantity of ${l.name}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[#5a7189] hover:bg-[#f6f9fa] disabled:opacity-30">
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onQty(l.id, l.qty + 1)} disabled={l.qty >= 9} aria-label={`Increase quantity of ${l.name}`} className="flex h-6 w-6 items-center justify-center rounded-full text-[#5a7189] hover:bg-[#f6f9fa] disabled:opacity-30">
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onRemove(l.id)} aria-label={`Remove ${l.name} from cart`} className="flex h-6 w-6 items-center justify-center rounded-full text-[#b91c1c] hover:bg-[#fdeaea]">
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#f6f9fa] px-3 py-2.5">
            <span className="text-[12.5px] text-[#5a7189]">Subtotal</span>
            <span className="font-mono text-[13.5px] font-semibold tabular-nums text-[#102642]">
              {fmtMoney(subtotal, 'GHS')}
            </span>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: C.green }}
          >
            Proceed to checkout
          </button>
        </>
      )}
    </div>
  )
}

function CheckoutPage({
  cart,
  gate,
  processing,
  onPay,
  onEditCart,
}: {
  cart: CartLine[]
  gate: PaymentGate | null
  processing: boolean
  onPay: (gateId: string, choice: PaymentChoice) => void
  onEditCart: () => void
}) {
  const subtotal = cart.reduce((n, l) => n + l.price * l.qty, 0)
  const total = subtotal + (cart.length > 0 ? DELIVERY_FEE : 0)
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-4">
      <h2 className="text-[15px] font-semibold text-[#102642]">Checkout</h2>

      {/* Address */}
      <div className="rounded-xl border border-[#dce5e9] bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">Delivery address</p>
        <p className="mt-1 text-[13px] font-medium text-[#102642]">Kwame Mensah</p>
        <p className="text-[12px] text-[#5a7189]">12 Independence Ave, Accra</p>
      </div>

      {/* Order summary */}
      <div className="rounded-xl border border-[#dce5e9] bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">Order summary</p>
        {cart.length === 0 ? (
          gate ? (
            <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
              <span className="min-w-0 truncate text-[#102642]">{gate.checkout.item}</span>
              <span className="shrink-0 font-mono tabular-nums text-[#5a7189]">
                {fmtMoney(gate.checkout.price, gate.checkout.currency)}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-[12.5px] text-[#8ba0b3]">
              Your cart is empty —{' '}
              <button type="button" onClick={onEditCart} className="font-medium text-[#087d62] underline-offset-2 hover:underline">
                edit the cart
              </button>
              .
            </p>
          )
        ) : (
          <ul className="mt-2 space-y-1.5">
            {cart.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="min-w-0 truncate text-[#102642]">
                  {l.name} <span className="text-[#8ba0b3]">× {l.qty}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[#5a7189]">{fmtMoney(l.price * l.qty, 'GHS')}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="text-[#5a7189]">Delivery</span>
              <span className="shrink-0 font-mono tabular-nums text-[#5a7189]">{fmtMoney(DELIVERY_FEE, 'GHS')}</span>
            </li>
            <li className="flex items-center justify-between gap-2 border-t border-[#eef2f5] pt-1.5 text-[13px] font-semibold">
              <span className="text-[#102642]">Total</span>
              <span className="shrink-0 font-mono tabular-nums text-[#102642]">{fmtMoney(total, 'GHS')}</span>
            </li>
          </ul>
        )}
      </div>

      {/* Payment methods */}
      {gate ? (
        <div className="rounded-xl border border-[#dce5e9] bg-white p-3">
          <CheckoutMethodsPanel
            methods={gate.checkout.methods}
            disabled={processing}
            onPayChoice={(choice) => onPay(gate.gateId, choice)}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-[#dce5e9] bg-white p-3">
          <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8ba0b3]">
            Eligible payment methods
          </p>
          <div className="divide-y divide-[#eef2f5]">
            {STATIC_METHODS.map((m) => {
              const Icon = METHOD_ICON[m.kind]
              return (
                <div key={m.id} className="flex min-w-0 items-center gap-2.5 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f6f9fa]">
                    <Icon className="h-4 w-4 text-[#5a7189]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#102642]">{m.label}</p>
                    <p className="text-[10.5px] capitalize text-[#8ba0b3]">{m.kind}</p>
                  </div>
                  <button
                    type="button"
                    disabled
                    aria-label={`Connect ${m.label} (unavailable without an agent session)`}
                    className="shrink-0 rounded-full border border-[#dce5e9] px-3 py-1 text-[12px] text-[#8ba0b3] opacity-70"
                  >
                    Connect
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 border-t border-[#eef2f5] pt-3">
            <button
              type="button"
              disabled
              aria-label="Pay with PaySwap (start a purchase from chat first)"
              className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center rounded-full px-4 text-[12.5px] font-medium text-white opacity-50"
              style={{ background: C.green }}
            >
              Pay with PaySwap — route through nodes
            </button>
            <p className="pt-1.5 text-center text-[10.5px] text-[#8ba0b3]">Start a purchase from chat first.</p>
          </div>
        </div>
      )}
    </div>
  )
}
