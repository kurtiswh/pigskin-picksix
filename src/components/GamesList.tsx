import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Game {
  id: string
  home_team: string
  away_team: string
  spread: number
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  week: number
  season: number
  base_points?: number
  margin_bonus?: number
  winner_against_spread?: string | null
  favorite_team?: string | null
}

interface GamesListProps {
  week?: number
  season: number
}

interface DebugInfo {
  timestamp: string
  query: string
  authStatus: string
  error?: any
  resultCount?: number
}

export default function GamesList({ week, season }: GamesListProps) {
  const { user } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(week || 1)
  const [debugInfo, setDebugInfo] = useState<DebugInfo[]>([])
  const [showDebug, setShowDebug] = useState(false)

  useEffect(() => {
    loadGames()
  }, [selectedWeek, season])

  const addDebugInfo = (info: Omit<DebugInfo, 'timestamp'>) => {
    const debugEntry = {
      ...info,
      timestamp: new Date().toISOString()
    }
    setDebugInfo(prev => [...prev.slice(-4), debugEntry]) // Keep last 5 entries
    console.log('🐛 GamesList Debug:', debugEntry)
  }

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      const authStatus = user ? `authenticated (${user.email})` : 'anonymous'
      const queryDescription = `games table: season=${season}, week=${selectedWeek}`
      
      addDebugInfo({
        query: queryDescription,
        authStatus: authStatus
      })

      console.log(`🔄 Loading games for Season ${season}, Week ${selectedWeek}`)
      console.log(`👤 Auth status: ${authStatus}`)

      const query = supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', selectedWeek)
        .order('kickoff_time')

      console.log(`🔍 Executing query: ${queryDescription}`)

      const { data, error } = await query

      console.log(`📊 Query result: ${data?.length || 0} games, error:`, error)

      if (error) {
        addDebugInfo({
          query: queryDescription,
          authStatus: authStatus,
          error: error,
          resultCount: 0
        })
        throw error
      }

      addDebugInfo({
        query: queryDescription,
        authStatus: authStatus,
        resultCount: data?.length || 0
      })

      setGames(data || [])
      console.log(`✅ Successfully loaded ${data?.length || 0} games`)
      
      // Additional debugging for empty results
      if (!data || data.length === 0) {
        console.log(`🤔 No games found for Season ${season}, Week ${selectedWeek}`)
        console.log('💡 Checking if any games exist for this season...')
        
        const { data: seasonGames, error: seasonError } = await supabase
          .from('games')
          .select('week, count(*)')
          .eq('season', season)
          .order('week')
        
        if (!seasonError && seasonGames) {
          console.log(`📊 Games available in season ${season}:`, seasonGames)
        }
      }
      
    } catch (err: any) {
      console.error('❌ Error loading games:', err)
      const errorMessage = err.message || 'Unknown error occurred'
      setError(`Database Error: ${errorMessage}`)
      
      addDebugInfo({
        query: `games table: season=${season}, week=${selectedWeek}`,
        authStatus: user ? `authenticated (${user.email})` : 'anonymous',
        error: err,
        resultCount: 0
      })
    } finally {
      setLoading(false)
    }
  }

  const getSpreadDisplay = (team: string, game: Game) => {
    if (team === game.home_team) {
      return game.spread > 0 ? `+${game.spread}` : `${game.spread}`
    } else {
      return game.spread > 0 ? `${-game.spread}` : `+${-game.spread}`
    }
  }

  const formatTime = (kickoffTime: string) => {
    return new Date(kickoffTime).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago'
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 border-4 border-pigskin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-charcoal-600">Loading games...</div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-8 text-center">
          <div className="text-red-500 text-2xl mb-4">⚠️</div>
          <h3 className="text-lg font-semibold mb-2 text-red-600">Games Loading Error</h3>
          <div className="text-red-500 mb-4">{error}</div>
          
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-left">
            <h4 className="font-semibold text-red-700 mb-2">Troubleshooting Steps:</h4>
            <ul className="text-sm text-red-600 space-y-1">
              <li>• Check if you're connected to the internet</li>
              <li>• Try refreshing the page</li>
              <li>• Check browser console for detailed error logs</li>
              <li>• Try selecting a different week or season</li>
            </ul>
          </div>
          
          <div className="flex gap-2 justify-center">
            <button
              onClick={loadGames}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              {showDebug ? 'Hide' : 'Show'} Debug Info
            </button>
          </div>
          
          {showDebug && (
            <div className="mt-4 p-4 bg-gray-50 border rounded text-left text-xs">
              <h5 className="font-semibold mb-2">Debug Information:</h5>
              {debugInfo.length > 0 ? (
                debugInfo.map((info, i) => (
                  <div key={i} className="mb-2 p-2 bg-white border rounded">
                    <div><strong>Time:</strong> {new Date(info.timestamp).toLocaleTimeString()}</div>
                    <div><strong>Query:</strong> {info.query}</div>
                    <div><strong>Auth:</strong> {info.authStatus}</div>
                    {info.resultCount !== undefined && <div><strong>Results:</strong> {info.resultCount}</div>}
                    {info.error && (
                      <div><strong>Error:</strong> {JSON.stringify(info.error, null, 2)}</div>
                    )}
                  </div>
                ))
              ) : (
                <div>No debug information available</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Games - Week {selectedWeek}</span>
          <div className="flex items-center gap-3">
            <div className="text-sm font-normal text-charcoal-500">
              {games.length} games
            </div>
            {process.env.NODE_ENV === 'development' && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                title="Toggle debug information"
              >
                🐛 Debug
              </button>
            )}
          </div>
        </CardTitle>
        
        <div className="flex items-center gap-4">
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            className="flex h-10 w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            {Array.from({ length: 18 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Week {i + 1}
              </option>
            ))}
          </select>
          
          <div className="text-xs text-charcoal-400">
            Season {season}
          </div>
        </div>
        
        {showDebug && process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
            <h5 className="font-semibold mb-2 text-blue-700">🐛 Debug Information:</h5>
            <div className="space-y-1">
              <div><strong>Auth Status:</strong> {user ? `✅ ${user.email}` : '🔓 Anonymous'}</div>
              <div><strong>Current Query:</strong> Season {season}, Week {selectedWeek}</div>
              <div><strong>Games Loaded:</strong> {games.length}</div>
              <div><strong>Loading State:</strong> {loading ? 'Loading...' : 'Complete'}</div>
              <div><strong>Error State:</strong> {error || 'None'}</div>
            </div>
            {debugInfo.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                  Recent Query History ({debugInfo.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {debugInfo.slice(-3).map((info, i) => (
                    <div key={i} className="p-2 bg-white border rounded">
                      <div><strong>Time:</strong> {new Date(info.timestamp).toLocaleTimeString()}</div>
                      <div><strong>Query:</strong> {info.query}</div>
                      <div><strong>Results:</strong> {info.resultCount ?? 'N/A'}</div>
                      {info.error && (
                        <div className="text-red-600"><strong>Error:</strong> {info.error.message || 'Unknown'}</div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {games.length === 0 ? (
          <div className="text-center py-8 text-charcoal-500">
            <div className="text-4xl mb-4">🏈</div>
            <div className="text-lg font-medium mb-2">No games found</div>
            <div className="text-sm mb-4">
              No games scheduled for Season {season}, Week {selectedWeek}
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 text-left max-w-md mx-auto">
              <h4 className="font-semibold text-yellow-700 mb-2">💡 Suggestions:</h4>
              <ul className="text-sm text-yellow-600 space-y-1">
                <li>• Try a different week (weeks 1-18 available)</li>
                <li>• Check if games have been added for this season</li>
                <li>• Week 1-4 typically have the most games</li>
                <li>• Contact admin if games should be available</li>
              </ul>
            </div>
            
            <button
              onClick={loadGames}
              className="px-4 py-2 bg-pigskin-500 text-white rounded hover:bg-pigskin-600 transition-colors"
            >
              🔄 Refresh
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <div
                key={game.id}
                className={cn(
                  "p-4 border rounded-lg bg-white transition-all",
                  game.status === 'completed' && "border-green-200 bg-green-50",
                  game.status === 'in_progress' && "border-yellow-200 bg-yellow-50 animate-pulse"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">
                      {game.away_team} @ {game.home_team}
                    </div>
                    <div className={cn(
                      "text-xs px-2 py-1 rounded font-medium",
                      game.status === 'scheduled' && "bg-gray-100 text-gray-600",
                      game.status === 'in_progress' && "bg-yellow-100 text-yellow-700",
                      game.status === 'completed' && "bg-green-100 text-green-700"
                    )}>
                      {game.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="text-sm text-charcoal-500">
                    {formatTime(game.kickoff_time)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className={cn(
                    "text-center p-3 border rounded transition-colors",
                    game.winner_against_spread === game.away_team && "border-green-300 bg-green-50"
                  )}>
                    <div className="font-medium">{game.away_team}</div>
                    <div className="text-sm text-charcoal-500">
                      {getSpreadDisplay(game.away_team, game)}
                    </div>
                    {game.away_score !== null && (
                      <div className="text-lg font-bold mt-1">{game.away_score}</div>
                    )}
                  </div>

                  <div className={cn(
                    "text-center p-3 border rounded transition-colors",
                    game.winner_against_spread === game.home_team && "border-green-300 bg-green-50"
                  )}>
                    <div className="font-medium">{game.home_team}</div>
                    <div className="text-sm text-charcoal-500">
                      {getSpreadDisplay(game.home_team, game)}
                    </div>
                    {game.home_score !== null && (
                      <div className="text-lg font-bold mt-1">{game.home_score}</div>
                    )}
                  </div>
                </div>
                
                {game.status === 'completed' && game.winner_against_spread && (
                  <div className="mt-3 pt-3 border-t text-center">
                    <div className="text-sm text-green-600 font-medium">
                      🏆 ATS Winner: {game.winner_against_spread}
                    </div>
                    {(game.base_points || game.margin_bonus) && (
                      <div className="text-xs text-charcoal-500 mt-1">
                        Base: {game.base_points}pts
                        {game.margin_bonus && game.margin_bonus > 0 && ` + Bonus: ${game.margin_bonus}pts`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}