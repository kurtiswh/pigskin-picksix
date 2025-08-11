import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('🔐 Processing password reset callback...')
        
        // Get tokens from URL hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        console.log('📋 URL params:', { accessToken: accessToken ? 'present' : 'missing', refreshToken: refreshToken ? 'present' : 'missing', type })

        // Check if this is a password recovery callback
        if (type === 'recovery' && accessToken && refreshToken) {
          console.log('✅ Valid password recovery tokens found')
          
          // Set the session using the tokens from the URL
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            console.error('❌ Error setting session:', error)
            console.error('Session error details:', JSON.stringify(error, null, 2))
            setError('Invalid or expired reset link. Please request a new password reset.')
            return
          }

          console.log('✅ Session established successfully:', data.session ? 'Session active' : 'No session')
          console.log('Session details:', {
            user: data.session?.user ? `${data.session.user.email} (${data.session.user.id})` : 'No user',
            expiresAt: data.session?.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : 'No expiry',
            accessToken: data.session?.access_token ? 'Present' : 'Missing'
          })
          
        } else {
          console.warn('⚠️ Missing required tokens or invalid type')
          console.warn('URL analysis:', { 
            hasAccessToken: !!accessToken, 
            hasRefreshToken: !!refreshToken, 
            type, 
            fullHash: window.location.hash 
          })
          setError('Invalid or expired reset link. Please request a new password reset.')
        }

      } catch (err) {
        console.error('💥 Error in auth callback:', err)
        setError('Invalid or expired reset link. Please request a new password reset.')
      }
    }

    handleAuthCallback()
  }, [])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      console.log('🔐 Starting password update process...')
      
      // First, verify we have a valid session
      console.log('📋 Checking current session...')
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      console.log('Session check result:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userEmail: session?.user?.email,
        sessionError: sessionError?.message,
        isExpired: session?.expires_at ? (session.expires_at * 1000) < Date.now() : 'unknown'
      })
      
      if (sessionError || !session) {
        console.error('❌ No valid session for password update:', sessionError)
        setError('Your reset session has expired. Please request a new password reset.')
        return
      }

      console.log('✅ Valid session confirmed, proceeding with password update')
      console.log('Password length:', password.length, 'characters')
      
      // Try the password update WITHOUT Promise.race first to see if it hangs
      console.log('🚀 Starting updateUser call...')
      
      const updateStartTime = Date.now()
      let updateResult
      
      try {
        // Add a failsafe timeout to prevent infinite hanging
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => {
            console.error('🚨 Password update exceeded 30 second limit')
            reject(new Error('Password update is taking too long. This may indicate a configuration issue with Supabase Auth.'))
          }, 30000)
        )

        const updatePromise = supabase.auth.updateUser({
          password: password
        })

        updateResult = await Promise.race([updatePromise, timeoutPromise])
        
        const updateDuration = Date.now() - updateStartTime
        console.log(`⏱️ updateUser completed in ${updateDuration}ms`)
        console.log('Update result:', {
          hasData: !!updateResult.data,
          hasError: !!updateResult.error,
          errorMessage: updateResult.error?.message,
          userData: updateResult.data?.user ? `${updateResult.data.user.email}` : 'No user data'
        })
        
      } catch (updateError) {
        console.error('💥 updateUser threw an exception:', updateError)
        throw updateError
      }

      const { data, error } = updateResult

      if (error) {
        console.error('❌ Password update returned error:', error)
        console.error('Error details:', JSON.stringify(error, null, 2))
        throw error
      }

      console.log('✅ Password updated successfully!')
      console.log('Success data:', {
        hasUser: !!data.user,
        userEmail: data.user?.email,
        lastSignIn: data.user?.last_sign_in_at
      })
      setSuccess(true)
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Password reset successful! Please log in with your new password.' }
        })
      }, 3000)

    } catch (err: any) {
      console.error('Error resetting password:', err)
      setError(err.message || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-green-600">Password Reset Successful!</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-charcoal-600 mb-4">
                Your password has been successfully updated.
              </p>
              <p className="text-sm text-charcoal-500">
                Redirecting you to the login page in a few seconds...
              </p>
              <div className="mt-6">
                <Button 
                  onClick={() => navigate('/login')}
                  className="w-full bg-pigskin-600 hover:bg-pigskin-700"
                >
                  Go to Login
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">
            <div className="text-4xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold text-charcoal-800">Reset Your Password</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                New Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your new password"
                required
                minLength={6}
                disabled={loading}
              />
              <p className="text-xs text-charcoal-500 mt-1">
                Must be at least 6 characters long
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal-700 mb-2">
                Confirm New Password
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full bg-pigskin-600 hover:bg-pigskin-700"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Updating Password...
                </>
              ) : (
                'Update Password'
              )}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/login')}
                className="text-sm text-pigskin-600 hover:text-pigskin-700"
              >
                Back to Login
              </Button>
            </div>
          </form>

          <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Password Requirements:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• At least 6 characters long</li>
              <li>• Should be unique and not easily guessable</li>
              <li>• Consider using a mix of letters, numbers, and symbols</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}