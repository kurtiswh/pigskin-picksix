import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AnonymousPicksAdmin from '@/components/AnonymousPicksAdmin'
import { supabase } from '@/lib/supabase'
import EnhancedAnonymousPicksAdmin from '@/components/EnhancedAnonymousPicksAdmin'

// Temporary inline Alert component to avoid import issues
const Alert = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`relative w-full rounded-lg border p-4 bg-blue-50 border-blue-200 text-blue-900 ${className}`} role="alert">
    {children}
  </div>
)

const AlertDescription = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm">{children}</div>
)

interface AnonymousPicksAdminWrapperProps {
  currentWeek: number
  currentSeason: number
}

export default function AnonymousPicksAdminWrapper({ currentWeek, currentSeason }: AnonymousPicksAdminWrapperProps) {
  const [useEnhancedVersion, setUseEnhancedVersion] = useState(false)
  const [migrationsApplied, setMigrationsApplied] = useState<boolean | null>(null)
  const [migrationStatus, setMigrationStatus] = useState<string>('Checking...')

  // Check if required migrations are applied
  useEffect(() => {
    checkMigrations()
  }, [])

  const checkMigrations = async () => {
    try {
      console.log('🔍 Starting migration check...')
      
      // Test if the key functions exist by trying to call them
      const tests = await Promise.allSettled([
        // Test 1: Check if resolve_primary_user_id function exists
        supabase.rpc('resolve_primary_user_id', { search_email: 'test@example.com' }),
        
        // Test 2: Check if user_emails table has new columns
        supabase.from('user_emails').select('is_primary_user_email').limit(1),
        
        // Test 3: Check if users table has new columns
        supabase.from('users').select('canonical_user_id, user_status').limit(1),
        
        // Test 4: Check if picks table has new columns
        supabase.from('picks').select('is_active_pick_set, pick_set_priority').limit(1)
      ])

      let passedTests = 0
      let failureReasons: string[] = []

      // Check each test result with detailed logging
      console.log('Test 1 (resolve_primary_user_id):', tests[0])
      if (tests[0].status === 'fulfilled' && !tests[0].value.error) {
        passedTests++
        console.log('✅ resolve_primary_user_id function exists')
      } else {
        const error = tests[0].status === 'fulfilled' ? tests[0].value.error : tests[0].reason
        console.log('❌ resolve_primary_user_id function missing:', error)
        failureReasons.push(`resolve_primary_user_id function (${error?.message || 'unknown error'})`)
      }

      console.log('Test 2 (user_emails columns):', tests[1])
      if (tests[1].status === 'fulfilled' && !tests[1].value.error) {
        passedTests++
        console.log('✅ user_emails columns exist')
      } else {
        const error = tests[1].status === 'fulfilled' ? tests[1].value.error : tests[1].reason
        console.log('❌ user_emails columns missing:', error)
        failureReasons.push(`user_emails.is_primary_user_email (${error?.message || 'unknown error'})`)
      }

      console.log('Test 3 (users columns):', tests[2])
      if (tests[2].status === 'fulfilled' && !tests[2].value.error) {
        passedTests++
        console.log('✅ users columns exist')
      } else {
        const error = tests[2].status === 'fulfilled' ? tests[2].value.error : tests[2].reason
        console.log('❌ users columns missing:', error)
        failureReasons.push(`users table columns (${error?.message || 'unknown error'})`)
      }

      console.log('Test 4 (picks columns):', tests[3])
      if (tests[3].status === 'fulfilled' && !tests[3].value.error) {
        passedTests++
        console.log('✅ picks columns exist')
      } else {
        const error = tests[3].status === 'fulfilled' ? tests[3].value.error : tests[3].reason
        console.log('❌ picks columns missing:', error)
        failureReasons.push(`picks table columns (${error?.message || 'unknown error'})`)
      }

      console.log(`Migration check complete: ${passedTests}/4 tests passed`)

      if (passedTests === 4) {
        setMigrationsApplied(true)
        setMigrationStatus('✅ All migrations applied successfully')
      } else {
        setMigrationsApplied(false)
        setMigrationStatus(`❌ Failed ${4 - passedTests}/4 tests`)
      }

    } catch (error: any) {
      console.error('Migration check error:', error)
      setMigrationsApplied(false)
      setMigrationStatus(`❌ Error checking migrations: ${error.message}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Version Selection */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🔧 Anonymous Picks Administration</span>
            <div className="flex items-center space-x-2">
              <Badge variant={useEnhancedVersion ? 'secondary' : 'default'}>
                {useEnhancedVersion ? 'Enhanced Version' : 'Legacy Version'}
              </Badge>
              <Button
                onClick={() => setUseEnhancedVersion(!useEnhancedVersion)}
                variant="outline"
                size="sm"
              >
                {useEnhancedVersion ? 'Switch to Legacy' : 'Try Enhanced Version'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          {!useEnhancedVersion ? (
            <Alert>
              <AlertDescription>
                <strong>Current (Legacy) System:</strong> Basic anonymous picks validation with manual conflict resolution.
                Issues: Duplicate user IDs, weak validation enforcement, manual payment checking.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-green-200 bg-green-50">
              <AlertDescription>
                <strong>Enhanced System:</strong> Comprehensive validation workflow with primary user resolution, 
                automatic duplicate detection, payment status integration, and forced validation steps.
                <br /><br />
                <strong>Key Improvements:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Primary user ID resolution prevents duplicate accounts</li>
                  <li>Comprehensive duplicate detection across both picks and anonymous_picks tables</li>
                  <li>Payment status integration with leaderboard eligibility</li>
                  <li>Forced validation workflow - no assignments without proper validation</li>
                  <li>Pick set precedence management with conflict resolution</li>
                  <li>Enhanced admin audit trail</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {useEnhancedVersion && (
            <div className={`mt-4 p-3 rounded border ${
              migrationsApplied === null ? 'bg-blue-50 border-blue-200' :
              migrationsApplied ? 'bg-green-50 border-green-200' :
              'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <strong>🔍 Database Migration Status:</strong> {migrationStatus}
                </div>
                <Button 
                  onClick={checkMigrations} 
                  variant="outline" 
                  size="sm"
                  disabled={migrationsApplied === null}
                >
                  Recheck
                </Button>
              </div>
              {migrationsApplied === false && (
                <div className="mt-2 text-sm text-red-700">
                  Apply migrations 112 and 113 to your database to use the enhanced features.
                  <br />
                  Files: <code>database/migrations/112_create_primary_user_resolution_system.sql</code>
                  <br />
                  and <code>database/migrations/113_add_pick_precedence_management.sql</code>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Render the selected version */}
      {useEnhancedVersion ? (
        migrationsApplied ? (
          <EnhancedAnonymousPicksAdmin 
            currentWeek={currentWeek} 
            currentSeason={currentSeason} 
          />
        ) : (
          <div className="p-8 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">Enhanced Version Unavailable</h3>
            <p className="text-yellow-700 mb-4">
              The enhanced anonymous picks system requires database migrations to be applied first.
              Please apply migrations 112 and 113, then click "Recheck" above.
            </p>
            <Button 
              onClick={() => setUseEnhancedVersion(false)}
              variant="outline"
            >
              Back to Legacy Version
            </Button>
          </div>
        )
      ) : (
        <AnonymousPicksAdmin 
          currentWeek={currentWeek} 
          currentSeason={currentSeason} 
        />
      )}
    </div>
  )
}