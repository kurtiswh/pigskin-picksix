import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) return // Prevent double-clicks
    
    try {
      setSigningOut(true)
      console.log('🚪 Layout: Starting sign out...')
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
      setSigningOut(false)
    }
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-pigskin-500 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center football-laces">
                <span className="text-pigskin-900 font-bold text-lg">P6</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-white">Pigskin Pick Six Pro</h1>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-6">
              <Link
                to="/"
                className={`text-sm font-medium transition-colors ${
                  isActive('/') && location.pathname === '/'
                    ? 'text-gold-300'
                    : 'text-pigskin-100 hover:text-white'
                }`}
              >
                Home
              </Link>
              
              <Link
                to="/picks"
                className={`text-sm font-medium transition-colors ${
                  isActive('/picks')
                    ? 'text-gold-300'
                    : 'text-pigskin-100 hover:text-white'
                }`}
              >
                Picks
              </Link>
              
              <Link
                to="/leaderboard"
                className={`text-sm font-medium transition-colors ${
                  isActive('/leaderboard')
                    ? 'text-gold-300'
                    : 'text-pigskin-100 hover:text-white'
                }`}
              >
                Leaderboard
              </Link>

              <Link
                to="/blog"
                className={`text-sm font-medium transition-colors ${
                  isActive('/blog')
                    ? 'text-gold-300'
                    : 'text-pigskin-100 hover:text-white'
                }`}
              >
                Blog
              </Link>

              {user?.is_admin && (
                <>
                  <Link
                    to="/admin"
                    className={`text-sm font-medium transition-colors ${
                      isActive('/admin') && !isActive('/admin/blog')
                        ? 'text-gold-300'
                        : 'text-pigskin-100 hover:text-white'
                    }`}
                  >
                    Admin
                  </Link>
                  <Link
                    to="/admin/blog"
                    className={`text-sm font-medium transition-colors ${
                      isActive('/admin/blog')
                        ? 'text-gold-300'
                        : 'text-pigskin-100 hover:text-white'
                    }`}
                  >
                    Blog Admin
                  </Link>
                </>
              )}
            </nav>

            {/* User Menu & Mobile Menu Button */}
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-sm text-pigskin-100 hidden md:block">
                    {user.display_name}
                  </span>
                  <Link to="/profile" className="hidden sm:block">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-white text-white hover:bg-white hover:text-pigskin-500"
                    >
                      Profile
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="hidden sm:block border-white text-white hover:bg-white hover:text-pigskin-500"
                  >
                    {signingOut ? 'Signing Out...' : 'Sign Out'}
                  </Button>
                </>
              ) : (
                <Link to="/login" className="hidden sm:block">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="border-white text-white hover:bg-white hover:text-pigskin-500"
                  >
                    Log In
                  </Button>
                </Link>
              )}

              {/* Mobile menu button */}
              <button
                onClick={toggleMobileMenu}
                className="lg:hidden flex items-center justify-center w-8 h-8 text-white hover:text-gold-300 transition-colors"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile Navigation Menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden border-t border-pigskin-400 py-4">
              <nav className="flex flex-col space-y-4">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors ${
                    isActive('/') && location.pathname === '/'
                      ? 'text-gold-300'
                      : 'text-pigskin-100 hover:text-white'
                  }`}
                >
                  Home
                </Link>
                
                <Link
                  to="/picks"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors ${
                    isActive('/picks')
                      ? 'text-gold-300'
                      : 'text-pigskin-100 hover:text-white'
                  }`}
                >
                  Picks
                </Link>
                
                <Link
                  to="/leaderboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors ${
                    isActive('/leaderboard')
                      ? 'text-gold-300'
                      : 'text-pigskin-100 hover:text-white'
                  }`}
                >
                  Leaderboard
                </Link>

                <Link
                  to="/blog"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors ${
                    isActive('/blog')
                      ? 'text-gold-300'
                      : 'text-pigskin-100 hover:text-white'
                  }`}
                >
                  Blog
                </Link>

                {user?.is_admin && (
                  <>
                    <Link
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`text-sm font-medium transition-colors ${
                        isActive('/admin') && !isActive('/admin/blog')
                          ? 'text-gold-300'
                          : 'text-pigskin-100 hover:text-white'
                      }`}
                    >
                      Admin
                    </Link>
                    <Link
                      to="/admin/blog"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`text-sm font-medium transition-colors ${
                        isActive('/admin/blog')
                          ? 'text-gold-300'
                          : 'text-pigskin-100 hover:text-white'
                      }`}
                    >
                      Blog Admin
                    </Link>
                  </>
                )}

                {/* Mobile-only user actions */}
                <div className="pt-4 border-t border-pigskin-400">
                  {user ? (
                    <>
                      <div className="text-sm text-pigskin-100 mb-2">
                        {user.display_name}
                      </div>
                      <div className="space-y-2">
                        <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="w-full border-white text-white hover:bg-white hover:text-pigskin-500"
                          >
                            Profile
                          </Button>
                        </Link>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            handleSignOut()
                            setMobileMenuOpen(false)
                          }}
                          disabled={signingOut}
                          className="w-full border-white text-white hover:bg-white hover:text-pigskin-500"
                        >
                          {signingOut ? 'Signing Out...' : 'Sign Out'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-white text-white hover:bg-white hover:text-pigskin-500"
                      >
                        Log In
                      </Button>
                    </Link>
                  )}
                </div>
              </nav>
            </div>
          )}
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
                  <>
                    <li>
                      <Link to="/picks" className="text-charcoal-300 hover:text-white transition-colors">
                        Submit Picks
                      </Link>
                    </li>
                    <li>
                      <Link to="/profile" className="text-charcoal-300 hover:text-white transition-colors">
                        Profile
                      </Link>
                    </li>
                  </>
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