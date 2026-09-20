import { useCallback, useEffect, useRef, useState } from 'react'

export type ExpansionStatus = 'loading' | 'ready' | 'empty' | 'error'

export interface ExpansionState<T> {
  status: ExpansionStatus
  data?: T
  /** User-facing message, already stripped of stack noise. */
  error?: string
}

interface UseExpandableRowsOptions {
  /**
   * Changing this drops every open row and invalidates in-flight requests:
   * an expansion belongs to the season/week/tab it was opened under, and a
   * response that lands after the view moved on must never be shown.
   */
  resetKey?: string | number
  /** Silent retries before the row shows its error state. */
  retries?: number
  /** Delay before the silent retry, in ms. */
  retryDelayMs?: number
}

const isEmptyResult = (value: unknown) =>
  value == null || (Array.isArray(value) && value.length === 0)

function messageFor(error: any): string {
  const raw = typeof error?.message === 'string' ? error.message : ''
  if (/timeout/i.test(raw)) return 'This took too long to load.'
  if (/fetch|network|Failed to fetch|NetworkError/i.test(raw)) return 'Connection problem while loading.'
  return raw || 'Something went wrong loading this.'
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Open/closed state plus load state for expandable leaderboard rows.
 *
 * Every row carries its own status, so a row can say "loading", "nothing here"
 * or "that failed, try again" instead of opening onto an empty panel. All
 * updates are functional: the previous version rebuilt the Set/Map captured in
 * the click handler's closure, so expanding a second row before the first
 * resolved wiped the first row's data and left its spinner running forever —
 * and a spinning row could not be clicked again, which is what made expansions
 * look like they "never load".
 */
export function useExpandableRows<T>({
  resetKey,
  retries = 1,
  retryDelayMs = 700,
}: UseExpandableRowsOptions = {}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [states, setStates] = useState<Map<string, ExpansionState<T>>>(new Map())

  // Ref mirrors so a click handler can read current state without depending on
  // the render that produced it — the stale-closure trap this hook exists to
  // close. Rendered state still comes from useState.
  const expandedRef = useRef(expandedRows)
  const statesRef = useRef(states)
  expandedRef.current = expandedRows
  statesRef.current = states

  // Loaders are kept so Retry can re-run exactly the request that failed.
  const loaders = useRef<Map<string, () => Promise<T | null | undefined>>>(new Map())
  const inFlight = useRef<Set<string>>(new Set())
  // Bumped on reset; a response from an older generation is discarded.
  const generation = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    generation.current += 1
    inFlight.current.clear()
    loaders.current.clear()
    expandedRef.current = new Set()
    statesRef.current = new Map()
    setExpandedRows(expandedRef.current)
    setStates(statesRef.current)
  }, [resetKey])

  const runLoad = useCallback(async (key: string) => {
    if (inFlight.current.has(key)) return
    const gen = generation.current
    inFlight.current.add(key)

    const put = (state: ExpansionState<T>) => {
      setStates(prev => {
        const next = new Map(prev)
        next.set(key, state)
        statesRef.current = next
        return next
      })
    }

    put({ status: 'loading' })

    const settle = (state: ExpansionState<T>) => {
      if (!mounted.current || gen !== generation.current) return
      put(state)
    }

    try {
      let lastError: any
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const loader = loaders.current.get(key)
          if (!loader) return
          const data = await loader()
          if (gen !== generation.current) return
          settle(isEmptyResult(data) ? { status: 'empty' } : { status: 'ready', data: data as T })
          return
        } catch (error: any) {
          lastError = error
          if (gen !== generation.current) return
          if (attempt < retries) await sleep(retryDelayMs * (attempt + 1))
        }
      }
      console.error('❌ Row expansion failed:', lastError)
      settle({ status: 'error', error: messageFor(lastError) })
    } finally {
      inFlight.current.delete(key)
    }
  }, [retries, retryDelayMs])

  /** Open or close a row, loading its content the first time it opens. */
  const toggle = useCallback((key: string, loader: () => Promise<T | null | undefined>) => {
    loaders.current.set(key, loader)

    const next = new Set(expandedRef.current)
    const opening = !next.has(key)
    if (opening) next.add(key)
    else next.delete(key)
    expandedRef.current = next
    setExpandedRows(next)

    if (!opening) return

    // Only (re)load when there is nothing usable cached. A row that failed
    // earlier gets a fresh attempt instead of reopening onto the same error.
    const cached = statesRef.current.get(key)
    if (!cached || cached.status === 'error') runLoad(key)
  }, [runLoad])

  const retry = useCallback((key: string) => { runLoad(key) }, [runLoad])

  const isExpanded = useCallback((key: string) => expandedRows.has(key), [expandedRows])
  const getState = useCallback((key: string) => states.get(key), [states])

  return { expandedRows, isExpanded, getState, toggle, retry }
}
