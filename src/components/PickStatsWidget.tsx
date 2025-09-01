import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

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

// Custom segmented progress bar component
function SegmentedProgressBar({ 
  totalValue, 
  lockValue, 
  regularValue, 
  className 
}: {
  totalValue: number
  lockValue: number
  regularValue: number
  className?: string
}) {
  if (totalValue === 0) return null
  
  const lockPercentage = (lockValue / totalValue) * 100
  const regularPercentage = (regularValue / totalValue) * 100
  
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-stone-200", className)}>
      {/* Lock section (left side, gold color) */}
      {lockValue > 0 && (
        <div
          className="absolute top-0 left-0 h-full bg-gold-500 transition-all"
          style={{ width: `${lockPercentage}%` }}
        />
      )}
      {/* Regular picks section (fills remaining space) */}
      {regularValue > 0 && (
        <div
          className="absolute top-0 h-full bg-pigskin-500 transition-all"
          style={{ 
            left: `${lockPercentage}%`,
            width: `${regularPercentage}%`
          }}
        />
      )}
    </div>
  )
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
  
  // Calculate regular picks (non-lock picks)
  const homeRegularPicks = stats.home_picks - stats.home_lock_picks
  const awayRegularPicks = stats.away_picks - stats.away_lock_picks

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

      {/* Pick Distribution with combined locks */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-charcoal-600 flex items-center justify-between">
          <span>Pick Distribution ({stats.total_picks} total)</span>
          {stats.lock_picks > 0 && (
            <span className="text-charcoal-500">
              🔒 {stats.lock_picks} locks
            </span>
          )}
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
              {stats.away_lock_picks > 0 && (
                <span className="text-xs text-charcoal-500">
                  {stats.away_lock_picks} 🔒
                </span>
              )}
            </div>
          </div>
          <SegmentedProgressBar
            totalValue={stats.total_picks}
            lockValue={stats.away_lock_picks}
            regularValue={awayRegularPicks}
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
              {stats.home_lock_picks > 0 && (
                <span className="text-xs text-charcoal-500">
                  {stats.home_lock_picks} 🔒
                </span>
              )}
            </div>
          </div>
          <SegmentedProgressBar
            totalValue={stats.total_picks}
            lockValue={stats.home_lock_picks}
            regularValue={homeRegularPicks}
            className="h-2"
          />
        </div>
        
        {/* Legend for the colors */}
        {stats.lock_picks > 0 && (
          <div className="flex items-center justify-center gap-4 text-xs text-charcoal-500 pt-1">
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 bg-gold-500 rounded-sm"></div>
              <span>Lock Picks</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 bg-pigskin-500 rounded-sm"></div>
              <span>Regular Picks</span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}