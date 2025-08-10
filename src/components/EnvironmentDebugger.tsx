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
    console.log('🔧 Starting diagnostics...')
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
        resendKey: ENV.RESEND_API_KEY ? 'Present' : 'Missing'
      },
      tests: {
        cfbdApi: 'Testing...',
        supabaseConnection: 'Testing...',
        supabaseUsers: 'Testing...',
        supabaseGames: 'Testing...'
      }
    }

    // Set initial results to show progress
    setResults({ ...diagnostics })

    // Add global timeout for entire diagnostic process
    const globalTimeout = setTimeout(() => {
      console.log('🚨 Global diagnostic timeout')
      diagnostics.tests.cfbdApi = diagnostics.tests.cfbdApi === 'Testing...' ? 'Global timeout' : diagnostics.tests.cfbdApi
      diagnostics.tests.supabaseConnection = diagnostics.tests.supabaseConnection === 'Testing...' ? 'Global timeout' : diagnostics.tests.supabaseConnection
      diagnostics.tests.supabaseUsers = diagnostics.tests.supabaseUsers === 'Testing...' ? 'Global timeout' : diagnostics.tests.supabaseUsers
      diagnostics.tests.supabaseGames = diagnostics.tests.supabaseGames === 'Testing...' ? 'Global timeout' : diagnostics.tests.supabaseGames
      setResults({ ...diagnostics })
      setTesting(false)
    }, 8000) // 8 second global timeout

    // Test CFBD API with timeout
    try {
      const cfbdTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('CFBD API timeout')), 4000)
      )
      const cfbdTest = await Promise.race([testApiConnection(3000), cfbdTimeout])
      diagnostics.tests.cfbdApi = cfbdTest ? 'Success' : 'Failed'
    } catch (error) {
      diagnostics.tests.cfbdApi = `Error: ${error.message}`
    }
    
    // Update results after each test
    setResults({ ...diagnostics })

    // Test Supabase connection with direct REST API call
    try {
      const supabaseUrl = ENV.SUPABASE_URL
      const supabaseKey = ENV.SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey) {
        diagnostics.tests.supabaseConnection = 'Missing URL or Key'
      } else {
        // Direct REST API test with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            const data = await response.json()
            diagnostics.tests.supabaseConnection = 'Success (Direct REST)'
            diagnostics.tests.supabaseUsers = `Found ${data.length || 0} users via REST`
          } else {
            const errorText = await response.text()
            diagnostics.tests.supabaseConnection = `HTTP ${response.status}: ${errorText}`
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            diagnostics.tests.supabaseConnection = 'Timeout after 5 seconds (Direct REST)'
          } else {
            diagnostics.tests.supabaseConnection = `Fetch error: ${fetchError.message}`
          }
        }
        
        // Also test with Supabase client
        try {
          const { data, error } = await supabase.from('users').select('id').limit(1)
          if (error) {
            diagnostics.tests.supabaseUsers = `Client Error: ${error.message}`
          } else {
            diagnostics.tests.supabaseUsers += ` | Client: ${data?.length || 0} users`
          }
        } catch (clientError) {
          diagnostics.tests.supabaseUsers += ` | Client Exception: ${clientError.message}`
        }
      }
    } catch (error) {
      diagnostics.tests.supabaseConnection = `General Exception: ${error.message}`
    }
    
    // Update results after Supabase tests
    setResults({ ...diagnostics })

    // Test games table with both methods
    try {
      const supabaseUrl = ENV.SUPABASE_URL
      const supabaseKey = ENV.SUPABASE_ANON_KEY
      
      if (supabaseUrl && supabaseKey) {
        // Direct REST API test for games
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/games?limit=1`, {
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            const data = await response.json()
            diagnostics.tests.supabaseGames = `REST: ${data.length || 0} games`
          } else {
            diagnostics.tests.supabaseGames = `REST HTTP ${response.status}`
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            diagnostics.tests.supabaseGames = 'REST: Timeout after 5 seconds'
          } else {
            diagnostics.tests.supabaseGames = `REST: ${fetchError.message}`
          }
        }
      }
    } catch (error) {
      diagnostics.tests.supabaseGames = `Games Exception: ${error.message}`
    }

    // Clear timeout since we completed successfully
    clearTimeout(globalTimeout)
    setResults(diagnostics)
    setTesting(false)
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