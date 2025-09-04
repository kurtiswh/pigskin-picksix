import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { WeekSettings } from '@/types'
import { NotificationScheduler } from '@/services/notificationScheduler'

interface CFBGame {
  id: number
  week: number
  season: number
  season_type: string
  start_date: string
  completed: boolean
  home_team: string
  away_team: string
  home_conference?: string
  away_conference?: string
  venue?: string
  spread?: number
  custom_lock_time?: string
  home_ranking?: number
  away_ranking?: number
}

interface WeekControlsProps {
  weekSettings: WeekSettings | null
  onUpdateSettings: (settings: Partial<WeekSettings>) => void
  onSaveGames: () => void
  onUnsaveGames: () => void
  onSpreadUpdate: (gameId: number, spread: number) => void
  onLockTimeUpdate: (gameId: number, lockTime: string) => void
  selectedGames: CFBGame[]
  maxGames: number
  loading?: boolean
  currentWeek: number
  currentSeason: number
}

export default function WeekControls({
  weekSettings,
  onUpdateSettings,
  onSaveGames,
  onUnsaveGames,
  onSpreadUpdate,
  onLockTimeUpdate,
  selectedGames,
  maxGames,
  loading = false,
  currentWeek,
  currentSeason
}: WeekControlsProps) {
  const convertUTCToLocalDatetimeString = (utcDate: Date) => {
    // Convert UTC date to local timezone and format for datetime-local input
    const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000))
    return localDate.toISOString().slice(0, 16)
  }

  const [deadline, setDeadline] = useState(
    weekSettings?.deadline ? convertUTCToLocalDatetimeString(new Date(weekSettings.deadline)) : ''
  )
  
  // Auto-update deadline when games are selected
  useEffect(() => {
    if (selectedGames.length > 0 && !weekSettings?.deadline) {
      const optimalDeadline = calculateOptimalDeadline()
      if (optimalDeadline) {
        const deadlineString = convertUTCToLocalDatetimeString(optimalDeadline)
        setDeadline(deadlineString)
        onUpdateSettings({ deadline: optimalDeadline.toISOString() })
      }
    }
  }, [selectedGames.length])

  const handleDeadlineChange = (value: string) => {
    setDeadline(value)
    // Convert local datetime-local input back to UTC for storage
    const localDate = new Date(value)
    onUpdateSettings({ deadline: localDate.toISOString() })
  }

  const selectedGamesCount = selectedGames.length
  const canSaveGames = selectedGamesCount === maxGames
  
  const formatGameTime = (startDate: string) => {
    return new Date(startDate).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

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
      const saturdayLock = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate())
      
      if (gameDay === 6) {
        // Saturday game - lock the same Saturday at 11:00 AM CT
        // Use the same Saturday date
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
      
      // Set to 11:00 AM CDT = 16:00 UTC (corrected timezone)
      saturdayLock.setUTCHours(16, 0, 0, 0)
      return saturdayLock
    }
  }

  const getGameLockTime = (game: CFBGame) => {
    // Use custom lock time if set, otherwise calculate default
    return game.custom_lock_time ? new Date(game.custom_lock_time) : calculateDefaultLockTime(game.start_date)
  }

  const formatTimeInUserTimezone = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  const calculateOptimalDeadline = () => {
    if (selectedGames.length === 0) return null
    
    // The "week" is defined by Saturday - find the Saturday that defines this week
    // Look for a Saturday game, or find the Saturday that these games belong to
    
    let weekSaturday: Date | null = null
    
    // First, check if there's a Saturday game - that defines the week
    const saturdayGame = selectedGames.find(game => new Date(game.start_date).getDay() === 6)
    if (saturdayGame) {
      weekSaturday = new Date(saturdayGame.start_date)
    } else {
      // No Saturday game, so find the Saturday that these games belong to
      // For any game, find its associated Saturday (the Saturday of that "week")
      const anyGame = selectedGames[0]
      const gameDate = new Date(anyGame.start_date)
      const dayOfWeek = gameDate.getDay()
      
      weekSaturday = new Date(gameDate)
      
      if (dayOfWeek === 0) {
        // Sunday - part of the previous Saturday's week (go back 1 day)
        weekSaturday.setDate(weekSaturday.getDate() - 1)
      } else if (dayOfWeek === 1) {
        // Monday - part of the previous Saturday's week (go back 2 days)
        weekSaturday.setDate(weekSaturday.getDate() - 2)
      } else if (dayOfWeek === 2) {
        // Tuesday - part of the previous Saturday's week (go back 3 days)
        weekSaturday.setDate(weekSaturday.getDate() - 3)
      } else if (dayOfWeek === 3) {
        // Wednesday - part of the upcoming Saturday's week (go forward 3 days)
        weekSaturday.setDate(weekSaturday.getDate() + 3)
      } else if (dayOfWeek === 4) {
        // Thursday - part of the upcoming Saturday's week (go forward 2 days)
        weekSaturday.setDate(weekSaturday.getDate() + 2)
      } else if (dayOfWeek === 5) {
        // Friday - part of the upcoming Saturday's week (go forward 1 day)
        weekSaturday.setDate(weekSaturday.getDate() + 1)
      }
      // Saturday case is handled above
    }
    
    if (!weekSaturday) return null
    
    // Pick deadline is Saturday at 11:00 AM CT
    weekSaturday.setUTCHours(16, 0, 0, 0) // 11:00 AM CDT = 16:00 UTC
    
    return weekSaturday
  }

  const isGameLocked = (game: CFBGame) => {
    const lockTime = getGameLockTime(game)
    return new Date() > lockTime
  }
  const canOpenPicks = weekSettings?.games_selected && weekSettings?.deadline
  const isPicksOpen = weekSettings?.picks_open
  const isGamesLocked = weekSettings?.games_locked
  const isDeadlinePassed = weekSettings?.deadline && new Date() > new Date(weekSettings.deadline)
  const canUnsaveGames = weekSettings?.games_selected && !isDeadlinePassed

  const handleTogglePicks = async () => {
    const newPicksOpen = !isPicksOpen
    
    // Update the picks_open setting
    onUpdateSettings({ picks_open: newPicksOpen })
    
    // If opening picks, schedule notifications
    if (newPicksOpen && weekSettings?.deadline) {
      try {
        await NotificationScheduler.onWeekOpened(
          currentWeek,
          currentSeason,
          new Date(weekSettings.deadline),
          selectedGames.length || maxGames
        )
        console.log('✅ Notifications scheduled for week opening')
      } catch (error) {
        console.error('❌ Failed to schedule notifications:', error)
        // Don't fail the picks opening for notification errors
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Week Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Week Status</span>
            <div className="text-sm font-normal text-charcoal-500">
              Week {currentWeek} • {currentSeason}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className={cn(
                "text-2xl mb-2",
                weekSettings?.games_selected ? "text-green-500" : "text-charcoal-400"
              )}>
                {weekSettings?.games_selected ? "✅" : "⭕"}
              </div>
              <div className="font-medium text-sm">Games Selected</div>
              <div className="text-xs text-charcoal-500">
                {selectedGamesCount}/{maxGames} games
              </div>
            </div>

            <div className="text-center p-4 border rounded-lg">
              <div className={cn(
                "text-2xl mb-2",
                isPicksOpen ? "text-green-500" : "text-charcoal-400"
              )}>
                {isPicksOpen ? "🟢" : "🔴"}
              </div>
              <div className="font-medium text-sm">Picks Status</div>
              <div className="text-xs text-charcoal-500">
                {isPicksOpen ? "Open" : "Closed"}
              </div>
            </div>

            <div className="text-center p-4 border rounded-lg">
              <div className={cn(
                "text-2xl mb-2",
                isGamesLocked ? "text-yellow-500" : "text-charcoal-400"
              )}>
                {isGamesLocked ? "🔒" : "🔓"}
              </div>
              <div className="font-medium text-sm">Games Locked</div>
              <div className="text-xs text-charcoal-500">
                {isGamesLocked ? "Spreads frozen" : "Can edit spreads"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Management */}
      <Card>
        <CardHeader>
          <CardTitle>Game Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!weekSettings?.games_selected ? (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Save Selected Games</div>
                <div className="text-sm text-charcoal-500">
                  Add {selectedGamesCount} games to the database for this week
                </div>
              </div>
              <Button
                onClick={onSaveGames}
                disabled={!canSaveGames || loading}
                className="min-w-24"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  "Save Games"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-lg">
                <div>
                  <div className="font-medium text-green-700">✅ Games Saved</div>
                  <div className="text-sm text-green-600">
                    {maxGames} games are saved to the database for this week
                  </div>
                </div>
                <Button
                  onClick={onUnsaveGames}
                  disabled={!canUnsaveGames || loading}
                  variant="outline"
                  className="min-w-24 text-orange-600 border-orange-200 hover:bg-orange-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    "Unsave Games"
                  )}
                </Button>
              </div>
              
              {isDeadlinePassed && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  <div className="font-medium mb-1">⚠️ Deadline Passed</div>
                  <div className="text-xs">
                    Games are permanently locked. Cannot unsave after deadline.
                  </div>
                </div>
              )}
            </div>
          )}

          {weekSettings?.games_selected && (
            <div className="flex items-center justify-between p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
              <div>
                <div className="font-medium">Lock Game Spreads</div>
                <div className="text-sm text-charcoal-500">
                  Freeze spreads to prevent further changes
                </div>
              </div>
              <Button
                onClick={() => onUpdateSettings({ games_locked: !isGamesLocked })}
                variant={isGamesLocked ? "outline" : "default"}
                disabled={loading}
              >
                {isGamesLocked ? "Unlock Spreads" : "Lock Spreads"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Games */}
      {selectedGames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Selected Games</span>
              <span className="text-sm font-normal text-charcoal-500">
                {selectedGamesCount}/{maxGames} games
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {selectedGames
                .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                .map((game, index) => {
                const gameLocked = isGameLocked(game)
                const canEditSpread = !isGamesLocked && !isDeadlinePassed && !gameLocked
                const canEditLockTime = !isGamesLocked && !isDeadlinePassed
                const lockTime = getGameLockTime(game)
                const defaultLockTime = calculateDefaultLockTime(game.start_date)
                const hasCustomLockTime = !!game.custom_lock_time
                
                return (
                  <div
                    key={game.id}
                    className="p-3 border border-green-200 bg-green-50 rounded-lg"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="w-6 h-6 bg-pigskin-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-medium text-sm flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                {game.away_ranking && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded font-medium">
                                    #{game.away_ranking}
                                  </span>
                                )}
                                <span>{game.away_team}</span>
                              </div>
                              <span>{game.neutral_site ? 'vs' : '@'}</span>
                              <div className="flex items-center space-x-1">
                                {game.home_ranking && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded font-medium">
                                    #{game.home_ranking}
                                  </span>
                                )}
                                <span>{game.home_team}</span>
                              </div>
                            </div>
                            <div className="text-xs text-charcoal-500 space-x-4">
                              <span>{formatGameTime(game.start_date)}</span>
                              {game.venue && <span>• {game.venue}</span>}
                              {game.neutral_site && <span>• Neutral Site</span>}
                              {game.home_conference && (
                                <span>• {game.home_conference}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-green-600 text-xs font-medium">✓ Selected</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {/* Spread Control */}
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-xs text-charcoal-500">Spread:</span>
                            {canEditSpread ? (
                              <input
                                type="number"
                                step="0.5"
                                value={game.spread || 0}
                                onChange={(e) => onSpreadUpdate(game.id, parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-pigskin-500"
                              />
                            ) : (
                              <span className="font-medium text-sm">
                                {game.spread ? (game.spread > 0 ? `+${game.spread}` : `${game.spread}`) : 'PK'}
                              </span>
                            )}
                          </div>
                          {game.spread && game.spread !== 0 && game.home_team && game.away_team && (
                            <div className="text-xs text-charcoal-500">
                              {/* Display in standard sportsbook format: [Favored Team] -[Points] */}
                              {game.spread < 0 ? `${game.home_team} -${Math.abs(game.spread)}` : `${game.away_team} -${game.spread}`}
                            </div>
                          )}
                        </div>
                        
                        {/* Lock Time Control */}
                        <div>
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-xs text-charcoal-500">Lock Time:</span>
                            {gameLocked && <span className="text-red-500 text-xs">🔒</span>}
                          </div>
                          {canEditLockTime ? (
                            <div className="space-y-1">
                              <input
                                type="datetime-local"
                                value={game.custom_lock_time ? convertUTCToLocalDatetimeString(new Date(game.custom_lock_time)) : ''}
                                onChange={(e) => {
                                  const newLockTime = e.target.value ? new Date(e.target.value).toISOString() : ''
                                  onLockTimeUpdate(game.id, newLockTime)
                                }}
                                className="w-full px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-pigskin-500"
                              />
                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => onLockTimeUpdate(game.id, '')}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                  disabled={!hasCustomLockTime}
                                >
                                  Use Default
                                </button>
                                <span className="text-xs text-charcoal-400">•</span>
                                <span className="text-xs text-charcoal-400">
                                  Default: {formatTimeInUserTimezone(defaultLockTime)}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs">
                              <div className="font-medium">{formatTimeInUserTimezone(lockTime)}</div>
                              {hasCustomLockTime && (
                                <div className="text-blue-600">Custom time set</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pick Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Pick Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="deadline" className="block text-sm font-medium text-charcoal-700 mb-2">
              Pick Deadline
              {selectedGames.length > 0 && (
                <span className="ml-2 text-xs text-blue-600 font-normal">
                  (Auto-calculated from earliest game lock)
                </span>
              )}
            </label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => handleDeadlineChange(e.target.value)}
              disabled={loading}
            />
            <div className="text-xs text-charcoal-500 mt-1">
              Picks will automatically close at this time
            </div>
            
            {selectedGames.length > 0 && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
                <div className="font-medium text-blue-800 mb-2">Default Lock Time Rules:</div>
                <div className="space-y-1 text-blue-700">
                  <div>🏈 <strong>Saturday/Sunday/Monday/Tuesday games:</strong> Lock Saturday at 11:00 AM CT</div>
                  <div>🏈 <strong>Thursday/Friday games:</strong> Lock at 6:00 PM CT on game day</div>
                  <div>🏈 <strong>Pick Deadline:</strong> Always Saturday at 11:00 AM CT</div>
                  <div className="text-xs text-blue-600 mt-1">Individual lock times can be customized per game above</div>
                  <div className="mt-2 pt-2 border-t border-blue-300 flex items-center justify-between">
                    <div>
                      <strong>Pick Deadline:</strong> {calculateOptimalDeadline() && formatTimeInUserTimezone(calculateOptimalDeadline()!)}
                    </div>
                    <button
                      onClick={() => {
                        const optimalDeadline = calculateOptimalDeadline()
                        if (optimalDeadline) {
                          const deadlineString = convertUTCToLocalDatetimeString(optimalDeadline)
                          setDeadline(deadlineString)
                          onUpdateSettings({ deadline: optimalDeadline.toISOString() })
                        }
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors"
                    >
                      Use This Time
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">
                {isPicksOpen ? "Close Picks" : "Open Picks"}
              </div>
              <div className="text-sm text-charcoal-500">
                {isPicksOpen 
                  ? "Prevent users from making or changing picks"
                  : "Allow users to submit their picks"
                }
              </div>
            </div>
            <Button
              onClick={handleTogglePicks}
              disabled={!canOpenPicks || loading}
              variant={isPicksOpen ? "outline" : "default"}
              className={isPicksOpen ? "text-red-600 border-red-200 hover:bg-red-50" : ""}
            >
              {isPicksOpen ? "Close Picks" : "Open Picks"}
            </Button>
          </div>

          {!canOpenPicks && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
              <div className="font-medium mb-1">Requirements to open picks:</div>
              <div className="space-y-1 text-xs">
                {!weekSettings?.games_selected && <div>• Save {maxGames} games for this week</div>}
                {!weekSettings?.deadline && <div>• Set a pick deadline</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-700">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-red-200 bg-red-50 rounded-lg">
            <div>
              <div className="font-medium text-red-700">Reset Week</div>
              <div className="text-sm text-red-600">
                Clear all games and picks for this week (irreversible)
              </div>
            </div>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={loading}
              onClick={() => {
                if (confirm('Are you sure? This will delete all games and picks for this week.')) {
                  // TODO: Implement reset functionality
                  alert('Reset functionality coming soon!')
                }
              }}
            >
              Reset Week
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}