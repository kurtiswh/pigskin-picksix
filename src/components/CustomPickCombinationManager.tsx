import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/hooks/useAuth'
import { 
  AlertTriangle, Check, Clock, User, Trophy, Calendar, MapPin, 
  Target, Lock, Unlock, Eye, EyeOff, Shuffle, Save
} from 'lucide-react'

interface PickWithGame {
  pick_id: string
  selected_team: string
  original_is_lock: boolean
  combination_is_lock: boolean
  show_in_combination: boolean
  points_earned: number
  result: string
  source_email?: string
  submitted_at?: string
  game: {
    id: string
    home_team: string
    away_team: string
    spread: number
    home_score: number | null
    away_score: number | null
    status: string
    game_time: string
  }
}

interface UserPickComparison {
  user_id: string
  display_name: string
  season: number
  week: number
  has_custom_combination: boolean
  combination_info?: any
  authenticated_picks: PickWithGame[]
  anonymous_picks: PickWithGame[]
}

interface SelectedPick {
  pick_id: string
  source: 'authenticated' | 'anonymous'
  selected_team: string
  game_info: string
  is_lock: boolean
}

export default function CustomPickCombinationManager() {
  const { user } = useAuth()
  const [selectedSeason, setSelectedSeason] = useState<number>(2025)
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [availableUsers, setAvailableUsers] = useState<{id: string, display_name: string}[]>([])
  const [userComparison, setUserComparison] = useState<UserPickComparison | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Selection state
  const [selectedPicks, setSelectedPicks] = useState<SelectedPick[]>([])
  const [reasoning, setReasoning] = useState('')
  const [message, setMessage] = useState('')

  const loadAvailableUsers = async () => {
    try {
      console.log('Loading available users for season:', selectedSeason)
      
      // First try to load from the admin view
      let { data, error } = await supabase
        .from('user_pick_sets_admin_view')
        .select('user_id, display_name')
        .eq('season', selectedSeason)
      
      if (error) {
        console.log('Admin view failed, trying basic users table:', error)
        // Fallback to basic users table
        const result = await supabase
          .from('users')
          .select('id, display_name')
          .limit(50)
          
        if (result.error) throw result.error
        data = result.data?.map(user => ({ user_id: user.id, display_name: user.display_name }))
      }
      
      console.log('Raw user data:', data)
      
      const uniqueUsers = Array.from(
        new Map(data?.map(user => [user.user_id, { id: user.user_id, display_name: user.display_name }]) || [])
        .values()
      )
      
      console.log('Unique users processed:', uniqueUsers)
      setAvailableUsers(uniqueUsers)
    } catch (error) {
      console.error('Failed to load users:', error)
      setAvailableUsers([])
    }
  }

  const loadUserComparison = async () => {
    if (!selectedUser || !selectedWeek) {
      console.log('Missing data - User:', selectedUser, 'Week:', selectedWeek)
      return
    }
    
    console.log('Loading user comparison for:', selectedUser, 'Week:', selectedWeek, 'Season:', selectedSeason)
    setLoading(true)
    setMessage('')
    
    try {
      // Try the custom combination function first, fallback to comparison function
      let data, error
      
      console.log('Attempting to load custom combination...')
      try {
        const result = await supabase.rpc('get_custom_pick_combination', {
          target_user_id: selectedUser,
          target_season: selectedSeason,
          target_week: parseInt(selectedWeek)
        })
        data = result.data
        error = result.error
        console.log('Custom combination result:', { data, error })
        
        // If custom function worked but found no combination, try comparison function
        if (data && !data.has_custom_combination) {
          console.log('No custom combination found, trying comparison function for raw picks...')
          throw new Error('No custom combination, trying fallback')
        }
      } catch (customError) {
        console.log('Using comparison function. Reason:', customError.message)
        
        // Fallback to existing comparison function
        const result = await supabase.rpc('get_all_pick_sets_for_comparison', {
          target_user_id: selectedUser,
          target_season: selectedSeason,
          target_week: parseInt(selectedWeek)
        })
        
        console.log('Comparison function result:', result)
        if (result.error) throw result.error
        
        // Transform comparison data to custom format
        if (result.data && result.data[0] && result.data[0].pick_set_comparison) {
          const comparison = result.data[0].pick_set_comparison
          console.log('Raw comparison data:', comparison)
          console.log('Comparison data type:', typeof comparison)
          console.log('Is array:', Array.isArray(comparison))
          
          data = {
            has_custom_combination: false,
            combination_info: null,
            authenticated_picks: [],
            anonymous_picks: []
          }
          
          // Extract picks from comparison format
          comparison.forEach((pickSet: any) => {
            if (pickSet.pick_set_type === 'authenticated') {
              // Append to authenticated picks instead of overwriting
              const authPicks = pickSet.picks?.map((pick: any) => ({
                pick_id: pick.id || pick.pick_id || `auth-${pick.game?.id || Math.random()}`, // Ensure we have a valid ID
                selected_team: pick.selected_team,
                original_is_lock: pick.is_lock,
                combination_is_lock: pick.is_lock,
                show_in_combination: false,
                points_earned: pick.points_earned || 0,
                result: pick.result || 'pending',
                submitted_at: pickSet.submitted_at,
                game: pick.game
              })) || []
              console.log('Processed auth picks:', authPicks)
              data.authenticated_picks = [...(data.authenticated_picks || []), ...authPicks]
            } else {
              // Append anonymous picks with proper source identification
              const anonPicks = pickSet.picks?.map((pick: any) => ({
                pick_id: pick.id || pick.pick_id || `anon-${pick.game?.id || Math.random()}-${pickSet.source}`, // Ensure we have a valid ID
                selected_team: pick.selected_team,
                original_is_lock: pick.is_lock,
                combination_is_lock: pick.is_lock,
                show_in_combination: false,
                points_earned: pick.points_earned || 0,
                result: pick.result || 'pending',
                source_email: pickSet.source,
                submitted_at: pickSet.submitted_at,
                game: pick.game
              })) || []
              console.log('Processed anon picks:', anonPicks)
              data.anonymous_picks = [...(data.anonymous_picks || []), ...anonPicks]
            }
          })
        } else {
          throw new Error('No pick data found for this user and week')
        }
      }

      if (error) {
        console.error('Database query error:', error)
        throw error
      }
      
      console.log('Raw data received:', data)
      
      // Transform the data to match our interface
      const userComparison: UserPickComparison = {
        user_id: selectedUser,
        display_name: 'Loading...', // Will be set from picks data
        season: selectedSeason,
        week: parseInt(selectedWeek),
        has_custom_combination: data.has_custom_combination,
        combination_info: data.combination_info,
        authenticated_picks: data.authenticated_picks || [],
        anonymous_picks: data.anonymous_picks || []
      }

      // Set display name from first available pick
      if (userComparison.authenticated_picks.length > 0) {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', selectedUser)
          .single()
        if (userData) userComparison.display_name = userData.display_name
      }

      setUserComparison(userComparison)
      
      // Clear any existing selections first
      setSelectedPicks([])
      
      // Initialize selection from existing combination
      if (data.has_custom_combination && data.combination_info) {
        console.log('Combination info:', data.combination_info)
        console.log('Selected picks summary raw:', data.combination_info.selected_picks_summary)
        
        let existingSelections = []
        try {
          const summaryData = data.combination_info.selected_picks_summary
          console.log('Summary data type:', typeof summaryData)
          console.log('Summary data value:', summaryData)
          
          if (typeof summaryData === 'string') {
            try {
              existingSelections = JSON.parse(summaryData || '[]')
            } catch (jsonError) {
              console.error('JSON parse failed on string:', summaryData, jsonError)
              existingSelections = []
            }
          } else if (Array.isArray(summaryData)) {
            existingSelections = summaryData
          } else if (typeof summaryData === 'object' && summaryData !== null) {
            // If it's already an object, try to use it directly if it has the right structure
            console.log('Summary data is object, attempting direct use')
            if (Array.isArray(summaryData)) {
              existingSelections = summaryData
            } else {
              // Maybe it's an object that needs to be converted to array format
              existingSelections = []
            }
          } else {
            console.log('Unexpected summary data format:', typeof summaryData, summaryData)
            existingSelections = []
          }
        } catch (parseError) {
          console.error('Failed to parse selected_picks_summary:', parseError)
          existingSelections = []
        }
        
        const selectedPicksMap: SelectedPick[] = []
        
        // Process authenticated picks
        userComparison.authenticated_picks.forEach(pick => {
          if (pick.show_in_combination) {
            selectedPicksMap.push({
              pick_id: pick.pick_id,
              source: 'authenticated',
              selected_team: pick.selected_team,
              game_info: `${pick.game.away_team} @ ${pick.game.home_team}`,
              is_lock: pick.combination_is_lock
            })
          }
        })
        
        // Process anonymous picks
        userComparison.anonymous_picks.forEach(pick => {
          if (pick.show_in_combination) {
            selectedPicksMap.push({
              pick_id: pick.pick_id,
              source: 'anonymous',
              selected_team: pick.selected_team,
              game_info: `${pick.game.away_team} @ ${pick.game.home_team}`,
              is_lock: pick.combination_is_lock
            })
          }
        })
        
        setSelectedPicks(selectedPicksMap)
        setReasoning(data.combination_info.reasoning || '')
      } else {
        setSelectedPicks([])
        setReasoning('')
      }
      
    } catch (error: any) {
      console.error('Failed to load user comparison:', error)
      setMessage(`Error: ${error.message}`)
      setUserComparison(null)
    } finally {
      setLoading(false)
    }
  }

  const togglePickSelection = (pick: PickWithGame, source: 'authenticated' | 'anonymous') => {
    const pickId = pick.pick_id
    const gameInfo = `${pick.game.away_team} @ ${pick.game.home_team}`
    
    console.log('Toggling pick selection for:', pickId, pick.selected_team)
    
    setSelectedPicks(prev => {
      const existing = prev.find(p => p.pick_id === pickId)
      console.log('Existing selection:', existing)
      console.log('Current selections before toggle:', prev)
      
      if (existing) {
        // Remove the pick
        const newSelections = prev.filter(p => p.pick_id !== pickId)
        console.log('Removing pick, new selections:', newSelections)
        return newSelections
      } else {
        // Add the pick (limit to 6)
        if (prev.length >= 6) {
          setMessage('Maximum of 6 picks allowed. Remove a pick first.')
          return prev
        }
        
        const newPick = {
          pick_id: pickId,
          source,
          selected_team: pick.selected_team,
          game_info: gameInfo,
          is_lock: false // Will be set separately
        }
        
        const newSelections = [...prev, newPick]
        console.log('Adding pick, new selections:', newSelections)
        return newSelections
      }
    })
    setMessage('')
  }

  const toggleLockPick = (pickId: string) => {
    setSelectedPicks(prev => prev.map(pick => ({
      ...pick,
      is_lock: pick.pick_id === pickId ? !pick.is_lock : false // Only one lock allowed
    })))
  }

  const saveCombination = async () => {
    if (!user || !selectedUser || !selectedWeek) return
    
    if (selectedPicks.length !== 6) {
      setMessage('Must select exactly 6 picks')
      return
    }
    
    const lockPicks = selectedPicks.filter(p => p.is_lock)
    if (lockPicks.length !== 1) {
      setMessage('Must select exactly 1 lock pick')
      return
    }
    
    setSaving(true)
    setMessage('')
    
    try {
      const { data, error } = await supabase.rpc('create_custom_pick_combination', {
        target_user_id: selectedUser,
        target_season: selectedSeason,
        target_week: parseInt(selectedWeek),
        selected_picks: selectedPicks,
        admin_user_id: user.id,
        reasoning_text: reasoning || null
      })

      if (error) {
        console.error('Save error details:', error)
        if (error.message.includes('does not exist')) {
          setMessage('⚠️ Database migrations need to be applied first. The custom combination functions are not yet available.')
          return
        }
        throw error
      }

      if (data.success) {
        setMessage(`✅ Custom combination saved successfully! ${data.message}`)
        // Reload to show updated state
        setTimeout(() => loadUserComparison(), 1000)
      } else {
        setMessage(`❌ ${data.error}`)
      }
      
    } catch (error: any) {
      console.error('Failed to save combination:', error)
      if (error.message.includes('does not exist')) {
        setMessage('⚠️ Database migrations need to be applied first. The custom combination functions are not yet available.')
      } else if (error.message.includes('record') && error.message.includes('has no field')) {
        setMessage('❌ Database function error. There may be an issue with the migration. Check console for details.')
      } else {
        setMessage(`❌ Error: ${error.message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const clearSelection = () => {
    setSelectedPicks([])
    setReasoning('')
    setMessage('')
  }

  const testConnection = async () => {
    try {
      console.log('Testing basic database connection...')
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name')
        .limit(3)
      
      console.log('Test query result:', { data, error })
      setMessage(`✅ Connection test: Found ${data?.length || 0} users`)
    } catch (error) {
      console.error('Connection test failed:', error)
      setMessage(`❌ Connection test failed: ${error}`)
    }
  }

  useEffect(() => {
    loadAvailableUsers()
  }, [selectedSeason])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#4B3621] flex items-center gap-2">
            <Shuffle className="h-6 w-6" />
            Custom Pick Combinations
          </h2>
          <p className="text-gray-600">Create custom 6-pick combinations by selecting individual picks from different sets</p>
        </div>
        <Select value={selectedSeason.toString()} onValueChange={(value) => setSelectedSeason(parseInt(value))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2024">2024</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User and Week Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Select User and Week
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="w-80">
                <SelectValue placeholder="Select User" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Week" />
            </SelectTrigger>
            <SelectContent>
              {[...Array(18)].map((_, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>
                  Week {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button onClick={loadUserComparison} disabled={loading || !selectedUser || !selectedWeek}>
            {loading ? 'Loading...' : 'Load Picks'}
          </Button>
          
          <Button onClick={testConnection} variant="outline">
            Test Connection
          </Button>
        </CardContent>
      </Card>

      {/* Status Message */}
      {message && (
        <Alert className={message.includes('✅') ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* Selection Summary */}
      {selectedPicks.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Check className="h-4 w-4" />
              Selected Combination ({selectedPicks.length}/6)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {selectedPicks.map((pick, index) => (
                <div key={pick.pick_id} className="flex items-center justify-between p-2 bg-white rounded border">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-gray-500">#{index + 1}</span>
                    <span className="font-medium">{pick.selected_team}</span>
                    <span className="text-sm text-gray-600">{pick.game_info}</span>
                    <Badge variant={pick.source === 'authenticated' ? 'default' : 'outline'} size="sm">
                      {pick.source === 'authenticated' ? 'Account' : 'Anon'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => toggleLockPick(pick.pick_id)}
                      size="sm"
                      variant={pick.is_lock ? 'default' : 'outline'}
                      className={pick.is_lock ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                    >
                      {pick.is_lock ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      {pick.is_lock ? 'Lock' : 'Set Lock'}
                    </Button>
                    
                    <Button
                      onClick={() => setSelectedPicks(prev => prev.filter(p => p.pick_id !== pick.pick_id))}
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            {selectedPicks.length === 6 && (
              <div className="mt-4 space-y-3">
                <Textarea
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  placeholder="Optional: Add reasoning for this custom combination"
                  className="min-h-16"
                />
                
                <div className="flex items-center gap-2 justify-end">
                  <Button onClick={clearSelection} variant="outline">
                    Clear All
                  </Button>
                  <Button onClick={saveCombination} disabled={saving || selectedPicks.filter(p => p.is_lock).length !== 1}>
                    <Save className="h-4 w-4 mr-1" />
                    {saving ? 'Saving...' : 'Save Combination'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pick Selection Interface */}
      {userComparison && (
        <div className="grid gap-6">
          {/* Authenticated Picks */}
          {userComparison.authenticated_picks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Account Picks ({userComparison.authenticated_picks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {userComparison.authenticated_picks.map((pick) => {
                    const isSelected = selectedPicks.some(p => p.pick_id === pick.pick_id)
                    const selectedPick = selectedPicks.find(p => p.pick_id === pick.pick_id)
                    
                    return (
                      <div 
                        key={pick.pick_id} 
                        className={`flex items-center justify-between p-3 rounded border-2 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-blue-300 bg-blue-50' 
                            : pick.show_in_combination 
                              ? 'border-green-200 bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          togglePickSelection(pick, 'authenticated')
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{pick.selected_team}</span>
                              {pick.original_is_lock && (
                                <Badge className="bg-yellow-100 text-yellow-800" size="sm">
                                  <Lock className="h-3 w-3 mr-1" />
                                  Original Lock
                                </Badge>
                              )}
                              {selectedPick?.is_lock && (
                                <Badge className="bg-yellow-500 text-white" size="sm">
                                  <Lock className="h-3 w-3 mr-1" />
                                  Combination Lock
                                </Badge>
                              )}
                            </div>
                            
                            <div className="text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <span>{pick.game.away_team} @ {pick.game.home_team}</span>
                                <span>({pick.game.spread > 0 ? '+' : ''}{pick.game.spread})</span>
                                <span>{new Date(pick.game.game_time).toLocaleDateString()}</span>
                                {pick.result !== 'pending' && (
                                  <Badge 
                                    className={
                                      pick.result === 'win' ? 'bg-green-100 text-green-800' :
                                      pick.result === 'loss' ? 'bg-red-100 text-red-800' :
                                      'bg-gray-100 text-gray-800'
                                    }
                                    size="sm"
                                  >
                                    {pick.result === 'win' ? `+${pick.points_earned}` : 
                                     pick.result === 'loss' ? '0' : '10'}
                                  </Badge>
                                )}
                              </div>
                              {pick.submitted_at && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Submitted: {new Date(pick.submitted_at).toLocaleDateString()} {new Date(pick.submitted_at).toLocaleTimeString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {pick.show_in_combination ? (
                            <Badge className="bg-green-100 text-green-800">
                              <Eye className="h-3 w-3 mr-1" />
                              Visible
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Hidden
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Anonymous Picks */}
          {userComparison.anonymous_picks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Anonymous Picks ({userComparison.anonymous_picks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {userComparison.anonymous_picks.map((pick) => {
                    const isSelected = selectedPicks.some(p => p.pick_id === pick.pick_id)
                    const selectedPick = selectedPicks.find(p => p.pick_id === pick.pick_id)
                    
                    return (
                      <div 
                        key={pick.pick_id} 
                        className={`flex items-center justify-between p-3 rounded border-2 cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-blue-300 bg-blue-50' 
                            : pick.show_in_combination 
                              ? 'border-green-200 bg-green-50' 
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          togglePickSelection(pick, 'anonymous')
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                          }`}>
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{pick.selected_team}</span>
                              {pick.source_email && (
                                <Badge variant="outline" size="sm">
                                  {pick.source_email}
                                </Badge>
                              )}
                              {pick.original_is_lock && (
                                <Badge className="bg-yellow-100 text-yellow-800" size="sm">
                                  <Lock className="h-3 w-3 mr-1" />
                                  Original Lock
                                </Badge>
                              )}
                              {selectedPick?.is_lock && (
                                <Badge className="bg-yellow-500 text-white" size="sm">
                                  <Lock className="h-3 w-3 mr-1" />
                                  Combination Lock
                                </Badge>
                              )}
                            </div>
                            
                            <div className="text-sm text-gray-600">
                              <div className="flex items-center gap-2">
                                <span>{pick.game.away_team} @ {pick.game.home_team}</span>
                                <span>({pick.game.spread > 0 ? '+' : ''}{pick.game.spread})</span>
                                <span>{new Date(pick.game.game_time).toLocaleDateString()}</span>
                              </div>
                              {pick.submitted_at && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                  <Clock className="h-3 w-3" />
                                  <span>Submitted: {new Date(pick.submitted_at).toLocaleDateString()} {new Date(pick.submitted_at).toLocaleTimeString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {pick.show_in_combination ? (
                            <Badge className="bg-green-100 text-green-800">
                              <Eye className="h-3 w-3 mr-1" />
                              Visible
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-600">
                              <EyeOff className="h-3 w-3 mr-1" />
                              Hidden
                            </Badge>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {loading && (
        <div className="text-center py-8">Loading user picks...</div>
      )}
    </div>
  )
}