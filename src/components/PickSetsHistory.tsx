import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserPickSet } from '@/types'

/** Condensed, year-grouped pick-set history. Latest season expanded by default.
 *  Submitted timestamps are only shown for the current season (older sets were
 *  bulk-imported, so their submit time isn't meaningful). */
export default function PickSetsHistory({ pickSets }: { pickSets: UserPickSet[] }) {
  const seasons = [...new Set(pickSets.map(p => p.season))].sort((a, b) => b - a)
  const currentSeason = seasons[0]
  const [expanded, setExpanded] = useState<Set<number>>(new Set(currentSeason ? [currentSeason] : []))

  if (pickSets.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-charcoal-500">No pick sets yet.</CardContent></Card>
    )
  }

  const toggle = (s: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(s) ? next.delete(s) : next.add(s)
    return next
  })

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <h3 className="font-semibold text-lg text-[#4B3621]">Pick Sets History</h3>
        {seasons.map(season => {
          const sets = pickSets.filter(p => p.season === season)
            .sort((a, b) => b.week - a.week)
          const isOpen = expanded.has(season)
          const totalPts = sets.reduce((n, s) => n + (s.points || 0), 0)
          const w = sets.reduce((n, s) => n + s.wins, 0)
          const l = sets.reduce((n, s) => n + s.losses, 0)
          const p = sets.reduce((n, s) => n + s.pushes, 0)
          return (
            <div key={season} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(season)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F8F7F3] hover:bg-[#efece5] transition-colors"
              >
                <span className="font-semibold text-[#4B3621]">{season}</span>
                <span className="flex items-center gap-3 text-sm text-charcoal-600">
                  <span className="tabular-nums">{w}-{l}-{p}</span>
                  <span className="font-semibold text-[#4B3621] tabular-nums">{totalPts} pts</span>
                  <span className="text-charcoal-400">{isOpen ? '▲' : '▼'}</span>
                </span>
              </button>

              {isOpen && (
                <div className="divide-y">
                  {sets.map((ps, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-charcoal-800 w-16 shrink-0">Wk {ps.week}</span>
                        {ps.pickType === 'anonymous' && (
                          <Badge variant="secondary" className="bg-gray-400 text-white text-[10px] px-1.5 py-0">Anon</Badge>
                        )}
                        {!ps.isActive && (
                          <Badge variant="outline" className="text-red-600 border-red-300 text-[10px] px-1.5 py-0">Inactive</Badge>
                        )}
                        {ps.conflictStatus === 'active_conflict' && (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px] px-1.5 py-0">Conflict</Badge>
                        )}
                        {season === currentSeason && ps.submitted_at && (
                          <span className="text-xs text-charcoal-400 hidden sm:inline">
                            {new Date(ps.submitted_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 tabular-nums">
                        <span className="text-charcoal-600">{ps.wins}-{ps.losses}-{ps.pushes}</span>
                        <span className="text-charcoal-500 w-12 text-right">🔒 {(ps.lockWins || 0)}-{(ps.lockLosses || 0)}</span>
                        <span className="font-semibold text-[#4B3621] w-14 text-right">{ps.points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
