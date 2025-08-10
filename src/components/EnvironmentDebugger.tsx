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
        supabaseIndexes: 'Testing...',
        queryPerformance: 'Testing...'
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
      diagnostics.tests.supabaseIndexes = diagnostics.tests.supabaseIndexes === 'Testing...' ? 'Global timeout' : diagnostics.tests.supabaseIndexes
      diagnostics.tests.queryPerformance = diagnostics.tests.queryPerformance === 'Testing...' ? 'Global timeout' : diagnostics.tests.queryPerformance
      setResults({ ...diagnostics })
      setTesting(false)
    }, 25000) // 25 second global timeout (longer than individual timeouts)

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
        // Direct REST API test for games with extended timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        
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
            diagnostics.tests.supabaseGames = 'REST: Timeout after 15 seconds'
          } else {
            diagnostics.tests.supabaseGames = `REST: ${fetchError.message}`
          }
        }
      }
    } catch (error) {
      diagnostics.tests.supabaseGames = `Games Exception: ${error.message}`
    }
    
    // Update results after games test
    setResults({ ...diagnostics })

    // Test database indexes
    try {
      const supabaseUrl = ENV.SUPABASE_URL
      const supabaseKey = ENV.SUPABASE_ANON_KEY
      
      if (supabaseUrl && supabaseKey) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)
        
        try {
          // Check for indexes using a simple query
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/check_indexes`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey,
              'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({})
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            diagnostics.tests.supabaseIndexes = 'Index check function available'
          } else if (response.status === 404) {
            diagnostics.tests.supabaseIndexes = 'No index check function (expected)'
          } else {
            diagnostics.tests.supabaseIndexes = `HTTP ${response.status}`
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError.name === 'AbortError') {
            diagnostics.tests.supabaseIndexes = 'Index check timeout'
          } else {
            diagnostics.tests.supabaseIndexes = `Index check error: ${fetchError.message}`
          }
        }
      } else {
        diagnostics.tests.supabaseIndexes = 'Missing credentials'
      }
    } catch (error) {
      diagnostics.tests.supabaseIndexes = `Exception: ${error.message}`
    }
    
    // Update results after index test
    setResults({ ...diagnostics })

    // Test query performance with a simple timed query
    try {
      if (user) {
        const startTime = Date.now()
        
        const performanceQuery = supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .limit(1)
        
        const performanceTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Performance test timeout')), 3000)
        )
        
        try {
          await Promise.race([performanceQuery, performanceTimeout])
          const endTime = Date.now()
          const duration = endTime - startTime
          
          if (duration < 500) {
            diagnostics.tests.queryPerformance = `Fast: ${duration}ms`
          } else if (duration < 2000) {
            diagnostics.tests.queryPerformance = `Slow: ${duration}ms`
          } else {
            diagnostics.tests.queryPerformance = `Very slow: ${duration}ms`
          }
        } catch (perfError) {
          diagnostics.tests.queryPerformance = `Timeout or error after 3s`
        }
      } else {
        diagnostics.tests.queryPerformance = 'No user to test with'
      }
    } catch (error) {
      diagnostics.tests.queryPerformance = `Exception: ${error.message}`
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