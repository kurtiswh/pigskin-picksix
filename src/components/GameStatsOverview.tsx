import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import type { Game } from '@/types'
import { WeekRow, EntryRow, summarizeWeek, summarizeSeason, allWeeks } from '@/lib/weekRecords'
import { fetchAllRows, loadOtherWeeks } from '@/services/weekRecordsService'
import { RecordHeadline, RecordWatch, WatchItem, MyWeekLine, MyWeek } from '@/components/WeekRecords'
import { useAuth } from '@/hooks/useAuth'

/** Most a still-unscored pick can add: 20 + 5 bonus; the Lock doubles the bonus (+5). */
const MAX_PICK_POINTS = 25
const MAX_LOCK_EXTRA = 5


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
    /** Earlier weeks the averages cover; 0 in Week 1, when there's nothing to compare to */
    priorWeeks: number
  } | null
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
  } | null
  seasonLockRecord?: {
    wins: number
    losses: number
    pushes: number
    winPercentage: number
  } | null
  mostPopularGame: {
    game: string
    pickCount: number
    percentage: number
    crowd?: CrowdSide | null
  } | null
  leastPopularGame: {
    game: string
    pickCount: number
    percentage: number
    crowd?: CrowdSide | null
  } | null
  mostPopularLock: {
    game: string
    lockCount: number
    percentage: number
    crowd?: CrowdSide | null
  } | null
  biggestUpset: {
    game: string
    winnerPickPercentage: number
    loserPickPercentage: number
  } | null
  records?: {
    weeks: WeekRow[]      // every week since 2016, this one included
    current: WeekRow
    live: boolean         // games still going or picks still unscored
    watch: WatchItem[]
    field: (MyWeek & { userId: string })[]
  } | null
}

type Outcome = 'covered' | 'lost' | 'push' | 'covering' | 'trailing' | 'level' | null

/** The side most of the field (or most Locks) took in a game, and how it went. */
interface CrowdSide {
  team: string
  count: number     // picks (or Locks) on that side
  of: number        // picks (or Locks) on the game
  outcome: Outcome
}

/** How `team` stands against the spread: final result, or right now while live. */
function atsOutcome(game: Game, team: string): Outcome {
  if (game.home_score == null || game.away_score == null) return null
  const homeMargin = game.home_score - game.away_score + game.spread
  const m = team === game.home_team ? homeMargin : -homeMargin
  if (game.status === 'completed') return m > 0 ? 'covered' : m < 0 ? 'lost' : 'push'
  if (game.status === 'in_progress') return m > 0 ? 'covering' : m < 0 ? 'trailing' : 'level'
  return null
}

/** Majority side of a game by picks (Locks counted as picks) or by Locks alone. */
function crowdSide(game: Game, by: 'picks' | 'locks'): CrowdSide | null {
  const home = by === 'picks' ? (game.home_team_picks || 0) + (game.home_team_locks || 0) : (game.home_team_locks || 0)
  const away = by === 'picks' ? (game.away_team_picks || 0) + (game.away_team_locks || 0) : (game.away_team_locks || 0)
  if (home + away === 0) return null
  const team = home >= away ? game.home_team : game.away_team
  return { team, count: Math.max(home, away), of: home + away, outcome: atsOutcome(game, team) }
}

const OUTCOME_TEXT: Record<Exclude<Outcome, null>, { text: string; cls: string }> = {
  covered: { text: '✓ covered', cls: 'text-[#1f7a44]' },
  lost: { text: '✗ didn’t cover', cls: 'text-[#d1495b]' },
  push: { text: 'push', cls: 'text-[#b06a1a]' },
  covering: { text: 'covering now', cls: 'text-[#1f7a44]' },
  trailing: { text: 'not covering now', cls: 'text-[#d1495b]' },
  level: { text: 'even with the spread', cls: 'text-[#b06a1a]' },
}

