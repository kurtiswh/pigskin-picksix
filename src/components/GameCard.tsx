import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Game, Pick } from '@/types'

interface GameCardProps {
  game: Game
  userPick?: Pick
  onPickTeam: (gameId: string, team: string) => void
  onToggleLock: (gameId: string) => void
  onRemovePick?: (gameId: string) => void
  disabled?: boolean
  isMaxPicks?: boolean
}

export default function GameCard({ 
  game, 
  userPick, 
  onPickTeam, 
  onToggleLock, 
  onRemovePick,
  disabled = false,
  isMaxPicks = false 
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
    if (team === game.home_team) {
      return game.spread > 0 ? `+${game.spread}` : `${game.spread}`
    } else {
      return game.spread > 0 ? `${-game.spread}` : `+${-game.spread}`
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

  return (
    <Card className={cn(
      "relative transition-all duration-300 hover:shadow-xl h-full",
      isPicked && "ring-2 ring-pigskin-500",
      isLock && "ring-gold-500 bg-gradient-to-br from-gold-50 to-white",
      isGameLocked && "opacity-60 bg-stone-100 border-stone-300"
    )}>
      {isLock && (
        <div className="absolute -top-2 -right-2 w-8 h-8 bg-gold-500 text-pigskin-900 rounded-full flex items-center justify-center text-sm font-bold z-10">
          🔒
        </div>
      )}
      
      {isGameLocked && (
        <div className="absolute -top-2 -left-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold z-10">
          🔒
        </div>
      )}
      
      {isPicked && onRemovePick && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemovePick(game.id)
          }}
          className={cn(
            "absolute -top-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold z-10 transition-colors",
            isLock ? "-left-2" : "-right-2"
          )}
          title="Remove pick"
        >
          ×
        </button>
      )}
      
      <CardContent className="p-4 h-full flex flex-col">
        {/* Game Info Header */}
        <div className="text-center mb-4">
          <div className="text-xs text-charcoal-500 mb-1">
            {formatTime(game.kickoff_time)}
          </div>
          
          {/* Lock Time Indicator */}
          {shouldShowLockTimeIndicator && (
            <div className={cn(
              "px-2 py-1 rounded text-xs mb-2",
              isGameLocked 
                ? "bg-red-100 border border-red-300 text-red-800"
                : "bg-amber-100 border border-amber-300 text-amber-800"
            )}>
              <div className="font-semibold text-center">
                {isGameLocked 
                  ? "🔒 LOCKED" 
                  : `⏰ Locks: ${formatLockTime(actualLockTime.toISOString())}`
                }
              </div>
            </div>
          )}
          
          <div className="yard-line mb-2"></div>
        </div>

        {/* Teams */}
        <div className="space-y-3 flex-1">
          {/* Away Team */}
          <button
            onClick={() => handleTeamSelect(game.away_team)}
            disabled={disabled || (!isPicked && isMaxPicks) || isGameLocked}
            className={cn(
              "w-full p-3 rounded-lg border-2 transition-all duration-200 text-left flex justify-between items-center",
              selectedTeam === game.away_team 
                ? "border-pigskin-500 bg-pigskin-50 shadow-md" 
                : "border-stone-200 hover:border-pigskin-300 hover:bg-stone-50",
              (disabled || isGameLocked) && "opacity-50 cursor-not-allowed",
              !isPicked && isMaxPicks && "opacity-60 cursor-not-allowed",
              isGameLocked && "bg-stone-50 border-stone-300"
            )}
          >
            <div>
              <div className="font-semibold text-sm flex items-center space-x-2">
                {game.away_ranking && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded font-medium">
                    #{game.away_ranking}
                  </span>
                )}
                <span>{game.away_team}</span>
              </div>
              <div className="text-xs text-charcoal-500">@ {game.home_team}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-base">{getSpreadDisplay(game.away_team)}</div>
              {selectedTeam === game.away_team && (
                <div className="text-xs text-pigskin-600 font-medium">SELECTED</div>
              )}
            </div>
          </button>

          {/* Home Team */}
          <button
            onClick={() => handleTeamSelect(game.home_team)}
            disabled={disabled || (!isPicked && isMaxPicks) || isGameLocked}
            className={cn(
              "w-full p-3 rounded-lg border-2 transition-all duration-200 text-left flex justify-between items-center",
              selectedTeam === game.home_team 
                ? "border-pigskin-500 bg-pigskin-50 shadow-md" 
                : "border-stone-200 hover:border-pigskin-300 hover:bg-stone-50",
              (disabled || isGameLocked) && "opacity-50 cursor-not-allowed",
              !isPicked && isMaxPicks && "opacity-60 cursor-not-allowed",
              isGameLocked && "bg-stone-50 border-stone-300"
            )}
          >
            <div>
              <div className="font-semibold text-sm flex items-center space-x-2">
                {game.home_ranking && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded font-medium">
                    #{game.home_ranking}
                  </span>
                )}
                <span>{game.home_team}</span>
              </div>
              <div className="text-xs text-charcoal-500">vs {game.away_team}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-base">{getSpreadDisplay(game.home_team)}</div>
              {selectedTeam === game.home_team && (
                <div className="text-xs text-pigskin-600 font-medium">SELECTED</div>
              )}
            </div>
          </button>
        </div>

        {/* Lock Button */}
        {isPicked && (
          <div className="mt-4 pt-3 border-t border-stone-200">
            <Button
              onClick={handleLockToggle}
              disabled={disabled || isGameLocked}
              variant={isLock ? "secondary" : "outline"}
              size="sm"
              className="w-full"
            >
              {isGameLocked 
                ? "🔒 GAME LOCKED" 
                : isLock 
                ? "🔒 LOCK PICK" 
                : "Set as Lock Pick"
              }
            </Button>
          </div>
        )}

        {/* Pick Status */}
        <div className="mt-2 text-center">
          {isPicked ? (
            <div className="text-sm text-pigskin-600 font-medium">
              Pick: {selectedTeam} {getSpreadDisplay(selectedTeam)}
              {isLock && " (LOCK)"}
              {isGameLocked && " - LOCKED"}
            </div>
          ) : (
            <div className="text-sm text-charcoal-400">
              {isGameLocked 
                ? "Game locked - no picks allowed" 
                : isMaxPicks 
                ? "Max picks reached" 
                : "Click a team to pick"
              }
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}