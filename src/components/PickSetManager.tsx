import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { AlertTriangle, Check, Clock, User, Trophy, Calendar, MapPin, Shuffle } from 'lucide-react'

interface PickSetInfo {
  user_id: string
  display_name: string
  season: number
  week: number
  pick_set_type: string
  pick_set_id: string
  pick_set_source: string
  pick_count: number
  lock_count: number
  created_at: string
  submitted_at: string | null
  picks_detail: any[]
  is_selected: boolean
  admin_reasoning: string | null
  admin_name: string | null
  preference_set_at: string | null
  status: string
}

interface PickWithGame {
  pick_id: string
  selected_team: string
  is_lock: boolean
  points_earned: number
  result: string
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

export default function PickSetManager() {
  const { user } = useAuth()
  const [pickSets, setPickSets] = useState<PickSetInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeason, setSelectedSeason] = useState<number>(2025)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [userPickComparisons, setUserPickComparisons] = useState<{ [key: string]: any[] }>({})
  const [loadingComparisons, setLoadingComparisons] = useState<{ [key: string]: boolean }>({})
  const [updating, setUpdating] = useState<string | null>(null)
  const [selectionReasoning, setSelectionReasoning] = useState<string>('')
  const [showReasoningFor, setShowReasoningFor] = useState<string | null>(null)
  const [customCombinations, setCustomCombinations] = useState<{ [key: string]: any }>({})

