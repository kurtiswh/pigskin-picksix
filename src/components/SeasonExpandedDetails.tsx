import React from 'react'
import { Trophy, TrendingUp, Lock, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { UserWeeklyBreakdown, WeeklyPerformance } from '@/services/leaderboardService.emergency'

interface SeasonExpandedDetailsProps {
  data: UserWeeklyBreakdown
  isLoading?: boolean
}

interface WeeklyPerformanceCardProps {
  week: WeeklyPerformance
  isBestWeek?: boolean
}

function WeeklyPerformanceCard({ week, isBestWeek = false }: WeeklyPerformanceCardProps) {
  return (
    <div className={`p-3 rounded-lg border ${
      isBestWeek 
        ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 ring-1 ring-yellow-200' 
        : 'bg-white border-gray-200 hover:border-gray-300'
    } transition-colors`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-gray-900">Week {week.week}</span>
          {isBestWeek && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
              <Trophy className="w-3 h-3 mr-1" />
              Best Week
            </Badge>
          )}
        </div>
        <div className="flex items-center space-x-1">
          <TrendingUp className="w-4 h-4 text-[#4B3621]" />
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
          <div className="font-medium text-gray-900">{week.lock_record}</div>
        </div>
        
        <div className="text-center">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Picks</div>
          <div className="font-medium text-gray-900">{week.picks_made}</div>
        </div>
      </div>
    </div>
  )
}

export function SeasonExpandedDetails({ data, isLoading = false }: SeasonExpandedDetailsProps) {
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

  if (!data || !data.weeks || data.weeks.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No weekly data available for this season</div>
      </div>
    )
  }

  // Calculate season totals
  const totalPoints = data.weeks.reduce((sum, week) => sum + week.points, 0)
  const totalPicks = data.weeks.reduce((sum, week) => sum + week.picks_made, 0)
  const bestWeek = data.weeks.find(week => week.best_week)
  const averagePoints = totalPicks > 0 ? (totalPoints / data.weeks.length).toFixed(1) : '0'

  return (
    <div className="space-y-4">
      {/* Header with summary stats */}
      <div className="bg-gradient-to-r from-[#4B3621]/5 to-[#C9A04E]/5 rounded-lg p-4 border border-[#4B3621]/10">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">{data.display_name}'s Season Breakdown</h4>
          <Badge variant="outline" className="bg-[#4B3621] text-white border-[#4B3621]">
            {data.weeks.length} weeks
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Points</div>
            <div className="font-bold text-lg text-[#4B3621]">{totalPoints}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Avg/Week</div>
            <div className="font-bold text-lg text-[#C9A04E]">{averagePoints}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Picks</div>
            <div className="font-bold text-lg text-gray-700">{totalPicks}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Best Week</div>
            <div className="font-bold text-lg text-yellow-600">
              {bestWeek ? `W${bestWeek.week} (${bestWeek.points})` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Weekly performance grid */}
      <div className="space-y-3">
        <h5 className="font-medium text-gray-900 text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
          Weekly Performance
        </h5>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.weeks
            .sort((a, b) => a.week - b.week)
            .map((week) => (
              <WeeklyPerformanceCard
                key={week.week}
                week={week}
                isBestWeek={week.best_week}
              />
            ))}
        </div>
      </div>

      {/* Performance insights */}
      {data.weeks.length > 2 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="font-medium text-gray-900 text-sm mb-2">Performance Insights</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">Consistency Score:</span>
              <span className="ml-2 font-medium">
                {(() => {
                  const pointsArray = data.weeks.map(w => w.points)
                  const avg = pointsArray.reduce((a, b) => a + b) / pointsArray.length
                  const variance = pointsArray.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / pointsArray.length
                  const stdDev = Math.sqrt(variance)
                  const consistency = Math.max(0, 100 - (stdDev / avg) * 100)
                  return `${consistency.toFixed(0)}%`
                })()}
              </span>
            </div>
            
            <div>
              <span className="text-gray-600">Trend:</span>
              <span className="ml-2 font-medium">
                {(() => {
                  const recent = data.weeks.slice(-3).reduce((sum, w) => sum + w.points, 0) / Math.min(3, data.weeks.length)
                  const early = data.weeks.slice(0, 3).reduce((sum, w) => sum + w.points, 0) / Math.min(3, data.weeks.length)
                  return recent > early ? '📈 Improving' : recent < early ? '📉 Declining' : '➡️ Steady'
                })()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}