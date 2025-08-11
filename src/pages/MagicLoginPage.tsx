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
      <div className="min-h-screen bg-stone-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">🔮</div>
              <h1 className="text-2xl font-bold text-charcoal-800">Processing Magic Link</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-pigskin-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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
      <div className="min-h-screen bg-stone-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-2xl font-bold text-green-600">Magic Link Success!</h1>
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
                  className="w-full bg-pigskin-600 hover:bg-pigskin-700"
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
    <div className="min-h-screen bg-stone-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-600">Magic Link Error</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-6">
              {error}
            </div>
            
            <p className="text-charcoal-600 mb-6">
              This magic link may be invalid, expired, or already used.
            </p>

            <div className="space-y-3">
              <Button
                onClick={() => navigate('/login')}
                className="w-full bg-pigskin-600 hover:bg-pigskin-700"
              >
                Request New Magic Link
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
        </CardContent>
      </Card>
    </div>
  )
}