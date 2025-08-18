import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth()
  const location = useLocation()

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-stone-200">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                <span className="text-pigskin-900 font-bold text-lg">P6</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-charcoal-900">Pigskin Pick Six Pro</h1>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <Link
                to="/"
                className={`text-sm font-medium transition-colors ${
                  isActive('/') && location.pathname === '/'
                    ? 'text-pigskin-600'
                    : 'text-charcoal-600 hover:text-pigskin-600'
                }`}
              >
                Home
              </Link>
              
              {user && (
                <>
                  <Link
                    to="/picks"
                    className={`text-sm font-medium transition-colors ${
                      isActive('/picks')
                        ? 'text-pigskin-600'
                        : 'text-charcoal-600 hover:text-pigskin-600'
                    }`}
                  >
                    Submit Picks
                  </Link>
                  <Link
                    to="/leaderboard"
                    className={`text-sm font-medium transition-colors ${
                      isActive('/leaderboard')
                        ? 'text-pigskin-600'
                        : 'text-charcoal-600 hover:text-pigskin-600'
                    }`}
                  >
                    Leaderboard
                  </Link>
                </>
              )}

              <Link
                to="/blog"
                className={`text-sm font-medium transition-colors ${
                  isActive('/blog')
                    ? 'text-pigskin-600'
                    : 'text-charcoal-600 hover:text-pigskin-600'
                }`}
              >
                Blog
              </Link>

              {user?.is_admin && (
                <Link
                  to="/admin"
                  className={`text-sm font-medium transition-colors ${
                    isActive('/admin')
                      ? 'text-pigskin-600'
                      : 'text-charcoal-600 hover:text-pigskin-600'
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-sm text-charcoal-600 hidden sm:block">
                    {user.display_name}
                  </span>
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              ) : (
                <div className="space-x-2">
                  <Link to="/login">
                    <Button variant="outline" size="sm">
                      Log In
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* Footer */}
      <footer className="bg-charcoal-900 text-charcoal-100 py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                  <span className="text-pigskin-900 font-bold text-sm">P6</span>
                </div>
                <span className="font-bold">Pigskin Pick Six Pro</span>
              </div>
              <p className="text-charcoal-300 text-sm">
                Where meaningless games become meaningful
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/" className="text-charcoal-300 hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/blog" className="text-charcoal-300 hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link to="/leaderboard" className="text-charcoal-300 hover:text-white transition-colors">
                    Leaderboard
                  </Link>
                </li>
                {user && (
                  <li>
                    <Link to="/picks" className="text-charcoal-300 hover:text-white transition-colors">
                      Submit Picks
                    </Link>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Season Info</h3>
              <p className="text-charcoal-300 text-sm">
                2024 College Football Season
              </p>
              <p className="text-charcoal-300 text-sm">
                Pick 6 games against the spread each week
              </p>
            </div>
          </div>

          <div className="border-t border-charcoal-700 mt-8 pt-6 text-center">
            <p className="text-charcoal-400 text-sm">
              © 2024 Pigskin Pick Six Pro. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}