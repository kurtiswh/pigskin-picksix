import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { SeasonExpandedDetails } from '@/components/SeasonExpandedDetails'
import { WeeklyExpandedDetails } from '@/components/WeeklyExpandedDetails'
import { BestFinishLeaderboard } from '@/components/BestFinishLeaderboard'
import WinnersDisplay from '@/components/WinnersDisplay'

export default function TabbedLeaderboard() {
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
  const [selectedSeasonWeek, setSelectedSeasonWeek] = useState<'current' | number>('current')
  const [activeTab, setActiveTab] = useState('season')
  const [seasonData, setSeasonData] = useState<(LeaderboardEntry | EmergencyLeaderboardEntry)[]>([])
  const [weeklyData, setWeeklyData] = useState<EmergencyWeeklyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState('')
  const [weekSettings, setWeekSettings] = useState<WeekSettings | null>(null)
  
  // State for expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [expandedData, setExpandedData] = useState<Map<string, any>>(new Map())
  const [loadingExpansions, setLoadingExpansions] = useState<Set<string>>(new Set())
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  
  // Scroll to top state
  const [showScrollTop, setShowScrollTop] = useState(false)
  
  
  // Check if current user is admin
  const isAdmin = user?.is_admin === true

  // Initialize selectedWeek to the latest week with results, and compute the
  // season's max configured week to bound the week-picker dropdowns.
  useEffect(() => {
    const initializeWeek = async () => {
      const [latestWeek, configuredMax] = await Promise.all([
        getLatestWeekWithResults(season),
        getMaxConfiguredWeek(season),
      ])
      setSelectedWeek(latestWeek)
      setMaxWeek(configuredMax || latestWeek || 0)
    }
    initializeWeek()
  }, [season])

  useEffect(() => {
    loadSeasonData()
    loadWeekSettings()
  }, [season, selectedSeasonWeek])

  useEffect(() => {
    if (selectedWeek !== null) {
      loadWeekSettings()
    }
  }, [selectedWeek, season])

  useEffect(() => {
    if (activeTab === 'weekly' && selectedWeek !== null) {
      loadWeeklyData()
    }
  }, [selectedWeek, season, activeTab])

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

  // Auto-scroll to the user's row once, the first time their data is on screen
  const hasAutoScrolled = useRef(false)
  useEffect(() => {
    if (hasAutoScrolled.current || !user) return
    const data = activeTab === 'season' ? seasonData : activeTab === 'weekly' ? weeklyData : []
    if (!data.some((e: any) => e.user_id === user.id)) return
    hasAutoScrolled.current = true
    const t = setTimeout(() => {
      document.getElementById('my-leaderboard-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 450)
    return () => clearTimeout(t)
  }, [user, seasonData, weeklyData, activeTab])

  const loadWeekSettings = async () => {
    if (selectedWeek === null) return
    
    try {
      const settings = await WeekSettingsService.getWeekSettings(season, selectedWeek)
      setWeekSettings(settings)
    } catch (error) {
      console.error('Error loading week settings:', error)
      setWeekSettings(null)
    }
  }

  const loadSeasonData = async () => {
    const startTime = Date.now()
    
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
        } catch (error) {
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
      const loadTime = Date.now() - startTime
      console.error('❌ Failed to load season leaderboard after', loadTime, 'ms:', err)
      setError(err.message || 'Failed to load season leaderboard')
      setSeasonData([])
      setStrategy('Season loading failed')
    } finally {
      setLoading(false)
    }
  }

  const loadWeeklyData = async () => {
    const startTime = Date.now()
    
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
      const loadTime = Date.now() - startTime
      console.error('❌ Failed to load weekly leaderboard after', loadTime, 'ms:', err)
      setError(err.message || 'Failed to load weekly leaderboard')
      setWeeklyData([])
      setStrategy(`Week ${selectedWeek} loading failed`)
    } finally {
      setLoading(false)
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


  // Handle row expansion
  const handleRowToggle = async (userId: string, tabType: 'season' | 'weekly') => {
    const rowKey = `${userId}-${tabType}`
    const isExpanded = expandedRows.has(rowKey)
    
    if (isExpanded) {
      // Collapse row
      const newExpanded = new Set(expandedRows)
      newExpanded.delete(rowKey)
      setExpandedRows(newExpanded)
      return
    }
    
    // Expand row - load data if not already loaded
    const newExpanded = new Set(expandedRows)
    newExpanded.add(rowKey)
    setExpandedRows(newExpanded)
    
    if (!expandedData.has(rowKey)) {
      const newLoading = new Set(loadingExpansions)
      newLoading.add(rowKey)
      setLoadingExpansions(newLoading)
      
      try {
        let data
        console.log(`🔍 Loading expanded data for ${rowKey}, tabType: ${tabType}`)
        if (tabType === 'season') {
          data = await LeaderboardService.getUserWeeklyBreakdown(userId, season)
          console.log('🔍 Season expanded data loaded:', data)
        } else {
          data = await LeaderboardService.getUserWeeklyPicks(userId, season, selectedWeek)
          console.log('🔍 Weekly expanded data loaded:', data)
        }
        
        if (data) {
          console.log('✅ Setting expanded data for', rowKey)
          const newExpandedData = new Map(expandedData)
          newExpandedData.set(rowKey, data)
          setExpandedData(newExpandedData)
        } else {
          console.warn('⚠️ No data returned for expanded content:', rowKey)
        }
      } catch (error) {
        console.error('❌ Failed to load expanded data:', error)
      } finally {
        const newLoading = new Set(loadingExpansions)
        newLoading.delete(rowKey)
        setLoadingExpansions(newLoading)
      }
    }
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
        
        {/* Dynamic Notice Banner */}
        {(() => {
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
          
          const icon = noticeData.type === 'final' ? (
            <svg className={`h-6 w-6 ${iconColor} mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : noticeData.type === 'experimental' ? (
            <svg className={`h-6 w-6 ${iconColor} mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className={`h-6 w-6 ${iconColor} mt-0.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
          
          const title = noticeData.type === 'final' ? '✅ RESULTS CONFIRMED' : 
                       noticeData.type === 'experimental' ? '🔄 LIVE SCORING' : 
                       '⚠️ IMPORTANT NOTICE'
          
          return (
            <div className={`mt-4 mb-5 px-4 py-2.5 border rounded-lg ${bgColor}`}>
              <div className="flex items-center gap-2.5">
                <span className={`text-sm font-bold ${textColor}`}>{title}</span>
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

  function renderLeaderboardContent(data: any[], tabType: 'season' | 'weekly') {
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

    if (data.length === 0) {
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
            const rowKey = `${entry.user_id}-${tabType}`
            const isExpanded = expandedRows.has(rowKey)
            const isLoadingExpansion = loadingExpansions.has(rowKey)
            const expansionData = expandedData.get(rowKey)
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
                isLoading={isLoadingExpansion}
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
                <div
                  className="cursor-pointer"
                  onClick={() => handleRowToggle(entry.user_id, tabType)}
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
                    isLoading={isLoadingExpansion}
                    canExpand={true}
                    onToggle={() => {}}
                    isAdmin={isAdmin}
                    isTied={isTied}
                    rankChange={activeTab === 'season' ? ('rank_change' in entry ? entry.rank_change : undefined) : undefined}
                    previousRank={activeTab === 'season' ? ('previous_rank' in entry ? entry.previous_rank : undefined) : undefined}
                    trend={activeTab === 'season' ? ('trend' in entry ? entry.trend : undefined) : undefined}
                    isCurrentUser={isMe}
                  />
                </div>
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