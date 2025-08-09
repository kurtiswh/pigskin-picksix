import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import LeaderboardTable from '@/components/LeaderboardTable'
import GamesList from '@/components/GamesList'
import { supabase } from '@/lib/supabase'
import { getCurrentWeek } from '@/services/collegeFootballApi'

interface LeaderboardEntry {
  user_id: string
  display_name: string
  weekly_record?: string
  season_record: string
  lock_record: string
  weekly_points?: number
  season_points: number
  weekly_rank?: number
  season_rank: number
  best_finish_rank?: number
  total_picks: number
  total_wins: number
  total_losses: number
  total_pushes: number
  lock_wins: number
  lock_losses: number
  last_week_points?: number
  trend?: 'up' | 'down' | 'same'
}

export default function LeaderboardPage() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'weekly' | 'season' | 'best-finish' | 'games'>('season')
  const [currentSeason, setCurrentSeason] = useState(new Date().getFullYear()) // Default to current year
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek(new Date().getFullYear())) // Dynamic current week
  const [loading, setLoading] = useState(true)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [isLive] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [hasLiveGames, setHasLiveGames] = useState(false)
  const [updateNotification, setUpdateNotification] = useState<string>('')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update current week when season changes
  useEffect(() => {
    setCurrentWeek(getCurrentWeek(currentSeason))
  }, [currentSeason])

  useEffect(() => {
    loadLeaderboard()
  }, [activeTab, currentWeek, currentSeason])

  // Function to check for live games
  const checkForLiveGames = useCallback(async () => {
    try {
      const { data: liveGames, error } = await supabase
        .from('games')
        .select('status')
        .eq('season', currentSeason)
        .eq('status', 'in_progress')

      if (error) throw error

      const hasLive = liveGames && liveGames.length > 0
      setHasLiveGames(hasLive)
      return hasLive
    } catch (err) {
      console.error('Error checking for live games:', err)
      return false
    }
  }, [currentSeason])

  // Auto-refresh functionality
  useEffect(() => {
    const startAutoRefresh = async () => {
      if (autoRefresh && isLive) {
        // Check for live games initially
        const hasLive = await checkForLiveGames()
        
        if (hasLive) {
          intervalRef.current = setInterval(async () => {
            // Check for live games before each refresh
            const stillHasLive = await checkForLiveGames()
            if (stillHasLive) {
              loadLeaderboard(true) // Background refresh
            }
          }, 300000) // Refresh every 5 minutes (300,000 ms)
        }
      } else {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    startAutoRefresh()

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoRefresh, isLive])

  // Real-time subscriptions for live updates
  useEffect(() => {
    if (!autoRefresh) return

    // Subscribe to picks table updates for real-time scoring
    const picksSubscription = supabase
      .channel('picks-changes')
      .on('postgres_changes', 
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'picks',
          filter: `season=eq.${currentSeason}`
        },
        (payload) => {
          console.log('📊 Pick updated via realtime:', payload)
          // Only refresh if the pick has result data (was just scored)
          if (payload.new && payload.new.result && payload.new.points_earned !== null) {
            setUpdateNotification('Leaderboard updated (live scoring)')
            loadLeaderboard(true)
            
            // Clear notification after 3 seconds
            if (notificationTimeoutRef.current) {
              clearTimeout(notificationTimeoutRef.current)
            }
            notificationTimeoutRef.current = setTimeout(() => {
              setUpdateNotification('')
            }, 3000)
          }
        }
      )
      .subscribe()

    // Subscribe to games table updates for status changes
    const gamesSubscription = supabase
      .channel('games-changes')
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public', 
          table: 'games',
          filter: `season=eq.${currentSeason}`
        },
        (payload) => {
          console.log('🏈 Game updated via realtime:', payload)
          // Refresh leaderboard when games complete or go live
          if (payload.new && (payload.new.status === 'completed' || payload.new.status === 'in_progress')) {
            checkForLiveGames() // Update live games status
            if (payload.new.status === 'completed') {
              setUpdateNotification('Game completed - scores updating')
              loadLeaderboard(true)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(picksSubscription)
      supabase.removeChannel(gamesSubscription)
    }
  }, [currentSeason, autoRefresh, loadLeaderboard, checkForLiveGames])

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && autoRefresh) {
        // Check for live games when user returns to page
        const hasLive = await checkForLiveGames()
        if (hasLive) {
          loadLeaderboard(true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [autoRefresh])

  const loadLeaderboard = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true)
      }
      setError('')

      // Get paid users for current season
      const { data: paidPayments, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('*')
        .eq('season', currentSeason)
        .eq('status', 'Paid')
        .eq('is_matched', true)
        .not('user_id', 'is', null)

      if (paymentsError) throw paymentsError

      if (!paidPayments || paidPayments.length === 0) {
        setLeaderboardData([])
        return
      }

      const userIds = paidPayments.map(p => p.user_id).filter(Boolean)

      if (userIds.length === 0) {
        setLeaderboardData([])
        return
      }

      // Get user details for paid users
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, display_name')
        .in('id', userIds)

      if (usersError) throw usersError

      // Get picks data for paid users only
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select(`
          user_id,
          week,
          season,
          result,
          points_earned,
          is_lock
        `)
        .eq('season', currentSeason)
        .in('user_id', userIds)

      if (picksError) throw picksError

      // Calculate leaderboard entries
      const leaderboard: LeaderboardEntry[] = paidPayments.map(payment => {
        const userId = payment.user_id
        const userData = usersData?.find(u => u.id === userId)
        const userName = userData?.display_name || 'Unknown User'
        
        const userPicks = picksData?.filter(p => p.user_id === userId) || []
        
        // Season stats
        const seasonPicks = userPicks
        const seasonWins = seasonPicks.filter(p => p.result === 'win').length
        const seasonLosses = seasonPicks.filter(p => p.result === 'loss').length  
        const seasonPushes = seasonPicks.filter(p => p.result === 'push').length
        const seasonPoints = seasonPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)
        
        // Lock stats
        const lockPicks = seasonPicks.filter(p => p.is_lock)
        const lockWins = lockPicks.filter(p => p.result === 'win').length
        const lockLosses = lockPicks.filter(p => p.result === 'loss').length
        
        // Weekly stats (for current week)
        const weeklyPicks = activeTab === 'weekly' ? userPicks.filter(p => p.week === currentWeek) : []
        const weeklyWins = weeklyPicks.filter(p => p.result === 'win').length
        const weeklyLosses = weeklyPicks.filter(p => p.result === 'loss').length
        const weeklyPushes = weeklyPicks.filter(p => p.result === 'push').length
        const weeklyPoints = weeklyPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)

        return {
          user_id: userId,
          display_name: userName,
          weekly_record: activeTab === 'weekly' ? `${weeklyWins}-${weeklyLosses}-${weeklyPushes}` : undefined,
          season_record: `${seasonWins}-${seasonLosses}-${seasonPushes}`,
          lock_record: `${lockWins}-${lockLosses}`,
          weekly_points: activeTab === 'weekly' ? weeklyPoints : undefined,
          season_points: seasonPoints,
          weekly_rank: activeTab === 'weekly' ? 0 : undefined,
          season_rank: 0,
          total_picks: seasonPicks.length,
          total_wins: seasonWins,
          total_losses: seasonLosses,
          total_pushes: seasonPushes,
          lock_wins: lockWins,
          lock_losses: lockLosses
        }
      })

      // Sort by appropriate metric
      const sortedLeaderboard = leaderboard.sort((a, b) => {
        if (activeTab === 'weekly') {
          return (b.weekly_points || 0) - (a.weekly_points || 0)
        }
        return b.season_points - a.season_points
      })

      // Add ranks
      sortedLeaderboard.forEach((entry, index) => {
        if (activeTab === 'weekly') {
          entry.weekly_rank = index + 1
        }
        entry.season_rank = index + 1
      })

      setLeaderboardData(sortedLeaderboard)
      setLastUpdate(new Date())
      
      // Show background update notification
      if (isBackground && sortedLeaderboard.length > 0) {
        setUpdateNotification(hasLiveGames ? 'Leaderboard updated (live games)' : 'Leaderboard updated')
        
        // Clear notification after 3 seconds
        if (notificationTimeoutRef.current) {
          clearTimeout(notificationTimeoutRef.current)
        }
        notificationTimeoutRef.current = setTimeout(() => {
          setUpdateNotification('')
        }, 3000)
      }

    } catch (err: any) {
      console.error('Error loading leaderboard:', err)
      if (!isBackground) {
        setError(err.message)
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }, [activeTab, currentWeek, currentSeason])

  // Fallback mock data for demonstration (when no real data)
  const mockLeaderboardData: LeaderboardEntry[] = [
    {
      user_id: '1',
      display_name: 'Sarah "The Sharp" Johnson',
      weekly_record: '5-1-0',
      season_record: '15-2-1',
      lock_record: '2-1-0',
      weekly_points: 127, // 5 wins (20 each) + 1 bonus win (23) + 2 lock wins (22, 22)
      season_points: 342, // 15 wins (avg 21 pts) + 1 push (10) + corrected lock bonuses
      weekly_rank: 1,
      season_rank: 1,
      best_finish_rank: 1,
      total_picks: 18,
      total_wins: 15,
      total_losses: 2,
      total_pushes: 1,
      lock_wins: 2,
      lock_losses: 1,
      last_week_points: 103,
      trend: 'up'
    },
    {
      user_id: '2',
      display_name: 'Mike "Money" Martinez',
      weekly_record: '4-2-0',
      season_record: '13-4-1',
      lock_record: '1-2-0',
      weekly_points: 105, // 4 wins (20 each) + 1 lock win with bonus (26) + 1 bonus win (21)
      season_points: 304, // 13 wins + 1 push + corrected lock bonuses
      weekly_rank: 2,
      season_rank: 2,
      best_finish_rank: 3,
      total_picks: 18,
      total_wins: 13,
      total_losses: 4,
      total_pushes: 1,
      lock_wins: 1,
      lock_losses: 2,
      last_week_points: 84,
      trend: 'up'
    },
    {
      user_id: '3',
      display_name: 'Coach Thompson',
      weekly_record: '5-1-0',
      season_record: '14-3-1',
      lock_record: '3-0-0',
      weekly_points: 124, // 5 wins + 1 lock win with big bonus (30)
      season_points: 318, // Perfect on locks = good bonus points
      weekly_rank: 3,
      season_rank: 3,
      best_finish_rank: 2,
      total_picks: 18,
      total_wins: 14,
      total_losses: 3,
      total_pushes: 1,
      lock_wins: 3,
      lock_losses: 0,
      last_week_points: 67,
      trend: 'up'
    },
    {
      user_id: '4',
      display_name: 'Jennifer "Jinx" Williams',
      weekly_record: '3-3-0',
      season_record: '12-5-1',
      lock_record: '2-1-0',
      weekly_points: 81, // 3 wins (60) + 1 lock win (21)
      season_points: 282, // 12 wins + 1 push + lock bonuses
      weekly_rank: 6,
      season_rank: 4,
      best_finish_rank: 5,
      total_picks: 18,
      total_wins: 12,
      total_losses: 5,
      total_pushes: 1,
      lock_wins: 2,
      lock_losses: 1,
      last_week_points: 102,
      trend: 'down'
    },
    {
      user_id: '5',
      display_name: 'Big Tony',
      weekly_record: '4-2-0',
      season_record: '11-6-1',
      lock_record: '1-2-0',
      weekly_points: 103, // 4 wins + some bonus points
      season_points: 263, // 11 wins + 1 push + minimal bonuses
      weekly_rank: 4,
      season_rank: 5,
      best_finish_rank: 8,
      total_picks: 18,
      total_wins: 11,
      total_losses: 6,
      total_pushes: 1,
      lock_wins: 1,
      lock_losses: 2,
      last_week_points: 62,
      trend: 'up'
    },
    {
      user_id: '6',
      display_name: 'Lucky Larry',
      weekly_record: '2-4-0',
      season_record: '10-7-1',
      lock_record: '0-3-0',
      weekly_points: 44, // 2 wins (40) + 1 bonus (4)
      season_points: 210, // 10 wins + 1 push + no lock bonuses
      weekly_rank: 8,
      season_rank: 6,
      best_finish_rank: 12,
      total_picks: 18,
      total_wins: 10,
      total_losses: 7,
      total_pushes: 1,
      lock_wins: 0,
      lock_losses: 3,
      last_week_points: 86,
      trend: 'down'
    },
    {
      user_id: '7',
      display_name: 'The Rookie',
      weekly_record: '4-2-0',
      season_record: '10-7-1',
      lock_record: '2-1-0',
      weekly_points: 98, // 4 wins + lock bonuses
      season_points: 255, // Good lock performance
      weekly_rank: 5,
      season_rank: 7,
      best_finish_rank: 6,
      total_picks: 18,
      total_wins: 10,
      total_losses: 7,
      total_pushes: 1,
      lock_wins: 2,
      lock_losses: 1,
      last_week_points: 43,
      trend: 'up'
    },
    {
      user_id: '8',
      display_name: 'Commissioner Dave',
      weekly_record: '3-3-0',
      season_record: '9-8-1',
      lock_record: '1-2-0',
      weekly_points: 67, // 3 wins + minimal bonus
      season_points: 202, // 9 wins + 1 push + some bonuses
      weekly_rank: 7,
      season_rank: 8,
      best_finish_rank: 10,
      total_picks: 18,
      total_wins: 9,
      total_losses: 8,
      total_pushes: 1,
      lock_wins: 1,
      lock_losses: 2,
      last_week_points: 71,
      trend: 'same'
    }
  ]

  const getCurrentWeekData = () => {
    return mockLeaderboardData.map(entry => ({
      ...entry,
      weekly_points: entry.weekly_points || 0,
      weekly_rank: entry.weekly_rank || 0
    }))
  }

  const getBestFinishData = () => {
    // Simulate "Best Finish" championship (weeks 11-14)
    return mockLeaderboardData
      .map(entry => ({
        ...entry,
        season_rank: entry.best_finish_rank || entry.season_rank
      }))
      .sort((a, b) => (a.best_finish_rank || 999) - (b.best_finish_rank || 999))
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-pigskin-500 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                <span className="text-pigskin-900 font-bold">P6</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">Leaderboard</h1>
                <p className="text-pigskin-100 text-sm">Season {currentSeason} • Week {currentWeek}</p>
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              {/* Live Status Indicator */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  hasLiveGames ? 'bg-green-400 animate-pulse' : 
                  isLive ? 'bg-yellow-400' : 'bg-red-400'
                }`}></div>
                <span className="text-pigskin-100 text-sm">
                  {hasLiveGames ? 'LIVE GAMES' : isLive ? 'READY' : 'OFFLINE'}
                </span>
                {lastUpdate && (
                  <span className="text-pigskin-200 text-xs">
                    Updated {new Date(lastUpdate).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Season Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-pigskin-100 text-sm">Season:</span>
                <select
                  value={currentSeason}
                  onChange={(e) => setCurrentSeason(parseInt(e.target.value))}
                  className="flex h-8 rounded border border-white/30 bg-white/10 text-white px-2 py-1 text-sm"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year} className="text-black">{year}</option>
                  ))}
                </select>
              </div>

              {/* Live Controls */}
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white text-white hover:bg-white hover:text-pigskin-500"
                  onClick={() => loadLeaderboard()}
                  disabled={loading}
                >
                  🔄 Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`border-white text-white hover:bg-white hover:text-pigskin-500 ${autoRefresh ? 'bg-white/20' : ''}`}
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  title={`Auto-refresh every 5 minutes when games are live`}
                >
                  {autoRefresh ? '⏸️' : '▶️'} Auto (5min)
                </Button>
              </div>

              {user && (
                <>
                  <span className="text-pigskin-100">Hi, {user.display_name}!</span>
                  <Link to="/profile">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-white text-white hover:bg-white hover:text-pigskin-500"
                    >
                      Profile
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white text-white hover:bg-white hover:text-pigskin-500"
                    onClick={signOut}
                  >
                    Sign Out
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Update Notification */}
        {updateNotification && (
          <div className="fixed top-20 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300 ease-in-out">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-200 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">{updateNotification}</span>
            </div>
          </div>
        )}
        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-white p-1 rounded-lg shadow-sm">
          <button
            onClick={() => setActiveTab('season')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'season'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Season Standings
          </button>
          <button
            onClick={() => setActiveTab('weekly')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'weekly'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Weekly Results
          </button>
          <button
            onClick={() => setActiveTab('best-finish')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'best-finish'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Best Finish Championship
          </button>
          <button
            onClick={() => setActiveTab('games')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'games'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Games & Scoring
          </button>
        </div>

        {/* Scoring System Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Scoring System</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-center mb-6">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">20</div>
                <div className="text-sm text-charcoal-600">Cover Spread</div>
                <div className="text-xs text-charcoal-500">+ bonus points</div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">10</div>
                <div className="text-sm text-charcoal-600">Push (Exact)</div>
                <div className="text-xs text-charcoal-500">Team wins by spread</div>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">0</div>
                <div className="text-sm text-charcoal-600">Don't Cover</div>
                <div className="text-xs text-charcoal-500">Miss the spread</div>
              </div>
              <div className="p-4 bg-gold-50 rounded-lg">
                <div className="text-2xl font-bold text-gold-600">🔒</div>
                <div className="text-sm text-charcoal-600">Lock Pick</div>
                <div className="text-xs text-charcoal-500">Double bonus points</div>
              </div>
            </div>
            
            {/* Bonus Points */}
            <div className="border-t border-stone-200 pt-4">
              <h4 className="font-semibold text-center mb-4">Bonus Points (added to 20 base points when you cover)</h4>
              <div className="grid md:grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-600">+1</div>
                  <div className="text-sm text-charcoal-600">Cover by 11-19.5</div>
                  <div className="text-xs text-charcoal-500">21 total (22 if Lock)</div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">+3</div>
                  <div className="text-sm text-charcoal-600">Cover by 20-28.5</div>
                  <div className="text-xs text-charcoal-500">23 total (26 if Lock)</div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-bold text-orange-600">+5</div>
                  <div className="text-sm text-charcoal-600">Cover by 29+</div>
                  <div className="text-xs text-charcoal-500">25 total (30 if Lock)</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200">
            <CardContent className="p-6 text-center">
              <div className="text-red-500 text-2xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold mb-2">Error Loading Leaderboard</h3>
              <p className="text-charcoal-600 mb-4">{error}</p>
              <Button onClick={loadLeaderboard}>Try Again</Button>
            </CardContent>
          </Card>
        )}

        {/* No Data Display */}
        {!error && !loading && leaderboardData.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">🏈</div>
              <h3 className="text-lg font-semibold mb-2">No Leaderboard Data</h3>
              <p className="text-charcoal-600 mb-4">
                Only users with paid LeagueSafe entries for {currentSeason} appear on the leaderboard.
                Upload a LeagueSafe CSV to see participants.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Content */}
        {!error && (activeTab === 'season' && (
          <LeaderboardTable
            entries={leaderboardData}
            type="season"
            loading={loading}
            lastUpdate={lastUpdate}
            isLive={isLive && autoRefresh}
            hasLiveGames={hasLiveGames}
          />
        ))}

        {!error && activeTab === 'weekly' && (
          <LeaderboardTable
            entries={leaderboardData}
            type="weekly"
            week={currentWeek}
            loading={loading}
            lastUpdate={lastUpdate}
            isLive={isLive && autoRefresh}
            hasLiveGames={hasLiveGames}
          />
        )}

        {activeTab === 'best-finish' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Best Finish Championship</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-charcoal-600 mb-4">
                  The Best Finish Championship runs during weeks 11-14, giving everyone a fresh chance 
                  at victory regardless of their season-long performance. Only the best 4-week stretch matters!
                </p>
                <div className="grid md:grid-cols-4 gap-4 text-center text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="font-semibold">Week 11</div>
                    <div className="text-charcoal-500">Nov 9-10</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="font-semibold">Week 12</div>
                    <div className="text-charcoal-500">Nov 16-17</div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="font-semibold">Week 13</div>
                    <div className="text-charcoal-500">Nov 23-24</div>
                  </div>
                  <div className="p-3 bg-gold-50 border border-gold-200 rounded-lg">
                    <div className="font-semibold">Week 14</div>
                    <div className="text-charcoal-500">Championship</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <LeaderboardTable
              entries={getBestFinishData()}
              type="best-finish"
              loading={loading}
              lastUpdate={lastUpdate}
              isLive={isLive && autoRefresh}
              hasLiveGames={hasLiveGames}
            />
          </div>
        )}

        {activeTab === 'games' && (
          <div className="space-y-6">
            <GamesList 
              season={currentSeason}
              week={currentWeek}
            />
          </div>
        )}
      </main>
    </div>
  )
}