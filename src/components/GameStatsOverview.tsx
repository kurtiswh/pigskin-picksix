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
  home_team_picks?: number
  away_team_picks?: number
  home_team_locks?: number
  away_team_locks?: number
}

interface WeekStats {
  totalSubmissions: number
  averageScore: number
  perfectRecords: number
  zeroRecords: number
  over100Points: number
  overallRecord: {
    wins: number
    losses: number
    pushes: number
    winPercentage: number
  }
  lockRecord: {
    wins: number
    losses: number
    pushes: number
    winPercentage: number
  }
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

      // Get weekly leaderboard data - using likely column names
      const { data: weeklyLeaderboard, error: leaderboardError } = await supabase
        .from('weekly_leaderboard')
        .select(`
          user_id,
          display_name,
          picks_made,
          total_points,
          wins,
          losses,
          pushes,
          lock_wins,
          lock_losses,
          lock_pushes
        `)
        .eq('season', season)
        .eq('week', week)

      if (leaderboardError) throw leaderboardError

      if (!weeklyLeaderboard || weeklyLeaderboard.length === 0) {
        setWeekStats({
          totalSubmissions: 0,
          averageScore: 0,
          perfectRecords: 0,
          zeroRecords: 0,
          over100Points: 0,
          overallRecord: {
            wins: 0,
            losses: 0,
            pushes: 0,
            winPercentage: 0
          },
          lockRecord: {
            wins: 0,
            losses: 0,
            pushes: 0,
            winPercentage: 0
          },
          mostPopularGame: null,
          leastPopularGame: null,
          mostPopularLock: null,
          biggestUpset: null
        })
        return
      }

      // Filter to only users who actually submitted picks
      const usersWithPicks = weeklyLeaderboard.filter(user => (user.picks_made || 0) > 0)
      
      const totalSubmissions = usersWithPicks.length
      const scores = usersWithPicks.map(user => user.total_points || 0)
      const averageScore = totalSubmissions > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / totalSubmissions * 10) / 10 : 0
      const perfectRecords = usersWithPicks.filter(user => (user.wins || 0) === 6).length
      const zeroRecords = usersWithPicks.filter(user => (user.wins || 0) === 0).length
      const over100Points = usersWithPicks.filter(user => (user.total_points || 0) > 100).length

      // Calculate overall record totals
      const totalWins = usersWithPicks.reduce((sum, user) => sum + (user.wins || 0), 0)
      const totalLosses = usersWithPicks.reduce((sum, user) => sum + (user.losses || 0), 0)
      const totalPushes = usersWithPicks.reduce((sum, user) => sum + (user.pushes || 0), 0)
      const totalDecidedGames = totalWins + totalLosses
      const overallWinPercentage = totalDecidedGames > 0 ? Math.round((totalWins / totalDecidedGames) * 1000) / 10 : 0

      // Calculate lock record totals
      const totalLockWins = usersWithPicks.reduce((sum, user) => sum + (user.lock_wins || 0), 0)
      const totalLockLosses = usersWithPicks.reduce((sum, user) => sum + (user.lock_losses || 0), 0)
      const totalLockPushes = usersWithPicks.reduce((sum, user) => sum + (user.lock_pushes || 0), 0)
      const totalDecidedLocks = totalLockWins + totalLockLosses
      const lockWinPercentage = totalDecidedLocks > 0 ? Math.round((totalLockWins / totalDecidedLocks) * 1000) / 10 : 0
      
      console.log('GameStatsOverview Debug:', {
        totalLeaderboardEntries: weeklyLeaderboard.length,
        totalSubmissions: totalSubmissions,
        averageScore: averageScore,
        perfectRecords: perfectRecords,
        zeroRecords: zeroRecords,
        over100Points: over100Points,
        games: games.length
      })

      // Calculate game popularity using the games table pick counts
      const gamePickCounts = new Map<string, { picks: number, locks: number, gameInfo: Game }>()
      
      games.forEach(game => {
        gamePickCounts.set(game.id, {
          picks: (game.home_team_picks || 0) + (game.away_team_picks || 0),
          locks: (game.home_team_locks || 0) + (game.away_team_locks || 0),
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

      // Calculate biggest upset (lowest picked team that won) using game pick count fields
      let biggestUpset = null
      if (games.some(g => g.status === 'completed')) {
        const completedGames = games.filter(g => g.status === 'completed')
        
        for (const game of completedGames) {
          const homePicks = (game.home_team_picks || 0)
          const awayPicks = (game.away_team_picks || 0)
          const totalGamePicks = homePicks + awayPicks
          
          if (totalGamePicks === 0) continue

          const homePercentage = Math.round((homePicks / totalGamePicks) * 100)
          const awayPercentage = Math.round((awayPicks / totalGamePicks) * 100)

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
                  loserPercentage: loserPercentage
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
        overallRecord: {
          wins: totalWins,
          losses: totalLosses,
          pushes: totalPushes,
          winPercentage: overallWinPercentage
        },
        lockRecord: {
          wins: totalLockWins,
          losses: totalLockLosses,
          pushes: totalLockPushes,
          winPercentage: lockWinPercentage
        },
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
          percentage: Math.round((mostPopularLock.locks / Math.max(1, gameStats.reduce((sum, g) => sum + g.locks, 0))) * 100)
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

        {/* Overall Records */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-charcoal-700">Overall Record</h4>
            <div className="text-sm p-3 bg-stone-50 rounded border">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Collective W-L-P</span>
                <span className="text-lg font-bold">
                  {weekStats.overallRecord.wins}-{weekStats.overallRecord.losses}-{weekStats.overallRecord.pushes}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-600">Win Percentage</span>
                <span className="font-bold text-pigskin-600">{weekStats.overallRecord.winPercentage}%</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-charcoal-700">Lock Record</h4>
            <div className="text-sm p-3 bg-yellow-50 rounded border">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Lock W-L-P</span>
                <span className="text-lg font-bold">
                  {weekStats.lockRecord.wins}-{weekStats.lockRecord.losses}-{weekStats.lockRecord.pushes}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal-600">Lock Win %</span>
                <span className="font-bold text-pigskin-600">{weekStats.lockRecord.winPercentage}%</span>
              </div>
            </div>
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