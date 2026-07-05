import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Game, Pick } from '@/types'
import PickStatisticsBar from '@/components/PickStatisticsBar'

interface GameCardProps {
  game: Game
  userPick?: Pick
  onPickTeam: (gameId: string, team: string) => void
  onToggleLock: (gameId: string) => void
  onRemovePick?: (gameId: string) => void
  disabled?: boolean
  isMaxPicks?: boolean
  showPickStats?: boolean
  isUnsubmitted?: boolean
}

export default function GameCard({ 
  game, 
  userPick, 
  onPickTeam, 
  onToggleLock, 
  onRemovePick,
  disabled = false,
  isMaxPicks = false,
  showPickStats = false,
  isUnsubmitted = false
}: GameCardProps) {
  const isPicked = !!userPick
  const selectedTeam = userPick?.selected_team
  const isLock = userPick?.is_lock || false
  
  const formatTime = (kickoffTime: string) => {
    return new Date(kickoffTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const formatLockTime = (lockTime: string) => {
    return new Date(lockTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  // Calculate the default lock time for this game
  const calculateDefaultLockTime = (gameStartDate: string) => {
    const gameDate = new Date(gameStartDate)
    const gameDay = gameDate.getDay() // 0 = Sunday, 6 = Saturday
    
    if (gameDay === 4 || gameDay === 5) {
      // Thursday and Friday games - lock at 6:00 PM CT on the actual game day
      const gameDayLock = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate())
      gameDayLock.setUTCHours(23, 0, 0, 0) // 6:00 PM CDT = 23:00 UTC
      return gameDayLock
    } else {
      // Saturday, Sunday, Monday, Tuesday games - lock at Saturday 11:00 AM CT
      // Find the Saturday that defines this week
      const saturdayLock = new Date(gameDate)
      
      if (gameDay === 6) {
        // Saturday game - lock the same Saturday at 11:00 AM CT
        // No date change needed
      } else if (gameDay === 0) {
        // Sunday game - part of the previous Saturday's week (go back 1 day to Saturday)
        saturdayLock.setDate(saturdayLock.getDate() - 1)
      } else if (gameDay === 1) {
        // Monday game - part of the previous Saturday's week (go back 2 days to Saturday)
        saturdayLock.setDate(saturdayLock.getDate() - 2)
      } else if (gameDay === 2) {
        // Tuesday game - part of the previous Saturday's week (go back 3 days to Saturday)
        saturdayLock.setDate(saturdayLock.getDate() - 3)
      } else if (gameDay === 3) {
        // Wednesday game - part of the upcoming Saturday's week (go forward 3 days to Saturday)
        saturdayLock.setDate(saturdayLock.getDate() + 3)
      }
      
      // Set to 11:00 AM CDT = 16:00 UTC
      saturdayLock.setUTCHours(16, 0, 0, 0)
      return saturdayLock
    }
  }

  // Determine if we should show lock time indicator
  const gameDate = new Date(game.kickoff_time)
  const gameDay = gameDate.getDay() // 0 = Sunday, 6 = Saturday
  const isThursdayFridayGame = gameDay === 4 || gameDay === 5 // Thursday or Friday
  
  const hasCustomLockTime = !!game.custom_lock_time
  const actualLockTime = hasCustomLockTime ? new Date(game.custom_lock_time!) : calculateDefaultLockTime(game.kickoff_time)
  const defaultLockTime = calculateDefaultLockTime(game.kickoff_time)
  
  // Show indicator for Thursday/Friday games OR games with custom lock times that differ from default
  const isCustomLockTimeDifferent = hasCustomLockTime && 
    Math.abs(actualLockTime.getTime() - defaultLockTime.getTime()) > 60000 // More than 1 minute difference
  
  const shouldShowLockTimeIndicator = isThursdayFridayGame || isCustomLockTimeDifferent
  
  // Check if this game is locked (past its lock time)
  const now = new Date()
  const isGameLocked = now > actualLockTime

  const getSpreadDisplay = (team: string) => {
    // College Football Data API spread: negative = home team favored, positive = away team favored
    if (team === game.home_team) {
      // Home team gets the spread as-is: negative if favored, positive if underdog
      return game.spread > 0 ? `+${game.spread}` : `${game.spread}`
    } else {
      // Away team gets the opposite: positive if favored, negative if underdog
      return game.spread < 0 ? `+${Math.abs(game.spread)}` : `-${game.spread}`
    }
  }

  const handleTeamSelect = (team: string) => {
    if (disabled || isGameLocked) return
    
    if (!isPicked && isMaxPicks) {
      // Show feedback that max picks reached
      alert('Maximum 6 picks reached! Remove a pick to select this game.')
      return
    }
    
    onPickTeam(game.id, team)
  }

  const handleLockToggle = () => {
    if (!isPicked || disabled || isGameLocked) return
    onToggleLock(game.id)
  }

  const hasScore = game.home_score != null && game.away_score != null

  const resultChip = () => {
    if (!userPick?.result) return null
    const map: Record<string, string> = {
      win: 'bg-[#e6f4ea] text-[#1f7a44] border-[#bfe3cc]',
      push: 'bg-[#fff5e2] text-[#b06a1a] border-[#f0dcb0]',
      loss: 'bg-[#fbe9ec] text-[#d1495b] border-[#f2c9d1]',
    }
    const label = userPick.result === 'win' ? 'W' : userPick.result === 'loss' ? 'L' : 'P'
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums', map[userPick.result])}>
        {label} +{userPick.points_earned || 0}
      </span>
    )
  }

  const teamRow = (team: string, label: string, ranking?: number, score?: number | null) => {
    const sel = selectedTeam === team
    const rowDisabled = disabled || (!isPicked && isMaxPicks) || isGameLocked
    return (
      <button
        type="button"
        onClick={() => handleTeamSelect(team)}
        disabled={rowDisabled}
        className={cn(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left border-b border-[#f0ece5] transition-colors',
          sel ? 'bg-[#fbf6ea]' : 'hover:bg-[#faf8f4]',
          rowDisabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {label && <span className="text-[10px] font-semibold text-charcoal-400 w-9 shrink-0 tracking-wide">{label}</span>}
          {ranking ? <span className="text-[11px] bg-[#eef1f5] text-[#4a5568] px-1 rounded font-semibold shrink-0">#{ranking}</span> : null}
          <span className={cn('truncate', sel ? 'font-bold text-[#4B3621]' : 'font-semibold text-charcoal-900')}>{team}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {hasScore ? <span className="tabular-nums text-charcoal-500 text-sm">{score}</span> : null}
          <span className={cn('tabular-nums text-sm', sel ? 'font-bold text-[#4B3621]' : 'text-charcoal-500')}>{getSpreadDisplay(team)}</span>
          {sel && <span className="text-[#C9A04E] font-bold">✓</span>}
        </span>
      </button>
    )
  }

  return (
    <Card className={cn(
      'relative overflow-hidden transition-shadow hover:shadow-md',
      isPicked && !isLock && 'ring-1 ring-[#C9A04E]',
      isLock && 'ring-2 ring-gold-500',
      isGameLocked && 'opacity-70'
    )}>
      {isUnsubmitted && isGameLocked && userPick && (
        <div className="bg-[#d1495b] text-white text-[11px] font-bold text-center py-1">⚠️ NOT SUBMITTED — WON'T COUNT</div>
      )}

      {/* Header strip: kickoff / venue + lock timing */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#faf8f4] border-b border-[#f0ece5] text-xs">
        <span className="text-charcoal-500 truncate">
          {formatTime(game.kickoff_time)}{game.neutral_site ? ' · Neutral site' : (game.venue ? ` · ${game.venue}` : '')}
        </span>
        <span className={cn('shrink-0 ml-2', isGameLocked ? 'text-[#d1495b] font-semibold' : 'text-[#8a6a1f]')}>
          {isGameLocked
            ? '🔒 Locked'
            : shouldShowLockTimeIndicator
            ? `🔒 ${formatLockTime(actualLockTime.toISOString())}`
            : '🔒 lock by kickoff'}
        </span>
      </div>

      {/* Team rows (clickable) */}
      <div>
        {teamRow(game.away_team, game.neutral_site ? '' : 'AWAY', game.away_ranking, game.away_score)}
        {teamRow(game.home_team, game.neutral_site ? '' : 'HOME', game.home_ranking, game.home_score)}
      </div>

      {/* Pick distribution */}
      {showPickStats && game.total_picks !== undefined && game.total_picks > 0 && (
        <div className="px-3 py-2 border-b border-[#f0ece5]">
          <PickStatisticsBar
            homeTeam={game.home_team}
            awayTeam={game.away_team}
            homeTeamPicks={game.home_team_picks || 0}
            homeTeamLocks={game.home_team_locks || 0}
            awayTeamPicks={game.away_team_picks || 0}
            awayTeamLocks={game.away_team_locks || 0}
            totalPicks={game.total_picks}
            compact={true}
            className="text-xs"
          />
        </div>
      )}

      {/* Footer: lock control + pick/result */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#faf8f4]">
        {isPicked ? (
          <button
            type="button"
            onClick={handleLockToggle}
            disabled={disabled || isGameLocked}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
              isLock ? 'bg-gold-200 text-[#7a5a12]' : 'border border-[#4B3621]/30 text-[#4B3621] hover:bg-[#f0ece5]',
              (disabled || isGameLocked) && 'opacity-60 cursor-not-allowed'
            )}
          >
            🔒 {isLock ? 'LOCK' : isGameLocked ? 'Locked' : 'Set Lock'}
          </button>
        ) : (
          <span className="text-xs text-charcoal-400">
            {isGameLocked ? 'Locked — no picks' : isMaxPicks ? 'Max picks reached' : 'Tap a team to pick'}
          </span>
        )}
        {isPicked && (
          userPick?.result ? (
            <span className="flex items-center gap-2">
              {hasScore ? <span className="text-xs text-charcoal-500 tabular-nums">{game.away_score}–{game.home_score}</span> : null}
              {resultChip()}
            </span>
          ) : (
            <span className="text-xs text-charcoal-600 truncate">
              {selectedTeam} {selectedTeam && getSpreadDisplay(selectedTeam)}{isLock ? ' 🔒' : ''}
            </span>
          )
        )}
      </div>

      {isPicked && onRemovePick && !disabled && !isGameLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemovePick(game.id) }}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/80 hover:bg-[#fbe9ec] text-charcoal-400 hover:text-[#d1495b] flex items-center justify-center text-xs border border-[#e7e2da]"
          title="Remove pick"
        >×</button>
      )}
    </Card>
  )
}
