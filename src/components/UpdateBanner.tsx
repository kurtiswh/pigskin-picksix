import { useEffect, useState } from 'react'
import { startVersionWatch } from '@/lib/versionCheck'

/**
 * Prompts a reload when this tab is running a build that is no longer deployed.
 * See src/lib/versionCheck.ts for why. Deliberately a prompt, never an
 * automatic refresh: yanking the page out from under someone mid-pick-sheet
 * would be worse than the staleness it fixes.
 */
export default function UpdateBanner() {
  const [stale, setStale] = useState(false)

  useEffect(() => startVersionWatch(() => setStale(true)), [])

  if (!stale) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]
                 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
                 bg-[#4B3621] text-white text-sm"
    >
      <span className="shrink-0">🔄</span>
      <span className="min-w-0">
        A newer version of Pigskin Pick Six is available. Reload before making picks.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="shrink-0 px-3 py-1 rounded bg-[#C9A04E] text-[#4B3621] font-semibold
                   hover:bg-[#d8b467] transition-colors"
      >
        Reload
      </button>
      <button
        onClick={() => setStale(false)}
        aria-label="Dismiss"
        title="Dismiss"
        className="shrink-0 text-white/60 hover:text-white text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  )
}
