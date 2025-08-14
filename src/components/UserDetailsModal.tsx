import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserWithPayment } from '@/types'

interface UserDetailsModalProps {
  user: UserWithPayment | null
  onClose: () => void
  onToggleAdmin: (userId: string, currentAdminStatus: boolean) => Promise<void>
  onSendPasswordReset: (userId: string, email: string, displayName: string) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onUpdatePaymentStatus: (userId: string, newStatus: string) => Promise<void>
  currentSeason?: number
}

export default function UserDetailsModal({
  user,
  onClose,
  onToggleAdmin,
  onSendPasswordReset,
  onDeleteUser,
  onUpdatePaymentStatus,
  currentSeason = 2024
}: UserDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Initialize selected payment status when user changes
  React.useEffect(() => {
    if (user) {
      const currentSeasonPayment = user.season_payment_history?.find((p: any) => p.season === currentSeason)
      const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && user.payment_status !== 'No Payment' ? user.payment_status : 'No Payment')
      setSelectedPaymentStatus(currentStatus)
      setHasUnsavedChanges(false)
    }
  }, [user, currentSeason])

  if (!user) return null

  const handleToggleAdmin = async () => {
    const action = user.is_admin ? 'remove admin access from' : 'grant admin access to'
    if (!confirm(`Are you sure you want to ${action} ${user.display_name}?`)) {
      return
    }
    
    setLoading(true)
    try {
      await onToggleAdmin(user.id, user.is_admin)
    } finally {
      setLoading(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!confirm(`Send a password reset email to ${user.display_name} (${user.email})?`)) {
      return
    }
    
    setLoading(true)
    try {
      await onSendPasswordReset(user.id, user.email, user.display_name)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!confirm(`Are you sure you want to delete ${user.display_name}? This will permanently delete their account, picks, and payment records. This action cannot be undone.`)) {
      return
    }
    
    // Double confirmation for delete
    if (!confirm('This is your final warning. Are you absolutely sure you want to delete this user? Type "DELETE" to confirm.')) {
      return
    }
    
    setLoading(true)
    try {
      await onDeleteUser(user.id)
      onClose() // Close modal after successful delete
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentStatusChange = (newStatus: string) => {
    setSelectedPaymentStatus(newStatus)
    const currentSeasonPayment = user.season_payment_history?.find((p: any) => p.season === currentSeason)
    const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && user.payment_status !== 'No Payment' ? user.payment_status : 'No Payment')
    setHasUnsavedChanges(newStatus !== currentStatus)
  }

  const handleSavePaymentStatus = async () => {
    console.log('🎯 NEW VERSION 2025-08-13 - handleSavePaymentStatus called')
    console.log('🔄 hasUnsavedChanges:', hasUnsavedChanges)
    console.log('🔄 selectedPaymentStatus:', selectedPaymentStatus)
    
    if (!hasUnsavedChanges) {
      console.log('⚠️ No unsaved changes, skipping save')
      return
    }
    
    setLoading(true)
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log('⏰ Payment update timed out after 15 seconds')
      setLoading(false)
      alert('Payment update timed out. Please try again.')
    }, 15000)
    
    try {
      console.log('🔄 Calling onUpdatePaymentStatus...')
      await onUpdatePaymentStatus(user.id, selectedPaymentStatus)
      console.log('✅ onUpdatePaymentStatus completed successfully')
      setHasUnsavedChanges(false)
      clearTimeout(timeoutId)
    } catch (error) {
      console.error('❌ Error in handleSavePaymentStatus:', error)
      clearTimeout(timeoutId)
      alert(`Failed to update payment status: ${error.message}`)
    } finally {
      console.log('🏁 Setting loading to false')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>User Details: {user.display_name}</span>
            <Button variant="outline" size="sm" onClick={onClose}>
              ✕ Close
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Email</h4>
              <p className="font-mono text-sm">{user.email}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Display Name</h4>
              <p>{user.display_name}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">User ID</h4>
              <p className="font-mono text-xs text-gray-500">{user.id}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Account Type</h4>
              <span className={`px-2 py-1 text-xs rounded ${
                user.is_admin ? 'bg-gold-100 text-gold-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {user.is_admin ? 'Administrator' : 'User'}
              </span>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Created</h4>
              <p className="text-sm">{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
            <div className="md:col-span-2">
              <h4 className="font-semibold text-sm text-gray-600 mb-2">Payment Status by Season</h4>
              <div className="space-y-1">
                {[2024, 2025, 2026].map(season => {
                  const seasonPayment = user.season_payment_history?.find((p: any) => p.season === season)
                  const status = seasonPayment?.status || (season === 2024 && user.payment_status !== 'No Payment' ? user.payment_status : 'No Payment')
                  
                  return (
                    <div key={season} className="flex items-center justify-between">
                      <span className="text-sm font-medium">Season {season}:</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        status === 'Paid' ? 'bg-green-100 text-green-700' :
                        status === 'NotPaid' ? 'bg-red-100 text-red-700' :
                        status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        status === 'Manual Registration' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Payment History */}
          {user.season_payment_history && user.season_payment_history.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Payment History</h4>
              <div className="space-y-2">
                {user.season_payment_history.map((payment: any) => (
                  <div key={`${payment.season}-${payment.id}`} className="border rounded p-3 text-sm">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Season {payment.season}</span>
                      <span className={`px-2 py-1 text-xs rounded ${
                        payment.status === 'Paid' ? 'bg-green-100 text-green-700' :
                        payment.status === 'NotPaid' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {payment.status}
                      </span>
                    </div>
                    {payment.entry_fee && (
                      <p>Entry Fee: ${payment.entry_fee} | Paid: ${payment.paid || 0} | Owes: ${payment.owes || 0}</p>
                    )}
                    {payment.leaguesafe_email && payment.leaguesafe_email !== user.email && (
                      <p className="text-blue-600">LeagueSafe Email: {payment.leaguesafe_email}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Season Payment Status Update */}
          <div>
            <h4 className="font-semibold mb-3">Update Payment Status for Season {currentSeason}</h4>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['Paid', 'NotPaid', 'Pending', 'Manual Registration', 'No Payment'].map(status => (
                  <Button
                    key={status}
                    variant={selectedPaymentStatus === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePaymentStatusChange(status)}
                    disabled={loading}
                    className="text-xs"
                  >
                    {status}
                  </Button>
                ))}
              </div>
              
              {hasUnsavedChanges && (
                <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Status changed to: <span className="font-bold">{selectedPaymentStatus}</span>
                    </p>
                    <p className="text-xs text-yellow-600">Click Save to apply changes</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        console.log('💾 SAVE BUTTON CLICKED')
                        handleSavePaymentStatus()
                      }}
                      disabled={loading}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      {loading ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const currentSeasonPayment = user.season_payment_history?.find((p: any) => p.season === currentSeason)
                        const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && user.payment_status !== 'No Payment' ? user.payment_status : 'No Payment')
                        setSelectedPaymentStatus(currentStatus)
                        setHasUnsavedChanges(false)
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              
              <p className="text-xs text-gray-500">
                Current status: <span className="font-medium">{
                  (() => {
                    const currentSeasonPayment = user.season_payment_history?.find((p: any) => p.season === currentSeason)
                    return currentSeasonPayment?.status || (currentSeason === 2024 && user.payment_status !== 'No Payment' ? user.payment_status : 'No Payment')
                  })()
                }</span> for Season {currentSeason}
              </p>
            </div>
          </div>

          {/* Admin Actions */}
          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3 text-red-600">Admin Actions</h4>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleToggleAdmin}
                disabled={loading}
                variant="outline"
                size="sm"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {user.is_admin ? 'Remove Admin' : 'Make Admin'}
              </Button>
              
              <Button
                onClick={handleSendPasswordReset}
                disabled={loading}
                variant="outline"
                size="sm"
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
              >
                Send Password Reset
              </Button>
              
              <Button
                onClick={handleDeleteUser}
                disabled={loading}
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Delete User
              </Button>
            </div>
            
            {loading && (
              <p className="text-sm text-gray-500 mt-2">Processing...</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}