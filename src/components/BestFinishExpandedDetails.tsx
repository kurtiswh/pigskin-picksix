import React from 'react'
import { Trophy, Calendar, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { BestFinishWeeklyDetail } from '@/services/bestFinishService'

interface BestFinishExpandedDetailsProps {
  data: BestFinishWeeklyDetail[]
  displayName: string
  eligibleWeeks: number[]
  isLoading?: boolean
}

interface WeeklyPerformanceCardProps {
  week: BestFinishWeeklyDetail
  isWorstWeek?: boolean
  isBestWeek?: boolean
}

function WeeklyPerformanceCard({ week, isWorstWeek = false, isBestWeek = false }: WeeklyPerformanceCardProps) {
  return (
    <div className={`p-3 rounded-lg border ${
      isBestWeek
        ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 ring-1 ring-green-200'
        : isWorstWeek
        ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200 ring-1 ring-red-200'
        : 'bg-white border-gray-200 hover:border-gray-300'
    } transition-colors`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Week {week.week}</span>
          {isBestWeek && (
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
              <Trophy className="w-3 h-3 mr-1" />
              Best
            </Badge>
          )}
          {isWorstWeek && (
            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
              Worst
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <span className="font-bold text-lg text-[#4B3621]">{week.points}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Record</div>
          <div className="font-medium text-gray-900">{week.record}</div>
        </div>

        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center justify-center space-x-1">
            <Lock className="w-3 h-3" />
            <span>Lock</span>
          </div>
          <div className="font-medium text-gray-900">{week.lockRecord}</div>
        </div>

        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Picks</div>
          <div className="font-medium text-gray-900">{week.picksCount}</div>
        </div>
      </div>
    </div>
  )
}

export function BestFinishExpandedDetails({
  data,
  displayName,
  eligibleWeeks,
  isLoading = false
}: BestFinishExpandedDetailsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-[#4B3621]" />
          <span className="ml-2 text-gray-600">Loading weekly breakdown...</span>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No weekly data available for Best Finish competition</div>
      </div>
    )
  }

  // Calculate totals
  const totalPoints = data.reduce((sum, week) => sum + week.points, 0)
  const totalPicks = data.reduce((sum, week) => sum + week.picksCount, 0)
  const bestWeek = data.reduce((max, week) => week.points > max.points ? week : max, data[0])
  const worstWeek = data.reduce((min, week) => week.points < min.points ? week : min, data[0])
  const averagePoints = data.length > 0 ? (totalPoints / data.length).toFixed(1) : '0'

  // Calculate overall stats
  const totalWins = data.reduce((sum, week) => sum + week.wins, 0)
  const totalLosses = data.reduce((sum, week) => sum + week.losses, 0)
  const totalPushes = data.reduce((sum, week) => sum + week.pushes, 0)
  const winPercentage = totalWins + totalLosses > 0
    ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1)
    : '0.0'

  const lockWins = data.reduce((sum, week) => sum + week.lockWins, 0)
  const lockLosses = data.reduce((sum, week) => sum + week.lockLosses, 0)
  const lockWinPercentage = lockWins + lockLosses > 0
    ? ((lockWins / (lockWins + lockLosses)) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4">
      {/* Header with summary stats */}
      <div className="rounded-lg p-4 border bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold text-gray-900">{displayName}'s Best Finish Breakdown</h4>
            <p className="text-sm text-gray-600 mt-1">
              {data.length} week{data.length !== 1 ? 's' : ''} • Weeks {eligibleWeeks.join(', ')}
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
              🏆 4th Quarter
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Points</div>
            <div className="font-bold text-lg text-[#4B3621]">{totalPoints}</div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Avg/Week</div>
            <div className="font-bold text-lg text-[#C9A04E]">{averagePoints}</div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Win %</div>
            <div className="font-bold text-lg text-green-600">{winPercentage}%</div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Lock Win %</div>
            <div className="font-bold text-lg text-blue-600">{lockWinPercentage}%</div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Best Week</div>
            <div className="font-bold text-lg text-green-600">
              W{bestWeek.week} ({bestWeek.points})
            </div>
          </div>
        </div>
      </div>

      {/* Weekly performance grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-gray-200 pb-1">
          <h5 className="font-medium text-gray-900 text-sm uppercase tracking-wide">
            Weekly Performance
          </h5>
          <span className="text-xs text-amber-700 bg-amber-100 px-2 py-1 rounded">
            {data.length} of {eligibleWeeks.length} weeks
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
          {data
            .sort((a, b) => a.week - b.week)
            .map((week) => (
              <WeeklyPerformanceCard
                key={week.week}
                week={week}
                isBestWeek={week.week === bestWeek.week && data.length > 1}
                isWorstWeek={week.week === worstWeek.week && data.length > 1 && bestWeek.week !== worstWeek.week}
              />
            ))}
        </div>
      </div>

      {/* Performance summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h5 className="font-medium text-gray-900 text-sm mb-3">Competition Summary</h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Overall Record:</span>
              <span className="font-medium">{totalWins}-{totalLosses}-{totalPushes}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Win Percentage:</span>
              <span className="font-medium">{winPercentage}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Picks:</span>
              <span className="font-medium">{totalPicks}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Lock Record:
              </span>
              <span className="font-medium">{lockWins}-{lockLosses}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Lock Win %:
              </span>
              <span className="font-medium">{lockWinPercentage}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Points Range:</span>
              <span className="font-medium">{worstWeek.points} - {bestWeek.points}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tiebreaker Info */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <div className="text-xs text-blue-800">
          <strong>Tiebreaker Rules:</strong> Total Points → Win % ({winPercentage}%) → Lock Win % ({lockWinPercentage}%) → Alphabetical
        </div>
      </div>
    </div>
  )
}
