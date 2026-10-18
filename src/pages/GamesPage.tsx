import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { PillTabs } from '@/components/ui/PillTabs'
import GameResultCard from '@/components/GameResultCard'
import GameStatsOverview from '@/components/GameStatsOverview'
import { supabase } from '@/lib/supabase'
import { getActiveWeek } from '@/services/weekService'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'
import type { Pick, AnonymousPick } from '@/types'
import type { Game } from '@/types'

type GamesView = 'all' | 'mine'
type StatusFilter = 'all' | 'live' | 'upcoming' | 'final'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  live: 'Live',
  upcoming: 'Upcoming',
  final: 'Final'
}

function matchesStatus(game: Game, filter: StatusFilter) {
  if (filter === 'live') return game.status === 'in_progress'
  if (filter === 'final') return game.status === 'completed'
  if (filter === 'upcoming') return game.status !== 'in_progress' && game.status !== 'completed'
  return true
}
const VIEW_STORAGE_KEY = 'gamesPage.view'

function readSavedView(): GamesView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'mine' ? 'mine' : 'all'
  } catch {
    return 'all'
  }
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
  const { activeSeason, loading: seasonLoading } = useCurrentSeason()

  const [currentSeason, setCurrentSeason] = useState(
    urlSeason ? parseInt(urlSeason) : activeSeason
  )
  // Without a season in the URL we must wait for app_settings before querying,
  // or we'd fetch (and bake into the URL) the fallback season instead of the
  // real active one.
  const [seasonReady, setSeasonReady] = useState(!!urlSeason)
  useEffect(() => {
    if (seasonReady || seasonLoading) return
    setCurrentSeason(activeSeason)
    setSeasonReady(true)
  }, [seasonReady, seasonLoading, activeSeason])
  const [currentWeek, setCurrentWeek] = useState<number | null>(
    urlWeek ? parseInt(urlWeek) : null
  )
  const [games, setGames] = useState<Game[]>([])
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  const [userPicks, setUserPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offline] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [view, setView] = useState<GamesView>(readSavedView)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  // Ticks so time-based labels ("Starts in 12m") stay current between data refreshes
  const [, setClockTick] = useState(0)

  const handleViewChange = (next: string) => {
    const v: GamesView = next === 'mine' ? 'mine' : 'all'
    setView(v)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v)
    } catch {
      // Storage blocked (private mode etc.) - the toggle still works for this visit
    }
  }

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
    // If no week in URL, get the active week first
    if (!seasonReady) return
    if (!urlWeek && currentWeek === null) {
      getActiveWeek(currentSeason).then(activeWeek => {
        console.log(`🎯 Setting active week to: ${activeWeek}`)
        setCurrentWeek(activeWeek)
      })
    }
  }, [seasonReady, currentSeason, urlWeek, currentWeek])

  useEffect(() => {
    // Only load data once we have a valid week
    if (!seasonReady) return
    if (currentWeek === null) {
      console.log('⏳ Waiting for week to be determined...')
      return
    }
    
    console.log(`📊 Loading data for Season ${currentSeason}, Week ${currentWeek}`)
    loadGames()
    loadWeekSettings()

    // Re-render periodically so time-based status (countdowns) stays current.
    // This must not touch `games`: a new games array makes GameStatsOverview
    // refetch, and it used to swap in a skeleton that shifted the whole page.
    const gameRefreshInterval = setInterval(() => {
      setClockTick(t => t + 1)
    }, 30000)

    // Silent background refresh of scores/stats (server-side automation is the
    // source of truth; this just keeps the on-screen data reasonably fresh)
    const dataRefreshInterval = setInterval(() => {
      silentUpdateGames()
    }, 60000)

    return () => {
      clearInterval(gameRefreshInterval)
      clearInterval(dataRefreshInterval)
    }
  }, [seasonReady, currentSeason, currentWeek])

  useEffect(() => {
    // Load the user's picks separately so they refresh once auth resolves.
    // (user is often null on the first render, before useAuth finishes.)
    if (currentWeek === null) return
    loadUserPicks()

    // Re-fetch picks alongside the games refresh. Picks are scored server-side
    // after a game goes final, so a page loaded during the game would otherwise
    // keep the unscored pick until a manual reload. The interval lives here (not
    // with the games interval) so it closes over the resolved user.
    const picksRefreshInterval = setInterval(() => {
      loadUserPicks(true)
    }, 60000)
    return () => clearInterval(picksRefreshInterval)
  }, [user?.id, currentSeason, currentWeek])

  useEffect(() => {
    // Update URL when season/week changes (only if week is determined)
    if (!seasonReady) return
    if (currentWeek !== null) {
      const newPath = `/games/${currentSeason}/${currentWeek}`
      navigate(newPath, { replace: true })
    }
  }, [seasonReady, currentSeason, currentWeek, navigate])

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
        .order('id', { ascending: true })

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
      setLastUpdated(new Date())
    } catch (err: any) {
      console.error('Error loading games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Silent update function that refreshes data without showing loading state
  const silentUpdateGames = async () => {
    try {
      const { data, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', currentSeason)
        .eq('week', currentWeek)
        .order('kickoff_time', { ascending: true })
        .order('id', { ascending: true })

      if (gamesError) {
        console.warn('Silent update failed:', gamesError.message)
        return
      }

      // Only update if we got data
      if (data) {
        console.log(`🔄 Silent update: refreshed ${data.length} games`)
        setGames(data)
        setLastUpdated(new Date())
      }
    } catch (err: any) {
      console.warn('Silent update error:', err.message)
      // Don't set error state for silent updates to avoid disrupting UI
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

  // silent: background refresh - keep the picks already on screen if it fails
  const loadUserPicks = async (silent = false) => {
    if (!user) {
      setUserPicks([])
      return
    }

    try {
      // Picks submitted anonymously and later assigned to this account live in
      // anonymous_picks, so read both (same as the profile page does).
      const [authRes, anonRes] = await Promise.all([
        supabase
          .from('picks')
          .select('*')
          .eq('user_id', user.id)
          .eq('season', currentSeason)
          .eq('week', currentWeek),
        supabase
          .from('anonymous_picks')
          .select('*')
          .eq('assigned_user_id', user.id)
          .eq('season', currentSeason)
          .eq('week', currentWeek)
          .eq('is_active_pick_set', true)
      ])

      if (authRes.error) throw authRes.error
      if (anonRes.error) console.warn('Could not load assigned anonymous picks:', anonRes.error.message)

      const authPicks: Pick[] = authRes.data || []
      const pickedGameIds = new Set(authPicks.map(p => p.game_id))
      const anonPicks = ((anonRes.data || []) as AnonymousPick[])
        .filter(p => !pickedGameIds.has(p.game_id)) as unknown as Pick[]
      const combined = [...authPicks, ...anonPicks]

      console.log(`📊 Loaded ${combined.length} user picks for Week ${currentWeek}, Season ${currentSeason}`)
      setUserPicks(combined)
    } catch (err: any) {
      if (silent) {
        console.warn('Silent picks refresh failed:', err.message)
        return
      }
      console.error('Error loading user picks:', err)
      setUserPicks([])
    }
  }

  const pickedGameIds = new Set(userPicks.map(p => p.game_id))
  const hasPicks = pickedGameIds.size > 0
  // Keep the saved preference even for weeks with no picks; just show everything then
  const showMineOnly = view === 'mine' && hasPicks
  // My Picks narrows first; the status chips count within whatever is in scope
  const scopedGames = games
    .map((game, index) => ({ game, gameNumber: index + 1 }))
    .filter(({ game }) => !showMineOnly || pickedGameIds.has(game.id))
  const statusCount = (f: StatusFilter) => scopedGames.filter(({ game }) => matchesStatus(game, f)).length
  const visibleGames = scopedGames.filter(({ game }) => matchesStatus(game, statusFilter))
  // Hide empty statuses (e.g. no Live games before kickoff), but never the one selected
  const statusTabs = (['all', 'live', 'upcoming', 'final'] as StatusFilter[])
    .filter(f => f === 'all' || f === statusFilter || statusCount(f) > 0)
    .map(f => ({ key: f, label: `${STATUS_LABELS[f]} (${statusCount(f)})` }))

  const handleWeekChange = (week: string) => {
    setCurrentWeek(parseInt(week))
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
            {lastUpdated && (
              <p className="text-sm text-charcoal-500 mt-2">
                Last updated: {lastUpdated.toLocaleString('en-US', {
                  weekday: 'short',
                  month: 'short', 
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit'
                })}
              </p>
            )}
          </div>
          
        </div>

        {/* Week and Season Selectors */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Season is locked to the current season (past seasons live under History) */}
          <span className="inline-flex items-center rounded-full bg-[#4B3621] text-white px-3.5 py-1.5 text-sm font-semibold self-center tabular-nums">
            {currentSeason} Season
          </span>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-charcoal-700">Week:</label>
            <Select value={currentWeek?.toString() || ""} onValueChange={handleWeekChange}>
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


      {/* Filters: All games / My picks (saved per browser), then game status */}
      {games.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {user && hasPicks && (
            <PillTabs
              className="self-start"
              tabs={[
                { key: 'all', label: `All Games (${games.length})` },
                { key: 'mine', label: `My Picks (${games.filter(g => pickedGameIds.has(g.id)).length})` }
              ]}
              value={showMineOnly ? 'mine' : 'all'}
              onChange={handleViewChange}
            />
          )}
          <div className="max-w-full overflow-x-auto">
            <PillTabs
              size="sm"
              className="w-max"
              tabs={statusTabs}
              value={statusFilter}
              onChange={(k) => setStatusFilter(k as StatusFilter)}
            />
          </div>
        </div>
      )}

      {/* Week Stats Overview */}
      <GameStatsOverview 
        season={currentSeason}
        week={currentWeek || 1}
        games={games}
        showPickStats={isPickDeadlinePassed}
        className="mb-6"
      />

      {/* Games Grid */}
      <div className="space-y-4">
        {currentWeek === null ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-pigskin-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-charcoal-700 mb-2">Loading Week Data</h3>
            <p className="text-charcoal-500 text-sm">
              Determining the current active week...
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
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
                No games are available for {currentSeason} Week {currentWeek || '?'}
              </p>
            </CardContent>
          </Card>
        ) : visibleGames.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-medium text-charcoal-700 mb-2">
                No {STATUS_LABELS[statusFilter].toLowerCase()} games{showMineOnly ? ' in your picks' : ''} right now
              </h3>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="mt-2 px-4 py-1.5 rounded-md text-sm font-semibold bg-[#4B3621] text-white"
              >
                Show all games
              </button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleGames.map(({ game, gameNumber }) => {
              const userPick = userPicks.find(pick => pick.game_id === game.id)
              return (
                <GameResultCard
                  key={game.id}
                  game={{
                    ...game,
                    quarter: game.game_period || game.api_period,
                    clock: game.game_clock || game.api_clock
                  }}
                  gameNumber={gameNumber}
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