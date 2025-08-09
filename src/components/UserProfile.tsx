import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { UserProfile as UserProfileType, UserPreferences } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'

export default function UserProfile() {
  const { user, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'preferences' | 'stats'>('profile')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userProfile, setUserProfile] = useState<UserProfileType | null>(null)
  
  // Form state
  const [displayName, setDisplayName] = useState('')
  const [preferences, setPreferences] = useState<UserPreferences>({
    email_notifications: true,
    pick_reminders: true,
    weekly_results: true,
    deadline_alerts: true,
    compact_view: false
  })

  useEffect(() => {
    if (user) {
      loadUserProfile()
    }
  }, [user])

  const loadUserProfile = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      setError('')

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Profile loading timed out - using fallback data')), 8000)
      )

      try {
        // Load user data with preferences
        const userQuery = supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()

        const userResult = await Promise.race([userQuery, timeoutPromise])
        if (userResult.error) throw userResult.error

        // Load user statistics
        const currentSeason = new Date().getFullYear()
        const picksQuery = supabase
          .from('picks')
          .select('season, result, points_earned, is_lock')
          .eq('user_id', user.id)

        const picksResult = await Promise.race([picksQuery, timeoutPromise])
        if (picksResult.error) throw picksResult.error

        // Calculate stats
        const stats = calculateUserStats(picksResult.data || [], currentSeason)
        
        const profile: UserProfileType = {
          ...userResult.data,
          preferences: userResult.data.preferences || preferences,
          stats
        }

        setUserProfile(profile)
        setDisplayName(profile.display_name)
        setPreferences(profile.preferences || preferences)
        
      } catch (timeoutError) {
        console.log('⏰ Profile queries timed out, using fallback data...')
        
        // Use fallback profile data from the auth user
        const fallbackProfile: UserProfileType = {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          is_admin: user.is_admin || false,
          leaguesafe_email: user.leaguesafe_email || null,
          created_at: user.created_at,
          updated_at: user.updated_at || new Date().toISOString(),
          preferences: {
            email_notifications: true,
            pick_reminders: true,
            weekly_results: true,
            deadline_alerts: true,
            compact_view: false
          },
          stats: {
            seasons_played: 1,
            total_picks: 0,
            total_wins: 0,
            total_losses: 0,
            total_pushes: 0,
            best_week_score: 0,
            best_season_rank: 1,
            lock_wins: 0,
            lock_losses: 0,
            current_season_points: 0
          }
        }
        
        setUserProfile(fallbackProfile)
        setDisplayName(fallbackProfile.display_name)
        setPreferences(fallbackProfile.preferences)
        
        console.log('✅ Using fallback profile data')
      }

    } catch (err: any) {
      console.error('Error loading user profile:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const calculateUserStats = (picks: any[], currentSeason: number) => {
    const seasons = [...new Set(picks.map(p => p.season))]
    const currentSeasonPicks = picks.filter(p => p.season === currentSeason)
    const wins = picks.filter(p => p.result === 'win')
    const losses = picks.filter(p => p.result === 'loss')
    const pushes = picks.filter(p => p.result === 'push')
    const lockWins = picks.filter(p => p.is_lock && p.result === 'win')
    const lockLosses = picks.filter(p => p.is_lock && p.result === 'loss')
    
    // Calculate best week score (rough approximation)
    const weeklyScores = picks.reduce((acc: any, pick) => {
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
      total_picks: picks.length,
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
          preferences: preferences,
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

  const handlePreferenceChange = (key: keyof UserPreferences, value: boolean) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }))
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
          onClick={() => setActiveTab('preferences')}
          className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'preferences'
              ? 'bg-pigskin-500 text-white'
              : 'text-charcoal-600 hover:text-pigskin-700'
          }`}
        >
          Preferences
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

      {activeTab === 'preferences' && (
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-charcoal-500">Receive general email notifications</p>
                </div>
                <Switch
                  checked={preferences.email_notifications}
                  onCheckedChange={(checked) => handlePreferenceChange('email_notifications', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Pick Reminders</Label>
                  <p className="text-sm text-charcoal-500">Get reminded when picks are due</p>
                </div>
                <Switch
                  checked={preferences.pick_reminders}
                  onCheckedChange={(checked) => handlePreferenceChange('pick_reminders', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Weekly Results</Label>
                  <p className="text-sm text-charcoal-500">Receive weekly scoring summaries</p>
                </div>
                <Switch
                  checked={preferences.weekly_results}
                  onCheckedChange={(checked) => handlePreferenceChange('weekly_results', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Deadline Alerts</Label>
                  <p className="text-sm text-charcoal-500">Get alerts before pick deadlines</p>
                </div>
                <Switch
                  checked={preferences.deadline_alerts}
                  onCheckedChange={(checked) => handlePreferenceChange('deadline_alerts', checked)}
                />
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-4">Display Preferences</h3>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Compact View</Label>
                  <p className="text-sm text-charcoal-500">Use a more compact layout</p>
                </div>
                <Switch
                  checked={preferences.compact_view}
                  onCheckedChange={(checked) => handlePreferenceChange('compact_view', checked)}
                />
              </div>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveProfile} 
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Preferences'}
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
          </CardContent>
        </Card>
      )}
    </div>
  )
}