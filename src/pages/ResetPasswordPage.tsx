import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, PASSWORD_TOO_SHORT } from '@/lib/password'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [tokenValid, setTokenValid] = useState<boolean | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        if (type === 'recovery' && accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (error) {
            setError("Reset links last one hour. Request a fresh one and we'll email it right over.")
            setTokenValid(false)
          } else {
            setTokenValid(true)
          }
        } else {
          setError('This page needs the link from your reset email. Request one and we\'ll send it over.')
          setTokenValid(false)
        }
      } catch (err: any) {
        setError("We couldn't check that link. Request a new one and try again.")
        setTokenValid(false)
      }
    }

    // Once the password is changed we sign them out on purpose (see below).
    // Without this guard that sign-out would re-run the callback, find the
    // recovery tokens still sitting in the hash, and sign them straight back in.
    if (success) return

    if (user) {
      setTokenValid(true)
    } else {
      handleAuthCallback()
    }
  }, [user, success])

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_TOO_SHORT)
      return
    }

    if (password !== confirmPassword) {
      setError("Those passwords don't match.")
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) {
        throw error
      }

      setSuccess(true)

      // The recovery link already signed them in (setSession above), so without
      // this they'd arrive at /login with a live session and get bounced to /
      // before reading anything. Signing out also makes "sign in with your new
      // password" true, and proves the new password works.
      //
      // supabase.auth.signOut() directly, not the one from useAuth — that one
      // does a hard window.location redirect and would drop ?reset=done.
      await supabase.auth.signOut()

      // ?reset=done, not router state: LoginPage reads search params only, and a
      // query param also survives a reload. The state version never rendered.
      setTimeout(() => {
        navigate('/login?reset=done')
      }, 3000)

    } catch (err: any) {
      console.error('Password update failed:', err)
      setError("We couldn't update your password. Try again in a moment.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-[#1f7a44]">Password Reset Successful!</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-charcoal-600 mb-4">
                Sign in with your new password and you're back in.
              </p>
              <p className="text-sm text-charcoal-500">
                Taking you to sign in in a few seconds...
              </p>
              <div className="mt-6">
                <Button
                  onClick={() => navigate('/login?reset=done')}
                  className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                >
                  Go to sign in
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">
            <div className="text-4xl mb-4">🔐</div>
            <h1 className="text-2xl font-bold text-[#4B3621]">Reset Your Password</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tokenValid === false ? (
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-semibold text-[#d1495b] mb-4">This link has expired</h2>
              <div className="p-3 bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b] rounded-lg text-sm mb-4">
                {error}
              </div>
              <div className="space-y-3">
                {/* ?reset=request opens the inline reset panel on the login card,
                    rather than dropping them on a page where they have to find
                    "Forgot your password?" all over again. */}
                <Button
                  onClick={() => navigate('/login?reset=request')}
                  className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                >
                  Email me a new link
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate('/login')}
                  className="w-full text-sm text-pigskin-600 hover:text-pigskin-700"
                >
                  Back to sign in
                </Button>
              </div>
            </div>
          ) : tokenValid === null ? (
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-[#4B3621] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-charcoal-600">Verifying reset token...</p>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {error && (
                <div className="p-3 bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b] rounded-lg text-sm">
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
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={loading}
                />
                <p className="text-xs text-charcoal-500 mt-1">{PASSWORD_HINT}</p>
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
                  minLength={MIN_PASSWORD_LENGTH}
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !password || !confirmPassword}
                className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
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
                  Back to sign in
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}