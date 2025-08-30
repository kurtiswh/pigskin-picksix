import { Progress } from '@/components/ui/progress'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PickStatisticsBarProps {
  homeTeam: string
  awayTeam: string
  homeTeamPicks: number
  homeTeamLocks: number
  awayTeamPicks: number
  awayTeamLocks: number
  totalPicks: number
  className?: string
  showPercentages?: boolean
  compact?: boolean
}

export default function PickStatisticsBar({
  homeTeam,
  awayTeam,
  homeTeamPicks,
  homeTeamLocks,
  awayTeamPicks,
  awayTeamLocks,
  totalPicks,
  className,
  showPercentages = true,
  compact = false
}: PickStatisticsBarProps) {
  // Calculate totals including locks
  const homeTotalPicks = homeTeamPicks + homeTeamLocks
  const awayTotalPicks = awayTeamPicks + awayTeamLocks
  
  // Calculate percentages
  const homePercentage = totalPicks > 0 ? Math.round((homeTotalPicks / totalPicks) * 100) : 0
  const awayPercentage = totalPicks > 0 ? Math.round((awayTotalPicks / totalPicks) * 100) : 0
  
  // Determine which team is favored by picks
  const homeFavored = homeTotalPicks > awayTotalPicks
  const awayFavored = awayTotalPicks > homeTotalPicks
  
  if (compact) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1">
            {homeTotalPicks}
            {homeTeamLocks > 0 && (
              <span className="flex items-center text-amber-500">
                ({homeTeamLocks}<Lock className="w-2.5 h-2.5" />)
              </span>
            )}
          </span>
          <span className="text-xs font-medium">
            {totalPicks} {totalPicks === 1 ? 'pick' : 'picks'}
          </span>
          <span className="flex items-center gap-1">
            {awayTotalPicks}
            {awayTeamLocks > 0 && (
              <span className="flex items-center text-amber-500">
                ({awayTeamLocks}<Lock className="w-2.5 h-2.5" />)
              </span>
            )}
          </span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-muted">
          {homeTotalPicks > 0 && (
            <div 
              className="bg-blue-500 transition-all duration-300"
              style={{ width: `${homePercentage}%` }}
            />
          )}
          {awayTotalPicks > 0 && (
            <div 
              className="bg-red-500 transition-all duration-300 ml-auto"
              style={{ width: `${awayPercentage}%` }}
            />
          )}
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with total picks */}
      <div className="text-center">
        <span className="text-sm font-medium text-muted-foreground">
          Pick Distribution
        </span>
        {totalPicks > 0 && (
          <span className="text-xs text-muted-foreground ml-2">
            ({totalPicks} total)
          </span>
        )}
      </div>
      
      {/* Pick statistics bar */}
      <div className="space-y-2">
        {/* Team labels and counts */}
        <div className="flex justify-between items-center text-sm">
          <div className={cn(
            "flex items-center gap-2",
            homeFavored && "font-semibold"
          )}>
            <span className={cn(
              "transition-colors",
              homeFavored ? "text-blue-600" : "text-muted-foreground"
            )}>
              {homeTeam}
            </span>
            <div className="flex items-center gap-1 text-xs">
              <span className={cn(
                homeFavored ? "text-blue-600" : "text-muted-foreground"
              )}>
                {homeTotalPicks}
              </span>
              {homeTeamLocks > 0 && (
                <span className="flex items-center gap-0.5 text-amber-500">
                  ({homeTeamLocks}
                  <Lock className="w-3 h-3" />)
                </span>
              )}
              {showPercentages && totalPicks > 0 && (
                <span className="text-muted-foreground">
                  • {homePercentage}%
                </span>
              )}
            </div>
          </div>
          
          <div className={cn(
            "flex items-center gap-2",
            awayFavored && "font-semibold"
          )}>
            <div className="flex items-center gap-1 text-xs">
              {showPercentages && totalPicks > 0 && (
                <span className="text-muted-foreground">
                  {awayPercentage}% •
                </span>
              )}
              {awayTeamLocks > 0 && (
                <span className="flex items-center gap-0.5 text-amber-500">
                  <Lock className="w-3 h-3" />
                  {awayTeamLocks})
                </span>
              )}
              <span className={cn(
                awayFavored ? "text-red-600" : "text-muted-foreground"
              )}>
                {awayTotalPicks}
              </span>
            </div>
            <span className={cn(
              "transition-colors",
              awayFavored ? "text-red-600" : "text-muted-foreground"
            )}>
              {awayTeam}
            </span>
          </div>
        </div>
        
        {/* Visual bar */}
        {totalPicks > 0 ? (
          <div className="flex h-6 rounded-lg overflow-hidden bg-muted/50 border">
            {homeTotalPicks > 0 && (
              <div 
                className={cn(
                  "flex items-center justify-start transition-all duration-500",
                  homeFavored ? "bg-blue-500" : "bg-blue-400 opacity-80"
                )}
                style={{ width: `${homePercentage}%` }}
              >
                {homePercentage >= 20 && (
                  <span className="text-xs text-white font-medium ml-2">
                    {homePercentage}%
                  </span>
                )}
              </div>
            )}
            {awayTotalPicks > 0 && (
              <div 
                className={cn(
                  "flex items-center justify-end transition-all duration-500 ml-auto",
                  awayFavored ? "bg-red-500" : "bg-red-400 opacity-80"
                )}
                style={{ width: `${awayPercentage}%` }}
              >
                {awayPercentage >= 20 && (
                  <span className="text-xs text-white font-medium mr-2">
                    {awayPercentage}%
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-6 rounded-lg overflow-hidden bg-muted/30 border border-dashed items-center justify-center">
            <span className="text-xs text-muted-foreground">No picks yet</span>
          </div>
        )}
        
        {/* Lock indicator legend */}
        {(homeTeamLocks > 0 || awayTeamLocks > 0) && (
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Lock className="w-3 h-3 text-amber-500" />
            <span>indicates lock picks</span>
          </div>
        )}
      </div>
    </div>
  )
}