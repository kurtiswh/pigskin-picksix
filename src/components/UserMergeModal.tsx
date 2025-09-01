import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserWithPayment } from '@/types'
import { UserMergeService, MergeConflict } from '@/services/userMergeService'

interface UserMergeModalProps {
  sourceUser: UserWithPayment
  targetUser: UserWithPayment
  onMerge: (sourceUserId: string, targetUserId: string, mergeReason?: string) => Promise<void>
  onCancel: () => void
}

export default function UserMergeModal({ sourceUser, targetUser, onMerge, onCancel }: UserMergeModalProps) {
  const [mergeReason, setMergeReason] = useState('')
  const [conflicts, setConflicts] = useState<MergeConflict[]>([])
  const [mergeable, setMergeable] = useState({
    picks: 0,
    payments: 0,
    anonymousPicks: 0,
    emails: 0
  })
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Generate merge preview when component loads
  useEffect(() => {
    generateMergePreview()
  }, [sourceUser, targetUser])

  const generateMergePreview = async () => {
    setPreviewLoading(true)
    try {
      const preview = await UserMergeService.previewMerge(sourceUser.id, targetUser.id)
      setConflicts(preview.conflicts)
      setMergeable(preview.mergeable)
    } catch (error) {
      console.error('Error generating merge preview:', error)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleMerge = async () => {
    if (!confirm(`Are you sure you want to merge ${sourceUser.display_name} into ${targetUser.display_name}? This action cannot be undone.`)) {
      return
    }

    setLoading(true)
    try {
      await onMerge(sourceUser.id, targetUser.id, mergeReason)
    } finally {
      setLoading(false)
    }
  }

  const swapUsers = () => {
    // Note: We can't actually swap since the props are fixed
    // This would need to be handled at the parent level
    console.log('Swap would need to be handled by parent component')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Merge User Accounts</span>
            <Button variant="outline" size="sm" onClick={onCancel}>
              ✕ Close
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* User Comparison */}
          <div>
            <h4 className="font-semibold mb-3">User Comparison</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Source User */}
              <div className="border rounded p-4 bg-red-50">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="destructive">Source (Will be Merged)</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Name:</span> {sourceUser.display_name}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {sourceUser.email}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span> {new Date(sourceUser.created_at).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Admin:</span> {sourceUser.is_admin ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <span className="font-medium">Payment Status:</span> {sourceUser.payment_status || 'No Payment'}
                  </div>
                </div>
              </div>

              {/* Target User */}
              <div className="border rounded p-4 bg-green-50">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="default" className="bg-green-600">Target (Will Receive Data)</Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Name:</span> {targetUser.display_name}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span> {targetUser.email}
                  </div>
                  <div>
                    <span className="font-medium">Created:</span> {new Date(targetUser.created_at).toLocaleDateString()}
                  </div>
                  <div>
                    <span className="font-medium">Admin:</span> {targetUser.is_admin ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <span className="font-medium">Payment Status:</span> {targetUser.payment_status || 'No Payment'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Merge Preview */}
          <div>
            <h4 className="font-semibold mb-3">Merge Preview</h4>
            
            {previewLoading ? (
              <div className="text-center py-4">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Analyzing merge compatibility...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Mergeable Data */}
                <div className="border rounded p-4 bg-blue-50">
                  <h5 className="font-medium mb-2 text-blue-800">Data to be Merged</h5>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{mergeable.picks}</div>
                      <div className="text-gray-600">Picks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{mergeable.payments}</div>
                      <div className="text-gray-600">Payments</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{mergeable.anonymousPicks}</div>
                      <div className="text-gray-600">Anonymous Picks</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{mergeable.emails}</div>
                      <div className="text-gray-600">Emails</div>
                    </div>
                  </div>
                </div>

                {/* Conflicts */}
                {conflicts.length > 0 && (
                  <div className="border rounded p-4 bg-yellow-50">
                    <h5 className="font-medium mb-2 text-yellow-800">⚠️ Conflicts Detected</h5>
                    <div className="space-y-2">
                      {conflicts.map((conflict, index) => (
                        <div key={index} className="text-sm p-2 bg-yellow-100 rounded">
                          <span className="font-medium capitalize">{conflict.type}:</span> {conflict.details.description}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-700 mt-2">
                      Conflicting data will not be merged. The target user's data will be preserved.
                    </p>
                  </div>
                )}

                {/* Merge Reason */}
                <div>
                  <label className="block text-sm font-medium mb-2">Merge Reason (Optional)</label>
                  <textarea
                    value={mergeReason}
                    onChange={(e) => setMergeReason(e.target.value)}
                    placeholder="Why are these accounts being merged? (e.g., same person with different emails)"
                    className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                    disabled={loading}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              onClick={onCancel}
              variant="outline"
              disabled={loading}
            >
              Cancel
            </Button>
            
            <div className="flex gap-3">
              <Button
                onClick={generateMergePreview}
                variant="outline"
                disabled={loading || previewLoading}
              >
                {previewLoading ? 'Refreshing...' : 'Refresh Preview'}
              </Button>
              
              <Button
                onClick={handleMerge}
                disabled={loading || previewLoading}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading ? 'Merging...' : 'Merge Users'}
              </Button>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded p-4">
            <h5 className="font-medium text-red-800 mb-2">⚠️ Important Warning</h5>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• The source user account will be deactivated and marked as merged</li>
              <li>• All mergeable data will be transferred to the target user</li>
              <li>• Conflicting data will remain with the target user (no overwrites)</li>
              <li>• This action cannot be undone automatically</li>
              <li>• A complete audit trail will be maintained in the merge history</li>
            </ul>
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-red-600"></div>
              <p className="text-sm text-gray-600 mt-2">Merging user accounts...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}