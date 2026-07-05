import { Trophy, Lock } from 'lucide-react'
import { UserWeeklyBreakdown } from '@/services/leaderboard.types'

interface SeasonExpandedDetailsProps {
  data: UserWeeklyBreakdown
  isLoading?: boolean
  asOfWeek?: number  // For historical context
  currentWeek?: number  // To show how far back we're looking
}

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
      {/* Summary line (stacks on mobile) */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="font-semibold text-gray-900">
          {data.display_name}'s weekly breakdown
          {isHistorical && <span className="text-gray-400 font-normal"> · through Week {asOfWeek}</span>}
        </h4>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
          <span>Total <b className="text-[#4B3621] tabular-nums text-sm">{totalPoints}</b></span>
          <span>Avg/wk <b className="text-[#C9A04E] tabular-nums text-sm">{averagePoints}</b></span>
          {bestWeek && <span>Best <b className="text-[#C9A04E] tabular-nums text-sm">W{bestWeek.week} ({bestWeek.points})</b></span>}
        </div>
      </div>

      {/* Weeks: 2 columns on desktop to fill the width, single column on mobile */}
      <div className="rounded-xl border border-[#ece7de] bg-white overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {weeks.map((w, i) => (
            <div
              key={w.week}
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 border-b border-[#f0ece5] ${i % 2 === 1 ? 'lg:border-l lg:border-[#ece7de]' : ''} ${w.best_week ? 'bg-[#fff8ea]' : ''}`}
            >
              <div className="flex items-center gap-1.5 font-medium text-gray-900 shrink-0">
                {w.best_week && <Trophy className="w-3.5 h-3.5 text-[#C9A04E] shrink-0" />}
                <span className="whitespace-nowrap">Week {w.week}</span>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 text-sm tabular-nums shrink-0">
                <span className="text-gray-500 w-12 text-right">{w.record}</span>
                <span className="text-gray-500 w-12 flex items-center justify-end gap-1"><Lock className="w-3 h-3" />{w.lock_record}</span>
                <span className="font-extrabold text-[#4B3621] w-10 text-right">{w.points}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[11px] text-gray-400 flex items-center gap-4 px-1">
        <span>Record</span><span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Lock</span><span>Points</span>
      </div>
    </div>
  )
}
