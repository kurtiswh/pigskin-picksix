import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePaymentsSyncedAt } from '@/hooks/usePaymentsSyncedAt'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Download } from 'lucide-react'
import type { EmergencyLeaderboardEntry, EmergencyWeeklyLeaderboardEntry } from '@/services/leaderboard.types'
import { getLatestWeekWithResults, getMaxConfiguredWeek } from '@/services/weekService'
import { LeaderboardService, LeaderboardEntry, EmergencyLeaderboardService, EmergencyWeeklyLeaderboardService } from '@/services/leaderboardService'
import { WeekSettingsService, WeekSettings } from '@/services/weekSettingsService'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentSeason } from '@/hooks/useCurrentSeason'
import { ExpandableLeaderboardRow, LeaderboardRowContent } from '@/components/ExpandableLeaderboardRow'
import { useExpandableRows } from '@/hooks/useExpandableRows'
import { SeasonExpandedDetails } from '@/components/SeasonExpandedDetails'
import { WeeklyExpandedDetails } from '@/components/WeeklyExpandedDetails'
import { BestFinishLeaderboard } from '@/components/BestFinishLeaderboard'
import WinnersDisplay from '@/components/WinnersDisplay'
import { ADMIN_EMAIL, ENTRY_FEE, LEAGUESAFE_JOIN_URL } from '@/lib/league'

