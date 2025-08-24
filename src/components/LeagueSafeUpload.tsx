import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { parseLeagueSafeCSV, validateLeagueSafeEntry, cleanLeagueSafeEntry } from '@/utils/csvParser'
import { matchOrCreateUserForLeagueSafeFallback } from '@/utils/userMatchingFallback'

interface UploadResult {
  totalEntries: number
  newUsers: number
  matchedPayments: number
  unmatchedPayments: number
  updatedPayments: number
  skippedDuplicates: number
  errors: string[]
  warnings: string[]
  matched: Array<{
    email: string
    name: string
    status: string
    action: 'matched' | 'unmatched' | 'user_created' | 'updated' | 'skipped'
  }>
  season: number
  existingPayments: number
}

interface LeagueSafeUploadProps {
  onUploadComplete?: (result: UploadResult) => void
}

export default function LeagueSafeUpload({ onUploadComplete }: LeagueSafeUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' })
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [season, setSeason] = useState(2025) // Default to 2025 for new uploads


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      setError('')
      setResult(null)
    } else {
      setError('Please select a valid CSV file')
      setFile(null)
    }
  }

  const processUpload = async () => {
    if (!file) return

    try {
      setLoading(true)
      setError('')
      setProgress({ current: 0, total: 0, status: 'Reading CSV file...' })
      
      const csvText = await file.text()
      const entries = parseLeagueSafeCSV(csvText)
      
      setProgress({ current: 0, total: entries.length, status: 'Processing entries...' })
      
      if (entries.length === 0) {
        throw new Error('No valid entries found in CSV file')
      }

      // Check existing payments for this season instead of clearing
      console.log(`🔍 Checking existing LeagueSafe payments for season ${season}`)
      const { data: existingPayments, error: fetchError } = await supabase
        .from('leaguesafe_payments')
        .select('leaguesafe_email, user_id, status, leaguesafe_owner_name')
        .eq('season', season)

      if (fetchError) {
        console.warn('Failed to fetch existing payments:', fetchError)
        // Continue anyway with empty set
      }

      const existingByEmail = new Map<string, any>()
      if (existingPayments) {
        existingPayments.forEach(payment => {
          if (payment.leaguesafe_email) {
            existingByEmail.set(payment.leaguesafe_email.toLowerCase(), payment)
          }
        })
        console.log(`📊 Found ${existingPayments.length} existing payments for season ${season}`)
      }

      const result: UploadResult = {
        totalEntries: entries.length,
        newUsers: 0,
        matchedPayments: 0,
        unmatchedPayments: 0,
        updatedPayments: 0,
        skippedDuplicates: 0,
        errors: [],
        warnings: [],
        matched: [],
        season,
        existingPayments: existingPayments?.length || 0
      }

      // Process each entry
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        setProgress({ 
          current: i + 1, 
          total: entries.length, 
          status: `Processing ${entry.OwnerEmail}...` 
        })
        
        try {
          // Validate entry
          const validationErrors = validateLeagueSafeEntry(entry)
          if (validationErrors.length > 0) {
            result.errors.push(`Entry validation failed: ${validationErrors.join(', ')}`)
            continue
          }

          // Clean and extract data
          const cleanData = cleanLeagueSafeEntry(entry)
          const { email, name, status, entryFee, paid, pending, owes, isCommish } = cleanData
          
          if (!email || !name) {
            result.errors.push(`Missing email or name for entry: ${entry.Owner}`)
            continue
          }

          // Use the fallback user matching system (works with existing schema)
          const matchResult = await matchOrCreateUserForLeagueSafeFallback(email, name, isCommish)
          
          const userId = matchResult.user?.id || null
          let action: 'matched' | 'unmatched' | 'user_created' | 'updated' | 'skipped' = matchResult.user ? (matchResult.isNewUser ? 'user_created' : 'matched') : 'unmatched'
          
          if (matchResult.isNewUser && matchResult.user) {
            result.newUsers++
          }

          // Check if payment already exists for this email/season
          const existingPayment = existingByEmail.get(email)
          const paymentData = {
            user_id: userId || null, // Allow null user_id if user matching failed
            season,
            leaguesafe_owner_name: name,
            leaguesafe_email: email,
            leaguesafe_owner_id: entry.OwnerId,
            entry_fee: entryFee,
            paid,
            pending,
            owes,
            status,
            is_matched: !!userId
          }

          if (existingPayment) {
            // Check if data has changed
            const hasChanges = (
              existingPayment.status !== status ||
              existingPayment.leaguesafe_owner_name !== name ||
              existingPayment.user_id !== userId
            )

            if (!hasChanges) {
              console.log(`⏭️ Skipping duplicate for ${email} (${name}) - no changes`)
              result.skippedDuplicates++
              action = 'skipped'
            } else {
              // Update existing payment
              console.log(`🔄 Updating existing payment for ${email} (${name})`)
              const { error: updateError } = await supabase
                .from('leaguesafe_payments')
                .update(paymentData)
                .eq('season', season)
                .eq('leaguesafe_email', email)

              if (updateError) {
                console.error(`❌ Failed to update payment record for ${email}:`, updateError)
                result.errors.push(`Failed to update payment record for ${email}: ${updateError.message}`)
                continue
              }

              console.log(`✅ Updated payment record for ${email}`)
              result.updatedPayments++
              action = 'updated'
            }
          } else {
            // Create new payment record
            console.log(`💰 Creating new payment record for ${email} (${name}) - User ID: ${userId}`)
            const { error: paymentError } = await supabase
              .from('leaguesafe_payments')
              .insert(paymentData)

            if (paymentError) {
              console.error(`❌ Failed to create payment record for ${email}:`, {
                email,
                error: paymentError,
                code: paymentError.code,
                message: paymentError.message,
                paymentData
              })
              result.errors.push(`Failed to create payment record for ${email}: ${paymentError.message}`)
              continue
            }
            
            console.log(`✅ Created payment record for ${email}`)
          }

          if (userId) {
            result.matchedPayments++
          } else {
            result.unmatchedPayments++
            action = 'unmatched'
          }

          result.matched.push({
            email,
            name,
            status,
            action
          })

        } catch (entryError: any) {
          result.errors.push(`Error processing entry: ${entryError.message}`)
        }
      }

      setResult(result)
      onUploadComplete?.(result)

    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetUpload = () => {
    setFile(null)
    setResult(null)
    setError('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <span>📊</span>
          <span>LeagueSafe CSV Upload</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result ? (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="season" className="block text-sm font-medium text-charcoal-700 mb-2">
                  Season Year
                </label>
                <Input
                  id="season"
                  type="number"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value) || new Date().getFullYear())}
                  disabled={loading}
                  min={2020}
                  max={2030}
                />
              </div>
              <div>
                <label htmlFor="csv-upload" className="block text-sm font-medium text-charcoal-700 mb-2">
                  Upload LeagueSafe CSV File
                </label>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="text-xs text-charcoal-500">
              Upload your LeagueSafe payment details CSV to import payment records for {season}
            </div>

            {file && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="font-medium text-blue-800">File Selected</div>
                <div className="text-sm text-blue-600">
                  {file.name} ({Math.round(file.size / 1024)}KB)
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                <div className="font-medium mb-1">Error</div>
                <div>{error}</div>
              </div>
            )}

            {loading && progress.total > 0 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-blue-800">Upload Progress</span>
                  <span className="text-sm text-blue-600">{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-200"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  ></div>
                </div>
                <div className="text-sm text-blue-600 mt-2">{progress.status}</div>
              </div>
            )}

            <div className="flex space-x-3">
              <Button
                onClick={processUpload}
                disabled={!file || loading}
                className="flex-1"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Process Upload'
                )}
              </Button>
              {file && (
                <Button onClick={resetUpload} variant="outline" disabled={loading}>
                  Clear
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            {/* Results Summary */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="font-medium text-blue-800 mb-1">
                Import Complete - Season {result.season}
              </div>
            </div>
            
            <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-4 border border-green-200 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{result.totalEntries}</div>
                <div className="text-sm text-green-700">Total Entries</div>
              </div>
              <div className="text-center p-4 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{result.matchedPayments}</div>
                <div className="text-sm text-blue-700">New Payments</div>
              </div>
              <div className="text-center p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{result.updatedPayments}</div>
                <div className="text-sm text-yellow-700">Updated</div>
              </div>
              <div className="text-center p-4 border border-gray-200 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">{result.skippedDuplicates}</div>
                <div className="text-sm text-gray-700">Skipped</div>
              </div>
              <div className="text-center p-4 border border-purple-200 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{result.newUsers}</div>
                <div className="text-sm text-purple-700">New Users</div>
              </div>
              <div className="text-center p-4 border border-red-200 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{result.errors.length}</div>
                <div className="text-sm text-red-700">Errors</div>
              </div>
            </div>

            {result.existingPayments > 0 && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="font-medium text-blue-800">
                  Found {result.existingPayments} existing payments for season {result.season}
                </div>
                <div className="text-sm text-blue-600">
                  Payments were updated or skipped as appropriate to avoid duplicates.
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="font-medium text-red-800 mb-2">
                  Errors ({result.errors.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-700">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Success Details */}
            {result.matched.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="font-medium text-green-800 mb-2">
                  Successfully Processed ({result.matched.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {result.matched.slice(0, 10).map((match, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="text-green-700">
                        <span className="font-medium">{match.name}</span>
                        <span className="text-green-600 ml-2">{match.email}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          match.status === 'Paid' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {match.status}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          match.action === 'user_created' 
                            ? 'bg-purple-100 text-purple-700' 
                            : match.action === 'matched'
                            ? 'bg-blue-100 text-blue-700'
                            : match.action === 'updated'
                            ? 'bg-yellow-100 text-yellow-700'
                            : match.action === 'skipped'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {match.action === 'user_created' ? 'New User' : 
                           match.action === 'matched' ? 'New Payment' :
                           match.action === 'updated' ? 'Updated' :
                           match.action === 'skipped' ? 'Skipped' : 'Unmatched'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {result.matched.length > 10 && (
                    <div className="text-xs text-green-600 italic">
                      ... and {result.matched.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button onClick={resetUpload} variant="outline" className="w-full">
              Upload Another File
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}