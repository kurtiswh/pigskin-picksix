import { Trophy, Lock } from 'lucide-react'
import { UserWeeklyBreakdown } from '@/services/leaderboard.types'

interface SeasonExpandedDetailsProps {
  data: UserWeeklyBreakdown
  isLoading?: boolean
  asOfWeek?: number  // For historical context
  currentWeek?: number  // To show how far back we're looking
}

const GRID = 'grid grid-cols-[1fr_92px_72px_56px_60px] gap-2 items-center'

export function SeasonExpandedDetails({ data, isLoading = false, asOfWeek, currentWeek }: SeasonExpandedDetailsProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-[#4B3621]" />
        <span className="ml-2 text-gray-600">Loading weekly breakdown…</span>
      </div>
    )
  }

  if (!data || !data.weeks || data.weeks.length === 0) {
    return <div className="text-center py-8 text-gray-500">No weekly data available for this season</div>
  }

  const weeks = [...data.weeks].sort((a, b) => a.week - b.week)
  const totalPoints = weeks.reduce((sum, w) => sum + w.points, 0)
  const bestWeek = weeks.find(w => w.best_week)
  const averagePoints = weeks.length > 0 ? (totalPoints / weeks.length).toFixed(1) : '0'
  const isHistorical = asOfWeek && currentWeek && asOfWeek < currentWeek

  return (
    <div className="space-y-3">
      {/* Compact summary line */}
      <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
        <h4 className="font-semibold text-gray-900">
          {data.display_name}'s weekly breakdown
          {isHistorical && <span className="text-gray-400 font-normal"> · through Week {asOfWeek}</span>}
        </h4>
        <div className="flex items-center gap-5 text-xs text-gray-500">
          <span>Total <b className="text-[#4B3621] tabular-nums text-sm">{totalPoints}</b></span>
          <span>Avg/wk <b className="text-[#C9A04E] tabular-nums text-sm">{averagePoints}</b></span>
          {bestWeek && <span>Best <b className="text-[#C9A04E] tabular-nums text-sm">W{bestWeek.week} ({bestWeek.points})</b></span>}
        </div>
      </div>

      {/* Clean table */}
      <div className="rounded-xl border border-[#ece7de] overflow-hidden bg-white">
        <div className={`${GRID} px-3 py-2 bg-[#faf8f4] border-b border-[#ece7de] text-[10px] font-bold uppercase tracking-wider text-gray-500`}>
          <div>Week</div>
          <div>Record</div>
          <div>Lock</div>
          <div>Picks</div>
          <div className="text-right">Pts</div>
        </div>

        {weeks.map((w) => (
          <div
            key={w.week}
            className={`${GRID} px-3 py-2 border-b border-[#f0ece5] last:border-b-0 text-sm ${w.best_week ? 'bg-[#fff8ea]' : ''}`}
          >
            <div className="font-medium text-gray-900 flex items-center gap-1.5">
              {w.best_week && <Trophy className="w-3.5 h-3.5 text-[#C9A04E] shrink-0" />}
              Week {w.week}
            </div>
            <div className="text-gray-500 tabular-nums">{w.record}</div>
            <div className="text-gray-500 tabular-nums flex items-center gap-1">
              <Lock className="w-3 h-3 shrink-0" />{w.lock_record}
            </div>
            <div className="text-gray-500 tabular-nums">{w.picks_made}</div>
            <div className="text-right font-extrabold text-[#4B3621] tabular-nums">{w.points}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
