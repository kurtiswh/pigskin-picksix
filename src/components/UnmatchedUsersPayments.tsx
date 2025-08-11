import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { User, LeagueSafePayment } from '@/types'
import { getUnmatchedUsersAndPayments, addEmailToUser } from '@/utils/userMatching'
import PaymentMatcher from './PaymentMatcher'

interface UnmatchedUsersPaymentsProps {
  season: number
  onMatchComplete?: () => void
}

export default function UnmatchedUsersPayments({ season, onMatchComplete }: UnmatchedUsersPaymentsProps) {
  const [unmatchedUsers, setUnmatchedUsers] = useState<User[]>([])
  const [unmatchedPayments, setUnmatchedPayments] = useState<LeagueSafePayment[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<LeagueSafePayment | null>(null)
  const [emailFilter, setEmailFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')

  useEffect(() => {
    loadData()
  }, [season])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load unmatched users and payments
      const { unmatchedUsers: users, unmatchedPayments: payments } = await getUnmatchedUsersAndPayments(season)
      setUnmatchedUsers(users)
      setUnmatchedPayments(payments)

      // Load all users for matching
      const { data: allUsersData, error } = await supabase
        .from('users')
        .select('*')
        .order('display_name')

      if (error) {
        console.error('Error loading all users:', error)
      } else {
        setAllUsers(allUsersData || [])
      }
    } catch (error) {
      console.error('Error loading unmatched data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Function is available for future manual matching features
  // Currently using PaymentMatcher modal instead
  const handleManualMatch = async (userId: string, paymentId: string) => {
    try {
      const payment = unmatchedPayments.find(p => p.id === paymentId)
      if (!payment) return

      // Add LeagueSafe email to user
      await addEmailToUser(userId, payment.leaguesafe_email, 'leaguesafe')

      // Update payment to be matched
      const { error } = await supabase
        .from('leaguesafe_payments')
        .update({
          user_id: userId,
          is_matched: true
        })
        .eq('id', paymentId)

      if (error) {
        console.error('Error matching payment:', error)
        return
      }

      // Reload data
      await loadData()
      onMatchComplete?.()
    } catch (error) {
      console.error('Error in manual match:', error)
    }
  }

  const filteredUnmatchedUsers = unmatchedUsers.filter(user =>
    user.display_name.toLowerCase().includes(nameFilter.toLowerCase()) ||
    user.email.toLowerCase().includes(emailFilter.toLowerCase()) ||
    (user.leaguesafe_email && user.leaguesafe_email.toLowerCase().includes(emailFilter.toLowerCase()))
  )

  const filteredUnmatchedPayments = unmatchedPayments.filter(payment =>
    payment.leaguesafe_owner_name.toLowerCase().includes(nameFilter.toLowerCase()) ||
    payment.leaguesafe_email.toLowerCase().includes(emailFilter.toLowerCase())
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-pigskin-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="mt-2 text-charcoal-600">Loading unmatched data...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Unmatched Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                Filter by Email
              </label>
              <Input
                placeholder="Search emails..."
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                Filter by Name
              </label>
              <Input
                placeholder="Search names..."
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Unmatched Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>👤</span>
              <span>Users without LeagueSafe Payment ({filteredUnmatchedUsers.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUnmatchedUsers.length === 0 ? (
              <p className="text-center text-charcoal-500 py-8">
                {unmatchedUsers.length === 0 ? 'All users have payments!' : 'No users match filters'}
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredUnmatchedUsers.map(user => (
                  <div key={user.id} className="p-3 border border-orange-200 bg-orange-50 rounded-lg">
                    <div className="font-medium text-orange-800">{user.display_name}</div>
                    <div className="text-sm text-orange-700">
                      Primary: {user.email}
                      {user.leaguesafe_email && user.leaguesafe_email !== user.email && (
                        <div>LeagueSafe: {user.leaguesafe_email}</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-orange-600">
                      Registered but no payment record for {season}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unmatched Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span>💰</span>
              <span>LeagueSafe Payments without Users ({filteredUnmatchedPayments.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUnmatchedPayments.length === 0 ? (
              <p className="text-center text-charcoal-500 py-8">
                {unmatchedPayments.length === 0 ? 'All payments are matched!' : 'No payments match filters'}
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredUnmatchedPayments.map(payment => (
                  <div key={payment.id} className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-blue-800">{payment.leaguesafe_owner_name}</div>
                        <div className="text-sm text-blue-700">{payment.leaguesafe_email}</div>
                        <div className="text-xs text-blue-600 mt-1">
                          Status: {payment.status} | Paid: ${payment.paid}
                        </div>
                      </div>
                      <Button
                        onClick={() => setSelectedPayment(payment)}
                        size="sm"
                        variant="outline"
                      >
                        Match
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {allUsers.length - unmatchedUsers.length}
              </div>
              <div className="text-sm text-green-700">Matched Users</div>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{unmatchedUsers.length}</div>
              <div className="text-sm text-orange-700">Users Need Payment</div>
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{unmatchedPayments.length}</div>
              <div className="text-sm text-blue-700">Payments Need User</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Matcher Modal */}
      {selectedPayment && (
        <PaymentMatcher
          payment={selectedPayment}
          users={allUsers.map(user => ({ ...user, payment_status: 'No Payment' }))}
          onMatch={() => {
            setSelectedPayment(null)
            loadData()
            onMatchComplete?.()
          }}
          onCancel={() => setSelectedPayment(null)}
        />
      )}
    </div>
  )
}