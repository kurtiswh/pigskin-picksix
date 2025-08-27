/**
 * Live Update Service
 * 
 * Unified service for automatically updating games, processing picks,
 * and maintaining real-time leaderboards during game days.
 */

import { supabase } from '@/lib/supabase'
import { getCompletedGames, updateGameScores } from './collegeFootballApi'
import { updateGameInDatabase, calculatePicksForGame, processCompletedGames } from './scoreCalculation'

export interface LiveUpdateResult {
  success: boolean
  gamesUpdated: number
  picksProcessed: number
  errors: string[]
  lastUpdate: Date
}

export interface LiveUpdateStatus {
  isRunning: boolean
  lastUpdate: Date | null
  nextUpdate: Date | null
  errors: string[]
  totalUpdates: number
  lastResult?: LiveUpdateResult
  shouldRefreshLeaderboard?: boolean
}

/**
 * Main Live Update Service Class
 * Handles automatic polling and updating of games and picks
 */
export class LiveUpdateService {
  private static instance: LiveUpdateService
  private pollingInterval: NodeJS.Timeout | null = null
  private isPolling = false
  private status: LiveUpdateStatus = {
    isRunning: false,
    lastUpdate: null,
    nextUpdate: null,
    errors: [],
    totalUpdates: 0,
    lastResult: undefined,
    shouldRefreshLeaderboard: false
  }

  // Singleton pattern for global access
  static getInstance(): LiveUpdateService {
    if (!LiveUpdateService.instance) {
      LiveUpdateService.instance = new LiveUpdateService()
    }
    return LiveUpdateService.instance
  }

  /**
   * Start automatic polling for live updates
   * @param intervalMs - Polling interval in milliseconds (default: 5 minutes)
   */
  startPolling(intervalMs: number = 5 * 60 * 1000): void {
    if (this.isPolling) {
      console.log('🔄 Live updates already running')
      return
    }

    console.log(`🚀 Starting live updates every ${intervalMs / 1000} seconds`)
    this.isPolling = true
    this.status.isRunning = true
    
    // Run initial update
    this.runUpdate()

    // Set up recurring updates
    this.pollingInterval = setInterval(() => {
      this.runUpdate()
    }, intervalMs)

    this.status.nextUpdate = new Date(Date.now() + intervalMs)
  }

  /**
   * Stop automatic polling
   */
  stopPolling(): void {
    if (!this.isPolling) {
      console.log('⏹️ Live updates not currently running')
      return
    }

    console.log('⏹️ Stopping live updates')
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    this.isPolling = false
    this.status.isRunning = false
    this.status.nextUpdate = null
  }

  /**
   * Get current live update status
   */
  getStatus(): LiveUpdateStatus {
    return { ...this.status }
  }

  /**
   * Manual trigger for unified update process
   * @param season - Season to update
   * @param week - Week to update
   */
  async manualUpdate(season: number, week: number): Promise<LiveUpdateResult> {
    console.log(`🔄 Manual update triggered for ${season} week ${week}`)
    return this.updateGamesAndPicks(season, week)
  }

