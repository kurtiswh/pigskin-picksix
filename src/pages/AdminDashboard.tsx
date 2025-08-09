import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Game, WeekSettings } from '@/types'
import { getGamesWithSpreads, getGamesFast, getCurrentWeek, testApiConnection, CFBGame } from '@/services/collegeFootballApi'
import AdminGameSelector from '@/components/AdminGameSelector'
import WeekControls from '@/components/WeekControls'
import UserManagement from '@/components/UserManagement'
import ApiStatusWidget from '@/components/ApiStatusWidget'
import ScoreManager from '@/components/ScoreManager'
import HistoricalPicksImport from '@/components/HistoricalPicksImport'
import AdminNotifications from '@/components/AdminNotifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// CFBGame interface is now imported from the API service

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'games' | 'controls' | 'scores' | 'users' | 'picks-import' | 'notifications'>('games')
  const [cfbGames, setCfbGames] = useState<CFBGame[]>([])
  const [selectedGames, setSelectedGames] = useState<CFBGame[]>([])
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const currentSeason = new Date().getFullYear()
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek(currentSeason))
  const maxGames = 15

  useEffect(() => {
    if (user?.is_admin) {
      loadWeekData()
    }
  }, [user, currentWeek]) // Reload when week changes

  const loadWeekData = async () => {
    try {
      setLoading(true)
      setError('')

      // Load week settings
      const { data: settings, error: settingsError } = await supabase
        .from('week_settings')
        .select('*')
        .eq('week', currentWeek)
        .eq('season', currentSeason)
        .single()

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError
      }

      setWeekSettings(settings)

      // Load saved games for this week
      const { data: savedGames, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (gamesError) throw gamesError

      // Convert saved games to CFB format for the selector
      const cfbFormatGames: CFBGame[] = (savedGames || []).map(game => ({
        id: parseInt(game.id.slice(-8), 16), // Convert UUID to number for display
        week: game.week,
        season: game.season,
        season_type: 'regular',
        start_date: game.kickoff_time,
        completed: game.status === 'completed',
        home_team: game.home_team,
        away_team: game.away_team,
        spread: game.spread
      }))

      setSelectedGames(cfbFormatGames)

    } catch (err: any) {
      console.error('Error loading week data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchCFBGames = async () => {
    try {
      setLoading(true)
      setError('')
      
      console.log(`🏈 Fetching games for ${currentSeason} week ${currentWeek}`)
      
      // Test API connection first with shorter timeout
      console.log('🔍 Quick API connection test...')
      const apiTestPromise = testApiConnection()
      const timeoutPromise = new Promise<boolean>((resolve) => 
        setTimeout(() => resolve(false), 3000)
      )
      
      const apiAvailable = await Promise.race([apiTestPromise, timeoutPromise])
      
      if (!apiAvailable) {
        console.log('⚡ API unavailable or slow - using mock data immediately')
        setError(`CollegeFootballData API is not available or slow. Using sample data for demonstration. To use real data, get a free API key at https://collegefootballdata.com/ and set VITE_CFBD_API_KEY in your .env file.`)
        
        // Use mock data as fallback
        const mockGames = [
          {
            id: 401520281,
            week: currentWeek,
            season: currentSeason,
            season_type: 'regular',
            start_date: '2024-09-07T19:00:00.000Z',
            completed: false,
            home_team: 'Alabama',
            away_team: 'Georgia',
            home_conference: 'SEC',
            away_conference: 'SEC',
            venue: 'Bryant-Denny Stadium',
            spread: -3.5
          },
          {
            id: 401520282,
            week: currentWeek,
            season: currentSeason,
            season_type: 'regular',
            start_date: '2024-09-07T15:30:00.000Z',
            completed: false,
            home_team: 'Ohio State',
            away_team: 'Michigan',
            home_conference: 'Big Ten',
            away_conference: 'Big Ten',
            venue: 'Ohio Stadium',
            spread: -7
          },
          {
            id: 401520283,
            week: currentWeek,
            season: currentSeason,
            season_type: 'regular',
            start_date: '2024-09-07T20:00:00.000Z',
            completed: false,
            home_team: 'Texas',
            away_team: 'Oklahoma',
            home_conference: 'SEC',
            away_conference: 'SEC',
            venue: 'Darrell K Royal Stadium',
            spread: -10.5
          },
          {
            id: 401520284,
            week: currentWeek,
            season: currentSeason,
            season_type: 'regular',
            start_date: '2024-09-07T17:00:00.000Z',
            completed: false,
            home_team: 'USC',
            away_team: 'Oregon',
            home_conference: 'Big Ten',
            away_conference: 'Big Ten',
            venue: 'Los Angeles Memorial Coliseum',
            spread: 2.5
          },
          {
            id: 401520285,
            week: currentWeek,
            season: currentSeason,
            season_type: 'regular',
            start_date: '2024-09-07T16:00:00.000Z',
            completed: false,
            home_team: 'Notre Dame',
            away_team: 'Navy',
            home_conference: 'Independent',
            away_conference: 'American Athletic',
            venue: 'Notre Dame Stadium',
            spread: -14
          }
        ]
        
        setCfbGames(mockGames)
        setLoading(false)
        return
      }
      
      // Try fast loading first (games only), then add spreads if time permits  
      console.log('⚡ Starting fast game loading...')
      
      try {
        // First load games quickly (no spreads)
        const gamesOnly = await getGamesFast(currentSeason, currentWeek, 'regular', false)
        
        if (gamesOnly.length > 0) {
          console.log(`✅ Loaded ${gamesOnly.length} games quickly - showing immediately`)
          setCfbGames(gamesOnly)
          setError('')
          
          // Now try to add spreads in background (don't block UI)
          console.log('💰 Adding spreads in background...')
          getGamesFast(currentSeason, currentWeek, 'regular', true)
            .then(gamesWithSpreads => {
              if (gamesWithSpreads.length > 0) {
                console.log('✅ Updated games with spreads')
                setCfbGames(gamesWithSpreads)
              }
            })
            .catch(err => {
              console.log('⚠️ Could not add spreads:', err.message)
              // Keep the games we already have
            })
          
          setLoading(false)
          return
        }
      } catch (fastError) {
        console.log('⚠️ Fast loading failed, trying full fetch:', fastError.message)
      }
      
      // Fallback: try the full fetch with spreads (has built-in timeout)
      const games = await getGamesWithSpreads(currentSeason, currentWeek, 'regular')
      
      if (games.length === 0) {
        setError(`No games found for ${currentSeason} week ${currentWeek}. This might be during the off-season or the data isn't available yet.`)
        setCfbGames([])
        setLoading(false)
        return
      }
      
      // Filter to only FBS games if we have real data, otherwise show all
      let fbsGames = games
      
      if (games.length > 0 && games[0].home_conference) {
        // Real data - filter to FBS games
        fbsGames = games.filter(game => 
          game.home_conference && 
          game.away_conference &&
          !game.completed // Only show upcoming games
        )
        console.log(`✅ Loaded ${fbsGames.length} FBS games (${games.length} total)`)
      } else {
        // Mock data - use as-is
        console.log(`✅ Using ${games.length} mock games`)
      }
      
      setCfbGames(fbsGames)
      setError('')

    } catch (err: any) {
      console.error('❌ Error fetching CFB games:', err)
      setError(`Failed to load games: ${err.message}`)
      // Ensure we show some games even if there's an error
      setCfbGames([
        {
          id: 1,
          week: currentWeek,
          season: currentSeason,
          season_type: 'regular' as const,
          start_date: new Date().toISOString(),
          completed: false,
          home_team: 'Sample Home Team',
          away_team: 'Sample Away Team',
          home_conference: 'Sample Conference',
          away_conference: 'Sample Conference',
          venue: 'Sample Stadium',
          spread: -3.5
        }
      ])
    } finally {
      console.log('🏁 fetchCFBGames completed, setting loading to false')
      setLoading(false)
    }
  }

  const handleGameToggle = (game: CFBGame) => {
    setSelectedGames(prev => {
      const isSelected = prev.some(g => g.id === game.id)
      if (isSelected) {
        return prev.filter(g => g.id !== game.id)
      } else if (prev.length < maxGames) {
        return [...prev, game]
      }
      return prev
    })
  }


  const handleSaveGames = async () => {
    try {
      setLoading(true)
      setError('')

      // Create week settings if doesn't exist
      if (!weekSettings) {
        const { data: newSettings, error: settingsError } = await supabase
          .from('week_settings')
          .insert({
            week: currentWeek,
            season: currentSeason,
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default: 1 week from now
            games_selected: false,
            picks_open: false,
            games_locked: false
          })
          .select()
          .single()

        if (settingsError) throw settingsError
        setWeekSettings(newSettings)
      }

      // Save games to database
      const gamesToInsert = selectedGames.map(game => ({
        week: currentWeek,
        season: currentSeason,
        home_team: game.home_team,
        away_team: game.away_team,
        spread: game.spread || 0,
        kickoff_time: game.start_date,
        status: 'scheduled' as const
      }))

      const { error: insertError } = await supabase
        .from('games')
        .insert(gamesToInsert)

      if (insertError) throw insertError

      // Update week settings
      const { error: updateError } = await supabase
        .from('week_settings')
        .update({ games_selected: true })
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (updateError) throw updateError

      // Reload data
      await loadWeekData()

      alert('Games saved successfully! 🏈')

    } catch (err: any) {
      console.error('Error saving games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSpreadUpdate = (gameId: number, spread: number) => {
    setSelectedGames(prev => 
      prev.map(game => 
        game.id === gameId ? { ...game, spread } : game
      )
    )
  }

  const handleLockTimeUpdate = (gameId: number, lockTime: string) => {
    setSelectedGames(prev => 
      prev.map(game => 
        game.id === gameId ? { ...game, custom_lock_time: lockTime || undefined } : game
      )
    )
  }

  const handleUnsaveGames = async () => {
    try {
      setLoading(true)
      setError('')

      // Check if deadline has passed
      if (weekSettings?.deadline && new Date() > new Date(weekSettings.deadline)) {
        throw new Error('Cannot unsave games after deadline has passed')
      }

      // Delete all games for this week
      const { error: deleteError } = await supabase
        .from('games')
        .delete()
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (deleteError) throw deleteError

      // Update week settings
      const { error: updateError } = await supabase
        .from('week_settings')
        .update({ 
          games_selected: false,
          picks_open: false,
          games_locked: false
        })
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (updateError) throw updateError

      // Reload data
      await loadWeekData()

      alert('Games unsaved successfully! You can now make changes to your selection.')

    } catch (err: any) {
      console.error('Error unsaving games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateSettings = async (updates: Partial<WeekSettings>) => {
    try {
      setLoading(true)
      setError('')

      const { error } = await supabase
        .from('week_settings')
        .update(updates)
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (error) throw error

      setWeekSettings(prev => prev ? { ...prev, ...updates } : null)

    } catch (err: any) {
      console.error('Error updating settings:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  console.log('🏛️ AdminDashboard - User state:', user)
  console.log('🏛️ AdminDashboard - User is admin:', user?.is_admin)

  if (!user) {
    console.log('❌ AdminDashboard - No user, redirecting to login')
    return <Navigate to="/login" replace />
  }

  if (!user.is_admin) {
    console.log('❌ AdminDashboard - User not admin, redirecting to home')
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <div className="text-4xl mb-4">🚫</div>
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-charcoal-600 mb-4">
              You need admin privileges to access this page.
            </p>
            <Link to="/">
              <Button>Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
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
                <h1 className="text-xl font-bold">Admin Dashboard</h1>
                <p className="text-pigskin-100 text-sm">Week {currentWeek} • {currentSeason}</p>
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-pigskin-100">Admin: {user.display_name}</span>
              <Button 
                variant="outline" 
                size="sm"
                className="border-white text-white hover:bg-white hover:text-pigskin-500"
                onClick={signOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-white p-1 rounded-lg shadow-sm">
          <button
            onClick={() => setActiveTab('games')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'games'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Game Selection
          </button>
          <button
            onClick={() => setActiveTab('controls')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'controls'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Week Controls
          </button>
          <button
            onClick={() => setActiveTab('scores')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'scores'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Score Updates
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'users'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('picks-import')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'picks-import'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            Import Picks
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'notifications'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            📧 Notifications
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-700">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab Content */}
        {activeTab === 'games' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-pigskin-900">Game Selection</h2>
              {cfbGames.length === 0 && (
                <Button onClick={fetchCFBGames} disabled={loading}>
                  {loading ? 'Loading...' : 'Load Available Games'}
                </Button>
              )}
            </div>
            
            {/* API Status Widget */}
            <ApiStatusWidget 
              season={currentSeason}
              onWeekChange={(week) => {
                setCurrentWeek(week)
                // Clear games when week changes to force reload
                setCfbGames([])
              }}
            />
            
            {cfbGames.length > 0 ? (
              <AdminGameSelector
                games={cfbGames}
                selectedGames={selectedGames}
                onGameToggle={handleGameToggle}
                loading={loading}
                maxGames={maxGames}
              />
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="text-4xl mb-4">🏈</div>
                  <h3 className="text-lg font-semibold mb-2">Load Games</h3>
                  <p className="text-charcoal-600 mb-4">
                    Click "Load Available Games" to fetch this week's college football games.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'controls' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">Week Controls</h2>
            <WeekControls
              weekSettings={weekSettings}
              onUpdateSettings={handleUpdateSettings}
              onSaveGames={handleSaveGames}
              onUnsaveGames={handleUnsaveGames}
              onSpreadUpdate={handleSpreadUpdate}
              onLockTimeUpdate={handleLockTimeUpdate}
              selectedGames={selectedGames}
              maxGames={maxGames}
              loading={loading}
              currentWeek={currentWeek}
              currentSeason={currentSeason}
            />
          </div>
        )}

        {activeTab === 'scores' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">Score Updates</h2>
            <ScoreManager 
              season={currentSeason}
              week={currentWeek}
            />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">User Management</h2>
            <UserManagement />
          </div>
        )}

        {activeTab === 'picks-import' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">Import Historical Picks</h2>
            <HistoricalPicksImport />
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">Email Notifications</h2>
            <AdminNotifications 
              currentWeek={currentWeek}
              currentSeason={currentSeason}
            />
          </div>
        )}
      </main>
    </div>
  )
}