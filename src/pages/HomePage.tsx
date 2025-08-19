import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { getCurrentWeek } from '@/services/collegeFootballApi'
import { LeaderboardEntry, Pick } from '@/types'
import Layout from '@/components/Layout'

export default function HomePage() {
  const { user } = useAuth()
  
  console.log('🏠 HomePage - User state:', user)
  const currentSeason = new Date().getFullYear()
  const [currentWeek, setCurrentWeek] = useState(getCurrentWeek(currentSeason))
  const [deadline, setDeadline] = useState<Date | null>(null)
  const [topPlayers, setTopPlayers] = useState<LeaderboardEntry[]>([])
  const [userPicks, setUserPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHomePageData()
  }, [])

  useEffect(() => {
    if (user) {
      fetchUserPicks()
    }
  }, [user, currentWeek])

  const fetchHomePageData = async () => {
    console.log('🏠 Using mock data for homepage - skipping database calls')
    
    try {
      // Use mock week settings
      setCurrentWeek(1)
      setDeadline(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 1 week from now
      
      // Use mock leaderboard data
      const mockLeaderboard: LeaderboardEntry[] = [
        {
          user_id: user?.id || '1',
          display_name: user?.display_name || 'You',
          season_record: '0-0-0',
          lock_record: '0-0', 
          season_points: 0,
          season_rank: 1,
          total_picks: 0,
          total_wins: 0,
          total_losses: 0,
          total_pushes: 0,
          lock_wins: 0,
          lock_losses: 0
        },
        {
          user_id: '2',
          display_name: 'Sample Player 1',
          season_record: '0-0-0',
          lock_record: '0-0',
          season_points: 0,
          season_rank: 2,
          total_picks: 0,
          total_wins: 0,
          total_losses: 0,
          total_pushes: 0,
          lock_wins: 0,
          lock_losses: 0
        },
        {
          user_id: '3',
          display_name: 'Sample Player 2',
          season_record: '0-0-0',
          lock_record: '0-0',
          season_points: 0,
          season_rank: 3,
          total_picks: 0,
          total_wins: 0,
          total_losses: 0,
          total_pushes: 0,
          lock_wins: 0,
          lock_losses: 0
        }
      ]
      
      setTopPlayers(mockLeaderboard)
      console.log('✅ Mock homepage data loaded immediately')
      
    } catch (error) {
      console.error('Error with mock homepage data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchUserPicks = async () => {
    if (!user) return
    
    try {
      const { data: picksData } = await supabase
        .from('picks')
        .select('*')
        .eq('user_id', user.id)
        .eq('week', currentWeek)
        .eq('season', new Date().getFullYear())

      if (picksData) {
        setUserPicks(picksData)
      }
    } catch (error) {
      console.error('Error fetching user picks:', error)
    }
  }

  const getTimeUntilDeadline = () => {
    if (!deadline) return null
    
    const now = new Date()
    const diff = deadline.getTime() - now.getTime()
    
    if (diff <= 0) return 'Picks are closed'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <Layout>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-pigskin-600 to-pigskin-800 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Where meaningless games become meaningful
          </h1>
          <p className="text-xl md:text-2xl text-pigskin-100 mb-8">
            Join the ultimate college football pick 'em experience
          </p>
          {user ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/picks">
                <Button size="lg" className="bg-gold-500 hover:bg-gold-600 text-pigskin-900">
                  Make Your Picks
                </Button>
              </Link>
              <Link to="/leaderboard">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-pigskin-500">
                  View Leaderboard
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/anonymous-picks">
                <Button size="lg" className="bg-gold-500 hover:bg-gold-600 text-pigskin-900">
                  Submit Picks
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-pigskin-500">
                  Log In
                </Button>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Current Week Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Week {currentWeek} Status</span>
                <div className="text-2xl">🏈</div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse">
                  <div className="h-4 bg-stone-200 rounded mb-2"></div>
                  <div className="h-4 bg-stone-200 rounded mb-2"></div>
                  <div className="h-4 bg-stone-200 rounded mb-2"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-charcoal-600">Pick Deadline:</span>
                    <span className="font-semibold">
                      {deadline ? deadline.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      }) : 'TBD'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-charcoal-600">Time Remaining:</span>
                    <span className={`font-semibold ${getTimeUntilDeadline()?.includes('closed') ? 'text-red-600' : 'text-green-600'}`}>
                      {getTimeUntilDeadline() || 'TBD'}
                    </span>
                  </div>
                  {user && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-charcoal-600">Your Picks:</span>
                        <span className="font-semibold">
                          {userPicks.length}/6 made
                          {userPicks.some(p => p.is_lock) && ' (🔒)'}
                        </span>
                      </div>
                      {userPicks.some(p => p.submitted) && (
                        <div className="flex justify-between items-center">
                          <span className="text-charcoal-600">Status:</span>
                          <span className="font-semibold text-green-600">✅ Submitted</span>
                        </div>
                      )}
                      <Link to="/picks" className="block">
                        <Button className="w-full mt-4" variant={userPicks.some(p => p.submitted) ? "secondary" : "default"}>
                          {getTimeUntilDeadline()?.includes('closed') 
                            ? 'View Your Picks' 
                            : userPicks.some(p => p.submitted)
                            ? 'Edit Submitted Picks'
                            : 'Make Your Picks'
                          }
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Season Leaderboard Snapshot */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Season Leaders</span>
                <div className="text-2xl">🏆</div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <div className="h-4 bg-stone-200 rounded w-1/2"></div>
                      <div className="h-4 bg-stone-200 rounded w-1/4"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {topPlayers.map((player, index) => (
                    <div key={player.user_id} className="flex justify-between items-center">
                      <div className="flex items-center space-x-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-gold-500 text-pigskin-900' : 
                          index === 1 ? 'bg-stone-400 text-white' :
                          index === 2 ? 'bg-amber-600 text-white' : 'bg-stone-200 text-charcoal-700'
                        }`}>
                          {index + 1}
                        </span>
                        <span className="font-medium">{player.display_name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{player.total_points || 0} pts</div>
                        <div className="text-sm text-charcoal-500">
                          {player.total_wins || 0}-{player.total_losses || 0}-{player.total_pushes || 0}
                        </div>
                      </div>
                    </div>
                  ))}
                  {topPlayers.length === 0 && (
                    <p className="text-center text-charcoal-500 py-4">
                      No picks submitted yet this season
                    </p>
                  )}
                  <Link to="/leaderboard" className="block">
                    <Button variant="outline" className="w-full mt-4">
                      View Full Leaderboard
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Features Section */}
        <section className="mt-16">
          <h3 className="text-3xl font-bold text-center mb-12 text-pigskin-900">
            Built for the Ultimate Pick 'Em Experience
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-center">
                  <div className="text-4xl mb-2">🎯</div>
                  Smart Scoring
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-charcoal-600">
                  20 points for wins, 10 for pushes, double bonus points on your Lock pick.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-center">
                  <div className="text-4xl mb-2">⚡</div>
                  Live Updates
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-charcoal-600">
                  Real-time scoring as games finish. Watch the leaderboard 
                  change throughout the weekend.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-center">
                  <div className="text-4xl mb-2">🏆</div>
                  Best Finish
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-charcoal-600">
                  Best Finish Championship (weeks 11-14) means
                  gives everyone has a shot at glory and the season is never over.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Yard Line Divider */}
        <div className="yard-line my-16"></div>

        {/* How It Works */}
        <section>
          <h3 className="text-3xl font-bold text-center mb-12 text-pigskin-900">
            How It Works
          </h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-pigskin-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h4 className="font-semibold mb-2">Pick 6 Games</h4>
              <p className="text-charcoal-600 text-sm">
                Choose any 6 games from the weekly slate against the spread
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pigskin-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h4 className="font-semibold mb-2">Lock One Pick</h4>
              <p className="text-charcoal-600 text-sm">
                Lock your most confident pick for double points
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pigskin-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h4 className="font-semibold mb-2">Track Live Scores</h4>
              <p className="text-charcoal-600 text-sm">
                Watch your picks play out with real-time updates
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-pigskin-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                4
              </div>
              <h4 className="font-semibold mb-2">Win Glory</h4>
              <p className="text-charcoal-600 text-sm">
                Compete for weekly and season-long championships
              </p>
            </div>
          </div>
        </section>
      </main>

    </Layout>
  )
}