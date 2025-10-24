import { supabase } from '@/lib/supabase'

export interface EmergencyWeeklyLeaderboardEntry {
  user_id: string
  display_name: string
  weekly_rank: number
  total_points: number
  weekly_record: string
  lock_record: string
  week: number
  wins?: number
  losses?: number
  pushes?: number
  lock_wins?: number
  lock_losses?: number
  pick_source?: 'authenticated' | 'anonymous' | 'mixed'
  payment_status?: 'Paid' | 'NotPaid' | 'Pending'
  is_verified?: boolean
}

export interface WeeklyPickDetail {
  game_id: string
  game_name: string  // "Team A @ Team B"
  selected_team: string
  is_lock: boolean
  result: 'win' | 'loss' | 'push' | null
  points_earned: number
  game_status: 'scheduled' | 'in_progress' | 'completed'
  kickoff_time: string
}

export interface UserWeeklyPicks {
  user_id: string
  display_name: string
  week: number
  season: number
  picks: WeeklyPickDetail[]
  total_points: number
  weekly_record: string
  lock_record: string
}

/**
 * Emergency Weekly Leaderboard Service - Works with any database structure
 * 
 * This service tries multiple approaches:
 * 1. TABLE approach (weekly_leaderboard table if populated)
 * 2. VIEW approach (weekly_leaderboard view if exists)
 * 3. Direct picks calculation (always works if picks table exists)
 * 4. Static fallback data
 */
export class EmergencyWeeklyLeaderboardService {
  private static readonly QUERY_TIMEOUT = 5000  // Reduced timeout for faster fallback

