import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserPickSet, PickDetail } from '@/types'

const RESULT_TEXT: Record<string, string> = {
  win: 'text-[#2E7D4F]', loss: 'text-[#B23A3A]', push: 'text-[#8a6a1f]', pending: 'text-charcoal-400',
}
const fmtSpread = (s: number | null) => (s == null ? '' : s > 0 ? `+${s}` : `${s}`)

/** One detailed row per pick: team (spread) vs opponent · final score · result · pts. */
function PickRow({ p }: { p: PickDetail }) {
  const rc = RESULT_TEXT[p.result || 'pending']
  const letter = p.result === 'win' ? 'W' : p.result === 'loss' ? 'L' : p.result === 'push' ? 'P' : '—'
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs sm:text-sm">
      <div className="flex items-center gap-1.5 min-w-0">
        {p.is_lock && <span title="Lock">🔒</span>}
        <span className="font-medium text-charcoal-800 truncate">
          {p.team}{p.spread != null && <span className="text-charcoal-500"> {fmtSpread(p.spread)}</span>}
        </span>
        {p.opponent && <span className="text-charcoal-400 truncate">vs {p.opponent}</span>}
      </div>
      <div className="flex items-center gap-3 shrink-0 tabular-nums">
        {p.teamScore != null && p.oppScore != null && (
          <span className="text-charcoal-500">{p.teamScore}–{p.oppScore}</span>
        )}
        <span className={`font-semibold w-4 text-center ${rc}`}>{letter}</span>
        <span className={`font-semibold w-10 text-right ${rc}`}>{p.points} pt{p.points === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}

/** Condensed, year-grouped pick-set history. Latest season expanded by default;
 *  each week expands to show the individual picks (email-style chips). Submitted
 *  date+time is shown only for the current season (older sets were bulk-imported). */
export default function PickSetsHistory({ pickSets }: { pickSets: UserPickSet[] }) {
  const seasons = [...new Set(pickSets.map(p => p.season))].sort((a, b) => b - a)
  const currentSeason = seasons[0]
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(new Set(currentSeason ? [currentSeason] : []))
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())

  if (pickSets.length === 0) {
    return <Card><CardContent className="p-8 text-center text-charcoal-500">No pick sets yet.</CardContent></Card>
  }

  const toggle = (set: Set<any>, setter: (s: any) => void, key: any) => {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <h3 className="font-semibold text-lg text-[#4B3621]">Pick Sets History</h3>
        {seasons.map(season => {
          const sets = pickSets.filter(p => p.season === season).sort((a, b) => b.week - a.week)
          const isOpen = openSeasons.has(season)
          const totalPts = sets.reduce((n, s) => n + (s.points || 0), 0)
          const w = sets.reduce((n, s) => n + s.wins, 0)
          const l = sets.reduce((n, s) => n + s.losses, 0)
          const p = sets.reduce((n, s) => n + s.pushes, 0)
          return (
            <div key={season} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => toggle(openSeasons, setOpenSeasons, season)}
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
                  {sets.map((ps, i) => {
                    const wk = `${season}-${ps.week}-${i}`
                    const wkOpen = openWeeks.has(wk)
                    return (
                      <div key={wk}>
                        <button
                          onClick={() => toggle(openWeeks, setOpenWeeks, wk)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-[#F8F7F3] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-charcoal-400 text-xs w-3">{wkOpen ? '▾' : '▸'}</span>
                            <span className="font-medium text-charcoal-800 w-14 shrink-0 text-left">Wk {ps.week}</span>
                            {ps.pickType === 'anonymous' && (
                              <Badge variant="secondary" className="bg-gray-400 text-white text-[10px] px-1.5 py-0">Anon</Badge>
                            )}
                            {!ps.isActive && (
                              <Badge variant="outline" className="text-red-600 border-red-300 text-[10px] px-1.5 py-0">Inactive</Badge>
                            )}
                            {season === currentSeason && ps.submitted_at && (
                              <span className="text-xs text-charcoal-400 hidden sm:inline">
                                {new Date(ps.submitted_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 shrink-0 tabular-nums">
                            <span className="text-charcoal-600">{ps.wins}-{ps.losses}-{ps.pushes}</span>
                            <span className="text-charcoal-500 w-12 text-right">🔒 {(ps.lockWins || 0)}-{(ps.lockLosses || 0)}</span>
                            <span className="font-semibold text-[#4B3621] w-14 text-right">{ps.points} pts</span>
                          </div>
                        </button>
                        {wkOpen && (
                          <div className="px-4 pb-3 pl-11 bg-[#fcfbf9]">
                            {ps.picks && ps.picks.length > 0 ? (
                              <div className="divide-y divide-[#eee9e0]">
                                {[...ps.picks].sort((a, b) => Number(b.is_lock) - Number(a.is_lock))
                                  .map((pk, j) => <PickRow key={j} p={pk} />)}
                              </div>
                            ) : (
                              <span className="text-xs text-charcoal-400">No pick detail available.</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
