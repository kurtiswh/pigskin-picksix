import { useState } from 'react'
import { ENV } from '@/lib/env'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NetworkDiagnostic() {
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const runNetworkTest = async () => {
    console.log('🌐 Starting network diagnostic...')
    setTesting(true)
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: {
        supabaseHealthCheck: 'Testing...',
        usersTableDirect: 'Testing...',
        gamesTableDirect: 'Testing...',
        gamesTableMinimal: 'Testing...',
        networkLatency: 'Testing...'
      }
    }
    
    setResults({ ...diagnostics })

    const supabaseUrl = ENV.SUPABASE_URL
    const supabaseKey = ENV.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      setResults({
        ...diagnostics,
        tests: { ...diagnostics.tests, error: 'Missing credentials' }
      })
      setTesting(false)
      return
    }

    // Test 1: Supabase health check endpoint
    try {
      const startTime = Date.now()
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': supabaseKey,
        }
      })
      const latency = Date.now() - startTime
      
      if (response.ok) {
        diagnostics.tests.supabaseHealthCheck = `Success (${latency}ms)`
        diagnostics.tests.networkLatency = `${latency}ms to Supabase`
      } else {
        diagnostics.tests.supabaseHealthCheck = `HTTP ${response.status}`
      }
    } catch (error) {
      diagnostics.tests.supabaseHealthCheck = `Error: ${error.message}`
    }
    
    setResults({ ...diagnostics })

    // Test 2: Users table (known to work)
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 5000)
      
      const response = await fetch(`${supabaseUrl}/rest/v1/users?limit=1`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        signal: controller.signal
      })
      
      if (response.ok) {
        const data = await response.json()
        diagnostics.tests.usersTableDirect = `Success: ${data.length} users`
      } else {
        diagnostics.tests.usersTableDirect = `HTTP ${response.status}`
      }
    } catch (error) {
      diagnostics.tests.usersTableDirect = error.name === 'AbortError' ? 'Timeout' : `Error: ${error.message}`
    }
    
    setResults({ ...diagnostics })

    // Test 3: Games table with minimal query
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch(`${supabaseUrl}/rest/v1/games?select=id&limit=1`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        signal: controller.signal
      })
      
      if (response.ok) {
        const data = await response.json()
        diagnostics.tests.gamesTableMinimal = `Success: ${data.length} games (minimal)`
      } else {
        const errorText = await response.text()
        diagnostics.tests.gamesTableMinimal = `HTTP ${response.status}: ${errorText.substring(0, 100)}`
      }
    } catch (error) {
      diagnostics.tests.gamesTableMinimal = error.name === 'AbortError' ? 'Timeout after 10s' : `Error: ${error.message}`
    }
    
    setResults({ ...diagnostics })

    // Test 4: Games table with full query (what's actually failing)
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 15000)
      
      const response = await fetch(`${supabaseUrl}/rest/v1/games?limit=1`, {
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'apikey': supabaseKey,
        },
        signal: controller.signal
      })
      
      if (response.ok) {
        const data = await response.json()
        diagnostics.tests.gamesTableDirect = `Success: ${data.length} games (full)`
      } else {
        const errorText = await response.text()
        diagnostics.tests.gamesTableDirect = `HTTP ${response.status}: ${errorText.substring(0, 100)}`
      }
    } catch (error) {
      diagnostics.tests.gamesTableDirect = error.name === 'AbortError' ? 'Timeout after 15s' : `Error: ${error.message}`
    }

    setResults(diagnostics)
    setTesting(false)
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>🌐 Network & API Connectivity Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runNetworkTest} disabled={testing}>
          {testing ? 'Running Network Tests...' : 'Run Network Diagnostic'}
        </Button>

        {results && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Network Tests:</h3>
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