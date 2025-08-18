import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, signIn, signUp, setupExistingUser, signInWithGoogle, signInWithMagicLink } = useAuth()
  
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signup') === 'true')
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPositiveMessage, setIsPositiveMessage] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  // Check for email confirmation success
  useEffect(() => {
    // Check URL query parameters (for email confirmation links with ?code=)
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    
    // Check URL hash parameters (for magic links with #access_token=)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const type = hashParams.get('type')
    const accessToken = hashParams.get('access_token')
    
    console.log('🔍 [CONFIRMATION] Checking for auth callback:', { 
      hasCode: !!code, 
      hashType: type, 
      hasAccessToken: !!accessToken 
    })
    
    // Check if this is an email confirmation callback (query parameter)
    if (code) {
      console.log('✅ Email confirmation code detected in URL')
      setIsPositiveMessage(true)
      setError('✅ Email confirmed successfully! You are now signed in.')
      // Clear the URL parameters after a short delay
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }, 3000)
    }
    // Check if this is a hash-based auth callback (magic links)
    else if (type === 'signup' && accessToken) {
      console.log('✅ Email confirmation detected in hash')
      setIsPositiveMessage(true)
      setError('✅ Email confirmed successfully! You are now signed in.')
      // Clear the URL hash after a short delay
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }, 3000)
    } else if (type === 'magiclink' && accessToken) {
      console.log('✅ Magic link login detected')
      setIsPositiveMessage(true)
      setError('✅ Magic link authentication successful! You are now signed in.')
      // Clear the URL hash after a short delay
      setTimeout(() => {
        window.history.replaceState({}, document.title, window.location.pathname)
      }, 3000)
    }
  }, [])

  const checkForExistingUser = async (email: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      
      // Check if user exists in the users table or leaguesafe_payments table
      const { data: existingUsers } = await supabase
        .from('users')
        .select('email, leaguesafe_email')
        .or(`email.eq.${email},leaguesafe_email.eq.${email}`)
        .limit(1)

      const { data: leaguesafeUsers } = await supabase
        .from('leaguesafe_payments')
        .select('leaguesafe_email')
        .eq('leaguesafe_email', email)
        .eq('is_matched', false)
        .limit(1)

      return (existingUsers && existingUsers.length > 0) || (leaguesafeUsers && leaguesafeUsers.length > 0)
    } catch (error) {
      console.error('Error checking for existing user:', error)
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('📝 [FORM] Form submitted - mode:', { isFirstTime, isSignUp, email })
    e.preventDefault()
    setLoading(true)
    setError('')
    setIsPositiveMessage(false)

    try {
      if (isFirstTime) {
        console.log('📝 [FORM] Calling setupExistingUser...')
        const result = await setupExistingUser(email, password)
        if (result.success) {
          alert(result.message || 'Setup email sent! Please check your email to complete account setup.')
        }
      } else if (isSignUp) {
        console.log('📝 [FORM] Processing signup...')
        if (!displayName.trim()) {
          throw new Error('Display name is required')
        }
        
        console.log('📝 [FORM] TEMPORARILY SKIPPING user existence check due to RLS issues')
        // TEMPORARILY SKIP the user existence check that's hanging
        /*
        // Check if user already exists before attempting signup
        const userExists = await checkForExistingUser(email)
        if (userExists) {
          // Instead of throwing an error, smoothly transition to existing user setup
          setIsSignUp(false)
          setIsFirstTime(true)
          setDisplayName('') // Clear display name since it's not needed for first-time setup
          
          // Show a helpful message instead of an alert
          setIsPositiveMessage(true)
          setError('Good news! We found your email in our system. The form has been switched to "First Time Setup" mode. Please create a password to access your existing account.')
          return
        }
        */
        
        console.log('📝 [FORM] Calling signUp function...')
        await signUp(email, password, displayName)
        setIsPositiveMessage(true)
        setError('✅ Account created! Please check your email for a confirmation link to complete setup.')
      } else {
        console.log('📝 [FORM] Calling signIn...')
        await signIn(email, password)
        navigate('/')
      }
    } catch (err: any) {
      console.error('📝 [FORM] Form submission error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleMagicLink = async () => {
    const userEmail = prompt('Enter your email address to receive a magic sign-in link:')
    
    if (!userEmail) return
    
    if (!userEmail.includes('@')) {
      alert('Please enter a valid email address')
      return
    }

    try {
      const { MagicLinkService } = await import('@/services/magicLinkService')
      const result = await MagicLinkService.sendMagicLink(userEmail)
      
      if (result.success) {
        alert(`✅ Magic link sent to ${userEmail}! Please check your inbox and click the link to sign in.`)
      } else {
        throw new Error(result.error || 'Failed to send magic link')
      }
    } catch (err: any) {
      console.error('Magic link error:', err)
      alert(`❌ Failed to send magic link: ${err.message}`)
    }
  }

  const handleForgotPassword = async () => {
    const userEmail = prompt('Enter your email address to receive a password reset link:')
    
    if (!userEmail) return
    
    if (!userEmail.includes('@')) {
      alert('Please enter a valid email address')
      return
    }

    try {
      const { PasswordResetService } = await import('@/services/passwordResetService')
      const result = await PasswordResetService.sendPasswordReset(userEmail)
      
      if (result.success) {
        alert(`✅ Password reset email sent to ${userEmail}! Please check your inbox and click the reset link.`)
      } else {
        throw new Error(result.error || 'Failed to send password reset email')
      }
    } catch (err: any) {
      console.error('Password reset error:', err)
      alert(`❌ Failed to send password reset email: ${err.message}`)
    }
  }

  const handleTestResend = async () => {
    try {
      // First test the ultra-simple endpoint
      console.log('Testing basic API endpoint...')
      const helloResponse = await fetch('/api/hello')
      console.log('Hello response status:', helloResponse.status)
      
      if (helloResponse.ok) {
        const helloResult = await helloResponse.json()
        console.log('Hello result:', helloResult)
        alert(`✅ Basic API works: ${helloResult.message}`)
      } else {
        console.error('Hello endpoint failed:', helloResponse.status)
        alert(`❌ Basic API failed with status: ${helloResponse.status}`)
        return
      }

      // Test with a simple GET request first
      console.log('Testing Resend endpoint with GET...')
      const response = await fetch('/api/test-resend')

      console.log('Resend response status:', response.status)
      console.log('Resend response headers:', Object.fromEntries(response.headers.entries()))

      if (response.status === 0) {
        alert('❌ Network error - function may not exist')
        return
      }

      const responseText = await response.text()
      console.log('Resend response text:', responseText)
      
      try {
        const result = JSON.parse(responseText)
        console.log('Resend result:', result)
        
        if (response.ok) {
          alert(`✅ Resend test passed: ${JSON.stringify(result)}`)
        } else {
          alert(`❌ Resend test failed: ${JSON.stringify(result)}`)
        }
      } catch (jsonError) {
        console.error('JSON parse error:', jsonError)
        console.error('Response text:', responseText)
        alert(`❌ Invalid JSON response. Status: ${response.status}, Text: ${responseText}`)
      }
    } catch (err: any) {
      console.error('Test exception:', err)
      alert(`❌ Test exception: ${err.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pigskin-600 to-pigskin-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center space-x-3">
            <div className="w-16 h-16 bg-gold-500 rounded-full flex items-center justify-center football-laces">
              <span className="text-pigskin-900 font-bold text-2xl">P6</span>
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold text-white">Pigskin Pick Six Pro</h1>
              <p className="text-pigskin-100 text-sm">Where meaningless games become meaningful</p>
            </div>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              {isFirstTime ? 'First Time Setup' : isSignUp ? 'Join the Competition' : 'Welcome Back'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mode Selection */}
            {!isFirstTime && !isSignUp && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Existing league member?</strong> If you were added to the league via LeagueSafe but haven't set up your login yet, 
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFirstTime(true)}
                  className="text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  Set up first-time login
                </Button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && !isFirstTime && (
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-charcoal-700 mb-1">
                    Display Name
                  </label>
                  <Input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                    required={isSignUp}
                  />
                </div>
              )}
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error && (
                <div className={`px-4 py-3 rounded-lg text-sm ${
                  isPositiveMessage 
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-600'
                }`}>
                  {error}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Please wait...' : (
                  isFirstTime ? 'Set Up Account' : 
                  isSignUp ? 'Create Account' : 
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-stone-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-charcoal-500">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full mt-4"
                onClick={handleGoogleSignIn}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full mt-2"
                onClick={handleMagicLink}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Send Magic Link
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full mt-2 bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                onClick={handleTestResend}
              >
                🧪 Test Resend API
              </Button>
            </div>

            <div className="mt-6 text-center text-sm">
              {isFirstTime ? (
                <p className="text-charcoal-600">
                  Already have login credentials?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsFirstTime(false)
                      setIsSignUp(false)
                    }}
                    className="text-pigskin-600 hover:text-pigskin-700 font-medium"
                  >
                    Regular sign in
                  </button>
                </p>
              ) : isSignUp ? (
                <p className="text-charcoal-600">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="text-pigskin-600 hover:text-pigskin-700 font-medium"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p className="text-charcoal-600">
                  New to Pigskin Pick Six Pro?{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(true)}
                    className="text-pigskin-600 hover:text-pigskin-700 font-medium"
                  >
                    Create an account
                  </button>
                </p>
              )}
            </div>

            {!isFirstTime && !isSignUp && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-pigskin-600 hover:text-pigskin-700 font-medium underline"
                >
                  Forgot your password?
                </button>
              </div>
            )}

            {isFirstTime && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  <strong>First-time setup:</strong> Use the email address associated with your LeagueSafe payment. 
                  We'll create your login credentials and link your account automatically.
                </p>
              </div>
            )}
            
            {isSignUp && !isFirstTime && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Important:</strong> Use the same email address that you used for LeagueSafe registration 
                  to ensure your account is properly linked to your payment.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-6">
          <Link 
            to="/" 
            className="text-pigskin-100 hover:text-white text-sm transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}