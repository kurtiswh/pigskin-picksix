import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { ENTRY_FEE, LEAGUESAFE_JOIN_URL } from '@/lib/league'

/**
 * Supabase's auth errors are written for developers. Map the ones players
 * actually hit; anything else falls through to a plain apology with the raw
 * text still going to the console.
 */
const SIGN_IN_ERRORS: Array<{ match: RegExp; message: string; offerReset?: boolean }> = [
  {
    match: /invalid login credentials/i,
    message: "That email and password don't match. Try again, or reset your password.",
    offerReset: true,
  },
  {
    match: /email not confirmed/i,
    message: "You haven't confirmed your email yet — check your inbox for the confirmation link.",
  },
  {
    match: /rate limit|too many requests/i,
    message: 'Too many attempts. Give it a minute and try again.',
  },
]

function readableSignInError(raw: string) {
  const known = SIGN_IN_ERRORS.find((candidate) => candidate.match.test(raw))
  if (known) return { message: known.message, offerReset: Boolean(known.offerReset) }
  return { message: 'Something went wrong signing you in. Try again in a moment.', offerReset: false }
}

export default function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, signIn, signInWithMagicLink } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [offerReset, setOfferReset] = useState(false)
  const [notice, setNotice] = useState('')

  // Forgot-password lives inline in this card. It used to be a browser
  // prompt()/alert() pair, which is unbranded and silently suppressed in some
  // in-app browsers — so "Forgot your password?" did nothing at all for anyone
  // who opened the site from an email client.
  const [resetOpen, setResetOpen] = useState(searchParams.get('reset') === 'request')
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetNotice, setResetNotice] = useState('')
  const [resetError, setResetError] = useState('')

  // "Email me a login link" — Supabase Auth's OTP, which creates a real session
  // when the link is opened. The app used to carry its own magic_link_tokens
  // table and MagicLinkService for this; see migration 212 for why that could
  // never have worked from a browser.
  const [magicOpen, setMagicOpen] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSending, setMagicSending] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [magicMsg, setMagicMsg] = useState('')

  useEffect(() => {
    if (!user) return

    // Email confirmation signs them in, which used to bounce them off this page
    // before the "confirmed" banner could be read — the same way the password
    // reset message was being lost. Hold briefly when there's something to read.
    const timer = setTimeout(() => navigate('/'), notice ? 2500 : 0)
    return () => clearTimeout(timer)
  }, [user, notice, navigate])

  // Arrival banners. Each event has exactly one string; the password-reset one
  // arrives as ?reset=done because router state does not survive a reload (and
  // was never being read here at all).
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const confirmed =
      urlParams.get('confirmed') === 'true' ||
      Boolean(urlParams.get('code')) ||
      (hashParams.get('type') === 'signup' && Boolean(hashParams.get('access_token')))

    if (urlParams.get('reset') === 'done') {
      setNotice('✅ Password updated. Sign in with your new password.')
    } else if (confirmed) {
      setNotice("✅ Email confirmed — you're signed in.")
    } else {
      return
    }

    // Clear the parameters once the message is up, so a reload doesn't repeat it.
    const timer = setTimeout(() => {
      window.history.replaceState({}, document.title, window.location.pathname)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setOfferReset(false)

    try {
      await signIn(email, password)
      navigate('/')
    } catch (err: any) {
      console.error('Sign in failed:', err)
      const readable = readableSignInError(err?.message ?? '')
      setError(readable.message)
      setOfferReset(readable.offerReset)
    } finally {
      setLoading(false)
    }
  }

  const openReset = () => {
    setResetEmail(email)
    setResetNotice('')
    setResetError('')
    setResetOpen(true)
  }

  const handleSendMagicLink = async () => {
    const target = magicEmail.trim()
    if (!target) {
      setMagicSent(false)
      setMagicMsg('Enter the email address on your account.')
      return
    }

    setMagicSending(true)
    setMagicMsg('')
    try {
      await signInWithMagicLink(target)
      setMagicSent(true)
      setMagicMsg(`✅ Login link sent to ${target}. Check your inbox — and your spam folder if it's not there in a minute.`)
    } catch (err: any) {
      console.error('Magic link failed:', err)
      const raw = String(err?.message || '')
      setMagicSent(false)
      // shouldCreateUser is false, so an unknown address comes back as a signup
      // refusal. Say the useful thing instead of repeating Supabase at them.
      setMagicMsg(
        /signups not allowed|user not found/i.test(raw)
          ? "We couldn't find an account with that email. If you've paid but never registered, use \u201cCreate an account\u201d below."
          : /rate limit|too many requests/i.test(raw)
          ? 'Too many attempts. Give it a minute and try again.'
          : 'Could not send the login link. Try again in a moment.'
      )
    } finally {
      setMagicSending(false)
    }
  }

  const handleSendReset = async () => {
    const target = resetEmail.trim()
    if (!target) {
      setResetError('Enter the email address on your account.')
      return
    }

    setResetSending(true)
    setResetError('')
    setResetNotice('')

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetErr) throw resetErr

      setResetNotice(
        `✅ Reset link sent to ${target}. Check your inbox — and your spam folder if it's not there in a minute.`
      )
      setResetOpen(false)
    } catch (err: any) {
      console.error('Password reset failed:', err)
      // Supabase's throttle message names the wait, which is the one thing that
      // helps here — a flat "try again in a moment" makes people hammer it.
      setResetError(
        /rate limit|for security purposes|too many requests/i.test(err?.message ?? '')
          ? 'You just asked for one. Give it a minute and try again.'
          : "Couldn't send the reset link. Try again in a moment."
      )
    } finally {
      setResetSending(false)
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
              Welcome Back
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notice && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44]">
                {notice}
              </div>
            )}

            {resetNotice && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm bg-[#e6f4ea] border border-[#bfe3cc] text-[#1f7a44]">
                {resetNotice}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <div className="px-4 py-3 rounded-lg text-sm bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b]">
                  <p>{error}</p>
                  {offerReset && (
                    <button
                      type="button"
                      onClick={openReset}
                      className="mt-2 font-semibold underline"
                    >
                      Reset your password
                    </button>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                disabled={loading}
              >
                {loading ? 'Please wait...' : 'Sign in'}
              </Button>
            </form>

            {resetOpen ? (
              <div className="mt-4 p-4 bg-[#faf8f4] border border-[#e7e2da] rounded-lg space-y-3">
                <p className="text-sm font-semibold text-[#4B3621]">Reset your password</p>
                <p className="text-sm text-charcoal-700">We'll email a reset link to:</p>
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter your email"
                />
                {resetError && (
                  <p className="text-sm text-[#d1495b]">{resetError}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleSendReset}
                    disabled={resetSending}
                    className="bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                  >
                    {resetSending ? 'Sending...' : 'Send reset link'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#e7e2da]"
                    onClick={() => setResetOpen(false)}
                    disabled={resetSending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : magicOpen ? (
              <div className="mt-4 p-4 bg-[#faf8f4] border border-[#e7e2da] rounded-lg space-y-3">
                <p className="text-sm font-semibold text-[#4B3621]">Email me a login link</p>
                <p className="text-sm text-charcoal-700">
                  We'll send a link that signs you in — no password needed.
                </p>
                <Input
                  type="email"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  placeholder="Enter your email"
                />
                {magicMsg && (
                  <p className={`text-sm ${magicSent ? 'text-[#1f7a49]' : 'text-[#d1495b]'}`}>{magicMsg}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={handleSendMagicLink}
                    disabled={magicSending || !magicEmail.trim()}
                    className="bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                  >
                    {magicSending ? 'Sending...' : 'Send login link'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#e7e2da]"
                    onClick={() => setMagicOpen(false)}
                    disabled={magicSending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={openReset}
                  className="text-sm text-pigskin-600 hover:text-pigskin-700 font-medium underline"
                >
                  Forgot your password?
                </button>
                <button
                  type="button"
                  onClick={() => { setMagicOpen(true); setMagicEmail(email); setMagicMsg(''); setMagicSent(false) }}
                  className="text-sm text-pigskin-600 hover:text-pigskin-700 font-medium underline"
                >
                  Email me a login link instead
                </button>
              </div>
            )}

            <div className="my-5 border-t border-[#e7e2da]" />

            {/* The fork. Paying LeagueSafe does not create an account here, and
                this page is where people discover that — so it has to say both
                what they need and where to go next. */}
            <div className="p-4 rounded-lg bg-[#fff8ea] border border-[#f0dcb0]">
              <div className="text-charcoal-700 text-sm space-y-2">
                <div className="text-lg font-extrabold text-[#4B3621]">New here?</div>
                <p className="font-semibold text-[#4B3621]">You need two things to play.</p>
                <div className="flex gap-2">
                  <span className="font-bold text-[#b06a1a]">1</span>
                  <span><strong>Your ${ENTRY_FEE} entry.</strong> LeagueSafe is where you pay.</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-bold text-[#b06a1a]">2</span>
                  <span>
                    <strong>An account here.</strong> This is where you make your picks. It's free and
                    takes a minute to set up.
                  </span>
                </div>
                <p>
                  If you haven't paid,{' '}
                  <a
                    href={LEAGUESAFE_JOIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-pigskin-700"
                  >
                    don't forget to make that payment
                  </a>
                  .
                </p>
                <Link to="/register" className="block pt-1">
                  <Button
                    type="button"
                    className="bg-[#C9A04E] text-pigskin-900 font-bold hover:bg-[#b78e3f]"
                  >
                    Create your account
                  </Button>
                </Link>
              </div>
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
