import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import GameResultCard from '@/components/GameResultCard'
import GameStatsOverview from '@/components/GameStatsOverview'
import GamePickStatistics from '@/components/GamePickStatistics'
import { supabase } from '@/lib/supabase'
import { liveUpdateService } from '@/services/liveUpdateService'
import { getCurrentWeek } from '@/services/collegeFootballApi'
import { useAuth } from '@/hooks/useAuth'
import type { Pick } from '@/types'

interface Game {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: 'scheduled' | 'in_progress' | 'completed'
  kickoff_time: string
  venue: string | null
  home_conference: string | null
  away_conference: string | null
  // Live game data
  game_period: number | null
  game_clock: string | null
  api_period: number | null
  api_clock: string | null
  api_completed: boolean | null
  // Pick statistics
  home_team_picks?: number
  home_team_locks?: number
  away_team_picks?: number
  away_team_locks?: number
  total_picks?: number
  pick_stats_updated_at?: string
  // Scoring fields
  base_points?: number
  margin_bonus?: number
}

interface WeekSettings {
  week: number
  season: number
  deadline: string
  picks_open: boolean
}

export default function GamesPage() {
  const { season: urlSeason, week: urlWeek } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [currentSeason, setCurrentSeason] = useState(
    urlSeason ? parseInt(urlSeason) : 2025
  )
  const [currentWeek, setCurrentWeek] = useState(
    urlWeek ? parseInt(urlWeek) : getCurrentWeek(2025)
  )
  const [games, setGames] = useState<Game[]>([])
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  const [userPicks, setUserPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  
  // Live update integration
  const [liveUpdateStatus, setLiveUpdateStatus] = useState(liveUpdateService.getStatus())
  
  const isAdmin = user?.is_admin === true
  const isPickDeadlinePassed = weekSettings 
    ? new Date() > new Date(weekSettings.deadline)
    : false

  // Debug logging for pick deadline
  useEffect(() => {
    console.log('🔍 Pick deadline check:', {
      weekSettings,
      currentTime: new Date(),
      deadline: weekSettings ? new Date(weekSettings.deadline) : 'No deadline',
      isPickDeadlinePassed,
      showPickStats: isPickDeadlinePassed
    })
  }, [weekSettings, isPickDeadlinePassed])

  useEffect(() => {
    loadGames()
    loadWeekSettings()
    loadUserPicks()
    updateLiveStatus()
    
    // Set up live status monitoring
    const statusInterval = setInterval(updateLiveStatus, 10000)
    const refreshInterval = setInterval(checkForAutoRefresh, 30000)
    
    // Add game status refresh timer for real-time countdown updates
    const gameRefreshInterval = setInterval(() => {
      setGames(currentGames => [...currentGames]) // Force re-render to update time-based status
    }, 30000)
    
    // Periodic data refresh
    const dataRefreshInterval = setInterval(() => {
      loadGames() // Refetch games from database
    }, 60000) // Every minute
    
    return () => {
      clearInterval(statusInterval)
      clearInterval(refreshInterval)
      clearInterval(gameRefreshInterval)
      clearInterval(dataRefreshInterval)
    }
  }, [currentSeason, currentWeek])

  useEffect(() => {
    // Update URL when season/week changes
    const newPath = `/games/${currentSeason}/${currentWeek}`
    navigate(newPath, { replace: true })
  }, [currentSeason, currentWeek, navigate])

  const updateLiveStatus = () => {
    setLiveUpdateStatus(liveUpdateService.getStatus())
  }

  const checkForAutoRefresh = () => {
    if (liveUpdateService.shouldRefreshLeaderboard()) {
      console.log('🔄 Auto-refreshing games due to live updates')
      loadGames()
      liveUpdateService.acknowledgeLeaderboardRefresh()
    }
  }

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', currentWeek)
        .order('kickoff_time', { ascending: true })

      if (gamesError) throw gamesError

      console.log(`📊 Loaded ${data?.length || 0} games for Week ${currentWeek}, Season ${currentSeason}`)
      if (data && data.length > 0) {
        const inProgress = data.filter(g => g.status === 'in_progress').length
        const completed = data.filter(g => g.status === 'completed').length
        console.log(`🏈 Status: ${inProgress} in progress, ${completed} completed`)
        
        // Log first game details for debugging
        const firstGame = data[0]
        console.log('First game:', {
          teams: `${firstGame.away_team} @ ${firstGame.home_team}`,
          status: firstGame.status,
          kickoff: firstGame.kickoff_time,
          scores: `${firstGame.away_score || 0} - ${firstGame.home_score || 0}`
        })
      }

      setGames(data || [])
    } catch (err: any) {
      console.error('Error loading games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadWeekSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('week_settings')
        .select('week, season, deadline, picks_open')
        .eq('season', currentSeason)
        .eq('week', currentWeek)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      setWeekSettings(data)
    } catch (err: any) {
      console.error('Error loading week settings:', err)
    }
  }

  const loadUserPicks = async () => {
    if (!user) {
      setUserPicks([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('picks')
        .select('*')
        .eq('user_id', user.id)
        .eq('season', currentSeason)
        .eq('week', currentWeek)

      if (error) throw error
      
      console.log(`📊 Loaded ${data?.length || 0} user picks for Week ${currentWeek}, Season ${currentSeason}`)
      setUserPicks(data || [])
    } catch (err: any) {
      console.error('Error loading user picks:', err)
      setUserPicks([])
    }
  }

  const handleWeekChange = (week: string) => {
    setCurrentWeek(parseInt(week))
  }

  const handleSeasonChange = (season: string) => {
    setCurrentSeason(parseInt(season))
  }

  const runManualUpdate = async () => {
    // Restrict manual API updates to admin users only
    if (!isAdmin) {
      console.warn('⚠️ Manual API updates are restricted to admin users only')
      alert('Manual API updates are restricted to admin users to preserve API quota.')
      return
    }
    
    try {
      setLoading(true)
      console.log(`🔄 Admin manual update for Week ${currentWeek}, Season ${currentSeason}...`)
      const result = await liveUpdateService.manualUpdate(currentSeason, currentWeek)
      
      if (result.success) {
        console.log(`✅ Manual update successful:`)
        console.log(`   - Games updated: ${result.gamesUpdated}`)
        console.log(`   - Picks processed: ${result.picksProcessed}`)
        if (result.errors.length > 0) {
          console.log(`   - Warnings: ${result.errors.join(', ')}`)
        }
        await loadGames()
      } else {
        console.error('❌ Manual update failed:', result.errors)
        setError('Manual update failed: ' + result.errors.join(', '))
      }
    } catch (err: any) {
      console.error('❌ Manual update error:', err)
      setError('Manual update error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const startLiveUpdates = async () => {
    await liveUpdateService.startSmartPolling()
    updateLiveStatus()
  }

  const stopLiveUpdates = () => {
    liveUpdateService.stopPolling()
    updateLiveStatus()
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        {/* Header with selectors and controls */}
        <div className="mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-charcoal-800">Games & Results</h1>
            <p className="text-charcoal-600 mt-1">
              Live scores, pick statistics, and game outcomes
            </p>
          </div>
          
          {/* Live Update Controls (Admin Only) */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Badge 
                variant={liveUpdateStatus.isRunning ? "default" : "secondary"}
                className={liveUpdateStatus.isRunning ? "bg-green-600" : ""}
              >
                {liveUpdateStatus.isRunning ? "🔴 Live" : "⏸️ Paused"}
              </Badge>
              
              <Button
                onClick={liveUpdateStatus.isRunning ? stopLiveUpdates : startLiveUpdates}
                variant="outline"
                size="sm"
              >
                {liveUpdateStatus.isRunning ? "Stop Updates" : "Start Live Updates"}
              </Button>
              
              <Button
                onClick={runManualUpdate}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                Manual Update
              </Button>
            </div>
          )}
        </div>

        {/* Week and Season Selectors */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-charcoal-700">Season:</label>
            <Select value={currentSeason.toString()} onValueChange={handleSeasonChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-charcoal-700">Week:</label>
            <Select value={currentWeek.toString()} onValueChange={handleWeekChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 15 }, (_, i) => i + 1).map(week => (
                  <SelectItem key={week} value={week.toString()}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pick Deadline Status */}
          {weekSettings && (
            <div className="flex items-center gap-2">
              <Badge variant={isPickDeadlinePassed ? "destructive" : "default"}>
                {isPickDeadlinePassed ? "Picks Closed" : "Picks Open"}
              </Badge>
              <span className="text-xs text-charcoal-500">
                Deadline: {new Date(weekSettings.deadline).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-600 text-sm">❌ {error}</p>
          </CardContent>
        </Card>
      )}
      
      {/* Offline Status */}
      {offline && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <p className="text-orange-600 text-sm">⚠️ Connection offline - live updates unavailable</p>
          </CardContent>
        </Card>
      )}

      {/* Live Update Status */}
      {liveUpdateStatus.lastUpdate && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-charcoal-600">
                Last updated: {liveUpdateStatus.lastUpdate.toLocaleTimeString()}
              </span>
              {liveUpdateStatus.nextUpdate && (
                <span className="text-charcoal-500">
                  Next update: {liveUpdateStatus.nextUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
            {liveUpdateStatus.lastResult && (
              <div className="text-xs text-charcoal-500 mt-1">
                {liveUpdateStatus.lastResult.gamesUpdated} games updated, {liveUpdateStatus.lastResult.picksProcessed} picks processed
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Week Stats Overview */}
      <GameStatsOverview 
        season={currentSeason}
        week={currentWeek}
        games={games}
        showPickStats={isPickDeadlinePassed}
        className="mb-6"
      />

      {/* Games Grid */}
      <div className="space-y-4">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-stone-200 rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-stone-200 rounded"></div>
                    <div className="h-3 bg-stone-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : games.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">🏈</div>
              <h3 className="text-lg font-medium text-charcoal-700 mb-2">No Games Found</h3>
              <p className="text-charcoal-500 text-sm">
                No games are available for {currentSeason} Week {currentWeek}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {games.map((game, index) => {
              const userPick = userPicks.find(pick => pick.game_id === game.id)
              return (
                <GameResultCard
                  key={game.id}
                  game={{
                    ...game,
                    quarter: game.game_period || game.api_period,
                    clock: game.game_clock || game.api_clock
                  }}
                  gameNumber={index + 1}
                  showPickStats={isPickDeadlinePassed}
                  isAdmin={isAdmin}
                  userPick={userPick}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
    </Layout>
  )
}