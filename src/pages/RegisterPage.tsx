import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ENV } from '@/lib/env'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { user, signUp } = useAuth()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isValidated, setIsValidated] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const validateEmail = async (emailToCheck: string) => {
    try {
      console.log('📧 Validating email via direct API:', emailToCheck)
      
      const supabaseUrl = ENV.SUPABASE_URL || 'https://zgdaqbnpgrabbnljmiqy.supabase.co'
      const apiKey = ENV.SUPABASE_ANON_KEY

      // Check users table
      const usersResponse = await fetch(`${supabaseUrl}/rest/v1/users?or=(email.eq.${emailToCheck},leaguesafe_email.eq.${emailToCheck})&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (usersResponse.ok) {
        const users = await usersResponse.json()
        if (users && users.length > 0) {
          console.log('✅ Email found in users table')
          return true
        }
      }

      // Check leaguesafe_payments table
      const paymentsResponse = await fetch(`${supabaseUrl}/rest/v1/leaguesafe_payments?leaguesafe_email=eq.${emailToCheck}&limit=1`, {
        method: 'GET',
        headers: {
          'apikey': apiKey || '',
          'Authorization': `Bearer ${apiKey || ''}`,
          'Content-Type': 'application/json'
        }
      })

      if (paymentsResponse.ok) {
        const payments = await paymentsResponse.json()
        if (payments && payments.length > 0) {
          console.log('✅ Email found in leaguesafe payments')
          return true
        }
      }

      console.log('❌ Email not found in any table')
      return false
    } catch (error) {
      console.error('❌ Error validating email:', error)
      return false
    }
  }

  const handleEmailBlur = async () => {
    if (email.trim()) {
      const validated = await validateEmail(email.trim())
      setIsValidated(validated)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!displayName.trim()) {
        throw new Error('Display name is required')
      }
      
      await signUp(email, password, displayName)
      setSuccess('✅ Account created! Please check your email for a confirmation link to complete setup.')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
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
              <h1 className="text-2xl font-bold text-white">Pigskin Pick Six</h1>
              <p className="text-pigskin-100 text-sm">Where meaningless games become meaningful</p>
            </div>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl">
              Join the Competition
            </CardTitle>
            <p className="text-center text-charcoal-600 text-sm mt-2">
              Create your account to start making picks
            </p>
          </CardHeader>
          <CardContent>
            {/* Information Panel */}
            <div className="mb-6 p-4 rounded-lg border bg-blue-50 border-blue-200">
              <div className="text-blue-800 text-sm">
                <div className="font-semibold mb-1">📧 Email Validation</div>
                <p>
                  Enter your email address and we'll check if you're already in our system from LeagueSafe payments. 
                  This helps link your account properly, but you can register either way.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Display Name
                </label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How you'll appear on leaderboards"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={handleEmailBlur}
                  placeholder="Your email address"
                  required
                />
                {isValidated === true && (
                  <p className="text-green-600 text-sm mt-1">✅ Email validated - it matches a LeagueSafe payment in our system! Continue creating an account to link your account to your LeagueSafe entry.</p>
                )}
                {isValidated === false && email.trim() && (
                  <p className="text-orange-600 text-sm mt-1">
                    ⚠️ Email not found in our system. We're still processing payments, so this could be normal. Please make sure you're: 1) registered and paid in LeagueSafe, 2) using the same email used in LeagueSafe.
                    <br /><br />
                    To learn more about registering & paying, <a href="https://www.pigskinpicksix.com/blog/welcome-the-20th-edition-of-the-pp6" target="_blank" rel="noopener noreferrer" className="text-pigskin-600 hover:text-pigskin-700 underline font-medium">read more here</a>.
                  </p>
                )}
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
                  placeholder="Create a secure password"
                  required
                />
                <p className="text-xs text-charcoal-500 mt-1">
                  Minimum 8 characters recommended
                </p>
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg text-sm bg-red-50 border border-red-200 text-red-600">
                  ❌ {error}
                </div>
              )}

              {success && (
                <div className="px-4 py-3 rounded-lg text-sm bg-green-50 border border-green-200 text-green-700">
                  {success}
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full bg-pigskin-500 hover:bg-pigskin-600" 
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <p className="text-charcoal-600">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="text-pigskin-600 hover:text-pigskin-700 font-medium"
                >
                  Sign in here
                </Link>
              </p>
            </div>
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