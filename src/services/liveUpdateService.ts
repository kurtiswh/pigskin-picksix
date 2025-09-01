/**
 * Live Update Service
 * 
 * Unified service for automatically updating games, processing picks,
 * and maintaining real-time leaderboards during game days.
 */

import { supabase } from '@/lib/supabase'
import { getCompletedGames, updateGameScores } from './collegeFootballApi'
import { updateGameInDatabase, processCompletedGames } from './scoreCalculation'
import { ENV } from '@/lib/env'

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
   * @param intervalMs - Polling interval in milliseconds (default: 10 minutes)
   */
  startPolling(intervalMs: number = 10 * 60 * 1000): void {
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
      
      // Filter out already completed games from database to avoid unnecessary processing
      const nonCompletedGames = currentGames.filter(g => g.status !== 'completed')
      console.log(`📊 Found ${nonCompletedGames.length} non-completed games to check (skipping ${currentGames.length - nonCompletedGames.length} completed)`)
      
      if (nonCompletedGames.length === 0) {
        console.log('✅ All games already completed - no updates needed')
        return {
          success: true,
          gamesUpdated: 0,
          picksProcessed: 0,
          errors: [],
          lastUpdate: new Date()
        }
      }
      
      // Optimized approach: Only fetch CFBD games for non-completed database games
      console.log(`🎯 Fetching CFBD games for ${nonCompletedGames.length} non-completed database games...`)
      
      let updatedApiGames
      try {
        // Get all CFBD scoreboard games (we still need all to match by team names)
        const response = await fetch(
          `https://api.collegefootballdata.com/scoreboard?year=${season}&week=${week}&classification=fbs`,
          {
            headers: {
              'Authorization': `Bearer ${ENV.CFBD_API_KEY}`
            }
          }
        )
        
        if (!response.ok) {
          throw new Error(`CFBD API error: ${response.status}`)
        }
        
        const scoreboardData = await response.json()
        console.log(`📊 CFBD API returned ${scoreboardData.length} total games`)
        
        // Convert ALL games to our format with timing validation
        updatedApiGames = scoreboardData.map(game => {
          // Enhanced status determination with timing validation
          let gameStatus: string
          
          // Get the game's scheduled start time and current time
          const gameStartTime = new Date(game.startDate)
          const currentTime = new Date()
          const isGameInFuture = gameStartTime.getTime() > currentTime.getTime()
          
          if (game.status === 'completed' || game.status === 'final') {
            // CRITICAL FIX: Never mark future games as completed
            if (isGameInFuture) {
              console.warn(`🚨 API reports game as ${game.status} but it's scheduled for the future: ${game.awayTeam.name} @ ${game.homeTeam.name} at ${gameStartTime.toLocaleString()}`)
              gameStatus = 'scheduled'
            } else {
              gameStatus = 'completed'
            }
          } else if (game.status === 'in_progress') {
            // In-progress games should also not be in the future
            if (isGameInFuture) {
              console.warn(`🚨 API reports game as in_progress but it's scheduled for the future: ${game.awayTeam.name} @ ${game.homeTeam.name} at ${gameStartTime.toLocaleString()}`)
              gameStatus = 'scheduled'
            } else {
              gameStatus = 'in_progress'
            }
          } else {
            gameStatus = 'scheduled'
          }
          
          const isCompleted = gameStatus === 'completed'
          
          // Simple logging for status changes
          if (gameStatus === 'in_progress') {
            console.log(`🏈 Live game: ${game.awayTeam.name} @ ${game.homeTeam.name} - ${game.awayTeam.points || 0}-${game.homeTeam.points || 0}`)
          } else if (gameStatus === 'completed') {
            console.log(`✅ Completed game: ${game.awayTeam.name} @ ${game.homeTeam.name} - ${game.awayTeam.points || 0}-${game.homeTeam.points || 0}`)
          }
          
          return {
            id: game.id,
            home_team: game.homeTeam.name,
            away_team: game.awayTeam.name,
            home_points: game.homeTeam.points || 0,
            away_points: game.awayTeam.points || 0,
            completed: isCompleted,
            status: gameStatus,
            period: game.period,
            clock: game.clock,
            spread: game.betting?.spread || 0
          }
        })
        
        // Log summary of API games by status
        const statusCounts = updatedApiGames.reduce((acc, game) => {
          acc[game.status] = (acc[game.status] || 0) + 1
          return acc
        }, {} as Record<string, number>)
        
        console.log(`📊 API game status breakdown:`)
        Object.entries(statusCounts).forEach(([status, count]) => {
          console.log(`   ${status}: ${count} games`)
        })
        
        // Log details for non-scheduled games
        updatedApiGames.filter(g => g.status !== 'scheduled').forEach(apiGame => {
          const liveInfo = apiGame.period && apiGame.clock ? ` - Q${apiGame.period} ${apiGame.clock}` : ''
          const scoreInfo = ` (${apiGame.away_points}-${apiGame.home_points})`
          const statusEmoji = apiGame.status === 'completed' ? '✅' : '🔴'
          console.log(`   ${statusEmoji} ${apiGame.away_team} @ ${apiGame.home_team}${scoreInfo}${liveInfo}`)
        })
        
      } catch (apiError: any) {
        console.error('❌ CFBD API fetch failed:', apiError.message)
        errors.push(`API fetch failed: ${apiError.message}`)
        updatedApiGames = []
      }

      // Step 3: Update games in database that have changed
      const newlyCompletedGames: string[] = []
      
      console.log(`🔄 Attempting to match ${updatedApiGames.length} API games with database games`)

      for (const apiGame of updatedApiGames) {
        console.log(`\n🎯 Processing API game: ${apiGame.away_team} @ ${apiGame.home_team} (ID: ${apiGame.id})`)
        console.log(`   API Status: ${apiGame.status}, Completed: ${apiGame.completed}`)
        console.log(`   API Scores: ${apiGame.away_points}-${apiGame.home_points}`)
        console.log(`   API Period/Clock: Q${apiGame.period} ${apiGame.clock}`)
        
        // Only match against non-completed database games
        let dbGame = nonCompletedGames.find(g => {
          // Exact match first
          if (g.home_team.toLowerCase() === apiGame.home_team.toLowerCase() &&
              g.away_team.toLowerCase() === apiGame.away_team.toLowerCase()) {
            return true
          }
          
          // Flexible matching: check if main team names are contained
          const normalizeTeamName = (name) => name.toLowerCase().replace(/\s+(tigers|bulldogs|eagles|bears|wildcats|rams|lions|panthers|hawks)\s*$/, '').trim()
          const dbHome = normalizeTeamName(g.home_team)
          const dbAway = normalizeTeamName(g.away_team)
          const apiHome = normalizeTeamName(apiGame.home_team)
          const apiAway = normalizeTeamName(apiGame.away_team)
          
          // Check if core team names match (handle cases like "Georgia Tech" vs "Georgia Tech Yellow Jackets")
          return (dbHome.includes(apiHome.split(' ')[0]) || apiHome.includes(dbHome.split(' ')[0])) &&
                 (dbAway.includes(apiAway.split(' ')[0]) || apiAway.includes(dbAway.split(' ')[0]))
        })
        
        if (!dbGame) {
          console.log(`❌ No database game found matching ${apiGame.away_team} @ ${apiGame.home_team}`)
          console.log(`   This game is not in our Week ${week} selection`)
          continue
        }
        
        console.log(`✅ Found matching database game: ${dbGame.away_team} @ ${dbGame.home_team}`)
        console.log(`   DB Status: ${dbGame.status}, DB Scores: ${dbGame.away_score}-${dbGame.home_score}`)
        console.log(`   DB Winner ATS: ${dbGame.winner_against_spread || 'Not set'}`)

        // Check if this is a newly completed game
        const wasCompleted = dbGame.status === 'completed'
        const isNowCompleted = apiGame.completed
        
        // IMPORTANT: Never allow status changes FROM completed status
        // This prevents API errors from corrupting final game results
        if (wasCompleted) {
          console.log(`⚠️  SKIPPING STATUS UPDATE: Game already completed - ${dbGame.away_team} @ ${dbGame.home_team}`)
          console.log(`   Database shows 'completed', API shows '${apiGame.status}' - keeping completed status`)
          continue // Skip processing this game entirely
        }
        
        if (!wasCompleted && isNowCompleted) {
          console.log(`🎉 GAME COMPLETION DETECTED: ${dbGame.away_team} @ ${dbGame.home_team}`)
          console.log(`   Will update status from '${dbGame.status}' to 'completed'`)
        }

        // Enhanced status validation using database game's kickoff time
        // This prevents future games from being marked as completed even if API is wrong
        let finalStatus = apiGame.status
        
        // Additional safety check: Validate against database kickoff time
        if (dbGame.kickoff_time) {
          const kickoffTime = new Date(dbGame.kickoff_time)
          const currentTime = new Date()
          const isGameInFuture = kickoffTime.getTime() > currentTime.getTime()
          
          if (isGameInFuture && (finalStatus === 'completed' || finalStatus === 'in_progress')) {
            console.warn(`🚨 SAFETY CHECK: Preventing future game from being marked as ${finalStatus}`)
            console.warn(`   Game: ${dbGame.away_team} @ ${dbGame.home_team}`)
            console.warn(`   Kickoff: ${kickoffTime.toLocaleString()}`)
            console.warn(`   Current: ${currentTime.toLocaleString()}`)
            console.warn(`   Forcing status to 'scheduled'`)
            finalStatus = 'scheduled'
          }
        }
        
        // Use API timing data directly
        const finalPeriod = apiGame.period
        const finalClock = apiGame.clock
        
        const hasChanges = 
          dbGame.home_score !== apiGame.home_points ||
          dbGame.away_score !== apiGame.away_points ||
          dbGame.status !== finalStatus ||
          dbGame.game_period !== finalPeriod ||
          dbGame.game_clock !== finalClock

        if (hasChanges) {
          console.log(`🔄 Updating game: ${dbGame.away_team} @ ${dbGame.home_team}`)
          console.log(`   Scores: ${apiGame.away_points}-${apiGame.home_points}`)
          console.log(`   Status: ${finalStatus}`)
          if (finalPeriod && finalClock) {
            console.log(`   Timing: Q${finalPeriod} ${finalClock}`)
          }
          
          try {
            const updateStartTime = Date.now()
            
            await updateGameInDatabase({
              game_id: dbGame.id,
              home_score: apiGame.home_points || 0,
              away_score: apiGame.away_points || 0,
              home_team: apiGame.home_team,
              away_team: apiGame.away_team,
              spread: apiGame.spread || dbGame.spread,
              status: finalStatus,
              // Use calculated timing data (with defaults for newly started games)
              game_period: finalPeriod,
              game_clock: finalClock,
              // Keep API data separate for debugging
              api_period: apiGame.period,
              api_clock: apiGame.clock,
              api_home_points: apiGame.home_points,
              api_away_points: apiGame.away_points,
              api_completed: apiGame.completed
            })

            const updateDuration = Date.now() - updateStartTime
            console.log(`   ✅ Update successful in ${updateDuration}ms`)
            
            gamesUpdated++

            // Track newly completed games for pick processing
            if (!wasCompleted && isNowCompleted) {
              newlyCompletedGames.push(dbGame.id)
              console.log(`   🎯 Added to completed games list - trigger will handle scoring`)
            }

          } catch (updateError: any) {
            console.error(`   ❌ Update failed: ${updateError.message}`)
            if (updateError.message.includes('timeout')) {
              console.error(`   🚨 DATABASE TIMEOUT - Check triggers and database load`)
            }
            errors.push(`Game update failed for ${dbGame.id}: ${updateError.message}`)
          }
        }
      }

      // Step 4: Skip pick processing - completion-only trigger handles this
      if (newlyCompletedGames.length > 0) {
        console.log(`✅ ${newlyCompletedGames.length} games completed - scoring handled by completion-only trigger`)
        // Note: Pick processing now handled by completion-only trigger (Migration 093)
        // This eliminates race condition between status update and pick calculation
        picksProcessed = 0 // Trigger handles this, no direct processing needed
      }

      // Step 5: Skip additional pick processing - completion-only trigger handles all scoring
      // Note: Removed competing pick processing logic to eliminate race conditions
      // All scoring is now handled by the completion-only trigger when games.status = 'completed'
      console.log('⚡ Pick scoring delegated to completion-only trigger - no race conditions')
      picksProcessed = 0 // All handled by trigger

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
   * Check if there are games approaching kickoff time that should trigger live updates
   */
  private async hasApproachingGames(): Promise<{ hasApproaching: boolean; approachingCount: number; nextKickoff: Date | null }> {
    try {
      const { data: activeWeek } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .single()

      if (!activeWeek) {
        return { hasApproaching: false, approachingCount: 0, nextKickoff: null }
      }

      const { data: games, error } = await supabase
        .from('games')
        .select('id, status, kickoff_time')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)
        .in('status', ['scheduled', 'in_progress']) // Include both scheduled and in_progress games

      if (error) {
        console.error('Error checking approaching games:', error)
        return { hasApproaching: false, approachingCount: 0, nextKickoff: null }
      }

      const now = new Date()
      const approachingGames = games?.filter(game => {
        const kickoffTime = new Date(game.kickoff_time)
        const minutesUntilKickoff = (kickoffTime.getTime() - now.getTime()) / (1000 * 60)
        const minutesSinceKickoff = (now.getTime() - kickoffTime.getTime()) / (1000 * 60)
        
        // Games are "approaching" if:
        // 1. Kickoff is within the next 30 minutes, OR
        // 2. Game started within the last 4 hours (could be live)
        return minutesUntilKickoff <= 30 || (minutesSinceKickoff >= 0 && minutesSinceKickoff <= 240)
      }) || []

      const nextKickoff = games && games.length > 0 
        ? games
            .filter(g => g.status === 'scheduled')
            .map(g => new Date(g.kickoff_time))
            .filter(kickoff => kickoff.getTime() > now.getTime())
            .sort((a, b) => a.getTime() - b.getTime())[0] || null
        : null

      return { 
        hasApproaching: approachingGames.length > 0, 
        approachingCount: approachingGames.length,
        nextKickoff
      }

    } catch (error) {
      console.error('Error checking for approaching games:', error)
      return { hasApproaching: false, approachingCount: 0, nextKickoff: null }
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
   * Optimized for 5,000 API calls/month budget
   */
  async startSmartPolling(): Promise<void> {
    const isGameDay = this.isGameDay()
    const { hasActive, activeCount } = await this.hasActiveGames()
    const { hasApproaching, approachingCount, nextKickoff } = await this.hasApproachingGames()
    
    let intervalMs
    let description
    
    if (hasActive) {
      // Active games - update every 5 minutes for real-time updates
      // Budget: 12 calls/hour only when games are live
      intervalMs = 5 * 60 * 1000
      description = `${activeCount} active games (live updates)`
    } else if (hasApproaching) {
      // Approaching games - update every 10 minutes to catch kickoffs
      // Budget: 6 calls/hour when games are approaching
      intervalMs = 10 * 60 * 1000
      const nextKickoffText = nextKickoff 
        ? ` (next at ${nextKickoff.toLocaleTimeString()})` 
        : ''
      description = `${approachingCount} games approaching kickoff${nextKickoffText}`
    } else if (isGameDay) {
      // Game day but no active/approaching games - check every 30 minutes
      // Budget: 2 calls/hour on game days only
      intervalMs = 30 * 60 * 1000
      description = 'game day monitoring (waiting for games)'
    } else {
      // Regular day - NO AUTOMATIC POLLING (admin manual only)
      // Budget: 0 calls/hour on non-game days
      console.log('📴 No automatic polling on non-game days - manual updates only')
      return
    }
    
    console.log(`🧠 Starting smart polling: ${intervalMs / 1000}s intervals (${description})`)
    console.log(`📊 API Budget: ~${Math.round(60 / (intervalMs / (60 * 1000)))} calls/hour`)
    this.startPolling(intervalMs)
  }

  /**
   * Auto-start polling if there are active games, approaching games, or it's game day
   */
  async autoStartIfNeeded(): Promise<void> {
    if (this.isPolling) {
      return // Already running
    }

    const isGameDay = this.isGameDay()
    const { hasActive } = await this.hasActiveGames()
    const { hasApproaching, approachingCount, nextKickoff } = await this.hasApproachingGames()

    if (hasActive) {
      console.log(`🚀 Auto-starting live updates - ${hasActive} active games`)
      await this.startSmartPolling()
    } else if (hasApproaching) {
      const nextKickoffText = nextKickoff 
        ? ` (next at ${nextKickoff.toLocaleTimeString()})` 
        : ''
      console.log(`🚀 Auto-starting live updates - ${approachingCount} games approaching kickoff${nextKickoffText}`)
      await this.startSmartPolling()
    } else if (isGameDay) {
      console.log(`🚀 Auto-starting live updates - Game day (Saturday)`)
      await this.startSmartPolling()
    } else {
      console.log('⏳ No auto-start needed - no active/approaching games and not game day')
    }
  }

  /**
   * Check if auto-start conditions are met
   */
  async shouldAutoStart(): Promise<{ should: boolean; reason: string }> {
    const isGameDay = this.isGameDay()
    const { hasActive, activeCount } = await this.hasActiveGames()
    const { hasApproaching, approachingCount, nextKickoff } = await this.hasApproachingGames()

    if (hasActive) {
      return { should: true, reason: `${activeCount} games in progress` }
    }
    
    if (hasApproaching) {
      const nextKickoffText = nextKickoff 
        ? ` (next kickoff: ${nextKickoff.toLocaleTimeString()})` 
        : ''
      return { should: true, reason: `${approachingCount} games approaching kickoff${nextKickoffText}` }
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