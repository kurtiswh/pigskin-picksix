import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Game, Pick } from '@/types'

interface PickSummaryProps {
  picks: Pick[]
  games: Game[]
  onRemovePick: (gameId: string) => void
  onSubmitPicks: () => void
  deadline: Date | null
  isSubmitting?: boolean
  disabled?: boolean
}

export default function PickSummary({ 
  picks, 
  games, 
  onRemovePick, 
  onSubmitPicks, 
  deadline,
  isSubmitting = false,
  disabled = false 
}: PickSummaryProps) {
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const lockPick = picks.find(p => p.is_lock)
  const hasLock = !!lockPick
  const arePicksSubmitted = picks.some(p => p.submitted)
  const canSubmit = picks.length === 6 && hasLock && !disabled

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const getGameInfo = (gameId: string) => {
    return games.find(g => g.id === gameId)
  }

  const getSpreadDisplay = (pick: Pick) => {
    const game = getGameInfo(pick.game_id)
    if (!game) return ''
    
    if (pick.selected_team === game.home_team) {
      return game.spread > 0 ? `+${game.spread}` : `${game.spread}`
    } else {
      return game.spread > 0 ? `${-game.spread}` : `+${-game.spread}`
    }
  }

  const getTimeUntilDeadline = () => {
    if (!deadline) return null
    
    const diff = deadline.getTime() - currentTime.getTime()
    
    if (diff <= 0) return 'Deadline passed'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  const isDeadlinePassed = deadline && currentTime > deadline
  const timeRemaining = deadline ? deadline.getTime() - currentTime.getTime() : 0
  const isUrgent = timeRemaining <= 30 * 60 * 1000 && timeRemaining > 0 // Last 30 minutes
  const isCritical = timeRemaining <= 5 * 60 * 1000 && timeRemaining > 0 // Last 5 minutes

  return (
    <div className="sticky top-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Your Picks ({picks.length}/6)</span>
            {hasLock && <div className="text-gold-500">🔒</div>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Deadline Info */}
          {deadline && (
            <div className={cn(
              "p-3 rounded-lg text-center text-sm transition-all",
              isDeadlinePassed 
                ? "bg-red-50 text-red-700 border border-red-200" 
                : isCritical 
                ? "bg-red-100 text-red-800 border border-red-300 animate-pulse" 
                : isUrgent 
                ? "bg-yellow-50 text-yellow-800 border border-yellow-300" 
                : "bg-blue-50 text-blue-700 border border-blue-200"
            )}>
              <div className="font-medium">
                {isDeadlinePassed ? '🔒 Picks Closed' : isCritical ? '⚠️ URGENT' : isUrgent ? '⏰ Time Running Out' : '⏱️ Time Remaining'}
              </div>
              <div className={cn(
                "font-mono",
                isCritical ? "text-base font-bold" : isUrgent ? "text-sm font-semibold" : "text-xs"
              )}>
                {isDeadlinePassed ? 
                  'Deadline has passed' : 
                  getTimeUntilDeadline() || 'Loading...'
                }
              </div>
              {isCritical && (
                <div className="text-xs mt-1 text-red-600">
                  Submit your picks now!
                </div>
              )}
            </div>
          )}

          {/* Pick List */}
          <div className="space-y-2">
            {picks.length === 0 ? (
              <div className="text-center py-8 text-charcoal-500">
                <div className="text-2xl mb-2">🏈</div>
                <div className="text-sm">No picks selected yet</div>
                <div className="text-xs">Choose 6 games to get started</div>
              </div>
            ) : (
              picks.map((pick, index) => {
                const game = getGameInfo(pick.game_id)
                if (!game) return null
                
                return (
                  <div
                    key={pick.game_id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border",
                      pick.is_lock 
                        ? "border-gold-500 bg-gold-50" 
                        : "border-stone-200 bg-white"
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="w-6 h-6 bg-pigskin-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </span>
                        {pick.is_lock && (
                          <span className="text-gold-600 text-sm">🔒</span>
                        )}
                        <div>
                          <div className="font-medium text-sm">{pick.selected_team}</div>
                          <div className="text-xs text-charcoal-500">
                            {pick.selected_team === game.home_team ? 'vs' : '@'} {' '}
                            {pick.selected_team === game.home_team ? game.away_team : game.home_team}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">{getSpreadDisplay(pick)}</div>
                      {!disabled && (
                        <button
                          onClick={() => onRemovePick(pick.game_id)}
                          className="text-xs text-red-500 hover:text-red-700 mt-1"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Requirements Checklist */}
          <div className="space-y-2 text-sm">
            <div className="font-medium text-charcoal-700">Requirements:</div>
            <div className={cn(
              "flex items-center space-x-2",
              picks.length === 6 ? "text-green-600" : "text-charcoal-500"
            )}>
              <span>{picks.length === 6 ? '✅' : '⭕'}</span>
              <span>Select exactly 6 games ({picks.length}/6)</span>
            </div>
            <div className={cn(
              "flex items-center space-x-2",
              hasLock ? "text-green-600" : "text-charcoal-500"
            )}>
              <span>{hasLock ? '✅' : '⭕'}</span>
              <span>Choose 1 Lock pick ({hasLock ? '1' : '0'}/1)</span>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            onClick={onSubmitPicks}
            disabled={!canSubmit || isSubmitting || isDeadlinePassed || arePicksSubmitted}
            className="w-full"
            size="lg"
            variant={arePicksSubmitted ? "outline" : "default"}
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Submitting...</span>
              </div>
            ) : isDeadlinePassed ? (
              'Picks Closed'
            ) : !canSubmit ? (
              `Need ${6 - picks.length} more pick${6 - picks.length !== 1 ? 's' : ''}${!hasLock ? ' + Lock' : ''}`
            ) : arePicksSubmitted ? (
              '✅ Picks Submitted'
            ) : (
              'Submit Picks'
            )}
          </Button>

          {arePicksSubmitted && (
            <div className="text-xs text-center text-green-600 mt-2">
              Picks submitted! Edit any pick to enable re-submission.
            </div>
          )}

          {/* Scoring Info */}
          <div className="text-xs text-charcoal-500 space-y-1 pt-2 border-t border-stone-200">
            <div className="font-medium">Scoring:</div>
            <div>• Cover spread: 20 pts + bonus</div>
            <div>• Push (exact): 10 pts</div>
            <div>• Miss spread: 0 pts</div>
            <div>• Lock pick: Double bonus only</div>
            <div className="text-[10px] text-charcoal-400 mt-1">
              Bonus: +1 (11-19.5), +3 (20-28.5), +5 (29+)
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}