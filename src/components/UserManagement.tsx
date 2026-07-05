import { useState, useEffect } from 'react'
import { useSeasonState } from '@/hooks/useCurrentSeason'
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

// PostgREST caps every response at 1000 rows. Several tables here (users ~1900,
// leaguesafe_payments ~4500) exceed that, so a single request returns an
// arbitrary partial slice — which silently broke payment matching and stats.
// This pages through the full result set with a stable order.
async function fetchAllRows<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000
  let from = 0
  const all: T[] = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

export default function UserManagement() {
  console.log('🚨🚨🚨 UserManagement component loaded - NEW VERSION! 🚨🚨🚨')
  
  const [users, setUsers] = useState<UserWithPayment[]>([])
  // Removed unmatchedPayments state - now handled by UnmatchedUsersPayments component
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all')
  // Roster/entry cleanup (Part B / B5): default the list to actual participants
  // this season (has picks, or any payment record) rather than every account.
  const [participationFilter, setParticipationFilter] = useState<'played' | 'all'>('played')
  const [playedUserIds, setPlayedUserIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [currentSeason, setCurrentSeason] = useSeasonState() // Defaults to the active season
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

  // Load the set of users who actually played this season (have picks, auth or
  // tied-anonymous). Used by the "Played this season" participation filter.
  useEffect(() => {
    const loadParticipation = async () => {
      try {
        const [picksRes, anonRes] = await Promise.all([
          supabase.from('picks').select('user_id').eq('season', currentSeason),
          supabase.from('anonymous_picks').select('assigned_user_id').eq('season', currentSeason).not('assigned_user_id', 'is', null),
        ])
        const ids = new Set<string>()
        for (const r of (picksRes.data as any[]) || []) if (r.user_id) ids.add(r.user_id)
        for (const r of (anonRes.data as any[]) || []) if (r.assigned_user_id) ids.add(r.assigned_user_id)
        setPlayedUserIds(ids)
      } catch (e) {
        console.warn('UserManagement: participation load failed', e)
      }
    }
    loadParticipation()
  }, [currentSeason])

  const loadUsers = async () => {
    try {
      setLoading(true)
      console.log(`🔄 UserManagement: Loading users for season ${currentSeason}...`)

      // Load ALL users (paginated — the table exceeds PostgREST's 1000-row cap,
      // and an arbitrary 1000-row slice made payment matching + stats wrong).
      const usersData = await fetchAllRows((from, to) =>
        supabase.from('users').select('*').order('id', { ascending: true }).range(from, to))
      console.log(`✅ UserManagement: Loaded ${usersData.length} users from database`)

      // Payments for the selected season (paginated)
      const currentSeasonPayments = await fetchAllRows((from, to) =>
        supabase.from('leaguesafe_payments').select('*').eq('season', currentSeason)
          .order('id', { ascending: true }).range(from, to))
      console.log(`✅ UserManagement: Loaded ${currentSeasonPayments.length} payments for season ${currentSeason}`)
      console.log('🔍 Payment statuses breakdown:', currentSeasonPayments.reduce((acc: any, p: any) => {
        acc[p.status] = (acc[p.status] || 0) + 1
        return acc
      }, {}))

      // All payment history for the user-details modal (also exceeds 1000 rows)
      const allPaymentsData = await fetchAllRows((from, to) =>
        supabase.from('leaguesafe_payments').select('*').order('id', { ascending: true }).range(from, to))
      console.log(`✅ UserManagement: Loaded ${allPaymentsData.length} total payment records`)

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
    // Use provided users data or fall back to state (for manual refresh)
    const currentUsers = usersData || users
    try {
      console.log('📊 UserManagement: Loading real stats...')
      
      // Distinct users with picks this season (paginated)
      const picks = await fetchAllRows((from, to) =>
        supabase.from('picks').select('user_id').eq('season', currentSeason)
          .order('id', { ascending: true }).range(from, to))
      const pickUserIds = new Set<string>(picks.map((p: any) => p.user_id).filter(Boolean))
      const usersWithPicks = pickUserIds.size

      // Season cohort = users who actually participated this season: they have a
      // payment record for the season (season status !== 'No Payment') OR made
      // picks. The tiles are a "Season {year} Overview", so we scope them to the
      // cohort instead of counting all ~1,900 all-time accounts (which made
      // Total/Unpaid wildly overstated once every historic account was loaded).
      const cohort = currentUsers.filter(u => u.payment_status !== 'No Payment' || pickUserIds.has(u.id))

      const totalUsers = cohort.length
      const adminUsers = currentUsers.filter(u => u.is_admin).length // league-wide, not season-scoped
      const paidUsers = cohort.filter(u => ['Paid', 'Manual Registration'].includes(u.payment_status)).length
      const unpaidUsers = cohort.filter(u => ['NotPaid', 'No Payment'].includes(u.payment_status)).length

      console.log('🔍 Stats calculation details:', {
        totalUsers, paidCount: paidUsers, unpaidCount: unpaidUsers, adminUsers, cohortSize: cohort.length,
      })

      // Unmatched season payments = a payment whose user_id isn't among our users
      // (includes null user_ids). Paginated; matched against a Set for speed.
      const seasonPayments = await fetchAllRows((from, to) =>
        supabase.from('leaguesafe_payments').select('user_id').eq('season', currentSeason)
          .order('id', { ascending: true }).range(from, to))
      const userIdSet = new Set(currentUsers.map(u => u.id))
      const unmatchedPayments = seasonPayments.filter((p: any) => !p.user_id || !userIdSet.has(p.user_id)).length

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

    // Participation filter: "played" = has picks this season OR has any payment
    // record (anything other than "No Payment"). Admins are always shown.
    const played = playedUserIds.has(user.id) || (user.payment_status && user.payment_status !== 'No Payment')
    const matchesParticipation = participationFilter === 'all' || user.is_admin || played

    return matchesSearch && matchesPaymentStatus && matchesParticipation
  })

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#4B3621]">Season {currentSeason} Overview</h3>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-charcoal-700">Season:</label>
              <select
                value={currentSeason}
                onChange={(e) => setCurrentSeason(parseInt(e.target.value))}
                className="border border-[#e7e2da] rounded px-3 py-1 text-sm text-charcoal-700 bg-white"
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
                <div className="text-2xl font-bold text-[#4B3621] tabular-nums">{stats.totalUsers}</div>
                <div className="text-sm text-charcoal-500">Total Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-[#1f7a44] tabular-nums">{stats.paidUsers}</div>
                <div className="text-sm text-charcoal-500">Paid Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-[#d1495b] tabular-nums">{stats.unpaidUsers}</div>
                <div className="text-sm text-charcoal-500">Unpaid Users</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-[#b06a1a] tabular-nums">{stats.unmatchedPayments}</div>
                <div className="text-sm text-charcoal-500">Unmatched</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-[#4B3621] tabular-nums">{stats.usersWithPicks}</div>
                <div className="text-sm text-charcoal-500">With Picks</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-[#C9A04E] tabular-nums">{stats.adminUsers}</div>
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
          <CardTitle className="flex items-center justify-between text-[#4B3621]">
            <span>User Management</span>
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48"
              />
              <select
                value={participationFilter}
                onChange={(e) => setParticipationFilter(e.target.value as 'played' | 'all')}
                className="border border-[#e7e2da] rounded px-3 py-2 text-sm text-charcoal-700 bg-white"
                title="Show only participants this season, or every account"
              >
                <option value="played">Played this season</option>
                <option value="all">All accounts</option>
              </select>
              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="border border-[#e7e2da] rounded px-3 py-2 text-sm text-charcoal-700 bg-white"
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
                variant={mergeMode ? "primary" : "outline"}
                size="sm"
                className={mergeMode ? "bg-[#4B3621] text-white hover:bg-[#3a2a19]" : "border-[#e7e2da]"}
              >
                {mergeMode ? 'Exit Merge Mode' : 'Merge Users'}
              </Button>
              {mergeMode && selectedUsersForMerge.length === 2 && (
                <Button
                  onClick={() => setShowMergeModal(true)}
                  size="sm"
                  className="bg-[#1f7a44] text-white hover:bg-[#1a6b3b]"
                >
                  Start Merge
                </Button>
              )}
              <Button onClick={loadUsers} variant="outline" size="sm" className="border-[#e7e2da]">
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b] rounded-lg mb-4 text-sm">
              <div className="font-medium mb-1">Error</div>
              <div>{error}</div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-[#4B3621] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
                  <div className="text-sm text-[#4B3621]">
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
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                        isSelectedForMerge ? 'border-[#C9A04E] bg-[#fbf4e3] ring-1 ring-inset ring-[#C9A04E]' :
                        user.payment_status === 'No Payment' ? 'border-[#f0dcb0] bg-[#fff5e2] hover:bg-[#fdeecb]' :
                        user.payment_status === 'NotPaid' ? 'border-[#f2c9d1] bg-[#fbe9ec] hover:bg-[#f8dbe1]' :
                        user.payment_status === 'Paid' ? 'border-[#bfe3cc] bg-[#e6f4ea] hover:bg-[#d7edde]' :
                        user.payment_status === 'Manual Registration' ? 'border-[#e7e2da] bg-[#faf8f4] hover:bg-[#f2ede4]' :
                        'border-[#f0dcb0] bg-[#fff5e2] hover:bg-[#fdeecb]'
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
                            className="w-4 h-4 text-[#4B3621] border-[#e7e2da] rounded focus:ring-[#C9A04E]"
                          />
                        )}
                        <div>
                          <div className="font-medium text-[#4B3621]">{user.display_name}</div>
                          <div className="text-sm text-charcoal-500">{user.email}</div>
                          {user.leaguesafe_email && user.leaguesafe_email !== user.email && (
                            <div className="text-xs text-charcoal-500">
                              LeagueSafe: {user.leaguesafe_email}
                            </div>
                          )}
                          {user.leaguesafe_payment && (
                            <div className="text-xs text-charcoal-500 mt-1 tabular-nums">
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
                        <span className="px-2 py-1 bg-[#faf3e0] border border-[#f0dcb0] text-[#C9A04E] text-xs rounded">
                          Admin
                        </span>
                      )}

                      <span className={`px-2 py-1 text-xs rounded ${
                        user.payment_status === 'Paid' ? 'bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44]' :
                        user.payment_status === 'NotPaid' ? 'bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b]' :
                        user.payment_status === 'Pending' ? 'bg-[#fff5e2] border border-[#f0dcb0] text-[#b06a1a]' :
                        user.payment_status === 'Manual Registration' ? 'bg-[#faf8f4] border border-[#e7e2da] text-charcoal-700' :
                        'bg-[#fff5e2] border border-[#f0dcb0] text-[#b06a1a]'
                      }`}>
                        {user.payment_status}
                      </span>

                      <div className="text-xs text-charcoal-500 tabular-nums">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>

                      {!mergeMode && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs border-[#e7e2da]"
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