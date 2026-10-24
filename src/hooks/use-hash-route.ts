'use client'

import { useCallback, useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'routines' }
  | { name: 'opportunities' }
  | { name: 'automations' }
  | { name: 'plugins' }
  | { name: 'connections' }
  | { name: 'checkout' }
  | { name: 'approvals' }
  | { name: 'activity' }
  | { name: 'settings' }
  | { name: 'task'; id: string }
  | { name: 'project'; id: string }

export function routeToKey(route: Route): string {
  switch (route.name) {
    case 'task':
      return `task-${route.id}`
    case 'project':
      return `project-${route.id}`
    default:
      return route.name
  }
}

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [head, id] = h.split('/')
  if (head === 'task' && id) return { name: 'task', id }
  if (head === 'project' && id) return { name: 'project', id }
  if (head === 'routines') return { name: 'routines' }
  if (head === 'opportunities') return { name: 'opportunities' }
  if (head === 'automations') return { name: 'automations' }
  if (head === 'plugins') return { name: 'plugins' }
  if (head === 'connections') return { name: 'connections' }
  if (head === 'checkout') return { name: 'checkout' }
  if (head === 'approvals') return { name: 'approvals' }
  if (head === 'activity') return { name: 'activity' }
  if (head === 'settings') return { name: 'settings' }
  if (head === 'new') return { name: 'new' }
  return { name: 'home' }
}

/**
 * Minimal hash router so the single "/" route stays fully navigable:
 * every view has a URL, and the browser back/forward buttons work.
 */
export function useHashRoute() {
  const [hash, setHash] = useState('#/')

  useEffect(() => {
    const apply = () => setHash(window.location.hash || '#/')
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  const navigate = useCallback((to: string) => {
    const target = to.startsWith('#') ? to : `#${to}`
    if (typeof window !== 'undefined' && window.location.hash === target) return
    window.location.hash = target
  }, [])

  return { route: parseRoute(hash), navigate }
}