  /**
   * Create timeout promise for queries
   */
  private static createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Query timeout after ${ms}ms`)), ms)
    })
  }

  /**
   * Main entry point - tries all strategies
   */
  static async getWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    console.log('🚨 [WEEKLY EMERGENCY] Starting weekly leaderboard load for season', season, 'week', week)

    // Strategy 1: Try TABLE approach (assumes weekly_leaderboard table is populated)
    try {
      console.log('📊 [WEEKLY STRATEGY 1] Trying TABLE approach...')
      return await this.getTableWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 1] TABLE approach failed:', error.message)
    }

    // Strategy 2: Try VIEW approach (weekly_leaderboard as view)
    try {
      console.log('📊 [WEEKLY STRATEGY 2] Trying VIEW approach...')
      return await this.getViewWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 2] VIEW approach failed:', error.message)
    }

    // Strategy 3: Calculate from picks directly (always works if picks table exists)
    try {
      console.log('📊 [WEEKLY STRATEGY 3] Trying direct picks calculation...')
      return await this.getPicksWeeklyLeaderboard(season, week)
    } catch (error) {
      console.log('❌ [WEEKLY STRATEGY 3] Direct picks failed:', error.message)
    }

    // Strategy 4: Return static data to prevent total failure
    console.log('🚨 [WEEKLY EMERGENCY] All strategies failed, returning static data')
    return this.getStaticWeeklyLeaderboard(week)
  }

  /**
   * Strategy 1: Query weekly_leaderboard as TABLE (if populated)
   */
  private static async getTableWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    const query = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, weekly_rank, total_points, wins, losses, pushes, lock_wins, lock_losses, pick_source, is_verified')
      .eq('season', season)
      .eq('week', week)
      .or('is_verified.eq.true,pick_source.eq.anonymous,pick_source.eq.mixed')
      .order('weekly_rank', { ascending: true })
      
    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY TABLE query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No weekly TABLE data found')

    console.log('✅ [WEEKLY TABLE] Found', data.length, 'entries')
    return this.formatTableData(data, week)
  }

  /**
   * Strategy 2: Query weekly_leaderboard as VIEW (original schema)
   */
  private static async getViewWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    const query = supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, weekly_rank, total_points, wins, losses, pushes, lock_wins, lock_losses, pick_source')
      .eq('season', season)
      .eq('week', week)
      .order('weekly_rank', { ascending: true })
      
    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY VIEW query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No weekly VIEW data found')

    console.log('✅ [WEEKLY VIEW] Found', data.length, 'entries')
    return this.formatTableData(data, week)
  }

  /**
   * Strategy 3: Calculate weekly leaderboard from picks table directly
   */
  private static async getPicksWeeklyLeaderboard(season: number, week: number): Promise<EmergencyWeeklyLeaderboardEntry[]> {
    console.log('🔢 [WEEKLY PICKS] Computing weekly leaderboard from picks data...')
    
    // Query all picks for the specific week/season
    const query = supabase
      .from('picks')
      .select(`
        user_id,
        result,
        points_earned,
        is_lock,
        users!inner(display_name)
      `)
      .eq('season', season)
      .eq('week', week)
      .not('result', 'is', null) // Only picks with results

    const { data, error } = await Promise.race([
      query,
      this.createTimeout(this.QUERY_TIMEOUT)
    ])

    if (error) throw new Error(`WEEKLY PICKS query error: ${error.message}`)
    if (!data || data.length === 0) throw new Error('No picks data found for this week')

    console.log('✅ [WEEKLY PICKS] Found', data.length, 'picks for week', week)
    return this.formatPicksData(data, season, week)
  }

  /**
   * Strategy 4: Static data to prevent total failure
   */
  private static getStaticWeeklyLeaderboard(week: number): EmergencyWeeklyLeaderboardEntry[] {
    return [
      {
        user_id: 'weekly-emergency-1',
        display_name: `Week ${week} Temporarily Unavailable`,
        weekly_rank: 1,
        total_points: 0,
        weekly_record: '0-0-0',
        lock_record: '0-0',
        week: week
      }
    ]
  }

  /**
   * Format data from TABLE/VIEW queries
   */
  private static formatTableData(data: any[], week: number): EmergencyWeeklyLeaderboardEntry[] {
    return data.map((entry, index) => ({
      user_id: entry.user_id,
      display_name: entry.display_name,
      weekly_rank: entry.weekly_rank || (index + 1),
      total_points: entry.total_points || 0,
      weekly_record: `${entry.wins || 0}-${entry.losses || 0}-${entry.pushes || 0}`,
      lock_record: `${entry.lock_wins || 0}-${entry.lock_losses || 0}`,
      week: week,
      wins: entry.wins || 0,
      losses: entry.losses || 0,
      pushes: entry.pushes || 0,
      lock_wins: entry.lock_wins || 0,
      lock_losses: entry.lock_losses || 0,
      pick_source: entry.pick_source || 'authenticated'
    }))
  }

  /**
   * Format data from picks query (compute weekly stats)
   */
  private static formatPicksData(data: any[], season: number, week: number): EmergencyWeeklyLeaderboardEntry[] {
    // Group picks by user_id
    const userPicksMap = new Map<string, any[]>()
    
    data.forEach(pick => {
      if (!userPicksMap.has(pick.user_id)) {
        userPicksMap.set(pick.user_id, [])
      }
      userPicksMap.get(pick.user_id)!.push(pick)
    })

    // Calculate stats for each user
    const userStats = Array.from(userPicksMap.entries()).map(([userId, userPicks]) => {
      const displayName = userPicks[0]?.users?.display_name || 'Unknown User'
      
      const stats = {
        user_id: userId,
        display_name: displayName,
        total_wins: userPicks.filter(p => p.result === 'win').length,
        total_losses: userPicks.filter(p => p.result === 'loss').length,
        total_pushes: userPicks.filter(p => p.result === 'push').length,
        lock_wins: userPicks.filter(p => p.result === 'win' && p.is_lock).length,
        lock_losses: userPicks.filter(p => p.result === 'loss' && p.is_lock).length,
        total_points: userPicks.reduce((sum, p) => sum + (p.points_earned || 0), 0)
      }

      return stats
    })

    // Sort by points and add rankings
    userStats.sort((a, b) => b.total_points - a.total_points)

    return userStats.map((stats, index) => ({
      user_id: stats.user_id,
      display_name: stats.display_name,
      weekly_rank: index + 1,
      total_points: stats.total_points,
      weekly_record: `${stats.total_wins}-${stats.total_losses}-${stats.total_pushes}`,
      lock_record: `${stats.lock_wins}-${stats.lock_losses}`,
      week: week,
      pick_source: 'authenticated'
    }))
  }

  /**
   * Get detailed weekly picks for a specific user
   * Implements the same prioritization logic as leaderboard:
   * 1. Try authenticated picks first
   * 2. Fall back to anonymous picks if no authenticated picks found
   */
  static async getUserWeeklyPicks(userId: string, season: number, week: number): Promise<UserWeeklyPicks | null> {
    console.log('🚨 [WEEKLY EMERGENCY] Loading picks for user', userId, 'season', season, 'week', week)

    try {
      // Fetch both authenticated and anonymous picks
      console.log('📊 [WEEKLY PICKS] Fetching both authenticated and anonymous picks...')
      const authenticatedResult = await this.getAuthenticatedUserPicks(userId, season, week)
      const anonymousResult = await this.getAnonymousUserPicks(userId, season, week)

      // If no picks found at all
      if (!authenticatedResult && !anonymousResult) {
        console.log('❌ [WEEKLY PICKS] No picks found for user')
        return null
      }

      // If only authenticated picks exist
      if (authenticatedResult && !anonymousResult) {
        console.log('✅ [WEEKLY PICKS] Found only authenticated picks:', authenticatedResult.picks.length)
        return authenticatedResult
      }

      // If only anonymous picks exist
      if (anonymousResult && !authenticatedResult) {
        console.log('✅ [WEEKLY PICKS] Found only anonymous picks:', anonymousResult.picks.length)
        return anonymousResult
      }

      // MIXED CASE: Combine both pick sets, avoiding duplicates by game_id
      // Anonymous picks are already filtered by show_on_leaderboard = TRUE
      console.log('🔀 [WEEKLY PICKS] MIXED pick set detected - combining picks')
      const authPicks = authenticatedResult!.picks
      const anonPicks = anonymousResult!.picks

      // Create a map of game_id -> pick (authenticated picks take priority)
      const picksByGameId = new Map<string, WeeklyPickDetail>()

      // Add anonymous picks first
      anonPicks.forEach(pick => {
        picksByGameId.set(pick.game_id, pick)
      })

      // Overlay authenticated picks (these override anonymous if same game)
      authPicks.forEach(pick => {
        picksByGameId.set(pick.game_id, pick)
      })

      // Convert back to array and sort by kickoff time
      const combinedPicks = Array.from(picksByGameId.values()).sort((a, b) =>
        new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
      )

      // Recalculate statistics for combined picks
      const totalPoints = combinedPicks.reduce((sum, pick) => sum + pick.points_earned, 0)
      const wins = combinedPicks.filter(p => p.result === 'win').length
      const losses = combinedPicks.filter(p => p.result === 'loss').length
      const pushes = combinedPicks.filter(p => p.result === 'push').length
      const lockWins = combinedPicks.filter(p => p.result === 'win' && p.is_lock).length
      const lockLosses = combinedPicks.filter(p => p.result === 'loss' && p.is_lock).length

      console.log('✅ [WEEKLY PICKS] Combined:', authPicks.length, 'auth +', anonPicks.length, 'anon =', combinedPicks.length, 'total')

      return {
        user_id: userId,
        display_name: authenticatedResult!.display_name,
        week: week,
        season: season,
        picks: combinedPicks,
        total_points: totalPoints,
        weekly_record: `${wins}-${losses}-${pushes}`,
        lock_record: `${lockWins}-${lockLosses}`
      }

    } catch (error) {
      console.log('❌ [WEEKLY PICKS] Error loading weekly picks:', error.message)
      return null
    }
  }

  /**
   * Get authenticated picks from the picks table
   */
  private static async getAuthenticatedUserPicks(userId: string, season: number, week: number): Promise<UserWeeklyPicks | null> {
    try {
      // Get user display name first (separate query to avoid join issues)
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', userId)
        .single()

      const displayName = userData?.display_name || 'Unknown User'

      const query = supabase
        .from('picks')
        .select(`
          game_id,
          selected_team,
          is_lock,
          result,
          points_earned,
          games!inner(
            home_team,
            away_team,
            status,
            kickoff_time
          )
        `)
        .eq('user_id', userId)
        .eq('season', season)
        .eq('week', week)
        .order('games(kickoff_time)')

      const { data: picks, error } = await Promise.race([
        query,
        this.createTimeout(this.QUERY_TIMEOUT)
      ])

      if (error || !picks || picks.length === 0) {
        return null
      }

      // Format the pick details
      const pickDetails: WeeklyPickDetail[] = picks.map(pick => ({
        game_id: pick.game_id,
        game_name: `${pick.games.away_team} @ ${pick.games.home_team}`,
        selected_team: pick.selected_team,
        is_lock: pick.is_lock,
        result: pick.result,
        points_earned: pick.points_earned || 0,
        game_status: pick.games.status,
        kickoff_time: pick.games.kickoff_time
      }))

      // Calculate summary statistics
      const totalPoints = pickDetails.reduce((sum, pick) => sum + pick.points_earned, 0)
      const wins = pickDetails.filter(p => p.result === 'win').length
      const losses = pickDetails.filter(p => p.result === 'loss').length
      const pushes = pickDetails.filter(p => p.result === 'push').length
      const lockWins = pickDetails.filter(p => p.result === 'win' && p.is_lock).length
      const lockLosses = pickDetails.filter(p => p.result === 'loss' && p.is_lock).length

      return {
        user_id: userId,
        display_name: displayName,
        week: week,
        season: season,
        picks: pickDetails,
        total_points: totalPoints,
        weekly_record: `${wins}-${losses}-${pushes}`,
        lock_record: `${lockWins}-${lockLosses}`
      }
    } catch (error) {
      console.log('❌ [AUTHENTICATED PICKS] Error:', error.message)
      return null
    }
  }

  /**
   * Get anonymous picks from the anonymous_picks table
   */
  private static async getAnonymousUserPicks(userId: string, season: number, week: number): Promise<UserWeeklyPicks | null> {
    try {
      // Get user display name first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', userId)
        .single()

      if (userError) {
        console.log('❌ [ANONYMOUS PICKS] User lookup failed:', userError.message)
        return null
      }

      const query = supabase
        .from('anonymous_picks')
        .select(`
          game_id,
          selected_team,
          is_lock,
          result,
          points_earned,
          games!inner(
            home_team,
            away_team,
            status,
            kickoff_time,
            home_score,
            away_score,
            spread
          )
        `)
        .eq('assigned_user_id', userId)
        .eq('season', season)
        .eq('week', week)
        .eq('show_on_leaderboard', true)
        .order('games(kickoff_time)')

      const { data: picks, error } = await Promise.race([
        query,
        this.createTimeout(this.QUERY_TIMEOUT)
      ])

      if (error || !picks || picks.length === 0) {
        return null
      }

      // Format the pick details - use the actual stored result and points from the table
      const pickDetails: WeeklyPickDetail[] = picks.map(pick => {
        return {
          game_id: pick.game_id,
          game_name: `${pick.games.away_team} @ ${pick.games.home_team}`,
          selected_team: pick.selected_team,
          is_lock: pick.is_lock,
          result: pick.result, // Use the actual stored result
          points_earned: pick.points_earned || 0, // Use the actual stored points
          game_status: pick.games.status,
          kickoff_time: pick.games.kickoff_time
        }
      })

      // Calculate summary statistics
      const totalPoints = pickDetails.reduce((sum, pick) => sum + pick.points_earned, 0)
      const wins = pickDetails.filter(p => p.result === 'win').length
      const losses = pickDetails.filter(p => p.result === 'loss').length
      const pushes = pickDetails.filter(p => p.result === 'push').length
      const lockWins = pickDetails.filter(p => p.result === 'win' && p.is_lock).length
      const lockLosses = pickDetails.filter(p => p.result === 'loss' && p.is_lock).length

      return {
        user_id: userId,
        display_name: userData?.display_name || 'Unknown User',
        week: week,
        season: season,
        picks: pickDetails,
        total_points: totalPoints,
        weekly_record: `${wins}-${losses}-${pushes}`,
        lock_record: `${lockWins}-${lockLosses}`
      }
    } catch (error) {
      console.log('❌ [ANONYMOUS PICKS] Error:', error.message)
      return null
    }
  }
}