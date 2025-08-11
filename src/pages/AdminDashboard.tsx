import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getWeekDataDirect, saveGamesDirect, unsaveGamesDirect } from '@/lib/supabase-direct'
import { Game, WeekSettings } from '@/types'
import { getGamesWithSpreads, getGamesFast, getCurrentWeek, testApiConnection, CFBGame } from '@/services/collegeFootballApi'
import { ENV } from '@/lib/env'
import AdminGameSelector from '@/components/AdminGameSelector'
import WeekControls from '@/components/WeekControls'
import UserManagement from '@/components/UserManagement'
import ApiStatusWidget from '@/components/ApiStatusWidget'
import ScoreManager from '@/components/ScoreManager'
import HistoricalPicksImport from '@/components/HistoricalPicksImport'
import AdminNotifications from '@/components/AdminNotifications'
import EnvironmentDebugger from '@/components/EnvironmentDebugger'
import NetworkDiagnostic from '@/components/NetworkDiagnostic'
import SimpleConnectionTest from '@/components/SimpleConnectionTest'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// CFBGame interface is now imported from the API service

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'games' | 'controls' | 'scores' | 'users' | 'picks-import' | 'notifications' | 'debug'>('games')
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

      console.log('📊 Loading week data with timeout...')

      // Add timeout to prevent hanging (reduced since network tests show API works)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Week data loading timed out')), 10000)
      )

      try {
        // Try standard Supabase client first
        console.log('🔄 Trying standard Supabase client...')
        
        // Load week settings with timeout
        const settingsQuery = supabase
          .from('week_settings')
          .select('*')
          .eq('week', currentWeek)
          .eq('season', currentSeason)
          .single()

        const settingsResult = await Promise.race([settingsQuery, timeoutPromise])
        
        if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
          throw settingsResult.error
        }

        setWeekSettings(settingsResult.data)

        // Load saved games for this week with timeout
        const gamesQuery = supabase
          .from('games')
          .select('*')
          .eq('week', currentWeek)
          .eq('season', currentSeason)

        const gamesResult = await Promise.race([gamesQuery, timeoutPromise])
        if (gamesResult.error) throw gamesResult.error

        // Convert saved games to CFB format for the selector
        const cfbFormatGames: CFBGame[] = (gamesResult.data || []).map(game => ({
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
        console.log('✅ Week data loaded successfully via standard client')

      } catch (timeoutError) {
        console.log('⏰ Standard client timed out, trying direct API...')
        
        try {
          // Fallback to direct API calls
          const directData = await getWeekDataDirect(currentWeek, currentSeason)
          
          setWeekSettings(directData.weekSettings)
          
          // Convert games to CFB format
          const cfbFormatGames: CFBGame[] = (directData.games || []).map(game => ({
            id: parseInt(game.id.slice(-8), 16),
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
          console.log('✅ Week data loaded successfully via direct API')
          setError('Standard client slow - using direct API (this is normal)')
          
        } catch (directError) {
          console.log('❌ Both standard client and direct API failed')
          setWeekSettings(null)
          setSelectedGames([])
          setError('Both standard client and direct API failed. Check network connection.')
        }
      }

    } catch (err: any) {
      console.error('Error loading week data:', err)
      setError(err.message)
      // Set empty states
      setWeekSettings(null)
      setSelectedGames([])
    } finally {
      console.log('📊 Week data loading completed')
      setLoading(false)
    }
  }

  const fetchCFBGames = async () => {
    try {
      setLoading(true)
      setError('')
      
      console.log(`🏈 Fetching games for ${currentSeason} week ${currentWeek}`)
      console.log('🔧 Environment check:', {
        hasCfbKey: !!ENV.CFBD_API_KEY,
        cfbKeyPreview: ENV.CFBD_API_KEY ? ENV.CFBD_API_KEY.slice(0, 10) + '...' : 'MISSING'
      })
      
      // Try real API first, then show mock games as fallback after delay
      console.log('🔄 Attempting to load real games first...')
      
      // First attempt real API call
      if (ENV.CFBD_API_KEY) {
        try {
          console.log('🎯 Loading real games from CFBD API...')
          const realGames = await getGamesWithSpreads(currentSeason, currentWeek, 'regular')
          
          if (realGames && realGames.length > 0) {
            console.log(`✅ Successfully loaded ${realGames.length} real games`)
            setCfbGames(realGames)
            setLoading(false)
            return
          } else {
            console.log('⚠️ Real API returned no games, will show mock games after delay...')
          }
        } catch (apiError) {
          console.log('⚠️ Real API failed, will show mock games after delay:', apiError.message)
        }
      } else {
        console.log('⚠️ No CFBD API key found, will show mock games after delay...')
      }
      
      // Wait 3 seconds before showing mock games to give real API preference
      console.log('⏱️ Waiting 3 seconds before showing sample games...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      console.log('⚡ Now showing sample games for testing...')
      
      // Use mock data as delayed fallback
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
        
        // Set mock games after delay
        setCfbGames(mockGames)
        setLoading(false)
        
        console.log(`✅ Loaded ${mockGames.length} sample games for admin testing`)
        setError('Using sample games for demonstration. The real API either failed or returned no games.')
        
        return

    } catch (err: any) {
      console.error('❌ Error in fetchCFBGames:', err)
      
      // Always ensure we show games even if there's an error
      const fallbackGames = [
        {
          id: 401520281,
          week: currentWeek,
          season: currentSeason,
          season_type: 'regular' as const,
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
          season_type: 'regular' as const,
          start_date: '2024-09-07T15:30:00.000Z',
          completed: false,
          home_team: 'Ohio State',
          away_team: 'Michigan',
          home_conference: 'Big Ten',
          away_conference: 'Big Ten',
          venue: 'Ohio Stadium',
          spread: -7
        }
      ]
      
      setCfbGames(fallbackGames)
      setError(`Error loading games: ${err.message}. Using sample data for testing.`)
    } finally {
      console.log('🏁 fetchCFBGames completed')
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

      console.log('💾 Starting to save games with timeout protection...')

      // Add timeout to prevent infinite hanging (reduced since network tests show API works)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Save operation timed out')), 10000)
      )

      try {
        // Create week settings if doesn't exist
        if (!weekSettings) {
          console.log('📝 Creating new week settings...')
          const settingsQuery = supabase
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

          const settingsResult = await Promise.race([settingsQuery, timeoutPromise])
          if (settingsResult.error) throw settingsResult.error
          setWeekSettings(settingsResult.data)
          console.log('✅ Week settings created')
        }

        // Save games to database
        console.log(`🏈 Inserting ${selectedGames.length} games...`)
        const gamesToInsert = selectedGames.map(game => ({
          week: currentWeek,
          season: currentSeason,
          home_team: game.home_team,
          away_team: game.away_team,
          spread: game.spread || 0,
          kickoff_time: game.start_date,
          status: 'scheduled' as const
        }))

        const insertQuery = supabase
          .from('games')
          .insert(gamesToInsert)

        const insertResult = await Promise.race([insertQuery, timeoutPromise])
        if (insertResult.error) throw insertResult.error
        console.log('✅ Games inserted successfully via standard client')

        // Update week settings
        console.log('📊 Updating week settings...')
        const updateQuery = supabase
          .from('week_settings')
          .update({ games_selected: true })
          .eq('week', currentWeek)
          .eq('season', currentSeason)

        const updateResult = await Promise.race([updateQuery, timeoutPromise])
        if (updateResult.error) throw updateResult.error
        console.log('✅ Week settings updated')

        // Reload data with timeout
        console.log('🔄 Reloading week data...')
        const reloadPromise = loadWeekData()
        await Promise.race([reloadPromise, timeoutPromise])

        alert('Games saved successfully! 🏈')
        console.log('🎉 Save operation completed successfully')

      } catch (timeoutError) {
        console.log('⏰ Standard client save timed out, trying direct API...')
        
        try {
          // Fallback to direct API for saving
          await saveGamesDirect(gamesToInsert, currentWeek, currentSeason)
          
          // Still need to update week settings
          const updateQuery = supabase
            .from('week_settings')
            .update({ games_selected: true })
            .eq('week', currentWeek)
            .eq('season', currentSeason)

          await Promise.race([updateQuery, timeoutPromise])
          
          console.log('✅ Games saved successfully via direct API')
          alert('Games saved successfully! (via direct API) 🏈')
          
          // Reload data
          await loadWeekData()
          
        } catch (directError) {
          console.log('❌ Both standard client and direct API save failed')
          setError('Save failed with both methods. Check network and database connection.')
          
          // Try to reload data to see current state
          try {
            await loadWeekData()
          } catch (reloadError) {
            console.log('⚠️ Failed to reload after timeout')
          }
        }
      }

    } catch (err: any) {
      console.error('Error saving games:', err)
      setError(`Save failed: ${err.message}. Check if database indexes are applied.`)
    } finally {
      console.log('🏁 Save games operation finished')
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

      console.log('🗑️ Starting to unsave games with timeout protection...')

      // Add timeout to prevent infinite hanging (reduced since network tests show API works)  
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Unsave operation timed out')), 10000)
      )

      try {
        // Check if deadline has passed
        if (weekSettings?.deadline && new Date() > new Date(weekSettings.deadline)) {
          throw new Error('Cannot unsave games after deadline has passed')
        }

        // Delete all games for this week
        console.log('🗑️ Deleting games from database...')
        const deleteQuery = supabase
          .from('games')
          .delete()
          .eq('week', currentWeek)
          .eq('season', currentSeason)

        const deleteResult = await Promise.race([deleteQuery, timeoutPromise])
        if (deleteResult.error) throw deleteResult.error
        console.log('✅ Games deleted successfully')

        // Update week settings
        console.log('📊 Updating week settings...')
        const updateQuery = supabase
          .from('week_settings')
          .update({ 
            games_selected: false,
            picks_open: false,
            games_locked: false
          })
          .eq('week', currentWeek)
          .eq('season', currentSeason)

        const updateResult = await Promise.race([updateQuery, timeoutPromise])
        if (updateResult.error) throw updateResult.error
        console.log('✅ Week settings updated')

        // Update local week settings state (don't reload data as it would clear selected games)
        setWeekSettings(prev => prev ? { 
          ...prev, 
          games_selected: false,
          picks_open: false,
          games_locked: false
        } : null)

        alert('Games unsaved successfully! You can now make changes to your selection.')
        console.log('🎉 Unsave operation completed successfully - selected games preserved')

      } catch (timeoutError) {
        console.log('⏰ Standard client unsave timed out, trying direct API...')
        
        try {
          // Fallback to direct API for unsaving
          await unsaveGamesDirect(currentWeek, currentSeason)
          
          // Still need to update week settings
          const updateQuery = supabase
            .from('week_settings')
            .update({ 
              games_selected: false,
              picks_open: false,
              games_locked: false
            })
            .eq('week', currentWeek)
            .eq('season', currentSeason)

          await Promise.race([updateQuery, timeoutPromise])
          
          console.log('✅ Games unsaved successfully via direct API')
          alert('Games unsaved successfully! (via direct API) You can now make changes to your selection.')
          
          // Update local week settings state (don't reload data as it would clear selected games)
          setWeekSettings(prev => prev ? { 
            ...prev, 
            games_selected: false,
            picks_open: false,
            games_locked: false
          } : null)
          
        } catch (directError) {
          console.log('❌ Both standard client and direct API unsave failed')
          setError('Unsave failed with both methods. Check network and database connection.')
          
          // Try to reload data to see current state
          try {
            await loadWeekData()
          } catch (reloadError) {
            console.log('⚠️ Failed to reload after timeout')
          }
        }
      }

    } catch (err: any) {
      console.error('Error unsaving games:', err)
      setError(`Unsave failed: ${err.message}. Check if database indexes are applied.`)
    } finally {
      console.log('🏁 Unsave games operation finished')
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
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'debug'
                ? 'bg-pigskin-500 text-white'
                : 'text-charcoal-600 hover:text-pigskin-700'
            }`}
          >
            🔧 Debug
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

        {activeTab === 'debug' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-pigskin-900">Environment & API Diagnostics</h2>
            <div className="grid gap-6">
              <SimpleConnectionTest />
              <NetworkDiagnostic />
              <EnvironmentDebugger />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}