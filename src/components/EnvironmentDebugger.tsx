import { useState } from 'react'
import { ENV } from '@/lib/env'
import { testApiConnection } from '@/services/collegeFootballApi'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function EnvironmentDebugger() {
  const { user } = useAuth()
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const runDiagnostics = async () => {
    console.log('🔧 Starting simplified diagnostics...')
    setTesting(true)
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      authentication: {
        userLoggedIn: !!user,
        userId: user?.id || 'Not logged in',
        userEmail: user?.email || 'Not logged in',
        isAdmin: user?.is_admin || false
      },
      environment: {
        supabaseUrl: ENV.SUPABASE_URL ? 'Present' : 'Missing',
        supabaseKey: ENV.SUPABASE_ANON_KEY ? 'Present' : 'Missing',
        cfbdKey: ENV.CFBD_API_KEY ? 'Present' : 'Missing',
        resendKey: ENV.RESEND_API_KEY ? 'Present' : 'Missing',
        nodeEnv: import.meta.env.MODE || 'unknown',
        isDev: import.meta.env.DEV || false,
        isProd: import.meta.env.PROD || false
      },
      tests: {
        cfbdApi: 'Testing...',
        supabaseConnection: 'Testing...',
        supabaseUsers: 'Testing...',
        supabaseGames: 'Testing...',
        queryPerformance: 'Testing...'
      }
    }

    // Set initial results to show progress
    setResults({ ...diagnostics })

    // Use try/catch with finally to ensure completion
    try {
      // Test CFBD API
      try {
        const cfbdTest = await testApiConnection(3000)
        diagnostics.tests.cfbdApi = cfbdTest ? 'Success' : 'Failed'
      } catch (error) {
        diagnostics.tests.cfbdApi = `Error: ${error.message}`
      }
      setResults({ ...diagnostics })

      // Test Supabase connection with timeout
      try {
        console.log('Testing Supabase with current session:', await supabase.auth.getSession())
        
        const queryPromise = supabase.from('users').select('id, email, display_name, is_admin').limit(3)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout after 5s')), 5000)
        )
        
        const result = await Promise.race([queryPromise, timeoutPromise]) as any
        
        if (result?.error) {
          diagnostics.tests.supabaseConnection = `Error: ${result.error.message} (Code: ${result.error.code})`
          diagnostics.tests.supabaseUsers = `Error: ${result.error.message} (Code: ${result.error.code})`
        } else {
          diagnostics.tests.supabaseConnection = 'Success'
          diagnostics.tests.supabaseUsers = `Found ${result?.data?.length || 0} users`
        }
      } catch (error) {
        diagnostics.tests.supabaseConnection = `Exception: ${error.message}`
        diagnostics.tests.supabaseUsers = `Exception: ${error.message}`
      }
      setResults({ ...diagnostics })

      // Test games table
      try {
        const { data, error } = await supabase.from('games').select('id, week, season, home_team, away_team').limit(3)
        if (error) {
          diagnostics.tests.supabaseGames = `Error: ${error.message} (Code: ${error.code})`
        } else {
          diagnostics.tests.supabaseGames = `Found ${data?.length || 0} games`
        }
      } catch (error) {
        diagnostics.tests.supabaseGames = `Exception: ${error.message}`
      }
      setResults({ ...diagnostics })

      // Test query performance
      try {
        if (user) {
          const startTime = Date.now()
          const { data, error } = await supabase
            .from('users')
            .select('id, display_name')
            .eq('id', user.id)
            .single()
          
          const duration = Date.now() - startTime
          
          if (error) {
            diagnostics.tests.queryPerformance = `Error: ${error.message} (Code: ${error.code})`
          } else if (duration < 500) {
            diagnostics.tests.queryPerformance = `Fast: ${duration}ms - Found user: ${data?.display_name}`
          } else if (duration < 2000) {
            diagnostics.tests.queryPerformance = `Slow: ${duration}ms - Found user: ${data?.display_name}`
          } else {
            diagnostics.tests.queryPerformance = `Very slow: ${duration}ms - Found user: ${data?.display_name}`
          }
        } else {
          diagnostics.tests.queryPerformance = 'No authenticated user to test with'
        }
      } catch (error) {
        diagnostics.tests.queryPerformance = `Exception: ${error.message}`
      }

    } catch (error) {
      console.error('Diagnostic error:', error)
    } finally {
      // Always complete the test
      setResults(diagnostics)
      setTesting(false)
      console.log('🔧 Diagnostics completed')
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>🔧 Environment & API Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runDiagnostics} disabled={testing}>
          {testing ? 'Running Tests...' : 'Run Diagnostics'}
        </Button>

        {results && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Authentication Status:</h3>
              <pre className="bg-gray-100 p-3 rounded text-sm">
                {JSON.stringify(results.authentication, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Environment Variables:</h3>
              <pre className="bg-gray-100 p-3 rounded text-sm">
                {JSON.stringify(results.environment, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="font-semibold mb-2">API Tests:</h3>
              <pre className="bg-gray-100 p-3 rounded text-sm">
                {JSON.stringify(results.tests, null, 2)}
              </pre>
            </div>

            <div className="text-xs text-gray-500">
              Tested at: {results.timestamp}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}