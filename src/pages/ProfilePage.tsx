import { useAuth } from '@/hooks/useAuth'
import { Navigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import UserProfile from '@/components/UserProfile'
import AuthDebugger from '@/components/AuthDebugger'

export default function ProfilePage() {
  const { user, signOut } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-pigskin-500 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                <span className="text-pigskin-900 font-bold">P6</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">My Profile</h1>
                <p className="text-pigskin-100 text-sm">Manage your account settings</p>
              </div>
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-pigskin-100">Hi, {user.display_name}!</span>
              <Button 
                variant="outline" 
                size="sm"
                className="border-white text-white hover:bg-white hover:text-pigskin-500"
                onClick={signOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <UserProfile />
        <AuthDebugger />
      </main>
    </div>
  )
}