  /**
   * Unified update process - updates games AND processes picks
   */
  private async updateGamesAndPicks(season: number, week: number): Promise<LiveUpdateResult> {
    const startTime = Date.now()
    let gamesUpdated = 0
    let picksProcessed = 0
    const errors: string[] = []

    try {
      console.log(`🎯 Starting unified update for ${season} week ${week}`)

      // Step 1: Get current games from database
      const { data: currentGames, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', season)
        .eq('week', week)

      if (gamesError) {
        throw new Error(`Database error: ${gamesError.message}`)
      }

      if (!currentGames || currentGames.length === 0) {
        console.log('No games found for this week')
        return {
          success: true,
          gamesUpdated: 0,
          picksProcessed: 0,
          errors: [],
          lastUpdate: new Date()
        }
      }

      // Step 2: Fetch latest scores from College Football API
      console.log('📡 Fetching latest scores from API...')
      const gameIds = currentGames.map(game => parseInt(game.id.slice(-8), 16))
      
      let updatedApiGames
      try {
        updatedApiGames = await updateGameScores(gameIds)
      } catch (apiError: any) {
        errors.push(`API fetch failed: ${apiError.message}`)
        // Continue with database update processing if API fails
        updatedApiGames = []
      }

      // Step 3: Update games in database that have changed
      const newlyCompletedGames: string[] = []

      for (const apiGame of updatedApiGames) {
        const dbGame = currentGames.find(g => parseInt(g.id.slice(-8), 16) === apiGame.id)
        if (!dbGame) continue

        // Check if this is a newly completed game
        const wasCompleted = dbGame.status === 'completed'
        const isNowCompleted = apiGame.completed

        // Only update if scores or status have changed
        const hasChanges = 
          dbGame.home_score !== apiGame.home_points ||
          dbGame.away_score !== apiGame.away_points ||
          dbGame.status !== (apiGame.completed ? 'completed' : 'in_progress')

        if (hasChanges) {
          try {
            await updateGameInDatabase({
              game_id: dbGame.id,
              home_score: apiGame.home_points || 0,
              away_score: apiGame.away_points || 0,
              home_team: apiGame.home_team,
              away_team: apiGame.away_team,
              spread: apiGame.spread || dbGame.spread,
              status: apiGame.completed ? 'completed' : 'in_progress'
            })

            gamesUpdated++

            // Track newly completed games for pick processing
            if (!wasCompleted && isNowCompleted) {
              newlyCompletedGames.push(dbGame.id)
            }

          } catch (updateError: any) {
            errors.push(`Game update failed for ${dbGame.id}: ${updateError.message}`)
          }
        }
      }

      // Step 4: Process picks for newly completed games
      if (newlyCompletedGames.length > 0) {
        console.log(`🎯 Processing picks for ${newlyCompletedGames.length} newly completed games`)

        for (const gameId of newlyCompletedGames) {
          try {
            const pickResults = await calculatePicksForGame(gameId)
            picksProcessed += pickResults.length
            console.log(`✅ Processed ${pickResults.length} picks for game ${gameId}`)
          } catch (pickError: any) {
            errors.push(`Pick processing failed for game ${gameId}: ${pickError.message}`)
          }
        }
      }

      // Step 5: Also process any other completed games that might need pick updates
      try {
        const processResult = await processCompletedGames(season, week)
        // Add any additional picks that were processed
        const additionalPicks = processResult.picksUpdated - picksProcessed
        if (additionalPicks > 0) {
          picksProcessed += additionalPicks
        }
        errors.push(...processResult.errors)
      } catch (processError: any) {
        errors.push(`Additional pick processing failed: ${processError.message}`)
      }

      const duration = Date.now() - startTime
      console.log(`✅ Unified update complete: ${gamesUpdated} games updated, ${picksProcessed} picks processed in ${duration}ms`)

      return {
        success: true,
        gamesUpdated,
        picksProcessed,
        errors,
        lastUpdate: new Date()
      }

    } catch (error: any) {
      const duration = Date.now() - startTime
      console.error(`❌ Unified update failed after ${duration}ms:`, error)
      
      return {
        success: false,
        gamesUpdated,
        picksProcessed,
        errors: [...errors, error.message],
        lastUpdate: new Date()
      }
    }
  }

  /**
   * Check if there are active games in progress that need monitoring
   */
  private async hasActiveGames(): Promise<{ hasActive: boolean; activeCount: number }> {
    try {
      const { data: activeWeek } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .single()

      if (!activeWeek) {
        return { hasActive: false, activeCount: 0 }
      }

      const { data: games, error } = await supabase
        .from('games')
        .select('id, status')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)
        .eq('status', 'in_progress')

      if (error) {
        console.error('Error checking active games:', error)
        return { hasActive: false, activeCount: 0 }
      }

      const activeCount = games?.length || 0
      return { hasActive: activeCount > 0, activeCount }

    } catch (error) {
      console.error('Error checking for active games:', error)
      return { hasActive: false, activeCount: 0 }
    }
  }