/** One "story" line: what was popular, and what happened to it. */
function NoteRow({ label, game, meta, detail, outcome, tone = 'plain' }: {
  label: string
  game: string
  meta: string
  detail: string
  outcome?: Outcome
  tone?: 'plain' | 'lock' | 'upset'
}) {
  const box = tone === 'lock' ? 'bg-[#fff5e2] border-[#f0dcb0]' : tone === 'upset' ? 'bg-[#fbe9ec] border-[#f2c9d1]' : 'bg-[#faf8f4] border-[#f0ece5]'
  return (
    <div className={`px-3 py-2 rounded-lg border ${box} text-sm`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate"><span className="font-semibold text-[#4B3621]">{label}</span> · {game}</span>
        <span className="text-[11px] text-charcoal-500 tabular-nums shrink-0">{meta}</span>
      </div>
      <div className="text-[12.5px] text-charcoal-700">
        {detail}
        {outcome && <span className={`font-semibold ${OUTCOME_TEXT[outcome].cls}`}> · {OUTCOME_TEXT[outcome].text}</span>}
      </div>
    </div>
  )
}

/**
 * "↑ 20 above avg (6.3)": how this week compares to the season's earlier weeks.
 * Spelled out because a bare "Avg: 6.3" read as "6.3 above average".
 */
function VsAvg({ value, avg, higherIsGood, decimals = 0 }: {
  value: number
  avg: number
  higherIsGood: boolean
  decimals?: number
}) {
  const factor = 10 ** decimals
  const diff = Math.round((value - avg) * factor) / factor
  const avgLabel = avg.toFixed(1)
  if (diff === 0) {
    return <div className="text-[11px] mt-0.5 text-charcoal-500">Same as avg ({avgLabel})</div>
  }
  const up = diff > 0
  const good = up === higherIsGood
  return (
    <div
      className={`text-[11px] mt-0.5 ${good ? 'text-[#1f7a44]' : 'text-[#d1495b]'}`}
      title={`Average of this season's earlier weeks: ${avgLabel}`}
    >
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(decimals)} {up ? 'above' : 'below'} avg ({avgLabel})
    </div>
  )
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
  const { user } = useAuth()
  // null = automatic: collapsed while games are live, open once the week is final
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  // Drop the previous week's stats so a week switch shows the skeleton, but a
  // background score refresh of the same week keeps the current card on screen
  useEffect(() => {
    setWeekStats(null)
  }, [season, week])

  useEffect(() => {
    if (showPickStats && games.length > 0) {
      loadWeekStats()
    }
  }, [showPickStats, season, week, games])

  const loadWeekStats = async () => {
    try {
      setLoading(true)

      const weeklyLeaderboard = await fetchAllRows<any>((from, to) => supabase
        .from('weekly_leaderboard')
        .select('user_id, display_name, picks_made, total_points, wins, losses, pushes, lock_wins, lock_losses, lock_pushes')
        .eq('season', season)
        .eq('week', week)
        .order('user_id', { ascending: true })
        .range(from, to))

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
      let otherWeekRows: EntryRow[] = []
      
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
        
        // Per-week averages over the season's EARLIER weeks, so "vs. avg" compares
        // this week to a typical week rather than to an average that includes it.
        // Paged: a season is thousands of rows and one request stops at 1,000,
        // which used to average a partial, arbitrary sample.
        let allWeeksError: any = null
        try {
          otherWeekRows = await loadOtherWeeks(season, week)
        } catch (err) {
          allWeeksError = err
        }
        const allWeeklyData = otherWeekRows.filter(r => r.week >= 1 && r.week < week)
        
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
          weeklyStats.forEach((weekData, _weekNum) => {
            const usersWithPicksThisWeek = weekData.filter((user: any) => (user.wins || 0) + (user.losses || 0) + (user.pushes || 0) > 0)
            
            // Perfect records for this week (6-0-0)
            const weekPerfectRecords = usersWithPicksThisWeek.filter((user: any) => 
              (user.wins || 0) === 6 && 
              (user.losses || 0) === 0 && 
              (user.pushes || 0) === 0
            ).length
            
            // Zero records for this week (0-6-0)
            const weekZeroRecords = usersWithPicksThisWeek.filter((user: any) => 
              (user.wins || 0) === 0 && 
              (user.losses || 0) === 6 && 
              (user.pushes || 0) === 0
            ).length
            
            // Over 100 points for this week
            const weekOver100Points = usersWithPicksThisWeek.filter((user: any) => 
              (user.total_points || 0) > 100
            ).length
            
            // Calculate average score for this week
            const weekScores = usersWithPicksThisWeek.map((user: any) => user.total_points || 0)
            const weekAverageScore = weekScores.length > 0 ? 
              weekScores.reduce((a: any, b: any) => a + b, 0) / weekScores.length : 0
            
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
          averageScore: avgScorePerWeek,  // mean of earlier weeks' averages
          perfectRecords: 0, // Not needed for display, using averages instead
          zeroRecords: 0, // Not needed for display, using averages instead  
          over100Points: 0, // Not needed for display, using averages instead
          averagePerfectRecords: avgPerfectPerWeek,
          averageZeroRecords: avgZeroPerWeek,
          averageOver100Points: avgOver100PerWeek,
          priorWeeks: allWeeksError ? 0 : new Set(allWeeklyData.map(r => r.week)).size
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
          picks: (game.home_team_picks || 0) + (game.away_team_picks || 0) + (game.home_team_locks || 0) + (game.away_team_locks || 0),
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
          if (game.home_score != null && game.away_score != null) {
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

      // Records: rank this week against every week since 2016
      let records: WeekStats['records'] = null
      try {
        const current = summarizeWeek(season, week, usersWithPicks)
        const weeks = allWeeks(summarizeSeason(season, otherWeekRows), current)
        const pendingOf = (u: any) => Math.max(0, (u.picks_made || 0) - (u.wins || 0) - (u.losses || 0) - (u.pushes || 0))
        const live = games.some(g => g.status !== 'completed') || usersWithPicks.some(u => pendingOf(u) > 0)
        const perfectChasing = usersWithPicks.filter(u => (u.losses || 0) === 0 && (u.pushes || 0) === 0 && pendingOf(u) > 0).length
        const over100Chasing = usersWithPicks.filter(u => {
          const pts = u.total_points || 0
          const pending = pendingOf(u)
          const lockScored = (u.lock_wins || 0) + (u.lock_losses || 0) + (u.lock_pushes || 0) > 0
          return pts <= 100 && pending > 0 && pts + pending * MAX_PICK_POINTS + (lockScored ? 0 : MAX_LOCK_EXTRA) > 100
        }).length
        records = {
          weeks,
          current,
          live,
          field: usersWithPicks.map(u => ({
            userId: u.user_id,
            wins: u.wins || 0, losses: u.losses || 0, pushes: u.pushes || 0,
            points: u.total_points || 0, pending: pendingOf(u),
          })),
          watch: [
            { stat: 'perfect', now: current.perfect, possible: current.perfect + perfectChasing, chasing: perfectChasing },
            { stat: 'over100', now: current.over100, possible: current.over100 + over100Chasing, chasing: over100Chasing },
          ],
        }
      } catch (err) {
        console.warn('Week records unavailable:', err)
      }

      setWeekStats({
        records,
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
          percentage: Math.round((mostPopular.picks / totalSubmissions) * 100),
          crowd: crowdSide(mostPopular.gameInfo, 'picks')
        } : null,
        leastPopularGame: leastPopular ? {
          game: `${leastPopular.gameInfo.away_team} vs. ${leastPopular.gameInfo.home_team}`,
          pickCount: leastPopular.picks,
          percentage: Math.round((leastPopular.picks / totalSubmissions) * 100),
          crowd: crowdSide(leastPopular.gameInfo, 'picks')
        } : null,
        mostPopularLock: mostPopularLock && mostPopularLock.locks > 0 ? {
          game: `${mostPopularLock.gameInfo.away_team} vs. ${mostPopularLock.gameInfo.home_team}`,
          lockCount: mostPopularLock.locks,
          percentage: Math.round((mostPopularLock.locks / Math.max(1, gameStats.reduce((sum, g) => sum + g.locks, 0))) * 100),
          crowd: crowdSide(mostPopularLock.gameInfo, 'locks')
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

  if (loading && !weekStats) {
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

  const rec = weekStats.records
  const live = !!rec?.live
  // A half-played week vs. full weeks isn't a fair comparison, so "vs. avg"
  // waits for the final like the record badges do.
  const showVsAvg = !live && !!weekStats.seasonStats && weekStats.seasonStats.priorWeeks > 0
  const soFar = live ? ' so far' : ''
  const isOpen = expanded ?? !live
  const myEntry = rec && user ? rec.field.find(f => f.userId === user.id) : undefined

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg">Week {week} Overview{live ? <span className="ml-2 text-xs font-semibold text-[#c0392b] align-middle">LIVE</span> : null}</CardTitle>
          <button
            type="button"
            onClick={() => setExpanded(!isOpen)}
            aria-expanded={isOpen}
            className="shrink-0 text-sm font-semibold text-[#4B3621] px-2 py-1.5 rounded-md hover:bg-[#faf8f4]"
          >
            {isOpen ? 'Hide stats ▴' : 'Show stats ▾'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rec && myEntry && (
          <MyWeekLine me={myEntry} field={rec.field} live={live} weeks={rec.weeks} current={rec.current} />
        )}
        {rec && (live
          ? <RecordWatch items={rec.watch} weeks={rec.weeks} current={rec.current} />
          : <RecordHeadline weeks={rec.weeks} current={rec.current} />)}

        {isOpen && <>
        {/* 1. Three headline numbers; the rest is a caption */}
        <div className="text-xs text-charcoal-500">
          {weekStats.totalSubmissions} entries{soFar}
          {weekStats.zeroRecords > 0 && <> · {weekStats.zeroRecords} went 0-6</>}
          {weekStats.seasonStats && <> · {weekStats.seasonStats.totalSubmissions} have played this season</>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-2 py-2.5 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-[#4B3621]">{weekStats.averageScore}</div>
            <div className="text-[11px] text-charcoal-500">Avg score{soFar}</div>
            {showVsAvg && <VsAvg value={weekStats.averageScore} avg={weekStats.seasonStats!.averageScore} higherIsGood decimals={1} />}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-2 py-2.5 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-[#1f7a44]">{weekStats.perfectRecords}</div>
            <div className="text-[11px] text-charcoal-500">Perfect 6-0{soFar}</div>
            {showVsAvg && <VsAvg value={weekStats.perfectRecords} avg={weekStats.seasonStats!.averagePerfectRecords} higherIsGood />}
          </div>
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-2 py-2.5 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-[#b06a1a]">{weekStats.over100Points}</div>
            <div className="text-[11px] text-charcoal-500">Over 100{soFar}</div>
            {showVsAvg && <VsAvg value={weekStats.over100Points} avg={weekStats.seasonStats!.averageOver100Points} higherIsGood />}
          </div>
        </div>

        {/* 2. Percentages, not win-loss totals (totals on hover) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-[#faf8f4] border border-[#f0ece5] px-3 py-2"
            title={`${weekStats.overallRecord.wins}-${weekStats.overallRecord.losses}-${weekStats.overallRecord.pushes} this week`}>
            <div className="text-[11px] text-charcoal-500">Field ATS{soFar}</div>
            <div className="text-lg font-bold tabular-nums text-[#4B3621]">{weekStats.overallRecord.winPercentage}%</div>
            {weekStats.seasonRecord && <div className="text-[11px] text-charcoal-500">Season {weekStats.seasonRecord.winPercentage}%</div>}
          </div>
          <div className="rounded-lg bg-[#fff5e2] border border-[#f0dcb0] px-3 py-2"
            title={`${weekStats.lockRecord.wins}-${weekStats.lockRecord.losses}-${weekStats.lockRecord.pushes} this week`}>
            <div className="text-[11px] text-[#8a6a1f]">Locks{soFar}</div>
            <div className="text-lg font-bold tabular-nums text-[#4B3621]">{weekStats.lockRecord.winPercentage}%</div>
            {weekStats.seasonLockRecord && <div className="text-[11px] text-[#8a6a1f]">Season {weekStats.seasonLockRecord.winPercentage}%</div>}
          </div>
        </div>

        {/* 4. What was popular, and what happened to it */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {weekStats.mostPopularGame && (
            <NoteRow
              label="Most picked"
              game={weekStats.mostPopularGame.game}
              meta={`${weekStats.mostPopularGame.pickCount} picks`}
              detail={weekStats.mostPopularGame.crowd
                ? `${Math.round((100 * weekStats.mostPopularGame.crowd.count) / weekStats.mostPopularGame.crowd.of)}% took ${weekStats.mostPopularGame.crowd.team}`
                : 'No picks yet'}
              outcome={weekStats.mostPopularGame.crowd?.outcome}
            />
          )}
          {weekStats.mostPopularLock && (
            <NoteRow
              tone="lock"
              label="Most locked"
              game={weekStats.mostPopularLock.game}
              meta={`${weekStats.mostPopularLock.lockCount} Locks`}
              detail={weekStats.mostPopularLock.crowd
                ? `${weekStats.mostPopularLock.crowd.count} locked ${weekStats.mostPopularLock.crowd.team}`
                : ''}
              outcome={weekStats.mostPopularLock.crowd?.outcome}
            />
          )}
          {weekStats.leastPopularGame && (
            <NoteRow
              label="Least picked"
              game={weekStats.leastPopularGame.game}
              meta={`${weekStats.leastPopularGame.pickCount} picks`}
              detail={weekStats.leastPopularGame.crowd
                ? `${weekStats.leastPopularGame.crowd.count} of ${weekStats.leastPopularGame.crowd.of} took ${weekStats.leastPopularGame.crowd.team}`
                : 'Nobody picked it'}
              outcome={weekStats.leastPopularGame.crowd?.outcome}
            />
          )}
          {weekStats.biggestUpset && (
            <NoteRow
              tone="upset"
              label="Biggest upset"
              game={weekStats.biggestUpset.game}
              meta=""
              detail={`Only ${weekStats.biggestUpset.winnerPickPercentage}% took the side that covered`}
            />
          )}
        </div>
        </>}
      </CardContent>
      </Card>
    )
  }
