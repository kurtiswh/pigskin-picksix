import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { directSupabaseQuery } from '@/lib/supabase-direct'
import { UserWithPayment, LeagueSafePayment } from '@/types'
import { EmailService } from '@/services/emailService'
import { ENV } from '@/lib/env'
import LeagueSafeUpload from './LeagueSafeUpload'
import PaymentMatcher from './PaymentMatcher'
import UserDetailsModal from './UserDetailsModal'
import UserMergeModal from './UserMergeModal'

interface UserStats {
  totalUsers: number
  adminUsers: number
  usersWithPicks: number
  paidUsers: number
  unpaidUsers: number
  unmatchedPayments: number
}

export default function UserManagement() {
  console.log('🚨🚨🚨 UserManagement component loaded - NEW VERSION! 🚨🚨🚨')
  
  const [users, setUsers] = useState<UserWithPayment[]>([])
  // Removed unmatchedPayments state - now handled by UnmatchedUsersPayments component
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')
  const [error, setError] = useState('')
  const [currentSeason, setCurrentSeason] = useState(2025) // Default to 2025 (current season)
  const [matchingPayment, setMatchingPayment] = useState<LeagueSafePayment | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserWithPayment | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [selectedUsersForMerge, setSelectedUsersForMerge] = useState<UserWithPayment[]>([])
  const [mergeMode, setMergeMode] = useState(false)

  useEffect(() => {
    // Don't reload data if a modal is open (user details or payment matching)
    if (!selectedUser && !matchingPayment) {
      loadUsers() // loadStats will be called from within loadUsers after users are processed
    }
  }, [currentSeason, selectedUser, matchingPayment]) // Reload when season changes, but not when modal is open

  const loadUsers = async () => {
    try {
      setLoading(true)
      console.log(`🔄 UserManagement: Loading users for season ${currentSeason}...`)
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Load users with payment information for the selected season
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=*`, {
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      console.log('🔍 UserManagement users response status:', usersResponse.status)

      if (!usersResponse.ok) {
        throw new Error(`Failed to load users: ${usersResponse.status}`)
      }

      const usersData = await usersResponse.json()
      console.log(`✅ UserManagement: Loaded ${usersData.length} users from database`)

      // Load payment information for the current season (for display)
      const currentSeasonPaymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?season=eq.${currentSeason}&select=*`, {
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      let currentSeasonPayments = []
      if (currentSeasonPaymentsResponse.ok) {
        currentSeasonPayments = await currentSeasonPaymentsResponse.json()
        console.log(`✅ UserManagement: Loaded ${currentSeasonPayments.length} payments for season ${currentSeason}`)
        console.log('🔍 Payment statuses breakdown:', currentSeasonPayments.reduce((acc: any, p: any) => {
          acc[p.status] = (acc[p.status] || 0) + 1
          return acc
        }, {}))
      } else {
        console.log('⚠️ No payment data available for season', currentSeason)
      }

      // Load ALL payment history for user details modal
      const allPaymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?select=*`, {
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      let allPaymentsData = []
      if (allPaymentsResponse.ok) {
        allPaymentsData = await allPaymentsResponse.json()
        console.log(`✅ UserManagement: Loaded ${allPaymentsData.length} total payment records`)
      }

      // Combine users with their payment information for the selected season
      const usersWithPayments = usersData.map((user: any) => {
        const payment = currentSeasonPayments.find((p: any) => p.user_id === user.id)
        
        // For season filtering, use season-specific payment status
        let seasonPaymentStatus = 'No Payment'
        if (payment) {
          seasonPaymentStatus = payment.status || 'No Payment'
        } else if (currentSeason === 2024 && user.payment_status) {
          // For 2024, fall back to user's general payment status if no specific payment record
          seasonPaymentStatus = user.payment_status
        }
        
        return {
          ...user,
          payment_status: seasonPaymentStatus, // This is now season-specific
          leaguesafe_payment: payment,
          season_payment_history: allPaymentsData.filter((p: any) => p.user_id === user.id) // All payments for this user across all seasons
        }
      })

      setUsers(usersWithPayments)
      
      // Load stats after users are updated with correct payment statuses
      await loadStats(usersWithPayments)

    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async (usersData?: UserWithPayment[]) => {
    try {
      console.log('📊 UserManagement: Loading real stats...')
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY
      
      // Use provided users data or fall back to state (for manual refresh)
      const currentUsers = usersData || users
      
      // Calculate stats from current loaded users (which are already filtered by season)
      const totalUsers = currentUsers.length
      const adminUsers = currentUsers.filter(u => u.is_admin).length
      
      // Use season-specific payment status from the users array (which is already season-filtered)
      const paidUsers = currentUsers.filter(u => ['Paid', 'Manual Registration'].includes(u.payment_status)).length
      const unpaidUsers = currentUsers.filter(u => ['NotPaid', 'No Payment'].includes(u.payment_status)).length
      
      console.log('🔍 Stats calculation details:', {
        totalUsers,
        paidCount: paidUsers,
        unpaidCount: unpaidUsers,
        samplePaymentStatuses: currentUsers.slice(0, 5).map(u => ({ name: u.display_name, status: u.payment_status }))
      })
      
      // Get picks stats for current season
      const picksResponse = await fetch(`${supabaseUrl}/rest/v1/picks?season=eq.${currentSeason}&select=user_id`, {
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      let picks = []
      if (picksResponse.ok) {
        picks = await picksResponse.json()
      }
      const usersWithPicks = new Set(picks.map((p: any) => p.user_id)).size

      // Get unmatched payments for current season
      const paymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?season=eq.${currentSeason}&select=*`, {
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      let payments = []
      if (paymentsResponse.ok) {
        payments = await paymentsResponse.json()
      }
      const unmatchedPayments = payments.filter((p: any) => !currentUsers.find(u => u.id === p.user_id)).length

      const stats = {
        totalUsers,
        adminUsers,
        usersWithPicks,
        paidUsers,
        unpaidUsers,
        unmatchedPayments
      }

      console.log('✅ UserManagement: Calculated stats:', stats)
      setStats(stats)
      
    } catch (err: any) {
      console.error('Error loading stats:', err)
      setStats({
        totalUsers: currentUsers.length,
        adminUsers: currentUsers.filter(u => u.is_admin).length,
        usersWithPicks: 0,
        paidUsers: 0,
        unpaidUsers: 0,
        unmatchedPayments: 0
      })
    }
  }

  const toggleAdmin = async (userId: string, currentAdminStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_admin: !currentAdminStatus })
        .eq('id', userId)

      if (error) throw error

      setUsers(prev => prev.map(user => 
        user.id === userId 
          ? { ...user, is_admin: !currentAdminStatus }
          : user
      ))

      // Update selected user if it's the one being modified
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, is_admin: !currentAdminStatus } : null)
      }

      await loadStats()
    } catch (err: any) {
      console.error('Error updating admin status:', err)
      setError(err.message)
      throw err // Re-throw so modal can handle it
    }
  }

  const updatePaymentStatus = async (userId: string, newStatus: string) => {
    console.log('🎯 Updating payment status for season', currentSeason)
    console.log('🎯 Target userId:', userId)
    console.log('🔄 New status:', newStatus)
    
    try {
      // Find the user to get their email and name
      const user = users.find(u => u.id === userId)
      if (!user) {
        throw new Error('User not found')
      }
      
      console.log('📋 User found:', user.display_name)

      // Check if a record exists for this user and season
      const { data: existingPayment, error: checkError } = await supabase
        .from('leaguesafe_payments')
        .select('*')
        .eq('user_id', userId)
        .eq('season', currentSeason)
        .single()

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error checking existing payment:', checkError)
        throw checkError
      }

      let result
      
      if (existingPayment) {
        // Update existing record
        console.log('📝 Updating existing payment record...')
        const { data, error } = await supabase
          .from('leaguesafe_payments')
          .update({
            status: newStatus,
            is_matched: true, // Set to true when manually updating payment status
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('season', currentSeason)
          .select()
        
        if (error) throw error
        result = data
        console.log('✅ Payment record updated:', result)
      } else {
        // Insert new record
        console.log('📝 Creating new payment record...')
        const paymentData = {
          user_id: userId,
          season: currentSeason,
          status: newStatus,
          leaguesafe_owner_name: user.display_name,
          leaguesafe_email: user.leaguesafe_email || user.email,
          is_matched: true, // Set to true when manually creating payment record
          entry_fee: 0.00,
          paid: 0.00,
          owes: 0.00,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        
        const { data, error } = await supabase
          .from('leaguesafe_payments')
          .insert(paymentData)
          .select()
        
        if (error) throw error
        result = data
        console.log('✅ Payment record created:', result)
      }

      // Update selected user if it's the one being modified
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, payment_status: newStatus } : null)
      }

      // Note: Don't refresh here as the modal will handle it via onRefresh
    } catch (err: any) {
      console.error('Error updating payment status:', err)
      setError(err.message)
      throw err
    }
  }

  const handleMergeUsers = async (sourceUserId: string, targetUserId: string, mergeReason?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { UserMergeService } = await import('@/services/userMergeService')
      await UserMergeService.mergeUsers(sourceUserId, targetUserId, user.id, mergeReason)
      
      // Refresh data after merge
      setShowMergeModal(false)
      setSelectedUsersForMerge([])
      setMergeMode(false)
      await loadUsers()
      await loadStats()
    } catch (err: any) {
      console.error('Error merging users:', err)
      setError(err.message)
      throw err
    }
  }

  const toggleMergeMode = () => {
    setMergeMode(!mergeMode)
    setSelectedUsersForMerge([])
  }

  const handleUserSelection = (user: UserWithPayment, selected: boolean) => {
    if (selected) {
      setSelectedUsersForMerge(prev => [...prev, user])
    } else {
      setSelectedUsersForMerge(prev => prev.filter(u => u.id !== user.id))
    }
  }

  const sendPasswordReset = async (userId: string, email: string, displayName: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })
      
      if (error) {
        throw new Error(error.message)
      }
      
      alert(`✅ Password reset email sent to ${email}`)
    } catch (err: any) {
      console.error('Error sending password reset:', err)
      alert(`❌ Error sending password reset: ${err.message}`)
      throw err
    }
  }

  const deleteUser = async (userId: string) => {
    try {
      // First delete all picks for this user
      const { error: picksError } = await supabase
        .from('picks')
        .delete()
        .eq('user_id', userId)

      if (picksError) throw picksError

      // Delete payment records
      const { error: paymentError } = await supabase
        .from('leaguesafe_payments')
        .delete()
        .eq('user_id', userId)

      if (paymentError) throw paymentError

      // Then delete the user
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)

      if (userError) throw userError

      setUsers(prev => prev.filter(user => user.id !== userId))
      await loadStats()
    } catch (err: any) {
      console.error('Error deleting user:', err)
      setError(err.message)
      throw err
    }
  }

  const handleUploadComplete = () => {
    loadUsers()
    loadStats()
  }

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch = user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Payment status filter
    const matchesPaymentStatus = paymentStatusFilter === 'all' || 
      user.payment_status === paymentStatusFilter
    
    return matchesSearch && matchesPaymentStatus
  })

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Season {currentSeason} Overview</h3>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-charcoal-700">Season:</label>
              <select
                value={currentSeason}
                onChange={(e) => setCurrentSeason(parseInt(e.target.value))}
                className="border rounded px-3 py-1 text-sm"
              >
                <option value={2024}>2024</option>
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-pigskin-600">{stats.totalUsers}</div>
                <div className="text-sm text-charcoal-500">Total Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.paidUsers}</div>
                <div className="text-sm text-charcoal-500">Paid Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{stats.unpaidUsers}</div>
                <div className="text-sm text-charcoal-500">Unpaid Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.unmatchedPayments}</div>
                <div className="text-sm text-charcoal-500">Unmatched</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.usersWithPicks}</div>
                <div className="text-sm text-charcoal-500">With Picks</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-gold-600">{stats.adminUsers}</div>
                <div className="text-sm text-charcoal-500">Admins</div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* LeagueSafe Upload */}
      <LeagueSafeUpload onUploadComplete={handleUploadComplete} />

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>User Management</span>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
              />
              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              >
                <option value="all">All Status</option>
                <option value="Paid">Paid</option>
                <option value="NotPaid">Not Paid</option>
                <option value="No Payment">No Payment</option>
                <option value="Manual Registration">Manual Registration</option>
                <option value="Pending">Pending</option>
              </select>
              <Button 
                onClick={toggleMergeMode} 
                variant={mergeMode ? "default" : "outline"} 
                size="sm"
                className={mergeMode ? "bg-blue-600 hover:bg-blue-700" : ""}
              >
                {mergeMode ? 'Exit Merge Mode' : 'Merge Users'}
              </Button>
              {mergeMode && selectedUsersForMerge.length === 2 && (
                <Button 
                  onClick={() => setShowMergeModal(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  Start Merge
                </Button>
              )}
              <Button onClick={loadUsers} variant="outline" size="sm">
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg mb-4 text-sm">
              <div className="font-medium mb-1">Error</div>
              <div>{error}</div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <div className="text-charcoal-600">Loading users...</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-charcoal-500">
                  Showing {filteredUsers.length} of {users.length} users
                </div>
                {mergeMode && (
                  <div className="text-sm text-blue-600">
                    {selectedUsersForMerge.length === 0 && 'Select 2 users to merge'}
                    {selectedUsersForMerge.length === 1 && 'Select 1 more user to merge'}
                    {selectedUsersForMerge.length === 2 && 'Ready to merge - click "Start Merge"'}
                    {selectedUsersForMerge.length > 2 && 'Too many users selected - maximum 2'}
                  </div>
                )}
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredUsers.map(user => {
                  const isSelectedForMerge = selectedUsersForMerge.some(u => u.id === user.id)
                  const canSelectForMerge = mergeMode && (selectedUsersForMerge.length < 2 || isSelectedForMerge)
                  
                  return (
                    <div
                      key={user.id}
                      className={`flex items-center justify-between p-3 border rounded-lg hover:bg-stone-50 cursor-pointer transition-colors ${
                        isSelectedForMerge ? 'border-blue-500 bg-blue-100 hover:bg-blue-150' :
                        user.payment_status === 'No Payment' ? 'border-orange-300 bg-orange-50 hover:bg-orange-100' : 
                        user.payment_status === 'NotPaid' ? 'border-red-300 bg-red-50 hover:bg-red-100' :
                        user.payment_status === 'Paid' ? 'border-green-300 bg-green-50 hover:bg-green-100' : 
                        user.payment_status === 'Manual Registration' ? 'border-blue-300 bg-blue-50 hover:bg-blue-100' :
                        'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
                      } ${
                        mergeMode && !canSelectForMerge ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => {
                        if (mergeMode && canSelectForMerge) {
                          handleUserSelection(user, !isSelectedForMerge)
                        } else if (!mergeMode) {
                          setSelectedUser(user)
                        }
                      }}
                    >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        {mergeMode && (
                          <input
                            type="checkbox"
                            checked={isSelectedForMerge}
                            onChange={(e) => {
                              e.stopPropagation()
                              if (canSelectForMerge) {
                                handleUserSelection(user, e.target.checked)
                              }
                            }}
                            disabled={!canSelectForMerge}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        )}
                        <div>
                          <div className="font-medium">{user.display_name}</div>
                          <div className="text-sm text-charcoal-500">{user.email}</div>
                          {user.leaguesafe_email && user.leaguesafe_email !== user.email && (
                            <div className="text-xs text-blue-600">
                              LeagueSafe: {user.leaguesafe_email}
                            </div>
                          )}
                          {user.leaguesafe_payment && (
                            <div className="text-xs text-charcoal-500 mt-1">
                              Entry: ${user.leaguesafe_payment.entry_fee} | 
                              Paid: ${user.leaguesafe_payment.paid} | 
                              Owes: ${user.leaguesafe_payment.owes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {user.is_admin && (
                        <span className="px-2 py-1 bg-gold-100 text-gold-700 text-xs rounded">
                          Admin
                        </span>
                      )}
                      
                      <span className={`px-2 py-1 text-xs rounded ${
                        user.payment_status === 'Paid' ? 'bg-green-100 text-green-700' :
                        user.payment_status === 'NotPaid' ? 'bg-red-100 text-red-700' :
                        user.payment_status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        user.payment_status === 'Manual Registration' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {user.payment_status}
                      </span>
                      
                      <div className="text-xs text-charcoal-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                      
                      {!mergeMode && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedUser(user)
                          }}
                        >
                          Manage
                        </Button>
                      )}
                    </div>
                    </div>
                  )
                })}
                
                {filteredUsers.length === 0 && (
                  <div className="text-center py-8 text-charcoal-500">
                    {searchTerm ? 'No users found matching your search.' : 'No users found.'}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Payment Matcher Modal */}
      {matchingPayment && (
        <PaymentMatcher
          payment={matchingPayment}
          users={users}
          onMatch={() => {
            setMatchingPayment(null)
            loadUsers()
            loadStats()
          }}
          onCancel={() => setMatchingPayment(null)}
        />
      )}

      {/* User Merge Modal */}
      {showMergeModal && selectedUsersForMerge.length === 2 && (
        <UserMergeModal
          sourceUser={selectedUsersForMerge[0]}
          targetUser={selectedUsersForMerge[1]}
          onMerge={handleMergeUsers}
          onCancel={() => {
            setShowMergeModal(false)
            setSelectedUsersForMerge([])
            setMergeMode(false)
          }}
        />
      )}

      {/* User Details Modal */}
      <UserDetailsModal
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onToggleAdmin={toggleAdmin}
        onSendPasswordReset={sendPasswordReset}
        onDeleteUser={deleteUser}
        onUpdatePaymentStatus={updatePaymentStatus}
        onRefresh={async () => {
          // Reload users data first
          await loadUsers()
          // Find and return the updated user from the newly loaded users list
          if (selectedUser) {
            // Wait for the state to update by manually re-fetching the specific user
            const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
            const apiKey = ENV.SUPABASE_ANON_KEY
            
            // Fetch the specific user with updated payment data
            const userResponse = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${selectedUser.id}&select=*`, {
              headers: {
                'apikey': apiKey || '',
                'Authorization': `Bearer ${apiKey || ''}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (userResponse.ok) {
              const userData = await userResponse.json()
              if (userData.length > 0) {
                const user = userData[0]
                
                // Load payment data for this user
                const paymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?user_id=eq.${user.id}&select=*`, {
                  headers: {
                    'apikey': apiKey || '',
                    'Authorization': `Bearer ${apiKey || ''}`,
                    'Content-Type': 'application/json'
                  }
                })
                
                let season_payment_history = []
                if (paymentsResponse.ok) {
                  season_payment_history = await paymentsResponse.json()
                }
                
                // Build the updated user object
                const currentSeasonPayment = season_payment_history.find((p: any) => p.season === currentSeason)
                let seasonPaymentStatus = 'No Payment'
                if (currentSeasonPayment) {
                  seasonPaymentStatus = currentSeasonPayment.status || 'No Payment'
                } else if (currentSeason === 2024 && user.payment_status) {
                  seasonPaymentStatus = user.payment_status
                }
                
                return {
                  ...user,
                  payment_status: seasonPaymentStatus,
                  leaguesafe_payment: currentSeasonPayment,
                  season_payment_history: season_payment_history
                }
              }
            }
          }
          return null
        }}
        currentSeason={currentSeason}
      />
    </div>
  )
}