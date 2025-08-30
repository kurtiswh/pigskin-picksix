import { cn } from '@/lib/utils'
import { Lock, TrendingUp, TrendingDown } from 'lucide-react'

interface GamePickStatisticsProps {
  homeTeam: string
  awayTeam: string
  homeTeamPicks: number
  homeTeamLocks: number
  awayTeamPicks: number
  awayTeamLocks: number
  totalPicks: number
  spread: number
  winner?: 'home' | 'away' | null
  className?: string
}

export default function GamePickStatistics({
  homeTeam,
  awayTeam,
  homeTeamPicks,
  homeTeamLocks,
  awayTeamPicks,
  awayTeamLocks,
  totalPicks,
  spread,
  winner,
  className
}: GamePickStatisticsProps) {
  // Calculate totals including locks
  const homeTotalPicks = homeTeamPicks + homeTeamLocks
  const awayTotalPicks = awayTeamPicks + awayTeamLocks
  
  // Calculate percentages
  const homePercentage = totalPicks > 0 ? Math.round((homeTotalPicks / totalPicks) * 100) : 0
  const awayPercentage = totalPicks > 0 ? Math.round((awayTotalPicks / totalPicks) * 100) : 0
  
  // Determine which team is favored by picks
  const pickFavorite = homeTotalPicks > awayTotalPicks ? 'home' : awayTotalPicks > homeTotalPicks ? 'away' : null
  
  // Determine spread favorite (negative spread = home favored, positive = away favored)
  const spreadFavorite = spread < 0 ? 'home' : spread > 0 ? 'away' : null
  
  // Check if public is fading the favorite
  const isFadingFavorite = spreadFavorite && pickFavorite && spreadFavorite !== pickFavorite
  
  // Format spread display
  const getSpreadDisplay = (team: 'home' | 'away') => {
    if (team === 'home') {
      return spread > 0 ? `+${spread}` : `${spread}`
    } else {
      return spread < 0 ? `+${Math.abs(spread)}` : `-${spread}`
    }
  }
  
  return (
    <div className={cn("bg-white rounded-lg border p-4 space-y-3", className)}>
      {/* Title Row */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Pick Distribution</h3>
        {isFadingFavorite && (
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
            Fading Favorite
          </span>
        )}
      </div>
      
      {/* Main Stats Row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {/* Away Team Stats */}
        <div className={cn(
          "space-y-1",
          winner === 'away' && "text-green-600",
          winner === 'home' && "text-red-600"
        )}>
          <div className="font-bold text-2xl">{awayPercentage}%</div>
          <div className="text-xs font-medium truncate">{awayTeam}</div>
          <div className="text-xs text-muted-foreground">{getSpreadDisplay('away')}</div>
          <div className="flex items-center justify-center gap-1 text-xs">
            <span>{awayTotalPicks}</span>
            {awayTeamLocks > 0 && (
              <span className="flex items-center text-amber-500">
                ({awayTeamLocks}<Lock className="w-2.5 h-2.5" />)
              </span>
            )}
          </div>
        </div>
        
        {/* Visual Bar */}
        <div className="flex items-center">
          <div className="w-full space-y-2">
            <div className="text-xs text-center text-muted-foreground">
              {totalPicks} {totalPicks === 1 ? 'pick' : 'picks'}
            </div>
            <div className="flex h-4 rounded-full overflow-hidden bg-gray-100">
              {awayTotalPicks > 0 && (
                <div 
                  className={cn(
                    "transition-all duration-500",
                    winner === 'away' ? "bg-green-500" : 
                    winner === 'home' ? "bg-red-400" : 
                    pickFavorite === 'away' ? "bg-blue-500" : "bg-blue-400"
                  )}
                  style={{ width: `${awayPercentage}%` }}
                />
              )}
              {homeTotalPicks > 0 && (
                <div 
                  className={cn(
                    "transition-all duration-500 ml-auto",
                    winner === 'home' ? "bg-green-500" : 
                    winner === 'away' ? "bg-red-400" : 
                    pickFavorite === 'home' ? "bg-blue-500" : "bg-blue-400"
                  )}
                  style={{ width: `${homePercentage}%` }}
                />
              )}
            </div>
          </div>
        </div>
        
        {/* Home Team Stats */}
        <div className={cn(
          "space-y-1",
          winner === 'home' && "text-green-600",
          winner === 'away' && "text-red-600"
        )}>
          <div className="font-bold text-2xl">{homePercentage}%</div>
          <div className="text-xs font-medium truncate">{homeTeam}</div>
          <div className="text-xs text-muted-foreground">{getSpreadDisplay('home')}</div>
          <div className="flex items-center justify-center gap-1 text-xs">
            <span>{homeTotalPicks}</span>
            {homeTeamLocks > 0 && (
              <span className="flex items-center text-amber-500">
                ({homeTeamLocks}<Lock className="w-2.5 h-2.5" />)
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Biggest Winner/Loser Indicators */}
      {winner && (
        <div className="pt-2 border-t">
          <div className="flex items-center justify-center gap-4 text-xs">
            {pickFavorite === (winner === 'home' ? 'home' : 'away') ? (
              <div className="flex items-center gap-1 text-green-600">
                <TrendingUp className="w-3 h-3" />
                <span className="font-medium">Public Winner</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <TrendingDown className="w-3 h-3" />
                <span className="font-medium">Public Loser</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Additional Stats */}
      <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-amber-500" />
          <span>{homeTeamLocks + awayTeamLocks} locks</span>
        </div>
        {pickFavorite && (
          <div className="flex items-center gap-1">
            <span>Public on {pickFavorite === 'home' ? homeTeam : awayTeam}</span>
          </div>
        )}
      </div>
    </div>
  )
}