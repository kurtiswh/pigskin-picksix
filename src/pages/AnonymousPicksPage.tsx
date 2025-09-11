import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getActiveWeek } from '@/services/weekService'
import { getWeekDataDirect } from '@/lib/supabase-direct'
import { ENV } from '@/lib/env'
import { Game, WeekSettings } from '@/types'
import GameCard from '@/components/GameCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NotificationScheduler } from '@/services/notificationScheduler'
import { EmailService } from '@/services/emailService'
import Layout from '@/components/Layout'

interface AnonymousPick {
  gameId: string
  selectedTeam: string
  isLock: boolean
}

export default function AnonymousPicksPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [isValidated, setIsValidated] = useState<boolean | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [picks, setPicks] = useState<AnonymousPick[]>([])
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  
  const currentSeason = new Date().getFullYear()
  const [currentWeek, setCurrentWeek] = useState(0)

  // Check if user has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return picks.length > 0 && !submitted
  }, [picks, submitted])

  useEffect(() => {
    // Get the active week when component mounts
    getActiveWeek(currentSeason).then(activeWeek => {
      setCurrentWeek(activeWeek)
    })
  }, [currentSeason])

  useEffect(() => {
    if (currentWeek > 0) {
      fetchGamesData()
    }
  }, [currentWeek])

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

  // Intercept navigation attempts
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Check if the click is on a link
      const target = e.target as HTMLElement
      const link = target.closest('a')
      
      if (link && link.href && hasUnsavedChanges()) {
        const currentUrl = window.location.href
        const targetUrl = link.href
        
        // Only block if navigating to a different page
        if (currentUrl !== targetUrl && !targetUrl.includes('#')) {
          e.preventDefault()
          e.stopPropagation()
          
          // Use custom navigation handler
          const path = link.getAttribute('href')
          if (path) {
            setPendingNavigation(path)
            setShowNavWarning(true)
          }
        }
      }
    }

    // Add event listener to intercept clicks
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
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

  const validateEmail = async (emailToCheck: string) => {
    try {
      console.log('📧 Validating email via direct API:', emailToCheck)
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      // Check users table
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?or=(email.eq.${emailToCheck},leaguesafe_email.eq.${emailToCheck})&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (usersResponse.ok) {
        const users = await usersResponse.json()
        if (users && users.length > 0) {
          console.log('✅ Email found in users table')
          return true
        }
      }

      // Check leaguesafe_payments table
      const paymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?leaguesafe_email=eq.${emailToCheck}&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (paymentsResponse.ok) {
        const payments = await paymentsResponse.json()
        if (payments && payments.length > 0) {
          console.log('✅ Email found in leaguesafe payments')
          return true
        }
      }

      console.log('❌ Email not found in any table')
      return false
    } catch (error) {
      console.error('❌ Error validating email:', error)
      return false
    }
  }

  const handleEmailBlur = async () => {
    if (email.trim()) {
      const validated = await validateEmail(email.trim())
      setIsValidated(validated)
    }
  }

  const fetchGamesData = async () => {
    try {
      setLoading(true)
      setError('')
      
      console.log('🏈 Loading anonymous picks data with direct API...')

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
            status: game.status || 'scheduled'
          }))
          setGames(convertedGames)
          console.log('✅ Converted and set games for anonymous picks:', convertedGames.length)
        } else {
          setGames([])
          console.log('⚠️ No games found for anonymous picks')
        }

      } catch (error) {
        console.error('❌ Direct API failed for anonymous picks:', error)
        setError('Failed to load games data. Please try again.')
      }

    } catch (err: any) {
      console.error('Error in fetchGamesData:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePickChange = (gameId: string, team: string) => {
    setPicks(prev => {
      const existing = prev.find(p => p.gameId === gameId)
      if (existing) {
        if (team === '') {
          // Remove pick
          return prev.filter(p => p.gameId !== gameId)
        } else {
          // Update pick
          return prev.map(p => p.gameId === gameId ? { ...p, selectedTeam: team } : p)
        }
      } else {
        // Add new pick
        return [...prev, { gameId, selectedTeam: team, isLock: false }]
      }
    })
  }

  const handleToggleLock = (gameId: string) => {
    setPicks(prev => prev.map(p => {
      if (p.gameId === gameId) {
        return { ...p, isLock: !p.isLock }
      } else {
        // Remove lock from other picks
        return { ...p, isLock: false }
      }
    }))
  }

  const handleRemovePick = (gameId: string) => {
    console.log('🗑️ Removing anonymous pick:', gameId)
    handlePickChange(gameId, '') // Use empty string to trigger removal
  }

  const handleSubmitPicks = async () => {
    if (!email.trim() || !name.trim() || picks.length !== 6 || !picks.some(p => p.isLock)) {
      setError('Please fill out all required fields: email, name, 6 picks, and select one lock pick.')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      // Store anonymous picks using direct API
      const picksToSubmit = picks.map(pick => {
        const game = games.find(g => g.id === pick.gameId)
        return {
          email: email.trim(),
          name: name.trim(),
          week: currentWeek,
          season: currentSeason,
          game_id: pick.gameId,
          home_team: game?.home_team,
          away_team: game?.away_team,
          selected_team: pick.selectedTeam,
          is_lock: pick.isLock,
          is_validated: isValidated || false,
          submitted_at: new Date().toISOString()
        }
      })

      console.log('📤 Submitting anonymous picks via direct API...', picksToSubmit.length, 'picks')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks`, {
        method: 'POST',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(picksToSubmit)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Anonymous picks submission failed:', response.status, errorText)
        throw new Error(`Submission failed: ${response.status} - ${errorText}`)
      }

      console.log('✅ Anonymous picks submitted successfully via direct API')
      
      // Send pick confirmation email for anonymous picks
      try {
        // Format picks for email
        const formattedPicks = picks.map(pick => {
          const game = games.find(g => g.id === pick.gameId)
          return {
            game: `${game?.away_team} @ ${game?.home_team}`,
            pick: pick.selectedTeam,
            spread: game?.spread || 0,
            isLock: pick.isLock,
            lockTime: game?.kickoff_time || ''
          }
        })

        // Create email job for tracking
        const jobId = await EmailService.sendPickConfirmation(
          'anonymous', // Placeholder for anonymous picks
          email.trim(),
          name.trim(),
          currentWeek,
          currentSeason,
          formattedPicks,
          new Date()
        )
        console.log(`📧 Anonymous pick confirmation email queued (job: ${jobId})`)
        
        // Send email immediately using direct approach
        try {
          console.log('📤 Sending anonymous pick confirmation immediately...')
          
          const success = await EmailService.sendPickConfirmationDirect(
            'anonymous',
            email.trim(),
            name.trim(),
            currentWeek,
            currentSeason,
            formattedPicks,
            new Date()
          )
          
          if (success) {
            console.log('✅ Anonymous pick confirmation sent immediately!')
            
            // Update job status to sent
            const { error: updateError } = await supabase
              .from('email_jobs')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                attempts: 1
              })
              .eq('id', jobId)
              
            if (updateError) {
              console.warn('Could not update email job status:', updateError)
            } else {
              console.log('📋 Email job status updated to sent')
            }
          } else {
            console.warn('⚠️ Anonymous pick confirmation failed to send immediately')
            console.log('💡 Email remains queued for manual processing')
          }
        } catch (directSendError) {
          console.error('❌ Error sending anonymous pick confirmation immediately:', directSendError)
          console.log('💡 Email remains queued for manual processing')
        }
      } catch (emailError) {
        console.error('❌ Error sending anonymous pick confirmation:', emailError)
        // Don't fail the entire submission for email errors
      }
      
      setSubmitted(true)
      
    } catch (err: any) {
      console.error('Error submitting picks:', err)
      
      // Handle specific error cases with user-friendly messages
      if (err.message.includes('409') && err.message.includes('unique_anonymous_pick_per_game_user')) {
        setError('Picks have already been submitted for this email address. Each email can only submit picks once per week.')
      } else {
        setError(err.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isPicksOpen = weekSettings?.picks_open && new Date() < new Date(weekSettings.deadline)
  const deadline = weekSettings ? new Date(weekSettings.deadline) : null

  if (submitted) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card className="text-center">
            <CardContent className="p-8">
              <div className="text-6xl mb-4">🏈</div>
              <h2 className="text-2xl font-bold text-green-700 mb-4">Picks Submitted!</h2>
              <div className="space-y-3 text-left">
                <p><strong>Name:</strong> {name}</p>
                <p><strong>Email:</strong> {email}</p>
                <p><strong>Validation Status:</strong> {isValidated ? 
                  <span className="text-green-600 font-semibold">✅ Validated</span> : 
                  <span className="text-orange-600 font-semibold">⏳ Pending Manual Review</span>
                }</p>
              </div>
              
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <p className="font-semibold text-blue-800 mb-2">📧 Confirmation Email</p>
                <p className="text-blue-700">
                  A confirmation email with your submitted picks has been sent to <strong>{email}</strong>. 
                  If you don't receive it within a few minutes, please check your spam folder.
                </p>
              </div>
              
              {!isValidated && (
                <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                  <p className="font-semibold text-orange-800 mb-2">Manual Verification Required</p>
                  <p className="text-orange-700">
                    We couldn't automatically validate your email address. Your picks have been submitted but won't appear on the leaderboard until manually verified by an admin. You'll be contacted if we need additional information.
                  </p>
                </div>
              )}

              {isValidated && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm">
                  <p className="font-semibold text-green-800 mb-2">Picks Validated!</p>
                  <p className="text-green-700">
                    Your email was found in our system. Your picks will be included in scoring and leaderboard calculations.
                  </p>
                </div>
              )}

              <div className="mt-6">
                <button 
                  onClick={() => handleNavigation('/')}
                  className="text-pigskin-600 hover:text-pigskin-700 font-medium"
                >
                  ← Back to Home
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-pigskin-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-pigskin-600">Loading games...</p>
          </div>
        </div>
      </Layout>
    )
  }

  if (!isPicksOpen) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="text-center p-8">
              <div className="text-4xl mb-4">⏰</div>
              <h2 className="text-xl font-bold mb-4">Picks Are Currently Closed</h2>
              <p className="text-charcoal-600 mb-6">
                Pick submission is not available at this time. Check back when picks open for the next week.
              </p>
              <button 
                onClick={() => handleNavigation('/')}
                className="text-pigskin-600 hover:text-pigskin-700 font-medium"
              >
                ← Back to Home
              </button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-pigskin-900">Anonymous Pick Submission</h1>
          <p className="text-pigskin-600 mt-2">Submit your picks for Week {currentWeek}</p>
        </div>
        {/* User Info Form */}
        <Card>
          <CardHeader>
            <CardTitle>Your Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Your Name *
                </label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Email Address *
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={handleEmailBlur}
                  placeholder="Enter your email"
                  required
                />
                {isValidated === true && (
                  <p className="text-green-600 text-sm mt-1">✅ Email validated - you're in our system!</p>
                )}
                {isValidated === false && email.trim() && (
                  <p className="text-orange-600 text-sm mt-1">⚠️ Email not found - picks will require manual verification by admins and won't show in the leaderboard until reviewed and confirmed.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Make Your Picks</span>
              <span className="text-sm font-normal text-charcoal-500">
                Week {currentWeek} • {currentSeason}
                {deadline && (
                  <> • Deadline: {deadline.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                  </>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Instructions:</strong> Pick the winner of each game. You must select exactly 6 games and choose 1 as your "lock" pick (worth double points if correct).
              </p>
            </div>

            <div className="space-y-4">
              {games.map((game) => {
                const pick = picks.find(p => p.gameId === game.id)
                return (
                  <GameCard
                    key={game.id}
                    game={game}
                    userPick={pick ? {
                      id: `anonymous-${game.id}`,
                      user_id: 'anonymous',
                      game_id: game.id,
                      week: currentWeek,
                      season: currentSeason,
                      selected_team: pick.selectedTeam,
                      is_lock: pick.isLock,
                      submitted: false,
                      submitted_at: null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    } : undefined}
                    onPickTeam={handlePickChange}
                    onToggleLock={handleToggleLock}
                    onRemovePick={handleRemovePick}
                    disabled={!isPicksOpen}
                    isMaxPicks={picks.length >= 6 && !pick}
                  />
                )
              })}
            </div>

            <div className="text-center space-y-4">
              <p className="text-sm text-charcoal-600">
                Selected: {picks.length}/6 picks • Lock pick: {picks.some(p => p.isLock) ? '✅' : '❌'}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSubmitPicks}
                disabled={submitting || picks.length !== 6 || !picks.some(p => p.isLock) || !email.trim() || !name.trim()}
                className={`w-full max-w-md transition-all duration-200 ${
                  !submitting && picks.length === 6 && picks.some(p => p.isLock) && email.trim() && name.trim()
                    ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] ring-2 ring-green-500/30'
                    : ''
                }`}
                size="lg"
              >
                {submitting ? 'Submitting...' : 'Submit Picks'}
              </Button>

              <div className="text-xs text-charcoal-500">
                <p>By submitting, you confirm that you are eligible to participate in this pick'em competition.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation Warning Dialog */}
        {showNavWarning && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-md mx-4">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <span>⚠️</span>
                  <span>Submitted Picks Detected</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="text-red-500 text-xl">🚨</div>
                    <div>
                      <div className="font-semibold text-red-800 mb-2">Warning: You Have Unsubmitted Picks!</div>
                      <div className="text-red-700 text-sm space-y-2">
                        <p>You have {picks.length} pick{picks.length !== 1 ? 's' : ''} that haven't been submitted yet.</p>
                        <p><strong>If you leave this page without submitting your picks, they will be WON'T be counted for scoring.</strong></p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-charcoal-600 font-medium">
                  Are you sure you want to leave without submitting your picks?
                </p>
                
                <div className="flex space-x-3">
                  <Button
                    onClick={confirmNavigation}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    Yes, leave without submitting
                  </Button>
                  <Button
                    onClick={cancelNavigation}
                    variant="outline"
                    className="flex-1 border-green-500 text-green-700 hover:bg-green-50"
                  >
                    Stay & Submit Picks
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  )
}