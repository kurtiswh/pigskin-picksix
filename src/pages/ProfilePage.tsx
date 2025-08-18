import { useAuth } from '@/hooks/useAuth'
import { Navigate } from 'react-router-dom'
import UserProfile from '@/components/UserProfile'
import Layout from '@/components/Layout'

export default function ProfilePage() {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <Layout>
      {/* Page Header */}
      <div className="bg-pigskin-500 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">My Profile</h1>
            <p className="text-pigskin-100">Manage your account settings</p>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <UserProfile />
      </main>
    </Layout>
  )
}