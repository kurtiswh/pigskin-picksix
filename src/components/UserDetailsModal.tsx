import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UserWithPayment, UserEmail, UserMergeHistory } from '@/types'
import { UserMergeService } from '@/services/userMergeService'
import { supabase } from '@/lib/supabase'

interface UserDetailsModalProps {
  user: UserWithPayment | null
  onClose: () => void
  onToggleAdmin: (userId: string, currentAdminStatus: boolean) => Promise<void>
  onSendPasswordReset: (userId: string, email: string, displayName: string) => Promise<void>
  onDeleteUser: (userId: string) => Promise<void>
  onUpdatePaymentStatus: (userId: string, newStatus: string) => Promise<void>
  onRefresh?: () => Promise<UserWithPayment | null>
  currentSeason?: number
}

export default function UserDetailsModal({
  user,
  onClose,
  onToggleAdmin,
  onSendPasswordReset,
  onDeleteUser,
  onUpdatePaymentStatus,
  onRefresh,
  currentSeason = 2025
}: UserDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [userEmails, setUserEmails] = useState<UserEmail[]>([])
  const [mergeHistory, setMergeHistory] = useState<UserMergeHistory[]>([])
  const [emailsLoading, setEmailsLoading] = useState(true)
  const [leaguesafeEmail, setLeaguesafeEmail] = useState<string>('')
  const [hasLeaguesafeEmailChanged, setHasLeaguesafeEmailChanged] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserWithPayment | null>(user)

  // Update currentUser when user prop changes
  React.useEffect(() => {
    setCurrentUser(user)
  }, [user])

  // Initialize selected payment status and leaguesafe email when user changes
  React.useEffect(() => {
    if (currentUser) {
      const currentSeasonPayment = currentUser.season_payment_history?.find((p: any) => p.season === currentSeason)
      const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && currentUser.payment_status !== 'No Payment' ? currentUser.payment_status : 'No Payment')
      setSelectedPaymentStatus(currentStatus)
      setHasUnsavedChanges(false)
      setLeaguesafeEmail(currentUser.leaguesafe_email || '')
      setHasLeaguesafeEmailChanged(false)
    }
  }, [currentUser, currentSeason])

  // Load user emails and merge history when user changes
  useEffect(() => {
    if (currentUser) {
      loadUserData()
    }
  }, [currentUser])

  const loadUserData = async () => {
    if (!currentUser) return
    
    setEmailsLoading(true)
    try {
      const [emails, history] = await Promise.all([
        UserMergeService.getUserEmails(currentUser.id),
        UserMergeService.getUserMergeHistory(currentUser.id)
      ])
      
      setUserEmails(emails)
      setMergeHistory(history)
    } catch (error) {
      console.error('Error loading user data:', error)
    } finally {
      setEmailsLoading(false)
    }
  }

  if (!currentUser) return null

  const handleToggleAdmin = async () => {
    const action = currentUser.is_admin ? 'remove admin access from' : 'grant admin access to'
    if (!confirm(`Are you sure you want to ${action} ${currentUser.display_name}?`)) {
      return
    }
    
    setLoading(true)
    try {
      await onToggleAdmin(currentUser.id, currentUser.is_admin)
    } finally {
      setLoading(false)
    }
  }

  const handleSendPasswordReset = async () => {
    if (!confirm(`Send a password reset email to ${currentUser.display_name} (${currentUser.email})?`)) {
      return
    }
    
    setLoading(true)
    try {
      await onSendPasswordReset(currentUser.id, currentUser.email, currentUser.display_name)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!confirm(`Are you sure you want to delete ${currentUser.display_name}? This will permanently delete their account, picks, and payment records. This action cannot be undone.`)) {
      return
    }
    
    // Double confirmation for delete
    if (!confirm('This is your final warning. Are you absolutely sure you want to delete this user? Type "DELETE" to confirm.')) {
      return
    }
    
    setLoading(true)
    try {
      await onDeleteUser(currentUser.id)
      onClose() // Close modal after successful delete
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentStatusChange = (newStatus: string) => {
    setSelectedPaymentStatus(newStatus)
    const currentSeasonPayment = currentUser.season_payment_history?.find((p: any) => p.season === currentSeason)
    const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && currentUser.payment_status !== 'No Payment' ? currentUser.payment_status : 'No Payment')
    setHasUnsavedChanges(newStatus !== currentStatus)
  }

  const handleSavePaymentStatus = async () => {
    console.log('🎯 handleSavePaymentStatus called')
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
      await onUpdatePaymentStatus(currentUser.id, selectedPaymentStatus)
      console.log('✅ onUpdatePaymentStatus completed successfully')
      setHasUnsavedChanges(false)
      clearTimeout(timeoutId)
      
      // Refresh the parent component data and get updated user data
      if (onRefresh) {
        console.log('🔄 Refreshing parent component data...')
        const updatedUser = await onRefresh()
        if (updatedUser) {
          console.log('✅ Received updated user data from parent')
          setCurrentUser(updatedUser)
        }
      }
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
            <span>User Details: {currentUser.display_name}</span>
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
              <p className="font-mono text-sm">{currentUser.email}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Display Name</h4>
              <p>{currentUser.display_name}</p>
            </div>
            <div className="md:col-span-2">
              <h4 className="font-semibold text-sm text-gray-600 mb-1">LeagueSafe Email</h4>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={leaguesafeEmail}
                  onChange={(e) => {
                    setLeaguesafeEmail(e.target.value)
                    setHasLeaguesafeEmailChanged(e.target.value !== (currentUser.leaguesafe_email || ''))
                  }}
                  placeholder="Enter LeagueSafe email"
                  className="text-sm"
                  disabled={loading}
                />
                {hasLeaguesafeEmailChanged && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        setLoading(true)
                        try {
                          const { error } = await supabase
                            .from('users')
                            .update({ leaguesafe_email: leaguesafeEmail || null })
                            .eq('id', currentUser.id)
                          
                          if (error) throw error
                          
                          setHasLeaguesafeEmailChanged(false)
                          if (onRefresh) await onRefresh()
                          alert('LeagueSafe email updated successfully')
                        } catch (err: any) {
                          console.error('Error updating LeagueSafe email:', err)
                          alert(`Failed to update LeagueSafe email: ${err.message}`)
                        } finally {
                          setLoading(false)
                        }
                      }}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLeaguesafeEmail(currentUser.leaguesafe_email || '')
                        setHasLeaguesafeEmailChanged(false)
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              {currentUser.leaguesafe_email && !hasLeaguesafeEmailChanged && (
                <p className="text-xs text-gray-500 mt-1">Current: {currentUser.leaguesafe_email}</p>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">User ID</h4>
              <p className="font-mono text-xs text-gray-500">{currentUser.id}</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Account Type</h4>
              <span className={`px-2 py-1 text-xs rounded ${
                currentUser.is_admin ? 'bg-gold-100 text-gold-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {currentUser.is_admin ? 'Administrator' : 'User'}
              </span>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-gray-600 mb-1">Created</h4>
              <p className="text-sm">{new Date(currentUser.created_at).toLocaleDateString()}</p>
            </div>
            <div className="md:col-span-2">
              <h4 className="font-semibold text-sm text-gray-600 mb-2">Payment Status by Season</h4>
              <div className="space-y-1">
                {[2024, 2025, 2026].map(season => {
                  const seasonPayment = currentUser.season_payment_history?.find((p: any) => p.season === season)
                  const status = seasonPayment?.status || (season === 2024 && currentUser.payment_status !== 'No Payment' ? currentUser.payment_status : 'No Payment')
                  
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

          {/* Email Addresses */}
          <div>
            <h4 className="font-semibold mb-3">Email Addresses</h4>
            {emailsLoading ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Loading emails...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Primary email from user record */}
                <div className="border rounded p-3 text-sm bg-blue-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{currentUser.email}</span>
                    <div className="flex gap-2">
                      <Badge variant="default" className="bg-blue-600">Primary</Badge>
                      <Badge variant="outline" className="text-green-600 border-green-300">Account</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Main account email address</p>
                </div>
                
                {/* Additional emails from user_emails table */}
                {userEmails.map((emailRecord) => (
                  <div key={emailRecord.id} className="border rounded p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{emailRecord.email}</span>
                      <div className="flex gap-2">
                        <Badge 
                          variant={emailRecord.is_primary ? "default" : "outline"}
                          className={
                            emailRecord.email_type === 'leaguesafe' ? 'bg-green-600 text-white' :
                            emailRecord.email_type === 'merged' ? 'bg-purple-600 text-white' :
                            emailRecord.email_type === 'alternate' ? 'bg-gray-600 text-white' :
                            emailRecord.is_primary ? 'bg-blue-600' : ''
                          }
                        >
                          {emailRecord.email_type === 'leaguesafe' ? 'LeagueSafe' :
                           emailRecord.email_type === 'merged' ? 'Merged' :
                           emailRecord.email_type === 'alternate' ? 'Alternate' :
                           'Primary'}
                        </Badge>
                        {emailRecord.is_verified && (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            Verified
                          </Badge>
                        )}
                      </div>
                    </div>
                    {emailRecord.source && (
                      <p className="text-xs text-gray-600">Source: {emailRecord.source}</p>
                    )}
                    {emailRecord.notes && (
                      <p className="text-xs text-gray-600 mt-1">Notes: {emailRecord.notes}</p>
                    )}
                    {emailRecord.season_used && emailRecord.season_used.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1">
                        Used in seasons: {emailRecord.season_used.join(', ')}
                      </p>
                    )}
                  </div>
                ))}
                
                {userEmails.length === 0 && (
                  <p className="text-sm text-gray-500 py-2">No additional email addresses found</p>
                )}
              </div>
            )}
          </div>

          {/* Merge History */}
          {mergeHistory.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Account Merge History</h4>
              <div className="space-y-2">
                {mergeHistory.map((merge) => (
                  <div key={merge.id} className="border rounded p-3 text-sm bg-purple-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        Merged: {merge.source_user_display_name}
                      </span>
                      <Badge variant="outline" className="text-purple-600 border-purple-300">
                        {merge.merge_type}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-2 text-xs">
                      <div>Picks: {merge.picks_merged}</div>
                      <div>Payments: {merge.payments_merged}</div>
                      <div>Anonymous Picks: {merge.anonymous_picks_merged}</div>
                      <div>Emails: {merge.emails_merged}</div>
                    </div>
                    <p className="text-xs text-gray-600">
                      From: {merge.source_user_email} • {new Date(merge.merged_at).toLocaleDateString()}
                    </p>
                    {merge.merge_reason && (
                      <p className="text-xs text-gray-600 mt-1">Reason: {merge.merge_reason}</p>
                    )}
                    {merge.conflicts_detected && (
                      <Badge variant="destructive" className="mt-2 text-xs">
                        Conflicts Detected
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment History */}
          {currentUser.season_payment_history && currentUser.season_payment_history.length > 0 && (
            <div>
              <h4 className="font-semibold mb-3">Payment History</h4>
              <div className="space-y-2">
                {currentUser.season_payment_history.map((payment: any) => (
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
                    {payment.leaguesafe_email && payment.leaguesafe_email !== currentUser.email && (
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
                        const currentSeasonPayment = currentUser.season_payment_history?.find((p: any) => p.season === currentSeason)
                        const currentStatus = currentSeasonPayment?.status || (currentSeason === 2024 && currentUser.payment_status !== 'No Payment' ? currentUser.payment_status : 'No Payment')
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
                    const currentSeasonPayment = currentUser.season_payment_history?.find((p: any) => p.season === currentSeason)
                    return currentSeasonPayment?.status || (currentSeason === 2024 && currentUser.payment_status !== 'No Payment' ? currentUser.payment_status : 'No Payment')
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
                {currentUser.is_admin ? 'Remove Admin' : 'Make Admin'}
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