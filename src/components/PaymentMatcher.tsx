import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { LeagueSafePayment, UserWithPayment } from '@/types'
import { createUserWithEmails, addEmailToUser } from '@/utils/userMatching'

interface PaymentMatcherProps {
  payment: LeagueSafePayment
  users: UserWithPayment[]
  onMatch: () => void
  onCancel: () => void
}

export default function PaymentMatcher({ payment, users, onMatch, onCancel }: PaymentMatcherProps) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleMatch = async () => {
    if (!selectedUserId) {
      setError('Please select a user to match')
      return
    }

    try {
      setLoading(true)
      setError('')

      // Add the LeagueSafe email to the user's emails
      await addEmailToUser(selectedUserId, payment.leaguesafe_email, 'leaguesafe')

      // Update the payment record to match with selected user
      const { error: updateError } = await supabase
        .from('leaguesafe_payments')
        .update({
          user_id: selectedUserId,
          is_matched: true
        })
        .eq('id', payment.id)

      if (updateError) throw updateError

      onMatch()
    } catch (err: any) {
      console.error('Error matching payment:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNewUser = async () => {
    try {
      setLoading(true)
      setError('')

      // Create new user with LeagueSafe email
      const newUser = await createUserWithEmails(
        payment.leaguesafe_email,
        payment.leaguesafe_owner_name,
        [{ email: payment.leaguesafe_email, type: 'leaguesafe' }],
        false
      )

      if (!newUser) {
        throw new Error('Failed to create new user')
      }

      // Update payment to match with new user
      const { error: updateError } = await supabase
        .from('leaguesafe_payments')
        .update({
          user_id: newUser.id,
          is_matched: true
        })
        .eq('id', payment.id)

      if (updateError) throw updateError

      onMatch()
    } catch (err: any) {
      console.error('Error creating new user:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(user =>
    user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="max-w-2xl mx-4 max-h-[80vh] overflow-auto">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span>🔗</span>
            <span>Match Payment to User</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Payment Details */}
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="font-medium text-orange-800">LeagueSafe Payment</div>
            <div className="text-sm text-orange-700 mt-1">
              <div><strong>Name:</strong> {payment.leaguesafe_owner_name}</div>
              <div><strong>Email:</strong> {payment.leaguesafe_email}</div>
              <div><strong>Status:</strong> {payment.status}</div>
              <div><strong>Entry Fee:</strong> ${payment.entry_fee} | <strong>Paid:</strong> ${payment.paid}</div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* User Search */}
          <div>
            <label className="block text-sm font-medium text-charcoal-700 mb-2">
              Search Existing Users
            </label>
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* User List */}
          <div className="max-h-64 overflow-y-auto border rounded-lg">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-charcoal-500">
                No users found matching "{searchTerm}"
              </div>
            ) : (
              <div className="space-y-1">
                {filteredUsers.map(user => (
                  <div
                    key={user.id}
                    className={`p-3 cursor-pointer hover:bg-stone-50 border-b ${
                      selectedUserId === user.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{user.display_name}</div>
                        <div className="text-sm text-charcoal-500">{user.email}</div>
                        {user.leaguesafe_email && user.leaguesafe_email !== user.email && (
                          <div className="text-xs text-blue-600">
                            LeagueSafe: {user.leaguesafe_email}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded ${
                          user.payment_status === 'Paid' ? 'bg-green-100 text-green-700' :
                          user.payment_status === 'NotPaid' ? 'bg-red-100 text-red-700' :
                          user.payment_status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {user.payment_status}
                        </span>
                        {selectedUserId === user.id && (
                          <span className="text-blue-600">✓ Selected</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t">
            <Button
              onClick={handleMatch}
              disabled={!selectedUserId || loading}
              className="flex-1"
            >
              {loading ? 'Matching...' : 'Match Selected User'}
            </Button>
            
            <Button
              onClick={handleCreateNewUser}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              {loading ? 'Creating...' : 'Create New User'}
            </Button>
            
            <Button
              onClick={onCancel}
              disabled={loading}
              variant="outline"
            >
              Cancel
            </Button>
          </div>

          <div className="text-xs text-charcoal-500 bg-blue-50 p-2 rounded">
            <strong>Tip:</strong> Select an existing user to link this payment, or create a new user account 
            using the LeagueSafe name and email.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}