import React from 'react'
import { Lock, Clock, CheckCircle, XCircle, Minus, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { UserWeeklyPicks, WeeklyPickDetail } from '@/services/weeklyLeaderboardService.emergency'

interface WeeklyExpandedDetailsProps {
  data: UserWeeklyPicks
  isLoading?: boolean
}

interface PickCardProps {
  pick: WeeklyPickDetail
}

function getResultIcon(result: string | null, gameStatus: string) {
  // Treat scheduled AND in_progress games as pending
  if (gameStatus === 'scheduled' || gameStatus === 'in_progress' || result === null) {
    return <Clock className="w-4 h-4 text-gray-400" />
  }

  switch (result) {
    case 'win':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'loss':
      return <XCircle className="w-4 h-4 text-red-500" />
    case 'push':
      return <Minus className="w-4 h-4 text-yellow-500" />
    default:
      return <Clock className="w-4 h-4 text-gray-400" />
  }
}

function getResultColor(result: string | null, gameStatus: string) {
  // Treat scheduled AND in_progress games as pending
  if (gameStatus === 'scheduled' || gameStatus === 'in_progress' || result === null) {
    return 'text-gray-600'
  }

  switch (result) {
    case 'win':
      return 'text-green-700'
    case 'loss':
      return 'text-red-700'
    case 'push':
      return 'text-yellow-700'
    default:
      return 'text-gray-600'
  }
}

function getGameStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Final</Badge>
    case 'in_progress':
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">Live</Badge>
    case 'scheduled':
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">Scheduled</Badge>
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">{status}</Badge>
  }
}

function PickCard({ pick }: PickCardProps) {
  const gameTime = new Date(pick.kickoff_time).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })

  return (
    <div className={`p-4 rounded-lg border transition-colors ${
      pick.game_status === 'in_progress' || pick.game_status === 'scheduled'
        ? 'bg-white border-gray-200 hover:border-gray-300'
        : pick.result === 'win'
        ? 'bg-green-50 border-green-200'
        : pick.result === 'loss'
        ? 'bg-red-50 border-red-200'
        : pick.result === 'push'
        ? 'bg-yellow-50 border-yellow-200'
        : 'bg-white border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getResultIcon(pick.result, pick.game_status)}
          <span className="font-medium text-gray-900">{pick.game_name}</span>
          {pick.is_lock && (
            <Badge variant="outline" className="bg-[#4B3621] text-white border-[#4B3621]">
              <Lock className="w-3 h-3 mr-1" />
              LOCK
            </Badge>
          )}
        </div>
        {getGameStatusBadge(pick.game_status)}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Selected Team</div>
          <div className="font-semibold text-gray-900">{pick.selected_team}</div>
        </div>
        
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Points Earned</div>
          <div className={`font-bold text-lg ${getResultColor(pick.result, pick.game_status)}`}>
            {pick.points_earned}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-1 text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>{gameTime}</span>
        </div>
        
        {pick.result && pick.game_status === 'completed' && (
          <div className={`font-medium uppercase tracking-wide ${getResultColor(pick.result, pick.game_status)}`}>
            {pick.result === 'push' ? 'Push' : pick.result}
          </div>
        )}
      </div>
    </div>
  )
}

export function WeeklyExpandedDetails({ data, isLoading = false }: WeeklyExpandedDetailsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-[#4B3621]" />
          <span className="ml-2 text-gray-600">Loading pick details...</span>
        </div>
      </div>
    )
  }

  if (!data || !data.picks || data.picks.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">No picks found for this week</div>
      </div>
    )
  }

  // Calculate pick statistics
  const completedPicks = data.picks.filter(p => p.result !== null)
  const lockPicks = data.picks.filter(p => p.is_lock)
  const winningPicks = data.picks.filter(p => p.result === 'win')
  const lockWins = data.picks.filter(p => p.result === 'win' && p.is_lock)

  return (
    <div className="space-y-4">
      {/* Header with summary stats */}
      <div className="bg-gradient-to-r from-[#4B3621]/5 to-[#C9A04E]/5 rounded-lg p-4 border border-[#4B3621]/10">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">{data.display_name}'s Week {data.week} Picks</h4>
          <Badge variant="outline" className="bg-[#4B3621] text-white border-[#4B3621]">
            {data.picks.length} picks
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Total Points</div>
            <div className="font-bold text-lg text-[#4B3621]">{data.total_points}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Record</div>
            <div className="font-bold text-lg text-[#C9A04E]">{data.weekly_record}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide flex items-center justify-center space-x-1">
              <Lock className="w-3 h-3" />
              <span>Lock</span>
            </div>
            <div className="font-bold text-lg text-gray-700">{data.lock_record}</div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Win Rate</div>
            <div className="font-bold text-lg text-green-600">
              {completedPicks.length > 0 
                ? `${Math.round((winningPicks.length / completedPicks.length) * 100)}%`
                : 'N/A'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Individual picks */}
      <div className="space-y-3">
        <h5 className="font-medium text-gray-900 text-sm uppercase tracking-wide border-b border-gray-200 pb-1">
          Individual Picks
        </h5>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.picks
            .sort((a, b) => {
              // Sort by lock status (locks first), then by kickoff time
              if (a.is_lock && !b.is_lock) return -1
              if (!a.is_lock && b.is_lock) return 1
              return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
            })
            .map((pick) => (
              <PickCard key={pick.game_id} pick={pick} />
            ))}
        </div>
      </div>

      {/* Pick insights */}
      {data.picks.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h5 className="font-medium text-gray-900 text-sm mb-2">Pick Analysis</h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-600">Lock Performance:</span>
              <span className="ml-2 font-medium">
                {lockPicks.length > 0 
                  ? `${lockWins.length}/${lockPicks.length} (${Math.round((lockWins.length / lockPicks.length) * 100)}%)`
                  : 'No locks'
                }
              </span>
            </div>
            
            <div>
              <span className="text-gray-600">Highest Scoring Pick:</span>
              <span className="ml-2 font-medium">
                {(() => {
                  const maxPoints = Math.max(...data.picks.map(p => p.points_earned))
                  const topPick = data.picks.find(p => p.points_earned === maxPoints)
                  return topPick ? `${topPick.selected_team} (${maxPoints}pts)` : 'N/A'
                })()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}