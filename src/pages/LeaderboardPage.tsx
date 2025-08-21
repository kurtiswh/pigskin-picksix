import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import LeaderboardTable from '@/components/LeaderboardTable'
import GamesList from '@/components/GamesList'
import { supabase } from '@/lib/supabase'
import { getCurrentWeek } from '@/services/collegeFootballApi'
import { LeaderboardService, LeaderboardEntry } from '@/services/leaderboardService'
import Layout from '@/components/Layout'


export default function LeaderboardPage() {
  const { user, signOut, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<'weekly' | 'season' | 'best-finish' | 'games'>('season')
  const [currentSeason, setCurrentSeason] = useState(2024) // Default to 2024 season where data exists
  const [currentWeek, setCurrentWeek] = useState(1) // Default to week 1
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
    // Wait for auth initialization to complete before loading leaderboard
    console.log('🔐 [LEADERBOARD] Auth state:', { authLoading, user: user?.id, activeTab, currentWeek, currentSeason })
    if (!authLoading) {
      console.log('🔐 [LEADERBOARD] Auth initialization complete, loading leaderboard...')
      loadLeaderboard()
    } else {
      console.log('🔐 [LEADERBOARD] Waiting for auth initialization to complete...')
    }
  }, [activeTab, currentWeek, currentSeason, authLoading])

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
              // loadLeaderboard(true) // TODO: Fix initialization order
              console.log('🔄 Would refresh leaderboard (auto-refresh)')
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

  // Real-time subscriptions for live updates - TEMPORARILY DISABLED due to initialization issues
  // TODO: Re-enable after fixing function order
  /*
  useEffect(() => {
    if (!autoRefresh) return
    // Real-time subscriptions code here...
  }, [currentSeason, autoRefresh, checkForLiveGames])
  */

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && autoRefresh) {
        // Check for live games when user returns to page
        const hasLive = await checkForLiveGames()
        if (hasLive) {
          // loadLeaderboard(true) // TODO: Fix initialization order
          console.log('🔄 Would refresh leaderboard for live games')
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

      console.log('👥 Loading real leaderboard data for', currentSeason, 'week', currentWeek, '- Auth user:', user?.id || 'anonymous')
      
      let leaderboardEntries: LeaderboardEntry[] = []
      
      if (activeTab === 'weekly') {
        leaderboardEntries = await LeaderboardService.getWeeklyLeaderboard(currentSeason, currentWeek)
      } else if (activeTab === 'season') {
        leaderboardEntries = await LeaderboardService.getSeasonLeaderboard(currentSeason)
      } else {
        // For best-finish, use season data for now
        leaderboardEntries = await LeaderboardService.getSeasonLeaderboard(currentSeason)
      }
      
      console.log('✅ Loaded', leaderboardEntries.length, 'leaderboard entries')
      setLeaderboardData(leaderboardEntries)
      setLastUpdate(new Date())

    } catch (err: any) {
      console.error('Error loading leaderboard:', err)
      if (!isBackground) {
        setError(err.message)
        // Fallback to empty array to show "No data" message
        setLeaderboardData([])
      }
    } finally {
      if (!isBackground) {
        setLoading(false)
      }
    }
  }, [activeTab, currentWeek, currentSeason])

  const getBestFinishData = () => {
    // Best Finish uses the same data as season but focuses on weeks 11-14
    return leaderboardData
      .map(entry => ({
        ...entry,
        season_rank: entry.best_finish_rank || entry.season_rank
      }))
      .sort((a, b) => (a.best_finish_rank || 999) - (b.best_finish_rank || 999))
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="bg-pigskin-500 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Leaderboard</h1>
              <p className="text-pigskin-100">Season {currentSeason} • Week {currentWeek}</p>
            </div>
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

              {/* Season and Week Selectors */}
              <div className="flex items-center space-x-4">
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
                
                {(activeTab === 'weekly' || activeTab === 'season') && (
                  <div className="flex items-center space-x-2">
                    <span className="text-pigskin-100 text-sm">Week:</span>
                    <select
                      value={currentWeek}
                      onChange={(e) => setCurrentWeek(parseInt(e.target.value))}
                      className="flex h-8 rounded border border-white/30 bg-white/10 text-white px-2 py-1 text-sm"
                      disabled={activeTab === 'season'}
                    >
                      {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                        <option key={week} value={week} className="text-black">Week {week}</option>
                      ))}
                    </select>
                    {activeTab === 'season' && (
                      <span className="text-pigskin-200 text-xs">(All weeks)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Live Controls - Desktop */}
              <div className="hidden md:flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white text-white hover:bg-white hover:text-pigskin-500"
                  onClick={() => window.location.reload()}
                  disabled={loading}
                  title="Refresh page to get latest data"
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

              {/* Live Controls - Mobile */}
              <div className="flex md:hidden items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white text-white hover:bg-white hover:text-pigskin-500 px-2"
                  onClick={() => window.location.reload()}
                  disabled={loading}
                  title="Refresh page"
                >
                  🔄
                </Button>
              </div>

            </div>
          </div>
        </div>
      </div>

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

        {/* Compact Scoring Info - Toggleable */}
        {activeTab !== 'games' && (
          <div className="mb-4">
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
                    <div className="text-xs text-charcoal-600">2x Bonus on Lock</div>
                  </div>
                </div>
                <div className="text-xs text-charcoal-500 text-center">
                  Bonus: +1 (11-19.5), +3 (20-28.5), +5 (29+) • Lock picks double bonus points
                </div>
              </div>
            </details>
          </div>
        )}

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
    </Layout>
  )
}