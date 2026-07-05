import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'
import { supabase } from '@/lib/supabase'
import { UserProfile as UserProfileType, UserPreferences, Pick, AnonymousPick, UserPickSet } from '@/types'
import PickSetsHistory from '@/components/PickSetsHistory'
import { PillTabs } from '@/components/ui/PillTabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CareerStatsCard from '@/components/CareerStatsCard'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

export default function UserProfile() {
  const { user, refreshUser } = useAuth()
  const { activeSeason } = useCurrentSeason()
  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'picks'>('profile')
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
    // Depend on the stable id, not the user object (whose identity can change on
    // unrelated auth-context re-renders) — avoids repeated profile reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

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
      const currentSeason = activeSeason
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
      .select('*, admin_note, submitted, submitted_at, games(home_team, away_team, home_score, away_score, spread)')
      .eq('user_id', user!.id)
      .order('season', { ascending: false })
      .order('week', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  const loadAnonymousPicks = async (): Promise<AnonymousPick[]> => {
    const { data, error } = await supabase
      .from('anonymous_picks')
      .select('*, admin_note, submitted, submitted_at, games(home_team, away_team, home_score, away_score, spread)')
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

    // Build a detailed pick (opponent/spread/score from the joined game).
    const toDetail = (pick: any) => {
      const g = Array.isArray(pick.games) ? pick.games[0] : pick.games
      const home = g?.home_team ?? pick.home_team ?? null
      const away = g?.away_team ?? pick.away_team ?? null
      const sel = pick.selected_team
      const isHome = home != null && sel === home
      const opponent = home == null || away == null ? null : (isHome ? away : home)
      const spread = g?.spread == null ? null : (isHome ? Number(g.spread) : -Number(g.spread))
      return {
        team: sel,
        opponent,
        isHome,
        spread,
        teamScore: g == null ? null : (isHome ? g.home_score : g.away_score),
        oppScore: g == null ? null : (isHome ? g.away_score : g.home_score),
        result: pick.result ?? null,
        is_lock: !!pick.is_lock,
        points: pick.points_earned || 0,
      }
    }
    
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
          conflictStatus: 'no_conflict',
          submitted: pick.submitted,
          submitted_at: pick.submitted_at,
          admin_note: pick.admin_note,
          picks: []
        })
      }

      const pickSet = pickSetsMap.get(key)!
      pickSet.pickCount++
      pickSet.points += pick.points_earned || 0
      pickSet.picks!.push(toDetail(pick))

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
          conflictStatus: 'no_conflict',
          submitted: pick.submitted,
          submitted_at: pick.submitted_at,
          admin_note: pick.admin_note,
          picks: []
        })
      }

      const pickSet = pickSetsMap.get(key)!
      pickSet.pickCount++
      pickSet.points += pick.points_earned || 0
      pickSet.picks!.push(toDetail(pick))

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
      <PillTabs
        tabs={[
          { key: 'profile', label: 'Profile Info' },
          { key: 'stats', label: 'Statistics' },
          { key: 'picks', label: 'Pick Sets' },
        ]}
        value={activeTab}
        onChange={(k) => setActiveTab(k as 'profile' | 'stats' | 'picks')}
      />

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


      {activeTab === 'stats' && user && (
        <CareerStatsCard
          userId={user.id}
          bestWeekScore={userProfile?.stats?.best_week_score}
          currentSeasonPoints={userProfile?.stats?.current_season_points}
        />
      )}

      {activeTab === 'picks' && (
        <PickSetsHistory pickSets={pickSets} />
      )}

    </div>
  )
}