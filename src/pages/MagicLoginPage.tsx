import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MagicLinkService } from '@/services/magicLinkService'
import { useAuth } from '@/hooks/useAuth'

export default function MagicLoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const handleMagicLogin = async () => {
      const token = searchParams.get('token')
      
      if (!token) {
        setError('Invalid magic link. No token provided.')
        setLoading(false)
        return
      }

      try {
        console.log('🔮 Processing magic link token')
        
        const result = await MagicLinkService.verifyMagicLink(token)
        
        if (!result.success) {
          setError(result.error || 'Failed to verify magic link')
          setLoading(false)
          return
        }

        console.log('✅ Magic link verified successfully')
        setSuccess(true)
        
        // Refresh user data and redirect
        await refreshUser()
        
        setTimeout(() => {
          navigate('/', { replace: true })
        }, 2000)
        
      } catch (err: any) {
        console.error('❌ Error processing magic link:', err)
        setError('Failed to process magic link. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    handleMagicLogin()
  }, [searchParams, navigate, refreshUser])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">🔮</div>
              <h1 className="text-2xl font-bold text-[#4B3621]">Processing Magic Link</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-[#4B3621] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-charcoal-600">
                Verifying your magic link...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-[#1f7a44]">Magic Link Success!</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-charcoal-600 mb-4">
                You have been successfully signed in!
              </p>
              <p className="text-sm text-charcoal-500 mb-6">
                Redirecting you to the dashboard...
              </p>
              <div className="mt-6">
                <Button
                  onClick={() => navigate('/')}
                  className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
                >
                  Go to Dashboard
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
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-[#d1495b]">Magic Link Error</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="p-3 bg-[#fbe9ec] border border-[#f2c9d1] text-[#d1495b] rounded-lg text-sm mb-6">
              {error}
            </div>

            <p className="text-charcoal-600 mb-6">
              This magic link may be invalid, expired, or already used.
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => navigate('/login')}
                className="w-full bg-[#4B3621] text-white hover:bg-[#3a2a19]"
              >
                Request New Magic Link
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate('/login')}
                className="w-full border-[#e7e2da]"
              >
                Back to Login
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}