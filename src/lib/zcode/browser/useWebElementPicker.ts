'use client'

/**
 * Original ZCode web element picker hook (packages/ui/src/hooks/useWebElementPicker.ts,
 * Apache-2.0), ported verbatim for the web sandbox: the only change is the logger
 * (console.*) — the picker stays transport-agnostic through the `executeJs` exit,
 * which the ZcodeBrowser wires to CDP Runtime.evaluate on the remote guest.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dispatchWebElementContextAddToChat,
  isWebElementContextPayload,
  type WebElementContextPayload,
} from '@/lib/zcode/browser/webElementContext'
import {
  buildCancelWebElementPickerScript,
  buildWebElementPickerScript,
  type WebElementPickerScriptLabels,
  type WebElementPickerScriptResult,
} from '@/lib/zcode/browser/webElementPickerScript'

interface UseWebElementPickerOptions {
  /**
   * 传输无关的脚本执行出口：把选择脚本送到目标网页并回传结果。
   * UnifiedBrowserView 走 main IPC（executeJavaScript）；web 沙盒走 CDP Runtime.evaluate。
   */
  executeJs: (script: string) => Promise<unknown>
  workspacePath: string
  workspaceIdentity?: string
  labels?: Partial<WebElementPickerScriptLabels>
}

function isWebElementPickerScriptResult(result: unknown): result is WebElementPickerScriptResult {
  if (typeof result !== 'object' || result === null) {
    return false
  }

  const candidate = result as WebElementPickerScriptResult
  return (
    candidate.status === 'cancelled' ||
    (candidate.status === 'selected' &&
      typeof candidate.element === 'object' &&
      candidate.element !== null)
  )
}

function buildPayload(params: {
  result: Extract<WebElementPickerScriptResult, { status: 'selected' }>
  workspacePath: string
  workspaceIdentity?: string
}): WebElementContextPayload | null {
  const payload: WebElementContextPayload = {
    ...params.result.element,
    workspacePath: params.workspacePath,
    ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
  }

  return isWebElementContextPayload(payload) ? payload : null
}

function sanitizeUrlForLog(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url.split(/[?#]/u)[0] ?? ''
  }
}

export function useWebElementPicker({
  executeJs,
  workspacePath,
  workspaceIdentity,
  labels,
}: UseWebElementPickerOptions) {
  const [isPicking, setIsPicking] = useState(false)
  const activePickerRunRef = useRef(0)
  // executeJs 引用可能随每次渲染变化；用 ref 固定，避免 useCallback 依赖它而频繁重建。
  const executeJsRef = useRef(executeJs)
  executeJsRef.current = executeJs

  const cancelPicking = useCallback(async () => {
    activePickerRunRef.current += 1
    setIsPicking(false)

    try {
      await executeJsRef.current(buildCancelWebElementPickerScript())
    } catch (error) {
      console.debug('[ZcodeBrowser] 取消网页元素选择失败', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }, [])

  const startPicking = useCallback(async () => {
    const runId = activePickerRunRef.current + 1
    activePickerRunRef.current = runId
    setIsPicking(true)

    try {
      const result = await executeJsRef.current(
        buildWebElementPickerScript(labels ? { labels } : {}),
      )
      if (activePickerRunRef.current !== runId) {
        return
      }

      if (!isWebElementPickerScriptResult(result)) {
        console.warn('[ZcodeBrowser] 网页元素选择返回了无法识别的结果')
        return
      }

      if (result.status === 'cancelled') {
        return
      }

      const payload = buildPayload({
        result,
        workspacePath,
        workspaceIdentity,
      })
      if (!payload) {
        console.warn('[ZcodeBrowser] 网页元素上下文无效，已丢弃')
        return
      }

      dispatchWebElementContextAddToChat(payload)
    } catch (error) {
      console.warn('[ZcodeBrowser] 网页元素选择失败', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      if (activePickerRunRef.current === runId) {
        setIsPicking(false)
      }
    }
  }, [labels, workspaceIdentity, workspacePath])

  const togglePicking = useCallback(async () => {
    if (isPicking) {
      await cancelPicking()
      return
    }
    await startPicking()
  }, [cancelPicking, isPicking, startPicking])

  useEffect(() => {
    if (!isPicking) {
      return
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      // 受控视图获得焦点时由注入脚本处理 Esc；焦点还在外层工具栏时，
      // 这里兜底取消，保证选择态不会因为焦点位置不同而卡住。
      void cancelPicking()
    }

    window.addEventListener('keydown', handleWindowKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true)
    }
  }, [cancelPicking, isPicking])

  useEffect(() => {
    return () => {
      void cancelPicking()
    }
  }, [cancelPicking])

  return {
    cancelPicking,
    isPicking,
    startPicking,
    togglePicking,
  }
}
