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

  const totalPoints = picks.reduce((n, p) => n + (p.points_earned || 0), 0)
  const anyScored = picks.some(p => p.result)
  const deadlineText = getTimeUntilDeadline()

  const resultChip = (p: Pick) => {
    if (!p.result) return null
    const cls = p.result === 'win' ? 'bg-[#e6f4ea] text-[#1f7a44]'
      : p.result === 'loss' ? 'bg-[#fbe9ec] text-[#d1495b]'
      : 'bg-[#fff5e2] text-[#b06a1a]'
    const L = p.result === 'win' ? 'W' : p.result === 'loss' ? 'L' : 'P'
    return <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${cls}`}>{L} +{p.points_earned || 0}</span>
  }

  return (
    <div className="sticky top-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base text-[#4B3621]">
            <span>Your Picks · {picks.length}/6</span>
            {hasLock && <span className="text-gold-500">🔒</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {deadline && (
            <div className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
              (isDeadlinePassed || isCritical) ? 'bg-[#fbe9ec] text-[#d1495b]' : 'bg-[#fff5e2] text-[#8a6a1f]'
            )}>
              {isDeadlinePassed ? '🔒 Picks closed' : `⏱ ${deadlineText}`}
            </div>
          )}

          {picks.length === 0 ? (
            <div className="text-sm text-charcoal-400 py-2">No picks yet — tap teams to add them.</div>
          ) : (
            <div className="divide-y divide-[#f0ece5]">
              {picks.map(p => (
                <div key={p.game_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="flex items-center gap-1.5 min-w-0">
                    {p.is_lock && <span className="text-gold-500 shrink-0">🔒</span>}
                    <span className="font-medium text-charcoal-800 truncate">{p.selected_team}</span>
                    <span className="text-charcoal-500 tabular-nums shrink-0">{getSpreadDisplay(p)}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {resultChip(p)}
                    {!isDeadlinePassed && !arePicksSubmitted && (
                      <button onClick={() => onRemovePick(p.game_id)} className="text-charcoal-300 hover:text-[#d1495b] text-base leading-none" title="Remove">×</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!canSubmit && !isDeadlinePassed && (
            <div className="text-xs text-charcoal-500 flex items-center gap-4">
              <span className={picks.length === 6 ? 'text-[#1f7a44] font-medium' : ''}>{picks.length === 6 ? '✓' : '○'} 6 games ({picks.length}/6)</span>
              <span className={hasLock ? 'text-[#1f7a44] font-medium' : ''}>{hasLock ? '✓' : '○'} 1 Lock</span>
            </div>
          )}

          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2">
            <div className="text-xs text-charcoal-500">{anyScored ? 'Points' : 'Projected'}</div>
            <div className="text-xl font-bold text-[#4B3621] tabular-nums">{totalPoints} pts</div>
          </div>

          <Button
            onClick={onSubmitPicks}
            disabled={!canSubmit || isSubmitting || !!isDeadlinePassed || arePicksSubmitted}
            className={cn(
              'w-full font-bold',
              canSubmit && !arePicksSubmitted && !isDeadlinePassed && 'bg-[#C9A04E] hover:bg-[#b8903e] text-[#4B3621]'
            )}
            size="lg"
            variant={arePicksSubmitted ? 'outline' : 'default'}
          >
            {isSubmitting ? 'Submitting…'
              : isDeadlinePassed ? (arePicksSubmitted ? '✅ Submitted (Closed)' : '❌ Not submitted')
              : !canSubmit ? `Need ${6 - picks.length} more${!hasLock ? ' + Lock' : ''}`
              : arePicksSubmitted ? '✅ Picks Submitted'
              : 'Submit picks'}
          </Button>

          {arePicksSubmitted && !isDeadlinePassed && (
            <div className="text-xs text-center text-[#1f7a44]">Submitted — edit any pick to re-submit.</div>
          )}
          {isDeadlinePassed && !arePicksSubmitted && (
            <div className="text-xs text-center text-[#d1495b]">⚠️ These picks were not submitted and won't count.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
