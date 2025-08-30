import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/lib/supabase'
import PickStatsWidget from './PickStatsWidget'

interface Game {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: 'scheduled' | 'in_progress' | 'completed'
  kickoff_time: string
  venue: string | null
  home_conference: string | null
  away_conference: string | null
  // Game clock data
  game_period?: number | null
  game_clock?: string | null
  // API live data (when available)
  api_home_points?: number | null
  api_away_points?: number | null
  api_clock?: string
  api_period?: number
  api_completed?: boolean
  // Pick statistics (new columns from migration 078)
  home_team_picks?: number
  home_team_locks?: number
  away_team_picks?: number
  away_team_locks?: number
  total_picks?: number
  pick_stats_updated_at?: string
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

interface GameResultCardProps {
  game: Game & {
    isLive?: boolean
    quarter?: number | null
    clock?: string | null
  }
  gameNumber?: number
  showPickStats: boolean
  isAdmin?: boolean
}



export default function GameResultCard({ game, gameNumber = 1, showPickStats, isAdmin }: GameResultCardProps) {
  const [pickStats, setPickStats] = useState<PickStats | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Use props directly for pure rendering
  const isLive = game.isLive || false
  const homeScore = game.home_score
  const awayScore = game.away_score
  
  // Determine current status from props and game data
  const currentStatus = isLive ? 'in_progress' : game.status
  
  // Build game time display from props
  const gameTimeDisplay = (() => {
    if (currentStatus === 'completed') {
      return 'Final'
    }
    
    if (isLive) {
      // Use quarter/clock from props if available
      if (game.quarter && game.clock) {
        return `${game.quarter}Q ${game.clock}`
      }
      return 'Live'
    }
    
    // Scheduled games - show kickoff time
    const kickoff = new Date(game.kickoff_time)
    const now = new Date()
    const minutesUntil = Math.floor((kickoff.getTime() - now.getTime()) / (1000 * 60))
    
    if (minutesUntil < 60 && minutesUntil > 0) {
      return `Starts in ${minutesUntil}m`
    }
    
    return kickoff.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  })()

  useEffect(() => {
    if (showPickStats) {
      loadPickStats()
    }
  }, [showPickStats, game.id])

  const loadPickStats = async () => {
    try {
      setLoading(true)
      
      // Debug logging
      console.log('🎯 Loading pick stats for game:', {
        gameId: game.id,
        teams: `${game.away_team} @ ${game.home_team}`,
        status: game.status,
        showPickStats,
        totalPicks: game.total_picks,
        homeTeamPicks: game.home_team_picks,
        homeTeamLocks: game.home_team_locks,
        awayTeamPicks: game.away_team_picks,
        awayTeamLocks: game.away_team_locks
      })
      
      // Use pre-calculated statistics from the games table if available
      if (game.total_picks !== undefined && game.total_picks >= 0) {
        // Use the new pick statistics columns from migration 078
        const homePicks = (game.home_team_picks || 0) + (game.home_team_locks || 0)
        const awayPicks = (game.away_team_picks || 0) + (game.away_team_locks || 0)
        const totalPicks = game.total_picks || 0
        const lockPicks = (game.home_team_locks || 0) + (game.away_team_locks || 0)
        const homeLockPicks = game.home_team_locks || 0
        const awayLockPicks = game.away_team_locks || 0

        // Determine winner and spread coverage for completed games
        let winnerTeam = null
        let spreadCovered = null
        let pointsAwarded = 0

        if (game.status === 'completed' && game.home_score !== null && game.away_score !== null) {
          const homeScore = game.home_score
          const awayScore = game.away_score
          const margin = homeScore - awayScore
          
          // Determine ATS winner (considering spread)
          if (margin + game.spread > 0) {
            winnerTeam = game.home_team
            spreadCovered = true
          } else if (margin + game.spread < 0) {
            winnerTeam = game.away_team
            spreadCovered = true
          } else {
            // Push
            spreadCovered = false
          }

          // For completed games, we could query for points awarded if needed
          // For now, we'll leave it as 0 since it's not critical for the display
          pointsAwarded = 0
        }

        setPickStats({
          total_picks: totalPicks,
          home_picks: homePicks,
          away_picks: awayPicks,
          lock_picks: lockPicks,
          home_lock_picks: homeLockPicks,
          away_lock_picks: awayLockPicks,
          points_awarded: pointsAwarded,
          winner_team: winnerTeam,
          spread_covered: spreadCovered
        })
      } else {
        // Fallback to empty stats if new columns aren't available
        setPickStats({
          total_picks: 0,
          home_picks: 0,
          away_picks: 0,
          lock_picks: 0,
          home_lock_picks: 0,
          away_lock_picks: 0,
          points_awarded: 0,
          winner_team: null,
          spread_covered: null
        })
      }

    } catch (err: any) {
      console.error('Error loading pick stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = () => {
    // Use isLive prop for pure rendering
    if (currentStatus === 'completed') {
      return <Badge variant="default" className="bg-green-600">Final</Badge>
    }
    
    if (isLive) {
      return <Badge variant="default" className="bg-red-600 animate-pulse">🔴 Live</Badge>
    }
    
    // Scheduled games
    const now = new Date()
    const kickoff = new Date(game.kickoff_time)
    const minutesUntil = Math.floor((kickoff.getTime() - now.getTime()) / (1000 * 60))
    
    if (minutesUntil < 60 && minutesUntil > 0) {
      return <Badge variant="default" className="bg-orange-500">Starts in {minutesUntil}m</Badge>
    }
    return <Badge variant="secondary">Scheduled</Badge>
  }


  const getSpreadDisplay = () => {
    const spread = Math.abs(game.spread)
    const favorite = game.spread < 0 ? game.home_team : game.away_team
    return `${favorite} -${spread}`
  }

  const getWinnerDisplay = () => {
    if (currentStatus !== 'completed' || homeScore === null || awayScore === null) {
      return null
    }

    const margin = homeScore - awayScore
    
    // Straight up winner
    const straightWinner = margin > 0 ? game.home_team : margin < 0 ? game.away_team : 'Tie'
    
    // ATS winner (considering spread)
    let atsWinner
    const adjustedMargin = margin + game.spread
    if (adjustedMargin > 0) {
      atsWinner = `${game.home_team} +${Math.abs(game.spread)}`
    } else if (adjustedMargin < 0) {
      atsWinner = `${game.away_team} +${Math.abs(game.spread)}`
    } else {
      atsWinner = 'Push'
    }

    return { straightWinner, atsWinner, margin }
  }

  const winner = getWinnerDisplay()

  return (
    <Card className="hover:shadow-md transition-shadow h-full">
      <CardContent className="p-4 h-full flex flex-col">
        {/* Header with game number and status */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-charcoal-700">Game {gameNumber}</div>
          {getStatusBadge()}
        </div>

        {/* ESPN-style stacked team layout */}
        <div className="flex-1 space-y-3">
          {/* Away Team */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border">
            <div className="flex items-center space-x-3">
              {/* Ranking */}
              {game.away_team_ranking && (
                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">
                  #{game.away_team_ranking}
                </span>
              )}
              
              {/* Team name */}
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg">{game.away_team}</span>
                {!game.neutral_site && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    AWAY
                  </span>
                )}
              </div>
            </div>
            
            {/* Away score and spread */}
            <div className="text-right">
              <div className="text-2xl font-bold">
                {awayScore ?? '-'}
              </div>
              <div className="text-xs text-charcoal-500">
                {game.spread < 0 ? `+${Math.abs(game.spread)}` : `-${game.spread}`}
              </div>
            </div>
          </div>

          {/* Home Team */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border">
            <div className="flex items-center space-x-3">
              {/* Ranking */}
              {game.home_team_ranking && (
                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">
                  #{game.home_team_ranking}
                </span>
              )}
              
              {/* Team name */}
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-lg">{game.home_team}</span>
                {!game.neutral_site ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    HOME
                  </span>
                ) : (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    NEUTRAL
                  </span>
                )}
              </div>
            </div>
            
            {/* Home score and spread */}
            <div className="text-right">
              <div className="text-2xl font-bold">
                {homeScore ?? '-'}
              </div>
              <div className="text-xs text-charcoal-500">
                {game.spread > 0 ? `+${game.spread}` : `${game.spread}`}
              </div>
            </div>
          </div>

          {/* Game details bar */}
          <div className="flex items-center justify-between text-xs text-charcoal-500 pt-2 border-t">
            <div className="flex items-center space-x-3">
              {/* Time/Status */}
              <div>
                {gameTimeDisplay}
              </div>
              
              {/* Venue */}
              {game.venue && (
                <div className="flex items-center">
                  <span>📍 {game.venue}</span>
                </div>
              )}
            </div>
            
          </div>

          {/* Winner Display (for completed games) */}
          {winner && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
              <div className="text-sm font-medium text-green-800">
                ATS Winner: {winner.atsWinner}
              </div>
            </div>
          )}
        </div>

        {/* Pick Statistics (only after deadline) */}
        {showPickStats && pickStats && (
          <div className="mt-4 pt-3 border-t">
            <PickStatsWidget 
              stats={pickStats}
              game={game}
              loading={loading}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}