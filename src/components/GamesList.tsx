import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

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
}

interface GamesListProps {
  week?: number
  season: number
}

export default function GamesList({ week, season }: GamesListProps) {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedWeek, setSelectedWeek] = useState(week || 1)

  useEffect(() => {
    loadGames()
  }, [selectedWeek, season])

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      console.log(`🔄 Loading games for Season ${season}, Week ${selectedWeek}`)

      const { data, error } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', selectedWeek)
        .order('kickoff_time')

      console.log(`📊 Query result: ${data?.length || 0} games, error:`, error)

      if (error) throw error

      setGames(data || [])
      console.log(`✅ Successfully loaded ${data?.length || 0} games`)
    } catch (err: any) {
      console.error('❌ Error loading games:', err)
      setError(err.message)
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
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-red-500 text-2xl mb-2">⚠️</div>
          <div className="text-red-500">{error}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Games - Week {selectedWeek}</span>
          <div className="text-sm font-normal text-charcoal-500">
            {games.length} games
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
        </div>
      </CardHeader>
      
      <CardContent>
        {games.length === 0 ? (
          <div className="text-center py-8 text-charcoal-500">
            <div className="text-4xl mb-4">🏈</div>
            <div>No games found</div>
            <div className="text-sm">
              No games scheduled for Week {selectedWeek}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {games.map((game) => (
              <div
                key={game.id}
                className="p-4 border rounded-lg bg-white"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">
                    {game.away_team} @ {game.home_team}
                  </div>
                  <div className="text-sm text-charcoal-500">
                    {formatTime(game.kickoff_time)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 border rounded">
                    <div className="font-medium">{game.away_team}</div>
                    <div className="text-sm text-charcoal-500">
                      {getSpreadDisplay(game.away_team, game)}
                    </div>
                  </div>

                  <div className="text-center p-3 border rounded">
                    <div className="font-medium">{game.home_team}</div>
                    <div className="text-sm text-charcoal-500">
                      {getSpreadDisplay(game.home_team, game)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}