import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { UserWithPayment, LeagueSafePayment } from '@/types'
import { EmailService } from '@/services/emailService'
import LeagueSafeUpload from './LeagueSafeUpload'
import PaymentMatcher from './PaymentMatcher'
import UnmatchedUsersPayments from './UnmatchedUsersPayments'

interface UserStats {
  totalUsers: number
  adminUsers: number
  usersWithPicks: number
  paidUsers: number
  unpaidUsers: number
  unmatchedPayments: number
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserWithPayment[]>([])
  // Removed unmatchedPayments state - now handled by UnmatchedUsersPayments component
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState('')
  const [currentSeason, setCurrentSeason] = useState(2024) // Default to 2024 where the data is
  const [matchingPayment, setMatchingPayment] = useState<LeagueSafePayment | null>(null)

  useEffect(() => {
    loadUsers()
    loadStats()
  }, [currentSeason]) // Reload when season changes

  const loadUsers = async () => {
    try {
      setLoading(true)
      
      // Load all users first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .order('display_name', { ascending: true })

      if (userError) throw userError

      // Load all payments for current season
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('*')
        .eq('season', currentSeason)

      if (paymentsError) throw paymentsError

      // Process users to add payment status
      const usersWithPayments: UserWithPayment[] = (userData || []).map(user => {
        const currentSeasonPayment = paymentsData?.find(
          (p: any) => p.user_id === user.id
        )
        
        // Prioritize current season payment status over stored user payment_status
        let paymentStatus: string
        if (currentSeasonPayment) {
          // Has payment record for current season - use that status
          paymentStatus = currentSeasonPayment.status
        } else if (user.payment_status === 'Manual Registration') {
          // Keep Manual Registration for users who manually signed up
          paymentStatus = 'Manual Registration'
        } else {
          // No payment for current season - show as No Payment
          paymentStatus = 'No Payment'
        }
        
        return {
          ...user,
          payment_status: paymentStatus,
          leaguesafe_payment: currentSeasonPayment
        }
      })

      setUsers(usersWithPayments)

      // Unmatched payments are now handled by UnmatchedUsersPayments component
      // const unmatchedData = paymentsData?.filter(p => !p.is_matched || !p.user_id) || []

    } catch (err: any) {
      console.error('Error loading users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      // Get total users
      const { count: totalUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      // Get admin users
      const { count: adminUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_admin', true)

      // Get users with picks for current season
      const { data: usersWithPicks } = await supabase
        .from('picks')
        .select('user_id')
        .eq('season', currentSeason)

      const uniqueUsersWithPicks = new Set(usersWithPicks?.map(p => p.user_id) || []).size

      // Get paid users for current season
      const { count: paidUsers } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('season', currentSeason)
        .eq('status', 'Paid')
        .eq('is_matched', true)

      // Get unpaid users (users with payment records but not paid)
      const { count: unpaidUsers } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('season', currentSeason)
        .neq('status', 'Paid')
        .eq('is_matched', true)

      // Get unmatched payments
      const { count: unmatchedPayments } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('season', currentSeason)
        .eq('is_matched', false)

      setStats({
        totalUsers: totalUsers || 0,
        adminUsers: adminUsers || 0,
        usersWithPicks: uniqueUsersWithPicks,
        paidUsers: paidUsers || 0,
        unpaidUsers: unpaidUsers || 0,
        unmatchedPayments: unmatchedPayments || 0
      })
    } catch (err: any) {
      console.error('Error loading stats:', err)
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

      await loadStats()
    } catch (err: any) {
      console.error('Error updating admin status:', err)
      setError(err.message)
    }
  }

  const updatePaymentStatus = async (userId: string, newStatus: 'Paid' | 'NotPaid' | 'Pending' | 'Manual Registration' | 'No Payment') => {
    try {
      // Update the user's payment status in the users table
      const { error: userError } = await supabase
        .from('users')
        .update({ payment_status: newStatus })
        .eq('id', userId)

      if (userError) throw userError

      // Also update leaguesafe_payments if it exists for this user
      const { error: paymentError } = await supabase
        .from('leaguesafe_payments')
        .update({ status: newStatus })
        .eq('user_id', userId)
        .eq('season', currentSeason)

      // Don't fail if there's no leaguesafe payment record - that's okay
      if (paymentError && paymentError.code !== 'PGRST116') {
        console.warn('Could not update leaguesafe payment (might not exist):', paymentError)
      }

      // Refresh data
      await loadUsers()
      await loadStats()
    } catch (err: any) {
      console.error('Error updating payment status:', err)
      setError(err.message)
    }
  }

  const sendPasswordReset = async (userId: string, email: string, displayName: string) => {
    if (!confirm(`Send a password reset email to ${displayName} (${email})?`)) {
      return
    }

    try {
      const result = await EmailService.sendPasswordReset(userId, email, displayName)
      
      if (result.success) {
        alert(`✅ Password reset email sent to ${email}`)
      } else {
        alert(`❌ Failed to send password reset: ${result.error}`)
      }
    } catch (err: any) {
      console.error('Error sending password reset:', err)
      alert(`❌ Error sending password reset: ${err.message}`)
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This will also delete all their picks and payment records and cannot be undone.')) {
      return
    }

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
    }
  }

  const handleUploadComplete = () => {
    loadUsers()
    loadStats()
  }

  const filteredUsers = users.filter(user =>
    user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
                className="w-64"
              />
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
              <div className="text-sm text-charcoal-500 mb-4">
                Showing {filteredUsers.length} of {users.length} users
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredUsers.map(user => (
                  <div
                    key={user.id}
                    className={`flex items-center justify-between p-3 border rounded-lg hover:bg-stone-50 ${
                      user.payment_status === 'No Payment' ? 'border-orange-300 bg-orange-50' : 
                      user.payment_status === 'NotPaid' ? 'border-red-300 bg-red-50' :
                      user.payment_status === 'Paid' ? 'border-green-300 bg-green-50' : 
                      user.payment_status === 'Manual Registration' ? 'border-blue-300 bg-blue-50' :
                      'border-yellow-300 bg-yellow-50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
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
                      
                      <select
                        value={user.payment_status}
                        onChange={(e) => updatePaymentStatus(user.id, e.target.value as 'Paid' | 'NotPaid' | 'Pending' | 'Manual Registration' | 'No Payment')}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="Paid">Paid</option>
                        <option value="NotPaid">Not Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Manual Registration">Manual Registration</option>
                        <option value="No Payment">No Payment</option>
                      </select>
                      
                      <div className="text-xs text-charcoal-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </div>
                      
                      <Button
                        onClick={() => toggleAdmin(user.id, user.is_admin)}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                      >
                        {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                      </Button>
                      
                      <Button
                        onClick={() => sendPasswordReset(user.id, user.email, user.display_name)}
                        variant="outline"
                        size="sm"
                        className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                        title="Send password reset email"
                      >
                        Reset Password
                      </Button>
                      
                      <Button
                        onClick={() => deleteUser(user.id)}
                        variant="outline"
                        size="sm"
                        className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                
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

      {/* Unmatched Users and Payments */}
      <UnmatchedUsersPayments 
        season={currentSeason}
        onMatchComplete={handleUploadComplete}
      />

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
    </div>
  )
}