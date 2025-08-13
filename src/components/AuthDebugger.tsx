import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function AuthDebugger() {
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const runDebugCheck = async () => {
    setLoading(true)
    const info: any = {}
    
    try {
      // Check current auth session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      info.session = {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        error: sessionError?.message
      }

      if (session?.user?.id) {
        // Try to find user by auth ID
        const { data: userById, error: byIdError } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        info.userById = {
          found: !!userById,
          data: userById,
          error: byIdError?.message
        }

        // Try to find user by email
        const { data: userByEmail, error: byEmailError } = await supabase
          .from('users')
          .select('*')
          .eq('email', session.user.email)
          .single()

        info.userByEmail = {
          found: !!userByEmail,
          data: userByEmail,
          error: byEmailError?.message
        }

        // Get all users to see what's in the table
        const { data: allUsers, error: allUsersError } = await supabase
          .from('users')
          .select('id, email, display_name')
          .limit(10)

        info.allUsers = {
          count: allUsers?.length || 0,
          users: allUsers,
          error: allUsersError?.message
        }
      }

    } catch (error: any) {
      info.error = error.message
    }

    setDebugInfo(info)
    setLoading(false)
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Authentication Debugger</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button onClick={runDebugCheck} disabled={loading}>
            {loading ? 'Running Debug...' : 'Run Auth Debug Check'}
          </Button>
          
          {debugInfo && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold">Session Info:</h4>
                <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(debugInfo.session, null, 2)}
                </pre>
              </div>
              
              {debugInfo.userById && (
                <div>
                  <h4 className="font-semibold">User by Auth ID:</h4>
                  <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.userById, null, 2)}
                  </pre>
                </div>
              )}
              
              {debugInfo.userByEmail && (
                <div>
                  <h4 className="font-semibold">User by Email:</h4>
                  <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.userByEmail, null, 2)}
                  </pre>
                </div>
              )}
              
              {debugInfo.allUsers && (
                <div>
                  <h4 className="font-semibold">All Users in Database:</h4>
                  <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo.allUsers, null, 2)}
                  </pre>
                </div>
              )}
              
              {debugInfo.error && (
                <div>
                  <h4 className="font-semibold text-red-600">Error:</h4>
                  <pre className="text-sm bg-red-100 p-2 rounded overflow-auto">
                    {debugInfo.error}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}