export default function TabbedLeaderboard() {
  const paymentsSyncedAt = usePaymentsSyncedAt()
  const { user } = useAuth()
  const { activeSeason, loading: seasonLoading } = useCurrentSeason()
  const [season, setSeason] = useState(activeSeason)
  // Default the season selector to the active season once it loads from the DB,
  // but never override a season the user has manually picked.
  const seasonDefaulted = useRef(false)
  useEffect(() => {
    if (!seasonLoading && !seasonDefaulted.current) {
      setSeason(activeSeason)
      seasonDefaulted.current = true
    }
  }, [seasonLoading, activeSeason])
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [maxWeek, setMaxWeek] = useState<number>(0)
  // True when the season has no configured weeks yet (preseason). Note maxWeek
  // can't signal this: getLatestWeekWithResults falls back to 1 with no games.
  const [isPreseason, setIsPreseason] = useState(false)
  const [selectedSeasonWeek, setSelectedSeasonWeek] = useState<'current' | number>('current')
  const [activeTab, setActiveTab] = useState('season')
  const [seasonData, setSeasonData] = useState<(LeaderboardEntry | EmergencyLeaderboardEntry)[]>([])
  const [weeklyData, setWeeklyData] = useState<EmergencyWeeklyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [, setStrategy] = useState('')
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  
  // Expandable rows. Changing week, season or tab makes every open expansion
  // belong to a view that is no longer on screen, so resetKey drops them (and
  // invalidates anything still in flight) rather than carrying them over.
  const rows = useExpandableRows<any>({ resetKey: `${season}-${selectedWeek}-${activeTab}` })
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  
  // Scroll to top state
  const [showScrollTop, setShowScrollTop] = useState(false)
  
  
  // Check if current user is admin
  const isAdmin = user?.is_admin === true

  // Monotonic id per data load: a response only lands if it is still the
  // latest request, so a slow query for a previous season can never overwrite
  // a newer season's result (e.g. fallback-2025 data arriving after 2026's).
  const loadSeq = useRef(0)
  const weeklySeq = useRef(0)
  const initSeq = useRef(0)
  const settingsSeq = useRef(0)

  // Initialize selectedWeek to the latest week with results, and compute the
  // season's max configured week to bound the week-picker dropdowns.
  // Gated on seasonLoading: until app_settings resolves, `season` is only the
  // fallback value — querying it would race the real active season's load.
  useEffect(() => {
    if (seasonLoading) return
    const seq = ++initSeq.current
    const initializeWeek = async () => {
      const [latestWeek, configuredMax] = await Promise.all([
        getLatestWeekWithResults(season),
        getMaxConfiguredWeek(season),
      ])
      if (seq !== initSeq.current) return // superseded by a newer season
      setSelectedWeek(latestWeek)
      setMaxWeek(configuredMax || latestWeek || 0)
      setIsPreseason((configuredMax || 0) === 0)
    }
    initializeWeek()
  }, [season, seasonLoading])

  useEffect(() => {
    if (seasonLoading) return
    loadSeasonData()
    loadWeekSettings()
  }, [season, seasonLoading, selectedSeasonWeek])

  useEffect(() => {
    if (seasonLoading) return
    if (selectedWeek !== null) {
      loadWeekSettings()
    }
  }, [selectedWeek, season, seasonLoading])

  useEffect(() => {
    if (seasonLoading) return
    if (activeTab === 'weekly' && selectedWeek !== null) {
      loadWeeklyData()
    }
  }, [selectedWeek, season, seasonLoading, activeTab])

  // Scroll to top functionality
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      setShowScrollTop(scrollTop > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  // Jump to the logged-in user's own row
  const jumpToMyRow = () => {
    document.getElementById('my-leaderboard-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const loadWeekSettings = async () => {
    if (selectedWeek === null) return
    const seq = ++settingsSeq.current

    try {
      const settings = await WeekSettingsService.getWeekSettings(season, selectedWeek)
      if (seq !== settingsSeq.current) return
      setWeekSettings(settings)
    } catch (error) {
      if (seq !== settingsSeq.current) return
      console.error('Error loading week settings:', error)
      setWeekSettings(null)
    }
  }

  const loadSeasonData = async () => {
    const startTime = Date.now()
    const seq = ++loadSeq.current

    try {
      setLoading(true)
      setError('')
      setStrategy('')
      console.log('🔄 Loading season leaderboard for season', season, 'through week', selectedSeasonWeek)
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Overall timeout after 10 seconds')), 10000)
      })
      
      // Get the current week to calculate rank changes
      const currentWeek = selectedWeek || (await getLatestWeekWithResults(season))
      
      let entries
      
      // Check if we're loading historical data
      if (selectedSeasonWeek !== 'current' && typeof selectedSeasonWeek === 'number') {
        console.log('🚀 [TABBED] Loading historical season leaderboard through week', selectedSeasonWeek)
        try {
          const dataPromise = LeaderboardService.getSeasonLeaderboardAsOfWeek(season, selectedSeasonWeek)
          entries = await Promise.race([dataPromise, timeoutPromise])
          console.log('✅ [TABBED] Loaded historical season data:', entries.length, 'entries')
        } catch (error: any) {
          console.log('⚠️ [TABBED] Historical data failed:', error.message, '- falling back to current')
          // Fall back to current season data if historical fails
          setSelectedSeasonWeek('current')
        }
      }
      
      // Load current season data (or if historical failed)
      if (!entries) {
        console.log('🚀 [TABBED] Loading current season leaderboard with rank changes')
        // Strategy 1: Try rank change calculation first
        try {
          const dataPromise = LeaderboardService.getSeasonLeaderboardWithRankChanges(season, currentWeek)
          entries = await Promise.race([dataPromise, timeoutPromise])
          console.log('✅ [TABBED] Loaded season data WITH rank changes:', entries.length, 'entries')
        
        // Verify rank change data exists
        const entriesWithRankChanges = entries.filter(e => e.rank_change !== undefined).length
        console.log('📈 [TABBED] Rank changes found for', entriesWithRankChanges, 'entries')
        } catch (error: any) {
          console.log('⚠️ [TABBED] Rank change calculation failed:', error.message, '- falling back to emergency service')

          // Fallback: emergency service (multi-strategy read of the leaderboard)
          const dataPromise = EmergencyLeaderboardService.getSeasonLeaderboard(season)
          entries = await Promise.race([dataPromise, timeoutPromise])
          console.log('✅ [TABBED] Loaded season data from emergency service:', entries.length, 'entries')
        }
      }
      
      if (seq !== loadSeq.current) return // a newer load superseded this one

      const loadTime = Date.now() - startTime
      console.log('✅ Loaded season data:', entries.length, 'entries in', loadTime, 'ms')

      setSeasonData(entries)

      // Set strategy indicator based on data
      if (entries.length === 1 && entries[0].user_id === 'emergency-1') {
        setStrategy('Emergency static data - check console for errors')
      } else if (entries.length > 0) {
        setStrategy('Season data loaded successfully')
      }

    } catch (err: any) {
      if (seq !== loadSeq.current) return
      const loadTime = Date.now() - startTime
      console.error('❌ Failed to load season leaderboard after', loadTime, 'ms:', err)
      setError(err.message || 'Failed to load season leaderboard')
      setSeasonData([])
      setStrategy('Season loading failed')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  const loadWeeklyData = async () => {
    const startTime = Date.now()
    const seq = ++weeklySeq.current

    // Don't load if we don't have a week selected yet
    if (selectedWeek === null) return

    try {
      setLoading(true)
      setError('')
      setStrategy('')
      console.log('🔄 Loading weekly leaderboard for season', season, 'week', selectedWeek)
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Overall timeout after 10 seconds')), 10000)
      })
      
      const dataPromise = EmergencyWeeklyLeaderboardService.getWeeklyLeaderboard(season, selectedWeek)
      const entries = await Promise.race([dataPromise, timeoutPromise])
      
      if (seq !== weeklySeq.current) return // a newer load superseded this one

      const loadTime = Date.now() - startTime
      console.log('✅ Loaded weekly data:', entries.length, 'entries in', loadTime, 'ms')

      setWeeklyData(entries)
      
      // Set strategy indicator based on data
      if (entries.length === 1 && entries[0].user_id.includes('emergency')) {
        setStrategy('Emergency static data - check console for errors')
      } else if (entries.length === 1 && entries[0].user_id.includes('production-static')) {
        setStrategy('Production fallback data - weekly table may be empty')
      } else if (entries.length > 0) {
        setStrategy(`Week ${selectedWeek} data loaded successfully`)
      }
      
    } catch (err: any) {
      if (seq !== weeklySeq.current) return
      const loadTime = Date.now() - startTime
      console.error('❌ Failed to load weekly leaderboard after', loadTime, 'ms:', err)
      setError(err.message || 'Failed to load weekly leaderboard')
      setWeeklyData([])
      setStrategy(`Week ${selectedWeek} loading failed`)
    } finally {
      if (seq === weeklySeq.current) setLoading(false)
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    setError('')
    if (value === 'weekly' && weeklyData.length === 0) {
      loadWeeklyData()
    }
  }

  const getCurrentData = () => {
    switch (activeTab) {
      case 'season':
        return seasonData
      case 'weekly':
        return weeklyData
      default:
        return []
    }
  }

  const getCurrentTitle = () => {
    switch (activeTab) {
      case 'season':
        return `Season ${season} Standings`
      case 'weekly':
        return `Week ${selectedWeek} Results`
      default:
        return 'Leaderboard'
    }
  }

  // Get the display rank for tied players
  const getDisplayRank = (entry: any, data: any[]) => {
    const currentPoints = activeTab === 'season' ? 
      (entry.season_points || entry.total_points || 0) : 
      (entry.total_points || 0)
    
    // Find all players with the same points
    const tiedPlayers = data.filter(e => {
      const comparePoints = activeTab === 'season' ? 
        (e.season_points || e.total_points || 0) : 
        (e.total_points || 0)
      return comparePoints === currentPoints
    })
    
    // If tied, use the lowest rank among the tied players
    if (tiedPlayers.length > 1) {
      const ranks = tiedPlayers.map(p => activeTab === 'season' ? p.season_rank : p.weekly_rank)
      return Math.min(...ranks)
    }
    
    // Not tied, use original rank
    return activeTab === 'season' ? entry.season_rank : entry.weekly_rank
  }


  /**
   * Cache key for an expanded row. The season, and for a weekly row the week,
   * are part of it: keyed on the player alone, expanding Randy Moore in week 2
   * and then switching to week 1 re-served the week 2 payload under a week 1
   * row — the header said "Week 2 picks" beside a row reading week 1's score.
   */
  const expansionKey = (userId: string, tabType: 'season' | 'weekly') =>
    tabType === 'season'
      ? `${userId}-season-${season}`
      : `${userId}-weekly-${season}-${selectedWeek}`

  // Handle row expansion
  const handleRowToggle = (userId: string, tabType: 'season' | 'weekly') => {
    const rowKey = expansionKey(userId, tabType)
    // The week is captured per toggle, so a row opened under Week 3 can never
    // be filled by a request that resolves after the picker moved on.
    const week = selectedWeek
    rows.toggle(rowKey, () => {
      if (tabType === 'season') return LeaderboardService.getUserWeeklyBreakdown(userId, season)
      if (week === null) return Promise.resolve(null)
      return LeaderboardService.getUserWeeklyPicks(userId, season, week)
    })
  }

  // Helper function to format lock record display for weekly tab
  const formatLockRecordForWeekly = (entry: any): string => {
    try {
      if (!entry) {
        console.log('[formatLockRecordForWeekly] Entry is null/undefined')
        return '—'
      }

      // Check if entry has the lock_wins field
      if (!('lock_wins' in entry)) {
        console.log('[formatLockRecordForWeekly] No lock_wins field, returning lock_record:', entry.lock_record)
        return entry.lock_record || '—'
      }

      const lockWins = entry.lock_wins || 0
      const lockLosses = entry.lock_losses || 0
      const lockPushes = entry.lock_pushes || 0

      console.log(`[formatLockRecordForWeekly] User: ${entry.display_name}, Lock stats: ${lockWins}-${lockLosses}-${lockPushes}`)

      // For weekly, users should only have one lock pick
      // Determine which result they have (should only have one of these > 0)
      if (lockWins === 1 && lockLosses === 0 && lockPushes === 0) {
        console.log('[formatLockRecordForWeekly] Returning: Win')
        return 'Win'
      }
      if (lockLosses === 1 && lockWins === 0 && lockPushes === 0) {
        console.log('[formatLockRecordForWeekly] Returning: Loss')
        return 'Loss'
      }
      if (lockPushes === 1 && lockWins === 0 && lockLosses === 0) {
        console.log('[formatLockRecordForWeekly] Returning: Push')
        return 'Push'
      }

      // If no lock result yet (all zeros)
      if (lockWins === 0 && lockLosses === 0 && lockPushes === 0) {
        console.log('[formatLockRecordForWeekly] All zeros, returning: —')
        return '—'
      }

      // Fallback: if there are multiple results, show the numeric format
      console.log(`[formatLockRecordForWeekly] Multiple results, returning numeric: ${lockWins}-${lockLosses}-${lockPushes}`)
      return `${lockWins}-${lockLosses}-${lockPushes}`
    } catch (error) {
      console.error('Error formatting lock record:', error)
      return '—'
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pigskin-600">Leaderboard</h1>
        
        {/* Payment watermark — pre-answers "why am I not on here?"
            The wording is driven by what the board is actually showing rather
            than hardcoded, because the season_leaderboard view only carries
            unpaid players while the grace period is open (migration 155:
            paid OR max configured week <= grace_period_weeks). Saying "unpaid
            entries aren't shown" while the grace period still shows them would
            be flatly wrong, and pointing players at the admin over a row that
            is sitting right there wastes their time and yours. */}
        {(() => {
          const rows = activeTab === 'weekly' ? weeklyData : seasonData
          const unpaidOnBoard = rows.some(e => 'payment_status' in e && e.payment_status && e.payment_status !== 'Paid')
          return (
            <div className="mt-4 px-4 py-2.5 border rounded-lg bg-[#faf8f4] border-[#e7e2da] text-sm text-charcoal-700">
              {unpaidOnBoard ? (
                <>
                  💳 Unpaid entries still appear during the grace period and come off the board when it ends.
                  If LeagueSafe shows you paid, you're good and will get full credit.
                </>
              ) : (
                <>
                  💳 Unpaid entries are not on the leaderboard. If you paid and don't see yourself,
                  email <a href={`mailto:${ADMIN_EMAIL}`} className="underline font-semibold text-[#4B3621]">{ADMIN_EMAIL}</a>.
                </>
              )}
              {paymentsSyncedAt && (
                <span className="text-charcoal-500">
                  {' '}Register last imported <b className="tabular-nums whitespace-nowrap font-semibold">{paymentsSyncedAt}</b>.
                </span>
              )}
            </div>
          )
        })()}

        {/* Dynamic Notice Banner */}
        {(() => {
          // Nothing to say until we know which season state we're in. Without
          // this, switching to Weekly Results flips `loading` true, the
          // preseason branch below stops matching, and the generic "important
          // notice" flashes for a beat before the preseason banner returns.
          if (loading && !isPreseason) return null

          // Preseason (no weeks configured yet): a friendly heads-up instead of
          // the generic "email us if something's wrong" notice.
          if (isPreseason) {
            return (
              <div className="mt-4 mb-5 px-4 py-2.5 border rounded-lg bg-[#C9A04E]/10 border-[#C9A04E]">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-[#4B3621]">🏈 PRESEASON</span>
                  <span className="text-sm text-charcoal-700">
                    The {season} season hasn't kicked off yet. Standings appear once Week 1 games are scored — until then, check out{' '}
                    <Link to="/history" className="underline font-semibold text-[#4B3621]">past seasons in History</Link>.
                  </span>
                </div>
              </div>
            )
          }

          const noticeData = WeekSettingsService.getNoticeMessage(
            weekSettings,
            false
          )
          
          const bgColor = noticeData.type === 'final' ? 'bg-green-50 border-green-400' : 
                         noticeData.type === 'experimental' ? 'bg-orange-50 border-orange-400' : 
                         'bg-yellow-50 border-yellow-400'
          
          const iconColor = noticeData.type === 'final' ? 'text-green-600' : 
                           noticeData.type === 'experimental' ? 'text-orange-600' : 
                           'text-yellow-600'
          
          const textColor = noticeData.type === 'final' ? 'text-green-800' : 
                           noticeData.type === 'experimental' ? 'text-orange-800' : 
                           'text-yellow-800'
          
          const messageColor = noticeData.type === 'final' ? 'text-green-700' : 
                               noticeData.type === 'experimental' ? 'text-orange-700' : 
                               'text-yellow-700'
          
          
          const title = noticeData.type === 'final' ? '✅ RESULTS CONFIRMED' : 
                       noticeData.type === 'experimental' ? '🔄 LIVE SCORING' : 
                       '⚠️ IMPORTANT NOTICE'
          
          return (
            <div className={`mt-4 mb-5 px-4 py-2.5 border rounded-lg ${bgColor}`}>
              {/* Stacks on phones: side by side, the title wrapped onto two
                  lines and squeezed the message into a narrow column. */}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
                <span className={`text-sm font-bold whitespace-nowrap shrink-0 ${textColor}`}>{title}</span>
                <span className={`text-sm ${messageColor}`}>{noticeData.message}</span>
              </div>
            </div>
          )
        })()}
        
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Main leaderboard is locked to the current season; past seasons live on the History page. */}
          <div className="px-3 py-1.5 rounded-md bg-[#4B3621] text-white text-sm font-semibold">
            {season} Season
          </div>
          
          <Input
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs focus-visible:ring-[#C9A04E]/40"
          />

          {(() => {
            if (!user) return null
            const data = getCurrentData()
            const me = data.find((e: any) => e.user_id === user.id)
            if (!me) return null
            const myRank = getDisplayRank(me, data)
            return (
              <Button
                variant="outline"
                size="sm"
                onClick={jumpToMyRow}
                className="border-[#C9A04E] text-[#4B3621] hover:bg-[#C9A04E]/10 whitespace-nowrap"
              >
                Jump to my spot · #{myRank}
              </Button>
            )
          })()}
        </div>
      </div>


      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="inline-flex flex-wrap h-auto p-1 bg-[#F8F7F3] border border-[#e7e2da] rounded-lg">
          {[
            { v: 'season', label: 'Season Standings' },
            { v: 'weekly', label: 'Weekly Results' },
            { v: 'bestfinish', label: 'Best Finish' },
            { v: 'winners', label: 'Winners' },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="py-1.5 text-sm font-semibold text-charcoal-600 rounded-md data-[state=active]:bg-[#4B3621] data-[state=active]:text-white"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        
        <TabsContent value="season" className="mt-6">
          <div className="mb-4">
            <Select 
              value={selectedSeasonWeek === 'current' ? 'current' : selectedSeasonWeek.toString()} 
              onValueChange={(value) => {
                if (value === 'current') {
                  setSelectedSeasonWeek('current')
                } else {
                  setSelectedSeasonWeek(parseInt(value))
                }
              }}
            >
              <SelectTrigger className="w-48 focus:ring-[#C9A04E]/40">
                <SelectValue placeholder="Current Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Season</SelectItem>
                {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => (
                  <SelectItem key={week} value={week.toString()}>
                    Through Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Season {season} Standings
                  {selectedSeasonWeek !== 'current' && ` - Through Week ${selectedSeasonWeek}`}
                </CardTitle>
                {isAdmin && (
                  <Button
                    onClick={exportSeasonToCSV}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={seasonData.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {renderLeaderboardContent(seasonData, 'season')}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="weekly" className="mt-6">
          <div className="mb-4">
            <Select 
              value={selectedWeek?.toString() || ''} 
              onValueChange={(value) => setSelectedWeek(parseInt(value))}
            >
              <SelectTrigger className="w-48 focus:ring-[#C9A04E]/40">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => (
                  <SelectItem key={week} value={week.toString()}>
                    Week {week}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Week {selectedWeek} Results</CardTitle>
                {isAdmin && (
                  <Button
                    onClick={exportWeeklyToCSV}
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={weeklyData.length === 0 || !selectedWeek}
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {renderLeaderboardContent(weeklyData, 'weekly')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bestfinish" className="mt-6">
          <BestFinishLeaderboard season={season} searchTerm={searchTerm} />
        </TabsContent>

        <TabsContent value="winners" className="mt-6">
          <WinnersDisplay season={season} />
        </TabsContent>
      </Tabs>

      {/* Floating Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 bg-pigskin-600 hover:bg-pigskin-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 ease-in-out hover:scale-110 z-50"
          aria-label="Scroll to top"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      )}
    </div>
  )

  // CSV Export Functions
  function exportSeasonToCSV() {
    if (seasonData.length === 0) return

    const headers = ['Rank', 'User ID', 'Player', 'Points', 'Wins', 'Losses', 'Pushes', 'Lock Wins', 'Lock Losses', 'Lock Pushes']
    const csvRows = [headers.join(',')]

    seasonData.forEach((entry, index) => {
      const rank = index + 1
      const userId = entry.user_id
      const name = `"${entry.display_name}"`
      const points = ('season_points' in entry ? entry.season_points : entry.total_points) || 0
      const wins = ('total_wins' in entry ? entry.total_wins : 0) || 0
      const losses = ('total_losses' in entry ? entry.total_losses : 0) || 0
      const pushes = ('total_pushes' in entry ? entry.total_pushes : 0) || 0
      const lockWins = ('lock_wins' in entry ? entry.lock_wins : 0) || 0
      const lockLosses = ('lock_losses' in entry ? entry.lock_losses : 0) || 0
      const lockPushes = ('lock_pushes' in entry ? entry.lock_pushes : 0) || 0

      csvRows.push([rank, userId, name, points, wins, losses, pushes, lockWins, lockLosses, lockPushes].join(','))
    })

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    const weekLabel = selectedSeasonWeek === 'current'
      ? 'current'
      : `through-week-${selectedSeasonWeek}`

    link.setAttribute('href', url)
    link.setAttribute('download', `season-${season}-leaderboard-${weekLabel}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function exportWeeklyToCSV() {
    if (weeklyData.length === 0 || !selectedWeek) return

    const headers = ['Rank', 'User ID', 'Player', 'Points', 'Wins', 'Losses', 'Pushes', 'Lock Wins', 'Lock Losses', 'Lock Pushes']
    const csvRows = [headers.join(',')]

    weeklyData.forEach((entry, index) => {
      const rank = index + 1
      const userId = entry.user_id
      const name = `"${entry.display_name}"`
      const points = entry.total_points || 0
      const wins = entry.wins || 0
      const losses = entry.losses || 0
      const pushes = entry.pushes || 0
      const lockWins = entry.lock_wins || 0
      const lockLosses = entry.lock_losses || 0
      const lockPushes = entry.lock_pushes || 0

      csvRows.push([rank, userId, name, points, wins, losses, pushes, lockWins, lockLosses, lockPushes].join(','))
    })

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)

    link.setAttribute('href', url)
    link.setAttribute('download', `week-${selectedWeek}-leaderboard.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function renderLeaderboardContent(data: any[], _tabType: 'season' | 'weekly') {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-charcoal-600">Loading...</div>
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="text-red-600 p-4 bg-red-50 rounded">
          Error: {error}
        </div>
      )
    }

    // Preseason: no weeks configured for this season yet. Placeholder rows from
    // the emergency fallback ("Temporarily Unavailable") count as no data here.
    const realData = isPreseason
      ? data.filter((e) => !`${e.user_id}`.includes('emergency') && !`${e.user_id}`.includes('production-static'))
      : data

    if (realData.length === 0) {
      if (isPreseason) {
        return (
          <div className="py-10 text-center max-w-xl mx-auto">
            <div className="text-4xl mb-3">🏈</div>
            <h3 className="text-lg font-bold text-pigskin-900 mb-2">
              The {season} season hasn't kicked off yet
            </h3>
            <p className="text-sm text-charcoal-600 mb-4">
              Standings will show up here as soon as Week 1 games go final.
            </p>
            <div className="text-left text-sm text-charcoal-700 bg-[#F8F7F3] border border-[#e7e2da] rounded-lg p-4 mb-5">
              <div className="font-semibold text-pigskin-900 mb-1">How scoring works</div>
              <ul className="list-disc list-inside space-y-1">
                <li>Pick <b>6 games</b> against the spread each week — one is your <b>🔒 Lock</b>.</li>
                <li><b>20 points</b> per win, <b>10</b> per push, 0 per loss.</li>
                <li>Cover bonus: <b>+1</b> (11–19.5), <b>+3</b> (20–28.5), <b>+5</b> (29+). Your Lock <b>doubles the bonus</b>.</li>
              </ul>
            </div>
            {/* Two things a visitor wants in the offseason: get set for the
                coming year, or go look at the past. Grouped so the payment
                link doesn't read as just another nav button. */}
            <div className="grid sm:grid-cols-2 gap-4 text-left">
              <div className="rounded-lg border border-[#f0dcb0] bg-[#fff8ea] p-4">
                <div className="font-bold text-[#4B3621] mb-1">Ready for {season}?</div>
                <p className="text-xs text-charcoal-600 mb-3">
                  Get your entry in and know the rules before kickoff.
                </p>
                <div className="space-y-2">
                  <a href={LEAGUESAFE_JOIN_URL} target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full h-auto py-2.5 leading-snug whitespace-normal bg-[#C9A04E] hover:bg-[#b78e3f] text-[#4B3621]">
                      Pay your ${ENTRY_FEE} entry →
                    </Button>
                  </a>
                  <Link to="/rules" className="block">
                    <Button variant="outline" className="w-full h-auto py-2.5 leading-snug whitespace-normal border-[#C9A04E] text-[#4B3621] hover:bg-[#C9A04E]/10">
                      Read the rules →
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="rounded-lg border border-[#e7e2da] bg-[#F8F7F3] p-4">
                <div className="font-bold text-[#4B3621] mb-1">Curious about the past?</div>
                <p className="text-xs text-charcoal-600 mb-3">
                  Twenty years of champions, standings, and your own record.
                </p>
                <div className="space-y-2">
                  <Link to="/history" className="block">
                    <Button variant="outline" className="w-full h-auto py-2.5 leading-snug whitespace-normal border-[#C9A04E] text-[#4B3621] hover:bg-[#C9A04E]/10">
                      Past champions &amp; standings →
                    </Button>
                  </Link>
                  {user && (
                    <Link to="/profile?tab=stats" className="block">
                      <Button variant="outline" className="w-full h-auto py-2.5 leading-snug whitespace-normal border-[#C9A04E] text-[#4B3621] hover:bg-[#C9A04E]/10">
                        Your career stats →
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }
      return (
        <p className="text-gray-500">No data found for {getCurrentTitle().toLowerCase()}</p>
      )
    }

    return (
      <div className="overflow-x-auto">
        {/* Header row - Hidden on mobile (grid aligns with LeaderboardRowContent) */}
        <div className="hidden md:block bg-[#faf8f4] border-y border-[#ece7de]">
          <div className="flex items-center px-4 py-2">
            <div className="grid grid-cols-[112px_minmax(0,1fr)_104px_64px_72px] items-center gap-3 flex-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              <div className="flex items-center gap-1">
                Rank
              </div>
              <div>Player</div>
              <div>Record</div>
              <div>Lock</div>
              <div className="text-right">Points</div>
            </div>
            {/* spacer aligning with the row's expand chevron */}
            <div className="ml-4 w-7 shrink-0"></div>
          </div>
        </div>

        {/* Expandable rows */}
        <div className="border-x border-b border-[#ece7de] rounded-b-lg overflow-hidden">
          {data
            .filter((entry) => 
              searchTerm === '' || 
              entry.display_name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((entry) => {
            const tabType = activeTab === 'season' ? 'season' : 'weekly'
            const rowKey = expansionKey(entry.user_id, tabType)
            const isExpanded = rows.isExpanded(rowKey)
            const rowState = rows.getState(rowKey)
            const expansionStatus = rowState?.status ?? 'loading'
            const expansionData = rowState?.data
            const currentRank = entry.season_rank || entry.weekly_rank
            
            // Check if this rank is tied - compare by points, not just rank
            // This handles cases where database has consecutive ranks but same points
            const currentPoints = activeTab === 'season' ? 
              (entry.season_points || entry.total_points || 0) : 
              (entry.total_points || 0)
            
            const isTied = data.filter(e => {
              const comparePoints = activeTab === 'season' ? 
                (e.season_points || e.total_points || 0) : 
                (e.total_points || 0)
              return comparePoints === currentPoints
            }).length > 1
            
            
            // Distinct top-3 background tints (gold / silver / bronze)
            const displayRank = getDisplayRank(entry, data)
            const rankTint =
              displayRank === 1 ? 'bg-[#C9A04E]/[0.16]' :   // gold
              displayRank === 2 ? 'bg-[#9aa4b2]/[0.18]' :   // silver
              displayRank === 3 ? 'bg-[#c2703d]/[0.13]' : ''// bronze
            const tiedTint = isTied && currentRank > 3 ? 'border-l-2 border-l-[#2f6fd0]/50' : ''
            const isMe = !!user && entry.user_id === user.id
            // The logged-in user's own row: gold ring + tint overrides the rank tint
            const meHighlight = isMe ? 'ring-2 ring-inset ring-[#C9A04E] bg-[#fbf4e3]' : rankTint

            return (
              <ExpandableLeaderboardRow
                key={entry.user_id}
                id={isMe ? 'my-leaderboard-row' : undefined}
                isExpanded={isExpanded}
                onToggle={() => handleRowToggle(entry.user_id, tabType)}
                status={expansionStatus}
                error={rowState?.error}
                onRetry={() => rows.retry(rowKey)}
                loadingLabel={tabType === 'season' ? 'Loading weekly breakdown…' : 'Loading pick details…'}
                emptyMessage={tabType === 'season'
                  ? 'No weekly data available for this season'
                  : `No picks found for Week ${selectedWeek ?? ''}`.trim()}
                className={`${meHighlight} ${tiedTint}`.trim()}
                expandedContent={
                  expansionData ? (
                    tabType === 'season' ? (
                      <SeasonExpandedDetails 
                        data={expansionData} 
                        asOfWeek={selectedSeasonWeek !== 'current' ? selectedSeasonWeek : undefined}
                        currentWeek={selectedWeek || undefined}
                      />
                    ) : (
                      <WeeklyExpandedDetails data={expansionData} />
                    )
                  ) : null
                }
              >
                <LeaderboardRowContent
                  rank={getDisplayRank(entry, data)}
                  displayName={entry.display_name}
                  record={entry.season_record || entry.weekly_record}
                  lockRecord={tabType === 'weekly' ? formatLockRecordForWeekly(entry) : entry.lock_record}
                  points={('season_points' in entry ? entry.season_points : entry.total_points) || 0}
                  paymentStatus={entry.payment_status}
                  pickSource={entry.pick_source}
                  isExpanded={isExpanded}
                  isLoading={expansionStatus === 'loading' && isExpanded}
                  canExpand={true}
                  onToggle={() => {}}
                  isAdmin={isAdmin}
                  isTied={isTied}
                  rankChange={activeTab === 'season' ? ('rank_change' in entry ? entry.rank_change : undefined) : undefined}
                  previousRank={activeTab === 'season' ? ('previous_rank' in entry ? entry.previous_rank : undefined) : undefined}
                  trend={activeTab === 'season' ? ('trend' in entry ? entry.trend : undefined) : undefined}
                  isCurrentUser={isMe}
                />
              </ExpandableLeaderboardRow>
            )
          })}
        </div>
        
        {/* Tie Legend - Only show if there are actual ties */}
        {data.some((entry, _, arr) => {
          const currentPoints = activeTab === 'season' ? 
            (entry.season_points || entry.total_points || 0) : 
            (entry.total_points || 0)
          return arr.filter(e => {
            const comparePoints = activeTab === 'season' ? 
              (e.season_points || e.total_points || 0) : 
              (e.total_points || 0)
            return comparePoints === currentPoints
          }).length > 1
        }) && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <span className="font-bold text-blue-600 text-xs uppercase">T</span>
              <span>= Tied rank (same points as other players)</span>
              <span className="ml-auto text-xs text-blue-600">
                Next rank skips tied positions (e.g., 1, 1, 3, 4...)
              </span>
            </div>
          </div>
        )}
      </div>
    )
  }
}