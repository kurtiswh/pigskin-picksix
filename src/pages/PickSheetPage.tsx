import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getCurrentWeek } from '@/services/collegeFootballApi'
import { Game, Pick, WeekSettings } from '@/types'
import GameCard from '@/components/GameCard'
import PickSummary from '@/components/PickSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  
  const currentSeason = new Date().getFullYear()
  const currentWeek = getCurrentWeek(currentSeason) // Dynamic current week

  // Check if user has unsaved changes
  const hasUnsavedChanges = useCallback(() => {
    return picks.length > 0 && !picks.some(p => p.submitted)
  }, [picks])

  useEffect(() => {
    if (user) {
      fetchPickSheetData()
    }
  }, [user])

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

      // Fetch week settings
      const { data: weekData, error: weekError } = await supabase
        .from('week_settings')
        .select('*')
        .eq('week', currentWeek)
        .eq('season', currentSeason)
        .single()

      if (weekError && weekError.code !== 'PGRST116') {
        throw weekError
      }

      setWeekSettings(weekData)

      // Fetch games for this week
      const { data: gamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('week', currentWeek)
        .eq('season', currentSeason)
        .order('kickoff_time', { ascending: true })

      if (gamesError) throw gamesError
      setGames(gamesData || [])

      // Fetch user's existing picks
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select('*')
        .eq('user_id', user!.id)
        .eq('week', currentWeek)
        .eq('season', currentSeason)

      if (picksError) throw picksError
      setPicks(picksData || [])

    } catch (err: any) {
      console.error('Error fetching pick sheet data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePickTeam = async (gameId: string, team: string) => {
    if (!user) return
    
    // Check if picks have been submitted and require confirmation
    const arePicksSubmitted = picks.some(p => p.submitted)
    if (arePicksSubmitted) {
      setPendingEdit({ gameId, team })
      setShowEditDialog(true)
      return
    }
    
    await performPickUpdate(gameId, team)
  }

  const performPickUpdate = async (gameId: string, team: string) => {
    try {
      const existingPick = picks.find(p => p.game_id === gameId)
      
      if (existingPick) {
        // Update existing pick and reset submitted status
        const { data, error } = await supabase
          .from('picks')
          .update({ 
            selected_team: team,
            submitted: false,
            submitted_at: null
          })
          .eq('id', existingPick.id)
          .select()
          .single()

        if (error) throw error
        
        setPicks(prev => prev.map(p => p.id === existingPick.id ? data : p))
      } else {
        // Create new pick
        const { data, error } = await supabase
          .from('picks')
          .insert({
            user_id: user.id,
            game_id: gameId,
            week: currentWeek,
            season: currentSeason,
            selected_team: team,
            is_lock: false,
            submitted: false
          })
          .select()
          .single()

        if (error) throw error
        
        setPicks(prev => [...prev, data])
      }
    } catch (err: any) {
      console.error('Error updating pick:', err)
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
      
      // Reset all picks' submitted status when editing
      await supabase
        .from('picks')
        .update({ submitted: false, submitted_at: null })
        .eq('user_id', user!.id)
        .eq('week', currentWeek)
        .eq('season', currentSeason)
      
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
    if (!user) return
    
    // Check if picks have been submitted and require confirmation
    const arePicksSubmitted = picks.some(p => p.submitted)
    if (arePicksSubmitted) {
      setPendingEdit({ gameId, team: 'TOGGLE_LOCK' }) // Special value to indicate lock toggle
      setShowEditDialog(true)
      return
    }
    
    await performLockToggle(gameId)
  }

  const performLockToggle = async (gameId: string) => {
    try {
      const pickToLock = picks.find(p => p.game_id === gameId)
      if (!pickToLock) return

      const currentLockPick = picks.find(p => p.is_lock)
      
      // Remove lock from current lock pick if different
      if (currentLockPick && currentLockPick.id !== pickToLock.id) {
        const { error: unlockError } = await supabase
          .from('picks')
          .update({ is_lock: false })
          .eq('id', currentLockPick.id)
        
        if (unlockError) throw unlockError
      }

      // Toggle lock on selected pick
      const newLockState = !pickToLock.is_lock
      const { data, error } = await supabase
        .from('picks')
        .update({ is_lock: newLockState })
        .eq('id', pickToLock.id)
        .select()
        .single()

      if (error) throw error
      
      setPicks(prev => prev.map(p => {
        if (p.id === pickToLock.id) return data
        if (p.is_lock && p.id !== pickToLock.id) return { ...p, is_lock: false }
        return p
      }))
    } catch (err: any) {
      console.error('Error toggling lock:', err)
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
      const pickToRemove = picks.find(p => p.game_id === gameId)
      if (!pickToRemove) return

      const { error } = await supabase
        .from('picks')
        .delete()
        .eq('id', pickToRemove.id)

      if (error) throw error
      
      setPicks(prev => prev.filter(p => p.id !== pickToRemove.id))
    } catch (err: any) {
      console.error('Error removing pick:', err)
      setError(err.message)
    }
  }

  const handleSubmitPicks = async () => {
    if (!user || picks.length !== 6 || !picks.some(p => p.is_lock)) return
    
    try {
      setSubmitting(true)
      
      // Mark all picks as submitted
      const { error } = await supabase
        .from('picks')
        .update({ 
          submitted: true,
          submitted_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('week', currentWeek)
        .eq('season', currentSeason)
      
      if (error) throw error
      
      // Refresh picks to show submitted status
      await fetchPickSheetData()
      
      // Handle notification workflow for pick submission
      try {
        // Format picks for email
        const formattedPicks = picks.map(pick => {
          const game = games.find(g => g.id === pick.game_id)
          return {
            game: game ? `${game.away_team} @ ${game.home_team}` : 'Unknown Game',
            pick: pick.selected_team,
            isLock: pick.is_lock,
            lockTime: game ? new Date(game.kickoff_time).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              timeZoneName: 'short'
            }) : 'Unknown Time'
          }
        })

        await NotificationScheduler.onPicksSubmitted(
          user.id,
          user.email,
          user.display_name,
          currentWeek,
          currentSeason,
          formattedPicks
        )
      } catch (notifyError) {
        console.warn('Failed to process notifications:', notifyError)
        // Don't fail the submission for notification errors
      }
      
      alert('Picks submitted successfully! Good luck! 🏈')
      
    } catch (err: any) {
      console.error('Error submitting picks:', err)
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
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-pigskin-500 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => handleNavigation("/")}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                <span className="text-pigskin-900 font-bold">P6</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">Week {currentWeek} Pick Sheet</h1>
                <p className="text-pigskin-100 text-sm">Choose 6 games, set 1 Lock</p>
              </div>
            </button>
            <div className="flex items-center space-x-4">
              <span className="text-pigskin-100">Hi, {user.display_name}!</span>
              <Button 
                variant="outline" 
                size="sm"
                className="border-white text-white hover:bg-white hover:text-pigskin-500"
                onClick={() => handleNavigation("/profile")}
              >
                Profile
              </Button>
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
    </div>
  )
}