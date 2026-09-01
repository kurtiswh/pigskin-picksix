/**
 * Detect that a newer build has been deployed while this tab stayed open.
 *
 * WHY THIS EXISTS. During the 2026 pre-season a player made six picks and
 * submitted them two hours after a fix had gone live, and still hit the old
 * silent-failure path: their tab had been open since before the deploy, so it
 * was running an eight-hour-old bundle. index.html is served
 * `max-age=0, must-revalidate`, so any fresh load gets current code -- but a
 * single-page app never reloads on its own, and mid-season deploys are normal
 * here. Nothing told them, and nothing told us.
 *
 * HOW. index.html always references the content-hashed entry chunk
 * (assets/index-<hash>.js). Comparing the hash this tab actually loaded against
 * the one index.html currently advertises needs no build-time version stamp and
 * no extra deployed file -- the hash IS the version.
 *
 * This never reloads by itself. A player mid-pick-sheet losing the page to a
 * surprise refresh is worse than running slightly stale code, so it only
 * reports, and the UI asks.
 */

const ENTRY_RE = /assets\/index-[A-Za-z0-9_-]+\.js/

/** Entry chunk this tab is running, from its own <script> tag. */
function loadedEntry(): string | null {
  if (typeof document === 'undefined') return null
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
  for (const s of scripts) {
    const m = s.src.match(ENTRY_RE)
    if (m) return m[0]
  }
  return null
}

/** Entry chunk the server is serving right now. */
async function deployedEntry(): Promise<string | null> {
  // cache: 'no-store' rather than a cache-busting query string: the query form
  // would miss Cloudflare's cache and hammer the origin on every check.
  const res = await fetch('/index.html', { cache: 'no-store' })
  if (!res.ok) return null
  const m = (await res.text()).match(ENTRY_RE)
  return m ? m[0] : null
}

export interface VersionWatchOptions {
  /** How often to poll while the tab is visible. Default 5 minutes. */
  intervalMs?: number
}

/**
 * Calls `onStale` once, when a different build is detected. Returns a cleanup
 * function. A no-op in dev, where there is no hashed entry chunk to compare.
 */
export function startVersionWatch(
  onStale: () => void,
  { intervalMs = 5 * 60 * 1000 }: VersionWatchOptions = {}
): () => void {
  const running = loadedEntry()
  if (!running) return () => {}

  let stopped = false

  const check = async () => {
    if (stopped || document.hidden) return
    try {
      const latest = await deployedEntry()
      if (!stopped && latest && latest !== running) {
        console.log(`🔄 New build available: ${running} → ${latest}`)
        stop()
        onStale()
      }
    } catch {
      // Offline or a blip. Leave the watch running and try again next tick.
    }
  }

  // The tab-left-open case is exactly "came back to a tab after a while", so
  // check on re-focus as well as on the timer.
  const onVisible = () => { if (!document.hidden) void check() }

  const timer = setInterval(check, intervalMs)
  document.addEventListener('visibilitychange', onVisible)

  function stop() {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }

  return stop
}
