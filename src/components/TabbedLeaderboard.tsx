import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Download } from 'lucide-react'
import { EmergencyLeaderboardService, EmergencyLeaderboardEntry, UserWeeklyBreakdown } from '@/services/leaderboardService.emergency'
import { ProductionLeaderboardService, ProductionLeaderboardEntry } from '@/services/leaderboardService.production'
import { EmergencyWeeklyLeaderboardService, EmergencyWeeklyLeaderboardEntry, UserWeeklyPicks } from '@/services/weeklyLeaderboardService.emergency'
import { ProductionWeeklyLeaderboardService, ProductionWeeklyLeaderboardEntry } from '@/services/weeklyLeaderboardService.production'
import { liveUpdateService, LiveUpdateStatus, LiveUpdateResult } from '@/services/liveUpdateService'
import { getLatestWeekWithResults } from '@/services/weekService'
import { LeaderboardService, LeaderboardEntry } from '@/services/leaderboardService'
import { WeekSettingsService, WeekSettings } from '@/services/weekSettingsService'
import { useAuth } from '@/hooks/useAuth'
import { ExpandableLeaderboardRow, LeaderboardRowContent } from '@/components/ExpandableLeaderboardRow'
import { SeasonExpandedDetails } from '@/components/SeasonExpandedDetails'
import { WeeklyExpandedDetails } from '@/components/WeeklyExpandedDetails'