  /**
   * Automatic polling update - detects current active week and games
   */
  private async runUpdate(): Promise<void> {
    try {
      // Get current active week from database
      const { data: activeWeek, error } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .single()

      if (error || !activeWeek) {
        console.log('⏳ No active week found for live updates')
        return
      }

      // Check for active games
      const { hasActive, activeCount } = await this.hasActiveGames()
      if (hasActive) {
        console.log(`🔥 ${activeCount} active games - running priority update`)
      }

      const result = await this.updateGamesAndPicks(activeWeek.season, activeWeek.week)
      
      // Update status
      this.status.lastUpdate = result.lastUpdate
      this.status.totalUpdates++
      this.status.lastResult = result
      
      // Flag for leaderboard refresh if there were meaningful updates
      this.status.shouldRefreshLeaderboard = result.gamesUpdated > 0 || result.picksProcessed > 0
      
      if (result.errors.length > 0) {
        this.status.errors = [...this.status.errors, ...result.errors].slice(-10) // Keep last 10 errors
      }

      // Set next update time
      if (this.isPolling && this.pollingInterval) {
        const intervalMs = 5 * 60 * 1000 // 5 minutes default
        this.status.nextUpdate = new Date(Date.now() + intervalMs)
      }

      console.log(`🔄 Auto-update completed: ${result.gamesUpdated} games, ${result.picksProcessed} picks`)

    } catch (error: any) {
      console.error('❌ Auto-update failed:', error)
      this.status.errors.push(`Auto-update failed: ${error.message}`)
      this.status.errors = this.status.errors.slice(-10) // Keep last 10 errors
    }
  }

  /**
   * Check if it's during a typical game day (Saturday)
   */
  private isGameDay(): boolean {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = Sunday, 6 = Saturday
    return dayOfWeek === 6 // Saturday
  }

  /**
   * Smart polling that adjusts frequency based on game day and active games
   */
  async startSmartPolling(): Promise<void> {
    const isGameDay = this.isGameDay()
    const { hasActive, activeCount } = await this.hasActiveGames()
    
    let intervalMs
    let description
    
    if (hasActive) {
      // Active games - update every 2 minutes
      intervalMs = 2 * 60 * 1000
      description = `${activeCount} active games`
    } else if (isGameDay) {
      // Game day but no active games - check every 5 minutes
      intervalMs = 5 * 60 * 1000
      description = 'game day monitoring'
    } else {
      // Regular day - check every 15 minutes
      intervalMs = 15 * 60 * 1000
      description = 'background monitoring'
    }
    
    console.log(`🧠 Starting smart polling: ${intervalMs / 1000}s intervals (${description})`)
    this.startPolling(intervalMs)
  }

  /**
   * Auto-start polling if there are active games or it's game day
   */
  async autoStartIfNeeded(): Promise<void> {
    if (this.isPolling) {
      return // Already running
    }

    const isGameDay = this.isGameDay()
    const { hasActive } = await this.hasActiveGames()

    if (hasActive || isGameDay) {
      console.log(`🚀 Auto-starting live updates (Active games: ${hasActive}, Game day: ${isGameDay})`)
      await this.startSmartPolling()
    } else {
      console.log('⏳ No auto-start needed - no active games and not game day')
    }
  }

  /**
   * Check if auto-start conditions are met
   */
  async shouldAutoStart(): Promise<{ should: boolean; reason: string }> {
    const isGameDay = this.isGameDay()
    const { hasActive, activeCount } = await this.hasActiveGames()

    if (hasActive) {
      return { should: true, reason: `${activeCount} games in progress` }
    }
    
    if (isGameDay) {
      return { should: true, reason: 'Game day (Saturday)' }
    }

    return { should: false, reason: 'No active games, not game day' }
  }

  /**
   * Mark that leaderboards have been refreshed (clear refresh flag)
   */
  acknowledgeLeaderboardRefresh(): void {
    this.status.shouldRefreshLeaderboard = false
  }

  /**
   * Check if leaderboard should be refreshed due to recent updates
   */
  shouldRefreshLeaderboard(): boolean {
    return this.status.shouldRefreshLeaderboard === true
  }
}

// Export singleton instance for global use
export const liveUpdateService = LiveUpdateService.getInstance()