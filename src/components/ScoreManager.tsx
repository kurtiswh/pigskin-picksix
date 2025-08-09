import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { updateGameScores, getCompletedGames } from '@/services/collegeFootballApi'
import { updateGameInDatabase, processCompletedGames, calculatePicksForGame } from '@/services/scoreCalculation'

interface Game {
  id: string
  week: number
  season: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  spread: number
  status: 'scheduled' | 'in_progress' | 'completed'
  kickoff_time: string
}

interface ScoreManagerProps {
  season: number
  week: number
}

export default function ScoreManager({ season, week }: ScoreManagerProps) {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processingResults, setProcessingResults] = useState<{
    gamesProcessed: number
    picksUpdated: number
    errors: string[]
  } | null>(null)

  useEffect(() => {
    loadGames()
  }, [season, week])

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', week)
        .order('kickoff_time', { ascending: true })

      if (gamesError) throw gamesError

      setGames(data || [])
    } catch (err: any) {
      console.error('Error loading games:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const updateScoresFromAPI = async () => {
    try {
      setLoading(true)
      setError('')
      setProcessingResults(null)

      console.log('🔄 Fetching latest scores from API...')

      // Get game IDs to update (convert string IDs to numbers for API)
      const gameIds = games.map(game => parseInt(game.id.slice(-8), 16))

      // Fetch updated games from API
      const updatedApiGames = await updateGameScores(gameIds)

      let updatedCount = 0

      // Update each game in database
      for (const apiGame of updatedApiGames) {
        const dbGame = games.find(g => parseInt(g.id.slice(-8), 16) === apiGame.id)
        if (!dbGame) continue

        // Only update if scores have changed or status has changed
        const scoresChanged = 
          dbGame.home_score !== apiGame.home_points ||
          dbGame.away_score !== apiGame.away_points ||
          dbGame.status !== (apiGame.completed ? 'completed' : 'in_progress')

        if (scoresChanged) {
          await updateGameInDatabase({
            game_id: dbGame.id,
            home_score: apiGame.home_points || 0,
            away_score: apiGame.away_points || 0,
            home_team: apiGame.home_team,
            away_team: apiGame.away_team,
            spread: apiGame.spread || dbGame.spread,
            status: apiGame.completed ? 'completed' : 'in_progress'
          })
          updatedCount++
        }
      }

      console.log(`✅ Updated ${updatedCount} games with new scores`)

      // Reload games to show updated data
      await loadGames()

      // Process any newly completed games
      const results = await processCompletedGames(season, week)
      setProcessingResults(results)

    } catch (err: any) {
      console.error('Error updating scores:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const manualScoreUpdate = async (gameId: string, homeScore: number, awayScore: number) => {
    try {
      setError('')

      const game = games.find(g => g.id === gameId)
      if (!game) return

      // Update game in database
      await updateGameInDatabase({
        game_id: gameId,
        home_score: homeScore,
        away_score: awayScore,
        home_team: game.home_team,
        away_team: game.away_team,
        spread: game.spread,
        status: 'completed'
      })

      // Calculate pick results for this game
      await calculatePicksForGame(gameId)

      // Reload games
      await loadGames()

      console.log(`✅ Manually updated game ${gameId}`)

    } catch (err: any) {
      console.error('Error updating game manually:', err)
      setError(err.message)
    }
  }

  const formatTime = (kickoffTime: string) => {
    return new Date(kickoffTime).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50'
      case 'in_progress': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Score Management</h3>
          <p className="text-sm text-gray-600">
            Update game scores and calculate pick results for {season} Week {week}
          </p>
        </div>
        <Button 
          onClick={updateScoresFromAPI} 
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading ? 'Updating...' : '🔄 Update All Scores'}
        </Button>
      </div>

      {error && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="text-red-600 text-sm">
              ⚠️ {error}
            </div>
          </CardContent>
        </Card>
      )}

      {processingResults && (
        <Card className="border-green-200">
          <CardContent className="p-4">
            <div className="text-green-600 text-sm">
              ✅ Processing complete: {processingResults.gamesProcessed} games processed, {processingResults.picksUpdated} picks updated
              {processingResults.errors.length > 0 && (
                <div className="mt-2 text-red-600">
                  Errors: {processingResults.errors.join(', ')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Games ({games.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && games.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {games.map(game => (
                <GameScoreCard
                  key={game.id}
                  game={game}
                  onManualUpdate={(homeScore, awayScore) => 
                    manualScoreUpdate(game.id, homeScore, awayScore)
                  }
                  getStatusColor={getStatusColor}
                  formatTime={formatTime}
                />
              ))}

              {games.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-2xl mb-2">🏈</div>
                  <div>No games found for this week</div>
                  <div className="text-sm">Make sure games are selected in the Game Selection tab</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface GameScoreCardProps {
  game: Game
  onManualUpdate: (homeScore: number, awayScore: number) => void
  getStatusColor: (status: string) => string
  formatTime: (time: string) => string
}

function GameScoreCard({ game, onManualUpdate, getStatusColor, formatTime }: GameScoreCardProps) {
  const [homeScore, setHomeScore] = useState(game.home_score?.toString() || '')
  const [awayScore, setAwayScore] = useState(game.away_score?.toString() || '')
  const [isEditing, setIsEditing] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const home = parseInt(homeScore) || 0
    const away = parseInt(awayScore) || 0
    onManualUpdate(home, away)
    setIsEditing(false)
  }

  return (
    <div className="border rounded-lg p-4 hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-4">
            <div className="font-medium">
              {game.away_team} @ {game.home_team}
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(game.status)}`}>
              {game.status}
            </span>
            {game.spread && (
              <span className="text-sm text-gray-600">
                {game.spread > 0 ? `${game.home_team} -${game.spread.toFixed(1)}` : `${game.away_team} -${Math.abs(game.spread).toFixed(1)}`}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {formatTime(game.kickoff_time)}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {game.home_score !== null && game.away_score !== null ? (
            <div className="text-lg font-bold">
              {game.away_score} - {game.home_score}
            </div>
          ) : (
            <div className="text-gray-400">No score</div>
          )}

          {isEditing ? (
            <form onSubmit={handleSubmit} className="flex items-center space-x-2">
              <Input
                type="number"
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                placeholder="Away"
                className="w-16 h-8 text-sm"
                min="0"
              />
              <span>-</span>
              <Input
                type="number"
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                placeholder="Home"
                className="w-16 h-8 text-sm"
                min="0"
              />
              <Button type="submit" size="sm" className="h-8">
                ✓
              </Button>
              <Button 
                type="button" 
                size="sm" 
                variant="outline" 
                className="h-8"
                onClick={() => setIsEditing(false)}
              >
                ✕
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
              className="h-8"
            >
              Edit Score
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}