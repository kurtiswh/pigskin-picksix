import { useState } from 'react'
import { ENV } from '@/lib/env'
import { testApiConnection } from '@/services/collegeFootballApi'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function EnvironmentDebugger() {
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<any>(null)

  const runDiagnostics = async () => {
    setTesting(true)
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        supabaseUrl: ENV.SUPABASE_URL ? 'Present' : 'Missing',
        supabaseKey: ENV.SUPABASE_ANON_KEY ? 'Present' : 'Missing',
        cfbdKey: ENV.CFBD_API_KEY ? 'Present' : 'Missing',
        resendKey: ENV.RESEND_API_KEY ? 'Present' : 'Missing'
      },
      tests: {
        cfbdApi: 'Not tested',
        supabaseConnection: 'Not tested',
        supabaseUsers: 'Not tested',
        supabaseGames: 'Not tested'
      }
    }

    // Test CFBD API
    try {
      const cfbdTest = await testApiConnection(3000)
      diagnostics.tests.cfbdApi = cfbdTest ? 'Success' : 'Failed'
    } catch (error) {
      diagnostics.tests.cfbdApi = `Error: ${error.message}`
    }

    // Test Supabase connection
    try {
      const { data, error } = await supabase.from('users').select('id').limit(1)
      if (error) {
        diagnostics.tests.supabaseConnection = `Error: ${error.message}`
      } else {
        diagnostics.tests.supabaseConnection = 'Success'
        diagnostics.tests.supabaseUsers = `Found ${data?.length || 0} users`
      }
    } catch (error) {
      diagnostics.tests.supabaseConnection = `Exception: ${error.message}`
    }

    // Test games table
    try {
      const { data, error } = await supabase.from('games').select('id').limit(1)
      if (error) {
        diagnostics.tests.supabaseGames = `Error: ${error.message}`
      } else {
        diagnostics.tests.supabaseGames = `Found ${data?.length || 0} games`
      }
    } catch (error) {
      diagnostics.tests.supabaseGames = `Exception: ${error.message}`
    }

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