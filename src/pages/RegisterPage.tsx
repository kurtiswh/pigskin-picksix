import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { user, signUp, setupExistingUser } = useAuth()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isFirstTime, setIsFirstTime] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isFirstTime) {
        const result = await setupExistingUser(email, password)
        if (result.success) {
          setSuccess('✅ Setup email sent! Please check your email to complete account setup.')
        } else {
          throw new Error(result.message || 'Setup failed')
        }
      } else {
        if (!displayName.trim()) {
          throw new Error('Display name is required')
        }
        
        await signUp(email, password, displayName)
        setSuccess('✅ Account created! Please check your email for a confirmation link to complete setup.')
      }
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
            {/* Registration Type Selection */}
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsFirstTime(false)}
                  className={`p-4 border rounded-lg text-sm font-medium transition-colors ${
                    !isFirstTime 
                      ? 'bg-pigskin-500 text-white border-pigskin-500' 
                      : 'bg-white text-charcoal-700 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  <div className="text-2xl mb-2">🆕</div>
                  <div className="font-semibold">New Player</div>
                  <div className="text-xs opacity-75">Create new account</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsFirstTime(true)}
                  className={`p-4 border rounded-lg text-sm font-medium transition-colors ${
                    isFirstTime 
                      ? 'bg-pigskin-500 text-white border-pigskin-500' 
                      : 'bg-white text-charcoal-700 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  <div className="text-2xl mb-2">🔗</div>
                  <div className="font-semibold">League Member</div>
                  <div className="text-xs opacity-75">Already paid via LeagueSafe</div>
                </button>
              </div>
            </div>

            {/* Information Panel */}
            <div className={`mb-6 p-4 rounded-lg border ${
              isFirstTime 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              {isFirstTime ? (
                <div className="text-blue-800 text-sm">
                  <div className="font-semibold mb-1">🔗 League Member Setup</div>
                  <p>
                    Use the <strong>same email address</strong> from your LeagueSafe payment. 
                    We'll automatically link your account to your league entry.
                  </p>
                </div>
              ) : (
                <div className="text-green-800 text-sm">
                  <div className="font-semibold mb-1">🆕 New Player Registration</div>
                  <p>
                    Create a new account. Remember to use the same email when you make your LeagueSafe payment 
                    to link your account properly.
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isFirstTime && (
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
              )}
              
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-charcoal-700 mb-1">
                  Email Address
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isFirstTime ? "Email from your LeagueSafe payment" : "Your email address"}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-charcoal-700 mb-1">
                  {isFirstTime ? 'Create Password' : 'Password'}
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
                {loading ? 'Creating Account...' : (
                  isFirstTime ? 'Set Up My Account' : 'Create Account'
                )}
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