export default function TabbedLeaderboard() {
  const { user } = useAuth()
  const [season, setSeason] = useState(2025)
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [selectedSeasonWeek, setSelectedSeasonWeek] = useState<'current' | number>('current')
  const [activeTab, setActiveTab] = useState('season')
  const [seasonData, setSeasonData] = useState<(LeaderboardEntry | EmergencyLeaderboardEntry)[]>([])
  const [weeklyData, setWeeklyData] = useState<EmergencyWeeklyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState('')
  const [liveUpdateStatus, setLiveUpdateStatus] = useState<LiveUpdateStatus | null>(null)
  const [lastUnifiedUpdate, setLastUnifiedUpdate] = useState<LiveUpdateResult | null>(null)
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

  // Initialize selectedWeek to the latest week with results
  useEffect(() => {
    const initializeWeek = async () => {
      const latestWeek = await getLatestWeekWithResults(season)
      setSelectedWeek(latestWeek)
    }
    initializeWeek()
  }, [season])

  useEffect(() => {
    loadSeasonData()
    updateLiveStatus()
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

  useEffect(() => {
    // Set up periodic live status updates and check for auto-start
    updateLiveStatus()
    checkAutoStart()
    
    const statusInterval = setInterval(updateLiveStatus, 10000) // Update every 10 seconds
    const refreshInterval = setInterval(checkForAutoRefresh, 30000) // Check for refresh every 30 seconds
    
    return () => {
      clearInterval(statusInterval)
      clearInterval(refreshInterval)
    }
  }, [])

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

  const updateLiveStatus = () => {
    setLiveUpdateStatus(liveUpdateService.getStatus())
  }

  const checkForAutoRefresh = async () => {
    // Only auto-refresh if live updates are running and we're not already loading
    if (!liveUpdateStatus?.isRunning || loading) return
    
    try {
      // Check if the live update service indicates leaderboard should be refreshed
      if (liveUpdateService.shouldRefreshLeaderboard()) {
        console.log('🔄 [TABBED] Auto-refreshing leaderboard after game/pick updates')
        
        // Refresh the current active tab
        if (activeTab === 'season') {
          await loadSeasonData()
          setStrategy('Auto-refreshed after updates')
        } else if (activeTab === 'weekly') {
          await loadWeeklyData()
          setStrategy('Auto-refreshed after updates')
        }
        
        // Acknowledge that we've refreshed
        liveUpdateService.acknowledgeLeaderboardRefresh()
      }
    } catch (error: any) {
      console.error('❌ [TABBED] Auto-refresh check failed:', error)
    }
  }

  const checkAutoStart = async () => {
    if (!isAdmin) return // Only auto-start for admin users
    
    try {
      const autoStartCheck = await liveUpdateService.shouldAutoStart()
      if (autoStartCheck.should) {
        console.log(`🤖 [TABBED] Auto-start conditions met: ${autoStartCheck.reason}`)
        await liveUpdateService.autoStartIfNeeded()
        updateLiveStatus()
        setStrategy(`Auto-started: ${autoStartCheck.reason}`)
      } else {
        console.log(`⏸️ [TABBED] No auto-start: ${autoStartCheck.reason}`)
        setStrategy(`Monitoring: ${autoStartCheck.reason}`)
      }
    } catch (error: any) {
      console.error('❌ [TABBED] Auto-start check failed:', error)
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
        } catch (error) {
          console.log('⚠️ [TABBED] Rank change calculation failed:', error.message, '- falling back')
        
          // Strategy 2: Try production service
          try {
            const dataPromise = ProductionLeaderboardService.getSeasonLeaderboard(season)
            entries = await Promise.race([dataPromise, timeoutPromise])
            console.log('✅ [TABBED] Loaded season data from production service:', entries.length, 'entries')
          } catch (error) {
            console.log('⚠️ [TABBED] Production service failed, falling back to emergency service')
            const dataPromise = EmergencyLeaderboardService.getSeasonLeaderboard(season)
            entries = await Promise.race([dataPromise, timeoutPromise])
            console.log('✅ [TABBED] Loaded season data from emergency service:', entries.length, 'entries')
          }
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
      
      console.log('🚀 [WEEKLY TABBED] Trying production-optimized weekly service first')
      let dataPromise
      
      try {
        dataPromise = ProductionWeeklyLeaderboardService.getWeeklyLeaderboard(season, selectedWeek)
      } catch (error) {
        console.log('⚠️ [WEEKLY TABBED] Production weekly service failed, falling back to emergency service')
        dataPromise = EmergencyWeeklyLeaderboardService.getWeeklyLeaderboard(season, selectedWeek)
      }
      
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

  // Unified update using the live update service
  const runUnifiedUpdate = async () => {
    // Restrict manual API updates to admin users only
    if (!isAdmin) {
      console.warn('⚠️ Manual API updates are restricted to admin users only')
      setError('Manual API updates are restricted to admin users to preserve API quota.')
      return
    }
    
    try {
      setLoading(true)
      setError('')
      console.log('🚀 [TABBED] Admin running unified update (games + picks)...')
      
      const result = await liveUpdateService.manualUpdate(season, selectedWeek)
      setLastUnifiedUpdate(result)
      
      if (result.success) {
        console.log(`✅ [TABBED] Unified update complete: ${result.gamesUpdated} games, ${result.picksProcessed} picks`)
        setStrategy(`Updated: ${result.gamesUpdated} games, ${result.picksProcessed} picks`)
      } else {
        setError('Some updates failed - check console for details')
        setStrategy('Update failed - check console')
      }

      // Reload current tab data
      if (activeTab === 'season') {
        await loadSeasonData()
      } else if (activeTab === 'weekly') {
        await loadWeeklyData()
      }
      
      updateLiveStatus()

    } catch (err: any) {
      console.error('❌ [TABBED] Unified update error:', err)
      setError(err.message || 'Failed to update')
      setStrategy('Update error')
    } finally {
      setLoading(false)
    }
  }

  // Live update control functions
  const startLiveUpdates = () => {
    liveUpdateService.startSmartPolling()
    updateLiveStatus()
    setStrategy('Live updates started')
  }

  const stopLiveUpdates = () => {
    liveUpdateService.stopPolling()
    updateLiveStatus()
    setStrategy('Live updates stopped')
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
          data = await EmergencyLeaderboardService.getUserWeeklyBreakdown(userId, season)
          console.log('🔍 Season expanded data loaded:', data)
        } else {
          data = await EmergencyWeeklyLeaderboardService.getUserWeeklyPicks(userId, season, selectedWeek)
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

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pigskin-600">Leaderboard</h1>
        
        {/* Dynamic Notice Banner */}
        {(() => {
          const noticeData = WeekSettingsService.getNoticeMessage(
            weekSettings, 
            liveUpdateStatus?.isRunning || false
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
            <div className={`mt-4 mb-6 p-4 border-2 rounded-lg ${bgColor}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {icon}
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg font-bold ${textColor} mb-1`}>{title}</h3>
                  <p className={`${messageColor} font-medium`}>
                    {noticeData.message}
                  </p>
                </div>
              </div>
            </div>
          )
        })()}
        
        <div className="mt-4 flex items-center gap-4">
          <Select value={season.toString()} onValueChange={(value) => setSeason(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
            </SelectContent>
          </Select>
          
          <Input
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          
          <div className="flex items-center gap-2">
            {/* Live Update Status */}
            {liveUpdateStatus && (
              <div className="flex items-center gap-2">
                {liveUpdateStatus.isRunning ? (
                  <Badge className="bg-green-100 text-green-800">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                    LIVE
                  </Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-600">
                    MANUAL
                  </Badge>
                )}
                
                {liveUpdateStatus.lastUpdate && (
                  <span className="text-xs text-gray-500">
                    Last: {liveUpdateStatus.lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
            
          </div>
          
          {strategy && (
            <span className="text-sm text-gray-600">
              Status: {strategy}
            </span>
          )}
        </div>
      </div>

      {/* Live Update Controls - Admin Only */}
      {isAdmin && (
        <Card className="border-blue-200 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">⚡ Live Updates:</span>
                {liveUpdateStatus?.isRunning ? (
                  <Button 
                    onClick={stopLiveUpdates} 
                    variant="outline" 
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                  >
                    ⏹️ Stop Auto Updates
                  </Button>
                ) : (
                  <Button 
                    onClick={startLiveUpdates} 
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    ▶️ Start Auto Updates
                  </Button>
                )}
              </div>
              
              {liveUpdateStatus && (
                <div className="text-xs text-gray-500">
                  {liveUpdateStatus.isRunning && liveUpdateStatus.nextUpdate && (
                    <div>Next update: {liveUpdateStatus.nextUpdate.toLocaleTimeString()}</div>
                  )}
                  <div>Total updates: {liveUpdateStatus.totalUpdates}</div>
                </div>
              )}
            </div>
            
            {/* Last Update Results */}
            {lastUnifiedUpdate && (
              <div className="mt-3 text-sm bg-gray-50 rounded p-3">
                <div className="font-medium mb-1">Last Unified Update:</div>
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-gray-600">Games Updated</div>
                    <div className="font-semibold text-blue-600">{lastUnifiedUpdate.gamesUpdated}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Picks Processed</div>
                    <div className="font-semibold text-green-600">{lastUnifiedUpdate.picksProcessed}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Status</div>
                    <div className={`font-semibold ${lastUnifiedUpdate.success ? 'text-green-600' : 'text-red-600'}`}>
                      {lastUnifiedUpdate.success ? '✅ Success' : '❌ Failed'}
                    </div>
                  </div>
                </div>
                {lastUnifiedUpdate.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">
                    <div className="font-medium">Errors:</div>
                    {lastUnifiedUpdate.errors.slice(0, 3).map((error, i) => (
                      <div key={i}>• {error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="season">Season Standings</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Results</TabsTrigger>
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
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Current Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Season</SelectItem>
                {selectedWeek && Array.from({ length: selectedWeek }, (_, i) => i + 1).map((week) => (
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
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 17 }, (_, i) => i + 1).map((week) => (
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

    const headers = ['Rank', 'User ID', 'Player', 'Points', 'Wins', 'Losses', 'Pushes', 'Lock Wins', 'Lock Losses']
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

      csvRows.push([rank, userId, name, points, wins, losses, pushes, lockWins, lockLosses].join(','))
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

    const headers = ['Rank', 'User ID', 'Player', 'Points', 'Wins', 'Losses', 'Pushes', 'Lock Wins', 'Lock Losses']
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

      csvRows.push([rank, userId, name, points, wins, losses, pushes, lockWins, lockLosses].join(','))
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
        {/* Live Status Header */}
        {liveUpdateStatus?.isRunning && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-700">Live Updates Active</span>
                <span className="text-xs text-green-600">
                  Leaderboard refreshes automatically as games complete
                </span>
                {liveUpdateStatus.shouldRefreshLeaderboard && (
                  <Badge className="bg-blue-100 text-blue-800 animate-pulse">
                    🔄 Refresh Pending
                  </Badge>
                )}
              </div>
              <div className="text-right">
                {liveUpdateStatus.nextUpdate && (
                  <span className="text-xs text-green-600">
                    Next check: {liveUpdateStatus.nextUpdate.toLocaleTimeString()}
                  </span>
                )}
                {liveUpdateStatus.lastResult && (
                  <div className="text-xs text-green-500 mt-1">
                    Last: {liveUpdateStatus.lastResult.gamesUpdated}g / {liveUpdateStatus.lastResult.picksProcessed}p
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Header row - Hidden on mobile */}
        <div className="hidden md:block border-b bg-gray-50">
          <div className="grid grid-cols-12 gap-2 p-2 text-sm font-medium text-gray-700">
            <div className="col-span-1">Rank</div>
            <div className="col-span-3">
              <div className="flex items-center gap-1">
                Name
                {liveUpdateStatus?.isRunning && (
                  <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                )}
              </div>
            </div>
            {isAdmin && <div className="col-span-2">Source</div>}
            <div className={`col-span-2 ${isAdmin ? '' : 'col-span-2'}`}>Record</div>
            <div className="col-span-2">Lock Record</div>
            <div className="col-span-2">Points</div>
          </div>
        </div>

        {/* Expandable rows */}
        <div className="space-y-1">
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
            
            
            return (
              <ExpandableLeaderboardRow
                key={entry.user_id}
                isLoading={isLoadingExpansion}
                className={isTied && currentRank > 3 ? 'bg-blue-50/50 border-l-2 border-l-blue-300' : ''}
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
                    lockRecord={entry.lock_record}
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