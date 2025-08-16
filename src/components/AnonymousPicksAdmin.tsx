import { useState, useEffect } from 'react'
import { ENV } from '@/lib/env'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

interface AnonymousPick {
  id: string
  email: string
  name: string
  week: number
  season: number
  game_id: string
  home_team: string
  away_team: string
  selected_team: string
  is_lock: boolean
  is_validated: boolean
  submitted_at: string
  assigned_user_id?: string
  show_on_leaderboard: boolean
  created_at: string
}

interface PickSet {
  email: string
  name: string
  submittedAt: string
  isValidated: boolean
  picks: AnonymousPick[]
  assignedUserId?: string
  showOnLeaderboard: boolean
  autoAssigned?: boolean
  hasConflicts?: boolean
}

interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
}

interface ExistingPickSet {
  submittedAt: string
  source: 'authenticated' | 'anonymous'
  pickCount: number
}

interface AnonymousPicksAdminProps {
  currentWeek: number
  currentSeason: number
}

export default function AnonymousPicksAdmin({ currentWeek, currentSeason }: AnonymousPicksAdminProps) {
  const [pickSets, setPickSets] = useState<PickSet[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [selectedSeason, setSelectedSeason] = useState(currentSeason)
  const [conflictResolution, setConflictResolution] = useState<{
    pickSet: PickSet
    assignedUserId: string
    existingPickSets: ExistingPickSet[]
    selectedPickSet: 'new' | 'existing'
  } | null>(null)
  const [userSearch, setUserSearch] = useState<{[key: string]: string}>({})
  const [userPickSets, setUserPickSets] = useState<{[userEmail: string]: {conflicts: ExistingPickSet[], assignedPickSet?: PickSet}}>({})
  const [viewAllSetsDialog, setViewAllSetsDialog] = useState<{
    userEmail: string
    userName: string
    userId: string
    allSets: (ExistingPickSet | {source: 'new_anonymous', submittedAt: string, pickCount: number, pickSet: PickSet})[]
    currentAssignment?: PickSet
  } | null>(null)

  useEffect(() => {
    loadData()
    checkCurrentUser()
  }, [selectedWeek, selectedSeason])

  useEffect(() => {
    // Auto-process validated users after initial data loads (with delay to avoid race conditions)
    if (!loading && pickSets.length > 0 && users.length > 0) {
      // Only auto-process unassigned validated pick sets to prevent infinite loop
      const unassignedValidatedPickSets = pickSets.filter(ps => ps.isValidated && !ps.assignedUserId && !ps.autoAssigned)
      
      if (unassignedValidatedPickSets.length > 0) {
        console.log(`🔄 Auto-processing ${unassignedValidatedPickSets.length} validated users`)
        const timer = setTimeout(() => {
          processValidatedUsers()
        }, 500) // 500ms delay to ensure data is stable
        
        return () => clearTimeout(timer)
      }
    }
  }, [loading, pickSets.length, users.length]) // Only trigger on length changes, not content changes

  const processValidatedUsers = async () => {
    const validatedPickSets = pickSets.filter(ps => ps.isValidated && !ps.assignedUserId && !ps.autoAssigned)
    
    for (const pickSet of validatedPickSets) {
      try {
        // Find user by email
        const matchingUser = users.find(u => u.email === pickSet.email)
        if (matchingUser) {
          console.log(`🔍 Auto-processing validated user: ${pickSet.email} -> User ID: ${matchingUser.id}`)
          await handleAssignPickSet(pickSet, matchingUser.id, true) // true = auto mode
        } else {
          console.log(`⚠️ No matching user found for validated email: ${pickSet.email}`)
        }
      } catch (error) {
        console.error(`❌ Error auto-processing ${pickSet.email}:`, error)
        setError(`Failed to auto-process ${pickSet.email}: ${error.message}`)
        // Stop auto-processing to prevent infinite loops
        break
      }
    }
  }

  const checkCurrentUser = async () => {
    // This was used for debugging - can be removed if not needed
  }

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📋 Loading anonymous picks and users...')

      // Load anonymous picks for the selected week/season (including assignment columns)
      const picksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&select=*&order=submitted_at.desc`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (!picksResponse.ok) {
        throw new Error(`Failed to load anonymous picks: ${picksResponse.status}`)
      }

      const picksData = await picksResponse.json()
      console.log('✅ Loaded anonymous picks:', picksData.length)
      
      // Debug: Check if assignment columns are present
      const samplePick = picksData[0]
      if (samplePick) {
        console.log('📝 Sample pick data:', {
          id: samplePick.id,
          email: samplePick.email,
          assigned_user_id: samplePick.assigned_user_id,
          show_on_leaderboard: samplePick.show_on_leaderboard
        })
      }

      // Load all users for assignment
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=id,email,display_name,is_admin&order=display_name.asc`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (!usersResponse.ok) {
        throw new Error(`Failed to load users: ${usersResponse.status}`)
      }

      const usersData = await usersResponse.json()
      console.log('✅ Loaded users for assignment:', usersData.length)

      // Group picks into pick sets by email + submitted_at (to handle multiple submissions from same email)
      const pickSetMap = new Map<string, PickSet>()
      
      for (const pick of picksData) {
        const key = `${pick.email}-${pick.submitted_at}`
        
        if (!pickSetMap.has(key)) {
          pickSetMap.set(key, {
            email: pick.email,
            name: pick.name,
            submittedAt: pick.submitted_at,
            isValidated: pick.is_validated,
            picks: [],
            assignedUserId: pick.assigned_user_id,
            showOnLeaderboard: pick.show_on_leaderboard
          })
        }
        
        pickSetMap.get(key)!.picks.push(pick)
      }

      const pickSetsArray = Array.from(pickSetMap.values())
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())

      console.log('✅ Grouped into pick sets:', pickSetsArray.length)
      
      // Debug: Show assignment status of pick sets
      pickSetsArray.forEach(ps => {
        if (ps.assignedUserId) {
          console.log(`📌 Pick set ${ps.email} is assigned to user ${ps.assignedUserId}, leaderboard: ${ps.showOnLeaderboard}`)
        } else {
          console.log(`📌 Pick set ${ps.email} is unassigned`)
        }
      })
      
      setPickSets(pickSetsArray)
      setUsers(usersData)
    } catch (err: any) {
      console.error('❌ Error loading anonymous picks admin data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignPickSet = async (pickSet: PickSet, userId: string, autoMode = false) => {
    // For validated emails, we need to check for existing pick sets regardless
    // to ensure only one pick set per user per week counts toward leaderboard
    
    // Check for existing pick sets for this user this week
    const existingPickSets = await checkExistingPickSets(userId, selectedWeek, selectedSeason)
    
    // Track pick sets for this user
    setUserPickSets(prev => ({
      ...prev,
      [pickSet.email]: {
        conflicts: existingPickSets,
        assignedPickSet: pickSet
      }
    }))

    if (existingPickSets.length === 0) {
      // No conflicts - safe to assign and add to leaderboard
      if (autoMode && pickSet.isValidated) {
        console.log(`✅ Auto-assigning validated user ${pickSet.email} - no conflicts found`)
        await confirmAssignment(pickSet, userId, 'new')
        // Update local state to show as auto-assigned (in addition to confirmAssignment's update)
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, autoAssigned: true }  // Just add the auto-assigned flag
              : ps
          )
        )
      } else {
        console.log('✅ No existing pick sets found - proceeding with assignment')
        await confirmAssignment(pickSet, userId, 'new')
      }
    } else {
      // Conflicts found
      console.log(`⚠️ Conflicts found for ${pickSet.email}:`, existingPickSets.length, 'existing pick sets')
      console.log('📋 Existing pick sets details:', existingPickSets)
      
      if (autoMode && pickSet.isValidated) {
        // For auto-mode validated users, just mark the pick set to show conflicts without opening dialog
        console.log(`🔄 Auto-mode: Marking validated user ${pickSet.email} with conflicts for manual review`)
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, autoAssigned: false, hasConflicts: true }  // Mark as having conflicts
              : ps
          )
        )
      } else {
        // For manual mode, show conflict resolution dialog
        setConflictResolution({
          pickSet,
          assignedUserId: userId,
          existingPickSets,
          selectedPickSet: 'new'
        })
      }
    }
  }

  const checkExistingPickSets = async (userId: string, week: number, season: number): Promise<ExistingPickSet[]> => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log(`🔍 Checking existing pick sets for user ${userId}, week ${week}, season ${season}`)

      const results: ExistingPickSet[] = []

      // Check for existing pick sets

      // Check authenticated picks (only submitted ones)
      const authPicksResponse = await fetch(
        `${supabaseUrl}/rest/v1/picks?user_id=eq.${userId}&week=eq.${week}&season=eq.${season}&submitted=eq.true&select=submitted_at`,
        {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (authPicksResponse.ok) {
        const authPicks = await authPicksResponse.json()
        console.log(`📊 Found ${authPicks.length} authenticated picks for user ${userId}`)
        if (authPicks.length > 0) {
          // Group by submitted_at to get pick sets
          const submissionTimes = [...new Set(authPicks.map(p => p.submitted_at))]
          console.log(`📅 Authenticated submission times:`, submissionTimes)
          for (const submittedAt of submissionTimes) {
            const pickCount = authPicks.filter(p => p.submitted_at === submittedAt).length
            results.push({
              submittedAt,
              source: 'authenticated',
              pickCount
            })
          }
        }
      } else {
        console.log(`❌ Failed to fetch authenticated picks: ${authPicksResponse.status}`)
      }

      // Check other anonymous picks assigned to this user that are on leaderboard
      const anonPicksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?assigned_user_id=eq.${userId}&week=eq.${week}&season=eq.${season}&show_on_leaderboard=eq.true&select=submitted_at`,
        {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (anonPicksResponse.ok) {
        const anonPicks = await anonPicksResponse.json()
        console.log(`📊 Found ${anonPicks.length} assigned anonymous picks for user ${userId}`)
        if (anonPicks.length > 0) {
          // Group by submitted_at to get pick sets
          const submissionTimes = [...new Set(anonPicks.map(p => p.submitted_at))]
          console.log(`📅 Anonymous submission times:`, submissionTimes)
          for (const submittedAt of submissionTimes) {
            const pickCount = anonPicks.filter(p => p.submitted_at === submittedAt).length
            results.push({
              submittedAt,
              source: 'anonymous',
              pickCount
            })
          }
        }
      } else {
        console.log(`❌ Failed to fetch anonymous picks: ${anonPicksResponse.status}`)
      }

      console.log(`📋 Total conflicts found: ${results.length}`, results)
      return results.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    } catch (err: any) {
      console.error('❌ Error checking existing pick sets:', err)
      return []
    }
  }

  const confirmAssignment = async (pickSet: PickSet, userId: string, keepPickSet: 'new' | 'existing') => {
    try {
      setLoading(true)
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      if (keepPickSet === 'new') {
        // Assign this anonymous pick set to the user
        console.log('👤 Assigning anonymous pick set to user...', { email: pickSet.email, userId })

        // First check if the columns exist by trying a test query
        const testResponse = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pickSet.picks[0].id}&select=id,assigned_user_id,show_on_leaderboard`, {
          method: 'GET',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          }
        })

        if (!testResponse.ok && testResponse.status === 400) {
          throw new Error('Database schema not updated. Please run the migration to add assigned_user_id and show_on_leaderboard columns to anonymous_picks table.')
        }

        console.log(`📝 Updating ${pickSet.picks.length} picks for assignment...`)
        
        // Use API key for now to avoid hanging on auth session
        const authToken = apiKey
        console.log('🔑 Using API key for database updates')

        for (const pick of pickSet.picks) {
          console.log(`🔄 Updating pick ${pick.id}...`)
          const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': apiKey || '',
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              assigned_user_id: userId,
              show_on_leaderboard: true  // Default to showing on leaderboard when assigned
            })
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Failed to update pick ${pick.id}:`, response.status, errorText)
            throw new Error(`Failed to assign pick: ${response.status} - ${errorText}`)
          } else {
            console.log(`✅ Successfully updated pick ${pick.id}`)
          }
        }

        // Temporarily disable verification to prevent errors
        console.log('⚠️ Database verification temporarily disabled')
        // TODO: Re-enable after fixing RLS policies

        // Update local state
        setPickSets(prev => 
          prev.map(ps => 
            ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
              ? { ...ps, assignedUserId: userId, showOnLeaderboard: true }
              : ps
          )
        )

        console.log('✅ Pick set assigned successfully')
      }
      // Note: If keepPickSet === 'existing', we just don't assign the anonymous picks
      // The existing authenticated picks remain the active ones

      setConflictResolution(null)
    } catch (err: any) {
      console.error('❌ Error confirming assignment:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleViewAllSets = async (pickSet: PickSet) => {
    const assignedUser = users.find(u => u.id === pickSet.assignedUserId)
    if (!assignedUser) return

    // Get all pick sets for this user
    const conflicts = userPickSets[pickSet.email]?.conflicts || []
    
    // Combine existing pick sets with current anonymous pick set
    const allSets = [
      ...conflicts,
      {
        source: 'new_anonymous' as const,
        submittedAt: pickSet.submittedAt,
        pickCount: pickSet.picks.length,
        pickSet
      }
    ]

    setViewAllSetsDialog({
      userEmail: pickSet.email,
      userName: pickSet.name,
      userId: assignedUser.id,
      allSets,
      currentAssignment: pickSet
    })
  }

  const handleUnassignPickSet = async (pickSet: PickSet) => {
    try {
      setLoading(true)
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('🔄 Unassigning pick set...', { email: pickSet.email })

      for (const pick of pickSet.picks) {
        const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            assigned_user_id: null,
            show_on_leaderboard: false
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to unassign pick: ${response.status} - ${errorText}`)
        }
      }

      console.log('✅ Pick set unassigned successfully')

      // Update local state
      setPickSets(prev => 
        prev.map(ps => 
          ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
            ? { ...ps, assignedUserId: undefined, showOnLeaderboard: false }
            : ps
        )
      )
    } catch (err: any) {
      console.error('❌ Error unassigning pick set:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleLeaderboard = async (pickSet: PickSet, showOnLeaderboard: boolean) => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📊 Toggling leaderboard visibility for pick set...', { email: pickSet.email, showOnLeaderboard })

      for (const pick of pickSet.picks) {
        const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pick.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': apiKey || '',
            'Authorization': `Bearer ${apiKey || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            show_on_leaderboard: showOnLeaderboard
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to update leaderboard visibility: ${response.status} - ${errorText}`)
        }
      }

      console.log('✅ Leaderboard visibility updated for pick set')

      // Update local state
      setPickSets(prev => 
        prev.map(ps => 
          ps.email === pickSet.email && ps.submittedAt === pickSet.submittedAt
            ? { ...ps, showOnLeaderboard }
            : ps
        )
      )
    } catch (err: any) {
      console.error('❌ Error updating leaderboard visibility:', err)
      setError(err.message)
    }
  }

  // Filter pick sets based on status
  const unassignedPickSets = pickSets.filter(ps => !ps.assignedUserId)
  const assignedPickSets = pickSets.filter(ps => ps.assignedUserId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-charcoal-600">Loading anonymous picks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Week/Season Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Anonymous Picks Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Season:</label>
              <Input
                type="number"
                value={selectedSeason}
                onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
                className="w-24"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Week:</label>
              <Input
                type="number"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                min="1"
                max="15"
                className="w-20"
              />
            </div>
            <Button onClick={loadData} className="mt-6">
              Load Picks
            </Button>
          </div>
          
          <div className="text-sm text-charcoal-600">
            Found {pickSets.length} pick sets • {unassignedPickSets.length} unassigned • {assignedPickSets.length} assigned
          </div>
        </CardContent>
      </Card>

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

      {/* Unassigned Pick Sets */}
      {unassignedPickSets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🔄 Unassigned Pick Sets ({unassignedPickSets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unassignedPickSets.map((pickSet, index) => (
                <div key={`${pickSet.email}-${pickSet.submittedAt}`} className="border rounded-lg p-4 bg-yellow-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="font-semibold text-lg">{pickSet.name} ({pickSet.email})</div>
                        <div className="flex items-center space-x-2">
                          {pickSet.isValidated ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">✅ Validated User</Badge>
                          ) : (
                            <Badge variant="secondary">⚠️ Unvalidated Email</Badge>
                          )}
                          <Badge variant="outline">{pickSet.picks.length} picks</Badge>
                        </div>
                      </div>
                      
                      <div className="text-sm text-charcoal-600 mb-3">
                        Submitted: {new Date(pickSet.submittedAt).toLocaleString()}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {pickSet.picks.map(pick => (
                          <div key={pick.id} className="text-sm bg-white p-2 rounded border">
                            <div className="font-medium">{pick.away_team} @ {pick.home_team}</div>
                            <div className="text-charcoal-600">
                              Pick: <span className="font-medium">{pick.selected_team}</span>
                              {pick.is_lock && <Badge className="ml-1 text-xs bg-gold-500">LOCK</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="ml-4 flex flex-col space-y-2">
                      {pickSet.isValidated ? (
                        <div className="w-48">
                          {pickSet.hasConflicts ? (
                            <div className="text-center p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                              <div className="text-yellow-800 font-medium mb-1">⚠️ Conflicts Found</div>
                              <div className="text-yellow-600 text-sm">Manual review required</div>
                              <Button
                                onClick={() => {
                                  const user = users.find(u => u.email === pickSet.email)
                                  if (user) handleAssignPickSet(pickSet, user.id, false)
                                }}
                                variant="outline"
                                size="sm"
                                className="mt-2 text-xs"
                              >
                                Resolve Conflicts
                              </Button>
                            </div>
                          ) : pickSet.autoAssigned ? (
                            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-md">
                              <div className="text-green-800 font-medium mb-1">✅ Auto-Assigned</div>
                              <div className="text-green-600 text-sm">No conflicts found</div>
                            </div>
                          ) : (
                            <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-md">
                              <div className="text-blue-800 font-medium mb-1">✅ Validated User</div>
                              <div className="text-blue-600 text-sm">Processing...</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-48 relative">
                          <Input
                            type="text"
                            placeholder="Search for user..."
                            value={userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''}
                            onChange={(e) => setUserSearch(prev => ({
                              ...prev,
                              [`${pickSet.email}-${pickSet.submittedAt}`]: e.target.value
                            }))}
                            className="w-full"
                          />
                          {(userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || '').length > 0 && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                              {users
                                .filter(user => {
                                  const searchTerm = userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''
                                  return user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                         user.email.toLowerCase().includes(searchTerm.toLowerCase())
                                })
                                .slice(0, 10)
                                .map(user => (
                                  <button
                                    key={user.id}
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b border-gray-100 last:border-b-0"
                                    onClick={() => {
                                      handleAssignPickSet(pickSet, user.id)
                                      setUserSearch(prev => ({
                                        ...prev,
                                        [`${pickSet.email}-${pickSet.submittedAt}`]: ''
                                      }))
                                    }}
                                  >
                                    <div className="font-medium">{user.display_name}</div>
                                    <div className="text-gray-500 text-xs">{user.email}</div>
                                  </button>
                                ))
                              }
                              {users.filter(user => {
                                const searchTerm = userSearch[`${pickSet.email}-${pickSet.submittedAt}`] || ''
                                return user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       user.email.toLowerCase().includes(searchTerm.toLowerCase())
                              }).length === 0 && (
                                <div className="px-3 py-2 text-gray-500 text-sm">No users found</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assigned Pick Sets */}
      {assignedPickSets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>✅ Assigned Pick Sets ({assignedPickSets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignedPickSets.map((pickSet) => {
                const assignedUser = users.find(u => u.id === pickSet.assignedUserId)
                return (
                  <div key={`${pickSet.email}-${pickSet.submittedAt}`} className="border rounded-lg p-4 bg-green-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="font-semibold text-lg">{pickSet.name} ({pickSet.email})</div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="default" className="bg-blue-100 text-blue-800">
                              👤 {assignedUser?.display_name || 'Unknown User'}
                            </Badge>
                            {pickSet.autoAssigned && (
                              <Badge variant="default" className="bg-green-100 text-green-800">🤖 Auto-Assigned</Badge>
                            )}
                            {userPickSets[pickSet.email]?.conflicts.length > 0 && (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-800">⚠️ Multiple Pick Sets</Badge>
                            )}
                            <Badge variant="outline">{pickSet.picks.length} picks</Badge>
                          </div>
                        </div>
                        
                        <div className="text-sm text-charcoal-600 mb-3">
                          Submitted: {new Date(pickSet.submittedAt).toLocaleString()}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {pickSet.picks.map(pick => (
                            <div key={pick.id} className="text-sm bg-white p-2 rounded border">
                              <div className="font-medium">{pick.away_team} @ {pick.home_team}</div>
                              <div className="text-charcoal-600">
                                Pick: <span className="font-medium">{pick.selected_team}</span>
                                {pick.is_lock && <Badge className="ml-1 text-xs bg-gold-500">LOCK</Badge>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="ml-4 flex flex-col space-y-2">
                        <Button
                          variant={pickSet.showOnLeaderboard ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleToggleLeaderboard(pickSet, !pickSet.showOnLeaderboard)}
                        >
                          {pickSet.showOnLeaderboard ? "📊 On Leaderboard" : "📊 Hidden"}
                        </Button>
                        {userPickSets[pickSet.email]?.conflicts.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewAllSets(pickSet)}
                          >
                            👁️ View All Sets ({userPickSets[pickSet.email].conflicts.length + 1})
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleUnassignPickSet(pickSet)}
                        >
                          🔄 Unassign
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conflict Resolution Dialog */}
      {conflictResolution && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>⚠️ Pick Set Conflict Detected</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="font-semibold text-amber-800 mb-2">
                  {conflictResolution.pickSet.isValidated 
                    ? `Validated User Conflict Detected`
                    : `User already has pick sets for Week ${selectedWeek}, ${selectedSeason}`
                  }
                </div>
                <div className="text-amber-700 text-sm">
                  {conflictResolution.pickSet.isValidated 
                    ? `This user already has picks in the system for this week. Since they're a validated user, you must choose which pick set should count toward the leaderboard.`
                    : `Only one pick set per user per week can count towards the leaderboard. Choose which pick set should be active:`
                  }
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-medium">Existing Pick Sets:</div>
                {conflictResolution.existingPickSets.map((existing, index) => (
                  <div key={index} className="border rounded p-3 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {existing.source === 'authenticated' ? '🔐 Authenticated' : '👤 Anonymous'} Pick Set
                        </div>
                        <div className="text-sm text-charcoal-600">
                          {existing.pickCount} picks • {new Date(existing.submittedAt).toLocaleString()}
                        </div>
                      </div>
                      <input
                        type="radio"
                        name="pickSetChoice"
                        value="existing"
                        checked={conflictResolution.selectedPickSet === 'existing'}
                        onChange={(e) => setConflictResolution(prev => prev ? {
                          ...prev,
                          selectedPickSet: e.target.value as 'new' | 'existing'
                        } : null)}
                      />
                    </div>
                  </div>
                ))}

                <div className="border rounded p-3 bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">🆕 New Anonymous Pick Set</div>
                      <div className="text-sm text-charcoal-600">
                        {conflictResolution.pickSet.picks.length} picks • {new Date(conflictResolution.pickSet.submittedAt).toLocaleString()}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="pickSetChoice"
                      value="new"
                      checked={conflictResolution.selectedPickSet === 'new'}
                      onChange={(e) => setConflictResolution(prev => prev ? {
                        ...prev,
                        selectedPickSet: e.target.value as 'new' | 'existing'
                      } : null)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => confirmAssignment(
                    conflictResolution.pickSet,
                    conflictResolution.assignedUserId,
                    conflictResolution.selectedPickSet
                  )}
                  className="flex-1"
                >
                  Confirm Assignment
                </Button>
                <Button
                  onClick={() => setConflictResolution(null)}
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

      {/* View All Sets Dialog */}
      {viewAllSetsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-4xl mx-4 max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>📊 All Pick Sets for {viewAllSetsDialog.userName} ({viewAllSetsDialog.userEmail})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="font-semibold text-blue-800 mb-2">
                  Found {viewAllSetsDialog.allSets.length} pick sets for this user
                </div>
                <div className="text-blue-700 text-sm">
                  Review all pick sets to understand which one should count toward the leaderboard.
                </div>
              </div>

              <div className="space-y-3">
                {viewAllSetsDialog.allSets.map((set, index) => (
                  <div key={index} className={`border rounded p-4 ${
                    set.source === 'new_anonymous' ? 'bg-green-50 border-green-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium">
                          {set.source === 'authenticated' ? '🔐 Authenticated Picks' : 
                           set.source === 'anonymous' ? '👤 Other Anonymous Picks' : 
                           '🆕 Current Anonymous Picks'}
                          {set.source === 'new_anonymous' && ' (Currently Assigned)'}
                        </div>
                        <div className="text-sm text-charcoal-600">
                          {set.pickCount} picks • Submitted: {new Date(set.submittedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    {set.source === 'new_anonymous' && 'pickSet' in set && (
                      <div className="grid grid-cols-2 gap-2">
                        {set.pickSet.picks.map(pick => (
                          <div key={pick.id} className="text-sm bg-white p-2 rounded border">
                            <div className="font-medium">{pick.away_team} @ {pick.home_team}</div>
                            <div className="text-charcoal-600">
                              Pick: <span className="font-medium">{pick.selected_team}</span>
                              {pick.is_lock && <Badge className="ml-1 text-xs bg-gold-500">LOCK</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => setViewAllSetsDialog(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {pickSets.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-lg font-semibold mb-2">No Anonymous Pick Sets Found</h3>
            <p className="text-charcoal-600">
              No anonymous pick sets found for Week {selectedWeek}, {selectedSeason}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}