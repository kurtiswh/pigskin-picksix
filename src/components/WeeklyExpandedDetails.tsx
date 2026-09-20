import { Lock, Clock, CheckCircle, XCircle, Minus, Ban } from 'lucide-react'
import { UserWeeklyPicks, WeeklyPickDetail } from '@/services/leaderboard.types'
import { formatRecord } from '@/lib/records'

interface WeeklyExpandedDetailsProps {
  data: UserWeeklyPicks
  isLoading?: boolean
}

function isPending(pick: WeeklyPickDetail) {
  return pick.game_status === 'scheduled' || pick.game_status === 'in_progress' || pick.result === null
}

function resultMeta(pick: WeeklyPickDetail) {
  // A dropped pick is shown so the sheet explains itself, but it scored nothing
  // and must not read like a result that counted.
  if (pick.dropped) return { icon: <Ban className="w-3.5 h-3.5 text-gray-400" />, label: 'Dropped', color: 'text-gray-400', row: 'bg-gray-50' }
  if (isPending(pick)) return { icon: <Clock className="w-3.5 h-3.5 text-gray-400" />, label: pick.game_status === 'in_progress' ? 'Live' : 'Pending', color: 'text-gray-500', row: '' }
  switch (pick.result) {
    case 'win':  return { icon: <CheckCircle className="w-3.5 h-3.5 text-green-600" />, label: 'Win',  color: 'text-green-700', row: 'bg-green-50/60' }
    case 'loss': return { icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,      label: 'Loss', color: 'text-red-600',   row: 'bg-red-50/50' }
    case 'push': return { icon: <Minus className="w-3.5 h-3.5 text-[#C9A04E]" />,      label: 'Push', color: 'text-[#8a6a1f]', row: 'bg-[#fff8ea]' }
    default:     return { icon: <Clock className="w-3.5 h-3.5 text-gray-400" />, label: '—', color: 'text-gray-500', row: '' }
  }
}

/**
 * The line as it applies to the team this player took, so "-3.5" sitting beside
 * "Ole Miss" reads as Ole Miss laying 3.5 with no header needed. games.spread is
 * stored against the HOME team (negative = home favored), so an away pick flips
 * the sign.
 *
 * Returns null rather than guessing when selected_team matches neither side:
 * showing the wrong half of a line is worse than showing no line at all.
 */
function lineForPick(p: WeeklyPickDetail): string | null {
  if (p.spread == null || !p.home_team || !p.away_team) return null
  if (p.selected_team !== p.home_team && p.selected_team !== p.away_team) return null
  const fromPick = p.selected_team === p.home_team ? p.spread : -p.spread
  if (fromPick === 0) return 'PK'
  return fromPick > 0 ? `+${fromPick}` : `${fromPick}`
}

/** Away-home, matching the "Away @ Home" order the game name is built in. */
function scoreForGame(p: WeeklyPickDetail): string | null {
  if (p.home_score == null || p.away_score == null) return null
  return `${p.away_score}-${p.home_score}`
}

export function WeeklyExpandedDetails({ data, isLoading = false }: WeeklyExpandedDetailsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-[#4B3621]" />
        <span className="ml-2 text-gray-600">Loading pick details…</span>
      </div>
    )
  }

  if (!data || !data.picks || data.picks.length === 0) {
    return <div className="text-center py-8 text-gray-500">No picks found for this week</div>
  }

  const dropped = data.picks.filter(p => p.dropped).length
  const picks = [...data.picks].sort((a, b) => {
    if (a.dropped !== b.dropped) return a.dropped ? 1 : -1
    if (a.is_lock && !b.is_lock) return -1
    if (!a.is_lock && b.is_lock) return 1
    return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
  })

  return (
    <div className="space-y-3">
      {/* Summary line (stacks on mobile) */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-semibold text-gray-900">{data.display_name}'s Week {data.week} picks</h4>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
          <span>Total <b className="text-[#4B3621] tabular-nums text-sm">{data.total_points}</b></span>
          <span>Record <b className="tabular-nums text-sm text-gray-700">{formatRecord(data.weekly_record)}</b></span>
          <span className="flex items-center gap-1">Lock <Lock className="w-3 h-3" /> <b className="tabular-nums text-sm text-gray-700">{formatRecord(data.lock_record)}</b></span>
        </div>
      </div>
      {dropped > 0 && (
        <p className="text-xs text-gray-500">
          {dropped === 1 ? 'One pick was' : `${dropped} picks were`} dropped by a commissioner adjustment —
          shown below for the record, but not counted in the total, record or lock.
        </p>
      )}

      {/* Picks: 2 columns on desktop, single column (stacked lines) on mobile */}
      <div className="rounded-xl border border-[#ece7de] bg-white overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-2">
          {picks.map((p, i) => {
            const r = resultMeta(p)
            const line = lineForPick(p)
            const score = scoreForGame(p)
            return (
              <div key={p.game_id} className={`px-3.5 py-2.5 border-b border-[#f0ece5] ${i % 2 === 1 ? 'xl:border-l xl:border-[#ece7de]' : ''} ${r.row}`}>
                <div className="flex flex-col gap-1 min-w-0 sm:flex-row sm:items-center sm:gap-3">
                  {/* Game + final score. The score rides with the matchup rather
                      than taking a column of its own: it is a fact about the
                      game, not about the pick, and a fifth column does not fit
                      on a phone. */}
                  <div className="flex items-center gap-1.5 min-w-0 sm:flex-1">
                    {p.is_lock && <Lock className="w-3.5 h-3.5 text-[#4B3621] shrink-0" />}
                    <span className={`font-medium truncate ${p.dropped ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{p.game_name}</span>
                    {score && (
                      <span className="ml-auto sm:ml-2 shrink-0 tabular-nums text-xs sm:text-sm text-gray-500">{score}</span>
                    )}
                  </div>
                  {/* Pick (with its line) / result / points. Widths step down on
                      phones so the row stays inside the card, which clips what
                      overflows. The team name truncates; the line never does,
                      since a half-shown number is worse than none. */}
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 text-xs sm:text-sm shrink-0 justify-end pl-5 sm:pl-0">
                    <span className="flex items-center justify-end gap-1 w-28 sm:w-44 shrink-0">
                      <span className="text-gray-600 truncate">{p.selected_team}</span>
                      {line && <span className="shrink-0 tabular-nums text-gray-400">{line}</span>}
                    </span>
                    <span className={`flex items-center gap-1 w-14 shrink-0 font-medium ${r.color}`}>{r.icon}{r.label}</span>
                    <span className={`font-bold tabular-nums w-8 shrink-0 text-right ${r.color}`}>{p.dropped ? '—' : p.points_earned}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
