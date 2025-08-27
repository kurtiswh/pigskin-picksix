import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmergencyLeaderboardService, EmergencyLeaderboardEntry } from '@/services/leaderboardService.emergency'
import { ProductionLeaderboardService, ProductionLeaderboardEntry } from '@/services/leaderboardService.production'
import { EmergencyWeeklyLeaderboardService, EmergencyWeeklyLeaderboardEntry } from '@/services/weeklyLeaderboardService.emergency'
import { ProductionWeeklyLeaderboardService, ProductionWeeklyLeaderboardEntry } from '@/services/weeklyLeaderboardService.production'

export default function TabbedLeaderboard() {
  const [season, setSeason] = useState(2025)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [activeTab, setActiveTab] = useState('season')
  const [seasonData, setSeasonData] = useState<EmergencyLeaderboardEntry[]>([])
  const [weeklyData, setWeeklyData] = useState<EmergencyWeeklyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState('')

  useEffect(() => {
    loadSeasonData()
  }, [season])

  useEffect(() => {
    if (activeTab === 'weekly') {
      loadWeeklyData()
    }
  }, [selectedWeek, season, activeTab])

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

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pigskin-600">Leaderboard</h1>
        
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
          
          <Button 
            onClick={activeTab === 'season' ? loadSeasonData : loadWeeklyData} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
          
          {strategy && (
            <span className="text-sm text-gray-600">
              Status: {strategy}
            </span>
          )}
        </div>
      </div>

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
              {renderLeaderboardContent(seasonData)}
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
              {renderLeaderboardContent(weeklyData)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )

  function renderLeaderboardContent(data: any[]) {
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
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Rank</th>
              <th className="text-left p-2">Name</th>
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