import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { updateGameScores, getCompletedGames } from '@/services/collegeFootballApi'
import { updateGameInDatabase, processCompletedGames, calculatePicksForGame } from '@/services/scoreCalculation'
import { liveUpdateService, LiveUpdateResult, LiveUpdateStatus } from '@/services/liveUpdateService'

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

export default function ScoreManager({ season, week: initialWeek }: ScoreManagerProps) {
  const [selectedWeek, setSelectedWeek] = useState(initialWeek)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processingResults, setProcessingResults] = useState<{
    gamesProcessed: number
    picksUpdated: number
    errors: string[]
  } | null>(null)
  const [liveUpdateStatus, setLiveUpdateStatus] = useState<LiveUpdateStatus | null>(null)
  const [lastUnifiedUpdate, setLastUnifiedUpdate] = useState<LiveUpdateResult | null>(null)
  const [manualOperationLoading, setManualOperationLoading] = useState<string | null>(null)
  const [manualOperationResult, setManualOperationResult] = useState<{
    operation: string
    success: boolean
    message: string
    details?: string
  } | null>(null)
  const [statusData, setStatusData] = useState<{
    lastScoresUpdate: Date | null
    lastPicksUpdate: Date | null
    lastLeaderboardUpdate: Date | null
    pendingScores: number
    pendingPicks: number
    pendingAnonPicks: number
    totalGames: number
  }>({
    lastScoresUpdate: null,
    lastPicksUpdate: null,
    lastLeaderboardUpdate: null,
    pendingScores: 0,
    pendingPicks: 0,
    pendingAnonPicks: 0,
    totalGames: 0
  })

  useEffect(() => {
    loadGames()
    updateLiveStatus()
    loadStatusData()
    checkAutoStart()
    
    // Set up periodic status updates
    const statusInterval = setInterval(() => {
      updateLiveStatus()
      loadStatusData()
    }, 10000) // Update every 10 seconds
    
    return () => {
      clearInterval(statusInterval)
    }
  }, [season, selectedWeek])

  useEffect(() => {
    setSelectedWeek(initialWeek)
  }, [initialWeek])

  const updateLiveStatus = () => {
    setLiveUpdateStatus(liveUpdateService.getStatus())
  }

  const loadStatusData = async () => {
    try {
      // Get games with scores vs total
      const { data: allGames } = await supabase
        .from('games')
        .select('id, home_score, away_score, updated_at')
        .eq('season', season)
        .eq('week', selectedWeek)

      // Get picks needing processing (filter by game_id instead of season/week)
      const gameIds = allGames?.map(g => g.id) || []
      
      let pendingPicks = 0
      let pendingAnonPicks = 0
      
      if (gameIds.length > 0) {
        const { count: picks } = await supabase
          .from('picks')
          .select('*', { count: 'exact', head: true })
          .in('game_id', gameIds)
          .is('result', null)
        
        // Anonymous picks also filter by game_id since they may not have season/week columns
        const { count: anonPicks } = await supabase
          .from('anonymous_picks')
          .select('*', { count: 'exact', head: true })
          .in('game_id', gameIds)
          .is('result', null)
          
        pendingPicks = picks || 0
        pendingAnonPicks = anonPicks || 0
      }

      // Get latest updates from recent activity
      const { data: recentScores } = await supabase
        .from('games')
        .select('updated_at')
        .eq('season', season)
        .eq('week', selectedWeek)
        .not('home_score', 'is', null)
        .not('away_score', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)

      // Get latest pick updates (filter by game_id)
      const { data: recentPicks } = await supabase
        .from('picks')
        .select('updated_at')
        .in('game_id', gameIds)
        .not('result', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)

      const gamesWithScores = allGames?.filter(g => g.home_score !== null && g.away_score !== null).length || 0
      const gamesWithoutScores = (allGames?.length || 0) - gamesWithScores

      setStatusData({
        lastScoresUpdate: recentScores?.[0]?.updated_at ? new Date(recentScores[0].updated_at) : null,
        lastPicksUpdate: recentPicks?.[0]?.updated_at ? new Date(recentPicks[0].updated_at) : null,
        lastLeaderboardUpdate: liveUpdateStatus?.lastPickProcessing?.lastUpdate || null,
        pendingScores: gamesWithoutScores,
        pendingPicks: pendingPicks || 0,
        pendingAnonPicks: pendingAnonPicks || 0,
        totalGames: allGames?.length || 0
      })
    } catch (error) {
      console.error('Error loading status data:', error)
    }
  }

  const checkAutoStart = async () => {
    try {
      const autoStartCheck = await liveUpdateService.shouldAutoStart()
      if (autoStartCheck.should) {
        console.log(`🤖 [SCORE MGR] Auto-start conditions met: ${autoStartCheck.reason}`)
        await liveUpdateService.autoStartIfNeeded()
        updateLiveStatus()
      } else {
        console.log(`⏸️ [SCORE MGR] No auto-start: ${autoStartCheck.reason}`)
      }
    } catch (error: any) {
      console.error('❌ [SCORE MGR] Auto-start check failed:', error)
    }
  }

  const loadGames = async () => {
    try {
      setLoading(true)
      setError('')

      const { data, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', selectedWeek)
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

  // NEW: Unified update using the live update service
  const runUnifiedUpdate = async () => {
    try {
      setLoading(true)
      setError('')
      setProcessingResults(null)

      console.log('🚀 Running unified update (games + picks)...')
      
      const result = await liveUpdateService.manualUpdate(season, week)
      setLastUnifiedUpdate(result)
      
      if (result.success) {
        console.log(`✅ Unified update complete: ${result.gamesUpdated} games, ${result.picksProcessed} picks`)
      } else {
        setError('Some updates failed - check console for details')
      }

      // Reload games to show updated data
      await loadGames()
      updateLiveStatus()

    } catch (err: any) {
      console.error('Error in unified update:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // LEGACY: Keep old method for compatibility
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

  // Live update control functions
  const startLiveUpdates = () => {
    liveUpdateService.startSmartPolling()
    updateLiveStatus()
  }

  const stopLiveUpdates = () => {
    liveUpdateService.stopPolling()
    updateLiveStatus()
  }

  // Manual scoring operations
  const runManualPicksScoring = async () => {
    try {
      setManualOperationLoading('picks')
      setError('')
      setManualOperationResult(null)

      console.log(`🔄 Running optimized picks scoring for ${season} Week ${week}...`)

      // Try to use the new optimized batch function first
      const { data: batchResult, error: batchError } = await supabase.rpc('process_picks_for_week_with_timeout', {
        week_param: week,
        season_param: season,
        max_games_per_batch: 3
      })

      if (!batchError && batchResult && batchResult.length > 0) {
        const result = batchResult[0]
        const hasErrors = result.errors && result.errors.length > 0

        setManualOperationResult({
          operation: 'Picks Scoring',
          success: !hasErrors,
          message: hasErrors ? 
            `Completed with ${result.errors.length} errors out of ${result.total_games} games` :
            `Successfully updated picks scoring for ${season} Week ${week}`,
          details: `Games processed: ${result.games_processed}/${result.total_games}, Picks updated: ${result.total_picks_updated}, Anonymous picks updated: ${result.total_anon_picks_updated}${hasErrors ? `\nErrors: ${result.errors.join('; ')}` : ''}`
        })

        console.log('✅ Optimized picks scoring completed:', result)
        return
      }

      // Fallback to the original method if the new function doesn't exist or fails
      console.log('⚠️ Optimized function not available, falling back to original method...')

      // First, get list of completed games for this week
      const { data: completedGames, error: gamesError } = await supabase.rpc('get_completed_games_for_week', {
        week_param: week,
        season_param: season
      })

      if (gamesError) throw gamesError

      if (!completedGames || completedGames.length === 0) {
        setManualOperationResult({
          operation: 'Picks Scoring',
          success: true,
          message: `No completed games found for ${season} Week ${week}`,
          details: 'All games may already be processed or none are completed yet'
        })
        return
      }

      console.log(`📋 Found ${completedGames.length} completed games to process`)
      
      let totalPicksUpdated = 0
      let totalAnonPicksUpdated = 0
      let gamesProcessed = 0
      const errors: string[] = []

      // Process each game individually using the optimized function if available
      for (const game of completedGames) {
        console.log(`  Processing: ${game.away_team} @ ${game.home_team}...`)
        
        try {
          // Update progress in UI by setting a temporary result
          setManualOperationResult({
            operation: 'Picks Scoring',
            success: true,
            message: `Processing ${game.away_team} @ ${game.home_team}... (${gamesProcessed + 1}/${completedGames.length})`,
            details: `Games processed: ${gamesProcessed}, Total picks updated: ${totalPicksUpdated}`
          })

          // Try to use optimized function first, fallback to original if it doesn't exist
          let gameResult, gameError
          
          // First try the optimized function
          const optimizedResult = await supabase.rpc('calculate_pick_results_for_game_optimized', {
            game_id_param: game.game_id
          })
          
          if (optimizedResult.error && optimizedResult.error.message.includes('does not exist')) {
            // Fallback to original function if optimized doesn't exist
            const fallbackResult = await supabase.rpc('calculate_pick_results_for_game', {
              game_id_param: game.game_id
            })
            gameResult = fallbackResult.data
            gameError = fallbackResult.error
          } else {
            gameResult = optimizedResult.data
            gameError = optimizedResult.error
          }

          if (gameError) {
            errors.push(`${game.away_team} @ ${game.home_team}: ${gameError.message}`)
            console.warn(`⚠️ Error processing game: ${gameError.message}`)
          } else if (gameResult && gameResult.length > 0) {
            const result = gameResult[0]
            if (result.game_processed) {
              totalPicksUpdated += result.picks_updated || 0
              totalAnonPicksUpdated += result.anonymous_picks_updated || 0
              gamesProcessed += 1
              console.log(`    ✅ Updated ${result.picks_updated} picks, ${result.anonymous_picks_updated} anonymous picks`)
            } else {
              errors.push(`${game.away_team} @ ${game.home_team}: ${result.operation_status}`)
            }
          }
        } catch (gameErr: any) {
          errors.push(`${game.away_team} @ ${game.home_team}: ${gameErr.message}`)
          console.warn(`⚠️ Exception processing game: ${gameErr.message}`)
        }
        
        // Small delay to prevent overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Final result
      setManualOperationResult({
        operation: 'Picks Scoring',
        success: errors.length === 0,
        message: errors.length === 0 ? 
          `Successfully updated picks scoring for ${season} Week ${week}` :
          `Completed with ${errors.length} errors out of ${completedGames.length} games`,
        details: `Games processed: ${gamesProcessed}/${completedGames.length}, Picks updated: ${totalPicksUpdated}, Anonymous picks updated: ${totalAnonPicksUpdated}${errors.length > 0 ? `\nErrors: ${errors.join('; ')}` : ''}`
      })

      console.log('✅ Manual picks scoring completed:', { gamesProcessed, totalPicksUpdated, totalAnonPicksUpdated, errors: errors.length })

    } catch (err: any) {
      console.error('❌ Manual picks scoring failed:', err)
      setManualOperationResult({
        operation: 'Picks Scoring',
        success: false,
        message: 'Failed to update picks scoring',
        details: err.message.includes('statement timeout') ? 
          'Database timeout - Apply migration 111 for optimized processing' : err.message
      })
      setError(err.message)
    } finally {
      setManualOperationLoading(null)
    }
  }

  const runManualAnonymousPicksScoring = async () => {
    try {
      setManualOperationLoading('anonymous_picks')
      setError('')
      setManualOperationResult(null)

      console.log(`🔄 Running timeout-resistant anonymous picks scoring for ${season} Week ${week}...`)

      // Use the new batch approach for anonymous picks too
      const { data: completedGames, error: gamesError } = await supabase.rpc('get_completed_games_for_week', {
        week_param: week,
        season_param: season
      })

      if (gamesError) throw gamesError

      if (!completedGames || completedGames.length === 0) {
        setManualOperationResult({
          operation: 'Anonymous Picks Scoring',
          success: true,
          message: `No completed games found for ${season} Week ${week}`,
          details: 'All games may already be processed or none are completed yet'
        })
        return
      }

      console.log(`📋 Processing anonymous picks for ${completedGames.length} completed games`)
      
      let totalAnonPicksUpdated = 0
      let gamesProcessed = 0
      const errors: string[] = []

      // Process each game individually using the same function (it handles both pick types)
      for (const game of completedGames) {
        console.log(`  Processing anonymous picks for: ${game.away_team} @ ${game.home_team}...`)
        
        try {
          // Update progress in UI
          setManualOperationResult({
            operation: 'Anonymous Picks Scoring',
            success: true,
            message: `Processing ${game.away_team} @ ${game.home_team}... (${gamesProcessed + 1}/${completedGames.length})`,
            details: `Games processed: ${gamesProcessed}, Anonymous picks updated: ${totalAnonPicksUpdated}`
          })

          const { data: gameResult, error: gameError } = await supabase.rpc('calculate_pick_results_for_game', {
            game_id_param: game.game_id
          })

          if (gameError) {
            errors.push(`${game.away_team} @ ${game.home_team}: ${gameError.message}`)
            console.warn(`⚠️ Error processing game: ${gameError.message}`)
          } else if (gameResult && gameResult.length > 0) {
            const result = gameResult[0]
            if (result.game_processed) {
              totalAnonPicksUpdated += result.anonymous_picks_updated || 0
              gamesProcessed += 1
              console.log(`    ✅ Updated ${result.anonymous_picks_updated} anonymous picks`)
            } else {
              errors.push(`${game.away_team} @ ${game.home_team}: ${result.operation_status}`)
            }
          }
        } catch (gameErr: any) {
          errors.push(`${game.away_team} @ ${game.home_team}: ${gameErr.message}`)
          console.warn(`⚠️ Exception processing game: ${gameErr.message}`)
        }
        
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      setManualOperationResult({
        operation: 'Anonymous Picks Scoring',
        success: errors.length === 0,
        message: errors.length === 0 ? 
          `Successfully updated anonymous picks scoring for ${season} Week ${week}` :
          `Completed with ${errors.length} errors out of ${completedGames.length} games`,
        details: `Games processed: ${gamesProcessed}/${completedGames.length}, Anonymous picks updated: ${totalAnonPicksUpdated}${errors.length > 0 ? `\nErrors: ${errors.join('; ')}` : ''}`
      })

      console.log('✅ Manual anonymous picks scoring completed:', { gamesProcessed, totalAnonPicksUpdated, errors: errors.length })

    } catch (err: any) {
      console.error('❌ Manual anonymous picks scoring failed:', err)
      setManualOperationResult({
        operation: 'Anonymous Picks Scoring',
        success: false,
        message: 'Failed to update anonymous picks scoring',
        details: err.message.includes('statement timeout') ? 
          'Database timeout - try using the new individual game processing' : err.message
      })
      setError(err.message)
    } finally {
      setManualOperationLoading(null)
    }
  }

  const runManualLeaderboardRecalculation = async () => {
    try {
      setManualOperationLoading('leaderboard')
      setError('')
      setManualOperationResult(null)

      console.log(`🔄 Running manual leaderboard recalculation for ${season} Week ${week}...`)

      // Call the combined leaderboard recalculation function
      const { data, error } = await supabase.rpc('recalculate_leaderboards_for_week', {
        week_param: week,
        season_param: season
      })

      if (error) throw error

      // Handle structured return data
      const result = data && data.length > 0 ? data[0] : null

      setManualOperationResult({
        operation: 'Leaderboard Recalculation',
        success: true,
        message: `Successfully recalculated leaderboards for ${season} Week ${week}`,
        details: result ? 
          `Weekly entries: ${result.weekly_entries}, Season entries: ${result.season_entries}` : 
          'Updated both weekly and season leaderboards'
      })

      console.log('✅ Manual leaderboard recalculation completed')

    } catch (err: any) {
      console.error('❌ Manual leaderboard recalculation failed:', err)
      setManualOperationResult({
        operation: 'Leaderboard Recalculation',
        success: false,
        message: 'Failed to recalculate leaderboards',
        details: err.message
      })
      setError(err.message)
    } finally {
      setManualOperationLoading(null)
    }
  }

  const runManualGameStatsUpdate = async () => {
    try {
      setManualOperationLoading('game_stats')
      setError('')
      setManualOperationResult(null)

      console.log(`🔄 Running manual game stats update for ${season} Week ${week}...`)

      // Call the function to recalculate game statistics for all games in the week
      const { data, error } = await supabase.rpc('calculate_week_game_statistics', {
        week_param: week,
        season_param: season
      })

      if (error) throw error

      // Handle structured return data
      const result = data && data.length > 0 ? data[0] : null

      setManualOperationResult({
        operation: 'Game Stats Update',
        success: true,
        message: `Successfully updated game stats for ${season} Week ${week}`,
        details: result ? 
          `Games processed: ${result.processed_games}, Stats calculated: ${result.calculated_stats}` : 
          'Operation completed'
      })

      console.log('✅ Manual game stats update completed')

    } catch (err: any) {
      console.error('❌ Manual game stats update failed:', err)
      setManualOperationResult({
        operation: 'Game Stats Update',
        success: false,
        message: 'Failed to update game stats',
        details: err.message
      })
      setError(err.message)
    } finally {
      setManualOperationLoading(null)
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
            Update game scores and calculate pick results for {season} Week {selectedWeek}
          </p>
          
          {/* Week Selector */}
          <div className="mt-2">
            <label className="text-xs text-gray-500 mr-2">Week:</label>
            <select 
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              className="text-sm border rounded px-2 py-1"
            >
              {Array.from({length: 15}, (_, i) => i + 1).map(weekNum => (
                <option key={weekNum} value={weekNum}>Week {weekNum}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          
          {/* Control Buttons */}
          <Button 
            onClick={runUnifiedUpdate} 
            disabled={loading}
            className="bg-pigskin-600 hover:bg-pigskin-700"
          >
            {loading ? 'Updating...' : '🚀 Refresh All'}
          </Button>
        </div>
      </div>

      {/* Status Monitoring */}
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>📊</span>
            System Status - Week {selectedWeek}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Game Scores Status */}
            <div className="p-3 bg-white rounded border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Game Scores</h4>
                <Badge variant={statusData.pendingScores === 0 ? 'default' : 'secondary'}>
                  {statusData.totalGames - statusData.pendingScores}/{statusData.totalGames}
                </Badge>
              </div>
              <div className="text-xs text-gray-600">
                <div>Completed: {statusData.totalGames - statusData.pendingScores}</div>
                <div>Pending: {statusData.pendingScores}</div>
                <div className="mt-1">
                  Last Update: {statusData.lastScoresUpdate 
                    ? statusData.lastScoresUpdate.toLocaleString() 
                    : 'Never'}
                </div>
              </div>
            </div>

            {/* Picks Status */}
            <div className="p-3 bg-white rounded border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Regular Picks</h4>
                <Badge variant={statusData.pendingPicks === 0 ? 'default' : 'destructive'}>
                  {statusData.pendingPicks} pending
                </Badge>
              </div>
              <div className="text-xs text-gray-600">
                <div>Unprocessed: {statusData.pendingPicks}</div>
                <div className="mt-1">
                  Last Update: {statusData.lastPicksUpdate 
                    ? statusData.lastPicksUpdate.toLocaleString() 
                    : 'Never'}
                </div>
              </div>
            </div>

            {/* Anonymous Picks Status */}
            <div className="p-3 bg-white rounded border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-sm">Anonymous Picks</h4>
                <Badge variant={statusData.pendingAnonPicks === 0 ? 'default' : 'destructive'}>
                  {statusData.pendingAnonPicks} pending
                </Badge>
              </div>
              <div className="text-xs text-gray-600">
                <div>Unprocessed: {statusData.pendingAnonPicks}</div>
                <div className="mt-1">
                  Leaderboard: {statusData.lastLeaderboardUpdate 
                    ? statusData.lastLeaderboardUpdate.toLocaleString() 
                    : 'Never'}
                </div>
              </div>
            </div>
          </div>

          {/* Scheduled Pick Processing Status */}
          {liveUpdateStatus?.lastPickProcessing && (
            <div className="p-3 bg-blue-50 rounded border border-blue-200">
              <h4 className="font-medium text-sm mb-2">Last Scheduled Processing</h4>
              <div className="text-xs space-y-1">
                <div>Games Checked: {liveUpdateStatus.lastPickProcessing.gamesChecked}</div>
                <div>Games Processed: {liveUpdateStatus.lastPickProcessing.gamesChanged}</div>
                <div>Picks Updated: {liveUpdateStatus.lastPickProcessing.picksProcessed}</div>
                <div>Leaderboards: {liveUpdateStatus.lastPickProcessing.leaderboardsRefreshed ? '✅ Refreshed' : '⏳ Not needed'}</div>
                <div>Last Run: {liveUpdateStatus.lastPickProcessing.lastUpdate.toLocaleString()}</div>
                {liveUpdateStatus.lastPickProcessing.errors.length > 0 && (
                  <div className="text-red-600">Errors: {liveUpdateStatus.lastPickProcessing.errors.length}</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Update Controls */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>⚡</span>
            Live Update System
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                {liveUpdateStatus?.isRunning ? (
                  <Button 
                    onClick={stopLiveUpdates} 
                    variant="outline" 
                    className="border-red-200 text-red-600 hover:bg-red-50"
                  >
                    ⏹️ Stop Auto Updates
                  </Button>
                ) : (
                  <Button 
                    onClick={startLiveUpdates} 
                    className="bg-green-600 hover:bg-green-700"
                  >
                    ▶️ Start Auto Updates
                  </Button>
                )}
                
                <Button 
                  onClick={updateScoresFromAPI} 
                  disabled={loading}
                  variant="outline"
                  className="text-sm"
                >
                  Legacy Update
                </Button>
              </div>
              
              {liveUpdateStatus && (
                <div className="mt-2 text-xs text-gray-500">
                  {liveUpdateStatus.isRunning && liveUpdateStatus.nextUpdate && (
                    <div>Next update: {liveUpdateStatus.nextUpdate.toLocaleTimeString()}</div>
                  )}
                  <div>Total updates: {liveUpdateStatus.totalUpdates}</div>
                </div>
              )}
            </div>
          </div>
          
          {/* Live Update Status Details */}
          {lastUnifiedUpdate && (
            <div className="text-sm bg-gray-50 rounded p-3">
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

      {/* Manual Scoring Operations */}
      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span>🛠️</span>
            Manual Scoring Operations
          </CardTitle>
          <p className="text-sm text-gray-600">
            Manually trigger scoring calculations and leaderboard updates
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button 
              onClick={runManualPicksScoring}
              disabled={manualOperationLoading !== null}
              variant="outline"
              className="flex items-center justify-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              {manualOperationLoading === 'picks' ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span>🎯</span>
                  Update Picks Scoring
                </>
              )}
            </Button>

            <Button 
              onClick={runManualAnonymousPicksScoring}
              disabled={manualOperationLoading !== null}
              variant="outline"
              className="flex items-center justify-center gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {manualOperationLoading === 'anonymous_picks' ? (
                <>
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span>🎭</span>
                  Update Anonymous Picks
                </>
              )}
            </Button>

            <Button 
              onClick={runManualLeaderboardRecalculation}
              disabled={manualOperationLoading !== null}
              variant="outline"
              className="flex items-center justify-center gap-2 border-green-200 text-green-700 hover:bg-green-50"
            >
              {manualOperationLoading === 'leaderboard' ? (
                <>
                  <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span>🏆</span>
                  Recalculate Leaderboards
                </>
              )}
            </Button>

            <Button 
              onClick={runManualGameStatsUpdate}
              disabled={manualOperationLoading !== null}
              variant="outline"
              className="flex items-center justify-center gap-2 border-orange-200 text-orange-700 hover:bg-orange-50"
            >
              {manualOperationLoading === 'game_stats' ? (
                <>
                  <div className="w-4 h-4 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                <>
                  <span>📊</span>
                  Update Game Stats
                </>
              )}
            </Button>
          </div>

          {/* Manual Operation Result */}
          {manualOperationResult && (
            <div className={`text-sm rounded-lg p-3 ${
              manualOperationResult.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-start gap-2">
                <span className={`text-lg ${
                  manualOperationResult.success ? 'text-green-600' : 'text-red-600'
                }`}>
                  {manualOperationResult.success ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <div className={`font-medium ${
                    manualOperationResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {manualOperationResult.operation}
                  </div>
                  <div className={`${
                    manualOperationResult.success ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {manualOperationResult.message}
                  </div>
                  {manualOperationResult.details && (
                    <div className={`text-xs mt-1 ${
                      manualOperationResult.success ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {manualOperationResult.details}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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