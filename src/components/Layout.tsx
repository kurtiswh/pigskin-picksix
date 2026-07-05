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

  // Logical order: the weekly loop (Picks → Games → Leaderboard) grouped together,
  // then content (Blog), then archival (History), then Admin.
  const navItems = [
    { to: '/', label: 'Home', exact: true },
    { to: user ? '/picks' : '/anonymous-picks', label: 'Picks' },
    { to: '/games', label: 'Games' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/blog', label: 'Blog' },
    { to: '/history', label: 'History' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  const navActive = (item: { to: string; exact?: boolean }) =>
    item.exact ? location.pathname === '/' : isActive(item.to)

  const navLinkClass = (active: boolean) =>
    `text-sm font-medium transition-colors ${active ? 'text-gold-300' : 'text-pigskin-100 hover:text-white'}`

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
    <div className="min-h-screen bg-[#F8F7F3] flex flex-col">
      {/* Header */}
      <header className="bg-pigskin-500 text-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo wordmark */}
            <Link to="/" className="flex items-center">
              <span className="font-extrabold tracking-wide text-base sm:text-xl text-white">
                PIGSKIN PICK <span className="text-gold-500">SIX</span>
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-6">
              {navItems.map((item) => (
                <Link key={item.label} to={item.to} className={navLinkClass(navActive(item))}>
                  {item.label}
                </Link>
              ))}
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
                <div className="hidden sm:flex items-center space-x-2">
                  <Link to="/register">
                    <Button 
                      size="sm"
                      className="bg-gold-500 hover:bg-gold-600 text-pigskin-900"
                    >
                      Join Now
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-white text-white hover:bg-white hover:text-pigskin-500"
                    >
                      Log In
                    </Button>
                  </Link>
                </div>
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
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={navLinkClass(navActive(item))}
                  >
                    {item.label}
                  </Link>
                ))}

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
                    <div className="space-y-2">
                      <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                        <Button 
                          size="sm"
                          className="w-full bg-gold-500 hover:bg-gold-600 text-pigskin-900"
                        >
                          Join Now
                        </Button>
                      </Link>
                      <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="w-full border-white text-white hover:bg-white hover:text-pigskin-500"
                        >
                          Log In
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">{children}</main>

      {/* Footer */}
      <footer className="bg-charcoal-900 text-charcoal-100 py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <div>
              <div className="mb-4">
                <span className="font-extrabold tracking-wide text-lg text-white">
                  PIGSKIN PICK <span className="text-gold-500">SIX</span>
                </span>
              </div>
              <p className="text-charcoal-300 text-sm">
                Where meaningless games become meaningful
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Compete</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to={user ? '/picks' : '/anonymous-picks'} className="text-charcoal-300 hover:text-white transition-colors">
                    Picks
                  </Link>
                </li>
                <li>
                  <Link to="/games" className="text-charcoal-300 hover:text-white transition-colors">
                    Games
                  </Link>
                </li>
                <li>
                  <Link to="/leaderboard" className="text-charcoal-300 hover:text-white transition-colors">
                    Leaderboard
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Explore</h3>
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
                  <Link to="/history" className="text-charcoal-300 hover:text-white transition-colors">
                    History
                  </Link>
                </li>
                {user && (
                  <li>
                    <Link to="/profile" className="text-charcoal-300 hover:text-white transition-colors">
                      Profile
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </div>

          <div className="border-t border-charcoal-700 mt-8 pt-6 text-center">
            <p className="text-charcoal-400 text-sm">
              © {new Date().getFullYear()} Pigskin Pick Six. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}