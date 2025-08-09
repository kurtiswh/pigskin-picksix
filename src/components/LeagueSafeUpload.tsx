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
  errors: string[]
  matched: Array<{
    email: string
    name: string
    status: string
    action: 'matched' | 'unmatched' | 'user_created'
  }>
  season: number
}

interface LeagueSafeUploadProps {
  onUploadComplete?: (result: UploadResult) => void
}

export default function LeagueSafeUpload({ onUploadComplete }: LeagueSafeUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState('')
  const [season, setSeason] = useState(2024) // Default to 2024 since we're uploading 2024 data


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
      
      const csvText = await file.text()
      const entries = parseLeagueSafeCSV(csvText)
      
      if (entries.length === 0) {
        throw new Error('No valid entries found in CSV file')
      }

      // First, clear existing payments for this season to start fresh
      console.log(`🧹 Clearing existing LeagueSafe payments for season ${season}`)
      const { error: deleteError } = await supabase
        .from('leaguesafe_payments')
        .delete()
        .eq('season', season)

      if (deleteError) {
        console.warn('Failed to clear existing payments:', deleteError)
        // Don't stop the process - continue anyway
      } else {
        console.log(`✅ Cleared existing payments for season ${season}`)
      }

      const result: UploadResult = {
        totalEntries: entries.length,
        newUsers: 0,
        matchedPayments: 0,
        unmatchedPayments: 0,
        errors: [],
        matched: [],
        season
      }

      // Process each entry
      for (const entry of entries) {
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
          
          if (!matchResult.user) {
            result.errors.push(`Failed to match or create user for ${email}`)
            continue
          }

          const userId = matchResult.user.id
          let action: 'matched' | 'unmatched' | 'user_created' = matchResult.isNewUser ? 'user_created' : 'matched'
          
          if (matchResult.isNewUser) {
            result.newUsers++
          }

          // Create payment record
          console.log(`💰 Creating payment record for ${email} (${name}) - User ID: ${userId}`)
          const paymentData = {
            user_id: userId,
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
                <Button onClick={resetUpload} variant="outline">
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
            
            <div className="grid md:grid-cols-4 gap-4">
              <div className="text-center p-4 border border-green-200 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{result.totalEntries}</div>
                <div className="text-sm text-green-700">Total Entries</div>
              </div>
              <div className="text-center p-4 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{result.matchedPayments}</div>
                <div className="text-sm text-blue-700">Matched Payments</div>
              </div>
              <div className="text-center p-4 border border-orange-200 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{result.unmatchedPayments}</div>
                <div className="text-sm text-orange-700">Unmatched Payments</div>
              </div>
              <div className="text-center p-4 border border-purple-200 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{result.newUsers}</div>
                <div className="text-sm text-purple-700">New Users Created</div>
              </div>
            </div>

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
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {match.action === 'user_created' ? 'New User' : 
                           match.action === 'matched' ? 'Matched' : 'Unmatched'}
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