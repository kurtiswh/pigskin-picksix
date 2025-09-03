import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { AlertTriangle, Check, Clock, User, Search } from 'lucide-react'

interface DuplicatePickScenario {
  user_id: string
  display_name: string
  season: number
  week: number
  authenticated_picks: number
  authenticated_locks: number
  anonymous_picks: number
  anonymous_locks: number
  admin_preference: string | null
  admin_reasoning: string | null
  set_by_admin: string | null
  admin_name: string | null
  preference_set_at: string | null
  effective_source: string
  source_reason: string
}

interface PickPreference {
  user_id: string
  season: number
  week?: number
  preferred_source: 'authenticated' | 'anonymous'
  reasoning?: string
}

export default function DuplicatePicksManager() {
  const { user } = useAuth()
  const [duplicateScenarios, setDuplicateScenarios] = useState<DuplicatePickScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [selectedSeason, setSelectedSeason] = useState<number>(2025)
  const [editingPreference, setEditingPreference] = useState<{
    scenario: DuplicatePickScenario
    preference: PickPreference
    reasoning: string
  } | null>(null)
  const [debugData, setDebugData] = useState<any[]>([])
  const [showDebug, setShowDebug] = useState(false)

  const fetchDuplicateScenarios = async () => {
    try {
      const { data, error } = await supabase
        .from('duplicate_picks_admin_view')
        .select('*')
        .eq('season', selectedSeason)
        .order('week')
        .order('display_name')

      if (error) throw error
      setDuplicateScenarios(data || [])
    } catch (error) {
      console.error('Error fetching duplicate scenarios:', error)
    } finally {
      setLoading(false)
    }
  }

  const runDebugAnalysis = async () => {
    try {
      const { data, error } = await supabase.rpc('check_actual_duplicates_fixed', { target_season: selectedSeason })
      if (error) throw error
      setDebugData(data || [])
      setShowDebug(true)
    } catch (error) {
      console.error('Error running debug analysis:', error)
    }
  }

  const savePickPreference = async (preference: PickPreference, reasoning: string) => {
    if (!user) return

    const key = `${preference.user_id}-${preference.season}-${preference.week || 'season'}`
    setUpdating(key)

    try {
      const { error } = await supabase
        .from('user_pick_preferences')
        .upsert({
          user_id: preference.user_id,
          season: preference.season,
          week: preference.week || null,
          preferred_source: preference.preferred_source,
          reasoning: reasoning || null,
          set_by_admin: user.id
        })

      if (error) throw error

      // Refresh the leaderboard for this user
      await supabase.rpc('update_season_leaderboard_with_source', {
        target_user_id: preference.user_id,
        target_season: preference.season,
        source_type: preference.preferred_source
      })

      // Refresh data
      await fetchDuplicateScenarios()
      setEditingPreference(null)
    } catch (error) {
      console.error('Error saving preference:', error)
    } finally {
      setUpdating(null)
    }
  }

  const removePreference = async (scenario: DuplicatePickScenario) => {
    if (!user) return

    const key = `${scenario.user_id}-${scenario.season}-${scenario.week}`
    setUpdating(key)

    try {
      const { error } = await supabase
        .from('user_pick_preferences')
        .delete()
        .eq('user_id', scenario.user_id)
        .eq('season', scenario.season)
        .eq('week', scenario.week)

      if (error) throw error

      // Refresh the leaderboard for this user (will default to authenticated)
      await supabase.rpc('update_season_leaderboard_with_source', {
        target_user_id: scenario.user_id,
        target_season: scenario.season,
        source_type: 'authenticated'
      })

      // Refresh data
      await fetchDuplicateScenarios()
    } catch (error) {
      console.error('Error removing preference:', error)
    } finally {
      setUpdating(null)
    }
  }

  useEffect(() => {
    fetchDuplicateScenarios()
  }, [selectedSeason])

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading duplicate scenarios...</div>
  }

  const openEditDialog = (scenario: DuplicatePickScenario) => {
    setEditingPreference({
      scenario,
      preference: {
        user_id: scenario.user_id,
        season: scenario.season,
        week: scenario.week,
        preferred_source: scenario.admin_preference as 'authenticated' | 'anonymous' || 'authenticated'
      },
      reasoning: scenario.admin_reasoning || ''
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#4B3621]">Duplicate Picks Manager</h2>
          <p className="text-gray-600">Manage users who have both authenticated and anonymous picks</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runDebugAnalysis} variant="outline" size="sm">
            <Search className="h-4 w-4 mr-1" />
            Debug Analysis
          </Button>
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
      </div>

      {duplicateScenarios.length === 0 ? (
        <Alert>
          <Check className="h-4 w-4" />
          <AlertDescription>
            No duplicate pick scenarios found for season {selectedSeason}. All users have single pick sources.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Found {duplicateScenarios.length} users with duplicate pick scenarios. 
            Default behavior uses authenticated picks unless you choose otherwise.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {duplicateScenarios.map((scenario) => {
          const key = `${scenario.user_id}-${scenario.season}-${scenario.week}`
          const isUpdating = updating === key

          return (
            <Card key={key} className="border-l-4 border-l-orange-400">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {scenario.display_name}
                      <Badge variant="outline">Week {scenario.week}</Badge>
                    </CardTitle>
                    <CardDescription>
                      User ID: {scenario.user_id}
                    </CardDescription>
                  </div>
                  <Badge 
                    variant={scenario.effective_source === 'authenticated' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    Using: {scenario.effective_source}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h4 className="font-medium text-blue-900">Authenticated Picks</h4>
                    <p className="text-sm text-blue-700">
                      {scenario.authenticated_picks} picks ({scenario.authenticated_locks} lock)
                    </p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg">
                    <h4 className="font-medium text-purple-900">Anonymous Picks</h4>
                    <p className="text-sm text-purple-700">
                      {scenario.anonymous_picks} picks ({scenario.anonymous_locks} lock)
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 p-3 rounded-lg">
                  <h4 className="font-medium text-gray-900 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Current Status
                  </h4>
                  <p className="text-sm text-gray-700">{scenario.source_reason}</p>
                  {scenario.admin_reasoning && (
                    <p className="text-sm text-gray-600 mt-1">
                      Reasoning: {scenario.admin_reasoning}
                    </p>
                  )}
                  {scenario.admin_name && scenario.preference_set_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Set by {scenario.admin_name} on {new Date(scenario.preference_set_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => openEditDialog(scenario)}
                    disabled={isUpdating}
                    size="sm"
                  >
                    {scenario.admin_preference ? 'Edit Choice' : 'Set Preference'}
                  </Button>
                  {scenario.admin_preference && (
                    <Button
                      onClick={() => removePreference(scenario)}
                      disabled={isUpdating}
                      variant="outline"
                      size="sm"
                    >
                      Reset to Default
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Debug Analysis Results */}
      {showDebug && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Debug Analysis Results</CardTitle>
              <Button onClick={() => setShowDebug(false)} variant="outline" size="sm">Close</Button>
            </div>
          </CardHeader>
          <CardContent>
            {debugData.length === 0 ? (
              <p className="text-gray-500">No duplicate scenarios detected in debug analysis.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-8 gap-2 font-medium text-sm bg-gray-50 p-2 rounded">
                  <div>User</div>
                  <div>Week</div>
                  <div>Auth Picks</div>
                  <div>Anon Picks</div>
                  <div>Anon Sets</div>
                  <div>Total</div>
                  <div>Has Both</div>
                  <div>Issue</div>
                </div>
                {debugData.map((row, i) => (
                  <div key={i} className="grid grid-cols-8 gap-2 text-sm p-2 border rounded">
                    <div>{row.user_name}</div>
                    <div>{row.week}</div>
                    <div>{row.auth_picks}</div>
                    <div>{row.anon_picks}</div>
                    <div className={row.anon_sets > 1 ? 'font-bold text-orange-600' : ''}>{row.anon_sets}</div>
                    <div className={row.total_picks > 6 ? 'font-bold text-red-600' : ''}>{row.total_picks}</div>
                    <div>{row.has_both ? 'Yes' : 'No'}</div>
                    <div className="text-xs">{row.issue_description}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Preference Dialog */}
      {editingPreference && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Set Pick Preference</CardTitle>
              <CardDescription>
                Choose which pick source to use for {editingPreference.scenario.display_name} in Week {editingPreference.scenario.week}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Pick Source</label>
                <Select
                  value={editingPreference.preference.preferred_source}
                  onValueChange={(value: 'authenticated' | 'anonymous') =>
                    setEditingPreference(prev => prev ? {
                      ...prev,
                      preference: { ...prev.preference, preferred_source: value }
                    } : null)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="authenticated">
                      Authenticated Picks ({editingPreference.scenario.authenticated_picks} picks)
                    </SelectItem>
                    <SelectItem value="anonymous">
                      Anonymous Picks ({editingPreference.scenario.anonymous_picks} picks)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Reasoning (Optional)</label>
                <Textarea
                  value={editingPreference.reasoning}
                  onChange={(e) =>
                    setEditingPreference(prev => prev ? {
                      ...prev,
                      reasoning: e.target.value
                    } : null)
                  }
                  placeholder="Why are you choosing this pick source?"
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setEditingPreference(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => savePickPreference(editingPreference.preference, editingPreference.reasoning)}
                  disabled={updating !== null}
                >
                  Save Preference
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}