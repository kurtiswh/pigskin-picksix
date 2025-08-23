import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { EmergencyLeaderboardService, EmergencyLeaderboardEntry } from '@/services/leaderboardService.emergency'
import { ProductionLeaderboardService, ProductionLeaderboardEntry } from '@/services/leaderboardService.production'

export default function SimpleLeaderboard() {
  const [season, setSeason] = useState(2024)
  const [data, setData] = useState<EmergencyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState('')

  useEffect(() => {
    loadData()
  }, [season])

  const loadData = async () => {
    const startTime = Date.now()
    
    try {
      setLoading(true)
      setError('')
      setStrategy('')
      console.log('🔄 Loading emergency leaderboard for season', season)
      
      // Add manual timeout to prevent infinite loading - reduced for faster fallback in production
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Overall timeout after 10 seconds')), 10000)
      })
      
      // Try production-optimized service first (direct REST API)
      console.log('🚀 [SIMPLE] Trying production-optimized service first')
      let dataPromise
      
      try {
        dataPromise = ProductionLeaderboardService.getSeasonLeaderboard(season)
      } catch (error) {
        console.log('⚠️ [SIMPLE] Production service failed, falling back to emergency service')
        dataPromise = EmergencyLeaderboardService.getSeasonLeaderboard(season)
      }
      
      const entries = await Promise.race([dataPromise, timeoutPromise])
      
      const loadTime = Date.now() - startTime
      console.log('✅ Loaded', entries.length, 'entries in', loadTime, 'ms')
      
      setData(entries)
      
      // Set strategy indicator based on data
      if (entries.length === 1 && entries[0].user_id === 'emergency-1') {
        setStrategy('Emergency static data - check console for errors')
      } else if (entries.length > 0) {
        setStrategy('Data loaded successfully')
      }
      
    } catch (err: any) {
      const loadTime = Date.now() - startTime
      console.error('❌ Failed to load leaderboard after', loadTime, 'ms:', err)
      setError(err.message || 'Failed to load leaderboard')
      setData([])
      setStrategy('All loading strategies failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-pigskin-600">Season Leaderboard</h1>
        
        <div className="mt-4 flex items-center gap-4">
          <Select value={season.toString()} onValueChange={(value) => setSeason(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            onClick={loadData} 
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

      <Card>
        <CardHeader>
          <CardTitle>Season {season} Standings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p>Loading...</p>}
          
          {error && (
            <div className="text-red-600 p-4 bg-red-50 rounded">
              Error: {error}
            </div>
          )}
          
          {!loading && !error && data.length === 0 && (
            <p className="text-gray-500">No data found for season {season}</p>
          )}
          
          {!loading && data.length > 0 && (
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
                      <td className="p-2 font-semibold">#{entry.season_rank}</td>
                      <td className="p-2">{entry.display_name}</td>
                      <td className="p-2">{entry.season_record}</td>
                      <td className="p-2">{entry.lock_record}</td>
                      <td className="p-2 font-semibold">{entry.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}