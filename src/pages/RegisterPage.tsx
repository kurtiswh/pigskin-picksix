import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ENTRY_FEE, LEAGUESAFE_JOIN_URL } from '@/lib/league'
import { EmailClaimService } from '@/services/emailClaimService'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, PASSWORD_TOO_SHORT } from '@/lib/password'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { user, signUp } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  /** They already have a login — the one thing this page can say for certain. */
  const [hasAccount, setHasAccount] = useState(false)
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
   * The email check answers one question: can this person already sign in?
   *
   * It deliberately says nothing about payment. Payments are matched by hand,
   * so "we don't see your entry" means "we haven't got to it" at least as often
   * as it means "you haven't paid" — and there is no honest way to word that
   * for someone who doesn't have an account yet. The LeagueSafe email is asked
   * for after sign-in instead, where we can tell them whether it worked
   * (see LeagueSafeEmailPrompt).
   *
   * has_login separates a real account from the placeholder rows the LeagueSafe
   * import creates, which carry an address but have never authenticated.
   * (lookup_player_by_email, migration 195.)
   */
  const checkForExistingLogin = async (emailToCheck: string) => {
    try {
      const result = await EmailClaimService.lookupByEmail(emailToCheck, currentSeason)
      setHasAccount(Boolean(result.found && result.has_login))
    } catch (err) {
      // A failed lookup should never block registration — it's an aid, not a gate.
      console.error('Could not check for an existing account:', err)
      setHasAccount(false)
    }
  }

  const handleEmailBlur = () => {
    if (email.trim()) {
      checkForExistingLogin(email.trim())
    } else {
      setHasAccount(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (!displayName.trim()) {
        throw new Error('Enter a display name.')
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(PASSWORD_TOO_SHORT)
      }

      await signUp(email, password, displayName)
      // Deliberately the same message whether or not the address was already
      // registered — signUp sends a confirmation link to new addresses and a
      // sign-in link to existing ones, so this is accurate either way and the
      // form never reveals which emails have accounts.
      setSuccess(
        `✅ Check ${email.trim()} for a link to finish setting up your account. ` +
        `Already had an account? We sent you a sign-in link instead — no second account was created.`
      )
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
            {/* What you need, and where to pay. Nothing else — anything about
                matching LeagueSafe emails is asked after sign-in, where we can
                actually record the answer and confirm it worked. */}
            <div className="mb-6 p-4 rounded-lg bg-[#fff8ea] border border-[#f0dcb0]">
              <div className="text-charcoal-700 text-sm space-y-2">
                <div className="font-semibold text-[#4B3621]">🏈 You need two things to play</div>
                <div className="flex gap-2">
                  <span className="font-bold text-[#b06a1a]">1</span>
                  <span><strong>Your ${ENTRY_FEE} entry.</strong> LeagueSafe is where you pay.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-[#b06a1a]">2</span>
                  <span><strong>An account here.</strong> Free — it's where you make your picks.</span>
                </div>
                <p className="pt-1">Haven't paid yet?</p>
                <a
                  href={LEAGUESAFE_JOIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center px-3 py-2 rounded-lg bg-[#C9A04E] text-pigskin-900 font-bold hover:bg-[#b78e3f] transition-colors"
                >
                  Pay your ${ENTRY_FEE} entry on LeagueSafe
                </a>
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
                {hasAccount && (
                  <p className="text-[#1f7a44] text-sm mt-1">
                    ✅ You already have an account with this email.{' '}
                    <Link to="/login" className="font-semibold underline">Sign in</Link>
                    {' '}— or{' '}
                    <Link to="/login?reset=request" className="font-semibold underline">
                      reset your password
                    </Link>
                    {' '}if you've forgotten it.
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
                  placeholder="Create a password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
                <p className="text-xs text-charcoal-500 mt-1">{PASSWORD_HINT}</p>
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
