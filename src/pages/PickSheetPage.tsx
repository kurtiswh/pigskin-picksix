import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getActiveWeek } from '@/services/weekService'
import { getWeekDataDirect } from '@/lib/supabase-direct'
import { ENV } from '@/lib/env'
import { Game, Pick, WeekSettings } from '@/types'
import GameCard from '@/components/GameCard'
import PickSummary from '@/components/PickSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Layout from '@/components/Layout'
import { NotificationScheduler } from '@/services/notificationScheduler'

export default function PickSheetPage() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<{ gameId: string; team: string } | null>(null)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isUpdatingPick, setIsUpdatingPick] = useState(false)
  const [isTogglingLock, setIsTogglingLock] = useState(false)
  
  const currentSeason = new Date().getFullYear()
  const [currentWeek, setCurrentWeek] = useState(1)

  // Check if user has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return picks.length > 0 && !picks.some(p => p.submitted)
  }, [picks])

  useEffect(() => {
    // Get the active week when component mounts
    getActiveWeek(currentSeason).then(activeWeek => {
      setCurrentWeek(activeWeek)
    })
  }, [currentSeason])

  useEffect(() => {
    if (user && currentWeek > 0) {
      // Clear stale data when week changes to prevent caching issues
      setPicks([])
      setGames([])
      setWeekSettings(null)
      setError('')
      fetchPickSheetData()
    }
  }, [user, currentWeek])

  // Warning for page navigation/refresh with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = 'You have unsaved picks that will be lost. Are you sure you want to leave?'
        return 'You have unsaved picks that will be lost. Are you sure you want to leave?'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  // Handle navigation with unsaved changes warning
  const handleNavigation = useCallback((path: string) => {
    if (hasUnsavedChanges()) {
      setPendingNavigation(path)
      setShowNavWarning(true)
    } else {
      navigate(path)
    }
  }, [hasUnsavedChanges, navigate])

  const confirmNavigation = () => {
    if (pendingNavigation) {
      navigate(pendingNavigation)
    }
    setShowNavWarning(false)
    setPendingNavigation(null)
  }

  const cancelNavigation = () => {
    setShowNavWarning(false)
    setPendingNavigation(null)
  }

  const fetchPickSheetData = async () => {
    try {
      setLoading(true)
      setError('')
      
      console.log('🏈 Loading pick sheet data with direct API...')

      try {
        // Use direct API to get week data (settings + games)
        const weekData = await getWeekDataDirect(currentWeek, currentSeason)
        
        console.log('📊 Direct API loaded week settings:', weekData.weekSettings)
        console.log('📊 Direct API loaded games:', weekData.games?.length || 0)
        
        // Set week settings
        if (weekData.weekSettings) {
          setWeekSettings(weekData.weekSettings)
        } else {
          // Create mock settings if none exist
          setWeekSettings({
            id: 'mock-week',
            week: currentWeek,
            season: currentSeason,
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            picks_open: false, // Default to closed if no settings
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }

        // Convert and set games
        if (weekData.games && weekData.games.length > 0) {
          const convertedGames: Game[] = weekData.games.map(game => ({
            id: game.id,
            week: game.week,
            season: game.season,
            away_team: game.away_team,
            home_team: game.home_team,
            kickoff_time: game.kickoff_time,
            spread: game.spread,
            custom_lock_time: game.custom_lock_time,
            status: game.status || 'scheduled',
            home_ranking: game.home_team_ranking,
            away_ranking: game.away_team_ranking,
            neutral_site: game.neutral_site || false,
            venue: game.venue,
            created_at: game.created_at || new Date().toISOString(),
            updated_at: game.updated_at || new Date().toISOString()
          }))
          setGames(convertedGames)
          console.log('✅ Converted and set games:', convertedGames.length)
        } else {
          setGames([])
          console.log('⚠️ No games found for this week')
        }

        // Fetch user's existing picks using direct API
        try {
          console.log('📋 Loading user picks via direct API...')
          const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
          const apiKey = ENV.SUPABASE_ANON_KEY

          const picksResponse = await fetch(`${supabaseUrl}/rest/v1/picks?user_id=eq.${user!.id}&week=eq.${currentWeek}&season=eq.${currentSeason}`, {
            method: 'GET',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${apiKey || ''}`,
              'Content-Type': 'application/json'
            }
          })

          if (picksResponse.ok) {
            const picksData = await picksResponse.json()
            setPicks(picksData || [])
            console.log('✅ Loaded user picks via direct API:', picksData?.length || 0)
          } else {
            console.warn('⚠️ Failed to load picks via direct API:', picksResponse.status)
            setPicks([])
          }
        } catch (picksError) {
          console.warn('⚠️ Exception loading picks via direct API:', picksError)
          setPicks([])
        }

      } catch (error) {
        console.error('❌ Direct API failed:', error)
        setError('Failed to load pick sheet data. Please try again.')
      }

    } catch (err: any) {
      console.error('Error in fetchPickSheetData:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePickTeam = async (gameId: string, team: string) => {
    if (!user || isUpdatingPick) {
      console.log('🚫 Blocking pick update - user:', !!user, 'isUpdating:', isUpdatingPick)
      return
    }
    
    // Check if picks have been submitted and require confirmation
    const arePicksSubmitted = picks.some(p => p.submitted)
    if (arePicksSubmitted) {
      setPendingEdit({ gameId, team })
      setShowEditDialog(true)
      return
    }
    
    setIsUpdatingPick(true)
    try {
      await performPickUpdate(gameId, team)
    } finally {
      setIsUpdatingPick(false)
    }
  }

  const performPickUpdate = async (gameId: string, team: string) => {
    console.log('🏈 Updating pick via direct API...', { gameId, team })
    console.log('🔍 Function start - user:', user?.id, 'picks count:', picks.length)
    
    try {
      console.log('🔧 Step 1: Getting environment variables...')
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      console.log('🔧 Environment check - URL:', !!supabaseUrl, 'API Key:', !!apiKey)
      
      // Get the current session token for authenticated requests
      console.log('🔧 Step 2: Getting auth session...')
      let authToken = apiKey
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
        authToken = session?.access_token || apiKey
        console.log('🔧 Session check - hasSession:', !!session, 'hasAccessToken:', !!session?.access_token)
      } catch (sessionError) {
        console.warn('⚠️ Session retrieval failed, using API key:', sessionError)
        authToken = apiKey
      }
      
      console.log('🔐 Auth token info:', {
        usingJWT: authToken !== apiKey,
        tokenType: authToken !== apiKey ? 'JWT' : 'API_KEY',
        userId: user?.id,
        hasToken: !!authToken
      })
      
      console.log('🔧 Step 3: Finding existing pick...')
      const existingPick = picks.find(p => p.game_id === gameId)
      console.log('🔍 Existing pick found:', !!existingPick, existingPick?.id)
      
      if (existingPick) {
        // Update existing pick and reset submitted status
        console.log('📝 Updating existing pick via direct API...')
        console.log('🔧 Step 4a: Making PATCH request to update existing pick...')
        
        const response = await fetch(`${supabaseUrl}/rest/v1/picks?id=eq.${existingPick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            selected_team: team,
            submitted: false,
            submitted_at: null
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('❌ Failed to update pick:', response.status, errorText)
          throw new Error(`Failed to update pick: ${response.status} - ${errorText}`)
        }

        const data = await response.json()
        console.log('✅ Pick updated successfully via direct API:', data)
        
        if (data && data.length > 0) {
          setPicks(prev => prev.map(p => p.id === existingPick.id ? data[0] : p))
        } else {
          console.warn('⚠️ Update response empty or invalid:', data)
        }
      } else {
        // Create new pick
        console.log('➕ Creating new pick via direct API...')
        console.log('🔧 Step 4b: Making POST request to create new pick...')
        console.log('🔍 User ID for pick creation:', user!.id)
        console.log('🔍 User object:', user)
        
        const response = await fetch(`${supabaseUrl}/rest/v1/picks`, {
          method: 'POST',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            user_id: user!.id,
            game_id: gameId,
            week: currentWeek,
            season: currentSeason,
            selected_team: team,
            is_lock: false,
            submitted: false
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('❌ Failed to create pick:', response.status, errorText)
          throw new Error(`Failed to create pick: ${response.status} - ${errorText}`)
        }

        const data = await response.json()
        console.log('✅ Pick created successfully via direct API:', data)
        
        if (data && data.length > 0) {
          setPicks(prev => [...prev, data[0]])
          console.log('✅ Added new pick to state:', data[0])
        } else {
          console.warn('⚠️ Create response empty or invalid:', data)
        }
      }
    } catch (err: any) {
      console.error('❌ Error updating pick via direct API:', err)
      setError(err.message)
    }
  }

  const handleConfirmEdit = async () => {
    if (pendingEdit) {
      if (pendingEdit.team === '') {
        // Empty team means removal
        await performPickRemoval(pendingEdit.gameId)
      } else if (pendingEdit.team === 'TOGGLE_LOCK') {
        // Special case for lock toggle
        await performLockToggle(pendingEdit.gameId)
      } else {
        // Regular pick update
        await performPickUpdate(pendingEdit.gameId, pendingEdit.team)
      }
      
      // Reset all picks' submitted status when editing using direct API
      console.log('📝 Resetting all picks submitted status via direct API...')
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Get the current session token for authenticated requests
      let authToken = apiKey
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
        authToken = session?.access_token || apiKey
      } catch (sessionError) {
        console.warn('⚠️ Edit session failed, using API key:', sessionError)
        authToken = apiKey
      }
      
      await fetch(`${supabaseUrl}/rest/v1/picks?user_id=eq.${user!.id}&week=eq.${currentWeek}&season=eq.${currentSeason}`, {
        method: 'PATCH',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ submitted: false, submitted_at: null })
      })
      
      // Refresh picks data
      await fetchPickSheetData()
      
      // Show success message reminding to resubmit
      const changeType = pendingEdit.team === '' ? 'removed' : 
                        pendingEdit.team === 'TOGGLE_LOCK' ? 'lock changed' : 'updated'
      alert(`✅ Pick ${changeType}! \n\n⚠️ IMPORTANT: Your picks are now marked as NOT SUBMITTED.\n\nYou must click "Submit Picks" again for them to count!`)
    }
    setShowEditDialog(false)
    setPendingEdit(null)
  }

  const handleToggleLock = async (gameId: string) => {
    if (!user || isTogglingLock) {
      console.log('🚫 Blocking lock toggle - user:', !!user, 'isToggling:', isTogglingLock)
      return
    }
    
    // Check if picks have been submitted and require confirmation
    const arePicksSubmitted = picks.some(p => p.submitted)
    if (arePicksSubmitted) {
      setPendingEdit({ gameId, team: 'TOGGLE_LOCK' }) // Special value to indicate lock toggle
      setShowEditDialog(true)
      return
    }
    
    setIsTogglingLock(true)
    try {
      await performLockToggle(gameId)
    } finally {
      setIsTogglingLock(false)
    }
  }

  const performLockToggle = async (gameId: string) => {
    try {
      console.log('🔒 Toggling lock via direct API...', { gameId })
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Get the current session token for authenticated requests
      let authToken = apiKey
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
        authToken = session?.access_token || apiKey
        console.log('🔐 Lock toggle - session check:', !!session, !!session?.access_token)
      } catch (sessionError) {
        console.warn('⚠️ Lock toggle session failed, using API key:', sessionError)
        authToken = apiKey
      }
      
      const pickToLock = picks.find(p => p.game_id === gameId)
      if (!pickToLock) return

      const currentLockPick = picks.find(p => p.is_lock)
      
      // Remove lock from current lock pick if different
      if (currentLockPick && currentLockPick.id !== pickToLock.id) {
        console.log('🔓 Removing lock from previous pick via direct API...')
        
        const unlockResponse = await fetch(`${supabaseUrl}/rest/v1/picks?id=eq.${currentLockPick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_lock: false })
        })

        if (!unlockResponse.ok) {
          const errorText = await unlockResponse.text()
          throw new Error(`Failed to unlock previous pick: ${unlockResponse.status} - ${errorText}`)
        }
      }

      // Toggle lock on selected pick
      const newLockState = !pickToLock.is_lock
      console.log('🔒 Setting lock state via direct API:', newLockState)
      
      const lockResponse = await fetch(`${supabaseUrl}/rest/v1/picks?id=eq.${pickToLock.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ is_lock: newLockState })
      })

      if (!lockResponse.ok) {
        const errorText = await lockResponse.text()
        throw new Error(`Failed to toggle lock: ${lockResponse.status} - ${errorText}`)
      }

      const data = await lockResponse.json()
      console.log('✅ Lock toggled successfully via direct API')
      
      setPicks(prev => prev.map(p => {
        if (p.id === pickToLock.id) return data[0]
        if (p.is_lock && p.id !== pickToLock.id) return { ...p, is_lock: false }
        return p
      }))
    } catch (err: any) {
      console.error('❌ Error toggling lock via direct API:', err)
      setError(err.message)
    }
  }

  const handleRemovePick = async (gameId: string) => {
    if (!user) return
    
    // Check if picks have been submitted and require confirmation
    const arePicksSubmitted = picks.some(p => p.submitted)
    if (arePicksSubmitted) {
      setPendingEdit({ gameId, team: '' }) // Empty team indicates removal
      setShowEditDialog(true)
      return
    }
    
    await performPickRemoval(gameId)
  }

  const performPickRemoval = async (gameId: string) => {
    try {
      console.log('🗑️ Removing pick via direct API...', { gameId })
      
      const pickToRemove = picks.find(p => p.game_id === gameId)
      if (!pickToRemove) {
        console.log('⚠️ No pick found to remove for game:', gameId)
        return
      }

      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Get auth token with timeout
      let authToken = apiKey
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
        authToken = session?.access_token || apiKey
      } catch (sessionError) {
        console.warn('⚠️ Remove session failed, using API key:', sessionError)
        authToken = apiKey
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/picks?id=eq.${pickToRemove.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to remove pick: ${response.status} - ${errorText}`)
      }
      
      console.log('✅ Pick removed successfully via direct API')
      setPicks(prev => prev.filter(p => p.id !== pickToRemove.id))
    } catch (err: any) {
      console.error('❌ Error removing pick via direct API:', err)
      setError(err.message)
    }
  }

  const handleSubmitPicks = async () => {
    if (!user || picks.length !== 6 || !picks.some(p => p.is_lock)) return
    
    try {
      setSubmitting(true)
      console.log('🚨 PICK SUBMISSION DEBUG START 🚨')
      console.log('=' .repeat(50))
      
      // Enhanced error logging for debugging
      console.log('📤 Starting pick submission process...')
      console.log('👤 User profile validation:')
      console.log('  - User ID:', user.id)
      console.log('  - Email:', user.email)
      console.log('  - Display Name:', user.display_name)
      console.log('  - User Object Keys:', Object.keys(user))
      console.log('  - Full User Object:', JSON.stringify(user, null, 2))
      
      console.log('🏈 Pick submission validation:')
      console.log('  - Picks count:', picks.length)
      console.log('  - Has lock pick:', picks.some(p => p.is_lock))
      console.log('  - Week/Season:', currentWeek, '/', currentSeason)
      console.log('  - All picks:', picks.map(p => ({ 
        id: p.id, 
        game_id: p.game_id, 
        selected_team: p.selected_team, 
        is_lock: p.is_lock,
        submitted: p.submitted
      })))
      
      // Basic user profile validation
      console.log('🔍 Validating user profile for pick submission...')
      
      // The previous 400 error was due to database trigger functions, not missing user data
      // Users DO have display names - the issue was fixed in Migration 054
      if (!user.email || user.email.trim() === '') {
        console.error('❌ VALIDATION ERROR: User has no email address')
        const errorMsg = 'Cannot submit picks: Your profile is missing an email address. Please contact support.'
        setError(errorMsg)
        throw new Error(errorMsg)
      }
      
      if (!user.display_name || user.display_name.trim() === '') {
        console.error('❌ VALIDATION ERROR: User has no display name')
        const errorMsg = 'Cannot submit picks: Your profile is missing a display name. Please contact support.'
        setError(errorMsg)
        throw new Error(errorMsg)
      }
      
      console.log('✅ Profile validation passed:', {
        display_name: user.display_name,
        email: user.email
      })
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      console.log('🔐 Authentication setup:')
      console.log('  - Supabase URL:', supabaseUrl)
      console.log('  - Has API Key:', !!apiKey)
      console.log('  - API Key length:', apiKey?.length || 0)
      
      // Get auth token with timeout
      let authToken = apiKey
      let sessionInfo = { hasSession: false, hasAccessToken: false, tokenLength: 0 }
      
      try {
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session timeout')), 3000)
        )
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
        if (session?.access_token) {
          authToken = session.access_token
          sessionInfo = {
            hasSession: true,
            hasAccessToken: true,
            tokenLength: session.access_token.length
          }
        }
      } catch (sessionError) {
        console.warn('⚠️ Submit session failed, using API key:', sessionError)
        authToken = apiKey
      }
      
      console.log('🔐 Authentication result:', sessionInfo)
      console.log('  - Using JWT token:', authToken !== apiKey)
      console.log('  - Token type:', authToken !== apiKey ? 'JWT' : 'API_KEY')
      console.log('  - Token length:', authToken?.length || 0)
      
      console.log('🌐 Making API request...')
      console.log('  - Method: PATCH')
      console.log('  - URL:', `${supabaseUrl}/rest/v1/picks?user_id=eq.${user.id}&week=eq.${currentWeek}&season=eq.${currentSeason}`)
      console.log('  - Headers:', {
        'apikey': '***',
        'Authorization': `Bearer ${authToken?.substring(0, 20)}...`,
        'Content-Type': 'application/json'
      })
      console.log('  - Body:', JSON.stringify({ 
        submitted: true,
        submitted_at: new Date().toISOString()
      }))
      
      // Mark all picks as submitted via direct API
      const response = await fetch(`${supabaseUrl}/rest/v1/picks?user_id=eq.${user.id}&week=eq.${currentWeek}&season=eq.${currentSeason}`, {
        method: 'PATCH',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          submitted: true,
          submitted_at: new Date().toISOString()
        })
      })

      console.log('📊 API Response Details:')
      console.log('  - Status:', response.status)
      console.log('  - Status Text:', response.statusText)
      console.log('  - OK:', response.ok)
      console.log('  - Headers:', Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ API ERROR DETAILS:')
        console.error('  - Status Code:', response.status)
        console.error('  - Status Text:', response.statusText)
        console.error('  - Error Body:', errorText)
        console.error('  - Response Headers:', Object.fromEntries(response.headers.entries()))
        
        // Try to parse error details
        let errorDetails = errorText
        try {
          const parsedError = JSON.parse(errorText)
          console.error('  - Parsed Error Object:', JSON.stringify(parsedError, null, 2))
          errorDetails = parsedError.message || parsedError.details || errorText
        } catch (parseError) {
          console.error('  - Could not parse error as JSON')
        }
        
        const detailedError = `Pick submission failed (${response.status}): ${errorDetails}`
        console.error('❌ THROWING ERROR:', detailedError)
        throw new Error(detailedError)
      }
      
      console.log('✅ Picks submitted successfully via direct API')
      
      // Send pick confirmation email
      try {
        console.log('🔧 DEBUG: About to send authenticated pick confirmation email')
        console.log('🔧 DEBUG: User data:', {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          hasEmail: !!user.email,
          emailLength: user.email?.length || 0
        })
        console.log('🔧 DEBUG: Week/Season:', { currentWeek, currentSeason })
        console.log('🔧 DEBUG: Picks count:', picks.length)
        
        // Format picks for email
        const formattedPicks = picks.map(pick => {
          const game = games.find(g => g.id === pick.game_id)
          return {
            game: `${game?.away_team} @ ${game?.home_team}`,
            pick: pick.selected_team,
            spread: game?.spread || 0,
            isLock: pick.is_lock,
            lockTime: pick.lock_time || game?.kickoff_time || ''
          }
        })
        console.log('🔧 DEBUG: Formatted picks:', formattedPicks)

        // Validate required data before calling NotificationScheduler
        if (!user.email || user.email.trim() === '') {
          console.error('❌ Cannot send email: User has no email address')
          alert('⚠️ Cannot send confirmation email: No email address found for your account.')
          return
        }

        console.log('🔧 DEBUG: Calling NotificationScheduler.onPicksSubmitted...')
        await NotificationScheduler.onPicksSubmitted(
          user.id,
          user.email.trim(),
          user.display_name || 'Player',
          currentWeek,
          currentSeason,
          formattedPicks
        )
        console.log('✅ Pick confirmation email process completed')
      } catch (emailError) {
        console.error('❌ Error sending pick confirmation:', emailError)
        console.error('❌ Email error details:', emailError.message)
        console.error('❌ Email error stack:', emailError.stack)
        // Don't fail the entire submission for email errors
      }
      
      // Refresh picks to show submitted status
      await fetchPickSheetData()
      
      alert('Picks submitted successfully! A confirmation email has been sent. Good luck! 🏈')
      
    } catch (err: any) {
      console.error('❌ Error submitting picks:', err)
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const isPicksOpen = weekSettings?.picks_open && new Date() < new Date(weekSettings.deadline)
  const deadline = weekSettings ? new Date(weekSettings.deadline) : null
  const arePicksSubmitted = picks.some(p => p.submitted)
  const submittedAt = picks.find(p => p.submitted)?.submitted_at

  return (
    <Layout>
      {/* Page Header */}
      <div className="bg-pigskin-500 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Week {currentWeek} Pick Sheet</h1>
            <p className="text-pigskin-100">Choose 6 games, set 1 Lock</p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-charcoal-600">Loading games...</div>
            </div>
          </div>
        ) : error ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <div className="text-red-500 text-2xl mb-4">⚠️</div>
              <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
              <p className="text-charcoal-600 mb-4">{error}</p>
              <Button onClick={fetchPickSheetData}>Try Again</Button>
            </CardContent>
          </Card>
        ) : games.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <div className="text-4xl mb-4">🏈</div>
              <h3 className="text-lg font-semibold mb-2">No Games Available</h3>
              <p className="text-charcoal-600 mb-4">
                Games for Week {currentWeek} haven't been set up yet. Check back later!
              </p>
              <Button onClick={() => handleNavigation("/")}>
                Back to Home
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
            {/* Games Grid */}
            <div className="lg:col-span-3 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-pigskin-900 mb-2">
                  Available Games ({games.length})
                </h2>
                
                {arePicksSubmitted && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
                    <div className="font-medium">✅ Picks Submitted Successfully!</div>
                    <div className="text-sm">
                      Submitted {submittedAt && new Date(submittedAt).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}. You can still edit your picks if needed.
                    </div>
                  </div>
                )}
                
                {!isPicksOpen && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <div className="font-medium">Picks are currently closed</div>
                    <div className="text-sm">
                      {deadline && new Date() > deadline 
                        ? 'The deadline has passed for this week.'
                        : 'Picks will open when the admin enables them.'}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="grid md:grid-cols-2 gap-6 auto-rows-fr">
                {games
                  .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
                  .map(game => (
                  <div key={game.id} className="min-h-[300px]">
                    <GameCard
                      game={game}
                      userPick={picks.find(p => p.game_id === game.id)}
                      onPickTeam={handlePickTeam}
                      onToggleLock={handleToggleLock}
                      onRemovePick={handleRemovePick}
                      disabled={!isPicksOpen}
                      isMaxPicks={picks.length >= 6 && !picks.find(p => p.game_id === game.id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Pick Summary Sidebar */}
            <div className="lg:col-span-1">
              <PickSummary
                picks={picks}
                games={games}
                onRemovePick={handleRemovePick}
                onSubmitPicks={handleSubmitPicks}
                deadline={deadline}
                isSubmitting={submitting}
                disabled={!isPicksOpen}
              />
            </div>
          </div>
        )}
      </main>

      {/* Edit Confirmation Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>⚠️</span>
                <span>Edit Submitted Picks?</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-amber-500 text-xl">⚠️</div>
                  <div>
                    <div className="font-semibold text-amber-800 mb-2">Important: Resubmission Required</div>
                    <div className="text-amber-700 text-sm space-y-2">
                      <p>You have already submitted your picks for this week.</p>
                      <p><strong>Making this {
                        pendingEdit?.team === '' ? 'removal' : 
                        pendingEdit?.team === 'TOGGLE_LOCK' ? 'lock change' : 'team change'
                      } will:</strong></p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Mark your picks as "NOT SUBMITTED"</li>
                        <li>Require you to click "Submit Picks" again</li>
                        <li>Your picks won't count until you resubmit</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-charcoal-600 font-medium">
                Are you sure you want to make this {
                  pendingEdit?.team === '' ? 'removal' : 
                  pendingEdit?.team === 'TOGGLE_LOCK' ? 'lock change' : 'change'
                } and resubmit your picks?
              </p>
              <div className="flex space-x-3">
                <Button
                  onClick={handleConfirmEdit}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  {
                    pendingEdit?.team === '' ? 'Remove & Resubmit' : 
                    pendingEdit?.team === 'TOGGLE_LOCK' ? 'Change Lock & Resubmit' : 'Edit & Resubmit'
                  }
                </Button>
                <Button
                  onClick={() => {
                    setShowEditDialog(false)
                    setPendingEdit(null)
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Warning Dialog */}
      {showNavWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <span>⚠️</span>
                <span>Unsaved Picks Detected</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="text-red-500 text-xl">🚨</div>
                  <div>
                    <div className="font-semibold text-red-800 mb-2">Warning: You Have Unsaved Picks!</div>
                    <div className="text-red-700 text-sm space-y-2">
                      <p>You have {picks.length} pick{picks.length !== 1 ? 's' : ''} that haven't been submitted yet.</p>
                      <p><strong>If you leave this page:</strong></p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Your unsaved picks will be lost</li>
                        <li>You'll need to make your picks again</li>
                        <li>Only submitted picks count for scoring</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-charcoal-600 font-medium">
                Are you sure you want to leave and lose your unsaved picks?
              </p>
              
              <div className="flex space-x-3">
                <Button
                  onClick={confirmNavigation}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  Yes, Leave & Lose Picks
                </Button>
                <Button
                  onClick={cancelNavigation}
                  variant="outline"
                  className="flex-1 border-green-500 text-green-700 hover:bg-green-50"
                >
                  Stay & Save Picks
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  )
}