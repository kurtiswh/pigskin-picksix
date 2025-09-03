import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  EnhancedAnonymousPicksService, 
  ValidationResult, 
  PickSetConflict 
} from '@/services/enhancedAnonymousPicksService'
import { supabase } from '@/lib/supabase'

interface AnonymousPickSet {
  id: string
  email: string
  name: string
  week: number
  season: number
  picks: {
    id: string
    gameId: string
    homeTeam: string
    awayTeam: string
    selectedTeam: string
    isLock: boolean
  }[]
  submittedAt: string
  validationStatus: 'pending_validation' | 'auto_validated' | 'manually_validated' | 'duplicate_conflict'
  assignedUserId?: string
  showOnLeaderboard: boolean
  processingNotes?: string
}

interface UserSearchResult {
  id: string
  email: string
  display_name: string
  leaguesafe_email?: string | null
}

interface ValidationWorkflowProps {
  pickSet: AnonymousPickSet
  onValidationComplete: (pickSetId: string) => void
  onCancel: () => void
}

const ValidationWorkflow = ({ pickSet, onValidationComplete, onCancel }: ValidationWorkflowProps) => {
  const [step, setStep] = useState<'email_verify' | 'user_assign' | 'conflict_resolve' | 'payment_check' | 'final_confirm'>('email_verify')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [activePickSetId, setActivePickSetId] = useState('')
  const [forceShowOnLeaderboard, setForceShowOnLeaderboard] = useState(false)

  // Step 1: Email Verification and Primary User Resolution
  const handleEmailVerification = async () => {
    setLoading(true)
    setError('')
    try {
      const validation = await EnhancedAnonymousPicksService.validateAnonymousPickAssignment(
        pickSet.email,
        pickSet.week,
        pickSet.season
      )
      
      setValidationResult(validation)
      
      if (validation.recommendedAction === 'assign_immediately') {
        setStep('final_confirm')
      } else if (validation.recommendedAction === 'payment_required') {
        setStep('payment_check')
      } else {
        setStep(validation.primaryUserId ? 'conflict_resolve' : 'user_assign')
      }
      
      if (validation.primaryUserId) {
        setSelectedUserId(validation.primaryUserId)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Manual User Assignment
  const handleUserSearch = async (searchTerm: string) => {
    if (searchTerm.length < 2) {
      setSearchResults([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, display_name, leaguesafe_email')
        .or(`display_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(10)

      if (error) {
        console.error('User search error:', error)
        setSearchResults([])
        setError('Error searching for users. Please try again.')
        return
      }

      // Filter for active users if user_status column exists
      const activeUsers = data?.filter((user: any) => 
        !user.user_status || user.user_status === 'active'
      ) || []
      
      setSearchResults(activeUsers as UserSearchResult[])
      setError('') // Clear any previous errors
    } catch (err: any) {
      console.error('User search error:', err)
      setSearchResults([])
      setError('Error searching for users: ' + (err.message || 'Unknown error'))
    }
  }
  
  // When user selects a user, re-validate with that specific user ID
  const handleUserSelection = async (userId: string) => {
    setSelectedUserId(userId)
    
    // Re-run validation with the selected user ID to get their payment status
    console.log('User selected, re-validating with user ID:', userId)
    const validation = await EnhancedAnonymousPicksService.validateAnonymousPickAssignment(
      pickSet.email,
      pickSet.week,
      pickSet.season,
      userId // Force use this user ID
    )
    
    setValidationResult(validation)
    console.log('Updated validation result:', validation)
  }

  // Step 3: Conflict Resolution
  const handleConflictResolution = async () => {
    if (!activePickSetId || !validationResult) return

    setLoading(true)
    try {
      await EnhancedAnonymousPicksService.setPickSetPrecedence(
        selectedUserId,
        pickSet.week,
        pickSet.season,
        activePickSetId,
        activePickSetId.startsWith('anon_') ? 'anonymous' : 'authenticated'
      )
      setStep('final_confirm')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Final Assignment
  const handleFinalAssignment = async () => {
    setLoading(true)
    try {
      const showOnLeaderboard = validationResult?.paymentStatus.canShowOnLeaderboard || forceShowOnLeaderboard
      
      await EnhancedAnonymousPicksService.forceAssignAnonymousPicksToUser(
        pickSet.picks.map(p => p.id),
        selectedUserId,
        showOnLeaderboard,
        'manually_validated',
        `Manual validation completed - ${new Date().toISOString()}`
      )
      
      onValidationComplete(pickSet.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    handleEmailVerification()
  }, [])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🔍 Enhanced Pick Validation Workflow</span>
            <Button variant="ghost" onClick={onCancel}>×</Button>
          </CardTitle>
          <div className="text-sm text-gray-600">
            {pickSet.name} ({pickSet.email}) - Week {pickSet.week}, {pickSet.season}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}

          {/* Step Indicator */}
          <div className="flex items-center justify-between border-b pb-4">
            {['email_verify', 'user_assign', 'conflict_resolve', 'payment_check', 'final_confirm'].map((stepName, index) => (
              <div key={stepName} className={`flex items-center ${index === 4 ? '' : 'flex-1'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  step === stepName ? 'bg-blue-500 text-white' : 
                  ['email_verify', 'user_assign', 'conflict_resolve', 'payment_check', 'final_confirm'].indexOf(step) > index 
                    ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                {index < 4 && <div className="flex-1 h-1 bg-gray-200 mx-2" />}
              </div>
            ))}
          </div>

          {/* Step 1: Email Verification */}
          {step === 'email_verify' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1: Email Verification & User Resolution</h3>
              {loading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p>Resolving user identity...</p>
                </div>
              ) : validationResult ? (
                <div className="space-y-3">
                  <Alert className={`border-${validationResult.canAssign ? 'green' : 'red'}-200 bg-${validationResult.canAssign ? 'green' : 'red'}-50`}>
                    <AlertDescription>
                      <strong>Validation Result:</strong> {validationResult.notes}
                    </AlertDescription>
                  </Alert>
                  
                  {validationResult.primaryUserId && (
                    <div className="bg-blue-50 p-3 rounded">
                      <strong>Primary User ID:</strong> {validationResult.primaryUserId}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Step 2: User Assignment */}
          {step === 'user_assign' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2: User Assignment</h3>
              <p className="text-gray-600">No existing user found for {pickSet.email}. Search and assign a user:</p>
              
              <Input
                placeholder="Search by name or email..."
                onChange={(e) => handleUserSearch(e.target.value)}
              />
              
              {searchResults && searchResults.length > 0 && (
                <div className="border rounded max-h-60 overflow-y-auto">
                  {searchResults.map((user: UserSearchResult) => (
                    <button
                      key={user.id}
                      className={`w-full text-left p-3 border-b hover:bg-gray-50 ${
                        selectedUserId === user.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleUserSelection(user.id)}
                    >
                      <div className="font-medium">{user.display_name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      {user.leaguesafe_email && user.leaguesafe_email !== user.email && (
                        <div className="text-xs text-gray-400">LeagueSafe: {user.leaguesafe_email}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              
              {selectedUserId && validationResult && (
                <div className={`mt-3 p-3 rounded border ${
                  validationResult.paymentStatus.isPaid ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="text-sm">
                    <strong>Payment Status:</strong> {validationResult.paymentStatus.status}
                    {validationResult.paymentStatus.isPaid && ' ✅'}
                  </div>
                </div>
              )}
              
              <div className="flex space-x-3">
                <Button 
                  onClick={() => setStep('payment_check')} 
                  disabled={!selectedUserId}
                >
                  Continue with Selected User
                </Button>
                <Button variant="outline" onClick={() => setStep('email_verify')}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Conflict Resolution */}
          {step === 'conflict_resolve' && validationResult && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3: Pick Set Conflict Resolution</h3>
              <p className="text-gray-600">
                This user has {validationResult.conflicts.length} existing pick set(s). Choose which should be active:
              </p>
              
              <div className="space-y-3">
                {validationResult.conflicts.map((conflict) => (
                  <div key={conflict.pickSetId} className="border rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <Badge variant={conflict.sourceType === 'authenticated' ? 'default' : 'secondary'}>
                          {conflict.sourceType === 'authenticated' ? '🔐 Authenticated' : '👤 Anonymous'}
                        </Badge>
                        <span className="ml-2 text-sm text-gray-600">
                          {conflict.pickCount} picks • {new Date(conflict.submittedAt).toLocaleString()}
                        </span>
                        {conflict.isActive && <Badge className="ml-2 bg-green-100 text-green-800">Currently Active</Badge>}
                      </div>
                      <input
                        type="radio"
                        name="activePickSet"
                        value={conflict.pickSetId}
                        checked={activePickSetId === conflict.pickSetId}
                        onChange={(e) => setActivePickSetId(e.target.value)}
                      />
                    </div>
                    
                    {conflict.totalPoints > 0 && (
                      <div className="text-sm text-gray-700 mb-2">
                        <strong>Total Points:</strong> {conflict.totalPoints}
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {conflict.pickDetails.slice(0, 6).map((pick) => (
                        <div key={pick.id} className="text-xs bg-gray-50 p-2 rounded">
                          <div className="font-medium">
                            {pick.isLock && '🔒 '}{pick.homeTeam} vs {pick.awayTeam}
                          </div>
                          <div>Pick: {pick.selectedTeam}</div>
                          {pick.result && (
                            <div className={`font-medium ${
                              pick.result === 'win' ? 'text-green-600' : 
                              pick.result === 'loss' ? 'text-red-600' : 'text-yellow-600'
                            }`}>
                              {pick.result === 'win' ? '✅' : pick.result === 'loss' ? '❌' : '🟡'} 
                              {pick.pointsEarned !== null && ` ${pick.pointsEarned}pts`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                {/* New anonymous pick set */}
                <div className="border rounded p-4 bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Badge className="bg-blue-100 text-blue-800">🆕 New Anonymous Picks</Badge>
                      <span className="ml-2 text-sm text-gray-600">
                        {pickSet.picks.length} picks • {new Date(pickSet.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    <input
                      type="radio"
                      name="activePickSet"
                      value={`anon_${pickSet.id}`}
                      checked={activePickSetId === `anon_${pickSet.id}`}
                      onChange={(e) => setActivePickSetId(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {pickSet.picks.map((pick) => (
                      <div key={pick.id} className="text-xs bg-white p-2 rounded">
                        <div className="font-medium">
                          {pick.isLock && '🔒 '}{pick.homeTeam} vs {pick.awayTeam}
                        </div>
                        <div>Pick: {pick.selectedTeam}</div>
                        <div className="text-gray-500">New pick</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <Button onClick={handleConflictResolution} disabled={!activePickSetId || loading}>
                  {loading ? 'Processing...' : 'Resolve Conflicts'}
                </Button>
                <Button variant="outline" onClick={() => setStep('email_verify')}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Payment Verification */}
          {step === 'payment_check' && validationResult && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 4: Payment Status Verification</h3>
              
              <Alert className={`border-${validationResult.paymentStatus.isPaid ? 'green' : 'yellow'}-200 bg-${validationResult.paymentStatus.isPaid ? 'green' : 'yellow'}-50`}>
                <AlertDescription>
                  <strong>Payment Status:</strong> {validationResult.paymentStatus.status}
                  <br />
                  <strong>Can Show on Leaderboard:</strong> {validationResult.paymentStatus.canShowOnLeaderboard ? 'Yes' : 'No'}
                  <br />
                  <strong>User ID:</strong> {selectedUserId}
                  <br />
                  <small>Check browser console for detailed payment search logs</small>
                </AlertDescription>
              </Alert>
              
              {!validationResult.paymentStatus.isPaid && (
                <div className="space-y-3">
                  <p className="text-amber-700">
                    This user has not paid for the season. Picks can be assigned but will be hidden from leaderboard by default.
                  </p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={forceShowOnLeaderboard}
                      onChange={(e) => setForceShowOnLeaderboard(e.target.checked)}
                    />
                    <span>Force show on leaderboard (Admin override)</span>
                  </label>
                </div>
              )}
              
              <div className="flex space-x-3">
                <Button onClick={() => setStep('final_confirm')}>
                  Continue to Final Assignment
                </Button>
                <Button variant="outline" onClick={() => setStep(validationResult.conflicts.length > 0 ? 'conflict_resolve' : 'user_assign')}>
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Final Confirmation */}
          {step === 'final_confirm' && validationResult && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 5: Final Assignment Confirmation</h3>
              
              <div className="bg-gray-50 p-4 rounded space-y-2">
                <div><strong>Email:</strong> {pickSet.email}</div>
                <div><strong>User ID:</strong> {selectedUserId}</div>
                <div><strong>Show on Leaderboard:</strong> {validationResult.paymentStatus.canShowOnLeaderboard || forceShowOnLeaderboard ? 'Yes' : 'No'}</div>
                <div><strong>Validation Status:</strong> Manually Validated</div>
                {validationResult.conflicts.length > 0 && (
                  <div><strong>Conflicts Resolved:</strong> {activePickSetId} set as active</div>
                )}
              </div>
              
              <div className="flex space-x-3">
                <Button onClick={handleFinalAssignment} disabled={loading} className="bg-green-600 hover:bg-green-700">
                  {loading ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
                <Button variant="outline" onClick={() => setStep('payment_check')}>
                  Back
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface EnhancedAnonymousPicksAdminProps {
  currentWeek: number
  currentSeason: number
}

export default function EnhancedAnonymousPicksAdmin({ currentWeek, currentSeason }: EnhancedAnonymousPicksAdminProps) {
  const [pickSets, setPickSets] = useState<AnonymousPickSet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)
  const [selectedSeason, setSelectedSeason] = useState(currentSeason)
  const [validatingPickSet, setValidatingPickSet] = useState<AnonymousPickSet | null>(null)
  const [summary, setSummary] = useState<any>(null)

  const loadPickSets = async () => {
    setLoading(true)
    try {
      // Load anonymous picks grouped by email + submission time
      const { data, error } = await supabase
        .from('anonymous_picks')
        .select('*')
        .eq('week', selectedWeek)
        .eq('season', selectedSeason)
        .order('submitted_at', { ascending: false })

      if (error) throw error

      // Group into pick sets
      const pickSetMap = new Map<string, AnonymousPickSet>()
      
      for (const pick of data || []) {
        const submittedDate = new Date(pick.submitted_at)
        submittedDate.setSeconds(0, 0)
        const key = `${pick.email}-${submittedDate.toISOString()}`
        
        if (!pickSetMap.has(key)) {
          pickSetMap.set(key, {
            id: key,
            email: pick.email,
            name: pick.name,
            week: pick.week,
            season: pick.season,
            picks: [],
            submittedAt: pick.submitted_at,
            validationStatus: pick.validation_status || 'pending_validation',
            assignedUserId: pick.assigned_user_id,
            showOnLeaderboard: pick.show_on_leaderboard,
            processingNotes: pick.processing_notes
          })
        }
        
        pickSetMap.get(key)!.picks.push({
          id: pick.id,
          gameId: pick.game_id,
          homeTeam: pick.home_team,
          awayTeam: pick.away_team,
          selectedTeam: pick.selected_team,
          isLock: pick.is_lock
        })
      }

      setPickSets(Array.from(pickSetMap.values()))

      // Load validation summary
      const summaryData = await EnhancedAnonymousPicksService.getValidationSummary(selectedWeek, selectedSeason)
      setSummary(summaryData)
    } catch (error) {
      console.error('Error loading pick sets:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPickSets()
  }, [selectedWeek, selectedSeason])

  const handleValidationComplete = (pickSetId: string) => {
    setValidatingPickSet(null)
    loadPickSets() // Reload to get updated status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading enhanced validation system...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🔍 Enhanced Anonymous Picks Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Input
              type="number"
              placeholder="Season"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(parseInt(e.target.value))}
            />
            <Input
              type="number"
              placeholder="Week"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            />
            <div className="col-span-2">
              <Button onClick={loadPickSets} className="w-full">
                Refresh Data
              </Button>
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-blue-700">{summary.total}</div>
                <div className="text-sm text-blue-600">Total Picks</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-yellow-700">{summary.pendingValidation}</div>
                <div className="text-sm text-yellow-600">Pending</div>
              </div>
              <div className="bg-green-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-green-700">{summary.onLeaderboard}</div>
                <div className="text-sm text-green-600">On Leaderboard</div>
              </div>
              <div className="bg-red-50 p-3 rounded text-center">
                <div className="text-2xl font-bold text-red-700">{summary.duplicateConflicts}</div>
                <div className="text-sm text-red-600">Conflicts</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pickSets.filter(ps => !ps.assignedUserId).map((pickSet) => (
        <Card key={pickSet.id} className="border-l-4 border-l-yellow-400">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-3">
                  <h3 className="text-lg font-semibold">{pickSet.name}</h3>
                  <Badge variant="outline">{pickSet.email}</Badge>
                  <Badge className={`${
                    pickSet.validationStatus === 'pending_validation' ? 'bg-yellow-100 text-yellow-800' :
                    pickSet.validationStatus === 'duplicate_conflict' ? 'bg-red-100 text-red-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {pickSet.validationStatus}
                  </Badge>
                </div>
                
                <div className="text-sm text-gray-600 mb-3">
                  {pickSet.picks.length} picks • {new Date(pickSet.submittedAt).toLocaleString()}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {pickSet.picks.map((pick) => (
                    <div key={pick.id} className="text-sm bg-gray-50 p-2 rounded">
                      <div className="font-medium">
                        {pick.isLock && '🔒 '}{pick.awayTeam} @ {pick.homeTeam}
                      </div>
                      <div>Pick: {pick.selectedTeam}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              <Button 
                onClick={() => setValidatingPickSet(pickSet)}
                className="ml-4 bg-blue-600 hover:bg-blue-700"
              >
                🔍 Start Enhanced Validation
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {validatingPickSet && (
        <ValidationWorkflow
          pickSet={validatingPickSet}
          onValidationComplete={handleValidationComplete}
          onCancel={() => setValidatingPickSet(null)}
        />
      )}
    </div>
  )
}