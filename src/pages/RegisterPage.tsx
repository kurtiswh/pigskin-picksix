import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ENTRY_FEE, LEAGUESAFE_JOIN_URL, LEAGUESAFE_PAY_URL } from '@/lib/league'
import { EmailClaimService, PlayerLookup } from '@/services/emailClaimService'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { user, signUp } = useAuth()
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isValidated, setIsValidated] = useState<boolean | null>(null)
  const [lookup, setLookup] = useState<PlayerLookup | null>(null)
  const { activeSeason: currentSeason } = useCurrentSeason()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  /**
   * Resolve against every address we know for a player — sign-in email,
   * LeagueSafe email, or one they added to their profile — plus this season's
   * payment, so someone registering under their newer address still gets
   * recognized. (lookup_player_by_email, migration 191.)
   */
  const validateEmail = async (emailToCheck: string) => {
    try {
      console.log('📧 Validating email:', emailToCheck)
      const result = await EmailClaimService.lookupByEmail(emailToCheck, currentSeason)
      setLookup(result)
      return result.found
    } catch (error) {
      console.error('❌ Error validating email:', error)
      setLookup(null)
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
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center">
            <span className="font-extrabold tracking-wide text-2xl text-[#4B3621]">
              PIGSKIN PICK <span className="text-gold-500">SIX</span>
            </span>
            <p className="text-charcoal-500 text-sm mt-1">Where meaningless games become meaningful</p>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-2xl text-[#4B3621]">
              Join the Competition
            </CardTitle>
            <p className="text-center text-charcoal-600 text-sm mt-2">
              Create your account to start making picks
            </p>
          </CardHeader>
          <CardContent>
            {/* Information Panel */}
            <div className="mb-6 p-4 rounded-lg bg-[#faf8f4] border border-[#e7e2da]">
              <div className="text-charcoal-700 text-sm">
                <div className="font-semibold mb-1 text-[#4B3621]">📧 Use your LeagueSafe email</div>
                <p>
                  We match payments to accounts <strong>by email address</strong>, so register with
                  the same email you use on LeagueSafe. We'll check it as you type. If you have to
                  use a different one, you can add your LeagueSafe email to your profile after you
                  sign up.
                </p>
              </div>
            </div>

            {/* Entry payment */}
            <div className="mb-6 p-4 rounded-lg bg-[#fff8ea] border border-[#f0dcb0]">
              <div className="text-charcoal-700 text-sm">
                <div className="font-semibold mb-1 text-[#4B3621]">💵 Haven't paid your entry?</div>
                <p className="mb-3">
                  An account here is free — the ${ENTRY_FEE} entry is paid through LeagueSafe.
                </p>
                <div className="flex flex-col gap-2">
                  <a
                    href={LEAGUESAFE_JOIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center px-3 py-2 rounded-lg bg-[#C9A04E] text-pigskin-900 font-bold hover:bg-[#b78e3f] transition-colors"
                  >
                    Join &amp; pay on LeagueSafe
                  </a>
                  <a
                    href={LEAGUESAFE_PAY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center px-3 py-2 rounded-lg border border-[#C9A04E] text-pigskin-900 font-semibold hover:bg-white transition-colors"
                  >
                    Already in the league? Pay here
                  </a>
                </div>
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
                  <p className="text-[#1f7a44] text-sm mt-1">
                    {lookup?.paid
                      ? `✅ Found you — your ${currentSeason} entry is paid. Finish creating your account.`
                      : '✅ We recognize that email. Please continue creating an account.'}
                  </p>
                )}
                {isValidated === false && email.trim() && (
                  <p className="text-[#b06a1a] text-sm mt-1">
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
                <div className="px-4 py-3 rounded-lg text-sm bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b]">
                  ❌ {error}
                </div>
              )}

              {success && (
                <div className="px-4 py-3 rounded-lg text-sm bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44]">
                  {success}
                </div>
              )}

              <p className="text-xs text-charcoal-500 leading-relaxed">
                By creating an account you'll get contest emails: when picks open, reminders before the
                deadline, and your weekly results. You can turn them off any time from your profile or the
                unsubscribe link at the bottom of any email.
              </p>

              <Button
                type="submit"
                className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
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
            className="text-charcoal-500 hover:text-[#4B3621] text-sm transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}