/**
 * Live Update Service
 * 
 * Unified service for automatically updating games, processing picks,
 * and maintaining real-time leaderboards during game days.
 */

import { supabase } from '@/lib/supabase'
import { getCompletedGames, updateGameScores } from './collegeFootballApi'
import { updateGameInDatabase, processCompletedGames } from './scoreCalculation'
import { CFBDLiveUpdater } from './cfbdLiveUpdater'
import { ENV } from '@/lib/env'

export interface LiveUpdateResult {
  success: boolean
  gamesUpdated: number
  picksProcessed: number
  errors: string[]
  lastUpdate: Date
}

export interface PickProcessingResult {
  success: boolean
  gamesChecked: number
  gamesChanged: number
  picksProcessed: number
  leaderboardsRefreshed: boolean
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
  lastPickProcessing?: PickProcessingResult
  pickProcessingInterval?: number
}

/**
 * Main Live Update Service Class
 * Handles automatic polling and updating of games and picks
 */
export class LiveUpdateService {
  private static instance: LiveUpdateService
  private pollingInterval: NodeJS.Timeout | null = null
  private pickProcessingInterval: NodeJS.Timeout | null = null
  private isPolling = false
  private isPickProcessingActive = false
  private gameHashCache = new Map<string, string>() // game_id -> hash of relevant fields
  private status: LiveUpdateStatus = {
    isRunning: false,
    lastUpdate: null,
    nextUpdate: null,
    errors: [],
    totalUpdates: 0,
    lastResult: undefined,
    shouldRefreshLeaderboard: false,
    lastPickProcessing: undefined,
    pickProcessingInterval: 2 * 60 * 1000 // Default 2 minutes
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
    
    // Also stop pick processing when stopping polling
    this.stopScheduledPickProcessing()
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
   * Unified update process - uses CFBD Live Updater for real-time data
   */
  private async updateGamesAndPicks(season: number, week: number): Promise<LiveUpdateResult> {
    const startTime = Date.now()
    let gamesUpdated = 0
    let picksProcessed = 0
    const errors: string[] = []

    try {
      console.log(`🎯 Starting CFBD live update for ${season} week ${week}`)

      // Use the new CFBD Live Updater for real-time data
      const cfbdResult = await CFBDLiveUpdater.updateLiveGames()
      
      if (!cfbdResult.success) {
        errors.push(...cfbdResult.errors)
        console.error('❌ CFBD update failed:', cfbdResult.errors)
      }

      gamesUpdated = cfbdResult.gamesUpdated
      console.log(`📊 CFBD updater: ${cfbdResult.gamesChecked} checked, ${cfbdResult.gamesUpdated} updated, ${cfbdResult.newlyCompleted} completed`)

      // If no games found or all completed, return early
      if (cfbdResult.gamesChecked === 0) {
        console.log('No games found for this week')
        return {
          success: true,
          gamesUpdated: 0,
          picksProcessed: 0,
          errors: [],
          lastUpdate: new Date()
        }
      }

      // Step 2: Process completed games (if any)
      picksProcessed = cfbdResult.newlyCompleted
      
      if (cfbdResult.newlyCompleted > 0) {
        console.log(`🎉 ${cfbdResult.newlyCompleted} games newly completed - picks can now be processed`)
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
      const { data: activeWeeks } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })

      if (!activeWeeks || activeWeeks.length === 0) {
        return { hasActive: false, activeCount: 0 }
      }

      // Use the latest active week
      const activeWeek = activeWeeks[0]

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
   * Check if all scheduled games for the current week are completed
   */
  private async areAllGamesCompleted(): Promise<{ allCompleted: boolean; completedCount: number; totalCount: number }> {
    try {
      const { data: activeWeeks } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })

      if (!activeWeeks || activeWeeks.length === 0) {
        return { allCompleted: true, completedCount: 0, totalCount: 0 }
      }

      // Use the latest active week
      const activeWeek = activeWeeks[0]

      const { data: games, error } = await supabase
        .from('games')
        .select('id, status')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)

      if (error || !games) {
        console.error('Error checking game completion status:', error)
        return { allCompleted: false, completedCount: 0, totalCount: 0 }
      }

      const totalCount = games.length
      const completedCount = games.filter(game => game.status === 'completed').length
      const allCompleted = totalCount > 0 && completedCount === totalCount

      return { allCompleted, completedCount, totalCount }

    } catch (error) {
      console.error('Error checking for completed games:', error)
      return { allCompleted: false, completedCount: 0, totalCount: 0 }
    }
  }

  /**
   * Check if there are games approaching kickoff time that should trigger live updates
   */
  private async hasApproachingGames(): Promise<{ hasApproaching: boolean; approachingCount: number; nextKickoff: Date | null }> {
    try {
      const { data: activeWeeks } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })

      if (!activeWeeks || activeWeeks.length === 0) {
        return { hasApproaching: false, approachingCount: 0, nextKickoff: null }
      }

      // Use the latest active week
      const activeWeek = activeWeeks[0]

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
      // Check if we're still in the polling window
      const isInWindow = this.isInPollingWindow()
      if (!isInWindow) {
        console.log('⏰ Exited polling window (Thursday 6pm - Sunday 8am Central) - automatically stopping live updates')
        this.stopPolling()
        return
      }

      // Get current active weeks from database - there might be multiple
      const { data: activeWeeks, error } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false }) // Get the latest week first

      if (error || !activeWeeks || activeWeeks.length === 0) {
        console.log('⏳ No active weeks found for live updates')
        return
      }

      // Use the latest active week (highest week number)
      const activeWeek = activeWeeks[0]
      console.log(`🎯 Using Week ${activeWeek.week} as active week (${activeWeeks.length} active weeks total)`)
      
      if (activeWeeks.length > 1) {
        console.log(`⚠️ Multiple active weeks detected: ${activeWeeks.map(w => w.week).join(', ')} - using Week ${activeWeek.week}`)
      }

      // Check if all games are completed before proceeding
      const { allCompleted, completedCount, totalCount } = await this.areAllGamesCompleted()
      if (allCompleted && totalCount > 0) {
        console.log(`🏁 All ${totalCount} games completed - automatically stopping live updates`)
        this.stopPolling()
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

      // Check again after update if all games are now completed
      const { allCompleted: nowAllCompleted, completedCount: nowCompleted, totalCount: nowTotal } = await this.areAllGamesCompleted()
      if (nowAllCompleted && nowTotal > 0) {
        console.log(`🏁 All ${nowTotal} games now completed after update - automatically stopping live updates`)
        this.stopPolling()
        return
      }

      // Set next update time
      if (this.isPolling && this.pollingInterval) {
        const intervalMs = 5 * 60 * 1000 // 5 minutes default
        this.status.nextUpdate = new Date(Date.now() + intervalMs)
      }

      console.log(`🔄 Auto-update completed: ${result.gamesUpdated} games, ${result.picksProcessed} picks (${nowCompleted}/${nowTotal} completed)`)

    } catch (error: any) {
      console.error('❌ Auto-update failed:', error)
      this.status.errors.push(`Auto-update failed: ${error.message}`)
      this.status.errors = this.status.errors.slice(-10) // Keep last 10 errors
    }
  }

  /**
   * Check if there are games scheduled today that warrant monitoring
   */
  private async isGameDay(): Promise<boolean> {
    try {
      const { data: activeWeeks } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })

      if (!activeWeeks || activeWeeks.length === 0) {
        return false
      }

      // Use the latest active week
      const activeWeek = activeWeeks[0]

      const { data: games, error } = await supabase
        .from('games')
        .select('id, kickoff_time, status')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)
        .in('status', ['scheduled', 'in_progress'])

      if (error || !games) {
        return false
      }

      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

      // Check if any games are scheduled for today
      return games.some(game => {
        const kickoffTime = new Date(game.kickoff_time)
        return kickoffTime >= today && kickoffTime < tomorrow
      })
    } catch (error) {
      console.error('Error checking for scheduled games:', error)
      return false
    }
  }

  /**
   * Check if we're currently in the autopolling window (Thursday 6pm - Sunday 8am Central)
   */
  private isInPollingWindow(): boolean {
    // Get current time in Central Time (America/Chicago)
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    
    const day = centralTime.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = centralTime.getHours()
    const minute = centralTime.getMinutes()
    const timeInMinutes = hour * 60 + minute

    // Define polling window: Thursday 6pm - Sunday 8am Central
    if (day === 4) { // Thursday
      // Thursday 6:00 PM onwards (18:00)
      return timeInMinutes >= 18 * 60 // 6pm = 1080 minutes
    } else if (day === 5 || day === 6) { // Friday or Saturday
      // All day Friday and Saturday
      return true
    } else if (day === 0) { // Sunday
      // Sunday until 8:00 AM (08:00)
      return timeInMinutes < 8 * 60 // 8am = 480 minutes
    }
    
    return false // Monday, Tuesday, Wednesday, or Sunday after 8am
  }

  /**
   * Smart polling that adjusts frequency based on game day and active games
   * Optimized for 5,000 API calls/month budget
   */
  async startSmartPolling(): Promise<void> {
    const isGameDay = await this.isGameDay()
    const isInWindow = this.isInPollingWindow()
    const { hasActive, activeCount } = await this.hasActiveGames()
    const { hasApproaching, approachingCount, nextKickoff } = await this.hasApproachingGames()
    
    // First check: Are we in the polling window (Thursday 6pm - Sunday 8am Central)?
    if (!isInWindow) {
      console.log('📴 Outside polling window (Thursday 6pm - Sunday 8am Central) - no automatic polling')
      return
    }
    
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
      // In polling window but no games today - check every 30 minutes to catch new games
      // This covers the Thursday 6pm - Sunday 8am window even when no games are scheduled today
      intervalMs = 30 * 60 * 1000
      description = 'polling window monitoring (Thursday 6pm - Sunday 8am Central)'
    }
    
    console.log(`🧠 Starting smart polling: ${intervalMs / 1000}s intervals (${description})`)
    console.log(`📊 API Budget: ~${Math.round(60 / (intervalMs / (60 * 1000)))} calls/hour`)
    console.log(`⏰ Polling window active: Thursday 6pm - Sunday 8am Central`)
    this.startPolling(intervalMs)
    
    // ALSO start scheduled pick processing (independent of API polling)
    const pickProcessingInterval = isGameDay || isInWindow ? 2 * 60 * 1000 : 5 * 60 * 1000 // 2min during polling window, 5min otherwise
    console.log(`🕐 Starting scheduled pick processing: ${pickProcessingInterval / 1000}s intervals`)
    this.startScheduledPickProcessing(pickProcessingInterval)
  }

  /**
   * Auto-start polling if there are active games, approaching games, it's game day, or we're in polling window
   */
  async autoStartIfNeeded(): Promise<void> {
    if (this.isPolling) {
      return // Already running
    }

    const isGameDay = await this.isGameDay()
    const isInWindow = this.isInPollingWindow()
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
      console.log(`🚀 Auto-starting live updates - Game day (games scheduled today)`)
      await this.startSmartPolling()
    } else if (isInWindow) {
      console.log(`🚀 Auto-starting live updates - In polling window (Thursday 6pm - Sunday 8am Central)`)
      await this.startSmartPolling()
    } else {
      console.log('⏳ No auto-start needed - outside polling window and no active/approaching games')
    }
  }

  /**
   * Check if auto-start conditions are met
   */
  async shouldAutoStart(): Promise<{ should: boolean; reason: string }> {
    const isGameDay = await this.isGameDay()
    const isInWindow = this.isInPollingWindow()
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
      return { should: true, reason: 'Games scheduled today' }
    }
    
    if (isInWindow) {
      return { should: true, reason: 'In polling window (Thursday 6pm - Sunday 8am Central)' }
    }

    return { should: false, reason: 'Outside polling window and no active/approaching games' }
  }

  /**
   * Mark that leaderboards have been refreshed (clear refresh flag)
   */
  acknowledgeLeaderboardRefresh(): void {
    this.status.shouldRefreshLeaderboard = false
  }

  /**
   * Test and debug the polling window logic
   */
  testPollingWindow(): void {
    const now = new Date()
    const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
    const isInWindow = this.isInPollingWindow()
    
    const day = centralTime.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hour = centralTime.getHours()
    const minute = centralTime.getMinutes()
    const timeInMinutes = hour * 60 + minute
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    console.log('🕐 POLLING WINDOW TEST:')
    console.log(`   Current time: ${centralTime.toLocaleString()} Central`)
    console.log(`   Day: ${dayNames[day]} (${day})`)
    console.log(`   Hour: ${hour}, Minute: ${minute} (${timeInMinutes} minutes from midnight)`)
    console.log(`   Is in polling window: ${isInWindow ? '✅ YES' : '❌ NO'}`)
    console.log('')
    console.log('📅 Polling window definition:')
    console.log('   Thursday 6:00 PM - Sunday 8:00 AM Central')
    console.log('   - Thursday: 18:00+ (1080+ minutes)')
    console.log('   - Friday: All day (0-1439 minutes)')
    console.log('   - Saturday: All day (0-1439 minutes)')
    console.log('   - Sunday: 00:00-07:59 (0-479 minutes)')
    console.log('')
    
    if (isInWindow) {
      console.log('🚀 Should auto-start polling!')
    } else {
      console.log('⏹️ Should NOT auto-start polling.')
    }
  }

  /**
   * Clear cached week data when week changes to prevent stale data
   */
  clearWeekCache(): void {
    console.log('🧹 Clearing week cache for fresh data')
    this.gameHashCache.clear()
    // Reset status flags that might be week-specific
    this.status.shouldRefreshLeaderboard = false
    this.status.lastPickProcessing = undefined
  }

  /**
   * TESTING METHOD: Manually complete a stuck game
   * This bypasses the API and forces game completion for testing
   */
  async manualCompleteGame(gameId: string): Promise<void> {
    console.log(`🧪 MANUAL GAME COMPLETION TEST: ${gameId}`)
    
    try {
      // Get current game data
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()
      
      if (gameError || !game) {
        throw new Error(`Game not found: ${gameError?.message}`)
      }
      
      console.log(`   Current game: ${game.away_team} @ ${game.home_team}`)
      console.log(`   Status: ${game.status}, Scores: ${game.away_score}-${game.home_score}`)
      
      // Force completion if game has scores but isn't completed
      if (game.home_score !== null && game.away_score !== null && game.status !== 'completed') {
        console.log(`   🎯 Forcing game completion...`)
        
        await this.processCompleteGameUpdate({
          gameId: game.id,
          homeScore: game.home_score,
          awayScore: game.away_score,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          spread: game.spread || 0,
          status: 'completed',
          gamePeriod: game.game_period,
          gameClock: game.game_clock,
          apiPeriod: game.api_period,
          apiClock: game.api_clock,
          apiHomePoints: game.api_home_points,
          apiAwayPoints: game.api_away_points,
          apiCompleted: true
        })
        
        console.log(`   ✅ Manual completion successful!`)
      } else {
        console.log(`   ℹ️ Game already completed or missing scores`)
      }
      
    } catch (error: any) {
      console.error(`   ❌ Manual completion failed:`, error.message)
      throw error
    }
  }

  /**
   * Check if leaderboard should be refreshed due to recent updates
   */
  shouldRefreshLeaderboard(): boolean {
    return this.status.shouldRefreshLeaderboard === true
  }

  /**
   * Start scheduled pick processing that runs independently of game status changes
   * Monitors game table changes and processes picks only when games change
   */
  startScheduledPickProcessing(intervalMs: number = 2 * 60 * 1000): void {
    if (this.isPickProcessingActive) {
      console.log('🔄 Scheduled pick processing already running')
      return
    }

    console.log(`🕐 Starting scheduled pick processing every ${intervalMs / 1000} seconds`)
    this.isPickProcessingActive = true
    this.status.pickProcessingInterval = intervalMs

    // Run initial processing
    this.runScheduledPickProcessing()

    // Set up recurring processing
    this.pickProcessingInterval = setInterval(() => {
      this.runScheduledPickProcessing()
    }, intervalMs)
  }

  /**
   * Stop scheduled pick processing
   */
  stopScheduledPickProcessing(): void {
    if (!this.isPickProcessingActive) {
      console.log('⏹️ Scheduled pick processing not currently running')
      return
    }

    console.log('⏹️ Stopping scheduled pick processing')
    
    if (this.pickProcessingInterval) {
      clearInterval(this.pickProcessingInterval)
      this.pickProcessingInterval = null
    }

    this.isPickProcessingActive = false
  }

  /**
   * Main scheduled pick processing - only processes games that have changed
   */
  private async runScheduledPickProcessing(): Promise<void> {
    const startTime = Date.now()
    
    try {
      const result = await this.processGamesNeedingPickUpdates()
      this.status.lastPickProcessing = result
      
      if (result.gamesChanged > 0) {
        console.log(`⚡ Pick processing: ${result.gamesChanged} games processed, ${result.picksProcessed} picks updated`)
      } else {
        console.log(`✅ Pick processing: No games need processing`)
      }
      
    } catch (error: any) {
      console.error('❌ Scheduled pick processing failed:', error)
      this.status.lastPickProcessing = {
        success: false,
        gamesChecked: 0,
        gamesChanged: 0,
        picksProcessed: 0,
        leaderboardsRefreshed: false,
        errors: [error.message],
        lastUpdate: new Date()
      }
    }
  }

  /**
   * Process picks for games that need processing - both changed games and unprocessed games
   */
  async processGamesNeedingPickUpdates(): Promise<PickProcessingResult> {
    const startTime = Date.now()
    console.log('🔍 Checking for games needing pick processing...')
    
    let gamesChecked = 0
    let gamesChanged = 0
    let picksProcessed = 0
    let leaderboardsRefreshed = false
    const errors: string[] = []
    const processingDetails: Array<{
      gameId: string,
      teams: string,
      status: string,
      picksFound: number,
      picksProcessed: number,
      processingTime: number,
      reason: string
    }> = []

    try {
      // Get current active weeks
      const { data: activeWeeks } = await supabase
        .from('week_settings')
        .select('week, season')
        .eq('picks_open', true)
        .order('week', { ascending: false })

      if (!activeWeeks || activeWeeks.length === 0) {
        return {
          success: true,
          gamesChecked: 0,
          gamesChanged: 0,
          picksProcessed: 0,
          leaderboardsRefreshed: false,
          errors: ['No active week found'],
          lastUpdate: new Date()
        }
      }

      // Use the latest active week
      const activeWeek = activeWeeks[0]

      // Get all games for the active week
      const { data: currentGames, error: gamesError } = await supabase
        .from('games')
        .select('id, home_team, away_team, home_score, away_score, status, winner_against_spread, margin_bonus, updated_at')
        .eq('season', activeWeek.season)
        .eq('week', activeWeek.week)

      if (gamesError) {
        throw new Error(`Database error: ${gamesError.message}`)
      }

      if (!currentGames || currentGames.length === 0) {
        return {
          success: true,
          gamesChecked: 0,
          gamesChanged: 0,
          picksProcessed: 0,
          leaderboardsRefreshed: false,
          errors: [],
          lastUpdate: new Date()
        }
      }

      gamesChecked = currentGames.length
      console.log(`   📊 Checking ${gamesChecked} games for processing needs...`)

      // Find games that need processing - either changed OR have unprocessed picks
      const gamesToProcess: string[] = []
      
      for (const game of currentGames) {
        let needsProcessing = false
        let reason = ''
        
        // Check if game has changed since last check
        const currentHash = this.hashGameData(game)
        const cachedHash = this.gameHashCache.get(game.id)
        const hasChanged = cachedHash !== currentHash
        
        if (hasChanged) {
          needsProcessing = true
          reason = 'game data changed'
          this.gameHashCache.set(game.id, currentHash)
        }
        
        // Also check if game has scores but picks haven't been processed
        if (game.home_score !== null && game.away_score !== null) {
          // Check if there are picks that need processing for this game
          const { data: unprocessedPicks, error: picksError } = await supabase
            .from('picks')
            .select('id')
            .eq('game_id', game.id)
            .is('result', null)
            .limit(1)
          
          if (picksError) {
            console.warn(`   ⚠️ Error checking picks for ${game.away_team} @ ${game.home_team}: ${picksError.message}`)
          } else if (unprocessedPicks && unprocessedPicks.length > 0) {
            needsProcessing = true
            reason = hasChanged ? 'game changed + unprocessed picks' : 'unprocessed picks found'
          }
          
          // Also check anonymous picks
          if (!needsProcessing || reason === 'game data changed') {
            const { data: unprocessedAnonymous, error: anonError } = await supabase
              .from('anonymous_picks')
              .select('id')
              .eq('game_id', game.id)
              .is('result', null)
              .limit(1)
            
            if (anonError) {
              console.warn(`   ⚠️ Error checking anonymous picks for ${game.away_team} @ ${game.home_team}: ${anonError.message}`)
            } else if (unprocessedAnonymous && unprocessedAnonymous.length > 0) {
              needsProcessing = true
              reason = hasChanged ? 'game changed + unprocessed anonymous picks' : 'unprocessed anonymous picks found'
              console.log(`   🔍 Found ${unprocessedAnonymous.length} unprocessed anonymous picks`)
            }
          }
        }
        
        if (needsProcessing) {
          console.log(`   🎯 Game needs processing: ${game.away_team} @ ${game.home_team}`)
          console.log(`      Reason: ${reason}`)
          console.log(`      Status: ${game.status}, Scores: ${game.away_score}-${game.home_score}`)
          console.log(`      Winner ATS: ${game.winner_against_spread}, Margin Bonus: ${game.margin_bonus}`)
          gamesToProcess.push(game.id)
        } else {
          // Debug: log games that don't need processing 
          if (game.away_team === 'TCU' || game.home_team === 'TCU') {
            console.log(`   ⏭️ TCU game doesn't need processing: ${game.away_team} @ ${game.home_team}`)
            console.log(`      Status: ${game.status}, Scores: ${game.away_score}-${game.home_score}`)
            console.log(`      Hash changed: ${cachedHash !== currentHash}, Has unprocessed: checking...`)
          }
        }
      }

      gamesChanged = gamesToProcess.length

      if (gamesToProcess.length === 0) {
        console.log('   ✅ No games need processing')
        return {
          success: true,
          gamesChecked,
          gamesChanged: 0,
          picksProcessed: 0,
          leaderboardsRefreshed: false,
          errors: [],
          lastUpdate: new Date()
        }
      }

      console.log(`   🎯 Processing picks for ${gamesToProcess.length} games needing processing...`)

      // Process picks for each game that needs processing
      for (const gameId of gamesToProcess) {
        const gameStartTime = Date.now()
        let gameDetails = {
          gameId,
          teams: '',
          status: '',
          picksFound: 0,
          picksProcessed: 0,
          processingTime: 0,
          reason: ''
        }
        
        try {
          const game = currentGames.find(g => g.id === gameId)!
          gameDetails.teams = `${game.away_team} @ ${game.home_team}`
          gameDetails.status = game.status
          
          // Get total picks count for this game before processing
          const { data: totalPicks } = await supabase
            .from('picks')
            .select('id', { count: 'exact' })
            .eq('game_id', gameId)
            .is('result', null)
          
          const { data: totalAnonPicks } = await supabase
            .from('anonymous_picks')
            .select('id', { count: 'exact' })
            .eq('game_id', gameId)
            .is('result', null)
          
          gameDetails.picksFound = (totalPicks?.length || 0) + (totalAnonPicks?.length || 0)
          
          // Only process picks if game has scores
          if (game.home_score !== null && game.away_score !== null) {
            console.log(`      Processing: ${game.away_team} @ ${game.home_team} (${gameDetails.picksFound} unprocessed picks)`)
            
            // Check if game has changed since last check
            const currentHash = this.hashGameData(game)
            const cachedHash = this.gameHashCache.get(game.id)
            const hasChanged = cachedHash !== currentHash
            
            if (hasChanged) {
              gameDetails.reason = 'Game data changed'
            } else {
              gameDetails.reason = 'Unprocessed picks found'
            }
            
            console.log(`      🚀 Using batch processing (${gameDetails.reason})`)
            
            try {
              const directResult = await this.processPicksDirectlySimple(game)
              const totalProcessed = directResult.picksUpdated + directResult.anonPicksUpdated
              gameDetails.picksProcessed = totalProcessed
              
              console.log(`      ✅ Batch processing: ${directResult.picksUpdated} picks, ${directResult.anonPicksUpdated} anonymous picks`)
              console.log(`      📊 Processing efficiency: ${totalProcessed}/${gameDetails.picksFound} (${Math.round((totalProcessed / Math.max(gameDetails.picksFound, 1)) * 100)}%)`)
              
              picksProcessed += totalProcessed
            } catch (directError: any) {
              errors.push(`Failed to process ${game.away_team} @ ${game.home_team}: ${directError.message}`)
              console.error(`      ❌ Batch processing failed: ${directError.message}`)
              gameDetails.reason = `Error: ${directError.message}`
            }
          } else {
            console.log(`      ⏳ Skipping ${game.away_team} @ ${game.home_team} (no scores yet)`)
            gameDetails.reason = 'No scores available'
          }
          
        } catch (gameError: any) {
          const game = currentGames.find(g => g.id === gameId)!
          errors.push(`Failed to process picks for ${game.away_team} @ ${game.home_team}: ${gameError.message}`)
          console.error(`      ❌ ${gameError.message}`)
          gameDetails.reason = `Error: ${gameError.message}`
        }
        
        gameDetails.processingTime = Date.now() - gameStartTime
        processingDetails.push(gameDetails)
      }

      // Temporarily disable leaderboard refresh to avoid constraint violations
      if (picksProcessed > 0) {
        console.log(`   📈 Skipping leaderboard refresh to avoid constraint violations (${picksProcessed} picks processed)`)
        console.log(`   ℹ️  Leaderboards can be refreshed manually after all picks are processed`)
        leaderboardsRefreshed = false
      }

      const duration = Date.now() - startTime
      console.log(`✅ Pick processing complete: ${gamesChanged} games processed, ${picksProcessed} picks processed in ${duration}ms`)
      
      // Enhanced processing summary
      if (processingDetails.length > 0) {
        console.log(`\n📊 DETAILED PROCESSING SUMMARY:`)
        console.log(`   Total processing time: ${duration}ms`)
        console.log(`   Average game processing time: ${Math.round(duration / processingDetails.length)}ms`)
        
        const successfulGames = processingDetails.filter(d => d.picksProcessed > 0)
        const skippedGames = processingDetails.filter(d => d.reason.includes('No scores'))
        const errorGames = processingDetails.filter(d => d.reason.includes('Error'))
        
        console.log(`   Games with picks processed: ${successfulGames.length}`)
        console.log(`   Games skipped (no scores): ${skippedGames.length}`)
        console.log(`   Games with errors: ${errorGames.length}`)
        
        if (successfulGames.length > 0) {
          console.log(`\n   🎯 SUCCESSFULLY PROCESSED GAMES:`)
          successfulGames.forEach(game => {
            const efficiency = Math.round((game.picksProcessed / Math.max(game.picksFound, 1)) * 100)
            console.log(`     • ${game.teams}: ${game.picksProcessed}/${game.picksFound} picks (${efficiency}%) - ${game.processingTime}ms`)
          })
        }
        
        if (errorGames.length > 0) {
          console.log(`\n   ❌ GAMES WITH ERRORS:`)
          errorGames.forEach(game => {
            console.log(`     • ${game.teams}: ${game.reason}`)
          })
        }
        
        const totalPicksFound = processingDetails.reduce((sum, game) => sum + game.picksFound, 0)
        if (totalPicksFound > 0) {
          const overallEfficiency = Math.round((picksProcessed / totalPicksFound) * 100)
          console.log(`\n   📈 OVERALL EFFICIENCY: ${picksProcessed}/${totalPicksFound} picks processed (${overallEfficiency}%)`)
        }
        
        console.log(``) // Empty line for readability
      }

      return {
        success: errors.length === 0,
        gamesChecked,
        gamesChanged,
        picksProcessed,
        leaderboardsRefreshed,
        errors,
        lastUpdate: new Date()
      }

    } catch (error: any) {
      const duration = Date.now() - startTime
      console.error(`❌ Pick processing failed after ${duration}ms:`, error)
      
      return {
        success: false,
        gamesChecked,
        gamesChanged,
        picksProcessed,
        leaderboardsRefreshed,
        errors: [...errors, error.message],
        lastUpdate: new Date()
      }
    }
  }

  /**
   * Create hash of game data to detect changes
   */
  private hashGameData(game: any): string {
    // Hash based on fields that would affect pick processing
    const data = `${game.home_score || 'null'}-${game.away_score || 'null'}-${game.status}-${game.winner_against_spread || 'null'}-${game.margin_bonus || 0}-${game.updated_at}`
    return btoa(data) // Simple base64 hash for change detection
  }

  /**
   * Simplified direct pick processing - reliable fallback method
   */
  private async processPicksDirectlySimple(game: any): Promise<{
    picksUpdated: number
    anonPicksUpdated: number
  }> {
    console.log(`    🎯 Direct processing for: ${game.away_team} @ ${game.home_team}`)
    
    // Calculate winner and points directly in TypeScript
    const homeMargin = game.home_score - game.away_score
    const spread = game.spread || 0
    
    let winnerAgainstSpread: string
    let marginBonus = 0
    
    // Calculate winner against spread
    if (Math.abs(homeMargin + spread) < 0.5) {
      winnerAgainstSpread = 'push'
    } else if (homeMargin + spread > 0) {
      winnerAgainstSpread = game.home_team
      // Calculate margin bonus for home team win
      if ((homeMargin + spread) >= 29) marginBonus = 5
      else if ((homeMargin + spread) >= 20) marginBonus = 3
      else if ((homeMargin + spread) >= 11) marginBonus = 1
    } else {
      winnerAgainstSpread = game.away_team
      // Calculate margin bonus for away team win
      if (Math.abs(homeMargin + spread) >= 29) marginBonus = 5
      else if (Math.abs(homeMargin + spread) >= 20) marginBonus = 3
      else if (Math.abs(homeMargin + spread) >= 11) marginBonus = 1
    }

    console.log(`    📊 Calculated: winner=${winnerAgainstSpread}, bonus=${marginBonus}`)

    // Update game with calculated values first
    const { error: gameUpdateError } = await supabase
      .from('games')
      .update({
        winner_against_spread: winnerAgainstSpread,
        margin_bonus: marginBonus,
        base_points: 20
      })
      .eq('id', game.id)

    if (gameUpdateError) {
      throw new Error(`Game update failed: ${gameUpdateError.message}`)
    }

    let picksUpdated = 0
    let anonPicksUpdated = 0

    // Process regular picks in larger batches (increased from 5 to 25 for better performance)
    const BATCH_SIZE = 25
    let regularPicksOffset = 0
    let hasMoreRegularPicks = true

    while (hasMoreRegularPicks) {
      const { data: picks, error: getPicksError } = await supabase
        .from('picks')
        .select('id, selected_team, is_lock')
        .eq('game_id', game.id)
        .is('result', null)
        .range(regularPicksOffset, regularPicksOffset + BATCH_SIZE - 1)

      if (getPicksError || !picks || picks.length === 0) {
        hasMoreRegularPicks = false
        break
      }

      console.log(`    🔄 Processing batch: ${picks.length} regular picks (offset ${regularPicksOffset}-${regularPicksOffset + picks.length - 1})`)
      
      // Calculate updates for all picks in batch
      for (const pick of picks) {
        const result = winnerAgainstSpread === 'push' ? 'push' : 
                      pick.selected_team === winnerAgainstSpread ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

        const { error: updateError } = await supabase
          .from('picks')
          .update({ result, points_earned: points })
          .eq('id', pick.id)

        if (!updateError) {
          picksUpdated++
        } else {
          console.warn(`      ⚠️ Pick update failed for pick ${pick.id}: ${updateError.message}`)
        }
      }
      
      console.log(`    ✅ Batch ${Math.floor(regularPicksOffset / BATCH_SIZE) + 1} complete: ${picks.length} picks processed`)

      regularPicksOffset += BATCH_SIZE
      if (picks.length < BATCH_SIZE) {
        hasMoreRegularPicks = false
      }
    }

    // Process anonymous picks in small batches (5 at a time to avoid timeouts)
    let anonPicksOffset = 0
    let hasMoreAnonPicks = true

    while (hasMoreAnonPicks) {
      const { data: anonPicks, error: getAnonError } = await supabase
        .from('anonymous_picks')
        .select('id, selected_team, is_lock')
        .eq('game_id', game.id)
        .is('result', null)
        .range(anonPicksOffset, anonPicksOffset + BATCH_SIZE - 1)

      if (getAnonError || !anonPicks || anonPicks.length === 0) {
        hasMoreAnonPicks = false
        break
      }

      console.log(`    🔄 Processing batch: ${anonPicks.length} anonymous picks (offset ${anonPicksOffset}-${anonPicksOffset + anonPicks.length - 1})`)
      
      for (const pick of anonPicks) {
        const result = winnerAgainstSpread === 'push' ? 'push' : 
                      pick.selected_team === winnerAgainstSpread ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

        const { error: updateError } = await supabase
          .from('anonymous_picks')
          .update({ result, points_earned: points })
          .eq('id', pick.id)

        if (!updateError) {
          anonPicksUpdated++
        } else {
          console.warn(`      ⚠️ Anonymous pick update failed for pick ${pick.id}: ${updateError.message}`)
        }
      }
      
      console.log(`    ✅ Batch ${Math.floor(anonPicksOffset / BATCH_SIZE) + 1} complete: ${anonPicks.length} anonymous picks processed`)

      anonPicksOffset += BATCH_SIZE
      if (anonPicks.length < BATCH_SIZE) {
        hasMoreAnonPicks = false
      }
    }

    return { picksUpdated, anonPicksUpdated }
  }

  /**
   * Direct pick processing fallback - bypasses database functions for timeout resistance
   */
  private async processPicksDirectly(game: any): Promise<void> {
    // Calculate winner and points directly in TypeScript
    const homeMargin = game.home_score - game.away_score
    const spread = game.spread || 0
    
    let winnerAgainstSpread: string
    let marginBonus = 0
    
    // Calculate winner against spread
    if (Math.abs(homeMargin + spread) < 0.5) {
      winnerAgainstSpread = 'push'
    } else if (homeMargin + spread > 0) {
      winnerAgainstSpread = game.home_team
      // Calculate margin bonus for home team win
      if ((homeMargin + spread) >= 29) marginBonus = 5
      else if ((homeMargin + spread) >= 20) marginBonus = 3
      else if ((homeMargin + spread) >= 11) marginBonus = 1
    } else {
      winnerAgainstSpread = game.away_team
      // Calculate margin bonus for away team win
      if (Math.abs(homeMargin + spread) >= 29) marginBonus = 5
      else if (Math.abs(homeMargin + spread) >= 20) marginBonus = 3
      else if (Math.abs(homeMargin + spread) >= 11) marginBonus = 1
    }

    // Update game with calculated values
    await supabase
      .from('games')
      .update({
        winner_against_spread: winnerAgainstSpread,
        margin_bonus: marginBonus,
        base_points: 20
      })
      .eq('id', game.id)

    // Simplified direct updates - update picks in batches to avoid complex SQL
    // Get picks that need updating for this game
    const { data: picks, error: getPicksError } = await supabase
      .from('picks')
      .select('id, selected_team, is_lock')
      .eq('game_id', game.id)
      .is('result', null)

    if (!getPicksError && picks) {
      for (const pick of picks) {
        const result = winnerAgainstSpread === 'push' ? 'push' : 
                      pick.selected_team === winnerAgainstSpread ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

        await supabase
          .from('picks')
          .update({ result, points_earned: points, updated_at: new Date().toISOString() })
          .eq('id', pick.id)
      }
    }

    // Get anonymous picks that need updating
    const { data: anonPicks, error: getAnonError } = await supabase
      .from('anonymous_picks')
      .select('id, selected_team, is_lock')
      .eq('game_id', game.id)
      .is('result', null)

    if (!getAnonError && anonPicks) {
      for (const pick of anonPicks) {
        const result = winnerAgainstSpread === 'push' ? 'push' : 
                      pick.selected_team === winnerAgainstSpread ? 'win' : 'loss'
        
        const points = result === 'push' ? 10 :
                      result === 'win' ? (20 + marginBonus + (pick.is_lock ? marginBonus : 0)) : 0

        await supabase
          .from('anonymous_picks')
          .update({ result, points_earned: points })
          .eq('id', pick.id)
      }
    }
  }

  /**
   * Refresh both season and weekly leaderboards with error handling
   */
  private async refreshLeaderboards(season: number, week: number): Promise<void> {
    try {
      // Refresh season leaderboard
      console.log('   📈 Refreshing season leaderboard...')
      const { error: seasonError } = await supabase.rpc('refresh_season_leaderboard_sources')
      if (seasonError) {
        // Don't throw on unique constraint errors - just log them
        if (seasonError.message.includes('unique constraint') || seasonError.message.includes('duplicate key')) {
          console.warn(`   ⚠️ Season leaderboard unique constraint (expected): ${seasonError.message}`)
        } else {
          throw new Error(`Season leaderboard refresh failed: ${seasonError.message}`)
        }
      }

      // Refresh weekly leaderboards
      console.log('   📈 Refreshing weekly leaderboards...')
      const { error: weeklyError } = await supabase.rpc('refresh_all_weekly_leaderboard_sources', {
        target_season: season
      })
      if (weeklyError) {
        // Don't throw on unique constraint errors - just log them
        if (weeklyError.message.includes('unique constraint') || weeklyError.message.includes('duplicate key')) {
          console.warn(`   ⚠️ Weekly leaderboard unique constraint (expected): ${weeklyError.message}`)
        } else {
          throw new Error(`Weekly leaderboard refresh failed: ${weeklyError.message}`)
        }
      }
      
      console.log('   ✅ Leaderboard refresh completed')
    } catch (error: any) {
      // Log but don't fail the entire pick processing
      console.warn(`   ⚠️ Leaderboard refresh had issues: ${error.message}`)
      throw error
    }
  }

  /**
   * Time-based fallback processing for stuck games
   * Runs periodically to catch games that should be completed but got stuck
   */
  async processStuckGames(): Promise<{ processed: number; errors: string[] }> {
    console.log('🕐 Running time-based stuck game processing...')
    
    let processed = 0
    const errors: string[] = []
    
    try {
      // Find games that appear to be finished but are stuck in live/in_progress status
      const { data: stuckGames, error: queryError } = await supabase
        .from('games')
        .select('*')
        .in('status', ['in_progress', 'live']) // Games that should potentially be completed
        .not('home_score', 'is', null)
        .not('away_score', 'is', null)
        .gte('season', 2024) // Only current seasons
      
      if (queryError) {
        errors.push(`Query error: ${queryError.message}`)
        return { processed, errors }
      }
      
      if (!stuckGames || stuckGames.length === 0) {
        console.log('   ✅ No stuck games found')
        return { processed, errors }
      }
      
      console.log(`   📋 Found ${stuckGames.length} potentially stuck games`)
      
      // Check each game for completion criteria
      for (const game of stuckGames) {
        try {
          // Time-based completion logic:
          // 1. Game has been in progress for more than 6 hours
          // 2. Game shows final quarter with minimal time
          // 3. Game has scores but status hasn't updated
          
          const now = new Date()
          const kickoffTime = new Date(game.kickoff_time)
          const hoursElapsed = (now.getTime() - kickoffTime.getTime()) / (1000 * 60 * 60)
          
          const isFinalPeriod = game.game_period === 4 || game.game_period === null
          const isMinimalTime = !game.game_clock || 
            game.game_clock.includes('00:00') || 
            game.game_clock.includes('0:00') ||
            (game.game_clock.includes('0:') && parseInt(game.game_clock.split(':')[1]) < 2)
          
          const shouldComplete = (
            hoursElapsed > 6 || // More than 6 hours since kickoff
            (isFinalPeriod && isMinimalTime) || // Final quarter with minimal time
            (game.home_score > 0 && game.away_score >= 0 && hoursElapsed > 4) // Has scores + 4+ hours
          )
          
          if (shouldComplete) {
            console.log(`   🎯 Processing stuck game: ${game.away_team} @ ${game.home_team}`)
            console.log(`      Hours elapsed: ${hoursElapsed.toFixed(1)}, Period: ${game.game_period}, Clock: ${game.game_clock}`)
            
            await this.processCompleteGameUpdate({
              gameId: game.id,
              homeScore: game.home_score,
              awayScore: game.away_score,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              spread: game.spread || 0,
              status: 'completed',
              gamePeriod: game.game_period,
              gameClock: game.game_clock,
              apiPeriod: game.api_period,
              apiClock: game.api_clock,
              apiHomePoints: game.api_home_points,
              apiAwayPoints: game.api_away_points,
              apiCompleted: true
            })
            
            processed++
            console.log(`      ✅ Stuck game completed successfully`)
          } else {
            console.log(`   ⏳ Game not yet eligible for completion: ${game.away_team} @ ${game.home_team} (${hoursElapsed.toFixed(1)}h elapsed)`)
          }
          
        } catch (gameError: any) {
          const errorMsg = `Failed to process ${game.away_team} @ ${game.home_team}: ${gameError.message}`
          errors.push(errorMsg)
          console.error(`      ❌ ${errorMsg}`)
        }
      }
      
      console.log(`✅ Stuck game processing complete: ${processed} processed, ${errors.length} errors`)
      return { processed, errors }
      
    } catch (error: any) {
      errors.push(`Stuck game processing failed: ${error.message}`)
      console.error('❌ Stuck game processing failed:', error.message)
      return { processed, errors }
    }
  }

  /**
   * Process complete game update - handles ALL completion logic in single transaction
   * Replaces trigger-based approach to eliminate database deadlocks
   */
  private async processCompleteGameUpdate(params: {
    gameId: string
    homeScore: number
    awayScore: number
    homeTeam: string
    awayTeam: string
    spread: number
    status: string
    gamePeriod?: number
    gameClock?: string
    apiPeriod?: number
    apiClock?: string
    apiHomePoints?: number
    apiAwayPoints?: number
    apiCompleted?: boolean
  }): Promise<void> {
    const startTime = Date.now()
    
    console.log(`🎯 Processing complete game: ${params.awayTeam} @ ${params.homeTeam}`)
    console.log(`   Final Score: ${params.awayScore}-${params.homeScore} (spread: ${params.spread})`)
    
    try {
      // Step 1: Calculate winner and bonus using database function
      console.log(`   📊 Calculating winner against spread...`)
      const { data: winnerData, error: winnerError } = await supabase
        .rpc('calculate_game_winner_and_bonus', {
          game_id_param: params.gameId,
          home_score_param: params.homeScore,
          away_score_param: params.awayScore,
          spread_param: params.spread
        })
      
      if (winnerError) {
        throw new Error(`Winner calculation failed: ${winnerError.message}`)
      }
      
      if (!winnerData || winnerData.length === 0) {
        throw new Error('No winner calculation data returned')
      }
      
      const { winner_against_spread, margin_bonus, base_points } = winnerData[0]
      console.log(`   ✅ Winner: ${winner_against_spread}, Bonus: ${margin_bonus}, Base: ${base_points}`)
      
      // Step 2: Update game with all completion data in SINGLE transaction
      console.log(`   💾 Updating game status and scores...`)
      const { error: gameUpdateError } = await supabase
        .from('games')
        .update({
          home_score: params.homeScore,
          away_score: params.awayScore,
          status: 'completed',
          winner_against_spread,
          margin_bonus,
          base_points,
          game_period: params.gamePeriod,
          game_clock: params.gameClock,
          api_period: params.apiPeriod,
          api_clock: params.apiClock,
          api_home_points: params.apiHomePoints,
          api_away_points: params.apiAwayPoints,
          api_completed: params.apiCompleted,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.gameId)
      
      if (gameUpdateError) {
        throw new Error(`Game update failed: ${gameUpdateError.message}`)
      }
      
      console.log(`   ✅ Game updated successfully`)
      
      // Step 3: Process picks using database function
      console.log(`   🎯 Processing picks for completed game...`)
      const { data: pickData, error: pickError } = await supabase
        .rpc('process_picks_for_completed_game', {
          game_id_param: params.gameId
        })
      
      if (pickError) {
        console.warn(`   ⚠️ Pick processing failed: ${pickError.message}`)
        // Don't throw - game completion should succeed even if picks fail
      } else if (pickData && pickData.length > 0) {
        const { picks_updated, anonymous_picks_updated } = pickData[0]
        console.log(`   ✅ Picks processed: ${picks_updated} picks, ${anonymous_picks_updated} anonymous picks`)
      }
      
      const duration = Date.now() - startTime
      console.log(`   🎉 Game completion successful in ${duration}ms`)
      
    } catch (error: any) {
      const duration = Date.now() - startTime
      console.error(`   ❌ Game completion failed after ${duration}ms:`, error.message)
      throw error // Re-throw to be caught by caller
    }
  }
}

// Export singleton instance for global use
export const liveUpdateService = LiveUpdateService.getInstance()