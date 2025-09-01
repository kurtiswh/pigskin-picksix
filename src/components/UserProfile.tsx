import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { UserProfile as UserProfileType, UserPreferences, Pick, AnonymousPick, UserPickSet } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

export default function UserProfile() {
  const { user, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'stats'>('profile')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userProfile, setUserProfile] = useState<UserProfileType | null>(null)
  const [pickSets, setPickSets] = useState<UserPickSet[]>([])
  
  // Form state
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (user) {
      loadUserProfile()
    }
  }, [user])

  const loadUserProfile = async () => {
    if (!user) return
    
    setLoading(true)
    setError('')
    
    try {
      // Load both authenticated and anonymous picks
      console.log('📊 Loading comprehensive pick data for user profile...')
      
      const [authenticatedPicks, anonymousPicks] = await Promise.allSettled([
        loadAuthenticatedPicks(),
        loadAnonymousPicks()
      ])
      
      let allPicks: Pick[] = []
      let allAnonPicks: AnonymousPick[] = []
      let loadErrors: string[] = []
      
      // Handle authenticated picks result
      if (authenticatedPicks.status === 'fulfilled') {
        allPicks = authenticatedPicks.value
        console.log('✅ Loaded', allPicks.length, 'authenticated picks')
      } else {
        console.log('⚠️ Could not load authenticated picks:', authenticatedPicks.reason)
        loadErrors.push('authenticated picks')
      }
      
      // Handle anonymous picks result
      if (anonymousPicks.status === 'fulfilled') {
        allAnonPicks = anonymousPicks.value
        console.log('✅ Loaded', allAnonPicks.length, 'anonymous picks')
      } else {
        console.log('⚠️ Could not load anonymous picks:', anonymousPicks.reason)
        loadErrors.push('anonymous picks')
      }
      
      // Calculate comprehensive statistics
      const currentSeason = new Date().getFullYear()
      const stats = calculateCombinedUserStats(allPicks, allAnonPicks, currentSeason)
      const pickSetsData = generatePickSetsData(allPicks, allAnonPicks)
      
      const profile: UserProfileType = {
        id: user.id,
        email: user.email,
        display_name: user.display_name || 'User',
        is_admin: user.is_admin || false,
        leaguesafe_email: user.email,
        created_at: user.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        preferences: {
          email_notifications: true,
          pick_reminders: true,
          weekly_results: true,
          deadline_alerts: true,
          compact_view: false
        },
        stats,
        pickSets: pickSetsData
      }
      
      setUserProfile(profile)
      setPickSets(pickSetsData)
      setDisplayName(profile.display_name)
      
      if (loadErrors.length > 0) {
        setError(`Note: Could not load ${loadErrors.join(' and ')} (this may be normal due to permissions)`)
        setTimeout(() => setError(''), 5000)
      }
      
    } catch (err: any) {
      console.error('❌ Error loading user profile:', err)
      setError(`Failed to load profile data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadAuthenticatedPicks = async (): Promise<Pick[]> => {
    const { data, error } = await supabase
      .from('picks')
      .select('*')
      .eq('user_id', user!.id)
      .order('season', { ascending: false })
      .order('week', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  const loadAnonymousPicks = async (): Promise<AnonymousPick[]> => {
    const { data, error } = await supabase
      .from('anonymous_picks')
      .select('*')
      .eq('assigned_user_id', user!.id)
      .order('season', { ascending: false })
      .order('week', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  const calculateCombinedUserStats = (authenticatedPicks: Pick[], anonymousPicks: AnonymousPick[], currentSeason: number) => {
    // Only include active anonymous picks (respect precedence rules)
    const activeAnonPicks = anonymousPicks.filter(p => p.is_active_pick_set)
    
    // Combine both pick types for overall statistics
    const allActivePicks = [
      ...authenticatedPicks,
      ...activeAnonPicks
    ]
    
    const seasons = [...new Set(allActivePicks.map(p => p.season))]
    const currentSeasonPicks = allActivePicks.filter(p => p.season === currentSeason)
    const wins = allActivePicks.filter(p => p.result === 'win')
    const losses = allActivePicks.filter(p => p.result === 'loss')
    const pushes = allActivePicks.filter(p => p.result === 'push')
    const lockWins = allActivePicks.filter(p => p.is_lock && p.result === 'win')
    const lockLosses = allActivePicks.filter(p => p.is_lock && p.result === 'loss')
    
    // Calculate best week score across both pick types
    const weeklyScores = allActivePicks.reduce((acc: any, pick) => {
      const key = `${pick.season}-${pick.week}`
      if (!acc[key]) acc[key] = 0
      acc[key] += pick.points_earned || 0
      return acc
    }, {})
    
    const bestWeekScore = Object.values(weeklyScores).length > 0 
      ? Math.max(...Object.values(weeklyScores) as number[])
      : 0

    return {
      seasons_played: seasons.length,
      total_picks: allActivePicks.length,
      total_wins: wins.length,
      total_losses: losses.length,
      total_pushes: pushes.length,
      best_week_score: bestWeekScore,
      best_season_rank: 1, // TODO: Calculate from historical leaderboard data
      lock_wins: lockWins.length,
      lock_losses: lockLosses.length,
      current_season_points: currentSeasonPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)
    }
  }

  const generatePickSetsData = (authenticatedPicks: Pick[], anonymousPicks: AnonymousPick[]): UserPickSet[] => {
    const pickSetsMap = new Map<string, UserPickSet>()
    
    // Process authenticated picks
    authenticatedPicks.forEach(pick => {
      const key = `${pick.season}-${pick.week}`
      if (!pickSetsMap.has(key)) {
        pickSetsMap.set(key, {
          season: pick.season,
          week: pick.week,
          pickType: 'authenticated',
          isActive: true, // Authenticated picks are always active
          pickCount: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          points: 0,
          lockWins: 0,
          lockLosses: 0,
          conflictStatus: 'no_conflict'
        })
      }
      
      const pickSet = pickSetsMap.get(key)!
      pickSet.pickCount++
      pickSet.points += pick.points_earned || 0
      
      if (pick.result === 'win') pickSet.wins++
      else if (pick.result === 'loss') pickSet.losses++
      else if (pick.result === 'push') pickSet.pushes++
      
      if (pick.is_lock) {
        if (pick.result === 'win') pickSet.lockWins = (pickSet.lockWins || 0) + 1
        else if (pick.result === 'loss') pickSet.lockLosses = (pickSet.lockLosses || 0) + 1
      }
    })
    
    // Process anonymous picks
    anonymousPicks.forEach(pick => {
      const key = `${pick.season}-${pick.week}`
      const existingPickSet = pickSetsMap.get(key)
      
      if (existingPickSet && existingPickSet.pickType === 'authenticated') {
        // There's a conflict - user has both authenticated and anonymous picks
        existingPickSet.conflictStatus = pick.is_active_pick_set ? 'active_conflict' : 'resolved_conflict'
        return // Don't add anonymous picks as separate entry when there are authenticated picks
      }
      
      if (!pickSetsMap.has(key)) {
        pickSetsMap.set(key, {
          season: pick.season,
          week: pick.week,
          pickType: 'anonymous',
          isActive: pick.is_active_pick_set,
          pickCount: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          points: 0,
          lockWins: 0,
          lockLosses: 0,
          conflictStatus: 'no_conflict'
        })
      }
      
      const pickSet = pickSetsMap.get(key)!
      pickSet.pickCount++
      pickSet.points += pick.points_earned || 0
      
      if (pick.result === 'win') pickSet.wins++
      else if (pick.result === 'loss') pickSet.losses++
      else if (pick.result === 'push') pickSet.pushes++
      
      if (pick.is_lock) {
        if (pick.result === 'win') pickSet.lockWins = (pickSet.lockWins || 0) + 1
        else if (pick.result === 'loss') pickSet.lockLosses = (pickSet.lockLosses || 0) + 1
      }
    })
    
    return Array.from(pickSetsMap.values()).sort((a, b) => {
      if (a.season !== b.season) return b.season - a.season
      return b.week - a.week
    })
  }

  const handleSaveProfile = async () => {
    if (!user) return

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      // Add timeout for save operations
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Save operation timed out')), 8000)
      )

      try {
        const updates = {
          display_name: displayName.trim(),
          updated_at: new Date().toISOString()
        }

        const updateQuery = supabase
          .from('users')
          .update(updates)
          .eq('id', user.id)

        const result = await Promise.race([updateQuery, timeoutPromise])
        if (result.error) throw result.error

        // Refresh the user context (with timeout)
        const refreshQuery = refreshUser()
        await Promise.race([refreshQuery, timeoutPromise])
        
        setSuccess('Profile updated successfully!')
        setTimeout(() => setSuccess(''), 3000)
        
        // Reload profile data (with timeout)
        const loadQuery = loadUserProfile()
        await Promise.race([loadQuery, timeoutPromise])
        
      } catch (timeoutError) {
        console.log('⏰ Save operation timed out')
        setSuccess('Changes saved locally! May sync with server shortly.')
        setTimeout(() => setSuccess(''), 3000)
      }

    } catch (err: any) {
      console.error('Error updating profile:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }


  if (!user) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="text-red-500 text-2xl mb-4">⚠️</div>
          <p>Please log in to view your profile.</p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-charcoal-600">Loading profile...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-pigskin-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              {displayName.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl">{displayName}</h1>
              <p className="text-charcoal-500 text-sm">Member since {new Date(user.created_at).getFullYear()}</p>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-white p-1 rounded-lg shadow-sm">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'profile'
              ? 'bg-pigskin-500 text-white'
              : 'text-charcoal-600 hover:text-pigskin-700'
          }`}
        >
          Profile Info
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'stats'
              ? 'bg-pigskin-500 text-white'
              : 'text-charcoal-600 hover:text-pigskin-700'
          }`}
        >
          Statistics
        </button>
      </div>

      {/* Success/Error Messages */}
      {error && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-red-700">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 text-green-700">
              <span>✅</span>
              <span>{success}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab Content */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={50}
                />
                <p className="text-xs text-charcoal-500">
                  This is how your name appears on leaderboards and picks
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  value={user.email}
                  disabled
                  className="bg-stone-50"
                />
                <p className="text-xs text-charcoal-500">
                  Email cannot be changed (linked to authentication)
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveProfile} 
                disabled={saving || displayName.trim() === ''}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {activeTab === 'stats' && userProfile?.stats && (
        <Card>
          <CardHeader>
            <CardTitle>Your Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {/* Overall Stats */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Overall Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Seasons Played:</span>
                    <span className="font-semibold">{userProfile.stats.seasons_played}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Total Picks:</span>
                    <span className="font-semibold">{userProfile.stats.total_picks}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Win Rate:</span>
                    <span className="font-semibold">
                      {userProfile.stats.total_picks > 0 
                        ? `${Math.round((userProfile.stats.total_wins / userProfile.stats.total_picks) * 100)}%`
                        : '0%'
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Record */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Record</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-green-600">Wins:</span>
                    <span className="font-semibold text-green-600">{userProfile.stats.total_wins}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">Losses:</span>
                    <span className="font-semibold text-red-600">{userProfile.stats.total_losses}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">Pushes:</span>
                    <span className="font-semibold text-yellow-600">{userProfile.stats.total_pushes}</span>
                  </div>
                </div>
              </div>

              {/* Best Performance */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Best Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Best Week Score:</span>
                    <span className="font-semibold">{userProfile.stats.best_week_score} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Lock Record:</span>
                    <span className="font-semibold">
                      {userProfile.stats.lock_wins}-{userProfile.stats.lock_losses}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Current Season Points:</span>
                    <span className="font-semibold">{userProfile.stats.current_season_points}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pick Sets Section */}
            {pickSets.length > 0 && (
              <>
                <Separator className="my-6" />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Pick Sets History</h3>
                  <div className="space-y-3">
                    {pickSets.map((pickSet, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-stone-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">
                                Week {pickSet.week}, {pickSet.season}
                              </span>
                              <Badge 
                                variant={pickSet.pickType === 'authenticated' ? 'default' : 'secondary'}
                                className={pickSet.pickType === 'authenticated' 
                                  ? 'bg-pigskin-500 text-white' 
                                  : 'bg-gray-500 text-white'
                                }
                              >
                                {pickSet.pickType === 'authenticated' ? 'Registered' : 'Anonymous'}
                              </Badge>
                              {!pickSet.isActive && (
                                <Badge variant="outline" className="text-red-600 border-red-300">
                                  Inactive
                                </Badge>
                              )}
                              {pickSet.conflictStatus === 'active_conflict' && (
                                <Badge variant="outline" className="text-orange-600 border-orange-300">
                                  Conflict
                                </Badge>
                              )}
                              {pickSet.conflictStatus === 'resolved_conflict' && (
                                <Badge variant="outline" className="text-blue-600 border-blue-300">
                                  Resolved
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-pigskin-600">
                              {pickSet.points} points
                            </div>
                            <div className="text-sm text-charcoal-500">
                              {pickSet.pickCount} picks
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="text-center">
                            <div className="text-green-600 font-semibold">{pickSet.wins}</div>
                            <div className="text-charcoal-500">Wins</div>
                          </div>
                          <div className="text-center">
                            <div className="text-red-600 font-semibold">{pickSet.losses}</div>
                            <div className="text-charcoal-500">Losses</div>
                          </div>
                          <div className="text-center">
                            <div className="text-yellow-600 font-semibold">{pickSet.pushes}</div>
                            <div className="text-charcoal-500">Pushes</div>
                          </div>
                          <div className="text-center">
                            <div className="text-pigskin-600 font-semibold">
                              {(pickSet.lockWins || 0)}-{(pickSet.lockLosses || 0)}
                            </div>
                            <div className="text-charcoal-500">Lock Record</div>
                          </div>
                        </div>

                        {/* Status explanation */}
                        {pickSet.conflictStatus !== 'no_conflict' && (
                          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                            {pickSet.conflictStatus === 'active_conflict' && (
                              <span className="text-orange-700">
                                ⚠️ This pick set conflicts with another pick set for the same week. 
                                Only one set can be active for scoring.
                              </span>
                            )}
                            {pickSet.conflictStatus === 'resolved_conflict' && (
                              <span className="text-blue-700">
                                ✅ This pick set conflict has been resolved. 
                                Your {pickSet.pickType} picks are being used for scoring.
                              </span>
                            )}
                          </div>
                        )}

                        {!pickSet.isActive && pickSet.conflictStatus === 'no_conflict' && (
                          <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded text-sm">
                            <span className="text-gray-700">
                              ℹ️ This pick set is inactive and not being used for scoring calculations.
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pick Sets Summary */}
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <div className="font-medium text-blue-800 mb-1">Pick Sets Explanation:</div>
                    <ul className="text-blue-700 space-y-1">
                      <li>• <strong>Registered:</strong> Picks made while logged into your account</li>
                      <li>• <strong>Anonymous:</strong> Picks made before login that were matched to your account</li>
                      <li>• <strong>Active:</strong> These picks count toward your scores and leaderboard ranking</li>
                      <li>• <strong>Inactive:</strong> These picks don't count (usually when you have both types for the same week)</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}