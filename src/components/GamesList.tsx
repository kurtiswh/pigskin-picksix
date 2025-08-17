import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Game, Pick } from '@/types'

interface GamesListProps {
  week?: number
  season: number
  leaderboardUsers?: string[]
  currentUser?: any
}

interface GameWithPicks extends Game {
  total_picks?: number
  home_picks?: number
  away_picks?: number
  completed_picks?: number
  user_pick?: Pick
  base_points?: number
  lock_bonus?: number
  margin_bonus?: number
}

export default function GamesList({ 
  week, 
  season,
  leaderboardUsers = [],
  currentUser
}: GamesListProps) {
  const { user } = useAuth()
  const [games, setGames] = useState<GameWithPicks[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(week || 1)

  useEffect(() => {
    loadGames()
  }, [selectedWeek, season])

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      console.log(`🏈 Loading games for Week ${selectedWeek}, Season ${season}`)
      console.log(`👥 Leaderboard users:`, leaderboardUsers)
      console.log(`👤 Current user:`, currentUser?.id)
      
      // Calculate pick counts based on actual leaderboard users
      const totalLeaderboardUsers = leaderboardUsers.length || 2
      console.log(`📊 Total leaderboard users for pick counts: ${totalLeaderboardUsers}`)
      
      // Use same pattern as leaderboard - immediate display then background fetch
      console.log(`📅 Loading games for Season ${season}, Week ${selectedWeek}...`)
      
      // Show loading immediately
      setLoading(true)
      setGames([])
      
      // Use background fetch approach like leaderboard (this works!)
      setTimeout(async () => {
        try {
          console.log('🔄 Attempting background games fetch...')
          
          // Simple query like leaderboard does
          const { data: gamesData, error } = await supabase
            .from('games')
            .select('id, home_team, away_team, spread, kickoff_time, status, week, season')
            .eq('season', season)
            .eq('week', selectedWeek)
            .order('kickoff_time')
            .limit(20)
          
          if (error) {
            console.log('Background games query failed:', error)
            setError(`Failed to load games: ${error.message}`)
            setGames([])
          } else {
            console.log('Background games data found:', gamesData?.length || 0, 'games')
            
            if (gamesData && gamesData.length > 0) {
              const processedGames: GameWithPicks[] = gamesData.map(game => ({
                id: game.id,
                season: game.season,
                week: game.week,
                home_team: game.home_team,
                away_team: game.away_team,
                spread: game.spread,
                kickoff_time: game.kickoff_time,
                status: game.status || 'scheduled',
                home_score: null,
                away_score: null,
                total_picks: 0, // Will add picks later
                home_picks: 0,
                away_picks: 0,
                completed_picks: 0,
                user_pick: null,
                base_points: 20,
                lock_bonus: 0,
                margin_bonus: 0
              }))
              
              console.log(`✅ Loaded ${processedGames.length} real games successfully`)
              setGames(processedGames)
            } else {
              console.log('📝 No games found for this week')
              setGames([])
            }
          }
        } catch (bgError) {
          console.log('Background games fetch failed:', bgError)
          setError(`Database connection failed: ${bgError.message}`)
          setGames([])
        } finally {
          setLoading(false)
        }
      }, 100) // Very short delay like leaderboard


    } catch (err: any) {
      console.error('Error loading games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getSpreadDisplay = (team: string, game: Game) => {
    if (team === game.home_team) {
      return game.spread > 0 ? `+${game.spread}` : `${game.spread}`
    } else {
      return game.spread > 0 ? `${-game.spread}` : `+${-game.spread}`
    }
  }

  const getStatusBadge = (game: GameWithPicks) => {
    switch (game.status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            ✓ Scored
          </span>
        )
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            ⏱ Live
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            📅 Scheduled
          </span>
        )
    }
  }

  const getPointsInfo = (game: GameWithPicks) => {
    if (game.status === 'scheduled') {
      return (
        <div className="text-sm text-charcoal-500">
          <div>Potential: 20-30 pts</div>
          <div className="text-xs">Base + bonuses</div>
        </div>
      )
    }

    if (game.status === 'in_progress') {
      return (
        <div className="text-sm text-yellow-600">
          <div className="font-medium">Live Game</div>
          <div className="text-xs">Scoring in progress</div>
        </div>
      )
    }

    // Completed game - show actual point breakdown
    const totalBase = game.base_points || 0
    const totalWithBonus = totalBase + (game.margin_bonus || 0)
    const totalWithLock = totalWithBonus + (game.lock_bonus || 0)

    return (
      <div className="text-sm">
        <div className="font-medium text-green-600">
          {totalBase} base pts
        </div>
        {game.margin_bonus > 0 && (
          <div className="text-xs text-blue-600">
            +{game.margin_bonus} margin bonus
          </div>
        )}
        {game.lock_bonus > 0 && (
          <div className="text-xs text-gold-600">
            +{game.lock_bonus} lock bonus
          </div>
        )}
        <div className="text-xs text-charcoal-500 mt-1">
          Max: {totalWithLock} pts (with lock)
        </div>
      </div>
    )
  }

  const formatTime = (kickoffTime: string) => {
    return new Date(kickoffTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago' // Central Time zone to match admin area
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-charcoal-600">Loading games...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Toggleable Scoring System Info - above games like other tabs */}
      <div className="mb-6">
        <details className="group">
          <summary className="cursor-pointer flex items-center justify-center text-sm text-charcoal-600 hover:text-pigskin-600 transition-colors">
            <span className="mr-2">ℹ️</span>
            <span>How Scoring Works</span>
            <span className="ml-2 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-3 p-4 bg-stone-50 rounded-lg border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center mb-3">
              <div className="p-2 bg-green-50 rounded">
                <div className="text-lg font-bold text-green-600">20</div>
                <div className="text-xs text-charcoal-600">Cover + Bonus</div>
              </div>
              <div className="p-2 bg-yellow-50 rounded">
                <div className="text-lg font-bold text-yellow-600">10</div>
                <div className="text-xs text-charcoal-600">Push</div>
              </div>
              <div className="p-2 bg-red-50 rounded">
                <div className="text-lg font-bold text-red-600">0</div>
                <div className="text-xs text-charcoal-600">Miss</div>
              </div>
              <div className="p-2 bg-gold-50 rounded">
                <div className="text-lg font-bold text-gold-600">🔒</div>
                <div className="text-xs text-charcoal-600">2x Lock</div>
              </div>
            </div>
            <div className="text-xs text-charcoal-500 text-center">
              Bonus: +1 (11-19.5), +3 (20-28.5), +5 (29+) • Lock picks double all points
            </div>
          </div>
        </details>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              Games - Week {selectedWeek}
            </span>
            <div className="text-sm font-normal text-charcoal-500">
              {games.length} games • {games.reduce((sum, game) => sum + (game.total_picks || 0), 0)} total picks
            </div>
          </CardTitle>
        
        <div className="flex flex-col gap-4 mt-4">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            className="flex h-10 w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            {Array.from({ length: 18 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Week {i + 1}
              </option>
            ))}
          </select>
          
          {/* Status Legend */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-green-200 bg-green-50"></div>
              <span className="text-charcoal-600">Scored (completed games)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-yellow-200 bg-yellow-50"></div>
              <span className="text-charcoal-600">Live (in progress)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-stone-200 bg-white"></div>
              <span className="text-charcoal-600">Scheduled (upcoming)</span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {error && (
          <div className="text-center py-4 text-red-500">
            <div className="text-2xl mb-2">⚠️</div>
            <div>{error}</div>
          </div>
        )}

        {games.length === 0 && !error && (
          <div className="text-center py-8 text-charcoal-500">
            <div className="text-4xl mb-4">🏈</div>
            <div>No games found</div>
            <div className="text-sm">
              No games scheduled for Week {selectedWeek}
            </div>
          </div>
        )}

        {games.length > 0 && (
          <div className="space-y-2">
            {games.map((game) => (
              <div
                key={game.id}
                className={cn(
                  "p-3 border rounded transition-colors",
                  game.status === 'completed' && "border-green-200 bg-green-50",
                  game.status === 'in_progress' && "border-yellow-200 bg-yellow-50",
                  game.status === 'scheduled' && "border-stone-200 bg-white"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {game.away_team} @ {game.home_team}
                    </span>
                    {getStatusBadge(game)}
                  </div>
                  <div className="text-xs text-charcoal-500">
                    {formatTime(game.kickoff_time)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Away Team */}
                  <div className={cn(
                    "text-center p-2 rounded border text-xs",
                    game.user_pick?.selected_team === game.away_team 
                      ? "bg-pigskin-50 border-pigskin-300 ring-1 ring-pigskin-200" 
                      : "bg-white border-stone-200"
                  )}>
                    <div className="font-medium">{game.away_team}</div>
                    <div className="text-charcoal-500 mb-1">
                      {getSpreadDisplay(game.away_team, game)}
                    </div>
                    
                    {game.user_pick?.selected_team === game.away_team && (
                      <div className="text-pigskin-700 font-semibold">
                        YOUR PICK {game.user_pick.is_lock && "🔒"}
                      </div>
                    )}
                    
                    {game.total_picks > 0 && (
                      <div className="text-blue-600 mt-1">
                        {game.away_picks} picks ({Math.round((game.away_picks / game.total_picks) * 100)}%)
                      </div>
                    )}
                    {game.total_picks === 0 && (
                      <div className="text-gray-400 mt-1 text-xs">
                        No picks
                      </div>
                    )}
                  </div>

                  {/* Home Team */}
                  <div className={cn(
                    "text-center p-2 rounded border text-xs",
                    game.user_pick?.selected_team === game.home_team 
                      ? "bg-pigskin-50 border-pigskin-300 ring-1 ring-pigskin-200" 
                      : "bg-white border-stone-200"
                  )}>
                    <div className="font-medium">{game.home_team}</div>
                    <div className="text-charcoal-500 mb-1">
                      {getSpreadDisplay(game.home_team, game)}
                    </div>
                    
                    {game.user_pick?.selected_team === game.home_team && (
                      <div className="text-pigskin-700 font-semibold">
                        YOUR PICK {game.user_pick.is_lock && "🔒"}
                      </div>
                    )}
                    
                    {game.total_picks > 0 && (
                      <div className="text-blue-600 mt-1">
                        {game.home_picks} picks ({Math.round((game.home_picks / game.total_picks) * 100)}%)
                      </div>
                    )}
                    {game.total_picks === 0 && (
                      <div className="text-gray-400 mt-1 text-xs">
                        No picks
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        {games.length > 0 && (
          <div className="mt-6 pt-4 border-t border-stone-200 grid md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-pigskin-600">
                {games.reduce((sum, game) => sum + (game.total_picks || 0), 0)}
              </div>
              <div className="text-xs text-charcoal-500">Total Picks</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {games.filter(g => g.status === 'completed').length}
              </div>
              <div className="text-xs text-charcoal-500">Games Scored</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {games.filter(g => g.status === 'in_progress').length}
              </div>
              <div className="text-xs text-charcoal-500">Games Live</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {games.filter(g => g.status === 'scheduled').length}
              </div>
              <div className="text-xs text-charcoal-500">Games Upcoming</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}