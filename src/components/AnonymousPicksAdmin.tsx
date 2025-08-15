import { useState, useEffect } from 'react'
import { ENV } from '@/lib/env'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

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

interface User {
  id: string
  email: string
  display_name: string
  is_admin: boolean
}

interface AnonymousPicksAdminProps {
  currentWeek: number
  currentSeason: number
}

export default function AnonymousPicksAdmin({ currentWeek, currentSeason }: AnonymousPicksAdminProps) {
  const [anonymousPicks, setAnonymousPicks] = useState<AnonymousPick[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [selectedSeason, setSelectedSeason] = useState(currentSeason)

  useEffect(() => {
    loadData()
  }, [selectedWeek, selectedSeason])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📋 Loading anonymous picks and users...')

      // Load anonymous picks for the selected week/season
      const picksResponse = await fetch(
        `${supabaseUrl}/rest/v1/anonymous_picks?week=eq.${selectedWeek}&season=eq.${selectedSeason}&order=submitted_at.desc`,
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

      setAnonymousPicks(picksData)
      setUsers(usersData)
    } catch (err: any) {
      console.error('❌ Error loading anonymous picks admin data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAssignUser = async (pickId: string, userId: string) => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('👤 Assigning user to anonymous pick...', { pickId, userId })

      const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pickId}`, {
        method: 'PATCH',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          assigned_user_id: userId || null
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to assign user: ${response.status} - ${errorText}`)
      }

      const updatedData = await response.json()
      console.log('✅ User assigned successfully')

      // Update local state
      setAnonymousPicks(prev => 
        prev.map(pick => 
          pick.id === pickId 
            ? { ...pick, assigned_user_id: userId || undefined }
            : pick
        )
      )
    } catch (err: any) {
      console.error('❌ Error assigning user:', err)
      setError(err.message)
    }
  }

  const handleToggleLeaderboard = async (pickId: string, showOnLeaderboard: boolean) => {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      console.log('📊 Toggling leaderboard visibility...', { pickId, showOnLeaderboard })

      const response = await fetch(`${supabaseUrl}/rest/v1/anonymous_picks?id=eq.${pickId}`, {
        method: 'PATCH',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          show_on_leaderboard: showOnLeaderboard
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to update leaderboard visibility: ${response.status} - ${errorText}`)
      }

      console.log('✅ Leaderboard visibility updated')

      // Update local state
      setAnonymousPicks(prev => 
        prev.map(pick => 
          pick.id === pickId 
            ? { ...pick, show_on_leaderboard: showOnLeaderboard }
            : pick
        )
      )
    } catch (err: any) {
      console.error('❌ Error updating leaderboard visibility:', err)
      setError(err.message)
    }
  }

  const handleBulkAssign = async (email: string, userId: string) => {
    const picksToAssign = anonymousPicks.filter(pick => 
      pick.email === email && !pick.assigned_user_id
    )

    if (picksToAssign.length === 0) return

    try {
      setLoading(true)
      
      for (const pick of picksToAssign) {
        await handleAssignUser(pick.id, userId)
      }

      console.log(`✅ Bulk assigned ${picksToAssign.length} picks to user`)
    } catch (err: any) {
      console.error('❌ Error in bulk assignment:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group picks by email for easier management
  const picksByEmail = anonymousPicks.reduce((acc, pick) => {
    if (!acc[pick.email]) {
      acc[pick.email] = []
    }
    acc[pick.email].push(pick)
    return acc
  }, {} as Record<string, AnonymousPick[]>)

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
            Found {anonymousPicks.length} anonymous picks from {Object.keys(picksByEmail).length} unique emails
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

      {/* Anonymous Picks by Email */}
      {Object.entries(picksByEmail).map(([email, picks]) => (
        <Card key={email}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span>{email}</span>
                <div className="flex items-center space-x-2">
                  {picks[0]?.is_validated ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">Validated</Badge>
                  ) : (
                    <Badge variant="secondary">Unvalidated</Badge>
                  )}
                  <Badge variant="outline">{picks.length} picks</Badge>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Select onValueChange={(userId) => handleBulkAssign(email, userId)} className="w-48">
                  <SelectValue placeholder="Bulk assign all picks" />
                  <SelectItem value="">No assignment</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.display_name} ({user.email})
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {picks.map(pick => (
                <div key={pick.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">
                        {pick.away_team} @ {pick.home_team}
                      </div>
                      <div className="text-sm text-charcoal-600">
                        Pick: <span className="font-medium">{pick.selected_team}</span>
                        {pick.is_lock && <Badge className="ml-2 bg-gold-500">LOCK</Badge>}
                      </div>
                      <div className="text-xs text-charcoal-500 mt-1">
                        Submitted: {new Date(pick.submitted_at).toLocaleString()}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      {/* User Assignment */}
                      <div className="w-48">
                        <Select 
                          value={pick.assigned_user_id || ""} 
                          onValueChange={(userId) => handleAssignUser(pick.id, userId)}
                          className="w-full"
                        >
                          <SelectValue placeholder="Assign to user" />
                          <SelectItem value="">No assignment</SelectItem>
                          {users.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.display_name}
                            </SelectItem>
                          ))}
                        </Select>
                      </div>

                      {/* Leaderboard Toggle */}
                      <Button
                        variant={pick.show_on_leaderboard ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleToggleLeaderboard(pick.id, !pick.show_on_leaderboard)}
                      >
                        {pick.show_on_leaderboard ? "📊 On Leaderboard" : "📊 Hidden"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {anonymousPicks.length === 0 && !loading && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-4xl mb-4">📭</div>
            <h3 className="text-lg font-semibold mb-2">No Anonymous Picks Found</h3>
            <p className="text-charcoal-600">
              No anonymous picks found for Week {selectedWeek}, {selectedSeason}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}