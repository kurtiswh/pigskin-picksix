import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { Pick } from '@/types'

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
  // Scoring fields
  base_points?: number
  margin_bonus?: number
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
    quarter?: number | null
    clock?: string | null
  }
  gameNumber?: number
  showPickStats: boolean
  isAdmin?: boolean
  userPick?: Pick
}



export default function GameResultCard({ game, gameNumber = 1, showPickStats, isAdmin, userPick }: GameResultCardProps) {
  const [pickStats, setPickStats] = useState<PickStats | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Use database status directly as single source of truth
  const homeScore = game.home_score
  const awayScore = game.away_score
  const currentStatus = game.status
  
  // Build game time display based on database status
  const gameTimeDisplay = (() => {
    if (currentStatus === 'completed') {
      return 'Final'
    }
    
    if (currentStatus === 'in_progress') {
      // Debug logging for game timing data
      console.log(`🏈 Game timing data for ${game.away_team} @ ${game.home_team}:`, {
        quarter: game.quarter,
        clock: game.clock,
        quarterType: typeof game.quarter,
        clockType: typeof game.clock,
        status: currentStatus
      })
      
      // Use quarter/clock from props if available
      if (game.quarter && game.clock) {
        // Debug logging for halftime detection
        if (game.quarter === 2 && (game.clock === '0:00' || game.clock === '00:00')) {
          console.log(`🏈 HALFTIME DETECTED: Quarter=${game.quarter}, Clock='${game.clock}'`)
        }
        
        // Special case: Q2 with 0:00 or 00:00 should show "Halftime"
        if (game.quarter === 2 && (game.clock === '0:00' || game.clock === '00:00')) {
          return 'Halftime'
        }
        
        // Handle overtime periods (period > 4)
        if (game.quarter > 4) {
          const overtimeNumber = game.quarter - 4
          return overtimeNumber === 1 ? `OT ${game.clock}` : `${overtimeNumber}OT ${game.clock}`
        }
        
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

          // Calculate points awarded correctly
          // For push: 10 points, for win: 20 points (base + margin bonus)
          if (spreadCovered === false) {
            // Push - always 10 points
            pointsAwarded = 10
          } else {
            // Win - use base_points + margin_bonus or default to 20
            const basePoints = game.base_points || 20
            const marginBonus = game.margin_bonus || 0
            pointsAwarded = basePoints + marginBonus
          }
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
    // Use database status directly
    if (currentStatus === 'completed') {
      return <Badge variant="default" className="bg-green-600">Final</Badge>
    }
    
    if (currentStatus === 'in_progress') {
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


  const getUserPickInfo = () => {
    if (!userPick) return null

    const isUserPickCorrect = userPick.result === 'win'
    const isUserPickPush = userPick.result === 'push'
    const isUserPickWrong = userPick.result === 'loss'
    
    return {
      selectedTeam: userPick.selected_team,
      isLock: userPick.is_lock,
      result: userPick.result,
      isCorrect: isUserPickCorrect,
      isPush: isUserPickPush,
      isWrong: isUserPickWrong,
      pointsEarned: userPick.points_earned || 0
    }
  }

  const userPickInfo = getUserPickInfo()

  const hasHomeScore = homeScore != null
  const hasAwayScore = awayScore != null
  const homeSpread = game.spread > 0 ? `+${game.spread}` : `${game.spread}`
  const awaySpread = game.spread < 0 ? `+${Math.abs(game.spread)}` : `-${game.spread}`
  const totalP = game.total_picks || 0
  const homeP = (game.home_team_picks || 0) + (game.home_team_locks || 0)
  const awayP = (game.away_team_picks || 0) + (game.away_team_locks || 0)
  const locks = (game.home_team_locks || 0) + (game.away_team_locks || 0)

  const myChip = (team: string) => {
    if (!userPickInfo || userPickInfo.selectedTeam !== team) return null
    const lock = userPickInfo.isLock ? ' 🔒' : ''
    if (currentStatus !== 'completed') {
      return <span className="text-[10px] bg-[#eef1f5] text-[#4a5568] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">MY PICK{lock}</span>
    }
    const cls = userPickInfo.isCorrect ? 'bg-[#e6f4ea] text-[#1f7a44]'
      : userPickInfo.isPush ? 'bg-[#fff5e2] text-[#b06a1a]' : 'bg-[#fbe9ec] text-[#d1495b]'
    const L = userPickInfo.isCorrect ? 'W' : userPickInfo.isPush ? 'P' : 'L'
    return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${cls}`}>Your pick · {L}{lock}</span>
  }

  const teamShare = (side: 'home' | 'away') => (totalP > 0 ? Math.round(((side === 'home' ? homeP : awayP) / totalP) * 100) : 0)

  // Which side covered the spread (for the highlighted winner row)
  const adjustedMargin = (homeScore ?? 0) - (awayScore ?? 0) + game.spread
  const coveredSide: 'home' | 'away' | 'push' | null =
    currentStatus === 'completed' && hasHomeScore && hasAwayScore
      ? (adjustedMargin > 0 ? 'home' : adjustedMargin < 0 ? 'away' : 'push')
      : null
  const coverPts = (game.base_points || 20) + (game.margin_bonus || 0)

  const row = (team: string, ranking: number | null | undefined, spreadStr: string, score: number | null, side: 'home' | 'away') => {
    const mine = userPickInfo?.selectedTeam === team
    const isCovered = coveredSide === side
    const dim = !!coveredSide && coveredSide !== 'push' && !isCovered
    return (
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[#f0ece5] ${isCovered ? 'bg-[#e6f4ea]' : ''} ${dim ? 'opacity-60' : ''}`}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {ranking ? <span className="text-[11px] bg-[#eef1f5] text-[#4a5568] px-1 rounded font-semibold shrink-0">#{ranking}</span> : null}
          <span className={`font-semibold truncate ${isCovered ? 'text-[#1f7a44]' : mine ? 'text-[#4B3621]' : 'text-charcoal-800'}`}>{team}</span>
          <span className="text-charcoal-500 text-sm tabular-nums shrink-0">{spreadStr}</span>
          {isCovered && (
            <span className="text-[10px] bg-[#e6f4ea] text-[#1f7a44] border border-[#bfe3cc] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0">COVERED +{coverPts}</span>
          )}
          {myChip(team)}
        </span>
        <span className="flex items-center shrink-0">
          <span className={`text-lg font-bold tabular-nums w-7 text-right ${isCovered ? 'text-[#1f7a44]' : 'text-charcoal-900'}`}>{score ?? '—'}</span>
        </span>
      </div>
    )
  }

  return (
    <Card className="overflow-hidden">
      {/* Header: game # · time · venue + status */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#faf8f4] border-b border-[#f0ece5]">
        <span className="text-xs font-medium text-charcoal-500 truncate">
          Game {gameNumber}
          {currentStatus !== 'completed' && gameTimeDisplay ? ` · ${gameTimeDisplay}` : ''}
          {game.venue ? ` · ${game.neutral_site ? 'Neutral site' : game.venue}` : ''}
        </span>
        {getStatusBadge()}
      </div>

      {/* Team rows — covering team highlighted green */}
      {row(game.away_team, game.away_team_ranking, awaySpread, hasAwayScore ? awayScore : null, 'away')}
      {row(game.home_team, game.home_team_ranking, homeSpread, hasHomeScore ? homeScore : null, 'home')}

      {/* Push strip (covering team gets the COVERED chip on its row instead) */}
      {coveredSide === 'push' && (
        <div className="px-4 py-1.5 bg-[#fff5e2] text-[#b06a1a] text-xs font-medium border-b border-[#f0dcb0]">
          Push · 10 pts
        </div>
      )}

      {/* Distribution band (bottom): label + total, two-tone split bar, per-side counts */}
      {showPickStats && totalP > 0 && (
        <div className="px-4 py-2.5 bg-[#faf8f4]">
          <div className="flex items-center justify-between mb-1.5 text-[11px] uppercase tracking-wide text-charcoal-500">
            <span>Pick distribution</span>
            <span className="tabular-nums normal-case tracking-normal">{totalP} picks · {locks} 🔒</span>
          </div>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden mb-1.5">
            <div className="bg-[#4B3621]" style={{ width: `${teamShare('home')}%` }} aria-hidden="true" />
            <div className="bg-[#b98a3a]" style={{ width: `${teamShare('away')}%` }} aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs tabular-nums">
            <span className="text-[#4B3621] font-medium">
              {game.home_team} {homeP} ({teamShare('home')}%){game.home_team_locks ? ` · ${game.home_team_locks}🔒` : ''}
            </span>
            <span className="text-[#b98a3a] font-medium sm:text-right">
              {game.away_team} {awayP} ({teamShare('away')}%){game.away_team_locks ? ` · ${game.away_team_locks}🔒` : ''}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}
