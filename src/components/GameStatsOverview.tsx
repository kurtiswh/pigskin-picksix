import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'

interface Game {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: string
  kickoff_time: string
}

interface WeekStats {
  totalSubmissions: number
  averageScore: number
  perfectRecords: number
  zeroRecords: number
  over100Points: number
  mostPopularGame: {
    game: string
    pickCount: number
    percentage: number
  } | null
  leastPopularGame: {
    game: string
    pickCount: number
    percentage: number
  } | null
  mostPopularLock: {
    game: string
    lockCount: number
    percentage: number
  } | null
  biggestUpset: {
    game: string
    winnerPickPercentage: number
    loserPickPercentage: number
  } | null
}

interface GameStatsOverviewProps {
  season: number
  week: number
  games: Game[]
  showPickStats: boolean
  className?: string
}

export default function GameStatsOverview({ 
  season, 
  week, 
  games, 
  showPickStats, 
  className 
}: GameStatsOverviewProps) {
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (showPickStats && games.length > 0) {
      loadWeekStats()
    }
  }, [showPickStats, season, week, games])

  const loadWeekStats = async () => {
    try {
      setLoading(true)

      // Get all picks for this week
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select(`
          user_id,
          game_id,
          selected_team,
          is_lock,
          result,
          points_earned
        `)
        .eq('season', season)
        .eq('week', week)

      if (picksError) throw picksError

      if (!picks || picks.length === 0) {
        setWeekStats({
          totalSubmissions: 0,
          averageScore: 0,
          perfectRecords: 0,
          zeroRecords: 0,
          over100Points: 0,
          mostPopularGame: null,
          leastPopularGame: null,
          mostPopularLock: null,
          biggestUpset: null
        })
        return
      }

      // Calculate user scores
      const userScores = new Map<string, number>()
      picks.forEach(pick => {
        const currentScore = userScores.get(pick.user_id) || 0
        userScores.set(pick.user_id, currentScore + (pick.points_earned || 0))
      })

      const scores = Array.from(userScores.values())
      const totalSubmissions = scores.length
      const averageScore = totalSubmissions > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / totalSubmissions * 10) / 10 : 0
      const perfectRecords = scores.filter(score => score >= games.length * 20).length
      const zeroRecords = scores.filter(score => score === 0).length
      const over100Points = scores.filter(score => score > 100).length

      // Calculate game popularity
      const gamePickCounts = new Map<string, { picks: number, locks: number, gameInfo: Game }>()
      
      games.forEach(game => {
        const gamePicks = picks.filter(pick => pick.game_id === game.id)
        const lockPicks = gamePicks.filter(pick => pick.is_lock)
        
        gamePickCounts.set(game.id, {
          picks: gamePicks.length,
          locks: lockPicks.length,
          gameInfo: game
        })
      })

      // Find most/least popular games
      const gameStats = Array.from(gamePickCounts.values())
      const mostPopular = gameStats.length > 0 ? gameStats.reduce((max, game) => 
        game.picks > max.picks ? game : max
      ) : null

      const leastPopular = gameStats.length > 0 ? gameStats.reduce((min, game) => 
        game.picks < min.picks ? game : min
      ) : null

      // Find most popular lock
      const mostPopularLock = gameStats.length > 0 ? gameStats.reduce((max, game) => 
        game.locks > max.locks ? game : max
      ) : null

      // Calculate biggest upset (lowest picked team that won)
      let biggestUpset = null
      if (games.some(g => g.status === 'completed')) {
        const completedGames = games.filter(g => g.status === 'completed')
        
        for (const game of completedGames) {
          const gamePicks = picks.filter(p => p.game_id === game.id)
          if (gamePicks.length === 0) continue

          const homePicks = gamePicks.filter(p => p.selected_team === game.home_team).length
          const awayPicks = gamePicks.filter(p => p.selected_team === game.away_team).length
          
          const homePercentage = Math.round((homePicks / gamePicks.length) * 100)
          const awayPercentage = Math.round((awayPicks / gamePicks.length) * 100)

          // Determine winner
          if (game.home_score !== null && game.away_score !== null) {
            const margin = game.home_score - game.away_score
            const atsWinner = margin + game.spread > 0 ? game.home_team : 
                            margin + game.spread < 0 ? game.away_team : null

            if (atsWinner) {
              const winnerPercentage = atsWinner === game.home_team ? homePercentage : awayPercentage
              const loserPercentage = atsWinner === game.home_team ? awayPercentage : homePercentage

              if (!biggestUpset || winnerPercentage < biggestUpset.winnerPickPercentage) {
                biggestUpset = {
                  game: `${game.away_team} vs. ${game.home_team}`,
                  winnerPickPercentage: winnerPercentage,
                  loserPickPercentage: loserPercentage
                }
              }
            }
          }
        }
      }

      setWeekStats({
        totalSubmissions,
        averageScore,
        perfectRecords,
        zeroRecords,
        over100Points,
        mostPopularGame: mostPopular ? {
          game: `${mostPopular.gameInfo.away_team} vs. ${mostPopular.gameInfo.home_team}`,
          pickCount: mostPopular.picks,
          percentage: Math.round((mostPopular.picks / totalSubmissions) * 100)
        } : null,
        leastPopularGame: leastPopular ? {
          game: `${leastPopular.gameInfo.away_team} vs. ${leastPopular.gameInfo.home_team}`,
          pickCount: leastPopular.picks,
          percentage: Math.round((leastPopular.picks / totalSubmissions) * 100)
        } : null,
        mostPopularLock: mostPopularLock && mostPopularLock.locks > 0 ? {
          game: `${mostPopularLock.gameInfo.away_team} vs. ${mostPopularLock.gameInfo.home_team}`,
          lockCount: mostPopularLock.locks,
          percentage: Math.round((mostPopularLock.locks / picks.filter(p => p.is_lock).length) * 100)
        } : null,
        biggestUpset
      })

    } catch (err: any) {
      console.error('Error loading week stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!showPickStats) {
    return null
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-stone-200 rounded"></div>
            <div className="h-4 bg-stone-200 rounded w-2/3"></div>
            <div className="h-4 bg-stone-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!weekStats) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Week {week} Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-pigskin-600">{weekStats.totalSubmissions}</div>
            <div className="text-xs text-charcoal-500">Submissions</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-pigskin-600">{weekStats.averageScore}</div>
            <div className="text-xs text-charcoal-500">Average Score</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{weekStats.perfectRecords}</div>
            <div className="text-xs text-charcoal-500">Perfect Records</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">{weekStats.zeroRecords}</div>
            <div className="text-xs text-charcoal-500">Zero Records</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">{weekStats.over100Points}</div>
            <div className="text-xs text-charcoal-500">&gt;100 Points</div>
          </div>
        </div>

        {/* Notable Games */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-charcoal-700">Most Popular Games</h4>
            
            {weekStats.mostPopularGame && (
              <div className="text-sm p-2 bg-green-50 rounded">
                <div className="font-medium">📈 Most Picked Game</div>
                <div>{weekStats.mostPopularGame.game}</div>
                <div className="text-charcoal-500">
                  {weekStats.mostPopularGame.pickCount} picks ({weekStats.mostPopularGame.percentage}%)
                </div>
              </div>
            )}

            {weekStats.mostPopularLock && (
              <div className="text-sm p-2 bg-yellow-50 rounded">
                <div className="font-medium">🔒 Most Popular Lock</div>
                <div>{weekStats.mostPopularLock.game}</div>
                <div className="text-charcoal-500">
                  {weekStats.mostPopularLock.lockCount} locks ({weekStats.mostPopularLock.percentage}%)
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-charcoal-700">Notable Results</h4>
            
            {weekStats.leastPopularGame && (
              <div className="text-sm p-2 bg-blue-50 rounded">
                <div className="font-medium">📉 Least Popular Game</div>
                <div>{weekStats.leastPopularGame.game}</div>
                <div className="text-charcoal-500">
                  {weekStats.leastPopularGame.pickCount} picks ({weekStats.leastPopularGame.percentage}%)
                </div>
              </div>
            )}

            {weekStats.biggestUpset && (
              <div className="text-sm p-2 bg-red-50 rounded">
                <div className="font-medium">🚨 Biggest Upset</div>
                <div>{weekStats.biggestUpset.game}</div>
                <div className="text-charcoal-500">
                  Winner had {weekStats.biggestUpset.winnerPickPercentage}% of picks
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}