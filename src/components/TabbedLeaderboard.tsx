import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmergencyLeaderboardService, EmergencyLeaderboardEntry } from '@/services/leaderboardService.emergency'
import { ProductionLeaderboardService, ProductionLeaderboardEntry } from '@/services/leaderboardService.production'
import { EmergencyWeeklyLeaderboardService, EmergencyWeeklyLeaderboardEntry } from '@/services/weeklyLeaderboardService.emergency'
import { ProductionWeeklyLeaderboardService, ProductionWeeklyLeaderboardEntry } from '@/services/weeklyLeaderboardService.production'
import { liveUpdateService, LiveUpdateStatus, LiveUpdateResult } from '@/services/liveUpdateService'
import { useAuth } from '@/hooks/useAuth'

export default function TabbedLeaderboard() {
  const { user } = useAuth()
  const [season, setSeason] = useState(2025)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [activeTab, setActiveTab] = useState('season')
  const [seasonData, setSeasonData] = useState<EmergencyLeaderboardEntry[]>([])
  const [weeklyData, setWeeklyData] = useState<EmergencyWeeklyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState('')
  const [liveUpdateStatus, setLiveUpdateStatus] = useState<LiveUpdateStatus | null>(null)
  const [lastUnifiedUpdate, setLastUnifiedUpdate] = useState<LiveUpdateResult | null>(null)
  
  // Check if current user is admin
  const isAdmin = user?.is_admin === true

  useEffect(() => {
    loadSeasonData()
    updateLiveStatus()
  }, [season])

  useEffect(() => {
    if (activeTab === 'weekly') {
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
      console.log('🔄 Loading season leaderboard for season', season)
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Overall timeout after 10 seconds')), 10000)
      })
      
      console.log('🚀 [TABBED] Trying production-optimized service first')
      let dataPromise
      
      try {
        dataPromise = ProductionLeaderboardService.getSeasonLeaderboard(season)
      } catch (error) {
        console.log('⚠️ [TABBED] Production service failed, falling back to emergency service')
        dataPromise = EmergencyLeaderboardService.getSeasonLeaderboard(season)
      }
      
      const entries = await Promise.race([dataPromise, timeoutPromise])
      
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
    try {
      setLoading(true)
      setError('')
      console.log('🚀 [TABBED] Running unified update (games + picks)...')
      
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

  const getSourceBadge = (source?: 'authenticated' | 'anonymous' | 'mixed') => {
    switch (source) {
      case 'authenticated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <span>🔐</span> Auth
          </span>
        )
      case 'anonymous':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <span>👤</span> Anon
          </span>
        )
      case 'mixed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <span>🔄</span> Mixed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <span>🔐</span> Auth
          </span>
        )
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pigskin-600">Leaderboard</h1>
        
        {/* Important Notice Banner */}
        <div className="mt-4 mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-yellow-800 mb-1">⚠️ IMPORTANT NOTICE</h3>
              <p className="text-yellow-700 font-medium">
                LEADERBOARD IS NOT UP TO DATE. FOR WEEK ONE, WE HAVE TO MANUALLY VALIDATE DATA. 
                UNTIL THIS PROCESS IS COMPLETED, YOU MAY NOT APPEAR ON THE LEADERBOARD AND YOUR PICKS MAY NOT BE CORRECT.
              </p>
            </div>
          </div>
        </div>
        
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
            
            <Button 
              onClick={runUnifiedUpdate} 
              disabled={loading}
              className="bg-pigskin-600 hover:bg-pigskin-700"
              size="sm"
            >
              {loading ? 'Updating...' : '🚀 Refresh All'}
            </Button>
            
            <Button 
              onClick={activeTab === 'season' ? loadSeasonData : loadWeeklyData} 
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? 'Loading...' : `Refresh ${activeTab}`}
            </Button>
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
          <Card>
            <CardHeader>
              <CardTitle>Season {season} Standings</CardTitle>
            </CardHeader>
            <CardContent>
              {renderLeaderboardContent(seasonData, 'season')}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="weekly" className="mt-6">
          <div className="mb-4">
            <Select 
              value={selectedWeek.toString()} 
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
              <CardTitle>Week {selectedWeek} Results</CardTitle>
            </CardHeader>
            <CardContent>
              {renderLeaderboardContent(weeklyData, 'weekly')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )

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
        
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Rank</th>
              <th className="text-left p-2">
                <div className="flex items-center gap-1">
                  Name
                  {liveUpdateStatus?.isRunning && (
                    <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                  )}
                </div>
              </th>
              {isAdmin && <th className="text-left p-2">Source</th>}
              <th className="text-left p-2">Record</th>
              <th className="text-left p-2">Lock Record</th>
              <th className="text-left p-2">Points</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.user_id} className="border-b hover:bg-gray-50">
                <td className="p-2 font-semibold">#{entry.season_rank || entry.weekly_rank}</td>
                <td className="p-2">{entry.display_name}</td>
                {isAdmin && <td className="p-2">{getSourceBadge(entry.pick_source)}</td>}
                <td className="p-2">{entry.season_record || entry.weekly_record}</td>
                <td className="p-2">{entry.lock_record}</td>
                <td className="p-2 font-semibold">{entry.total_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
}