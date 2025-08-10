import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SimpleConnectionTest() {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState('')

  const testSimpleConnection = async () => {
    setTesting(true)
    setResult('Testing...')
    
    try {
      const startTime = Date.now()
      
      // Just test basic fetch without any Supabase client
      const response = await fetch('https://zgdaqbnpgrabbnljmiqy.supabase.co/rest/v1/', {
        method: 'HEAD',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8'
        }
      })
      
      const duration = Date.now() - startTime
      
      if (response.ok) {
        setResult(`✅ Basic connection works: ${duration}ms`)
      } else {
        setResult(`❌ Connection failed: HTTP ${response.status}`)
      }
    } catch (error) {
      setResult(`❌ Connection error: ${error.message}`)
    }
    
    setTesting(false)
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>🔌 Basic Connection Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={testSimpleConnection} disabled={testing}>
          {testing ? 'Testing...' : 'Test Basic Connection'}
        </Button>
        
        {result && (
          <div className="p-3 bg-gray-100 rounded text-sm">
            {result}
          </div>
        )}
      </CardContent>
    </Card>
  )
}