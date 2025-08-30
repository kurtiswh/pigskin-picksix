import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'

interface Game {
  id: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: string
}

interface PickStats {
  total_picks: number
  home_picks: number
  away_picks: number
  lock_picks: number
  home_lock_picks: number
  away_lock_picks: number
  points_awarded: number
  winner_team: string | null
  spread_covered: boolean | null
}

interface PickStatsWidgetProps {
  stats: PickStats
  game: Game
  loading?: boolean
}

export default function PickStatsWidget({ stats, game, loading }: PickStatsWidgetProps) {
  if (loading) {
    return (
      <div className="border-t pt-3 space-y-2">
        <div className="h-4 bg-stone-200 rounded animate-pulse"></div>
        <div className="h-4 bg-stone-200 rounded w-3/4 animate-pulse"></div>
      </div>
    )
  }

  if (stats.total_picks === 0) {
    return (
      <div className="border-t pt-3 text-center text-sm text-charcoal-500">
        No picks recorded for this game
      </div>
    )
  }

  const homePickPercentage = Math.round((stats.home_picks / stats.total_picks) * 100)
  const awayPickPercentage = Math.round((stats.away_picks / stats.total_picks) * 100)
  
  const homeLockPercentage = stats.lock_picks > 0 
    ? Math.round((stats.home_lock_picks / stats.lock_picks) * 100) 
    : 0
  const awayLockPercentage = stats.lock_picks > 0 
    ? Math.round((stats.away_lock_picks / stats.lock_picks) * 100) 
    : 0

  const getWinnerIndicator = (team: string) => {
    if (stats.winner_team === team) {
      return stats.spread_covered ? "✅" : "⚖️"
    }
    return ""
  }


  return (
    <div className="border-t pt-3 space-y-3">
      <div className="text-sm font-medium text-charcoal-700 text-center">
        Pick Statistics
      </div>

      {/* Pick Distribution */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-charcoal-600">
          Pick Distribution ({stats.total_picks} total)
        </div>
        
        <div className="space-y-2">
          {/* Away Team Stats */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="font-medium">{game.away_team}</span>
              {getWinnerIndicator(game.away_team)}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-charcoal-600">{stats.away_picks}</span>
              <span className="text-charcoal-500">({awayPickPercentage}%)</span>
            </div>
          </div>
          <Progress 
            value={awayPickPercentage} 
            className="h-2"
          />

          {/* Home Team Stats */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="font-medium">{game.home_team}</span>
              {getWinnerIndicator(game.home_team)}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-charcoal-600">{stats.home_picks}</span>
              <span className="text-charcoal-500">({homePickPercentage}%)</span>
            </div>
          </div>
          <Progress 
            value={homePickPercentage} 
            className="h-2"
          />
        </div>
      </div>

      {/* Lock Distribution (if any locks exist) */}
      {stats.lock_picks > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-charcoal-600">
            Lock Distribution ({stats.lock_picks} total) 🔒
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>{game.away_team}</span>
              <Badge variant="outline" className="text-xs">
                {stats.away_lock_picks} ({awayLockPercentage}%)
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>{game.home_team}</span>
              <Badge variant="outline" className="text-xs">
                {stats.home_lock_picks} ({homeLockPercentage}%)
              </Badge>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}