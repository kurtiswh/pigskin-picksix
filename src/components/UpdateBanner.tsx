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

  // The outer layer spans the viewport so the card can be full-width on phones.
  // (A left-1/2 + translate centered box is capped at half the viewport width,
  // which squeezed the text into a tall sliver on mobile.)
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4
                 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div
        role="status"
        className="pointer-events-auto w-full max-w-xl
                   flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg shadow-lg
                   bg-[#4B3621] text-white text-sm"
      >
        <div className="flex items-start gap-3 min-w-0 sm:flex-1">
          <span className="shrink-0">🔄</span>
          <span className="min-w-0 flex-1">
            A newer version of Pigskin Pick Six is available. Reload before making picks.
          </span>
          <button
            onClick={() => setStale(false)}
            aria-label="Dismiss"
            title="Dismiss"
            className="shrink-0 text-white/60 hover:text-white text-lg leading-none px-1 sm:hidden"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => window.location.reload()}
            className="flex-1 sm:flex-none px-4 py-2 sm:py-1 rounded bg-[#C9A04E] text-[#4B3621] font-semibold
                       hover:bg-[#d8b467] transition-colors"
          >
            Reload
          </button>
          <button
            onClick={() => setStale(false)}
            aria-label="Dismiss"
            title="Dismiss"
            className="hidden sm:block shrink-0 text-white/60 hover:text-white text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
