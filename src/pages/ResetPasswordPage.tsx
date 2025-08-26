import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordResetService } from '@/services/passwordResetService'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for password reset tokens in URL (Supabase Auth format)
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        // Check for errors in both query params and hash
        const queryError = searchParams.get('error')
        const queryErrorCode = searchParams.get('error_code')
        const queryErrorDesc = searchParams.get('error_description')
        
        const hashError = hashParams.get('error')
        const hashErrorCode = hashParams.get('error_code')
        const hashErrorDesc = hashParams.get('error_description')

        // Also check for custom token in query params (fallback)
        const customToken = searchParams.get('token')
        
        // IMPORTANT: Check for misrouted password reset codes
        // Sometimes Supabase sends password reset as ?code= instead of proper recovery flow
        const possibleResetCode = searchParams.get('code')
        const errorParam = searchParams.get('error')

        console.log('🔐 FULL URL DEBUG:', {
          fullUrl: window.location.href,
          pathname: window.location.pathname,
          search: window.location.search,
          hash: window.location.hash,
          queryParams: Object.fromEntries(searchParams.entries()),
          hashParams: Object.fromEntries(hashParams.entries())
        })

        console.log('🔐 Checking reset tokens...', { 
          type, 
          hasAccessToken: !!accessToken, 
          hasCustomToken: !!customToken,
          hasPossibleResetCode: !!possibleResetCode,
          queryError,
          queryErrorCode,
          hashError,
          hashErrorCode,
          errorParam,
          accessTokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : null,
          refreshTokenPreview: refreshToken ? refreshToken.substring(0, 20) + '...' : null,
          resetCodePreview: possibleResetCode ? possibleResetCode.substring(0, 8) + '...' : null
        })

        // Handle errors - but check if we also have valid tokens
        if ((queryError || hashError) && (!accessToken || !refreshToken)) {
          const error = queryError || hashError
          const errorCode = queryErrorCode || hashErrorCode
          const errorDesc = queryErrorDesc || hashErrorDesc
          
          console.error('❌ Reset link error (no valid tokens):', { error, errorCode, errorDesc })
          
          if (errorCode === 'otp_expired' || error === 'access_denied') {
            setError('This password reset link has expired or is invalid. This usually means the link was used already, expired (links expire after 1 hour), or there\'s a configuration issue. Please request a new password reset.')
          } else {
            setError(`Reset link error: ${errorDesc || error}. Please request a new password reset.`)
          }
          setTokenValid(false)
          return
        } else if (queryError || hashError) {
          console.log('⚠️ Found errors but also have tokens, attempting recovery anyway...')
        }

        // If this is a Supabase password recovery callback, set the session
        if (type === 'recovery' && accessToken && refreshToken) {
          console.log('🔐 Processing Supabase Auth recovery callback...')
          
          const { supabase } = await import('@/lib/supabase')
          
          // First check current session
          const { data: currentSession } = await supabase.auth.getSession()
          console.log('🔐 Current session before reset:', {
            hasSession: !!currentSession?.session,
            userId: currentSession?.session?.user?.id,
            userEmail: currentSession?.session?.user?.email
          })
          
          const { data: sessionData, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            console.error('❌ Error setting session:', error.message)
            console.error('❌ Full session error:', JSON.stringify(error, null, 2))
            setError('Invalid or expired reset link. Please request a new password reset.')
            setTokenValid(false)
          } else {
            console.log('✅ Session established for password reset')
            console.log('✅ New session data:', {
              hasSession: !!sessionData?.session,
              userId: sessionData?.session?.user?.id,
              userEmail: sessionData?.session?.user?.email
            })
            setTokenValid(true)
          }
        } else if (accessToken && refreshToken && !type) {
          // Sometimes Supabase recovery doesn't include type parameter, try anyway
          console.log('🔐 Found tokens without type, attempting recovery session...')
          
          const { supabase } = await import('@/lib/supabase')
          const { data: sessionData, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            console.error('❌ Error setting session (no type):', error.message)
            setError('Invalid or expired reset link. Please request a new password reset.')
            setTokenValid(false)
          } else {
            console.log('✅ Session established without type parameter')
            setTokenValid(true)
          }
        } else if (customToken) {
          // Handle custom token (our simplified system)
          console.log('🔐 Processing custom password reset token...')
          
          // Get email from URL parameters
          const emailFromUrl = searchParams.get('email')
          
          // For our simplified system, validate token format and extract email
          if (customToken && customToken.length >= 16) {
            console.log('✅ Custom reset token format valid, proceeding with reset')
            if (emailFromUrl) {
              setEmail(emailFromUrl)
              console.log('✅ Email extracted from URL:', emailFromUrl)
            }
            setTokenValid(true)
          } else {
            console.error('❌ Custom token format invalid')
            setError('Invalid reset token format. Please request a new password reset.')
            setTokenValid(false)
          }
        } else if (possibleResetCode) {
          // Handle password reset code (production misconfiguration workaround)
          console.log('🔄 [RESET] Processing password reset code from production')
          console.log('⚠️  [RESET] This indicates Supabase email template is using confirmation flow instead of recovery flow')
          console.log('💡 [RESET] Code value:', possibleResetCode.substring(0, 8) + '...')
          
          // Check if this is actually a PKCE flow that needs additional parameters
          const allParams = Object.fromEntries(searchParams.entries())
          console.log('🔍 [RESET] All URL parameters:', allParams)
          
          // Try to exchange the code for a session
          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(possibleResetCode)
            
            if (error) {
              console.error('❌ [RESET] Failed to exchange password reset code:', error.message)
              console.error('❌ [RESET] Error code:', error.code)
              console.error('❌ [RESET] Error status:', error.status)
              console.error('❌ [RESET] Full error:', JSON.stringify(error, null, 2))
              
              // Provide specific error messages based on the error type
              if (error.code === 'validation_failed' && error.message?.includes('code verifier')) {
                setError('This password reset link is missing required security parameters. This indicates a configuration issue with the email template. Please request a new password reset or contact support.')
              } else if (error.message?.includes('expired') || error.code === 'otp_expired') {
                setError('This password reset link has expired. Please request a new password reset.')
              } else if (error.message?.includes('invalid') || error.code === 'invalid_code') {
                setError('This password reset link is invalid. Please request a new password reset.')
              } else {
                setError(`Unable to process password reset link (${error.code}). Please request a new password reset.`)
              }
              setTokenValid(false)
            } else if (data.session?.user) {
              console.log('✅ [RESET] Successfully exchanged code for session - user can now reset password')
              setTokenValid(true)
            } else {
              console.error('❌ [RESET] Code exchange returned no session')
              setError('Unable to validate reset link. Please request a new password reset.')
              setTokenValid(false)
            }
          } catch (err: any) {
            console.error('❌ [RESET] Exception handling password reset code:', err)
            setError('Failed to process reset link. Please request a new password reset.')
            setTokenValid(false)
          }
        } else if (type === 'recovery') {
          setError('Invalid reset link format. Please request a new password reset.')
          setTokenValid(false)
        } else {
          setError('No reset token provided. Please use the link from your email.')
          setTokenValid(false)
        }
      } catch (err: any) {
        console.error('Error in auth callback:', err)
        setError('Failed to verify reset token. Please try again.')
        setTokenValid(false)
      }
    }

    handleAuthCallback()
  }, [searchParams])

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
      console.log('🔐 Updating password...')
      
      // Check if we have a custom token or Supabase session
      const customToken = searchParams.get('token')
      
      if (customToken) {
        // Use custom password reset service
        console.log('🔐 Using custom password reset service...')
        
        // For custom tokens, we need the email address
        if (!email) {
          setError('Email address is required. Please enter the email address you used for password reset.')
          return
        }
        
        const result = await PasswordResetService.completePasswordReset(customToken, password, email)

        if (result.success) {
          console.log('✅ Password reset completed successfully!')
          setSuccess(true)
        } else {
          throw new Error(result.error || 'Failed to reset password')
        }
      } else {
        // Use Supabase Auth (default)
        console.log('🔐 Using Supabase Auth password update...')
        const { supabase } = await import('@/lib/supabase')
        
        const { error } = await supabase.auth.updateUser({
          password: password
        })

        if (error) {
          console.error('❌ Password update error:', error.message)
          throw error
        }

        console.log('✅ Password updated successfully!')
        setSuccess(true)
      }
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { 
          state: { message: 'Password reset successful! Please log in with your new password.' }
        })
      }, 3000)

    } catch (err: any) {
      console.error('Error resetting password:', err)
      
      let errorMessage = err.message || 'Failed to reset password'
      
      // Handle common error cases
      if (err.message?.includes('rate_limit') || err.message?.includes('429')) {
        errorMessage = 'Password reset is temporarily rate limited. Please wait and try again.'
      } else if (err.message?.includes('session')) {
        errorMessage = 'Your reset session has expired. Please request a new password reset link.'
      }
      
      setError(errorMessage)
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
          {tokenValid === false ? (
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold text-red-600 mb-4">Invalid Reset Link</h2>
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">
                {error}
              </div>
              <div className="space-y-3">
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-pigskin-600 hover:bg-pigskin-700"
                >
                  Request New Password Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/login')}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </div>
          ) : tokenValid === null ? (
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-pigskin-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-charcoal-600">Verifying reset token...</p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              {email && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">
                  <strong>Resetting password for:</strong> {email}
                </div>
              )}

              {/* Email input for custom token resets - only show if email not provided */}
              {searchParams.get('token') && !email && (
                <div>
                  <label className="block text-sm font-medium text-charcoal-700 mb-2">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    required
                    disabled={loading}
                  />
                  <p className="text-xs text-charcoal-500 mt-1">
                    Enter the email address you used for password reset
                  </p>
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
          )}

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