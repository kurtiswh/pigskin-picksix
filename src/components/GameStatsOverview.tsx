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
  // Season stats for comparison
  seasonStats?: {
    totalSubmissions: number
    averageScore: number
    perfectRecords: number
    zeroRecords: number
    over100Points: number
    averagePerfectRecords: number
    averageZeroRecords: number
    averageOver100Points: number
  }
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
  seasonRecord?: {
    wins: number
    losses: number
    pushes: number
    winPercentage: number
  }
  seasonLockRecord?: {
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
          seasonRecord: null,
          seasonLockRecord: null,
          seasonStats: null,
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
      const perfectRecords = usersWithPicks.filter(user => 
        (user.wins || 0) === 6 && 
        (user.losses || 0) === 0 && 
        (user.pushes || 0) === 0
      ).length
      const zeroRecords = usersWithPicks.filter(user => 
        (user.wins || 0) === 0 && 
        (user.losses || 0) === 6 && 
        (user.pushes || 0) === 0
      ).length
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
      
      // Get season-to-date records from season leaderboard
      const { data: seasonLeaderboard, error: seasonError } = await supabase
        .from('season_leaderboard')
        .select(`
          user_id,
          total_wins,
          total_losses,
          total_pushes,
          total_points,
          total_picks,
          lock_wins,
          lock_losses
        `)
        .eq('season', season)
      
      let seasonRecord = null
      let seasonLockRecord = null
      let seasonStats = null
      
      if (seasonError) {
        console.error('Error fetching season leaderboard:', seasonError)
      }
      
      if (!seasonError && seasonLeaderboard && seasonLeaderboard.length > 0) {
        // Calculate season totals
        const seasonTotalWins = seasonLeaderboard.reduce((sum, user) => sum + (user.total_wins || 0), 0)
        const seasonTotalLosses = seasonLeaderboard.reduce((sum, user) => sum + (user.total_losses || 0), 0)
        const seasonTotalPushes = seasonLeaderboard.reduce((sum, user) => sum + (user.total_pushes || 0), 0)
        const seasonDecidedGames = seasonTotalWins + seasonTotalLosses
        const seasonWinPercentage = seasonDecidedGames > 0 ? Math.round((seasonTotalWins / seasonDecidedGames) * 1000) / 10 : 0
        
        const seasonTotalLockWins = seasonLeaderboard.reduce((sum, user) => sum + (user.lock_wins || 0), 0)
        const seasonTotalLockLosses = seasonLeaderboard.reduce((sum, user) => sum + (user.lock_losses || 0), 0)
        // Note: season_leaderboard doesn't track lock_pushes separately, so we calculate it
        const seasonTotalLockPushes = 0 // Lock pushes not tracked in season_leaderboard
        const seasonDecidedLocks = seasonTotalLockWins + seasonTotalLockLosses
        const seasonLockWinPercentage = seasonDecidedLocks > 0 ? Math.round((seasonTotalLockWins / seasonDecidedLocks) * 1000) / 10 : 0
        
        seasonRecord = {
          wins: seasonTotalWins,
          losses: seasonTotalLosses,
          pushes: seasonTotalPushes,
          winPercentage: seasonWinPercentage
        }
        
        seasonLockRecord = {
          wins: seasonTotalLockWins,
          losses: seasonTotalLockLosses,
          pushes: seasonTotalLockPushes,
          winPercentage: seasonLockWinPercentage
        }
        
        // Calculate season stats for top row comparison
        const activeUsers = seasonLeaderboard.filter(user => (user.total_picks || 0) > 0)
        const seasonTotalSubmissions = activeUsers.length
        
        // To calculate per-week averages, we need to get weekly stats for all previous weeks
        // Get weekly leaderboard data for all weeks this season
        const { data: allWeeklyData, error: allWeeksError } = await supabase
          .from('weekly_leaderboard')
          .select(`
            week,
            wins,
            losses,
            pushes,
            total_points
          `)
          .eq('season', season)
          .gte('week', 1)
          .lte('week', week)
        
        let avgPerfectPerWeek = 0
        let avgZeroPerWeek = 0  
        let avgOver100PerWeek = 0
        let avgScorePerWeek = 0
        
        if (!allWeeksError && allWeeklyData && allWeeklyData.length > 0) {
          // Group by week and calculate stats for each week
          const weeklyStats = new Map()
          
          allWeeklyData.forEach(entry => {
            if (!weeklyStats.has(entry.week)) {
              weeklyStats.set(entry.week, [])
            }
            weeklyStats.get(entry.week).push(entry)
          })
          
          let totalPerfectRecords = 0
          let totalZeroRecords = 0
          let totalOver100Points = 0
          let totalWeeklyAverageScores = 0
          const weeksWithData = weeklyStats.size
          
          // Calculate stats for each week
          weeklyStats.forEach((weekData, weekNum) => {
            const usersWithPicksThisWeek = weekData.filter(user => (user.wins || 0) + (user.losses || 0) + (user.pushes || 0) > 0)
            
            // Perfect records for this week (6-0-0)
            const weekPerfectRecords = usersWithPicksThisWeek.filter(user => 
              (user.wins || 0) === 6 && 
              (user.losses || 0) === 0 && 
              (user.pushes || 0) === 0
            ).length
            
            // Zero records for this week (0-6-0)
            const weekZeroRecords = usersWithPicksThisWeek.filter(user => 
              (user.wins || 0) === 0 && 
              (user.losses || 0) === 6 && 
              (user.pushes || 0) === 0
            ).length
            
            // Over 100 points for this week
            const weekOver100Points = usersWithPicksThisWeek.filter(user => 
              (user.total_points || 0) > 100
            ).length
            
            // Calculate average score for this week
            const weekScores = usersWithPicksThisWeek.map(user => user.total_points || 0)
            const weekAverageScore = weekScores.length > 0 ? 
              weekScores.reduce((a, b) => a + b, 0) / weekScores.length : 0
            
            totalPerfectRecords += weekPerfectRecords
            totalZeroRecords += weekZeroRecords
            totalOver100Points += weekOver100Points
            totalWeeklyAverageScores += weekAverageScore
          })
          
          // Calculate per-week averages
          if (weeksWithData > 0) {
            avgPerfectPerWeek = Math.round((totalPerfectRecords / weeksWithData) * 10) / 10
            avgZeroPerWeek = Math.round((totalZeroRecords / weeksWithData) * 10) / 10
            avgOver100PerWeek = Math.round((totalOver100Points / weeksWithData) * 10) / 10
            avgScorePerWeek = Math.round((totalWeeklyAverageScores / weeksWithData) * 10) / 10
          }
        }
        
        seasonStats = {
          totalSubmissions: seasonTotalSubmissions,
          averageScore: avgScorePerWeek,
          perfectRecords: 0, // Not needed for display, using averages instead
          zeroRecords: 0, // Not needed for display, using averages instead  
          over100Points: 0, // Not needed for display, using averages instead
          averagePerfectRecords: avgPerfectPerWeek,
          averageZeroRecords: avgZeroPerWeek,
          averageOver100Points: avgOver100PerWeek
        }
      }
      
      console.log('GameStatsOverview Debug:', {
        totalLeaderboardEntries: weeklyLeaderboard.length,
        totalSubmissions: totalSubmissions,
        averageScore: averageScore,
        perfectRecords: perfectRecords,
        zeroRecords: zeroRecords,
        over100Points: over100Points,
        games: games.length,
        seasonLeaderboard: seasonLeaderboard?.length || 0,
        seasonRecord,
        seasonLockRecord
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
        seasonRecord,
        seasonLockRecord,
        seasonStats,
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-[#4B3621]">{weekStats.totalSubmissions}</div>
            <div className="text-[11px] text-charcoal-500">Submissions</div>
            {weekStats.seasonStats && <div className="text-[11px] text-charcoal-400 mt-0.5">Season: {weekStats.seasonStats.totalSubmissions}</div>}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-[#4B3621]">{weekStats.averageScore}</div>
            <div className="text-[11px] text-charcoal-500">Average Score</div>
            {weekStats.seasonStats && <div className="text-[11px] text-charcoal-400 mt-0.5">Season: {weekStats.seasonStats.averageScore}</div>}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-[#1f7a44]">{weekStats.perfectRecords}</div>
            <div className="text-[11px] text-charcoal-500">Perfect Records</div>
            {weekStats.seasonStats && (
              <div className="text-[11px] mt-0.5">
                {weekStats.perfectRecords >= weekStats.seasonStats.averagePerfectRecords
                  ? <span className="text-[#1f7a44]">&uarr; Avg: {weekStats.seasonStats.averagePerfectRecords}</span>
                  : <span className="text-[#d1495b]">&darr; Avg: {weekStats.seasonStats.averagePerfectRecords}</span>}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-[#d1495b]">{weekStats.zeroRecords}</div>
            <div className="text-[11px] text-charcoal-500">Zero Records</div>
            {weekStats.seasonStats && (
              <div className="text-[11px] mt-0.5">
                {weekStats.zeroRecords > weekStats.seasonStats.averageZeroRecords
                  ? <span className="text-[#d1495b]">&uarr; Avg: {weekStats.seasonStats.averageZeroRecords}</span>
                  : <span className="text-[#1f7a44]">&darr; Avg: {weekStats.seasonStats.averageZeroRecords}</span>}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2 text-center">
            <div className="text-xl font-bold tabular-nums text-[#b06a1a]">{weekStats.over100Points}</div>
            <div className="text-[11px] text-charcoal-500">&gt;100 Points</div>
            {weekStats.seasonStats && (
              <div className="text-[11px] mt-0.5">
                {weekStats.over100Points >= weekStats.seasonStats.averageOver100Points
                  ? <span className="text-[#1f7a44]">&uarr; Avg: {weekStats.seasonStats.averageOver100Points}</span>
                  : <span className="text-[#d1495b]">&darr; Avg: {weekStats.seasonStats.averageOver100Points}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Records — compact tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2">
            <div className="text-[11px] text-charcoal-500">Week {week} Record</div>
            <div className="font-bold text-[#4B3621] tabular-nums text-sm">{weekStats.overallRecord.wins}-{weekStats.overallRecord.losses}-{weekStats.overallRecord.pushes} <span className="text-charcoal-500 font-semibold">· {weekStats.overallRecord.winPercentage}%</span></div>
          </div>
          {weekStats.seasonRecord && (
            <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2">
              <div className="text-[11px] text-charcoal-500">Season Record</div>
              <div className="font-bold text-[#4B3621] tabular-nums text-sm">{weekStats.seasonRecord.wins}-{weekStats.seasonRecord.losses}-{weekStats.seasonRecord.pushes} <span className="text-charcoal-500 font-semibold">· {weekStats.seasonRecord.winPercentage}%</span></div>
            </div>
          )}
          <div className="rounded-lg bg-[#fff5e2] border border-[#f0dcb0] px-3 py-2">
            <div className="text-[11px] text-[#8a6a1f]">Week {week} Lock</div>
            <div className="font-bold text-[#4B3621] tabular-nums text-sm">{weekStats.lockRecord.wins}-{weekStats.lockRecord.losses}-{weekStats.lockRecord.pushes} <span className="text-[#8a6a1f] font-semibold">· {weekStats.lockRecord.winPercentage}%</span></div>
          </div>
          {weekStats.seasonLockRecord && (
            <div className="rounded-lg bg-[#fff5e2] border border-[#f0dcb0] px-3 py-2">
              <div className="text-[11px] text-[#8a6a1f]">Season Lock</div>
              <div className="font-bold text-[#4B3621] tabular-nums text-sm">{weekStats.seasonLockRecord.wins}-{weekStats.seasonLockRecord.losses}-{weekStats.seasonLockRecord.pushes} <span className="text-[#8a6a1f] font-semibold">· {weekStats.seasonLockRecord.winPercentage}%</span></div>
            </div>
          )}
        </div>

        {/* Notable — compact one-liners */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {weekStats.mostPopularGame && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#faf8f4] border border-[#f0ece5]">
              <span className="truncate">📈 Most picked · {weekStats.mostPopularGame.game}</span>
              <span className="text-charcoal-500 tabular-nums shrink-0">{weekStats.mostPopularGame.pickCount} ({weekStats.mostPopularGame.percentage}%)</span>
            </div>
          )}
          {weekStats.leastPopularGame && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#faf8f4] border border-[#f0ece5]">
              <span className="truncate">📉 Least picked · {weekStats.leastPopularGame.game}</span>
              <span className="text-charcoal-500 tabular-nums shrink-0">{weekStats.leastPopularGame.pickCount} ({weekStats.leastPopularGame.percentage}%)</span>
            </div>
          )}
          {weekStats.mostPopularLock && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#fff5e2] border border-[#f0dcb0]">
              <span className="truncate">🔒 Most locked · {weekStats.mostPopularLock.game}</span>
              <span className="text-[#8a6a1f] tabular-nums shrink-0">{weekStats.mostPopularLock.lockCount} ({weekStats.mostPopularLock.percentage}%)</span>
            </div>
          )}
          {weekStats.biggestUpset && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#fbe9ec] border border-[#f2c9d1]">
              <span className="truncate">🚨 Biggest upset · {weekStats.biggestUpset.game}</span>
              <span className="text-[#d1495b] tabular-nums shrink-0">{weekStats.biggestUpset.winnerPickPercentage}% picked winner</span>
            </div>
          )}
        </div>
      </CardContent>
      </Card>
    )
  }