  const fetchPickSets = async () => {
    try {
      console.log('🔍 Fetching pick sets for season:', selectedSeason)
      const { data, error } = await supabase
        .from('user_pick_sets_admin_view')
        .select('*')
        .eq('season', selectedSeason)
        .order('week')
        .order('display_name')
        .order('pick_set_type')

      if (error) {
        console.error('❌ Database error:', error)
        throw error
      }
      console.log('✅ Pick sets data received:', data)
      console.log('📊 Number of pick sets:', data?.length || 0)
      if (data && data.length > 0) {
        console.log('📝 First pick set sample:', data[0])
      }
      setPickSets(data || [])
      
      // Also check for custom combinations
      await checkCustomCombinations()
    } catch (error) {
      console.error('Error fetching pick sets:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkCustomCombinations = async () => {
    try {
      console.log('🔍 Checking for custom combinations in season:', selectedSeason)
      
      // Method 1: Check user_custom_pick_combinations table (new system)
      const { data: tableData, error: tableError } = await supabase
        .from('user_custom_pick_combinations')
        .select('user_id, season, week, reasoning, created_at')
        .eq('season', selectedSeason)

      // Method 2: Check for picks with show_in_combination=false (indicates custom combination)
      // Custom combinations work by hiding some picks, so we look for users who have BOTH true and false values
      const { data: picksData, error: picksError } = await supabase
        .from('picks')
        .select('user_id, season, week, show_in_combination, combination_updated_at')
        .eq('season', selectedSeason)
        .eq('show_in_combination', false) // Look for hidden picks

      const { data: anonPicksData, error: anonPicksError } = await supabase
        .from('anonymous_picks')
        .select('assigned_user_id, season, week, show_in_combination, combination_updated_at')
        .eq('season', selectedSeason)
        .eq('show_in_combination', false) // Look for hidden picks

      console.log('✅ Table-based combinations:', tableData?.length || 0)
      console.log('✅ Hidden auth picks (indicates custom combinations):', picksData?.length || 0)
      console.log('✅ Hidden anon picks (indicates custom combinations):', anonPicksData?.length || 0)

      // Group combinations by user_id-week for easy lookup
      const combinationsMap: { [key: string]: any } = {}
      
      // Add table-based combinations
      if (!tableError && tableData && tableData.length > 0) {
        tableData.forEach(combo => {
          const key = `${combo.user_id}-${combo.week}`
          combinationsMap[key] = combo
          console.log(`📝 Table-based combination found for key ${key}:`, combo)
        })
      }
      
      // Add pick-based combinations (authenticated picks)
      if (!picksError && picksData && picksData.length > 0) {
        // Group by user_id-week to find users with custom combinations
        const userWeekGroups: { [key: string]: any } = {}
        picksData.forEach(pick => {
          const key = `${pick.user_id}-${pick.week}`
          if (!userWeekGroups[key]) {
            userWeekGroups[key] = {
              user_id: pick.user_id,
              season: pick.season,
              week: pick.week,
              reasoning: 'Custom pick combination active',
              created_at: pick.combination_updated_at,
              source: 'picks'
            }
          }
        })
        Object.entries(userWeekGroups).forEach(([key, combo]) => {
          if (!combinationsMap[key]) { // Don't override table-based data
            combinationsMap[key] = combo
            console.log(`📝 Pick-based combination found for key ${key}:`, combo)
          }
        })
      }
      
      // Add pick-based combinations (anonymous picks)
      if (!anonPicksError && anonPicksData && anonPicksData.length > 0) {
        const userWeekGroups: { [key: string]: any } = {}
        anonPicksData.forEach(pick => {
          const key = `${pick.assigned_user_id}-${pick.week}`
          if (!userWeekGroups[key]) {
            userWeekGroups[key] = {
              user_id: pick.assigned_user_id,
              season: pick.season,
              week: pick.week,
              reasoning: 'Custom pick combination active',
              created_at: pick.combination_updated_at,
              source: 'anonymous_picks'
            }
          }
        })
        Object.entries(userWeekGroups).forEach(([key, combo]) => {
          if (!combinationsMap[key]) { // Don't override existing data
            combinationsMap[key] = combo
            console.log(`📝 Anon pick-based combination found for key ${key}:`, combo)
          }
        })
      }

      setCustomCombinations(combinationsMap)
      console.log('🗺️ Final combinations map:', combinationsMap)
    } catch (error) {
      console.log('⚠️ Custom combinations check failed:', error)
      setCustomCombinations({})
    }
  }

  const fetchUserPickComparison = async (user_id: string, season: number, week: number) => {
    const key = `${user_id}-${season}-${week}`
    
    setLoadingComparisons(prev => ({ ...prev, [key]: true }))
    
    try {
      const { data, error } = await supabase.rpc('get_all_pick_sets_for_comparison', {
        target_user_id: user_id,
        target_season: season,
        target_week: week
      })

      if (error) throw error
      
      if (data && data[0] && data[0].pick_set_comparison) {
        setUserPickComparisons(prev => ({ ...prev, [key]: data[0].pick_set_comparison }))
      }
    } catch (error) {
      console.error('Error fetching pick comparison:', error)
    } finally {
      setLoadingComparisons(prev => ({ ...prev, [key]: false }))
    }
  }

  const selectPickSet = async (pickSet: PickSetInfo) => {
    if (!user) return

    const key = `${pickSet.user_id}-${pickSet.season}-${pickSet.week}-${pickSet.pick_set_id}`
    setUpdating(key)

    try {
      const { data, error } = await supabase.rpc('select_user_pick_set', {
        target_user_id: pickSet.user_id,
        target_season: pickSet.season,
        target_week: pickSet.week,
        selected_pick_set_id: pickSet.pick_set_id,
        admin_user_id: user.id,
        reasoning_text: selectionReasoning || null
      })

      if (error) throw error

      if (data.success) {
        // Refresh the pick sets list
        await fetchPickSets()
        setShowReasoningFor(null)
        setSelectionReasoning('')
      } else {
        console.error('Selection failed:', data.error)
      }
    } catch (error) {
      console.error('Error selecting pick set:', error)
    } finally {
      setUpdating(null)
    }
  }

  const toggleUserComparison = (user_id: string, season: number, week: number) => {
    const userKey = `${user_id}-${week}`
    const comparisonKey = `${user_id}-${season}-${week}`
    
    const newExpanded = new Set(expandedUsers)
    if (expandedUsers.has(userKey)) {
      newExpanded.delete(userKey)
    } else {
      newExpanded.add(userKey)
      if (!userPickComparisons[comparisonKey]) {
        fetchUserPickComparison(user_id, season, week)
      }
    }
    setExpandedUsers(newExpanded)
  }

  useEffect(() => {
    fetchPickSets()
  }, [selectedSeason])

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading pick sets...</div>
  }

  // Group pick sets by user and week
  const groupedPickSets = pickSets.reduce((groups, pickSet) => {
    const groupKey = `${pickSet.user_id}-${pickSet.week}`
    if (!groups[groupKey]) {
      groups[groupKey] = {
        user_id: pickSet.user_id,
        display_name: pickSet.display_name,
        week: pickSet.week,
        pickSets: []
      }
    }
    groups[groupKey].pickSets.push(pickSet)
    return groups
  }, {} as { [key: string]: { user_id: string, display_name: string, week: number, pickSets: PickSetInfo[] } })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#4B3621]">Pick Set Manager</h2>
          <p className="text-gray-600">Choose which specific pick set to use for each user</p>
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

      {Object.keys(groupedPickSets).length === 0 ? (
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            No users with multiple pick sets found for season {selectedSeason}.
            <br /><br />
            <strong>Pick sets only appear here when a user has BOTH:</strong>
            <br />• Submitted authenticated picks (from their account)
            <br />• Valid anonymous picks (from email submissions)
            <br />• For the same week
            <br /><br />
            Check the browser console for debug information.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Found {Object.keys(groupedPickSets).length} users with multiple pick sets requiring admin selection.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {Object.values(groupedPickSets).map((group) => {
          const userKey = `${group.user_id}-${group.week}`
          const comparisonKey = `${group.user_id}-${selectedSeason}-${group.week}`
          const isExpanded = expandedUsers.has(userKey)
          const isLoading = loadingComparisons[comparisonKey]
          const pickComparison = userPickComparisons[comparisonKey]
          const hasCustomCombination = customCombinations[userKey]
          
          // Debug logging for Will Hathorn specifically
          if (group.display_name?.includes('Will') || group.display_name?.includes('Hathorn')) {
            console.log(`🎯 Will Hathorn debug:`)
            console.log(`- User Key: ${userKey}`)
            console.log(`- Custom combinations map:`, customCombinations)
            console.log(`- Has custom combination:`, hasCustomCombination)
            console.log(`- Custom combination data:`, customCombinations[userKey])
          }

          return (
            <Card key={`${group.user_id}-${group.week}`} className={`border-l-4 ${hasCustomCombination ? 'border-l-purple-500 bg-purple-50' : 'border-l-orange-400'}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {group.display_name}
                      <Badge variant="outline">Week {group.week}</Badge>
                      {hasCustomCombination && (
                        <Badge className="bg-purple-600 text-white">
                          <Shuffle className="h-3 w-3 mr-1" />
                          Custom Combination
                        </Badge>
                      )}
                      {(() => {
                        const selectedPickSet = group.pickSets.find(ps => ps.status === 'SELECTED')
                        return selectedPickSet && !hasCustomCombination ? (
                          <Badge className="bg-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            {selectedPickSet.pick_set_type === 'authenticated' ? 'Account Selected' : `${selectedPickSet.pick_set_source} Selected`}
                          </Badge>
                        ) : null
                      })()}
                    </CardTitle>
                    <CardDescription>
                      {group.pickSets.length} pick sets available for comparison
                      {(() => {
                        const selectedPickSet = group.pickSets.find(ps => ps.status === 'SELECTED')
                        const customCombo = customCombinations[userKey]
                        
                        if (hasCustomCombination && customCombo) {
                          return (
                            <div className="mt-1">
                              <span className="block text-purple-600 text-sm font-medium">
                                ⚠️ Custom combination active - do not change pick set selection
                              </span>
                              {customCombo.reasoning && (
                                <span className="block text-purple-600 text-xs mt-1">
                                  Reason: {customCombo.reasoning}
                                </span>
                              )}
                              <span className="block text-purple-500 text-xs mt-1">
                                Created: {new Date(customCombo.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          )
                        }
                        
                        return selectedPickSet && selectedPickSet.admin_reasoning ? (
                          <span className="block text-blue-600 text-sm mt-1">
                            Admin note: {selectedPickSet.admin_reasoning}
                          </span>
                        ) : null
                      })()}
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => toggleUserComparison(group.user_id, selectedSeason, group.week)}
                    variant="outline"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Loading...' : isExpanded ? 'Hide Comparison' : 'Compare Pick Sets'}
                  </Button>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="text-center py-8">Loading pick set comparison...</div>
                  ) : pickComparison && pickComparison.length > 0 ? (
                    <div className="space-y-6">
                      {/* Ultra-Compact Pick Set Headers with Timestamps */}
                      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${pickComparison.length}, 1fr)` }}>
                        {pickComparison.map((pickSet: any) => {
                          const matchingGroupPickSet = group.pickSets.find(ps => ps.pick_set_id === pickSet.pick_set_id)
                          const isSelected = matchingGroupPickSet?.status === 'SELECTED'
                          
                          return (
                            <div key={pickSet.pick_set_id} className={`p-2 rounded border-2 ${
                              isSelected ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50'
                            }`}>
                              <div className="text-center space-y-1">
                                <div className="flex items-center justify-center gap-1">
                                  <Badge variant={isSelected ? 'default' : 'outline'} className={isSelected ? 'bg-green-600' : ''} size="sm">
                                    {pickSet.pick_set_type === 'authenticated' ? 'Account' : 'Anon'}
                                  </Badge>
                                  {isSelected && <Badge className="bg-green-600" size="sm">✓</Badge>}
                                </div>
                                <p className="text-xs font-medium break-all" title={pickSet.source}>
                                  {pickSet.source}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {pickSet.pick_count}p ({pickSet.lock_count}L)
                                </p>
                                {pickSet.submitted_at && (
                                  <p className="text-xs text-gray-500 font-mono">
                                    {new Date(pickSet.submitted_at).toLocaleDateString()} {new Date(pickSet.submitted_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                )}
                                {!isSelected && (
                                  <Button
                                    onClick={() => setShowReasoningFor(`${group.user_id}-${selectedSeason}-${group.week}-${pickSet.pick_set_id}`)}
                                    size="sm"
                                    className="w-full text-xs py-1 h-5"
                                    disabled={hasCustomCombination}
                                    title={hasCustomCombination ? "Cannot select - custom combination active" : "Select this pick set"}
                                  >
                                    {hasCustomCombination ? "Custom" : "Select"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Ultra-Compact 3-Column Pick Comparison */}
                      <div className="space-y-1">
                        <h4 className="font-medium text-sm flex items-center gap-1">
                          <Trophy className="h-4 w-4" />
                          Pick Comparison
                        </h4>
                        
                        {/* 3-Column Layout: Game | Pick Set 1 | Pick Set 2 | ... */}
                        {(() => {
                          const allGames = new Map()
                          pickComparison.forEach((pickSet: any) => {
                            pickSet.picks?.forEach((pick: any) => {
                              if (!allGames.has(pick.game.id)) {
                                allGames.set(pick.game.id, pick.game)
                              }
                            })
                          })
                          
                          return Array.from(allGames.values())
                            .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
                            .map((game: any) => (
                              <div key={game.id} className="grid gap-1 py-1 border-b border-gray-200" style={{ gridTemplateColumns: `2fr repeat(${pickComparison.length}, 1fr)` }}>
                                {/* Game Info Column */}
                                <div className="text-xs">
                                  <p className="font-medium">
                                    {game.away_team} @ {game.home_team}
                                  </p>
                                  <div className="text-gray-500 flex items-center gap-2">
                                    <span>({game.spread > 0 ? '+' : ''}{game.spread})</span>
                                    <span>{new Date(game.kickoff_time).toLocaleDateString()}</span>
                                    {game.status === 'completed' && (
                                      <span className="font-medium">{game.away_score}-{game.home_score}</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Pick Columns */}
                                {pickComparison.map((pickSet: any) => {
                                  const pick = pickSet.picks?.find((p: any) => p.game.id === game.id)
                                  
                                  return (
                                    <div key={`${pickSet.pick_set_id}-${game.id}`} className={`text-center text-xs p-1 rounded ${
                                      !pick ? 'text-gray-400' :
                                      pick.is_lock ? 'bg-yellow-50 border border-yellow-300 font-bold' : 'bg-blue-50 border border-blue-200'
                                    }`}>
                                      {pick ? (
                                        <div>
                                          <div className="font-medium">
                                            {pick.selected_team} {pick.is_lock && '🔒'}
                                          </div>
                                          {pick.result !== 'pending' && (
                                            <div className={`text-xs ${
                                              pick.result === 'win' ? 'text-green-600' : 
                                              pick.result === 'loss' ? 'text-red-600' : 'text-gray-600'
                                            }`}>
                                              {pick.result === 'win' ? `+${pick.points_earned}` : 
                                               pick.result === 'loss' ? '0' : '10'}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span>—</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ))
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">No pick sets found for comparison</div>
                  )}
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* Reasoning Dialog */}
      {showReasoningFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Select Pick Set</CardTitle>
              <CardDescription>
                Add optional reasoning for this selection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={selectionReasoning}
                onChange={(e) => setSelectionReasoning(e.target.value)}
                placeholder="Why are you choosing this pick set? (optional)"
                className="min-h-20"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReasoningFor(null)
                    setSelectionReasoning('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const pickSet = pickSets.find(ps => 
                      `${ps.user_id}-${ps.season}-${ps.week}-${ps.pick_set_id}` === showReasoningFor
                    )
                    if (pickSet) selectPickSet(pickSet)
                  }}
                  disabled={updating !== null || (() => {
                    // Check if user has custom combination
                    const parts = showReasoningFor?.split('-')
                    if (parts && parts.length >= 3) {
                      const userId = parts[0]
                      const week = parts[2]
                      const userKey = `${userId}-${week}`
                      return !!customCombinations[userKey]
                    }
                    return false
                  })()}
                >
                  {(() => {
                    // Check if user has custom combination for button text
                    const parts = showReasoningFor?.split('-')
                    if (parts && parts.length >= 3) {
                      const userId = parts[0]
                      const week = parts[2]
                      const userKey = `${userId}-${week}`
                      return customCombinations[userKey] 
                        ? 'Cannot Select - Custom Combination Active' 
                        : 'Select This Pick Set'
                    }
                    return 'Select This Pick Set'
                  })()}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}