import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Settings, User, Calendar } from 'lucide-react'

interface LeaderboardVisibilityControlProps {
  season: number
}

interface UserPickSummary {
  user_id: string
  display_name: string
  total_auth_picks: number
  total_anon_picks: number
  hidden_auth_picks: number
  hidden_anon_picks: number
  payment_status: 'Paid' | 'NotPaid' | 'Pending'
  on_leaderboard: boolean
  auth_pick_breakdown?: string  // For custom combinations
  anon_pick_breakdown?: string  // For custom combinations
}

export default function LeaderboardVisibilityControl({ season }: LeaderboardVisibilityControlProps) {
  const [users, setUsers] = useState<UserPickSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [selectedWeek, setSelectedWeek] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  
  // Filter states
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')
  const [pickCountFilter, setPickCountFilter] = useState<string>('all')
  const [visibilityFilter, setVisibilityFilter] = useState<string>('all')
  
  const loadUserPicksSummary = async () => {
    setLoading(true)
    try {
      // Get user picks summary with visibility status
      const { data, error } = await supabase.rpc('get_user_picks_visibility_summary', {
        target_season: season
      })
      
      if (error) throw error
      setUsers(data || [])
    } catch (error: any) {
      console.error('Failed to load user picks summary:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const toggleUserLeaderboardVisibility = async (userId: string, visible: boolean, pickType: 'auth' | 'anon' | 'both') => {
    setActionLoading(true)
    setMessage('')
    
    try {
      if (pickType === 'auth' || pickType === 'both') {
        // Try the regular function first, then the flexible one as fallback
        let result = await supabase.rpc('toggle_picks_leaderboard_visibility', {
          target_user_id: userId,
          target_season: season,
          target_week: selectedWeek === 'all' ? null : parseInt(selectedWeek),
          show_on_leaderboard: visible
        })
        
        // If regular function fails with user not found, try flexible version
        if (result.data && !result.data.success && result.data.error?.includes('User not found')) {
          console.log('🔄 Trying flexible auth function...')
          result = await supabase.rpc('toggle_picks_leaderboard_visibility_flexible', {
            target_user_id: userId,
            target_season: season,
            target_week: selectedWeek === 'all' ? null : parseInt(selectedWeek),
            show_on_leaderboard: visible
          })
        }
        
        if (result.error) {
          console.error('Admin function error:', result.error)
          throw result.error
        }
        
        if (result.data) {
          console.log('🔍 Picks visibility result:', result.data)
          if (!result.data.success) {
            throw new Error(result.data.error || 'Unknown error updating picks visibility')
          }
        }
      }
      
      if (pickType === 'anon' || pickType === 'both') {
        const { data, error } = await supabase.rpc('toggle_anonymous_picks_leaderboard_visibility', {
          target_user_id: userId,
          target_season: season,
          target_week: selectedWeek === 'all' ? null : parseInt(selectedWeek),
          show_on_leaderboard: visible
        })
        
        if (error) {
          console.error('Anonymous picks function error:', error)
          throw error
        }
        
        if (data) {
          console.log('🔍 Anonymous picks visibility result:', data)
          if (!data.success) {
            throw new Error(data.error || 'Unknown error updating anonymous picks visibility')
          }
        }
      }
      
      setMessage(`Successfully updated leaderboard visibility for user`)
      await loadUserPicksSummary() // Refresh the list
      
    } catch (error: any) {
      console.error('Failed to toggle visibility:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  const bulkToggleVisibility = async (visible: boolean) => {
    setActionLoading(true)
    setMessage('')
    
    try {
      // Toggle for all users with picks
      for (const user of users) {
        if (user.total_auth_picks > 0) {
          await supabase.rpc('toggle_picks_leaderboard_visibility', {
            target_user_id: user.user_id,
            target_season: season,
            target_week: selectedWeek === 'all' ? null : parseInt(selectedWeek),
            show_on_leaderboard: visible
          })
        }
        
        if (user.total_anon_picks > 0) {
          await supabase.rpc('toggle_anonymous_picks_leaderboard_visibility', {
            target_user_id: user.user_id,
            target_season: season,
            target_week: selectedWeek === 'all' ? null : parseInt(selectedWeek),
            show_on_leaderboard: visible
          })
        }
      }
      
      setMessage(`Successfully updated leaderboard visibility for all users`)
      await loadUserPicksSummary()
      
    } catch (error: any) {
      console.error('Bulk toggle failed:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setActionLoading(false)
    }
  }

  // Filter users based on selected criteria
  const filteredUsers = users.filter(user => {
    // Payment status filter
    if (paymentStatusFilter !== 'all') {
      if (paymentStatusFilter === 'paid' && user.payment_status !== 'Paid') return false
      if (paymentStatusFilter === 'unpaid' && user.payment_status === 'Paid') return false
      if (paymentStatusFilter === 'pending' && user.payment_status !== 'Pending') return false
    }
    
    // Pick count filter
    if (pickCountFilter === 'more-than-6') {
      const totalPicks = user.total_auth_picks + user.total_anon_picks
      if (totalPicks <= 6) return false
    } else if (pickCountFilter === '6-or-less') {
      const totalPicks = user.total_auth_picks + user.total_anon_picks
      if (totalPicks > 6) return false
    }
    
    // Visibility filter
    if (visibilityFilter === 'on-leaderboard' && !user.on_leaderboard) return false
    if (visibilityFilter === 'hidden' && user.on_leaderboard) return false
    
    return true
  })

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Leaderboard Visibility Control
          <Badge variant="outline">Season {season}</Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="space-y-4">
          {/* First Row - Week Selection and Load Button */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Weeks</SelectItem>
                  {[...Array(18)].map((_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      Week {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button onClick={loadUserPicksSummary} disabled={loading}>
              {loading ? 'Loading...' : 'Load Users'}
            </Button>
            
            <div className="flex items-center gap-2 ml-4">
              <Button 
                onClick={() => bulkToggleVisibility(true)} 
                disabled={actionLoading}
                variant="outline"
                size="sm"
              >
                <Eye className="w-4 h-4 mr-1" />
                Show All
              </Button>
              
              <Button 
                onClick={() => bulkToggleVisibility(false)} 
                disabled={actionLoading}
                variant="outline"
                size="sm"
              >
                <EyeOff className="w-4 h-4 mr-1" />
                Hide All
              </Button>
            </div>
          </div>

          {/* Second Row - Filters */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Filters:</span>
            
            {/* Payment Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Payment:</span>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Not Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Pick Count Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Pick Count:</span>
              <Select value={pickCountFilter} onValueChange={setPickCountFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="more-than-6">More than 6</SelectItem>
                  <SelectItem value="6-or-less">6 or Less</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Visibility Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Status:</span>
              <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="on-leaderboard">On Leaderboard</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Clear Filters */}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setPaymentStatusFilter('all')
                setPickCountFilter('all')
                setVisibilityFilter('all')
              }}
            >
              Clear Filters
            </Button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <Alert>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {/* Results Summary */}
        {users.length > 0 && (
          <div className="text-sm text-gray-600 mb-4">
            Showing {filteredUsers.length} of {users.length} users
            {filteredUsers.length !== users.length && (
              <span className="ml-2 text-blue-600">({users.length - filteredUsers.length} filtered out)</span>
            )}
          </div>
        )}

        {/* Users List */}
        {filteredUsers.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide border-b">
              <div className="col-span-3">User</div>
              <div className="col-span-2">Payment</div>
              <div className="col-span-2">Auth Picks</div>
              <div className="col-span-2">Anon Picks</div>
              <div className="col-span-1">On Board</div>
              <div className="col-span-2">Actions</div>
            </div>
            
            {filteredUsers.map((user) => (
              <div key={user.user_id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b hover:bg-gray-50">
                {/* User */}
                <div className="col-span-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span className="font-medium">{user.display_name}</span>
                  {(user.auth_pick_breakdown || user.anon_pick_breakdown) && (
                    <Badge className="bg-purple-100 text-purple-800 text-xs" title="Custom pick combination">
                      Custom
                    </Badge>
                  )}
                </div>
                
                {/* Payment Status */}
                <div className="col-span-2">
                  {user.payment_status === 'Paid' ? (
                    <Badge className="bg-green-100 text-green-800">Paid</Badge>
                  ) : user.payment_status === 'Pending' ? (
                    <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700">Not Paid</Badge>
                  )}
                </div>
                
                {/* Auth Picks */}
                <div className="col-span-2 text-sm">
                  {user.total_auth_picks > 0 ? (
                    <div>
                      {user.auth_pick_breakdown ? (
                        // Custom combination - show breakdown
                        <div className="text-purple-600 text-xs" title={user.auth_pick_breakdown}>
                          {(() => {
                            // Parse the breakdown to show in compact format
                            const matches = user.auth_pick_breakdown.match(/(\d+)\/(\d+).*?,\s*(\d+)\/(\d+)/);
                            if (matches) {
                              const [, visA, totA, visB, totB] = matches;
                              return (
                                <span>
                                  <span className={visA !== totA ? 'text-red-600' : 'text-green-600'}>
                                    {visA}/{totA}
                                  </span>
                                  <span className="text-gray-400 mx-1">+</span>
                                  <span className={visB !== totB ? 'text-red-600' : 'text-green-600'}>
                                    {visB}/{totB}
                                  </span>
                                </span>
                              );
                            }
                            return user.auth_pick_breakdown;
                          })()}
                        </div>
                      ) : (
                        // Regular picks - show simple count
                        <div>
                          <span className={user.hidden_auth_picks > 0 ? 'text-red-600' : 'text-green-600'}>
                            {user.total_auth_picks - user.hidden_auth_picks}/{user.total_auth_picks}
                          </span>
                          <span className="text-gray-500 ml-1">visible</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </div>
                
                {/* Anon Picks */}
                <div className="col-span-2 text-sm">
                  {user.total_anon_picks > 0 ? (
                    <div>
                      {user.anon_pick_breakdown ? (
                        // Custom combination - show breakdown
                        <div className="text-purple-600 text-xs" title={user.anon_pick_breakdown}>
                          {(() => {
                            // Parse the breakdown to show in compact format
                            const matches = user.anon_pick_breakdown.match(/(\d+)\/(\d+).*?,\s*(\d+)\/(\d+)/);
                            if (matches) {
                              const [, visA, totA, visB, totB] = matches;
                              return (
                                <span>
                                  <span className={visA !== totA ? 'text-red-600' : 'text-green-600'}>
                                    {visA}/{totA}
                                  </span>
                                  <span className="text-gray-400 mx-1">+</span>
                                  <span className={visB !== totB ? 'text-red-600' : 'text-green-600'}>
                                    {visB}/{totB}
                                  </span>
                                </span>
                              );
                            }
                            return user.anon_pick_breakdown;
                          })()}
                        </div>
                      ) : (
                        // Regular picks - show simple count
                        <div>
                          <span className={user.hidden_anon_picks > 0 ? 'text-red-600' : 'text-green-600'}>
                            {user.total_anon_picks - user.hidden_anon_picks}/{user.total_anon_picks}
                          </span>
                          <span className="text-gray-500 ml-1">visible</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </div>
                
                {/* On Leaderboard */}
                <div className="col-span-1">
                  {user.on_leaderboard ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Eye className="w-3 h-3" />
                    </Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600">
                      <EyeOff className="w-3 h-3" />
                    </Badge>
                  )}
                </div>
                
                {/* Actions */}
                <div className="col-span-2 flex items-center gap-1">
                  <Button
                    onClick={() => toggleUserLeaderboardVisibility(user.user_id, true, 'both')}
                    disabled={actionLoading}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    Show
                  </Button>
                  <Button
                    onClick={() => toggleUserLeaderboardVisibility(user.user_id, false, 'both')}
                    disabled={actionLoading}
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    Hide
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredUsers.length === 0 && users.length > 0 && (
          <div className="text-center text-gray-500 py-8">
            No users match the current filters. Try adjusting your filter criteria.
          </div>
        )}

        {users.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            Click "Load Users" to see users with picks for this season
          </div>
        )}
      </CardContent>
    </Card>
  )
}