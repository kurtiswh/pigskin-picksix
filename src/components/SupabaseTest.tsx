import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SupabaseTest() {
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<string[]>([])

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const testConnection = async () => {
    setTesting(true)
    setResults([])
    
    try {
      addResult('Starting Supabase connection test...')
      
      // Test 1: Basic client info
      addResult(`Supabase URL: ${supabase.supabaseUrl}`)
      addResult(`Supabase Key: ${supabase.supabaseKey.substring(0, 20)}...`)
      
      // Test 2: Simple query with timeout
      addResult('Testing users table access...')
      const usersPromise = supabase.from('users').select('count').limit(1)
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Users query timeout')), 3000)
      )
      
      try {
        await Promise.race([usersPromise, timeout])
        addResult('✅ Users table accessible')
      } catch (error) {
        addResult(`❌ Users table failed: ${error}`)
      }
      
      // Test 3: Blog posts table
      addResult('Testing blog_posts table access...')
      const blogPromise = supabase.from('blog_posts').select('count').limit(1)
      const blogTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Blog posts query timeout')), 3000)
      )
      
      try {
        await Promise.race([blogPromise, blogTimeout])
        addResult('✅ Blog posts table accessible')
      } catch (error) {
        addResult(`❌ Blog posts table failed: ${error}`)
      }
      
      // Test 4: Auth status
      addResult('Testing auth status...')
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
          addResult(`❌ Auth error: ${error.message}`)
        } else if (user) {
          addResult(`✅ User authenticated: ${user.id}`)
        } else {
          addResult('❌ No authenticated user')
        }
      } catch (authError) {
        addResult(`❌ Auth failed: ${authError}`)
      }
      
    } catch (error) {
      addResult(`❌ Test failed: ${error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Supabase Connection Test</CardTitle>
      </CardHeader>
      <CardContent>
        <Button onClick={testConnection} disabled={testing}>
          {testing ? 'Testing...' : 'Run Connection Test'}
        </Button>
        
        {results.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Test Results:</h3>
            <div className="bg-gray-100 p-3 rounded text-sm font-mono max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <div key={index} className="mb-1">
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}