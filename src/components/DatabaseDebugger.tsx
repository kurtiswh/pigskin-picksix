import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

export default function DatabaseDebugger() {
  const [results, setResults] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const addResult = (message: string) => {
    setResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const clearResults = () => setResults([])

  const testUserQuery = async () => {
    setLoading(true)
    try {
      addResult('🔍 Testing user queries...')
      
      // Count total users
      const { count, error: countError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
      
      if (countError) {
        addResult(`❌ Error counting users: ${countError.message}`)
      } else {
        addResult(`📊 Total users in database: ${count}`)
      }

      // Get first few users
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name, leaguesafe_email, is_admin')
        .limit(5)

      if (usersError) {
        addResult(`❌ Error fetching users: ${usersError.message}`)
      } else {
        addResult(`👥 First 5 users:`)
        users?.forEach(user => {
          addResult(`  - ${user.display_name} (${user.email}) ${user.leaguesafe_email ? `[LS: ${user.leaguesafe_email}]` : ''}`)
        })
      }

    } catch (error: any) {
      addResult(`💥 Exception: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testPaymentQuery = async () => {
    setLoading(true)
    try {
      addResult('💰 Testing payment queries...')
      
      const currentSeason = new Date().getFullYear()
      
      // Count payments for current season
      const { count, error: countError } = await supabase
        .from('leaguesafe_payments')
        .select('*', { count: 'exact', head: true })
        .eq('season', currentSeason)
      
      if (countError) {
        addResult(`❌ Error counting payments: ${countError.message}`)
      } else {
        addResult(`💰 Payments for ${currentSeason}: ${count}`)
      }

      // Get some payments
      const { data: payments, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('leaguesafe_email, leaguesafe_owner_name, status, is_matched')
        .eq('season', currentSeason)
        .limit(5)

      if (paymentsError) {
        addResult(`❌ Error fetching payments: ${paymentsError.message}`)
      } else {
        addResult(`💰 Sample payments for ${currentSeason}:`)
        payments?.forEach(payment => {
          addResult(`  - ${payment.leaguesafe_owner_name} (${payment.leaguesafe_email}) - ${payment.status} ${payment.is_matched ? '✓' : '✗'}`)
        })
      }

    } catch (error: any) {
      addResult(`💥 Exception: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testUserCreation = async () => {
    setLoading(true)
    try {
      addResult('👤 Testing user creation...')
      
      const testEmail = `test-${Date.now()}@example.com`
      const testId = crypto.randomUUID()
      
      addResult(`Creating test user: ${testEmail} with ID: ${testId}`)
      
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{
          id: testId,
          email: testEmail,
          display_name: 'Test User',
          is_admin: false
        }])
        .select()
        .single()

      if (createError) {
        addResult(`❌ Failed to create test user: ${createError.code} - ${createError.message}`)
        if (createError.details) {
          addResult(`   Details: ${createError.details}`)
        }
        if (createError.hint) {
          addResult(`   Hint: ${createError.hint}`)
        }
      } else {
        addResult(`✅ Created test user: ${newUser.email}`)
        
        // Clean up - delete the test user
        const { error: deleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', testId)
        
        if (deleteError) {
          addResult(`⚠️ Could not clean up test user: ${deleteError.message}`)
        } else {
          addResult(`🧹 Cleaned up test user`)
        }
      }

    } catch (error: any) {
      addResult(`💥 Exception: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const checkTableExists = async () => {
    setLoading(true)
    try {
      addResult('🔍 Checking if leaguesafe_payments table exists...')
      
      // Try a simple query to see if table exists
      const { data, error } = await supabase
        .from('leaguesafe_payments')
        .select('id')
        .limit(1)

      if (error) {
        if (error.code === '42P01') {
          addResult('❌ leaguesafe_payments table does NOT exist')
          addResult('   You need to run the database migration!')
        } else {
          addResult(`❌ Error checking table: ${error.message}`)
        }
      } else {
        addResult('✅ leaguesafe_payments table exists')
        addResult('   Database is ready for LeagueSafe uploads')
      }

    } catch (error: any) {
      addResult(`💥 Exception: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Database Debugger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={testUserQuery} disabled={loading} size="sm">
            Test Users
          </Button>
          <Button onClick={testPaymentQuery} disabled={loading} size="sm">
            Test Payments
          </Button>
          <Button onClick={checkTableExists} disabled={loading} size="sm">
            Check Tables
          </Button>
          <Button onClick={testUserCreation} disabled={loading} size="sm">
            Test User Creation
          </Button>
          <Button onClick={clearResults} variant="outline" size="sm">
            Clear
          </Button>
        </div>
        
        {results.length > 0 && (
          <div className="p-3 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
            <div className="text-sm font-medium mb-2">Debug Output:</div>
            <div className="space-y-1 text-xs font-mono">
              {results.map((result, i) => (
                <div key={i} className="whitespace-pre-wrap">{result}</div>
              ))}
            </div>
          </div>
        )}
        
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin w-4 h-4 border-2 border-pigskin-500 border-t-transparent rounded-full mr-2"></div>
            <span className="text-sm">Running tests...</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}